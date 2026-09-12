-- Workspace-scoped user-defined storage locations.
-- `storage_type` remains the canonical temperature/inference class; the
-- location ID is an optional user-facing place such as a kimchi refrigerator
-- or pantry shelf.

BEGIN;

CREATE TABLE IF NOT EXISTS rescue_api_storage_locations (
    workspace_id text NOT NULL,
    id text NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS rescue_api_storage_locations_workspace_name_idx
    ON rescue_api_storage_locations (workspace_id, ((payload ->> 'name')));

ALTER TABLE rescue_inventory_lots
    ADD COLUMN IF NOT EXISTS storage_location_id text;

ALTER TABLE rescue_inventory_storage_events
    ADD COLUMN IF NOT EXISTS from_storage_location_id text;

ALTER TABLE rescue_inventory_storage_events
    ADD COLUMN IF NOT EXISTS to_storage_location_id text;

CREATE INDEX IF NOT EXISTS rescue_api_foods_workspace_storage_location_idx
    ON rescue_api_foods (workspace_id, ((payload ->> 'storage_location_id')));

CREATE INDEX IF NOT EXISTS rescue_inventory_lots_storage_location_idx
    ON rescue_inventory_lots (workspace_id, storage_location_id, priority, lot_id);

CREATE INDEX IF NOT EXISTS rescue_inventory_storage_events_location_time_idx
    ON rescue_inventory_storage_events (workspace_id, to_storage_location_id, occurred_at DESC);

COMMIT;
