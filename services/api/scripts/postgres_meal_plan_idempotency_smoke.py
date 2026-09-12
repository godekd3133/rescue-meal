"""Verify meal-plan save and completion converge across two API processes.

The client reuses the preview plan_id when saving and the saved plan ID when
recording completion. This smoke proves those identities are safe across
processes sharing one normalized PostgreSQL workspace: one save wins, the
other returns the same plan, and one completion consumes the allocated lots
while the competing completion returns already_completed.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import time
from typing import Any

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
    _json_object,
    _stop_process,
)


DEFAULT_PORT_A = 18185
DEFAULT_PORT_B = 18186
STARTUP_TIMEOUT_SECONDS = 120.0
INVENTORY_IDS = ["spinach-1", "tofu-1", "chicken-1"]


def _port_from_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        port = int(raw)
    except ValueError as exc:
        raise SmokeFailure(f"{name} must be an integer") from exc
    if not 1024 <= port <= 65535:
        raise SmokeFailure(f"{name} must be between 1024 and 65535")
    return port


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


def _create_guest_and_preview(base_url: str) -> tuple[str, str, dict[str, Any]]:
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = client.post("/api/auth/guest")
    _assert_status(response, 200, "meal-plan guest creation")
    session = _json_object(response, "meal-plan guest creation")
    token = session.get("access_token")
    workspace_id = session.get("workspace_id")
    if not isinstance(token, str) or not token or not isinstance(workspace_id, str) or not workspace_id:
        raise SmokeFailure("meal-plan guest response did not contain session identifiers")

    with httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    ) as client:
        response = client.post(
            "/api/meal-plans/preview",
            json={"inventory_ids": INVENTORY_IDS, "max_minutes": 30, "servings": 1},
        )
    _assert_status(response, 200, "meal-plan preview")
    preview = _json_object(response, "meal-plan preview")
    if (
        not isinstance(preview.get("id"), str)
        or not preview["id"]
        or not isinstance(preview.get("snapshot_hash"), str)
        or len(preview["snapshot_hash"]) != 64
        or preview.get("recipe_id") == "no-match"
    ):
        raise SmokeFailure("meal-plan preview did not contain a savable plan")
    return token, workspace_id, preview


def _race_save(
    base_urls: tuple[str, str],
    token: str,
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    def save(base_url: str) -> dict[str, Any]:
        with httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as client:
            response = client.post("/api/meal-plans", json=payload)
        _assert_status(response, 200, "same-plan meal-plan save race")
        result = _json_object(response, "same-plan meal-plan save race")
        if result.get("id") != payload["plan_id"] or result.get("snapshot_hash") != payload["snapshot_hash"]:
            raise SmokeFailure("meal-plan save race returned a different plan identity")
        return result

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(save, base_url) for base_url in base_urls]
        return [future.result(timeout=REQUEST_TIMEOUT_SECONDS + 10) for future in futures]


def _race_complete(
    base_urls: tuple[str, str],
    token: str,
    plan_id: str,
) -> list[dict[str, Any]]:
    def complete(base_url: str) -> dict[str, Any]:
        with httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as client:
            response = client.post(f"/api/meal-plans/{plan_id}/complete", json={})
        _assert_status(response, 200, "same-plan meal-plan completion race")
        result = _json_object(response, "same-plan meal-plan completion race")
        if result.get("plan_id") != plan_id:
            raise SmokeFailure("meal-plan completion race returned a different plan")
        return result

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(complete, base_url) for base_url in base_urls]
        return [future.result(timeout=REQUEST_TIMEOUT_SECONDS + 10) for future in futures]


def _readback(database_url: str, workspace_id: str, plan_id: str) -> dict[str, Any]:
    connection = psycopg.connect(database_url)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    (SELECT count(*) FROM rescue_api_meal_plans
                     WHERE workspace_id = %s AND id = %s),
                    (SELECT count(*) FROM rescue_api_meal_plan_events
                     WHERE workspace_id = %s
                       AND payload ->> 'plan_id' = %s
                       AND payload ->> 'event_type' = 'saved'),
                    (SELECT count(*) FROM rescue_api_meal_plan_events
                     WHERE workspace_id = %s
                       AND payload ->> 'plan_id' = %s
                       AND payload ->> 'event_type' = 'completed'),
                    (SELECT count(*) FROM rescue_api_storage_events
                     WHERE workspace_id = %s
                       AND payload ->> 'meal_plan_id' = %s
                       AND payload ->> 'event_type' = 'consumed'),
                    (SELECT count(*) FROM rescue_inventory_storage_events
                     WHERE workspace_id = %s
                       AND meal_plan_id = %s
                       AND event_type = 'consumed'),
                    (SELECT payload ->> 'completed_at' FROM rescue_api_meal_plans
                     WHERE workspace_id = %s AND id = %s)
                """,
                (
                    workspace_id,
                    plan_id,
                    workspace_id,
                    plan_id,
                    workspace_id,
                    plan_id,
                    workspace_id,
                    plan_id,
                    workspace_id,
                    plan_id,
                    workspace_id,
                    plan_id,
                ),
            )
            row = cursor.fetchone()
        if row is None:
            raise SmokeFailure("meal-plan readback returned no row")
        return {
            "plans": int(row[0]),
            "saved_events": int(row[1]),
            "completed_events": int(row[2]),
            "compatibility_consumed_events": int(row[3]),
            "normalized_consumed_events": int(row[4]),
            "completed_at": row[5],
        }
    finally:
        connection.close()


