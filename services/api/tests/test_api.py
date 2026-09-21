from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import gc
from hashlib import sha256
from pathlib import Path
from threading import Event
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

import app.main as main_module
from app.main import (
    CommitTransactionRecord,
    ConcurrentWorkspaceWriteError,
    DateAssertion,
    MealPlanRequest,
    PostgresConnectionUnavailable,
    PostgresPoolUnavailable,
    ReceiptCommitRequest,
    SqliteStore,
    StorageLocationCreateRequest,
    WorkspaceExportAuditEvent,
    WORKSPACE_CONFLICT_HEADER,
    WORKSPACE_REVISION_REQUEST_HEADER,
    WORKSPACE_REVISION_RESPONSE_HEADER,
    app,
    auth_rate_limiter,
    auth_repository,
    build_cors_origins,
    ocr_engine,
    store,
)
from app.product_resolver import ProductCandidate, ProductNameLookupResult
from app.pipeline.ocr import OcrObservation, OcrRun
from app.planner import RecipeIngredient, RecipeSpec


client = TestClient(app)


def test_postgres_unavailable_errors_expose_safe_retry_contract() -> None:
    import asyncio

    connection_response = asyncio.run(
        main_module.postgres_connection_unavailable_handler(
            None,
            PostgresConnectionUnavailable("private connection detail"),
        )
    )
    pool_response = asyncio.run(
        main_module.postgres_pool_unavailable_handler(
            None,
            PostgresPoolUnavailable("private pool detail"),
        )
    )

    assert connection_response.status_code == 503
    assert connection_response.headers["retry-after"] == "1"
    assert connection_response.body.decode("utf-8") == (
        '{"code":"postgres_connection_unavailable","detail":"현재 저장소 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요.","retryable":true,"action":"retry_later"}'
    )
    assert pool_response.status_code == 503
    assert pool_response.headers["retry-after"] == "1"
    assert pool_response.body.decode("utf-8") == (
        '{"code":"postgres_pool_unavailable","detail":"현재 저장소 연결 풀이 준비되지 않았거나 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.","retryable":true,"action":"retry_later"}'
    )


def test_workspace_middleware_does_not_return_plain_storage_503(monkeypatch) -> None:
    def raise_pool(*_args, **_kwargs):
        raise PostgresPoolUnavailable("private pool detail")

    monkeypatch.setattr(main_module.WorkspaceStoreRouter, "acquire_workspace", raise_pool)
    pool_response = client.get("/health")

    assert pool_response.status_code == 503
    assert pool_response.json()["code"] == "postgres_pool_unavailable"
    assert pool_response.json()["retryable"] is True
    assert pool_response.json()["action"] == "retry_later"
    assert "private pool detail" not in pool_response.text

    def raise_storage(*_args, **_kwargs):
        raise RuntimeError("private workspace storage detail")

    monkeypatch.setattr(main_module.WorkspaceStoreRouter, "acquire_workspace", raise_storage)
    storage_response = client.get("/health")

    assert storage_response.status_code == 503
    assert storage_response.json()["code"] == "workspace_storage_unavailable"
    assert storage_response.json()["retryable"] is False
    assert storage_response.json()["action"] == "configure_storage"
    assert "private workspace storage detail" not in storage_response.text


def _guest_headers() -> dict[str, str]:
    response = client.post("/api/auth/guest")
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def setup_function() -> None:
    store.reset()
    auth_rate_limiter.reset()


def test_health_and_dashboard_expose_provenance() -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.headers.get("x-request-id")

    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert health.headers["permissions-policy"] == "camera=(self), microphone=(), geolocation=()"
    assert health.headers["x-permitted-cross-domain-policies"] == "none"
    assert health.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"

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


