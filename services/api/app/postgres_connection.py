"""Reconnectable owner connection for direct PostgreSQL resources.

The API has two different PostgreSQL lifetimes:

* workspace operations use :mod:`postgres_pool` and are checked out per
  operation; and
* the base projection, shared caches, recipe catalog, and auth repository
  historically owned one direct psycopg connection each.

This module covers the second case.  It intentionally retries only the
*connection establishment* step.  A query or commit that failed on a broken
  socket is never replayed because a write may have reached PostgreSQL before
  the client lost the response.  The caller receives the original exception
  and a later request gets a fresh connection.
"""

from __future__ import annotations

from collections.abc import Callable
import os
import time
from threading import RLock
from typing import Any


DEFAULT_RECONNECT_TIMEOUT_SECONDS = 5.0
MIN_RECONNECT_TIMEOUT_SECONDS = 0.1
MAX_RECONNECT_TIMEOUT_SECONDS = 60.0


class PostgresConnectionUnavailable(RuntimeError):
    """Raised when a direct PostgreSQL owner cannot reconnect in time."""


def _configured_reconnect_timeout() -> float:
    raw = os.getenv(
        "RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS",
        str(DEFAULT_RECONNECT_TIMEOUT_SECONDS),
    ).strip()
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = DEFAULT_RECONNECT_TIMEOUT_SECONDS
    return max(MIN_RECONNECT_TIMEOUT_SECONDS, min(MAX_RECONNECT_TIMEOUT_SECONDS, value))


def _connection_is_closed(connection: Any) -> bool:
    try:
        return bool(getattr(connection, "closed", False))
    except Exception:
        return True


def _is_connection_failure(exc: BaseException, connection: Any | None = None) -> bool:
    """Classify transport/lifecycle errors without evicting SQL errors.

    Importing psycopg lazily keeps the adapter usable by unit tests that use a
    small fake connection and keeps the module importable in lightweight
    tooling.  The class-name fallback covers compatible psycopg wrappers and
    the standard socket exceptions without treating a constraint or syntax
    error as a dead connection.
    """

    if connection is not None and _connection_is_closed(connection):
        return True
    if isinstance(exc, (ConnectionError, BrokenPipeError, EOFError)):
        return True
    try:
        import psycopg

        if isinstance(exc, (psycopg.OperationalError, psycopg.InterfaceError)):
            return True
    except ImportError:  # pragma: no cover - psycopg is a normal API dependency
        pass
    return exc.__class__.__name__ in {
        "AdminShutdown",
        "ConnectionFailure",
        "ConnectionException",
        "OperationalError",
        "InterfaceError",
        "IdleInTransactionSessionTimeout",
    }


