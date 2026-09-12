from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from app.auth import PostgresAccountRepository
from app.main import (
    CommitTransactionRecord,
    ConcurrentWorkspaceWriteError,
    FoodProductInfoSnapshot,
    GrocyProductMappingAuditEvent,
    GrocyProductMappingResponse,
    PostgresStore,
    ProductProvenance,
    ProductEnrichmentWorkerHeartbeatRecord,
    ReceiptDraftResponse,
    ReceiptLineDraft,
    StorageEventResponse,
    WorkspaceExportAuditEvent,
    WorkspaceStoreRouter,
    _FoodRecord,
    _inventory_search_text,
    _ReceiptRecord,
    _seed_foods,
)
from app.normalized_inventory import NormalizedInventoryAdapter
from app.postgres_readiness import MIGRATION_BASELINE_NAMES, _REQUIRED_COLUMNS, _REQUIRED_INDEXES, PostgresSchemaError, check_postgres_migration_ledger, check_postgres_schema, required_postgres_tables
from app.product_resolver import SharedProductLookupCache, SharedProductNameLookupCache, SharedProductProviderRateLimiter
from app.recipe_catalog import SharedRecipeCatalogStore


class FakeCursor:
    def __init__(self, connection) -> None:
        self.connection = connection

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, query, params=None):
        self.connection.queries.append((query, params))

    def executemany(self, query, rows):
        self.connection.queries.append((query, list(rows)))

    def fetchone(self):
        return (0,)

    def fetchall(self):
        return []


class FakeConnection:
    def __init__(self) -> None:
        self.queries = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class ClosableFakeConnection(FakeConnection):
    def __init__(self) -> None:
        super().__init__()
        self.closed = False

    def close(self):
        self.closed = True


class InventorySearchCursor(FakeCursor):
    def fetchone(self):
        query = self.connection.queries[-1][0]
        if "SELECT COUNT(*) FROM rescue_api_foods WHERE" in query:
            return (1,)
        return super().fetchone()

    def fetchall(self):
        query = self.connection.queries[-1][0]
        if "SELECT payload" in query and "FROM rescue_api_foods" in query and "search_text LIKE %s" in query:
            return [(self.connection.payload,)]
        return super().fetchall()


class InventorySearchConnection(FakeConnection):
    def __init__(self) -> None:
        super().__init__()
        self.payload = _seed_foods()[0].model_dump(mode="json")

    def cursor(self):
        return InventorySearchCursor(self)


class AccountDeleteCursor(FakeCursor):
    def fetchone(self):
        query = self.connection.queries[-1][0]
        if "SELECT id, email, password_hash, workspace_id, created_at, role, session_version" in query:
            return ("account-one", "account@example.com", "unused", "workspace-one", datetime(2026, 9, 1, tzinfo=timezone.utc), "user", 0)
        if "RETURNING id" in query:
            return ("account-one",)
        return (0,)


class AccountDeleteConnection(FakeConnection):
    def cursor(self):
        return AccountDeleteCursor(self)


class RevisionCursor(FakeCursor):
    def fetchone(self):
        query = self.connection.queries[-1][0]
        if "SELECT revision FROM rescue_api_workspace_revisions" in query:
            return (self.connection.revision,)
        if "RETURNING revision" in query:
            if self.connection.force_conflict:
                return None
            self.connection.revision += 1
            return (self.connection.revision,)
        return (0,)


class RevisionConnection(FakeConnection):
    def __init__(self) -> None:
        super().__init__()
        self.revision = 0
        self.force_conflict = False

    def cursor(self):
        return RevisionCursor(self)


class ReplayCursor(FakeCursor):
    def __init__(self, connection, rows_by_marker) -> None:
        super().__init__(connection)
        self.rows_by_marker = rows_by_marker
        self.rows = []

    def execute(self, query, params=None):
        super().execute(query, params)
        self.rows = next((rows for marker, rows in self.rows_by_marker.items() if marker in query), [])

    def fetchall(self):
        return self.rows