def test_custom_storage_location_crud_and_lot_assignment_keep_canonical_class() -> None:
    created = client.post(
        "/api/storage-locations",
        json={"name": "주방 김치냉장고", "storage_type": "refrigerated"},
    )
    assert created.status_code == 201
    location = created.json()
    assert location["name"] == "주방 김치냉장고"
    assert location["storage_type"] == "refrigerated"
    assert location["temperature_source"] == "not_measured"

    duplicate = client.post(
        "/api/storage-locations",
        json={"name": "  주방   김치냉장고 ", "storage_type": "refrigerated"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "storage_location_duplicate"

    food = client.post(
        "/api/foods",
        json={
            "canonical_name": "김치냉장고 보관 두부",
            "quantity": 1,
            "unit": "모",
            "storage_type": "ambient",
            "storage_location_id": location["id"],
        },
    )
    assert food.status_code == 201
    assert food.json()["storage_type"] == "refrigerated"
    assert food.json()["storage_location_id"] == location["id"]
    location_search = client.get("/api/inventory/search", params={"storage_location_id": location["id"]})
    assert location_search.status_code == 200
    assert location_search.json()["storage_location_id"] == location["id"]
    assert location_search.json()["total"] == 1
    assert location_search.json()["items"][0]["id"] == food.json()["id"]

    freezer = client.post(
        "/api/storage-locations",
        json={"name": "냉동 서랍", "storage_type": "frozen"},
    )
    assert freezer.status_code == 201
    freezer_id = freezer.json()["id"]
    moved = client.post(
        "/api/foods/chicken-1/storage-events",
        headers={"Idempotency-Key": "custom-storage-location-move-1"},
        json={"event_type": "moved", "to_storage_type": "frozen", "to_storage_location_id": freezer_id},
    )
    assert moved.status_code == 200
    assert moved.json()["to_storage_location_id"] == freezer_id
    assert moved.json()["from_storage_location_id"] is None
    chicken = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "chicken-1")
    assert chicken["storage_type"] == "frozen"
    assert chicken["storage_location_id"] == freezer_id

    renamed = client.patch(
        f"/api/storage-locations/{freezer_id}",
        json={"name": "냉동 서랍 1단"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "냉동 서랍 1단"
    assert next(item for item in client.get("/api/dashboard").json()["storage_locations"] if item["id"] == freezer_id)["name"] == "냉동 서랍 1단"

    in_use = client.delete(f"/api/storage-locations/{freezer_id}")
    assert in_use.status_code == 409
    assert in_use.json()["detail"]["code"] == "storage_location_in_use"

    moved_back = client.post(
        "/api/foods/chicken-1/storage-events",
        headers={"Idempotency-Key": "custom-storage-location-move-back-1"},
        json={"event_type": "moved", "to_storage_type": "frozen"},
    )
    assert moved_back.status_code == 200
    historical_delete = client.delete(f"/api/storage-locations/{freezer_id}")
    assert historical_delete.status_code == 409
    assert historical_delete.json()["detail"]["code"] == "storage_location_in_use"

    unused = client.post(
        "/api/storage-locations",
        json={"name": "삭제 가능한 위치", "storage_type": "ambient"},
    )
    assert unused.status_code == 201
    deleted = client.delete(f"/api/storage-locations/{unused.json()['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}

    mismatch = client.post(
        "/api/foods/chicken-1/storage-events",
        headers={"Idempotency-Key": "custom-storage-location-mismatch-1"},
        json={"event_type": "moved", "to_storage_type": "frozen", "to_storage_location_id": location["id"]},
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["detail"]["code"] == "storage_location_type_mismatch"

    locations = client.get("/api/storage-locations")
    assert locations.status_code == 200
    assert {item["id"] for item in locations.json()} >= {"ambient", "refrigerated", "frozen", location["id"]}


def test_custom_storage_location_flush_failure_restores_location_state() -> None:
    def fail_flush(_store) -> None:
        raise RuntimeError("simulated storage location persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post(
            "/api/storage-locations",
            json={"name": "저장 실패 위치", "storage_type": "ambient"},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "storage_location_persistence_unavailable"
    assert not any(location.name == "저장 실패 위치" for location in store.storage_locations.values())


def test_storage_location_revision_probe_is_payload_free_and_advances_after_mutation() -> None:
    initial = client.get("/api/storage-locations/revision")
    assert initial.status_code == 200
    assert set(initial.json()) == {"revision"}
    initial_revision = initial.json()["revision"]
    assert initial.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(initial_revision)

    created = client.post(
        "/api/storage-locations",
        json={"name": "revision probe 위치", "storage_type": "ambient"},
    )
    assert created.status_code == 201

    after = client.get("/api/storage-locations/revision")
    assert after.status_code == 200
    assert after.json()["revision"] > initial_revision
    assert after.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(after.json()["revision"])


def test_dashboard_revision_probe_is_payload_free_and_advances_after_mutation() -> None:
    initial = client.get("/api/dashboard/revision")
    assert initial.status_code == 200
    assert set(initial.json()) == {"revision"}
    initial_revision = initial.json()["revision"]
    assert initial.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(initial_revision)

    created = client.post(
        "/api/foods",
        json={"canonical_name": "dashboard revision 식품", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201

    after = client.get("/api/dashboard/revision")
    assert after.status_code == 200
    assert after.json()["revision"] > initial_revision
    assert after.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(after.json()["revision"])


def test_shopping_list_revision_probe_is_payload_free_and_advances_after_mutation() -> None:
    initial = client.get("/api/shopping-list/revision")
    assert initial.status_code == 200
    assert set(initial.json()) == {"revision"}
    initial_revision = initial.json()["revision"]
    assert initial.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(initial_revision)

    added = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "shopping revision 식품", "quantity": 1, "unit": "개"},
    )
    assert added.status_code == 200

    after = client.get("/api/shopping-list/revision")
    assert after.status_code == 200
    assert after.json()["revision"] > initial_revision
    assert after.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(after.json()["revision"])


def test_receipt_revision_probe_is_payload_free_and_advances_after_draft() -> None:
    initial = client.get("/api/receipts/revision")
    assert initial.status_code == 200
    assert set(initial.json()) == {"revision"}
    initial_revision = initial.json()["revision"]
    assert initial.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(initial_revision)

    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-revision-probe.txt",
            "lines": [{"raw_name": "revision 식품", "quantity": 1, "unit": "개", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert draft.status_code == 201

    after = client.get("/api/receipts/revision")
    assert after.status_code == 200
    assert after.json()["revision"] > initial_revision
    assert after.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(after.json()["revision"])


def test_sqlite_custom_storage_location_survives_reconstruction(tmp_path) -> None:
    database_path = tmp_path / "storage-location.db"
    first = SqliteStore(str(database_path), seed=False)
    initial_revision = first.workspace_revision
    created = first.create_storage_location(
        StorageLocationCreateRequest(name="베란다 선반", storage_type="ambient")
    )
    assert first.workspace_revision > initial_revision
    saved_revision = first.workspace_revision
    first.close()

    reopened = SqliteStore(str(database_path), seed=False)
    try:
        assert reopened.workspace_revision == saved_revision
        loaded = reopened.get_storage_location(created.id)
        assert loaded is not None
        assert loaded.name == "베란다 선반"
        assert loaded.storage_type == "ambient"
    finally:
        reopened.close()


def test_receipt_commit_persists_custom_storage_location_override() -> None:
    location_response = client.post(
        "/api/storage-locations",
        json={"name": "김치냉장고", "storage_type": "refrigerated"},
    )
    assert location_response.status_code == 201
    location_id = location_response.json()["id"]

    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-custom-storage.jpg",
            "purchased_at": "2026-09-10T09:00:00+00:00",
            "lines": [{
                "raw_name": "김치냉장고 두부",
                "quantity": 1,
                "unit": "모",
                "total_price": 2980,
                "line_type": "product",
                "canonical_name": "김치냉장고 두부",
                "match_confidence": 0.95,
            }],
        },
    )
    assert draft_response.status_code == 201
    draft = draft_response.json()
    line_id = draft["lines"][0]["id"]

    commit_response = client.post(
        f"/api/receipts/{draft['id']}/commit",
        json={
            "confirmed_line_ids": [line_id],
            "overrides": {
                line_id: {
                    "canonical_name": "김치냉장고 두부",
                    "quantity": 1,
                    "unit": "모",
                    "storage_type": "refrigerated",
                    "storage_location_id": location_id,
                },
            },
        },
    )
    assert commit_response.status_code == 200
    created_lot_id = commit_response.json()["created_lot_ids"][0]
    lot = next(item for item in commit_response.json()["inventory"] if item["id"] == created_lot_id)
    assert lot["storage_type"] == "refrigerated"
    assert lot["storage_location_id"] == location_id


def test_shopping_receive_persists_custom_storage_location_and_replays() -> None:
    location_response = client.post(
        "/api/storage-locations",
        json={"name": "베란다 냉장고", "storage_type": "refrigerated"},
    )
    assert location_response.status_code == 201
    location_id = location_response.json()["id"]

    added = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "커스텀 위치 우유", "quantity": 2, "unit": "개"},
    )
    assert added.status_code == 200
    item = next(item for item in added.json()["items"] if item["canonical_name"] == "커스텀 위치 우유")
    headers = {"Idempotency-Key": "shopping-custom-storage-location-1"}
    request = {"quantity": 2, "storage_type": "refrigerated", "storage_location_id": location_id}

    received = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers=headers,
        json=request,
    )
    assert received.status_code == 201
    payload = received.json()
    assert payload["inventory_lot"]["storage_type"] == "refrigerated"
    assert payload["inventory_lot"]["storage_location_id"] == location_id

    replay = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers=headers,
        json=request,
    )
    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json()["inventory_lot"]["id"] == payload["inventory_lot"]["id"]


def test_priority_inference_endpoint_uses_reviewed_rules_by_default(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_INFERENCE_PROVIDER", raising=False)

    response = client.post(
        "/api/inference/priority",
        json={
            "product_name": "국산콩 두부",
            "storage_type": "refrigerated",
            "reference_date": "2026-09-01",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "rule-assisted-backend-inference"
    assert payload["estimated_use_first_window"]["start_date"] == "2026-09-03"
    assert payload["requires_confirmation"] is True
    assert "safe_to_eat" not in payload


def test_priority_inference_endpoint_abstains_when_optional_ollama_is_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_INFERENCE_PROVIDER", "ollama")
    monkeypatch.setenv("RESCUE_MEAL_OLLAMA_BASE_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("RESCUE_MEAL_OLLAMA_TIMEOUT_SECONDS", "1")

    response = client.post(
        "/api/inference/priority",
        json={
            "product_name": "정체불명 수제 소스",
            "storage_type": "refrigerated",
            "reference_date": "2026-09-01",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "ollama-structured-output"
    assert payload["abstained"] is True
    assert payload["estimated_use_first_window"] is None
    assert payload["requires_confirmation"] is True


def test_inventory_search_filters_workspace_inventory_and_returns_page_metadata() -> None:
    first_page = client.get("/api/inventory/search", params={"q": "채소", "limit": 1, "offset": 0})

    assert first_page.status_code == 200
    first_payload = first_page.json()
    assert first_payload["query"] == "채소"
    assert first_payload["total"] >= 2
    assert first_payload["offset"] == 0
    assert first_payload["limit"] == 1
    assert len(first_payload["items"]) == 1
    assert first_payload["has_more"] is True

    second_page = client.get("/api/inventory/search", params={"q": "채소", "limit": 1, "offset": 1})
    assert second_page.status_code == 200
    second_payload = second_page.json()
    assert second_payload["offset"] == 1
    assert second_payload["items"][0]["id"] != first_payload["items"][0]["id"]

    wrong_storage = client.get("/api/inventory/search", params={"q": "두부", "storage_type": "ambient"})
    assert wrong_storage.status_code == 200
    assert wrong_storage.json()["total"] == 0
    assert wrong_storage.json()["items"] == []


def test_workspace_export_contains_user_records_without_secrets_or_raw_receipt_fields() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "private-export-receipt.jpg",
            "purchased_at": "2026-09-02T09:00:00+00:00",
            "lines": [{"raw_name": "대파", "quantity": 1, "unit": "단", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert draft_response.status_code == 201

    exported = client.get("/api/account/export")

    assert exported.status_code == 200
    payload = exported.json()
    assert payload["schema_version"] == "rescue-meal-export-v1"
    assert payload["workspace_id"] == "demo"
    assert len(payload["inventory"]) == 7
    assert len(payload["receipt_summaries"]) == 1
    assert payload["notification_preferences"]["lead_days"] == 2
    assert payload["multi_day_meal_plans"] == []
    assert payload["shopping_list"] == []
    assert payload["shopping_receive_operations"] == []
    assert payload["manual_food_operations"] == []
    assert payload["meal_preferences"]["avoid_allergens"] == []
    assert payload["push_subscriptions"] == []
    assert "password_hash" not in exported.text
    assert "access_token" not in exported.text
    assert "source_filename" not in exported.text
    assert "private-export-receipt.jpg" not in exported.text
    assert "raw_name" not in exported.text


def test_workspace_export_rate_limit_returns_typed_retry_without_echoing_identity(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_EXPORT_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RESCUE_MEAL_EXPORT_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("RESCUE_MEAL_EXPORT_RATE_LIMIT_WINDOW_SECONDS", "60")

    first = client.get("/api/account/export", headers={"X-Request-ID": "export-first"})
    blocked = client.get("/api/account/export", headers={"X-Request-ID": "export-blocked"})

    assert first.status_code == 200
    assert blocked.status_code == 429
    detail = blocked.json()["detail"]
    assert detail["code"] == "account_export_rate_limited"
    assert detail["retryable"] is True
    assert detail["action"] == "retry_later"
    assert blocked.headers["retry-after"] == "60"
    assert blocked.headers["x-ratelimit-limit"] == "1"
    assert blocked.headers["x-ratelimit-remaining"] == "0"
    assert "demo" not in blocked.text
    assert "export-first" not in blocked.text


def test_workspace_export_records_server_side_actor_and_time_audit() -> None:
    exported = client.get("/api/account/export", headers={"X-Request-ID": "export-audit-request"})

    assert exported.status_code == 200
    events = store.list_export_audit_events()
    assert len(events) == 1
    event = events[0]
    assert event.actor_id == "guest"
    assert event.actor_role == "guest"
    assert event.request_id == "export-audit-request"
    assert event.schema_version == "rescue-meal-export-v1"
    assert event.exported_at.isoformat().replace("+00:00", "Z") == exported.json()["exported_at"].replace("+00:00", "Z")
    assert "export_audit_events" not in exported.text


def test_workspace_export_does_not_return_snapshot_when_audit_persistence_fails(monkeypatch) -> None:
    def fail(_event: WorkspaceExportAuditEvent) -> None:
        raise RuntimeError("private export audit failure")

    monkeypatch.setattr(store, "record_export_audit_event", fail)

    response = client.get("/api/account/export")

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "account_export_audit_persistence_unavailable"
    assert detail["retryable"] is True
    assert detail["action"] == "retry_later"
    assert "private export audit failure" not in response.text
    assert "inventory" not in response.text


def test_readiness_and_request_id_contract() -> None:
    ready = client.get("/ready", headers={"X-Request-ID": "readiness-probe-1"})
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
    assert ready.json()["storage"] == "in-memory-mvp"
    assert ready.json()["database"] == "not_applicable"
    assert ready.json()["auth_required"] is False
    assert ready.json()["auth_configured"] is False
    assert ready.json()["rate_limit_enabled"] is False
    assert ready.headers["x-request-id"] == "readiness-probe-1"

    generated = client.get("/ready", headers={"X-Request-ID": "invalid request id"})
    assert generated.status_code == 200
    assert generated.headers["x-request-id"].startswith("rm-")


def test_readiness_rejects_missing_required_auth_secret(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_REQUIRED", "true")
    monkeypatch.delenv("RESCUE_MEAL_AUTH_SECRET", raising=False)

    response = client.get("/ready", headers={"X-Request-ID": "missing-auth-secret"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth_configuration_missing"
    assert response.json()["detail"]["retryable"] is False
    assert response.json()["detail"]["action"] == "configure_server"
    assert response.headers["x-request-id"] == "missing-auth-secret"


def test_readiness_storage_failure_exposes_safe_retry_contract(tmp_path, monkeypatch) -> None:
    failing_store = SqliteStore(str(tmp_path / "readiness-failure.db"), seed=False)
    failing_store._connection.close()
    monkeypatch.setattr(store, "_base_store", failing_store)

    with pytest.raises(HTTPException) as caught:
        main_module.readiness()

    assert caught.value.status_code == 503
    assert caught.value.headers == {"Retry-After": "1"}
    assert caught.value.detail == {
        "code": "readiness_storage_unavailable",
        "detail": "저장소 readiness 확인에 실패했습니다. 잠시 후 다시 확인해 주세요.",
        "retryable": True,
        "action": "retry_later",
    }


def test_worker_token_configuration_failures_are_typed(monkeypatch) -> None:
    cases = (
        (main_module._require_grocy_worker_token, "grocy_worker_configuration_missing", "x-rescue-meal-grocy-worker-token"),
        (main_module._require_notification_worker_token, "notification_worker_configuration_missing", "x-rescue-meal-notification-worker-token"),
        (main_module._require_product_enrichment_worker_token, "product_enrichment_worker_configuration_missing", "x-rescue-meal-product-enrichment-worker-token"),
        (main_module._require_observability_token, "observability_configuration_missing", "authorization"),
    )

    for function, code, _header in cases:
        for env_name in (
            "RESCUE_MEAL_GROCY_WORKER_TOKEN",
            "RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN",
            "RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN",
            "RESCUE_MEAL_OBSERVABILITY_TOKEN",
        ):
            monkeypatch.delenv(env_name, raising=False)
        with pytest.raises(HTTPException) as caught:
            function(None)
        assert caught.value.status_code == 503
        assert caught.value.detail["code"] == code
        assert caught.value.detail["retryable"] is False
        assert caught.value.detail["action"] == "configure_server"


def test_disabled_grocy_outbox_configuration_is_typed(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "grocy_client", None)

    with pytest.raises(HTTPException) as caught:
        main_module._process_grocy_outbox_unleased(
            1,
            worker_id="test-worker",
            lease_key="test-lease",
            lease_seconds=60,
        )

    assert caught.value.status_code == 503
    assert caught.value.detail == {
        "code": "grocy_integration_not_configured",
        "detail": "Grocy integration이 비활성화되어 있습니다. 서버 설정을 확인해 주세요.",
        "retryable": False,
        "action": "configure_integration",
    }


def test_guest_workspace_provisioning_failure_is_typed(monkeypatch) -> None:
    def fail_provision(_router, _workspace_id, *, seed=True):
        del seed
        raise RuntimeError("private provisioning detail")

    monkeypatch.setattr(main_module.WorkspaceStoreRouter, "provision_workspace", fail_provision)
    response = client.post("/api/auth/guest")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "workspace_provisioning_unavailable"
    assert response.json()["detail"]["retryable"] is True
    assert response.json()["detail"]["action"] == "retry_later"
    assert "private provisioning detail" not in response.text


def test_account_session_auth_configuration_failure_is_typed(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_REQUIRED", "true")
    monkeypatch.delenv("RESCUE_MEAL_AUTH_SECRET", raising=False)
    account = main_module.AccountRecord(
        id="account-configuration-test",
        email="account-config@example.test",
        password_hash="not-used",
        workspace_id="workspace-configuration-test",
        created_at=datetime.now(timezone.utc),
    )

    with pytest.raises(HTTPException) as caught:
        main_module._account_session(account)

    assert caught.value.status_code == 503
    assert caught.value.detail["code"] == "auth_configuration_missing"
    assert caught.value.detail["retryable"] is False
    assert caught.value.detail["action"] == "configure_server"



def test_runtime_metrics_requires_bearer_token_and_omits_query_values(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_OBSERVABILITY_TOKEN", "observability-secret-0123456789-abcdef")
    metrics_path = "/api/internal/metrics"
    token_headers = {"Authorization": "Bearer observability-secret-0123456789-abcdef"}

    missing = client.get(metrics_path)
    wrong = client.get(metrics_path, headers={"Authorization": "Bearer wrong-token"})
    probe = client.get("/health", params={"secret": "query-value-must-not-be-a-label"})
    scrape = client.get(metrics_path, headers=token_headers)

    assert missing.status_code == 401
    assert wrong.status_code == 403
    assert probe.status_code == 200
    assert scrape.status_code == 200
    assert "rescue_meal_http_requests_total" in scrape.text
    assert 'route="/health"' in scrape.text
    assert "rescue_meal_http_request_duration_seconds_bucket" in scrape.text
    assert "query-value-must-not-be-a-label" not in scrape.text
    assert "observability-secret-0123456789-abcdef" not in scrape.text
    assert "rescue_meal_product_" in scrape.text or "rescue_meal_notification_" in scrape.text


def test_auth_required_rejection_still_returns_request_id(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_REQUIRED", "true")

    response = client.get("/api/dashboard", headers={"X-Request-ID": "auth-probe-1"})

    assert response.status_code == 401
    assert response.headers["x-request-id"] == "auth-probe-1"


def test_cors_headers_survive_invalid_token_short_circuit() -> None:
    response = client.get(
        "/api/dashboard",
        headers={
            "Origin": "http://127.0.0.1:4173",
            "Authorization": "Bearer ra1.expired-account.expired-workspace.user.1.invalid",
        },
    )

    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_origin_defaults_are_open_only_in_optional_local_mode() -> None:
    optional = build_cors_origins(auth_required_mode=False, configured="")
    secure = build_cors_origins(auth_required_mode=True, configured="")
    explicit = build_cors_origins(auth_required_mode=True, configured="https://meal.example.com/, https://meal.example.com")

    assert "http://127.0.0.1:4173" in optional
    assert "http://127.0.0.1:4173" not in secure
    assert explicit == ["https://meal.example.com"]


def test_grocy_status_is_disabled_without_external_configuration() -> None:
    response = client.get("/api/integrations/grocy/status")
    assert response.status_code == 200
    assert response.json()["configured"] is False
    assert response.json()["status"] == "disabled"


def test_cookrcp_status_is_safe_and_does_not_call_external_service(monkeypatch) -> None:
    monkeypatch.delenv("FOODSAFETY_COOKRCP_API_KEY", raising=False)
    disabled = client.get("/api/integrations/recipes/cookrcp/status")
    assert disabled.status_code == 200
    assert disabled.json()["configured"] is False
    assert disabled.json()["status"] == "disabled"
    assert "API key" not in disabled.json()["detail"]

    monkeypatch.setenv("FOODSAFETY_COOKRCP_API_KEY", "test-only-key")
    ready = client.get("/api/integrations/recipes/cookrcp/status")
    assert ready.status_code == 200
    payload = ready.json()
    assert payload["configured"] is True
    assert payload["status"] == "ready"
    assert payload["service_id"] == "COOKRCP01"
    assert "test-only-key" not in ready.text


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
    assert client.get("/api/inventory/search", headers=guest_one, params={"q": "workspace-one-food"}).json()["total"] == 1
    assert client.get("/api/inventory/search", headers=guest_two, params={"q": "workspace-one-food"}).json()["total"] == 0
    assert client.get("/api/inventory/search", params={"q": "workspace-one-food"}).json()["total"] == 0


def test_account_can_explicitly_transfer_guest_workspace_once_without_deleting_source() -> None:
    guest_session = client.post("/api/auth/guest")
    assert guest_session.status_code == 200
    guest_token = guest_session.json()["access_token"]
    guest_headers = {"Authorization": f"Bearer {guest_token}"}
    created = client.post(
        "/api/foods",
        headers=guest_headers,
        json={
            "canonical_name": "guest-transfer-food",
            "quantity": 1,
            "unit": "개",
            "storage_type": "ambient",
            "product_provenance": {
                "source": "open_food_facts",
                "source_url": "https://world.openfoodfacts.org/product/8801045426204",
                "confidence": 0.62,
                "note": "guest candidate",
                "storage_hint": "ambient",
                "source_freshness": "current",
            },
        },
    )
    assert created.status_code == 201
    guest_preferences = client.put(
        "/api/notification-preferences",
        headers=guest_headers,
        json={"in_app_enabled": True, "push_enabled": False, "lead_days": 5, "quiet_hours_start": None, "quiet_hours_end": None},
    )
    assert guest_preferences.status_code == 200
    guest_meal_preferences = client.put(
        "/api/meal-preferences",
        headers=guest_headers,
        json={"avoid_allergens": ["egg", "soy", "soy"]},
    )
    assert guest_meal_preferences.status_code == 200
    assert guest_meal_preferences.json()["avoid_allergens"] == ["soy", "egg"]

    guest_only = client.post(
        "/api/account/guest-transfer/preview",
        headers=guest_headers,
        json={"guest_access_token": guest_token},
    )
    assert guest_only.status_code == 403

    email = f"guest-transfer-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    account_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    preview = client.post(
        "/api/account/guest-transfer/preview",
        headers=account_headers,
        json={"guest_access_token": guest_token},
    )
    assert preview.status_code == 200
    assert preview.json()["status"] == "ready"
    assert preview.json()["food_count"] == 8
    assert preview.json()["shopping_list_count"] == 0
    assert preview.json()["shopping_receive_operation_count"] == 0
    assert preview.json()["meal_preferences_changed"] is True
    assert preview.json()["notification_preferences_changed"] is True

    transferred = client.post(
        "/api/account/guest-transfer",
        headers=account_headers,
        json={"guest_access_token": guest_token, "confirm": True},
    )
    assert transferred.status_code == 200
    assert transferred.json()["status"] == "completed"
    assert transferred.json()["imported_food_count"] == 8
    assert transferred.json()["imported_shopping_list_count"] == 0
    assert transferred.json()["imported_shopping_receive_operation_count"] == 0
    assert transferred.json()["imported_meal_preferences"] is True
    assert transferred.json()["imported_notification_preferences"] is True
    assert client.get("/api/dashboard", headers=account_headers).json()["food_count"] == 8
    assert client.get("/api/dashboard", headers=guest_headers).json()["food_count"] == 8
    transferred_food = next(item for item in client.get("/api/dashboard", headers=account_headers).json()["inventory"] if item["id"] == created.json()["id"])
    assert transferred_food["product_provenance"]["source"] == "open_food_facts"
    transferred_history = client.get(f"/api/foods/{created.json()['id']}/product-provenance/events", headers=account_headers)
    assert transferred_history.status_code == 200
    assert transferred_history.json()[0]["after"]["source"] == "open_food_facts"
    assert client.get("/api/notification-preferences", headers=account_headers).json()["lead_days"] == 5
    assert client.get("/api/meal-preferences", headers=account_headers).json()["avoid_allergens"] == ["soy", "egg"]

    replay = client.post(
        "/api/account/guest-transfer",
        headers=account_headers,
        json={"guest_access_token": guest_token, "confirm": True},
    )
    assert replay.status_code == 200
    assert replay.json()["status"] == "already_transferred"

    changed_source = client.post(
        f"/api/foods/{created.json()['id']}/storage-events",
        headers=guest_headers,
        json={"event_type": "opened"},
    )
    assert changed_source.status_code == 200
    stale_replay = client.post(
        "/api/account/guest-transfer",
        headers=account_headers,
        json={"guest_access_token": guest_token, "confirm": True},
    )
    assert stale_replay.status_code == 409


def test_guest_receive_idempotency_survives_guest_to_account_transfer() -> None:
    guest_session = client.post("/api/auth/guest")
    assert guest_session.status_code == 200
    guest_token = guest_session.json()["access_token"]
    guest_headers = {"Authorization": f"Bearer {guest_token}"}

    added = client.post(
        "/api/shopping-list/manual",
        headers=guest_headers,
        json={"canonical_name": "이전 멱등성 두부", "quantity": 1, "unit": "모"},
    )
    assert added.status_code == 200
    item = added.json()["items"][0]
    received = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={**guest_headers, "Idempotency-Key": "guest-transfer-receive-1"},
        json={"quantity": 1, "storage_type": "refrigerated"},
    )
    assert received.status_code == 201
    received_lot_id = received.json()["inventory_lot"]["id"]

    registered = client.post(
        "/api/auth/register",
        json={"email": f"guest-receive-transfer-{uuid4().hex}@example.com", "password": "correct-horse-battery"},
    )
    assert registered.status_code == 201
    account_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    preview = client.post(
        "/api/account/guest-transfer/preview",
        headers=account_headers,
        json={"guest_access_token": guest_token},
    )
    assert preview.status_code == 200
    assert preview.json()["shopping_receive_operation_count"] == 1
    transferred = client.post(
        "/api/account/guest-transfer",
        headers=account_headers,
        json={"guest_access_token": guest_token, "confirm": True},
    )
    assert transferred.status_code == 200
    assert transferred.json()["status"] == "completed"
    assert transferred.json()["imported_shopping_receive_operation_count"] == 1

    replay = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={**account_headers, "Idempotency-Key": "guest-transfer-receive-1"},
        json={"quantity": 1, "storage_type": "refrigerated"},
    )
    assert replay.status_code == 201
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["inventory_lot"]["id"] == received_lot_id

    consumed = client.post(
        f"/api/foods/{received_lot_id}/storage-events",
        headers={**account_headers, "Idempotency-Key": "guest-transfer-consume-1"},
        json={"event_type": "consumed", "quantity": 1},
    )
    assert consumed.status_code == 200
    replay_after_transfer = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={**account_headers, "Idempotency-Key": "guest-transfer-receive-1"},
        json={"quantity": 1, "storage_type": "refrigerated"},
    )
    assert replay_after_transfer.status_code == 409


def test_guest_transfer_does_not_overwrite_an_existing_account_workspace() -> None:
    guest_session = client.post("/api/auth/guest")
    assert guest_session.status_code == 200
    guest_token = guest_session.json()["access_token"]
    guest_headers = {"Authorization": f"Bearer {guest_token}"}
    created_guest_food = client.post(
        "/api/foods",
        headers=guest_headers,
        json={"canonical_name": "guest-source-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created_guest_food.status_code == 201

    registered = client.post("/api/auth/register", json={"email": f"guest-conflict-{uuid4().hex}@example.com", "password": "correct-horse-battery"})
    assert registered.status_code == 201
    account_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    created_account_food = client.post(
        "/api/foods",
        headers=account_headers,
        json={"canonical_name": "account-existing-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created_account_food.status_code == 201

    preview = client.post(
        "/api/account/guest-transfer/preview",
        headers=account_headers,
        json={"guest_access_token": guest_token},
    )
    assert preview.status_code == 200
    assert preview.json()["status"] == "conflict"

    transfer = client.post(
        "/api/account/guest-transfer",
        headers=account_headers,
        json={"guest_access_token": guest_token, "confirm": True},
    )
    assert transfer.status_code == 409
    assert client.get("/api/dashboard", headers=account_headers).json()["food_count"] == 1
    assert client.get("/api/dashboard", headers=guest_headers).json()["food_count"] == 8


def test_guest_transfer_flush_failure_restores_target_and_allows_retry() -> None:
    guest_session = client.post("/api/auth/guest")
    assert guest_session.status_code == 200
    guest_token = guest_session.json()["access_token"]
    guest_headers = {"Authorization": f"Bearer {guest_token}"}
    created = client.post(
        "/api/foods",
        headers=guest_headers,
        json={"canonical_name": "guest-transfer-flush-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201

    registered = client.post(
        "/api/auth/register",
        json={"email": f"guest-transfer-flush-{uuid4().hex}@example.com", "password": "correct-horse-battery"},
    )
    assert registered.status_code == 201
    account_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    target = main_module.store._workspace_store(registered.json()["workspace_id"], seed=False)
    before_fingerprint = main_module._guest_transfer_fingerprint(target)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated guest transfer persistence outage")

    with patch.object(type(target), "flush", fail_flush):
        failed = client.post(
            "/api/account/guest-transfer",
            headers=account_headers,
            json={"guest_access_token": guest_token, "confirm": True},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "guest_transfer_persistence_unavailable"
    assert main_module._guest_transfer_fingerprint(target) == before_fingerprint
    assert client.get("/api/dashboard", headers=account_headers).json()["food_count"] == 0

    retried = client.post(
        "/api/account/guest-transfer",
        headers=account_headers,
        json={"guest_access_token": guest_token, "confirm": True},
    )

    assert retried.status_code == 200
    assert retried.json()["status"] == "completed"
    assert retried.json()["imported_food_count"] == 8


def test_guest_transfer_rechecks_target_under_ordered_workspace_locks(monkeypatch) -> None:
    guest_session = client.post("/api/auth/guest")
    assert guest_session.status_code == 200
    guest_token = guest_session.json()["access_token"]
    guest_headers = {"Authorization": f"Bearer {guest_token}"}
    created = client.post(
        "/api/foods",
        headers=guest_headers,
        json={"canonical_name": "guest-transfer-race-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201

    registered = client.post(
        "/api/auth/register",
        json={"email": f"guest-transfer-race-{uuid4().hex}@example.com", "password": "correct-horse-battery"},
    )
    assert registered.status_code == 201
    account_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    state_entered = Event()
    release_state = Event()
    race_finished = Event()
    original_state = main_module._guest_transfer_state

    def delayed_state(source, target):
        result = original_state(source, target)
        state_entered.set()
        release_state.wait(timeout=5)
        return result

    monkeypatch.setattr(main_module, "_guest_transfer_state", delayed_state)

    def transfer():
        return client.post(
            "/api/account/guest-transfer",
            headers=account_headers,
            json={"guest_access_token": guest_token, "confirm": True},
        )

    def write_account_food():
        try:
            return client.post(
                "/api/foods",
                headers=account_headers,
                json={"canonical_name": "account-race-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
            )
        finally:
            race_finished.set()

    with ThreadPoolExecutor(max_workers=2) as executor:
        transfer_future = executor.submit(transfer)
        assert state_entered.wait(timeout=5)
        race_future = executor.submit(write_account_food)
        try:
            assert not race_finished.wait(timeout=0.2)
        finally:
            release_state.set()
        transferred = transfer_future.result(timeout=5)
        raced = race_future.result(timeout=5)

    assert transferred.status_code == 200
    assert raced.status_code == 201
    account_inventory = client.get("/api/dashboard", headers=account_headers).json()["inventory"]
    assert {item["canonical_name"] for item in account_inventory} >= {"account-race-food", "guest-transfer-race-food"}


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


def test_account_password_change_rotates_session_and_rejects_old_token() -> None:
    email = f"password-change-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    old_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    wrong_current = client.post(
        "/api/auth/password/change",
        headers=old_headers,
        json={"current_password": "wrong-password", "new_password": "new-correct-password"},
    )
    assert wrong_current.status_code == 401
    same_password = client.post(
        "/api/auth/password/change",
        headers=old_headers,
        json={"current_password": "correct-horse-battery", "new_password": "correct-horse-battery"},
    )
    assert same_password.status_code == 422

    changed = client.post(
        "/api/auth/password/change",
        headers=old_headers,
        json={"current_password": "correct-horse-battery", "new_password": "new-correct-password"},
    )
    assert changed.status_code == 200
    new_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/api/dashboard", headers=old_headers).status_code == 401
    assert client.get("/api/dashboard", headers=new_headers).status_code == 200
    assert client.post("/api/auth/login", json={"email": email, "password": "correct-horse-battery"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "new-correct-password"}).status_code == 200


def test_account_deletion_requires_password_and_confirmation_and_purges_workspace() -> None:
    email = f"account-delete-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    account_token = registered.json()["access_token"]
    workspace_id = registered.json()["workspace_id"]
    headers = {"Authorization": f"Bearer {account_token}"}
    created = client.post(
        "/api/foods",
        headers=headers,
        json={"canonical_name": "account-delete-food", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201
    preferences = client.put("/api/meal-preferences", headers=headers, json={"avoid_allergens": ["soy"]})
    assert preferences.status_code == 200
    assert client.get("/api/dashboard", headers=headers).json()["food_count"] == 1

    wrong_password = client.post(
        "/api/account/delete",
        headers=headers,
        json={"current_password": "wrong-password", "confirmation": "DELETE"},
    )
    assert wrong_password.status_code == 401
    assert client.get("/api/dashboard", headers=headers).status_code == 200

    wrong_confirmation = client.post(
        "/api/account/delete",
        headers=headers,
        json={"current_password": "correct-horse-battery", "confirmation": "delete"},
    )
    assert wrong_confirmation.status_code == 422
    assert client.get("/api/dashboard", headers=headers).status_code == 200

    deleted = client.post(
        "/api/account/delete",
        headers=headers,
        json={"current_password": "correct-horse-battery", "confirmation": "DELETE"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"
    assert email not in deleted.text
    assert client.get("/api/dashboard", headers=headers).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "correct-horse-battery"}).status_code == 401
    assert auth_repository.find_by_email(email) is None
    assert workspace_id not in store.workspace_ids


def test_account_deletion_failure_leaves_durable_fence_and_retryable_delete(monkeypatch) -> None:
    email = f"account-delete-retry-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    original_purge = main_module.WorkspaceStoreRouter.purge_workspace

    def fail_purge(*_args, **_kwargs):
        raise RuntimeError("simulated workspace purge outage")

    monkeypatch.setattr(main_module.WorkspaceStoreRouter, "purge_workspace", fail_purge)
    failed = client.post(
        "/api/account/delete",
        headers=headers,
        json={"current_password": "correct-horse-battery", "confirmation": "DELETE"},
    )

    assert failed.status_code == 503
    failure_detail = failed.json()["detail"]
    assert failure_detail["code"] == "account_deletion_persistence_unavailable"
    assert failure_detail["detail"] == "계정 삭제를 완료하지 못했습니다. 삭제 상태를 유지했어요. 같은 화면에서 다시 시도해 주세요."
    assert failure_detail["retryable"] is True
    assert failure_detail["action"] == "retry_later"
    assert "simulated workspace purge outage" not in failed.text
    assert auth_repository.find_by_email(email).status == "deleting"
    assert client.get("/api/dashboard", headers=headers).status_code == 423
    blocked_write = client.post(
        "/api/foods",
        headers=headers,
        json={"canonical_name": "blocked-during-delete", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert blocked_write.status_code == 423
    recovery = client.get("/api/auth/me", headers=headers)
    assert recovery.status_code == 200
    assert recovery.json()["account_status"] == "deleting"
    assert client.post("/api/auth/login", json={"email": email, "password": "correct-horse-battery"}).status_code == 401

    monkeypatch.setattr(main_module.WorkspaceStoreRouter, "purge_workspace", original_purge)
    retried = client.post(
        "/api/account/delete",
        headers=headers,
        json={"current_password": "correct-horse-battery", "confirmation": "DELETE"},
    )

    assert retried.status_code == 200
    assert auth_repository.find_by_email(email) is None


def test_account_deletion_rate_limit_returns_retry_after(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_WINDOW_SECONDS", "60")
    email = f"account-delete-rate-limit-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    payload = {"current_password": "wrong-password", "confirmation": "DELETE"}

    first = client.post("/api/account/delete", headers=headers, json=payload)
    blocked = client.post("/api/account/delete", headers=headers, json=payload)

    assert first.status_code == 401
    assert blocked.status_code == 429
    assert blocked.headers.get("retry-after")
    assert email not in blocked.text


def test_account_password_change_rate_limit_returns_retry_after(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_WINDOW_SECONDS", "60")
    email = f"password-change-rate-limit-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    first = client.post(
        "/api/auth/password/change",
        headers=headers,
        json={"current_password": "wrong-password", "new_password": "new-correct-password"},
    )
    blocked = client.post(
        "/api/auth/password/change",
        headers=headers,
        json={"current_password": "wrong-password", "new_password": "new-correct-password"},
    )

    assert first.status_code == 401
    assert blocked.status_code == 429
    assert blocked.headers.get("retry-after")
    assert blocked.headers.get("x-ratelimit-limit") == "1"
    assert email not in blocked.text


def test_password_reset_request_is_generic_and_complete_is_one_time(monkeypatch) -> None:
    monkeypatch.delenv("RESCUE_MEAL_EMAIL_PROVIDER_URL", raising=False)
    monkeypatch.delenv("RESCUE_MEAL_PASSWORD_RESET_BASE_URL", raising=False)
    email = f"password-reset-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201

    known = client.post("/api/auth/password-reset/request", json={"email": email})
    unknown = client.post("/api/auth/password-reset/request", json={"email": f"missing-{uuid4().hex}@example.com"})
    assert known.status_code == 200
    assert unknown.status_code == 200
    assert known.json() == unknown.json()
    assert "access_token" not in known.text
    assert "reset_token" not in known.text

    account = auth_repository.find_by_email(email)
    assert account is not None
    reset_token = auth_repository.create_password_reset_token(account.id, now=datetime.now(timezone.utc))
    assert reset_token is not None
    old_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    completed = client.post("/api/auth/password-reset/complete", json={"token": reset_token, "new_password": "reset-correct-password"})
    assert completed.status_code == 200
    new_headers = {"Authorization": f"Bearer {completed.json()['access_token']}"}
    assert client.get("/api/dashboard", headers=old_headers).status_code == 401
    assert client.get("/api/dashboard", headers=new_headers).status_code == 200
    assert client.post("/api/auth/password-reset/complete", json={"token": reset_token, "new_password": "another-password"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": email, "password": "correct-horse-battery"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "reset-correct-password"}).status_code == 200


def test_password_reset_request_delivers_only_to_configured_provider(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_EMAIL_PROVIDER_URL", "http://127.0.0.1:8120/send")
    monkeypatch.setenv("RESCUE_MEAL_PASSWORD_RESET_BASE_URL", "http://127.0.0.1:4173/reset?source=email")
    monkeypatch.setenv("RESCUE_MEAL_EMAIL_PROVIDER_TOKEN", "provider-secret")
    email = f"password-reset-delivery-{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert registered.status_code == 201
    calls: list[dict[str, object]] = []

    class FakeResponse:
        is_success = True

    def fake_post(url, *, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr(main_module.httpx, "post", fake_post)

    response = client.post("/api/auth/password-reset/request", json={"email": email})

    assert response.status_code == 200
    assert "rt1." not in response.text
    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "http://127.0.0.1:8120/send"
    headers = call["headers"]
    assert headers["Authorization"] == "Bearer provider-secret"
    assert headers["Accept"] == "application/json"
    assert headers["Idempotency-Key"].startswith("rescue-meal-password-reset-")
    assert call["timeout"] == 8.0
    payload = call["json"]
    assert isinstance(payload, dict)
    assert payload["to"] == email
    assert payload["template"] == "rescue-meal-password-reset"
    reset_url = str(payload["reset_url"])
    assert urlparse(reset_url).path == "/reset"
    assert parse_qs(urlparse(reset_url).query)["source"] == ["email"]
    assert parse_qs(urlparse(reset_url).query)["reset_token"][0].startswith("rt1.")


def test_auth_rate_limit_returns_retry_after_without_echoing_identity(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_MAX_REQUESTS", "2")
    monkeypatch.setenv("RESCUE_MEAL_AUTH_RATE_LIMIT_WINDOW_SECONDS", "60")
    email = f"rate-limit-{uuid4().hex}@example.com"

    first = client.post("/api/auth/password-reset/request", json={"email": email})
    second = client.post("/api/auth/password-reset/request", json={"email": email})
    blocked = client.post("/api/auth/password-reset/request", json={"email": email})

    assert first.status_code == 200
    assert second.status_code == 200
    assert blocked.status_code == 429
    assert blocked.headers.get("retry-after")
    assert blocked.headers.get("x-ratelimit-limit") == "2"
    assert email not in blocked.text


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


def test_receipt_parse_exposes_reviewed_name_match_source_and_candidates() -> None:
    response = client.post(
        "/api/receipts/parse-text",
        json={
            "source_filename": "receipt-alias.jpg",
            "ocr_text": "(주) 동네마트\n영수증\n상품명\n001 국내산 시금치 2,980 1 2,980",
        },
    )

    assert response.status_code == 201
    line = response.json()["draft"]["lines"][0]
    assert line["canonical_name"] == "시금치"
    assert line["match_source"] == "local_rule"
    assert response.json()["draft"]["template_id"] == "grocery-mart-v1"
    assert response.json()["draft"]["merchant_name"] == "동네마트"
    assert line["match_candidates"][0]["source"] == "local_rule"
    assert line["match_candidates"][0]["canonical_name"] == "시금치"


def test_receipt_parse_keeps_gtin_and_does_not_promote_store_code() -> None:
    response = client.post(
        "/api/receipts/parse-text",
        json={
            "source_filename": "receipt-barcode-rows.txt",
            "ocr_text": (
                "영수증\n상품명 단가 수량 금액\n"
                "001 국산콩 두부\n8801114167523\n2,980 1 2,980\n"
                "002 한돈등심\n204205\n5,490 1 5,490"
            ),
        },
    )

    assert response.status_code == 201
    products = response.json()["draft"]["lines"]
    assert products[0]["barcode"] == "08801114167523"
    assert products[1]["barcode"] is None


def test_receipt_commit_carries_gtin_to_inventory_lot() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-barcode-commit.txt",
            "purchased_at": "2026-09-03T09:00:00+00:00",
            "lines": [{
                "raw_name": "국산콩 두부",
                "barcode": "8801114167523",
                "quantity": 1,
                "unit": "모",
                "total_price": 2980,
                "line_type": "product",
                "canonical_name": "국산콩 두부",
                "match_confidence": 0.92,
                "match_source": "local_rule",
                "match_candidates": [{
                    "source": "local_rule",
                    "canonical_name": "국산콩 두부",
                    "confidence": 0.92,
                    "provenance_note": "검토된 영수증 상품명 규칙",
                }],
            }],
        },
    )
    assert draft.status_code == 201
    assert draft.json()["lines"][0]["barcode"] == "08801114167523"

    committed = client.post(
        f"/api/receipts/{draft.json()['id']}/commit",
        json={"confirmed_line_ids": ["line-1"]},
    )

    assert committed.status_code == 200
    lot = next(item for item in committed.json()["inventory"] if item["id"] in committed.json()["created_lot_ids"])
    assert lot["barcode"] == "08801114167523"
    assert lot["date_assertion"]["kind"] == "unknown"


def test_receipt_commit_uses_workspace_mutation_recovery_seam() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-workspace-mutation.jpg",
            "lines": [{
                "raw_name": "국산콩 두부",
                "quantity": 1,
                "unit": "모",
                "line_type": "product",
                "canonical_name": "국산콩 두부",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    with patch.object(main_module.workspace_mutation, "run", observed_run):
        committed = client.post(
            f"/api/receipts/{draft.json()['id']}/commit",
            json={"confirmed_line_ids": ["line-1"]},
        )

    assert committed.status_code == 200
    assert calls == 1


def test_receipt_commit_idempotency_replays_same_payload_without_duplicate_lot() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-commit-idempotency.jpg",
            "purchased_at": "2026-09-03T09:00:00+00:00",
            "lines": [{
                "raw_name": "국산콩 두부",
                "quantity": 1,
                "unit": "모",
                "line_type": "product",
                "canonical_name": "국산콩 두부",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    payload = {"confirmed_line_ids": ["line-1"], "overrides": {}}
    headers = {"Idempotency-Key": "receipt-commit-retry-1"}

    first = client.post(f"/api/receipts/{receipt_id}/commit", headers=headers, json=payload)
    replay = client.post(f"/api/receipts/{receipt_id}/commit", headers=headers, json=payload)
    conflicting = client.post(
        f"/api/receipts/{receipt_id}/commit",
        headers=headers,
        json={"confirmed_line_ids": ["line-1"], "overrides": {"line-1": {"canonical_name": "다른 상품"}}},
    )

    assert first.status_code == 200
    assert first.json()["idempotency_replayed"] is False
    assert replay.status_code == 200
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["commit_transaction_id"] == first.json()["commit_transaction_id"]
    assert replay.json()["created_lot_ids"] == first.json()["created_lot_ids"]
    assert conflicting.status_code == 409
    assert len([record for record in store.commit_transactions.values() if record.receipt_id == receipt_id]) == 1
    assert sum(1 for record in store.foods.values() if record.response.source_receipt_id == receipt_id) == 1


def test_receipt_draft_reuses_same_pending_fingerprint() -> None:
    payload = {
        "source_filename": "receipt-draft-replay.jpg",
        "purchased_at": "2026-09-03T09:00:00+00:00",
        "merchant_name": "동네마트",
        "lines": [{
            "raw_name": "국산콩 두부",
            "quantity": 1,
            "unit": "모",
            "line_type": "product",
            "canonical_name": "국산콩 두부",
            "match_confidence": 0.92,
        }],
    }

    first = client.post("/api/receipts/drafts", json=payload)
    replay = client.post("/api/receipts/drafts", json=payload)

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json()["id"] == first.json()["id"]
    assert len(store.receipts) == 1


def test_receipt_draft_fingerprint_does_not_merge_different_purchase_context() -> None:
    base_payload = {
        "source_filename": "image.jpg",
        "lines": [{
            "raw_name": "국산콩 두부",
            "quantity": 1,
            "unit": "모",
            "line_type": "product",
            "canonical_name": "국산콩 두부",
            "match_confidence": 0.92,
        }],
    }

    first = client.post(
        "/api/receipts/drafts",
        json={**base_payload, "purchased_at": "2026-09-03T09:00:00+00:00", "merchant_name": "동네마트"},
    )
    second = client.post(
        "/api/receipts/drafts",
        json={**base_payload, "purchased_at": "2026-09-04T09:00:00+00:00", "merchant_name": "동네마트"},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert second.headers.get("x-idempotency-replayed") is None
    assert len(store.receipts) == 2


def test_receipt_draft_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-workspace-mutation-draft.jpg",
            "lines": [{
                "raw_name": "검수 seam 식품",
                "quantity": 1,
                "unit": "개",
                "line_type": "product",
                "canonical_name": "검수 seam 식품",
                "match_confidence": 0.9,
            }],
        },
    )

    assert response.status_code == 201
    assert calls == 1


def test_receipt_draft_flush_failure_does_not_leave_a_phantom() -> None:
    def fail_flush(_store) -> None:
        raise RuntimeError("simulated draft persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post(
            "/api/receipts/drafts",
            json={
                "source_filename": "receipt-draft-failure.jpg",
                "lines": [{
                    "raw_name": "두부",
                    "quantity": 1,
                    "unit": "모",
                    "line_type": "product",
                    "canonical_name": "두부",
                    "match_confidence": 0.9,
                }],
            },
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "receipt_draft_persistence_unavailable"
    assert not store.receipts


def test_receipt_commit_idempotency_reuses_durable_pending_transaction_after_restart_boundary() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-commit-pending-retry.jpg",
            "lines": [{
                "raw_name": "두부",
                "quantity": 1,
                "unit": "모",
                "line_type": "product",
                "canonical_name": "두부",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    key = "receipt-commit-pending-retry-1"
    request = ReceiptCommitRequest(confirmed_line_ids=["line-1"])
    pending = CommitTransactionRecord(
        id="commit-pending-retry",
        receipt_id=receipt_id,
        fingerprint=draft.json()["fingerprint"],
        status="pending",
        idempotency_key_digest=main_module._receipt_commit_key_digest(key),
        request_payload_fingerprint=main_module._receipt_commit_payload_fingerprint(receipt_id, request),
    )
    store.commit_transactions[pending.id] = pending
    store.flush()

    retried = client.post(
        f"/api/receipts/{receipt_id}/commit",
        headers={"Idempotency-Key": key},
        json={"confirmed_line_ids": ["line-1"], "overrides": {}},
    )

    assert retried.status_code == 200
    assert retried.json()["idempotency_replayed"] is False
    assert retried.json()["commit_transaction_id"] == pending.id
    assert len(retried.json()["created_lot_ids"]) == 1
    assert sum(1 for record in store.foods.values() if record.response.source_receipt_id == receipt_id) == 1


def test_concurrent_receipt_commits_create_one_lot_and_reject_the_second_attempt(monkeypatch) -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-concurrent-commit.jpg",
            "purchased_at": "2026-09-03T09:00:00+00:00",
            "lines": [{
                "raw_name": "국산콩 두부",
                "quantity": 1,
                "unit": "모",
                "line_type": "product",
                "canonical_name": "국산콩 두부",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    entered_upsert = Event()
    release_upsert = Event()
    original_upsert = store.upsert_from_receipt

    def delayed_upsert(*args, **kwargs):
        entered_upsert.set()
        assert release_upsert.wait(timeout=5)
        return original_upsert(*args, **kwargs)

    monkeypatch.setattr(store, "upsert_from_receipt", delayed_upsert)
    commit_request = ReceiptCommitRequest(confirmed_line_ids=["line-1"])

    def run_commit():
        try:
            return ("committed", main_module.commit_receipt(receipt_id, commit_request))
        except HTTPException as exc:
            return ("error", exc.status_code)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(run_commit)
        assert entered_upsert.wait(timeout=5)
        second = executor.submit(run_commit)
        release_upsert.set()
        outcomes = [first.result(timeout=5), second.result(timeout=5)]

    assert sorted(outcome[0] for outcome in outcomes) == ["committed", "error"]
    assert next(outcome[1] for outcome in outcomes if outcome[0] == "error") == 409
    committed = next(outcome[1] for outcome in outcomes if outcome[0] == "committed")
    assert len(committed.created_lot_ids) == 1
    assert sum(1 for record in store.foods.values() if record.response.source_receipt_id == receipt_id) == 1
    assert store.receipts[receipt_id].committed is True


def test_receipt_commit_lock_registry_releases_completed_receipt_ids() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-lock-lifecycle.jpg",
            "lines": [{
                "raw_name": "국산콩 두부",
                "quantity": 1,
                "unit": "모",
                "line_type": "product",
                "canonical_name": "국산콩 두부",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]

    with store.receipt_commit_lock(receipt_id):
        assert receipt_id in store._receipt_commit_locks

    gc.collect()
    assert receipt_id not in store._receipt_commit_locks


def test_receipt_commit_persists_workspace_alias_for_future_ocr_drafts() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-confirmed-alias.jpg",
            "purchased_at": "2026-09-03T09:00:00+00:00",
            "lines": [{
                "raw_name": "서울우유1L",
                "quantity": 1,
                "unit": "개",
                "total_price": 2980,
                "line_type": "product",
                "canonical_name": "서울우유1L",
                "match_confidence": 0.58,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]

    committed = client.post(
        f"/api/receipts/{receipt_id}/commit",
        json={
            "confirmed_line_ids": ["line-1"],
            "overrides": {"line-1": {
                "canonical_name": "서울우유 나100% 1L",
                "quantity": 1,
                "unit": "개",
                "storage_type": "refrigerated",
                "match_source": "mfds_i1250",
                "match_candidates": [{
                    "source": "mfds_i1250",
                    "canonical_name": "서울우유 나100% 1L",
                    "source_url": "https://example.test/i1250",
                    "confidence": 0.78,
                    "provenance_note": "제품 기준 후보",
                }],
            }},
        },
    )
    assert committed.status_code == 200
    assert main_module.store.receipts[receipt_id].response.lines[0].match_source == "mfds_i1250"
    assert main_module.store.receipts[receipt_id].response.lines[0].match_candidates[0].canonical_name == "서울우유 나100% 1L"
    created_lot = next(item for item in committed.json()["inventory"] if item["id"] in committed.json()["created_lot_ids"])
    assert created_lot["product_provenance"]["source"] == "mfds_i1250"
    assert created_lot["product_provenance"]["confidence"] == 0.78
    assert created_lot["product_provenance"]["source_url"] == "https://example.test/i1250"
    assert created_lot["product_provenance"]["note"] == "제품 기준 후보"
    assert created_lot["date_assertion"]["kind"] == "unknown"
    events = client.get(f"/api/foods/{created_lot['id']}/product-provenance/events")
    assert events.status_code == 200
    assert events.json()[0]["action"] == "applied"
    assert events.json()[0]["after"]["source_url"] == "https://example.test/i1250"

    aliases = client.get("/api/product-aliases?q=서울우유")
    assert aliases.status_code == 200
    assert aliases.json()[0]["raw_name"] == "서울우유1L"
    assert aliases.json()[0]["canonical_name"] == "서울우유 나100% 1L"
    assert aliases.json()[0]["use_count"] == 1

    next_draft = client.post(
        "/api/receipts/parse-text",
        json={
            "source_filename": "receipt-alias-reuse.jpg",
            "ocr_text": "영수증\n상품명\n001 서울우유1L 2,980 1 2,980",
        },
    )
    assert next_draft.status_code == 201
    next_line = next_draft.json()["draft"]["lines"][0]
    assert next_line["canonical_name"] == "서울우유 나100% 1L"
    assert next_line["match_source"] == "user_confirmed_alias"


def test_receipt_manual_name_correction_does_not_inherit_stale_product_candidate() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-stale-candidate.jpg",
            "purchased_at": "2026-09-03T09:00:00+00:00",
            "lines": [{
                "raw_name": "축약 상품",
                "quantity": 1,
                "unit": "개",
                "total_price": 1000,
                "line_type": "product",
                "canonical_name": "제품 기준 상품",
                "match_confidence": 0.78,
                "match_source": "mfds_i1250",
                "match_candidates": [{
                    "source": "mfds_i1250",
                    "canonical_name": "제품 기준 상품",
                    "confidence": 0.78,
                    "provenance_note": "I1250 후보; 개별 라벨 확인 필요",
                }],
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]

    committed = client.post(
        f"/api/receipts/{receipt_id}/commit",
        json={
            "confirmed_line_ids": ["line-1"],
            "overrides": {
                "line-1": {
                    "canonical_name": "사용자 수정 상품",
                    "quantity": 1,
                    "unit": "개",
                    "storage_type": "ambient",
                    "match_source": "parser",
                }
            },
        },
    )

    assert committed.status_code == 200
    lot = next(item for item in committed.json()["inventory"] if item["id"] in committed.json()["created_lot_ids"])
    assert lot["canonical_name"] == "사용자 수정 상품"
    assert lot["product_provenance"] is None
    assert main_module.store.receipts[receipt_id].response.lines[0].match_candidates == []


def test_product_name_lookup_is_disabled_by_default_and_exposes_i1250_review_candidate(monkeypatch) -> None:
    disabled = client.get("/api/products/resolve-name/진간장")
    assert disabled.status_code == 200
    assert disabled.json()["status"] == "disabled"
    assert disabled.json()["candidates"] == []

    class FakeI1250:
        def __init__(self, **kwargs) -> None:
            assert set(kwargs) == {"cache", "rate_limiter", "metrics"}

        def lookup_by_product_name(self, product_name: str, *, limit: int = 5) -> ProductNameLookupResult:
            assert product_name == "진간장"
            assert limit == 5
            return ProductNameLookupResult(
                provider="mfds_i1250",
                status="matched",
                candidates=[ProductCandidate(
                    source="mfds_i1250",
                    source_url="https://example.test/i1250",
                    canonical_name="매일맛있는진간장",
                    brand="매일식품주식회사",
                    category="혼합간장",
                    quantity_text=None,
                    confidence=0.78,
                    provenance_note="제품 기준 후보",
                    shelf_life_text="실온보관 2년",
                    storage_hint="ambient",
                )],
            )

    monkeypatch.setenv("RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS", "true")
    monkeypatch.setattr(main_module, "MfdsI1250Resolver", FakeI1250)
    enabled = client.get("/api/products/resolve-name/진간장")

    assert enabled.status_code == 200
    assert enabled.json()["status"] == "matched"
    assert enabled.json()["candidates"][0]["source"] == "mfds_i1250"
    assert enabled.json()["candidates"][0]["shelf_life_text"] == "실온보관 2년"
    assert enabled.json()["candidates"][0]["storage_hint"] == "ambient"
    assert enabled.json()["requires_review"] is True


def test_product_name_lookup_falls_back_to_open_food_facts_after_i1250_miss(monkeypatch) -> None:
    class FakeI1250:
        def __init__(self, **kwargs) -> None:
            assert set(kwargs) == {"cache", "rate_limiter", "metrics"}

        def lookup_by_product_name(self, product_name: str, *, limit: int = 5) -> ProductNameLookupResult:
            assert product_name == "해외 시리얼"
            assert limit == 5
            return ProductNameLookupResult("mfds_i1250", "not_found", detail="I1250 후보 없음")

    class FakeOpenFoodFacts:
        def __init__(self, **kwargs) -> None:
            assert set(kwargs) == {"cache", "rate_limiter", "metrics"}

        def lookup_by_product_name(self, product_name: str, *, limit: int = 5) -> ProductNameLookupResult:
            assert product_name == "해외 시리얼"
            assert limit == 5
            return ProductNameLookupResult(
                "open_food_facts",
                "matched",
                [ProductCandidate(
                    source="open_food_facts",
                    source_url="https://world.openfoodfacts.org/product/8800000000003",
                    canonical_name="해외 시리얼 오리지널",
                    brand="공개 브랜드",
                    category="시리얼",
                    quantity_text="300 g",
                    confidence=0.66,
                    provenance_note="Open Food Facts 검색 후보; 실제 상품명·포장지 날짜 확인 필요",
                )],
            )

    monkeypatch.setenv("RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS", "true")
    monkeypatch.setattr(main_module, "MfdsI1250Resolver", FakeI1250)
    monkeypatch.setattr(main_module, "OpenFoodFactsResolver", FakeOpenFoodFacts)

    response = client.get("/api/products/resolve-name/해외 시리얼")

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "open_food_facts"
    assert payload["status"] == "matched"
    assert payload["candidates"][0]["source"] == "open_food_facts"
    assert payload["candidates"][0]["shelf_life_text"] is None
    assert payload["candidates"][0]["storage_hint"] is None
    assert "I1250 후보 없음" in payload["warnings"][0]
    assert payload["requires_review"] is True


def test_product_enrichment_enqueue_is_idempotent_and_worker_tick_is_token_protected(monkeypatch) -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-enrichment-api.jpg",
            "purchased_at": "2026-09-03T09:00:00+00:00",
            "lines": [{
                "raw_name": "진간장",
                "quantity": 1,
                "unit": "개",
                "line_type": "product",
                "canonical_name": "진간장",
                "match_confidence": 0.58,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    path = f"/api/receipts/{receipt_id}/product-enrichment"

    first = client.post(path)
    repeated = client.post(path)
    current = client.get(path)

    assert first.status_code == 202
    assert first.json()["status"] == "queued"
    assert repeated.status_code == 202
    assert repeated.json()["id"] == first.json()["id"]
    assert current.status_code == 200
    assert current.json()["line_ids"] == ["line-1"]

    monkeypatch.setenv("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN", "product-enrichment-secret")
    tick_path = "/api/internal/product-enrichment/workspaces/demo/tick"
    payload = {"worker_id": "product-enrichment-api-test", "lease_seconds": 120, "stale_after_seconds": 900, "process_limit": 1}
    missing = client.post(tick_path, json=payload)
    wrong = client.post(tick_path, headers={"X-Rescue-Meal-Product-Enrichment-Worker-Token": "wrong"}, json=payload)
    disabled = client.post(tick_path, headers={"X-Rescue-Meal-Product-Enrichment-Worker-Token": "product-enrichment-secret"}, json=payload)

    assert missing.status_code == 401
    assert wrong.status_code == 403
    assert disabled.status_code == 200
    assert disabled.json()["i1250_configured"] is False
    assert disabled.json()["queued"] == 1
    assert disabled.json()["processed"] == 0


def test_product_enrichment_enqueue_and_retry_use_workspace_mutation_recovery_seam(monkeypatch) -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-enrichment-seam.jpg",
            "lines": [{
                "raw_name": "진간장",
                "quantity": 1,
                "unit": "개",
                "line_type": "product",
                "canonical_name": "진간장",
                "match_confidence": 0.58,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    job_id = f"product-enrichment-{receipt_id}"

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    queued = client.post(f"/api/receipts/{receipt_id}/product-enrichment")
    assert queued.status_code == 202
    store.product_enrichment_jobs[job_id].status = "dead_letter"
    retried = client.post(f"/api/receipts/{receipt_id}/product-enrichment/retry")

    assert retried.status_code == 200
    assert retried.json()["status"] == "queued"
    assert calls == 2


def test_product_enrichment_enqueue_and_retry_flush_failure_restore_and_allow_retry() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-enrichment-recovery.jpg",
            "lines": [{
                "raw_name": "진간장",
                "quantity": 1,
                "unit": "개",
                "line_type": "product",
                "canonical_name": "진간장",
                "match_confidence": 0.58,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    job_id = f"product-enrichment-{receipt_id}"

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated product-enrichment persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed_enqueue = client.post(f"/api/receipts/{receipt_id}/product-enrichment")

    assert failed_enqueue.status_code == 503
    assert failed_enqueue.json()["detail"]["code"] == "product_enrichment_persistence_unavailable"
    assert job_id not in store.product_enrichment_jobs

    queued = client.post(f"/api/receipts/{receipt_id}/product-enrichment")
    assert queued.status_code == 202
    store.product_enrichment_jobs[job_id].status = "dead_letter"

    with patch.object(type(store), "flush", fail_flush):
        failed_retry = client.post(f"/api/receipts/{receipt_id}/product-enrichment/retry")

    assert failed_retry.status_code == 503
    assert failed_retry.json()["detail"]["code"] == "product_enrichment_persistence_unavailable"
    assert store.product_enrichment_jobs[job_id].status == "dead_letter"

    retried = client.post(f"/api/receipts/{receipt_id}/product-enrichment/retry")

    assert retried.status_code == 200
    assert retried.json()["status"] == "queued"


def test_product_runtime_status_is_token_protected_and_redacts_lookup_identity(monkeypatch) -> None:
    path = "/api/internal/product-runtime/status"
    monkeypatch.setenv("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN", "runtime-status-secret")

    missing = client.get(path)
    wrong = client.get(path, headers={"X-Rescue-Meal-Product-Enrichment-Worker-Token": "wrong"})
    current = client.get(path, headers={"X-Rescue-Meal-Product-Enrichment-Worker-Token": "runtime-status-secret"})

    assert missing.status_code == 401
    assert wrong.status_code == 403
    assert current.status_code == 200
    payload = current.json()
    assert payload["product_cache_backend"] == "process_local"
    assert payload["product_name_cache_backend"] == "process_local"
    assert payload["provider_rate_limiter_backend"] == "process_local"
    serialized = current.text
    assert "barcode" not in serialized
    assert "runtime-status-secret" not in serialized

    scrape = client.get("/api/internal/product-runtime/metrics", headers={"X-Rescue-Meal-Product-Enrichment-Worker-Token": "runtime-status-secret"})
    assert scrape.status_code == 200
    assert scrape.headers["content-type"].startswith("text/plain")
    assert "rescue_meal_product_provider_calls" in scrape.text
    assert "runtime-status-secret" not in scrape.text
    assert "4900000000000" not in scrape.text


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
        json={"confirmed_line_ids": ["line-1", "line-2"], "overrides": {"line-2": {"canonical_name": "맛타리버섯", "storage_type": "ambient"}}},
    )
    assert commit_response.status_code == 200
    commit = commit_response.json()
    assert commit["status"] == "committed"
    assert len(commit["created_lot_ids"]) == 2
    created_lot_ids = set(commit["created_lot_ids"])
    mushroom_lot = next(item for item in commit["inventory"] if item["id"] in created_lot_ids and item["canonical_name"] == "맛타리버섯")
    assert mushroom_lot["storage_type"] == "ambient"
    assert mushroom_lot["estimated_use_first_window"]["basis"].endswith("ambient 보관 기준")
    assert len(client.get("/api/dashboard").json()["inventory"]) == 9


def test_receipt_privacy_policy_deletes_uncommitted_draft_without_touching_inventory() -> None:
    policy = client.get("/api/privacy/receipt-policy")
    assert policy.status_code == 200
    assert policy.json()["raw_upload_retention"] == "transient"
    assert policy.json()["raw_upload_retention_days"] == 0

    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "private-receipt.jpg",
            "purchased_at": "2026-09-02T09:00:00+00:00",
            "lines": [{"raw_name": "대파", "quantity": 1, "unit": "단", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert draft_response.status_code == 201
    receipt_id = draft_response.json()["id"]
    assert len(client.get("/api/receipts").json()) == 1
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7

    missing_confirmation = client.post(f"/api/receipts/{receipt_id}/privacy-erase", json={"confirm": False})
    assert missing_confirmation.status_code == 422
    assert len(client.get("/api/receipts").json()) == 1

    erased = client.post(f"/api/receipts/{receipt_id}/privacy-erase", json={"confirm": True})
    assert erased.status_code == 200
    assert erased.json() == {
        "receipt_id": receipt_id,
        "status": "deleted_draft",
        "inventory_preserved": True,
        "raw_upload_retained": False,
        "redacted_fields": ["receipt_metadata"],
    }
    assert client.get("/api/receipts").json() == []
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7
    assert client.post(f"/api/receipts/{receipt_id}/commit", json={"confirmed_line_ids": ["line-1"]}).status_code == 404


def test_receipt_privacy_erase_redacts_committed_source_and_preserves_lot_provenance() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "committed-private-receipt.jpg",
            "purchased_at": "2026-09-01T13:20:00+00:00",
            "lines": [{"raw_name": "맛타리버섯", "quantity": 2, "unit": "팩", "line_type": "product", "canonical_name": "맛타리버섯", "match_confidence": 0.63}],
        },
    )
    assert draft_response.status_code == 201
    receipt_id = draft_response.json()["id"]
    committed = client.post(f"/api/receipts/{receipt_id}/commit", json={"confirmed_line_ids": ["line-1"], "overrides": {"line-1": {"storage_type": "refrigerated"}}})
    assert committed.status_code == 200
    lot_id = committed.json()["created_lot_ids"][0]

    erased = client.post(f"/api/receipts/{receipt_id}/privacy-erase", json={"confirm": True})
    assert erased.status_code == 200
    assert erased.json() == {
        "receipt_id": receipt_id,
        "status": "redacted_committed",
        "inventory_preserved": True,
        "raw_upload_retained": False,
        "redacted_fields": ["source_filename", "raw_name"],
    }
    summary = client.get("/api/receipts").json()
    assert summary == [{
        "id": receipt_id,
        "status": "committed",
        "purchased_at": "2026-09-01T13:20:00Z",
        "merchant_name": None,
        "stock_created": True,
        "line_count": 1,
        "source_redacted": True,
    }]
    lot = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == lot_id)
    assert lot["source_receipt_id"] == receipt_id
    assert lot["source_receipt_line_id"] == f"{receipt_id}:line-1"
    assert len(client.get("/api/dashboard").json()["inventory"]) == 8
    assert store.receipts[receipt_id].response.source_filename == "원본 영수증 정보 삭제됨"
    assert store.receipts[receipt_id].response.lines[0].raw_name == "삭제된 OCR 원문"
    assert client.post(f"/api/receipts/{receipt_id}/commit", json={"confirmed_line_ids": ["line-1"]}).status_code == 409


def test_receipt_privacy_erase_keeps_reconciliation_draft_reference_intact() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "reconciliation-private-receipt.jpg",
            "purchased_at": "2026-09-02T09:00:00+00:00",
            "lines": [{"raw_name": "대파", "quantity": 1, "unit": "단", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert draft_response.status_code == 201
    receipt_id = draft_response.json()["id"]
    store.commit_transactions["commit-reconciliation"] = CommitTransactionRecord(
        id="commit-reconciliation",
        receipt_id=receipt_id,
        fingerprint=draft_response.json()["fingerprint"],
        status="needs_reconciliation",
        error_code="upstream-timeout",
    )

    erased = client.post(f"/api/receipts/{receipt_id}/privacy-erase", json={"confirm": True})

    assert erased.status_code == 200
    assert erased.json()["status"] == "redacted_pending"
    assert erased.json()["inventory_preserved"] is True
    assert store.receipts[receipt_id].response.source_filename == "원본 영수증 정보 삭제됨"
    assert store.receipts[receipt_id].response.lines[0].raw_name == "삭제된 OCR 원문"
    assert client.get("/api/receipts").json()[0]["source_redacted"] is True
    assert client.get("/api/commit-transactions").json()[0]["receipt_id"] == receipt_id


def test_receipt_privacy_erase_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "privacy-seam-receipt.jpg",
            "lines": [{"raw_name": "대파", "quantity": 1, "unit": "단", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert draft_response.status_code == 201

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    erased = client.post(f"/api/receipts/{draft_response.json()['id']}/privacy-erase", json={"confirm": True})

    assert erased.status_code == 200
    assert erased.json()["status"] == "deleted_draft"
    assert calls == 1


def test_receipt_privacy_erase_flush_failure_restores_draft_and_redaction_state() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "privacy-recovery-draft.jpg",
            "lines": [{"raw_name": "대파", "quantity": 1, "unit": "단", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["id"]

    committed_draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "privacy-recovery-committed.jpg",
            "lines": [{
                "raw_name": "맛타리버섯",
                "quantity": 1,
                "unit": "팩",
                "line_type": "product",
                "canonical_name": "맛타리버섯",
                "match_confidence": 0.92,
            }],
        },
    )
    assert committed_draft.status_code == 201
    committed_id = committed_draft.json()["id"]
    committed_line_id = committed_draft.json()["lines"][0]["id"]
    committed = client.post(f"/api/receipts/{committed_id}/commit", json={"confirmed_line_ids": [committed_line_id]})
    assert committed.status_code == 200
    committed_lot_ids = committed.json()["created_lot_ids"]

    pending_draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "privacy-recovery-pending.jpg",
            "lines": [{"raw_name": "대파", "quantity": 1, "unit": "단", "line_type": "product", "match_confidence": 0.8}],
        },
    )
    assert pending_draft.status_code == 201
    pending_id = pending_draft.json()["id"]
    store.commit_transactions["commit-privacy-recovery-pending"] = CommitTransactionRecord(
        id="commit-privacy-recovery-pending",
        receipt_id=pending_id,
        fingerprint=pending_draft.json()["fingerprint"],
        status="needs_reconciliation",
        error_code="upstream-timeout",
    )

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated receipt privacy persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed_draft = client.post(f"/api/receipts/{draft_id}/privacy-erase", json={"confirm": True})
        failed_committed = client.post(f"/api/receipts/{committed_id}/privacy-erase", json={"confirm": True})
        failed_pending = client.post(f"/api/receipts/{pending_id}/privacy-erase", json={"confirm": True})

    assert failed_draft.status_code == 503
    assert failed_draft.json()["detail"]["code"] == "receipt_privacy_persistence_unavailable"
    assert failed_committed.status_code == 503
    assert failed_committed.json()["detail"]["code"] == "receipt_privacy_persistence_unavailable"
    assert failed_pending.status_code == 503
    assert failed_pending.json()["detail"]["code"] == "receipt_privacy_persistence_unavailable"
    assert draft_id in store.receipts
    assert store.receipts[draft_id].response.source_filename == "privacy-recovery-draft.jpg"
    assert store.receipts[committed_id].response.source_filename == "privacy-recovery-committed.jpg"
    assert store.receipts[committed_id].response.lines[0].raw_name == "맛타리버섯"
    assert store.receipts[pending_id].response.source_filename == "privacy-recovery-pending.jpg"
    assert store.receipts[pending_id].response.lines[0].raw_name == "대파"
    assert committed_lot_ids
    assert all(lot_id in store.foods for lot_id in committed_lot_ids)
    assert "commit-privacy-recovery-pending" in store.commit_transactions

    erased_draft = client.post(f"/api/receipts/{draft_id}/privacy-erase", json={"confirm": True})
    erased_committed = client.post(f"/api/receipts/{committed_id}/privacy-erase", json={"confirm": True})
    erased_pending = client.post(f"/api/receipts/{pending_id}/privacy-erase", json={"confirm": True})

    assert erased_draft.status_code == 200
    assert erased_draft.json()["status"] == "deleted_draft"
    assert erased_committed.status_code == 200
    assert erased_committed.json()["status"] == "redacted_committed"
    assert erased_pending.status_code == 200
    assert erased_pending.json()["status"] == "redacted_pending"
    assert committed_id in store.receipts
    assert store.receipts[committed_id].response.source_filename == "원본 영수증 정보 삭제됨"
    assert store.receipts[committed_id].response.lines[0].raw_name == "삭제된 OCR 원문"
    assert pending_id in store.receipts
    assert store.receipts[pending_id].response.source_filename == "원본 영수증 정보 삭제됨"
    assert store.receipts[pending_id].response.lines[0].raw_name == "삭제된 OCR 원문"


def test_receipt_commit_rejects_blank_user_canonical_name() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-invalid-correction.jpg",
            "purchased_at": "2026-09-02T09:00:00+00:00",
            "lines": [
                {
                    "raw_name": "맛타리버섯",
                    "quantity": 2,
                    "unit": "팩",
                    "total_price": 3980,
                    "line_type": "product",
                    "canonical_name": "맛타리버섯",
                    "match_confidence": 0.63,
                }
            ],
        },
    )
    assert draft_response.status_code == 201
    draft_id = draft_response.json()["id"]

    commit_response = client.post(
        f"/api/receipts/{draft_id}/commit",
        json={"confirmed_line_ids": ["line-1"], "overrides": {"line-1": {"canonical_name": "   "}}},
    )

    assert commit_response.status_code == 422
    assert commit_response.json()["detail"][0]["loc"][-1] == "canonical_name"


def test_receipt_draft_exposes_storage_suggestion_and_uses_it_for_estimate() -> None:
    draft_response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-frozen-chicken.jpg",
            "purchased_at": "2026-08-20T09:00:00+00:00",
            "lines": [
                {
                    "raw_name": "냉동 닭가슴살",
                    "quantity": 1,
                    "unit": "팩",
                    "total_price": 5900,
                    "line_type": "product",
                    "canonical_name": "냉동 닭가슴살",
                    "match_confidence": 0.99,
                }
            ],
        },
    )
    assert draft_response.status_code == 201
    draft = draft_response.json()
    assert draft["lines"][0]["storage_suggestion"] == "frozen"
    assert draft["lines"][0]["review_status"] == "confirmed"

    commit_response = client.post(
        f"/api/receipts/{draft['id']}/commit",
        json={"confirmed_line_ids": ["line-1"]},
    )

    assert commit_response.status_code == 200
    commit = commit_response.json()
    created_lot_ids = set(commit["created_lot_ids"])
    chicken_lot = next(item for item in commit["inventory"] if item["id"] in created_lot_ids)
    assert chicken_lot["storage_type"] == "frozen"
    assert chicken_lot["estimated_use_first_window"]["basis"].endswith("frozen 보관 기준")
    assert chicken_lot["estimated_use_first_window"]["start_date"] == "2026-09-03"

    moved = client.post(
        f"/api/foods/{chicken_lot['id']}/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated"},
    )
    assert moved.status_code == 200
    moved_chicken = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == chicken_lot["id"])
    assert moved_chicken["estimated_use_first_window"]["start_date"] == "2026-08-21"


def test_separate_receipts_create_distinct_lots_for_the_same_product() -> None:
    def commit_receipt(source_filename: str, quantity: int) -> tuple[str, dict]:
        draft_response = client.post(
            "/api/receipts/drafts",
            json={
                "source_filename": source_filename,
                "purchased_at": "2026-09-01T13:20:00+00:00",
                "lines": [
                    {
                        "raw_name": "양배추",
                        "quantity": quantity,
                        "unit": "통",
                        "total_price": 3000 * quantity,
                        "line_type": "product",
                        "canonical_name": "양배추",
                        "match_confidence": 0.99,
                    }
                ],
            },
        )
        assert draft_response.status_code == 201
        draft = draft_response.json()
        committed = client.post(
            f"/api/receipts/{draft['id']}/commit",
            json={"confirmed_line_ids": ["line-1"]},
        )
        assert committed.status_code == 200
        return draft["id"], committed.json()

    first_receipt_id, first_commit = commit_receipt("cabbage-receipt-a.jpg", 1)
    second_receipt_id, second_commit = commit_receipt("cabbage-receipt-b.jpg", 2)
    inventory = [item for item in client.get("/api/dashboard").json()["inventory"] if item["canonical_name"] == "양배추"]

    assert len(inventory) == 2
    assert len({item["id"] for item in inventory}) == 2
    assert sorted(item["quantity"] for item in inventory) == [1, 2]
    assert {item["source_receipt_id"] for item in inventory} == {first_receipt_id, second_receipt_id}
    assert {item["source_receipt_line_id"] for item in inventory} == {f"{first_receipt_id}:line-1", f"{second_receipt_id}:line-1"}
    assert first_commit["created_lot_ids"][0] != second_commit["created_lot_ids"][0]


def test_receipt_lot_keeps_its_own_date_and_storage_event() -> None:
    request = {
        "source_filename": "receipt-spinach.jpg",
        "lines": [{"raw_name": "국내산 시금치", "quantity": 2, "unit": "팩", "line_type": "product", "canonical_name": "시금치", "match_confidence": 0.96}],
    }
    draft = client.post("/api/receipts/drafts", json=request).json()
    commit_response = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert commit_response.status_code == 200
    spinach_lots = [item for item in commit_response.json()["inventory"] if item["display_name"] == "시금치"]
    assert len(spinach_lots) == 2
    new_lot = next(item for item in spinach_lots if item["id"] != "spinach-1")
    assert new_lot["quantity"] == 2
    assert new_lot["date_assertion"]["kind"] == "unknown"
    assert new_lot["source_receipt_line_id"] == f"{draft['id']}:line-1"

    event = client.post(
        f"/api/foods/{new_lot['id']}/storage-events",
        json={"event_type": "moved", "to_storage_type": "frozen", "quantity": 2},
    )
    assert event.status_code == 200
    updated = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == new_lot["id"])
    assert updated["storage_type"] == "frozen"
    assert updated["date_assertion"]["kind"] == "unknown"
    existing = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "spinach-1")
    assert existing["date_assertion"]["value"] == "2026-09-02"


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


def test_opened_event_persists_first_opened_at_and_reuses_it_for_inference() -> None:
    before = datetime.now(timezone.utc)
    first = client.post("/api/foods/tofu-1/storage-events", json={"event_type": "opened"})
    after = datetime.now(timezone.utc)

    assert first.status_code == 200
    first_payload = first.json()
    first_opened_at = datetime.fromisoformat(first_payload["occurred_at"])
    assert before <= first_opened_at <= after

    food = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "tofu-1")
    assert datetime.fromisoformat(food["opened_at"]) == first_opened_at
    assert "개봉일" in food["estimated_use_first_window"]["inference_trace"]["reasoning"][1]

    second = client.post("/api/foods/tofu-1/storage-events", json={"event_type": "opened"})
    assert second.status_code == 200
    retained = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "tofu-1")
    assert datetime.fromisoformat(retained["opened_at"]) == first_opened_at


def test_partial_open_keeps_parent_unopened_and_exposes_creation_event_on_child_history() -> None:
    response = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "opened", "quantity": 1},
    )

    assert response.status_code == 200
    event = response.json()
    child_id = event["created_child_food_id"]
    assert child_id
    opened_at = event["occurred_at"]

    inventory = client.get("/api/dashboard").json()["inventory"]
    source = next(item for item in inventory if item["id"] == "chicken-1")
    child = next(item for item in inventory if item["id"] == child_id)
    assert source["opened"] is False
    assert source["opened_at"] is None
    assert child["opened"] is True
    assert child["opened_at"] == opened_at

    history = client.get(f"/api/foods/{child_id}/storage-events")
    assert history.status_code == 200
    assert [item["id"] for item in history.json()] == [event["id"]]


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
    assert len(event["inventory"]) == 8
    assert any(item["id"] == event["created_child_food_id"] for item in event["inventory"])
    assert store.storage_events[-1].inventory == []

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


def test_storage_event_idempotency_replays_once_and_rejects_key_reuse_with_other_payload() -> None:
    headers = {"Idempotency-Key": "consume-chicken-retry-1"}
    payload = {"event_type": "consumed", "quantity": 0.5}

    first = client.post("/api/foods/chicken-1/storage-events", headers=headers, json=payload)
    replay = client.post("/api/foods/chicken-1/storage-events", headers=headers, json=payload)
    conflicting = client.post("/api/foods/chicken-1/storage-events", headers=headers, json={"event_type": "discarded", "quantity": 0.5})

    assert first.status_code == 200
    assert replay.status_code == 200
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json() == first.json()
    assert conflicting.status_code == 409
    assert len([event for event in store.storage_events if event.event_type == "consumed"]) == 1
    chicken = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "chicken-1")
    assert chicken["quantity"] == 1.5


def test_storage_event_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    response = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 0.5},
    )

    assert response.status_code == 200
    assert calls == 1


def test_storage_event_flush_failure_restores_the_previous_state_and_allows_retry() -> None:
    original = store.foods["chicken-1"].response.model_copy(deep=True)
    before_event_count = len(store.storage_events)
    flush_calls = 0

    def fail_flush(_store) -> None:
        nonlocal flush_calls
        flush_calls += 1
        raise RuntimeError("simulated storage-event persistence outage")

    headers = {"Idempotency-Key": "storage-event-final-flush-failure-1"}
    with patch.object(type(store), "flush", fail_flush):
        failed = client.post(
            "/api/foods/chicken-1/storage-events",
            headers=headers,
            json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 0.5},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "storage_event_persistence_unavailable"
    assert flush_calls == 1
    assert store.foods["chicken-1"].response == original
    assert len(store.storage_events) == before_event_count

    retried = client.post(
        "/api/foods/chicken-1/storage-events",
        headers=headers,
        json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 0.5},
    )
    replay = client.post(
        "/api/foods/chicken-1/storage-events",
        headers=headers,
        json={"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 0.5},
    )

    assert retried.status_code == 200
    assert replay.status_code == 200
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json() == retried.json()
    assert len(store.storage_events) == before_event_count + 1


def test_storage_event_sequence_uses_workspace_mutation_and_replays_atomically(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)
    headers = {"Idempotency-Key": "storage-event-sequence-1"}
    payload = {
        "events": [
            {"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 1},
            {"event_type": "opened"},
        ]
    }

    first = client.post("/api/foods/chicken-1/storage-event-sequence", headers=headers, json=payload)
    replay = client.post("/api/foods/chicken-1/storage-event-sequence", headers=headers, json=payload)
    conflict = client.post(
        "/api/foods/chicken-1/storage-event-sequence",
        headers=headers,
        json={"events": [{"event_type": "moved", "to_storage_type": "ambient", "quantity": 1}, {"event_type": "opened"}]},
    )

    assert first.status_code == 200
    first_payload = first.json()
    assert len(first_payload["events"]) == 2
    assert first_payload["events"][0]["event_type"] == "moved"
    assert first_payload["events"][0]["created_child_food_id"]
    assert first_payload["events"][1]["event_type"] == "opened"
    assert first_payload["events"][1]["food_id"] == first_payload["final_food_id"]
    assert first_payload["events"][1]["food_id"] == first_payload["events"][0]["created_child_food_id"]
    assert len(first_payload["events"][0]["inventory"]) == 8
    assert first_payload["events"][0]["inventory"] == first_payload["events"][1]["inventory"]
    assert first_payload["idempotency_replayed"] is False
    assert replay.status_code == 200
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["events"] == first_payload["events"]
    assert conflict.status_code == 409
    assert calls == 1
    assert len(store.storage_events) == 2
    assert all(event.inventory == [] for event in store.storage_events)
    source = store.foods["chicken-1"].response
    child = store.foods[first_payload["final_food_id"]].response
    assert source.quantity == 1
    assert source.opened is False
    assert child.quantity == 1
    assert child.opened is True


def test_storage_event_sequence_rejects_a_shorter_replay_payload() -> None:
    headers = {"Idempotency-Key": "storage-event-sequence-prefix-1"}
    complete_payload = {
        "events": [
            {"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 1},
            {"event_type": "opened"},
        ]
    }

    first = client.post(
        "/api/foods/chicken-1/storage-event-sequence",
        headers=headers,
        json=complete_payload,
    )
    prefix = client.post(
        "/api/foods/chicken-1/storage-event-sequence",
        headers=headers,
        json={"events": [complete_payload["events"][0]]},
    )

    assert first.status_code == 200
    assert prefix.status_code == 409
    assert "다른 보관 event sequence" in prefix.json()["detail"]
    assert len(store.storage_events) == 2


def test_storage_event_sequence_flush_failure_restores_the_whole_sequence_and_allows_retry() -> None:
    before_food_ids = set(store.foods)
    before_event_count = len(store.storage_events)
    headers = {"Idempotency-Key": "storage-event-sequence-failure-1"}
    payload = {
        "events": [
            {"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 1},
            {"event_type": "opened"},
        ]
    }

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated storage-event sequence persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post("/api/foods/chicken-1/storage-event-sequence", headers=headers, json=payload)

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "storage_event_sequence_persistence_unavailable"
    assert set(store.foods) == before_food_ids
    assert len(store.storage_events) == before_event_count
    assert not any(event.id.startswith("event-sequence-idem-") for event in store.storage_events)

    retried = client.post("/api/foods/chicken-1/storage-event-sequence", headers=headers, json=payload)

    assert retried.status_code == 200
    assert len(retried.json()["events"]) == 2
    assert set(store.foods) == before_food_ids | {retried.json()["final_food_id"]}


def test_storage_event_sequence_requires_idempotency_key() -> None:
    response = client.post(
        "/api/foods/chicken-1/storage-event-sequence",
        json={"events": [{"event_type": "opened"}]},
    )

    assert response.status_code == 400


def test_storage_event_concurrent_same_key_creates_one_event_and_replays_the_other() -> None:
    headers = {"Idempotency-Key": "storage-concurrent-retry-1"}
    payload = {"event_type": "consumed", "quantity": 0.5}

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(
            lambda _: client.post("/api/foods/chicken-1/storage-events", headers=headers, json=payload),
            range(2),
        ))

    assert [response.status_code for response in responses] == [200, 200]
    assert sum(response.headers.get("x-idempotency-replayed") == "true" for response in responses) == 1
    assert len([event for event in store.storage_events if event.id == main_module._idempotent_storage_event_id(headers["Idempotency-Key"])]) == 1
    chicken = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "chicken-1")
    assert chicken["quantity"] == 1.5


def test_storage_event_rejects_invalid_idempotency_key() -> None:
    response = client.post(
        "/api/foods/chicken-1/storage-events",
        headers={"Idempotency-Key": "contains whitespace"},
        json={"event_type": "consumed", "quantity": 0.5},
    )

    assert response.status_code == 400


def test_storage_revision_conflict_returns_409_without_stale_rollback(monkeypatch) -> None:
    def raise_conflict():
        raise ConcurrentWorkspaceWriteError(
            "workspace revision changed",
            expected_revision=4,
            current_revision=5,
        )

    monkeypatch.setattr(store._base_store, "flush", raise_conflict)

    response = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "consumed", "quantity": 0.5},
    )

    assert response.status_code == 409
    payload = response.json()
    assert payload["code"] == "workspace_revision_conflict"
    assert payload["retryable"] is True
    assert payload["action"] == "reload_and_retry"
    assert payload["expected_revision"] == 4
    assert payload["current_revision"] == 5
    assert "최신 목록" in payload["detail"]
    assert response.headers[WORKSPACE_CONFLICT_HEADER.lower()] == "workspace_revision"
    assert response.headers[WORKSPACE_REVISION_RESPONSE_HEADER.lower()] == "5"


def test_stale_client_workspace_revision_is_rejected_before_mutation(monkeypatch) -> None:
    monkeypatch.setattr(store._base_store, "workspace_revision", 17, raising=False)

    read = client.get("/api/dashboard")
    assert read.status_code == 200
    assert read.headers[WORKSPACE_REVISION_RESPONSE_HEADER.lower()] == "17"

    response = client.post(
        "/api/foods/chicken-1/storage-events",
        headers={WORKSPACE_REVISION_REQUEST_HEADER: "16"},
        json={"event_type": "consumed", "quantity": 0.5},
    )

    assert response.status_code == 409
    payload = response.json()
    assert payload["code"] == "workspace_revision_conflict"
    assert payload["expected_revision"] == 16
    assert payload["current_revision"] == 17
    assert response.headers[WORKSPACE_CONFLICT_HEADER.lower()] == "workspace_revision"
    assert response.headers[WORKSPACE_REVISION_RESPONSE_HEADER.lower()] == "17"
    assert not [event for event in store.storage_events if event.event_type == "consumed"]


def test_invalid_client_workspace_revision_is_rejected_before_acquiring_workspace() -> None:
    response = client.post(
        "/api/foods/chicken-1/storage-events",
        headers={WORKSPACE_REVISION_REQUEST_HEADER: "not-a-revision"},
        json={"event_type": "consumed", "quantity": 0.5},
    )

    assert response.status_code == 400
    assert WORKSPACE_REVISION_REQUEST_HEADER in response.json()["detail"]


def test_read_only_inference_does_not_require_workspace_revision(monkeypatch) -> None:
    monkeypatch.setattr(store._base_store, "workspace_revision", 17, raising=False)

    response = client.post(
        "/api/inference/priority",
        headers={WORKSPACE_REVISION_REQUEST_HEADER: "16"},
        json={
            "product_name": "국산콩 두부",
            "storage_type": "refrigerated",
            "reference_date": "2026-09-01",
        },
    )

    assert response.status_code == 200
    assert response.headers[WORKSPACE_REVISION_RESPONSE_HEADER.lower()] == "17"


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

    def fail_on_second_upsert(*, line, purchased_at, override, source_receipt_id=None):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("simulated-grocy-timeout")
        return original_upsert(line=line, purchased_at=purchased_at, override=override, source_receipt_id=source_receipt_id)

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
    receipt_transactions = [
        transaction for transaction in store.commit_transactions.values() if transaction.receipt_id == receipt_id
    ]
    assert len(receipt_transactions) == 2
    assert {transaction.status for transaction in receipt_transactions} == {"needs_reconciliation", "committed"}
    assert len({transaction.id for transaction in receipt_transactions}) == 2

    duplicate = client.post(
        f"/api/receipts/{receipt_id}/commit",
        json={"confirmed_line_ids": ["line-1", "line-2"]},
    )
    assert duplicate.status_code == 409


def test_receipt_commit_final_flush_failure_rolls_back_lots_and_keeps_reconciliation_marker() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-final-flush-failure.jpg",
            "lines": [{
                "raw_name": "국산콩 두부",
                "quantity": 1,
                "unit": "모",
                "line_type": "product",
                "canonical_name": "국산콩 두부",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    flush_calls = 0
    headers = {"Idempotency-Key": "receipt-reconciliation-marker-failure-key"}

    def fail_final_flush(_store) -> None:
        nonlocal flush_calls
        flush_calls += 1
        if flush_calls == 2:
            raise RuntimeError("simulated final receipt persistence outage")

    with patch.object(type(store), "flush", fail_final_flush):
        failed = client.post(
            f"/api/receipts/{receipt_id}/commit",
            headers=headers,
            json={"confirmed_line_ids": ["line-1"]},
        )

    assert failed.status_code == 503
    assert flush_calls == 3
    failure_payload = failed.json()
    assert failure_payload["detail"]["code"] == "receipt_commit_persistence_unavailable"
    assert failure_payload["detail"]["retryable"] is True
    assert failure_payload["detail"]["action"] == "retry_later"
    assert store.receipts[receipt_id].committed is False
    assert not [record for record in store.foods.values() if record.response.source_receipt_id == receipt_id]
    transactions = [transaction for transaction in store.commit_transactions.values() if transaction.receipt_id == receipt_id]
    assert len(transactions) == 1
    assert all(transaction.id not in failed.text for transaction in transactions)
    assert transactions[0].status == "needs_reconciliation"
    assert transactions[0].created_lot_ids == []

    retried = client.post(
        f"/api/receipts/{receipt_id}/commit",
        headers=headers,
        json={"confirmed_line_ids": ["line-1"]},
    )
    assert retried.status_code == 200
    assert len(retried.json()["created_lot_ids"]) == 1


def test_receipt_commit_pending_marker_failure_returns_typed_error_without_a_phantom() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-pending-marker-failure.jpg",
            "lines": [{
                "raw_name": "새 pending 상품",
                "quantity": 1,
                "unit": "개",
                "line_type": "product",
                "canonical_name": "새 pending 상품",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]

    def fail_pending_flush(_store) -> None:
        raise RuntimeError("simulated pending transaction persistence outage")

    with patch.object(type(store), "flush", fail_pending_flush):
        failed = client.post(
            f"/api/receipts/{receipt_id}/commit",
            json={"confirmed_line_ids": ["line-1"]},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "receipt_commit_persistence_unavailable"
    assert store.receipts[receipt_id].committed is False
    assert not [record for record in store.foods.values() if record.response.source_receipt_id == receipt_id]
    assert not [transaction for transaction in store.commit_transactions.values() if transaction.receipt_id == receipt_id]


def test_receipt_commit_reconciliation_marker_failure_keeps_pending_identity_for_retry() -> None:
    draft = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "receipt-reconciliation-marker-failure.jpg",
            "lines": [{
                "raw_name": "재시도 pending 상품",
                "quantity": 1,
                "unit": "개",
                "line_type": "product",
                "canonical_name": "재시도 pending 상품",
                "match_confidence": 0.92,
            }],
        },
    )
    assert draft.status_code == 201
    receipt_id = draft.json()["id"]
    flush_calls = 0
    headers = {"Idempotency-Key": "receipt-reconciliation-marker-failure-key"}

    def fail_reconciliation_flush(_store) -> None:
        nonlocal flush_calls
        flush_calls += 1
        if flush_calls >= 2:
            raise RuntimeError("simulated reconciliation marker persistence outage")

    with patch.object(type(store), "flush", fail_reconciliation_flush):
        failed = client.post(
            f"/api/receipts/{receipt_id}/commit",
            headers=headers,
            json={"confirmed_line_ids": ["line-1"]},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "receipt_commit_reconciliation_unavailable"
    assert flush_calls == 3
    assert store.receipts[receipt_id].committed is False
    assert not [record for record in store.foods.values() if record.response.source_receipt_id == receipt_id]
    pending = [transaction for transaction in store.commit_transactions.values() if transaction.receipt_id == receipt_id]
    assert len(pending) == 1
    assert pending[0].status == "pending"

    retried = client.post(
        f"/api/receipts/{receipt_id}/commit",
        headers=headers,
        json={"confirmed_line_ids": ["line-1"]},
    )

    assert retried.status_code == 200
    assert retried.json()["commit_transaction_id"] == pending[0].id
    assert len(retried.json()["created_lot_ids"]) == 1
    assert store.commit_transactions[pending[0].id].status == "committed"


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
    assert preview_payload["recipe_source_name"] == "Rescue Meal 팀 작성 레시피"
    assert preview_payload["recipe_license"] == "project-authored"
    assert preview_payload["recipe_source_revision"] == "recipes-v1"
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


    history = client.get("/api/meal-plans/history?limit=1")
    assert history.status_code == 200
    assert [item["id"] for item in history.json()] == [saved_payload["id"]]

    conflict = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
            "plan_id": "meal-client-retry-1",
            "snapshot_hash": "f" * 64,
        },
    )
    assert conflict.status_code == 409


def test_meal_plan_revision_probe_is_payload_free_and_advances_after_save() -> None:
    initial = client.get("/api/meal-plans/revision")
    assert initial.status_code == 200
    assert set(initial.json()) == {"revision"}
    initial_revision = initial.json()["revision"]

    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "revision-probe-plan"},
    )
    assert saved.status_code == 200

    after = client.get("/api/meal-plans/revision")
    assert after.status_code == 200
    assert after.json()["revision"] > initial_revision
    assert after.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(after.json()["revision"])


def test_meal_plan_save_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    response = main_module.create_meal_plan(
        MealPlanRequest(
            inventory_ids=["spinach-1", "tofu-1", "chicken-1"],
            plan_id="meal-workspace-mutation-save-1",
        )
    )

    assert response.id == "meal-workspace-mutation-save-1"
    assert calls == 1


def test_concurrent_meal_plan_save_reuses_preview_id_without_duplicate_audit(monkeypatch) -> None:
    request = MealPlanRequest(
        inventory_ids=["spinach-1", "tofu-1", "chicken-1"],
        plan_id="meal-concurrent-save-1",
    )
    entered_build = Event()
    release_build = Event()
    original_build = main_module._build_meal_plan

    def delayed_build(*args, **kwargs):
        entered_build.set()
        assert release_build.wait(timeout=5)
        return original_build(*args, **kwargs)

    monkeypatch.setattr(main_module, "_build_meal_plan", delayed_build)
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(main_module.create_meal_plan, request)
        assert entered_build.wait(timeout=5)
        second = executor.submit(main_module.create_meal_plan, request)
        release_build.set()
        first_result = first.result(timeout=5)
        second_result = second.result(timeout=5)

    assert first_result.id == request.plan_id
    assert second_result.id == first_result.id
    assert second_result.snapshot_hash == first_result.snapshot_hash
    assert len([event for event in store.meal_plan_events if event.plan_id == request.plan_id]) == 1


def test_meal_plan_save_flush_failure_does_not_leave_a_phantom() -> None:
    request = MealPlanRequest(
        inventory_ids=["spinach-1", "tofu-1", "chicken-1"],
        plan_id="meal-failed-save-phantom-1",
    )

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated meal-plan persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post(
            "/api/meal-plans",
            json={"inventory_ids": request.inventory_ids, "plan_id": request.plan_id},
        )

    assert failed.status_code == 503
    failure_detail = failed.json()["detail"]
    assert failure_detail["code"] == "meal_plan_persistence_unavailable"
    assert failure_detail["detail"] == "식단을 저장하지 못했습니다. 기존 식단과 workspace 상태를 유지했어요."
    assert failure_detail["retryable"] is True
    assert failure_detail["action"] == "retry_later"
    assert "simulated meal-plan persistence outage" not in failed.text

    assert request.plan_id not in store.meal_plans
    assert not any(event.plan_id == request.plan_id for event in store.meal_plan_events)


def test_meal_plan_api_exposes_metric_quantity_conversion_reason(monkeypatch) -> None:
    store.foods["spinach-1"].response.quantity = 2
    store.foods["spinach-1"].response.unit = "리터"
    specs = (
        RecipeSpec(
            id="api-spinach-500ml",
            title="시금치 500ml 요리",
            minutes=10,
            ingredients=(RecipeIngredient(canonical_name="시금치", amount=500, unit="ml"),),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )
    monkeypatch.setattr(main_module, "load_recipe_specs", lambda: specs)

    response = client.post("/api/meal-plans/preview", json={"inventory_ids": ["spinach-1"], "max_minutes": 30})

    assert response.status_code == 200
    ingredient = response.json()["ingredients"][0]
    assert ingredient["quantity_match"] == "converted"
    assert ingredient["available_quantity"] == 2000
    assert ingredient["available_unit"] == "ml"
    assert ingredient["allocations"] == [{"food_id": "spinach-1", "quantity": 0.5, "unit": "리터"}]


def test_meal_plan_api_preserves_servings_and_scales_required_quantity(monkeypatch) -> None:
    store.foods["spinach-1"].response.quantity = 2
    store.foods["spinach-1"].response.unit = "개"
    specs = (
        RecipeSpec(
            id="api-two-serving-spinach",
            title="두 인분 시금치 요리",
            minutes=10,
            ingredients=(RecipeIngredient(canonical_name="시금치", amount=1, unit="개"),),
            steps=("조리합니다.",),
            safety_note="상태를 확인하세요.",
        ),
    )
    monkeypatch.setattr(main_module, "load_recipe_specs", lambda: specs)

    response = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1"], "max_minutes": 30, "servings": 2},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["servings"] == 2
    assert payload["ingredients"][0]["amount"] == 2
    assert payload["ingredients"][0]["available"] is True
    assert payload["ingredients"][0]["allocations"] == [{"food_id": "spinach-1", "quantity": 2, "unit": "개"}]

    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1"],
            "max_minutes": 30,
            "servings": 2,
            "plan_id": "meal-two-serving-save",
            "snapshot_hash": payload["snapshot_hash"],
        },
    )
    assert saved.status_code == 200
    saved_payload = saved.json()
    assert saved_payload["servings"] == 2
    assert saved_payload["ingredients"][0]["amount"] == 2
    assert client.get("/api/meal-plans/latest").json()["servings"] == 2


def test_meal_plan_api_rejects_out_of_range_servings() -> None:
    response = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1"], "max_minutes": 30, "servings": 0},
    )

    assert response.status_code == 422


def test_meal_plan_options_returns_distinct_preview_choices_without_saving() -> None:
    response = client.post(
        "/api/meal-plans/options",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1"], "max_minutes": 30},
    )

    assert response.status_code == 200
    payload = response.json()
    options = payload["options"]
    assert 2 <= len(options) <= 3
    assert len({option["recipe_id"] for option in options}) == len(options)
    assert options[0]["recipe_id"] == "spinach-tofu-chicken-bowl"
    assert all(option["saved_at"] is None for option in options)
    assert payload["max_minutes"] == 30
    assert payload["servings"] == 1
    assert all(option["servings"] == 1 for option in options)
    assert payload["inventory_ids"] == ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1"]
    assert client.get("/api/meal-plans/latest").json() is None

    scaled_response = client.post(
        "/api/meal-plans/options",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1"], "max_minutes": 30, "servings": 2},
    )
    assert scaled_response.status_code == 200
    scaled_payload = scaled_response.json()
    assert scaled_payload["servings"] == 2
    assert all(option["servings"] == 2 for option in scaled_payload["options"])


def test_meal_plan_save_preserves_the_selected_recipe_candidate() -> None:
    options = client.post(
        "/api/meal-plans/options",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1"], "max_minutes": 30},
    )
    assert options.status_code == 200
    options_payload = options.json()
    selected = options_payload["options"][1]

    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": options_payload["inventory_ids"],
            "max_minutes": selected["max_minutes"],
            "recipe_id": selected["recipe_id"],
            "plan_id": "meal-selected-recipe-1",
            "snapshot_hash": selected["snapshot_hash"],
        },
    )

    assert saved.status_code == 200
    assert saved.json()["recipe_id"] == selected["recipe_id"]
    assert saved.json()["snapshot_hash"] == selected["snapshot_hash"]
    assert saved.json()["saved_at"] is not None


def test_multi_day_meal_plan_preview_returns_three_distinct_days_without_saving() -> None:
    response = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )

    assert response.status_code == 200
    payload = response.json()
    days = payload["days"]
    assert len(days) == 3
    assert [day["day_index"] for day in days] == [1, 2, 3]
    assert len({day["plan"]["recipe_id"] for day in days}) == 3
    assert all(day["plan"]["saved_at"] is None for day in days)
    local_today = datetime.now(timezone.utc).astimezone(main_module._workspace_timezone()).date()
    assert days[0]["plan_date"] == local_today.isoformat()
    assert days[2]["plan_date"] == (local_today + timedelta(days=2)).isoformat()
    assert payload["max_minutes"] == 30
    assert payload["optimization_engine"] == "or-tools-cp-sat"
    assert len(payload["snapshot_hash"]) == 64
    assert client.get("/api/meal-plans/latest").json() is None
    assert client.get("/api/meal-plans/multi-day/latest").json() is None


def test_multi_day_preview_and_save_preserve_servings() -> None:
    request = {
        "inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"],
        "max_minutes": 30,
        "servings": 2,
    }
    preview = client.post("/api/meal-plans/multi-day-preview", json=request)

    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["servings"] == 2
    assert all(day["plan"]["servings"] == 2 for day in preview_payload["days"])

    saved = client.post(
        "/api/meal-plans/multi-day",
        json={
            **request,
            "bundle_id": "multi-day-two-serving",
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )

    assert saved.status_code == 200
    assert saved.json()["servings"] == 2
    assert all(day["plan"]["servings"] == 2 for day in saved.json()["days"])


def test_saved_multi_day_bundle_is_idempotent_and_recoverable() -> None:
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    preview_payload = preview.json()
    bundle_id = "multi-day-bundle-retry"
    save_request = {
        "inventory_ids": preview_payload["inventory_ids"],
        "max_minutes": preview_payload["max_minutes"],
        "bundle_id": bundle_id,
        "snapshot_hash": preview_payload["snapshot_hash"],
    }

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated multi-day bundle persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post("/api/meal-plans/multi-day", json=save_request)

    assert failed.status_code == 503
    failure_detail = failed.json()["detail"]
    assert failure_detail["code"] == "multi_day_plan_persistence_unavailable"
    assert failure_detail["detail"] == "3일 식단을 저장하지 못했습니다. 기존 3일 계획과 workspace 상태를 유지했어요."
    assert failure_detail["retryable"] is True
    assert failure_detail["action"] == "retry_later"
    assert "simulated multi-day bundle persistence outage" not in failed.text
    assert bundle_id not in store.multi_day_meal_plans

    saved = client.post("/api/meal-plans/multi-day", json=save_request)
    assert saved.status_code == 200
    saved_payload = saved.json()
    assert saved_payload["id"] == bundle_id
    assert saved_payload["saved_at"] is not None
    assert len(saved_payload["days"]) == 3
    assert all(day["plan"]["saved_at"] is None for day in saved_payload["days"])

    retry = client.post("/api/meal-plans/multi-day", json=save_request)
    assert retry.status_code == 200
    assert retry.json()["id"] == bundle_id
    assert retry.json()["saved_at"] == saved_payload["saved_at"]

    latest = client.get("/api/meal-plans/multi-day/latest")
    history = client.get("/api/meal-plans/multi-day/history?limit=10")
    assert latest.status_code == 200
    assert latest.json()["id"] == bundle_id
    assert history.status_code == 200
    assert [item["id"] for item in history.json()] == [bundle_id]

    conflict = client.post(
        "/api/meal-plans/multi-day",
        json={**save_request, "max_minutes": 10, "snapshot_hash": "f" * 64},
    )
    assert conflict.status_code == 409


def test_multi_day_bundle_save_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    preview_payload = preview.json()

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    response = client.post(
        "/api/meal-plans/multi-day",
        json={
            "inventory_ids": preview_payload["inventory_ids"],
            "max_minutes": preview_payload["max_minutes"],
            "bundle_id": "multi-day-workspace-mutation-save-1",
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == "multi-day-workspace-mutation-save-1"
    assert calls == 1


def test_multi_day_day_candidate_can_be_saved_as_the_selected_single_plan() -> None:
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    day_candidate = preview.json()["days"][1]["plan"]

    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": day_candidate["inventory_ids"],
            "max_minutes": day_candidate["max_minutes"],
            "recipe_id": day_candidate["recipe_id"],
            "plan_id": "meal-selected-multi-day-candidate-1",
            "snapshot_hash": day_candidate["snapshot_hash"],
        },
    )

    assert saved.status_code == 200
    assert saved.json()["recipe_id"] == day_candidate["recipe_id"]
    assert saved.json()["snapshot_hash"] == day_candidate["snapshot_hash"]
    assert saved.json()["saved_at"] is not None


def test_idempotent_single_plan_retry_repairs_multi_day_link() -> None:
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    preview_payload = preview.json()
    bundle_id = "multi-day-idempotent-link-repair-1"
    bundle = client.post(
        "/api/meal-plans/multi-day",
        json={
            "inventory_ids": preview_payload["inventory_ids"],
            "max_minutes": preview_payload["max_minutes"],
            "bundle_id": bundle_id,
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )
    assert bundle.status_code == 200
    day_candidate = preview_payload["days"][1]["plan"]
    request = {
        "inventory_ids": day_candidate["inventory_ids"],
        "max_minutes": day_candidate["max_minutes"],
        "recipe_id": day_candidate["recipe_id"],
        "plan_id": "meal-idempotent-link-repair-1",
        "snapshot_hash": day_candidate["snapshot_hash"],
    }

    unlinked = client.post("/api/meal-plans", json=request)
    assert unlinked.status_code == 200
    linked_retry = client.post(
        "/api/meal-plans",
        json={**request, "bundle_id": bundle_id, "bundle_day_index": 2},
    )
    assert linked_retry.status_code == 200
    assert linked_retry.json()["id"] == unlinked.json()["id"]
    assert linked_retry.json()["bundle_id"] == bundle_id
    assert linked_retry.json()["bundle_day_index"] == 2

    saved_bundle = client.get("/api/meal-plans/multi-day/latest")
    assert saved_bundle.status_code == 200
    saved_day = saved_bundle.json()["days"][1]
    assert saved_day["status"] == "saved"
    assert saved_day["meal_plan_id"] == request["plan_id"]


def test_linked_meal_completion_updates_multi_day_progress_without_duplicate_consumption() -> None:
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    preview_payload = preview.json()
    bundle_id = "multi-day-progress-1"
    bundle = client.post(
        "/api/meal-plans/multi-day",
        json={
            "inventory_ids": preview_payload["inventory_ids"],
            "max_minutes": preview_payload["max_minutes"],
            "bundle_id": bundle_id,
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )
    assert bundle.status_code == 200
    day_candidate = preview_payload["days"][1]["plan"]
    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": day_candidate["inventory_ids"],
            "max_minutes": day_candidate["max_minutes"],
            "recipe_id": day_candidate["recipe_id"],
            "plan_id": "meal-linked-progress-1",
            "bundle_id": bundle_id,
            "bundle_day_index": 2,
            "snapshot_hash": day_candidate["snapshot_hash"],
        },
    )
    assert saved.status_code == 200
    assert saved.json()["bundle_id"] == bundle_id
    assert saved.json()["bundle_day_index"] == 2

    saved_bundle = client.get("/api/meal-plans/multi-day/latest")
    assert saved_bundle.status_code == 200
    saved_day = saved_bundle.json()["days"][1]
    assert saved_day["status"] == "saved"
    assert saved_day["meal_plan_id"] == "meal-linked-progress-1"
    assert saved_day["completed_at"] is None

    completed = client.post("/api/meal-plans/meal-linked-progress-1/complete", json={})
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    completed_bundle = client.get("/api/meal-plans/multi-day/latest").json()
    completed_day = completed_bundle["days"][1]
    assert completed_day["status"] == "completed"
    assert completed_day["meal_plan_id"] == "meal-linked-progress-1"
    assert completed_day["completed_at"] == completed.json()["completed_at"]

    relink = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": day_candidate["inventory_ids"],
            "max_minutes": day_candidate["max_minutes"],
            "recipe_id": day_candidate["recipe_id"],
            "plan_id": "meal-linked-progress-second-attempt",
            "bundle_id": bundle_id,
            "bundle_day_index": 2,
            "snapshot_hash": day_candidate["snapshot_hash"],
        },
    )
    assert relink.status_code == 409

    retry = client.post("/api/meal-plans/meal-linked-progress-1/complete", json={})
    assert retry.status_code == 200
    assert retry.json()["status"] == "already_completed"
    assert len([event for event in store.storage_events if event.meal_plan_id == "meal-linked-progress-1"]) == 2


def test_multi_day_day_completion_flush_failure_restores_bundle_progress_and_consumption() -> None:
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    preview_payload = preview.json()
    bundle_id = "multi-day-progress-flush-failure-1"
    bundle = client.post(
        "/api/meal-plans/multi-day",
        json={
            "inventory_ids": preview_payload["inventory_ids"],
            "max_minutes": preview_payload["max_minutes"],
            "bundle_id": bundle_id,
            "snapshot_hash": preview_payload["snapshot_hash"],
        },
    )
    assert bundle.status_code == 200
    day_candidate = preview_payload["days"][1]["plan"]
    plan_id = "meal-linked-progress-flush-failure-1"
    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": day_candidate["inventory_ids"],
            "max_minutes": day_candidate["max_minutes"],
            "recipe_id": day_candidate["recipe_id"],
            "plan_id": plan_id,
            "bundle_id": bundle_id,
            "bundle_day_index": 2,
            "snapshot_hash": day_candidate["snapshot_hash"],
        },
    )
    assert saved.status_code == 200
    before_quantities = {food_id: record.response.quantity for food_id, record in store.foods.items()}
    before_event_count = len(store.storage_events)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated multi-day completion persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post(f"/api/meal-plans/{plan_id}/complete", json={})

    assert failed.status_code == 503
    assert store.meal_plans[plan_id].completed_at is None
    failed_bundle = store.multi_day_meal_plans[bundle_id]
    failed_day = failed_bundle.days[1]
    assert failed_day.status == "saved"
    assert failed_day.completed_at is None
    assert len(store.storage_events) == before_event_count
    assert {food_id: record.response.quantity for food_id, record in store.foods.items()} == before_quantities

    retried = client.post(f"/api/meal-plans/{plan_id}/complete", json={})

    assert retried.status_code == 200
    assert retried.json()["status"] == "completed"
    completed_day = client.get("/api/meal-plans/multi-day/latest").json()["days"][1]
    assert completed_day["status"] == "completed"
    assert completed_day["meal_plan_id"] == plan_id
    assert completed_day["completed_at"] == retried.json()["completed_at"]


def test_shopping_list_merges_missing_ingredients_and_removes_items_when_inventory_is_replenished() -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-shopping-list-1"},
    )
    assert saved.status_code == 200
    assert saved.json()["missing_ingredients"] == ["국산콩 두부"]

    added = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-list-1"})
    assert added.status_code == 200
    added_payload = added.json()
    assert added_payload["added_count"] == 1
    assert added_payload["items"][0]["canonical_name"] == "국산콩 두부"
    assert added_payload["items"][0]["quantity"] == 1
    assert added_payload["items"][0]["sources"] == [{"source_type": "meal_plan", "source_id": "meal-shopping-list-1", "day_index": None, "quantity": 1}]
    item_id = added_payload["items"][0]["id"]

    replay = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-list-1"})
    assert replay.status_code == 200
    assert replay.json()["added_count"] == 0
    assert replay.json()["updated_count"] == 0
    assert replay.json()["items"][0]["checked"] is False

    checked = client.patch(f"/api/shopping-list/{item_id}", json={"checked": True})
    assert checked.status_code == 200
    assert checked.json()["checked"] is True
    assert client.get("/api/shopping-list").json()[0]["checked"] is True

    replenished = client.post(
        "/api/foods",
        json={"canonical_name": "국산콩 두부", "quantity": 1, "unit": "모", "storage_type": "refrigerated"},
    )
    assert replenished.status_code == 201
    refreshed = client.get("/api/shopping-list")
    assert refreshed.status_code == 200
    assert refreshed.json() == []


def test_shopping_list_build_and_manual_add_use_workspace_mutation_recovery_seam(monkeypatch) -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-shopping-seam-1"},
    )
    assert saved.status_code == 200

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    planned = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-seam-1"})
    manual = client.post("/api/shopping-list/manual", json={"canonical_name": "수동 seam 장보기", "quantity": 1, "unit": "개"})

    assert planned.status_code == 200
    assert manual.status_code == 200
    assert calls == 2


def test_shopping_list_create_and_manual_add_flush_failure_restore_and_allow_retry() -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-shopping-recovery-1"},
    )
    assert saved.status_code == 200

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated shopping-list persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed_planned = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-recovery-1"})
        failed_manual = client.post("/api/shopping-list/manual", json={"canonical_name": "장보기 복구 추가", "quantity": 2, "unit": "개"})

    assert failed_planned.status_code == 503
    assert failed_planned.json()["detail"]["code"] == "shopping_list_persistence_unavailable"
    assert failed_manual.status_code == 503
    assert failed_manual.json()["detail"]["code"] == "shopping_list_persistence_unavailable"
    assert store.shopping_list == {}

    retried_planned = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-recovery-1"})
    retried_manual = client.post("/api/shopping-list/manual", json={"canonical_name": "장보기 복구 추가", "quantity": 2, "unit": "개"})

    assert retried_planned.status_code == 200
    assert retried_planned.json()["added_count"] == 1
    assert retried_manual.status_code == 200
    assert retried_manual.json()["added_count"] == 1
    assert {item["canonical_name"] for item in retried_manual.json()["items"]} == {"국산콩 두부", "장보기 복구 추가"}


def test_shopping_list_read_reconciliation_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-shopping-read-seam-1"},
    )
    assert saved.status_code == 200
    added = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-read-seam-1"})
    assert added.status_code == 200

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    read = client.get("/api/shopping-list")

    assert read.status_code == 200
    assert read.json()[0]["canonical_name"] == "국산콩 두부"
    assert calls == 1


def test_shopping_list_read_reconciliation_retries_after_concurrent_workspace_conflict(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def raise_once(mutation):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ConcurrentWorkspaceWriteError("shopping list read lost a concurrent reconciliation race")
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", raise_once)

    read = client.get("/api/shopping-list")

    assert read.status_code == 200
    assert calls == 2


def test_shopping_list_read_reconciliation_flush_failure_restores_the_previous_list() -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-shopping-read-recovery-1"},
    )
    assert saved.status_code == 200
    added = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-read-recovery-1"})
    assert added.status_code == 200
    item_id = added.json()["items"][0]["id"]

    replenished = client.post(
        "/api/foods",
        json={"canonical_name": "국산콩 두부", "quantity": 1, "unit": "모", "storage_type": "refrigerated"},
    )
    assert replenished.status_code == 201

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated shopping-list read persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.get("/api/shopping-list")

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "shopping_list_persistence_unavailable"
    assert item_id in store.shopping_list
    assert store.shopping_list[item_id].quantity == 1

    retried = client.get("/api/shopping-list")

    assert retried.status_code == 200
    assert retried.json() == []


def test_shopping_list_check_flush_failure_restores_the_previous_state() -> None:
    added = client.post("/api/shopping-list/manual", json={"canonical_name": "저장 실패 장보기", "quantity": 1, "unit": "개"})
    assert added.status_code == 200
    item_id = added.json()["items"][0]["id"]

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated shopping-list persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.patch(f"/api/shopping-list/{item_id}", json={"checked": True})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "shopping_list_item_persistence_unavailable"
    assert store.shopping_list[item_id].checked is False


def test_shopping_list_delete_flush_failure_restores_the_previous_item() -> None:
    added = client.post("/api/shopping-list/manual", json={"canonical_name": "삭제 실패 장보기", "quantity": 1, "unit": "개"})
    assert added.status_code == 200
    item_id = added.json()["items"][0]["id"]

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated shopping-list delete persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.delete(f"/api/shopping-list/{item_id}")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "shopping_list_item_persistence_unavailable"
    assert item_id in store.shopping_list


def test_shopping_list_respects_saved_plan_servings_when_recomputing_shortage() -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={
            "inventory_ids": ["spinach-1", "chicken-1"],
            "max_minutes": 30,
            "recipe_id": "spinach-tofu-chicken-bowl",
            "servings": 2,
            "plan_id": "meal-shopping-two-serving-1",
        },
    )

    assert saved.status_code == 200
    assert saved.json()["servings"] == 2
    assert saved.json()["missing_ingredients"] == ["시금치", "국산콩 두부"]

    added = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-shopping-two-serving-1"})

    assert added.status_code == 200
    quantities = {item["canonical_name"]: item["quantity"] for item in added.json()["items"]}
    assert quantities["시금치"] == 1
    assert quantities["국산콩 두부"] == 2


def test_manual_shopping_item_upserts_and_survives_recipe_reconciliation() -> None:
    invalid = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "   ", "quantity": 1, "unit": "개"},
    )
    assert invalid.status_code == 422

    manual = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": " 국산콩 두부 ", "quantity": 2, "unit": " 모 "},
    )
    assert manual.status_code == 200
    manual_payload = manual.json()
    assert manual_payload["added_count"] == 1
    assert manual_payload["items"][0]["canonical_name"] == "국산콩 두부"
    assert manual_payload["items"][0]["quantity"] == 2
    assert manual_payload["items"][0]["sources"] == [{
        "source_type": "manual",
        "source_id": f"manual:{manual_payload['items'][0]['id']}",
        "day_index": None,
        "quantity": 2,
    }]

    replaced = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "국산콩 두부", "quantity": 3, "unit": "모"},
    )
    assert replaced.status_code == 200
    assert replaced.json()["added_count"] == 0
    assert replaced.json()["updated_count"] == 1
    assert replaced.json()["items"][0]["quantity"] == 3
    item_id = replaced.json()["items"][0]["id"]

    checked = client.patch(f"/api/shopping-list/{item_id}", json={"checked": True})
    assert checked.status_code == 200
    assert checked.json()["checked"] is True

    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-manual-shopping-1"},
    )
    assert saved.status_code == 200
    auto_synced = client.post("/api/shopping-list", json={"source_type": "meal_plan", "source_id": "meal-manual-shopping-1"})
    assert auto_synced.status_code == 200
    merged = next(item for item in auto_synced.json()["items"] if item["id"] == item_id)
    assert merged["quantity"] == 4
    assert {source["source_type"] for source in merged["sources"]} == {"manual", "meal_plan"}
    assert merged["checked"] is False

    replenished = client.post(
        "/api/foods",
        json={"canonical_name": "국산콩 두부", "quantity": 1, "unit": "모", "storage_type": "refrigerated"},
    )
    assert replenished.status_code == 201
    remaining = client.get("/api/shopping-list")
    assert remaining.status_code == 200
    assert remaining.json()[0]["id"] == item_id
    assert remaining.json()[0]["quantity"] == 3
    assert [source["source_type"] for source in remaining.json()[0]["sources"]] == ["manual"]


def test_receiving_shopping_item_creates_lot_reconciles_plan_and_replays_idempotently() -> None:
    store.foods.pop("tofu-1")
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "plan_id": "meal-shopping-receive-1"},
    )
    assert saved.status_code == 200

    added = client.post(
        "/api/shopping-list",
        json={"source_type": "meal_plan", "source_id": "meal-shopping-receive-1"},
    )
    assert added.status_code == 200
    item = next(item for item in added.json()["items"] if item["canonical_name"] == "국산콩 두부")
    assert item["quantity"] == 1

    receive = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-test-1"},
        json={"quantity": 2, "storage_type": "frozen"},
    )

    assert receive.status_code == 201
    payload = receive.json()
    lot = payload["inventory_lot"]
    assert payload["status"] == "received"
    assert payload["shopping_item_id"] == item["id"]
    assert payload["received_quantity"] == 2
    assert payload["removed_planned_source_count"] == 1
    assert payload["items"] == []
    assert lot["id"] != "tofu-1"
    assert lot["canonical_name"] == "국산콩 두부"
    assert lot["quantity"] == 2
    assert lot["unit"] == "모"
    assert lot["storage_type"] == "frozen"
    assert lot["purchased_at"] is not None
    assert lot["date_assertion"]["kind"] == "unknown"
    assert lot["date_assertion"]["value"] is None
    assert "포장지에서 확인" in lot["note"]
    assert lot["estimated_use_first_window"] is not None

    lot_count = len(store.foods)
    replay = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-test-1"},
        json={"quantity": 2, "storage_type": "frozen"},
    )
    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json()["idempotency_replayed"] is True
    assert replay.json()["inventory_lot"]["id"] == lot["id"]
    assert len(store.foods) == lot_count

    conflict_while_lot_exists = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-test-1"},
        json={"quantity": 3, "storage_type": "frozen"},
    )
    assert conflict_while_lot_exists.status_code == 409

    # The idempotency ledger must outlive the inventory lot. A later retry
    # cannot recreate a lot after the original lot has been fully consumed or
    # discarded.
    store.foods.pop(lot["id"])
    replay_after_lot_removal = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-test-1"},
        json={"quantity": 2, "storage_type": "frozen"},
    )
    assert replay_after_lot_removal.status_code == 409
    assert len(store.foods) == lot_count - 1

    conflict = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-test-1"},
        json={"quantity": 3, "storage_type": "frozen"},
    )
    assert conflict.status_code == 409


def test_shopping_receive_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    added = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "입고 seam 식품", "quantity": 1, "unit": "개"},
    )
    assert added.status_code == 200
    item = added.json()["items"][0]

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    received = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-workspace-mutation-1"},
        json={"quantity": 1, "storage_type": "refrigerated"},
    )

    assert received.status_code == 201
    assert received.json()["status"] == "received"
    assert calls == 1


