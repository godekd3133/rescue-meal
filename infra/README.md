# Local infrastructure baseline

`docker-compose.yml` starts PostgreSQL/pgvector, a one-shot `migrate` service,
the Python 3.12 PaddleOCR worker, and the FastAPI API. The API and worker
process images use explicit build contexts: the API image is built from the
repository root so the versioned recipe catalog is packaged into the image,
while the OCR image keeps its own `services/ocr-worker` context. The
`migrate` service
is the schema authority: it runs the checked-in `postgres/migrate.py` runner
against the database and applies `001→025` before the API is allowed to start.
The database container owns only the PostgreSQL data volume; its entrypoint
is not used as a second migration authority.

Existing PostgreSQL volumes need an explicit, ordered migration run because
Docker init SQL is not replayed after a volume has been created. The checked-in
runner defaults to a no-connect plan and prints only migration names and
checksums. An explicit `--apply` runs the `psycopg` runner through `uv`, holds
a PostgreSQL session-level advisory lock for the whole migration run, and
commits each migration body together with its ledger row. It creates the
`rescue_schema_migrations` ledger, records each applied file checksum, skips
an already-matching migration on later runs, and stops before execution when a
recorded checksum differs from the checked-in file:

```bash
sh infra/postgres/migrate.sh --dry-run
```

After taking a backup and reviewing the DSN, apply it explicitly with
`RESCUE_MEAL_DATABASE_URL` set in the secret-manager environment:

```bash
sh infra/postgres/migrate.sh --apply
```

If the Docker client lists `desktop-linux` but `_ping`/`docker info` hangs,
check Docker Desktop's VM console log and host Data-volume pressure before
running any cleanup. An ext4 journal or block `I/O error` followed by a
read-only remount means the Docker VM is not a safe target for `docker system
prune`, volume deletion, or reset. Preserve required Docker data, recover a
writable VM with the host operator's approved Docker Desktop procedure, and
then repeat the bounded daemon ping, Compose health, migration `001→025`, and
`/ready` read/write smoke. The Rescue Meal local verification mirror is not a
replacement for that live gate. A current diagnostic readback is in
[`evidence/docker-daemon-readiness-readback-2026-09-09.md`](../evidence/docker-daemon-readiness-readback-2026-09-09.md).

The ledger is deliberately created by the runner rather than by an application
request. A legacy volume with no ledger is bootstrapped by the ordered,
idempotent migration set on its first explicit apply; take a backup and review
the target DSN before doing so. The runner does not silently rewrite a changed
migration: create a new additive migration instead.

## Backup and restore

PostgreSQL backups use the custom archive format and are created with mode
600. The command reads the DSN from RESCUE_MEAL_DATABASE_URL, never prints
it, refuses to overwrite an existing file, and validates the archive with
pg_restore --list. The scripts use `infra/postgres/postgres-client.sh` to
select a complete client toolchain. `auto` (the default) uses host
`pg_dump`/`pg_restore`/`psql` only when all three are installed; otherwise it
uses the disposable `postgres:16-alpine` client image when Docker is
available. The client and server PostgreSQL major versions must match; the
script checks this before creating the archive:

```bash
mkdir -p /secure/backups/rescue-meal
RESCUE_MEAL_DATABASE_URL='postgresql://...' \
  sh infra/postgres/backup.sh \
  --output /secure/backups/rescue-meal/rescue-meal-$(date -u +%Y%m%dT%H%M%SZ).dump
```

On a macOS host without PostgreSQL client binaries, the same command can use
the Docker client explicitly. The wrapper mounts only the archive directory,
passes the DSN through the container environment rather than Docker command
arguments, and maps host-loopback DSNs to `host.docker.internal`:

```bash
RESCUE_MEAL_POSTGRES_CLIENT_MODE=docker \
RESCUE_MEAL_POSTGRES_CLIENT_IMAGE=postgres:16-alpine \
RESCUE_MEAL_DATABASE_URL='postgresql://...' \
  sh infra/postgres/backup.sh \
  --output /secure/backups/rescue-meal/rescue-meal-$(date -u +%Y%m%dT%H%M%SZ).dump
```

