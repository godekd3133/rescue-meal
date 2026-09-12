from pathlib import Path

from app.auth import AccountRepository
import app.main as main_module
from app.rate_limit import PersistentSlidingWindowRateLimiter


def test_sqlite_rate_limit_is_shared_and_atomic_across_requests(tmp_path: Path) -> None:
    repository = AccountRepository(str(tmp_path / "auth.db"))
    current_time = [1_000.0]
    limiter = PersistentSlidingWindowRateLimiter(
        repository.rate_limit_connection,
        dialect="sqlite",
        clock=lambda: current_time[0],
        lock=repository.rate_limit_lock,
    )

    first = limiter.check(["ip:login:one"], limit=2, window_seconds=60)
    second = limiter.check(["ip:login:one"], limit=2, window_seconds=60)
    blocked = limiter.check(["ip:login:one"], limit=2, window_seconds=60)

    assert first.allowed is True
    assert first.remaining == 1
    assert second.allowed is True
    assert second.remaining == 0
    assert blocked.allowed is False
    assert blocked.retry_after_seconds == 60
    assert blocked.remaining == 0

    current_time[0] += 60
    after_window = limiter.check(["ip:login:one"], limit=2, window_seconds=60)

    assert after_window.allowed is True
    assert after_window.remaining == 1

    limiter.reset()
    assert repository.rate_limit_connection.execute("SELECT COUNT(*) FROM rate_limit_events").fetchone()[0] == 0


def test_sqlite_rate_limit_checks_all_keys_before_inserting_any_event(tmp_path: Path) -> None:
    repository = AccountRepository(str(tmp_path / "auth.db"))
    limiter = PersistentSlidingWindowRateLimiter(
        repository.rate_limit_connection,
        dialect="sqlite",
        clock=lambda: 2_000.0,
        lock=repository.rate_limit_lock,
    )

    assert limiter.check(["ip:login:two", "identity:login:two"], limit=1, window_seconds=60).allowed is True
    blocked = limiter.check(["ip:login:two", "identity:login:two"], limit=1, window_seconds=60)

    assert blocked.allowed is False
    rows = repository.rate_limit_connection.execute(
        "SELECT bucket_key, COUNT(*) FROM rate_limit_events GROUP BY bucket_key ORDER BY bucket_key"
    ).fetchall()
    assert rows == [("identity:login:two", 1), ("ip:login:two", 1)]


def test_auth_rate_limit_builder_selects_database_limiter_for_persistent_auth(monkeypatch, tmp_path: Path) -> None:
    repository = AccountRepository(str(tmp_path / "auth.db"))
    monkeypatch.setattr(main_module, "auth_repository", repository)

    limiter = main_module._build_auth_rate_limiter()

    assert isinstance(limiter, PersistentSlidingWindowRateLimiter)
    assert limiter._dialect == "sqlite"


class PostgresRateLimitCursor:
    def __init__(self, connection) -> None:
        self.connection = connection

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, query, params=None):
        self.connection.queries.append((query, params))

    def executemany(self, query, rows):
        self.connection.queries.append((query, list(rows)))

    def fetchall(self):
        return []


class PostgresRateLimitConnection:
    def __init__(self) -> None:
        self.queries = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return PostgresRateLimitCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_postgres_rate_limit_uses_transaction_scoped_advisory_locks() -> None:
    connection = PostgresRateLimitConnection()
    limiter = PersistentSlidingWindowRateLimiter(connection, dialect="postgres", clock=lambda: 3_000.0)

    decision = limiter.check(["ip:login:postgres"], limit=1, window_seconds=60)
    limiter.reset()

    assert decision.allowed is True
    assert connection.commits == 2
    assert any("pg_advisory_xact_lock" in query for query, _ in connection.queries)
    assert any("rescue_auth_rate_limit_events" in query and "DELETE" in query for query, _ in connection.queries)
    assert any("rescue_auth_rate_limit_events" in query and "INSERT" in query for query, _ in connection.queries)
