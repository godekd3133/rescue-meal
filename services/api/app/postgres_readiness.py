from __future__ import annotations

from collections.abc import Iterable
from contextlib import contextmanager
from typing import Literal


InventoryMode = Literal["projection", "normalized"]


MIGRATION_BASELINE_NAMES = (
    "001_initial_schema.sql",
    "002_inventory_authority.sql",
    "003_product_aliases.sql",
    "004_product_enrichment.sql",
    "005_gs1_date_source.sql",
    "006_multi_day_meal_plans.sql",
    "007_shopping_list.sql",
    "008_meal_preferences.sql",
    "009_inventory_search.sql",
    "010_receipt_review_locations.sql",
    "011_opened_at.sql",
    "012_product_provider_runtime.sql",
    "013_product_name_provider_runtime.sql",
    "014_product_provenance.sql",
    "015_product_provenance_audit.sql",
    "016_product_info_audit.sql",
    "017_date_storage_condition.sql",
    "018_receipt_line_barcode.sql",
    "019_shopping_receive_operations.sql",
    "020_receipt_commit_idempotency.sql",
    "021_account_deletion_fence.sql",
    "022_receipt_review_metadata.sql",
    "023_manual_food_idempotency.sql",
    "024_recipe_catalog_revision.sql",
    "025_storage_locations.sql",
)


class PostgresSchemaError(RuntimeError):
    """Raised when PostgreSQL cannot satisfy the active API schema contract."""


@contextmanager
def _read_cursor(connection):
    """Release psycopg's implicit read transaction on success or failure."""

    try:
        with connection.cursor() as cursor:
            yield cursor
    finally:
        connection.rollback()


_BASE_TABLES = (
    "rescue_api_foods",
    "rescue_api_receipts",
    "rescue_api_fingerprints",
    "rescue_api_storage_events",
    "rescue_api_commit_transactions",
    "rescue_api_meal_plans",
    "rescue_api_multi_day_meal_plans",
    "rescue_api_shopping_list",
    "rescue_api_shopping_receive_operations",
    "rescue_api_manual_food_operations",
    "rescue_api_meal_preferences",
    "rescue_api_meal_plan_events",
    "rescue_api_recipe_drafts",
    "rescue_api_recipe_review_events",
    "rescue_api_grocy_mappings",
    "rescue_api_grocy_mapping_audit_events",
    "rescue_api_workspace_revisions",
    "rescue_api_product_aliases",
    "rescue_api_product_enrichment_jobs",
    "rescue_api_product_enrichment_worker_leases",
    "rescue_api_product_enrichment_worker_heartbeats",
    "rescue_api_notification_read_states",
    "rescue_api_notification_preferences",
    "rescue_api_push_subscriptions",
    "rescue_api_notification_deliveries",
    "rescue_api_notification_worker_leases",
    "rescue_api_notification_worker_heartbeats",
    "rescue_api_grocy_location_mappings",
    "rescue_api_storage_locations",
    "rescue_api_grocy_outbox",
    "rescue_api_grocy_worker_leases",
    "rescue_api_grocy_worker_heartbeats",
    "rescue_recipe_catalog_drafts",
    "rescue_recipe_catalog_review_events",
    "rescue_recipe_catalog_revisions",
    "rescue_auth_accounts",
    "rescue_auth_revoked_tokens",
    "rescue_auth_password_reset_tokens",
    "rescue_auth_rate_limit_events",
    "rescue_product_lookup_cache",
    "rescue_product_lookup_leases",
    "rescue_product_provider_rate_limit_events",
    "rescue_product_name_lookup_cache",
    "rescue_product_name_lookup_leases",
    "rescue_api_product_provenance_audit_events",
    "rescue_api_product_info_audit_events",
)

_NORMALIZED_TABLES = (
    "rescue_inventory_products",
    "rescue_inventory_receipts",
    "rescue_inventory_receipt_lines",
    "rescue_inventory_lots",
    "rescue_inventory_date_assertions",
    "rescue_inventory_priority_windows",
    "rescue_inventory_storage_events",
    "rescue_inventory_commit_transactions",
)

