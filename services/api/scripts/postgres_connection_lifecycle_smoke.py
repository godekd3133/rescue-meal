"""Verify bounded workspace-store connections against a real PostgreSQL server."""

from __future__ import annotations

from pathlib import Path
import os
import sys
import time
from uuid import uuid4

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
if not database_url.lower().startswith(("postgresql://", "postgres://")):
    print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
    raise SystemExit(1)

# Importing app.main constructs the module-level runtime. Keep this smoke
# focused on the explicit lifecycle objects instead of adding those globals
# to the connection-count readback.
os.environ.pop("RESCUE_MEAL_DATABASE_URL", None)
os.environ.pop("RESCUE_MEAL_SQLITE_PATH", None)

import psycopg

from app.auth import PostgresAccountRepository
from app.main import PostgresStore, WorkspaceStoreRouter, _FoodRecord, _seed_foods


def _connection_snapshot(connection) -> tuple[int, int]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                count(*) FILTER (WHERE pid <> pg_backend_pid()),
                count(*) FILTER (WHERE pid <> pg_backend_pid() AND state = 'idle in transaction')
            FROM pg_stat_activity
            WHERE datname = current_database()
            """
        )
        row = cursor.fetchone()
    connection.rollback()
    return int(row[0]), int(row[1])


def main() -> int:
    inspector = psycopg.connect(database_url)
    base_store: PostgresStore | None = None
    auth_repository: PostgresAccountRepository | None = None
    router: WorkspaceStoreRouter | None = None
    workspace_ids = [f"lifecycle-{uuid4().hex[:12]}-{index}" for index in range(4)]
    connection_counts: list[int] = []
    try:
        base_store = PostgresStore(database_url, workspace_id="demo", seed=False)
        auth_repository = PostgresAccountRepository(database_url)
        router = WorkspaceStoreRouter(base_store, workspace_store_cache_size=2)

        first_workspace = workspace_ids[0]
        with router.workspace_session(first_workspace, seed=False):
            food = _seed_foods()[0].model_copy(deep=True)
            food.id = "lifecycle-persisted-food"
            router.foods[food.id] = _FoodRecord(food)
            router.flush()
        count, idle_in_transaction = _connection_snapshot(inspector)
        connection_counts.append(count)
        if count > 4 or idle_in_transaction:
            print("Connection lifecycle smoke failed after first workspace.")
            return 1

        purge_blocked = False
        with router.workspace_session(first_workspace, seed=False):
            # The outer lease represents the account-delete request. A second
            # lease represents a concurrent worker/request and must prevent
            # purge from closing the store underneath that operation.
            router.acquire_workspace(first_workspace, seed=False)
            try:
                router.purge_workspace(first_workspace)
            except RuntimeError:
                purge_blocked = True
            finally:
                router.release_workspace(first_workspace)
        if not purge_blocked:
            print("Active workspace purge guard did not block a concurrent lease.")
            return 1

        for workspace_id in workspace_ids[1:]:
            with router.workspace_session(workspace_id, seed=False):
                router.flush()
            count, idle_in_transaction = _connection_snapshot(inspector)
            connection_counts.append(count)
            if count > 4 or idle_in_transaction:
                print("Workspace connection cache exceeded its process bound.")
                return 1

        with router.workspace_session(first_workspace, seed=False):
            if "lifecycle-persisted-food" not in router.foods:
                print("Eviction/reopen did not preserve workspace data.")
                return 1
            router.flush()

        for workspace_id in workspace_ids:
            router.purge_workspace(workspace_id)
        router.close()
        auth_repository.close()
        # Server-side backends disappear asynchronously after sockets close, and
        # a previously killed API process can leave rows briefly. Poll a short
        # drain window instead of asserting zero on the first snapshot.
        drain_deadline = time.monotonic() + 15
        remaining_connections, idle_in_transaction = _connection_snapshot(inspector)
        while (remaining_connections != 0 or idle_in_transaction) and time.monotonic() < drain_deadline:
            time.sleep(0.25)
            remaining_connections, idle_in_transaction = _connection_snapshot(inspector)
        if remaining_connections != 0 or idle_in_transaction:
            print("Lifecycle close left PostgreSQL connections or idle transactions.")
            return 1

        print(
            "PostgreSQL connection lifecycle smoke passed: "
            f"observed={','.join(str(count) for count in connection_counts)}, "
            f"max_observed={max(connection_counts, default=0)}, "
            "base+auth+2-cache bound, eviction/reopen persisted data, active-purge guard, shutdown closed all connections."
        )
        return 0
    except Exception as exc:  # pragma: no cover - live PostgreSQL failure path
        print(f"PostgreSQL connection lifecycle smoke failed: {type(exc).__name__}")
        return 1
    finally:
        if router is not None:
            router.close()
        elif base_store is not None:
            base_store.close()
        if auth_repository is not None:
            auth_repository.close()
        inspector.close()


if __name__ == "__main__":
    raise SystemExit(main())
