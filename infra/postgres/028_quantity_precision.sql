-- Keep the precision accepted by the API instead of rounding quantities on write.
-- Existing positivity constraints and numeric values are preserved.
ALTER TABLE rescue_inventory_receipt_lines ALTER COLUMN quantity TYPE numeric;
ALTER TABLE rescue_inventory_lots ALTER COLUMN quantity TYPE numeric;
ALTER TABLE rescue_inventory_storage_events ALTER COLUMN quantity TYPE numeric;
ALTER TABLE receipt_lines ALTER COLUMN quantity TYPE numeric;
ALTER TABLE receipt_lines ALTER COLUMN weight TYPE numeric;
ALTER TABLE stock_lots ALTER COLUMN quantity TYPE numeric;
ALTER TABLE storage_events ALTER COLUMN quantity TYPE numeric;
