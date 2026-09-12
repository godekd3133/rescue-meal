from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Literal

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError


QualityStatus = Literal["pass", "review_required", "reject"]
OcrInputProfile = Literal["source", "low_contrast_enhanced"]


@dataclass(frozen=True)
class ImageQualityReport:
    status: QualityStatus
    width: int | None
    height: int | None
    format: str | None
    brightness: float | None
    contrast: float | None
    edge_energy: float | None
    blur_score: float | None
    warnings: list[str]
    orientation_corrected: bool = False


@dataclass(frozen=True)
class OcrImagePreparation:
    """The bounded, reversible preparation applied only to OCR input bytes."""

    image_bytes: bytes
    profile: OcrInputProfile


_EXIF_ORIENTATION_TAG = 274
_ROTATED_ORIENTATIONS = frozenset({2, 3, 4, 5, 6, 7, 8})
MAX_SOURCE_PIXELS = 25_000_000


def _has_exif_orientation(image: Image.Image) -> bool:
    try:
        return image.getexif().get(_EXIF_ORIENTATION_TAG) in _ROTATED_ORIENTATIONS
    except (AttributeError, ValueError):
        return False


def normalize_image_orientation(image_bytes: bytes) -> bytes:
    """Return an EXIF-normalized image for OCR without changing the source hash."""

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            if not _has_exif_orientation(image):
                return image_bytes
            oriented = ImageOps.exif_transpose(image)
            image_format = (image.format or "PNG").upper()
            if image_format == "JPG":
                image_format = "JPEG"
            output = BytesIO()
            if image_format == "JPEG":
                oriented.convert("RGB").save(output, format=image_format, quality=95, optimize=True)
            else:
                oriented.save(output, format=image_format)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError):
        return image_bytes


def prepare_ocr_image(image_bytes: bytes, report: ImageQualityReport) -> OcrImagePreparation:
    """Apply a conservative low-contrast enhancement before OCR.

    The source upload is never replaced: callers calculate its hash before
    this function and keep the original browser preview. We only enhance
    images whose quality report identifies low contrast or severe darkness.
    Blur, glare, extreme aspect ratio, and perspective are not recoverable by
    this operation and therefore stay on the source path with a recapture
    warning. Keeping the dimensions unchanged also preserves the OCR bbox
    coordinate contract.
    """

    if report.status == "reject" or not _needs_low_contrast_enhancement(report):
        return OcrImagePreparation(image_bytes=image_bytes, profile="source")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            enhanced = image.convert("RGB")
            enhanced = ImageOps.autocontrast(enhanced, cutoff=1)
            enhanced = ImageEnhance.Contrast(enhanced).enhance(1.35)

            output = BytesIO()
            # A PNG output avoids another lossy JPEG round trip while keeping
            # the original filename and source hash independent from OCR data.
            enhanced.save(output, format="PNG", optimize=True)
            return OcrImagePreparation(output.getvalue(), "low_contrast_enhanced")
    except (UnidentifiedImageError, OSError, ValueError):
        # Enhancement is an optimization, never a reason to turn a valid
        # intake into a hard failure.
        return OcrImagePreparation(image_bytes=image_bytes, profile="source")


def _needs_low_contrast_enhancement(report: ImageQualityReport) -> bool:
    if report.status != "review_required":
        return False
    return (
        report.contrast is not None
        and report.contrast < 12
    ) or (
        report.brightness is not None
        and report.brightness < 25
    )


def assess_image_quality(image_bytes: bytes) -> ImageQualityReport:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            width, height = image.size
            if width * height > MAX_SOURCE_PIXELS:
                return ImageQualityReport(
                    "reject",
                    width,
                    height,
                    image.format,
                    None,
                    None,
                    None,
                    None,
                    ["이미지 해상도가 너무 커서 처리할 수 없습니다. 25MP 이하 사진으로 다시 선택해 주세요."],
                )
            image.load()
            orientation_corrected = _has_exif_orientation(image)
            oriented = ImageOps.exif_transpose(image)
            width, height = oriented.size
            image_format = image.format
            grayscale = oriented.convert("L")
            brightness = float(ImageStat.Stat(grayscale).mean[0])
            contrast = float(ImageStat.Stat(grayscale).stddev[0])
            edge_energy = float(ImageStat.Stat(grayscale.filter(ImageFilter.FIND_EDGES)).mean[0])
            blur_score = float(ImageStat.Stat(ImageChops.difference(grayscale, grayscale.filter(ImageFilter.GaussianBlur(1)))).rms[0])
    except (UnidentifiedImageError, OSError, ValueError):
        return ImageQualityReport("reject", None, None, None, None, None, None, None, ["이미지 파일을 해석할 수 없습니다."])

    warnings: list[str] = []
    short_side = min(width, height)
    if short_side < 320:
        return ImageQualityReport("reject", width, height, image_format, brightness, contrast, edge_energy, blur_score, ["짧은 변이 320px보다 작아 글자를 읽기 어렵습니다."], orientation_corrected)
    if brightness < 25:
        warnings.append("사진이 너무 어두워요. 밝은 곳에서 다시 촬영해 주세요.")
    elif brightness > 238:
        warnings.append("사진이 너무 밝거나 반사되어 있어요. 빛을 비껴 촬영해 주세요.")
    if contrast < 12:
        warnings.append("문자 대비가 낮아요. 종이를 평평하게 펴고 다시 촬영해 주세요.")
    if edge_energy < 7:
        warnings.append("문자 윤곽이 약해요. 초점을 맞춘 뒤 다시 촬영해 주세요.")
    if blur_score < 1:
        warnings.append("사진이 흔들려 문자 윤곽이 흐려요. 휴대폰을 고정하고 다시 촬영해 주세요.")
    if max(width / height, height / width) > 5:
        warnings.append("문서 전체가 화면에 들어왔는지 확인해 주세요.")

    return ImageQualityReport(
        "review_required" if warnings else "pass",
        width,
        height,
        image_format,
        round(brightness, 2),
        round(contrast, 2),
        round(edge_energy, 2),
        round(blur_score, 2),
        warnings,
        orientation_corrected,
    )