class ReconnectablePostgresConnection:
    """Expose a small psycopg connection-like surface with safe reconnects.

    ``connect_factory`` exists for deterministic tests.  Production callers
    leave it unset and the adapter uses ``psycopg.connect``.  The first
    connection is established eagerly so startup retains the existing
    fail-fast behaviour.  Reconnect attempts happen only after a connection
    is known to be unusable and are bounded by ``reconnect_timeout_seconds``.
    """

    def __init__(
        self,
        database_url: str,
        *,
        connect_factory: Callable[[str], Any] | None = None,
        reconnect_timeout_seconds: float | None = None,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.database_url = database_url
        self._connect_factory = connect_factory or self._default_connect
        self._reconnect_timeout_seconds = (
            _configured_reconnect_timeout()
            if reconnect_timeout_seconds is None
            else max(MIN_RECONNECT_TIMEOUT_SECONDS, min(MAX_RECONNECT_TIMEOUT_SECONDS, float(reconnect_timeout_seconds)))
        )
        self._sleep = sleep
        self._monotonic = monotonic
        self._lock = RLock()
        self._connection: Any | None = None
        self._closed = False
        self._connection = self._connect_once()

    @staticmethod
    def _default_connect(database_url: str) -> Any:
        import psycopg

        return psycopg.connect(database_url)

    def _connect_once(self) -> Any:
        connection = self._connect_factory(self.database_url)
        if _connection_is_closed(connection):
            close = getattr(connection, "close", None)
            if callable(close):
                close()
            raise PostgresConnectionUnavailable("PostgreSQL connection factory returned a closed connection")
        return connection

    def _connect_with_retry(self) -> Any:
        deadline = self._monotonic() + self._reconnect_timeout_seconds
        delay = 0.05
        while True:
            try:
                return self._connect_once()
            except Exception as exc:
                remaining = deadline - self._monotonic()
                if remaining <= 0:
                    raise PostgresConnectionUnavailable(
                        "PostgreSQL direct connection을 제한 시간 안에 다시 열지 못했습니다."
                    ) from exc
                self._sleep(min(delay, remaining))
                delay = min(delay * 2, 1.0)

    def _ensure_connection(self) -> Any:
        with self._lock:
            if self._closed:
                raise PostgresConnectionUnavailable("PostgreSQL direct connection이 닫혀 있습니다.")
            current = self._connection
            if current is not None and not _connection_is_closed(current):
                return current
            if current is not None:
                self._close_quietly(current)
            self._connection = self._connect_with_retry()
            return self._connection

    @staticmethod
    def _close_quietly(connection: Any) -> None:
        close = getattr(connection, "close", None)
        if not callable(close):
            return
        try:
            close()
        except Exception:
            return

    def _invalidate(self, connection: Any) -> None:
        with self._lock:
            if self._connection is not connection:
                return
            self._connection = None
        self._close_quietly(connection)

    def _invalidate_if_connection_failure(self, connection: Any, exc: BaseException) -> bool:
        if _is_connection_failure(exc, connection):
            self._invalidate(connection)
            return True
        return False

    def _raise_if_connection_failure(self, connection: Any, exc: BaseException) -> None:
        if self._invalidate_if_connection_failure(connection, exc):
            raise PostgresConnectionUnavailable(
                "PostgreSQL direct connection이 끊겼습니다. 요청을 재실행하지 않고 다음 요청에서 연결을 복구합니다."
            ) from exc

    @property
    def closed(self) -> bool:
        with self._lock:
            return self._closed or self._connection is None or _connection_is_closed(self._connection)

    @property
    def reconnect_timeout_seconds(self) -> float:
        return self._reconnect_timeout_seconds

    def cursor(self, *args: Any, **kwargs: Any) -> "ReconnectableCursor":
        return ReconnectableCursor(self, args, kwargs)

    def execute(self, query: Any, params: Any = None, *, prepare: Any = None) -> "TrackedPostgresCursor":
        connection = self._ensure_connection()
        try:
            if prepare is None:
                raw_cursor = connection.execute(query, params)
            else:
                raw_cursor = connection.execute(query, params, prepare=prepare)
        except BaseException as exc:
            self._raise_if_connection_failure(connection, exc)
            raise
        return TrackedPostgresCursor(self, connection, raw_cursor)

    def executemany(self, query: Any, params_seq: Any, *, returning: Any = False) -> "TrackedPostgresCursor":
        connection = self._ensure_connection()
        try:
            if returning:
                raw_cursor = connection.executemany(query, params_seq, returning=returning)
            else:
                raw_cursor = connection.executemany(query, params_seq)
        except BaseException as exc:
            self._raise_if_connection_failure(connection, exc)
            raise
        return TrackedPostgresCursor(self, connection, raw_cursor)

    def commit(self) -> None:
        self._finish("commit", reconnect_if_missing=False)

    def rollback(self) -> None:
        # Exception handlers call rollback after a failed query.  Reopening a
        # new connection here could accidentally make cleanup target a new
        # transaction, so a missing connection is deliberately a no-op.
        self._finish("rollback", reconnect_if_missing=False)

    def _finish(self, operation: str, *, reconnect_if_missing: bool) -> None:
        with self._lock:
            if self._closed:
                raise PostgresConnectionUnavailable("PostgreSQL direct connection이 닫혀 있습니다.")
            connection = self._connection
            if connection is None or _connection_is_closed(connection):
                if not reconnect_if_missing:
                    return
                connection = self._ensure_connection()
        try:
            getattr(connection, operation)()
        except BaseException as exc:
            self._raise_if_connection_failure(connection, exc)
            raise

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            connection = self._connection
            self._connection = None
        if connection is not None:
            self._close_quietly(connection)

    def __getattr__(self, name: str) -> Any:
        connection = self._ensure_connection()
        attribute = getattr(connection, name)
        if not callable(attribute):
            return attribute

        def call(*args: Any, **kwargs: Any) -> Any:
            try:
                return attribute(*args, **kwargs)
            except BaseException as exc:
                self._raise_if_connection_failure(connection, exc)
                raise

        return call


class ReconnectableCursor:
    """Lazy cursor/context wrapper that tracks fetch and execute failures."""

    def __init__(self, owner: ReconnectablePostgresConnection, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        self._owner = owner
        self._args = args
        self._kwargs = kwargs
        self._connection: Any | None = None
        self._raw: Any | None = None
        self._entered = False

    def _ensure_raw(self) -> Any:
        if self._raw is not None:
            return self._raw
        connection = self._owner._ensure_connection()
        try:
            raw = connection.cursor(*self._args, **self._kwargs)
        except BaseException as exc:
            self._owner._raise_if_connection_failure(connection, exc)
            raise
        self._connection = connection
        self._raw = raw
        return raw

    def __enter__(self) -> "TrackedPostgresCursor":
        raw = self._ensure_raw()
        try:
            entered = raw.__enter__() if hasattr(raw, "__enter__") else raw
        except BaseException as exc:
            if self._connection is not None:
                self._owner._raise_if_connection_failure(self._connection, exc)
            raise
        self._entered = True
        self._raw = entered
        return TrackedPostgresCursor(self._owner, self._connection, entered)

    def __exit__(self, exc_type: Any, exc_value: Any, traceback: Any) -> Any:
        raw = self._raw
        if raw is None:
            return False
        try:
            exit_method = getattr(raw, "__exit__", None)
            result = exit_method(exc_type, exc_value, traceback) if callable(exit_method) else False
        except BaseException as exc:
            if self._connection is not None:
                self._owner._raise_if_connection_failure(self._connection, exc)
            raise
        if exc_value is not None and self._connection is not None:
            self._owner._invalidate_if_connection_failure(self._connection, exc_value)
        return result

    def _tracked(self) -> "TrackedPostgresCursor":
        raw = self._ensure_raw()
        return TrackedPostgresCursor(self._owner, self._connection, raw)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._tracked(), name)


class TrackedPostgresCursor:
    """Proxy a psycopg cursor and invalidate only on transport failures."""

    def __init__(self, owner: ReconnectablePostgresConnection, connection: Any, raw: Any) -> None:
        self._owner = owner
        self._connection = connection
        self._raw = raw

    def __enter__(self) -> "TrackedPostgresCursor":
        enter = getattr(self._raw, "__enter__", None)
        if callable(enter):
            try:
                entered = enter()
            except BaseException as exc:
                self._owner._raise_if_connection_failure(self._connection, exc)
                raise
            self._raw = entered
        return self

    def __exit__(self, exc_type: Any, exc_value: Any, traceback: Any) -> Any:
        exit_method = getattr(self._raw, "__exit__", None)
        if not callable(exit_method):
            return False
        try:
            return exit_method(exc_type, exc_value, traceback)
        except BaseException as exc:
            self._owner._raise_if_connection_failure(self._connection, exc)
            raise

    def __iter__(self):
        try:
            return iter(self._raw)
        except BaseException as exc:
            self._owner._raise_if_connection_failure(self._connection, exc)
            raise

    def __getattr__(self, name: str) -> Any:
        attribute = getattr(self._raw, name)
        if not callable(attribute):
            return attribute

        def call(*args: Any, **kwargs: Any) -> Any:
            try:
                return attribute(*args, **kwargs)
            except BaseException as exc:
                self._owner._raise_if_connection_failure(self._connection, exc)
                raise

        return call