When the database is a Compose service, set
`RESCUE_MEAL_POSTGRES_CLIENT_DOCKER_NETWORK` to the Compose network and use
the service name (for example `db`) in the DSN. For a production operation,
pin `RESCUE_MEAL_POSTGRES_CLIENT_IMAGE` to an approved image digest and keep
the major-version guard enabled. If neither a complete host toolchain nor a
working Docker client is available, the scripts stop before creating or
changing an archive.

The backup contains workspace and account data, so the destination needs the
same access control and retention policy as the production database. Keep
backup paths outside the repository and do not paste the command or its DSN
into logs, tickets, or evidence.

Restore is deliberately limited to a newly provisioned empty PostgreSQL
database. It does not drop tables or modify an existing schema; the explicit
confirmation flag is required, and production additionally requires a second
confirmation flag:

```bash
RESCUE_MEAL_DATABASE_URL='postgresql://...' \
  sh infra/postgres/restore.sh \
  --input /secure/backups/rescue-meal/rescue-meal-20260904T000000Z.dump \
  --confirm-restore
```

After restore, run migrate.sh --apply, /ready, an authenticated inventory
read/write smoke test, and the Grocy reconciliation check before routing
traffic to the restored database. In production use
--confirm-production-restore only after the incident/change record names the
target database and traffic cutover owner. These scripts do not encrypt,
upload, expire, or delete backup objects; those controls belong to the
secret-manager/object-storage and legal-retention policy.

## Production-shaped container smoke

Run the disposable Compose packaging and API/OCR read-write gate with one
command:

```bash
sh infra/container-smoke.sh
```

The command builds the API, migration, and OCR worker images from the
repository root, applies migrations `001→025`, waits for PostgreSQL/OCR/API
health and readiness, authenticates a guest workspace, performs one normalized
inventory write, and verifies same-key idempotent replay. It uses a PID-scoped
project by default and refuses to reuse an existing project container, volume,
or network. On exit it removes only that project's containers, volumes,
network, and local Compose-built images. Override the project or host ports
with `RESCUE_MEAL_CONTAINER_SMOKE_PROJECT`,
`RESCUE_MEAL_CONTAINER_SMOKE_POSTGRES_PORT`,
`RESCUE_MEAL_CONTAINER_SMOKE_API_PORT`, and
`RESCUE_MEAL_CONTAINER_SMOKE_OCR_PORT`. The script never prints its smoke
credentials or access token. The same contract runs in the `container-boot`
CI job; it is not a managed-production readiness claim.

The runner requires a `postgresql://` or `postgres://` DSN, `uv`, and the API
project's locked `psycopg` dependency; it never accepts SQLite and never
prints the DSN. Follow the apply step with `/ready` and a real inventory
read/write smoke test.

The API selects the PostgreSQL projection adapter with
`RESCUE_MEAL_DATABASE_URL=postgresql://...`. API projection rows are scoped by
`workspace_id`, and account/revoked-token rows use the `rescue_auth_*` tables.
Saved recipe plans are stored in the workspace-scoped
`rescue_api_meal_plans` projection alongside the current food API projection.
The save/complete audit trail is stored in
`rescue_api_meal_plan_events`.

## Runtime observability

The API exposes a single token-protected Prometheus text scrape at
`GET /api/internal/metrics`. Set a strong server-only
`RESCUE_MEAL_OBSERVABILITY_TOKEN` and configure the collector with
`Authorization: Bearer <token>`. The response combines bounded HTTP
route/status/latency metrics with the existing product-provider and notification
worker metrics. It never includes query strings, resource IDs, workspace IDs,
payloads, or secrets; the counters are process-local and must be aggregated by
the external collector with a replica label.