_REQUIRED_COLUMNS = {
    "rescue_api_foods": {"workspace_id", "id", "payload", "search_text"},
    "rescue_api_receipts": {"workspace_id", "id", "payload"},
    "rescue_api_fingerprints": {"workspace_id", "fingerprint"},
    "rescue_api_storage_events": {"workspace_id", "id", "payload"},
    "rescue_api_commit_transactions": {"workspace_id", "id", "payload"},
    "rescue_api_meal_plans": {"workspace_id", "id", "payload"},
    "rescue_api_multi_day_meal_plans": {"workspace_id", "id", "payload"},
    "rescue_api_shopping_list": {"workspace_id", "id", "payload"},
    "rescue_api_shopping_receive_operations": {"workspace_id", "id", "payload"},
    "rescue_api_manual_food_operations": {"workspace_id", "id", "payload"},
    "rescue_api_meal_preferences": {"workspace_id", "id", "payload"},
    "rescue_api_meal_plan_events": {"workspace_id", "id", "payload"},
    "rescue_api_recipe_drafts": {"workspace_id", "id", "payload"},
    "rescue_api_recipe_review_events": {"workspace_id", "id", "payload"},
    "rescue_api_grocy_mappings": {"workspace_id", "canonical_name", "payload"},
    "rescue_api_grocy_mapping_audit_events": {"workspace_id", "id", "canonical_name", "payload"},
    "rescue_api_workspace_revisions": {"workspace_id", "revision"},
    "rescue_api_product_aliases": {"workspace_id", "raw_name_key", "payload"},
    "rescue_api_product_enrichment_jobs": {"workspace_id", "id", "payload"},
    "rescue_api_product_enrichment_worker_leases": {"workspace_id", "lease_key", "worker_id", "expires_at"},
    "rescue_api_product_enrichment_worker_heartbeats": {"workspace_id", "worker_id", "payload"},
    "rescue_api_notification_read_states": {"workspace_id", "notification_id", "read_at"},
    "rescue_api_notification_preferences": {"workspace_id", "id", "payload"},
    "rescue_api_push_subscriptions": {"workspace_id", "endpoint_hash", "payload"},
    "rescue_api_notification_deliveries": {"workspace_id", "id", "payload"},
    "rescue_api_notification_worker_leases": {"workspace_id", "lease_key", "worker_id", "expires_at"},
    "rescue_api_notification_worker_heartbeats": {"workspace_id", "worker_id", "payload"},
    "rescue_api_grocy_location_mappings": {"workspace_id", "storage_type", "payload"},
    "rescue_api_storage_locations": {"workspace_id", "id", "payload"},
    "rescue_api_grocy_outbox": {"workspace_id", "id", "payload"},
    "rescue_api_grocy_worker_leases": {"workspace_id", "lease_key", "worker_id", "expires_at"},
    "rescue_api_grocy_worker_heartbeats": {"workspace_id", "worker_id", "payload"},
    "rescue_recipe_catalog_drafts": {"id", "payload"},
    "rescue_recipe_catalog_review_events": {"id", "payload"},
    "rescue_recipe_catalog_revisions": {"id", "revision"},
    "rescue_auth_accounts": {"id", "workspace_id", "email", "password_hash", "session_version", "status", "deletion_started_at"},
    "rescue_product_lookup_cache": {"cache_key", "barcode", "payload", "expires_at", "accessed_at"},
    "rescue_product_lookup_leases": {"cache_key", "owner_id", "lease_until", "acquired_at"},
    "rescue_product_provider_rate_limit_events": {"provider", "occurred_at"},
    "rescue_product_name_lookup_cache": {"cache_key", "query", "payload", "expires_at", "accessed_at"},
    "rescue_product_name_lookup_leases": {"cache_key", "owner_id", "lease_until", "acquired_at"},
    "rescue_api_product_provenance_audit_events": {"workspace_id", "id", "food_id", "action", "occurred_at", "payload"},
    "rescue_api_product_info_audit_events": {"workspace_id", "id", "food_id", "action", "occurred_at", "payload"},
    "rescue_inventory_lots": {"workspace_id", "lot_id", "quantity", "storage_type", "storage_location_id", "opened_at", "product_provenance"},
    "rescue_inventory_receipts": {
        "workspace_id",
        "receipt_id",
        "fingerprint",
        "source_filename",
        "template_id",
        "template_confidence",
        "merchant_name",
        "status",
        "stock_created",
    },
    "rescue_inventory_receipt_lines": {"workspace_id", "receipt_id", "line_id", "line_number", "barcode", "source_observation_ids"},
    "rescue_inventory_date_assertions": {"workspace_id", "assertion_id", "lot_id", "kind", "date_value", "applicable_storage_type", "storage_condition_text"},
    "rescue_inventory_priority_windows": {
        "workspace_id",
        "lot_id",
        "start_date",
        "end_date",
        "inference_provider",
        "inference_provider_version",
        "inference_rule_id",
        "inference_evidence_refs",
        "inference_reasoning",
        "inference_input_sha256",
    },
    "rescue_inventory_storage_events": {"workspace_id", "event_id", "food_id", "event_type", "from_storage_location_id", "to_storage_location_id"},
    "rescue_inventory_commit_transactions": {
        "workspace_id",
        "transaction_id",
        "receipt_id",
        "idempotency_key_digest",
        "request_payload_fingerprint",
        "created_lot_ids",
        "skipped_line_ids",
    },
}

