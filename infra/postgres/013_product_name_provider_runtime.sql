-- Shared product-name enrichment cache and single-flight lease.
-- This is separate from barcode product-master cache because its payload and
-- cache key are query/limit based.

CREATE TABLE IF NOT EXISTS rescue_product_name_lookup_cache (
    cache_key text PRIMARY KEY,
    query text NOT NULL,
    payload jsonb NOT NULL,
    expires_at double precision NOT NULL,
    accessed_at double precision NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rescue_product_name_lookup_cache_expiry_idx
    ON rescue_product_name_lookup_cache (expires_at);

CREATE INDEX IF NOT EXISTS rescue_product_name_lookup_cache_access_idx
    ON rescue_product_name_lookup_cache (accessed_at);

CREATE TABLE IF NOT EXISTS rescue_product_name_lookup_leases (
    cache_key text PRIMARY KEY,
    owner_id text NOT NULL,
    lease_until double precision NOT NULL,
    acquired_at double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS rescue_product_name_lookup_leases_expiry_idx
    ON rescue_product_name_lookup_leases (lease_until);