def test_shopping_receive_final_flush_failure_restores_lot_list_and_operation() -> None:
    added = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "입고 복구 식품", "quantity": 1, "unit": "개"},
    )
    assert added.status_code == 200
    item = added.json()["items"][0]
    before_food_ids = set(store.foods)
    before_item = store.shopping_list[item["id"]].model_copy(deep=True)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated shopping receive persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post(
            f"/api/shopping-list/{item['id']}/receive",
            headers={"Idempotency-Key": "shopping-receive-final-flush-failure-1"},
            json={"quantity": 1, "storage_type": "frozen"},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "shopping_receive_persistence_unavailable"
    assert set(store.foods) == before_food_ids
    assert store.shopping_list[item["id"]] == before_item
    assert store.shopping_receive_operations == {}

    retried = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-final-flush-failure-1"},
        json={"quantity": 1, "storage_type": "frozen"},
    )
    replay = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-final-flush-failure-1"},
        json={"quantity": 1, "storage_type": "frozen"},
    )

    assert retried.status_code == 201
    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json()["inventory_lot"]["id"] == retried.json()["inventory_lot"]["id"]
    assert len(store.foods) == len(before_food_ids) + 1
    assert len(store.shopping_receive_operations) == 1


def test_receiving_shopping_item_replays_when_same_key_wins_a_concurrent_flush(monkeypatch) -> None:
    added = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "동시 요청 두부", "quantity": 1, "unit": "모"},
    )
    assert added.status_code == 200
    item = added.json()["items"][0]

    original_flush = store._base_store.flush
    state = {"raised": False}

    def raise_once_after_rival_commit() -> None:
        if not state["raised"]:
            state["raised"] = True
            raise ConcurrentWorkspaceWriteError("same idempotency key committed by another process")
        original_flush()

    monkeypatch.setattr(store._base_store, "flush", raise_once_after_rival_commit)

    response = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-concurrent-1"},
        json={"quantity": 1, "storage_type": "refrigerated"},
    )

    assert response.status_code == 201
    assert response.headers["x-idempotency-replayed"] == "true"
    assert response.json()["idempotency_replayed"] is True
    assert response.json()["inventory_lot"]["canonical_name"] == "동시 요청 두부"
    assert len(store.shopping_receive_operations) == 1


