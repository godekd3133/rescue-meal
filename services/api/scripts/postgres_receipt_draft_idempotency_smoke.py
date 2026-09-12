"""Verify duplicate receipt drafts converge across two PostgreSQL API processes.

The receipt commit already has a durable idempotency ledger. This smoke covers
the earlier draft boundary: two processes receive the same OCR-derived draft
at nearly the same time, one wins the workspace revision, and the other must
return the winner's pending draft instead of leaving a duplicate review item.
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


DEFAULT_PORT_A = 18181
DEFAULT_PORT_B = 18182
STARTUP_TIMEOUT_SECONDS = 120.0


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


def _create_guest(base_url: str) -> tuple[str, str]:
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = client.post("/api/auth/guest")
    _assert_status(response, 200, "receipt draft guest creation")
    payload = _json_object(response, "receipt draft guest creation")
    token = payload.get("access_token")
    workspace_id = payload.get("workspace_id")
    if not isinstance(token, str) or not token or not isinstance(workspace_id, str) or not workspace_id:
        raise SmokeFailure("receipt draft guest response did not contain session identifiers")
    return token, workspace_id


def _draft_payload() -> dict[str, Any]:
    return {
        "source_filename": "same-camera-filename.jpg",
        "purchased_at": "2026-09-07T09:00:00+00:00",
        "template_id": "grocery-generic-v1",
        "template_confidence": 0.81,
        "merchant_name": "draft-idempotency-mart",
        "lines": [{
            "raw_name": "영수증 멱등성 테스트 두부",
            "quantity": 1,
            "unit": "모",
            "total_price": 2980,
            "line_type": "product",
            "canonical_name": "영수증 멱등성 테스트 두부",
            "match_confidence": 0.91,
        }],
    }


def _race_draft(
    base_urls: tuple[str, str],
    token: str,
    payload: dict[str, Any],
) -> list[tuple[str, bool, str, str, float, str | None]]:
    def create(base_url: str) -> tuple[str, bool, str, str, float, str | None]:
        with httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as client:
            response = client.post("/api/receipts/drafts", json=payload)
        if response.status_code != 201:
            raise SmokeFailure(
                f"same-fingerprint receipt draft race at {base_url} returned "
                f"HTTP {response.status_code}: {response.text[:500]}"
            )
        draft = _json_object(response, "same-fingerprint receipt draft race")
        draft_id = draft.get("id")
        fingerprint = draft.get("fingerprint")
        template_id = draft.get("template_id")
        template_confidence = draft.get("template_confidence")
        merchant_name = draft.get("merchant_name")
        if not isinstance(draft_id, str) or not draft_id:
            raise SmokeFailure("receipt draft race response did not contain an id")
        if not isinstance(fingerprint, str) or not fingerprint:
            raise SmokeFailure("receipt draft race response did not contain a fingerprint")
        if not isinstance(template_id, str) or not isinstance(template_confidence, (int, float)):
            raise SmokeFailure("receipt draft race response lost normalized review metadata")
        if merchant_name != payload["merchant_name"]:
            raise SmokeFailure("receipt draft race response lost merchant metadata")
        return (
            draft_id,
            response.headers.get("x-idempotency-replayed") == "true",
            fingerprint,
            template_id,
            float(template_confidence),
            merchant_name,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(create, base_url) for base_url in base_urls]
        return [future.result(timeout=REQUEST_TIMEOUT_SECONDS + 10) for future in futures]


def _readback(database_url: str, workspace_id: str, fingerprint: str) -> dict[str, Any]:
    connection = psycopg.connect(database_url)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    (SELECT count(*) FROM rescue_api_receipts
                     WHERE workspace_id = %s AND payload ->> 'fingerprint' = %s),
                    (SELECT max(payload ->> 'template_id') FROM rescue_api_receipts
                     WHERE workspace_id = %s AND payload ->> 'fingerprint' = %s),
                    (SELECT max((payload ->> 'template_confidence')::numeric) FROM rescue_api_receipts
                     WHERE workspace_id = %s AND payload ->> 'fingerprint' = %s),
                    (SELECT max(payload ->> 'merchant_name') FROM rescue_api_receipts
                     WHERE workspace_id = %s AND payload ->> 'fingerprint' = %s),
                    (SELECT count(*) FROM rescue_inventory_receipts
                     WHERE workspace_id = %s AND fingerprint = %s),
                    (SELECT max(template_id) FROM rescue_inventory_receipts
                     WHERE workspace_id = %s AND fingerprint = %s),
                    (SELECT max(template_confidence) FROM rescue_inventory_receipts
                     WHERE workspace_id = %s AND fingerprint = %s),
                    (SELECT max(merchant_name) FROM rescue_inventory_receipts
                     WHERE workspace_id = %s AND fingerprint = %s)
                """,
                (
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                    workspace_id,
                    fingerprint,
                ),
            )
            row = cursor.fetchone()
        if row is None:
            raise SmokeFailure("receipt draft idempotency readback returned no row")
        return {
            "compatibility_receipts": int(row[0]),
            "compatibility_template_id": row[1],
            "compatibility_template_confidence": float(row[2]) if row[2] is not None else None,
            "compatibility_merchant_name": row[3],
            "normalized_receipts": int(row[4]),
            "normalized_template_id": row[5],
            "normalized_template_confidence": float(row[6]) if row[6] is not None else None,
            "normalized_merchant_name": row[7],
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

    port_a = _port_from_env("RESCUE_MEAL_RECEIPT_DRAFT_IDEMPOTENCY_PORT_A", DEFAULT_PORT_A)
    port_b = _port_from_env("RESCUE_MEAL_RECEIPT_DRAFT_IDEMPOTENCY_PORT_B", DEFAULT_PORT_B)
    if port_a == port_b:
        print("Receipt draft idempotency smoke ports must be different.")
        return 1

    processes: list[subprocess.Popen[bytes]] = []
    workspace_id = ""
    failure_log = ""
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-receipt-draft-idempotency-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            try:
                with log_a_path.open("wb") as log_a, log_b_path.open("wb") as log_b:
                    process_a = _start_process(port_a, log_a)
                    process_b = _start_process(port_b, log_b)
                    processes.extend((process_a, process_b))
                    base_urls = (_base_url(port_a), _base_url(port_b))
                    _wait_ready(base_urls[0], process_a, "receipt-draft api-a")
                    _wait_ready(base_urls[1], process_b, "receipt-draft api-b")

                    token, workspace_id = _create_guest(base_urls[0])
                    payload = _draft_payload()
                    outcomes = _race_draft(base_urls, token, payload)
                    draft_ids = {draft_id for draft_id, _, _, _, _, _ in outcomes}
                    replay_flags = sorted(replayed for _, replayed, _, _, _, _ in outcomes)
                    fingerprints = {fingerprint for _, _, fingerprint, _, _, _ in outcomes}
                    metadata = {
                        (template_id, template_confidence, merchant_name)
                        for _, _, _, template_id, template_confidence, merchant_name in outcomes
                    }
                    expected_metadata = {
                        (
                            payload["template_id"],
                            float(payload["template_confidence"]),
                            payload["merchant_name"],
                        )
                    }
                    if (
                        len(draft_ids) != 1
                        or replay_flags != [False, True]
                        or len(fingerprints) != 1
                        or metadata != expected_metadata
                    ):
                        raise SmokeFailure(
                            f"receipt draft race did not converge: ids={draft_ids} "
                            f"replay_flags={replay_flags} fingerprints={fingerprints} metadata={metadata}"
                        )
                    readback = _readback(database_url, workspace_id, next(iter(fingerprints)))
                    expected_readback = {
                        "compatibility_receipts": 1,
                        "compatibility_template_id": payload["template_id"],
                        "compatibility_template_confidence": float(payload["template_confidence"]),
                        "compatibility_merchant_name": payload["merchant_name"],
                        "normalized_receipts": 1,
                        "normalized_template_id": payload["template_id"],
                        "normalized_template_confidence": float(payload["template_confidence"]),
                        "normalized_merchant_name": payload["merchant_name"],
                    }
                    if readback != expected_readback:
                        raise SmokeFailure(f"receipt draft readback expected one receipt, got {readback}")

                    print(
                        "PostgreSQL receipt draft idempotency smoke passed: "
                        f"initial=201 replay=201 unique_draft_ids={len(draft_ids)} "
                        f"compatibility_receipts={readback['compatibility_receipts']} "
                        f"normalized_receipts={readback['normalized_receipts']} metadata_preserved=true."
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
        print(f"PostgreSQL receipt draft idempotency smoke failed: {type(exc).__name__}: {exc}")
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
                print(f"PostgreSQL receipt draft idempotency cleanup failed: {type(exc).__name__}: {exc}")
                exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
