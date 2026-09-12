"""Operation-scoped PostgreSQL connection pooling.

The API's workspace repository keeps an in-memory snapshot for compatibility
with the existing domain model. This module provides the narrow connection
seam that snapshot reads and full-snapshot writes use: a cursor starts one
pool checkout, and the matching commit/rollback returns that connection.

Keeping the checkout lifetime here lets callers continue to use the existing
``connection.cursor()`` / ``connection.commit()`` interface while making the
transaction ownership explicit and testable.
"""

from __future__ import annotations

from contextvars import ContextVar
from contextlib import contextmanager
from dataclasses import dataclass
import os
from threading import RLock
from typing import Any, Iterator, Mapping


class PostgresPoolUnavailable(RuntimeError):
    """Raised when the operation pool cannot provide a usable connection."""


def _env_int(values: Mapping[str, str], name: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int(str(values.get(name, str(default))).strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _env_float(values: Mapping[str, str], name: str, default: float, *, minimum: float, maximum: float) -> float:
    try:
        value = float(str(values.get(name, str(default))).strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class PostgresPoolSettings:
    """Validated runtime knobs for one API-process workspace operation pool."""

    min_size: int = 1
    max_size: int = 8
    timeout_seconds: float = 5.0
    max_waiting: int = 64
    max_idle_seconds: float = 300.0
    max_lifetime_seconds: float = 1800.0
    reconnect_timeout_seconds: float = 30.0
    close_timeout_seconds: float = 5.0

    def __post_init__(self) -> None:
        if isinstance(self.min_size, bool) or not isinstance(self.min_size, int) or not 0 <= self.min_size <= 32:
            raise ValueError("PostgreSQL pool min_size must be an integer between 0 and 32")
        if isinstance(self.max_size, bool) or not isinstance(self.max_size, int) or not 1 <= self.max_size <= 64:
            raise ValueError("PostgreSQL pool max_size must be an integer between 1 and 64")
        if self.max_size < self.min_size:
            raise ValueError("PostgreSQL pool max_size must be greater than or equal to min_size")
        for name, value, minimum, maximum in (
            ("timeout_seconds", self.timeout_seconds, 0.1, 60.0),
            ("max_idle_seconds", self.max_idle_seconds, 1.0, 3600.0),
            ("max_lifetime_seconds", self.max_lifetime_seconds, 60.0, 86400.0),
            ("reconnect_timeout_seconds", self.reconnect_timeout_seconds, 1.0, 3600.0),
            ("close_timeout_seconds", self.close_timeout_seconds, 0.1, 60.0),
        ):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
                raise ValueError(f"PostgreSQL pool {name} is outside its supported range")
        if isinstance(self.max_waiting, bool) or not isinstance(self.max_waiting, int) or not 0 <= self.max_waiting <= 1024:
            raise ValueError("PostgreSQL pool max_waiting must be an integer between 0 and 1024")

    @classmethod
    def from_env(cls, values: Mapping[str, str] | None = None) -> "PostgresPoolSettings":
        source = values if values is not None else os.environ
        min_size = _env_int(source, "RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE", 1, minimum=0, maximum=32)
        max_size = _env_int(source, "RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE", 8, minimum=1, maximum=64)
        return cls(
            min_size=min_size,
            max_size=max(min_size, max_size),
            timeout_seconds=_env_float(source, "RESCUE_MEAL_POSTGRES_POOL_TIMEOUT_SECONDS", 5.0, minimum=0.1, maximum=60.0),
            max_waiting=_env_int(source, "RESCUE_MEAL_POSTGRES_POOL_MAX_WAITING", 64, minimum=0, maximum=1024),
            max_idle_seconds=_env_float(source, "RESCUE_MEAL_POSTGRES_POOL_MAX_IDLE_SECONDS", 300.0, minimum=1.0, maximum=3600.0),
            max_lifetime_seconds=_env_float(source, "RESCUE_MEAL_POSTGRES_POOL_MAX_LIFETIME_SECONDS", 1800.0, minimum=60.0, maximum=86400.0),
            reconnect_timeout_seconds=_env_float(source, "RESCUE_MEAL_POSTGRES_POOL_RECONNECT_TIMEOUT_SECONDS", 30.0, minimum=1.0, maximum=3600.0),
            close_timeout_seconds=_env_float(source, "RESCUE_MEAL_POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS", 5.0, minimum=0.1, maximum=60.0),
        )


class PostgresOperationPool:
    """Small Adapter around psycopg's synchronous ``ConnectionPool``.

    The Adapter owns pool startup/shutdown and converts pool acquisition
    failures into one application error. A caller never needs to know whether
    a connection was reused, newly created, or replaced after a failed check.
    """

    def __init__(self, database_url: str, *, settings: PostgresPoolSettings | None = None, pool: Any | None = None) -> None:
        self.database_url = database_url
        self.settings = settings or PostgresPoolSettings.from_env()
        self._lock = RLock()
        self._opened = False
        self._closed = False
        self._pool_open_attempted = False
        self._pool = pool if pool is not None else self._create_pool(database_url, self.settings)

    @staticmethod
    def _create_pool(database_url: str, settings: PostgresPoolSettings) -> Any:
        try:
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover - dependency is installed in normal sync
            raise RuntimeError("PostgreSQL operation pool에는 psycopg[pool]이 필요합니다.") from exc
        return ConnectionPool(
            conninfo=database_url,
            min_size=settings.min_size,
            max_size=settings.max_size,
            open=False,
            timeout=settings.timeout_seconds,
            max_waiting=settings.max_waiting,
            max_idle=settings.max_idle_seconds,
            max_lifetime=settings.max_lifetime_seconds,
            reconnect_timeout=settings.reconnect_timeout_seconds,
            check=ConnectionPool.check_connection,
            name="rescue-meal-workspace",
        )

    @property
    def max_size(self) -> int:
        return int(self._pool.max_size)

    @property
    def min_size(self) -> int:
        return int(self._pool.min_size)

    @property
    def closed(self) -> bool:
        # psycopg's ``closed`` flag is true for a pool constructed with
        # ``open=False`` as well as for a pool explicitly closed. The wrapper
        # must still allow the first explicit ``open()`` call.
        return self._closed or (self._opened and bool(getattr(self._pool, "closed", False)))

    def open(self, *, wait: bool = False, timeout: float | None = None) -> None:
        with self._lock:
            if self.closed:
                raise PostgresPoolUnavailable("PostgreSQL operation pool이 닫혀 있습니다.")
            if self._opened:
                return
            try:
                self._pool_open_attempted = True
                self._pool.open(
                    wait=wait,
                    timeout=self.settings.timeout_seconds if timeout is None else timeout,
                )
            except Exception as exc:
                raise PostgresPoolUnavailable("PostgreSQL operation pool을 열지 못했습니다.") from exc
            self._opened = True

    @contextmanager
    def connection(self, *, timeout: float | None = None) -> Iterator[Any]:
        """Yield one checked-out connection and return it at context exit."""

        self.open()
        try:
            with self._pool.connection(timeout=timeout) as connection:
                yield connection
        except PostgresPoolUnavailable:
            raise
        except Exception as exc:
            if exc.__class__.__name__ in {"PoolClosed", "PoolTimeout", "TooManyRequests"}:
                raise PostgresPoolUnavailable("PostgreSQL operation pool에서 connection을 받지 못했습니다.") from exc
            raise

    def wait(self, *, timeout: float | None = None) -> None:
        """Fail startup when the configured minimum pool is not available."""

        self.open()
        try:
            self._pool.wait(timeout=self.settings.timeout_seconds if timeout is None else timeout)
        except Exception as exc:
            if exc.__class__.__name__ == "PoolTimeout":
                raise PostgresPoolUnavailable("PostgreSQL operation pool이 준비되지 않았습니다.") from exc
            raise

    def stats(self) -> dict[str, int]:
        get_stats = getattr(self._pool, "get_stats", None)
        if not callable(get_stats):
            return {}
        return {str(key): int(value) for key, value in get_stats().items() if isinstance(value, (int, float))}

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            if not self._opened and not self._pool_open_attempted:
                return
            self._pool.close(timeout=self.settings.close_timeout_seconds)


@dataclass
class _PooledLease:
    context: Any
    connection: Any
    token: Any


class PooledConnectionProxy:
    """Expose a connection-like cursor/commit seam backed by a pool lease."""

    def __init__(self, pool: PostgresOperationPool, *, timeout: float | None = None) -> None:
        self._pool = pool
        self._timeout = timeout
        self._lease: ContextVar[_PooledLease | None] = ContextVar(f"rescue_meal_pg_lease_{id(self)}", default=None)
        self._closed = False

    def _require_open(self) -> None:
        if self._closed:
            raise PostgresPoolUnavailable("workspace connection proxy가 닫혀 있습니다.")

    def _current(self) -> _PooledLease | None:
        return self._lease.get()

    def _checkout(self) -> _PooledLease:
        self._require_open()
        existing = self._current()
        if existing is not None:
            return existing
        context = self._pool.connection(timeout=self._timeout)
        try:
            connection = context.__enter__()
        except BaseException:
            raise
        token = self._lease.set(_PooledLease(context=context, connection=connection, token=None))
        lease = self._lease.get()
        assert lease is not None
        lease.token = token
        return lease

    def _release(self, exc_info: tuple[Any, Any, Any] = (None, None, None)) -> None:
        lease = self._current()
        if lease is None:
            return
        self._lease.reset(lease.token)
        lease.context.__exit__(*exc_info)

    def _finish(self, operation: str) -> None:
        lease = self._current()
        if lease is None:
            return
        try:
            getattr(lease.connection, operation)()
        except BaseException:
            import sys

            self._release(sys.exc_info())
            raise
        self._release()

    def cursor(self, *args: Any, **kwargs: Any) -> "_PooledCursorContext":
        return _PooledCursorContext(self, args, kwargs)

    def commit(self) -> None:
        self._finish("commit")

    def rollback(self) -> None:
        self._finish("rollback")

    def close(self) -> None:
        if self._current() is not None:
            try:
                self.rollback()
            except Exception:
                import sys

                self._release(sys.exc_info())
        self._closed = True

    def __getattr__(self, name: str) -> Any:
        lease = self._current()
        if lease is None:
            raise AttributeError(name)
        return getattr(lease.connection, name)


class _PooledCursorContext:
    def __init__(self, proxy: PooledConnectionProxy, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        self._proxy = proxy
        self._args = args
        self._kwargs = kwargs
        self._cursor_context: Any | None = None

    def __enter__(self) -> Any:
        lease = self._proxy._checkout()
        try:
            self._cursor_context = lease.connection.cursor(*self._args, **self._kwargs)
            return self._cursor_context.__enter__()
        except BaseException:
            import sys

            self._proxy._release(sys.exc_info())
            raise

    def __exit__(self, exc_type: Any, exc_value: Any, traceback: Any) -> Any:
        if self._cursor_context is None:
            return False
        try:
            result = self._cursor_context.__exit__(exc_type, exc_value, traceback)
        except BaseException:
            import sys

            self._proxy._release(sys.exc_info())
            raise
        if exc_type is not None:
            self._proxy.rollback()
        return result
