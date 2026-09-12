"""Safe text-layer extraction for electronic receipt PDFs.

This adapter deliberately handles only text already embedded in a PDF. A
scanned/image-only PDF is not silently passed to the image OCR path because
the image quality contract and source-location coordinates are different.
"""

from __future__ import annotations

from io import BytesIO

from .ocr import OcrObservation, OcrRun


MAX_PDF_PAGES = 20
MAX_EXTRACTED_CHARS = 100_000
PDF_PARSER_ENGINE = "pypdf-text"


def looks_like_pdf(data: bytes) -> bool:
    """Check the PDF signature without trusting a filename or MIME type."""

    return data[:1024].find(b"%PDF-") >= 0


def extract_pdf_text(pdf_bytes: bytes) -> OcrRun:
    """Convert text-layer lines into OCR-compatible observations.

    Observations intentionally have no bbox: pypdf text extraction is useful
    for line parsing, but it is not a safe source-location contract for the
    review overlay. The caller therefore keeps the review overlay empty.
    """

    try:
        import pypdf
    except ImportError:
        return OcrRun(
            status="unavailable",
            engine=PDF_PARSER_ENGINE,
            observations=[],
            message="전자 영수증 PDF를 읽을 모듈이 설치되지 않았습니다.",
            model_version=None,
        )

    parser_version = getattr(pypdf, "__version__", "unknown")
    model_version = f"pypdf-{parser_version}"
    try:
        reader = pypdf.PdfReader(BytesIO(pdf_bytes), strict=False)
        if reader.is_encrypted:
            return OcrRun(
                status="unavailable",
                engine=PDF_PARSER_ENGINE,
                observations=[],
                message="암호화된 PDF는 읽을 수 없습니다. 잠금이 해제된 PDF를 선택해 주세요.",
                model_version=model_version,
            )
        page_count = len(reader.pages)
    except Exception as exc:
        return OcrRun(
            status="failed",
            engine=PDF_PARSER_ENGINE,
            observations=[],
            message=f"PDF를 해석하지 못했습니다: {exc.__class__.__name__}",
            model_version=model_version,
        )

    if page_count == 0:
        return OcrRun(
            status="failed",
            engine=PDF_PARSER_ENGINE,
            observations=[],
            message="PDF 페이지를 찾지 못했습니다.",
            model_version=model_version,
        )

    observations: list[OcrObservation] = []
    warnings: list[str] = []
    extracted_chars = 0
    for page_index, page in enumerate(reader.pages[:MAX_PDF_PAGES]):
        try:
            try:
                text = page.extract_text(extraction_mode="layout") or ""
            except TypeError:
                # Compatibility with older pypdf versions in a restored lock.
                text = page.extract_text() or ""
        except Exception as exc:
            warnings.append(f"{page_index + 1}쪽 텍스트를 읽지 못했습니다: {exc.__class__.__name__}")
            continue

        for line in text.splitlines():
            normalized = line.strip()
            if not normalized:
                continue
            remaining = MAX_EXTRACTED_CHARS - extracted_chars
            if remaining <= 0:
                warnings.append("PDF 텍스트가 너무 길어 앞부분만 읽었습니다.")
                break
            clipped = normalized[:remaining]
            observations.append(OcrObservation(text=clipped, confidence=1.0, bbox=None))
            extracted_chars += len(clipped)
        if extracted_chars >= MAX_EXTRACTED_CHARS:
            break

    if page_count > MAX_PDF_PAGES:
        warnings.append(f"PDF가 {MAX_PDF_PAGES}쪽을 넘어 앞부분만 읽었습니다.")

    if not observations:
        return OcrRun(
            status="unavailable",
            engine=PDF_PARSER_ENGINE,
            observations=[],
            message="텍스트 레이어가 없는 스캔 PDF입니다. PDF를 이미지로 저장하거나 사진으로 다시 올려 주세요.",
            model_version=model_version,
        )

    message = " ".join(warnings) if warnings else None
    return OcrRun(
        status="complete",
        engine=PDF_PARSER_ENGINE,
        observations=observations,
        message=message,
        model_version=model_version,
    )
