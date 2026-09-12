"""Barcode-to-product resolution with explicit provenance and safe fallbacks.

Product lookup answers a different question from date recognition:

* a barcode may identify a product or a product-level public record;
* it does not identify the date printed on the individual package in the
  user's kitchen.

The resolver therefore keeps provider candidates and their limitations in the
result. External providers are opt-in, network failures are non-fatal, and a
small bounded cache prevents repeated scans from hammering public APIs.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from difflib import SequenceMatcher
from collections import deque
import json
import math
import os
import re
import secrets
import sqlite3
from threading import RLock
import time
import unicodedata
from typing import Any, Callable, Literal, Mapping, Protocol, Sequence
from urllib.parse import quote

import httpx


LookupStatus = Literal["matched", "partial", "not_found", "provider_unavailable"]
ProviderStatus = Literal["matched", "not_found", "unavailable", "rate_limited", "disabled"]
ProductSource = Literal["local_fixture", "open_food_facts", "mfds_c005", "mfds_i1250"]
StorageHint = Literal["ambient", "refrigerated", "frozen"]
SourceFreshness = Literal["current", "legacy", "unknown"]
ReceiptMatchSource = Literal["user_confirmed_alias", "local_rule", "parser", "local_fixture", "mfds_c005", "mfds_i1250", "open_food_facts", "unmatched"]
OPEN_FOOD_FACTS_API_VERSION = "v3.6"


@dataclass(frozen=True)
class ProductCandidate:
    source: ProductSource
    source_url: str | None
    canonical_name: str
    brand: str | None
    category: str | None
    quantity_text: str | None
    confidence: float
    provenance_note: str
    shelf_life_text: str | None = None
    storage_hint: StorageHint | None = None
    source_freshness: SourceFreshness = "unknown"


@dataclass(frozen=True)
class ProviderLookupResult:
    provider: str
    status: ProviderStatus
    candidate: ProductCandidate | None = None
    detail: str | None = None


@dataclass(frozen=True)
class ProductNameLookupResult:
    provider: str
    status: ProviderStatus
    candidates: list[ProductCandidate] = field(default_factory=list)
    detail: str | None = None


@dataclass(frozen=True)
class ProductLookupResult:
    barcode: str
    status: LookupStatus
    candidates: list[ProductCandidate]
    warnings: list[str]
    requires_review: bool
    provider_statuses: dict[str, ProviderStatus] = field(default_factory=dict)


@dataclass(frozen=True)
class ReceiptMatchCandidate:
    source: ReceiptMatchSource
    canonical_name: str
    confidence: float
    provenance_note: str
    source_url: str | None = None
    brand: str | None = None
    category: str | None = None
    quantity_text: str | None = None
    shelf_life_text: str | None = None
    storage_hint: StorageHint | None = None
    source_freshness: SourceFreshness = "unknown"


@dataclass(frozen=True)
class ReceiptNameResolution:
    canonical_name: str | None
    source: ReceiptMatchSource
    confidence: float
    candidates: list[ReceiptMatchCandidate]


class ProductResolverProvider(Protocol):
    def lookup_result(self, barcode: str) -> ProviderLookupResult:
        """Return one provider outcome without raising network errors."""


@dataclass(frozen=True)
class _CacheEntry:
    result: ProductLookupResult
    expires_at: float
    touched_at: float


class ProductLookupCache:
    """Bounded process cache for product-master lookups.

    Product records are safe to cache longer than an individual lot date, but
    provider outages must not be cached for a full product TTL. This cache is
    deliberately process-local; a multi-worker deployment should put the same
    contract behind Redis or a database table before claiming shared-cache
    behaviour.
    """

    def __init__(
        self,
        *,
        ttl_seconds: float = 7 * 24 * 60 * 60,
        negative_ttl_seconds: float = 15 * 60,
        failure_ttl_seconds: float = 60,
        max_entries: int = 2_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = max(1.0, float(ttl_seconds))
        self.negative_ttl_seconds = max(1.0, float(negative_ttl_seconds))
        self.failure_ttl_seconds = max(1.0, float(failure_ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self._clock = clock
        self._entries: dict[str, _CacheEntry] = {}
        self._lock = RLock()

    @classmethod
    def from_env(cls) -> "ProductLookupCache":
        return cls(
            ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_CACHE_TTL_SECONDS", 7 * 24 * 60 * 60, minimum=60, maximum=90 * 24 * 60 * 60),
            negative_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NEGATIVE_CACHE_TTL_SECONDS", 15 * 60, minimum=30, maximum=24 * 60 * 60),
            failure_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_FAILURE_CACHE_TTL_SECONDS", 60, minimum=10, maximum=15 * 60),
            max_entries=_bounded_int("RESCUE_MEAL_PRODUCT_CACHE_MAX_ENTRIES", 2_000, minimum=100, maximum=50_000),
        )

    def get(self, key: str) -> ProductLookupResult | None:
        now = self._clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._entries.pop(key, None)
                return None
            self._entries[key] = replace(entry, touched_at=now)
            return _copy_lookup_result(entry.result)

    def put(self, key: str, result: ProductLookupResult) -> None:
        now = self._clock()
        if result.status in {"matched", "partial"}:
            ttl = self.ttl_seconds
        elif result.status == "not_found":
            ttl = self.negative_ttl_seconds
        else:
            ttl = self.failure_ttl_seconds
        with self._lock:
            self._entries[key] = _CacheEntry(result=_copy_lookup_result(result), expires_at=now + ttl, touched_at=now)
            if len(self._entries) > self.max_entries:
                oldest_key = min(self._entries, key=lambda item: self._entries[item].touched_at)
                self._entries.pop(oldest_key, None)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


class ProductLookupCacheBackend(Protocol):
    def get(self, key: str) -> ProductLookupResult | None:
        """Return a non-expired product lookup result when present."""

    def put(self, key: str, result: ProductLookupResult) -> None:
        """Persist a product lookup result with a status-specific TTL."""


class ProductLookupSingleFlightBackend(ProductLookupCacheBackend, Protocol):
    def try_acquire(self, key: str, *, owner_id: str) -> bool:
        """Claim the right to perform the first provider lookup for a key."""

    def release(self, key: str, *, owner_id: str) -> None:
        """Release a lookup claim after the provider result is persisted."""


class ProductNameLookupCacheBackend(Protocol):
    def get(self, key: str) -> ProductNameLookupResult | None:
        """Return a non-expired product-name lookup result when present."""

    def put(self, key: str, result: ProductNameLookupResult) -> None:
        """Persist a product-name lookup result with a status-specific TTL."""


class ProductProviderRateLimiterBackend(Protocol):
    def allow(self, provider: str, *, now: float | None = None) -> bool:
        """Atomically reserve one outbound call for a provider."""


class ProductProviderRuntimeMetrics:
    """Privacy-safe, process-local counters for provider operations.

    These counters deliberately contain no barcode, product name, URL, or
    provider response body. A multi-worker deployment should export or
    aggregate the snapshots through its normal metrics pipeline later; this
    object only gives the API a safe local readback for now.
    """

    _COUNTER_FIELDS = (
        "cache_hits",
        "cache_misses",
        "single_flight_waits",
        "single_flight_hits",
        "single_flight_timeouts",
        "provider_calls",
        "rate_limited",
        "matched",
        "not_found",
        "unavailable",
    )

    def __init__(self, *, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._lock = RLock()
        self._states: dict[tuple[str, str], dict[str, object]] = {}

    def _state(self, scope: str, provider: str) -> dict[str, object]:
        key = (str(scope), str(provider))
        state = self._states.get(key)
        if state is None:
            state = {field: 0 for field in self._COUNTER_FIELDS}
            state.update({"last_latency_ms": None, "last_status": None, "last_event_at": None})
            self._states[key] = state
        return state

    def record_cache(self, scope: str, *, hit: bool) -> None:
        with self._lock:
            state = self._state(scope, "cache")
            state["cache_hits" if hit else "cache_misses"] = int(state["cache_hits" if hit else "cache_misses"]) + 1
            state["last_event_at"] = self._clock()

    def record_single_flight(self, scope: str, outcome: Literal["wait", "hit", "timeout"]) -> None:
        field = {"wait": "single_flight_waits", "hit": "single_flight_hits", "timeout": "single_flight_timeouts"}[outcome]
        with self._lock:
            state = self._state(scope, "single_flight")
            state[field] = int(state[field]) + 1
            state["last_event_at"] = self._clock()

    def record_rate_limited(self, scope: str, provider: str) -> None:
        with self._lock:
            state = self._state(scope, provider)
            state["rate_limited"] = int(state["rate_limited"]) + 1
            state["last_status"] = "rate_limited"
            state["last_event_at"] = self._clock()

    def record_provider_call(self, scope: str, provider: str, *, status: ProviderStatus, latency_ms: float | None = None) -> None:
        result_field = status if status in {"matched", "not_found", "unavailable"} else None
        with self._lock:
            state = self._state(scope, provider)
            state["provider_calls"] = int(state["provider_calls"]) + 1
            if result_field is not None:
                state[result_field] = int(state[result_field]) + 1
            if status == "rate_limited":
                state["rate_limited"] = int(state["rate_limited"]) + 1
            state["last_status"] = status
            state["last_latency_ms"] = round(max(0.0, float(latency_ms)), 2) if latency_ms is not None else None
            state["last_event_at"] = self._clock()

    def snapshot(self) -> list[dict[str, object]]:
        with self._lock:
            result: list[dict[str, object]] = []
            for (scope, provider), state in sorted(self._states.items()):
                result.append({"scope": scope, "provider": provider, **dict(state)})
            return result

    def prometheus_text(self) -> str:
        """Render safe worker-local counters for a Prometheus scrape."""

        snapshots = self.snapshot()
        lines = [
            "# HELP rescue_meal_product_cache_hits Product provider cache hits.",
            "# TYPE rescue_meal_product_cache_hits counter",
            "# HELP rescue_meal_product_cache_misses Product provider cache misses.",
            "# TYPE rescue_meal_product_cache_misses counter",
            "# HELP rescue_meal_product_single_flight_events Product lookup single-flight events.",
            "# TYPE rescue_meal_product_single_flight_events counter",
            "# HELP rescue_meal_product_provider_calls Product provider calls.",
            "# TYPE rescue_meal_product_provider_calls counter",
            "# HELP rescue_meal_product_provider_rate_limited Product provider calls denied by rate limit.",
            "# TYPE rescue_meal_product_provider_rate_limited counter",
            "# HELP rescue_meal_product_provider_results Product provider results by status.",
            "# TYPE rescue_meal_product_provider_results counter",
            "# HELP rescue_meal_product_provider_last_latency_ms Last product provider call latency in milliseconds.",
            "# TYPE rescue_meal_product_provider_last_latency_ms gauge",
        ]

        def label(value: object) -> str:
            return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

        for item in snapshots:
            scope = label(item["scope"])
            provider = label(item["provider"])
            if item["provider"] == "cache":
                lines.append(f'rescue_meal_product_cache_hits{{scope="{scope}"}} {item["cache_hits"]}')
                lines.append(f'rescue_meal_product_cache_misses{{scope="{scope}"}} {item["cache_misses"]}')
            elif item["provider"] == "single_flight":
                for outcome, field in (("wait", "single_flight_waits"), ("hit", "single_flight_hits"), ("timeout", "single_flight_timeouts")):
                    lines.append(f'rescue_meal_product_single_flight_events{{scope="{scope}",outcome="{outcome}"}} {item[field]}')
            else:
                lines.append(f'rescue_meal_product_provider_calls{{scope="{scope}",provider="{provider}"}} {item["provider_calls"]}')
                lines.append(f'rescue_meal_product_provider_rate_limited{{scope="{scope}",provider="{provider}"}} {item["rate_limited"]}')
                for status in ("matched", "not_found", "unavailable"):
                    lines.append(f'rescue_meal_product_provider_results{{scope="{scope}",provider="{provider}",status="{status}"}} {item[status]}')
                if item["last_latency_ms"] is not None:
                    lines.append(f'rescue_meal_product_provider_last_latency_ms{{scope="{scope}",provider="{provider}"}} {item["last_latency_ms"]}')
        return "\n".join(lines) + "\n"


_PRODUCT_CACHE_SOURCES = {"local_fixture", "open_food_facts", "mfds_c005", "mfds_i1250"}
_PRODUCT_CACHE_STATUSES = {"matched", "partial", "not_found", "provider_unavailable"}
_PROVIDER_STATUSES = {"matched", "not_found", "unavailable", "rate_limited", "disabled"}
_PRODUCT_NAME_CACHE_STATUSES = {"matched", "not_found", "unavailable", "rate_limited", "disabled"}


def _product_lookup_ttl(result: ProductLookupResult, *, success_ttl: float, negative_ttl: float, failure_ttl: float) -> float:
    if result.status in {"matched", "partial"}:
        return success_ttl
    if result.status == "not_found":
        return negative_ttl
    return failure_ttl


def _serialize_product_lookup_result(result: ProductLookupResult) -> dict[str, object]:
    return {
        "barcode": result.barcode,
        "status": result.status,
        "candidates": [
            {
                "source": candidate.source,
                "source_url": candidate.source_url,
                "canonical_name": candidate.canonical_name,
                "brand": candidate.brand,
                "category": candidate.category,
                "quantity_text": candidate.quantity_text,
                "confidence": candidate.confidence,
                "provenance_note": candidate.provenance_note,
                "shelf_life_text": candidate.shelf_life_text,
                "storage_hint": candidate.storage_hint,
                "source_freshness": candidate.source_freshness,
            }
            for candidate in result.candidates
        ],
        "warnings": list(result.warnings),
        "requires_review": result.requires_review,
        "provider_statuses": dict(result.provider_statuses),
    }


def _deserialize_product_lookup_result(payload: object) -> ProductLookupResult | None:
    if not isinstance(payload, dict):
        return None
    barcode = payload.get("barcode")
    result_status = payload.get("status")
    candidates_payload = payload.get("candidates")
    if not isinstance(barcode, str) or result_status not in _PRODUCT_CACHE_STATUSES or not isinstance(candidates_payload, list):
        return None
    candidates: list[ProductCandidate] = []
    try:
        for candidate in candidates_payload:
            if not isinstance(candidate, dict) or candidate.get("source") not in _PRODUCT_CACHE_SOURCES:
                return None
            source_freshness = candidate.get("source_freshness", "unknown")
            if source_freshness not in {"current", "legacy", "unknown"}:
                return None
            storage_hint = candidate.get("storage_hint")
            if storage_hint not in {None, "ambient", "refrigerated", "frozen"}:
                return None
            candidates.append(
                ProductCandidate(
                    source=candidate["source"],
                    source_url=candidate.get("source_url"),
                    canonical_name=str(candidate["canonical_name"]),
                    brand=candidate.get("brand"),
                    category=candidate.get("category"),
                    quantity_text=candidate.get("quantity_text"),
                    confidence=float(candidate["confidence"]),
                    provenance_note=str(candidate["provenance_note"]),
                    shelf_life_text=candidate.get("shelf_life_text"),
                    storage_hint=storage_hint,
                    source_freshness=source_freshness,
                )
            )
        provider_statuses = payload.get("provider_statuses", {})
        if not isinstance(provider_statuses, dict) or any(value not in _PROVIDER_STATUSES for value in provider_statuses.values()):
            return None
        warnings = payload.get("warnings", [])
        if not isinstance(warnings, list) or not all(isinstance(item, str) for item in warnings):
            return None
        return ProductLookupResult(
            barcode=barcode,
            status=result_status,
            candidates=candidates,
            warnings=list(warnings),
            requires_review=bool(payload.get("requires_review", True)),
            provider_statuses={str(key): value for key, value in provider_statuses.items()},
        )
    except (KeyError, TypeError, ValueError):
        return None


def _serialize_product_name_lookup_result(result: ProductNameLookupResult) -> dict[str, object]:
    return {
        "provider": result.provider,
        "status": result.status,
        "detail": result.detail,
        "candidates": [
            {
                "source": candidate.source,
                "source_url": candidate.source_url,
                "canonical_name": candidate.canonical_name,
                "brand": candidate.brand,
                "category": candidate.category,
                "quantity_text": candidate.quantity_text,
                "confidence": candidate.confidence,
                "provenance_note": candidate.provenance_note,
                "shelf_life_text": candidate.shelf_life_text,
                "storage_hint": candidate.storage_hint,
                "source_freshness": candidate.source_freshness,
            }
            for candidate in result.candidates
        ],
    }


def _deserialize_product_name_lookup_result(payload: object) -> ProductNameLookupResult | None:
    if not isinstance(payload, dict):
        return None
    provider = payload.get("provider")
    result_status = payload.get("status")
    candidates_payload = payload.get("candidates")
    if not isinstance(provider, str) or result_status not in _PRODUCT_NAME_CACHE_STATUSES or not isinstance(candidates_payload, list):
        return None
    candidates: list[ProductCandidate] = []
    try:
        for candidate in candidates_payload:
            if not isinstance(candidate, dict) or candidate.get("source") not in _PRODUCT_CACHE_SOURCES:
                return None
            source_freshness = candidate.get("source_freshness", "unknown")
            if source_freshness not in {"current", "legacy", "unknown"}:
                return None
            storage_hint = candidate.get("storage_hint")
            if storage_hint not in {None, "ambient", "refrigerated", "frozen"}:
                return None
            candidates.append(
                ProductCandidate(
                    source=candidate["source"],
                    source_url=candidate.get("source_url"),
                    canonical_name=str(candidate["canonical_name"]),
                    brand=candidate.get("brand"),
                    category=candidate.get("category"),
                    quantity_text=candidate.get("quantity_text"),
                    confidence=float(candidate["confidence"]),
                    provenance_note=str(candidate["provenance_note"]),
                    shelf_life_text=candidate.get("shelf_life_text"),
                    storage_hint=storage_hint,
                    source_freshness=source_freshness,
                )
            )
        detail = payload.get("detail")
        if detail is not None and not isinstance(detail, str):
            return None
        return ProductNameLookupResult(
            provider=provider,
            status=result_status,
            candidates=candidates,
            detail=detail,
        )
    except (KeyError, TypeError, ValueError):
        return None


class SharedProductLookupCache:
    """Durable product-master cache shared by API workers through SQL.

    A product lookup is safe to cache because it is product-level enrichment,
    not an individual package date. SQLite is used for local multi-process
    verification; PostgreSQL is the production shared-cache path.
    """

    def __init__(
        self,
        connection,
        *,
        dialect: Literal["sqlite", "postgres"],
        lock: RLock | None = None,
        success_ttl_seconds: float = 7 * 24 * 60 * 60,
        negative_ttl_seconds: float = 15 * 60,
        failure_ttl_seconds: float = 60,
        max_entries: int = 2_000,
        namespace: str = "product-master-v3",
        single_flight_lease_seconds: float = 45,
        single_flight_wait_seconds: float = 5,
        clock: Callable[[], float] = time.time,
        initialize_schema: bool = True,
    ) -> None:
        if dialect not in {"sqlite", "postgres"}:
            raise ValueError("product cache dialect must be sqlite or postgres")
        self._connection = connection
        self._dialect = dialect
        self._lock = lock or RLock()
        self.success_ttl_seconds = max(1.0, float(success_ttl_seconds))
        self.negative_ttl_seconds = max(1.0, float(negative_ttl_seconds))
        self.failure_ttl_seconds = max(1.0, float(failure_ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self.namespace = namespace.strip() or "product-master-v3"
        self.single_flight_lease_seconds = max(5.0, float(single_flight_lease_seconds))
        self.single_flight_wait_seconds = max(1.0, float(single_flight_wait_seconds))
        self._clock = clock
        if initialize_schema:
            self._initialize_schema()

    @classmethod
    def from_env(cls, connection, *, dialect: Literal["sqlite", "postgres"], lock: RLock | None = None, initialize_schema: bool = True) -> "SharedProductLookupCache":
        return cls(
            connection,
            dialect=dialect,
            lock=lock,
            success_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_CACHE_TTL_SECONDS", 7 * 24 * 60 * 60, minimum=60, maximum=90 * 24 * 60 * 60),
            negative_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NEGATIVE_CACHE_TTL_SECONDS", 15 * 60, minimum=30, maximum=24 * 60 * 60),
            failure_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_FAILURE_CACHE_TTL_SECONDS", 60, minimum=10, maximum=15 * 60),
            max_entries=_bounded_int("RESCUE_MEAL_PRODUCT_CACHE_MAX_ENTRIES", 2_000, minimum=100, maximum=50_000),
            namespace=os.getenv("RESCUE_MEAL_PRODUCT_CACHE_NAMESPACE", "product-master-v3"),
            single_flight_lease_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS", 45, minimum=5, maximum=300),
            single_flight_wait_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS", 5, minimum=1, maximum=30),
            initialize_schema=initialize_schema,
        )

    def _cache_key(self, key: str) -> str:
        return f"{self.namespace}:{key}"

    def _initialize_schema(self) -> None:
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS product_lookup_cache (
                        cache_key TEXT PRIMARY KEY,
                        barcode TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        expires_at REAL NOT NULL,
                        accessed_at REAL NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS product_lookup_cache_expiry_idx
                        ON product_lookup_cache (expires_at);
                    CREATE INDEX IF NOT EXISTS product_lookup_cache_access_idx
                        ON product_lookup_cache (accessed_at);
                    CREATE TABLE IF NOT EXISTS product_lookup_leases (
                        cache_key TEXT PRIMARY KEY,
                        owner_id TEXT NOT NULL,
                        lease_until REAL NOT NULL,
                        acquired_at REAL NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS product_lookup_leases_expiry_idx
                        ON product_lookup_leases (lease_until);
                    """
                )
                self._connection.commit()
                return
            with self._connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rescue_product_lookup_cache (
                        cache_key text PRIMARY KEY,
                        barcode text NOT NULL,
                        payload jsonb NOT NULL,
                        expires_at double precision NOT NULL,
                        accessed_at double precision NOT NULL,
                        updated_at timestamptz NOT NULL DEFAULT now()
                    );
                    CREATE INDEX IF NOT EXISTS rescue_product_lookup_cache_expiry_idx
                        ON rescue_product_lookup_cache (expires_at);
                    CREATE INDEX IF NOT EXISTS rescue_product_lookup_cache_access_idx
                        ON rescue_product_lookup_cache (accessed_at);
                    CREATE TABLE IF NOT EXISTS rescue_product_lookup_leases (
                        cache_key text PRIMARY KEY,
                        owner_id text NOT NULL,
                        lease_until double precision NOT NULL,
                        acquired_at double precision NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS rescue_product_lookup_leases_expiry_idx
                        ON rescue_product_lookup_leases (lease_until);
                    """
                )
            self._connection.commit()

    def get(self, key: str) -> ProductLookupResult | None:
        cache_key = self._cache_key(key)
        now = float(self._clock())
        with self._lock:
            if self._dialect == "sqlite":
                row = self._connection.execute(
                    "SELECT payload, expires_at FROM product_lookup_cache WHERE cache_key = ?",
                    (cache_key,),
                ).fetchone()
                if row is None:
                    return None
                payload, expires_at = row[0], row[1]
                if float(expires_at) <= now:
                    self._connection.execute("DELETE FROM product_lookup_cache WHERE cache_key = ?", (cache_key,))
                    self._connection.commit()
                    return None
                self._connection.execute("UPDATE product_lookup_cache SET accessed_at = ? WHERE cache_key = ?", (now, cache_key))
                self._connection.commit()
            else:
                with self._connection.cursor() as cursor:
                    cursor.execute("SELECT payload, expires_at FROM rescue_product_lookup_cache WHERE cache_key = %s", (cache_key,))
                    row = cursor.fetchone()
                    if row is None:
                        self._connection.rollback()
                        return None
                    payload, expires_at = row
                    if float(expires_at) <= now:
                        cursor.execute("DELETE FROM rescue_product_lookup_cache WHERE cache_key = %s", (cache_key,))
                        self._connection.commit()
                        return None
                    cursor.execute("UPDATE rescue_product_lookup_cache SET accessed_at = %s, updated_at = now() WHERE cache_key = %s", (now, cache_key))
                self._connection.commit()
            try:
                if isinstance(payload, (str, bytes, bytearray)):
                    payload = json.loads(payload)
                result = _deserialize_product_lookup_result(payload)
            except (TypeError, ValueError, json.JSONDecodeError):
                result = None
            if result is None:
                self._delete_locked(cache_key)
            return result

    def put(self, key: str, result: ProductLookupResult) -> None:
        cache_key = self._cache_key(key)
        now = float(self._clock())
        expires_at = now + _product_lookup_ttl(
            result,
            success_ttl=self.success_ttl_seconds,
            negative_ttl=self.negative_ttl_seconds,
            failure_ttl=self.failure_ttl_seconds,
        )
        payload = _serialize_product_lookup_result(result)
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.execute(
                    """
                    INSERT INTO product_lookup_cache (cache_key, barcode, payload, expires_at, accessed_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        barcode = excluded.barcode,
                        payload = excluded.payload,
                        expires_at = excluded.expires_at,
                        accessed_at = excluded.accessed_at
                    """,
                    (cache_key, result.barcode, json.dumps(payload, ensure_ascii=False, separators=(",", ":")), expires_at, now),
                )
            else:
                from psycopg.types.json import Jsonb

                with self._connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rescue_product_lookup_cache (cache_key, barcode, payload, expires_at, accessed_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (cache_key) DO UPDATE SET
                            barcode = EXCLUDED.barcode,
                            payload = EXCLUDED.payload,
                            expires_at = EXCLUDED.expires_at,
                            accessed_at = EXCLUDED.accessed_at,
                            updated_at = now()
                        """,
                        (cache_key, result.barcode, Jsonb(payload), expires_at, now),
                    )
            self._trim_locked()
            self._connection.commit()

    def _delete_locked(self, cache_key: str) -> None:
        if self._dialect == "sqlite":
            self._connection.execute("DELETE FROM product_lookup_cache WHERE cache_key = ?", (cache_key,))
        else:
            with self._connection.cursor() as cursor:
                cursor.execute("DELETE FROM rescue_product_lookup_cache WHERE cache_key = %s", (cache_key,))
        self._connection.commit()

    def _trim_locked(self) -> None:
        table = "product_lookup_cache" if self._dialect == "sqlite" else "rescue_product_lookup_cache"
        rows = self._connection.execute(f"SELECT cache_key FROM {table} ORDER BY accessed_at DESC").fetchall() if self._dialect == "sqlite" else self._fetch_postgres_cache_keys()
        stale_keys = [row[0] for row in rows[self.max_entries:]]
        if not stale_keys:
            return
        if self._dialect == "sqlite":
            self._connection.executemany("DELETE FROM product_lookup_cache WHERE cache_key = ?", [(key,) for key in stale_keys])
        else:
            with self._connection.cursor() as cursor:
                cursor.executemany("DELETE FROM rescue_product_lookup_cache WHERE cache_key = %s", [(key,) for key in stale_keys])

    def _fetch_postgres_cache_keys(self):
        with self._connection.cursor() as cursor:
            cursor.execute("SELECT cache_key FROM rescue_product_lookup_cache ORDER BY accessed_at DESC")
            return cursor.fetchall()

    def clear(self) -> None:
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.execute("DELETE FROM product_lookup_cache")
            else:
                with self._connection.cursor() as cursor:
                    cursor.execute("DELETE FROM rescue_product_lookup_cache")
            self._connection.commit()

    def try_acquire(self, key: str, *, owner_id: str) -> bool:
        """Acquire a bounded single-flight lease for a cache miss.

        A crashed owner cannot hold the key forever: another worker may claim
        it after ``single_flight_lease_seconds``. The lease table contains no
        product or date data, only coordination metadata.
        """

        cache_key = self._cache_key(key)
        owner = str(owner_id or "").strip()
        if not owner:
            return False
        now = float(self._clock())
        lease_until = now + self.single_flight_lease_seconds
        with self._lock:
            if self._dialect == "sqlite":
                try:
                    self._connection.execute("BEGIN IMMEDIATE")
                    self._connection.execute("DELETE FROM product_lookup_leases WHERE lease_until <= ?", (now,))
                    row = self._connection.execute(
                        "SELECT owner_id FROM product_lookup_leases WHERE cache_key = ?",
                        (cache_key,),
                    ).fetchone()
                    if row is not None and row[0] != owner:
                        self._connection.commit()
                        return False
                    if row is None:
                        self._connection.execute(
                            "INSERT INTO product_lookup_leases (cache_key, owner_id, lease_until, acquired_at) VALUES (?, ?, ?, ?)",
                            (cache_key, owner, lease_until, now),
                        )
                    else:
                        self._connection.execute(
                            "UPDATE product_lookup_leases SET lease_until = ?, acquired_at = ? WHERE cache_key = ? AND owner_id = ?",
                            (lease_until, now, cache_key, owner),
                        )
                    self._connection.commit()
                    return True
                except sqlite3.Error:
                    self._connection.rollback()
                    return False

            try:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT pg_advisory_xact_lock(hashtext(%s))",
                        (f"rescue-meal-product-lookup:{cache_key}",),
                    )
                    cursor.execute("DELETE FROM rescue_product_lookup_leases WHERE lease_until <= %s", (now,))
                    cursor.execute(
                        """
                        INSERT INTO rescue_product_lookup_leases (cache_key, owner_id, lease_until, acquired_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (cache_key) DO NOTHING
                        RETURNING cache_key
                        """,
                        (cache_key, owner, lease_until, now),
                    )
                    acquired = cursor.fetchone() is not None
                    if not acquired:
                        cursor.execute(
                            """
                            UPDATE rescue_product_lookup_leases
                            SET lease_until = %s, acquired_at = %s
                            WHERE cache_key = %s AND owner_id = %s
                            RETURNING cache_key
                            """,
                            (lease_until, now, cache_key, owner),
                        )
                        acquired = cursor.fetchone() is not None
                self._connection.commit()
                return acquired
            except Exception:
                self._connection.rollback()
                return False

    def release(self, key: str, *, owner_id: str) -> None:
        cache_key = self._cache_key(key)
        owner = str(owner_id or "").strip()
        if not owner:
            return
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.execute(
                    "DELETE FROM product_lookup_leases WHERE cache_key = ? AND owner_id = ?",
                    (cache_key, owner),
                )
            else:
                with self._connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM rescue_product_lookup_leases WHERE cache_key = %s AND owner_id = %s",
                        (cache_key, owner),
                    )
            self._connection.commit()


