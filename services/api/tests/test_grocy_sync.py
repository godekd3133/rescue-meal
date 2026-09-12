from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

import app.main as main_module
from app.auth import issue_guest_token
from app.grocy import GrocyError
from app.main import CommitTransactionRecord, GrocyLocationMappingResponse, GrocyOutboxRecord, GrocyProductMappingResponse, StorageEventResponse


client = TestClient(main_module.app)


def setup_function() -> None:
    main_module.store.reset()


def _receipt_draft() -> dict:
    response = client.post(
        "/api/receipts/drafts",
        json={
            "source_filename": "grocy-sync.jpg",
            "purchased_at": "2026-09-02T09:00:00+00:00",
            "lines": [
                {
                    "raw_name": "곤약",
                    "quantity": 1,
                    "unit": "팩",
                    "total_price": 1200,
                    "line_type": "product",
                    "canonical_name": "곤약",
                    "match_confidence": 0.99,
                }
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


def _demo_headers() -> dict[str, str]:
    token, _ = issue_guest_token("demo")
    return {"Authorization": f"Bearer {token}"}


def _seed_stale_inflight(outbox_id: str = "outbox-inflight-1", event_id: str = "event-inflight-1") -> None:
    now = datetime.now(timezone.utc)
    started_at = now - timedelta(minutes=5)
    main_module.store.storage_events.append(
        StorageEventResponse(
            id=event_id,
            food_id="chicken-1",
            event_type="consumed",
            from_storage_type="frozen",
            to_storage_type=None,
            quantity=1,
            occurred_at=started_at,
        )
    )
    main_module.store.grocy_outbox[outbox_id] = GrocyOutboxRecord(
        id=outbox_id,
        operation="consume",
        aggregate_id="chicken-1",
        idempotency_key=f"storage-event:{event_id}",
        canonical_name="닭가슴살",
        grocy_product_id=88,
        quantity=1,
        unit="팩",
        payload={"storage_event_id": event_id, "from_storage_type": "frozen"},
        status="in_flight",
        attempts=1,
        in_flight_started_at=started_at,
        last_in_flight_started_at=started_at,
        created_at=started_at,
        updated_at=started_at,
    )
    main_module.store.flush()


class SuccessGrocy:
    def __init__(self) -> None:
        self.calls: list[tuple[int, float, str | None]] = []

    def add_product(self, product_id: int, amount: float, *, note: str | None = None, **kwargs):
        del kwargs
        self.calls.append((product_id, amount, note))
        return {"transaction_id": "grocy-tx-1"}


class FailingGrocy:
    def __init__(self) -> None:
        self.calls = 0

    def add_product(self, product_id: int, amount: float, **kwargs):
        del product_id, amount, kwargs
        self.calls += 1
        raise GrocyError("upstream status only")


class EventGrocy:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def consume_product(self, product_id: int, amount: float, **kwargs):
        self.calls.append(("consume", product_id, amount, kwargs))
        return {"transaction_id": "grocy-consume-1"}

    def open_product(self, product_id: int, amount: float, **kwargs):
        self.calls.append(("open", product_id, amount, kwargs))
        return {"transaction_id": "grocy-open-1"}

    def transfer_product(self, product_id: int, amount: float, location_id_from: int, location_id_to: int, **kwargs):
        self.calls.append(("transfer", product_id, amount, location_id_from, location_id_to, kwargs))
        return {"transaction_id": "grocy-transfer-1"}


def test_receipt_commit_queues_mapping_gap_without_calling_grocy(monkeypatch) -> None:
    grocy = SuccessGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    draft = _receipt_draft()

    committed = client.post(
        f"/api/receipts/{draft['id']}/commit",
        json={"confirmed_line_ids": ["line-1"]},
    )

    assert committed.status_code == 200
    assert committed.json()["grocy_sync_status"] == "needs_mapping"
    assert grocy.calls == []
    blocked = client.get("/api/integrations/grocy/outbox?status=blocked")
    assert blocked.status_code == 200
    assert len(blocked.json()) == 1
    assert blocked.json()[0]["last_error"] == "Grocy product mapping과 단위 확인이 필요합니다."


def test_grocy_product_mapping_flush_failure_restores_mapping_outbox_and_audit() -> None:
    previous = GrocyProductMappingResponse(
        canonical_name="곤약",
        grocy_product_id=7,
        grocy_unit="팩",
        source="user_confirmed",
        updated_by="previous-operator",
        updated_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
    )
    main_module.store.grocy_mappings["곤약"] = previous
    main_module.store.commit_transactions["commit-recovery"] = CommitTransactionRecord(
        id="commit-recovery",
        receipt_id="receipt-recovery",
        fingerprint="fingerprint-recovery",
        status="committed",
        grocy_sync_status="needs_mapping",
    )
    main_module.store.grocy_outbox["mapping-recovery-outbox"] = GrocyOutboxRecord(
        id="mapping-recovery-outbox",
        operation="receipt_add",
        aggregate_id="food-1",
        idempotency_key="receipt:recovery:lot:food-1",
        canonical_name="곤약",
        grocy_product_id=None,
        quantity=1,
        unit="팩",
        payload={"commit_transaction_id": "commit-recovery"},
        status="blocked",
        last_error="mapping required",
        created_at=previous.updated_at,
        updated_at=previous.updated_at,
    )
    main_module.store.flush()
    before_audits = list(main_module.store.grocy_mapping_audit_events)

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated Grocy mapping persistence outage")

    with patch.object(type(main_module.store), "flush", fail_flush):
        response = client.put(
            "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
            json={"grocy_product_id": 42, "grocy_unit": "팩"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "grocy_mapping_persistence_unavailable"
    assert main_module.store.grocy_mappings["곤약"] == previous
    assert main_module.store.grocy_outbox["mapping-recovery-outbox"].grocy_product_id is None
    assert main_module.store.commit_transactions["commit-recovery"].grocy_sync_status == "needs_mapping"
    assert main_module.store.grocy_mapping_audit_events == before_audits


def test_grocy_location_mapping_flush_failure_restores_previous_mapping() -> None:
    previous = GrocyLocationMappingResponse(
        storage_type="refrigerated",
        grocy_location_id=20,
        source="user_confirmed",
        updated_at=datetime(2026, 9, 2, tzinfo=timezone.utc),
    )
    main_module.store.grocy_location_mappings["refrigerated"] = previous
    main_module.store.flush()

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated Grocy location persistence outage")

    with patch.object(type(main_module.store), "flush", fail_flush):
        response = client.put(
            "/api/integrations/grocy/location-mappings/refrigerated",
            json={"grocy_location_id": 99, "source": "user_confirmed"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "grocy_location_mapping_persistence_unavailable"
    assert main_module.store.grocy_location_mappings["refrigerated"] == previous


def test_grocy_reconciliation_flush_failure_restores_the_previous_outbox_state() -> None:
    _seed_stale_inflight("reconciliation-recovery-outbox", "reconciliation-recovery-event")
    scanned = client.post(
        "/api/integrations/grocy/outbox/reconciliation-scan",
        headers=_demo_headers(),
        json={"stale_after_seconds": 60, "limit": 10},
    )
    assert scanned.status_code == 200
    assert scanned.json()["records"][0]["status"] == "reconciliation_required"

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated Grocy reconciliation persistence outage")

    with patch.object(type(main_module.store), "flush", fail_flush):
        response = client.post(
            "/api/integrations/grocy/outbox/reconciliation-recovery-outbox/reconcile",
            headers=_demo_headers(),
            json={"decision": "already_applied", "grocy_transaction_id": "tx-recovery"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "grocy_outbox_persistence_unavailable"
    retained = main_module.store.grocy_outbox["reconciliation-recovery-outbox"]
    assert retained.status == "reconciliation_required"
    assert retained.reconciliation_count == 0
    assert retained.grocy_transaction_id is None


def test_grocy_dead_letter_retry_flush_failure_restores_the_previous_outbox_state() -> None:
    now = datetime.now(timezone.utc)
    main_module.store.grocy_outbox["dead-letter-recovery-outbox"] = GrocyOutboxRecord(
        id="dead-letter-recovery-outbox",
        operation="receipt_add",
        aggregate_id="food-2",
        idempotency_key="receipt:dead-letter-recovery:lot:food-2",
        canonical_name="복구 대기 식품",
        grocy_product_id=12,
        quantity=1,
        unit="개",
        payload={},
        status="dead_letter",
        attempts=3,
        last_error="Grocy stock sync 실패; reconciliation 확인이 필요합니다.",
        created_at=now,
        updated_at=now,
    )
    main_module.store.flush()

    def fail_flush(_store) -> None:
        raise RuntimeError("simulated Grocy retry persistence outage")

    with patch.object(type(main_module.store), "flush", fail_flush):
        response = client.post(
            "/api/integrations/grocy/outbox/dead-letter-recovery-outbox/retry",
            headers=_demo_headers(),
            json={"operator_note": "복구 재시도"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "grocy_outbox_persistence_unavailable"
    retained = main_module.store.grocy_outbox["dead-letter-recovery-outbox"]
    assert retained.status == "dead_letter"
    assert retained.attempts == 3
    assert retained.manual_retry_count == 0


def test_mapping_with_wrong_unit_stays_blocked_without_external_call(monkeypatch) -> None:
    grocy = SuccessGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    draft = _receipt_draft()
    committed = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert committed.status_code == 200

    mapping = client.put(
        "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
        json={"grocy_product_id": 42, "grocy_unit": "개"},
    )

    assert mapping.status_code == 200
    assert grocy.calls == []
    blocked = client.get("/api/integrations/grocy/outbox?status=blocked").json()
    assert len(blocked) == 1
    assert blocked[0]["grocy_product_id"] is None


def test_product_mapping_list_supports_search_and_actor_provenance() -> None:
    first = client.put(
        "/api/integrations/grocy/mappings/%EB%8B%AD%EA%B0%80%EC%8A%B4%EC%82%B4",
        headers=_demo_headers(),
        json={"grocy_product_id": 88, "grocy_unit": "팩"},
    )
    updated = client.put(
        "/api/integrations/grocy/mappings/%EB%8B%AD%EA%B0%80%EC%8A%B4%EC%82%B4",
        headers=_demo_headers(),
        json={"grocy_product_id": 89, "grocy_unit": "개"},
    )
    second = client.put(
        "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
        headers=_demo_headers(),
        json={"grocy_product_id": 42, "grocy_unit": "팩"},
    )
    filtered = client.get("/api/integrations/grocy/mappings?q=%EB%8B%AD")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["updated_by"] == "guest"
    assert first.json()["updated_by_email"] is None
    assert updated.status_code == 200
    events = client.get("/api/integrations/grocy/mappings/%EB%8B%AD%EA%B0%80%EC%8A%B4%EC%82%B4/events")
    assert events.status_code == 200
    assert len(events.json()) == 2
    assert events.json()[0]["action"] == "updated"
    assert events.json()[0]["actor_id"] == "guest"
    assert events.json()[0]["before"]["grocy_product_id"] == 88
    assert events.json()[0]["before"]["grocy_unit"] == "팩"
    assert events.json()[0]["after"]["grocy_product_id"] == 89
    assert events.json()[0]["after"]["grocy_unit"] == "개"
    assert events.json()[1]["action"] == "created"
    assert events.json()[1]["before"] is None
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["canonical_name"] == "닭가슴살"


def test_mapping_unblocks_outbox_and_processor_reads_transaction_id(monkeypatch) -> None:
    grocy = SuccessGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    draft = _receipt_draft()
    committed = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert committed.status_code == 200
    transaction_id = committed.json()["commit_transaction_id"]

    mapping = client.put(
        "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
        json={"grocy_product_id": 42, "grocy_unit": "팩", "source": "user_confirmed"},
    )
    assert mapping.status_code == 200
    assert client.get("/api/integrations/grocy/outbox?status=pending").json()[0]["grocy_product_id"] == 42
    transaction = next(row for row in client.get("/api/commit-transactions").json() if row["id"] == transaction_id)
    assert transaction["grocy_sync_status"] == "queued"

    unauthorized = client.post("/api/integrations/grocy/outbox/process", json={"limit": 10})
    assert unauthorized.status_code == 401
    processed = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 10})

    assert processed.status_code == 200
    assert processed.json()["processed"] == 1
    assert processed.json()["succeeded"] == 1
    assert grocy.calls[0][0:2] == (42, 1)
    assert grocy.calls[0][2].startswith(f"rescue-meal:receipt:{draft['id']}:lot:{committed.json()['created_lot_ids'][0]}")
    outbox = client.get("/api/integrations/grocy/outbox?status=succeeded").json()
    assert len(outbox) == 1
    assert outbox[0]["grocy_transaction_id"] == "grocy-tx-1"
    transaction = next(row for row in client.get("/api/commit-transactions").json() if row["id"] == transaction_id)
    assert transaction["grocy_sync_status"] == "succeeded"


def test_processor_respects_workspace_worker_lease(monkeypatch) -> None:
    grocy = SuccessGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    draft = _receipt_draft()
    committed = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert committed.status_code == 200
    mapping = client.put(
        "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
        json={"grocy_product_id": 42, "grocy_unit": "팩"},
    )
    assert mapping.status_code == 200
    assert main_module.store.acquire_grocy_worker_lease(
        lease_key="grocy-outbox",
        worker_id="worker-other",
        lease_seconds=120,
    ) is True

    blocked = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 1})

    assert blocked.status_code == 409
    assert grocy.calls == []
    assert main_module.store.release_grocy_worker_lease(lease_key="grocy-outbox", worker_id="worker-other") is True
    processed = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 1})
    assert processed.status_code == 200
    assert processed.json()["succeeded"] == 1


def test_processor_retries_then_dead_letters_after_three_attempts(monkeypatch) -> None:
    grocy = FailingGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    draft = _receipt_draft()
    committed = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert committed.status_code == 200
    mapping = client.put(
        "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
        json={"grocy_product_id": 7, "grocy_unit": "팩"},
    )
    assert mapping.status_code == 200

    first = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 1})
    second = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 1})
    third = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 1})

    assert first.json()["retried"] == 1
    assert second.json()["retried"] == 1
    assert third.json()["dead_lettered"] == 1
    assert grocy.calls == 3
    dead = client.get("/api/integrations/grocy/outbox?status=dead_letter").json()
    assert dead[0]["attempts"] == 3
    assert dead[0]["last_error"] == "Grocy stock sync 실패; reconciliation 확인이 필요합니다."