Production preflight rejects a missing or weak observability token. Collector
retention, alert thresholds, multi-replica aggregation, and the failure behavior
of the collector itself remain deployment acceptance items. The full contract
and a Prometheus `credentials_file` example are in
[`docs/observability.md`](../docs/observability.md).
Workspace meal-planning preferences are stored separately in
`rescue_api_meal_preferences` from migration `008_meal_preferences.sql`; the
row is keyed by `(workspace_id, id)` and is included in readiness checks,
workspace export, and explicit guest-to-account transfer.
Inventory search in the PostgreSQL projection uses `search_text` from
`009_inventory_search.sql`. The column contains only normalized searchable
product metadata, with a `pg_trgm` GIN index and a workspace/storage index;
the API applies the workspace filter to both the count and bounded page query.
`/ready` fails closed when either search index is missing. Live `EXPLAIN` and
production latency still require a running database.
COOKRCP recipe review drafts and actor events are stored in the shared
`rescue_recipe_catalog_drafts` and `rescue_recipe_catalog_review_events`
projection. User inventory remains workspace-scoped; only drafts that pass the
protected recipe_admin approval gate are added to every user's planner in the
current API bridge.
The API defaults to the compatibility projection for local development. Set
`RESCUE_MEAL_INVENTORY_MODE=normalized` in a PostgreSQL deployment to use the
workspace-scoped `rescue_inventory_*` receipt/line/lot/date/event tables as the
inventory read/write path while the `rescue_api_*` rows remain a compatibility
projection. Migration `011_opened_at.sql` adds the nullable first-opened
timestamp and backfills it from existing `opened` storage events when the
event history contains one. Existing volumes need an explicit migration run;
Docker init scripts do not run again after a volume has been created.
Migration `012_product_provider_runtime.sql` adds the shared product-master
cache, short single-flight lookup lease, and provider rate-limit event window
used by multiple API workers; individual package dates are never stored there.
Migration `013_product_name_provider_runtime.sql` adds the separate shared
I1250 product-name cache and single-flight lease; its query/limit payload is
kept separate from barcode product-master records.
Migration `014_product_provenance.sql` adds the nullable `product_provenance`
JSONB snapshot to normalized inventory lots. It records the reviewed product
candidate source, confidence, source freshness, and optional storage hint;
it never replaces the package-specific `DateAssertion` or creates a
consumption-date claim.
Migration `015_product_provenance_audit.sql` adds the workspace-scoped,
append-only before/after event table used to explain product source changes.
It is included in workspace export and guest-to-account transfer, and does not
store provider API keys or receipt OCR raw text.
Migration `016_product_info_audit.sql` adds the workspace-scoped, append-only
before/after event table used when a user corrects a saved lot's canonical name,
brand, or category. A product-profile correction clears the current product
provenance, but keeps the lot quantity, storage state, and package-date
assertion unchanged. The audit is included in workspace export and explicit
guest-to-account transfer; ordinary projection flushes do not rewrite it.
Migration `017_date_storage_condition.sql` adds the optional storage condition
and human-readable condition text to normalized date assertions. When a label
provides a refrigerated, frozen, or ambient condition, the API preserves it;
the frontend compares it with the current lot location and shows an advisory
mismatch warning without changing the date or making a safety decision.
Migration `018_receipt_line_barcode.sql` adds the nullable receipt-line GTIN
column to both the compatibility and normalized receipt projections. The API
normalizes a valid GTIN to its 14-digit form at the receipt input/override
boundary; store-internal, restricted-circulation, and GS1 carrier strings do
not become receipt product identifiers. The migration also updates the
normalized match-source allowlist for reviewed C005/Open Food Facts candidates.

Migration `019_shopping_receive_operations.sql` adds the workspace-scoped
durable idempotency ledger for user-confirmed shopping-list receives. It is
separate from inventory lots so a retry remains identifiable even after the
received lot is consumed or discarded; the raw client idempotency key is never
stored.

Migration `020_receipt_commit_idempotency.sql` adds the normalized projection's
receipt-commit idempotency digest, request fingerprint, and committed lot/skip
lists. It also removes the old normalized-only one-receipt constraint so a
failed commit attempt and its later retry can both remain auditable. The raw
client key is never stored; replay is allowed only for the same key and exact
request payload.

