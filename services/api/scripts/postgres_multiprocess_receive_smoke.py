"""Exercise shopping-list receive idempotency through two real API processes.

The endpoint keeps a compatibility projection in each process, so a unit test
with one in-memory store cannot prove the important production boundary: two
HTTP requests can arrive at different API processes while sharing one
PostgreSQL workspace. This smoke starts two single-worker Uvicorn processes,
warms the same workspace in both, races one ``Idempotency-Key``, then checks
that a consumed lot is never recreated after both processes restart. The
second race intentionally sends two different quantities with one key and
expects one commit plus one conflict. ``RESCUE_MEAL_MULTIPROCESS_RECEIVE_ROUNDS``
can repeat the independent same-payload race in one workspace for a bounded
stress run.
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
from typing import Any

import httpx


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT_A = 18101
DEFAULT_PORT_B = 18102
STARTUP_TIMEOUT_SECONDS = 45.0
REQUEST_TIMEOUT_SECONDS = 10.0


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


def _rounds_from_env() -> int:
    raw = os.getenv("RESCUE_MEAL_MULTIPROCESS_RECEIVE_ROUNDS", "1").strip()
    try:
        rounds = int(raw)
    except ValueError as exc:
        raise SmokeFailure("RESCUE_MEAL_MULTIPROCESS_RECEIVE_ROUNDS must be an integer") from exc
    if not 1 <= rounds <= 32:
        raise SmokeFailure("RESCUE_MEAL_MULTIPROCESS_RECEIVE_ROUNDS must be between 1 and 32")
    return rounds


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


def _start_process(port: int, label: str, log_file) -> subprocess.Popen[bytes]:
    environment = os.environ.copy()
    environment["RESCUE_MEAL_AUTH_REQUIRED"] = "true"
    environment["RESCUE_MEAL_INVENTORY_MODE"] = "normalized"
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


def _authenticated_client(base_url: str, token: str) -> httpx.Client:
    return httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )


def _create_guest_and_item(base_url: str) -> tuple[str, str, str]:
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        guest_response = client.post("/api/auth/guest")
        _assert_status(guest_response, 200, "guest workspace creation")
        guest = _json_object(guest_response, "guest workspace creation")
        token = guest.get("access_token")
        workspace_id = guest.get("workspace_id")
        if not isinstance(token, str) or not token or not isinstance(workspace_id, str) or not workspace_id:
            raise SmokeFailure("guest workspace response did not contain an access token and workspace id")

    item_id = _create_manual_item(base_url, token, "다중 프로세스 테스트 두부", 1)
    return token, workspace_id, item_id


def _create_manual_item(base_url: str, token: str, canonical_name: str, quantity: float) -> str:
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        item_response = client.post(
            "/api/shopping-list/manual",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "canonical_name": canonical_name,
                "quantity": quantity,
                "unit": "모",
            },
        )
        _assert_status(item_response, 200, "manual shopping item creation")
        item_payload = _json_object(item_response, "manual shopping item creation")
        items = item_payload.get("items")
        if not isinstance(items, list):
            raise SmokeFailure("manual shopping item response did not contain an item")
        created_item = next(
            (
                candidate
                for candidate in items
                if isinstance(candidate, dict) and candidate.get("canonical_name") == canonical_name
            ),
            None,
        )
        item_id = created_item.get("id") if isinstance(created_item, dict) else None
        if not isinstance(item_id, str) or not item_id:
            raise SmokeFailure("manual shopping item response did not contain an item id")
    return item_id


def _warm_workspace(base_urls: tuple[str, str], token: str, expected_count: int) -> None:
    def read_list(base_url: str) -> None:
        with _authenticated_client(base_url, token) as client:
            response = client.get("/api/shopping-list")
            _assert_status(response, 200, "shopping list warm-up")
            try:
                items = response.json()
            except ValueError as exc:
                raise SmokeFailure("shopping list warm-up returned invalid JSON") from exc
            if not isinstance(items, list) or len(items) != expected_count:
                raise SmokeFailure(f"shopping list warm-up did not observe {expected_count} items")

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(read_list, base_url) for base_url in base_urls]
        for future in futures:
            future.result(timeout=REQUEST_TIMEOUT_SECONDS + 5)


def _race_receive(
    base_urls: tuple[str, str],
    token: str,
    item_id: str,
    idempotency_key: str,
) -> tuple[str, str]:

    def receive(base_url: str) -> tuple[str, str]:
        with _authenticated_client(base_url, token) as client:
            response = client.post(
                f"/api/shopping-list/{item_id}/receive",
                headers={"Idempotency-Key": idempotency_key},
                json={"quantity": 1, "storage_type": "refrigerated"},
            )
            _assert_status(response, 201, "same-key multi-process receive")
            payload = _json_object(response, "same-key multi-process receive")
            lot = payload.get("inventory_lot")
            if not isinstance(lot, dict):
                raise SmokeFailure("same-key receive response did not contain an inventory lot")
            lot_id = lot.get("id")
            replayed = payload.get("idempotency_replayed")
            if not isinstance(lot_id, str) or not lot_id or not isinstance(replayed, bool):
                raise SmokeFailure("same-key receive response had an invalid replay contract")
            return lot_id, "replay" if replayed else "initial"

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(receive, base_url) for base_url in base_urls]
        outcomes = [future.result(timeout=REQUEST_TIMEOUT_SECONDS + 5) for future in futures]

    lot_ids = {lot_id for lot_id, _ in outcomes}
    outcome_kinds = sorted(kind for _, kind in outcomes)
    if len(lot_ids) != 1 or outcome_kinds != ["initial", "replay"]:
        raise SmokeFailure(f"same-key receive outcomes were {outcome_kinds}")
    return outcomes[0][0], idempotency_key


def _race_conflicting_receive(
    base_urls: tuple[str, str],
    token: str,
    item_id: str,
    idempotency_key: str,
) -> tuple[str, float, str]:
    requests = (
        (1, "refrigerated"),
        (2, "refrigerated"),
    )

    def receive(base_url: str, quantity: float, storage_type: str) -> tuple[str, str, float | None]:
        with _authenticated_client(base_url, token) as client:
            response = client.post(
                f"/api/shopping-list/{item_id}/receive",
                headers={"Idempotency-Key": idempotency_key},
                json={"quantity": quantity, "storage_type": storage_type},
            )
            if response.status_code == 409:
                return "conflict", "", None
            _assert_status(response, 201, "different-payload multi-process receive")
            payload = _json_object(response, "different-payload multi-process receive")
            lot = payload.get("inventory_lot")
            if not isinstance(lot, dict) or not isinstance(lot.get("id"), str):
                raise SmokeFailure("different-payload receive response did not contain an inventory lot")
            if payload.get("idempotency_replayed") is True:
                raise SmokeFailure(
                    "different-payload receive was incorrectly accepted as a replay "
                    f"for quantity={quantity}; response_quantity={payload.get('received_quantity')}"
                )
            received_quantity = lot.get("quantity")
            if not isinstance(received_quantity, (int, float)) or isinstance(received_quantity, bool):
                raise SmokeFailure("different-payload receive response did not contain a numeric lot quantity")
            return "initial", lot["id"], float(received_quantity)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(receive, base_url, quantity, storage_type)
            for base_url, (quantity, storage_type) in zip(base_urls, requests)
        ]
        outcomes = [future.result(timeout=REQUEST_TIMEOUT_SECONDS + 5) for future in futures]

    initial_outcomes = [outcome for outcome in outcomes if outcome[0] == "initial"]
    conflict_count = sum(1 for outcome in outcomes if outcome[0] == "conflict")
    if len(initial_outcomes) != 1 or conflict_count != 1:
        raise SmokeFailure(f"different-payload receive outcomes were {[outcome[0] for outcome in outcomes]}")
    _, lot_id, received_quantity = initial_outcomes[0]
    if not lot_id or received_quantity is None:
        raise SmokeFailure("different-payload receive winner did not contain a lot identity")
    return lot_id, received_quantity, idempotency_key


def _consume_lot(base_url: str, token: str, lot_id: str, quantity: float) -> None:
    with _authenticated_client(base_url, token) as client:
        response = client.post(
            f"/api/foods/{lot_id}/storage-events",
            json={"event_type": "consumed", "quantity": quantity},
        )
        _assert_status(response, 200, "received lot consumption")


def _assert_no_recreation(
    base_url: str,
    token: str,
    item_id: str,
    idempotency_key: str,
    quantity: float,
) -> None:
    with _authenticated_client(base_url, token) as client:
        response = client.post(
            f"/api/shopping-list/{item_id}/receive",
            headers={"Idempotency-Key": idempotency_key},
            json={"quantity": quantity, "storage_type": "refrigerated"},
        )
        _assert_status(response, 409, "post-restart consumed-lot replay")


def main() -> int:
    database_url = os.getenv("RESCUE_MEAL_DATABASE_URL", "").strip()
    auth_secret = os.getenv("RESCUE_MEAL_AUTH_SECRET", "").strip()
    if not database_url.lower().startswith(("postgresql://", "postgres://")):
        print("RESCUE_MEAL_DATABASE_URL must be a PostgreSQL DSN.")
        return 1
    if not auth_secret:
        print("RESCUE_MEAL_AUTH_SECRET must be set for the authenticated smoke.")
        return 1

    port_a = _port_from_env("RESCUE_MEAL_MULTIPROCESS_PORT_A", DEFAULT_PORT_A)
    port_b = _port_from_env("RESCUE_MEAL_MULTIPROCESS_PORT_B", DEFAULT_PORT_B)
    rounds = _rounds_from_env()
    if port_a == port_b:
        print("Multi-process smoke ports must be different.")
        return 1

    processes: list[subprocess.Popen[bytes]] = []
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-multiprocess-") as temp_dir:
            with ExitStack() as logs:
                log_a = logs.enter_context(open(Path(temp_dir) / "api-a.log", "wb"))
                log_b = logs.enter_context(open(Path(temp_dir) / "api-b.log", "wb"))
                process_a = _start_process(port_a, "api-a", log_a)
                process_b = _start_process(port_b, "api-b", log_b)
                processes.extend((process_a, process_b))

                base_urls = (_base_url(port_a), _base_url(port_b))
                _wait_ready(base_urls[0], process_a, "api-a")
                _wait_ready(base_urls[1], process_b, "api-b")
                token, workspace_id, item_id = _create_guest_and_item(base_urls[0])
                received_lots: list[tuple[str, str, str]] = []
                for round_number in range(1, rounds + 1):
                    if round_number > 1:
                        item_id = _create_manual_item(
                            base_urls[0],
                            token,
                            f"다중 프로세스 반복 입고 두부 {round_number}",
                            1,
                        )
                    _warm_workspace(base_urls, token, round_number)
                    round_lot_id, round_key = _race_receive(
                        base_urls,
                        token,
                        item_id,
                        f"multiprocess-receive-smoke-v{round_number}",
                    )
                    received_lots.append((item_id, round_lot_id, round_key))

                conflict_item_id = _create_manual_item(base_urls[0], token, "다중 프로세스 충돌 테스트 두부", 2)
                _warm_workspace(base_urls, token, rounds + 1)
                conflict_lot_id, conflict_quantity, conflict_key = _race_conflicting_receive(
                    base_urls,
                    token,
                    conflict_item_id,
                    "multiprocess-receive-conflict-v1",
                )
                for _received_item_id, received_lot_id, _received_key in received_lots:
                    _consume_lot(base_urls[0], token, received_lot_id, 1)
                _consume_lot(base_urls[0], token, conflict_lot_id, conflict_quantity)

                _stop_process(process_a)
                _stop_process(process_b)
                processes.clear()

                restart_process = _start_process(port_a, "api-restart", log_a)
                processes.append(restart_process)
                _wait_ready(base_urls[0], restart_process, "api-restart")
                for received_item_id, _received_lot_id, received_key in received_lots:
                    _assert_no_recreation(base_urls[0], token, received_item_id, received_key, 1)
                _assert_no_recreation(base_urls[0], token, conflict_item_id, conflict_key, conflict_quantity)

                print(
                    "PostgreSQL multi-process receive smoke passed: "
                    f"workspace={workspace_id} rounds={rounds} same_key=201+201 "
                    f"initial+replay conflicting_key=201+409 conflict_lot={conflict_lot_id} "
                    "post_consume_restart=409."
                )
                return 0
    except (SmokeFailure, httpx.HTTPError, subprocess.SubprocessError) as exc:
        print(f"PostgreSQL multi-process receive smoke failed: {exc}")
        return 1
    finally:
        for process in processes:
            _stop_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
