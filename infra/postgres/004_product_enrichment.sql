-- Retryable receipt product-reference enrichment jobs.
-- Jobs are workspace-scoped and only mutate receipt draft provenance; they do
-- not create stock lots or date assertions.
BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_product_enrichment_jobs (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS rescue_api_product_enrichment_worker_leases (
    workspace_id text NOT NULL DEFAULT 'demo',
    lease_key text NOT NULL,
    worker_id text NOT NULL,
    acquired_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, lease_key)
);

CREATE TABLE IF NOT EXISTS rescue_api_product_enrichment_worker_heartbeats (
    workspace_id text NOT NULL DEFAULT 'demo',
    worker_id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, worker_id)
);

COMMIT;
