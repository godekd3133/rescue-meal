# Local infrastructure baseline

`docker-compose.yml` starts PostgreSQL/pgvector, the Python 3.12 PaddleOCR
worker, and the FastAPI API. PostgreSQL applies
`postgres/001_initial_schema.sql` on a fresh volume.

The API selects the PostgreSQL projection adapter with
`RESCUE_MEAL_DATABASE_URL=postgresql://...`. API projection rows are scoped by
`workspace_id`, and account/revoked-token rows use the `rescue_auth_*` tables.
Saved recipe plans are stored in the workspace-scoped
`rescue_api_meal_plans` projection alongside the current food API projection.
The save/complete audit trail is stored in
`rescue_api_meal_plan_events`.
The normalized Product/Receipt/Lot read/write mapping remains a separate
production task.

The default FastAPI service still uses the deterministic in-memory repository.
SQLite is the verified local durable mode. PostgreSQL DSN selection and the
remote OCR URL are wired in code but have not been container-tested because the
local Docker daemon is off.
Grocy now has a read-only status endpoint and a separate HTTP adapter for
barcode lookup, stock add/consume/open/transfer. It remains a companion
adapter: receipt commit and storage events do not write to Grocy until product
ID mapping, outbox, transaction readback, and compensation behavior are
verified in a disposable environment.

The API can accept additional frontend origins through the comma-separated
`RESCUE_MEAL_CORS_ORIGINS` environment variable. Keep this list explicit in
production; do not replace it with a wildcard when credentials are enabled.

Docker daemon was not running during the 2026-09-01 validation, so this file has
only been syntax-checked where possible and has not been container-started.
