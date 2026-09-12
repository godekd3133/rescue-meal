-- Durable account lifecycle fence for resumable account deletion.
-- Existing installations receive the columns additively; the account row is
-- retained in `deleting` state until its workspace and credentials are gone.

BEGIN;

ALTER TABLE rescue_auth_accounts
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE rescue_auth_accounts
    ADD COLUMN IF NOT EXISTS deletion_started_at timestamptz;

COMMIT;
