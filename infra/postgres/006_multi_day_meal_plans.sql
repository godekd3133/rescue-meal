-- Additive compatibility projection for saved multi-day meal plan bundles.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_multi_day_meal_plans (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

COMMIT;
