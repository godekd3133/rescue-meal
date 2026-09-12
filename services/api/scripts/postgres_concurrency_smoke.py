"""Exercise the workspace revision guard with two real PostgreSQL connections."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import re
import sys
from threading import Barrier
from uuid import uuid4

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.main import ConcurrentWorkspaceWriteError, PostgresStore, _FoodRecord, _seed_foods


def _flush_one(store: PostgresStore, *, label: str, barrier: Barrier) -> str:
    food = _seed_foods()[0].model_copy(deep=True)
    food.id = f"concurrency-{label}"
    store.foods[food.id] = _FoodRecord(food)
    barrier.wait(timeout=15)
    try:
        store.flush()
    except ConcurrentWorkspaceWriteError:
        return "conflict"
    return "committed"


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if os.getenv("RESCUE_MEAL_INVENTORY_MODE", "").strip().lower() != "normalized":
        print("RESCUE_MEAL_INVENTORY_MODE must be normalized.")
        return 1

    workspace_id = f"concurrency-smoke-{uuid4().hex[:16]}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", workspace_id):
        print("Generated concurrency smoke workspace id is invalid.")
        return 1

    stores: list[PostgresStore] = []
    cleanup_store: PostgresStore | None = None
    try:
        stores = [
            PostgresStore(database_url, workspace_id=workspace_id, seed=False),
            PostgresStore(database_url, workspace_id=workspace_id, seed=False),
        ]
        barrier = Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(_flush_one, stores[0], label="a", barrier=barrier),
                executor.submit(_flush_one, stores[1], label="b", barrier=barrier),
            ]
            outcomes = [future.result(timeout=30) for future in futures]

        if sorted(outcomes) != ["committed", "conflict"]:
            print(f"Unexpected concurrency outcomes: {','.join(sorted(outcomes))}")
            return 1

        for store in stores:
            store.close()
        stores = []

        verifier = PostgresStore(database_url, workspace_id=workspace_id, seed=False)
        try:
            food_ids = set(verifier.foods)
            expected_ids = {food_id for food_id in food_ids if food_id.startswith("concurrency-")}
            if len(expected_ids) != 1 or len(food_ids) != 1:
                print("Concurrent write readback did not conserve one committed lot.")
                return 1
        finally:
            verifier.purge()
            verifier.close()

        print("PostgreSQL concurrency smoke passed: one commit, one conflict, one lot read back.")
        return 0
    except Exception as exc:  # pragma: no cover - live PostgreSQL failure path
        print(f"PostgreSQL concurrency smoke failed: {type(exc).__name__}")
        return 1
    finally:
        for store in stores:
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
