from concurrent.futures import ThreadPoolExecutor
import sys
from tempfile import NamedTemporaryFile
import time
import types

from fastapi.testclient import TestClient
from PIL import Image

from app import main as worker_module
from app.main import MAX_IMAGE_SIDE, PaddleWorker, _flatten, _prepare_image


def test_flatten_preserves_text_confidence_and_bbox() -> None:
    result = _flatten([
        {"res": {"rec_texts": ["소비기한 2026.09.02"], "rec_scores": [0.93], "rec_boxes": [[1, 2, 3, 4]]}},
    ], image_size=(10, 20))

    assert result[0].text == "소비기한 2026.09.02"
    assert result[0].confidence == 0.93
    assert result[0].bbox == [0.1, 0.8, 0.2, 0.1]


def test_flatten_normalises_polygon_bbox_without_numpy_truth_testing() -> None:
    result = _flatten([
        {
            "res": {
                "rec_texts": ["시금치"],
                "rec_scores": [0.91],
                "dt_polys": [[[1, 2], [3, 2], [3, 6], [1, 6]]],
            }
        },
    ], image_size=(10, 20))

    assert result[0].bbox == [0.1, 0.7, 0.2, 0.2]


def test_prepare_image_downscales_large_inputs_before_inference() -> None:
    with NamedTemporaryFile(suffix=".png") as temporary:
        Image.new("RGB", (4000, 3000), "white").save(temporary, format="PNG")
        image_size = _prepare_image(worker_module.Path(temporary.name))

    assert image_size == (MAX_IMAGE_SIDE, 1536)


def test_prepare_image_rejects_extreme_pixel_count_without_decoding(monkeypatch) -> None:
    class HeaderOnlyImage:
        size = (5000, 5001)
        mode = "RGB"

        def getexif(self):
            return {274: 1}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    monkeypatch.setattr(worker_module.Image, "open", lambda _path: HeaderOnlyImage())

    try:
        _prepare_image(worker_module.Path("unused.png"))
    except ValueError as exc:
        assert str(exc) == "OCR input exceeds worker pixel budget"
    else:
        raise AssertionError("expected pixel budget rejection")


def test_health_is_liveness_and_does_not_initialize_the_model(monkeypatch) -> None:
    candidate = PaddleWorker()
    monkeypatch.setattr(worker_module, "worker", candidate)

    response = TestClient(worker_module.app).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["worker_state"] == "not_initialized"
    assert response.json()["available"] is False


def test_readiness_returns_503_when_model_cannot_be_loaded(monkeypatch) -> None:
    class UnavailableWorker:
        state = "unavailable"

        def ensure_ready(self) -> bool:
            return False

    monkeypatch.setattr(worker_module, "worker", UnavailableWorker())

    response = TestClient(worker_module.app).get("/ready")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    assert response.json()["detail"]["code"] == "ocr_model_unavailable"
    assert response.json()["detail"]["retryable"] is True
    assert response.json()["detail"]["action"] == "retry_later"
    assert "model is not available" in response.json()["detail"]["detail"]


def test_readiness_warms_model_once_for_concurrent_callers(monkeypatch) -> None:
    calls: list[dict[str, object]] = []
    predict_calls: list[str] = []

    class FakePaddleOCR:
        def __init__(self, **kwargs) -> None:
            calls.append(kwargs)
            time.sleep(0.03)

        def predict(self, path: str):
            predict_calls.append(path)
            return []

    fake_paddleocr = types.ModuleType("paddleocr")
    fake_paddleocr.PaddleOCR = FakePaddleOCR
    monkeypatch.setitem(sys.modules, "paddleocr", fake_paddleocr)

    candidate = PaddleWorker()
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _index: candidate.ensure_ready(), range(4)))

    assert results == [True, True, True, True]
    assert len(calls) == 1
    assert calls[0]["text_detection_model_name"] == "PP-OCRv5_mobile_det"
    assert calls[0]["text_recognition_model_name"] == "korean_PP-OCRv5_mobile_rec"
    assert calls[0]["enable_mkldnn"] is False
    assert len(predict_calls) == 1
    assert candidate.state == "ready"


def test_readiness_rejects_a_model_that_fails_on_first_predict(monkeypatch) -> None:
    class BrokenPaddleOCR:
        def __init__(self, **_kwargs) -> None:
            pass

        def predict(self, _path: str):
            raise NotImplementedError

    fake_paddleocr = types.ModuleType("paddleocr")
    fake_paddleocr.PaddleOCR = BrokenPaddleOCR
    monkeypatch.setitem(sys.modules, "paddleocr", fake_paddleocr)

    candidate = PaddleWorker()

    assert candidate.ensure_ready() is False
    assert candidate.state == "unavailable"
    assert candidate.error == "PaddleOCR warm-up failed: NotImplementedError"


def test_extract_returns_busy_when_all_inference_slots_are_occupied() -> None:
    candidate = PaddleWorker()
    candidate._initialized = True
    candidate._engine = object()
    candidate._warmed_up = True
    candidate._queue_timeout_seconds = 0.01
    assert candidate._inference_slots.acquire()

    try:
        result = candidate.extract(b"ignored", "receipt.jpg")
    finally:
        candidate._inference_slots.release()

    assert result.status == "busy"
    assert result.observations == []


def test_ocr_endpoint_maps_capacity_to_retryable_503(monkeypatch) -> None:
    candidate = PaddleWorker()
    candidate._initialized = True
    candidate._engine = object()
    candidate._warmed_up = True
    candidate._queue_timeout_seconds = 0.01
    assert candidate._inference_slots.acquire()
    monkeypatch.setattr(worker_module, "worker", candidate)

    try:
        response = TestClient(worker_module.app).post(
            "/ocr",
            files={"file": ("receipt.jpg", b"not decoded because the slot is full", "image/jpeg")},
        )
    finally:
        candidate._inference_slots.release()

    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    assert response.json()["detail"]["code"] == "ocr_worker_busy"
    assert response.json()["detail"]["retryable"] is True
    assert response.json()["detail"]["action"] == "retry_later"
