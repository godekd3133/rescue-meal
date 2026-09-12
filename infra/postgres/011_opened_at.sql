-- Additive migration for the first-opened timestamp on inventory lots.
-- Existing opened lots stay nullable when no historical opening event exists.
ALTER TABLE rescue_inventory_lots
    ADD COLUMN IF NOT EXISTS opened_at timestamptz;

-- Recover a trustworthy first-opened timestamp where the append-only event
-- history already recorded it. Partial opening events point at the child lot;
-- full opening events point at the source lot.
WITH first_open AS (
    SELECT workspace_id, lot_id, MIN(occurred_at) AS opened_at
    FROM (
        SELECT workspace_id, food_id AS lot_id, occurred_at
        FROM rescue_inventory_storage_events
        WHERE event_type = 'opened'
        UNION ALL
        SELECT workspace_id, created_child_food_id AS lot_id, occurred_at
        FROM rescue_inventory_storage_events
        WHERE event_type = 'opened' AND created_child_food_id IS NOT NULL
    ) events
    GROUP BY workspace_id, lot_id
)
UPDATE rescue_inventory_lots AS lots
SET opened_at = first_open.opened_at
FROM first_open
WHERE lots.workspace_id = first_open.workspace_id
  AND lots.lot_id = first_open.lot_id
  AND lots.opened
  AND lots.opened_at IS NULL;
