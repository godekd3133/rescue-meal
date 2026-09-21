from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import GrocyOutboxRecord, _FoodRecord, _food, _notification_clock
from app.notifications import FoodNotificationInput, GrocyNotificationInput, NotificationPreferences, build_notifications, push_endpoint_fingerprint
from app.notification_delivery import quiet_hours_active


client = TestClient(main_module.app)


def setup_function() -> None:
    main_module.store.reset()


def test_notification_rules_keep_printed_dates_separate_from_estimates() -> None:
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    notifications = build_notifications(
        foods=[
            FoodNotificationInput(
                id="printed-1",
                canonical_name="우유",
                date_kind="use_by",
                date_value=date(2026, 9, 2),
                estimated_start_date=None,
                estimated_end_date=None,
            ),
            FoodNotificationInput(
                id="estimate-1",
                canonical_name="두부",
                date_kind="unknown",
                date_value=None,
                estimated_start_date=date(2026, 9, 2),
                estimated_end_date=date(2026, 9, 4),
            ),
            FoodNotificationInput(
                id="unknown-1",
                canonical_name="맛타리버섯",
                date_kind="unknown",
                date_value=None,
                estimated_start_date=None,
                estimated_end_date=None,
            ),
        ],
        grocy_items=[],
        read_at={},
        today=date(2026, 9, 2),
        now=now,
    )

    assert [item.canonical_name for item in notifications] == ["우유", "두부", "맛타리버섯"]
    assert notifications[0].source == "printed_date"
    assert "소비기한이 오늘" in notifications[0].message
    assert "안전" not in notifications[0].message
    assert notifications[1].source == "estimated_window"
    assert "실제 소비기한이 아니므로" in notifications[1].message
    assert notifications[2].source == "unknown_date"
    assert notifications[2].action == "food"


def test_notification_rules_include_storage_condition_mismatch_as_an_advisory() -> None:
    now = datetime(2026, 9, 4, 9, 0, tzinfo=timezone.utc)
    notifications = build_notifications(
        foods=[
            FoodNotificationInput(
                id="storage-mismatch-1",
                canonical_name="실온 보관 잼",
                date_kind="use_by",
                date_value=date(2026, 9, 12),
                estimated_start_date=None,
                estimated_end_date=None,
                storage_type="refrigerated",
                storage_location_name="김치냉장고",
                applicable_storage_type="ambient",
                storage_condition_text="실온 보관",
            )
        ],
        grocy_items=[],
        read_at={},
        today=date(2026, 9, 4),
        now=now,
        lead_days=0,
    )

    assert len(notifications) == 1
    assert notifications[0].kind == "storage_mismatch"
    assert notifications[0].source == "storage_condition"
    assert notifications[0].action == "food"
    assert "실온 보관" in notifications[0].message
    assert "김치냉장고" in notifications[0].message


def test_notification_api_includes_the_custom_storage_location_name() -> None:
    location = client.post(
        "/api/storage-locations",
        json={"name": "김치냉장고", "storage_type": "refrigerated"},
    )
    assert location.status_code == 201

    food = client.post(
        "/api/foods",
        json={
            "canonical_name": "알림 custom 위치 식품",
            "quantity": 1,
            "unit": "팩",
            "storage_type": "refrigerated",
            "storage_location_id": location.json()["id"],
            "category": "기타",
            "date_kind": "use_by",
            "date_value": "2030-09-12",
            "date_source": "label_ocr",
            "date_source_detail": "포장지 소비기한",
            "applicable_storage_type": "ambient",
            "storage_condition_text": "실온 보관",
            "user_confirmed": True,
        },
    )
    assert food.status_code == 201

    notifications = client.get("/api/notifications?unread_only=true")
    assert notifications.status_code == 200
    mismatch = next(item for item in notifications.json() if item["food_id"] == food.json()["id"])
    assert mismatch["kind"] == "storage_mismatch"
    assert "김치냉장고" in mismatch["message"]