def test_receiving_manual_shopping_item_keeps_checked_manual_history() -> None:
    added = client.post(
        "/api/shopping-list/manual",
        json={"canonical_name": "생수", "quantity": 2, "unit": "병"},
    )
    assert added.status_code == 200
    item = added.json()["items"][0]

    receive = client.post(
        f"/api/shopping-list/{item['id']}/receive",
        headers={"Idempotency-Key": "shopping-receive-manual-1"},
        json={"quantity": 2, "storage_type": "ambient"},
    )

    assert receive.status_code == 201
    payload = receive.json()
    assert payload["removed_planned_source_count"] == 0
    assert len(payload["items"]) == 1
    remaining = payload["items"][0]
    assert remaining["id"] == item["id"]
    assert remaining["checked"] is True
    assert remaining["sources"][0]["source_type"] == "manual"
    assert payload["inventory_lot"]["storage_type"] == "ambient"


def test_multi_day_shopping_list_keeps_day_sources() -> None:
    for food_id in ["tofu-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"]:
        store.foods.pop(food_id)
    preview = client.post(
        "/api/meal-plans/multi-day-preview",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    bundle = client.post(
        "/api/meal-plans/multi-day",
        json={"inventory_ids": ["spinach-1", "chicken-1"], "max_minutes": 30, "bundle_id": "multi-day-shopping-list-1", "snapshot_hash": preview.json()["snapshot_hash"]},
    )
    assert bundle.status_code == 200

    response = client.post("/api/shopping-list", json={"source_type": "multi_day", "source_id": "multi-day-shopping-list-1"})

    assert response.status_code == 200
    assert response.json()["items"]
    assert all(source["source_type"] == "multi_day" for item in response.json()["items"] for source in item["sources"])
    assert all(source["day_index"] in {1, 2, 3} for item in response.json()["items"] for source in item["sources"])


def test_meal_preferences_filter_recipe_candidates_and_round_trip() -> None:
    initial = client.get("/api/meal-preferences")
    assert initial.status_code == 200
    assert initial.json()["avoid_allergens"] == []

    updated = client.put("/api/meal-preferences", json={"avoid_allergens": ["egg", "soy", "soy"]})
    assert updated.status_code == 200
    assert updated.json()["avoid_allergens"] == ["soy", "egg"]
    assert client.get("/api/meal-preferences").json()["avoid_allergens"] == ["soy", "egg"]

    preview = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1", "milk-1", "tomato-1"], "max_minutes": 30},
    )
    assert preview.status_code == 200
    payload = preview.json()
    assert payload["recipe_id"] != "spinach-tofu-chicken-bowl"
    assert payload["allergen_metadata_status"] == "known"
    assert "soy" not in (payload["allergens"] or [])
    assert "egg" not in (payload["allergens"] or [])
    assert payload["preference_filtered"] is False