def test_dead_letter_can_be_requeued_with_manual_retry_audit(monkeypatch) -> None:
    grocy = FailingGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    draft = _receipt_draft()
    committed = client.post(f"/api/receipts/{draft['id']}/commit", json={"confirmed_line_ids": ["line-1"]})
    assert committed.status_code == 200
    mapping = client.put(
        "/api/integrations/grocy/mappings/%EA%B3%A4%EC%95%BD",
        json={"grocy_product_id": 7, "grocy_unit": "팩"},
    )
    assert mapping.status_code == 200
    for _ in range(3):
        assert client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 1}).status_code == 200

    dead = client.get("/api/integrations/grocy/outbox?status=dead_letter").json()[0]
    unauthorized = client.post(f"/api/integrations/grocy/outbox/{dead['id']}/retry", json={})
    assert unauthorized.status_code == 401

    retried = client.post(
        f"/api/integrations/grocy/outbox/{dead['id']}/retry",
        headers=_demo_headers(),
        json={"operator_note": "Grocy 연결을 확인하고 다시 시도"},
    )

    assert retried.status_code == 200
    assert retried.json()["status"] == "pending"
    assert retried.json()["attempts"] == 0
    assert retried.json()["manual_retry_count"] == 1
    assert retried.json()["last_retry_note"] == "Grocy 연결을 확인하고 다시 시도"
    assert retried.json()["last_dead_letter_error"] == "Grocy stock sync 실패; reconciliation 확인이 필요합니다."
    transaction_id = committed.json()["commit_transaction_id"]
    transaction = next(row for row in client.get("/api/commit-transactions").json() if row["id"] == transaction_id)
    assert transaction["grocy_sync_status"] == "queued"


