-- Optimistic revision for the shared recipe catalog.
-- The catalog is shared across user workspaces, so it needs its own
-- concurrency fence instead of reusing a workspace revision.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_recipe_catalog_revisions (
    id text PRIMARY KEY,
    revision bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rescue_recipe_catalog_revisions (id, revision)
VALUES ('catalog', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;