def test_meal_plan_preview_honors_user_cooking_time_limit() -> None:
    response = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1", "mushroom-1", "egg-1"], "max_minutes": 10},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["recipe_id"] == "mushroom-egg-stir-fry"
    assert payload["minutes"] == 10
    assert payload["max_minutes"] == 10


def test_meal_plan_marks_allocated_foods_that_need_date_review() -> None:
    food = store.foods["spinach-1"].response
    custom_location = store.create_storage_location(
        StorageLocationCreateRequest(name="김치냉장고", storage_type="refrigerated")
    )
    food.storage_location_id = custom_location.id
    food.date_assertion = DateAssertion(
        kind="use_by",
        value=datetime.now(timezone.utc).date(),
        display_label="오늘",
        source="user_input",
        source_detail="테스트에서 오늘 확인한 소비기한",
        confidence=1.0,
        user_confirmed=True,
        applicable_storage_type="ambient",
        storage_condition_text="실온 보관",
    )
    food.estimated_use_first_window = None
    store.flush()

    response = client.post(
        "/api/meal-plans/preview",
        json={"inventory_ids": ["spinach-1"], "max_minutes": 30},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["date_review_required"] is True
    assert "시금치" in payload["date_review_foods"]
    assert payload["date_review_food_ids"] == ["spinach-1"]
    assert "시금치" in payload["date_review_note"]
    assert "포장지 보관조건" in payload["date_review_note"]
    assert "김치냉장고" in payload["date_review_note"]
    assert "소비기한을 새로 판정하지 않습니다" in payload["date_review_note"]


def test_meal_plan_history_returns_saved_plans_in_recent_order_and_omits_preview() -> None:
    first = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-history-1"},
    )
    second = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["mushroom-1", "egg-1"], "max_minutes": 10, "plan_id": "meal-history-2"},
    )
    preview = client.post("/api/meal-plans/preview", json={"inventory_ids": ["spinach-1"]})
    assert first.status_code == 200
    assert second.status_code == 200
    assert preview.status_code == 200

    history = client.get("/api/meal-plans/history?limit=10")
    assert history.status_code == 200
    assert [item["id"] for item in history.json()] == ["meal-history-2", "meal-history-1"]
    assert history.json()[0]["max_minutes"] == 10
    assert preview.json()["id"] not in {item["id"] for item in history.json()}

    limited = client.get("/api/meal-plans/history?limit=1")
    assert limited.status_code == 200
    assert [item["id"] for item in limited.json()] == ["meal-history-2"]


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


