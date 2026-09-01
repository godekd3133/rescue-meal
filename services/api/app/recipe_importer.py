from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
import re
from typing import Any
from urllib.parse import quote

import httpx


COOKRCP_SERVICE_ID = "COOKRCP01"
COOKRCP_SOURCE_URL = "https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=COOKRCP01"


class CookRcpImportError(RuntimeError):
    """Safe description of a COOKRCP request or payload failure."""


@dataclass(frozen=True)
class CookRcpConfig:
    api_key: str
    base_url: str = "https://openapi.foodsafetykorea.go.kr"
    timeout_seconds: float = 8.0

    @classmethod
    def from_env(cls) -> "CookRcpConfig | None":
        api_key = os.getenv("FOODSAFETY_COOKRCP_API_KEY", "").strip()
        if not api_key:
            return None
        base_url = os.getenv("FOODSAFETY_COOKRCP_BASE_URL", cls.base_url).strip().rstrip("/") or cls.base_url
        try:
            timeout_seconds = max(1.0, min(30.0, float(os.getenv("FOODSAFETY_COOKRCP_TIMEOUT_SECONDS", "8"))))
        except ValueError:
            timeout_seconds = 8.0
        return cls(api_key=api_key, base_url=base_url, timeout_seconds=timeout_seconds)


@dataclass(frozen=True)
class CookRcpIngredientDraft:
    raw_text: str
    parsed_name: str | None
    amount: float | None
    unit: str | None
    requires_review: bool = True


@dataclass(frozen=True)
class CookRcpRecipeDraft:
    source_id: str
    title: str
    category: str | None
    cooking_method: str | None
    ingredients: tuple[CookRcpIngredientDraft, ...]
    steps: tuple[str, ...]
    image_url: str | None
    source_name: str
    source_url: str
    license: str
    source_revision: str
    retrieved_at: str
    requires_review: bool = True


@dataclass(frozen=True)
class CookRcpImportResult:
    total_count: int
    drafts: tuple[CookRcpRecipeDraft, ...]
    rejected_rows: tuple["CookRcpRejectedRow", ...]
    source_name: str
    source_url: str
    source_revision: str
    retrieved_at: str


@dataclass(frozen=True)
class CookRcpRejectedRow:
    row_index: int
    reason: str


class CookRcpClient:
    """Small, key-aware adapter for the public COOKRCP01 API.

    Imported records remain review drafts. This client never promotes raw
    ingredient text into the deterministic Rescue planner automatically.
    """

    def __init__(self, config: CookRcpConfig, *, client: httpx.Client | None = None) -> None:
        self.config = config
        self._client = client or httpx.Client(base_url=config.base_url, timeout=config.timeout_seconds)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def fetch(
        self,
        *,
        start_idx: int = 1,
        end_idx: int = 20,
        menu_name: str | None = None,
        ingredient_text: str | None = None,
        changed_after: str | None = None,
        category: str | None = None,
    ) -> CookRcpImportResult:
        if start_idx < 1 or end_idx < start_idx or end_idx - start_idx > 99:
            raise ValueError("COOKRCP 조회 범위는 1부터 최대 100건이어야 합니다.")
        path = f"/api/{quote(self.config.api_key, safe='')}/{COOKRCP_SERVICE_ID}/json/{start_idx}/{end_idx}"
        filters = {
            "RCP_NM": menu_name,
            "RCP_PARTS_DTLS": ingredient_text,
            "CHNG_DT": changed_after,
            "RCP_PAT2": category,
        }
        try:
            response = self._client.get(path, params={key: value for key, value in filters.items() if value})
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            status_code = response.status_code if "response" in locals() else "transport"
            raise CookRcpImportError(f"COOKRCP01 요청 실패: {status_code}") from exc
        return parse_cookrcp_payload(payload)