def test_postgres_projection_migration_declares_workspace_composite_keys() -> None:
    migration = Path(__file__).resolve().parents[3] / "infra" / "postgres" / "001_initial_schema.sql"
    sql = migration.read_text()

    assert sql.count("workspace_id text NOT NULL") >= 10
    assert "PRIMARY KEY (workspace_id, id)" in sql
    assert "PRIMARY KEY (workspace_id, fingerprint)" in sql
    assert "rescue_auth_accounts" in sql
    assert "rescue_auth_revoked_tokens" in sql
    assert "rescue_auth_password_reset_tokens" in sql
    assert "rescue_auth_rate_limit_events" in sql
    assert "role text NOT NULL DEFAULT 'user'" in sql
    assert "session_version integer NOT NULL DEFAULT 0" in sql
    assert "status text NOT NULL DEFAULT 'active'" in sql
    assert "deletion_started_at timestamptz" in sql
    assert "rescue_api_recipe_drafts" in sql
    assert "rescue_api_recipe_review_events" in sql
    assert "rescue_recipe_catalog_drafts" in sql
    assert "rescue_recipe_catalog_review_events" in sql
    assert "rescue_api_grocy_mappings" in sql
    assert "rescue_api_grocy_mapping_audit_events" in sql
    assert "rescue_api_notification_read_states" in sql
    assert "rescue_api_notification_preferences" in sql
    assert "rescue_api_push_subscriptions" in sql
    assert "rescue_api_notification_deliveries" in sql
    assert "rescue_api_notification_worker_leases" in sql
    assert "rescue_api_notification_worker_heartbeats" in sql
    assert "rescue_api_grocy_location_mappings" in sql
    assert "rescue_api_grocy_outbox" in sql
    assert "rescue_api_grocy_worker_leases" in sql
    assert "rescue_api_grocy_worker_heartbeats" in sql
    assert "rescue_api_workspace_revisions" in sql
    assert "PRIMARY KEY (workspace_id, canonical_name)" in sql
    assert "PRIMARY KEY (workspace_id, lease_key)" in sql
    assert "ALTER TABLE rescue_api_recipe_drafts ADD COLUMN IF NOT EXISTS workspace_id" in sql
    assert "ALTER TABLE rescue_api_foods ADD COLUMN IF NOT EXISTS workspace_id" in sql
    assert "search_text text NOT NULL DEFAULT ''" in sql

    normalized_migration = migration.with_name("002_inventory_authority.sql")
    normalized_sql = normalized_migration.read_text()
    assert "rescue_inventory_products" in normalized_sql
    assert "rescue_inventory_receipts" in normalized_sql
    assert "rescue_inventory_receipt_lines" in normalized_sql
    assert "storage_suggestion" in normalized_sql
    assert "rescue_inventory_lots" in normalized_sql
    assert "rescue_inventory_date_assertions" in normalized_sql
    assert "rescue_inventory_storage_events" in normalized_sql
    assert "rescue_inventory_commit_transactions" in normalized_sql
    assert "barcode text" in normalized_sql
    assert "barcode_lot text" in normalized_sql
    assert "opened_at timestamptz" in normalized_sql
    assert "PRIMARY KEY (workspace_id, lot_id)" in normalized_sql
    assert "PRIMARY KEY (workspace_id, event_id)" in normalized_sql
    assert "inference_provider" in normalized_sql
    assert "inference_evidence_refs" in normalized_sql
    assert "inference_input_sha256" in normalized_sql
    assert "'gs1'" in migration.read_text()
    provenance_migration = migration.with_name("014_product_provenance.sql")
    provenance_sql = provenance_migration.read_text()
    assert "ALTER TABLE rescue_inventory_lots" in provenance_sql
    assert "product_provenance jsonb" in provenance_sql
    audit_migration = migration.with_name("015_product_provenance_audit.sql")
    audit_sql = audit_migration.read_text()
    assert "rescue_api_product_provenance_audit_events" in audit_sql
    assert "PRIMARY KEY (workspace_id, id)" in audit_sql
    assert "rescue_api_product_provenance_audit_events_food_time_idx" in audit_sql
    info_audit_migration = migration.with_name("016_product_info_audit.sql")
    info_audit_sql = info_audit_migration.read_text()
    assert "rescue_api_product_info_audit_events" in info_audit_sql
    assert "rescue_api_product_info_audit_events_food_time_idx" in info_audit_sql
    storage_condition_migration = migration.with_name("017_date_storage_condition.sql")
    storage_condition_sql = storage_condition_migration.read_text()
    assert "applicable_storage_type" in storage_condition_sql
    assert "storage_condition_text" in storage_condition_sql
    receipt_barcode_migration = migration.with_name("018_receipt_line_barcode.sql")
    receipt_barcode_sql = receipt_barcode_migration.read_text()
    assert "ALTER TABLE receipt_lines" in receipt_barcode_sql
    assert "ALTER TABLE rescue_inventory_receipt_lines" in receipt_barcode_sql
    assert "ADD COLUMN IF NOT EXISTS barcode text" in receipt_barcode_sql
    assert "DROP CONSTRAINT IF EXISTS rescue_inventory_receipt_lines_match_source_check" in receipt_barcode_sql
    assert "'mfds_c005'" in receipt_barcode_sql
    assert "'open_food_facts'" in receipt_barcode_sql
    receive_operation_migration = migration.with_name("019_shopping_receive_operations.sql")
    receive_operation_sql = receive_operation_migration.read_text()
    assert "rescue_api_shopping_receive_operations" in receive_operation_sql
    assert "PRIMARY KEY (workspace_id, id)" in receive_operation_sql
    receipt_commit_idempotency_migration = migration.with_name("020_receipt_commit_idempotency.sql")
    receipt_commit_idempotency_sql = receipt_commit_idempotency_migration.read_text()
    assert "idempotency_key_digest" in receipt_commit_idempotency_sql
    assert "request_payload_fingerprint" in receipt_commit_idempotency_sql
    assert "created_lot_ids jsonb" in receipt_commit_idempotency_sql
    assert "skipped_line_ids jsonb" in receipt_commit_idempotency_sql
    assert "FROM pg_constraint" in receipt_commit_idempotency_sql
    assert "AND contype = 'u'" in receipt_commit_idempotency_sql
    assert "pg_get_constraintdef(oid) LIKE '%receipt_id%'" in receipt_commit_idempotency_sql
    assert "DROP CONSTRAINT %I" in receipt_commit_idempotency_sql
    assert "rescue_inventory_commit_transactions_receipt_idx" in receipt_commit_idempotency_sql

    account_deletion_migration = migration.with_name("021_account_deletion_fence.sql")
    account_deletion_sql = account_deletion_migration.read_text()
    assert "rescue_auth_accounts" in account_deletion_sql
    assert "status text NOT NULL DEFAULT 'active'" in account_deletion_sql
    assert "deletion_started_at timestamptz" in account_deletion_sql

    account_deletion_smoke = migration.parents[2] / "services" / "api" / "scripts" / "postgres_account_deletion_smoke.py"
    account_deletion_smoke_sql = account_deletion_smoke.read_text()
    assert "process-b dashboard/write=423" in account_deletion_smoke_sql
    assert "recovery-auth-me=200" in account_deletion_smoke_sql
    assert "post-delete-old-token=401" in account_deletion_smoke_sql
    workflow = migration.parents[2] / ".github" / "workflows" / "verify.yml"
    assert "postgres_account_deletion_smoke.py" in workflow.read_text()
    account_deletion_crash_smoke = migration.parents[2] / "services" / "api" / "scripts" / "postgres_account_deletion_crash_recovery_smoke.py"
    account_deletion_crash_smoke_sql = account_deletion_crash_smoke.read_text()
    assert "process_a.kill()" in account_deletion_crash_smoke_sql
    assert "restart" in account_deletion_crash_smoke_sql
    assert "rows=0" in account_deletion_crash_smoke_sql
    assert "postgres_account_deletion_crash_recovery_smoke.py" in workflow.read_text()

    direct_connection = migration.parents[2] / "services" / "api" / "app" / "postgres_connection.py"
    direct_connection_sql = direct_connection.read_text()
    main_sql = (migration.parents[2] / "services" / "api" / "app" / "main.py").read_text()
    assert "never replay" in direct_connection_sql
    assert "PostgresConnectionUnavailable" in direct_connection_sql
    assert "_connect_with_retry" in direct_connection_sql
    assert "receipt_draft_lock" in main_sql
    assert "meal_plan_lock" in main_sql
    assert "multi_day_plan_lock" in main_sql
    assert "_meal_plan_completed_response" in main_sql
    connection_recovery_smoke = migration.parents[2] / "services" / "api" / "scripts" / "postgres_connection_recovery_smoke.py"
    connection_recovery_smoke_sql = connection_recovery_smoke.read_text()
    assert "application_name" in connection_recovery_smoke_sql
    assert "pg_terminate_backend" in connection_recovery_smoke_sql
    assert "--lifespan" in connection_recovery_smoke_sql
    assert "post_drop_write=201" in connection_recovery_smoke_sql
    assert "_cleanup_scoped_account" in connection_recovery_smoke_sql
    workflow_text = workflow.read_text()
    assert "postgres_connection_recovery_smoke.py" in workflow_text
    receipt_draft_smoke = migration.parents[2] / "services" / "api" / "scripts" / "postgres_receipt_draft_idempotency_smoke.py"
    receipt_draft_smoke_sql = receipt_draft_smoke.read_text()
    assert "same-fingerprint receipt draft race" in receipt_draft_smoke_sql
    assert "unique_draft_ids" in receipt_draft_smoke_sql
    assert "rescue_inventory_receipts" in receipt_draft_smoke_sql
    assert "postgres_receipt_draft_idempotency_smoke.py" in workflow_text
    meal_plan_smoke = migration.parents[2] / "services" / "api" / "scripts" / "postgres_meal_plan_idempotency_smoke.py"
    meal_plan_smoke_sql = meal_plan_smoke.read_text()
    assert "same-plan meal-plan save race" in meal_plan_smoke_sql
    assert "completed+already_completed" in meal_plan_smoke_sql
    assert "compatibility_consumed_events=3" in meal_plan_smoke_sql
    assert "normalized_consumed_events=3" in meal_plan_smoke_sql
    assert "postgres_meal_plan_idempotency_smoke.py" in workflow_text
    manual_food_smoke = migration.parents[2] / "services" / "api" / "scripts" / "postgres_manual_food_lot_smoke.py"
    manual_food_smoke_sql = manual_food_smoke.read_text()
    assert "lot_action" in manual_food_smoke_sql
    assert "target_food_id" in manual_food_smoke_sql
    assert "date_history=1" in manual_food_smoke_sql
    assert "normalized_date_assertions=2" in manual_food_smoke_sql
    assert "operations=1" in manual_food_smoke_sql
    assert "restart_replay=201" in manual_food_smoke_sql
    assert "postgres_manual_food_lot_smoke.py" in workflow_text

    receipt_review_metadata_migration = migration.with_name("022_receipt_review_metadata.sql")
    receipt_review_metadata_sql = receipt_review_metadata_migration.read_text()
    assert "ALTER TABLE rescue_inventory_receipts" in receipt_review_metadata_sql
    assert "template_id" in receipt_review_metadata_sql
    assert "template_confidence" in receipt_review_metadata_sql
    assert "merchant_name" in receipt_review_metadata_sql
    assert "rescue_inventory_receipts_template_id_ck" in receipt_review_metadata_sql
    assert "rescue_inventory_receipts_template_confidence_ck" in receipt_review_metadata_sql
    assert "022_receipt_review_metadata.sql" in workflow_text
    manual_food_migration = migration.with_name("023_manual_food_idempotency.sql")
    manual_food_migration_sql = manual_food_migration.read_text()
    assert "rescue_api_manual_food_operations" in manual_food_migration_sql
    assert "PRIMARY KEY (workspace_id, id)" in manual_food_migration_sql
    assert "023_manual_food_idempotency.sql" in workflow_text
    catalog_revision_migration = migration.with_name("024_recipe_catalog_revision.sql")
    catalog_revision_sql = catalog_revision_migration.read_text()
    assert "rescue_recipe_catalog_revisions" in catalog_revision_sql
    assert "revision bigint" in catalog_revision_sql
    assert "024_recipe_catalog_revision.sql" in workflow_text
    storage_location_migration = migration.with_name("025_storage_locations.sql")
    storage_location_sql = storage_location_migration.read_text()
    assert "rescue_api_storage_locations" in storage_location_sql
    assert "storage_location_id text" in storage_location_sql
    assert "from_storage_location_id text" in storage_location_sql
    assert "to_storage_location_id text" in storage_location_sql
    assert "rescue_api_storage_locations_workspace_name_idx" in storage_location_sql
    assert "rescue_api_foods_workspace_storage_location_idx" in storage_location_sql
    assert "025_storage_locations.sql" in workflow_text
    assert "storage_location_id=$storage_location_id" in workflow_text
    assert "restored_location_count" in workflow_text
    assert "restored_lot_location_count" in workflow_text
    assert "/api/storage-locations/revision" in workflow_text
    assert "ci-custom-location-history-1" in workflow_text
    assert "history_delete_status" in workflow_text
    assert "storage_location_in_use" in workflow_text
    export_audit_migration = migration.with_name("026_export_audit.sql")
    export_audit_sql = export_audit_migration.read_text()
    assert "rescue_api_export_audit_events" in export_audit_sql
    assert "actor_id text" in export_audit_sql
    assert "actor_role text" in export_audit_sql
    assert "request_id text" in export_audit_sql
    assert "rescue_api_export_audit_events_workspace_time_idx" in export_audit_sql
    assert "026_export_audit.sql" in workflow_text
    assert "npm run test:workspace-sync" in workflow_text
    assert "npm run test:service-worker" in workflow_text
    assert "npm run test:release-manifest" in workflow_text
    assert "npm run release:manifest -- --output /tmp/rescue-meal-release-manifest.json --require-artifacts" in workflow_text
    assert "actions/upload-artifact@v4" in workflow_text
    assert "scripts/preflight_production.py --mode production" in workflow_text
    assert "RESCUE_MEAL_RECIPE_ADMIN_EMAILS: reviewer@example.org,publisher@example.org" in workflow_text
    assert "RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS: publisher@example.org" in workflow_text
    assert "Reject invalid recipe publisher configuration" in workflow_text
    assert "recipe-publisher-not-admin" in workflow_text

    alias_migration = migration.with_name("003_product_aliases.sql")
    alias_sql = alias_migration.read_text()
    assert "rescue_api_product_aliases" in alias_sql
    assert "PRIMARY KEY (workspace_id, raw_name_key)" in alias_sql

    enrichment_migration = migration.with_name("004_product_enrichment.sql")
    enrichment_sql = enrichment_migration.read_text()
    assert "rescue_api_product_enrichment_jobs" in enrichment_sql
    assert "rescue_api_product_enrichment_worker_leases" in enrichment_sql
    assert "rescue_api_product_enrichment_worker_heartbeats" in enrichment_sql
    gs1_migration = migration.with_name("005_gs1_date_source.sql")
    gs1_sql = gs1_migration.read_text()
    assert "date_assertions_date_source_check" in gs1_sql
    assert "'gs1'" in gs1_sql

    multi_day_migration = migration.with_name("006_multi_day_meal_plans.sql")
    multi_day_sql = multi_day_migration.read_text()
    assert "rescue_api_multi_day_meal_plans" in multi_day_sql
    assert "PRIMARY KEY (workspace_id, id)" in multi_day_sql
    shopping_migration = migration.with_name("007_shopping_list.sql")
    shopping_sql = shopping_migration.read_text()
    assert "rescue_api_shopping_list" in shopping_sql
    assert "PRIMARY KEY (workspace_id, id)" in shopping_sql
    preferences_migration = migration.with_name("008_meal_preferences.sql")
    preferences_sql = preferences_migration.read_text()
    assert "rescue_api_meal_preferences" in preferences_sql
    assert "PRIMARY KEY (workspace_id, id)" in preferences_sql
    search_migration = migration.with_name("009_inventory_search.sql")
    search_sql = search_migration.read_text()
    assert "pg_trgm" in search_sql
    assert "search_text text NOT NULL DEFAULT ''" in search_sql
    assert "gin_trgm_ops" in search_sql
    assert "rescue_api_foods_workspace_storage_idx" in search_sql

    review_locations_migration = migration.with_name("010_receipt_review_locations.sql")
    review_locations_sql = review_locations_migration.read_text()
    assert "source_observation_ids jsonb" in review_locations_sql
    opened_at_migration = migration.with_name("011_opened_at.sql")
    opened_at_sql = opened_at_migration.read_text()
    assert "ADD COLUMN IF NOT EXISTS opened_at timestamptz" in opened_at_sql
    assert "created_child_food_id" in opened_at_sql
    provider_runtime_migration = migration.with_name("012_product_provider_runtime.sql")
    provider_runtime_sql = provider_runtime_migration.read_text()
    assert "rescue_product_lookup_cache" in provider_runtime_sql
    assert "rescue_product_lookup_leases" in provider_runtime_sql
    assert "rescue_product_provider_rate_limit_events" in provider_runtime_sql
    assert "rescue_product_lookup_cache_expiry_idx" in provider_runtime_sql
    assert "rescue_product_lookup_leases_expiry_idx" in provider_runtime_sql
    assert "rescue_product_provider_rate_limit_events_provider_time_idx" in provider_runtime_sql
    name_runtime_migration = migration.with_name("013_product_name_provider_runtime.sql")
    name_runtime_sql = name_runtime_migration.read_text()
    assert "rescue_product_name_lookup_cache" in name_runtime_sql
    assert "rescue_product_name_lookup_leases" in name_runtime_sql
    assert "rescue_product_name_lookup_cache_access_idx" in name_runtime_sql
    assert "rescue_product_name_lookup_leases_expiry_idx" in name_runtime_sql