def test_stale_inflight_scan_marks_reconciliation_without_calling_grocy(monkeypatch) -> None:
    grocy = EventGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    _seed_stale_inflight()

    unauthorized = client.post(
        "/api/integrations/grocy/outbox/reconciliation-scan",
        json={"stale_after_seconds": 60, "limit": 10},
    )
    assert unauthorized.status_code == 401

    scanned = client.post(
        "/api/integrations/grocy/outbox/reconciliation-scan",
        headers=_demo_headers(),
        json={"stale_after_seconds": 60, "limit": 10},
    )

    assert scanned.status_code == 200
    assert scanned.json()["scanned"] == 1
    assert scanned.json()["marked"] == 1
    assert scanned.json()["records"][0]["status"] == "reconciliation_required"
    assert scanned.json()["records"][0]["last_error"] == "Grocy 외부 반영 여부 확인이 필요합니다."
    assert grocy.calls == []
    assert main_module.store.storage_events[0].grocy_sync_status == "needs_reconciliation"


def test_reconciliation_already_applied_requires_and_records_transaction_id(monkeypatch) -> None:
    grocy = EventGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    _seed_stale_inflight()
    client.post(
        "/api/integrations/grocy/outbox/reconciliation-scan",
        headers=_demo_headers(),
        json={"stale_after_seconds": 60, "limit": 10},
    )
    outbox_id = "outbox-inflight-1"

    missing_transaction = client.post(
        f"/api/integrations/grocy/outbox/{outbox_id}/reconcile",
        headers=_demo_headers(),
        json={"decision": "already_applied"},
    )
    assert missing_transaction.status_code == 422

    reconciled = client.post(
        f"/api/integrations/grocy/outbox/{outbox_id}/reconcile",
        headers=_demo_headers(),
        json={"decision": "already_applied", "grocy_transaction_id": "grocy-inflight-tx", "operator_note": "Grocy history에서 확인"},
    )

    assert reconciled.status_code == 200
    payload = reconciled.json()
    assert payload["status"] == "succeeded"
    assert payload["grocy_transaction_id"] == "grocy-inflight-tx"
    assert payload["last_reconciliation_decision"] == "already_applied"
    assert payload["last_reconciliation_note"] == "Grocy history에서 확인"
    assert payload["reconciliation_count"] == 1
    assert grocy.calls == []
    assert main_module.store.storage_events[0].grocy_sync_status == "succeeded"


