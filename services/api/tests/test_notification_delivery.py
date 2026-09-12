import base64
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from threading import Thread

import pytest

from app.main import InMemoryStore, SqliteStore, WorkspaceStoreRouter
from app.notification_delivery import (
    NotificationDeliveryRecord,
    NotificationDeliveryRuntimeMetrics,
    NotificationDeliveryWorker,
    NotificationWorkerSettings,
    build_push_payload,
    delivery_id,
    quiet_hours_active,
    send_web_push,
)
from app.notifications import NotificationResponse, NotificationPreferences, PushSubscriptionRequest, PushSubscriptionRecord, push_endpoint_fingerprint


def _notification(now: datetime) -> NotificationResponse:
    return NotificationResponse(
        id="food-date:milk-1:use_by:2026-09-02",
        kind="date_due",
        severity="urgent",
        title="오늘 확인할 날짜예요",
        message="우유의 표시 날짜를 확인하세요.",
        canonical_name="우유",
        food_id="milk-1",
        due_date=now.date(),
        source="printed_date",
        action="food",
        created_at=now,
    )


def _worker_store() -> WorkspaceStoreRouter:
    router = WorkspaceStoreRouter(InMemoryStore(seed=False))
    router.update_notification_preferences(NotificationPreferences(push_enabled=True))
    router.upsert_push_subscription(
        PushSubscriptionRequest(endpoint="https://push.example.test/subscription/one", p256dh="p" * 32, auth="a" * 16)
    )
    return router


def _settings() -> NotificationWorkerSettings:
    return NotificationWorkerSettings(
        workspace_ids=("demo",),
        worker_id="notification-test-worker",
        lease_seconds=120,
        stale_after_seconds=60,
        process_limit=20,
    )