def test_postgres_store_filters_and_writes_only_the_active_workspace() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    repository.foods["spinach-1"] = _FoodRecord(_seed_foods()[0])
    repository.flush()

    initialization_sql = connection.queries[0][0]
    assert "PRIMARY KEY (workspace_id, id)" in initialization_sql
    assert "search_text text NOT NULL DEFAULT ''" in initialization_sql
    filtered_queries = [query for query, _ in connection.queries if "WHERE workspace_id = %s" in query]
    assert any("rescue_api_foods" in query for query in filtered_queries)
    assert any("rescue_api_receipts" in query for query in filtered_queries)
    assert any("rescue_api_recipe_drafts" in query for query in filtered_queries)
    assert any("rescue_api_recipe_review_events" in query for query in filtered_queries)
    assert any("rescue_api_grocy_mappings" in query for query in filtered_queries)
    assert any("rescue_api_grocy_mapping_audit_events" in query for query in filtered_queries)
    assert any("rescue_api_product_aliases" in query for query in filtered_queries)
    assert any("rescue_api_product_enrichment_jobs" in query for query in filtered_queries)
    assert any("rescue_api_product_enrichment_worker_leases" in query for query in filtered_queries)
    assert any("rescue_api_product_enrichment_worker_heartbeats" in query for query in filtered_queries)
    assert any("rescue_api_notification_read_states" in query for query in filtered_queries)
    assert any("rescue_api_notification_preferences" in query for query in filtered_queries)
    assert any("rescue_api_notification_deliveries" in query for query in filtered_queries)
    assert any("rescue_api_notification_worker_leases" in query for query in filtered_queries)
    assert any("rescue_api_notification_worker_heartbeats" in query for query in filtered_queries)
    assert any("rescue_api_push_subscriptions" in query for query in filtered_queries)
    assert any("rescue_api_grocy_location_mappings" in query for query in filtered_queries)
    assert any("rescue_api_grocy_outbox" in query for query in filtered_queries)
    assert any("rescue_api_multi_day_meal_plans" in query for query in filtered_queries)
    assert any("rescue_api_shopping_list" in query for query in filtered_queries)
    assert any("rescue_api_shopping_receive_operations" in query for query in filtered_queries)
    assert any("rescue_api_manual_food_operations" in query for query in filtered_queries)
    assert any("rescue_api_meal_preferences" in query for query in filtered_queries)
    assert any("SELECT revision" in query and "FOR UPDATE" in query for query, _ in connection.queries)
    assert any("revision = %s" in query and "RETURNING revision" in query for query, _ in connection.queries)
    food_insert = next(rows for query, rows in connection.queries if query.startswith("INSERT INTO rescue_api_foods") and rows)
    assert food_insert[0][0] == "account-one"
    assert "workspace_id, id, payload" in next(query for query, _ in connection.queries if query.startswith("INSERT INTO rescue_api_foods"))
    assert food_insert[0][3] == _inventory_search_text(_seed_foods()[0])


