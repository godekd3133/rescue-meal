-- Rescue Meal persistence baseline
--
-- This migration deliberately keeps product master, purchase lots, date
-- assertions, and storage events separate. It contains no safe_to_eat column.
-- Run inside one transaction when applying it to a real PostgreSQL instance.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text NOT NULL,
    category_id text,
    default_unit text NOT NULL DEFAULT '개',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_canonical_name_uq
    ON products (lower(canonical_name));

CREATE TABLE IF NOT EXISTS product_aliases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id),
    alias_type text NOT NULL CHECK (alias_type IN ('receipt_name', 'barcode', 'store_internal_sku', 'label_name')),
    value text NOT NULL,
    store_id text,
    source text NOT NULL CHECK (source IN ('user_confirmed', 'local_catalog', 'mfds', 'open_food_facts', 'model_candidate')),
    confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_aliases_lookup_uq
    ON product_aliases (alias_type, lower(value), coalesce(store_id, ''));

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_sha256 text NOT NULL,
    fingerprint text NOT NULL,
    fingerprint_version text NOT NULL DEFAULT 'receipt-fingerprint-v1',
    store_id text,
    receipt_number text,
    purchased_at timestamptz,
    total_amount integer,
    status text NOT NULL CHECK (status IN ('uploaded', 'extracting', 'review_required', 'confirmed', 'committed', 'rejected')),
    document_kind text NOT NULL DEFAULT 'unknown' CHECK (document_kind IN ('grocery_receipt', 'retail_beverage_receipt', 'restaurant_receipt', 'unknown')),
    ocr_engine text,
    ocr_model_version text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_receipts_committed_fingerprint_uq
    ON purchase_receipts (fingerprint_version, fingerprint)
    WHERE status = 'committed';

CREATE TABLE IF NOT EXISTS receipt_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
    line_number integer NOT NULL CHECK (line_number > 0),
    raw_text text NOT NULL,
    raw_name text NOT NULL,
    quantity numeric(12,3) CHECK (quantity IS NULL OR quantity > 0),
    unit text,
    weight numeric(12,3),
    unit_price integer,
    total_price integer,
    line_type text NOT NULL CHECK (line_type IN ('product', 'discount', 'refund', 'subtotal', 'payment', 'unknown')),
    matched_product_id uuid REFERENCES products(id),
    match_source text,
    match_confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (match_confidence >= 0 AND match_confidence <= 1),
    review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'excluded')),
    review_reason text,
    bbox jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receipt_id, line_number)
);

CREATE TABLE IF NOT EXISTS storage_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    storage_type text NOT NULL CHECK (storage_type IN ('ambient', 'refrigerated', 'frozen', 'custom')),
    temperature_celsius numeric(5,2),
    temperature_source text NOT NULL DEFAULT 'not_measured' CHECK (temperature_source IN ('sensor', 'user_input', 'not_measured')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_lots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id),
    parent_lot_id uuid REFERENCES stock_lots(id),
    source_receipt_line_id uuid REFERENCES receipt_lines(id),
    quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit text NOT NULL,
    purchased_at timestamptz,
    current_storage_location_id uuid REFERENCES storage_locations(id),
    current_state text NOT NULL DEFAULT 'unopened' CHECK (current_state IN ('unopened', 'opened', 'cooked', 'consumed', 'discarded', 'spoiled')),
    grocy_stock_id text,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS date_assertions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_lot_id uuid NOT NULL REFERENCES stock_lots(id) ON DELETE CASCADE,
    date_kind text NOT NULL CHECK (date_kind IN ('production_date', 'packaging_date', 'sell_by', 'best_before', 'use_by', 'user_reminder', 'estimated_use_first', 'unknown')),
    date_value date,
    date_source text NOT NULL CHECK (date_source IN ('gs1', 'gs1_ai_11', 'gs1_ai_13', 'gs1_ai_15', 'gs1_ai_16', 'gs1_ai_17', 'label_ocr', 'receipt_ocr', 'user_input', 'category_rule', 'unknown')),
    source_reference text,
    applicable_storage_type text CHECK (applicable_storage_type IS NULL OR applicable_storage_type IN ('ambient', 'refrigerated', 'frozen', 'custom')),
    storage_condition_text text,
    confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    user_confirmed boolean NOT NULL DEFAULT false,
    rule_id text,
    rule_version text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (date_kind IN ('unknown', 'estimated_use_first') OR date_value IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS date_assertions_lot_kind_idx
    ON date_assertions (stock_lot_id, date_kind, date_value);

CREATE TABLE IF NOT EXISTS rule_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id text NOT NULL,
    version text NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('reference_priority', 'storage_hint', 'ingredient_match')),
    jurisdiction text,
    source_name text NOT NULL,
    source_url text,
    source_revision text,
    content_sha256 text NOT NULL,
    active boolean NOT NULL DEFAULT false,
    retrieved_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (rule_id, version)
);

