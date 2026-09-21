"""Deterministic, safety-bounded in-app notification rules.

This module deliberately produces reminders and review prompts, not food-safety
decisions. It has no persistence or delivery provider dependency; the API owns
workspace read state while this module owns the notification contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import hashlib
import os
from urllib.parse import urlparse
from typing import Iterable, Literal, Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


NotificationKind = Literal["date_due", "date_check", "storage_mismatch", "grocy_sync"]
NotificationSeverity = Literal["urgent", "attention", "info"]
NotificationSource = Literal["printed_date", "user_reminder", "estimated_window", "unknown_date", "storage_condition", "grocy_outbox"]
NotificationAction = Literal["food", "grocy", "none"]
GrocyNotificationStatus = Literal[
    "blocked",
    "pending",
    "in_flight",
    "succeeded",
    "dead_letter",
    "reconciliation_required",
]
GrocyNotificationSyncState = Literal["action_required", "queued", "processing", "applied"]
DEFAULT_NOTIFICATION_TIMEZONE = "Asia/Seoul"


def _default_notification_timezone() -> str:
    configured = os.getenv("RESCUE_MEAL_TIMEZONE", DEFAULT_NOTIFICATION_TIMEZONE).strip() or DEFAULT_NOTIFICATION_TIMEZONE
    try:
        ZoneInfo(configured)
    except ZoneInfoNotFoundError:
        return DEFAULT_NOTIFICATION_TIMEZONE
    return configured


class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=240)
    kind: NotificationKind
    severity: NotificationSeverity
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=500)
    canonical_name: str = Field(min_length=1, max_length=160)
    food_id: str | None = Field(default=None, max_length=160)
    due_date: date | None = None
    source: NotificationSource
    action: NotificationAction
    read_at: datetime | None = None
    created_at: datetime
    # Only Grocy-derived notifications expose a provider lifecycle state. Date
    # and storage advisories keep this null so clients do not infer a sync
    # contract from a local safety reminder.
    sync_state: GrocyNotificationSyncState | None = None
    sync_record_id: str | None = None


class NotificationReadAllResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    marked: int = Field(ge=0)


class NotificationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    in_app_enabled: bool = True
    push_enabled: bool = False
    lead_days: int = Field(default=2, ge=0, le=14)
    timezone: str = Field(default_factory=_default_notification_timezone, min_length=1, max_length=64)
    quiet_hours_start: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quiet_hours_end: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("timezone이 비어 있습니다.")
        try:
            ZoneInfo(normalized)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("지원하지 않는 IANA timezone입니다.") from exc
        return normalized

    @model_validator(mode="after")
    def validate_quiet_hours_pair(self) -> "NotificationPreferences":
        if (self.quiet_hours_start is None) != (self.quiet_hours_end is None):
            raise ValueError("quiet_hours_start와 quiet_hours_end는 함께 설정해야 합니다.")
        return self


class PushSubscriptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=1, max_length=2048)
    p256dh: str = Field(min_length=16, max_length=512)
    auth: str = Field(min_length=8, max_length=512)

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("push endpoint는 유효한 http(s) URL이어야 합니다.")
        if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("운영 push endpoint는 HTTPS여야 합니다.")
        return value.strip()


class PushSubscriptionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str
    p256dh: str
    auth: str
    created_at: datetime
    updated_at: datetime


class PushSubscriptionSummaryResponse(BaseModel):
    endpoint_fingerprint: str
    created_at: datetime
    updated_at: datetime


class PushSubscriptionDeleteResponse(BaseModel):
    endpoint_fingerprint: str
    removed: bool


def push_endpoint_fingerprint(endpoint: str) -> str:
    """Return a non-reversible UI-safe handle; never return the endpoint itself."""

    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class FoodNotificationInput:
    id: str
    canonical_name: str
    date_kind: str
    date_value: date | None
    estimated_start_date: date | None
    estimated_end_date: date | None
    storage_type: str | None = None
    storage_location_name: str | None = None
    applicable_storage_type: str | None = None
    storage_condition_text: str | None = None


@dataclass(frozen=True)
class GrocyNotificationInput:
    id: str
    canonical_name: str
    status: GrocyNotificationStatus
    last_error: str | None
    updated_at: datetime | None = None


_TRUSTED_DATE_KINDS = {"sell_by", "use_by", "best_before", "user_reminder"}
_DATE_SOURCE: dict[str, NotificationSource] = {
    "sell_by": "printed_date",
    "use_by": "printed_date",
    "best_before": "printed_date",
    "user_reminder": "user_reminder",
}
_DATE_SOURCE_LABEL: dict[str, str] = {
    "sell_by": "포장에 표시된 판매기한",
    "use_by": "포장에 표시된 소비기한",
    "best_before": "포장에 표시된 품질유지기한",
    "user_reminder": "설정한 알림일",
}
_SEVERITY_ORDER: dict[NotificationSeverity, int] = {"urgent": 0, "attention": 1, "info": 2}


def notification_zone(timezone_name: str) -> ZoneInfo:
    """Resolve a user timezone, falling back only for legacy persisted data."""

    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_NOTIFICATION_TIMEZONE)


def build_notifications(
    *,
    foods: Iterable[FoodNotificationInput],
    grocy_items: Iterable[GrocyNotificationInput],
    read_at: Mapping[str, datetime],
    today: date | None = None,
    now: datetime | None = None,
    lead_days: int = 2,
) -> list[NotificationResponse]:
    """Build current reminders from local state without asserting safety.

    The same food and date/window produce a stable notification ID, allowing
    the API to persist read state while the actual reminder remains derived
    from current inventory. Date alerts stop being generated once they are
    outside the configured lead window, except for unknown-date review prompts.
    """

    current_date = today or date.today()
    current_time = now or datetime.now(timezone.utc)
    notifications: list[NotificationResponse] = []
    for food in foods:
        if (notification := _storage_mismatch_notification(food, current_time)) is not None:
            notifications.append(notification)
        if (notification := _food_notification(food, current_date, current_time, lead_days=lead_days)) is not None:
            notifications.append(notification)
    notifications.extend(
        _grocy_notification(item, current_time, read_at=read_at)
        for item in grocy_items
    )

    for notification in notifications:
        notification.read_at = read_at.get(notification.id)

    return sorted(
        notifications,
        key=lambda item: (
            _SEVERITY_ORDER[item.severity],
            item.due_date is None,
            item.due_date or date.max,
            item.canonical_name,
            item.id,
        ),
    )


def _storage_mismatch_notification(
    food: FoodNotificationInput,
    current_time: datetime,
) -> NotificationResponse | None:
    if not food.storage_type or not food.applicable_storage_type or food.storage_type == food.applicable_storage_type:
        return None
    storage_labels = {"ambient": "실온", "refrigerated": "냉장", "frozen": "냉동"}
    expected_label = storage_labels.get(food.applicable_storage_type, food.applicable_storage_type)
    actual_label = food.storage_location_name or storage_labels.get(food.storage_type, food.storage_type)
    condition = food.storage_condition_text or f"{expected_label} 보관"
    return NotificationResponse(
        id=f"food-storage-mismatch:{food.id}:{food.applicable_storage_type}:{food.storage_type}",
        kind="storage_mismatch",
        severity="attention",
        title="포장지 보관조건을 확인해 주세요",
        message=f"{food.canonical_name}은 {condition} 기준인데 현재 {actual_label}에 보관 중이에요. 포장지와 실제 상태를 다시 확인하세요.",
        canonical_name=food.canonical_name,
        food_id=food.id,
        source="storage_condition",
        action="food",
        created_at=current_time,
    )


def _food_notification(
    food: FoodNotificationInput,
    current_date: date,
    current_time: datetime,
    *,
    lead_days: int,
) -> NotificationResponse | None:
    if food.date_kind in _TRUSTED_DATE_KINDS and food.date_value is not None:
        days_until = (food.date_value - current_date).days
        if days_until > lead_days:
            return None
        source_label = _DATE_SOURCE_LABEL[food.date_kind]
        if days_until < 0:
            title = "확인할 날짜가 지났어요"
            message = f"{food.canonical_name}의 {source_label} {format_date(food.date_value)}이 지났어요. 포장 상태와 제조사 안내를 확인한 뒤 사용 여부를 결정하세요."
            severity: NotificationSeverity = "urgent"
        elif days_until == 0:
            title = "오늘 확인할 날짜예요"
            message = f"{food.canonical_name}의 {source_label}이 오늘({format_date(food.date_value)})이에요. 포장 상태와 보관 방법을 확인하세요."
            severity = "urgent"
        else:
            title = "곧 확인할 날짜예요"
            message = f"{food.canonical_name}의 {source_label}이 {format_date(food.date_value)}로 다가와요. 포장 상태와 보관 방법을 확인하세요."
            severity = "attention"
        return NotificationResponse(
            id=f"food-date:{food.id}:{food.date_kind}:{food.date_value.isoformat()}",
            kind="date_due",
            severity=severity,
            title=title,
            message=message,
            canonical_name=food.canonical_name,
            food_id=food.id,
            due_date=food.date_value,
            source=_DATE_SOURCE[food.date_kind],
            action="food",
            created_at=current_time,
        )

    if food.date_kind in {"production_date", "packaging_date"} and food.date_value is not None:
        date_kind_label = "제조일" if food.date_kind == "production_date" else "포장일"
        return NotificationResponse(
            id=f"food-date-check:{food.id}:{food.date_kind}:{food.date_value.isoformat()}",
            kind="date_check",
            severity="attention",
            title="소비기한을 따로 확인해 주세요",
            message=f"{food.canonical_name}에서 {date_kind_label}만 확인됐어요. 소비기한·품질유지기한 표시와 보관 방법을 포장지에서 확인하세요.",
            canonical_name=food.canonical_name,
            food_id=food.id,
            source="printed_date",
            action="food",
            created_at=current_time,
        )

    if food.estimated_end_date is not None:
        if food.estimated_end_date > current_date + timedelta(days=lead_days):
            return None
        start_date = food.estimated_start_date or food.estimated_end_date
        severity = "urgent" if food.estimated_end_date < current_date else "attention"
        title = "먼저 확인할 식품이에요"
        message = f"{food.canonical_name}의 AI 소비 우선순위 범위가 {format_date(start_date)}~{format_date(food.estimated_end_date)}예요. 실제 소비기한이 아니므로 포장지 날짜와 식품 상태를 확인하세요."
        return NotificationResponse(
            id=f"food-estimate:{food.id}:{food.estimated_end_date.isoformat()}",
            kind="date_due",
            severity=severity,
            title=title,
            message=message,
            canonical_name=food.canonical_name,
            food_id=food.id,
            due_date=food.estimated_end_date,
            source="estimated_window",
            action="food",
            created_at=current_time,
        )

    if food.date_kind == "unknown":
        return NotificationResponse(
            id=f"food-date-check:{food.id}:unknown",
            kind="date_check",
            severity="attention",
            title="표시 날짜를 확인해 주세요",
            message=f"{food.canonical_name}의 날짜를 확인하지 못했어요. 포장지 촬영 또는 직접 입력으로 실제 표시 날짜를 확인하세요.",
            canonical_name=food.canonical_name,
            food_id=food.id,
            source="unknown_date",
            action="food",
            created_at=current_time,
        )
    return None


def _grocy_notification(
    item: GrocyNotificationInput,
    current_time: datetime,
    *,
    read_at: Mapping[str, datetime],
) -> NotificationResponse:
    if item.status == "blocked":
        title = "Grocy 매핑 확인 필요"
        fallback = "상품·단위 또는 보관 위치 매핑을 확인해 주세요."
        severity: NotificationSeverity = "attention"
        sync_state: GrocyNotificationSyncState = "action_required"
    elif item.status == "pending":
        title = "외부 재고 반영을 기다리는 중이에요"
        fallback = "서버에 저장한 작업이 외부 재고 반영 대기열에 있어요."
        severity = "info"
        sync_state = "queued"
    elif item.status == "in_flight":
        title = "외부 재고에 반영 중이에요"
        fallback = "외부 재고 서비스에 반영하고 있어요. 잠시 후 결과를 확인해 주세요."
        severity = "info"
        sync_state = "processing"
    elif item.status == "succeeded":
        title = "외부 재고에 반영했어요"
        fallback = "외부 재고 반영이 완료됐어요."
        severity = "info"
        sync_state = "applied"
    elif item.status == "dead_letter":
        title = "Grocy 동기화 실패"
        fallback = "실패한 외부 재고 작업을 설정 화면에서 재시도해 주세요."
        severity = "urgent"
        sync_state = "action_required"
    else:
        title = "Grocy 반영 여부 확인 필요"
        fallback = "외부 재고 반영 여부를 확인한 뒤 완료 또는 재시도를 선택해 주세요."
        severity = "urgent"
        sync_state = "action_required"
    detail = (item.last_error or "").strip()
    message = f"{item.canonical_name}: {detail or fallback}"
    return NotificationResponse(
        id=f"grocy-outbox:{item.id}:{item.status}",
        kind="grocy_sync",
        severity=severity,
        title=title,
        message=message[:500],
        canonical_name=item.canonical_name,
        source="grocy_outbox",
        action="grocy",
        read_at=read_at.get(f"grocy-outbox:{item.id}:{item.status}"),
        created_at=item.updated_at or current_time,
        sync_state=sync_state,
        sync_record_id=item.id,
    )


def format_date(value: date) -> str:
    return f"{value.month}월 {value.day}일"