def test_reconciliation_not_applied_requeues_without_external_call(monkeypatch) -> None:
    grocy = EventGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    _seed_stale_inflight()
    client.post(
        "/api/integrations/grocy/outbox/reconciliation-scan",
        headers=_demo_headers(),
        json={"stale_after_seconds": 60, "limit": 10},
    )

    reconciled = client.post(
        "/api/integrations/grocy/outbox/outbox-inflight-1/reconcile",
        headers=_demo_headers(),
        json={"decision": "not_applied", "operator_note": "Grocy history에 반영되지 않음"},
    )

    assert reconciled.status_code == 200
    payload = reconciled.json()
    assert payload["status"] == "pending"
    assert payload["attempts"] == 0
    assert payload["last_reconciliation_decision"] == "not_applied"
    assert payload["last_reconciliation_note"] == "Grocy history에 반영되지 않음"
    assert main_module.store.storage_events[0].grocy_sync_status == "queued"
    assert grocy.calls == []


def test_consumed_and_discarded_events_use_grocy_consume_with_spoiled_flag(monkeypatch) -> None:
    grocy = EventGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    mapping = client.put(
        "/api/integrations/grocy/mappings/%EB%8B%AD%EA%B0%80%EC%8A%B4%EC%82%B4",
        json={"grocy_product_id": 88, "grocy_unit": "팩"},
    )
    assert mapping.status_code == 200

    consumed = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "consumed", "quantity": 1},
    )
    discarded = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "discarded"},
    )

    assert consumed.status_code == 200
    assert discarded.status_code == 200
    assert consumed.json()["grocy_sync_status"] == "queued"
    assert discarded.json()["grocy_sync_status"] == "queued"
    pending = client.get("/api/integrations/grocy/outbox?status=pending").json()
    assert [record["operation"] for record in pending] == ["consume", "consume"]
    assert pending[0]["spoiled"] is True
    assert pending[1]["spoiled"] is False

    processed = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 10})

    assert processed.status_code == 200
    assert processed.json()["succeeded"] == 2
    assert [call[0] for call in grocy.calls] == ["consume", "consume"]
    assert grocy.calls[0][3]["spoiled"] is False
    assert grocy.calls[1][3]["spoiled"] is True
    events = client.get("/api/foods/chicken-1/storage-events").json()
    assert {event["grocy_sync_status"] for event in events} == {"succeeded"}


