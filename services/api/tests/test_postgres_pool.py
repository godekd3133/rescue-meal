from __future__ import annotations

from contextlib import contextmanager

import pytest

from app.postgres_pool import (
    PostgresOperationPool,
    PostgresPoolSettings,
    PostgresPoolUnavailable,
    PooledConnectionProxy,
)


class FakeCursor:
    def __init__(self, connection) -> None:
        self.connection = connection

    def __enter__(self):
        self.connection.cursor_enters += 1
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.connection.cursor_exits += 1
        return False

    def execute(self, query, params=None):
        self.connection.queries.append((query, params))


class FakeConnection:
    def __init__(self) -> None:
        self.queries = []
        self.cursor_enters = 0
        self.cursor_exits = 0
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, *args, **kwargs):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class FakePoolLease:
    def __init__(self, pool) -> None:
        self.pool = pool
        self.connection = FakeConnection()

    def __enter__(self):
        self.pool.active += 1
        self.pool.connections.append(self.connection)
        return self.connection

    def __exit__(self, exc_type, exc_value, traceback):
        self.pool.exit_args.append((exc_type, exc_value))
        self.pool.active -= 1
        return False


class FakePool:
    def __init__(self) -> None:
        self.min_size = 1
        self.max_size = 2
        self.closed = False
        self.opened = False
        self.active = 0
        self.connections = []
        self.exit_args = []
        self.open_calls = []
        self.close_calls = []

    def open(self, *, wait=False, timeout=None):
        self.open_calls.append((wait, timeout))
        self.opened = True

    def connection(self, *, timeout=None):
        return FakePoolLease(self)

    def get_stats(self):
        return {"requests_num": len(self.connections), "pool_size": self.max_size}

    def close(self, *, timeout=None):
        self.close_calls.append(timeout)
        self.closed = True


class PoolTimeout(Exception):
    pass


class FailingPool(FakePool):
    @contextmanager
    def connection(self, *, timeout=None):
        raise PoolTimeout("pool exhausted")
        yield  # pragma: no cover


class OpenFailPool(FakePool):
    def open(self, *, wait=False, timeout=None):
        self.open_calls.append((wait, timeout))
        self.opened = True
        raise RuntimeError("database unavailable")


def test_pool_settings_use_safe_defaults_and_clamp_env_values():
    settings = PostgresPoolSettings.from_env({})
    assert settings.min_size == 1
    assert settings.max_size == 8
    assert settings.timeout_seconds == 5

    bounded = PostgresPoolSettings.from_env(
        {
            "RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE": "99",
            "RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE": "0",
            "RESCUE_MEAL_POSTGRES_POOL_TIMEOUT_SECONDS": "999",
            "RESCUE_MEAL_POSTGRES_POOL_MAX_WAITING": "-1",
        }
    )
    assert bounded.min_size == 32
    assert bounded.max_size == 32
    assert bounded.timeout_seconds == 60
    assert bounded.max_waiting == 0


def test_pool_settings_reject_invalid_direct_values():
    with pytest.raises(ValueError, match="max_size"):
        PostgresPoolSettings(min_size=3, max_size=2)


def test_pooled_proxy_holds_one_checkout_until_commit():
    fake_pool = FakePool()
    operation_pool = PostgresOperationPool("postgresql://unused", pool=fake_pool)
    proxy = PooledConnectionProxy(operation_pool)

    with proxy.cursor() as cursor:
        cursor.execute("SELECT 1")
        assert fake_pool.active == 1
    assert len(fake_pool.connections) == 1
    connection = fake_pool.connections[0]
    proxy.commit()

    assert connection.commits == 1
    assert connection.rollbacks == 0
    assert connection.cursor_enters == 1
    assert connection.cursor_exits == 1
    assert fake_pool.active == 0
    assert fake_pool.exit_args == [(None, None)]


def test_pooled_proxy_rolls_back_and_returns_lease_on_cursor_failure():
    fake_pool = FakePool()
    operation_pool = PostgresOperationPool("postgresql://unused", pool=fake_pool)
    proxy = PooledConnectionProxy(operation_pool)

    with pytest.raises(ValueError, match="bad cursor"):
        with proxy.cursor() as cursor:
            cursor.execute("SELECT 1")
            raise ValueError("bad cursor")

    connection = fake_pool.connections[0]
    assert connection.commits == 0
    assert connection.rollbacks == 1
    assert fake_pool.active == 0
    assert fake_pool.exit_args[0][0] is None


def test_pool_converts_exhaustion_to_application_error():
    fake_pool = FailingPool()
    operation_pool = PostgresOperationPool("postgresql://unused", pool=fake_pool)

    with pytest.raises(PostgresPoolUnavailable, match="connection"):
        with operation_pool.connection(timeout=0.1):
            pass


def test_pool_close_is_idempotent_and_reports_stats():
    fake_pool = FakePool()
    operation_pool = PostgresOperationPool("postgresql://unused", pool=fake_pool)

    operation_pool.open(wait=True)
    assert fake_pool.open_calls == [(True, 5.0)]
    assert operation_pool.stats() == {"requests_num": 0, "pool_size": 2}

    operation_pool.close()
    operation_pool.close()
    assert fake_pool.close_calls == [5.0]


def test_pool_close_cleans_up_after_failed_startup():
    fake_pool = OpenFailPool()
    operation_pool = PostgresOperationPool("postgresql://unused", pool=fake_pool)

    with pytest.raises(PostgresPoolUnavailable, match="열지 못했습니다"):
        operation_pool.open(wait=True)
    operation_pool.close()

    assert fake_pool.close_calls == [5.0]
