-- Durable undo marker for storage events.
-- `undone_at` records when a user reverted the event (the event row is kept
-- for history); `undo_snapshot` keeps the lot as it was before a consume or
-- discard so a full removal can be restored with the same lot ID.

BEGIN;

ALTER TABLE rescue_inventory_storage_events
    ADD COLUMN IF NOT EXISTS undone_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS undo_snapshot jsonb NULL;

COMMIT;
