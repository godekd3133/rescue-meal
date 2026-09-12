-- Additive compatibility migration for the GS1 date provenance source.
-- Migration 001 contains the same source in its fresh-install definition;
-- this file also updates existing volumes whose check constraint predates GS1.

BEGIN;

ALTER TABLE date_assertions
    DROP CONSTRAINT IF EXISTS date_assertions_date_source_check;

ALTER TABLE date_assertions
    ADD CONSTRAINT date_assertions_date_source_check
    CHECK (date_source IN ('gs1', 'gs1_ai_11', 'gs1_ai_13', 'gs1_ai_15', 'gs1_ai_16', 'gs1_ai_17', 'label_ocr', 'receipt_ocr', 'user_input', 'category_rule', 'unknown'));

COMMIT;