class ProductProviderRateLimiter:
    """Process-local fallback for in-memory development mode."""

    def __init__(self, *, max_requests: int = 10, window_seconds: float = 60, clock: Callable[[], float] = time.time) -> None:
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1.0, float(window_seconds))
        self._clock = clock
        self._events: dict[str, deque[float]] = {}
        self._lock = RLock()

    @classmethod
    def from_env(cls) -> "ProductProviderRateLimiter":
        return cls(
            max_requests=_bounded_int("RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS", 10, minimum=1, maximum=120),
            window_seconds=_bounded_float("RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS", 60, minimum=1, maximum=3600),
        )

    def allow(self, provider: str, *, now: float | None = None) -> bool:
        provider_key = str(provider or "").strip()
        if not provider_key:
            return False
        current = float(self._clock() if now is None else now)
        cutoff = current - self.window_seconds
        with self._lock:
            events = self._events.setdefault(provider_key, deque())
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.max_requests:
                return False
            events.append(current)
            return True

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


class SharedProductProviderRateLimiter:
    """SQL-backed provider rate limiter shared across API workers."""

    def __init__(
        self,
        connection,
        *,
        dialect: Literal["sqlite", "postgres"],
        lock: RLock | None = None,
        max_requests: int = 10,
        window_seconds: float = 60,
        clock: Callable[[], float] = time.time,
        initialize_schema: bool = True,
    ) -> None:
        if dialect not in {"sqlite", "postgres"}:
            raise ValueError("provider rate limiter dialect must be sqlite or postgres")
        self._connection = connection
        self._dialect = dialect
        self._lock = lock or RLock()
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1.0, float(window_seconds))
        self._clock = clock
        if initialize_schema:
            self._initialize_schema()

    @classmethod
    def from_env(cls, connection, *, dialect: Literal["sqlite", "postgres"], lock: RLock | None = None, initialize_schema: bool = True) -> "SharedProductProviderRateLimiter":
        return cls(
            connection,
            dialect=dialect,
            lock=lock,
            max_requests=_bounded_int("RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS", 10, minimum=1, maximum=120),
            window_seconds=_bounded_float("RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS", 60, minimum=1, maximum=3600),
            initialize_schema=initialize_schema,
        )

    def _initialize_schema(self) -> None:
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS product_provider_rate_limit_events (
                        provider TEXT NOT NULL,
                        occurred_at REAL NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS product_provider_rate_limit_events_provider_time_idx
                        ON product_provider_rate_limit_events (provider, occurred_at);
                    """
                )
                self._connection.commit()
                return
            with self._connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rescue_product_provider_rate_limit_events (
                        provider text NOT NULL,
                        occurred_at double precision NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS rescue_product_provider_rate_limit_events_provider_time_idx
                        ON rescue_product_provider_rate_limit_events (provider, occurred_at);
                    """
                )
            self._connection.commit()

    def allow(self, provider: str, *, now: float | None = None) -> bool:
        provider_key = str(provider or "").strip()
        if not provider_key:
            return False
        current = float(self._clock() if now is None else now)
        cutoff = current - self.window_seconds
        with self._lock:
            if self._dialect == "sqlite":
                try:
                    self._connection.execute("BEGIN IMMEDIATE")
                    self._connection.execute("DELETE FROM product_provider_rate_limit_events WHERE occurred_at <= ?", (cutoff,))
                    row = self._connection.execute(
                        "SELECT COUNT(*) FROM product_provider_rate_limit_events WHERE provider = ? AND occurred_at > ?",
                        (provider_key, cutoff),
                    ).fetchone()
                    if int(row[0]) >= self.max_requests:
                        self._connection.commit()
                        return False
                    self._connection.execute(
                        "INSERT INTO product_provider_rate_limit_events (provider, occurred_at) VALUES (?, ?)",
                        (provider_key, current),
                    )
                    self._connection.commit()
                    return True
                except sqlite3.Error:
                    self._connection.rollback()
                    return False

            try:
                with self._connection.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"rescue-meal-provider-rate:{provider_key}",))
                    cursor.execute("DELETE FROM rescue_product_provider_rate_limit_events WHERE occurred_at <= %s", (cutoff,))
                    cursor.execute(
                        "SELECT COUNT(*) FROM rescue_product_provider_rate_limit_events WHERE provider = %s AND occurred_at > %s",
                        (provider_key, cutoff),
                    )
                    row = cursor.fetchone()
                    if int(row[0]) >= self.max_requests:
                        self._connection.commit()
                        return False
                    cursor.execute(
                        "INSERT INTO rescue_product_provider_rate_limit_events (provider, occurred_at) VALUES (%s, %s)",
                        (provider_key, current),
                    )
                self._connection.commit()
                return True
            except Exception:
                self._connection.rollback()
                return False

    def reset(self) -> None:
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.execute("DELETE FROM product_provider_rate_limit_events")
            else:
                with self._connection.cursor() as cursor:
                    cursor.execute("DELETE FROM rescue_product_provider_rate_limit_events")
            self._connection.commit()