_REQUIRED_INDEXES = {
    "rescue_api_foods": {
        "rescue_api_foods_search_text_trgm_idx",
        "rescue_api_foods_workspace_storage_idx",
        "rescue_api_foods_workspace_storage_location_idx",
    },
    "rescue_product_lookup_cache": {
        "rescue_product_lookup_cache_expiry_idx",
        "rescue_product_lookup_cache_access_idx",
    },
    "rescue_product_lookup_leases": {
        "rescue_product_lookup_leases_expiry_idx",
    },
    "rescue_product_provider_rate_limit_events": {
        "rescue_product_provider_rate_limit_events_provider_time_idx",
    },
    "rescue_product_name_lookup_cache": {
        "rescue_product_name_lookup_cache_expiry_idx",
        "rescue_product_name_lookup_cache_access_idx",
    },
    "rescue_product_name_lookup_leases": {
        "rescue_product_name_lookup_leases_expiry_idx",
    },
    "rescue_api_product_provenance_audit_events": {
        "rescue_api_product_provenance_audit_events_food_time_idx",
    },
    "rescue_api_product_info_audit_events": {
        "rescue_api_product_info_audit_events_food_time_idx",
    },
    "rescue_api_product_aliases": {
        "rescue_api_product_aliases_canonical_idx",
    },
    "rescue_api_grocy_mapping_audit_events": {
        "rescue_api_grocy_mapping_audit_events_name_time_idx",
    },
    "rescue_inventory_commit_transactions": {
        "rescue_inventory_commit_transactions_receipt_idx",
    },
    "rescue_api_manual_food_operations": {
        "rescue_api_manual_food_operations_workspace_time_idx",
    },
    "rescue_api_storage_locations": {
        "rescue_api_storage_locations_workspace_name_idx",
    },
    "rescue_inventory_lots": {
        "rescue_inventory_lots_storage_location_idx",
    },
    "rescue_inventory_storage_events": {
        "rescue_inventory_storage_events_location_time_idx",
    },
}


def required_postgres_tables(inventory_mode: InventoryMode) -> tuple[str, ...]:
    if inventory_mode == "normalized":
        return _BASE_TABLES + _NORMALIZED_TABLES
    return _BASE_TABLES


def check_postgres_migration_ledger(connection) -> None:
    """Require the ordered migration baseline recorded by the runner."""

    try:
        with _read_cursor(connection) as cursor:
            cursor.execute("SELECT migration_name FROM rescue_schema_migrations")
            applied_names = {str(row[0]) for row in cursor.fetchall() if isinstance(row, (tuple, list)) and row}
    except Exception as exc:
        raise PostgresSchemaError("PostgreSQL migration ledger is missing or unreadable") from exc

    if set(MIGRATION_BASELINE_NAMES) - applied_names:
        raise PostgresSchemaError("PostgreSQL migration baseline is incomplete")


def _rows_to_names(rows: Iterable[object]) -> set[str]:
    return {str(row[0]) for row in rows if isinstance(row, (tuple, list)) and row}


def _rows_to_index_names(rows: Iterable[object]) -> set[tuple[str, str]]:
    return {
        (str(row[0]), str(row[1]))
        for row in rows
        if isinstance(row, (tuple, list)) and len(row) >= 2
    }


def check_postgres_schema(connection, *, inventory_mode: InventoryMode) -> None:
    """Check required tables and columns without mutating the database."""

    table_names = required_postgres_tables(inventory_mode)
    with _read_cursor(connection) as cursor:
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ANY(%s)
            """,
            (list(table_names),),
        )
        missing_tables = set(table_names) - _rows_to_names(cursor.fetchall())
        if missing_tables:
            raise PostgresSchemaError("required PostgreSQL tables are missing")

        column_tables = tuple(table for table in _REQUIRED_COLUMNS if table in table_names)
        cursor.execute(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ANY(%s)
            """,
            (list(column_tables),),
        )
        present_columns: dict[str, set[str]] = {table: set() for table in column_tables}
        for row in cursor.fetchall():
            if isinstance(row, (tuple, list)) and len(row) >= 2:
                present_columns.setdefault(str(row[0]), set()).add(str(row[1]))

    if any(_REQUIRED_COLUMNS[table] - present_columns.get(table, set()) for table in column_tables):
        raise PostgresSchemaError("required PostgreSQL columns are missing")

    index_tables = tuple(table for table in _REQUIRED_INDEXES if table in table_names)
    if index_tables:
        with _read_cursor(connection) as cursor:
            cursor.execute(
                """
                SELECT tablename, indexname
                FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = ANY(%s)
                """,
                (list(index_tables),),
            )
            present_indexes = _rows_to_index_names(cursor.fetchall())
        required_indexes = {
            (table, index_name)
            for table in index_tables
            for index_name in _REQUIRED_INDEXES[table]
        }
        if required_indexes - present_indexes:
            raise PostgresSchemaError("required PostgreSQL indexes are missing")
