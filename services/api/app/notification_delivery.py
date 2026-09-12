"""Web Push delivery contracts and a bounded workspace worker.

The API owns notification derivation and workspace persistence. This module
owns delivery state, quiet-hour decisions, retry policy, and the pywebpush
adapter. A delivery worker must still be explicitly configured with VAPID
credentials and a workspace allowlist.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import re
import secrets
from threading import RLock
from typing import Any, Callable, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field

from .auth import current_workspace_id, reset_workspace, set_workspace_id
from .notifications import NotificationResponse, PushSubscriptionRecord, push_endpoint_fingerprint


NOTIFICATION_DELIVERY_LEASE_KEY = "notification-delivery"
NotificationDeliveryStatus = Literal["pending", "in_flight", "succeeded", "dead_letter", "cancelled"]


class NotificationDeliveryRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    notification_id: str = Field(min_length=1, max_length=240)
    endpoint_fingerprint: str = Field(min_length=16, max_length=64)
    payload: dict[str, str]
    status: NotificationDeliveryStatus = "pending"
    attempts: int = Field(default=0, ge=0, le=10)
    last_error: str | None = Field(default=None, max_length=300)
    next_attempt_at: datetime
    in_flight_started_at: datetime | None = None
    last_attempt_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class NotificationWorkerLeaseRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lease_key: str = Field(min_length=1, max_length=96)
    worker_id: str = Field(min_length=1, max_length=160)
    acquired_at: datetime
    expires_at: datetime


class NotificationWorkerHeartbeatRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=96)
    worker_id: str = Field(min_length=1, max_length=160)
    last_tick_at: datetime
    last_success_at: datetime | None = None
    lease_acquired: bool
    push_configured: bool
    queued: int = Field(default=0, ge=0)
    processed: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    retried: int = Field(default=0, ge=0)
    dead_lettered: int = Field(default=0, ge=0)
    cancelled: int = Field(default=0, ge=0)
    removed_subscriptions: int = Field(default=0, ge=0)
    recovered_in_flight: int = Field(default=0, ge=0)
    last_error: str | None = Field(default=None, max_length=160)


class NotificationWorkerTickRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(min_length=1, max_length=160)
    lease_seconds: int = Field(default=120, ge=30, le=3600)
    stale_after_seconds: int = Field(default=900, ge=60, le=86_400)
    process_limit: int = Field(default=20, ge=1, le=100)


class NotificationWorkerTickResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str
    worker_id: str
    lease_acquired: bool
    push_configured: bool
    queued: int = Field(default=0, ge=0)
    processed: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    retried: int = Field(default=0, ge=0)
    dead_lettered: int = Field(default=0, ge=0)
    cancelled: int = Field(default=0, ge=0)
    removed_subscriptions: int = Field(default=0, ge=0)
    recovered_in_flight: int = Field(default=0, ge=0)
    error: str | None = None


def _bounded_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _bounded_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    if not math.isfinite(value):
        value = default
    return max(minimum, min(maximum, value))


def notification_workspace_ids_from_env() -> tuple[str, ...]:
    configured = os.getenv("RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS", "").strip()
    if not configured:
        configured = "demo"
    workspace_ids = tuple(dict.fromkeys(item.strip() for item in configured.split(",") if item.strip()))
    if not workspace_ids:
        raise ValueError("RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS가 비어 있습니다.")
    invalid = [item for item in workspace_ids if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", item)]
    if invalid:
        raise ValueError("notification worker workspace ID 형식이 잘못되었습니다.")
    return workspace_ids


@dataclass(frozen=True)
class NotificationWorkerSettings:
    workspace_ids: tuple[str, ...]
    worker_id: str
    interval_seconds: float = 30.0
    lease_seconds: int = 120
    stale_after_seconds: int = 900
    process_limit: int = 20

    @classmethod
    def from_env(cls) -> "NotificationWorkerSettings":
        return cls(
            workspace_ids=notification_workspace_ids_from_env(),
            worker_id=os.getenv("RESCUE_MEAL_NOTIFICATION_WORKER_ID", "").strip() or f"notification-worker-{secrets.token_urlsafe(8)}",
            interval_seconds=_bounded_float("RESCUE_MEAL_NOTIFICATION_WORKER_INTERVAL_SECONDS", 30.0, minimum=5.0, maximum=3600.0),
            lease_seconds=_bounded_int("RESCUE_MEAL_NOTIFICATION_WORKER_LEASE_SECONDS", 120, minimum=30, maximum=3600),
            stale_after_seconds=_bounded_int("RESCUE_MEAL_NOTIFICATION_STALE_AFTER_SECONDS", 900, minimum=60, maximum=86_400),
            process_limit=_bounded_int("RESCUE_MEAL_NOTIFICATION_PROCESS_LIMIT", 20, minimum=1, maximum=100),
        )


@dataclass(frozen=True)
class NotificationWorkerTickResult:
    workspace_id: str
    worker_id: str
    lease_acquired: bool
    push_configured: bool
    queued: int = 0
    processed: int = 0
    succeeded: int = 0
    retried: int = 0
    dead_lettered: int = 0
    cancelled: int = 0
    removed_subscriptions: int = 0
    recovered_in_flight: int = 0
    error: str | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "workspace_id": self.workspace_id,
            "worker_id": self.worker_id,
            "lease_acquired": self.lease_acquired,
            "push_configured": self.push_configured,
            "queued": self.queued,
            "processed": self.processed,
            "succeeded": self.succeeded,
            "retried": self.retried,
            "dead_lettered": self.dead_lettered,
            "cancelled": self.cancelled,
            "removed_subscriptions": self.removed_subscriptions,
            "recovered_in_flight": self.recovered_in_flight,
            "error": self.error,
        }


class NotificationDeliveryRuntimeMetrics:
    """Privacy-safe, process-local counters for notification worker ticks.

    The counters deliberately omit workspace IDs, notification IDs, endpoint
    fingerprints, payloads, and provider errors. A multi-worker deployment
    should aggregate this scrape through its normal metrics pipeline; this
    object only provides a bounded local readback and Prometheus adapter.
    """

    _COUNTER_FIELDS = (
        "ticks_total",
        "lease_acquired_total",
        "lease_busy_total",
        "unconfigured_total",
        "queued_total",
        "processed_total",
        "succeeded_total",
        "retried_total",
        "dead_lettered_total",
        "cancelled_total",
        "removed_subscriptions_total",
        "recovered_in_flight_total",
        "errors_total",
    )
    _CANCELLATION_REASONS = ("notification_inactive", "subscription_inactive")

    def __init__(self) -> None:
        self._lock = RLock()
        self._counters = {field: 0 for field in self._COUNTER_FIELDS}
        self._cancellation_reasons = {reason: 0 for reason in self._CANCELLATION_REASONS}

    def record_cancellation(self, reason: Literal["notification_inactive", "subscription_inactive"]) -> None:
        if reason not in self._cancellation_reasons:
            return
        with self._lock:
            self._cancellation_reasons[reason] += 1

    def record_tick(self, result: NotificationWorkerTickResult) -> None:
        with self._lock:
            self._counters["ticks_total"] += 1
            self._counters["lease_acquired_total"] += int(result.lease_acquired)
            self._counters["lease_busy_total"] += int(not result.lease_acquired)
            self._counters["unconfigured_total"] += int(result.lease_acquired and not result.push_configured)
            self._counters["queued_total"] += result.queued
            self._counters["processed_total"] += result.processed
            self._counters["succeeded_total"] += result.succeeded
            self._counters["retried_total"] += result.retried
            self._counters["dead_lettered_total"] += result.dead_lettered
            self._counters["cancelled_total"] += result.cancelled
            self._counters["removed_subscriptions_total"] += result.removed_subscriptions
            self._counters["recovered_in_flight_total"] += result.recovered_in_flight
            self._counters["errors_total"] += int(result.error is not None)

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {
                "counters": dict(self._counters),
                "cancellation_reasons": dict(self._cancellation_reasons),
            }

    def prometheus_text(self) -> str:
        """Render bounded worker-local counters for a Prometheus scrape."""

        snapshot = self.snapshot()
        counters = snapshot["counters"]
        reasons = snapshot["cancellation_reasons"]
        assert isinstance(counters, dict)
        assert isinstance(reasons, dict)
        help_text = {
            "ticks_total": "Notification worker ticks.",
            "lease_acquired_total": "Notification worker ticks that acquired the workspace lease.",
            "lease_busy_total": "Notification worker ticks skipped because the workspace lease was busy.",
            "unconfigured_total": "Notification worker ticks skipped because push configuration was incomplete.",
            "queued_total": "Notification deliveries queued.",
            "processed_total": "Notification deliveries sent to the provider.",
            "succeeded_total": "Notification deliveries accepted by the provider.",
            "retried_total": "Notification deliveries scheduled for retry.",
            "dead_lettered_total": "Notification deliveries moved to dead letter.",
            "cancelled_total": "Notification deliveries cancelled before provider send.",
            "removed_subscriptions_total": "Push subscriptions removed after provider invalidation.",
            "recovered_in_flight_total": "Notification deliveries recovered from stale in-flight state.",
            "errors_total": "Notification worker ticks that ended with an error.",
        }
        lines: list[str] = []
        for field in self._COUNTER_FIELDS:
            metric_name = f"rescue_meal_notification_worker_{field}"
            lines.append(f"# HELP {metric_name} {help_text[field]}")
            lines.append(f"# TYPE {metric_name} counter")
            lines.append(f"{metric_name} {counters[field]}")
        reason_metric = "rescue_meal_notification_worker_cancellations_total"
        lines.append(f"# HELP {reason_metric} Notification deliveries cancelled by safe reason.")
        lines.append(f"# TYPE {reason_metric} counter")
        for reason in self._CANCELLATION_REASONS:
            lines.append(f'{reason_metric}{{reason="{reason}"}} {reasons[reason]}')
        return "\n".join(lines) + "\n"


def vapid_settings() -> tuple[str, str] | None:
    private_key = os.getenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "").strip()
    subject = os.getenv("RESCUE_MEAL_VAPID_SUBJECT", "").strip()
    if not private_key or not subject:
        return None
    if not (subject.startswith("mailto:") or subject.startswith("https://")):
        return None
    return private_key, subject


def delivery_id(notification_id: str, endpoint_fingerprint: str) -> str:
    digest = hashlib.sha256(f"{notification_id}:{endpoint_fingerprint}".encode("utf-8")).hexdigest()[:32]
    return f"push-delivery-{digest}"


def build_push_payload(notification: NotificationResponse) -> dict[str, str]:
    tag = hashlib.sha256(notification.id.encode("utf-8")).hexdigest()[:24]
    return {
        "title": notification.title,
        "body": notification.message,
        "tag": f"rescue-meal:{tag}",
        "url": "/",
    }


def quiet_hours_active(
    now: datetime,
    start: str | None,
    end: str | None,
    *,
    timezone_name: str = "UTC",
) -> bool:
    if start is None or end is None:
        return False
    start_minutes = int(start[:2]) * 60 + int(start[3:])
    end_minutes = int(end[:2]) * 60 + int(end[3:])
    try:
        current = now.astimezone(ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError:
        current = now.astimezone(timezone.utc)
    current_minutes = current.hour * 60 + current.minute
    if start_minutes == end_minutes:
        return True
    if start_minutes < end_minutes:
        return start_minutes <= current_minutes < end_minutes
    return current_minutes >= start_minutes or current_minutes < end_minutes


def retry_at(now: datetime, attempts: int) -> datetime:
    delay_seconds = min(3600, 60 * (2 ** max(0, attempts - 1)))
    return now + timedelta(seconds=delay_seconds)


def send_web_push(subscription: PushSubscriptionRecord, payload: dict[str, str], settings: tuple[str, str]) -> int:
    from pywebpush import webpush

    private_key, subject = settings
    vapid_private_key: Any = private_key
    if "-----BEGIN" in private_key:
        from py_vapid import Vapid

        vapid_private_key = Vapid.from_pem(private_key.encode("utf-8"))
    response = webpush(
        subscription_info={
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
        },
        data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        vapid_private_key=vapid_private_key,
        vapid_claims={"sub": subject},
        timeout=_bounded_float("RESCUE_MEAL_PUSH_TIMEOUT_SECONDS", 8.0, minimum=1.0, maximum=30.0),
        ttl=_bounded_int("RESCUE_MEAL_PUSH_TTL_SECONDS", 600, minimum=60, maximum=86_400),
    )
    return int(getattr(response, "status_code", 201))


def web_push_error_status(error: BaseException) -> int | None:
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    return int(status_code) if isinstance(status_code, int) else None


class NotificationDeliveryWorker:
    """Process one explicit workspace with lease, retry, and delivery state."""

    def __init__(
        self,
        *,
        store: Any,
        settings: NotificationWorkerSettings,
        notifications: Callable[[], list[NotificationResponse]],
        now: Callable[[], datetime] | None = None,
        sender: Callable[[PushSubscriptionRecord, dict[str, str], tuple[str, str]], int] = send_web_push,
        metrics: NotificationDeliveryRuntimeMetrics | None = None,
    ) -> None:
        self.store = store
        self.settings = settings
        self.notifications = notifications
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.sender = sender
        self.metrics = metrics

    def tick_workspace(self, workspace_id: str) -> NotificationWorkerTickResult:
        workspace_lease_acquired = False
        acquire_workspace = getattr(self.store, "acquire_workspace", None)
        if callable(acquire_workspace):
            acquire_workspace(workspace_id, seed=False)
            workspace_lease_acquired = True
        else:
            self.store.provision_workspace(workspace_id, seed=False)
        workspace_token = set_workspace_id(workspace_id)
        lease_acquired = False
        settings = vapid_settings()
        try:
            configured = settings is not None
            lease_acquired = self.store.acquire_notification_worker_lease(
                lease_key=NOTIFICATION_DELIVERY_LEASE_KEY,
                worker_id=self.settings.worker_id,
                lease_seconds=self.settings.lease_seconds,
                now=self.now(),
            )
            if not lease_acquired:
                result = NotificationWorkerTickResult(workspace_id, self.settings.worker_id, False, configured)
            elif not configured:
                result = NotificationWorkerTickResult(workspace_id, self.settings.worker_id, True, False)
            else:
                result = self._process(settings)
        except Exception as exc:
            result = NotificationWorkerTickResult(workspace_id, self.settings.worker_id, lease_acquired, settings is not None, error=exc.__class__.__name__)
        finally:
            try:
                if lease_acquired:
                    self.store.release_notification_worker_lease(
                        lease_key=NOTIFICATION_DELIVERY_LEASE_KEY,
                        worker_id=self.settings.worker_id,
                    )
                ticked_at = self.now()
                self.store.record_notification_worker_heartbeat(
                    NotificationWorkerHeartbeatRecord(
                        workspace_id=workspace_id,
                        worker_id=self.settings.worker_id,
                        last_tick_at=ticked_at,
                        last_success_at=ticked_at if result.error is None and result.lease_acquired else None,
                        lease_acquired=result.lease_acquired,
                        push_configured=result.push_configured,
                        queued=result.queued,
                        processed=result.processed,
                        succeeded=result.succeeded,
                        retried=result.retried,
                        dead_lettered=result.dead_lettered,
                        cancelled=result.cancelled,
                        removed_subscriptions=result.removed_subscriptions,
                        recovered_in_flight=result.recovered_in_flight,
                        last_error=result.error,
                    )
                )
            finally:
                reset_workspace(workspace_token)
                if workspace_lease_acquired:
                    self.store.release_workspace(workspace_id)
        if self.metrics is not None:
            self.metrics.record_tick(result)
        return result

    def _process(self, settings: tuple[str, str]) -> NotificationWorkerTickResult:
        now = self.now()
        preferences = self.store.get_notification_preferences()
        if not self.store.push_subscriptions:
            cancelled = self._cancel_inactive(set(), set(), now)
            return NotificationWorkerTickResult(
                self._workspace_id(), self.settings.worker_id, True, True, cancelled=cancelled,
            )
        if not preferences.push_enabled:
            return NotificationWorkerTickResult(self._workspace_id(), self.settings.worker_id, True, True)
        current_notifications = self.notifications()
        active_notification_ids = {item.id for item in current_notifications if item.read_at is None}
        active_endpoint_fingerprints = {
            push_endpoint_fingerprint(subscription.endpoint)
            for subscription in self.store.push_subscriptions.values()
        }
        recovered = self._recover_stale(now)
        queued = self._enqueue(now, current_notifications)
        cancelled = self._cancel_inactive(active_notification_ids, active_endpoint_fingerprints, now)
        if quiet_hours_active(
            now,
            preferences.quiet_hours_start,
            preferences.quiet_hours_end,
            timezone_name=preferences.timezone,
        ):
            self.store.flush()
            return NotificationWorkerTickResult(
                self._workspace_id(), self.settings.worker_id, True, True,
                queued=queued, cancelled=cancelled, recovered_in_flight=recovered,
            )

        processed = succeeded = retried = dead_lettered = removed = 0
        candidates = sorted(self.store.notification_deliveries.values(), key=lambda item: (item.next_attempt_at, item.id))
        for record in candidates:
            if processed >= self.settings.process_limit or record.status != "pending" or record.next_attempt_at > now:
                continue
            subscription = next(
                (item for item in self.store.push_subscriptions.values() if push_endpoint_fingerprint(item.endpoint) == record.endpoint_fingerprint),
                None,
            )
            if subscription is None:
                record.status = "cancelled"
                record.last_error = "푸시 기기가 해지되었거나 현재 연결되어 있지 않아 전송하지 않았습니다."
                record.updated_at = now
                cancelled += 1
                if self.metrics is not None:
                    self.metrics.record_cancellation("subscription_inactive")
                continue
            processed += 1
            record.status = "in_flight"
            record.attempts += 1
            record.last_attempt_at = now
            record.in_flight_started_at = now
            record.updated_at = now
            self.store.flush()
            try:
                self.sender(subscription, record.payload, settings)
            except Exception as exc:
                status_code = web_push_error_status(exc)
                record.in_flight_started_at = None
                record.last_error = f"{exc.__class__.__name__}"[:300]
                if status_code in {404, 410}:
                    self.store.delete_push_subscription(subscription.endpoint)
                    record.status = "dead_letter"
                    removed += 1
                    dead_lettered += 1
                elif record.attempts >= _bounded_int("RESCUE_MEAL_PUSH_MAX_ATTEMPTS", 3, minimum=1, maximum=10):
                    record.status = "dead_letter"
                    dead_lettered += 1
                else:
                    record.status = "pending"
                    record.next_attempt_at = retry_at(now, record.attempts)
                    retried += 1
            else:
                record.status = "succeeded"
                record.last_error = None
                record.in_flight_started_at = None
                succeeded += 1
            record.updated_at = self.now()
            self.store.flush()
        return NotificationWorkerTickResult(
            self._workspace_id(), self.settings.worker_id, True, True, queued=queued, processed=processed,
            succeeded=succeeded, retried=retried, dead_lettered=dead_lettered,
            cancelled=cancelled, removed_subscriptions=removed, recovered_in_flight=recovered,
        )

    def _workspace_id(self) -> str:
        return current_workspace_id()

    def _recover_stale(self, now: datetime) -> int:
        recovered = 0
        for record in self.store.notification_deliveries.values():
            if record.status != "in_flight" or record.in_flight_started_at is None:
                continue
            if now - record.in_flight_started_at < timedelta(seconds=self.settings.stale_after_seconds):
                continue
            record.status = "pending"
            record.in_flight_started_at = None
            record.next_attempt_at = now
            record.last_error = "이전 notification worker가 delivery 결과를 남기지 못했습니다. 재시도합니다."
            record.updated_at = now
            recovered += 1
        if recovered:
            self.store.flush()
        return recovered

    def _cancel_inactive(
        self,
        active_notification_ids: set[str],
        active_endpoint_fingerprints: set[str],
        now: datetime,
    ) -> int:
        cancelled = 0
        for record in self.store.notification_deliveries.values():
            if (
                record.status != "pending"
                or (
                    record.notification_id in active_notification_ids
                    and record.endpoint_fingerprint in active_endpoint_fingerprints
                )
            ):
                continue
            record.status = "cancelled"
            record.in_flight_started_at = None
            record.last_error = (
                "푸시 기기가 해지되었거나 현재 연결되어 있지 않아 전송하지 않았습니다."
                if not active_endpoint_fingerprints or record.notification_id in active_notification_ids
                else "알림이 이미 읽혔거나 현재 알림 대상이 아니어서 전송하지 않았습니다."
            )
            record.updated_at = now
            cancelled += 1
            if self.metrics is not None:
                self.metrics.record_cancellation(
                    "subscription_inactive"
                    if not active_endpoint_fingerprints or record.notification_id in active_notification_ids
                    else "notification_inactive"
                )
        if cancelled:
            self.store.flush()
        return cancelled

    def _enqueue(self, now: datetime, notifications: list[NotificationResponse] | None = None) -> int:
        queued = 0
        pending_notifications = [item for item in (notifications if notifications is not None else self.notifications()) if item.read_at is None]
        for notification in pending_notifications:
            payload = build_push_payload(notification)
            for subscription in self.store.push_subscriptions.values():
                fingerprint = push_endpoint_fingerprint(subscription.endpoint)
                record_id = delivery_id(notification.id, fingerprint)
                if record_id in self.store.notification_deliveries:
                    continue
                self.store.notification_deliveries[record_id] = NotificationDeliveryRecord(
                    id=record_id,
                    notification_id=notification.id,
                    endpoint_fingerprint=fingerprint,
                    payload=payload,
                    next_attempt_at=now,
                    created_at=now,
                    updated_at=now,
                )
                queued += 1
        if queued:
            self.store.flush()
        return queued