def test_postgres_workspace_router_does_not_reinitialize_schema_for_lazy_workspace(monkeypatch) -> None:
    import psycopg

    connection = FakeConnection()
    base_store = PostgresStore("postgresql://test", workspace_id="demo", seed=False, connection=connection)
    lazy_connections = []

    def fake_connect(_database_url):
        lazy_connection = FakeConnection()
        lazy_connections.append(lazy_connection)
        return lazy_connection

    monkeypatch.setattr(psycopg, "connect", fake_connect)

    router = WorkspaceStoreRouter(base_store)
    router.provision_workspace("account-one", seed=False)

    assert len(lazy_connections) == 1
    assert not any(
        "CREATE TABLE IF NOT EXISTS rescue_api_foods" in query
        for query, _ in lazy_connections[0].queries
    )


def test_postgres_workspace_router_bounds_idle_workspace_connections(monkeypatch) -> None:
    import psycopg

    base_connection = ClosableFakeConnection()
    base_store = PostgresStore("postgresql://test", workspace_id="demo", seed=False, connection=base_connection)
    lazy_connections: list[ClosableFakeConnection] = []

    def fake_connect(_database_url):
        connection = ClosableFakeConnection()
        lazy_connections.append(connection)
        return connection

    monkeypatch.setattr(psycopg, "connect", fake_connect)

    router = WorkspaceStoreRouter(base_store, workspace_store_cache_size=1)
    with router.workspace_session("workspace-a", seed=False):
        assert router.active_workspace_leases == {"workspace-a": 1}
    first_connection = lazy_connections[0]
    assert first_connection.closed is False
    assert router.active_workspace_leases == {}

    with router.workspace_session("workspace-b", seed=False):
        assert router.active_workspace_leases == {"workspace-b": 1}
    second_connection = lazy_connections[1]

    assert first_connection.closed is True
    assert second_connection.closed is False
    assert router.cached_durable_workspace_count == 1
    assert "workspace-a" not in router.workspace_ids
    assert "workspace-b" in router.workspace_ids

    router.close()

    assert second_connection.closed is True
    assert base_connection.closed is True
    assert router.workspace_ids == ("demo",)


def test_postgres_workspace_router_does_not_purge_while_another_lease_is_active(monkeypatch) -> None:
    import psycopg

    base_store = PostgresStore(
        "postgresql://test",
        workspace_id="demo",
        seed=False,
        connection=ClosableFakeConnection(),
    )
    lazy_connections: list[ClosableFakeConnection] = []

    def fake_connect(_database_url):
        connection = ClosableFakeConnection()
        lazy_connections.append(connection)
        return connection

    monkeypatch.setattr(psycopg, "connect", fake_connect)

    router = WorkspaceStoreRouter(base_store, workspace_store_cache_size=1)
    router.acquire_workspace("workspace-a", seed=False)
    router.acquire_workspace("workspace-a", seed=False)

    with pytest.raises(RuntimeError, match="active operations"):
        router.purge_workspace("workspace-a")

    assert "workspace-a" in router.workspace_ids
    assert lazy_connections[0].closed is False

    router.release_workspace("workspace-a")
    router.release_workspace("workspace-a")
    router.purge_workspace("workspace-a")
    assert lazy_connections[0].closed is True
    router.close()


def test_postgres_workspace_router_rejects_unbounded_cache_size() -> None:
    base_store = PostgresStore("postgresql://test", workspace_id="demo", seed=False, connection=FakeConnection())

    with pytest.raises(ValueError, match="between 1 and 256"):
        WorkspaceStoreRouter(base_store, workspace_store_cache_size=0)
    with pytest.raises(ValueError, match="between 1 and 256"):
        WorkspaceStoreRouter(base_store, workspace_store_cache_size=257)