def test_meal_plan_completion_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-workspace-mutation-complete-1"},
    )
    assert saved.status_code == 200

    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    response = client.post("/api/meal-plans/meal-workspace-mutation-complete-1/complete", json={})

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert calls == 1


def test_meal_plan_completion_flush_failure_restores_inventory_and_plan() -> None:
    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1", "tofu-1", "chicken-1"], "plan_id": "meal-completion-flush-failure-1"},
    )
    assert saved.status_code == 200

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated meal completion persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post("/api/meal-plans/meal-completion-flush-failure-1/complete", json={})

    assert failed.status_code == 503
    failure_detail = failed.json()["detail"]
    assert failure_detail["code"] == "meal_plan_completion_persistence_unavailable"
    assert failure_detail["detail"] == "식단 완료를 저장하지 못했습니다. 기존 재고와 식단을 유지했어요."
    assert failure_detail["retryable"] is True
    assert failure_detail["action"] == "retry_later"
    assert "simulated meal completion persistence outage" not in failed.text
    assert store.meal_plans["meal-completion-flush-failure-1"].completed_at is None
    assert not [event for event in store.storage_events if event.meal_plan_id == "meal-completion-flush-failure-1"]
    inventory = client.get("/api/dashboard").json()["inventory"]
    assert next(item for item in inventory if item["id"] == "spinach-1")["quantity"] == 1
    assert next(item for item in inventory if item["id"] == "tofu-1")["quantity"] == 1
    assert next(item for item in inventory if item["id"] == "chicken-1")["quantity"] == 2


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
    assert payload["estimated_use_first_window"]["inference_trace"]["provider"] == "rule-assisted-backend-inference"
    assert payload["estimated_use_first_window"]["inference_trace"]["rule_id"] == "priority.fresh-produce.v1"
    assert len(payload["estimated_use_first_window"]["inference_trace"]["input_sha256"]) == 64


