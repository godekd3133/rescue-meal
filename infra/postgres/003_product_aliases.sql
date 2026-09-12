-- Workspace-scoped receipt-name aliases confirmed by a user during review.
-- The raw receipt name is normalized into raw_name_key for deterministic
-- lookup; the displayed raw_name is retained as a small audit/context field.
CREATE TABLE IF NOT EXISTS rescue_api_product_aliases (
    workspace_id text NOT NULL DEFAULT 'demo',
    raw_name_key text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, raw_name_key)
);

CREATE INDEX IF NOT EXISTS rescue_api_product_aliases_canonical_idx
    ON rescue_api_product_aliases (workspace_id, ((payload->>'canonical_name')));
