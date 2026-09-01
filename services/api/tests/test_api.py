from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app, auth_repository, ocr_engine, store


client = TestClient(app)


def _guest_headers() -> dict[str, str]:
    response = client.post("/api/auth/guest")
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def setup_function() -> None:
    store.reset()


def test_health_and_dashboard_expose_provenance() -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["food_count"] == 7
    assert payload["rescue_count"] == 3
    spinach = next(item for item in payload["inventory"] if item["display_name"] == "시금치")
    tofu = next(item for item in payload["inventory"] if item["display_name"] == "국산콩 두부")
    assert spinach["date_assertion"]["kind"] == "use_by"
    assert spinach["date_assertion"]["source"] == "label_ocr"
    assert tofu["date_assertion"]["kind"] == "unknown"
    assert tofu["estimated_use_first_window"] is not None


def test_grocy_status_is_disabled_without_external_configuration() -> None:
    response = client.get("/api/integrations/grocy/status")
    assert response.status_code == 200
    assert response.json()["configured"] is False
    assert response.json()["status"] == "disabled"


def test_guest_workspaces_isolate_inventory_from_demo_and_each_other() -> None:
    guest_one = _guest_headers()
    guest_two = _guest_headers()
    created = client.post(
        "/api/foods",
        headers=guest_one,
        json={"canonical_name": "workspace-one-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201
    assert len(client.get("/api/dashboard", headers=guest_one).json()["inventory"]) == 8
    assert len(client.get("/api/dashboard", headers=guest_two).json()["inventory"]) == 7
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7


def test_auth_required_mode_rejects_unscoped_api_requests(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_REQUIRED", "true")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_SECRET", "test-only-auth-secret")
    try:
        unauthorized = client.get("/api/dashboard")
        assert unauthorized.status_code == 401
        authorized = client.get("/api/dashboard", headers=_guest_headers())
        assert authorized.status_code == 200
    finally:
        monkeypatch.delenv("RESCUE_MEAL_AUTH_REQUIRED", raising=False)
        monkeypatch.delenv("RESCUE_MEAL_AUTH_SECRET", raising=False)


def test_account_register_login_and_workspace_recovery() -> None:
    email = f"account-{uuid4().hex}@example.com"
    password = "correct-horse-battery"
    registered = client.post("/api/auth/register", json={"email": email, "password": password})
    assert registered.status_code == 201
    registration = registered.json()
    assert registration["mode"] == "account"
    assert registration["email"] == email
    account_headers = {"Authorization": f"Bearer {registration['access_token']}"}
    assert client.get("/api/dashboard", headers=account_headers).json()["food_count"] == 0

    created = client.post(
        "/api/foods",
        headers=account_headers,
        json={"canonical_name": "account-only-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201

    logged_in = client.post("/api/auth/login", json={"email": email, "password": password})
    assert logged_in.status_code == 200
    login_headers = {"Authorization": f"Bearer {logged_in.json()['access_token']}"}
    assert client.get("/api/dashboard", headers=login_headers).json()["food_count"] == 1
    me = client.get("/api/auth/me", headers=login_headers)
    assert me.status_code == 200
    assert me.json()["mode"] == "account"
    assert me.json()["email"] == email


def test_account_login_rejects_wrong_password_and_duplicate_email() -> None:
    email = f"duplicate-{uuid4().hex}@example.com"
    first = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert first.status_code == 201
    duplicate = client.post("/api/auth/register", json={"email": email, "password": "another-password"})
    assert duplicate.status_code == 409
    wrong_password = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert wrong_password.status_code == 401


def test_logout_revokes_a_token_before_any_workspace_request() -> None:
    headers = _guest_headers()
    assert client.get("/api/dashboard", headers=headers).status_code == 200
    logout = client.post("/api/auth/logout", headers=headers)
    assert logout.status_code == 204
    assert client.get("/api/dashboard", headers=headers).status_code == 401


def test_product_resolver_returns_local_candidate_and_does_not_invent_external_data() -> None:
    local = client.get("/api/products/resolve/8801114167523")
    assert local.status_code == 200
    assert local.json()["status"] == "matched"
    assert local.json()["candidates"][0]["canonical_name"] == "국산콩 두부"

    unknown = client.get("/api/products/resolve/4900000000000")
    assert unknown.status_code == 200
    assert unknown.json()["status"] == "provider_unavailable"
    assert unknown.json()["candidates"] == []


def test_receipt_draft_does_not_create_stock_until_commit() -> None:
    request = {
        "source_filename": "receipt-sample.jpg",
        "purchased_at": datetime(2026, 9, 1, 13, 20, tzinfo=timezone.utc).isoformat(),
        "lines": [
            {"raw_name": "국산콩 두부", "quantity": 1, "unit": "모", "total_price": 2490, "line_type": "product", "canonical_name": "국산콩 두부", "match_confidence": 0.91},
            {"raw_name": "맛타리버섯", "quantity": 2, "unit": "팩", "total_price": 3980, "line_type": "product", "canonical_name": "맛타리버섯", "match_confidence": 0.63},
            {"raw_name": "특매할인", "quantity": 1, "unit": "식", "total_price": -500, "line_type": "discount", "match_confidence": 1},
        ],
    }
    draft_response = client.post("/api/receipts/drafts", json=request)
    assert draft_response.status_code == 201
    draft = draft_response.json()
    assert draft["status"] == "review_required"
    assert draft["stock_created"] is False
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7
    assert draft["lines"][1]["review_status"] == "pending"
    assert draft["lines"][2]["review_reason"] is not None

    commit_response = client.post(
        f"/api/receipts/{draft['id']}/commit",
        json={"confirmed_line_ids": ["line-1", "line-2"], "overrides": {"line-2": {"canonical_name": "맛타리버섯"}}},
    )
    assert commit_response.status_code == 200
    commit = commit_response.json()
    assert commit["status"] == "committed"
    assert len(commit["created_lot_ids"]) == 2
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7


def test_trusted_label_date_survives_receipt_merge_and_storage_event() -> None:
    request = {
        "source_filename": "receipt-spinach.jpg",
        "lines": [{"raw_name": "국내산 시금치", "quantity": 2, "unit": "팩", "line_type": "product", "canonical_name": "시금치", "match_confidence": 0.96}],
    }
    draft = client.post("/api/receipts/drafts", json=request).json()
    commit_response = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert commit_response.status_code == 200
    spinach = next(item for item in commit_response.json()["inventory"] if item["display_name"] == "시금치")
    assert spinach["quantity"] == 2
    assert spinach["date_assertion"]["kind"] == "use_by"
    assert spinach["date_assertion"]["value"] == "2026-09-02"

    event = client.post(
        "/api/foods/spinach-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "frozen", "quantity": 2},
    )
    assert event.status_code == 200
    updated = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "spinach-1")
    assert updated["storage_type"] == "frozen"
    assert updated["date_assertion"]["value"] == "2026-09-02"


def test_storage_change_recalculates_only_estimated_window() -> None:
    before = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "tofu-1")
    before_end = before["estimated_use_first_window"]["end_date"]
    assert before["date_assertion"]["value"] is None

    moved = client.post(
        "/api/foods/tofu-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "frozen"},
    )
    assert moved.status_code == 200
    after_move = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "tofu-1")
    assert after_move["estimated_use_first_window"]["end_date"] > before_end
    assert after_move["date_assertion"]["value"] is None

    opened = client.post("/api/foods/tofu-1/storage-events", json={"event_type": "opened"})
    assert opened.status_code == 200
    after_open = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "tofu-1")
    assert after_open["estimated_use_first_window"]["end_date"] < after_move["estimated_use_first_window"]["end_date"]
    assert after_open["date_assertion"]["value"] is None


