from datetime import date
import json

import httpx
import pytest

from app.grocy import GrocyClient, GrocyConfig, GrocyError


def test_grocy_config_is_disabled_without_both_required_values(monkeypatch) -> None:
    monkeypatch.delenv("GROCY_BASE_URL", raising=False)
    monkeypatch.delenv("GROCY_API_KEY", raising=False)
    assert GrocyConfig.from_env() is None

    monkeypatch.setenv("GROCY_BASE_URL", "http://grocy.local")
    assert GrocyConfig.from_env() is None


def test_grocy_client_maps_read_and_stock_operations_to_official_paths() -> None:
    seen: list[tuple[str, str, str | None, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        seen.append((request.method, request.url.path, request.headers.get("GROCY-API-KEY"), body))
        if request.url.path == "/api/system/info":
            return httpx.Response(200, json={"grocy_version": {"Version": "4.0.0"}})
        return httpx.Response(200, json=[{"transaction_id": "tx-1"}])

    client = httpx.Client(base_url="https://grocy.test", transport=httpx.MockTransport(handler))
    grocy = GrocyClient(GrocyConfig("https://grocy.test", "secret", 4), client=client)
    assert grocy.system_info()["grocy_version"]["Version"] == "4.0.0"
    grocy.product_by_barcode("880123")
    grocy.add_product(7, 2, best_before_date=date(2026, 9, 12), location_id=3, price=4980, note="receipt")
    grocy.consume_product(7, 1, spoiled=True, stock_entry_id="entry-1", location_id=3, exact_amount=True)
    grocy.open_product(7, 1, stock_entry_id="entry-2")
    grocy.transfer_product(7, 1, 3, 4, stock_entry_id="entry-2")

    assert all(api_key == "secret" for _, _, api_key, _ in seen)
    assert seen[1][1] == "/api/stock/products/by-barcode/880123"
    assert seen[2][1] == "/api/stock/products/7/add"
    assert seen[2][3] == {
        "amount": 2,
        "transaction_type": "purchase",
        "best_before_date": "2026-09-12",
        "location_id": 3,
        "price": 4980,
        "note": "receipt",
    }
    assert seen[3][1] == "/api/stock/products/7/consume"
    assert seen[3][3]["spoiled"] is True
    assert seen[3][3]["exact_amount"] is True
    assert seen[4][1] == "/api/stock/products/7/open"
    assert seen[5][1] == "/api/stock/products/7/transfer"

    grocy.close()


def test_grocy_client_hides_response_body_on_http_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "secret should not leak"})

    client = httpx.Client(base_url="https://grocy.test", transport=httpx.MockTransport(handler))
    grocy = GrocyClient(GrocyConfig("https://grocy.test", "do-not-log", 4), client=client)
    with pytest.raises(GrocyError, match="503") as error:
        grocy.system_info()
    assert "secret" not in str(error.value)
    grocy.close()
