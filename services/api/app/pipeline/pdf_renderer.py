"""Bounded PDF page rendering for image-only electronic receipts."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Literal

from PIL import Image


MAX_RENDER_PAGES = 3
RENDER_SCALE = 2.0
MAX_RENDER_SIDE = 2_400


@dataclass(frozen=True)
class PdfRenderResult:
    status: Literal["ready", "too_many_pages", "unavailable"]
    pages: list[bytes]
    page_count: int


def render_pdf_pages(pdf_bytes: bytes, *, max_pages: int = MAX_RENDER_PAGES) -> PdfRenderResult:
    """Render a bounded PDF to PNG bytes for the existing OCR adapter.

    Rendering is intentionally bounded and rejects documents over the page
    quota instead of silently dropping later receipt lines. The caller must
    keep the source PDF metadata separate from the generated page images and
    must not infer a source-location bbox from these page-local OCR observations.
    """

    try:
        import pypdfium2 as pdfium
    except ImportError:
        return PdfRenderResult("unavailable", [], 0)

    document = None
    rendered: list[bytes] = []
    try:
        document = pdfium.PdfDocument(pdf_bytes)
        page_count = len(document)
        render_limit = max(1, min(max_pages, MAX_RENDER_PAGES))
        if page_count > render_limit:
            return PdfRenderResult("too_many_pages", [], page_count)
        page_count = min(page_count, render_limit)
        for page_index in range(page_count):
            page = None
            bitmap = None
            try:
                page = document[page_index]
                bitmap = page.render(scale=RENDER_SCALE)
                image = bitmap.to_pil().convert("RGB")
                if max(image.size) > MAX_RENDER_SIDE:
                    image.thumbnail((MAX_RENDER_SIDE, MAX_RENDER_SIDE), Image.Resampling.LANCZOS)
                output = BytesIO()
                image.save(output, format="PNG", optimize=True)
                rendered.append(output.getvalue())
            except Exception:
                # One broken page must not discard OCR results from earlier
                # pages. The caller will keep the review gate in place.
                continue
            finally:
                _close_if_supported(bitmap)
                _close_if_supported(page)
    except Exception:
        return PdfRenderResult("unavailable" if not rendered else "ready", rendered, 0)
    finally:
        _close_if_supported(document)
    return PdfRenderResult("ready" if rendered else "unavailable", rendered, page_count)


def _close_if_supported(value) -> None:
    close = getattr(value, "close", None)
    if callable(close):
        try:
            close()
        except Exception:
            pass
