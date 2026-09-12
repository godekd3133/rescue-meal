from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app, auth_rate_limiter, store


client = TestClient(app)


def setup_function() -> None:
    store.reset()
    auth_rate_limiter.reset()


def test_client_error_report_accepts_only_safe_grouping_fields(monkeypatch) -> None:
    captured: dict[str, str] = {}

    def capture(**kwargs) -> bool:
        captured.update({key: str(value) for key, value in kwargs.items()})
        return True

    monkeypatch.setattr(main_module, "log_client_error", capture)
    response = client.post(
        "/api/client-errors",
        headers={"X-Request-ID": "client-error-readback-1"},
        json={"surface": "prototype", "error_kind": "type_error", "release": "web-2026.09.03"},
    )

    assert response.status_code == 202
    assert response.json() == {"status": "accepted", "request_id": "client-error-readback-1"}
    assert captured == {
        "request_id": "client-error-readback-1",
        "surface": "prototype",
        "error_kind": "type_error",
        "release": "web-2026.09.03",
    }


def test_client_error_report_rejects_raw_exception_fields_and_unsafe_release(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "log_client_error", lambda **_kwargs: True)
    raw_fields = client.post(
        "/api/client-errors",
        json={
            "surface": "prototype",
            "error_kind": "error",
            "release": "web-unknown",
            "message": "receipt phone number must never leave the browser",
            "stack": "private stack",
        },
    )
    unsafe_release = client.post(
        "/api/client-errors",
        json={"surface": "prototype", "error_kind": "error", "release": "web/secret"},
    )

    assert raw_fields.status_code == 422
    assert unsafe_release.status_code == 422


def test_client_error_report_can_be_explicitly_disabled(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_CLIENT_ERROR_LOG", "false")

    response = client.post(
        "/api/client-errors",
        json={"surface": "prototype", "error_kind": "error", "release": "web-test"},
    )

    assert response.status_code == 202
    assert response.json()["status"] == "disabled"


def test_client_error_report_is_rate_limited_in_secure_mode(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_REQUIRED", "true")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_SECRET", "client-error-test-secret-0123456789")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RESCUE_MEAL_CLIENT_ERROR_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("RESCUE_MEAL_CLIENT_ERROR_RATE_LIMIT_WINDOW_SECONDS", "60")
    monkeypatch.setattr(main_module, "log_client_error", lambda **_kwargs: True)

    first = client.post("/api/client-errors", json={"surface": "prototype", "error_kind": "error", "release": "web-test"})
    second = client.post("/api/client-errors", json={"surface": "prototype", "error_kind": "error", "release": "web-test"})

    assert first.status_code == 202
    assert second.status_code == 429
    assert second.headers["retry-after"]
    assert second.headers["x-ratelimit-limit"] == "1"
    assert second.headers["x-ratelimit-remaining"] == "0"
