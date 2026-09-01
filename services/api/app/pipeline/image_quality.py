from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Literal

from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError


QualityStatus = Literal["pass", "review_required", "reject"]


@dataclass(frozen=True)
class ImageQualityReport:
    status: QualityStatus
    width: int | None
    height: int | None
    format: str | None
    brightness: float | None
    contrast: float | None
    edge_energy: float | None
    warnings: list[str]


def assess_image_quality(image_bytes: bytes) -> ImageQualityReport:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.load()
            width, height = image.size
            image_format = image.format
            grayscale = image.convert("L")
            brightness = float(ImageStat.Stat(grayscale).mean[0])
            contrast = float(ImageStat.Stat(grayscale).stddev[0])
            edge_energy = float(ImageStat.Stat(grayscale.filter(ImageFilter.FIND_EDGES)).mean[0])
    except (UnidentifiedImageError, OSError):
        return ImageQualityReport("reject", None, None, None, None, None, None, ["이미지 파일을 해석할 수 없습니다."])

    warnings: list[str] = []
    short_side = min(width, height)
    if short_side < 320:
        return ImageQualityReport("reject", width, height, image_format, brightness, contrast, edge_energy, ["짧은 변이 320px보다 작아 글자를 읽기 어렵습니다."])
    if brightness < 25:
        warnings.append("사진이 너무 어두워요. 밝은 곳에서 다시 촬영해 주세요.")
    elif brightness > 238:
        warnings.append("사진이 너무 밝거나 반사되어 있어요. 빛을 비껴 촬영해 주세요.")
    if contrast < 12:
        warnings.append("문자 대비가 낮아요. 종이를 평평하게 펴고 다시 촬영해 주세요.")
    if edge_energy < 7:
        warnings.append("문자 윤곽이 약해요. 초점을 맞춘 뒤 다시 촬영해 주세요.")
    if max(width / height, height / width) > 5:
        warnings.append("문서가 너무 기울거나 잘린 것처럼 보여요.")

    return ImageQualityReport(
        "review_required" if warnings else "pass",
        width,
        height,
        image_format,
        round(brightness, 2),
        round(contrast, 2),
        round(edge_energy, 2),
        warnings,
    )
