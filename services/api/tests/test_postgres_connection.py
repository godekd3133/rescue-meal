from __future__ import annotations

from collections import deque

import pytest

from app.postgres_connection import (
    PostgresConnectionUnavailable,
    ReconnectablePostgresConnection,
)


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection
        self.execute_calls = 0
        self.fetchone_calls = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def execute(self, query, params=None):
        self.execute_calls += 1
        if self.connection.execute_error is not None:
            raise self.connection.execute_error
        self.connection.queries.append((query, params))
        return self

    def fetchone(self):
        self.fetchone_calls += 1
        if self.connection.fetchone_error is not None:
            raise self.connection.fetchone_error
        return (1,)


class FakeConnection:
    def __init__(self, *, execute_error=None, fetchone_error=None, commit_error=None) -> None:
        self.closed = False
        self.queries = []
        self.cursor_calls = 0
        self.commit_calls = 0
        self.rollback_calls = 0
        self.close_calls = 0
        self.execute_error = execute_error
        self.fetchone_error = fetchone_error
        self.commit_error = commit_error
        self.cursors: list[FakeCursor] = []

    def cursor(self, *args, **kwargs):
        self.cursor_calls += 1
        cursor = FakeCursor(self)
        self.cursors.append(cursor)
        return cursor

    def commit(self):
        self.commit_calls += 1
        if self.commit_error is not None:
            raise self.commit_error

    def rollback(self):
        self.rollback_calls += 1

    def close(self):
        self.close_calls += 1
        self.closed = True


def _factory(connections):
    queue = deque(connections)
    calls: list[str] = []

    def connect(database_url: str):
        calls.append(database_url)
        if not queue:
            raise AssertionError("unexpected reconnect")
        return queue.popleft()

    return connect, calls


def test_closed_owner_connection_is_replaced_before_the_next_cursor() -> None:
    first = FakeConnection()
    second = FakeConnection()
    connect, calls = _factory([first, second])
    connection = ReconnectablePostgresConnection(
        "postgresql://unused",
        connect_factory=connect,
        reconnect_timeout_seconds=0.1,
        sleep=lambda _: None,
    )

    first.closed = True
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")

    assert calls == ["postgresql://unused", "postgresql://unused"]
    assert first.close_calls == 1
    assert second.queries == [("SELECT 1", None)]


def test_query_transport_failure_is_not_replayed_but_later_request_reconnects() -> None:
    first = FakeConnection(execute_error=ConnectionError("socket closed"))
    second = FakeConnection()
    connect, calls = _factory([first, second])
    connection = ReconnectablePostgresConnection(
        "postgresql://unused",
        connect_factory=connect,
        reconnect_timeout_seconds=0.1,
        sleep=lambda _: None,
    )

    with pytest.raises(PostgresConnectionUnavailable, match="재실행하지 않고"):
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO foods VALUES (1)")

    assert first.cursors[0].execute_calls == 1
    assert calls == ["postgresql://unused"]
    assert connection.closed is True
    connection.rollback()
    assert calls == ["postgresql://unused"]

    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")

    assert calls == ["postgresql://unused", "postgresql://unused"]
    assert second.queries == [("SELECT 1", None)]


def test_sql_error_keeps_a_healthy_connection() -> None:
    first = FakeConnection(execute_error=ValueError("duplicate key"))
    second = FakeConnection()
    connect, calls = _factory([first, second])
    connection = ReconnectablePostgresConnection(
        "postgresql://unused",
        connect_factory=connect,
        reconnect_timeout_seconds=0.1,
        sleep=lambda _: None,
    )

    with pytest.raises(ValueError, match="duplicate key"):
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO foods VALUES (1)")

    assert connection.closed is False
    assert calls == ["postgresql://unused"]
    first.execute_error = None
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    assert calls == ["postgresql://unused"]


def test_commit_transport_failure_is_not_replayed() -> None:
    first = FakeConnection(commit_error=ConnectionError("commit socket closed"))
    second = FakeConnection()
    connect, calls = _factory([first, second])
    connection = ReconnectablePostgresConnection(
        "postgresql://unused",
        connect_factory=connect,
        reconnect_timeout_seconds=0.1,
        sleep=lambda _: None,
    )

    with pytest.raises(PostgresConnectionUnavailable, match="재실행하지 않고"):
        connection.commit()

    assert calls == ["postgresql://unused"]
    assert connection.closed is True
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    assert calls == ["postgresql://unused", "postgresql://unused"]


def test_fetch_transport_failure_invalidates_the_owner_connection() -> None:
    first = FakeConnection(fetchone_error=ConnectionError("read socket closed"))
    second = FakeConnection()
    connect, calls = _factory([first, second])
    connection = ReconnectablePostgresConnection(
        "postgresql://unused",
        connect_factory=connect,
        reconnect_timeout_seconds=0.1,
        sleep=lambda _: None,
    )

    with pytest.raises(PostgresConnectionUnavailable, match="재실행하지 않고"):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

    assert connection.closed is True
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    assert calls == ["postgresql://unused", "postgresql://unused"]


def test_explicit_close_is_final_and_does_not_reconnect() -> None:
    first = FakeConnection()
    second = FakeConnection()
    connect, calls = _factory([first, second])
    connection = ReconnectablePostgresConnection(
        "postgresql://unused",
        connect_factory=connect,
        reconnect_timeout_seconds=0.1,
        sleep=lambda _: None,
    )

    connection.close()
    connection.close()
    with pytest.raises(PostgresConnectionUnavailable, match="닫혀 있습니다"):
        with connection.cursor():
            pass

    assert calls == ["postgresql://unused"]
    assert first.close_calls == 1