def test_opened_event_uses_grocy_open_and_transfer_requires_location_mappings(monkeypatch) -> None:
    grocy = EventGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    mapping = client.put(
        "/api/integrations/grocy/mappings/%EB%8B%AD%EA%B0%80%EC%8A%B4%EC%82%B4",
        json={"grocy_product_id": 88, "grocy_unit": "팩"},
    )
    assert mapping.status_code == 200

    opened = client.post("/api/foods/chicken-1/storage-events", json={"event_type": "opened"})
    moved = client.post(
        "/api/foods/chicken-1/storage-events",
        json={"event_type": "moved", "to_storage_type": "refrigerated"},
    )

    assert opened.status_code == 200
    assert opened.json()["grocy_sync_status"] == "queued"
    assert moved.status_code == 200
    assert moved.json()["grocy_sync_status"] == "needs_mapping"
    blocked = client.get("/api/integrations/grocy/outbox?status=blocked").json()
    assert len(blocked) == 1
    assert blocked[0]["operation"] == "transfer"
    assert blocked[0]["last_error"] == "Grocy 상품·단위 매핑과 보관 위치 매핑 확인이 필요합니다."

    frozen = client.put("/api/integrations/grocy/location-mappings/frozen", json={"grocy_location_id": 10})
    assert frozen.status_code == 200
    assert client.get("/api/integrations/grocy/outbox?status=blocked").json()
    refrigerated = client.put("/api/integrations/grocy/location-mappings/refrigerated", json={"grocy_location_id": 20})
    assert refrigerated.status_code == 200
    pending = client.get("/api/integrations/grocy/outbox?status=pending").json()
    transfer = next(record for record in pending if record["operation"] == "transfer")
    assert transfer["from_grocy_location_id"] == 10
    assert transfer["to_grocy_location_id"] == 20

    processed = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 10})
    assert processed.json()["succeeded"] == 2
    assert [call[0] for call in grocy.calls] == ["open", "transfer"]
    assert grocy.calls[1][3:5] == (10, 20)


