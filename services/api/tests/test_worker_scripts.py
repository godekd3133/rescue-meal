from __future__ import annotations

import importlib
import json
from types import ModuleType

import httpx
import pytest


class FakeResponse:
    def __init__(self, payload: object, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> object:
        return self._payload


class FakeClient:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        return False

    def post(self, *args, **kwargs) -> FakeResponse:
        return self.response


class TransportErrorClient(FakeClient):
    def post(self, *args, **kwargs) -> FakeResponse:
        raise httpx.ConnectError("worker API unavailable", request=httpx.Request("POST", "http://worker.test"))


WORKER_MODULES = (
    ("scripts.run_notification_worker", "RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS"),
    ("scripts.run_grocy_worker", "RESCUE_MEAL_GROCY_WORKER_TOKEN", "RESCUE_MEAL_GROCY_WORKSPACE_IDS"),
    ("scripts.run_product_enrichment_worker", "RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN", "RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKSPACE_IDS"),
)


@pytest.mark.parametrize("module_name, token_name, workspace_name", WORKER_MODULES)
def test_worker_script_once_fails_when_api_tick_returns_a_body_error(
    monkeypatch,
    module_name: str,
    token_name: str,
    workspace_name: str,
) -> None:
    module = importlib.import_module(module_name)
    assert isinstance(module, ModuleType)
    monkeypatch.setenv(token_name, "worker-token")
    monkeypatch.setenv(workspace_name, "worker-test")
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: FakeClient(FakeResponse({"error": "RuntimeError"})))
    output: list[str] = []

    result = module.run(once=True, emit=output.append)

    assert result == 1
    assert json.loads(output[0]) == {"error": "RuntimeError"}


@pytest.mark.parametrize("module_name, token_name, workspace_name", WORKER_MODULES)
def test_worker_script_once_succeeds_for_a_clean_api_tick(
    monkeypatch,
    module_name: str,
    token_name: str,
    workspace_name: str,
) -> None:
    module = importlib.import_module(module_name)
    monkeypatch.setenv(token_name, "worker-token")
    monkeypatch.setenv(workspace_name, "worker-test")
    payload = {"workspace_id": "worker-test", "worker_id": "worker-1", "error": None}
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: FakeClient(FakeResponse(payload)))
    output: list[str] = []

    result = module.run(once=True, emit=output.append)

    assert result == 0
    assert json.loads(output[0]) == payload


@pytest.mark.parametrize("module_name, token_name, workspace_name", WORKER_MODULES)
def test_worker_script_once_fails_without_exposing_transport_details(
    monkeypatch,
    module_name: str,
    token_name: str,
    workspace_name: str,
) -> None:
    module = importlib.import_module(module_name)
    monkeypatch.setenv(token_name, "worker-token")
    monkeypatch.setenv(workspace_name, "worker-test")
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: TransportErrorClient(FakeResponse({})))
    output: list[str] = []

    result = module.run(once=True, emit=output.append)

    assert result == 1
    payload = json.loads(output[0])
    assert payload["workspace_id"] == "worker-test"
    assert isinstance(payload["worker_id"], str) and payload["worker_id"]
    assert payload["error"] == "ConnectError"
    assert "worker API unavailable" not in output[0]
