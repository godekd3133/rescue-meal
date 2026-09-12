from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.main import ReceiptDraftResponse, ReceiptLineDraft, SqliteStore, WorkspaceStoreRouter, _ReceiptRecord
from app.product_enrichment import (
    ProductEnrichmentJobRecord,
    ProductEnrichmentWorkerHeartbeatRecord,
    ProductEnrichmentWorker,
    ProductEnrichmentWorkerSettings,
)
from app.product_resolver import ProductCandidate, ProductNameLookupResult


def _receipt(receipt_id: str = "receipt-enrichment") -> ReceiptDraftResponse:
    return ReceiptDraftResponse(
        id=receipt_id,
        fingerprint=f"fingerprint-{receipt_id}",
        status="review_required",
        source_filename="receipt.jpg",
        purchased_at=datetime(2026, 9, 3, 9, 0, tzinfo=timezone.utc),
        lines=[ReceiptLineDraft(
            id="line-1",
            raw_name="진간장",
            canonical_name="진간장",
            quantity=1,
            unit="개",
            unit_price=None,
            total_price=2980,
            line_type="product",
            match_confidence=0.58,
            review_status="pending",
        )],
        stock_created=False,
    )


def _job(now: datetime, receipt_id: str = "receipt-enrichment") -> ProductEnrichmentJobRecord:
    return ProductEnrichmentJobRecord(
        id=f"product-enrichment-{receipt_id}",
        receipt_id=receipt_id,
        line_ids=["line-1"],
        next_attempt_at=now,
        created_at=now,
        updated_at=now,
    )


def _candidate() -> ProductCandidate:
    return ProductCandidate(
        source="mfds_i1250",
        source_url="https://example.test/i1250",
        canonical_name="매일맛있는진간장",
        brand="예시 식품",
        category="혼합간장",
        quantity_text=None,
        confidence=0.78,
        provenance_note="제품 기준 후보; 개별 팩 라벨 확인 필요",
        shelf_life_text="실온보관 2년",
        storage_hint="ambient",
    )


def _open_food_facts_candidate() -> ProductCandidate:
    return ProductCandidate(
        source="open_food_facts",
        source_url="https://world.openfoodfacts.org/product/8800000000004",
        canonical_name="해외 시리얼",
        brand="공개 브랜드",
        category="시리얼",
        quantity_text="300 g",
        confidence=0.66,
        provenance_note="Open Food Facts 검색 후보; 실제 상품명·포장지 날짜 확인 필요",
    )


def _settings(**overrides) -> ProductEnrichmentWorkerSettings:
    values = {
        "workspace_ids": ("demo",),
        "worker_id": "enrichment-test-worker",
        "lease_seconds": 120,
        "stale_after_seconds": 60,
        "process_limit": 1,
        "max_attempts": 3,
    }
    values.update(overrides)
    return ProductEnrichmentWorkerSettings(**values)


class SuccessfulResolver:
    def lookup_by_product_name(self, product_name: str, *, limit: int) -> ProductNameLookupResult:
        assert product_name == "진간장"
        assert limit == 5
        return ProductNameLookupResult("mfds_i1250", "matched", [_candidate()])


class RateLimitedResolver:
    def lookup_by_product_name(self, product_name: str, *, limit: int) -> ProductNameLookupResult:
        del product_name, limit
        return ProductNameLookupResult("mfds_i1250", "rate_limited", detail="quota")


class OpenFoodFactsFallbackResolver:
    def lookup_by_product_name(self, product_name: str, *, limit: int) -> ProductNameLookupResult:
        assert product_name == "진간장"
        assert limit == 5
        return ProductNameLookupResult("open_food_facts", "matched", [_open_food_facts_candidate()])


def test_worker_enriches_receipt_candidates_without_overwriting_selected_product() -> None:
    now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    from app.main import InMemoryStore

    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    receipt = _receipt()
    store.receipts[receipt.id] = _ReceiptRecord(receipt)
    store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(now)

    worker = ProductEnrichmentWorker(
        store=store,
        settings=_settings(),
        resolver_factory=SuccessfulResolver,
        provider_configured=lambda: True,
        now=lambda: now,
    )
    result = worker.tick_workspace("demo")

    assert result.processed == 1
    assert result.succeeded == 1
    assert result.enriched_candidates == 1
    assert store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"].status == "succeeded"
    line = store.receipts[receipt.id].response.lines[0]
    assert line.canonical_name == "진간장"
    assert line.match_source == "parser"
    assert line.match_candidates[0].source == "mfds_i1250"
    assert line.match_candidates[0].shelf_life_text == "실온보관 2년"


