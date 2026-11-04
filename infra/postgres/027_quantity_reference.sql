ALTER TABLE rescue_inventory_lots
    ADD COLUMN IF NOT EXISTS quantity_reference jsonb;
