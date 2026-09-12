"""Exercise receive replay when a process dies after PostgreSQL commit.

The first API process uses ``postgres_post_commit_crash_server.py``. Its
smoke-only middleware kills the process after the receive handler returns its
committed response object but before Uvicorn sends the response. A second
normal process must replay the already committed operation instead of creating
another lot, and a restarted process must return the same lot again.
"""

from __future__ import annotations

import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
from uuid import uuid4

import httpx
import psycopg

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from postgres_multiprocess_receive_smoke import (  # noqa: E402
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


def _start_post_commit_crash_process(port: int, log_file) -> subprocess.Popen[bytes]:
    environment = os.environ.copy()
    environment["RESCUE_MEAL_AUTH_REQUIRED"] = "true"
    environment["RESCUE_MEAL_INVENTORY_MODE"] = "normalized"
    return subprocess.Popen(
        [sys.executable, str(SERVICE_ROOT / "scripts/postgres_post_commit_crash_server.py"), "--port", str(port)],
        cwd=SERVICE_ROOT,
        env=environment,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )


def _crash_after_commit_receive(base_url: str, token: str, item_id: str, key: str) -> tuple[str, int | None]:
    try:
        with _authenticated_client(base_url, token) as client:
            response = client.post(
                f"/api/shopping-list/{item_id}/receive",
                headers={
                    "Idempotency-Key": key,
                    "X-Rescue-Meal-Smoke-Crash": "after-commit",
                },
                json={"quantity": 1, "storage_type": "refrigerated"},
            )
            return "response", response.status_code
    except httpx.HTTPError:
        return "transport_error", None


def _receive_replay(base_url: str, token: str, item_id: str, key: str) -> tuple[str, bool]:
    with _authenticated_client(base_url, token) as client:
        response = client.post(
            f"/api/shopping-list/{item_id}/receive",
            headers={"Idempotency-Key": key},
            json={"quantity": 1, "storage_type": "refrigerated"},
        )
        _assert_status(response, 201, "post-commit receive replay")
        payload = _json_object(response, "post-commit receive replay")
        lot = payload.get("inventory_lot")
        if not isinstance(lot, dict) or not isinstance(lot.get("id"), str):
            raise SmokeFailure("post-commit replay did not contain an inventory lot")
        if payload.get("idempotency_replayed") is not True:
            raise SmokeFailure("post-commit recovery request was not marked as a replay")
        return lot["id"], True


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

    port_a = int(os.getenv("RESCUE_MEAL_POST_COMMIT_CRASH_PORT_A", "18151"))
    port_b = int(os.getenv("RESCUE_MEAL_POST_COMMIT_CRASH_PORT_B", "18152"))
    if port_a == port_b or not (1024 <= port_a <= 65535 and 1024 <= port_b <= 65535):
        print("Post-commit crash smoke ports must be different valid TCP ports.")
        return 1

    workspace_id = f"post-commit-crash-{uuid4().hex[:16]}"
    processes: list[subprocess.Popen[bytes]] = []
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-post-commit-crash-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            with log_a_path.open("wb") as log_a, log_b_path.open("wb") as log_b:
                process_a = _start_post_commit_crash_process(port_a, log_a)
                process_b = _start_process(port_b, "api-b", log_b)
                processes.extend((process_a, process_b))
                base_url_a = _base_url(port_a)
                base_url_b = _base_url(port_b)
                _wait_ready(base_url_a, process_a, "post-commit-crash api-a")
                _wait_ready(base_url_b, process_b, "post-commit api-b")

                token, workspace_id, item_id = _create_guest_and_item(base_url_a)
                key = "post-commit-crash-receive-v1"
                request_kind, request_status = _crash_after_commit_receive(base_url_a, token, item_id, key)
                process_a.wait(timeout=10)
                if process_a.returncode != -signal.SIGKILL:
                    raise SmokeFailure(
                        f"post-commit crash server exited with {process_a.returncode}, expected SIGKILL"
                    )
                processes.remove(process_a)
                if request_kind == "response" and request_status == 201:
                    raise SmokeFailure("post-commit crash request reached the client before process termination")

                lot_id, _ = _receive_replay(base_url_b, token, item_id, key)
                operation_count, lot_count = _readback(database_url, workspace_id, lot_id)
                if operation_count != 1 or lot_count != 1:
                    raise SmokeFailure(
                        f"post-commit readback expected one operation and one lot, got {operation_count} and {lot_count}"
                    )

                restarted_a = _start_process(port_a, "api-restart", log_a)
                processes.append(restarted_a)
                _wait_ready(base_url_a, restarted_a, "post-commit restarted api-a")
                restarted_lot_id, _ = _receive_replay(base_url_a, token, item_id, key)
                if restarted_lot_id != lot_id:
                    raise SmokeFailure("restarted post-commit replay returned a different lot")

                print(
                    "PostgreSQL post-commit crash smoke passed: "
                    f"workspace={workspace_id} killed_after_commit=transport_or_non201 "
                    f"replay=201 same_lot operation_count={operation_count} lot_count={lot_count}."
                )
                exit_code = 0
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError) as exc:
        print(f"PostgreSQL post-commit crash smoke failed: {type(exc).__name__}: {exc}")
    finally:
        for process in processes:
            _stop_process(process)
        try:
            _purge_workspace(database_url, workspace_id)
        except Exception as exc:  # pragma: no cover - disposable live DB cleanup
            print(f"PostgreSQL post-commit crash smoke cleanup failed: {type(exc).__name__}")
            exit_code = 1
    return exit_code
if __name__ == "__main__":
    raise SystemExit(main())
