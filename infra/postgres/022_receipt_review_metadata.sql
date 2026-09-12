-- Preserve safe receipt review metadata in the normalized projection.
-- Compatibility JSON already carries these fields, but normalized mode must
-- reconstruct the same review surface after an API restart.

BEGIN;

ALTER TABLE rescue_inventory_receipts
    ADD COLUMN IF NOT EXISTS template_id text NOT NULL DEFAULT 'generic-v1';

ALTER TABLE rescue_inventory_receipts
    ADD COLUMN IF NOT EXISTS template_confidence numeric(5,4) NOT NULL DEFAULT 0;

ALTER TABLE rescue_inventory_receipts
    ADD COLUMN IF NOT EXISTS merchant_name text;

DO $$
BEGIN
    ALTER TABLE rescue_inventory_receipts
        ADD CONSTRAINT rescue_inventory_receipts_template_id_ck
        CHECK (template_id IN (
            'grocery-mart-v1',
            'retail-beverage-v1',
            'restaurant-card-v1',
            'grocery-generic-v1',
            'generic-v1'
        ));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE rescue_inventory_receipts
        ADD CONSTRAINT rescue_inventory_receipts_template_confidence_ck
        CHECK (template_confidence >= 0 AND template_confidence <= 1);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

COMMIT;
