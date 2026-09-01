from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import os
from typing import Any
from urllib.parse import quote

import httpx


class GrocyError(RuntimeError):
    """A safe, API-key-free description of a Grocy request failure."""


@dataclass(frozen=True)
class GrocyConfig:
    base_url: str
    api_key: str
    timeout_seconds: float = 5.0

    @classmethod
    def from_env(cls) -> "GrocyConfig | None":
        base_url = os.getenv("GROCY_BASE_URL", "").strip().rstrip("/")
        api_key = os.getenv("GROCY_API_KEY", "").strip()
        if not base_url or not api_key:
            return None
        try:
            timeout_seconds = max(1.0, min(30.0, float(os.getenv("GROCY_TIMEOUT_SECONDS", "5"))))
        except ValueError:
            timeout_seconds = 5.0
        return cls(base_url=base_url, api_key=api_key, timeout_seconds=timeout_seconds)


class GrocyClient:
    """Thin adapter for the official Grocy REST API.

    The adapter deliberately returns raw response objects to the integration
    layer. Rescue Meal's provenance and transaction contracts remain the
    source of truth; this client never decides food safety or date semantics.
    """

    def __init__(self, config: GrocyConfig, *, client: httpx.Client | None = None) -> None:
        self.config = config
        self._client = client or httpx.Client(base_url=config.base_url, timeout=config.timeout_seconds)
        self._client.headers.update({"GROCY-API-KEY": config.api_key, "Accept": "application/json"})

    def close(self) -> None:
        self._client.close()

    def system_info(self) -> dict[str, Any]:
        return self._request("GET", "/api/system/info")

    def product_by_barcode(self, barcode: str) -> dict[str, Any]:
        return self._request("GET", f"/api/stock/products/by-barcode/{quote(str(barcode), safe='')}")

    def add_product(
        self,
        product_id: int,
        amount: float,
        *,
        best_before_date: date | None = None,
        location_id: int | None = None,
        price: float | None = None,
        note: str | None = None,
    ) -> Any:
        payload: dict[str, Any] = {"amount": amount, "transaction_type": "purchase"}
        if best_before_date is not None:
            payload["best_before_date"] = best_before_date.isoformat()
        if location_id is not None:
            payload["location_id"] = location_id
        if price is not None:
            payload["price"] = price
        if note:
            payload["note"] = note
        return self._request("POST", f"/api/stock/products/{product_id}/add", json=payload)

    def consume_product(
        self,
        product_id: int,
        amount: float,
        *,
        spoiled: bool = False,
        stock_entry_id: str | None = None,
        location_id: int | None = None,
        recipe_id: int | None = None,
        exact_amount: bool = False,
    ) -> Any:
        payload: dict[str, Any] = {
            "amount": amount,
            "transaction_type": "consume",
            "spoiled": spoiled,
            "exact_amount": exact_amount,
        }
        if stock_entry_id is not None:
            payload["stock_entry_id"] = stock_entry_id
        if location_id is not None:
            payload["location_id"] = location_id
        if recipe_id is not None:
            payload["recipe_id"] = recipe_id
        return self._request("POST", f"/api/stock/products/{product_id}/consume", json=payload)

    def open_product(self, product_id: int, amount: float, *, stock_entry_id: str | None = None) -> Any:
        payload: dict[str, Any] = {"amount": amount}
        if stock_entry_id is not None:
            payload["stock_entry_id"] = stock_entry_id
        return self._request("POST", f"/api/stock/products/{product_id}/open", json=payload)

    def transfer_product(self, product_id: int, amount: float, location_id_from: int, location_id_to: int, *, stock_entry_id: str | None = None) -> Any:
        payload: dict[str, Any] = {
            "amount": amount,
            "location_id_from": location_id_from,
            "location_id_to": location_id_to,
        }
        if stock_entry_id is not None:
            payload["stock_entry_id"] = stock_entry_id
        return self._request("POST", f"/api/stock/products/{product_id}/transfer", json=payload)

    def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None) -> Any:
        try:
            response = self._client.request(method, path, json=json)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            status_code = response.status_code if "response" in locals() else "transport"
            raise GrocyError(f"Grocy {method} {path} failed: {status_code}") from exc
        try:
            return response.json()
        except ValueError:
            return {"status_code": response.status_code, "text": response.text[:1000]}