@dataclass(frozen=True)
class _NameCacheEntry:
    result: ProductNameLookupResult
    expires_at: float
    touched_at: float


class ProductNameLookupCache:
    """Bounded process cache for product-name provider results."""

    def __init__(
        self,
        *,
        ttl_seconds: float = 24 * 60 * 60,
        negative_ttl_seconds: float = 10 * 60,
        failure_ttl_seconds: float = 60,
        max_entries: int = 1_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = max(1.0, float(ttl_seconds))
        self.negative_ttl_seconds = max(1.0, float(negative_ttl_seconds))
        self.failure_ttl_seconds = max(1.0, float(failure_ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self._clock = clock
        self._entries: dict[str, _NameCacheEntry] = {}
        self._lock = RLock()

    @classmethod
    def from_env(cls) -> "ProductNameLookupCache":
        return cls(
            ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NAME_CACHE_TTL_SECONDS", 24 * 60 * 60, minimum=60, maximum=30 * 24 * 60 * 60),
            negative_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NAME_NEGATIVE_CACHE_TTL_SECONDS", 10 * 60, minimum=30, maximum=24 * 60 * 60),
            failure_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NAME_FAILURE_CACHE_TTL_SECONDS", 60, minimum=10, maximum=15 * 60),
            max_entries=_bounded_int("RESCUE_MEAL_PRODUCT_NAME_CACHE_MAX_ENTRIES", 1_000, minimum=100, maximum=50_000),
        )

    def get(self, key: str) -> ProductNameLookupResult | None:
        now = self._clock()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._entries.pop(key, None)
                return None
            self._entries[key] = replace(entry, touched_at=now)
            return _copy_name_lookup_result(entry.result)

    def put(self, key: str, result: ProductNameLookupResult) -> None:
        now = self._clock()
        if result.status == "matched":
            ttl = self.ttl_seconds
        elif result.status == "not_found":
            ttl = self.negative_ttl_seconds
        else:
            ttl = self.failure_ttl_seconds
        with self._lock:
            self._entries[key] = _NameCacheEntry(result=_copy_name_lookup_result(result), expires_at=now + ttl, touched_at=now)
            if len(self._entries) > self.max_entries:
                oldest_key = min(self._entries, key=lambda item: self._entries[item].touched_at)
                self._entries.pop(oldest_key, None)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


class SharedProductNameLookupCache:
    """Durable shared cache for MFDS product-name enrichment candidates."""

    def __init__(
        self,
        connection,
        *,
        dialect: Literal["sqlite", "postgres"],
        lock: RLock | None = None,
        success_ttl_seconds: float = 24 * 60 * 60,
        negative_ttl_seconds: float = 10 * 60,
        failure_ttl_seconds: float = 60,
        max_entries: int = 1_000,
        namespace: str = "product-name-v1",
        single_flight_lease_seconds: float = 45,
        single_flight_wait_seconds: float = 5,
        clock: Callable[[], float] = time.time,
        initialize_schema: bool = True,
    ) -> None:
        if dialect not in {"sqlite", "postgres"}:
            raise ValueError("product name cache dialect must be sqlite or postgres")
        self._connection = connection
        self._dialect = dialect
        self._lock = lock or RLock()
        self.success_ttl_seconds = max(1.0, float(success_ttl_seconds))
        self.negative_ttl_seconds = max(1.0, float(negative_ttl_seconds))
        self.failure_ttl_seconds = max(1.0, float(failure_ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self.namespace = namespace.strip() or "product-name-v1"
        self.single_flight_lease_seconds = max(5.0, float(single_flight_lease_seconds))
        self.single_flight_wait_seconds = max(1.0, float(single_flight_wait_seconds))
        self._clock = clock
        if initialize_schema:
            self._initialize_schema()

    @classmethod
    def from_env(cls, connection, *, dialect: Literal["sqlite", "postgres"], lock: RLock | None = None, initialize_schema: bool = True) -> "SharedProductNameLookupCache":
        return cls(
            connection,
            dialect=dialect,
            lock=lock,
            success_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NAME_CACHE_TTL_SECONDS", 24 * 60 * 60, minimum=60, maximum=30 * 24 * 60 * 60),
            negative_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NAME_NEGATIVE_CACHE_TTL_SECONDS", 10 * 60, minimum=30, maximum=24 * 60 * 60),
            failure_ttl_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_NAME_FAILURE_CACHE_TTL_SECONDS", 60, minimum=10, maximum=15 * 60),
            max_entries=_bounded_int("RESCUE_MEAL_PRODUCT_NAME_CACHE_MAX_ENTRIES", 1_000, minimum=100, maximum=50_000),
            namespace=os.getenv("RESCUE_MEAL_PRODUCT_NAME_CACHE_NAMESPACE", "product-name-v1"),
            single_flight_lease_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS", 45, minimum=5, maximum=300),
            single_flight_wait_seconds=_bounded_float("RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS", 5, minimum=1, maximum=30),
            initialize_schema=initialize_schema,
        )

    def _cache_key(self, key: str) -> str:
        return f"{self.namespace}:{key}"

    def _initialize_schema(self) -> None:
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS product_name_lookup_cache (
                        cache_key TEXT PRIMARY KEY,
                        query TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        expires_at REAL NOT NULL,
                        accessed_at REAL NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS product_name_lookup_cache_expiry_idx
                        ON product_name_lookup_cache (expires_at);
                    CREATE INDEX IF NOT EXISTS product_name_lookup_cache_access_idx
                        ON product_name_lookup_cache (accessed_at);
                    CREATE TABLE IF NOT EXISTS product_name_lookup_leases (
                        cache_key TEXT PRIMARY KEY,
                        owner_id TEXT NOT NULL,
                        lease_until REAL NOT NULL,
                        acquired_at REAL NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS product_name_lookup_leases_expiry_idx
                        ON product_name_lookup_leases (lease_until);
                    """
                )
                self._connection.commit()
                return
            with self._connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS rescue_product_name_lookup_cache (
                        cache_key text PRIMARY KEY,
                        query text NOT NULL,
                        payload jsonb NOT NULL,
                        expires_at double precision NOT NULL,
                        accessed_at double precision NOT NULL,
                        updated_at timestamptz NOT NULL DEFAULT now()
                    );
                    CREATE INDEX IF NOT EXISTS rescue_product_name_lookup_cache_expiry_idx
                        ON rescue_product_name_lookup_cache (expires_at);
                    CREATE INDEX IF NOT EXISTS rescue_product_name_lookup_cache_access_idx
                        ON rescue_product_name_lookup_cache (accessed_at);
                    CREATE TABLE IF NOT EXISTS rescue_product_name_lookup_leases (
                        cache_key text PRIMARY KEY,
                        owner_id text NOT NULL,
                        lease_until double precision NOT NULL,
                        acquired_at double precision NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS rescue_product_name_lookup_leases_expiry_idx
                        ON rescue_product_name_lookup_leases (lease_until);
                    """
                )
            self._connection.commit()

    def get(self, key: str) -> ProductNameLookupResult | None:
        cache_key = self._cache_key(key)
        now = float(self._clock())
        with self._lock:
            if self._dialect == "sqlite":
                row = self._connection.execute(
                    "SELECT payload, expires_at FROM product_name_lookup_cache WHERE cache_key = ?",
                    (cache_key,),
                ).fetchone()
                if row is None:
                    return None
                payload, expires_at = row[0], row[1]
                if float(expires_at) <= now:
                    self._connection.execute("DELETE FROM product_name_lookup_cache WHERE cache_key = ?", (cache_key,))
                    self._connection.commit()
                    return None
                self._connection.execute("UPDATE product_name_lookup_cache SET accessed_at = ? WHERE cache_key = ?", (now, cache_key))
                self._connection.commit()
            else:
                with self._connection.cursor() as cursor:
                    cursor.execute("SELECT payload, expires_at FROM rescue_product_name_lookup_cache WHERE cache_key = %s", (cache_key,))
                    row = cursor.fetchone()
                    if row is None:
                        self._connection.rollback()
                        return None
                    payload, expires_at = row
                    if float(expires_at) <= now:
                        cursor.execute("DELETE FROM rescue_product_name_lookup_cache WHERE cache_key = %s", (cache_key,))
                        self._connection.commit()
                        return None
                    cursor.execute("UPDATE rescue_product_name_lookup_cache SET accessed_at = %s, updated_at = now() WHERE cache_key = %s", (now, cache_key))
                self._connection.commit()
            try:
                if isinstance(payload, (str, bytes, bytearray)):
                    payload = json.loads(payload)
                result = _deserialize_product_name_lookup_result(payload)
            except (TypeError, ValueError, json.JSONDecodeError):
                result = None
            if result is None:
                self._delete_locked(cache_key)
            return result

    def put(self, key: str, result: ProductNameLookupResult) -> None:
        cache_key = self._cache_key(key)
        now = float(self._clock())
        if result.status == "matched":
            ttl = self.success_ttl_seconds
        elif result.status == "not_found":
            ttl = self.negative_ttl_seconds
        else:
            ttl = self.failure_ttl_seconds
        expires_at = now + ttl
        payload = _serialize_product_name_lookup_result(result)
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.execute(
                    """
                    INSERT INTO product_name_lookup_cache (cache_key, query, payload, expires_at, accessed_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        query = excluded.query,
                        payload = excluded.payload,
                        expires_at = excluded.expires_at,
                        accessed_at = excluded.accessed_at
                    """,
                    (cache_key, key, json.dumps(payload, ensure_ascii=False, separators=(",", ":")), expires_at, now),
                )
            else:
                from psycopg.types.json import Jsonb

                with self._connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO rescue_product_name_lookup_cache (cache_key, query, payload, expires_at, accessed_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (cache_key) DO UPDATE SET
                            query = EXCLUDED.query,
                            payload = EXCLUDED.payload,
                            expires_at = EXCLUDED.expires_at,
                            accessed_at = EXCLUDED.accessed_at,
                            updated_at = now()
                        """,
                        (cache_key, key, Jsonb(payload), expires_at, now),
                    )
            self._trim_locked()
            self._connection.commit()

    def _delete_locked(self, cache_key: str) -> None:
        if self._dialect == "sqlite":
            self._connection.execute("DELETE FROM product_name_lookup_cache WHERE cache_key = ?", (cache_key,))
        else:
            with self._connection.cursor() as cursor:
                cursor.execute("DELETE FROM rescue_product_name_lookup_cache WHERE cache_key = %s", (cache_key,))
        self._connection.commit()

    def _trim_locked(self) -> None:
        if self._dialect == "sqlite":
            rows = self._connection.execute("SELECT cache_key FROM product_name_lookup_cache ORDER BY accessed_at DESC").fetchall()
        else:
            with self._connection.cursor() as cursor:
                cursor.execute("SELECT cache_key FROM rescue_product_name_lookup_cache ORDER BY accessed_at DESC")
                rows = cursor.fetchall()
        stale_keys = [row[0] for row in rows[self.max_entries:]]
        if not stale_keys:
            return
        if self._dialect == "sqlite":
            self._connection.executemany("DELETE FROM product_name_lookup_cache WHERE cache_key = ?", [(key,) for key in stale_keys])
        else:
            with self._connection.cursor() as cursor:
                cursor.executemany("DELETE FROM rescue_product_name_lookup_cache WHERE cache_key = %s", [(key,) for key in stale_keys])

    def try_acquire(self, key: str, *, owner_id: str) -> bool:
        cache_key = self._cache_key(key)
        owner = str(owner_id or "").strip()
        if not owner:
            return False
        now = float(self._clock())
        lease_until = now + self.single_flight_lease_seconds
        with self._lock:
            if self._dialect == "sqlite":
                try:
                    self._connection.execute("BEGIN IMMEDIATE")
                    self._connection.execute("DELETE FROM product_name_lookup_leases WHERE lease_until <= ?", (now,))
                    row = self._connection.execute("SELECT owner_id FROM product_name_lookup_leases WHERE cache_key = ?", (cache_key,)).fetchone()
                    if row is not None and row[0] != owner:
                        self._connection.commit()
                        return False
                    if row is None:
                        self._connection.execute(
                            "INSERT INTO product_name_lookup_leases (cache_key, owner_id, lease_until, acquired_at) VALUES (?, ?, ?, ?)",
                            (cache_key, owner, lease_until, now),
                        )
                    else:
                        self._connection.execute(
                            "UPDATE product_name_lookup_leases SET lease_until = ?, acquired_at = ? WHERE cache_key = ? AND owner_id = ?",
                            (lease_until, now, cache_key, owner),
                        )
                    self._connection.commit()
                    return True
                except sqlite3.Error:
                    self._connection.rollback()
                    return False
            try:
                with self._connection.cursor() as cursor:
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"rescue-meal-product-name-lookup:{cache_key}",))
                    cursor.execute("DELETE FROM rescue_product_name_lookup_leases WHERE lease_until <= %s", (now,))
                    cursor.execute(
                        """
                        INSERT INTO rescue_product_name_lookup_leases (cache_key, owner_id, lease_until, acquired_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (cache_key) DO NOTHING
                        RETURNING cache_key
                        """,
                        (cache_key, owner, lease_until, now),
                    )
                    acquired = cursor.fetchone() is not None
                    if not acquired:
                        cursor.execute(
                            """
                            UPDATE rescue_product_name_lookup_leases
                            SET lease_until = %s, acquired_at = %s
                            WHERE cache_key = %s AND owner_id = %s
                            RETURNING cache_key
                            """,
                            (lease_until, now, cache_key, owner),
                        )
                        acquired = cursor.fetchone() is not None
                self._connection.commit()
                return acquired
            except Exception:
                self._connection.rollback()
                return False

    def release(self, key: str, *, owner_id: str) -> None:
        cache_key = self._cache_key(key)
        owner = str(owner_id or "").strip()
        if not owner:
            return
        with self._lock:
            if self._dialect == "sqlite":
                self._connection.execute("DELETE FROM product_name_lookup_leases WHERE cache_key = ? AND owner_id = ?", (cache_key, owner))
            else:
                with self._connection.cursor() as cursor:
                    cursor.execute("DELETE FROM rescue_product_name_lookup_leases WHERE cache_key = %s AND owner_id = %s", (cache_key, owner))
            self._connection.commit()


LOCAL_PRODUCTS: dict[str, ProductCandidate] = {
    "8801114167523": ProductCandidate(
        source="local_fixture",
        source_url=None,
        canonical_name="국산콩 두부",
        brand="풀무원",
        category="두부·콩",
        quantity_text="1모",
        confidence=0.99,
        provenance_note="프로젝트 local fixture",
        source_freshness="current",
    ),
}


_LOCAL_RECEIPT_ALIASES: dict[str, str] = {
    "국내산 시금치": "시금치",
    "시금치": "시금치",
    "풀무원 국산콩 두부": "국산콩 두부",
    "국산콩 두부": "국산콩 두부",
    "두부": "국산콩 두부",
    "맛타리버섯": "맛타리버섯",
    "동물복지 달걀": "동물복지 달걀",
    "계란": "동물복지 달걀",
    "달걀": "동물복지 달걀",
}


def resolve_receipt_name(
    raw_name: str,
    *,
    parser_name: str | None = None,
    parser_confidence: float = 0,
    user_aliases: Mapping[str, str] | None = None,
) -> ReceiptNameResolution:
    """Resolve a receipt's display name without guessing from an LLM.

    User-confirmed aliases win over the small reviewed local rule set, and
    parser output remains the transparent fallback. The returned candidates
    are review evidence, not permission to create a stock lot by themselves.
    """

    raw = str(raw_name or "").strip()
    raw_key = normalize_product_name(raw)
    candidates: list[ReceiptMatchCandidate] = []

    normalized_aliases = {
        normalize_product_name(alias): canonical.strip()
        for alias, canonical in (user_aliases or {}).items()
        if str(alias).strip() and str(canonical).strip()
    }
    user_canonical = normalized_aliases.get(raw_key)
    if user_canonical:
        candidates.append(
            ReceiptMatchCandidate(
                source="user_confirmed_alias",
                canonical_name=user_canonical,
                confidence=0.98,
                provenance_note="이 workspace에서 사용자가 확인한 영수증 별칭",
            )
        )

    local_canonical = next(
        (
            canonical
            for alias, canonical in _LOCAL_RECEIPT_ALIASES.items()
            if normalize_product_name(alias) == raw_key
        ),
        None,
    )
    if local_canonical and not any(item.canonical_name == local_canonical for item in candidates):
        candidates.append(
            ReceiptMatchCandidate(
                source="local_rule",
                canonical_name=local_canonical,
                confidence=0.92,
                provenance_note="프로젝트에서 검토한 영수증 상품명 별칭 규칙",
            )
        )

    parser_canonical = str(parser_name or "").strip()
    if parser_canonical and not any(item.canonical_name == parser_canonical for item in candidates):
        candidates.append(
            ReceiptMatchCandidate(
                source="parser",
                canonical_name=parser_canonical,
                confidence=max(0.0, min(1.0, float(parser_confidence))),
                provenance_note="영수증 parser가 만든 canonical 후보; 사용자 확인 필요",
            )
        )

    if candidates:
        selected = candidates[0]
        return ReceiptNameResolution(
            canonical_name=selected.canonical_name,
            source=selected.source,
            confidence=selected.confidence,
            candidates=candidates,
        )
    return ReceiptNameResolution(canonical_name=None, source="unmatched", confidence=0, candidates=[])


def _wait_for_shared_product_result(cache: ProductLookupCacheBackend, key: str, *, wait_seconds: float) -> ProductLookupResult | None:
    deadline = time.monotonic() + max(0.0, min(float(wait_seconds), 30.0))
    while True:
        result = cache.get(key)
        if result is not None:
            return result
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None
        time.sleep(min(0.05, remaining))


def _wait_for_shared_product_name_result(cache: ProductNameLookupCacheBackend, key: str, *, wait_seconds: float) -> ProductNameLookupResult | None:
    deadline = time.monotonic() + max(0.0, min(float(wait_seconds), 30.0))
    while True:
        result = cache.get(key)
        if result is not None:
            return result
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None
        time.sleep(min(0.05, remaining))


def _cached_product_name_lookup(
    *,
    provider: str,
    query: str,
    bounded_limit: int,
    cache_key: str,
    cache: ProductNameLookupCacheBackend,
    rate_limiter: ProductProviderRateLimiterBackend | None,
    rate_limit_provider: str | None = None,
    metrics: ProductProviderRuntimeMetrics | None,
    fetch: Callable[[], ProductNameLookupResult],
) -> ProductNameLookupResult:
    """Run one bounded, shared-safe product-name provider lookup.

    Name providers share the same SQL cache and single-flight contract, but
    each provider gets its own cache-key prefix and rate-limit bucket. This
    keeps a legacy fallback search from colliding with the MFDS response for
    the same user-facing query.
    """

    cached = cache.get(cache_key)
    if cached is not None:
        if metrics is not None:
            metrics.record_cache("product_name", hit=True)
        return cached
    if metrics is not None:
        metrics.record_cache("product_name", hit=False)

    single_flight_cache = cache if callable(getattr(cache, "try_acquire", None)) and callable(getattr(cache, "release", None)) else None
    single_flight_owner: str | None = None
    if single_flight_cache is not None:
        single_flight_owner = f"pid-{os.getpid()}-{secrets.token_hex(8)}"
        if not single_flight_cache.try_acquire(cache_key, owner_id=single_flight_owner):
            if metrics is not None:
                metrics.record_single_flight("product_name", "wait")
            waited = _wait_for_shared_product_name_result(
                cache,
                cache_key,
                wait_seconds=float(getattr(cache, "single_flight_wait_seconds", 5.0)),
            )
            if waited is not None:
                if metrics is not None:
                    metrics.record_single_flight("product_name", "hit")
                return waited
            if not single_flight_cache.try_acquire(cache_key, owner_id=single_flight_owner):
                if metrics is not None:
                    metrics.record_single_flight("product_name", "timeout")
                return ProductNameLookupResult(
                    provider,
                    "unavailable",
                    detail="다른 worker가 같은 상품명 후보를 조회 중입니다. 잠시 후 다시 시도해 주세요.",
                )

    try:
        limiter_key = rate_limit_provider or provider
        if rate_limiter is not None and not rate_limiter.allow(limiter_key):
            if metrics is not None:
                metrics.record_rate_limited("product_name", provider)
            result = ProductNameLookupResult(
                provider,
                "rate_limited",
                detail=f"{provider} provider 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
            )
            cache.put(cache_key, result)
            return result

        provider_started = time.perf_counter()
        try:
            result = fetch()
        except Exception:  # pragma: no cover - provider adapters must be non-fatal
            result = ProductNameLookupResult(
                provider,
                "unavailable",
                detail=f"{provider} provider 조회를 완료하지 못했습니다.",
            )
        cache.put(cache_key, result)
        if metrics is not None:
            metrics.record_provider_call(
                "product_name",
                provider,
                status=result.status,
                latency_ms=(time.perf_counter() - provider_started) * 1000,
            )
        return result
    finally:
        if single_flight_cache is not None and single_flight_owner is not None:
            try:
                single_flight_cache.release(cache_key, owner_id=single_flight_owner)
            except Exception:  # pragma: no cover - cleanup must not mask the lookup result
                pass


def resolve_product(
    barcode: str,
    *,
    enable_external: bool | None = None,
    cache: ProductLookupCacheBackend | None = None,
    rate_limiter: ProductProviderRateLimiterBackend | None = None,
    metrics: ProductProviderRuntimeMetrics | None = None,
    providers: Sequence[tuple[str, ProductResolverProvider]] | None = None,
) -> ProductLookupResult:
    normalized = normalize_barcode(barcode)
    if not normalized:
        return ProductLookupResult(
            normalized,
            "not_found",
            [],
            ["바코드가 비어 있어 상품 조회를 시작하지 않았습니다."],
            True,
            {"input": "not_found"},
        )

    local = LOCAL_PRODUCTS.get(normalized) or LOCAL_PRODUCTS.get(normalized.lstrip("0"))
    if local:
        return ProductLookupResult(normalized, "matched", [local], [], True, {"local_fixture": "matched"})

    external_enabled = _external_enabled() if enable_external is None else enable_external
    if not external_enabled:
        return ProductLookupResult(
            normalized,
            "provider_unavailable",
            [],
            ["외부 상품 DB 조회가 비활성화되어 있어 local 후보만 확인했습니다."],
            True,
            {"external": "disabled"},
        )

    lookup_cache = cache if cache is not None else _DEFAULT_PRODUCT_CACHE
    cached = lookup_cache.get(normalized)
    if cached is not None:
        if metrics is not None:
            metrics.record_cache("barcode", hit=True)
        return cached
    if metrics is not None:
        metrics.record_cache("barcode", hit=False)

    single_flight_cache = lookup_cache if callable(getattr(lookup_cache, "try_acquire", None)) and callable(getattr(lookup_cache, "release", None)) else None
    single_flight_owner: str | None = None
    if single_flight_cache is not None:
        single_flight_owner = f"pid-{os.getpid()}-{secrets.token_hex(8)}"
        if not single_flight_cache.try_acquire(normalized, owner_id=single_flight_owner):
            if metrics is not None:
                metrics.record_single_flight("barcode", "wait")
            waited = _wait_for_shared_product_result(
                lookup_cache,
                normalized,
                wait_seconds=float(getattr(lookup_cache, "single_flight_wait_seconds", 5.0)),
            )
            if waited is not None:
                if metrics is not None:
                    metrics.record_single_flight("barcode", "hit")
                return waited
            if not single_flight_cache.try_acquire(normalized, owner_id=single_flight_owner):
                if metrics is not None:
                    metrics.record_single_flight("barcode", "timeout")
                return ProductLookupResult(
                    normalized,
                    "provider_unavailable",
                    [],
                    ["다른 worker가 같은 상품을 조회 중입니다. 잠시 후 다시 시도해 주세요."],
                    True,
                    {"shared_cache": "unavailable"},
                )

    try:
        provider_specs = list(providers) if providers is not None else [
            ("mfds_c005", MfdsC005Resolver()),
            ("open_food_facts", OpenFoodFactsResolver()),
        ]
        candidates: list[ProductCandidate] = []
        warnings: list[str] = []
        provider_statuses: dict[str, ProviderStatus] = {}
        for provider_name, provider in provider_specs:
            try:
                if rate_limiter is not None and not rate_limiter.allow(provider_name):
                    if metrics is not None:
                        metrics.record_rate_limited("barcode", provider_name)
                    outcome = ProviderLookupResult(
                        provider_name,
                        "rate_limited",
                        detail=f"{provider_name} provider 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
                    )
                else:
                    started = time.perf_counter()
                    outcome = provider.lookup_result(normalized)
                    if metrics is not None:
                        metrics.record_provider_call(
                            "barcode",
                            provider_name,
                            status=outcome.status,
                            latency_ms=(time.perf_counter() - started) * 1000,
                        )
            except Exception:  # pragma: no cover - a provider must never break intake
                outcome = ProviderLookupResult(provider_name, "unavailable", detail="provider adapter raised an unexpected error")
                if metrics is not None:
                    metrics.record_provider_call("barcode", provider_name, status="unavailable")
            provider_statuses[provider_name] = outcome.status
            if outcome.candidate is not None:
                candidates.append(outcome.candidate)
            if outcome.detail:
                warnings.append(outcome.detail)

        candidates.sort(key=lambda item: (-item.confidence, _source_order(item.source)))
        if candidates:
            result = ProductLookupResult(
                normalized,
                "matched" if len(candidates) == 1 else "partial",
                candidates,
                warnings,
                True,
                provider_statuses,
            )
        else:
            has_provider_failure = any(status in {"unavailable", "rate_limited"} for status in provider_statuses.values())
            result = ProductLookupResult(
                normalized,
                "provider_unavailable" if has_provider_failure else "not_found",
                [],
                warnings or ["등록된 상품 후보를 찾지 못했습니다."],
                True,
                provider_statuses,
            )
        lookup_cache.put(normalized, result)
        return result
    finally:
        if single_flight_cache is not None and single_flight_owner is not None:
            try:
                single_flight_cache.release(normalized, owner_id=single_flight_owner)
            except Exception:  # pragma: no cover - cleanup must not mask the lookup result
                pass


class OpenFoodFactsResolver:
    """Read-only Open Food Facts product adapter.

    Open Food Facts is a user-contributed enrichment source. It can identify
    a product but cannot establish the date on the user's individual package.
    """

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_version: str | None = None,
        timeout: float | None = None,
        user_agent: str | None = None,
        client: httpx.Client | None = None,
        cache: ProductNameLookupCacheBackend | None = None,
        rate_limiter: ProductProviderRateLimiterBackend | None = None,
        metrics: ProductProviderRuntimeMetrics | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("RESCUE_MEAL_OPEN_FOOD_FACTS_BASE_URL", "https://world.openfoodfacts.org")).rstrip("/")
        configured_api_version = (api_version or os.getenv("RESCUE_MEAL_OPEN_FOOD_FACTS_API_VERSION", OPEN_FOOD_FACTS_API_VERSION)).strip()
        self.api_version = configured_api_version if re.fullmatch(r"v\d+(?:\.\d+){0,2}", configured_api_version) else OPEN_FOOD_FACTS_API_VERSION
        self.timeout = timeout if timeout is not None else _bounded_float("RESCUE_MEAL_PRODUCT_LOOKUP_TIMEOUT_SECONDS", 4.0, minimum=1, maximum=15)
        self.user_agent = user_agent or os.getenv(
            "RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT",
            "RescueMeal/0.1 (open-source-course-project)",
        )
        self.client = client
        self._name_cache = cache if cache is not None else _DEFAULT_PRODUCT_NAME_CACHE
        self._name_rate_limiter = rate_limiter
        self._name_metrics = metrics

    def lookup(self, barcode: str) -> ProductCandidate | None:
        return self.lookup_result(barcode).candidate

    def lookup_result(self, barcode: str) -> ProviderLookupResult:
        fields = "code,product_name,brands,categories,quantity"
        params = {
            "product_type": "all",
            "lc": "ko",
            "cc": "kr",
            "fields": fields,
        }
        endpoint = f"{self.base_url}/api/{self.api_version}/product/{quote(barcode, safe='')}"
        try:
            if self.client is not None:
                response = self.client.get(
                    endpoint,
                    params=params,
                    headers={"User-Agent": self.user_agent},
                    timeout=self.timeout,
                )
            else:
                with httpx.Client(timeout=self.timeout, headers={"User-Agent": self.user_agent}) as client:
                    response = client.get(endpoint, params=params)
            if response.status_code == 404:
                return ProviderLookupResult("open_food_facts", "not_found", detail="Open Food Facts에서 상품을 찾지 못했습니다.")
            if response.status_code == 429 or response.status_code == 503:
                return ProviderLookupResult("open_food_facts", "rate_limited", detail="Open Food Facts 조회 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.")
            if response.status_code >= 500:
                return ProviderLookupResult("open_food_facts", "unavailable", detail="Open Food Facts가 일시적으로 응답하지 않습니다.")
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException:
            return ProviderLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 응답 시간이 초과되었습니다.")
        except (httpx.HTTPError, ValueError):
            return ProviderLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 조회를 완료하지 못했습니다.")

        if not isinstance(payload, dict):
            return ProviderLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 응답 형식을 확인하지 못했습니다.")
        response_status = str(payload.get("status", "")).strip().lower()
        if response_status not in {"success", "success_with_errors"} or not isinstance(payload.get("product"), dict):
            return ProviderLookupResult("open_food_facts", "not_found", detail="Open Food Facts에서 등록된 상품 정보가 없습니다.")
        product = payload["product"]
        name = _clean_text(product.get("product_name_ko") or product.get("product_name"))
        if not name:
            return ProviderLookupResult("open_food_facts", "not_found", detail="Open Food Facts 상품명 필드가 비어 있습니다.")
        candidate = ProductCandidate(
            source="open_food_facts",
            source_url=f"{self.base_url}/product/{barcode}",
            canonical_name=name,
            brand=_first_text(product.get("brands")),
            category=_first_category(product.get("categories")),
            quantity_text=_clean_text(product.get("quantity")),
            confidence=0.62,
            provenance_note="Open Food Facts 사용자 기여 데이터 후보; 실제 라벨 확인 필요",
            source_freshness="current",
        )
        detail = "Open Food Facts 응답에 경고가 포함되어 일부 필드가 불완전할 수 있습니다." if response_status == "success_with_errors" else None
        return ProviderLookupResult("open_food_facts", "matched", candidate, detail=detail)

    def lookup_by_product_name(self, product_name: str, *, limit: int = 5) -> ProductNameLookupResult:
        """Search a receipt/manual name as a low-confidence product candidate.

        Open Food Facts documents full-text search as a legacy `/cgi/search.pl`
        route while its current v3 API is intended for product reads. This
        method is therefore an explicit, user-triggered fallback rather than
        an autocomplete provider. It returns product metadata only; it never
        returns a date assertion or a food-safety decision.
        """

        query = str(product_name or "").strip()
        if not query:
            return ProductNameLookupResult("open_food_facts", "not_found", detail="상품명이 비어 있어 Open Food Facts 검색을 시작하지 않았습니다.")
        normalized_query = normalize_product_name(query)
        if not normalized_query:
            return ProductNameLookupResult("open_food_facts", "not_found", detail="상품명에 검색 가능한 문자가 없어 Open Food Facts 검색을 시작하지 않았습니다.")
        bounded_limit = max(1, min(int(limit), 20))
        cache_key = f"open_food_facts:{normalized_query}:{bounded_limit}"
        return _cached_product_name_lookup(
            provider="open_food_facts",
            query=query,
            bounded_limit=bounded_limit,
            cache_key=cache_key,
            cache=self._name_cache,
            rate_limiter=self._name_rate_limiter,
            rate_limit_provider="open_food_facts_search",
            metrics=self._name_metrics,
            fetch=lambda: self._fetch_by_product_name(query, bounded_limit),
        )

    def _fetch_by_product_name(self, query: str, bounded_limit: int) -> ProductNameLookupResult:
        fields = "code,product_name,product_name_ko,brands,categories,quantity"
        endpoint = f"{self.base_url}/cgi/search.pl"
        params = {
            "search_terms": query,
            "search_simple": "1",
            "action": "process",
            "json": "1",
            "page_size": bounded_limit,
            "fields": fields,
        }
        try:
            if self.client is not None:
                response = self.client.get(
                    endpoint,
                    params=params,
                    headers={"User-Agent": self.user_agent},
                    timeout=self.timeout,
                )
            else:
                with httpx.Client(timeout=self.timeout, headers={"User-Agent": self.user_agent}) as client:
                    response = client.get(endpoint, params=params)
            if response.status_code == 429 or response.status_code == 503:
                return ProductNameLookupResult("open_food_facts", "rate_limited", detail="Open Food Facts 검색 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.")
            if response.status_code >= 500:
                return ProductNameLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 검색이 일시적으로 응답하지 않습니다.")
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException:
            return ProductNameLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 검색 응답 시간이 초과되었습니다.")
        except (httpx.HTTPError, ValueError):
            return ProductNameLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 검색을 완료하지 못했습니다.")

        if not isinstance(payload, dict) or not isinstance(payload.get("products"), list):
            return ProductNameLookupResult("open_food_facts", "unavailable", detail="Open Food Facts 검색 응답 형식을 확인하지 못했습니다.")

        candidates: list[ProductCandidate] = []
        seen: set[tuple[str, str]] = set()
        for product in payload["products"]:
            if not isinstance(product, dict):
                continue
            name = _clean_text(product.get("product_name_ko") or product.get("product_name"))
            if not name:
                continue
            confidence = _name_match_confidence(query, name)
            if confidence is None:
                continue
            code = _clean_text(product.get("code"))
            key = (code or "", normalize_product_name(name))
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                ProductCandidate(
                    source="open_food_facts",
                    source_url=f"{self.base_url}/product/{quote(code, safe='')}" if code else None,
                    canonical_name=name,
                    brand=_first_text(product.get("brands")),
                    category=_first_category(product.get("categories")),
                    quantity_text=_clean_text(product.get("quantity")),
                    confidence=round(min(0.66, confidence), 3),
                    provenance_note="Open Food Facts 검색 후보(사용자 기여 데이터); 실제 상품명·포장지 날짜 확인 필요",
                    source_freshness="current",
                )
            )
        if not candidates:
            return ProductNameLookupResult("open_food_facts", "not_found", detail="Open Food Facts에서 일치하는 상품명 후보를 찾지 못했습니다.")
        return ProductNameLookupResult("open_food_facts", "matched", candidates[:bounded_limit])


class MfdsC005Resolver:
    """Barcode-linked Korean product lookup through MFDS `C005`.

    C005 includes a product-level `POG_DAYCNT` field, but the official page
    warns that its underlying distribution barcode data stopped being updated
    after 2018. It is therefore a legacy candidate and never a package-date
    assertion.
    """

    source_url = "https://foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C005"

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("RESCUE_MEAL_MFDS_BASE_URL", "https://openapi.foodsafetykorea.go.kr")).rstrip("/")
        self.api_key = (api_key if api_key is not None else os.getenv("MFDS_API_KEY", "")).strip()
        self.timeout = timeout if timeout is not None else _bounded_float("RESCUE_MEAL_PRODUCT_LOOKUP_TIMEOUT_SECONDS", 4.0, minimum=1, maximum=15)
        self.client = client

    def lookup(self, barcode: str) -> ProductCandidate | None:
        return self.lookup_result(barcode).candidate

    def lookup_result(self, barcode: str) -> ProviderLookupResult:
        if not self.api_key:
            return ProviderLookupResult("mfds_c005", "unavailable", detail="식품안전나라 C005 API key가 설정되지 않았습니다.")

        endpoint = f"{self.base_url}/api/{quote(self.api_key, safe='')}/C005/json/1/1"
        try:
            if self.client is not None:
                response = self.client.get(endpoint, params={"BAR_CD": barcode}, timeout=self.timeout)
            else:
                with httpx.Client(timeout=self.timeout, headers={"User-Agent": "rescue-meal/0.1"}) as client:
                    response = client.get(endpoint, params={"BAR_CD": barcode})
            if response.status_code == 429:
                return ProviderLookupResult("mfds_c005", "rate_limited", detail="식품안전나라 C005 호출 한도에 도달했습니다.")
            if response.status_code >= 500:
                return ProviderLookupResult("mfds_c005", "unavailable", detail="식품안전나라 C005가 일시적으로 응답하지 않습니다.")
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException:
            return ProviderLookupResult("mfds_c005", "unavailable", detail="식품안전나라 C005 응답 시간이 초과되었습니다.")
        except (httpx.HTTPError, ValueError):
            return ProviderLookupResult("mfds_c005", "unavailable", detail="식품안전나라 C005 조회를 완료하지 못했습니다.")

        row = _first_mfds_row(payload, "C005", barcode)
        if row is None:
            message = _mfds_message(payload, "C005")
            code = _mfds_result_code(payload, "C005")
            if code in {"INFO-300", "INFO-310"}:
                provider_status: ProviderStatus = "rate_limited"
            elif code and code not in {"INFO-000", "INFO-200"}:
                provider_status = "unavailable"
            else:
                provider_status = "not_found"
            return ProviderLookupResult(provider="mfds_c005", status=provider_status, detail=message or "식품안전나라 C005에서 해당 바코드 상품을 찾지 못했습니다.")
        name = _clean_text(row.get("PRDLST_NM"))
        if not name:
            return ProviderLookupResult("mfds_c005", "not_found", detail="식품안전나라 C005 상품명 필드가 비어 있습니다.")
        shelf_life = _clean_text(row.get("POG_DAYCNT"))
        candidate = ProductCandidate(
            source="mfds_c005",
            source_url=self.source_url,
            canonical_name=name,
            brand=_clean_text(row.get("BSSH_NM")),
            category=_clean_text(row.get("PRDLST_DCNM")),
            quantity_text=None,
            confidence=0.80,
            provenance_note="식품안전나라 C005 제품 기준 후보; 2018년 이후 최신화 중단 안내와 개별 라벨 확인 필요",
            shelf_life_text=shelf_life,
            storage_hint=_storage_hint(shelf_life),
            source_freshness="legacy",
        )
        return ProviderLookupResult("mfds_c005", "matched", candidate)


class MfdsI1250Resolver:
    """Product-name adapter for the MFDS `I1250` product-report API.

    I1250 is deliberately separate from barcode lookup because its official
    request contract filters by product/report fields, not by barcode. A name
    result is a product-level reference candidate and never a package-date
    assertion.
    """

    source_url = "https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=656&show_cnt=10&start_idx=1&svc_no=I1250&svc_type_cd=API_TYPE06"

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
        client: httpx.Client | None = None,
        cache: ProductNameLookupCacheBackend | None = None,
        rate_limiter: ProductProviderRateLimiterBackend | None = None,
        metrics: ProductProviderRuntimeMetrics | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("RESCUE_MEAL_MFDS_BASE_URL", "https://openapi.foodsafetykorea.go.kr")).rstrip("/")
        self.api_key = (api_key if api_key is not None else os.getenv("MFDS_API_KEY", "")).strip()
        self.timeout = timeout if timeout is not None else _bounded_float("RESCUE_MEAL_PRODUCT_LOOKUP_TIMEOUT_SECONDS", 4.0, minimum=1, maximum=15)
        self.client = client
        self.cache = cache if cache is not None else _DEFAULT_PRODUCT_NAME_CACHE
        self.rate_limiter = rate_limiter
        self.metrics = metrics

    def lookup(self, barcode: str) -> ProductCandidate | None:
        del barcode
        return None

    def lookup_by_product_name(self, product_name: str, *, limit: int = 5) -> ProductNameLookupResult:
        query = str(product_name or "").strip()
        if not self.api_key:
            return ProductNameLookupResult("mfds_i1250", "unavailable", detail="식품안전나라 I1250 API key가 설정되지 않았습니다.")
        if not query:
            return ProductNameLookupResult("mfds_i1250", "not_found", detail="상품명이 비어 있어 I1250 조회를 시작하지 않았습니다.")
        normalized_query = normalize_product_name(query)
        if not normalized_query:
            return ProductNameLookupResult("mfds_i1250", "not_found", detail="상품명에 검색 가능한 문자가 없어 I1250 조회를 시작하지 않았습니다.")
        bounded_limit = max(1, min(int(limit), 20))
        cache_key = f"{normalized_query}:{bounded_limit}"
        return _cached_product_name_lookup(
            provider="mfds_i1250",
            query=query,
            bounded_limit=bounded_limit,
            cache_key=cache_key,
            cache=self.cache,
            rate_limiter=self.rate_limiter,
            metrics=self.metrics,
            fetch=lambda: self._fetch_by_product_name(query, bounded_limit),
        )

    def _fetch_by_product_name(self, query: str, bounded_limit: int) -> ProductNameLookupResult:
        endpoint = f"{self.base_url}/api/{quote(self.api_key, safe='')}/I1250/json/1/{bounded_limit}"
        try:
            if self.client is not None:
                response = self.client.get(endpoint, params={"PRDLST_NM": query}, timeout=self.timeout)
            else:
                with httpx.Client(timeout=self.timeout, headers={"User-Agent": "rescue-meal/0.1"}) as client:
                    response = client.get(endpoint, params={"PRDLST_NM": query})
            if response.status_code == 429:
                return ProductNameLookupResult("mfds_i1250", "rate_limited", detail="식품안전나라 I1250 호출 한도에 도달했습니다.")
            if response.status_code >= 500:
                return ProductNameLookupResult("mfds_i1250", "unavailable", detail="식품안전나라 I1250이 일시적으로 응답하지 않습니다.")
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException:
            return ProductNameLookupResult("mfds_i1250", "unavailable", detail="식품안전나라 I1250 응답 시간이 초과되었습니다.")
        except (httpx.HTTPError, ValueError):
            return ProductNameLookupResult("mfds_i1250", "unavailable", detail="식품안전나라 I1250 조회를 완료하지 못했습니다.")

        rows = _mfds_rows(payload, "I1250")
        if not rows:
            message = _mfds_message(payload, "I1250")
            code = _mfds_result_code(payload, "I1250")
            provider_status: ProviderStatus = "rate_limited" if code in {"INFO-300", "INFO-310"} else "unavailable" if code and code not in {"INFO-000", "INFO-200"} else "not_found"
            return ProductNameLookupResult("mfds_i1250", provider_status, detail=message or "식품안전나라 I1250에서 상품명 후보를 찾지 못했습니다.")

        candidates: list[ProductCandidate] = []
        for row in rows[:bounded_limit]:
            name = _clean_text(row.get("PRDLST_NM"))
            if not name:
                continue
            confidence = _name_match_confidence(query, name)
            if confidence is None:
                continue
            candidates.append(
                ProductCandidate(
                    source="mfds_i1250",
                    source_url=self.source_url,
                    canonical_name=name,
                    brand=_clean_text(row.get("BSSH_NM")),
                    category=_clean_text(row.get("PRDLST_DCNM")),
                    quantity_text=None,
                    confidence=confidence,
                    provenance_note="식품안전나라 I1250 제품·품목제조보고 후보; 개별 팩 라벨과 제조일 확인 필요",
                    shelf_life_text=_clean_text(row.get("POG_DAYCNT")),
                    storage_hint=_storage_hint(_clean_text(row.get("POG_DAYCNT"))),
                    source_freshness="unknown",
                )
            )
        if not candidates:
            return ProductNameLookupResult("mfds_i1250", "not_found", detail="식품안전나라 I1250 응답에 상품명이 없습니다.")
        return ProductNameLookupResult("mfds_i1250", "matched", candidates[:bounded_limit])


class ProductNameFallbackResolver:
    """Try the Korean public provider first, then an OFF name-search fallback.

    The fallback is intentionally sequential. A successful MFDS result does
    not trigger another public search, which keeps the common path cheap and
    prevents a receipt review screen from fan-out traffic to both providers.
    """

    def __init__(self, *, primary: Any, fallback: Any) -> None:
        self.primary = primary
        self.fallback = fallback

    def lookup_by_product_name(self, product_name: str, *, limit: int = 5) -> ProductNameLookupResult:
        primary = self.primary.lookup_by_product_name(product_name, limit=limit)
        if primary.status == "matched":
            return primary

        fallback = self.fallback.lookup_by_product_name(product_name, limit=limit)
        if fallback.status == "matched":
            detail = fallback.detail
            if primary.detail:
                detail = f"{primary.detail} 공개 상품 DB 후보를 추가로 확인했습니다."
            return replace(fallback, detail=detail)

        statuses = {primary.status, fallback.status}
        if "rate_limited" in statuses:
            status: ProviderStatus = "rate_limited"
        elif "unavailable" in statuses:
            status = "unavailable"
        else:
            status = "not_found"
        details = [detail for detail in (primary.detail, fallback.detail) if detail]
        return ProductNameLookupResult(
            provider=primary.provider,
            status=status,
            candidates=[],
            detail=" ".join(details) if details else "상품명 후보를 찾지 못했습니다.",
        )


def normalize_product_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    normalized = re.sub(r"[^0-9a-z가-힣]+", "", normalized)
    return normalized


def normalize_barcode(barcode: str) -> str:
    return re.sub(r"[\s-]+", "", str(barcode or "")).strip()


def _external_enabled() -> bool:
    return external_lookups_enabled()


def external_lookups_enabled() -> bool:
    return os.getenv("RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS", "").strip().lower() in {"1", "true", "yes", "on"}


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


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _first_text(value: Any) -> str | None:
    text = _clean_text(value)
    return text.split(",", 1)[0].strip() if text else None


def _first_category(value: Any) -> str | None:
    text = _clean_text(value)
    return text.split(",", 1)[0].strip() if text else None


def _storage_hint(value: str | None) -> StorageHint | None:
    if not value:
        return None
    if "냉동" in value:
        return "frozen"
    if "냉장" in value:
        return "refrigerated"
    if "실온" in value or "상온" in value:
        return "ambient"
    return None


def _first_mfds_row(payload: Any, service_id: str, barcode: str) -> dict[str, Any] | None:
    rows = _mfds_rows(payload, service_id)
    normalized = normalize_barcode(barcode)
    exact = [row for row in rows if normalize_barcode(_clean_text(row.get("BAR_CD")) or "") == normalized]
    if exact:
        return exact[0]
    # Never accept a non-empty row for another barcode if the provider ignored
    # the filter or returned a broader page. A row without BAR_CD is accepted
    # only for fixtures/providers that omit the echoed query field entirely.
    if any(_clean_text(row.get("BAR_CD")) for row in rows):
        return None
    return rows[0] if rows else None


def _mfds_rows(payload: Any, service_id: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    container = payload.get(service_id)
    if not isinstance(container, dict):
        return []
    raw_rows = container.get("row") or container.get("rows") or []
    if isinstance(raw_rows, dict):
        return [raw_rows]
    if isinstance(raw_rows, list):
        return [row for row in raw_rows if isinstance(row, dict)]
    return []


def _mfds_message(payload: Any, service_id: str) -> str | None:
    code = _mfds_result_code(payload, service_id)
    if not code:
        return None
    container = payload[service_id]
    result = container.get("RESULT")
    message = _clean_text(result.get("MSG")) if isinstance(result, dict) else None
    if code and code not in {"INFO-000", "INFO-200"}:
        return f"식품안전나라 {service_id} 응답 {code}: {message or '조회할 수 없습니다.'}"
    return None


def _mfds_result_code(payload: Any, service_id: str) -> str | None:
    if not isinstance(payload, dict) or not isinstance(payload.get(service_id), dict):
        return None
    result = payload[service_id].get("RESULT")
    if not isinstance(result, dict):
        return None
    return _clean_text(result.get("CODE"))


def _source_order(source: ProductSource) -> int:
    return {"mfds_c005": 0, "local_fixture": 1, "open_food_facts": 2, "mfds_i1250": 3}.get(source, 9)


def _name_match_confidence(query: str, candidate: str) -> float | None:
    query_key = normalize_product_name(query)
    candidate_key = normalize_product_name(candidate)
    if not query_key or not candidate_key:
        return 0.55
    if query_key == candidate_key:
        return 0.78
    if query_key in candidate_key or candidate_key in query_key:
        return 0.72
    ratio = SequenceMatcher(None, query_key, candidate_key).ratio()
    if ratio < 0.45:
        return None
    return round(max(0.55, min(0.68, 0.5 + ratio * 0.18)), 3)


def _copy_lookup_result(result: ProductLookupResult) -> ProductLookupResult:
    return ProductLookupResult(
        barcode=result.barcode,
        status=result.status,
        candidates=list(result.candidates),
        warnings=list(result.warnings),
        requires_review=result.requires_review,
        provider_statuses=dict(result.provider_statuses),
    )


def _copy_name_lookup_result(result: ProductNameLookupResult) -> ProductNameLookupResult:
    return ProductNameLookupResult(
        provider=result.provider,
        status=result.status,
        candidates=list(result.candidates),
        detail=result.detail,
    )


_DEFAULT_PRODUCT_CACHE = ProductLookupCache.from_env()
_DEFAULT_PRODUCT_NAME_CACHE = ProductNameLookupCache.from_env()
