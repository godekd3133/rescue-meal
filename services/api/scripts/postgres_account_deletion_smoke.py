"""Exercise resumable account deletion through two real API processes.

The account deletion fence is stored in the shared auth database, while the
workspace purge is owned by a separate PostgreSQL-backed store. This smoke
holds the workspace revision row after the first process acquires the durable
``deleting`` fence. A second process must observe the fence and reject normal
workspace traffic with ``423`` while the delete request is waiting. Releasing
the row lock then lets the original request finish the purge and credential
deletion, after which the old token must receive ``401`` from both processes.
"""

from __future__ import annotations

from pathlib import Path
import os
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any
from uuid import uuid4

import httpx
import psycopg


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT_A = 18171
DEFAULT_PORT_B = 18172
STARTUP_TIMEOUT_SECONDS = 45.0
REQUEST_TIMEOUT_SECONDS = 15.0


class SmokeFailure(RuntimeError):
    """A live multi-process assertion failed without exposing request data."""


def _port_from_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        port = int(raw)
    except ValueError as exc:
        raise SmokeFailure(f"{name} must be an integer") from exc
    if not 1024 <= port <= 65535:
        raise SmokeFailure(f"{name} must be between 1024 and 65535")
    return port


def _base_url(port: int) -> str:
    return f"http://127.0.0.1:{port}"


def _assert_status(response: httpx.Response, expected: int, operation: str) -> None:
    if response.status_code != expected:
        raise SmokeFailure(f"{operation} returned HTTP {response.status_code}, expected {expected}")


def _json_object(response: httpx.Response, operation: str) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise SmokeFailure(f"{operation} returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise SmokeFailure(f"{operation} returned a non-object JSON payload")
    return payload


def _wait_ready(base_url: str, process: subprocess.Popen[bytes], label: str) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    with httpx.Client(timeout=2.0) as client:
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise SmokeFailure(f"{label} exited before readiness")
            try:
                response = client.get(f"{base_url}/ready")
                if response.status_code == 200:
                    payload = _json_object(response, f"{label} readiness")
                    if payload.get("status") == "ready" and payload.get("database") == "ok":
                        return
            except (httpx.HTTPError, SmokeFailure):
                pass
            time.sleep(0.25)
    raise SmokeFailure(f"{label} did not become ready")


def _start_process(port: int, log_file) -> subprocess.Popen[bytes]:
    environment = os.environ.copy()
    environment["RESCUE_MEAL_AUTH_REQUIRED"] = "true"
    environment["RESCUE_MEAL_INVENTORY_MODE"] = "normalized"
    environment["RESCUE_MEAL_ACCESS_LOG"] = "false"
    environment["RESCUE_MEAL_CLIENT_ERROR_LOG"] = "false"
    environment["RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS"] = "false"
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--workers",
        "1",
    ]
    return subprocess.Popen(
        command,
        cwd=SERVICE_ROOT,
        env=environment,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )


def _stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def _register_account(base_url: str) -> tuple[str, str, str, str, str]:
    email = f"account-delete-live-{uuid4().hex}@example.com"
    password = "account-delete-live-password"
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = client.post("/api/auth/register", json={"email": email, "password": password})
        _assert_status(response, 201, "account registration")
        payload = _json_object(response, "account registration")
    token = payload.get("access_token")
    account_id = payload.get("user_id")
    workspace_id = payload.get("workspace_id")
    if not all(isinstance(value, str) and value for value in (token, account_id, workspace_id)):
        raise SmokeFailure("account registration did not return session identifiers")
    return email, password, token, account_id, workspace_id


def _create_food(base_url: str, token: str) -> str:
    with httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    ) as client:
        response = client.post(
            "/api/foods",
            json={
                "canonical_name": "다중 프로세스 삭제 경계 식품",
                "quantity": 1,
                "unit": "개",
                "storage_type": "refrigerated",
                "category": "테스트",
            },
        )
        _assert_status(response, 201, "account workspace food creation")
        payload = _json_object(response, "account workspace food creation")
    food_id = payload.get("id")
    if not isinstance(food_id, str) or not food_id:
        raise SmokeFailure("account workspace food response did not return an id")
    return food_id


