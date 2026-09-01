from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from PIL import Image
from pydantic import BaseModel


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PADDLE_MODEL_VERSION = "PP-OCRv5_server_det+korean_PP-OCRv5_mobile_rec"


class OcrObservationResponse(BaseModel):
    text: str
    confidence: float
    bbox: list[float] | None = None


class OcrResponse(BaseModel):
    status: str
    engine: str
    model_version: str | None = None
    observations: list[OcrObservationResponse]
    message: str | None = None


class PaddleWorker:
    def __init__(self) -> None:
        self._engine: Any | None = None
        self._initialized = False
        self._error: str | None = None

    def _initialize(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        try:
            from paddleocr import PaddleOCR

            try:
                self._engine = PaddleOCR(
                    lang="korean",
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                )
            except TypeError:
                self._engine = PaddleOCR(lang="korean")
        except Exception as exc:
            self._error = f"PaddleOCR initialization failed: {exc.__class__.__name__}"

    @property
    def available(self) -> bool:
        self._initialize()
        return self._engine is not None

    def extract(self, image_bytes: bytes, filename: str) -> OcrResponse:
        self._initialize()
        if self._engine is None:
            return OcrResponse(status="unavailable", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message=self._error)
        suffix = Path(filename).suffix or ".jpg"
        try:
            with NamedTemporaryFile(suffix=suffix) as temporary:
                temporary.write(image_bytes)
                temporary.flush()
                with Image.open(Path(temporary.name)) as image:
                    image_size = image.size
                raw_result = self._engine.predict(temporary.name)
            observations = _flatten(raw_result, image_size=image_size)
            if not observations:
                return OcrResponse(status="failed", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message="OCR result is empty")
            return OcrResponse(status="complete", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=observations)
        except Exception as exc:
            return OcrResponse(status="failed", engine="paddleocr", model_version=PADDLE_MODEL_VERSION, observations=[], message=f"OCR failed: {exc.__class__.__name__}")


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
        texts = payload.get("rec_texts") or payload.get("texts") or []
        scores = payload.get("rec_scores") or payload.get("scores") or []
        boxes = payload.get("rec_boxes") or payload.get("dt_polys") or []
        for index, text in enumerate(texts):
            normalized = str(text).strip()
            if not normalized:
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            bbox = None
            if index < len(boxes):
                try:
                    bbox_values = [float(value) for value in boxes[index]]
                    if image_size and len(bbox_values) >= 4:
                        width, height = image_size
                        bbox_values = [
                            bbox_values[0] / width,
                            # PaddleOCR boxes use a top-left image origin;
                            # normalize to the bottom-left convention used by
                            # the shared receipt/label parsers.
                            1 - (bbox_values[3] / height),
                            (bbox_values[2] - bbox_values[0]) / width,
                            (bbox_values[3] - bbox_values[1]) / height,
                        ]
                    bbox = bbox_values
                except (TypeError, ValueError):
                    bbox = None
            observations.append(OcrObservationResponse(text=normalized, confidence=max(0.0, min(score, 1.0)), bbox=bbox))
    return observations


worker = PaddleWorker()
app = FastAPI(title="Rescue Meal OCR Worker", version="0.1.0")


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "rescue-meal-ocr-worker", "engine": "paddleocr", "model_version": PADDLE_MODEL_VERSION, "available": worker.available}


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
    return await run_in_threadpool(worker.extract, data, filename)
