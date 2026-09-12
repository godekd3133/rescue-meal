from __future__ import annotations

import os
from math import isfinite
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import BoundedSemaphore, Lock
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps
from pydantic import BaseModel, Field


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PADDLE_MODEL_VERSION = "PP-OCRv5_mobile_det+korean_PP-OCRv5_mobile_rec"
PADDLE_DETECTION_MODEL = "PP-OCRv5_mobile_det"
PADDLE_RECOGNITION_MODEL = "korean_PP-OCRv5_mobile_rec"
MAX_SOURCE_PIXELS = 25_000_000
MAX_IMAGE_SIDE = 2048
DEFAULT_MAX_CONCURRENCY = 1
DEFAULT_QUEUE_TIMEOUT_SECONDS = 2.0


def _positive_int_env(name: str, default: int, *, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value < 1 or value > maximum:
        raise RuntimeError(f"{name} must be between 1 and {maximum}")
    return value


def _positive_float_env(name: str, default: float, *, maximum: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number") from exc
    if not isfinite(value) or value <= 0 or value > maximum:
        raise RuntimeError(f"{name} must be greater than 0 and at most {maximum}")
    return value


MAX_CONCURRENT_INFERENCES = _positive_int_env(
    "RESCUE_MEAL_OCR_MAX_CONCURRENCY",
    DEFAULT_MAX_CONCURRENCY,
    maximum=8,
)
QUEUE_TIMEOUT_SECONDS = _positive_float_env(
    "RESCUE_MEAL_OCR_QUEUE_TIMEOUT_SECONDS",
    DEFAULT_QUEUE_TIMEOUT_SECONDS,
    maximum=30.0,
)


class OcrObservationResponse(BaseModel):
    text: str
    confidence: float
    bbox: list[float] | None = None


class OcrResponse(BaseModel):
    status: str = Field(pattern="^(complete|unavailable|failed|busy)$")
    engine: str
    model_version: str | None = None
    observations: list[OcrObservationResponse]
    message: str | None = None


class WorkerStatusResponse(BaseModel):
    status: Literal["ok", "ready"]
    service: str
    engine: str
    model_version: str
    worker_state: Literal["not_initialized", "ready", "unavailable"]
    available: bool
    max_concurrency: int
    queue_timeout_seconds: float


class PaddleWorker:
    def __init__(self) -> None:
        self._engine: Any | None = None
        self._initialized = False
        self._warmed_up = False
        self._error: str | None = None
        self._initialization_lock = Lock()
        self._inference_slots = BoundedSemaphore(MAX_CONCURRENT_INFERENCES)
        self._queue_timeout_seconds = QUEUE_TIMEOUT_SECONDS

    def _initialize(self) -> None:
        if self._initialized:
            return
        with self._initialization_lock:
            if self._initialized:
                return
            try:
                from paddleocr import PaddleOCR

                self._engine = PaddleOCR(
                    text_detection_model_name=PADDLE_DETECTION_MODEL,
                    text_recognition_model_name=PADDLE_RECOGNITION_MODEL,
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    # PaddleOCR 3.x exposes this as enable_mkldnn. The
                    # Linux CPU image is intentionally warmed up with
                    # Paddle's non-oneDNN execution path because the
                    # pinned 3.3.1 runtime can fail on the PIR/oneDNN
                    # instruction path before returning a result.
                    enable_mkldnn=False,
                )
            except Exception as exc:
                self._error = f"PaddleOCR initialization failed: {exc.__class__.__name__}"
            finally:
                # Set this only after the model attempt finishes. A concurrent
                # health/readiness request must not observe a half-built engine.
                self._initialized = True

    @property
    def state(self) -> str:
        if not self._initialized:
            return "not_initialized"
        return "ready" if self._engine is not None and self._warmed_up else "unavailable"

    @property
    def error(self) -> str | None:
        return self._error

    def ensure_ready(self) -> bool:
        self._initialize()
        if self._engine is None:
            return False
        if self._warmed_up:
            return True
        with self._initialization_lock:
            if self._warmed_up:
                return True
            try:
                # Model construction can succeed while the first actual
                # predict() still fails (for example because of a runtime
                # instruction/backend mismatch). Readiness must exercise the
                # same generator path used by extract(), not just import the
                # package or instantiate its model graph.
                with NamedTemporaryFile(suffix=".png") as temporary:
                    Image.new("RGB", (64, 64), "white").save(temporary, format="PNG")
                    temporary.flush()
                    warmup_result = self._engine.predict(temporary.name)
                    if warmup_result is not None:
                        list(warmup_result)
                self._warmed_up = True
            except Exception as exc:
                self._error = f"PaddleOCR warm-up failed: {exc.__class__.__name__}"
                self._engine = None
            return self._warmed_up

    @property
    def available(self) -> bool:
        return self.ensure_ready()

    def extract(self, image_bytes: bytes, filename: str) -> OcrResponse:
        if not self.ensure_ready():
            return OcrResponse(status="unavailable", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message=self._error)
        if not self._inference_slots.acquire(timeout=self._queue_timeout_seconds):
            return OcrResponse(
                status="busy",
                engine="paddleocr",
                model_version=PADDLE_MODEL_VERSION,
                observations=[],
                message="OCR worker is at capacity; retry shortly",
            )
        suffix = Path(filename).suffix or ".jpg"
        try:
            with NamedTemporaryFile(suffix=suffix) as temporary:
                temporary.write(image_bytes)
                temporary.flush()
                image_size = _prepare_image(Path(temporary.name))
                # PaddleOCR returns a generator in the pinned 3.x runtime.
                # Consume it while the temporary input is still alive; this
                # also makes the file-lifetime contract explicit for adapters
                # that execute lazily.
                raw_result = list(self._engine.predict(temporary.name))
            observations = _flatten(raw_result, image_size=image_size)
            if not observations:
                return OcrResponse(status="failed", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message="OCR result is empty")
            return OcrResponse(status="complete", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=observations)
        except ValueError as exc:
            if str(exc) == "OCR input exceeds worker pixel budget":
                return OcrResponse(
                    status="failed",
                    engine="paddleocr",
                    model_version=PADDLE_MODEL_VERSION,
                    observations=[],
                    message="OCR input dimensions exceed worker limit",
                )
            return OcrResponse(status="failed", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message="OCR input could not be prepared")
        except Exception as exc:
            return OcrResponse(status="failed", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message=f"OCR failed: {exc.__class__.__name__}")
        finally:
            self._inference_slots.release()


def _prepare_image(path: Path) -> tuple[int, int]:
    """Normalize an OCR input without allowing extreme pixels to reach Paddle."""

    with Image.open(path) as source:
        width, height = source.size
        if width * height > MAX_SOURCE_PIXELS:
            raise ValueError("OCR input exceeds worker pixel budget")
        orientation = source.getexif().get(274, 1)
        needs_write = (
            source.mode != "RGB"
            or orientation != 1
            or width > MAX_IMAGE_SIDE
            or height > MAX_IMAGE_SIDE
        )
        if not needs_write:
            return source.size

        oriented = ImageOps.exif_transpose(source)
        prepared = oriented.convert("RGB")
        prepared.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
        prepared.save(path, format="PNG")
        image_size = prepared.size
        prepared.close()
        if oriented is not source:
            oriented.close()
        return image_size


def _flatten(raw_result: Any, *, image_size: tuple[int, int] | None = None) -> list[OcrObservationResponse]:
    observations: list[OcrObservationResponse] = []
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
                    bbox = _normalise_bbox(boxes[index], image_size=image_size)
                except (TypeError, ValueError):
                    bbox = None
            observations.append(OcrObservationResponse(text=normalized, confidence=max(0.0, min(score, 1.0)), bbox=bbox))
    return observations


def _first_payload_value(payload: dict[str, Any], *keys: str) -> Any:
    """Read the first present Paddle field without truth-testing numpy arrays."""

    for key in keys:
        value = payload.get(key)
        if value is not None:
            return value
    return []


def _normalise_bbox(raw_bbox: Any, *, image_size: tuple[int, int] | None) -> list[float] | None:
    values = _numeric_values(raw_bbox)
    if len(values) < 4 or not image_size:
        return None
    width_px, height_px = image_size
    if width_px <= 0 or height_px <= 0:
        return None

    if len(values) >= 8 and all(0 <= value <= 1 for value in values):
        # Keep compatibility with an adapter that already returns a
        # normalized polygon in the shared bottom-left convention.
        xs = values[0::2]
        ys = values[1::2]
        x, y = min(xs), min(ys)
        width, height = max(xs) - x, max(ys) - y
    elif len(values) >= 8:
        xs = values[0::2]
        ys = values[1::2]
        left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
        x = left / width_px
        y = 1 - (bottom / height_px)
        width = (right - left) / width_px
        height = (bottom - top) / height_px
    elif all(0 <= value <= 1 for value in values[:4]):
        # Keep compatibility with an adapter that already returns normalized
        # bottom-left x/y/width/height coordinates.
        x, y, width, height = values[:4]
    else:
        left, top, right, bottom = values[:4]
        x = left / width_px
        # PaddleOCR boxes use a top-left image origin; the shared review
        # contract uses bottom-left coordinates.
        y = 1 - (bottom / height_px)
        width = (right - left) / width_px
        height = (bottom - top) / height_px

    if width <= 0 or height <= 0 or x < 0 or y < 0 or x >= 1 or y >= 1:
        return None
    right = min(1.0, x + width)
    top = min(1.0, y + height)
    if right <= x or top <= y:
        return None
    return [round(x, 6), round(y, 6), round(right - x, 6), round(top - y, 6)]


def _numeric_values(value: Any) -> list[float]:
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (list, tuple)):
        values: list[float] = []
        for item in value:
            values.extend(_numeric_values(item))
        return values
    return [float(value)]


worker = PaddleWorker()
app = FastAPI(title="Rescue Meal OCR Worker", version="0.1.0")


@app.get("/health", response_model=WorkerStatusResponse)
def health() -> WorkerStatusResponse:
    # Liveness must stay cheap and must not download or initialize a model.
    return WorkerStatusResponse(
        status="ok",
        service="rescue-meal-ocr-worker",
        engine="paddleocr",
        model_version=PADDLE_MODEL_VERSION,
        worker_state=worker.state,
        available=worker.state == "ready",
        max_concurrency=MAX_CONCURRENT_INFERENCES,
        queue_timeout_seconds=QUEUE_TIMEOUT_SECONDS,
    )


@app.get("/ready", response_model=WorkerStatusResponse)
def readiness() -> WorkerStatusResponse:
    if not worker.ensure_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            headers={"Retry-After": "1"},
            detail={
                "code": "ocr_model_unavailable",
                "detail": "OCR model is not available; retry after the worker is ready.",
                "retryable": True,
                "action": "retry_later",
            },
    )
    return WorkerStatusResponse(
        status="ready",
        service="rescue-meal-ocr-worker",
        engine="paddleocr",
        model_version=PADDLE_MODEL_VERSION,
        worker_state=worker.state,
        available=True,
        max_concurrency=MAX_CONCURRENT_INFERENCES,
        queue_timeout_seconds=QUEUE_TIMEOUT_SECONDS,
    )


@app.post("/ocr", response_model=OcrResponse)
async def ocr(file: UploadFile = File(...)) -> OcrResponse:
    filename = file.filename or "upload.jpg"
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="image upload required")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="empty upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file must be 10MB or smaller")
    result = await run_in_threadpool(worker.extract, data, filename)
    if result.status == "busy":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            headers={"Retry-After": "1"},
            detail={
                "code": "ocr_worker_busy",
                "detail": result.message or "OCR worker is at capacity; retry shortly",
                "retryable": True,
                "action": "retry_later",
            },
        )
    return result
