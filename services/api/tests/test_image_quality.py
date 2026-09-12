from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from app.pipeline import image_quality as image_quality_module
from app.pipeline.image_quality import assess_image_quality, normalize_image_orientation, prepare_ocr_image


def test_tiny_or_undecodable_images_are_rejected() -> None:
    tiny = Image.new("RGB", (100, 100), "white")
    buffer = BytesIO()
    tiny.save(buffer, format="PNG")

    report = assess_image_quality(buffer.getvalue())
    assert report.status == "reject"
    assert report.width == 100

    invalid = assess_image_quality(b"not-an-image")
    assert invalid.status == "reject"
    assert invalid.width is None


def test_extreme_pixel_count_is_rejected_before_decode(monkeypatch) -> None:
    class HeaderOnlyImage:
        size = (5000, 5001)
        format = "PNG"

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def load(self):
            raise AssertionError("pixel-budget rejection must happen before decode")

    monkeypatch.setattr(image_quality_module.Image, "open", lambda _source: HeaderOnlyImage())

    report = assess_image_quality(b"header-only-test")

    assert report.status == "reject"
    assert report.width == 5000
    assert report.height == 5001
    assert "25MP" in report.warnings[0]


def test_readable_image_gets_a_quality_report() -> None:
    image = Image.new("RGB", (800, 600), "#f7f5ef")
    draw = ImageDraw.Draw(image)
    draw.rectangle((120, 90, 680, 510), outline="#263128", width=8)
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    report = assess_image_quality(buffer.getvalue())
    assert report.status in {"pass", "review_required"}
    assert report.width == 800
    assert report.height == 600
    assert report.brightness is not None
    assert report.contrast is not None
    assert report.edge_energy is not None
    assert report.blur_score is not None


def test_project_food_asset_is_accepted_for_ocr_intake() -> None:
    asset = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "assets" / "food" / "spinach.png"
    report = assess_image_quality(asset.read_bytes())

    assert report.status in {"pass", "review_required"}
    assert report.width is not None and report.width > 320
    assert report.height is not None and report.height > 320


def test_blurred_document_gets_a_focus_warning_without_being_rejected() -> None:
    image = Image.new("RGB", (800, 600), "#dedede")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 70, 720, 530), outline="#202820", width=12)
    draw.line((120, 180, 680, 180), fill="#202820", width=8)
    draw.line((120, 300, 680, 300), fill="#202820", width=8)
    buffer = BytesIO()
    image.filter(ImageFilter.GaussianBlur(4)).save(buffer, format="PNG")

    report = assess_image_quality(buffer.getvalue())

    assert report.status == "review_required"
    assert report.blur_score is not None and report.blur_score < 1
    assert any("흔들려" in warning for warning in report.warnings)


def test_exif_orientation_is_normalized_for_quality_and_ocr_input() -> None:
    image = Image.new("RGB", (400, 800), "white")
    buffer = BytesIO()
    exif = image.getexif()
    exif[274] = 6
    image.save(buffer, format="JPEG", exif=exif)

    report = assess_image_quality(buffer.getvalue())
    normalized = normalize_image_orientation(buffer.getvalue())

    assert report.orientation_corrected is True
    with Image.open(BytesIO(normalized)) as oriented:
        assert oriented.size == (800, 400)
        assert oriented.getexif().get(274) in {None, 1}


def test_low_contrast_image_gets_dimension_preserving_ocr_enhancement() -> None:
    image = Image.new("RGB", (800, 600), "#d8d8d8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((100, 80, 700, 520), outline="#c7c7c7", width=8)
    draw.line((140, 180, 660, 180), fill="#c7c7c7", width=6)
    draw.line((140, 320, 660, 320), fill="#c7c7c7", width=6)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=95)

    report = assess_image_quality(buffer.getvalue())
    preparation = prepare_ocr_image(buffer.getvalue(), report)

    assert report.status == "review_required"
    assert report.contrast is not None and report.contrast < 12
    assert preparation.profile == "low_contrast_enhanced"
    assert preparation.image_bytes != buffer.getvalue()
    with Image.open(BytesIO(preparation.image_bytes)) as enhanced:
        assert enhanced.format == "PNG"
        assert enhanced.size == (800, 600)


def test_blur_warning_does_not_apply_an_unverified_sharpening_pass() -> None:
    image = Image.new("RGB", (800, 600), "#dedede")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 70, 720, 530), outline="#202820", width=12)
    draw.line((120, 180, 680, 180), fill="#202820", width=8)
    draw.line((120, 300, 680, 300), fill="#202820", width=8)
    buffer = BytesIO()
    image.filter(ImageFilter.GaussianBlur(4)).save(buffer, format="PNG")

    report = assess_image_quality(buffer.getvalue())
    preparation = prepare_ocr_image(buffer.getvalue(), report)

    assert any("흔들려" in warning for warning in report.warnings)
    assert preparation.profile == "source"
    assert preparation.image_bytes == buffer.getvalue()
