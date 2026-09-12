-- Additive compatibility projection for user-confirmed shopping list items.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_shopping_list (
    workspace_id text NOT NULL DEFAULT 'demo',
    id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

COMMIT;