CREATE TABLE IF NOT EXISTS inference_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_lot_id uuid REFERENCES stock_lots(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    storage_type text CHECK (storage_type IS NULL OR storage_type IN ('ambient', 'refrigerated', 'frozen')),
    opened boolean NOT NULL DEFAULT false,
    provider text NOT NULL,
    provider_version text NOT NULL,
    input_sha256 text NOT NULL,
    output_json jsonb NOT NULL,
    evidence_rule_ids text[] NOT NULL DEFAULT '{}',
    abstained boolean NOT NULL,
    requires_confirmation boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inference_runs_product_time_idx
    ON inference_runs (lower(product_name), created_at DESC);

CREATE TABLE IF NOT EXISTS storage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_lot_id uuid NOT NULL REFERENCES stock_lots(id),
    event_type text NOT NULL CHECK (event_type IN ('purchased', 'moved', 'opened', 'frozen', 'thawed', 'split', 'merged', 'cooked', 'consumed', 'spoiled', 'discarded', 'adjusted')),
    from_location_id uuid REFERENCES storage_locations(id),
    to_location_id uuid REFERENCES storage_locations(id),
    quantity numeric(12,3) CHECK (quantity IS NULL OR quantity > 0),
    occurred_at timestamptz NOT NULL,
    source text NOT NULL CHECK (source IN ('receipt_ocr', 'label_ocr', 'gs1', 'user_input', 'system_reconciliation')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_events_lot_time_idx
    ON storage_events (stock_lot_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_storage_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'storage_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS storage_events_append_only_update ON storage_events;
CREATE TRIGGER storage_events_append_only_update
    BEFORE UPDATE OR DELETE ON storage_events
    FOR EACH ROW EXECUTE FUNCTION prevent_storage_event_mutation();

CREATE TABLE IF NOT EXISTS receipt_commit_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL UNIQUE REFERENCES purchase_receipts(id),
    fingerprint text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'committed', 'needs_reconciliation', 'rolled_back')),
    grocy_transaction_id text,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Temporary API projection used by the first PostgreSQL adapter. The domain
-- tables above remain the long-term source of truth; this projection lets the
-- current API migrate without changing its response contract in one release.
CREATE TABLE IF NOT EXISTS rescue_api_foods (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    search_text text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_receipts (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    committed boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_fingerprints (
    workspace_id text NOT NULL DEFAULT 'demo',
    fingerprint text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS rescue_api_storage_events (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_commit_transactions (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_meal_plans (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_meal_plan_events (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_recipe_drafts (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_recipe_review_events (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_grocy_mappings (
    workspace_id text NOT NULL DEFAULT 'demo',
    canonical_name text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, canonical_name)
);

CREATE TABLE IF NOT EXISTS rescue_api_grocy_mapping_audit_events (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    canonical_name text NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS rescue_api_grocy_mapping_audit_events_name_time_idx
    ON rescue_api_grocy_mapping_audit_events (workspace_id, canonical_name, occurred_at DESC);

CREATE TABLE IF NOT EXISTS rescue_api_notification_read_states (
    workspace_id text NOT NULL DEFAULT 'demo',
    notification_id text NOT NULL,
    read_at timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, notification_id)
);

CREATE TABLE IF NOT EXISTS rescue_api_notification_preferences (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL DEFAULT 'workspace',
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_push_subscriptions (
    workspace_id text NOT NULL DEFAULT 'demo',
    endpoint_hash text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, endpoint_hash)
);

CREATE TABLE IF NOT EXISTS rescue_api_notification_deliveries (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_notification_worker_leases (
    workspace_id text NOT NULL DEFAULT 'demo',
    lease_key text NOT NULL,
    worker_id text NOT NULL,
    acquired_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, lease_key)
);

CREATE TABLE IF NOT EXISTS rescue_api_notification_worker_heartbeats (
    workspace_id text NOT NULL DEFAULT 'demo',
    worker_id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, worker_id)
);

CREATE TABLE IF NOT EXISTS rescue_api_grocy_location_mappings (
    workspace_id text NOT NULL DEFAULT 'demo',
    storage_type text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, storage_type)
);

CREATE TABLE IF NOT EXISTS rescue_api_grocy_outbox (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_grocy_worker_leases (
    workspace_id text NOT NULL DEFAULT 'demo',
    lease_key text NOT NULL,
    worker_id text NOT NULL,
    acquired_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, lease_key)
);

CREATE TABLE IF NOT EXISTS rescue_api_grocy_worker_heartbeats (
    workspace_id text NOT NULL DEFAULT 'demo',
    worker_id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, worker_id)
);

CREATE TABLE IF NOT EXISTS rescue_api_workspace_revisions (
    workspace_id text PRIMARY KEY,
    revision bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Recipe catalog is shared across user inventory workspaces. User-specific
-- food, meal-plan, and receipt projections remain workspace-scoped above.
CREATE TABLE IF NOT EXISTS rescue_recipe_catalog_drafts (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rescue_recipe_catalog_review_events (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade installations created by the original single-workspace projection.
-- Existing rows are assigned to the demo workspace before the primary keys
-- are widened, so a second workspace can safely use the same logical IDs.
ALTER TABLE rescue_api_foods ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_receipts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_fingerprints ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_storage_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_commit_transactions ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_meal_plans ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_meal_plan_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_recipe_drafts ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_recipe_review_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_grocy_mappings ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_grocy_mapping_audit_events ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_grocy_location_mappings ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';
ALTER TABLE rescue_api_grocy_outbox ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'demo';

ALTER TABLE rescue_api_foods DROP CONSTRAINT IF EXISTS rescue_api_foods_pkey;
ALTER TABLE rescue_api_receipts DROP CONSTRAINT IF EXISTS rescue_api_receipts_pkey;
ALTER TABLE rescue_api_fingerprints DROP CONSTRAINT IF EXISTS rescue_api_fingerprints_pkey;
ALTER TABLE rescue_api_storage_events DROP CONSTRAINT IF EXISTS rescue_api_storage_events_pkey;
ALTER TABLE rescue_api_commit_transactions DROP CONSTRAINT IF EXISTS rescue_api_commit_transactions_pkey;
ALTER TABLE rescue_api_meal_plans DROP CONSTRAINT IF EXISTS rescue_api_meal_plans_pkey;
ALTER TABLE rescue_api_meal_plan_events DROP CONSTRAINT IF EXISTS rescue_api_meal_plan_events_pkey;
ALTER TABLE rescue_api_recipe_drafts DROP CONSTRAINT IF EXISTS rescue_api_recipe_drafts_pkey;
ALTER TABLE rescue_api_recipe_review_events DROP CONSTRAINT IF EXISTS rescue_api_recipe_review_events_pkey;
ALTER TABLE rescue_api_grocy_mappings DROP CONSTRAINT IF EXISTS rescue_api_grocy_mappings_pkey;
ALTER TABLE rescue_api_grocy_location_mappings DROP CONSTRAINT IF EXISTS rescue_api_grocy_location_mappings_pkey;
ALTER TABLE rescue_api_grocy_outbox DROP CONSTRAINT IF EXISTS rescue_api_grocy_outbox_pkey;

ALTER TABLE rescue_api_foods ADD CONSTRAINT rescue_api_foods_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_receipts ADD CONSTRAINT rescue_api_receipts_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_fingerprints ADD CONSTRAINT rescue_api_fingerprints_pkey PRIMARY KEY (workspace_id, fingerprint);
ALTER TABLE rescue_api_storage_events ADD CONSTRAINT rescue_api_storage_events_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_commit_transactions ADD CONSTRAINT rescue_api_commit_transactions_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_meal_plans ADD CONSTRAINT rescue_api_meal_plans_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_meal_plan_events ADD CONSTRAINT rescue_api_meal_plan_events_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_recipe_drafts ADD CONSTRAINT rescue_api_recipe_drafts_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_recipe_review_events ADD CONSTRAINT rescue_api_recipe_review_events_pkey PRIMARY KEY (workspace_id, id);
ALTER TABLE rescue_api_grocy_mappings ADD CONSTRAINT rescue_api_grocy_mappings_pkey PRIMARY KEY (workspace_id, canonical_name);
ALTER TABLE rescue_api_grocy_location_mappings ADD CONSTRAINT rescue_api_grocy_location_mappings_pkey PRIMARY KEY (workspace_id, storage_type);
ALTER TABLE rescue_api_grocy_outbox ADD CONSTRAINT rescue_api_grocy_outbox_pkey PRIMARY KEY (workspace_id, id);

CREATE TABLE IF NOT EXISTS rescue_auth_accounts (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    workspace_id text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'recipe_admin')),
    session_version integer NOT NULL DEFAULT 0 CHECK (session_version >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleting')),
    deletion_started_at timestamptz
);

ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE rescue_auth_accounts ADD COLUMN IF NOT EXISTS deletion_started_at timestamptz;

CREATE TABLE IF NOT EXISTS rescue_auth_revoked_tokens (
    token_hash text PRIMARY KEY,
    revoked_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS rescue_auth_password_reset_tokens (
    token_hash text PRIMARY KEY,
    account_id text NOT NULL REFERENCES rescue_auth_accounts(id) ON DELETE CASCADE,
    session_version integer NOT NULL CHECK (session_version >= 0),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    used_at timestamptz
);

CREATE INDEX IF NOT EXISTS rescue_auth_password_reset_account_idx
    ON rescue_auth_password_reset_tokens (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rescue_auth_rate_limit_events (
    bucket_key text NOT NULL,
    occurred_at double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS rescue_auth_rate_limit_events_bucket_time_idx
    ON rescue_auth_rate_limit_events (bucket_key, occurred_at);

COMMIT;
