-- Durable idempotency records for user-confirmed shopping-list receives.
-- Keep this separate from inventory lots so a replay remains identifiable even
-- after the received lot is later consumed or discarded.

CREATE TABLE IF NOT EXISTS rescue_api_shopping_receive_operations (
  workspace_id text NOT NULL DEFAULT 'demo',
  id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);