def test_notification_rules_include_grocy_action_items_and_restore_read_state() -> None:
    now = datetime(2026, 9, 2, 9, 0, tzinfo=timezone.utc)
    notifications = build_notifications(
        foods=[],
        grocy_items=[
            GrocyNotificationInput(
                id="outbox-1",
                canonical_name="닭가슴살",
                status="reconciliation_required",
                last_error="외부 반영 여부 확인이 필요합니다.",
            )
        ],
        read_at={"grocy-outbox:outbox-1:reconciliation_required": now},
        today=date(2026, 9, 2),
        now=now,
    )

    assert len(notifications) == 1
    assert notifications[0].kind == "grocy_sync"
    assert notifications[0].action == "grocy"
    assert notifications[0].read_at == now


def test_notification_read_model_exposes_the_grocy_sync_lifecycle() -> None:
    now = datetime(2026, 9, 19, 10, 30, tzinfo=timezone.utc)
    notifications = build_notifications(
        foods=[],
        grocy_items=[
            GrocyNotificationInput("blocked-1", "매핑 확인 식품", "blocked", "상품 매핑이 필요합니다.", now),
            GrocyNotificationInput("queued-1", "처리 대기 식품", "pending", None, now),
            GrocyNotificationInput("processing-1", "반영 중 식품", "in_flight", None, now),
            GrocyNotificationInput("applied-1", "반영 완료 식품", "succeeded", None, now),
            GrocyNotificationInput("dead-letter-1", "실패 식품", "dead_letter", "외부 재고 반영에 실패했습니다.", now),
            GrocyNotificationInput("reconcile-1", "재확인 식품", "reconciliation_required", "반영 여부를 확인해 주세요.", now),
        ],
        read_at={},
        today=date(2026, 9, 19),
        now=now,
    )

    by_id = {item.id: item for item in notifications}
    assert by_id["grocy-outbox:blocked-1:blocked"].sync_state == "action_required"
    assert by_id["grocy-outbox:blocked-1:blocked"].title == "Grocy 매핑 확인 필요"
    assert by_id["grocy-outbox:queued-1:pending"].sync_state == "queued"
    assert by_id["grocy-outbox:queued-1:pending"].title == "외부 재고 반영을 기다리는 중이에요"
    assert by_id["grocy-outbox:processing-1:in_flight"].sync_state == "processing"
    assert by_id["grocy-outbox:applied-1:succeeded"].sync_state == "applied"
    assert by_id["grocy-outbox:applied-1:succeeded"].sync_record_id == "applied-1"
    assert by_id["grocy-outbox:applied-1:succeeded"].title == "외부 재고에 반영했어요"
    assert by_id["grocy-outbox:queued-1:pending"].created_at == now
    assert by_id["grocy-outbox:applied-1:succeeded"].severity == "info"
    assert all(by_id[f"grocy-outbox:{key}:{status}"].action == "grocy" for key, status in [("dead-letter-1", "dead_letter"), ("reconcile-1", "reconciliation_required")])


def test_notification_api_keeps_recent_sync_states_and_expires_old_success() -> None:
    now = datetime.now(timezone.utc)
    for outbox_id, status, updated_at in (
        ("api-queued", "pending", now),
        ("api-applied", "succeeded", now),
        ("api-old-applied", "succeeded", now - timedelta(days=2)),
    ):
        main_module.store.grocy_outbox[outbox_id] = GrocyOutboxRecord(
            id=outbox_id,
            operation="consume",
            aggregate_id=outbox_id,
            idempotency_key=f"storage-event:{outbox_id}",
            canonical_name=outbox_id,
            grocy_product_id=88,
            quantity=1,
            unit="팩",
            payload={},
            status=status,
            created_at=updated_at,
            updated_at=updated_at,
        )
    main_module.store.flush()

    response = client.get("/api/notifications")
    assert response.status_code == 200
    payload = {item["canonical_name"]: item for item in response.json()}
    assert payload["api-queued"]["sync_state"] == "queued"
    assert payload["api-applied"]["sync_state"] == "applied"
    assert "api-old-applied" not in payload


