from __future__ import annotations

from dataclasses import dataclass
import mimetypes
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal


OcrStatus = Literal["complete", "unavailable", "failed"]
PADDLE_MODEL_VERSION = "PP-OCRv5_server_det+korean_PP-OCRv5_mobile_rec"


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

            try:
                self._engine = PaddleOCR(
                    lang="korean",
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                )
            except TypeError:
                # Keep compatibility with older PaddleOCR releases while the
                # pinned production version is selected by the deployment.
                self._engine = PaddleOCR(lang="korean")
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
                raw_result = self._engine.predict(temporary.name)
            observations = _flatten_paddle_result(raw_result)
            if not observations:
                return OcrRun("failed", "paddleocr", [], "OCR 결과가 비어 있습니다.", PADDLE_MODEL_VERSION)
            return OcrRun("complete", "paddleocr", observations, model_version=PADDLE_MODEL_VERSION)
        except Exception as exc:
            return OcrRun("failed", "paddleocr", [], f"OCR 실행 실패: {exc.__class__.__name__}", PADDLE_MODEL_VERSION)


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
                    bbox=tuple(float(value) for value in item["bbox"]) if item.get("bbox") else None,
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


def _flatten_paddle_result(raw_result: Any) -> list[OcrObservation]:
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
                    bbox = tuple(float(value) for value in boxes[index])
                except (TypeError, ValueError):
                    bbox = None
            observations.append(OcrObservation(normalized, max(0.0, min(score, 1.0)), bbox))
    return observations