def test_postgres_inventory_search_uses_workspace_scoped_database_page() -> None:
    connection = InventorySearchConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)

    result = repository.search_inventory("시금치", storage_type="refrigerated", offset=0, limit=40)

    assert result.total == 1
    assert result.offset == 0
    assert result.limit == 40
    assert result.has_more is False
    assert result.items[0].id == "spinach-1"
    count_query, count_params = next(
        (query, params)
        for query, params in connection.queries
        if query.startswith("SELECT COUNT(*) FROM rescue_api_foods WHERE") and "search_text LIKE %s" in query
    )
    page_query, page_params = next(
        (query, params)
        for query, params in connection.queries
        if query.lstrip().startswith("SELECT payload") and "FROM rescue_api_foods" in query
    )
    assert "workspace_id = %s" in count_query
    assert "search_text LIKE %s" in count_query
    assert "(payload ->> 'storage_type') = %s" in count_query
    assert count_params == ("account-one", "%시금치%", "refrigerated")
    assert "workspace_id = %s" in page_query
    assert "ORDER BY (payload ->> 'priority')::integer" in page_query
    assert "OFFSET %s LIMIT %s" in page_query
    assert page_params[-2:] == (0, 40)


def test_postgres_inventory_search_can_filter_a_custom_storage_location() -> None:
    connection = InventorySearchConnection()
    connection.payload["storage_location_id"] = "location-1"
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)

    result = repository.search_inventory(
        "시금치",
        storage_type="refrigerated",
        storage_location_id="location-1",
        offset=0,
        limit=40,
    )

    assert result.storage_location_id == "location-1"
    assert result.total == 1
    count_query, count_params = next(
        (query, params)
        for query, params in connection.queries
        if query.startswith("SELECT COUNT(*) FROM rescue_api_foods WHERE") and "storage_location_id" in query
    )
    assert "(payload ->> 'storage_location_id') = %s" in count_query
    assert count_params == ("account-one", "%시금치%", "refrigerated", "location-1")


def test_postgres_account_deletion_uses_workspace_safe_auth_queries() -> None:
    connection = AccountDeleteConnection()
    repository = PostgresAccountRepository("postgresql://test", connection=connection)

    assert repository.delete_account("account-one", expected_session_version=0) is True
    assert any("DELETE FROM rescue_auth_password_reset_tokens WHERE account_id = %s" in query for query, _ in connection.queries)
    assert any("DELETE FROM rescue_auth_accounts WHERE id = %s AND session_version = %s RETURNING id" in query for query, _ in connection.queries)
    assert connection.commits == 2


def test_postgres_account_repository_close_is_idempotent() -> None:
    connection = ClosableFakeConnection()
    repository = PostgresAccountRepository("postgresql://test", connection=connection)

    repository.close()
    repository.close()

    assert connection.closed is True


def test_postgres_store_explicit_normalized_mode_dual_writes_inventory_tables(monkeypatch) -> None:
    monkeypatch.setenv("RESCUE_MEAL_INVENTORY_MODE", "normalized")
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)

    assert repository.inventory_mode == "normalized"
    assert repository.backend_name == "postgresql-normalized-inventory"
    assert any("rescue_inventory_products" in query for query, _ in connection.queries)
    assert any("rescue_inventory_lots" in query for query, _ in connection.queries)
    assert any("rescue_inventory_storage_events" in query for query, _ in connection.queries)

    repository.foods["gs1-lot"] = _FoodRecord(_seed_foods()[0].model_copy(update={
        "id": "gs1-lot",
        "barcode": "(01)08801114167523(17)260902(10)LOT-7",
        "barcode_lot": "LOT-7",
        "product_provenance": ProductProvenance(
            source="open_food_facts",
            source_url="https://example.test/product/8801114167523",
            confidence=0.62,
            note="shared candidate fixture",
            storage_hint=None,
            source_freshness="current",
        ),
    }))
    repository.record_product_provenance_audit(
        food_id="gs1-lot",
        before=None,
        after=repository.foods["gs1-lot"].response.product_provenance,
        reason="contract fixture",
    )
    repository.flush()
    lot_rows = next(
        rows for query, rows in connection.queries
        if "INSERT INTO rescue_inventory_lots" in query and rows
    )
    assert lot_rows[0][-3:-1] == ("(01)08801114167523(17)260902(10)LOT-7", "LOT-7")
    provenance_payload = getattr(lot_rows[0][-1], "obj", lot_rows[0][-1])
    assert provenance_payload["source"] == "open_food_facts"
    audit_rows = next(rows for query, rows in connection.queries if query.lstrip().startswith("INSERT INTO rescue_api_product_provenance_audit_events") and rows)
    assert audit_rows[0][0] == "account-one"
    assert audit_rows[0][2] == "gs1-lot"
    audit_payload = getattr(audit_rows[0][-1], "obj", audit_rows[0][-1])
    assert audit_payload["after"]["source"] == "open_food_facts"
    repository.record_product_info_audit(
        food_id="gs1-lot",
        before=FoodProductInfoSnapshot(
            canonical_name="시금치",
            display_name="시금치",
            brand="국내산 시금치",
            category="채소",
            product_provenance=repository.foods["gs1-lot"].response.product_provenance,
        ),
        after=FoodProductInfoSnapshot(
            canonical_name="확인한 시금치",
            display_name="확인한 시금치",
            brand="확인한 브랜드",
            category="채소",
            product_provenance=None,
        ),
        reason="contract correction",
    )
    repository.flush()
    info_audit_rows = next(rows for query, rows in connection.queries if query.lstrip().startswith("INSERT INTO rescue_api_product_info_audit_events") and rows)
    assert info_audit_rows[0][0] == "account-one"
    info_audit_payload = getattr(info_audit_rows[0][-1], "obj", info_audit_rows[0][-1])
    assert info_audit_payload["after"]["canonical_name"] == "확인한 시금치"


def test_postgres_store_reloads_after_workspace_revision_conflict() -> None:
    connection = RevisionConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    connection.revision = repository._workspace_revision + 1
    repository.foods["local-only"] = _FoodRecord(_seed_foods()[0].model_copy(update={"id": "local-only"}))
    connection.force_conflict = True

    with pytest.raises(ConcurrentWorkspaceWriteError):
        repository.flush()

    assert repository._workspace_revision == connection.revision


def test_postgres_store_reloads_after_immediate_reprioritize_conflict() -> None:
    connection = RevisionConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    connection.revision = repository._workspace_revision + 1
    connection.force_conflict = True

    with pytest.raises(ConcurrentWorkspaceWriteError):
        repository.reprioritize()

    assert repository._workspace_revision == connection.revision


def test_postgres_store_adopts_the_winner_when_empty_bootstrap_races(monkeypatch) -> None:
    connection = RevisionConnection()
    calls = {"persist": 0}

    def raise_bootstrap_conflict(repository: PostgresStore) -> None:
        calls["persist"] += 1
        connection.revision = 1
        raise ConcurrentWorkspaceWriteError("another process bootstrapped the workspace")

    monkeypatch.setattr(PostgresStore, "_persist_all", raise_bootstrap_conflict)

    repository = PostgresStore("postgresql://test", workspace_id="guest-bootstrap", seed=True, connection=connection)

    assert calls["persist"] == 1
    assert repository._workspace_revision == 1
    assert repository.foods == {}


def test_postgres_store_refreshes_the_active_workspace_snapshot() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)

    repository.refresh()

    assert any("SELECT revision FROM rescue_api_workspace_revisions" in query for query, _ in connection.queries)
    assert any("SELECT id, payload FROM rescue_api_product_enrichment_jobs WHERE workspace_id = %s" in query for query, _ in connection.queries)
    assert any("SELECT id, payload FROM rescue_api_multi_day_meal_plans WHERE workspace_id = %s" in query for query, _ in connection.queries)
    assert any("SELECT id, payload FROM rescue_api_shopping_list WHERE workspace_id = %s" in query for query, _ in connection.queries)
    assert any("SELECT id, payload FROM rescue_api_shopping_receive_operations WHERE workspace_id = %s" in query for query, _ in connection.queries)
    assert any("SELECT payload FROM rescue_api_meal_preferences WHERE workspace_id = %s" in query for query, _ in connection.queries)


