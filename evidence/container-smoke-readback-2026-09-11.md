# Disposable Compose container smoke readback — 2026-09-11

## Result

Passed. The production-shaped Docker Compose boot/read-write check is now
reproducible through `infra/container-smoke.sh`. It builds the API, migration,
and OCR worker images, starts a disposable PostgreSQL-backed stack, verifies
health/readiness and normalized authenticated behavior, and removes the exact
project resources on exit.

## Script contract

`infra/container-smoke.sh`:

- creates a PID-scoped Compose project by default;
- refuses to reuse an existing project container, Compose volume, or Compose
  network with the same project label;
- allows explicit port/project overrides through environment variables;
- builds the API, migration, and OCR worker images from the canonical
  repository root;
- waits for API and OCR `/ready` responses;
- checks API `/health`, API `/ready`, and OCR `/ready` fields;
- checks migration ledger count `25`;
- performs guest authentication and workspace readback;
- writes one normalized manual-food record and verifies dashboard count
  increases by one;
- replays the same `Idempotency-Key` and requires `201` plus
  `X-Idempotency-Replayed: true`;
- never prints the disposable password, auth secret, or access token;
- removes containers, volumes, networks, and local Compose-built images with
  `down --volumes --remove-orphans --rmi local`, even after a failed smoke
  step.

## Executed readback

```bash
sh -n infra/container-smoke.sh
sh infra/container-smoke.sh
```

Final execution used project `rescue-meal-container-smoke-57186` and passed:

```text
Rescue Meal container smoke passed.
project: rescue-meal-container-smoke-57186
migration_rows: 25
api_health: ready
ocr_health: ready
guest_dashboard_foods: 7 -> 8
idempotency_replay: 201 + X-Idempotency-Replayed=true
```

The stack included PostgreSQL 16, the ordered migration service, the pinned
amd64 OCR worker, and the API image with the packaged recipe catalog. The
script's cleanup was then checked explicitly:

- `docker compose ... ps -a` returned no containers;
- project-label volume query returned no volumes;
- project-label network query returned no networks;
- project-tagged `rescue-meal-container-smoke-57186-*` images were absent.

The same script is connected to the `container-boot` CI job with a 20-minute
timeout. This makes the previously manual post-fix `/ready` and read/write
smoke a repeatable release contract rather than a one-off local command.

## Boundary

This proves local disposable Compose packaging, service dependency ordering,
health/readiness, normalized API access, and same-key replay. It does not prove
managed PostgreSQL failover, production network partition recovery, external
object-storage encryption/retention, provider delivery, image digest approval,
or production traffic cutover.

## Current-source rerun after storage snapshot response

After `StorageEventResponse.inventory` was added, the same script was rerun with
project `rescue-meal-container-smoke-91136`:

```text
Rescue Meal container smoke passed.
project: rescue-meal-container-smoke-91136
migration_rows: 25
api_health: ready
ocr_health: ready
guest_dashboard_foods: 7 -> 8
idempotency_replay: 201 + X-Idempotency-Replayed=true
```

Exact project-label container, volume, network, and project-tagged image queries
returned no rows after cleanup. This confirms the packaged API/migrate/OCR stack
still boots after the additive storage response model change; it does not extend
the claim to managed production failover or external provider operations.

## Current-source rerun after response-only persistence separation

After the response-only `inventory` snapshot was kept out of durable storage
event payloads, the script was rerun with project `rescue-meal-container-smoke-2956`:

```text
Rescue Meal container smoke passed.
project: rescue-meal-container-smoke-2956
migration_rows: 25
api_health: ready
ocr_health: ready
guest_dashboard_foods: 7 -> 8
idempotency_replay: 201 + X-Idempotency-Replayed=true
```

Exact project-label container, volume, network, and project-tagged image queries
again returned no rows after cleanup. The event response snapshot is therefore
available to the client without becoming part of durable event history.