def test_partial_storage_move_creates_child_lot_and_keeps_date_assertion() -> None:
    response = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 1},
    )
    assert response.status_code == 200
    event = response.json()
    assert event["quantity"] == 1
    assert event["from_storage_type"] == "frozen"
    assert event["to_storage_type"] == "refrigerated"
    assert event["created_child_food_id"]

    inventory = client.get("/api/dashboard").json()["inventory"]
    source = next(item for item in inventory if item["id"] == "chicken-1")
    child = next(item for item in inventory if item["id"] == event["created_child_food_id"])
    assert len(inventory) == 8
    assert source["quantity"] == 1
    assert source["storage_type"] == "frozen"
    assert child["quantity"] == 1
    assert child["storage_type"] == "refrigerated"
    assert child["parent_lot_id"] == "chicken-1"
    assert child["date_assertion"]["value"] == "2026-09-06"


def test_storage_event_history_returns_events_for_a_lot() -> None:
    created = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 1},
    )
    assert created.status_code == 200

    history = client.get("/api/foods/chicken-1/storage-events")
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["id"] == created.json()["id"]
    assert history.json()[0]["created_child_food_id"] == created.json()["created_child_food_id"]


def test_partial_consume_decrements_lot_and_full_consume_removes_it() -> None:
    partial = client.post("/api/foods/chicken-1/storage-events", json={"event_type": "consumed", "quantity": 1})
    assert partial.status_code == 200
    remaining = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "chicken-1")
    assert remaining["quantity"] == 1

    full = client.post("/api/foods/chicken-1/storage-events", json={"event_type": "consumed"})
    assert full.status_code == 200
    assert all(item["id"] != "chicken-1" for item in client.get("/api/dashboard").json()["inventory"])