def test_manual_food_creates_a_new_lot_instead_of_overwriting_same_product() -> None:
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "국산콩 두부",
            "quantity": 2,
            "unit": "모",
            "storage_type": "refrigerated",
            "category": "두부·콩",
            "brand": "다른 구매 두부",
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["id"] != "tofu-1"
    inventory = client.get("/api/dashboard").json()["inventory"]
    lots = [item for item in inventory if item["canonical_name"] == "국산콩 두부"]
    assert len(lots) == 2
    assert {item["quantity"] for item in lots} == {1, 2}
    assert next(item for item in lots if item["id"] == "tofu-1")["brand"] == "풀무원"


def test_manual_food_explicit_new_lot_wins_over_single_legacy_label_match() -> None:
    response = client.post(
        "/api/foods",
        json={
            "lot_action": "create",
            "canonical_name": "시금치",
            "quantity": 1,
            "unit": "팩",
            "storage_type": "refrigerated",
            "category": "채소",
            "brand": "새 구매 시금치",
            "date_kind": "use_by",
            "date_value": "2026-09-30",
            "date_source": "label_ocr",
            "date_source_detail": "새 포장지 표시",
            "user_confirmed": True,
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["id"] != "spinach-1"
    assert created["date_assertion"]["value"] == "2026-09-30"
    assert client.get("/api/dashboard").json()["food_count"] == 8
    original = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "spinach-1")
    assert original["date_assertion"]["value"] == "2026-09-02"


def test_manual_food_idempotency_replays_without_duplicate_lot_and_rejects_payload_reuse() -> None:
    request = {
        "lot_action": "create",
        "canonical_name": "수동 입력 재시도 식품",
        "quantity": 1,
        "unit": "팩",
        "storage_type": "refrigerated",
        "category": "기타",
    }
    headers = {"Idempotency-Key": "manual-food-retry-1"}

    first = client.post("/api/foods", headers=headers, json=request)
    replay = client.post("/api/foods", headers=headers, json=request)
    conflicting = client.post("/api/foods", headers=headers, json={**request, "quantity": 2})

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json() == first.json()
    assert conflicting.status_code == 409
    assert conflicting.json()["detail"]["code"] == "manual_food_idempotency_conflict"
    assert len([item for item in client.get("/api/dashboard").json()["inventory"] if item["canonical_name"] == request["canonical_name"]]) == 1
    assert len(store.manual_food_operations) == 1
    exported = client.get("/api/account/export")
    assert exported.status_code == 200
    assert len(exported.json()["manual_food_operations"]) == 1
    assert "manual-food-retry-1" not in exported.text


def test_manual_food_idempotency_does_not_recreate_a_consumed_lot() -> None:
    request = {
        "lot_action": "create",
        "canonical_name": "소비 후 재시도 식품",
        "quantity": 1,
        "unit": "개",
        "storage_type": "ambient",
    }
    headers = {"Idempotency-Key": "manual-food-consumed-retry-1"}
    created = client.post("/api/foods", headers=headers, json=request)
    assert created.status_code == 201
    food_id = created.json()["id"]

    consumed = client.post(f"/api/foods/{food_id}/storage-events", json={"event_type": "consumed"})
    replay = client.post("/api/foods", headers=headers, json=request)

    assert consumed.status_code == 200
    assert replay.status_code == 409
    assert replay.json()["detail"]["code"] == "manual_food_operation_lot_missing"
    assert client.get("/api/inventory/search", params={"q": request["canonical_name"]}).json()["total"] == 0


def test_manual_food_replay_returns_before_recomputing_priority_inference(monkeypatch) -> None:
    request = {
        "lot_action": "create",
        "canonical_name": "추론 장애 후 replay 식품",
        "quantity": 1,
        "unit": "개",
        "storage_type": "ambient",
    }
    headers = {"Idempotency-Key": "manual-food-inference-replay-1"}
    first = client.post("/api/foods", headers=headers, json=request)
    assert first.status_code == 201

    def fail_inference(*_args, **_kwargs):
        raise RuntimeError("inference-provider-down")

    monkeypatch.setattr(main_module, "infer_priority", fail_inference)
    replay = client.post("/api/foods", headers=headers, json=request)

    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json() == first.json()


def test_manual_food_correct_action_requires_a_target_lot() -> None:
    response = client.post(
        "/api/foods",
        json={"lot_action": "correct", "canonical_name": "대상 없음", "date_kind": "unknown"},
    )

    assert response.status_code == 422


def test_manual_food_target_updates_one_lot_and_keeps_quantity_and_date_history() -> None:
    created = client.post(
        "/api/foods",
        json={
            "canonical_name": "대상 lot 식품",
            "quantity": 3,
            "unit": "팩",
            "storage_type": "refrigerated",
            "category": "기타",
        },
    )
    assert created.status_code == 201
    food_id = created.json()["id"]

    updated = client.post(
        "/api/foods",
        json={
            "lot_action": "correct",
            "target_food_id": food_id,
            "canonical_name": "대상 lot 식품",
            "quantity": 1,
            "unit": "개",
            "storage_type": "refrigerated",
            "category": "가공식품",
            "brand": "라벨 확인 브랜드",
            "date_kind": "use_by",
            "date_value": "2026-09-15",
            "date_source": "label_ocr",
            "date_source_detail": "포장지 표시",
            "user_confirmed": True,
        },
    )

    assert updated.status_code == 201
    payload = updated.json()
    assert payload["id"] == food_id
    assert payload["quantity"] == 3
    assert payload["unit"] == "팩"
    assert payload["category"] == "가공식품"
    assert payload["date_assertion"]["kind"] == "use_by"
    assert payload["date_assertion"]["value"] == "2026-09-15"
    assert payload["date_assertion_history"][0]["kind"] == "unknown"

    conflicting = client.post(
        "/api/foods",
        json={
            "lot_action": "correct",
            "target_food_id": food_id,
            "canonical_name": "대상 lot 식품",
            "date_kind": "use_by",
            "date_value": "2026-09-16",
            "date_source": "label_ocr",
            "date_source_detail": "다른 포장지 표시",
            "user_confirmed": True,
        },
    )
    assert conflicting.status_code == 409
    assert conflicting.json()["detail"]["code"] == "food_date_already_confirmed"
    retained = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == food_id)
    assert retained["date_assertion"]["value"] == "2026-09-15"
    assert len(client.get(f"/api/foods/{food_id}/product-info/events").json()) == 1