def _purge_workspace(database_url: str, workspace_id: str) -> None:
    os.environ["RESCUE_MEAL_INVENTORY_MODE"] = "normalized"
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


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    auth_secret = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if not auth_secret:
        print("RESCUE_MEAL_AUTH_SECRET must be set for the authenticated smoke.")
        return 1

    port_a = _port_from_env("RESCUE_MEAL_PLAN_IDEMPOTENCY_PORT_A", DEFAULT_PORT_A)
    port_b = _port_from_env("RESCUE_MEAL_PLAN_IDEMPOTENCY_PORT_B", DEFAULT_PORT_B)
    if port_a == port_b:
        print("Meal-plan idempotency smoke ports must be different.")
        return 1

    processes: list[subprocess.Popen[bytes]] = []
    workspace_id = ""
    failure_log = ""
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-plan-idempotency-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            try:
                with log_a_path.open("wb") as log_a, log_b_path.open("wb") as log_b:
                    process_a = _start_process(port_a, log_a)
                    process_b = _start_process(port_b, log_b)
                    processes.extend((process_a, process_b))
                    base_urls = (_base_url(port_a), _base_url(port_b))
                    _wait_ready(base_urls[0], process_a, "meal-plan api-a")
                    _wait_ready(base_urls[1], process_b, "meal-plan api-b")

                    token, workspace_id, preview = _create_guest_and_preview(base_urls[0])
                    save_payload = {
                        "inventory_ids": preview["inventory_ids"],
                        "max_minutes": preview["max_minutes"],
                        "servings": preview.get("servings", 1),
                        "plan_id": preview["id"],
                        "recipe_id": preview["recipe_id"],
                        "snapshot_hash": preview["snapshot_hash"],
                    }
                    save_results = _race_save(base_urls, token, save_payload)
                    saved_ids = {result["id"] for result in save_results}
                    saved_hashes = {result["snapshot_hash"] for result in save_results}
                    if saved_ids != {preview["id"]} or saved_hashes != {preview["snapshot_hash"]}:
                        raise SmokeFailure("meal-plan save race did not converge to the preview identity")

                    complete_results = _race_complete(base_urls, token, preview["id"])
                    completion_statuses = sorted(result.get("status") for result in complete_results)
                    if completion_statuses != ["already_completed", "completed"]:
                        raise SmokeFailure(
                            f"meal-plan completion race statuses were {completion_statuses}"
                        )
                    consumed_sets = {
                        tuple(sorted(result.get("consumed_food_ids", [])))
                        for result in complete_results
                    }
                    if consumed_sets != {("chicken-1", "spinach-1", "tofu-1")}:
                        raise SmokeFailure(f"meal-plan completion consumed ids were {consumed_sets}")

                    readback = _readback(database_url, workspace_id, preview["id"])
                    expected_readback = {
                        "plans": 1,
                        "saved_events": 1,
                        "completed_events": 1,
                        "compatibility_consumed_events": 3,
                        "normalized_consumed_events": 3,
                        "completed_at": readback["completed_at"],
                    }
                    if not readback["completed_at"] or readback != expected_readback:
                        raise SmokeFailure(f"meal-plan readback expected one save/complete, got {readback}")

                    print(
                        "PostgreSQL meal-plan idempotency smoke passed: "
                        "save=200 initial+replay completion=completed+already_completed "
                        "plans=1 saved_events=1 completed_events=1 "
                        "compatibility_consumed_events=3 normalized_consumed_events=3."
                    )
                    exit_code = 0
            except BaseException:
                failure_log = "\n".join(
                    path.read_text(errors="replace")[-4_000:]
                    for path in (log_a_path, log_b_path)
                    if path.exists()
                )
                raise
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError, ValueError) as exc:
        print(f"PostgreSQL meal-plan idempotency smoke failed: {type(exc).__name__}: {exc}")
        if failure_log:
            print("--- isolated API log tail ---")
            print(failure_log)
    finally:
        for process in processes:
            _stop_process(process)
        if workspace_id:
            try:
                _purge_workspace(database_url, workspace_id)
            except Exception as exc:  # pragma: no cover - disposable live DB cleanup
                print(f"PostgreSQL meal-plan idempotency cleanup failed: {type(exc).__name__}: {exc}")
                exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
