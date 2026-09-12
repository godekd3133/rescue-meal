-- Durable receipt-commit idempotency metadata.
-- Keep the original migration immutable: existing installations receive these
-- fields additively, while the normalized projection remains replay-safe after
-- a process restart.

BEGIN;

ALTER TABLE rescue_inventory_commit_transactions
    ADD COLUMN IF NOT EXISTS idempotency_key_digest text;

ALTER TABLE rescue_inventory_commit_transactions
    ADD COLUMN IF NOT EXISTS request_payload_fingerprint text;

ALTER TABLE rescue_inventory_commit_transactions
    ADD COLUMN IF NOT EXISTS created_lot_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE rescue_inventory_commit_transactions
    ADD COLUMN IF NOT EXISTS skipped_line_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- A receipt can have a failed attempt followed by a successful retry. The
-- compatibility projection already keeps one row per transaction, so the
-- normalized projection must not collapse attempts to one receipt row. Do not
-- rely on PostgreSQL's generated constraint name: long table names are
-- truncated and differ across historical schema variants.
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'rescue_inventory_commit_transactions'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) LIKE '%receipt_id%'
    LOOP
        EXECUTE format(
            'ALTER TABLE rescue_inventory_commit_transactions DROP CONSTRAINT %I',
            constraint_name
        );
    END LOOP;
END
$$;

CREATE INDEX IF NOT EXISTS rescue_inventory_commit_transactions_receipt_idx
    ON rescue_inventory_commit_transactions (workspace_id, receipt_id);

COMMIT;