Migration `021_account_deletion_fence.sql` adds the durable account lifecycle
fence used by resumable deletion. An account moves from `active` to `deleting`
before its workspace is purged; while that state remains, normal account
authentication and workspace writes fail closed, while the same-session delete
request can retry the purge and credential removal. The row is removed only
after both steps complete, so a process crash or partial failure does not leave
an apparently active account attached to an empty workspace.

Migration `022_receipt_review_metadata.sql` adds normalized receipt review
metadata for `template_id`, `template_confidence`, and `merchant_name`.
Compatibility JSON already contained these fields, but normalized mode must
preserve them across API restart so a resumed review does not lose its
merchant/template provenance. Existing volumes require the explicit ordered
migration runner; Docker init SQL is not replayed.

Migration `023_manual_food_idempotency.sql` adds the workspace-scoped replay
ledger for manual food create/correction commands. It stores only the
validated request fingerprint and `Idempotency-Key` digest, never the raw key.
The ledger prevents a network retry from creating a second manual lot and
prevents a consumed/deleted lot from being recreated by replay. Existing
volumes require the explicit ordered migration runner; Docker init SQL is not
replayed.

Migration `024_recipe_catalog_revision.sql` adds the shared recipe catalog's
optimistic revision row. It is separate from user workspace revisions so two
recipe administrators cannot silently overwrite each other's draft or review
audit changes. Existing volumes require the explicit ordered migration runner;
the API does not create this production table on a request path.

Migration `025_storage_locations.sql` adds workspace-scoped user-defined storage
locations and the normalized lot/event location references. The canonical
`ambient`/`refrigerated`/`frozen` class remains separate from an optional
location such as `김치냉장고`; this lets the API validate temperature class
without turning a user label into a new safety rule. Existing volumes require
the explicit ordered migration runner; the API does not create this production
table on a request path.

PostgreSQL projection writes use a workspace revision row to reject stale
full-snapshot flushes. On a revision conflict the API reloads the workspace
and returns HTTP 409 so the caller can refresh and retry; it never silently
merges or overwrites another process's inventory mutation.

The API initializes PostgreSQL projection schema once during process startup.
Creating a new account workspace does not run request-path DDL; it only opens
the workspace-scoped store and persists its initial state. Independent
PostgreSQL read cursors explicitly end psycopg's implicit transaction so a
normal `/ready`, auth, workspace refresh, or catalog read does not leave an
`idle in transaction` snapshot that can interfere with schema maintenance.

The disposable live contract for account restart persistence, session rotation,
workspace purge, and this read-transaction boundary is recorded in
`evidence/postgres-auth-live-readback-2026-09-04.md`.

Durable workspace stores use an explicit request/worker lease. After the last
lease is released, the router retains only the oldest
`RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE` idle snapshot stores (default `16`,
bounded to `1..256`) and closes evicted stores. PostgreSQL workspace operations
use a separate `PostgresOperationPool`, configured by
`RESCUE_MEAL_POSTGRES_POOL_*`; the pool max is a per-process physical
connection cap for workspace operations, not a cap for the base/auth/shared
connections. `PooledConnectionProxy` holds one checkout from cursor start
through commit/rollback so full-snapshot writes remain atomic on one
connection. In-memory stores are not evicted because their close would also
discard their only data copy. The FastAPI lifespan closes the router/pool,
PostgreSQL auth repository, and configured Grocy client during process
shutdown. The disposable lifecycle check is recorded in
`evidence/postgres-connection-lifecycle-readback-2026-09-04.md`; pool
exhaustion, persistence, idle-transaction cleanup, and shutdown are recorded
in `evidence/postgres-operation-pool-readback-2026-09-04.md`. The full contract
is in `docs/postgres-connection-lifecycle.md`.