def test_notification_api_marks_current_notification_read_and_filters_unread() -> None:
    today = date.today()
    main_module.store.foods["notification-food"] = _FoodRecord(
        _food(
            "notification-food",
            "알림 테스트 우유",
            "테스트 브랜드",
            1,
            "개",
            "refrigerated",
            "use_by",
            today,
            "user_input",
            "테스트용 사용자 확인 날짜",
            1,
            "유제품",
            "/assets/food/milk.png",
            "테스트",
        )
    )
    main_module.store.flush()

    unread = client.get("/api/notifications?unread_only=true")
    assert unread.status_code == 200
    notification = next(item for item in unread.json() if item["food_id"] == "notification-food")

    marked = client.post(f"/api/notifications/{notification['id']}/read")
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    remaining = client.get("/api/notifications?unread_only=true")
    assert remaining.status_code == 200
    assert all(item["id"] != notification["id"] for item in remaining.json())

    already_read = client.get("/api/notifications")
    assert already_read.status_code == 200
    assert next(item for item in already_read.json() if item["id"] == notification["id"])["read_at"] is not None


def test_notification_api_rejects_unknown_notification_id() -> None:
    response = client.post("/api/notifications/not-a-current-notification/read")
    assert response.status_code == 404


def test_notification_preferences_control_in_app_visibility_and_are_validated() -> None:
    defaults = client.get("/api/notification-preferences")
    assert defaults.status_code == 200
    assert defaults.json() == {
        "in_app_enabled": True,
        "push_enabled": False,
        "lead_days": 2,
        "timezone": "Asia/Seoul",
        "quiet_hours_start": None,
        "quiet_hours_end": None,
    }

    updated = client.put(
        "/api/notification-preferences",
        json={"in_app_enabled": False, "push_enabled": False, "lead_days": 0, "quiet_hours_start": "22:00", "quiet_hours_end": "07:00"},
    )
    assert updated.status_code == 200
    assert updated.json()["lead_days"] == 0
    assert client.get("/api/notifications").json() == []

    incomplete_quiet_hours = client.put(
        "/api/notification-preferences",
        json={"in_app_enabled": True, "push_enabled": False, "lead_days": 2, "quiet_hours_start": "22:00", "quiet_hours_end": None},
    )
    assert incomplete_quiet_hours.status_code == 422

    invalid_timezone = client.put(
        "/api/notification-preferences",
        json={"in_app_enabled": True, "push_enabled": False, "lead_days": 2, "timezone": "Mars/Olympus", "quiet_hours_start": None, "quiet_hours_end": None},
    )
    assert invalid_timezone.status_code == 422


def test_notification_timezone_controls_local_date_and_quiet_hours() -> None:
    utc_now = datetime(2026, 9, 3, 15, 30, tzinfo=timezone.utc)
    preferences = NotificationPreferences(timezone="Asia/Seoul", quiet_hours_start="22:00", quiet_hours_end="07:00")

    current_date, current_time = _notification_clock(preferences, now=utc_now)
    assert current_date == date(2026, 9, 4)
    assert current_time == utc_now
    assert quiet_hours_active(utc_now, preferences.quiet_hours_start, preferences.quiet_hours_end, timezone_name=preferences.timezone) is True
    assert quiet_hours_active(utc_now, preferences.quiet_hours_start, preferences.quiet_hours_end) is False


def test_workspace_timezone_is_shared_with_planner_date_calculation() -> None:
    main_module.store.update_notification_preferences(NotificationPreferences(timezone="UTC"))

    assert main_module._workspace_timezone().key == "UTC"