def test_normalized_inventory_adapter_writes_workspace_scoped_receipt_lot_and_event_rows() -> None:
    connection = FakeConnection()
    cursor = connection.cursor()
    purchased_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    receipt = ReceiptDraftResponse(
        id="receipt-1",
        fingerprint="fingerprint-1",
        status="committed",
        source_filename="receipt.jpg",
        purchased_at=purchased_at,
        lines=[
            ReceiptLineDraft(
                id="line-1",
                raw_name="시금치",
                barcode="08801114167523",
                canonical_name="시금치",
                quantity=1,
                unit="팩",
                unit_price=2980,
                total_price=2980,
                line_type="product",
                match_confidence=0.99,
                review_status="confirmed",
                storage_suggestion="refrigerated",
                match_source="local_rule",
                match_candidates=[{
                    "source": "local_rule",
                    "canonical_name": "시금치",
                    "confidence": 0.92,
                    "provenance_note": "fixture",
                }],
                source_observation_ids=["obs-1", "obs-2"],
            )
        ],
        stock_created=True,
    )
    food = _seed_foods()[0].model_copy(
        update={
            "id": "lot-1",
            "source_receipt_id": "receipt-1",
            "source_receipt_line_id": "receipt-1:line-1",
            "purchased_at": purchased_at,
            "quantity": 1,
            "opened_at": purchased_at,
            "storage_location_id": "location-1",
        }
    )
    food.date_assertion = food.date_assertion.model_copy(update={
        "applicable_storage_type": "refrigerated",
        "storage_condition_text": "0~10℃ 냉장보관",
    })
    event = StorageEventResponse(
        id="event-1",
        food_id="lot-1",
        event_type="moved",
            from_storage_type="refrigerated",
            to_storage_type="frozen",
            from_storage_location_id="location-1",
            to_storage_location_id="location-2",
            quantity=1,
        occurred_at=purchased_at,
    )
    transaction = CommitTransactionRecord(
        id="commit-1",
        receipt_id="receipt-1",
        fingerprint="fingerprint-1",
        status="committed",
        idempotency_key_digest="a" * 64,
        request_payload_fingerprint="b" * 64,
        created_lot_ids=["lot-1"],
        skipped_line_ids=["line-2"],
    )

    NormalizedInventoryAdapter("account-one").write_state(
        cursor,
        foods={food.id: _FoodRecord(food, purchased_at=purchased_at)},
        receipts={receipt.id: _ReceiptRecord(receipt)},
        storage_events=[event],
        commit_transactions={transaction.id: transaction},
    )

    lot_rows = next(rows for query, rows in connection.queries if "INSERT INTO rescue_inventory_lots" in query)
    event_rows = next(rows for query, rows in connection.queries if "INSERT INTO rescue_inventory_storage_events" in query)
    receipt_rows = next(rows for query, rows in connection.queries if "INSERT INTO rescue_inventory_receipts" in query)
    line_rows = next(rows for query, rows in connection.queries if "INSERT INTO rescue_inventory_receipt_lines" in query)
    transaction_rows = next(rows for query, rows in connection.queries if "INSERT INTO rescue_inventory_commit_transactions" in query)
    date_rows = next(rows for query, rows in connection.queries if "INSERT INTO rescue_inventory_date_assertions" in query)
    assert lot_rows[0][0] == "account-one"
    assert lot_rows[0][1] == "lot-1"
    assert lot_rows[0][4] == "receipt-1"
    assert lot_rows[0][5] == "receipt-1:line-1"
    assert lot_rows[0][9] == "location-1"
    assert lot_rows[0][18] == purchased_at
    assert receipt_rows[0][0] == "account-one"
    observation_ids = getattr(line_rows[0][-1], "obj", line_rows[0][-1])
    assert observation_ids == ["obs-1", "obs-2"]
    assert event_rows[0][0] == "account-one"
    assert event_rows[0][1] == "event-1"
    assert event_rows[0][5] == "location-1"
    assert event_rows[0][7] == "location-2"
    assert transaction_rows[0][0] == "account-one"
    assert transaction_rows[0][1] == "commit-1"
    assert getattr(transaction_rows[0][7], "obj", transaction_rows[0][7]) == "a" * 64
    assert getattr(transaction_rows[0][8], "obj", transaction_rows[0][8]) == "b" * 64
    assert getattr(transaction_rows[0][9], "obj", transaction_rows[0][9]) == ["lot-1"]
    assert getattr(transaction_rows[0][10], "obj", transaction_rows[0][10]) == ["line-2"]
    assert date_rows[0][12:] == ("refrigerated", "0~10℃ 냉장보관")


