-- Append-only audit trail for reviewed product source changes.

CREATE TABLE IF NOT EXISTS rescue_api_product_provenance_audit_events (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    food_id text NOT NULL,
    action text NOT NULL CHECK (action IN ('applied', 'replaced', 'removed')),
    occurred_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS rescue_api_product_provenance_audit_events_food_time_idx
    ON rescue_api_product_provenance_audit_events (workspace_id, food_id, occurred_at DESC, id DESC);