def parse_cookrcp_payload(payload: Any, *, retrieved_at: datetime | None = None) -> CookRcpImportResult:
    if not isinstance(payload, dict):
        raise CookRcpImportError("COOKRCP01 응답 형식이 객체가 아닙니다.")
    service_payload = payload.get(COOKRCP_SERVICE_ID)
    if not isinstance(service_payload, dict):
        raise CookRcpImportError("COOKRCP01 응답에 서비스 payload가 없습니다.")
    raw_rows = service_payload.get("row", [])
    rows = raw_rows if isinstance(raw_rows, list) else [raw_rows] if isinstance(raw_rows, dict) else []
    retrieved = (retrieved_at or datetime.now(timezone.utc)).isoformat()
    drafts: list[CookRcpRecipeDraft] = []
    rejected_rows: list[CookRcpRejectedRow] = []
    for row_index, row in enumerate(rows):
        if not isinstance(row, dict):
            rejected_rows.append(CookRcpRejectedRow(row_index=row_index, reason="row가 객체가 아닙니다."))
            continue
        try:
            drafts.append(_recipe_draft(row, retrieved))
        except CookRcpImportError as exc:
            rejected_rows.append(CookRcpRejectedRow(row_index=row_index, reason=str(exc)))
    try:
        total_count = int(service_payload.get("total_count", len(drafts)))
    except (TypeError, ValueError):
        total_count = len(drafts)
    return CookRcpImportResult(
        total_count=total_count,
        drafts=tuple(drafts),
        rejected_rows=tuple(rejected_rows),
        source_name="식품안전나라 조리식품 레시피 DB",
        source_url=COOKRCP_SOURCE_URL,
        source_revision=COOKRCP_SERVICE_ID,
        retrieved_at=retrieved,
    )


_AMOUNT_RE = re.compile(
    r"^(?P<name>[^0-9]+?)\s*(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>kg|g|ml|L|cc|개|마리|모|봉지|팩|컵|장|줄기|쪽|큰술|작은술)?(?:\s*\([^)]*\))?$",
    re.IGNORECASE,
)


def _recipe_draft(row: dict[str, Any], retrieved_at: str) -> CookRcpRecipeDraft:
    source_id = str(row.get("RCP_SEQ", "")).strip()
    if not source_id:
        raise CookRcpImportError("COOKRCP01 row에 RCP_SEQ가 없습니다.")
    raw_parts = str(row.get("RCP_PARTS_DTLS", "") or "")
    ingredients = tuple(_ingredient_draft(piece) for piece in _ingredient_pieces(raw_parts))
    steps = tuple(_steps(row))
    return CookRcpRecipeDraft(
        source_id=f"cookrcp-{source_id}",
        title=str(row.get("RCP_NM", "")).strip() or f"COOKRCP01 {source_id}",
        category=_optional_text(row.get("RCP_PAT2")),
        cooking_method=_optional_text(row.get("RCP_WAY2")),
        ingredients=ingredients,
        steps=steps,
        image_url=_optional_text(row.get("ATT_FILE_NO_MAIN")) or _optional_text(row.get("ATT_FILE_NO_MK")),
        source_name="식품안전나라 조리식품 레시피 DB",
        source_url=COOKRCP_SOURCE_URL,
        license="public-api-terms-review-required",
        source_revision=COOKRCP_SERVICE_ID,
        retrieved_at=retrieved_at,
    )


def _ingredient_pieces(raw_parts: str) -> list[str]:
    pieces: list[str] = []
    for line in raw_parts.replace("\r", "").splitlines():
        for piece in re.split(r"[,，]", line):
            cleaned = piece.strip(" ·•-\t")
            if not cleaned or cleaned in {"고명", "양념장", "소스", "재료"}:
                continue
            pieces.append(cleaned)
    return pieces


def _ingredient_draft(raw_text: str) -> CookRcpIngredientDraft:
    match = _AMOUNT_RE.match(raw_text)
    if not match:
        return CookRcpIngredientDraft(raw_text=raw_text, parsed_name=None, amount=None, unit=None)
    parsed_name = match.group("name").strip(" :") or None
    amount = float(match.group("amount")) if match.group("amount") else None
    unit = match.group("unit") or None
    return CookRcpIngredientDraft(raw_text=raw_text, parsed_name=parsed_name, amount=amount, unit=unit)


def _steps(row: dict[str, Any]) -> list[str]:
    steps: list[str] = []
    for index in range(1, 21):
        value = str(row.get(f"MANUAL{index:02d}", "") or "").strip()
        if not value:
            continue
        value = re.sub(r"^\s*\d+\.\s*", "", value)
        # Some source rows carry a trailing image marker after the sentence.
        value = re.sub(r"\.[a-z]$", ".", value)
        steps.append(value)
    return steps


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