def test_worker_persists_open_food_facts_fallback_candidate_with_provenance() -> None:
    now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    from app.main import InMemoryStore

    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    receipt = _receipt()
    store.receipts[receipt.id] = _ReceiptRecord(receipt)
    store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(now)

    worker = ProductEnrichmentWorker(
        store=store,
        settings=_settings(),
        resolver_factory=OpenFoodFactsFallbackResolver,
        provider_configured=lambda: True,
        now=lambda: now,
    )
    result = worker.tick_workspace("demo")

    assert result.succeeded == 1
    assert result.enriched_candidates == 1
    line = store.receipts[receipt.id].response.lines[0]
    assert line.match_source == "parser"
    assert line.match_candidates[0].source == "open_food_facts"
    assert line.match_candidates[0].source_url.endswith("8800000000004")


def test_worker_leaves_jobs_queued_when_i1250_is_not_configured() -> None:
    now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    from app.main import InMemoryStore

    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    receipt = _receipt()
    store.receipts[receipt.id] = _ReceiptRecord(receipt)
    store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(now)

    result = ProductEnrichmentWorker(
        store=store,
        settings=_settings(),
        resolver_factory=SuccessfulResolver,
        provider_configured=lambda: False,
        now=lambda: now,
    ).tick_workspace("demo")

    assert result.i1250_configured is False
    assert result.processed == 0
    assert store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"].status == "queued"
    assert store.product_enrichment_worker_heartbeats["enrichment-test-worker"].i1250_configured is False


def test_worker_retries_rate_limit_then_dead_letters_after_max_attempts() -> None:
    current = [datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)]
    from app.main import InMemoryStore

    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    receipt = _receipt()
    store.receipts[receipt.id] = _ReceiptRecord(receipt)
    store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(current[0])
    settings = _settings(max_attempts=2)

    worker = ProductEnrichmentWorker(
        store=store,
        settings=settings,
        resolver_factory=RateLimitedResolver,
        provider_configured=lambda: True,
        now=lambda: current[0],
    )
    first = worker.tick_workspace("demo")
    assert first.retried == 1
    assert store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"].status == "queued"

    current[0] += timedelta(minutes=2)
    second = worker.tick_workspace("demo")
    assert second.dead_lettered == 1
    assert store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"].status == "dead_letter"


def test_worker_recovers_stale_in_flight_job_before_processing() -> None:
    now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    from app.main import InMemoryStore

    store = WorkspaceStoreRouter(InMemoryStore(seed=False))
    receipt = _receipt()
    store.receipts[receipt.id] = _ReceiptRecord(receipt)
    store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(now - timedelta(minutes=5)).model_copy(update={
        "status": "in_flight",
        "attempts": 1,
        "in_flight_started_at": now - timedelta(minutes=5),
    })

    result = ProductEnrichmentWorker(
        store=store,
        settings=_settings(stale_after_seconds=60),
        resolver_factory=SuccessfulResolver,
        provider_configured=lambda: True,
        now=lambda: now,
    ).tick_workspace("demo")

    job = store.product_enrichment_jobs[f"product-enrichment-{receipt.id}"]
    assert result.recovered_in_flight == 1
    assert result.processed == 1
    assert job.status == "succeeded"
    assert job.attempts == 2


def test_sqlite_store_persists_product_enrichment_job_and_worker_heartbeat(tmp_path: Path) -> None:
    now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    database_path = tmp_path / "product-enrichment.db"
    first = SqliteStore(str(database_path), seed=False)
    receipt = _receipt()
    first.receipts[receipt.id] = _ReceiptRecord(receipt)
    first.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(now)
    first.flush()
    first.record_product_enrichment_worker_heartbeat(ProductEnrichmentWorkerHeartbeatRecord(
        workspace_id="demo",
        worker_id="enrichment-test-worker",
        last_tick_at=now,
        lease_acquired=True,
        i1250_configured=False,
    ))

    second = SqliteStore(str(database_path), seed=False)

    assert second.product_enrichment_jobs[f"product-enrichment-{receipt.id}"].status == "queued"
    assert second.list_product_enrichment_worker_heartbeats()[0].i1250_configured is False


def test_sqlite_store_refreshes_product_enrichment_job_from_another_process(tmp_path: Path) -> None:
    database_path = tmp_path / "product-enrichment-refresh.db"
    first = SqliteStore(str(database_path), seed=False)
    second = SqliteStore(str(database_path), seed=False)
    receipt = _receipt("receipt-refresh")
    first.receipts[receipt.id] = _ReceiptRecord(receipt)
    first.product_enrichment_jobs[f"product-enrichment-{receipt.id}"] = _job(datetime.now(timezone.utc), receipt.id)
    first.flush()

    assert second.product_enrichment_jobs == {}
    second.refresh()

    assert second.product_enrichment_jobs[f"product-enrichment-{receipt.id}"].receipt_id == receipt.id
