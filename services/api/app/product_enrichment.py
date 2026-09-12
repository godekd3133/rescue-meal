"""Asynchronous product-reference enrichment for receipt drafts.

Receipt OCR creates a usable draft first. This module owns the optional,
retryable follow-up that asks a product provider for product-level reference
data. It never selects a candidate as the user's confirmed product and it
never creates a date assertion.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import os
import re
import secrets
import time
from typing import Any, Callable, Iterable, Literal

from pydantic import BaseModel, ConfigDict, Field

from .auth import reset_workspace, set_workspace_id
from .product_resolver import MfdsI1250Resolver, external_lookups_enabled


PRODUCT_ENRICHMENT_LEASE_KEY = "product-enrichment"
ProductEnrichmentStatus = Literal["queued", "in_flight", "succeeded", "dead_letter"]


class ProductEnrichmentJobRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    receipt_id: str = Field(min_length=1, max_length=160)
    line_ids: list[str] = Field(min_length=1, max_length=200)
    status: ProductEnrichmentStatus = "queued"
    attempts: int = Field(default=0, ge=0, le=10)
    processed_lines: int = Field(default=0, ge=0, le=200)
    enriched_candidates: int = Field(default=0, ge=0, le=2_000)
    last_error: str | None = Field(default=None, max_length=300)
    next_attempt_at: datetime
    in_flight_started_at: datetime | None = None
    last_attempt_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProductEnrichmentWorkerLeaseRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lease_key: str = Field(min_length=1, max_length=96)
    worker_id: str = Field(min_length=1, max_length=160)
    acquired_at: datetime
    expires_at: datetime


class ProductEnrichmentWorkerHeartbeatRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=96)
    worker_id: str = Field(min_length=1, max_length=160)
    last_tick_at: datetime
    last_success_at: datetime | None = None
    lease_acquired: bool
    i1250_configured: bool
    queued: int = Field(default=0, ge=0)
    processed: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    retried: int = Field(default=0, ge=0)
    dead_lettered: int = Field(default=0, ge=0)
    enriched_candidates: int = Field(default=0, ge=0)
    recovered_in_flight: int = Field(default=0, ge=0)
    last_error: str | None = Field(default=None, max_length=160)


class ProductEnrichmentWorkerTickRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(min_length=1, max_length=160)
    lease_seconds: int = Field(default=120, ge=30, le=3600)
    stale_after_seconds: int = Field(default=900, ge=60, le=86_400)
    process_limit: int = Field(default=5, ge=1, le=100)
    max_attempts: int = Field(default=3, ge=1, le=10)


class ProductEnrichmentWorkerTickResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: str
    worker_id: str
    lease_acquired: bool
    i1250_configured: bool
    queued: int = Field(default=0, ge=0)
    processed: int = Field(default=0, ge=0)
    succeeded: int = Field(default=0, ge=0)
    retried: int = Field(default=0, ge=0)
    dead_lettered: int = Field(default=0, ge=0)
    enriched_candidates: int = Field(default=0, ge=0)
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
    return max(minimum, min(maximum, value))


def workspace_ids_from_env() -> tuple[str, ...]:
    configured = os.getenv("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKSPACE_IDS", "demo").strip()
    workspace_ids = tuple(dict.fromkeys(item.strip() for item in configured.split(",") if item.strip()))
    if not workspace_ids:
        raise ValueError("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKSPACE_IDS가 비어 있습니다.")
    invalid = [item for item in workspace_ids if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", item)]
    if invalid:
        raise ValueError("product enrichment workspace ID 형식이 잘못되었습니다.")
    return workspace_ids


@dataclass(frozen=True)
class ProductEnrichmentWorkerSettings:
    workspace_ids: tuple[str, ...]
    worker_id: str
    interval_seconds: float = 30.0
    lease_seconds: int = 120
    stale_after_seconds: int = 900
    process_limit: int = 5
    max_attempts: int = 3

    @classmethod
    def from_env(cls) -> "ProductEnrichmentWorkerSettings":
        return cls(
            workspace_ids=workspace_ids_from_env(),
            worker_id=os.getenv("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_ID", "").strip() or f"product-enrichment-{secrets.token_urlsafe(8)}",
            interval_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_INTERVAL_SECONDS", 30.0, minimum=5.0, maximum=3600.0),
            lease_seconds=_bounded_int("RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_LEASE_SECONDS", 120, minimum=30, maximum=3600),
            stale_after_seconds=_bounded_int("RESCUE_MEAL_PRODUCT_ENRICHMENT_STALE_AFTER_SECONDS", 900, minimum=60, maximum=86_400),
            process_limit=_bounded_int("RESCUE_MEAL_PRODUCT_ENRICHMENT_PROCESS_LIMIT", 5, minimum=1, maximum=100),
            max_attempts=_bounded_int("RESCUE_MEAL_PRODUCT_ENRICHMENT_MAX_ATTEMPTS", 3, minimum=1, maximum=10),
        )


@dataclass(frozen=True)
class ProductEnrichmentWorkerTickResult:
    workspace_id: str
    worker_id: str
    lease_acquired: bool
    i1250_configured: bool
    queued: int = 0
    processed: int = 0
    succeeded: int = 0
    retried: int = 0
    dead_lettered: int = 0
    enriched_candidates: int = 0
    recovered_in_flight: int = 0
    error: str | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "workspace_id": self.workspace_id,
            "worker_id": self.worker_id,
            "lease_acquired": self.lease_acquired,
            "i1250_configured": self.i1250_configured,
            "queued": self.queued,
            "processed": self.processed,
            "succeeded": self.succeeded,
            "retried": self.retried,
            "dead_lettered": self.dead_lettered,
            "enriched_candidates": self.enriched_candidates,
            "recovered_in_flight": self.recovered_in_flight,
            "error": self.error,
        }


class _ProviderFailure(RuntimeError):
    def __init__(self, status: str, detail: str | None) -> None:
        super().__init__(detail or status)
        self.status = status


class ProductEnrichmentWorker:
    """Process queued receipt product-reference jobs for one workspace."""

    def __init__(
        self,
        *,
        store: Any,
        settings: ProductEnrichmentWorkerSettings,
        resolver_factory: Callable[[], Any] = MfdsI1250Resolver,
        provider_configured: Callable[[], bool] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.store = store
        self.settings = settings
        self.resolver_factory = resolver_factory
        self.provider_configured = provider_configured or (lambda: external_lookups_enabled() and bool(os.getenv("MFDS_API_KEY", "").strip()))
        self.now = now or (lambda: datetime.now(timezone.utc))

    def tick_workspace(self, workspace_id: str) -> ProductEnrichmentWorkerTickResult:
        workspace_lease_acquired = False
        acquire_workspace = getattr(self.store, "acquire_workspace", None)
        if callable(acquire_workspace):
            acquire_workspace(workspace_id, seed=False)
            workspace_lease_acquired = True
        else:
            self.store.provision_workspace(workspace_id, seed=False)
        workspace_token = set_workspace_id(workspace_id)
        lease_acquired = False
        configured = self.provider_configured()
        result: ProductEnrichmentWorkerTickResult
        try:
            lease_acquired = self.store.acquire_product_enrichment_worker_lease(
                lease_key=PRODUCT_ENRICHMENT_LEASE_KEY,
                worker_id=self.settings.worker_id,
                lease_seconds=self.settings.lease_seconds,
                now=self.now(),
            )
            if not lease_acquired:
                result = ProductEnrichmentWorkerTickResult(
                    workspace_id,
                    self.settings.worker_id,
                    False,
                    configured,
                    queued=self._queued_count(),
                )
            elif not configured:
                result = ProductEnrichmentWorkerTickResult(
                    workspace_id,
                    self.settings.worker_id,
                    True,
                    False,
                    queued=self._queued_count(),
                )
            else:
                result = self._process()
        except Exception as exc:
            result = ProductEnrichmentWorkerTickResult(
                workspace_id,
                self.settings.worker_id,
                lease_acquired,
                configured,
                error=exc.__class__.__name__,
            )
        finally:
            try:
                if lease_acquired:
                    self.store.release_product_enrichment_worker_lease(
                        lease_key=PRODUCT_ENRICHMENT_LEASE_KEY,
                        worker_id=self.settings.worker_id,
                    )
                ticked_at = self.now()
                self.store.record_product_enrichment_worker_heartbeat(
                    ProductEnrichmentWorkerHeartbeatRecord(
                        workspace_id=workspace_id,
                        worker_id=self.settings.worker_id,
                        last_tick_at=ticked_at,
                        last_success_at=ticked_at if result.error is None and result.lease_acquired else None,
                        lease_acquired=result.lease_acquired,
                        i1250_configured=result.i1250_configured,
                        queued=result.queued,
                        processed=result.processed,
                        succeeded=result.succeeded,
                        retried=result.retried,
                        dead_lettered=result.dead_lettered,
                        enriched_candidates=result.enriched_candidates,
                        recovered_in_flight=result.recovered_in_flight,
                        last_error=result.error,
                    )
                )
            finally:
                reset_workspace(workspace_token)
                if workspace_lease_acquired:
                    self.store.release_workspace(workspace_id)
        return result

    def tick(self) -> list[ProductEnrichmentWorkerTickResult]:
        return [self.tick_workspace(workspace_id) for workspace_id in self.settings.workspace_ids]

    def run(self, *, once: bool = False, sleep: Callable[[float], None] = time.sleep) -> Iterable[list[ProductEnrichmentWorkerTickResult]]:
        while True:
            results = self.tick()
            yield results
            if once:
                return
            sleep(self.settings.interval_seconds)

    def _process(self) -> ProductEnrichmentWorkerTickResult:
        now = self.now()
        recovered = self._recover_stale(now)
        queued = self._queued_count()
        processed = succeeded = retried = dead_lettered = enriched = 0
        resolver = self.resolver_factory()
        jobs = sorted(self.store.product_enrichment_jobs.values(), key=lambda item: (item.next_attempt_at, item.id))
        for job in jobs:
            if processed >= self.settings.process_limit or job.status != "queued" or job.next_attempt_at > now:
                continue
            processed += 1
            job.status = "in_flight"
            job.attempts += 1
            job.last_attempt_at = now
            job.in_flight_started_at = now
            job.updated_at = now
            self.store.flush()
            try:
                added = self._enrich_job(job, resolver)
            except _ProviderFailure as exc:
                job.in_flight_started_at = None
                job.last_error = str(exc)[:300]
                if job.attempts >= self.settings.max_attempts:
                    job.status = "dead_letter"
                    dead_lettered += 1
                else:
                    job.status = "queued"
                    job.next_attempt_at = now + timedelta(seconds=min(3600, 60 * (2 ** max(0, job.attempts - 1))))
                    retried += 1
            except Exception as exc:
                job.in_flight_started_at = None
                job.last_error = exc.__class__.__name__
                if job.attempts >= self.settings.max_attempts:
                    job.status = "dead_letter"
                    dead_lettered += 1
                else:
                    job.status = "queued"
                    job.next_attempt_at = now + timedelta(seconds=min(3600, 60 * (2 ** max(0, job.attempts - 1))))
                    retried += 1
            else:
                job.status = "succeeded"
                job.last_error = None
                job.in_flight_started_at = None
                job.updated_at = self.now()
                succeeded += 1
                enriched += added
            job.updated_at = self.now()
            self.store.flush()
        return ProductEnrichmentWorkerTickResult(
            workspace_id=self._workspace_id(),
            worker_id=self.settings.worker_id,
            lease_acquired=True,
            i1250_configured=True,
            queued=queued,
            processed=processed,
            succeeded=succeeded,
            retried=retried,
            dead_lettered=dead_lettered,
            enriched_candidates=enriched,
            recovered_in_flight=recovered,
        )

    def _queued_count(self) -> int:
        return sum(1 for job in self.store.product_enrichment_jobs.values() if job.status == "queued")

    def _enrich_job(self, job: ProductEnrichmentJobRecord, resolver: Any) -> int:
        receipt_record = self.store.receipts.get(job.receipt_id)
        if receipt_record is None:
            raise RuntimeError("receipt draft를 찾을 수 없습니다.")
        if receipt_record.committed or receipt_record.response.status == "committed":
            job.last_error = "이미 반영된 영수증은 제품 후보를 변경하지 않습니다."
            job.processed_lines = len(job.line_ids)
            return 0

        line_map = {line.id: line for line in receipt_record.response.lines}
        added = 0
        for line_id in job.line_ids:
            line = line_map.get(line_id)
            if line is None or line.line_type != "product":
                continue
            query = (line.canonical_name or line.raw_name).strip()
            if not query:
                continue
            lookup = resolver.lookup_by_product_name(query, limit=5)
            if lookup.status in {"unavailable", "rate_limited"}:
                raise _ProviderFailure(lookup.status, lookup.detail)
            if lookup.status != "matched":
                job.processed_lines += 1
                continue
            added_for_line = self._append_candidates(line, lookup.candidates)
            job.enriched_candidates += added_for_line
            job.processed_lines += 1
            added += added_for_line
        return added

    def _append_candidates(self, line: Any, candidates: list[Any]) -> int:
        from .main import ReceiptMatchCandidateResponse

        existing = {(item.source, item.canonical_name) for item in line.match_candidates}
        added = 0
        for candidate in candidates:
            if candidate.source not in {"mfds_i1250", "open_food_facts"} or (candidate.source, candidate.canonical_name) in existing:
                continue
            line.match_candidates.append(
                ReceiptMatchCandidateResponse(
                    source=candidate.source,
                    canonical_name=candidate.canonical_name,
                    source_url=candidate.source_url,
                    brand=candidate.brand,
                    category=candidate.category,
                    quantity_text=candidate.quantity_text,
                    confidence=candidate.confidence,
                    provenance_note=candidate.provenance_note,
                    shelf_life_text=candidate.shelf_life_text,
                    storage_hint=candidate.storage_hint,
                    source_freshness=candidate.source_freshness,
                )
            )
            existing.add((candidate.source, candidate.canonical_name))
            added += 1
        return added

    def _recover_stale(self, now: datetime) -> int:
        recovered = 0
        for job in self.store.product_enrichment_jobs.values():
            if job.status != "in_flight" or job.in_flight_started_at is None:
                continue
            if now - job.in_flight_started_at < timedelta(seconds=self.settings.stale_after_seconds):
                continue
            job.status = "queued"
            job.in_flight_started_at = None
            job.next_attempt_at = now
            job.last_error = "이전 product enrichment worker가 결과를 남기지 못해 재시도합니다."
            job.updated_at = now
            recovered += 1
        if recovered:
            self.store.flush()
        return recovered

    def _workspace_id(self) -> str:
        from .auth import current_workspace_id

        return current_workspace_id()