`/health` is a liveness check; `/ready` checks the configured local database
connection, verifies the required PostgreSQL schema in the active inventory
mode, verifies the auth secret when auth is required, and reports whether
Grocy is configured without making Grocy a required dependency. The
API Compose healthcheck uses `/ready`, so a container with a missing required
auth secret is not marked healthy. Set `RESCUE_MEAL_ACCESS_LOG=true` to emit
JSON access records containing only request ID, method, path, status, and
duration. Frontend render recovery events use the separate
`RESCUE_MEAL_CLIENT_ERROR_LOG` setting and emit only surface, error kind,
release, and request ID; secure mode applies the client-error rate limit.

## Production preflight

Before a production deployment, run the configuration gate from the API
project with the real secret-manager environment loaded:

```bash
cd services/api
uv run python scripts/preflight_production.py --mode production
```

The preflight checks PostgreSQL/normalized inventory, authentication and
persistent rate limiting, non-default secrets, HTTPS CORS and password-reset
delivery configuration, enabled external product providers, provider runtime
rate-limit bounds, cache namespaces, API version, HTTPS base URLs, and a
production contact User-Agent. It never
prints secret values and does not replace database/provider connectivity
smoke tests. Add `--strict` when optional VAPID/Grocy/worker warnings should
also fail the release gate.

It also requires the PostgreSQL capacity contract:
`RESCUE_MEAL_POSTGRES_PROCESS_COUNT` is the maximum number of concurrently
running API processes (including both sides of a rolling deploy),
`RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS` is operational headroom, and
`RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS` must match the database server setting.
The gate rejects a deployment when
`process_count * (2 base/auth + pool_max_size) + reserved_connections` exceeds
`max_connections`. The capacity values do not open a database connection;
verify the live server value with the PostgreSQL smoke step before release.

The API image runs the same preflight automatically when
`RESCUE_MEAL_ENVIRONMENT=production`; `local` (the Compose default) keeps the
development startup path. A production container therefore exits before
Uvicorn starts if a required configuration gate fails.

The API notification center derives date checks, estimated-priority prompts,
and actionable Grocy outbox states from the active workspace. Per-notification
read timestamps, workspace notification preferences, hashed Web Push
subscription records, and notification delivery outbox/heartbeat records are
persisted in workspace-scoped tables. The optional notifications profile sends
push messages only when VAPID credentials, worker token, subscription, and
`push_enabled` are all configured.

Grocy product mapping changes are stored separately as workspace-scoped
`GrocyProductMappingAuditEvent` records. Each event keeps the actor, timestamp,
and immutable `before`/`after` mapping snapshots; the API exposes them through a
read-only mapping-events endpoint. SQLite and PostgreSQL use a dedicated insert
path rather than rewriting this audit collection during ordinary projection
flushes.

Receipt-name aliases confirmed during review are stored in the workspace-scoped
`rescue_api_product_aliases` projection. They improve future draft candidates
only; they do not bypass the receipt review/commit gate.

The optional `product-enrichment-worker` profile runs the I1250 product-name
enrichment queue. It receives only the service token and explicit workspace
allowlist; MFDS API credentials remain in the API container. A job updates
receipt-line reference candidates only and never creates a stock lot or date
assertion. Queue state, stale in-flight recovery, retry/dead-letter status, and
worker heartbeat are persisted in workspace-scoped `rescue_api_*` tables.

The default FastAPI service still uses the deterministic in-memory repository.
SQLite is the verified local durable mode. PostgreSQL DSN selection and the
remote OCR URL are wired in code but have not been container-tested because the
local Docker daemon is off.
Grocy now has a read-only status endpoint and a separate HTTP adapter for
barcode lookup, stock add/consume/open/transfer. It remains a companion
adapter: local receipt commit and storage events create a product/unit/location
aware outbox, and only the explicit processor writes to Grocy. Dead-letter
records can be explicitly requeued with an operator note; stale in-flight
records are moved to an operator reconciliation state without another
external call. Automated worker scheduling and compensation behavior still
need a disposable live environment.

