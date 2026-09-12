-- Shared product-master cache and provider outbound rate-limit window.
-- Product master data is safe to cache; individual package dates are never
-- stored in this projection.

CREATE TABLE IF NOT EXISTS rescue_product_lookup_cache (
    cache_key text PRIMARY KEY,
    barcode text NOT NULL,
    payload jsonb NOT NULL,
    expires_at double precision NOT NULL,
    accessed_at double precision NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rescue_product_lookup_cache_expiry_idx
    ON rescue_product_lookup_cache (expires_at);

CREATE INDEX IF NOT EXISTS rescue_product_lookup_cache_access_idx
    ON rescue_product_lookup_cache (accessed_at);

CREATE TABLE IF NOT EXISTS rescue_product_lookup_leases (
    cache_key text PRIMARY KEY,
    owner_id text NOT NULL,
    lease_until double precision NOT NULL,
    acquired_at double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS rescue_product_lookup_leases_expiry_idx
    ON rescue_product_lookup_leases (lease_until);

CREATE TABLE IF NOT EXISTS rescue_product_provider_rate_limit_events (
    provider text NOT NULL,
    occurred_at double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS rescue_product_provider_rate_limit_events_provider_time_idx
    ON rescue_product_provider_rate_limit_events (provider, occurred_at);