def test_partial_discard_decrements_lot_and_records_discard_event() -> None:
    response = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "discarded", "quantity": 1},
    )
    assert response.status_code == 200
    event = response.json()
    assert event["event_type"] == "discarded"
    assert event["quantity"] == 1
    assert event["from_storage_type"] == "frozen"
    assert event["to_storage_type"] is None

    inventory = client.get("/api/dashboard").json()["inventory"]
    chicken = next(item for item in inventory if item["id"] == "chicken-1")
    assert chicken["quantity"] == 1


def test_storage_event_rejects_quantity_larger_than_current_lot() -> None:
    response = client.post("/api/foods/chicken-1/storage-events", json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 3})

    assert response.status_code == 422


def test_receipt_commit_rolls_back_after_failure_and_can_retry() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "commit-retry.jpg",
            "lines": [
                {"raw_name": "첫 번째 새 상품", "quantity": 1, "unit": "개", "line_type": "product", "canonical_name": "첫 번째 새 상품", "match_confidence": 0.95},
                {"raw_name": "두 번째 새 상품", "quantity": 1, "unit": "개", "line_type": "product", "canonical_name": "두 번째 새 상품", "match_confidence": 0.95},
            ],
        },
    )
    assert draft_response.status_code == 201
    receipt_id = draft_response.json()["id"]
    original_upsert = store.upsert_from_receipt
    calls = 0

    def fail_on_second_upsert(*, line, purchased_at, override):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("simulated-grocy-timeout")
        return original_upsert(line=line, purchased_at=purchased_at, override=override)

    store.upsert_from_receipt = fail_on_second_upsert  # type: ignore[method-assign]
    try:
        failed = client.post(
            f"/api/receipts/{receipt_id}/commit",
            json={"confirmed_line_ids": ["line-1", "line-2"]},
        )
    finally:
        store.upsert_from_receipt = original_upsert  # type: ignore[method-assign]

    assert failed.status_code == 503
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7
    assert any(transaction.status == "needs_reconciliation" for transaction in store.commit_transactions.values())
    reconciliation_rows = client.get("/api/commit-transactions").json()
    assert any(row["status"] == "needs_reconciliation" for row in reconciliation_rows)

    retried = client.post(
        f"/api/receipts/{receipt_id}/commit",
        json={"confirmed_line_ids": ["line-1", "line-2"]},
    )
    assert retried.status_code == 200
    assert retried.json()["commit_transaction_id"]
    assert len(retried.json()["inventory"]) == 9

    duplicate = client.post(
        f"/api/receipts/{receipt_id}/commit",
        json={"confirmed_line_ids": ["line-1", "line-2"]},
    )
    assert duplicate.status_code == 409


def test_consumed_event_removes_item_and_meal_plan_is_deterministic() -> None:
    event = client.post("/api/foods/tofu-1/storage-events", json={"event_type": "consumed"})
    assert event.status_code == 200
    assert all(item["id"] != "tofu-1" for item in client.get("/api/dashboard").json()["inventory"])

    plan = client.post("/api/meal-plans", json={"inventory_ids": ["spinach-1", "chicken-1"]})
    assert plan.status_code == 200
    payload = plan.json()
    assert payload["minutes"] == 15
    assert payload["inventory_ids"] == ["spinach-1", "chicken-1"]
    assert payload["recipe_id"] == "spinach-tofu-chicken-bowl"
    assert payload["matched_ratio"] == 0.667
    assert payload["missing_ingredients"] == ["국산콩 두부"]
    assert payload["planner_version"] == "recipe-planner-v2"
    assert payload["safety_note"]