def test_normalized_inventory_adapter_reconstructs_compatibility_state() -> None:
    connection = FakeConnection()
    cursor = ReplayCursor(
        connection,
        {
            "SELECT product_key": [("spinach-key", "시금치")],
            "SELECT lot_id, product_key": [
                (
                    "lot-1",
                    "spinach-key",
                    None,
                    "receipt-1",
                    "receipt-1:line-1",
                    1,
                    "팩",
                        "refrigerated",
                        "location-1",
                        False,
                    None,
                    1,
                    "채소",
                    "시금치",
                    "국내산",
                    "/assets/food/spinach.png",
                    "테스트",
                    datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc),
                    None,
                    None,
                    {
                        "source": "mfds_c005",
                        "source_url": "https://example.test/c005",
                        "confidence": 0.8,
                        "note": "legacy product candidate",
                        "storage_hint": "refrigerated",
                        "source_freshness": "legacy",
                    },
                )
            ],
            "SELECT assertion_id": [
                (
                    "lot-1:current",
                    "lot-1",
                    0,
                    True,
                    "use_by",
                    date(2026, 9, 3),
                    "2026-09-03",
                    "label_ocr",
                    "포장지 표시",
                    1.0,
                    True,
                    "refrigerated",
                    "0~10℃ 냉장보관",
                )
            ],
            "SELECT lot_id, start_date": [(
                "lot-1",
                date(2026, 9, 3),
                date(2026, 9, 4),
                "rule",
                0.7,
                "확인",
                "rule-assisted-backend-inference",
                "priority-rules-v1",
                "priority.tofu.v1",
                ["rule-snapshot:local-reference/tofu/v1"],
                ["상품명에서 두부·콩 후보를 찾았습니다."],
                "a" * 64,
            )],
            "SELECT receipt_id, fingerprint": [(
                "receipt-1",
                "fingerprint-1",
                "receipt.jpg",
                datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc),
                "grocery-generic-v1",
                0.91,
                "동네마트",
                "committed",
                True,
            )],
            "SELECT receipt_id, line_id": [("receipt-1", "line-1", 1, "시금치", "08801114167523", "시금치", 1, "팩", 2980, 2980, "product", 0.99, "local_rule", [{"source": "local_rule", "canonical_name": "시금치", "confidence": 0.92, "provenance_note": "fixture"}], "confirmed", None, "refrigerated", ["obs-1", "obs-2"])],
            "SELECT event_id": [("event-1", "lot-1", "moved", "refrigerated", "location-1", "frozen", "location-2", 1, datetime(2026, 9, 2, 13, 0, tzinfo=timezone.utc), "user_input", None, None, "not_configured")],
            "SELECT transaction_id": [("commit-1", "receipt-1", "fingerprint-1", "committed", None, "not_configured", "a" * 64, "b" * 64, ["lot-1"], ["line-2"])],
        },
    )

    state = NormalizedInventoryAdapter("account-one").load_state(cursor)

    assert state.committed_fingerprints == {"fingerprint-1"}
    assert state.foods["lot-1"].response.canonical_name == "시금치"
    assert state.foods["lot-1"].response.source_receipt_line_id == "receipt-1:line-1"
    assert state.foods["lot-1"].response.storage_location_id == "location-1"
    assert state.foods["lot-1"].response.opened_at is None
    assert state.foods["lot-1"].response.product_provenance.source == "mfds_c005"
    assert state.foods["lot-1"].response.product_provenance.source_freshness == "legacy"
    assert state.foods["lot-1"].response.date_assertion.value == date(2026, 9, 3)
    assert state.foods["lot-1"].response.date_assertion.applicable_storage_type == "refrigerated"
    assert state.foods["lot-1"].response.date_assertion.storage_condition_text == "0~10℃ 냉장보관"
    assert state.receipts["receipt-1"].response.lines[0].canonical_name == "시금치"
    assert state.receipts["receipt-1"].response.lines[0].barcode == "08801114167523"
    assert state.receipts["receipt-1"].response.lines[0].storage_suggestion == "refrigerated"
    assert state.receipts["receipt-1"].response.lines[0].match_source == "local_rule"
    assert state.receipts["receipt-1"].response.lines[0].match_candidates[0].canonical_name == "시금치"
    assert state.receipts["receipt-1"].response.lines[0].source_observation_ids == ["obs-1", "obs-2"]
    assert state.receipts["receipt-1"].response.template_id == "grocery-generic-v1"
    assert state.receipts["receipt-1"].response.template_confidence == 0.91
    assert state.receipts["receipt-1"].response.merchant_name == "동네마트"
    assert state.foods["lot-1"].response.estimated_use_first_window.inference_trace.rule_id == "priority.tofu.v1"
    assert state.foods["lot-1"].response.estimated_use_first_window.inference_trace.input_sha256 == "a" * 64
    assert state.storage_events[0].to_storage_type == "frozen"
    assert state.storage_events[0].from_storage_location_id == "location-1"
    assert state.storage_events[0].to_storage_location_id == "location-2"
    assert state.commit_transactions["commit-1"].receipt_id == "receipt-1"
    assert state.commit_transactions["commit-1"].idempotency_key_digest == "a" * 64
    assert state.commit_transactions["commit-1"].request_payload_fingerprint == "b" * 64
    assert state.commit_transactions["commit-1"].created_lot_ids == ["lot-1"]
    assert state.commit_transactions["commit-1"].skipped_line_ids == ["line-2"]


def test_postgres_store_writes_mapping_audit_to_the_active_workspace() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    occurred_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    mapping = GrocyProductMappingResponse(
        canonical_name="곤약",
        grocy_product_id=42,
        grocy_unit="팩",
        source="user_confirmed",
        updated_by="account-one",
        updated_at=occurred_at,
    )
    repository.record_grocy_mapping_audit_event(
        GrocyProductMappingAuditEvent(
            id="grocy-mapping-audit-1",
            canonical_name="곤약",
            action="created",
            actor_id="account-one",
            actor_email=None,
            occurred_at=occurred_at,
            before=None,
            after=mapping,
        )
    )

    audit_params = next(
        params
        for query, params in connection.queries
        if "INSERT INTO rescue_api_grocy_mapping_audit_events" in query
        and isinstance(params, tuple)
        and params[0] == "account-one"
    )
    assert audit_params[0] == "account-one"
    assert audit_params[1] == "grocy-mapping-audit-1"
    assert "workspace_id, id, canonical_name, payload, occurred_at" in next(
        query for query, _ in connection.queries if "INSERT INTO rescue_api_grocy_mapping_audit_events" in query
    )


def test_postgres_store_outer_flush_rewrites_mapping_audit_event() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    occurred_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    mapping = GrocyProductMappingResponse(
        canonical_name="곤약",
        grocy_product_id=42,
        grocy_unit="팩",
        source="user_confirmed",
        updated_by="account-one",
        updated_at=occurred_at,
    )
    repository.record_grocy_mapping_audit_event(
        GrocyProductMappingAuditEvent(
            id="grocy-mapping-audit-outer-flush",
            canonical_name="곤약",
            action="created",
            actor_id="account-one",
            actor_email=None,
            occurred_at=occurred_at,
            before=None,
            after=mapping,
        ),
        persist=False,
    )
    repository.flush()

    audit_rows = next(
        params
        for query, params in connection.queries
        if "INSERT INTO rescue_api_grocy_mapping_audit_events" in query
        and isinstance(params, list)
        and params
    )
    assert audit_rows[0][0] == "account-one"
    assert audit_rows[0][1] == "grocy-mapping-audit-outer-flush"


def test_postgres_store_writes_notification_read_state_to_the_active_workspace() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    read_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    repository.mark_notification_read("food-date:milk:use_by:2026-09-02", read_at=read_at)

    read_params = next(
        params
        for query, params in connection.queries
        if "INSERT INTO rescue_api_notification_read_states" in query and params and params[0] == "account-one"
    )
    assert read_params[0] == "account-one"
    assert read_params[1] == "food-date:milk:use_by:2026-09-02"


def test_postgres_store_outer_flush_rewrites_notification_read_state() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    read_at = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)
    repository.mark_notification_read("notification-outer-flush", read_at=read_at, persist=False)
    repository.flush()

    read_rows = next(
        params
        for query, params in connection.queries
        if "INSERT INTO rescue_api_notification_read_states" in query
        and isinstance(params, list)
        and params
    )
    assert read_rows[0][0] == "account-one"
    assert read_rows[0][1] == "notification-outer-flush"


class ProductEnrichmentLeaseCursor(FakeCursor):
    def fetchone(self):
        query = self.connection.queries[-1][0]
        if "SELECT worker_id, expires_at FROM rescue_api_product_enrichment_worker_leases" in query:
            return None
        if "RETURNING lease_key" in query:
            return ("product-enrichment",)
        return (0,)


class ProductEnrichmentLeaseConnection(FakeConnection):
    def cursor(self):
        return ProductEnrichmentLeaseCursor(self)


