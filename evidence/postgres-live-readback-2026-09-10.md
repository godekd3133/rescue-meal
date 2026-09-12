# PostgreSQL live normalized readback — 2026-09-10

## Scope

This readback uses the canonical local project at
`/Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal` and a disposable
Docker Compose project named `rescue-meal-live-20260910`. The database was
published on host port `55432`; no existing Docker project, volume, or user
data was reused. The disposable project and its volume were removed after the
readback with the exact Compose project name.

The live lane is evidence for source-to-PostgreSQL behavior only. It does not
prove managed PostgreSQL failover, reverse-proxy response reset, production
backup retention/encryption, external Grocy delivery, or device acceptance.

## Daemon and migration gate

- Docker `desktop-linux` server responded normally after the earlier VM outage:
  Docker Desktop `4.50.0`, Engine `28.5.1`, Linux `arm64`, overlayfs.
- `pgvector/pgvector:pg16` became healthy on the disposable database.
- `infra/postgres/migrate.sh --apply` applied migrations **001→025**.
- A second `--apply` reported checksum-ledger skips for migrations 022–025 and
  the container-side query returned `rescue_schema_migrations = 25`.

## Normalized API read/write

The API ran with `RESCUE_MEAL_INVENTORY_MODE=normalized` and authentication,
rate limiting, and observability enabled.

- `/ready` returned `status=ready`, `database=ok`,
  `storage=postgresql-normalized-inventory`, `auth_required=true`.
- `/api/internal/metrics` returned bounded route/status/latency metrics and did
  not contain the observability token.
- A guest workspace was created and the seeded dashboard read back **7** foods.
- A custom refrigerated location, a food with `storage_location_id`, product
  provenance, and storage-condition metadata were persisted.
- Product-info correction cleared current provenance while preserving storage
  location, quantity, and date assertion; product-info/provenance audit events
  were read back.
- URL-encoded inventory search with the custom location filter returned the
  matching lot and the same location ID.
- A move event preserved the source location in history, and deleting that
  referenced location returned `409` with code `storage_location_in_use`.

## Concurrency and recovery smoke

The following scripts passed against the same disposable PostgreSQL instance:

- authentication retention: reset/revoked cleanup and fresh-row retention;
- two-connection full-snapshot concurrency: one commit, one stale conflict,
  one lot readback;
- workspace connection lifecycle: observed connections `3,4,4,4`, bounded
  base/auth/cache ownership, eviction/reopen persistence, active-purge guard,
  clean shutdown;
- operation pool: `max_size=2`, checkout timeout, persistence/reopen,
  idle-transaction `0`, shutdown connections `0`;
- multi-process receive, four rounds: same-key `201 initial + 201 replay`,
  payload conflict `201 + 409`, consumed-lot restart replay `409`;
- revision-lock crash-before-commit recovery;
- post-commit response-window crash recovery;
- receipt commit idempotency/restart: replay `200`, payload conflict `409`,
  one transaction/lot, old normalized one-receipt uniqueness constraint absent;
- receipt draft idempotency: one compatibility/normalized draft with replay;
- meal-plan idempotency: save replay, completion `completed + already_completed`,
  one saved/completed audit and three compatibility/normalized consumed events;
- manual-food idempotency/correction: restart replay, race `201 + 409`, one
  lot, date history and normalized assertion readback;
- account deletion fence and crash recovery: `423` during deletion, durable
  `deleting` recovery, old-token/login rejection, scoped rows `0`;
- direct PostgreSQL owner recovery: four terminated backends, readiness/auth
  read recovery, post-drop write, scoped account cleanup.

## New read-reconciliation fix

The first multi-process receive run exposed a real race: concurrent `GET
/api/shopping-list` requests both perform derived source reconciliation inside a
`WorkspaceMutation`; the losing process returned a workspace revision `409`
instead of completing a read. The route now adopts the winner's durable
snapshot and retries reconciliation **once**. A second conflict is still
returned; there is no merge or unbounded retry.

The seam is locked by `test_shopping_list_read_reconciliation_retries_after_concurrent_workspace_conflict` and the live four-round multi-process smoke
passed after the fix.

## Backup/restore lane

The disposable database was archived with the PostgreSQL 16 client inside the
database container. The archive was mode `600`, size `137893` bytes, and was
restored into a new empty database. Readback returned **59** normalized lots,
**2** storage-location rows, and the `storage_condition_text` column. The
archive was removed after verification. The repository backup script itself was
not run on the host because this macOS environment has no host `pg_dump`/`psql`
binary; the container-client readback is reported separately from that script
contract.

## Local-only companion verification

On the same target project, the final local readback was API **498 passed / 8
warnings**, PostgreSQL contract **30 passed**, fixture/mobile **35 passed + 2
skipped**, connected **99 passed**, protected runtime **28**, Vite **757
modules**, Sites **4**, service-worker **5**, workspace-sync **9**, and release
manifest **1**. These lanes remain separate claims from the disposable live
PostgreSQL evidence above.
