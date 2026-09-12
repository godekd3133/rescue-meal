-- Additive compatibility projection for workspace meal/allergen preferences.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_meal_preferences (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

COMMIT;