def test_postgres_product_enrichment_lease_and_heartbeat_are_workspace_scoped() -> None:
    connection = ProductEnrichmentLeaseConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    now = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)

    assert repository.acquire_product_enrichment_worker_lease(
        lease_key="product-enrichment",
        worker_id="worker-one",
        lease_seconds=120,
        now=now,
    ) is True
    assert repository.renew_product_enrichment_worker_lease(
        lease_key="product-enrichment",
        worker_id="worker-one",
        lease_seconds=120,
        now=now,
    ) is True
    repository.record_product_enrichment_worker_heartbeat(ProductEnrichmentWorkerHeartbeatRecord(
        workspace_id="account-one",
        worker_id="worker-one",
        last_tick_at=now,
        lease_acquired=True,
        i1250_configured=False,
    ))
    assert repository.list_product_enrichment_worker_heartbeats() == []
    assert repository.release_product_enrichment_worker_lease(
        lease_key="product-enrichment",
        worker_id="worker-one",
    ) is True

    queries = [query for query, _ in connection.queries]
    assert any("rescue_api_product_enrichment_worker_leases" in query and "FOR UPDATE" in query for query in queries)
    assert any("ON CONFLICT (workspace_id, lease_key)" in query for query in queries)
    assert any("UPDATE rescue_api_product_enrichment_worker_leases" in query and "WHERE workspace_id = %s" in query for query in queries)
    assert any("DELETE FROM rescue_api_product_enrichment_worker_leases" in query and "WHERE workspace_id = %s" in query for query in queries)
    assert any("rescue_api_product_enrichment_worker_heartbeats" in query and "ON CONFLICT (workspace_id, worker_id)" in query for query in queries)
    heartbeat_query = next(query for query in queries if query.startswith("SELECT worker_id, payload FROM rescue_api_product_enrichment_worker_heartbeats"))
    heartbeat_params = next(params for query, params in connection.queries if query == heartbeat_query)
    assert heartbeat_params == ("account-one",)


def test_postgres_auth_repository_uses_persistent_account_and_revoke_tables() -> None:
    connection = FakeConnection()
    repository = PostgresAccountRepository("postgresql://test", connection=connection)
    repository.revoke_token("token-example")

    initialization_sql = connection.queries[0][0]
    assert "rescue_auth_accounts" in initialization_sql
    assert "rescue_auth_revoked_tokens" in initialization_sql
    assert "rescue_auth_password_reset_tokens" in initialization_sql
    assert "rescue_auth_rate_limit_events" in initialization_sql
    assert "role text NOT NULL DEFAULT 'user'" in initialization_sql
    assert "session_version integer NOT NULL DEFAULT 0" in initialization_sql
    assert "status text NOT NULL DEFAULT 'active'" in initialization_sql
    assert "deletion_started_at timestamptz" in initialization_sql
    assert any("ON CONFLICT (token_hash) DO NOTHING" in query for query, _ in connection.queries)
    assert repository.is_token_revoked("token-example") is True


def test_postgres_store_persists_export_audit_in_a_workspace_scoped_table() -> None:
    connection = FakeConnection()
    repository = PostgresStore("postgresql://test", workspace_id="account-one", seed=False, connection=connection)
    event = WorkspaceExportAuditEvent(
        id="export-audit-1",
        actor_id="account-1",
        actor_role="user",
        request_id="export-request-1",
        schema_version="rescue-meal-export-v1",
        exported_at=datetime(2026, 9, 12, 12, 30, tzinfo=timezone.utc),
    )

    repository.record_export_audit_event(event)

    query, params = next(
        (query, params)
        for query, params in connection.queries
        if "INSERT INTO rescue_api_export_audit_events" in query
    )
    assert "ON CONFLICT (workspace_id, id) DO NOTHING" in query
    assert params[0] == "account-one"
    assert params[1] == "export-audit-1"
    assert params[2:6] == ("account-1", "user", "export-request-1", "rescue-meal-export-v1")
    assert repository.export_audit_events == [event]


def test_postgres_auth_repository_can_leave_schema_creation_to_the_migration_runner() -> None:
    connection = FakeConnection()

    PostgresAccountRepository("postgresql://test", connection=connection, initialize_schema=False)

    assert connection.queries == []


def test_postgres_shared_modules_can_leave_schema_creation_to_the_migration_runner() -> None:
    constructors = (
        lambda connection: SharedProductLookupCache(connection, dialect="postgres", initialize_schema=False),
        lambda connection: SharedProductNameLookupCache(connection, dialect="postgres", initialize_schema=False),
        lambda connection: SharedProductProviderRateLimiter(connection, dialect="postgres", initialize_schema=False),
        lambda connection: SharedRecipeCatalogStore(postgres_connection=connection, initialize_schema=False),
    )

    for constructor in constructors:
        connection = FakeConnection()
        constructor(connection)
        assert not any("CREATE TABLE" in query.upper() for query, _ in connection.queries)


class SchemaCursor(FakeCursor):
    def __init__(self, connection, tables, columns, indexes) -> None:
        super().__init__(connection)
        self.tables = tables
        self.columns = columns
        self.indexes = indexes
        self.result = []

    def execute(self, query, params=None):
        super().execute(query, params)
        if "information_schema.tables" in query:
            self.result = [(table,) for table in self.tables]
        elif "information_schema.columns" in query:
            self.result = list(self.columns)
        elif "pg_indexes" in query:
            self.result = list(self.indexes)

    def fetchall(self):
        return self.result


class SchemaConnection(FakeConnection):
    def __init__(self, tables, columns, indexes=None) -> None:
        super().__init__()
        self.tables = tables
        self.columns = columns
        self.indexes = indexes if indexes is not None else [
            (table, index_name)
            for table in _REQUIRED_INDEXES
            for index_name in _REQUIRED_INDEXES[table]
        ]

    def cursor(self):
        return SchemaCursor(self, self.tables, self.columns, self.indexes)


class MigrationLedgerCursor(FakeCursor):
    def fetchall(self):
        return self.connection.migration_rows


class MigrationLedgerConnection(FakeConnection):
    def __init__(self, migration_rows) -> None:
        super().__init__()
        self.migration_rows = migration_rows

    def cursor(self):
        return MigrationLedgerCursor(self)


def test_postgres_readiness_requires_normalized_tables_and_trace_columns() -> None:
    tables = required_postgres_tables("normalized")
    columns = [
        (table, column)
        for table in tables
        for column in _REQUIRED_COLUMNS.get(table, set())
    ]

    check_postgres_schema(SchemaConnection(tables, columns), inventory_mode="normalized")


def test_postgres_readiness_covers_every_compatibility_projection_used_by_workspace_store() -> None:
    tables = set(required_postgres_tables("projection"))

    assert {
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
        "rescue_api_export_audit_events",
        "rescue_api_grocy_outbox",
        "rescue_api_grocy_worker_leases",
        "rescue_api_grocy_worker_heartbeats",
    } <= tables


def test_postgres_readiness_requires_the_complete_migration_ledger_baseline() -> None:
    complete = MigrationLedgerConnection([(name,) for name in MIGRATION_BASELINE_NAMES])
    check_postgres_migration_ledger(complete)

    incomplete = MigrationLedgerConnection([(name,) for name in MIGRATION_BASELINE_NAMES[:-1]])
    with pytest.raises(PostgresSchemaError):
        check_postgres_migration_ledger(incomplete)


def test_postgres_readiness_rejects_missing_schema() -> None:
    connection = SchemaConnection(required_postgres_tables("normalized")[:-1], [])

    with pytest.raises(PostgresSchemaError):
        check_postgres_schema(connection, inventory_mode="normalized")


def test_postgres_readiness_rejects_missing_inventory_search_indexes() -> None:
    tables = required_postgres_tables("projection")
    columns = [
        (table, column)
        for table in tables
        for column in _REQUIRED_COLUMNS.get(table, set())
    ]
    indexes = [("rescue_api_foods", "rescue_api_foods_search_text_trgm_idx")]

    with pytest.raises(PostgresSchemaError):
        check_postgres_schema(SchemaConnection(tables, columns, indexes), inventory_mode="projection")
