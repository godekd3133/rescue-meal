"""Verify operation-scoped PostgreSQL pool bounds and store persistence."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Event
import os
import sys
from uuid import uuid4

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
if not database_url.lower().startswith(("postgresql://", "postgres://")):
    print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
    raise SystemExit(1)
if os.getenv("RESCUE_MEAL_INVENTORY_MODE", "").strip().lower() != "normalized":
    print("RESCUE_MEAL_INVENTORY_MODE must be normalized.")
    raise SystemExit(1)

# Avoid opening app.main's module-level direct connections. This smoke owns a
# single explicit operation pool and the workspace stores that use it.
os.environ.pop("RESCUE_MEAL_DATABASE_URL", None)
os.environ.pop("RESCUE_MEAL_SQLITE_PATH", None)

import psycopg

from app.main import PostgresStore, _FoodRecord, _seed_foods
from app.postgres_pool import PostgresOperationPool, PostgresPoolSettings, PostgresPoolUnavailable


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


def _hold_pool_lease(pool: PostgresOperationPool, ready: Barrier, release: Event) -> None:
    with pool.connection(timeout=2) as connection:
        connection.execute("SELECT 1")
        ready.wait(timeout=15)
        release.wait(timeout=15)


def main() -> int:
    inspector = psycopg.connect(database_url)
    operation_pool = PostgresOperationPool(
        database_url,
        settings=PostgresPoolSettings(
            min_size=2,
            max_size=2,
            timeout_seconds=0.5,
            max_waiting=1,
            max_idle_seconds=30,
            max_lifetime_seconds=300,
            reconnect_timeout_seconds=10,
            close_timeout_seconds=5,
        ),
    )
    workspace_id = f"pool-smoke-{uuid4().hex[:16]}"
    stores: list[PostgresStore] = []
    cleanup_required = False
    max_observed_connections = 0
    try:
        operation_pool.open(wait=True)
        ready = Barrier(3)
        release = Event()
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(_hold_pool_lease, operation_pool, ready, release),
                executor.submit(_hold_pool_lease, operation_pool, ready, release),
            ]
            try:
                ready.wait(timeout=15)
                observed_connections, idle_in_transaction = _connection_snapshot(inspector)
                max_observed_connections = max(max_observed_connections, observed_connections)
                if observed_connections > 2:
                    print("Operation pool exceeded max_size while leases were held.")
                    return 1

                exhausted = False
                try:
                    with operation_pool.connection(timeout=0.2):
                        pass
                except PostgresPoolUnavailable:
                    exhausted = True
                if not exhausted:
                    print("Operation pool did not enforce checkout timeout under two held leases.")
                    return 1
            finally:
                release.set()
            for future in futures:
                future.result(timeout=20)

        workspace_store = PostgresStore(
            database_url,
            workspace_id=workspace_id,
            seed=False,
            operation_pool=operation_pool,
            initialize_schema=False,
        )
        stores.append(workspace_store)
        cleanup_required = True
        food = _seed_foods()[0].model_copy(deep=True)
        food.id = "pool-persisted-food"
        food.canonical_name = "Operation Pool 식품"
        workspace_store.foods[food.id] = _FoodRecord(food)
        workspace_store.flush()
        workspace_store.close()

        reopened_store = PostgresStore(
            database_url,
            workspace_id=workspace_id,
            seed=False,
            operation_pool=operation_pool,
            initialize_schema=False,
        )
        stores.append(reopened_store)
        if reopened_store.foods.get("pool-persisted-food") is None:
            print("Pooled workspace store did not read back its committed food.")
            return 1
        reopened_store.purge()
        reopened_store.close()
        cleanup_required = False

        after_release_connections, idle_in_transaction = _connection_snapshot(inspector)
        max_observed_connections = max(max_observed_connections, after_release_connections)
        if idle_in_transaction:
            print("Operation pool left an idle transaction after a lease returned.")
            return 1

        operation_pool.close()
        remaining_connections, idle_in_transaction = _connection_snapshot(inspector)
        if remaining_connections != 0 or idle_in_transaction:
            print("Operation pool shutdown left PostgreSQL connections or idle transactions.")
            return 1

        print(
            "PostgreSQL operation pool smoke passed: "
            f"max_size={operation_pool.max_size}, "
            f"max_observed_connections={max_observed_connections}, "
            "checkout_timeout=passed, pooled_workspace_persistence=readback, "
            "idle_in_transaction=0, shutdown_connections=0."
        )
        return 0
    except Exception as exc:  # pragma: no cover - live PostgreSQL failure path
        print(f"PostgreSQL operation pool smoke failed: {type(exc).__name__}")
        return 1
    finally:
        if cleanup_required:
            try:
                cleanup_store = PostgresStore(
                    database_url,
                    workspace_id=workspace_id,
                    seed=False,
                    operation_pool=operation_pool,
                    initialize_schema=False,
                )
                cleanup_store.purge()
                cleanup_store.close()
            except Exception:
                pass
        for store in stores:
            try:
                store.close()
            except Exception:
                pass
        operation_pool.close()
        inspector.close()


if __name__ == "__main__":
    raise SystemExit(main())