def test_manual_food_requires_target_when_multiple_lots_share_a_product_name() -> None:
    first = client.post(
        "/api/foods",
        json={"canonical_name": "동일 상품 lot", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    second = client.post(
        "/api/foods",
        json={"canonical_name": "동일 상품 lot", "quantity": 2, "unit": "개", "storage_type": "ambient"},
    )
    assert first.status_code == 201
    assert second.status_code == 201

    ambiguous = client.post(
        "/api/foods",
        json={
            "canonical_name": "동일 상품 lot",
            "date_kind": "use_by",
            "date_value": "2026-09-20",
            "date_source": "label_ocr",
            "date_source_detail": "포장지 표시",
            "user_confirmed": True,
        },
    )

    assert ambiguous.status_code == 409
    detail = ambiguous.json()["detail"]
    assert detail["code"] == "food_lot_selection_required"
    assert set(detail["food_ids"]) == {first.json()["id"], second.json()["id"]}


def test_manual_food_correction_does_not_attach_an_estimate_to_a_confirmed_date() -> None:
    response = client.post(
        "/api/foods",
        json={
            "lot_action": "correct",
            "target_food_id": "spinach-1",
            "canonical_name": "시금치",
            "quantity": 1,
            "unit": "팩",
            "storage_type": "refrigerated",
            "date_kind": "unknown",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["date_assertion"]["kind"] == "use_by"
    assert payload["date_assertion"]["value"] == "2026-09-02"
    assert payload["estimated_use_first_window"] is None


def test_manual_food_create_and_correction_use_workspace_mutation_recovery_seam(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    created = client.post(
        "/api/foods",
        json={"canonical_name": "수동 seam 식품", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )
    assert created.status_code == 201

    corrected = client.post(
        "/api/foods",
        json={
            "lot_action": "correct",
            "target_food_id": created.json()["id"],
            "canonical_name": "수동 seam 식품",
            "quantity": 99,
            "unit": "팩",
            "storage_type": "refrigerated",
            "category": "확인 식품",
        },
    )
    assert corrected.status_code == 201
    assert corrected.json()["id"] == created.json()["id"]
    assert calls == 2


def test_manual_food_failure_restores_the_in_memory_lot(monkeypatch) -> None:
    def fail_after_reprioritize():
        for index, record in enumerate(store._base_store._sorted_foods(), start=1):
            record.response.priority = index
        raise RuntimeError("simulated-manual-food-save-failure")

    monkeypatch.setattr(store._base_store, "reprioritize", fail_after_reprioritize)
    response = client.post(
        "/api/foods",
        json={"canonical_name": "저장 실패 식품", "quantity": 1, "unit": "개", "storage_type": "ambient"},
    )

    assert response.status_code == 503
    assert client.get("/api/inventory/search", params={"q": "저장 실패 식품"}).json()["total"] == 0


def test_manual_food_final_flush_failure_restores_lot_and_idempotency_record() -> None:
    request = {
        "lot_action": "create",
        "canonical_name": "수동 flush 실패 식품",
        "quantity": 1,
        "unit": "개",
        "storage_type": "ambient",
    }
    headers = {"Idempotency-Key": "manual-food-final-flush-failure-1"}

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated manual food final persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.post("/api/foods", headers=headers, json=request)

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "manual_food_persistence_unavailable"
    assert client.get("/api/inventory/search", params={"q": request["canonical_name"]}).json()["total"] == 0
    assert store.manual_food_operations == {}

    retried = client.post("/api/foods", headers=headers, json=request)
    assert retried.status_code == 201
    replay = client.post("/api/foods", headers=headers, json=request)
    assert replay.status_code == 201
    assert replay.headers["x-idempotency-replayed"] == "true"
    assert replay.json() == retried.json()


def test_manual_food_records_gs1_barcode_and_lot_provenance() -> None:
    raw_scan = "(01)08801114167523(17)260902(10)LOT-7"
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "국산콩 두부",
            "quantity": 1,
            "unit": "모",
            "storage_type": "refrigerated",
            "category": "두부·콩",
            "brand": "풀무원",
            "date_kind": "use_by",
            "date_value": "2026-09-02",
            "date_source": "gs1",
            "date_source_detail": "gs1",
            "barcode": raw_scan,
            "barcode_lot": "LOT-7",
            "user_confirmed": True,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["barcode"] == raw_scan
    assert payload["barcode_lot"] == "LOT-7"
    assert payload["date_assertion"]["source"] == "gs1"
    assert payload["date_assertion"]["source_detail"] == "GS1 AI 17 · LOT-7"


def test_manual_food_records_product_candidate_provenance_without_promoting_date() -> None:
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "오뚜기 빵가루",
            "quantity": 1,
            "unit": "개",
            "storage_type": "ambient",
            "category": "가공식품",
            "brand": "오뚜기",
            "product_provenance": {
                "source": "open_food_facts",
                "source_url": "https://world.openfoodfacts.org/product/8801045426204",
                "confidence": 0.62,
                "note": "Open Food Facts 사용자 기여 데이터 후보; 실제 라벨 확인 필요",
                "storage_hint": None,
                "source_freshness": "current",
            },
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["product_provenance"]["source"] == "open_food_facts"
    assert payload["product_provenance"]["confidence"] == 0.62
    assert payload["product_provenance"]["source_freshness"] == "current"
    assert payload["product_provenance"]["storage_hint"] is None
    assert payload["date_assertion"]["kind"] == "unknown"
    dashboard_item = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == payload["id"])
    assert dashboard_item["product_provenance"]["source_url"].startswith("https://")
    events = client.get(f"/api/foods/{payload['id']}/product-provenance/events")
    assert events.status_code == 200
    assert events.json()[0]["action"] == "applied"
    assert events.json()[0]["actor_role"] == "guest"
    assert events.json()[0]["after"]["source"] == "open_food_facts"

    replaced = client.post(
        "/api/foods",
        json={
            "lot_action": "correct",
            "target_food_id": payload["id"],
            "canonical_name": "오뚜기 빵가루",
            "quantity": 1,
            "unit": "개",
            "storage_type": "ambient",
            "category": "가공식품",
            "brand": "오뚜기",
            "product_provenance": {
                "source": "mfds_c005",
                "source_url": "https://foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C005",
                "confidence": 0.8,
                "note": "legacy candidate replacement",
                "storage_hint": "ambient",
                "source_freshness": "legacy",
            },
        },
    )
    assert replaced.status_code == 201
    history = client.get(f"/api/foods/{payload['id']}/product-provenance/events").json()
    assert [event["action"] for event in history] == ["replaced", "applied"]
    assert history[0]["before"]["source"] == "open_food_facts"
    assert history[0]["after"]["source"] == "mfds_c005"
    cleared = client.delete(f"/api/foods/{payload['id']}/product-provenance")
    assert cleared.status_code == 200
    assert cleared.json()["product_provenance"] is None
    history_after_clear = client.get(f"/api/foods/{payload['id']}/product-provenance/events").json()
    assert [event["action"] for event in history_after_clear] == ["removed", "replaced", "applied"]
    assert history_after_clear[0]["before"]["source"] == "mfds_c005"
    assert history_after_clear[0]["after"] is None
    exported = client.get("/api/account/export")
    assert exported.status_code == 200
    assert len(exported.json()["product_provenance_events"]) == 3


def test_product_info_correction_clears_source_and_preserves_date_and_storage() -> None:
    created = client.post(
        "/api/foods",
        json={
            "canonical_name": "잘못 읽힌 상품명",
            "quantity": 2,
            "unit": "개",
            "storage_type": "refrigerated",
            "category": "기타",
            "brand": "기존 브랜드",
            "product_provenance": {
                "source": "open_food_facts",
                "source_url": "https://world.openfoodfacts.org/product/8801045426204",
                "confidence": 0.62,
                "note": "후보 정보",
                "storage_hint": "refrigerated",
                "source_freshness": "current",
            },
        },
    )
    assert created.status_code == 201
    food_id = created.json()["id"]

    updated = client.patch(
        f"/api/foods/{food_id}/product-info",
        json={"canonical_name": "사용자 확인 상품명", "brand": "확인한 브랜드", "category": "가공식품"},
    )

    assert updated.status_code == 200
    payload = updated.json()
    assert payload["canonical_name"] == "사용자 확인 상품명"
    assert payload["brand"] == "확인한 브랜드"
    assert payload["category"] == "가공식품"
    assert payload["quantity"] == 2
    assert payload["storage_type"] == "refrigerated"
    assert payload["product_provenance"] is None
    assert payload["date_assertion"]["kind"] == "unknown"

    info_events = client.get(f"/api/foods/{food_id}/product-info/events")
    assert info_events.status_code == 200
    assert info_events.json()[0]["action"] == "updated"
    assert info_events.json()[0]["before"]["canonical_name"] == "잘못 읽힌 상품명"
    assert info_events.json()[0]["after"]["canonical_name"] == "사용자 확인 상품명"
    provenance_events = client.get(f"/api/foods/{food_id}/product-provenance/events").json()
    assert provenance_events[0]["action"] == "removed"
    assert provenance_events[0]["before"]["source"] == "open_food_facts"
    assert provenance_events[0]["after"] is None

    no_op = client.patch(
        f"/api/foods/{food_id}/product-info",
        json={"canonical_name": "사용자 확인 상품명", "brand": "확인한 브랜드", "category": "가공식품"},
    )
    assert no_op.status_code == 200
    assert len(client.get(f"/api/foods/{food_id}/product-info/events").json()) == 1


def test_product_info_update_uses_workspace_mutation_recovery_seam(monkeypatch) -> None:
    calls = 0
    original_run = main_module.workspace_mutation.run

    def observed_run(mutation):
        nonlocal calls
        calls += 1
        return original_run(mutation)

    monkeypatch.setattr(main_module.workspace_mutation, "run", observed_run)

    response = client.patch(
        "/api/foods/spinach-1/product-info",
        json={"canonical_name": "상품 정보 seam 시금치", "brand": "확인 브랜드", "category": "확인 분류"},
    )

    assert response.status_code == 200
    assert response.json()["canonical_name"] == "상품 정보 seam 시금치"
    assert calls == 1


def test_product_info_final_flush_failure_restores_profile_and_allows_retry() -> None:
    original = store.foods["spinach-1"].response.model_copy(deep=True)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated product-info persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        failed = client.patch(
            "/api/foods/spinach-1/product-info",
            json={"canonical_name": "실패한 상품명", "brand": "실패 브랜드", "category": "실패 분류"},
        )

    assert failed.status_code == 503
    assert failed.json()["detail"]["code"] == "product_info_persistence_unavailable"
    assert store.foods["spinach-1"].response == original
    assert client.get("/api/foods/spinach-1/product-info/events").json() == []

    retried = client.patch(
        "/api/foods/spinach-1/product-info",
        json={"canonical_name": "확인한 상품명", "brand": "확인 브랜드", "category": "확인 분류"},
    )

    assert retried.status_code == 200
    assert retried.json()["canonical_name"] == "확인한 상품명"
    assert len(client.get("/api/foods/spinach-1/product-info/events").json()) == 1


def test_printed_date_storage_condition_warns_without_rewriting_date_on_move() -> None:
    created = client.post(
        "/api/foods",
        json={
            "canonical_name": "보관조건 확인 식품",
            "quantity": 1,
            "unit": "팩",
            "storage_type": "ambient",
            "category": "신선식품",
            "brand": "라벨 브랜드",
            "date_kind": "use_by",
            "date_value": "2026-09-12",
            "date_source": "label_ocr",
            "date_source_detail": "유효년월일 · 라벨 확인",
            "applicable_storage_type": "ambient",
            "storage_condition_text": "실온 보관",
            "user_confirmed": True,
        },
    )
    assert created.status_code == 201
    food_id = created.json()["id"]
    assert created.json()["date_assertion"]["applicable_storage_type"] == "ambient"
    assert created.json()["date_assertion"]["storage_condition_text"] == "실온 보관"

    moved = client.post(
        f"/api/foods/{food_id}/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated"},
    )
    assert moved.status_code == 200
    dashboard_food = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == food_id)
    assert dashboard_food["storage_type"] == "refrigerated"
    assert dashboard_food["date_assertion"]["kind"] == "use_by"
    assert dashboard_food["date_assertion"]["value"] == "2026-09-12"
    assert dashboard_food["date_assertion"]["applicable_storage_type"] == "ambient"
    assert dashboard_food["date_assertion"]["storage_condition_text"] == "실온 보관"


def test_manual_food_normalizes_front_gs1_source_token_without_lot_field() -> None:
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "GS1 토큰 식품",
            "date_kind": "use_by",
            "date_value": "2026-09-02",
            "date_source": "gs1",
            "date_source_detail": "gs1:LOT-8",
            "user_confirmed": True,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["barcode_lot"] is None
    assert payload["date_assertion"]["source_detail"] == "GS1 AI 17 · LOT-8"


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


def test_explicit_label_lot_correction_replaces_confirmed_date_and_keeps_history() -> None:
    response = client.post(
        "/api/foods",
        json={
            "canonical_name": "시금치",
            "lot_action": "correct",
            "target_food_id": "spinach-1",
            "quantity": 1,
            "unit": "팩",
            "storage_type": "ambient",
            "category": "기타",
            "brand": "라벨 확인 필요",
            "image_path": "/assets/food/tomato.png",
            "date_kind": "sell_by",
            "date_value": "2026-09-13",
            "date_source": "label_ocr",
            "date_source_detail": "포장지 유통기한",
            "applicable_storage_type": "ambient",
            "storage_condition_text": "직사광선을 피해 실온보관",
            "user_confirmed": True,
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["id"] == "spinach-1"
    assert payload["quantity"] == 1
    assert payload["unit"] == "팩"
    assert payload["date_assertion"]["kind"] == "sell_by"
    assert payload["date_assertion"]["value"] == "2026-09-13"
    assert payload["date_assertion"]["source"] == "label_ocr"
    assert payload["date_assertion"]["applicable_storage_type"] == "ambient"
    assert payload["storage_type"] == "ambient"
    assert payload["brand"] == "국내산 시금치"
    assert payload["category"] == "채소"
    assert payload["image_path"] == "/assets/food/spinach.png"
    assert payload["date_assertion_history"][0]["value"] == "2026-09-02"
    assert len(client.get("/api/dashboard").json()["inventory"]) == 7


def test_label_lot_correction_persistence_failure_restores_target_identity_and_date() -> None:
    def fail_flush(_store) -> None:
        raise RuntimeError("simulated label correction persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.post(
            "/api/foods",
            json={
                "canonical_name": "시금치",
                "lot_action": "correct",
                "target_food_id": "spinach-1",
                "quantity": 1,
                "unit": "팩",
                "storage_type": "ambient",
                "category": "기타",
                "brand": "라벨 확인 필요",
                "image_path": "/assets/food/tomato.png",
                "date_kind": "sell_by",
                "date_value": "2026-09-13",
                "date_source": "label_ocr",
                "date_source_detail": "포장지 유통기한",
                "applicable_storage_type": "ambient",
                "storage_condition_text": "직사광선을 피해 실온보관",
                "user_confirmed": True,
            },
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "manual_food_persistence_unavailable"
    retained = store.foods["spinach-1"].response
    assert retained.brand == "국내산 시금치"
    assert retained.storage_type == "refrigerated"
    assert retained.date_assertion.value == date(2026, 9, 2)
    assert retained.date_assertion_history == []


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


def test_user_can_confirm_estimated_date_as_sell_by() -> None:
    response = client.patch(
        "/api/foods/tofu-1/date-assertion",
        json={"kind": "sell_by", "date_value": "2026-09-12", "source_detail": "포장지에서 유통기한 확인"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["date_assertion"]["kind"] == "sell_by"
    assert payload["date_assertion"]["value"] == "2026-09-12"
    assert payload["date_assertion"]["source"] == "user_input"
    assert payload["estimated_use_first_window"] is None


def test_repeating_the_same_date_confirmation_is_safe_after_a_lost_response() -> None:
    payload = {"kind": "use_by", "date_value": "2026-09-12", "source_detail": "포장지에서 사용자 확인"}

    first = client.patch("/api/foods/tofu-1/date-assertion", json=payload)
    replay = client.patch("/api/foods/tofu-1/date-assertion", json=payload)

    assert first.status_code == 200
    assert replay.status_code == 200
    assert replay.json() == first.json()
    assert len(replay.json()["date_assertion_history"]) == 1


def test_user_cannot_overwrite_a_printed_date_from_the_manual_correction_path() -> None:
    response = client.patch(
        "/api/foods/spinach-1/date-assertion",
        json={"kind": "use_by", "date_value": "2026-09-30"},
    )
    assert response.status_code == 409
    current = next(item for item in client.get("/api/dashboard").json()["inventory"] if item["id"] == "spinach-1")
    assert current["date_assertion"]["value"] == "2026-09-02"


def test_date_confirmation_flush_failure_restores_the_previous_assertion() -> None:
    def fail_flush(_store) -> None:
        raise RuntimeError("simulated date persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.patch(
            "/api/foods/tofu-1/date-assertion",
            json={"kind": "use_by", "date_value": "2026-09-30", "source_detail": "포장지에서 사용자 확인"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "food_date_persistence_unavailable"
    retained = store.foods["tofu-1"].response
    assert retained.date_assertion.kind == "unknown"
    assert retained.date_assertion.value is None
    assert retained.date_assertion_history == []


def test_meal_preferences_flush_failure_restores_the_previous_conditions() -> None:
    def fail_flush(_store) -> None:
        raise RuntimeError("simulated meal-preferences persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.put(
            "/api/meal-preferences",
            json={"avoid_allergens": ["soy", "milk"]},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "meal_preferences_persistence_unavailable"
    assert client.get("/api/meal-preferences").json() == {"avoid_allergens": []}


def test_notification_preferences_flush_failure_restores_the_previous_settings() -> None:
    before = client.get("/api/notification-preferences").json()

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated notification-preferences persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.put(
            "/api/notification-preferences",
            json={
                "in_app_enabled": False,
                "push_enabled": True,
                "lead_days": 7,
                "timezone": "UTC",
                "quiet_hours_start": "22:00",
                "quiet_hours_end": "07:00",
            },
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "notification_preferences_persistence_unavailable"
    assert client.get("/api/notification-preferences").json() == before


def test_push_subscription_register_flush_failure_restores_the_previous_connections() -> None:
    request = {"endpoint": "https://push.example.test/recovery-register", "p256dh": "p" * 32, "auth": "a" * 16}

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated push-subscription register outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.put("/api/push/subscriptions", json=request)

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "push_subscription_persistence_unavailable"
    assert client.get("/api/push/subscriptions").json() == []


def test_push_subscription_delete_flush_failure_restores_the_previous_connection() -> None:
    request = {"endpoint": "https://push.example.test/recovery-delete", "p256dh": "p" * 32, "auth": "a" * 16}
    registered = client.put("/api/push/subscriptions", json=request)
    assert registered.status_code == 200
    endpoint_fingerprint = registered.json()["endpoint_fingerprint"]

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated push-subscription delete outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.delete(f"/api/push/subscriptions/{endpoint_fingerprint}")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "push_subscription_persistence_unavailable"
    assert [item["endpoint_fingerprint"] for item in client.get("/api/push/subscriptions").json()] == [endpoint_fingerprint]


def test_notification_read_flush_failure_restores_the_unread_state() -> None:
    notifications = client.get("/api/notifications?unread_only=true")
    assert notifications.status_code == 200
    notification_id = notifications.json()[0]["id"]

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated notification-read persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.post(f"/api/notifications/{notification_id}/read")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "notification_read_persistence_unavailable"
    remaining = client.get("/api/notifications?unread_only=true")
    assert any(item["id"] == notification_id for item in remaining.json())


def test_notification_revision_probe_is_payload_free_and_advances_after_read() -> None:
    initial = client.get("/api/notifications/revision")
    assert initial.status_code == 200
    assert set(initial.json()) == {"revision"}
    initial_revision = initial.json()["revision"]
    assert initial.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(initial_revision)

    unread = client.get("/api/notifications?unread_only=true")
    assert unread.status_code == 200
    notification_id = unread.json()[0]["id"]
    marked = client.post(f"/api/notifications/{notification_id}/read")
    assert marked.status_code == 200

    after = client.get("/api/notifications/revision")
    assert after.status_code == 200
    assert after.json()["revision"] > initial_revision
    assert after.headers[WORKSPACE_REVISION_RESPONSE_HEADER] == str(after.json()["revision"])


def test_mark_all_notifications_flush_failure_restores_all_unread_states() -> None:
    unread_before = client.get("/api/notifications?unread_only=true").json()
    assert unread_before

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated mark-all notification persistence outage")

    with patch.object(type(store), "flush", fail_flush):
        response = client.post("/api/notifications/read-all")

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "notification_read_persistence_unavailable"
    unread_after = client.get("/api/notifications?unread_only=true").json()
    assert {item["id"] for item in unread_after} == {item["id"] for item in unread_before}


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


def test_image_intake_exposes_safe_bbox_links_without_returning_ocr_text(monkeypatch) -> None:
    asset = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "assets" / "food" / "spinach.png"

    class CapturingOcr:
        def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
            return OcrRun(
                "complete",
                "test-ocr",
                [
                    OcrObservation("001 시금치 1팩", 0.96, (0.05, 0.80, 0.30, 0.03)),
                    OcrObservation("2,980 1 2,980", 0.94, (0.44, 0.76, 0.36, 0.03)),
                ],
                model_version="test-v1",
            )

    monkeypatch.setattr(main_module, "ocr_engine", CapturingOcr())
    response = client.post(
        "/api/receipts/intake",
        files={"file": ("receipt.jpg", asset.read_bytes(), "image/jpeg")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "review_required"
    assert payload["review_observations"] == [
        {"id": "obs-1", "bbox": [0.05, 0.8, 0.3, 0.03], "confidence": 0.96},
        {"id": "obs-2", "bbox": [0.44, 0.76, 0.36, 0.03], "confidence": 0.94},
    ]
    assert all("text" not in observation for observation in payload["review_observations"])
    assert payload["draft"]["lines"][0]["source_observation_ids"] == ["obs-1", "obs-2"]


def test_label_intake_exposes_date_bbox_links_without_returning_observation_text(monkeypatch) -> None:
    asset = Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "assets" / "food" / "spinach.png"

    class CapturingOcr:
        def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
            return OcrRun(
                "complete",
                "test-ocr",
                [
                    OcrObservation("제품명 시금치", 0.97, (0.08, 0.72, 0.24, 0.05)),
                    OcrObservation("소비기한 2026.09.02", 0.94, (0.18, 0.38, 0.46, 0.08)),
                    OcrObservation("냉장보관", 0.93, (0.12, 0.25, 0.22, 0.04)),
                    OcrObservation("LOT20260902A", 0.93, (0.56, 0.11, 0.28, 0.04)),
                ],
                model_version="test-label-v1",
            )

    monkeypatch.setattr(main_module, "ocr_engine", CapturingOcr())
    response = client.post(
        "/api/labels/intake",
        files={"file": ("label.jpg", asset.read_bytes(), "image/jpeg")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "review_required"
    assert payload["date_candidates"][0]["kind"] == "use_by"
    assert payload["storage_hint"] == "refrigerated"
    assert payload["storage_condition_text"] == "냉장보관"
    assert payload["date_candidates"][0]["source_observation_ids"] == ["obs-2"]
    assert payload["consumption_date_candidate"]["source_observation_ids"] == ["obs-2"]
    assert payload["review_observations"] == [
        {"id": "obs-2", "bbox": [0.18, 0.38, 0.46, 0.08], "confidence": 0.94},
    ]
    assert all("text" not in observation for observation in payload["review_observations"])


def test_image_intake_normalizes_exif_orientation_before_ocr(monkeypatch) -> None:
    from io import BytesIO

    from PIL import Image

    image = Image.new("RGB", (400, 800), "white")
    buffer = BytesIO()
    exif = image.getexif()
    exif[274] = 6
    image.save(buffer, format="JPEG", exif=exif)
    captured: dict[str, bytes] = {}

    class CapturingOcr:
        def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
            captured["image"] = image_bytes
            return OcrRun(
                "complete",
                "test-ocr",
                [OcrObservation("001 시금치 1팩", 1.0), OcrObservation("2,980 1 2,980", 1.0)],
                model_version="test-v1",
            )

    monkeypatch.setattr(main_module, "ocr_engine", CapturingOcr())
    response = client.post(
        "/api/receipts/intake",
        files={"file": ("rotated.jpg", buffer.getvalue(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["quality"]["orientation_corrected"] is True
    with Image.open(BytesIO(captured["image"])) as oriented:
        assert oriented.size == (800, 400)


def test_image_intake_reports_low_contrast_ocr_preprocessing_profile(monkeypatch) -> None:
    from io import BytesIO

    from PIL import Image, ImageDraw

    image = Image.new("RGB", (800, 600), "#d8d8d8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((100, 80, 700, 520), outline="#c7c7c7", width=8)
    draw.line((140, 180, 660, 180), fill="#c7c7c7", width=6)
    draw.line((140, 320, 660, 320), fill="#c7c7c7", width=6)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    captured: dict[str, bytes] = {}

    class CapturingOcr:
        def extract(self, image_bytes: bytes, filename: str = "upload.jpg") -> OcrRun:
            captured["image"] = image_bytes
            return OcrRun(
                "complete",
                "test-ocr",
                [OcrObservation("001 시금치 1팩", 1.0), OcrObservation("2,980 1 2,980", 1.0)],
                model_version="test-v1",
            )

    monkeypatch.setattr(main_module, "ocr_engine", CapturingOcr())
    response = client.post(
        "/api/receipts/intake",
        files={"file": ("low-contrast.jpg", buffer.getvalue(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "review_required"
    assert response.json()["ocr_input_profile"] == "low_contrast_enhanced"
    assert response.json()["file_sha256"] == sha256(buffer.getvalue()).hexdigest()
    with Image.open(BytesIO(captured["image"])) as prepared:
        assert prepared.format == "PNG"
        assert prepared.size == (800, 600)
