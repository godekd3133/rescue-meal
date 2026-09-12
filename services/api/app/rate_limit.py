"""Atomic rate limiters for public authentication endpoints.

The in-memory limiter is used only when the API has no persistent auth store.
SQLite and PostgreSQL deployments use the persistent implementation so the
same opaque bucket keys are enforced across API processes.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from hashlib import sha256
import math
from threading import RLock
import time
from typing import Callable, Iterable


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int
    remaining: int


class SlidingWindowRateLimiter:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = RLock()
        self._buckets: dict[str, deque[float]] = {}

    def check(self, keys: Iterable[str], *, limit: int, window_seconds: float) -> RateLimitDecision:
        if limit < 1:
            raise ValueError("rate limit must be positive")
        if window_seconds <= 0:
            raise ValueError("rate limit window must be positive")
        unique_keys = tuple(dict.fromkeys(key for key in keys if key))
        if not unique_keys:
            raise ValueError("at least one rate limit key is required")

        now = self._clock()
        cutoff = now - window_seconds
        with self._lock:
            buckets = [self._buckets.setdefault(key, deque()) for key in unique_keys]
            for bucket in buckets:
                while bucket and bucket[0] <= cutoff:
                    bucket.popleft()

            blocked = [bucket for bucket in buckets if len(bucket) >= limit]
            if blocked:
                retry_after = max(0.0, window_seconds - (now - blocked[0][0]))
                return RateLimitDecision(False, max(1, int(retry_after + 0.999)), 0)

            for bucket in buckets:
                bucket.append(now)
            remaining = max(0, limit - max(len(bucket) for bucket in buckets))
            return RateLimitDecision(True, 0, remaining)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


class PersistentSlidingWindowRateLimiter:
    """Database-backed limiter for deployments with more than one API process.

    SQLite uses ``BEGIN IMMEDIATE`` to serialize the check-and-insert window.
    PostgreSQL uses transaction-scoped advisory locks per bucket key, acquired
    in sorted order to avoid lock-order deadlocks. The database schemas are
    created by the corresponding auth repositories, keeping this class focused
    on the atomic decision contract.
    """

    def __init__(
        self,
        connection,
        *,
        dialect: str,
        clock: Callable[[], float] = time.time,
        lock: RLock | None = None,
    ) -> None:
        if dialect not in {"sqlite", "postgres"}:
            raise ValueError("unsupported rate limit database dialect")
        self._connection = connection
        self._dialect = dialect
        self._clock = clock
        self._lock = lock or RLock()

    def check(self, keys: Iterable[str], *, limit: int, window_seconds: float) -> RateLimitDecision:
        if limit < 1:
            raise ValueError("rate limit must be positive")
        if window_seconds <= 0:
            raise ValueError("rate limit window must be positive")
        unique_keys = tuple(dict.fromkeys(key for key in keys if key))
        if not unique_keys:
            raise ValueError("at least one rate limit key is required")

        now = float(self._clock())
        cutoff = now - window_seconds
        with self._lock:
            if self._dialect == "sqlite":
                return self._check_sqlite(unique_keys, limit=limit, cutoff=cutoff, now=now, window_seconds=window_seconds)
            return self._check_postgres(unique_keys, limit=limit, cutoff=cutoff, now=now, window_seconds=window_seconds)

    def reset(self) -> None:
        with self._lock:
            try:
                if self._dialect == "sqlite":
                    self._connection.execute("DELETE FROM rate_limit_events")
                    self._connection.commit()
                else:
                    with self._connection.cursor() as cursor:
                        cursor.execute("DELETE FROM rescue_auth_rate_limit_events")
                    self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    def _check_sqlite(
        self,
        keys: tuple[str, ...],
        *,
        limit: int,
        cutoff: float,
        now: float,
        window_seconds: float,
    ) -> RateLimitDecision:
        try:
            self._connection.execute("BEGIN IMMEDIATE")
            self._connection.execute("DELETE FROM rate_limit_events WHERE occurred_at <= ?", (cutoff,))
            counts: dict[str, int] = {}
            oldest_by_key: dict[str, list[float]] = {}
            for key in keys:
                rows = self._connection.execute(
                    "SELECT occurred_at FROM rate_limit_events WHERE bucket_key = ? ORDER BY occurred_at ASC",
                    (key,),
                ).fetchall()
                counts[key] = len(rows)
                oldest_by_key[key] = [float(row[0]) for row in rows]
            blocked = [key for key in keys if counts[key] >= limit]
            if blocked:
                self._connection.commit()
                return _blocked_decision(
                    [event for key in blocked for event in oldest_by_key[key]],
                    now=now,
                    window_seconds=window_seconds,
                )
            self._connection.executemany(
                "INSERT INTO rate_limit_events (bucket_key, occurred_at) VALUES (?, ?)",
                [(key, now) for key in keys],
            )
            self._connection.commit()
            return RateLimitDecision(True, 0, max(0, limit - max(counts.values()) - 1))
        except Exception:
            self._connection.rollback()
            raise

    def _check_postgres(
        self,
        keys: tuple[str, ...],
        *,
        limit: int,
        cutoff: float,
        now: float,
        window_seconds: float,
    ) -> RateLimitDecision:
        try:
            with self._connection.cursor() as cursor:
                for key in sorted(keys):
                    cursor.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                        (key,),
                    )
                cursor.execute("DELETE FROM rescue_auth_rate_limit_events WHERE occurred_at <= %s", (cutoff,))
                counts: dict[str, int] = {}
                oldest_by_key: dict[str, list[float]] = {}
                for key in keys:
                    cursor.execute(
                        "SELECT occurred_at FROM rescue_auth_rate_limit_events WHERE bucket_key = %s ORDER BY occurred_at ASC",
                        (key,),
                    )
                    rows = cursor.fetchall()
                    counts[key] = len(rows)
                    oldest_by_key[key] = [float(row[0]) for row in rows]
                blocked = [key for key in keys if counts[key] >= limit]
                if blocked:
                    self._connection.commit()
                    return _blocked_decision(
                        [event for key in blocked for event in oldest_by_key[key]],
                        now=now,
                        window_seconds=window_seconds,
                    )
                cursor.executemany(
                    "INSERT INTO rescue_auth_rate_limit_events (bucket_key, occurred_at) VALUES (%s, %s)",
                    [(key, now) for key in keys],
                )
            self._connection.commit()
            return RateLimitDecision(True, 0, max(0, limit - max(counts.values()) - 1))
        except Exception:
            self._connection.rollback()
            raise


def _blocked_decision(oldest: list[float], *, now: float, window_seconds: float) -> RateLimitDecision:
    oldest_event = min(oldest) if oldest else now
    retry_after = max(1, math.ceil(window_seconds - (now - oldest_event)))
    return RateLimitDecision(False, retry_after, 0)


def opaque_rate_limit_key(value: str) -> str:
    """Return a stable non-reversible identity handle for bucket keys."""

    return sha256(value.strip().lower().encode("utf-8")).hexdigest()[:32]