def test_push_subscription_keeps_endpoint_private_and_supports_idempotent_removal() -> None:
    request = {"endpoint": "https://push.example.test/subscription/one", "p256dh": "p" * 32, "auth": "a" * 16}
    registered = client.put("/api/push/subscriptions", json=request)
    assert registered.status_code == 200
    endpoint_fingerprint = push_endpoint_fingerprint(request["endpoint"])
    assert registered.json()["endpoint_fingerprint"] == endpoint_fingerprint
    assert request["endpoint"] not in registered.text

    listed = client.get("/api/push/subscriptions")
    assert listed.status_code == 200
    assert listed.json()[0]["endpoint_fingerprint"] == endpoint_fingerprint
    assert request["endpoint"] not in listed.text

    updated = client.put("/api/push/subscriptions", json={**request, "auth": "b" * 16})
    assert updated.status_code == 200
    assert len(client.get("/api/push/subscriptions").json()) == 1

    insecure = client.put(
        "/api/push/subscriptions",
        json={"endpoint": "http://push.example.test/subscription/insecure", "p256dh": "p" * 32, "auth": "a" * 16},
    )
    assert insecure.status_code == 422

    removed = client.delete(f"/api/push/subscriptions/{endpoint_fingerprint}")
    assert removed.status_code == 200
    assert removed.json() == {"endpoint_fingerprint": endpoint_fingerprint, "removed": True}
    repeated = client.delete(f"/api/push/subscriptions/{endpoint_fingerprint}")
    assert repeated.status_code == 200
    assert repeated.json()["removed"] is False

    invalid_handle = client.delete("/api/push/subscriptions/not-a-handle")
    assert invalid_handle.status_code == 422


def test_notification_worker_tick_requires_token_and_reports_disabled_without_vapid(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "notification-worker-secret")
    monkeypatch.delenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("RESCUE_MEAL_VAPID_SUBJECT", raising=False)
    payload = {"worker_id": "notification-worker-test", "lease_seconds": 120, "stale_after_seconds": 900, "process_limit": 20}
    path = "/api/internal/notifications/workspaces/demo/tick"

    missing = client.post(path, json=payload)
    wrong = client.post(path, headers={"X-Rescue-Meal-Notification-Worker-Token": "wrong"}, json=payload)
    tick = client.post(path, headers={"X-Rescue-Meal-Notification-Worker-Token": "notification-worker-secret"}, json=payload)

    assert missing.status_code == 401
    assert wrong.status_code == 403
    assert tick.status_code == 200
    assert tick.json()["lease_acquired"] is True
    assert tick.json()["push_configured"] is False
    assert tick.json()["queued"] == 0
    heartbeat = client.get("/api/integrations/notifications/worker/status")
    assert heartbeat.status_code == 200
    assert heartbeat.json()[0]["worker_id"] == "notification-worker-test"
    assert heartbeat.json()[0]["push_configured"] is False


def test_notification_worker_metrics_requires_token_and_counts_ticks(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN", "notification-worker-secret")
    monkeypatch.delenv("RESCUE_MEAL_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("RESCUE_MEAL_VAPID_SUBJECT", raising=False)
    metrics_path = "/api/internal/notifications/metrics"
    tick_path = "/api/internal/notifications/workspaces/demo/tick"
    payload = {"worker_id": "notification-metrics-test", "lease_seconds": 120, "stale_after_seconds": 900, "process_limit": 20}
    token_headers = {"X-Rescue-Meal-Notification-Worker-Token": "notification-worker-secret"}

    missing = client.get(metrics_path)
    wrong = client.get(metrics_path, headers={"X-Rescue-Meal-Notification-Worker-Token": "wrong"})
    before = client.get(metrics_path, headers=token_headers)
    tick = client.post(tick_path, headers=token_headers, json=payload)
    after = client.get(metrics_path, headers=token_headers)

    assert missing.status_code == 401
    assert wrong.status_code == 403
    assert before.status_code == 200
    assert tick.status_code == 200
    assert after.status_code == 200
    metric_name = "rescue_meal_notification_worker_ticks_total"
    before_value = next(int(line.split()[-1]) for line in before.text.splitlines() if line.startswith(f"{metric_name} "))
    after_value = next(int(line.split()[-1]) for line in after.text.splitlines() if line.startswith(f"{metric_name} "))
    assert after_value == before_value + 1
    assert "rescue_meal_notification_worker_cancelled_total" in after.text
    assert "rescue_meal_notification_worker_cancellations_total{reason=\"notification_inactive\"}" in after.text
    assert "notification-worker-secret" not in after.text
