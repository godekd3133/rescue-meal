"""Verify direct PostgreSQL owner connections recover after a server-side drop.

The API operation pool already owns workspace checkouts.  This smoke targets
the other connection owners: the base workspace store and the auth repository.
It starts one isolated API process with a unique PostgreSQL
``application_name``, terminates only that process's database backends, and
then verifies that safe reads recover and a later write still persists.

The smoke never retries the write that is used after recovery.  Only
idempotent/read requests are polled while the dead connections are being
replaced.
"""

from __future__ import annotations

from pathlib import Path
from contextlib import contextmanager
import os
import subprocess
import sys
import tempfile
import time
from typing import Any, Iterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4

import httpx
import psycopg

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from postgres_account_deletion_smoke import (  # noqa: E402
    REQUEST_TIMEOUT_SECONDS,
    SmokeFailure,
    _assert_status,
    _base_url,
    _create_food,
    _json_object,
    _register_account,
    _stop_process,
)


APPLICATION_NAME = "rescue-meal-connection-recovery"
INSPECTOR_APPLICATION_NAME = "rescue-meal-connection-recovery-inspector"
DEFAULT_PORT = 18191
WAIT_TIMEOUT_SECONDS = 20.0
STARTUP_TIMEOUT_SECONDS = 120.0


def _port_from_env() -> int:
    raw = os.getenv("RESCUE_MEAL_CONNECTION_RECOVERY_PORT", str(DEFAULT_PORT)).strip()
    try:
        port = int(raw)
    except ValueError as exc:
        raise SmokeFailure("RESCUE_MEAL_CONNECTION_RECOVERY_PORT must be an integer") from exc
    if not 1024 <= port <= 65535:
        raise SmokeFailure("RESCUE_MEAL_CONNECTION_RECOVERY_PORT must be between 1024 and 65535")
    return port


def _with_application_name(database_url: str, application_name: str) -> str:
    parts = urlsplit(database_url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "application_name"]
    query.append(("application_name", application_name))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _start_process(port: int, log_file, database_url: str) -> subprocess.Popen[bytes]:
    environment = os.environ.copy()
    environment["RESCUE_MEAL_DATABASE_URL"] = database_url
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
        # This smoke targets direct connection recovery. Disable the normal
        # lifespan solver warm-up so a local OneDrive/Apple-Silicon OR-Tools
        # cold import cannot mask the PostgreSQL assertion.
        "--lifespan",
        "off",
    ]
    return subprocess.Popen(
        command,
        cwd=SERVICE_ROOT,
        env=environment,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )


def _wait_ready(base_url: str, process: subprocess.Popen[bytes], label: str) -> None:
    """Allow a cold local Python import without weakening the readiness gate."""

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


@contextmanager
def _client(base_url: str, *, headers: dict[str, str] | None = None) -> Iterator[httpx.Client]:
    with httpx.Client(
        base_url=base_url,
        headers=headers or {},
        timeout=REQUEST_TIMEOUT_SECONDS,
    ) as client:
        yield client


def _wait_for_get(
    base_url: str,
    path: str,
    *,
    headers: dict[str, str],
    expected_status: int,
    label: str,
) -> dict[str, Any]:
    deadline = time.monotonic() + WAIT_TIMEOUT_SECONDS
    last_status: int | None = None
    with _client(base_url, headers=headers) as client:
        while time.monotonic() < deadline:
            try:
                response = client.get(path)
                last_status = response.status_code
                if response.status_code == expected_status:
                    return _json_object(response, label)
                if response.status_code in {401, 403, 404}:
                    raise SmokeFailure(f"{label} returned HTTP {response.status_code}")
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
    raise SmokeFailure(f"{label} did not recover; last HTTP status={last_status}")


