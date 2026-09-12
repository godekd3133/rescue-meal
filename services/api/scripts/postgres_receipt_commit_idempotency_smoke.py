"""Exercise receipt-commit idempotency through real API process restarts.

This smoke keeps the receipt commit path on the normalized PostgreSQL adapter,
commits through one API process, replays through a second process, verifies a
same-key payload conflict, then replays again through a restarted process. It
is intentionally separate from the in-process TestClient tests: the purpose is
to prove that the transaction result survives process-local memory boundaries.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Any
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
    _json_object,
    _port_from_env,
    _start_process,
    _stop_process,
    _wait_ready,
)


def _create_guest_and_receipt(base_url: str) -> tuple[str, str, str, str]:
    with httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        guest_response = client.post("/api/auth/guest")
        _assert_status(guest_response, 200, "guest workspace creation")
        guest = _json_object(guest_response, "guest workspace creation")
        token = guest.get("access_token")
        workspace_id = guest.get("workspace_id")
        if not isinstance(token, str) or not token or not isinstance(workspace_id, str) or not workspace_id:
            raise SmokeFailure("guest response did not contain an access token and workspace id")

    with _authenticated_client(base_url, token) as client:
        draft_response = client.post(
            "/api/receipts/drafts",
            json={
                "source_filename": "receipt-commit-idempotency-smoke.txt",
                "purchased_at": "2026-09-06T09:00:00+00:00",
                "lines": [{
                    "raw_name": "영수증 멱등성 두부",
                    "quantity": 1,
                    "unit": "모",
                    "barcode": "8801114167523",
                    "line_type": "product",
                    "canonical_name": "영수증 멱등성 두부",
                    "match_confidence": 0.92,
                    "match_source": "local_rule",
                }],
            },
        )
        _assert_status(draft_response, 201, "receipt draft creation")
        draft = _json_object(draft_response, "receipt draft creation")
        receipt_id = draft.get("id")
        lines = draft.get("lines")
        if not isinstance(receipt_id, str) or not receipt_id or not isinstance(lines, list) or len(lines) != 1:
            raise SmokeFailure("receipt draft response did not contain one receipt line")
        line_id = lines[0].get("id") if isinstance(lines[0], dict) else None
        if not isinstance(line_id, str) or not line_id:
            raise SmokeFailure("receipt draft response did not contain a line id")
    return token, workspace_id, receipt_id, line_id


def _commit(
    base_url: str,
    token: str,
    receipt_id: str,
    payload: dict[str, Any],
    key: str,
    expected_status: int,
    operation: str,
) -> dict[str, Any]:
    with _authenticated_client(base_url, token) as client:
        response = client.post(
            f"/api/receipts/{receipt_id}/commit",
            headers={"Idempotency-Key": key},
            json=payload,
        )
    _assert_status(response, expected_status, operation)
    return _json_object(response, operation)


def _readback(database_url: str, workspace_id: str, receipt_id: str) -> dict[str, Any]:
    connection = psycopg.connect(database_url)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM rescue_inventory_lots WHERE workspace_id = %s AND source_receipt_id = %s",
                (workspace_id, receipt_id),
            )
            lot_count = int(cursor.fetchone()[0])
            cursor.execute(
                """
                SELECT count(*), max(status), max(idempotency_key_digest),
                       max(request_payload_fingerprint), max(created_lot_ids::text)
                FROM rescue_inventory_commit_transactions
                WHERE workspace_id = %s AND receipt_id = %s
                """,
                (workspace_id, receipt_id),
            )
            transaction_count, status, key_digest, payload_fingerprint, created_lot_ids = cursor.fetchone()
            cursor.execute(
                """
                SELECT count(*)
                FROM pg_constraint
                WHERE conrelid = 'rescue_inventory_commit_transactions'::regclass
                  AND contype = 'u'
                  AND pg_get_constraintdef(oid) LIKE '%receipt_id%'
                """
            )
            unique_receipt_constraint_count = int(cursor.fetchone()[0])
        connection.rollback()
        return {
            "lot_count": lot_count,
            "transaction_count": int(transaction_count),
            "status": status,
            "key_digest": key_digest,
            "payload_fingerprint": payload_fingerprint,
            "created_lot_ids": created_lot_ids,
            "unique_receipt_constraint_count": unique_receipt_constraint_count,
        }
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

    port_a = _port_from_env("RESCUE_MEAL_RECEIPT_COMMIT_IDEMPOTENCY_PORT_A", 18161)
    port_b = _port_from_env("RESCUE_MEAL_RECEIPT_COMMIT_IDEMPOTENCY_PORT_B", 18162)
    if port_a == port_b or not (1024 <= port_a <= 65535 and 1024 <= port_b <= 65535):
        print("Receipt commit idempotency smoke ports must be different valid TCP ports.")
        return 1

    workspace_id = ""
    processes: list[subprocess.Popen[bytes]] = []
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix="rescue-meal-receipt-commit-idempotency-") as temp_dir:
            log_a_path = Path(temp_dir) / "api-a.log"
            log_b_path = Path(temp_dir) / "api-b.log"
            with log_a_path.open("ab") as log_a, log_b_path.open("ab") as log_b:
                process_a = _start_process(port_a, "receipt-commit-api-a", log_a)
                process_b = _start_process(port_b, "receipt-commit-api-b", log_b)
                processes.extend((process_a, process_b))
                base_url_a = _base_url(port_a)
                base_url_b = _base_url(port_b)
                _wait_ready(base_url_a, process_a, "receipt-commit api-a")
                _wait_ready(base_url_b, process_b, "receipt-commit api-b")

                token, workspace_id, receipt_id, line_id = _create_guest_and_receipt(base_url_a)
                payload = {
                    "confirmed_line_ids": [line_id],
                    "overrides": {
                        line_id: {
                            "canonical_name": "영수증 멱등성 두부",
                            "quantity": 1,
                            "unit": "모",
                            "storage_type": "refrigerated",
                            "match_source": "local_rule",
                        },
                    },
                }
                key = "receipt-commit-idempotency-live-v1"

                initial = _commit(base_url_a, token, receipt_id, payload, key, 200, "receipt commit initial")
                if initial.get("idempotency_replayed") is not False:
                    raise SmokeFailure("initial receipt commit was not marked as non-replay")
                transaction_id = initial.get("commit_transaction_id")
                created_lot_ids = initial.get("created_lot_ids")
                if not isinstance(transaction_id, str) or not transaction_id or not isinstance(created_lot_ids, list) or len(created_lot_ids) != 1:
                    raise SmokeFailure("initial receipt commit did not contain one transaction and lot")

                _stop_process(process_a)
                processes.remove(process_a)
                replay_b = _commit(base_url_b, token, receipt_id, payload, key, 200, "receipt commit api-b replay")
                if replay_b.get("idempotency_replayed") is not True or replay_b.get("commit_transaction_id") != transaction_id or replay_b.get("created_lot_ids") != created_lot_ids:
                    raise SmokeFailure("api-b replay did not return the original transaction and lot")

                conflict_payload = {
                    "confirmed_line_ids": [line_id],
                    "overrides": {line_id: {"canonical_name": "다른 상품", "quantity": 1, "unit": "모"}},
                }
                _commit(base_url_b, token, receipt_id, conflict_payload, key, 409, "receipt commit payload conflict")

                restarted_a = _start_process(port_a, "receipt-commit-api-a-restart", log_a)
                processes.append(restarted_a)
                _wait_ready(base_url_a, restarted_a, "receipt-commit restarted api-a")
                replay_a = _commit(base_url_a, token, receipt_id, payload, key, 200, "receipt commit restarted replay")
                if replay_a.get("idempotency_replayed") is not True or replay_a.get("commit_transaction_id") != transaction_id or replay_a.get("created_lot_ids") != created_lot_ids:
                    raise SmokeFailure("restarted api-a replay did not return the original transaction and lot")

                readback = _readback(database_url, workspace_id, receipt_id)
                if readback["lot_count"] != 1 or readback["transaction_count"] != 1 or readback["status"] != "committed":
                    raise SmokeFailure(f"receipt commit readback expected one committed lot/transaction, got {readback}")
                if readback["unique_receipt_constraint_count"] != 0:
                    raise SmokeFailure("normalized receipt transaction table still has a receipt unique constraint")
                if not isinstance(readback["key_digest"], str) or len(readback["key_digest"]) != 64:
                    raise SmokeFailure("receipt commit readback did not contain a SHA-256 key digest")
                if not isinstance(readback["payload_fingerprint"], str) or len(readback["payload_fingerprint"]) != 64:
                    raise SmokeFailure("receipt commit readback did not contain a SHA-256 payload fingerprint")
                try:
                    persisted_lot_ids = json.loads(readback["created_lot_ids"])
                except (TypeError, json.JSONDecodeError) as exc:
                    raise SmokeFailure("receipt commit readback created_lot_ids was invalid JSON") from exc
                if persisted_lot_ids != created_lot_ids:
                    raise SmokeFailure("receipt commit readback did not preserve created_lot_ids")

                print(
                    "PostgreSQL receipt commit idempotency smoke passed: "
                    f"workspace={workspace_id} initial=200 replay_b=200 replay_a_restart=200 "
                    f"conflict=409 transaction_count={readback['transaction_count']} lot_count={readback['lot_count']} "
                    f"unique_receipt_constraint_count={readback['unique_receipt_constraint_count']}."
                )
                exit_code = 0
    except (SmokeFailure, httpx.HTTPError, psycopg.Error, subprocess.SubprocessError, OSError, ValueError) as exc:
        print(f"PostgreSQL receipt commit idempotency smoke failed: {type(exc).__name__}: {exc}")
    finally:
        for process in processes:
            _stop_process(process)
        if workspace_id:
            try:
                _purge_workspace(database_url, workspace_id)
            except Exception as exc:  # pragma: no cover - disposable live DB cleanup
                print(f"PostgreSQL receipt commit idempotency smoke cleanup failed: {type(exc).__name__}")
                exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
