-- Durable idempotency records for manual food create/correction commands.
-- The original Idempotency-Key is never stored; the API persists only the
-- digest and the validated request fingerprint inside the JSON record.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_manual_food_operations (
    workspace_id text NOT NULL,
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS rescue_api_manual_food_operations_workspace_time_idx
    ON rescue_api_manual_food_operations (workspace_id, created_at DESC, id DESC);

COMMIT;
