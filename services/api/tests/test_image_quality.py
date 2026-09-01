from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

from app.pipeline.image_quality import assess_image_quality


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


def test_project_food_asset_is_accepted_for_ocr_intake() -> None:
    asset = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "assets" / "food" / "spinach.png"
    report = assess_image_quality(asset.read_bytes())

    assert report.status in {"pass", "review_required"}
    assert report.width is not None and report.width > 320
    assert report.height is not None and report.height > 320
