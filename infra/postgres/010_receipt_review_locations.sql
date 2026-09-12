-- Preserve the safe receipt-review observation links in the normalized
-- inventory projection. OCR text and uploaded image bytes remain outside this
-- table; the IDs only connect a reviewed line to the transient intake payload.

BEGIN;

ALTER TABLE rescue_inventory_receipt_lines
    ADD COLUMN IF NOT EXISTS source_observation_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