def test_notification_worker_queues_and_deduplicates_successful_delivery(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    router = _worker_store()
    notification = _notification(now)
    sent: list[dict[str, str]] = []

    def sender(subscription, payload, settings):
        sent.append({"endpoint": subscription.endpoint, "title": payload["title"], "subject": settings[1]})
        return 201

    worker = NotificationDeliveryWorker(store=router, settings=_settings(), notifications=lambda: [notification], now=lambda: now, sender=sender)

    first = worker.tick_workspace("demo")
    second = worker.tick_workspace("demo")

    assert first.queued == 1
    assert first.processed == 1
    assert first.succeeded == 1
    assert second.queued == 0
    assert second.processed == 0
    assert sent == [{"endpoint": "https://push.example.test/subscription/one", "title": "오늘 확인할 날짜예요", "subject": "mailto:ops@example.com"}]
    assert list(router.notification_deliveries.values())[0].status == "succeeded"
    assert build_push_payload(notification)["url"] == "/"


def test_notification_worker_respects_quiet_hours_without_processing_pending_delivery(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 2, 23, 30, tzinfo=timezone.utc)
    router = _worker_store()
    router.update_notification_preferences(NotificationPreferences(push_enabled=True, timezone="UTC", quiet_hours_start="22:00", quiet_hours_end="07:00"))
    sent: list[object] = []
    worker = NotificationDeliveryWorker(store=router, settings=_settings(), notifications=lambda: [_notification(now)], now=lambda: now, sender=lambda *args: sent.append(args))

    result = worker.tick_workspace("demo")

    assert result.queued == 1
    assert result.processed == 0
    assert result.succeeded == 0
    assert sent == []
    assert list(router.notification_deliveries.values())[0].status == "pending"
    assert quiet_hours_active(now, "22:00", "07:00") is True


def test_notification_worker_respects_quiet_hours_in_the_saved_user_timezone(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 3, 13, 30, tzinfo=timezone.utc)
    router = _worker_store()
    router.update_notification_preferences(NotificationPreferences(push_enabled=True, timezone="Asia/Seoul", quiet_hours_start="22:00", quiet_hours_end="07:00"))
    sent: list[object] = []
    worker = NotificationDeliveryWorker(store=router, settings=_settings(), notifications=lambda: [_notification(now)], now=lambda: now, sender=lambda *args: sent.append(args))

    result = worker.tick_workspace("demo")

    assert result.queued == 1
    assert result.processed == 0
    assert sent == []
    assert list(router.notification_deliveries.values())[0].status == "pending"


def test_notification_worker_cancels_pending_delivery_when_notification_is_read_before_send(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 2, 23, 30, tzinfo=timezone.utc)
    router = _worker_store()
    router.update_notification_preferences(
        NotificationPreferences(
            push_enabled=True,
            timezone="UTC",
            quiet_hours_start="22:00",
            quiet_hours_end="07:00",
        )
    )
    notification = _notification(now)
    sent: list[object] = []
    metrics = NotificationDeliveryRuntimeMetrics()
    worker = NotificationDeliveryWorker(
        store=router,
        settings=_settings(),
        notifications=lambda: [notification],
        now=lambda: now,
        sender=lambda *args: sent.append(args),
        metrics=metrics,
    )

    queued = worker.tick_workspace("demo")
    assert queued.queued == 1
    assert router.notification_deliveries[next(iter(router.notification_deliveries))].status == "pending"

    notification.read_at = now
    router.update_notification_preferences(NotificationPreferences(push_enabled=True, timezone="UTC"))
    cancelled = worker.tick_workspace("demo")

    record = router.notification_deliveries[next(iter(router.notification_deliveries))]
    assert cancelled.processed == 0
    assert cancelled.cancelled == 1
    assert cancelled.succeeded == 0
    assert record.status == "cancelled"
    assert "이미 읽혔거나" in (record.last_error or "")
    assert sent == []
    snapshot = metrics.snapshot()
    assert snapshot["counters"]["ticks_total"] == 2
    assert snapshot["counters"]["cancelled_total"] == 1
    assert snapshot["cancellation_reasons"] == {"notification_inactive": 1, "subscription_inactive": 0}
    assert 'rescue_meal_notification_worker_cancellations_total{reason="notification_inactive"} 1' in metrics.prometheus_text()


def test_notification_worker_cancels_pending_delivery_when_subscription_is_removed(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 2, 23, 30, tzinfo=timezone.utc)
    router = _worker_store()
    router.update_notification_preferences(
        NotificationPreferences(
            push_enabled=True,
            timezone="UTC",
            quiet_hours_start="22:00",
            quiet_hours_end="07:00",
        )
    )
    notification = _notification(now)
    sent: list[object] = []
    metrics = NotificationDeliveryRuntimeMetrics()
    worker = NotificationDeliveryWorker(
        store=router,
        settings=_settings(),
        notifications=lambda: [notification],
        now=lambda: now,
        sender=lambda *args: sent.append(args),
        metrics=metrics,
    )

    queued = worker.tick_workspace("demo")
    assert queued.queued == 1
    endpoint_fingerprint = push_endpoint_fingerprint("https://push.example.test/subscription/one")
    router.delete_push_subscription_fingerprint(endpoint_fingerprint)

    cancelled = worker.tick_workspace("demo")

    record = router.notification_deliveries[next(iter(router.notification_deliveries))]
    assert cancelled.processed == 0
    assert cancelled.cancelled == 1
    assert cancelled.dead_lettered == 0
    assert record.status == "cancelled"
    assert "푸시 기기가 해지되었거나" in (record.last_error or "")
    assert sent == []
    assert metrics.snapshot()["cancellation_reasons"] == {"notification_inactive": 0, "subscription_inactive": 1}


def test_notification_worker_removes_gone_subscription_and_dead_letters_delivery(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    router = _worker_store()

    class GoneError(Exception):
        response = type("Response", (), {"status_code": 410})()

    def sender(*args):
        raise GoneError("gone")

    worker = NotificationDeliveryWorker(store=router, settings=_settings(), notifications=lambda: [_notification(now)], now=lambda: now, sender=sender)

    result = worker.tick_workspace("demo")

    assert result.processed == 1
    assert result.dead_lettered == 1
    assert result.removed_subscriptions == 1
    assert router.list_push_subscription_summaries() == []
    assert list(router.notification_deliveries.values())[0].last_error == "GoneError"


def test_notification_worker_does_not_queue_without_vapid_configuration(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("RESCUE_MEAL_VAPID_SUBJECT", raising=False)
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    router = _worker_store()
    worker = NotificationDeliveryWorker(store=router, settings=_settings(), notifications=lambda: [_notification(now)], now=lambda: now, sender=lambda *args: pytest.fail("sender must not run"))

    result = worker.tick_workspace("demo")

    assert result.lease_acquired is True
    assert result.push_configured is False
    assert result.queued == 0
    assert router.notification_deliveries == {}


def test_notification_worker_recovers_stale_in_flight_delivery(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    router = _worker_store()
    notification = _notification(now)
    endpoint = "https://push.example.test/subscription/one"
    stale_delivery_id = delivery_id(notification.id, push_endpoint_fingerprint(endpoint))
    router.notification_deliveries[stale_delivery_id] = NotificationDeliveryRecord(
        id=stale_delivery_id,
        notification_id=notification.id,
        endpoint_fingerprint=push_endpoint_fingerprint(endpoint),
        payload={"title": "이전", "body": "이전", "tag": "old", "url": "/"},
        status="in_flight",
        attempts=1,
        next_attempt_at=now - timedelta(minutes=5),
        in_flight_started_at=now - timedelta(minutes=5),
        last_attempt_at=now - timedelta(minutes=5),
        created_at=now - timedelta(minutes=5),
        updated_at=now - timedelta(minutes=5),
    )
    sent: list[object] = []
    worker = NotificationDeliveryWorker(store=router, settings=_settings(), notifications=lambda: [notification], now=lambda: now, sender=lambda *args: sent.append(args) or 201)

    result = worker.tick_workspace("demo")

    assert result.recovered_in_flight == 1
    assert result.processed == 1
    assert result.succeeded == 1
    assert router.notification_deliveries[stale_delivery_id].status == "succeeded"
    assert len(sent) == 1


def test_web_push_adapter_passes_subscription_keys_and_vapid_claims(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeResponse:
        status_code = 201

    def fake_webpush(**kwargs):
        calls.append(kwargs)
        return FakeResponse()

    import pywebpush

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    monkeypatch.setenv("RESCUE_MEAL_PUSH_TIMEOUT_SECONDS", "7")
    subscription = PushSubscriptionRecord(
        endpoint="https://push.example.test/subscription/adapter",
        p256dh="p" * 32,
        auth="a" * 16,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    status = send_web_push(
        subscription,
        {"title": "확인", "body": "날짜", "tag": "tag", "url": "/"},
        ("private-key", "mailto:ops@example.com"),
    )

    assert status == 201
    assert calls[0]["subscription_info"] == {
        "endpoint": subscription.endpoint,
        "keys": {"p256dh": "p" * 32, "auth": "a" * 16},
    }
    assert calls[0]["vapid_private_key"] == "private-key"
    assert calls[0]["vapid_claims"] == {"sub": "mailto:ops@example.com"}
    assert calls[0]["timeout"] == 7.0
    assert calls[0]["ttl"] == 600


def test_sqlite_notification_delivery_state_survives_restart(tmp_path) -> None:
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    database_path = str(tmp_path / "notification-delivery.db")
    first = SqliteStore(database_path, seed=False)
    first.notification_deliveries["delivery-1"] = NotificationDeliveryRecord(
        id="delivery-1",
        notification_id="notification-1",
        endpoint_fingerprint="1" * 16,
        payload={"title": "확인", "body": "날짜", "tag": "tag", "url": "/"},
        status="pending",
        next_attempt_at=now,
        created_at=now,
        updated_at=now,
    )
    first.notification_deliveries["delivery-cancelled"] = first.notification_deliveries["delivery-1"].model_copy(
        update={
            "id": "delivery-cancelled",
            "status": "cancelled",
            "last_error": "알림이 이미 읽혔거나 현재 알림 대상이 아니어서 전송하지 않았습니다.",
        }
    )
    first.flush()

    reopened = SqliteStore(database_path, seed=False)

    assert reopened.notification_deliveries["delivery-1"].notification_id == "notification-1"
    assert reopened.notification_deliveries["delivery-1"].status == "pending"
    assert reopened.notification_deliveries["delivery-cancelled"].status == "cancelled"


def test_web_push_adapter_encrypts_and_posts_to_a_local_push_service() -> None:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from py_vapid import Vapid

    captured: dict[str, object] = {}

    class PushHandler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802 - stdlib handler contract
            length = int(self.headers.get("Content-Length", "0"))
            captured["headers"] = {key.lower(): value for key, value in self.headers.items()}
            captured["body"] = self.rfile.read(length)
            self.send_response(201)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *_args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), PushHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        subscription_key = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        vapid = Vapid()
        vapid.generate_keys()
        subscription = PushSubscriptionRecord(
            endpoint=f"http://127.0.0.1:{server.server_port}/push",
            p256dh=base64.urlsafe_b64encode(subscription_key).rstrip(b"=").decode("ascii"),
            auth=base64.urlsafe_b64encode(os.urandom(16)).rstrip(b"=").decode("ascii"),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        status = send_web_push(subscription, {"title": "확인", "body": "날짜를 확인하세요", "tag": "tag", "url": "/"}, (vapid.private_pem().decode("ascii"), "mailto:ops@example.com"))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    assert status == 201
    headers = captured["headers"]
    body = captured["body"]
    assert isinstance(headers, dict)
    assert isinstance(body, bytes)
    assert headers["content-encoding"] == "aes128gcm"
    assert headers["ttl"] == "600"
    assert headers["authorization"].startswith("vapid ")
    assert body
    assert "날짜를 확인하세요".encode("utf-8") not in body
