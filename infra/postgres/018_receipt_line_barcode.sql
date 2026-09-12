-- Preserve a receipt's normal GTIN independently from its product match.
-- A GTIN identifies a product record; it is not an individual package date.

BEGIN;

ALTER TABLE receipt_lines
    ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE rescue_inventory_receipt_lines
    ADD COLUMN IF NOT EXISTS barcode text;

-- 002 was applied before the Open Food Facts name fallback existed. Remove
-- both the inline and explicitly named legacy checks before installing the
-- additive source set used by the current compatibility projection.
ALTER TABLE rescue_inventory_receipt_lines
    DROP CONSTRAINT IF EXISTS rescue_inventory_receipt_lines_match_source_check;

ALTER TABLE rescue_inventory_receipt_lines
    DROP CONSTRAINT IF EXISTS rescue_inventory_receipt_lines_match_source_ck;

ALTER TABLE rescue_inventory_receipt_lines
    ADD CONSTRAINT rescue_inventory_receipt_lines_match_source_ck
    CHECK (match_source IN ('user_confirmed_alias', 'local_rule', 'parser', 'local_fixture', 'mfds_c005', 'mfds_i1250', 'open_food_facts', 'unmatched'));

COMMIT;
