"""PostgreSQL normalized inventory adapter.

The compatibility API still exposes the existing response models, while this
adapter gives the inventory entities a workspace-scoped relational read/write
path when ``RESCUE_MEAL_INVENTORY_MODE=normalized``. It intentionally receives
a DB cursor from ``PostgresStore`` so one store flush can dual-write its
compatibility projection and normalized inventory in one database transaction.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
import json
from typing import Any


@dataclass(frozen=True)
class NormalizedInventoryState:
    foods: dict[str, Any]
    receipts: dict[str, Any]
    storage_events: list[Any]
    commit_transactions: dict[str, Any]
    committed_fingerprints: set[str]


class NormalizedInventoryAdapter:
    """Persist and reconstruct receipt/lot/date/event state relationally."""

    TABLES = (
        "rescue_inventory_commit_transactions",
        "rescue_inventory_storage_events",
        "rescue_inventory_priority_windows",
        "rescue_inventory_date_assertions",
        "rescue_inventory_lots",
        "rescue_inventory_receipt_lines",
        "rescue_inventory_receipts",
        "rescue_inventory_products",
    )

    def __init__(self, workspace_id: str) -> None:
        self.workspace_id = workspace_id

    def has_rows(self, connection) -> bool:
        try:
            with connection.cursor() as cursor:
                for table_name in self.TABLES:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE workspace_id = %s", (self.workspace_id,))
                    row = cursor.fetchone()
                    if row and row[0]:
                        return True
            return False
        finally:
            # psycopg starts a transaction for SELECTs. This adapter is used
            # for an independent read during workspace routing, so release
            # the snapshot even when the first non-empty table returns early.
            connection.rollback()

    def write_state(
        self,
        cursor,
        *,
        foods: dict[str, Any],
        receipts: dict[str, Any],
        storage_events: list[Any],
        commit_transactions: dict[str, Any],
    ) -> None:
        for table_name in self.TABLES:
            cursor.execute(f"DELETE FROM {table_name} WHERE workspace_id = %s", (self.workspace_id,))

        products: dict[str, tuple[str, str, str]] = {}
        for record in foods.values():
            response = record.response
            key = product_key(response.canonical_name)
            products.setdefault(key, (response.canonical_name, response.category, response.unit))
        for record in receipts.values():
            for line in record.response.lines:
                if line.canonical_name:
                    key = product_key(line.canonical_name)
                    products.setdefault(key, (line.canonical_name, "기타", line.unit))

        cursor.executemany(
            """
            INSERT INTO rescue_inventory_products
                (workspace_id, product_key, canonical_name, category, default_unit, active)
            VALUES (%s, %s, %s, %s, %s, true)
            """,
            [
                (self.workspace_id, key, canonical_name, category, unit)
                for key, (canonical_name, category, unit) in products.items()
            ],
        )

        cursor.executemany(
            """
            INSERT INTO rescue_inventory_receipts
                (workspace_id, receipt_id, fingerprint, source_filename, purchased_at,
                 template_id, template_confidence, merchant_name, status, stock_created)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    self.workspace_id,
                    record.response.id,
                    record.response.fingerprint,
                    record.response.source_filename,
                    record.response.purchased_at,
                    record.response.template_id,
                    record.response.template_confidence,
                    record.response.merchant_name,
                    record.response.status,
                    record.response.stock_created,
                )
                for record in receipts.values()
            ],
        )

        line_rows: list[tuple[Any, ...]] = []
        for record in receipts.values():
            for index, line in enumerate(record.response.lines, start=1):
                line_rows.append(
                    (
                        self.workspace_id,
                        record.response.id,
                        line.id,
                        _line_number(line.id, index),
                        line.raw_name,
                        line.barcode,
                        line.canonical_name,
                        line.quantity,
                        line.unit,
                        line.unit_price,
                        line.total_price,
                        line.line_type,
                        line.match_confidence,
                        line.match_source,
                        _jsonb([candidate.model_dump(mode="json") for candidate in line.match_candidates]),
                        line.review_status,
                        line.review_reason,
                        line.storage_suggestion,
                        _jsonb(line.source_observation_ids),
                    )
                )
        cursor.executemany(
            """
            INSERT INTO rescue_inventory_receipt_lines
                (workspace_id, receipt_id, line_id, line_number, raw_name, barcode, canonical_name,
                 quantity, unit, unit_price, total_price, line_type, match_confidence,
                 match_source, match_candidates, review_status, review_reason, storage_suggestion,
                 source_observation_ids)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            line_rows,
        )

        cursor.executemany(
            """
            INSERT INTO rescue_inventory_lots
                (workspace_id, lot_id, product_key, parent_lot_id, source_receipt_id,
                 source_receipt_line_id, quantity, unit, storage_type, storage_location_id, opened, opened_at, priority,
                 category, display_name, brand, image_path, note, purchased_at,
                 barcode, barcode_lot, product_provenance)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    self.workspace_id,
                    response.id,
                    product_key(response.canonical_name),
                    response.parent_lot_id,
                    response.source_receipt_id,
                    response.source_receipt_line_id,
                    response.quantity,
                    response.unit,
                    response.storage_type,
                    response.storage_location_id,
                    response.opened,
                    response.opened_at,
                    response.priority,
                    response.category,
                    response.display_name,
                    response.brand,
                    response.image_path,
                    response.note,
                    response.purchased_at or record.purchased_at,
                    response.barcode,
                    response.barcode_lot,
                    _jsonb(response.product_provenance.model_dump(mode="json")) if response.product_provenance else None,
                )
                for record in foods.values()
                for response in (record.response,)
            ],
        )

        assertion_rows: list[tuple[Any, ...]] = []
        window_rows: list[tuple[Any, ...]] = []
        for record in foods.values():
            response = record.response
            for sequence, assertion in enumerate(response.date_assertion_history):
                assertion_rows.append(
                    _date_assertion_row(
                        self.workspace_id,
                        response.id,
                        f"{response.id}:history:{sequence}",
                        sequence,
                        False,
                        assertion,
                    )
                )
            assertion_rows.append(
                _date_assertion_row(
                    self.workspace_id,
                    response.id,
                    f"{response.id}:current",
                    len(response.date_assertion_history),
                    True,
                    response.date_assertion,
                )
            )
            if response.estimated_use_first_window is not None:
                window = response.estimated_use_first_window
                trace = window.inference_trace
                window_rows.append(
                    (
                        self.workspace_id,
                        response.id,
                        window.start_date,
                        window.end_date,
                        window.basis,
                        window.confidence,
                        window.safety_disclaimer,
                        trace.provider if trace else None,
                        trace.provider_version if trace else None,
                        trace.rule_id if trace else None,
                        _jsonb(trace.evidence_refs if trace else []),
                        _jsonb(trace.reasoning if trace else []),
                        trace.input_sha256 if trace else None,
                    )
                )
        cursor.executemany(
            """
            INSERT INTO rescue_inventory_date_assertions
                (workspace_id, assertion_id, lot_id, sequence, is_current, kind, date_value,
                 display_label, source, source_detail, confidence, user_confirmed,
                 applicable_storage_type, storage_condition_text)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            assertion_rows,
        )
        cursor.executemany(
            """
            INSERT INTO rescue_inventory_priority_windows
                (workspace_id, lot_id, start_date, end_date, basis, confidence, safety_disclaimer,
                 inference_provider, inference_provider_version, inference_rule_id,
                 inference_evidence_refs, inference_reasoning, inference_input_sha256)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            window_rows,
        )

        cursor.executemany(
            """
            INSERT INTO rescue_inventory_storage_events
                (workspace_id, event_id, food_id, event_type, from_storage_type,
                 from_storage_location_id, to_storage_type, to_storage_location_id,
                 quantity, occurred_at, source, created_child_food_id,
                 meal_plan_id, grocy_sync_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    self.workspace_id,
                    event.id,
                    event.food_id,
                    event.event_type,
                    event.from_storage_type,
                    event.from_storage_location_id,
                    event.to_storage_type,
                    event.to_storage_location_id,
                    event.quantity,
                    event.occurred_at,
                    event.source,
                    event.created_child_food_id,
                    event.meal_plan_id,
                    event.grocy_sync_status,
                )
                for event in storage_events
            ],
        )

        cursor.executemany(
            """
            INSERT INTO rescue_inventory_commit_transactions
                (workspace_id, transaction_id, receipt_id, fingerprint, status, error_code,
                 grocy_sync_status, idempotency_key_digest, request_payload_fingerprint,
                 created_lot_ids, skipped_line_ids)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    self.workspace_id,
                    transaction.id,
                    transaction.receipt_id,
                    transaction.fingerprint,
                    transaction.status,
                    transaction.error_code,
                    transaction.grocy_sync_status,
                    transaction.idempotency_key_digest,
                    transaction.request_payload_fingerprint,
                    _jsonb(transaction.created_lot_ids),
                    _jsonb(transaction.skipped_line_ids),
                )
                for transaction in commit_transactions.values()
            ],
        )

    def load_state(self, cursor) -> NormalizedInventoryState:
        from .main import (
            CommitTransactionRecord,
            DateAssertion,
            DateWindow,
            FoodResponse,
            ProductProvenance,
            ReceiptLineDraft,
            ReceiptDraftResponse,
            StorageEventResponse,
            _FoodRecord,
            _ReceiptRecord,
        )

        cursor.execute(
            """
            SELECT product_key, canonical_name
            FROM rescue_inventory_products
            WHERE workspace_id = %s
            """,
            (self.workspace_id,),
        )
        product_names = {row[0]: row[1] for row in cursor.fetchall()}

        cursor.execute(
            """
            SELECT lot_id, product_key, parent_lot_id, source_receipt_id, source_receipt_line_id,
                   quantity, unit, storage_type, storage_location_id, opened, opened_at, priority, category, display_name,
                   brand, image_path, note, purchased_at, barcode, barcode_lot, product_provenance
            FROM rescue_inventory_lots
            WHERE workspace_id = %s
            """,
            (self.workspace_id,),
        )
        lot_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT assertion_id, lot_id, sequence, is_current, kind, date_value, display_label,
                   source, source_detail, confidence, user_confirmed,
                   applicable_storage_type, storage_condition_text
            FROM rescue_inventory_date_assertions
            WHERE workspace_id = %s
            ORDER BY lot_id, sequence
            """,
            (self.workspace_id,),
        )
        assertions: dict[str, list[Any]] = defaultdict(list)
        current_assertions: dict[str, Any] = {}
        for row in cursor.fetchall():
            assertion = DateAssertion(
                kind=row[4],
                value=_as_date(row[5]),
                display_label=row[6],
                source=row[7],
                source_detail=row[8],
                confidence=float(row[9]),
                user_confirmed=bool(row[10]),
                applicable_storage_type=row[11] if len(row) > 11 else None,
                storage_condition_text=row[12] if len(row) > 12 else None,
            )
            if row[3]:
                current_assertions[row[1]] = assertion
            else:
                assertions[row[1]].append(assertion)

        cursor.execute(
            """
            SELECT lot_id, start_date, end_date, basis, confidence, safety_disclaimer,
                   inference_provider, inference_provider_version, inference_rule_id,
                   inference_evidence_refs, inference_reasoning, inference_input_sha256
            FROM rescue_inventory_priority_windows
            WHERE workspace_id = %s
            """,
            (self.workspace_id,),
        )
        windows = {
            row[0]: _date_window_from_row(row)
            for row in cursor.fetchall()
        }

        foods: dict[str, Any] = {}
        for row in lot_rows:
            lot_id = row[0]
            current = current_assertions.get(lot_id)
            if current is None:
                current = DateAssertion(
                    kind="unknown",
                    value=None,
                    display_label="확인 필요",
                    source="unknown",
                    source_detail="normalized inventory fallback",
                    confidence=0,
                )
            purchased_at = _as_datetime(row[17])
            product_provenance_payload = row[20] if len(row) > 20 else None
            if isinstance(product_provenance_payload, (str, bytes, bytearray)):
                product_provenance_payload = json.loads(product_provenance_payload)
            response = FoodResponse(
                id=lot_id,
                parent_lot_id=row[2],
                source_receipt_id=row[3],
                source_receipt_line_id=row[4],
                purchased_at=purchased_at,
                product_provenance=ProductProvenance.model_validate(product_provenance_payload) if product_provenance_payload else None,
                canonical_name=product_names.get(row[1], _canonical_from_product_key(row[1], lot_id)),
                display_name=row[13],
                quantity=float(row[5]),
                unit=row[6],
                storage_type=row[7],
                storage_location_id=row[8] if len(row) > 8 else None,
                opened=bool(row[9]),
                opened_at=_as_datetime(row[10]),
                date_assertion=current,
                date_assertion_history=assertions.get(lot_id, []),
                estimated_use_first_window=windows.get(lot_id),
                priority=int(row[11]),
                category=row[12],
                image_path=row[15],
                note=row[16],
                brand=row[14],
                barcode=row[18] if len(row) > 18 else None,
                barcode_lot=row[19] if len(row) > 19 else None,
            )
            foods[lot_id] = _FoodRecord(response, purchased_at=purchased_at)

        cursor.execute(
            """
            SELECT receipt_id, fingerprint, source_filename, purchased_at,
                   template_id, template_confidence, merchant_name, status, stock_created
            FROM rescue_inventory_receipts
            WHERE workspace_id = %s
            """,
            (self.workspace_id,),
        )
        receipt_rows = cursor.fetchall()
        cursor.execute(
            """
            SELECT receipt_id, line_id, line_number, raw_name, barcode, canonical_name, quantity, unit,
                   unit_price, total_price, line_type, match_confidence, match_source,
                   match_candidates, review_status, review_reason, storage_suggestion,
                   source_observation_ids
            FROM rescue_inventory_receipt_lines
            WHERE workspace_id = %s
            ORDER BY receipt_id, line_number
            """,
            (self.workspace_id,),
        )
        lines_by_receipt: dict[str, list[Any]] = defaultdict(list)
        for row in cursor.fetchall():
            # A short compatibility branch keeps an already-created test or
            # legacy read model readable while migration 018 rolls out the
            # receipt-line barcode column.
            has_barcode_column = len(row) >= 18
            barcode_index = 4 if has_barcode_column else None
            canonical_name_index = 5 if has_barcode_column else 4
            quantity_index = 6 if has_barcode_column else 5
            unit_index = 7 if has_barcode_column else 6
            unit_price_index = 8 if has_barcode_column else 7
            total_price_index = 9 if has_barcode_column else 8
            line_type_index = 10 if has_barcode_column else 9
            confidence_index = 11 if has_barcode_column else 10
            match_source_index = 12 if has_barcode_column else 11
            match_candidates_index = 13 if has_barcode_column else 12
            review_status_index = 14 if has_barcode_column else 13
            review_reason_index = 15 if has_barcode_column else 14
            storage_suggestion_index = 16 if has_barcode_column else 15
            source_observation_ids_index = 17 if has_barcode_column else 16 if len(row) > 16 else None
            lines_by_receipt[row[0]].append(
                ReceiptLineDraft(
                    id=row[1],
                    raw_name=row[3],
                    barcode=row[barcode_index] if barcode_index is not None else None,
                    canonical_name=row[canonical_name_index],
                    quantity=float(row[quantity_index]),
                    unit=row[unit_index],
                    unit_price=row[unit_price_index],
                    total_price=row[total_price_index],
                    line_type=row[line_type_index],
                    match_confidence=float(row[confidence_index]),
                    match_source=row[match_source_index] if len(row) > match_source_index else "parser",
                    match_candidates=row[match_candidates_index] if len(row) > match_candidates_index and row[match_candidates_index] else [],
                    review_status=row[review_status_index],
                    review_reason=row[review_reason_index],
                    storage_suggestion=row[storage_suggestion_index],
                    source_observation_ids=(row[source_observation_ids_index] or []) if source_observation_ids_index is not None else [],
                )
            )
        receipts: dict[str, Any] = {}
        committed_fingerprints: set[str] = set()
        for row in receipt_rows:
            receipt = ReceiptDraftResponse(
                id=row[0],
                fingerprint=row[1],
                source_filename=row[2],
                purchased_at=_as_datetime(row[3]),
                template_id=row[4],
                template_confidence=float(row[5]),
                merchant_name=row[6],
                status=row[7],
                stock_created=bool(row[8]),
                lines=lines_by_receipt.get(row[0], []),
            )
            receipts[row[0]] = _ReceiptRecord(receipt)
            receipts[row[0]].committed = receipt.status == "committed"
            if receipts[row[0]].committed:
                committed_fingerprints.add(receipt.fingerprint)

        cursor.execute(
            """
            SELECT event_id, food_id, event_type, from_storage_type, from_storage_location_id,
                   to_storage_type, to_storage_location_id, quantity, occurred_at, source,
                   created_child_food_id, meal_plan_id, grocy_sync_status
            FROM rescue_inventory_storage_events
            WHERE workspace_id = %s
            ORDER BY occurred_at, event_id
            """,
            (self.workspace_id,),
        )
        storage_events = [
            StorageEventResponse(
                id=row[0],
                food_id=row[1],
                event_type=row[2],
                from_storage_type=row[3],
                from_storage_location_id=row[4],
                to_storage_type=row[5],
                to_storage_location_id=row[6],
                quantity=float(row[7]) if row[7] is not None else None,
                occurred_at=_as_datetime(row[8]),
                source=row[9],
                created_child_food_id=row[10],
                meal_plan_id=row[11],
                grocy_sync_status=row[12],
            )
            for row in cursor.fetchall()
        ]

        cursor.execute(
            """
            SELECT transaction_id, receipt_id, fingerprint, status, error_code, grocy_sync_status,
                   idempotency_key_digest, request_payload_fingerprint,
                   created_lot_ids, skipped_line_ids
            FROM rescue_inventory_commit_transactions
            WHERE workspace_id = %s
            """,
            (self.workspace_id,),
        )
        commit_transactions = {
            row[0]: CommitTransactionRecord(
                id=row[0],
                receipt_id=row[1],
                fingerprint=row[2],
                status=row[3],
                error_code=row[4],
                grocy_sync_status=row[5],
                idempotency_key_digest=row[6],
                request_payload_fingerprint=row[7],
                created_lot_ids=_json_list(row[8]),
                skipped_line_ids=_json_list(row[9]),
            )
            for row in cursor.fetchall()
        }
        return NormalizedInventoryState(
            foods=foods,
            receipts=receipts,
            storage_events=storage_events,
            commit_transactions=commit_transactions,
            committed_fingerprints=committed_fingerprints,
        )


def product_key(canonical_name: str) -> str:
    return " ".join(canonical_name.strip().casefold().split())


def _line_number(line_id: str, fallback: int) -> int:
    suffix = line_id.rsplit("-", 1)[-1]
    return int(suffix) if suffix.isdigit() else fallback


def _date_assertion_row(workspace_id: str, lot_id: str, assertion_id: str, sequence: int, is_current: bool, assertion: Any) -> tuple[Any, ...]:
    return (
        workspace_id,
        assertion_id,
        lot_id,
        sequence,
        is_current,
        assertion.kind,
        assertion.value,
        assertion.display_label,
        assertion.source,
        assertion.source_detail,
        assertion.confidence,
        assertion.user_confirmed,
        assertion.applicable_storage_type,
        assertion.storage_condition_text,
    )


def _as_date(value: Any) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _as_datetime(value: Any) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _jsonb(value: Any) -> Any:
    """Wrap JSON values for psycopg while keeping fake-cursor tests readable."""

    try:
        from psycopg.types.json import Jsonb
    except ImportError:  # pragma: no cover - psycopg is a runtime dependency
        return value
    return Jsonb(value)


def _json_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    return []


def _date_window_from_row(row: tuple[Any, ...]) -> Any:
    from .main import DateWindow, InferenceTrace

    trace = None
    if len(row) > 11 and row[6] and row[7] and row[11]:
        trace = InferenceTrace(
            provider=row[6],
            provider_version=row[7],
            rule_id=row[8],
            evidence_refs=_json_list(row[9]),
            reasoning=_json_list(row[10]),
            input_sha256=row[11],
        )
    return DateWindow(
        start_date=_as_date(row[1]),
        end_date=_as_date(row[2]),
        basis=row[3],
        confidence=float(row[4]),
        safety_disclaimer=row[5],
        inference_trace=trace,
    )


def _canonical_from_product_key(value: str, lot_id: str) -> str:
    """Return a safe fallback when a legacy database lacks catalog text.

    Normalized writes always store the display name separately. This fallback
    keeps reconstruction explicit rather than inventing a product identity.
    """

    del lot_id
    return value