def test_meal_plan_preview_is_side_effect_free_and_saved_plan_is_recoverable() -> None:
    preview = client.post("/api/meal-plans/preview", json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"]})
    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["saved_at"] is None
    assert len(preview_payload["snapshot_hash"]) == 64
    assert client.get("/api/meal-plans/latest").json() is None

    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
            "plan_id": "meal-client-retry-1",
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )
    assert saved.status_code == 200
    saved_payload = saved.json()
    assert saved_payload["saved_at"] is not None
    retried = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
            "plan_id": "meal-client-retry-1",
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )
    assert retried.status_code == 200
    assert retried.json()["id"] == saved_payload["id"]
    assert retried.json()["saved_at"] == saved_payload["saved_at"]
    latest = client.get("/api/meal-plans/latest")
    assert latest.status_code == 200
    assert latest.json()["id"] == saved_payload["id"]
    assert latest.json()["recipe_id"] == "spinach-tofu-chicken-bowl"
    events = client.get(f"/api/meal-plans/{saved_payload['id']}/events")
    assert events.status_code == 200
    assert len(events.json()) == 1
    assert events.json()[0]["event_type"] == "saved"
    assert events.json()[0]["snapshot_hash"] == preview_payload["snapshot_hash"]

    conflict = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
            "plan_id": "meal-client-retry-1",
            "snapshot_hash": "f" * 64,
        },
    )
    assert conflict.status_code == 409


def test_saved_meal_plan_completion_consumes_matched_lots_once() -> None:
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-complete-1"},
    )
    assert saved.status_code == 200

    completed = client.post("/api/meal-plans/meal-complete-1/complete", json={})
    assert completed.status_code == 200
    completion = completed.json()
    assert completion["status"] == "completed"
    assert set(completion["consumed_food_ids"]) == {"spinach-1", "tofu-1", "chicken-1"}
    assert completion["skipped_ingredients"] == []
    assert completion["completed_at"]
    assert completion["consumed_allocations"]

    inventory = client.get("/api/dashboard").json()["inventory"]
    assert all(item["id"] not in {"spinach-1", "tofu-1"} for item in inventory)
    chicken = next(item for item in inventory if item["id"] == "chicken-1")
    assert chicken["quantity"] == 1
    consumed_events = [event for event in store.storage_events if event.event_type == "consumed"]
    assert len(consumed_events) == 3
    assert all(event.meal_plan_id == "meal-complete-1" for event in consumed_events)
    plan_events = client.get("/api/meal-plans/meal-complete-1/events")
    assert [event["event_type"] for event in plan_events.json()] == ["saved", "completed"]
    assert plan_events.json()[-1]["consumed_allocations"] == completion["consumed_allocations"]

    retried = client.post("/api/meal-plans/meal-complete-1/complete", json={})
    assert retried.status_code == 200
    assert retried.json()["status"] == "already_completed"
    assert len([event for event in store.storage_events if event.event_type == "consumed"]) == 3
    assert client.get("/api/meal-plans/latest").json()["completed_at"] == completion["completed_at"]


def test_meal_plan_completion_uses_user_adjusted_quantities() -> None:
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-complete-adjusted-1"},
    )
    assert saved.status_code == 200

    completed = client.post(
        "/api/meal-plans/meal-complete-adjusted-1/complete",
        json={
            "consumptions": [
                {"food_id": "spinach-1", "quantity": 1},
                {"food_id": "tofu-1", "quantity": 1},
                {"food_id": "chicken-1", "quantity": 0.5},
            ]
        },
    )
    assert completed.status_code == 200
    payload = completed.json()
    assert payload["skipped_ingredients"] == []
    assert payload["consumed_allocations"][-1] == {"food_id": "chicken-1", "quantity": 0.5, "unit": "팩"}
    chicken = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "chicken-1")
    assert chicken["quantity"] == 1.5


def test_meal_plan_completion_rejects_consumption_above_planned_allocation() -> None:
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-complete-overage-1"},
    )
    assert saved.status_code == 200

    overage = client.post(
        "/api/meal-plans/meal-complete-overage-1/complete",
        json={"consumptions": [{"food_id": "chicken-1", "quantity": 1.1}]},
    )
    assert overage.status_code == 422
    assert client.get("/api/dashboard").json()["food_count"] == 7


def test_meal_plan_completion_reports_lots_that_changed_after_save() -> None:
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-complete-partial-1"},
    )
    assert saved.status_code == 200
    store.foods["tofu-1"].response.quantity = 0.5

    completed = client.post("/api/meal-plans/meal-complete-partial-1/complete", json={})
    assert completed.status_code == 200
    payload = completed.json()
    assert payload["status"] == "completed"
    assert set(payload["consumed_food_ids"]) == {"spinach-1", "chicken-1"}
    assert payload["skipped_ingredients"][0]["canonical_name"] == "국산콩 두부"
    assert all(event.meal_plan_id == "meal-complete-partial-1" for event in store.storage_events if event.event_type == "consumed")

    latest = client.get("/api/meal-plans/latest").json()
    assert latest["completed_skipped_ingredients"] == ["국산콩 두부"]
    assert next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "tofu-1")["quantity"] == 0.5


