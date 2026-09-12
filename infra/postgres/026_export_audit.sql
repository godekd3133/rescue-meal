-- Record who generated a workspace export without placing audit metadata in
-- the downloaded snapshot. The table is append-only from the API's point of
-- view and is intentionally outside workspace revision writes so a read-only
-- export does not invalidate another device's mutation draft.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_export_audit_events (
    workspace_id text NOT NULL,
    id text NOT NULL,
    actor_id text NOT NULL,
    actor_role text NOT NULL CHECK (actor_role IN ('guest', 'user', 'recipe_admin')),
    request_id text NOT NULL,
    schema_version text NOT NULL CHECK (schema_version = 'rescue-meal-export-v1'),
    exported_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS rescue_api_export_audit_events_workspace_time_idx
    ON rescue_api_export_audit_events (workspace_id, exported_at DESC, id DESC);

COMMIT;