`grocy-worker` is now a separate optional Compose service (`docker compose --profile grocy up`). It receives an explicit
comma-separated `RESCUE_MEAL_GROCY_WORKSPACE_IDS` list and calls the API's
service-token-protected worker tick. The API acquires a database-backed
`grocy-outbox` lease per workspace, scans stale in-flight rows, processes
pending rows in one bounded tick, and records a heartbeat. Set the list
deliberately; the worker never discovers or guesses tenant scope. `--once`
runs one deterministic tick for a scheduled-job or smoke-test invocation. If
multiple worker replicas run, give each a unique `RESCUE_MEAL_GROCY_WORKER_ID`.

API tick이 HTTP 200을 반환하더라도 response body에 `error`가 있으면 worker cycle을
실패로 기록합니다. `--once`는 exit code `1`로 종료하고, 장기 실행은 고정 interval로
API를 두드리지 않도록 최대 300초의 bounded exponential backoff를 사용하며 정상
cycle에서 기본 interval로 복구합니다. 이 backoff는 scheduler 재호출만 제어하고
Grocy outbox의 lease·transaction·reconciliation 계약을 바꾸지 않습니다.

The API can accept additional frontend origins through the comma-separated
`RESCUE_MEAL_CORS_ORIGINS` environment variable. Keep this list explicit in
production; do not replace it with a wildcard when credentials are enabled.
When `RESCUE_MEAL_AUTH_REQUIRED=true`, local development origins are not added
automatically; set the exact HTTPS frontend origin(s) explicitly. Optional
local mode keeps `127.0.0.1:4173` and `localhost:4173` as development defaults.

Compose passes `RESCUE_MEAL_AUTH_SECRET` and `RESCUE_MEAL_AUTH_REQUIRED` to the
API container. The Compose default is `RESCUE_MEAL_AUTH_REQUIRED=true`; set a
real secret through the local environment or secret manager before allowing
guest/account traffic. Local development can explicitly set it to `false`.

Password recovery delivery is also passed through to the API with
`RESCUE_MEAL_PASSWORD_RESET_BASE_URL`, `RESCUE_MEAL_EMAIL_PROVIDER_URL`,
`RESCUE_MEAL_EMAIL_PROVIDER_TOKEN`, and
`RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS`, `RESCUE_MEAL_EMAIL_MAX_ATTEMPTS`, and
`RESCUE_MEAL_EMAIL_RETRY_BACKOFF_SECONDS`. The API retries only bounded
transient failures and sends a token-derived idempotency key that contains no
reset token. Leave the provider values empty to keep the generic reset-request
contract enabled without sending mail.

Public guest/register/login/reset endpoints use a bounded rate limiter in the
secure Compose profile. Its defaults are 20 requests per 60 seconds per
client/identity bucket and `Retry-After` is returned on `429`. Persistent
SQLite/PostgreSQL auth repositories store opaque bucket events and use an
atomic database transaction (PostgreSQL advisory locks per bucket) across API
processes; in-memory mode remains process-local and is intended only for
fixture development.

The optional `notifications` profile starts `notification-worker`, which calls
the service-token-protected API tick for the explicitly listed
`RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS`. VAPID private key/subject stay in
the API container because the API owns subscription lookup and Web Push
encryption. Leave the worker token or VAPID settings empty to keep delivery
disabled while retaining the in-app notification center.

Compose passes optional `FOODSAFETY_COOKRCP_API_KEY` and
`RESCUE_MEAL_RECIPE_REVIEW_TOKEN` values to the API container without storing
their values in the repository. Leave them empty to keep public recipe import
and operator review disabled.

Docker daemon was not running during the 2026-09-01 validation, so this file has
only been syntax-checked where possible and has not been container-started.
Follow-up on 2026-09-03 started Docker Desktop and pulled the `pgvector/pg16`
image, but both the Compose `db` service and a bind-mount-free PostgreSQL smoke
container remained in `Created` after the Docker API `start` call. This is not
enough to claim live PostgreSQL readiness; the exact attempt and cleanup are
recorded in the [production preflight readback](../evidence/production-preflight-readback-2026-09-03.md).
