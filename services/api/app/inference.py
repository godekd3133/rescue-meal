from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


StorageCode = Literal["ambient", "refrigerated", "frozen"]


class PriorityInferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_name: str = Field(min_length=1, max_length=160)
    storage_type: StorageCode | None = None
    opened: bool = False
    reference_date: date | None = None


class PriorityWindow(BaseModel):
    start_date: date
    end_date: date
    range_days: str
    rule_id: str


class PriorityInferenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str
    provider_version: str
    canonical_name: str | None
    category: str | None
    storage_type: StorageCode | None
    storage_confidence: float = Field(ge=0, le=1)
    estimated_use_first_window: PriorityWindow | None
    reasoning: list[str]
    evidence_refs: list[str]
    requires_confirmation: bool
    abstained: bool
    abstain_reason: str | None
    safety_disclaimer: str


@dataclass(frozen=True)
class _Rule:
    rule_id: str
    category: str
    aliases: tuple[str, ...]
    days_by_storage: dict[StorageCode, tuple[int, int]]
    source_ref: str


RULES = (
    _Rule(
        "priority.leafy-greens.v1",
        "잎채소",
        ("시금치", "상추", "깻잎", "샐러드", "채소"),
        {"ambient": (1, 2), "refrigerated": (2, 4), "frozen": (7, 14)},
        "rule-snapshot:local-reference/leafy-greens/v1",
    ),
    _Rule(
        "priority.tofu.v1",
        "두부·콩",
        ("두부", "콩"),
        {"ambient": (0, 1), "refrigerated": (2, 4), "frozen": (7, 14)},
        "rule-snapshot:local-reference/tofu/v1",
    ),
    _Rule(
        "priority.raw-chicken.v1",
        "생닭·육류",
        ("닭가슴살", "생닭", "닭고기", "돼지고기", "소고기"),
        {"ambient": (0, 0), "refrigerated": (1, 2), "frozen": (14, 30)},
        "rule-snapshot:local-reference/raw-protein/v1",
    ),
    _Rule(
        "priority.mushroom.v1",
        "버섯",
        ("버섯",),
        {"ambient": (1, 2), "refrigerated": (2, 4), "frozen": (7, 14)},
        "rule-snapshot:local-reference/mushroom/v1",
    ),
    _Rule(
        "priority.dairy.v1",
        "유제품",
        ("우유", "요거트", "치즈"),
        {"ambient": (0, 0), "refrigerated": (2, 5), "frozen": (0, 0)},
        "rule-snapshot:local-reference/dairy/v1",
    ),
    _Rule(
        "priority.egg.v1",
        "달걀",
        ("달걀", "계란"),
        {"ambient": (2, 4), "refrigerated": (5, 10), "frozen": (0, 0)},
        "rule-snapshot:local-reference/egg/v1",
    ),
    _Rule(
        "priority.fresh-produce.v1",
        "신선 농산물",
        ("토마토", "파프리카", "오이", "대파", "양파", "과일"),
        {"ambient": (2, 5), "refrigerated": (3, 7), "frozen": (7, 14)},
        "rule-snapshot:local-reference/fresh-produce/v1",
    ),
)


def infer_priority(request: PriorityInferenceRequest) -> PriorityInferenceResponse:
    reference_date = request.reference_date or date.today()
    normalized = request.product_name.strip()
    rule = next((candidate for candidate in RULES if any(alias in normalized for alias in candidate.aliases)), None)
    storage = request.storage_type
    if rule is None:
        return _abstain("상품 유형에 대응하는 검토된 우선순위 규칙이 없습니다.", normalized, storage)
    if storage is None:
        return _abstain("보관 위치가 없어 우선순위 범위를 계산하지 않습니다.", normalized, storage, rule=rule)

    start_days, end_days = rule.days_by_storage[storage]
    if end_days == 0:
        return _abstain("현재 보관 조합에 대한 우선순위 규칙이 없습니다.", normalized, storage, rule=rule)
    if request.opened:
        start_days = max(0, start_days - 1)
        end_days = max(start_days, end_days - 2)
    window = PriorityWindow(
        start_date=reference_date + timedelta(days=start_days),
        end_date=reference_date + timedelta(days=end_days),
        range_days=f"{start_days}~{end_days}일",
        rule_id=rule.rule_id,
    )
    confidence = 0.62 if request.opened else 0.7
    return PriorityInferenceResponse(
        provider="rule-assisted-backend-inference",
        provider_version="priority-rules-v1",
        canonical_name=_canonical_name(normalized, rule),
        category=rule.category,
        storage_type=storage,
        storage_confidence=confidence,
        estimated_use_first_window=window,
        reasoning=[
            f"상품명에서 {rule.category} 후보를 찾았습니다.",
            f"{storage} 보관 기준의 {window.range_days} 우선순위 범위를 계산했습니다.",
            "개봉 여부를 반영했지만, 실제 라벨 날짜를 대신하지 않습니다." if request.opened else "개봉 전 상태로 계산했으며, 실제 라벨 날짜를 대신하지 않습니다.",
        ],
        evidence_refs=[rule.source_ref],
        requires_confirmation=True,
        abstained=False,
        abstain_reason=None,
        safety_disclaimer="안전 판정이나 소비기한 확정이 아닌, 먼저 확인할 순서입니다.",
    )


def _abstain(reason: str, product_name: str, storage: StorageCode | None, *, rule: _Rule | None = None) -> PriorityInferenceResponse:
    return PriorityInferenceResponse(
        provider="rule-assisted-backend-inference",
        provider_version="priority-rules-v1",
        canonical_name=_canonical_name(product_name, rule) if rule else None,
        category=rule.category if rule else None,
        storage_type=storage,
        storage_confidence=0.25 if storage else 0,
        estimated_use_first_window=None,
        reasoning=["추정값을 만들지 않고 review를 요청합니다.", reason],
        evidence_refs=[rule.source_ref] if rule else [],
        requires_confirmation=True,
        abstained=True,
        abstain_reason=reason,
        safety_disclaimer="정보가 부족해 우선순위를 계산하지 않았습니다. 실제 표시 날짜와 상태를 확인하세요.",
    )


def _canonical_name(product_name: str, rule: _Rule | None) -> str | None:
    if rule is None:
        return None
    if rule.category == "두부·콩" and "두부" in product_name:
        return "국산콩 두부"
    if rule.category == "달걀":
        return "동물복지 달걀"
    return product_name
