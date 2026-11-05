from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app, auth_rate_limiter, store


client = TestClient(app)


def setup_function() -> None:
    store.reset()
    auth_rate_limiter.reset()


def _guest_headers() -> dict[str, str]:
    response = client.post("/api/auth/guest")
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_food(headers: dict[str, str], name: str, quantity: float = 2) -> str:
    created = client.post(
        "/api/foods",
        headers=headers,
        json={"canonical_name": name, "quantity": quantity, "unit": "개", "storage_type": "refrigerated"},
    )
    assert created.status_code == 201
    return created.json()["id"]


def _storage_event(headers: dict[str, str], food_id: str, event_type: str, quantity: float | None = None) -> dict:
    body: dict[str, object] = {"event_type": event_type}
    if quantity is not None:
        body["quantity"] = quantity
    response = client.post(f"/api/foods/{food_id}/storage-events", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _summary(headers: dict[str, str] | None = None, **params: object) -> dict:
    response = client.get("/api/rescue-summary", headers=headers or {}, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_empty_workspace_reports_zero_with_default_window() -> None:
    before = datetime.now(timezone.utc)
    payload = _summary(_guest_headers())
    assert payload["window_days"] == 7
    assert payload["rescued_food_count"] == 0
    since = datetime.fromisoformat(payload["since"].replace("Z", "+00:00"))
    assert since.tzinfo is not None
    assert abs((before - timedelta(days=7)) - since) < timedelta(minutes=1)


def test_days_parameter_is_bounded() -> None:
    headers = _guest_headers()
    assert _summary(headers, days=1)["window_days"] == 1
    assert _summary(headers, days=31)["window_days"] == 31
    assert client.get("/api/rescue-summary", headers=headers, params={"days": 0}).status_code == 422
    assert client.get("/api/rescue-summary", headers=headers, params={"days": 32}).status_code == 422


def test_partial_and_full_consumption_count_distinct_foods_and_discards_never_count() -> None:
    headers = _guest_headers()
    eaten = _create_food(headers, "rescue-eaten")
    partly = _create_food(headers, "rescue-partly")
    tossed = _create_food(headers, "rescue-tossed")

    _storage_event(headers, eaten, "consumed", 1)
    _storage_event(headers, eaten, "consumed", 1)  # same food twice -> counted once
    _storage_event(headers, partly, "consumed", 0.5)  # partial consumption counts
    _storage_event(headers, tossed, "discarded")

    assert _summary(headers)["rescued_food_count"] == 2


def test_consumption_outside_window_is_not_counted() -> None:
    headers = _guest_headers()
    old_food = _create_food(headers, "rescue-old")
    recent_food = _create_food(headers, "rescue-recent")
    old_event = _storage_event(headers, old_food, "consumed", 1)
    _storage_event(headers, recent_food, "consumed", 1)

    # Age the first consumption past the 7-day window directly in the ledger.
    aged = False
    for workspace_store in list(store._stores.values()):
        for event in workspace_store.storage_events:
            if event.id == old_event["id"]:
                event.occurred_at = datetime.now(timezone.utc) - timedelta(days=8)
                aged = True
    assert aged

    assert _summary(headers)["rescued_food_count"] == 1
    assert _summary(headers, days=10)["rescued_food_count"] == 2


def test_meal_plan_completion_consumption_counts() -> None:
    baseline = _summary()["rescued_food_count"]
    saved = client.post("/api/meal-plans", json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "rescue-summary-plan"})
    assert saved.status_code == 200
    completed = client.post(
        "/api/meal-plans/rescue-summary-plan/complete",
        json={"consumptions": [{"food_id": "chicken-1", "quantity": 0.5}]},
    )
    assert completed.status_code == 200
    assert completed.json()["consumed_food_ids"] == ["chicken-1"]
    assert _summary()["rescued_food_count"] == baseline + 1


def test_other_workspace_consumption_is_not_visible() -> None:
    owner = _guest_headers()
    stranger = _guest_headers()
    food_id = _create_food(owner, "rescue-private")
    _storage_event(owner, food_id, "consumed", 1)

    assert _summary(owner)["rescued_food_count"] == 1
    assert _summary(stranger)["rescued_food_count"] == 0
