from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any, Literal

import httpx


LookupStatus = Literal["matched", "partial", "not_found", "provider_unavailable"]


@dataclass(frozen=True)
class ProductCandidate:
    source: Literal["local_fixture", "open_food_facts", "mfds_i1250"]
    source_url: str | None
    canonical_name: str
    brand: str | None
    category: str | None
    quantity_text: str | None
    confidence: float
    provenance_note: str


@dataclass(frozen=True)
class ProductLookupResult:
    barcode: str
    status: LookupStatus
    candidates: list[ProductCandidate]
    warnings: list[str]
    requires_review: bool


LOCAL_PRODUCTS: dict[str, ProductCandidate] = {
    "8801114167523": ProductCandidate(
        source="local_fixture",
        source_url=None,
        canonical_name="국산콩 두부",
        brand="풀무원",
        category="두부·콩",
        quantity_text="1모",
        confidence=0.99,
        provenance_note="프로젝트 local fixture",
    ),
}


def resolve_product(barcode: str, *, enable_external: bool | None = None) -> ProductLookupResult:
    normalized = barcode.strip().replace(" ", "").replace("-", "")
    local = LOCAL_PRODUCTS.get(normalized) or LOCAL_PRODUCTS.get(normalized.lstrip("0"))
    if local:
        return ProductLookupResult(normalized, "matched", [local], [], True)

    external_enabled = _external_enabled() if enable_external is None else enable_external
    if not external_enabled:
        return ProductLookupResult(
            normalized,
            "provider_unavailable",
            [],
            ["외부 상품 DB 조회가 비활성화되어 있어 local 후보만 확인했습니다."],
            True,
        )

    candidates: list[ProductCandidate] = []
    warnings: list[str] = []
    off_result = OpenFoodFactsResolver().lookup(normalized)
    if off_result is not None:
        candidates.append(off_result)
    else:
        warnings.append("Open Food Facts에서 상품을 찾지 못했거나 조회할 수 없습니다.")

    mfds_result = MfdsI1250Resolver().lookup(normalized)
    if mfds_result is not None:
        candidates.append(mfds_result)
    else:
        warnings.append("식품안전나라 I1250 후보가 없거나 API key가 설정되지 않았습니다.")

    if not candidates:
        return ProductLookupResult(normalized, "not_found", [], warnings, True)
    return ProductLookupResult(normalized, "matched" if len(candidates) == 1 else "partial", candidates, warnings, True)


class OpenFoodFactsResolver:
    def __init__(self, *, base_url: str = "https://world.openfoodfacts.org", timeout: float = 4.0, client: httpx.Client | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.client = client

    def lookup(self, barcode: str) -> ProductCandidate | None:
        fields = "code,product_name,product_name_ko,brands,categories,quantity,status,status_verbose"
        try:
            if self.client is not None:
                response = self.client.get(f"{self.base_url}/api/v2/product/{barcode}", params={"product_type": "all", "lc": "ko", "cc": "kr", "fields": fields})
            else:
                with httpx.Client(timeout=self.timeout, headers={"User-Agent": "rescue-meal/0.1 (open-source course project)"}) as client:
                    response = client.get(f"{self.base_url}/api/v2/product/{barcode}", params={"product_type": "all", "lc": "ko", "cc": "kr", "fields": fields})
            if response.status_code == 404:
                return None
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        if payload.get("status") != 1 or not isinstance(payload.get("product"), dict):
            return None
        product = payload["product"]
        name = str(product.get("product_name_ko") or product.get("product_name") or "").strip()
        if not name:
            return None
        return ProductCandidate(
            source="open_food_facts",
            source_url=f"{self.base_url}/product/{barcode}",
            canonical_name=name,
            brand=_first_text(product.get("brands")),
            category=_first_category(product.get("categories")),
            quantity_text=str(product.get("quantity") or "").strip() or None,
            confidence=0.62,
            provenance_note="Open Food Facts 사용자 기여 데이터 후보; 실제 라벨 확인 필요",
        )


class MfdsI1250Resolver:
    """Minimal boundary for the Korean product-report API.

    The endpoint requires a user-issued key and product-level records do not
    identify the date printed on an individual lot. Keep it opt-in until the
    key, request parameters, and license/retention policy are configured.
    """

    def __init__(self, *, base_url: str = "https://openapi.foodsafetykorea.go.kr", timeout: float = 4.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def lookup(self, barcode: str) -> ProductCandidate | None:
        del barcode
        if not os.getenv("MFDS_API_KEY", "").strip():
            return None
        # I1250 query mapping is intentionally not guessed. The official key
        # and field/filter contract must be configured and read back first.
        return None


def _external_enabled() -> bool:
    return os.getenv("RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS", "").strip().lower() in {"1", "true", "yes"}


def _first_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value.split(",", 1)[0].strip() or None
    return None


def _first_category(value: Any) -> str | None:
    if isinstance(value, str):
        return value.split(",", 1)[0].strip() or None
    return None
