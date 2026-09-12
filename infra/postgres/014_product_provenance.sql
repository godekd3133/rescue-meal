-- Product candidate provenance is distinct from package-date assertions.
-- Existing rows remain valid with NULL; only reviewed candidate selections
-- write this JSONB snapshot.

ALTER TABLE rescue_inventory_lots
    ADD COLUMN IF NOT EXISTS product_provenance jsonb;
