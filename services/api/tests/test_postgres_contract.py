from pathlib import Path

from app.auth import PostgresAccountRepository
from app.main import PostgresStore, _FoodRecord, _seed_foods


class FakeCursor:
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

    def fetchone(self):
        return (0,)

    def fetchall(self):
        return []


class FakeConnection:
    def __init__(self) -> None:
        self.queries = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_postgres_projection_migration_declares_workspace_composite_keys() -> None:
    migration = Path(__file__).resolve().parents[3] / "infra" / "postgres" / "001_initial_schema.sql"
    sql = migration.read_text()

    assert sql.count("workspace_id text NOT NULL") >= 10
    assert "PRIMARY KEY (workspace_id, id)" in sql
    assert "PRIMARY KEY (workspace_id, fingerprint)" in sql
    assert "rescue_auth_accounts" in sql
    assert "rescue_auth_revoked_tokens" in sql
    assert "ALTER TABLE rescue_api_foods ADD COLUMN IF NOT EXISTS workspace_id" in sql


def test_postgres_store_filters_and_writes_only_the_active_workspace() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    repository.foods["spinach-1"] = _FoodRecord(_seed_foods()[0])
    repository.flush()

    initialization_sql = connection.queries[0][0]
    assert "PRIMARY KEY (workspace_id, id)" in initialization_sql
    filtered_queries = [query for query, _ in connection.queries if "WHERE workspace_id = %s" in query]
    assert any("rescue_api_foods" in query for query in filtered_queries)
    assert any("rescue_api_receipts" in query for query in filtered_queries)
    food_insert = next(rows for query, rows in connection.queries if query.startswith("INSERT INTO rescue_api_foods") and rows)
    assert food_insert[0][0] == "account-one"
    assert "workspace_id, id, payload" in next(query for query, _ in connection.queries if query.startswith("INSERT INTO rescue_api_foods"))


def test_postgres_auth_repository_uses_persistent_account_and_revoke_tables() -> None:
    connection = FakeConnection()
    repository = PostgresAccountRepository("postgresql://test", connection=connection)
    repository.revoke_token("token-example")

    initialization_sql = connection.queries[0][0]
    assert "rescue_auth_accounts" in initialization_sql
    assert "rescue_auth_revoked_tokens" in initialization_sql
    assert any("ON CONFLICT (token_hash) DO NOTHING" in query for query, _ in connection.queries)
    assert repository.is_token_revoked("token-example") is True
