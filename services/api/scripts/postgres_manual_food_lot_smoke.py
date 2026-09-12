"""Verify manual lot creation and correction across two API processes.

Manual entry is intentionally not an idempotent purchase command: the same
product name may represent a new package and must create a new lot. A label or
GS1 correction, however, targets one existing lot. This smoke verifies that two
processes racing on the same target cannot append duplicate date history or
change the target quantity, and that a revision conflict can be retried safely.
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


DEFAULT_PORT_A = 18187
DEFAULT_PORT_B = 18188
STARTUP_TIMEOUT_SECONDS = 120.0
TARGET_NAME = "manual-food-lot-race"
TARGET_DATE = "2026-09-30"
CREATE_IDEMPOTENCY_KEY = "manual-food-create-smoke-1"


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


def _create_guest_and_manual_lot(base_url: str) -> tuple[str, str, str]:
    payload = {
        "lot_action": "create",
        "canonical_name": TARGET_NAME,
        "quantity": 3,
        "unit": "팩",
        "storage_type": "refrigerated",
        "category": "신선식품",
        "note": "manual lot smoke",
    }
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = client.post("/api/auth/guest")
        _assert_status(response, 200, "manual-food guest creation")
        session = _json_object(response, "manual-food guest creation")
        token = session.get("access_token")
        workspace_id = session.get("workspace_id")
        if not isinstance(token, str) or not token or not isinstance(workspace_id, str) or not workspace_id:
            raise SmokeFailure("manual-food guest response did not contain session identifiers")

        response = client.post(
            "/api/foods",
            headers={"Authorization": f"Bearer {token}", "Idempotency-Key": CREATE_IDEMPOTENCY_KEY},
            json=payload,
        )
        _assert_status(response, 201, "manual-food lot creation")
        payload = _json_object(response, "manual-food lot creation")
        food_id = payload.get("id")
        if not isinstance(food_id, str) or not food_id:
            raise SmokeFailure("manual-food creation did not return a lot ID")
        if payload.get("quantity") != 3 or payload.get("unit") != "팩":
            raise SmokeFailure("manual-food creation returned an unexpected quantity")
    return token, workspace_id, food_id


def _replay_manual_lot_create(base_url: str, token: str, food_id: str) -> None:
    with httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": CREATE_IDEMPOTENCY_KEY},
        timeout=REQUEST_TIMEOUT_SECONDS,
    ) as client:
        response = client.post(
            "/api/foods",
            json={
                "lot_action": "create",
                "canonical_name": TARGET_NAME,
                "quantity": 3,
                "unit": "팩",
                "storage_type": "refrigerated",
                "category": "신선식품",
                "note": "manual lot smoke",
            },
        )
    _assert_status(response, 201, "manual-food cross-process replay")
    if response.headers.get("x-idempotency-replayed") != "true":
        raise SmokeFailure("manual-food cross-process replay did not expose replay header")
    payload = _json_object(response, "manual-food cross-process replay")
    if payload.get("id") != food_id:
        raise SmokeFailure("manual-food cross-process replay returned a different lot")


def _correction_payload(food_id: str) -> dict[str, Any]:
    return {
        "lot_action": "correct",
        "target_food_id": food_id,
        "canonical_name": TARGET_NAME,
        # This is deliberately different from the existing lot. The route
        # must preserve the existing 3팩 because this request is a correction.
        "quantity": 1,
        "unit": "개",
        "storage_type": "refrigerated",
        "category": "신선식품",
        "brand": "manual smoke label",
        "date_kind": "use_by",
        "date_value": TARGET_DATE,
        "date_source": "label_ocr",
        "date_source_detail": "manual smoke label",
        "user_confirmed": True,
    }


def _race_correction(
    base_urls: tuple[str, str],
    token: str,
    food_id: str,
) -> list[tuple[int, dict[str, Any]]]:
    payload = _correction_payload(food_id)

    def correct(base_url: str) -> tuple[int, dict[str, Any]]:
        with httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as client:
            response = client.post("/api/foods", json=payload)
        if response.status_code not in {201, 409}:
            raise SmokeFailure(f"manual-food correction race returned HTTP {response.status_code}")
        result = _json_object(response, "manual-food correction race")
        if response.status_code == 409 and result.get("code") != "workspace_revision_conflict":
            raise SmokeFailure(f"manual-food correction race returned an unexpected conflict: {result}")
        if response.status_code == 201 and result.get("id") != food_id:
            raise SmokeFailure("manual-food correction race returned a different lot")
        return response.status_code, result

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(correct, base_url) for base_url in base_urls]
        return [future.result(timeout=REQUEST_TIMEOUT_SECONDS + 10) for future in futures]


def _retry_correction(base_url: str, token: str, food_id: str) -> dict[str, Any]:
    with httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    ) as client:
        response = client.post("/api/foods", json=_correction_payload(food_id))
    _assert_status(response, 201, "manual-food correction retry")
    result = _json_object(response, "manual-food correction retry")
    if result.get("id") != food_id:
        raise SmokeFailure("manual-food correction retry returned a different lot")
    return result


def _readback(database_url: str, workspace_id: str, food_id: str) -> dict[str, Any]:
    connection = psycopg.connect(database_url)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    (SELECT count(*) FROM rescue_api_foods
                     WHERE workspace_id = %s AND id = %s),
                    (SELECT payload ->> 'quantity' FROM rescue_api_foods
                     WHERE workspace_id = %s AND id = %s),
                    (SELECT payload ->> 'unit' FROM rescue_api_foods
                     WHERE workspace_id = %s AND id = %s),
                    (SELECT jsonb_array_length(payload -> 'date_assertion_history')
                     FROM rescue_api_foods
                     WHERE workspace_id = %s AND id = %s),
                    (SELECT payload -> 'date_assertion' ->> 'value'
                     FROM rescue_api_foods
                     WHERE workspace_id = %s AND id = %s),
                    (SELECT count(*) FROM rescue_api_product_info_audit_events
                     WHERE workspace_id = %s AND food_id = %s),
                    (SELECT count(*) FROM rescue_inventory_lots
                     WHERE workspace_id = %s AND lot_id = %s),
                    (SELECT count(*) FROM rescue_inventory_date_assertions
                     WHERE workspace_id = %s AND lot_id = %s),
                    (SELECT count(*) FROM rescue_inventory_date_assertions
                     WHERE workspace_id = %s AND lot_id = %s AND is_current),
                    (SELECT count(*) FROM rescue_api_manual_food_operations
                     WHERE workspace_id = %s)
                """,
                (
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                    food_id,
                    workspace_id,
                ),
            )
            row = cursor.fetchone()
        if row is None:
            raise SmokeFailure("manual-food readback returned no row")
        return {
            "lots": int(row[0]),
            "quantity": float(row[1]) if row[1] is not None else None,
            "unit": row[2],
            "date_history": int(row[3]) if row[3] is not None else None,
            "date_value": row[4],
            "product_info_events": int(row[5]),
            "normalized_lots": int(row[6]),
            "normalized_date_assertions": int(row[7]),
            "normalized_current_date_assertions": int(row[8]),
            "manual_food_operations": int(row[9]),
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

    port_a = _port_from_env("RESCUE_MEAL_MANUAL_FOOD_PORT_A", DEFAULT_PORT_A)
    port_b = _port_from_env("RESCUE_MEAL_MANUAL_FOOD_PORT_B", DEFAULT_PORT_B)
    if port_a == port_b:
        print("Manual-food smoke ports must be different.")
        return 1

    processes: list[subprocess.Popen[bytes]] = []
    workspace_id = ""
    failure_log = ""
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-manual-food-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            try:
                with log_a_path.open("wb") as log_a, log_b_path.open("wb") as log_b:
                    process_a = _start_process(port_a, log_a)
                    process_b = _start_process(port_b, log_b)
                    processes.extend((process_a, process_b))
                    base_urls = (_base_url(port_a), _base_url(port_b))
                    _wait_ready(base_urls[0], process_a, "manual-food api-a")
                    _wait_ready(base_urls[1], process_b, "manual-food api-b")

                    token, workspace_id, food_id = _create_guest_and_manual_lot(base_urls[0])
                    _replay_manual_lot_create(base_urls[1], token, food_id)
                    _stop_process(process_b)
                    process_b = _start_process(port_b, log_b)
                    processes.append(process_b)
                    _wait_ready(base_urls[1], process_b, "manual-food api-b restart")
                    _replay_manual_lot_create(base_urls[1], token, food_id)
                    race_results = _race_correction(base_urls, token, food_id)
                    statuses = sorted(status for status, _ in race_results)
                    if statuses not in ([201, 201], [201, 409]):
                        raise SmokeFailure(f"manual-food correction race statuses were {statuses}")

                    retry_count = 0
                    for index, (status_code, _) in enumerate(race_results):
                        if status_code == 409:
                            _retry_correction(base_urls[index], token, food_id)
                            retry_count += 1

                    readback = _readback(database_url, workspace_id, food_id)
                    expected_readback = {
                        "lots": 1,
                        "quantity": 3.0,
                        "unit": "팩",
                        "date_history": 1,
                        "date_value": TARGET_DATE,
                        "product_info_events": 1,
                        "normalized_lots": 1,
                        "normalized_date_assertions": 2,
                        "normalized_current_date_assertions": 1,
                        "manual_food_operations": 1,
                    }
                    if readback != expected_readback:
                        raise SmokeFailure(f"manual-food readback expected one target/date history, got {readback}")

                    print(
                        "PostgreSQL manual-food lot smoke passed: "
                        f"initial=201 replay=201 restart_replay=201 race={statuses} retries={retry_count} lots=1 quantity=3팩 "
                        "date_history=1 normalized_date_assertions=2 current=1 operations=1."
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
        print(f"PostgreSQL manual-food lot smoke failed: {type(exc).__name__}: {exc}")
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
                print(f"PostgreSQL manual-food cleanup failed: {type(exc).__name__}: {exc}")
                exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
