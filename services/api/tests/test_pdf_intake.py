from __future__ import annotations

from hashlib import sha256
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import app.main as main_module
from app.main import app, auth_rate_limiter, store
from app.pipeline.ocr import OcrObservation, OcrRun


client = TestClient(app)


def setup_function() -> None:
    store.reset()
    auth_rate_limiter.reset()


def _text_pdf(lines: list[str]) -> bytes:
    content_lines = ["BT", "/F1 11 Tf", "72 720 Td"]
    for index, line in enumerate(lines):
        if index:
            content_lines.append("0 -18 Td")
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content_lines.append(f"({escaped}) Tj")
    content_lines.append("ET")
    content = "\n".join(content_lines).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(body)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)


def _image_only_pdf() -> bytes:
    image = Image.new("RGB", (600, 800), "white")
    ImageDraw.Draw(image).text((72, 120), "001 SPINACH 1 pack 2,980 1 2,980", fill="black")
    output = BytesIO()
    image.save(output, format="PDF", resolution=72)
    return output.getvalue()


def _multi_page_image_pdf(page_count: int) -> bytes:
    images = [Image.new("RGB", (600, 800), "white") for _ in range(page_count)]
    output = BytesIO()
    images[0].save(output, format="PDF", save_all=True, append_images=images[1:], resolution=72)
    return output.getvalue()


def test_text_layer_pdf_receipt_uses_pdf_parser_and_keeps_review_gate() -> None:
    pdf = _text_pdf([
        "RECEIPT",
        "001 SPINACH 1 pack 2,980 1 2,980",
    ])

    response = client.post(
        "/api/receipts/intake",
        files={"file": ("online-receipt.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "review_required"
    assert payload["engine"] == "pypdf-text"
    assert payload["model_version"].startswith("pypdf-")
    assert payload["file_sha256"] == sha256(pdf).hexdigest()
    assert payload["quality"]["format"] == "PDF"
    assert payload["quality"]["width"] is None
    assert payload["quality"]["status"] == "review_required"
    assert payload["review_observations"] == []
    assert payload["draft"] is not None
    assert payload["draft"]["lines"][0]["raw_name"].startswith("SPINACH")
    assert payload["draft"]["lines"][0]["quantity"] == 1


def test_image_only_pdf_abstains_instead_of_inventing_receipt_lines() -> None:
    pdf = _image_only_pdf()

    response = client.post(
        "/api/receipts/intake",
        files={"file": ("scanned-receipt.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "needs_ocr_engine"
    assert payload["draft"] is None
    assert payload["engine"] in {"pypdfium2+paddleocr", "paddleocr-pdf"}
    assert "스캔 PDF" in payload["message"]
    assert "스캔 PDF" in payload["quality"]["warnings"][0]


def test_image_only_pdf_renders_a_bounded_page_for_the_existing_ocr_adapter(monkeypatch) -> None:
    pdf = _image_only_pdf()
    captured: list[tuple[bytes, str]] = []

    class CapturingOcr:
        def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
            captured.append((image_bytes, filename))
            return OcrRun(
                status="complete",
                engine="test-ocr",
                observations=[OcrObservation("001 SPINACH 1 pack 2,980 1 2,980", 0.92)],
                model_version="test-v1",
            )

    monkeypatch.setattr(main_module, "ocr_engine", CapturingOcr())
    response = client.post(
        "/api/receipts/intake",
        files={"file": ("scanned-receipt.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "review_required"
    assert payload["engine"] == "paddleocr-pdf"
    assert payload["draft"] is not None
    assert payload["draft"]["lines"][0]["raw_name"].startswith("SPINACH")
    assert captured
    assert captured[0][0].startswith(b"\x89PNG\r\n\x1a\n")
    assert captured[0][1] == "scanned-pdf-page-1.png"


def test_scan_pdf_over_page_quota_abstains_without_rendering_a_prefix() -> None:
    pdf = _multi_page_image_pdf(4)

    response = client.post(
        "/api/receipts/intake",
        files={"file": ("long-scanned-receipt.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "needs_ocr_engine"
    assert payload["draft"] is None
    assert "3쪽" in payload["message"]


def test_pdf_mime_type_requires_a_real_pdf_signature() -> None:
    response = client.post(
        "/api/receipts/intake",
        files={"file": ("not-a-pdf.pdf", b"not a pdf", "application/pdf")},
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "유효한 PDF 파일을 선택해 주세요."
