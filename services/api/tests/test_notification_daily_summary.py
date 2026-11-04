"""Daily summary push, workspace discovery, and deep-link payload contracts."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

import app.main as main_module
from app.auth import reset_workspace, set_workspace_id
from app.main import InMemoryStore, PostgresStore, SqliteStore, WorkspaceStoreRouter
from app.notification_delivery import (
    NotificationDeliveryWorker,
    NotificationWorkerSettings,
    build_daily_summary_payload,
    build_push_payload,
    daily_summary_notification_id,
    notification_workspace_ids_from_env,
)
from app.notifications import NotificationPreferences, NotificationResponse, PushSubscriptionRequest
from app.worker_runner import request_http_workspace_ids, run_worker_loop
from tests.test_postgres_contract import FakeConnection, FakeCursor


# 09:00 UTC is 18:00 in Asia/Seoul, the default summary time.
SUMMARY_DUE_UTC = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
ENDPOINT = "https://push.example.test/subscription/summary"


def _food_notification(food_id: str, name: str, *, kind: str = "date_due", now: datetime = SUMMARY_DUE_UTC) -> NotificationResponse:
    return NotificationResponse(
        id=f"food-date:{food_id}:use_by:2026-09-02" if kind != "storage_mismatch" else f"food-storage-mismatch:{food_id}:refrigerated:ambient",
        kind=kind,  # type: ignore[arg-type]
        severity="urgent",
        title="오늘 확인할 날짜예요",
        message=f"{name}의 표시 날짜를 확인하세요.",
        canonical_name=name,
        food_id=food_id,
        due_date=now.date(),
        source="printed_date" if kind != "storage_mismatch" else "storage_condition",
        action="food",
        created_at=now,
    )


def _grocy_notification(now: datetime = SUMMARY_DUE_UTC) -> NotificationResponse:
    return NotificationResponse(
        id="grocy-outbox:sync-1:dead_letter",
        kind="grocy_sync",
        severity="urgent",
        title="Grocy 동기화 실패",
        message="우유: 재시도해 주세요.",
        canonical_name="우유",
        source="grocy_outbox",
        action="grocy",
        created_at=now,
        sync_state="action_required",
        sync_record_id="sync-1",
    )


def _router(**preferences) -> WorkspaceStoreRouter:
    router = WorkspaceStoreRouter(InMemoryStore(seed=False))
    router.update_notification_preferences(NotificationPreferences(push_enabled=True, **preferences))
    router.upsert_push_subscription(PushSubscriptionRequest(endpoint=ENDPOINT, p256dh="p" * 32, auth="a" * 16))
    return router


def _settings() -> NotificationWorkerSettings:
    return NotificationWorkerSettings(workspace_ids=("demo",), worker_id="summary-test-worker", stale_after_seconds=60)


@pytest.fixture
def vapid(monkeypatch):
    monkeypatch.setenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", "private-key")
    monkeypatch.setenv("RESCUE_MEAL_VAPID_SUBJECT", "mailto:ops@example.com")


class Clock:
    def __init__(self, value: datetime) -> None:
        self.value = value

    def __call__(self) -> datetime:
        return self.value


def _worker(router, notifications, clock, sent):
    def sender(subscription, payload, settings):
        sent.append(dict(payload))
        return 201

    return NotificationDeliveryWorker(store=router, settings=_settings(), notifications=notifications, now=clock, sender=sender)


def test_default_preferences_send_one_summary_per_local_day(vapid) -> None:
    router = _router()
    assert router.get_notification_preferences().push_mode == "daily_summary"
    assert router.get_notification_preferences().daily_summary_time == "18:00"
    items = [_food_notification(f"food-{index}", name) for index, name in enumerate(["시금치", "두부", "닭가슴살", "우유"])]
    clock = Clock(SUMMARY_DUE_UTC - timedelta(minutes=1))  # 17:59 KST
    sent: list[dict[str, str]] = []
    worker = _worker(router, lambda: items, clock, sent)

    before = worker.tick_workspace("demo")
    assert before.queued == 0 and sent == []

    clock.value = SUMMARY_DUE_UTC
    due = worker.tick_workspace("demo")
    clock.value = SUMMARY_DUE_UTC + timedelta(hours=2)
    repeat = worker.tick_workspace("demo")

    assert due.queued == 1 and due.succeeded == 1
    assert repeat.queued == 0 and repeat.processed == 0
    assert sent == [{
        "title": "오늘 먼저 살펴볼 식품 4개",
        "body": "시금치, 두부 외 2개의 표시 날짜와 보관 상태를 확인해 보세요.",
        "tag": sent[0]["tag"],
        "url": "/?open=priority",
    }]
    # No per-food push was queued alongside the summary.
    assert [record.notification_id for record in router.notification_deliveries.values()] == ["daily-summary:2026-09-02"]

    clock.value = SUMMARY_DUE_UTC + timedelta(days=1)
    next_day = worker.tick_workspace("demo")
    assert next_day.succeeded == 1
    assert len(sent) == 2
    assert sent[1]["tag"] != sent[0]["tag"]


def test_summary_counts_distinct_foods_and_links_single_food(vapid) -> None:
    router = _router()
    items = [
        _food_notification("spinach-1", "시금치"),
        _food_notification("spinach-1", "시금치", kind="storage_mismatch"),
    ]
    sent: list[dict[str, str]] = []
    _worker(router, lambda: items, Clock(SUMMARY_DUE_UTC), sent).tick_workspace("demo")

    assert len(sent) == 1
    assert sent[0]["title"] == "오늘 먼저 살펴볼 식품 1개"
    assert sent[0]["body"] == "시금치의 표시 날짜와 보관 상태를 확인해 보세요."
    assert sent[0]["url"] == "/?food=spinach-1"


def test_summary_excludes_undated_review_prompts_and_keeps_grocy_individual(vapid) -> None:
    router = _router()
    undated = _food_notification("tofu-1", "두부").model_copy(update={"id": "food-date-check:tofu-1:unknown", "kind": "date_check", "due_date": None})
    sent: list[dict[str, str]] = []
    worker = _worker(router, lambda: [undated, _grocy_notification()], Clock(SUMMARY_DUE_UTC), sent)

    result = worker.tick_workspace("demo")

    assert result.queued == 1
    assert [payload["title"] for payload in sent] == ["Grocy 동기화 실패"]
    assert sent[0]["url"] == "/?open=grocy"


def test_summary_copy_never_judges_food_safety() -> None:
    payload = build_daily_summary_payload(SUMMARY_DUE_UTC.date(), [_food_notification("a", "우유"), _food_notification("b", "계란")])
    assert payload is not None
    text = payload["title"] + payload["body"]
    for forbidden in ("안전", "위험", "상했", "버리", "먹어도"):
        assert forbidden not in text
    assert build_daily_summary_payload(SUMMARY_DUE_UTC.date(), []) is None


def test_summary_respects_quiet_hours_and_cancels_when_everything_was_read(vapid) -> None:
    router = _router(quiet_hours_start="17:00", quiet_hours_end="19:00")
    items = [_food_notification("milk-1", "우유"), _food_notification("egg-1", "계란")]
    clock = Clock(SUMMARY_DUE_UTC)  # 18:00 KST, inside quiet hours
    sent: list[dict[str, str]] = []
    worker = _worker(router, lambda: items, clock, sent)

    held = worker.tick_workspace("demo")
    assert held.queued == 1 and held.processed == 0 and sent == []

    clock.value = SUMMARY_DUE_UTC + timedelta(hours=1)  # 19:00 KST, quiet hours over
    released = worker.tick_workspace("demo")
    assert released.succeeded == 1 and sent[0]["title"] == "오늘 먼저 살펴볼 식품 2개"

    # Next day: queued during quiet hours, then the user reads everything first.
    clock.value = SUMMARY_DUE_UTC + timedelta(days=1)
    next_items = [_food_notification("milk-1", "우유")]
    worker.notifications = lambda: next_items
    assert worker.tick_workspace("demo").queued == 1
    worker.notifications = lambda: [item.model_copy(update={"read_at": clock.value}) for item in next_items]
    clock.value = SUMMARY_DUE_UTC + timedelta(days=1, hours=1)
    cancelled = worker.tick_workspace("demo")
    assert cancelled.cancelled == 1 and cancelled.processed == 0
    record = next(item for item in router.notification_deliveries.values() if item.notification_id == "daily-summary:2026-09-03")
    assert record.status == "cancelled"


def test_summary_time_follows_user_timezone_and_setting(vapid) -> None:
    router = _router(timezone="UTC", daily_summary_time="08:30")
    items = [_food_notification("milk-1", "우유")]
    clock = Clock(datetime(2026, 9, 2, 8, 29, tzinfo=timezone.utc))
    sent: list[dict[str, str]] = []
    worker = _worker(router, lambda: items, clock, sent)

    assert worker.tick_workspace("demo").queued == 0
    clock.value = datetime(2026, 9, 2, 8, 30, tzinfo=timezone.utc)
    assert worker.tick_workspace("demo").succeeded == 1
    assert daily_summary_notification_id(clock.value.date()) == "daily-summary:2026-09-02"


def test_each_item_mode_keeps_individual_pushes_with_food_links(vapid) -> None:
    router = _router(push_mode="each_item")
    items = [_food_notification("milk-1", "우유"), _food_notification("egg-1", "계란")]
    sent: list[dict[str, str]] = []
    result = _worker(router, lambda: items, Clock(SUMMARY_DUE_UTC - timedelta(hours=8)), sent).tick_workspace("demo")

    assert result.succeeded == 2
    assert sorted(payload["url"] for payload in sent) == ["/?food=egg-1", "/?food=milk-1"]


def test_switching_to_summary_cancels_pending_individual_pushes(vapid) -> None:
    router = _router(push_mode="each_item", quiet_hours_start="00:00", quiet_hours_end="23:59")
    items = [_food_notification("milk-1", "우유")]
    sent: list[dict[str, str]] = []
    worker = _worker(router, lambda: items, Clock(SUMMARY_DUE_UTC), sent)
    assert worker.tick_workspace("demo").queued == 1

    router.update_notification_preferences(router.get_notification_preferences().model_copy(update={"push_mode": "daily_summary", "quiet_hours_start": None, "quiet_hours_end": None}))
    result = worker.tick_workspace("demo")

    assert result.cancelled == 1
    assert [payload["title"] for payload in sent] == ["오늘 먼저 살펴볼 식품 1개"]


def test_food_deep_link_is_url_encoded() -> None:
    payload = build_push_payload(_food_notification("food/1 &x", "우유"))
    assert payload["url"] == "/?food=food%2F1%20%26x"


def test_legacy_preference_payload_without_new_fields_loads_with_summary_defaults() -> None:
    legacy = {"in_app_enabled": True, "push_enabled": True, "lead_days": 2, "timezone": "Asia/Seoul", "quiet_hours_start": None, "quiet_hours_end": None}
    preferences = NotificationPreferences.model_validate(legacy)
    assert preferences.push_mode == "daily_summary"
    assert preferences.daily_summary_time == "18:00"
    with pytest.raises(ValueError):
        NotificationPreferences.model_validate({**legacy, "daily_summary_time": "25:00"})


# --- workspace discovery -------------------------------------------------


def _enable_push(router: WorkspaceStoreRouter, workspace_id: str, *, push_enabled: bool, subscribe: bool) -> None:
    router.acquire_workspace(workspace_id, seed=False)
    token = set_workspace_id(workspace_id)
    try:
        router.update_notification_preferences(NotificationPreferences(push_enabled=push_enabled))
        if subscribe:
            router.upsert_push_subscription(
                PushSubscriptionRequest(endpoint=f"https://push.example.test/{workspace_id}", p256dh="p" * 32, auth="a" * 16)
            )
    finally:
        reset_workspace(token)
        router.release_workspace(workspace_id)


def test_sqlite_discovery_finds_only_push_enabled_subscribed_workspaces(tmp_path: Path) -> None:
    base_path = tmp_path / "rescue-meal.db"
    router = WorkspaceStoreRouter(SqliteStore(str(base_path), seed=False), workspace_store_cache_size=1)
    _enable_push(router, "new-signup", push_enabled=True, subscribe=True)
    _enable_push(router, "no-device", push_enabled=True, subscribe=False)
    _enable_push(router, "push-off", push_enabled=False, subscribe=True)
    # The auth database and unrelated files share the prefix but are not workspaces.
    (tmp_path / "rescue-meal.auth.db").write_bytes(b"")
    (tmp_path / "rescue-meal.new-signup.db-wal").write_bytes(b"")
    before = sorted(path.name for path in tmp_path.iterdir())

    assert router.push_delivery_workspace_ids() == ("new-signup",)
    _enable_push(router, "demo", push_enabled=True, subscribe=True)
    assert router.push_delivery_workspace_ids() == ("demo", "new-signup")
    # Discovery is read-only: it never creates workspace files.
    assert sorted(path.name for path in tmp_path.iterdir()) == before


def test_in_memory_discovery_uses_process_local_stores() -> None:
    router = WorkspaceStoreRouter(InMemoryStore(seed=False))
    _enable_push(router, "guest-1", push_enabled=True, subscribe=True)
    _enable_push(router, "guest-2", push_enabled=False, subscribe=True)
    assert router.push_delivery_workspace_ids() == ("guest-1",)


class _DiscoveryCursor(FakeCursor):
    def fetchall(self):
        query = self.connection.queries[-1][0]
        if "JOIN rescue_api_push_subscriptions" in query:
            return [("account-b",), ("account-a",)]
        return super().fetchall()


class _DiscoveryConnection(FakeConnection):
    def cursor(self):
        return _DiscoveryCursor(self)


def test_postgres_discovery_joins_preferences_and_subscriptions_read_only() -> None:
    connection = _DiscoveryConnection()
    base = PostgresStore("postgresql://test", workspace_id="demo", seed=False, connection=connection)
    router = WorkspaceStoreRouter(base)
    connection.queries.clear()
    rollbacks = connection.rollbacks

    assert router.push_delivery_workspace_ids() == ("account-a", "account-b")
    query = connection.queries[-1][0]
    assert "JOIN rescue_api_push_subscriptions" in query
    assert "payload->>'push_enabled'" in query
    assert connection.rollbacks == rollbacks + 1  # read transaction released
    assert not any(keyword in query.upper() for keyword in ("INSERT", "UPDATE", "DELETE"))


def test_internal_workspace_discovery_endpoint_requires_token_and_returns_ids_only(monkeypatch) -> None:
    client = TestClient(main_module.app)
    main_module.store.reset()
    path = "/api/internal/notifications/workspaces"
    monkeypatch.delenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", raising=False)
    assert client.get(path).status_code == 503
    monkeypatch.setenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "notification-worker-secret")
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"X-Rescue-Meal-Notification-Worker-Token": "wrong"}).status_code == 403
    monkeypatch.setattr(WorkspaceStoreRouter, "push_delivery_workspace_ids", lambda self: ("acct-1", "demo"))

    response = client.get(path, headers={"X-Rescue-Meal-Notification-Worker-Token": "notification-worker-secret"})

    assert response.status_code == 200
    assert response.json() == {"workspace_ids": ["acct-1", "demo"]}


# --- worker discovery loop ----------------------------------------------


def test_workspace_env_defaults_to_discovery_and_keeps_explicit_allowlist(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS", raising=False)
    assert notification_workspace_ids_from_env() == ()
    assert NotificationWorkerSettings.from_env().discovers_workspaces is True
    monkeypatch.setenv("RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS", "auto")
    assert notification_workspace_ids_from_env() == ()
    monkeypatch.setenv("RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS", "demo, acct-1,demo")
    assert notification_workspace_ids_from_env() == ("demo", "acct-1")
    assert NotificationWorkerSettings.from_env().discovers_workspaces is False


def test_worker_loop_resolves_workspaces_each_cycle() -> None:
    cycles = iter([(["a"], None), ([], None), ([], {"status": "discovery_failed", "error": "ConnectError"}), (["a", "b"], None)])
    ticked: list[str] = []
    output: list[str] = []
    sleeps: list[float] = []

    def sleep(delay: float) -> None:
        sleeps.append(delay)
        if len(sleeps) == 3:
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        run_worker_loop(
            resolve_workspace_ids=lambda: next(cycles),
            worker_id="w",
            interval_seconds=30.0,
            once=False,
            tick=lambda workspace_id: (ticked.append(workspace_id) or {"workspace_id": workspace_id}, False),
            sleep=sleep,
            emit=output.append,
        )
    assert ticked == ["a"]
    events = [json.loads(line) for line in output]
    assert {"status": "idle", "worker_id": "w", "workspace_count": 0} in events
    assert any(event.get("status") == "discovery_failed" for event in events)
    assert sleeps == [30.0, 30.0, 30.0]


class _FakeDiscoveryClient:
    def __init__(self, workspace_ids: list[str]) -> None:
        self.workspace_ids = workspace_ids
        self.calls: list[tuple[str, str]] = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, path, headers=None):
        self.calls.append(("GET", path))
        return _Response({"workspace_ids": self.workspace_ids})

    def post(self, path, headers=None, json=None):
        self.calls.append(("POST", path))
        return _Response({"workspace_id": path.split("/")[-2], "error": None})


class _Response:
    def __init__(self, payload) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self.payload


def test_worker_script_discovers_new_workspaces_without_allowlist(monkeypatch) -> None:
    import scripts.run_notification_worker as module

    monkeypatch.setenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "worker-token")
    monkeypatch.delenv("RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS", raising=False)
    fake = _FakeDiscoveryClient(["acct-new"])
    monkeypatch.setattr(module.httpx, "Client", lambda **kwargs: fake)
    output: list[str] = []

    assert module.run(once=True, emit=output.append) == 0
    assert fake.calls == [
        ("GET", "/api/internal/notifications/workspaces"),
        ("POST", "/api/internal/notifications/workspaces/acct-new/tick"),
    ]


def test_discovery_request_rejects_malformed_response() -> None:
    class Bad(_FakeDiscoveryClient):
        def get(self, path, headers=None):
            return _Response({"workspace_ids": "demo"})

    ids, error = request_http_workspace_ids(Bad([]), path="/x", headers={}, worker_id="w")
    assert ids == [] and error == {"status": "discovery_failed", "worker_id": "w", "error": "invalid_response"}
