"""Exercise receive recovery when an API process dies during a PostgreSQL write.

The test holds the workspace revision row lock, starts a real HTTP receive in
one single-worker API process, and waits until that request is blocked on the
database lock. It then kills that process before its transaction can commit,
releases the lock, and retries the same request through the second process.
The retry must create one durable operation and one lot; a restarted first
process must observe the operation as a replay.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from uuid import uuid4

import httpx
import psycopg

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from postgres_multiprocess_receive_smoke import (
    REQUEST_TIMEOUT_SECONDS,
    SmokeFailure,
    _assert_status,
    _authenticated_client,
    _base_url,
    _create_guest_and_item,
    _json_object,
    _start_process,
    _stop_process,
    _wait_ready,
)


BLOCKED_WRITE_TIMEOUT_SECONDS = 15.0


def _hold_workspace_revision(database_url: str, workspace_id: str):
    connection = psycopg.connect(database_url)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT revision FROM rescue_api_workspace_revisions WHERE workspace_id = %s FOR UPDATE",
                (workspace_id,),
            )
            if cursor.fetchone() is None:
                raise SmokeFailure("workspace revision row was not created before crash test")
        return connection
    except BaseException:
        connection.rollback()
        connection.close()
        raise


def _wait_for_blocked_write(inspector) -> None:
    deadline = time.monotonic() + BLOCKED_WRITE_TIMEOUT_SECONDS
    query = """
        SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND state = 'active'
              AND wait_event_type = 'Lock'
              AND query ILIKE '%rescue_api_workspace_revisions%'
              AND query NOT ILIKE '%pg_stat_activity%'
        )
    """
    while time.monotonic() < deadline:
        with inspector.cursor() as cursor:
            cursor.execute(query)
            row = cursor.fetchone()
        inspector.rollback()
        if row and bool(row[0]):
            return
        time.sleep(0.1)
    raise SmokeFailure("receive process did not block on the workspace revision lock")


def _blocked_receive(base_url: str, token: str, item_id: str, idempotency_key: str) -> tuple[str, int | None]:
    try:
        with _authenticated_client(base_url, token) as client:
            response = client.post(
                f"/api/shopping-list/{item_id}/receive",
                headers={"Idempotency-Key": idempotency_key},
                json={"quantity": 1, "storage_type": "refrigerated"},
            )
            return "response", response.status_code
    except httpx.HTTPError:
        return "transport_error", None


def _receive_and_read_lot(base_url: str, token: str, item_id: str, key: str) -> tuple[str, bool]:
    with _authenticated_client(base_url, token) as client:
        response = client.post(
            f"/api/shopping-list/{item_id}/receive",
            headers={"Idempotency-Key": key},
            json={"quantity": 1, "storage_type": "refrigerated"},
        )
        _assert_status(response, 201, "post-crash receive retry")
        payload = _json_object(response, "post-crash receive retry")
        lot = payload.get("inventory_lot")
        if not isinstance(lot, dict) or not isinstance(lot.get("id"), str):
            raise SmokeFailure("post-crash receive retry did not contain an inventory lot")
        replayed = payload.get("idempotency_replayed")
        if replayed is not False:
            raise SmokeFailure("post-crash retry was unexpectedly reported as a replay")
        return lot["id"], bool(replayed)


def _replay_and_read_lot(base_url: str, token: str, item_id: str, key: str, expected_lot_id: str) -> None:
    with _authenticated_client(base_url, token) as client:
        response = client.post(
            f"/api/shopping-list/{item_id}/receive",
            headers={"Idempotency-Key": key},
            json={"quantity": 1, "storage_type": "refrigerated"},
        )
        _assert_status(response, 201, "restarted process receive replay")
        payload = _json_object(response, "restarted process receive replay")
        lot = payload.get("inventory_lot")
        if not isinstance(lot, dict) or lot.get("id") != expected_lot_id:
            raise SmokeFailure("restarted process replay returned a different lot")
        if payload.get("idempotency_replayed") is not True:
            raise SmokeFailure("restarted process did not mark the receive as a replay")


def _readback(database_url: str, workspace_id: str, lot_id: str) -> tuple[int, int]:
    connection = psycopg.connect(database_url)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM rescue_api_shopping_receive_operations WHERE workspace_id = %s",
                (workspace_id,),
            )
            operation_count = int(cursor.fetchone()[0])
            cursor.execute(
                "SELECT count(*) FROM rescue_inventory_lots WHERE workspace_id = %s AND lot_id = %s",
                (workspace_id, lot_id),
            )
            lot_count = int(cursor.fetchone()[0])
        connection.rollback()
        return operation_count, lot_count
    finally:
        connection.close()


def _purge_workspace(database_url: str, workspace_id: str) -> None:
    # Reuse the repository's own purge contract so the smoke does not encode a
    # second, incomplete list of workspace tables.
    os.environ["RESCUE_MEAL_INVENTORY_MODE"] = "normalized"
    from app.main import PostgresStore

    store = PostgresStore(database_url, workspace_id=workspace_id, seed=False)
    try:
        store.purge()
    finally:
        store.close()


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    auth_secret = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if not auth_secret:
        print("RESCUE_MEAL_AUTH_SECRET must be set for the authenticated smoke.")
        return 1
    port_a = int(os.getenv("RESCUE_MEAL_CRASH_PORT_A", "18131"))
    port_b = int(os.getenv("RESCUE_MEAL_CRASH_PORT_B", "18132"))
    if port_a == port_b or not (1024 <= port_a <= 65535 and 1024 <= port_b <= 65535):
        print("Crash recovery smoke ports must be different valid TCP ports.")
        return 1

    workspace_id = f"crash-recovery-{uuid4().hex[:16]}"
    processes: list[subprocess.Popen[bytes]] = []
    inspector = None
    lock_connection = None
    executor = ThreadPoolExecutor(max_workers=1)
    exit_code = 1
    try:
        inspector = psycopg.connect(database_url)
        with tempfile.TemporaryDirectory(prefix="rescue-meal-crash-") as temp_dir:
            with ExitStack() as logs:
                log_a = logs.enter_context(open(Path(temp_dir) / "api-a.log", "wb"))
                log_b = logs.enter_context(open(Path(temp_dir) / "api-b.log", "wb"))
                process_a = _start_process(port_a, "api-a", log_a)
                process_b = _start_process(port_b, "api-b", log_b)
                processes.extend((process_a, process_b))
                base_url_a = _base_url(port_a)
                base_url_b = _base_url(port_b)
                _wait_ready(base_url_a, process_a, "api-a")
                _wait_ready(base_url_b, process_b, "api-b")

                token, workspace_id, item_id = _create_guest_and_item(base_url_a)
                key = "crash-recovery-receive-v1"
                lock_connection = _hold_workspace_revision(database_url, workspace_id)
                pending = executor.submit(_blocked_receive, base_url_a, token, item_id, key)
                _wait_for_blocked_write(inspector)

                process_a.kill()
                process_a.wait(timeout=10)
                processes.remove(process_a)
                lock_connection.rollback()
                lock_connection.close()
                lock_connection = None

                request_kind, request_status = pending.result(timeout=REQUEST_TIMEOUT_SECONDS + 10)
                if request_kind == "response" and request_status == 201:
                    raise SmokeFailure("API process committed a receive before the forced crash")

                lot_id, _ = _receive_and_read_lot(base_url_b, token, item_id, key)
                operation_count, lot_count = _readback(database_url, workspace_id, lot_id)
                if operation_count != 1 or lot_count != 1:
                    raise SmokeFailure(
                        f"post-crash readback expected one operation and one lot, got {operation_count} and {lot_count}"
                    )

                restarted_a = _start_process(port_a, "api-restart", log_a)
                processes.append(restarted_a)
                _wait_ready(base_url_a, restarted_a, "api-restart")
                _replay_and_read_lot(base_url_a, token, item_id, key, lot_id)

                print(
                    "PostgreSQL crash recovery smoke passed: "
                    f"workspace={workspace_id} killed_before_commit=transport_or_non201 "
                    f"retry=201 initial replay=201 same_lot operation_count={operation_count} lot_count={lot_count}."
                )
                exit_code = 0
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError) as exc:
        print(f"PostgreSQL crash recovery smoke failed: {type(exc).__name__}: {exc}")
    finally:
        for process in processes:
            _stop_process(process)
        if lock_connection is not None:
            lock_connection.rollback()
            lock_connection.close()
        # Stop the API processes before waiting on a potentially blocked HTTP
        # future, then drain that future before purging the test workspace.
        executor.shutdown(wait=True, cancel_futures=True)
        if inspector is not None:
            inspector.close()
        try:
            _purge_workspace(database_url, workspace_id)
        except Exception as exc:  # pragma: no cover - disposable live DB cleanup
            print(f"PostgreSQL crash recovery smoke cleanup failed: {type(exc).__name__}")
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