def _lock_workspace_revision(database_url: str, workspace_id: str):
    connection = psycopg.connect(database_url)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT revision FROM rescue_api_workspace_revisions WHERE workspace_id = %s FOR UPDATE",
                (workspace_id,),
            )
            if cursor.fetchone() is None:
                raise SmokeFailure("account workspace did not have a revision row to lock")
        return connection
    except Exception:
        connection.rollback()
        connection.close()
        raise


def _wait_for_account_status(database_url: str, account_id: str, expected: str) -> None:
    deadline = time.monotonic() + REQUEST_TIMEOUT_SECONDS
    connection = psycopg.connect(database_url)
    connection.autocommit = True
    try:
        while time.monotonic() < deadline:
            with connection.cursor() as cursor:
                cursor.execute("SELECT status FROM rescue_auth_accounts WHERE id = %s", (account_id,))
                row = cursor.fetchone()
            if row is not None and row[0] == expected:
                return
            time.sleep(0.05)
    finally:
        connection.close()
    raise SmokeFailure(f"account did not reach status {expected}")


def _readback_counts(database_url: str, account_id: str, workspace_id: str) -> dict[str, int]:
    connection = psycopg.connect(database_url)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    (SELECT count(*) FROM rescue_auth_accounts WHERE id = %s),
                    (SELECT count(*) FROM rescue_auth_password_reset_tokens WHERE account_id = %s),
                    (SELECT count(*) FROM rescue_api_foods WHERE workspace_id = %s),
                    (SELECT count(*) FROM rescue_inventory_lots WHERE workspace_id = %s),
                    (SELECT count(*) FROM rescue_api_workspace_revisions WHERE workspace_id = %s)
                """,
                (account_id, account_id, workspace_id, workspace_id, workspace_id),
            )
            row = cursor.fetchone()
        if row is None:
            raise SmokeFailure("account deletion readback returned no row")
        return {
            "account_rows": int(row[0]),
            "reset_token_rows": int(row[1]),
            "compatibility_food_rows": int(row[2]),
            "normalized_lot_rows": int(row[3]),
            "workspace_revision_rows": int(row[4]),
        }
    finally:
        connection.close()


def _delete_in_background(
    base_url: str,
    token: str,
    password: str,
    result: dict[str, Any],
) -> threading.Thread:
    def run() -> None:
        try:
            with httpx.Client(
                base_url=base_url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=REQUEST_TIMEOUT_SECONDS,
            ) as client:
                response = client.post(
                    "/api/account/delete",
                    json={"current_password": password, "confirmation": "DELETE"},
                )
                result["status_code"] = response.status_code
                result["payload"] = response.json()
        except BaseException as exc:  # pragma: no cover - propagated to the main smoke thread
            result["error"] = exc

    thread = threading.Thread(target=run, name="account-delete-request", daemon=True)
    thread.start()
    return thread


def _assert_blocked_while_deleting(base_url: str, token: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=base_url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        dashboard = client.get("/api/dashboard")
        _assert_status(dashboard, 423, "second-process dashboard during deletion")

        blocked_write = client.post(
            "/api/foods",
            json={
                "canonical_name": "삭제 중에는 생성되면 안 되는 식품",
                "quantity": 1,
                "unit": "개",
                "storage_type": "ambient",
            },
        )
        _assert_status(blocked_write, 423, "second-process write during deletion")

        recovery = client.get("/api/auth/me")
        _assert_status(recovery, 200, "deletion recovery auth/me")
        recovery_payload = _json_object(recovery, "deletion recovery auth/me")
        if recovery_payload.get("account_status") != "deleting":
            raise SmokeFailure("deletion recovery auth/me did not expose deleting status")


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    auth_secret = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if not auth_secret:
        print("RESCUE_MEAL_AUTH_SECRET must be set for the authenticated smoke.")
        return 1

    port_a = _port_from_env("RESCUE_MEAL_ACCOUNT_DELETION_PORT_A", DEFAULT_PORT_A)
    port_b = _port_from_env("RESCUE_MEAL_ACCOUNT_DELETION_PORT_B", DEFAULT_PORT_B)
    if port_a == port_b:
        print("Account deletion smoke ports must be different.")
        return 1

    processes: list[subprocess.Popen[bytes]] = []
    lock_connection = None
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-account-deletion-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            with log_a_path.open("ab") as log_a, log_b_path.open("ab") as log_b:
                process_a = _start_process(port_a, log_a)
                process_b = _start_process(port_b, log_b)
                processes.extend((process_a, process_b))
                base_url_a = _base_url(port_a)
                base_url_b = _base_url(port_b)
                _wait_ready(base_url_a, process_a, "account-deletion api-a")
                _wait_ready(base_url_b, process_b, "account-deletion api-b")

                email, password, token, account_id, workspace_id = _register_account(base_url_a)
                _create_food(base_url_a, token)
                lock_connection = _lock_workspace_revision(database_url, workspace_id)

                deletion_result: dict[str, Any] = {}
                deletion_thread = _delete_in_background(base_url_a, token, password, deletion_result)
                _wait_for_account_status(database_url, account_id, "deleting")

                if not deletion_thread.is_alive():
                    raise SmokeFailure("delete request completed before the shared workspace lock was observed")
                _assert_blocked_while_deleting(base_url_b, token)
                with httpx.Client(base_url=base_url_b, timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    login = client.post("/api/auth/login", json={"email": email, "password": password})
                    _assert_status(login, 401, "account login during deletion")

                before_release = _readback_counts(database_url, account_id, workspace_id)
                if before_release["account_rows"] != 1 or before_release["compatibility_food_rows"] != 1 or before_release["normalized_lot_rows"] != 1:
                    raise SmokeFailure(f"deletion fence readback lost data before purge release: {before_release}")

                lock_connection.rollback()
                lock_connection.close()
                lock_connection = None
                deletion_thread.join(timeout=REQUEST_TIMEOUT_SECONDS + 5)
                if deletion_thread.is_alive():
                    raise SmokeFailure("delete request did not finish after the workspace lock was released")
                if "error" in deletion_result:
                    raise SmokeFailure("delete request raised an unexpected exception") from deletion_result["error"]
                if deletion_result.get("status_code") != 200:
                    raise SmokeFailure(f"delete request returned HTTP {deletion_result.get('status_code')}")
                if not isinstance(deletion_result.get("payload"), dict) or deletion_result["payload"].get("status") != "deleted":
                    raise SmokeFailure("delete request did not return the deleted response contract")

                with httpx.Client(base_url=base_url_b, headers={"Authorization": f"Bearer {token}"}, timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    post_delete = client.get("/api/dashboard")
                    _assert_status(post_delete, 401, "second-process old token after deletion")

                after_delete = _readback_counts(database_url, account_id, workspace_id)
                if any(after_delete.values()):
                    raise SmokeFailure(f"account/workspace rows remained after deletion: {after_delete}")

                print(
                    "PostgreSQL account deletion smoke passed: "
                    "process-a fence=deleting process-b dashboard/write=423 "
                    "recovery-auth-me=200 login=401 purge-release=200 "
                    "post-delete-old-token=401 rows=0."
                )
                return 0
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError, ValueError) as exc:
        print(f"PostgreSQL account deletion smoke failed: {type(exc).__name__}: {exc}")
        return 1
    finally:
        if lock_connection is not None:
            try:
                lock_connection.rollback()
            finally:
                lock_connection.close()
        for process in processes:
            _stop_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
