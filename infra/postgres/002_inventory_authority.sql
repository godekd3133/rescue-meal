-- Inventory authority v1
--
-- This migration is additive. It gives the receipt -> lot -> event path a
-- workspace-scoped relational store while the legacy rescue_api_* JSON
-- projection remains available as a compatibility read model during rollout.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_inventory_products (
    workspace_id text NOT NULL,
    product_key text NOT NULL,
    canonical_name text NOT NULL,
    category text NOT NULL DEFAULT '기타',
    default_unit text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, product_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS rescue_inventory_products_name_uq
    ON rescue_inventory_products (workspace_id, lower(canonical_name));

CREATE TABLE IF NOT EXISTS rescue_inventory_receipts (
    workspace_id text NOT NULL,
    receipt_id text NOT NULL,
    fingerprint text NOT NULL,
    source_filename text NOT NULL,
    purchased_at timestamptz,
    status text NOT NULL CHECK (status IN ('uploaded', 'extracting', 'review_required', 'confirmed', 'committed', 'rejected')),
    stock_created boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, receipt_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS rescue_inventory_receipts_committed_fingerprint_uq
    ON rescue_inventory_receipts (workspace_id, fingerprint)
    WHERE status = 'committed';

CREATE TABLE IF NOT EXISTS rescue_inventory_receipt_lines (
    workspace_id text NOT NULL,
    receipt_id text NOT NULL,
    line_id text NOT NULL,
    line_number integer NOT NULL CHECK (line_number > 0),
    raw_name text NOT NULL,
    canonical_name text,
    quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit text NOT NULL,
    unit_price integer,
    total_price integer,
    line_type text NOT NULL CHECK (line_type IN ('product', 'discount', 'refund', 'subtotal', 'payment', 'unknown')),
    match_confidence numeric(5,4) NOT NULL CHECK (match_confidence >= 0 AND match_confidence <= 1),
    match_source text NOT NULL DEFAULT 'parser' CHECK (match_source IN ('user_confirmed_alias', 'local_rule', 'parser', 'mfds_i1250', 'unmatched')),
    match_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
    review_status text NOT NULL CHECK (review_status IN ('pending', 'confirmed', 'excluded')),
    review_reason text,
    storage_suggestion text CHECK (storage_suggestion IS NULL OR storage_suggestion IN ('ambient', 'refrigerated', 'frozen')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, receipt_id, line_id),
    UNIQUE (workspace_id, receipt_id, line_number),
    FOREIGN KEY (workspace_id, receipt_id)
        REFERENCES rescue_inventory_receipts (workspace_id, receipt_id)
        ON DELETE CASCADE
);

ALTER TABLE rescue_inventory_receipt_lines
    ADD COLUMN IF NOT EXISTS storage_suggestion text;

ALTER TABLE rescue_inventory_receipt_lines
    ADD COLUMN IF NOT EXISTS match_source text NOT NULL DEFAULT 'parser';

ALTER TABLE rescue_inventory_receipt_lines
    ADD COLUMN IF NOT EXISTS match_candidates jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    ALTER TABLE rescue_inventory_receipt_lines
        ADD CONSTRAINT rescue_inventory_receipt_lines_storage_suggestion_ck
        CHECK (storage_suggestion IS NULL OR storage_suggestion IN ('ambient', 'refrigerated', 'frozen'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE rescue_inventory_receipt_lines
        ADD CONSTRAINT rescue_inventory_receipt_lines_match_source_ck
        CHECK (match_source IN ('user_confirmed_alias', 'local_rule', 'parser', 'mfds_i1250', 'unmatched'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rescue_inventory_lots (
    workspace_id text NOT NULL,
    lot_id text NOT NULL,
    product_key text NOT NULL,
    parent_lot_id text,
    source_receipt_id text,
    source_receipt_line_id text,
    quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
    unit text NOT NULL,
    storage_type text NOT NULL CHECK (storage_type IN ('ambient', 'refrigerated', 'frozen')),
    opened boolean NOT NULL DEFAULT false,
    opened_at timestamptz,
    priority integer NOT NULL CHECK (priority > 0),
    category text NOT NULL DEFAULT '기타',
    display_name text NOT NULL,
    brand text NOT NULL,
    image_path text NOT NULL,
    note text NOT NULL,
    purchased_at timestamptz,
    barcode text,
    barcode_lot text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, lot_id),
    FOREIGN KEY (workspace_id, product_key)
        REFERENCES rescue_inventory_products (workspace_id, product_key)
);

ALTER TABLE rescue_inventory_lots
    ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE rescue_inventory_lots
    ADD COLUMN IF NOT EXISTS barcode_lot text;

CREATE INDEX IF NOT EXISTS rescue_inventory_lots_product_idx
    ON rescue_inventory_lots (workspace_id, product_key, priority, lot_id);

CREATE TABLE IF NOT EXISTS rescue_inventory_date_assertions (
    workspace_id text NOT NULL,
    assertion_id text NOT NULL,
    lot_id text NOT NULL,
    sequence integer NOT NULL CHECK (sequence >= 0),
    is_current boolean NOT NULL DEFAULT false,
    kind text NOT NULL CHECK (kind IN ('production_date', 'packaging_date', 'sell_by', 'use_by', 'best_before', 'unknown', 'estimated_use_first', 'user_reminder')),
    date_value date,
    display_label text NOT NULL,
    source text NOT NULL CHECK (source IN ('label_ocr', 'gs1', 'user_input', 'category_rule', 'receipt_ocr', 'unknown')),
    source_detail text NOT NULL,
    confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    user_confirmed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, assertion_id),
    UNIQUE (workspace_id, lot_id, sequence),
    FOREIGN KEY (workspace_id, lot_id)
        REFERENCES rescue_inventory_lots (workspace_id, lot_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS rescue_inventory_date_assertions_current_uq
    ON rescue_inventory_date_assertions (workspace_id, lot_id)
    WHERE is_current;

CREATE TABLE IF NOT EXISTS rescue_inventory_priority_windows (
    workspace_id text NOT NULL,
    lot_id text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    basis text NOT NULL,
    confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    safety_disclaimer text NOT NULL,
    inference_provider text,
    inference_provider_version text,
    inference_rule_id text,
    inference_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    inference_reasoning jsonb NOT NULL DEFAULT '[]'::jsonb,
    inference_input_sha256 text,
    PRIMARY KEY (workspace_id, lot_id),
    CHECK (end_date >= start_date),
    FOREIGN KEY (workspace_id, lot_id)
        REFERENCES rescue_inventory_lots (workspace_id, lot_id)
        ON DELETE CASCADE
);

ALTER TABLE rescue_inventory_priority_windows
    ADD COLUMN IF NOT EXISTS inference_provider text;

ALTER TABLE rescue_inventory_priority_windows
    ADD COLUMN IF NOT EXISTS inference_provider_version text;

ALTER TABLE rescue_inventory_priority_windows
    ADD COLUMN IF NOT EXISTS inference_rule_id text;

ALTER TABLE rescue_inventory_priority_windows
    ADD COLUMN IF NOT EXISTS inference_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE rescue_inventory_priority_windows
    ADD COLUMN IF NOT EXISTS inference_reasoning jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE rescue_inventory_priority_windows
    ADD COLUMN IF NOT EXISTS inference_input_sha256 text;

-- A consumed/discarded lot may be removed from the current inventory read
-- model, so events intentionally retain their workspace-scoped string ID
-- without a cascading FK to the active-lot table.
CREATE TABLE IF NOT EXISTS rescue_inventory_storage_events (
    workspace_id text NOT NULL,
    event_id text NOT NULL,
    food_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('moved', 'opened', 'frozen', 'thawed', 'consumed', 'discarded')),
    from_storage_type text CHECK (from_storage_type IS NULL OR from_storage_type IN ('ambient', 'refrigerated', 'frozen')),
    to_storage_type text CHECK (to_storage_type IS NULL OR to_storage_type IN ('ambient', 'refrigerated', 'frozen')),
    quantity numeric(12,3) CHECK (quantity IS NULL OR quantity > 0),
    occurred_at timestamptz NOT NULL,
    source text NOT NULL DEFAULT 'user_input' CHECK (source = 'user_input'),
    created_child_food_id text,
    meal_plan_id text,
    grocy_sync_status text NOT NULL DEFAULT 'not_configured',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, event_id)
);

CREATE INDEX IF NOT EXISTS rescue_inventory_storage_events_food_time_idx
    ON rescue_inventory_storage_events (workspace_id, food_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS rescue_inventory_commit_transactions (
    workspace_id text NOT NULL,
    transaction_id text NOT NULL,
    receipt_id text NOT NULL,
    fingerprint text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'committed', 'needs_reconciliation', 'rolled_back')),
    error_code text,
    grocy_sync_status text NOT NULL DEFAULT 'not_configured',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, transaction_id),
    UNIQUE (workspace_id, receipt_id),
    FOREIGN KEY (workspace_id, receipt_id)
        REFERENCES rescue_inventory_receipts (workspace_id, receipt_id)
        ON DELETE CASCADE
);

COMMIT;
