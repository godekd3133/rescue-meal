"""Verify account deletion recovery after a real API process SIGKILL.

The first process acquires the durable account deletion fence and then waits
on a workspace revision lock. The process is killed while it is waiting, so
its workspace transaction rolls back but the independently committed
``deleting`` fence remains. A restarted process must accept the same session
token, resume the delete endpoint, purge the workspace, and remove the
credentials without creating a second workspace or leaving metadata behind.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import threading
from typing import Any

import httpx
import psycopg

from postgres_account_deletion_smoke import (
    DEFAULT_PORT_A,
    DEFAULT_PORT_B,
    REQUEST_TIMEOUT_SECONDS,
    SmokeFailure,
    _assert_blocked_while_deleting,
    _assert_status,
    _base_url,
    _create_food,
    _delete_in_background,
    _json_object,
    _lock_workspace_revision,
    _readback_counts,
    _register_account,
    _start_process,
    _stop_process,
    _wait_for_account_status,
    _wait_ready,
    _port_from_env,
)


def _delete_synchronously(base_url: str, token: str, password: str) -> dict[str, Any]:
    with httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    ) as client:
        response = client.post(
            "/api/account/delete",
            json={"current_password": password, "confirmation": "DELETE"},
        )
    _assert_status(response, 200, "restarted account deletion")
    payload = _json_object(response, "restarted account deletion")
    if payload.get("status") != "deleted":
        raise SmokeFailure("restarted account deletion did not return deleted status")
    return payload


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    auth_secret = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if not auth_secret:
        print("RESCUE_MEAL_AUTH_SECRET must be set for the authenticated smoke.")
        return 1

    port_a = _port_from_env("RESCUE_MEAL_ACCOUNT_DELETION_CRASH_PORT_A", DEFAULT_PORT_A + 2)
    port_b = _port_from_env("RESCUE_MEAL_ACCOUNT_DELETION_CRASH_PORT_B", DEFAULT_PORT_B + 2)
    if port_a == port_b:
        print("Account deletion crash smoke ports must be different.")
        return 1

    processes: list[subprocess.Popen[bytes]] = []
    lock_connection = None
    deletion_thread: threading.Thread | None = None
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-account-deletion-crash-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            with log_a_path.open("ab") as log_a, log_b_path.open("ab") as log_b:
                process_a = _start_process(port_a, log_a)
                process_b = _start_process(port_b, log_b)
                processes.extend((process_a, process_b))
                base_url_a = _base_url(port_a)
                base_url_b = _base_url(port_b)
                _wait_ready(base_url_a, process_a, "account-deletion crash api-a")
                _wait_ready(base_url_b, process_b, "account-deletion crash api-b")

                email, password, token, account_id, workspace_id = _register_account(base_url_a)
                _create_food(base_url_a, token)
                lock_connection = _lock_workspace_revision(database_url, workspace_id)

                deletion_result: dict[str, Any] = {}
                deletion_thread = _delete_in_background(base_url_a, token, password, deletion_result)
                _wait_for_account_status(database_url, account_id, "deleting")
                if not deletion_thread.is_alive():
                    raise SmokeFailure("delete request completed before crash injection")
                _assert_blocked_while_deleting(base_url_b, token)

                before_kill = _readback_counts(database_url, account_id, workspace_id)
                if before_kill["account_rows"] != 1 or before_kill["compatibility_food_rows"] != 1 or before_kill["normalized_lot_rows"] != 1:
                    raise SmokeFailure(f"data was lost before SIGKILL: {before_kill}")

                process_a.kill()
                process_a.wait(timeout=10)
                processes.remove(process_a)
                deletion_thread.join(timeout=REQUEST_TIMEOUT_SECONDS)
                if deletion_thread.is_alive():
                    raise SmokeFailure("in-flight request did not observe the killed API process")
                if "status_code" in deletion_result:
                    raise SmokeFailure("delete request completed before the SIGKILL readback")
                if "error" not in deletion_result:
                    raise SmokeFailure("killed delete request did not report a transport interruption")

                lock_connection.rollback()
                lock_connection.close()
                lock_connection = None

                restarted_a = _start_process(port_a, log_a)
                processes.append(restarted_a)
                _wait_ready(base_url_a, restarted_a, "account-deletion crash api-a restart")
                _delete_synchronously(base_url_a, token, password)

                with httpx.Client(
                    base_url=base_url_b,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=REQUEST_TIMEOUT_SECONDS,
                ) as client:
                    post_delete = client.get("/api/dashboard")
                    _assert_status(post_delete, 401, "old token after crash recovery deletion")

                with httpx.Client(base_url=base_url_b, timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    login = client.post("/api/auth/login", json={"email": email, "password": password})
                    _assert_status(login, 401, "login after crash recovery deletion")

                after_delete = _readback_counts(database_url, account_id, workspace_id)
                if any(after_delete.values()):
                    raise SmokeFailure(f"account/workspace rows remained after crash recovery: {after_delete}")

                print(
                    "PostgreSQL account deletion crash recovery smoke passed: "
                    "fence=deleting sigkill=rollback restart=resume old-token=401 "
                    "login=401 rows=0."
                )
                return 0
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError, ValueError) as exc:
        print(f"PostgreSQL account deletion crash recovery smoke failed: {type(exc).__name__}: {exc}")
        return 1
    finally:
        if deletion_thread is not None and deletion_thread.is_alive():
            deletion_thread.join(timeout=REQUEST_TIMEOUT_SECONDS)
        if lock_connection is not None:
            try:
                lock_connection.rollback()
            finally:
                lock_connection.close()
        for process in processes:
            _stop_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