def test_meal_plan_completion_consumes_across_multiple_lots() -> None:
    moved = client.post(
        "/api/foods/spinach-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 0.5},
    )
    assert moved.status_code == 200
    child_id = moved.json()["created_child_food_id"]
    assert child_id

    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", child_id, "tofu-1", "chicken-1"],
            "plan_id": "meal-complete-multi-lot-1",
        },
    )
    assert saved.status_code == 200
    spinach_ingredient = next(item for item in saved.json()["ingredients"] if item["canonical_name"] == "시금치")
    assert [(item["food_id"], item["quantity"], item["unit"]) for item in spinach_ingredient["allocations"]] == [("spinach-1", 0.5, "팩"), (child_id, 0.5, "팩")]

    completed = client.post("/api/meal-plans/meal-complete-multi-lot-1/complete", json={})
    assert completed.status_code == 200
    assert set(completed.json()["consumed_food_ids"]) == {"spinach-1", child_id, "tofu-1", "chicken-1"}
    consumed_events = [event for event in store.storage_events if event.event_type == "consumed"]
    assert len(consumed_events) == 4
    assert sorted(event.quantity for event in consumed_events if event.food_id in {"spinach-1", child_id}) == [0.5, 0.5]


def test_manual_food_keeps_date_unknown_and_records_storage_choice() -> None:
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "파프리카",
            "quantity": 2,
            "unit": "개",
            "storage_type": "ambient",
            "category": "채소",
            "note": "상태를 확인한 뒤 먼저 먹기",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["display_name"] == "파프리카"
    assert payload["storage_type"] == "ambient"
    assert payload["date_assertion"]["kind"] == "unknown"
    assert payload["estimated_use_first_window"]["safety_disclaimer"]


def test_confirmed_label_date_updates_existing_food_without_duplicate() -> None:
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "시금치",
            "quantity": 1,
            "unit": "팩",
            "storage_type": "refrigerated",
            "category": "채소",
            "brand": "국내산 시금치",
            "image_path": "/assets/food/spinach.png",
            "date_kind": "use_by",
            "date_value": "2026-09-02",
            "date_source": "label_ocr",
            "date_source_detail": "포장지 표시",
            "user_confirmed": True,
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] == "spinach-1"
    assert payload["date_assertion"]["kind"] == "use_by"
    assert payload["date_assertion"]["value"] == "2026-09-02"
    assert payload["date_assertion"]["user_confirmed"] is True
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7


def test_user_can_confirm_estimated_date_and_previous_assertion_is_kept() -> None:
    response = client.patch(
        "/api/foods/tofu-1/date-assertion",
        json={"kind": "use_by", "date_value": "2026-09-12", "source_detail": "포장지에서 사용자 확인"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["date_assertion"]["kind"] == "use_by"
    assert payload["date_assertion"]["value"] == "2026-09-12"
    assert payload["date_assertion"]["source"] == "user_input"
    assert payload["date_assertion"]["user_confirmed"] is True
    assert payload["estimated_use_first_window"] is None
    assert payload["date_assertion_history"][0]["kind"] == "unknown"


def test_user_cannot_overwrite_a_printed_date_from_the_manual_correction_path() -> None:
    response = client.patch(
        "/api/foods/spinach-1/date-assertion",
        json={"kind": "use_by", "date_value": "2026-09-30"},
    )
    assert response.status_code == 409
    current = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "spinach-1")
    assert current["date_assertion"]["value"] == "2026-09-02"


def test_parse_text_endpoint_creates_review_draft_without_stock_side_effect() -> None:
    response = client.post(
        "/api/receipts/parse-text",
        json={
            "source_filename": "receipt-from-ocr.txt",
            "ocr_text": "영수증\n판매일: 2026-09-01\n상품명 수량 금액\n001 시금치 1팩\n2,980 1 2,980",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["kind"] == "grocery_receipt"
    assert payload["draft"]["stock_created"] is False
    assert payload["draft"]["lines"][0]["canonical_name"] == "시금치"
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7


def test_image_upload_is_explicit_when_optional_ocr_runtime_is_missing() -> None:
    asset = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "assets" / "food" / "spinach.png"
    response = client.post(
        "/api/receipts/intake",
        files={"file": ("spinach.png", asset.read_bytes(), "image/png")},
    )
    assert response.status_code == 200
    payload = response.json()
    if ocr_engine.available:
        assert payload["status"] in {"review_required", "failed"}
    else:
        assert payload["status"] == "needs_ocr_engine"
        assert payload["draft"] is None
