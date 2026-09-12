-- Inventory search index
--
-- The API projection keeps the complete FoodResponse payload for compatibility,
-- while this additive column gives connected inventory search a bounded database
-- path. The normalized value is deliberately limited to searchable product
-- metadata; it never contains receipt OCR, purchase metadata, or credentials.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE rescue_api_foods
    ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '';

UPDATE rescue_api_foods
SET search_text = regexp_replace(
    lower(concat_ws(
        '',
        coalesce(payload ->> 'canonical_name', ''),
        coalesce(payload ->> 'display_name', ''),
        coalesce(payload ->> 'brand', ''),
        coalesce(payload ->> 'category', '')
    )),
    '[^0-9a-z가-힣]+',
    '',
    'g'
)
WHERE search_text = '';

CREATE INDEX IF NOT EXISTS rescue_api_foods_search_text_trgm_idx
    ON rescue_api_foods USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS rescue_api_foods_workspace_storage_idx
    ON rescue_api_foods (workspace_id, (payload ->> 'storage_type'));

COMMIT;
