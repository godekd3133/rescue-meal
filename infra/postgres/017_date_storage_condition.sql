-- Preserve the storage condition that a printed date assumes.
-- This is an advisory assertion only; it never rewrites the date or decides
-- whether the food is safe to eat.

BEGIN;

ALTER TABLE rescue_inventory_date_assertions
    ADD COLUMN IF NOT EXISTS applicable_storage_type text;

ALTER TABLE rescue_inventory_date_assertions
    ADD COLUMN IF NOT EXISTS storage_condition_text text;

DO $$
BEGIN
    ALTER TABLE rescue_inventory_date_assertions
        ADD CONSTRAINT rescue_inventory_date_assertions_storage_type_ck
        CHECK (applicable_storage_type IS NULL OR applicable_storage_type IN ('ambient', 'refrigerated', 'frozen'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