def _terminate_isolated_backends(database_url: str) -> int:
    inspector_url = _with_application_name(database_url, INSPECTOR_APPLICATION_NAME)
    target_pids: list[int] = []
    with psycopg.connect(inspector_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pid
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND application_name = %s
                  AND pid <> pg_backend_pid()
                ORDER BY pid
                """,
                (APPLICATION_NAME,),
            )
            target_pids = [int(row[0]) for row in cursor.fetchall()]
        connection.commit()

    if not target_pids:
        raise SmokeFailure("isolated API process did not open a PostgreSQL backend")

    # Do not call pg_terminate_backend(pid) inside the pg_stat_activity
    # aggregate that discovers the targets. PostgreSQL can report an
    # administrator shutdown to that same statement even when the target
    # backend was terminated correctly. Discover first, then terminate each
    # verified PID from a separate inspector transaction.
    killer_url = _with_application_name(database_url, f"{INSPECTOR_APPLICATION_NAME}-killer")
    terminated = 0
    with psycopg.connect(killer_url) as connection:
        for pid in target_pids:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_terminate_backend(%s)", (pid,))
                row = cursor.fetchone()
            connection.commit()
            if row is not None and bool(row[0]):
                terminated += 1
    if terminated < 1:
        raise SmokeFailure("PostgreSQL did not terminate an isolated API backend")
    return terminated


def _cleanup_scoped_account(database_url: str, account_id: str, workspace_id: str) -> None:
    """Remove only the account/workspace created by this smoke after failures."""

    # Reuse the production workspace purge so newly added workspace tables
    # cannot silently escape test cleanup. Import after the API process stops
    # to avoid sharing application-level connection state with the smoke.
    from app.main import PostgresStore

    store = PostgresStore(
        database_url,
        workspace_id=workspace_id,
        seed=False,
        initialize_schema=False,
    )
    try:
        store.purge()
    finally:
        store.close()

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rescue_auth_accounts WHERE id = %s", (account_id,))
        connection.commit()


def _delete_account_once(base_url: str, token: str, password: str) -> None:
    with _client(base_url, headers={"Authorization": f"Bearer {token}"}) as client:
        response = client.post(
            "/api/account/delete",
            json={"current_password": password, "confirmation": "DELETE"},
        )
    _assert_status(response, 200, "connection recovery cleanup account deletion")


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    auth_secret = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if not auth_secret:
        print("RESCUE_MEAL_AUTH_SECRET must be set for the authenticated smoke.")
        return 1

    port = _port_from_env()
    isolated_database_url = _with_application_name(database_url, APPLICATION_NAME)
    base_url = _base_url(port)
    process: subprocess.Popen[bytes] | None = None
    account_token: str | None = None
    account_password: str | None = None
    account_id: str | None = None
    workspace_id: str | None = None
    cleanup_needed = False
    failure_log = ""
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-connection-recovery-") as temp_dir:
            log_path = Path(temp_dir) / "api.log"
            try:
                with log_path.open("wb") as log_file:
                    process = _start_process(port, log_file, isolated_database_url)
                    _wait_ready(base_url, process, "connection-recovery api")

                    account_email, account_password, account_token, account_id, workspace_id = _register_account(base_url)
                    cleanup_needed = True
                    food_id = _create_food(base_url, account_token)
                    headers = {"Authorization": f"Bearer {account_token}"}
                    before = _wait_for_get(
                        base_url,
                        "/api/auth/me",
                        headers=headers,
                        expected_status=200,
                        label="connection recovery pre-drop auth/me",
                    )
                    if before.get("workspace_id") != workspace_id or before.get("email") != account_email:
                        raise SmokeFailure("pre-drop auth/me returned the wrong account workspace")

                    terminated = _terminate_isolated_backends(database_url)

                    _wait_ready(base_url, process, "connection-recovery api after drop")
                    after_auth = _wait_for_get(
                        base_url,
                        "/api/auth/me",
                        headers=headers,
                        expected_status=200,
                        label="connection recovery auth/me",
                    )
                    if after_auth.get("workspace_id") != workspace_id or after_auth.get("email") != account_email:
                        raise SmokeFailure("post-drop auth/me did not recover the auth connection")

                    after_dashboard = _wait_for_get(
                        base_url,
                        "/api/dashboard",
                        headers=headers,
                        expected_status=200,
                        label="connection recovery dashboard",
                    )
                    inventory = after_dashboard.get("inventory")
                    if not isinstance(inventory, list) or not any(item.get("id") == food_id for item in inventory if isinstance(item, dict)):
                        raise SmokeFailure("post-drop dashboard did not recover the existing food lot")

                    # This is intentionally one write, after the operation pool
                    # has recovered. Do not poll/replay it: the smoke itself
                    # follows the same unknown-outcome rule as production code.
                    with _client(base_url, headers=headers) as client:
                        new_food_response = client.post(
                            "/api/foods",
                            json={
                                "canonical_name": "연결 복구 후 저장 식품",
                                "quantity": 1,
                                "unit": "개",
                                "storage_type": "refrigerated",
                                "category": "장애복구 테스트",
                            },
                        )
                    _assert_status(new_food_response, 201, "connection recovery post-drop write")
                    new_food = _json_object(new_food_response, "connection recovery post-drop write")
                    if new_food.get("canonical_name") != "연결 복구 후 저장 식품":
                        raise SmokeFailure("post-drop write returned an unexpected food")

                    _delete_account_once(base_url, account_token, account_password)
                    cleanup_needed = False
                    print(
                        "PostgreSQL direct connection recovery smoke passed: "
                        f"terminated_isolated_backends={terminated} auth/me=200 readiness=200 "
                        "existing_food_read=200 post_drop_write=201 account_cleanup=200."
                    )
                    exit_code = 0
            except BaseException:
                try:
                    failure_log = log_path.read_text(errors="replace")[-8_000:]
                except OSError:
                    failure_log = ""
                raise
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError, ValueError) as exc:
        print(f"PostgreSQL direct connection recovery smoke failed: {type(exc).__name__}: {exc}")
        if failure_log:
            print("--- isolated API log tail ---")
            print(failure_log)
    finally:
        if process is not None:
            _stop_process(process)
        if cleanup_needed and account_id and workspace_id:
            try:
                _cleanup_scoped_account(database_url, account_id, workspace_id)
                print("Scoped connection-recovery smoke data cleaned after failure.")
            except Exception as exc:  # pragma: no cover - cleanup failure is reported, not hidden
                print(f"Scoped connection-recovery cleanup failed: {type(exc).__name__}: {exc}")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
