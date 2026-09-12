from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
import mimetypes
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal

from PIL import Image, ImageOps


OcrStatus = Literal["complete", "unavailable", "failed"]
PADDLE_MODEL_VERSION = "PP-OCRv5_mobile_det+korean_PP-OCRv5_mobile_rec"
PADDLE_DETECTION_MODEL = "PP-OCRv5_mobile_det"
PADDLE_RECOGNITION_MODEL = "korean_PP-OCRv5_mobile_rec"


@dataclass(frozen=True)
class OcrObservation:
    text: str
    confidence: float
    bbox: tuple[float, ...] | None = None


@dataclass(frozen=True)
class OcrRun:
    status: OcrStatus
    engine: str
    observations: list[OcrObservation]
    message: str | None = None
    model_version: str | None = None


class PaddleOcrEngine:
    """Optional PaddleOCR adapter.

    PaddleOCR is intentionally not a hard dependency of the API skeleton. A
    missing model/runtime returns an explicit `unavailable` result so the
    caller can keep the upload in a pending state instead of inventing OCR.
    """

    def __init__(self) -> None:
        self._engine: Any | None = None
        self._error: str | None = None
        self._initialized = False

    def _initialize(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        try:  # pragma: no cover - depends on optional runtime
            from paddleocr import PaddleOCR  # type: ignore[import-not-found]

            self._engine = PaddleOCR(
                text_detection_model_name=PADDLE_DETECTION_MODEL,
                text_recognition_model_name=PADDLE_RECOGNITION_MODEL,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                enable_mkldnn=False,
            )
        except Exception as exc:
            self._error = f"PaddleOCR를 사용할 수 없습니다: {exc.__class__.__name__}"

    @property
    def available(self) -> bool:
        self._initialize()
        return self._engine is not None

    def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
        self._initialize()
        if self._engine is None:
            return OcrRun(
                status="unavailable",
                engine="paddleocr",
                observations=[],
                message=self._error or "PaddleOCR 런타임이 설치되지 않았습니다.",
                model_version=PADDLE_MODEL_VERSION,
            )

        suffix = Path(filename).suffix or ".jpg"
        try:  # pragma: no cover - depends on optional runtime
            with NamedTemporaryFile(suffix=suffix) as temporary:
                temporary.write(image_bytes)
                temporary.flush()
                image_size = _prepare_ocr_image(Path(temporary.name))
                raw_result = list(self._engine.predict(temporary.name))
            observations = _flatten_paddle_result(raw_result, image_size=image_size)
            if not observations:
                return OcrRun("failed", "paddleocr", [], "OCR 결과가 비어 있습니다.", PADDLE_MODEL_VERSION)
            return OcrRun("complete", "paddleocr", observations, model_version=PADDLE_MODEL_VERSION)
        except Exception as exc:
            return OcrRun("failed", "paddleocr", [], f"OCR 실행 실패: {exc.__class__.__name__}", PADDLE_MODEL_VERSION)


def _prepare_ocr_image(path: Path) -> tuple[int, int]:
    """Keep the optional in-process adapter aligned with the worker bounds."""

    with Image.open(path) as source:
        width, height = source.size
        if width * height > 25_000_000:
            raise ValueError("OCR input exceeds worker pixel budget")
        orientation = source.getexif().get(274, 1)
        needs_write = (
            source.mode != "RGB"
            or orientation != 1
            or width > 2048
            or height > 2048
        )
        if not needs_write:
            return source.size

        oriented = ImageOps.exif_transpose(source)
        prepared = oriented.convert("RGB")
        prepared.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        prepared.save(path, format="PNG")
        image_size = prepared.size
        prepared.close()
        if oriented is not source:
            oriented.close()
        return image_size


class RemoteOcrEngine:
    """HTTP adapter for the dedicated Python 3.12 OCR worker."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
        import httpx

        try:
            with httpx.Client(timeout=45.0) as client:
                response = client.post(
                    f"{self.base_url}/ocr",
                    files={"file": (filename, image_bytes, mimetypes.guess_type(filename)[0] or "image/jpeg")},
                )
            response.raise_for_status()
            payload = response.json()
            observations = [
                OcrObservation(
                    text=str(item.get("text", "")).strip(),
                    confidence=max(0.0, min(float(item.get("confidence", 0)), 1.0)),
                    bbox=_normalise_remote_bbox(item.get("bbox")),
                )
                for item in payload.get("observations", [])
                if str(item.get("text", "")).strip()
            ]
            remote_status = payload.get("status")
            if remote_status != "complete" or not observations:
                return OcrRun(
                    status="unavailable" if remote_status == "unavailable" else "failed",
                    engine="paddleocr-remote",
                    observations=[],
                    message=payload.get("message") or "원격 OCR 결과가 비어 있습니다.",
                    model_version=payload.get("model_version"),
                )
            return OcrRun("complete", "paddleocr-remote", observations, model_version=payload.get("model_version"))
        except httpx.HTTPError as exc:
            return OcrRun("unavailable", "paddleocr-remote", [], f"OCR worker 연결 실패: {exc.__class__.__name__}")


def _flatten_paddle_result(raw_result: Any, *, image_size: tuple[int, int] | None = None) -> list[OcrObservation]:
    observations: list[OcrObservation] = []
    for result in raw_result or []:
        payload = result
        if hasattr(result, "json"):
            try:
                payload = result.json
                if callable(payload):
                    payload = payload()
            except Exception:
                payload = result
        if not isinstance(payload, dict):
            continue
        payload = payload.get("res", payload)
        texts = _first_payload_value(payload, "rec_texts", "texts")
        scores = _first_payload_value(payload, "rec_scores", "scores")
        boxes = _first_payload_value(payload, "rec_boxes", "dt_polys")
        for index, text in enumerate(texts):
            normalized = str(text).strip()
            if not normalized:
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            bbox = None
            if index < len(boxes):
                try:
                    bbox = _normalise_paddle_bbox(boxes[index], image_size=image_size)
                except (TypeError, ValueError):
                    bbox = None
            observations.append(OcrObservation(normalized, max(0.0, min(score, 1.0)), bbox))
    return observations


def _first_payload_value(payload: dict[str, Any], *keys: str) -> Any:
    """Read the first present Paddle field without truth-testing numpy arrays."""

    for key in keys:
        value = payload.get(key)
        if value is not None:
            return value
    return []


def _normalise_paddle_bbox(raw_bbox: Any, *, image_size: tuple[int, int] | None) -> tuple[float, float, float, float] | None:
    values = _numeric_values(raw_bbox)
    if len(values) < 4:
        return None
    if not image_size:
        # Without image dimensions there is no safe way to know whether a
        # four-value box is pixels or normalized coordinates.
        return None
    if len(values) >= 8 and all(0 <= value <= 1 for value in values):
        # A normalized polygon from a compatible adapter uses the same
        # bottom-left convention as the shared review contract.
        xs = values[0::2]
        ys = values[1::2]
        x, y = min(xs), min(ys)
        width, height = max(xs) - x, max(ys) - y
    elif all(0 <= value <= 1 for value in values[:4]):
        # Keep compatibility with adapters that already return normalized
        # x/y/width/height coordinates.
        x, y, width, height = values[:4]
    else:
        width_px, height_px = image_size
        if width_px <= 0 or height_px <= 0:
            return None
        if len(values) >= 8:
            xs = values[0::2]
            ys = values[1::2]
            left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
        else:
            left, top, right, bottom = values[:4]
        x = left / width_px
        y = 1 - (bottom / height_px)
        width = (right - left) / width_px
        height = (bottom - top) / height_px
    if width <= 0 or height <= 0:
        return None
    return _clip_normalized_bbox(x, y, width, height)


def _normalise_remote_bbox(raw_bbox: Any) -> tuple[float, float, float, float] | None:
    """Validate the worker's normalized x/y/width/height contract at the API edge."""

    if raw_bbox is None:
        return None
    try:
        values = _numeric_values(raw_bbox)
    except (TypeError, ValueError):
        return None
    if len(values) != 4:
        return None
    return _clip_normalized_bbox(*values)


def _clip_normalized_bbox(x: float, y: float, width: float, height: float) -> tuple[float, float, float, float] | None:
    """Clip a bottom-left normalized box without allowing negative geometry."""

    if not all(isfinite(value) for value in (x, y, width, height)) or width <= 0 or height <= 0:
        return None
    right = min(1.0, x + width)
    top = min(1.0, y + height)
    left = max(0.0, x)
    bottom = max(0.0, y)
    if right <= left or top <= bottom:
        return None
    return round(left, 6), round(bottom, 6), round(right - left, 6), round(top - bottom, 6)


def _numeric_values(value: Any) -> list[float]:
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        values: list[float] = []
        for item in value:
            values.extend(_numeric_values(item))
        return values
    return [float(value)]
