# PostgreSQL client wrapper readback — 2026-09-10

## Result

Passed for the local disposable Docker gate. The PostgreSQL backup and restore
scripts can now run when the host has no `pg_dump`, `pg_restore`, or `psql`,
provided that an approved Docker client image and reachable database are
available. The scripts still stop before archive mutation when neither a
complete host toolchain nor Docker is available.

## Change under test

- Added `infra/postgres/postgres-client.sh` with `auto`, `host`, and `docker`
  modes.
- `auto` selects host clients only when the required toolchain is complete;
  otherwise it selects Docker when the daemon is available.
- Docker mode defaults to `postgres:16-alpine`, supports an explicit client
  image and Compose network, mounts only the archive parent directory, and
  passes the DSN through `RESCUE_MEAL_DATABASE_URL` inside the client
  container rather than Docker command arguments.
- Docker Desktop host-loopback DSNs are mapped from `localhost`/
  `127.0.0.1` to `host.docker.internal`; service names such as `db` are
  preserved.
- `backup.sh` and `restore.sh` retain the client/server major-version guard,
  archive mode `600`, no-overwrite behavior, empty-target restore guard, and
  schema readback while routing every PostgreSQL client call through the
  wrapper.
- `infra/postgres/client-contract.sh` verifies shell syntax, path mounting,
  image/entrypoint selection, loopback DSN mapping, and that the DSN does not
  appear in fake Docker command arguments. The contract is also run by the
  `postgres-live` CI job before installing host PostgreSQL clients.

## Executed readback

1. `sh -n` passed for the wrapper, contract test, backup script, and restore
   script.
2. `sh infra/postgres/client-contract.sh` passed.
3. Docker server `28.5.1 linux/arm64` was available. A disposable
   `pgvector/pgvector:pg16` container was started with no persistent volume.
4. Ordered migrations `001→025` applied successfully to the disposable
   database.
5. Docker-mode `backup.sh` created a custom-format archive with:
   - size `123715` bytes;
   - mode `600`;
   - SHA-256
     `081036c0512c887ca813610ebc0385f7e4f83bcbfaf425ae6b73ed941c03c601b`;
   - reported client mode `docker`.
6. A normalized product and lot were inserted into the disposable source DB.
   The archive was restored into a newly created empty database through
   Docker-mode `restore.sh`; the script reported `schema: rescue-meal-ready`.
7. The restored database read back one matching normalized lot and the
   `storage_condition_text` column. A fresh empty-database restore also passed
   the schema check before the data-bearing archive run.
8. With `PATH=/usr/bin:/bin`, no host PostgreSQL clients, and no Docker on
   PATH, `postgres-client.sh --resolve-mode` exited `1` with the expected
   fail-closed message.
9. The disposable container and temporary archives were removed after the
   readback. No repository backup or production database was modified.

## Boundary

This proves the local wrapper, archive file contract, matching PostgreSQL 16
client/server path, and empty-target restore behavior. It does not prove
production object-storage encryption, retention/expiry, scheduler behavior,
managed PostgreSQL failover, network partition recovery, image-digest
approval, or production cutover ownership.