def test_meal_plan_completion_queues_consumed_events_for_grocy(monkeypatch) -> None:
    grocy = EventGrocy()
    monkeypatch.setattr(main_module, "grocy_client", grocy)
    mapping = client.put(
        "/api/integrations/grocy/mappings/%EC%8B%9C%EA%B8%88%EC%B9%98",
        json={"grocy_product_id": 91, "grocy_unit": "팩"},
    )
    assert mapping.status_code == 200

    saved = client.post(
        "/api/meal-plans",
        json={"inventory_ids": ["spinach-1"], "plan_id": "grocy-meal-plan-1"},
    )
    assert saved.status_code == 200
    completed = client.post("/api/meal-plans/grocy-meal-plan-1/complete", json={})

    assert completed.status_code == 200
    assert completed.json()["grocy_sync_status"] == "queued"
    queued = client.get("/api/integrations/grocy/outbox?status=pending").json()
    assert len(queued) == 1
    assert queued[0]["operation"] == "consume"
    assert queued[0]["payload"]["meal_plan_id"] == "grocy-meal-plan-1"

    processed = client.post("/api/integrations/grocy/outbox/process", headers=_demo_headers(), json={"limit": 10})
    assert processed.json()["succeeded"] == 1
    already = client.post("/api/meal-plans/grocy-meal-plan-1/complete", json={})
    assert already.json()["grocy_sync_status"] == "succeeded"
