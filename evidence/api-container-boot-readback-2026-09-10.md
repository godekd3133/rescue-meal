# API container boot readback — 2026-09-10

## Scope

This readback checks the production-shaped API image path used by
`infra/docker-compose.yml`: PostgreSQL, ordered migrations, the PaddleOCR
worker, and the FastAPI API. The stack uses a disposable Compose project and
does not reuse the unrelated local PostgreSQL container.

## Failure reproduced

The first disposable build started PostgreSQL, migrations, and the OCR worker,
but the API entered a restart loop before `/health` or `/ready` could respond.
The container log showed:

```text
Path(__file__).resolve().parents[3]
IndexError: 3
```

`services/api/app/planner.py` assumed the repository checkout depth. The image
places the module at `/app/app/planner.py`, so the fixed parent index does not
exist. This is a real container boot failure, not a test-fixture mismatch.

## Change applied

- Added `_resolve_recipe_fixture_path()` with an explicit
  `RESCUE_MEAL_RECIPE_CATALOG_PATH` override and source-tree/package-image
  candidate search.
- Added a regression test for the `/app/app/planner.py` + `/app/data/...`
  container layout.
- Changed the API/migration Compose build context to the repository root.
- Added a root `.dockerignore` that keeps the approved recipe catalog while
  excluding workspace data, caches, node modules, evidence, and unrelated
  service trees.
- Packages `data/fixtures/recipes/recipes-v1.json` into the API image.

## Verification

- Planner regression and API planner tests: passed.
- Full API suite after the fix: **499 passed, 8 warnings**.
- Web production build: passed, **757 Vite modules**.
- OCR worker unit suite: **10 passed**.
- Fixture/mobile targeted regression: **5 passed**.
- Connected E2E: **98 passed, 1 flaky label-review case in the full long run**;
  the failing label case passed in isolation and the two previously failing
  cases passed in a focused rerun.
- Compose config and PostgreSQL client-wrapper contract: passed.
- The rebuilt API and migration images completed successfully and the OCR
  worker reached `/health` and `/ready` before the API restart loop was fixed.

## Current boundary

After the image fix, the Docker daemon became unavailable before the recreated
API container's post-fix `/ready` and authenticated read/write smoke could be
captured. The container boot gate is therefore **blocked**, not claimed as
passed. Start the Docker daemon and rerun the same disposable project, then
verify `/health`, `/ready`, guest auth, normalized dashboard read, and one
idempotent inventory write before calling the service deployment-ready.

historical result before Docker daemon recovery: blocked

## Post-fix rerun — 2026-09-10

The Docker daemon became available again, so the same production-shaped stack
was recreated under the disposable Compose project
`rescue-meal-container-gate-20260910`. No existing project volume was reused.

### Build and startup

- `docker compose ... config --quiet` passed.
- API, migration, and OCR worker images were rebuilt from the canonical target.
  The API image included `data/fixtures/recipes/recipes-v1.json` under
  `/app/data/fixtures/recipes`.
- PostgreSQL `pgvector/pgvector:pg16` started healthy.
- The migration one-shot container exited successfully after applying
  migrations `001→025`.
- The OCR worker started healthy with
  `PP-OCRv5_mobile_det+korean_PP-OCRv5_mobile_rec`,
  `max_concurrency=1`, and queue timeout `2.0` seconds.
- The API started healthy after its `migrate` and `ocr-worker` dependencies
  became ready.

### Health and authenticated read/write smoke

The disposable stack used host ports `55434` (PostgreSQL), `8003` (OCR
worker), and `8004` (API). Readback passed:

```text
API /health: {"status":"ok","service":"rescue-meal-api","storage":"postgresql-normalized-inventory"}
API /ready: {"status":"ready","database":"ok","storage":"postgresql-normalized-inventory","auth_required":true,"auth_configured":true}
OCR /health: {"status":"ok","service":"rescue-meal-ocr-worker","worker_state":"ready","available":true,"max_concurrency":1}
OCR /ready: {"status":"ready","service":"rescue-meal-ocr-worker","worker_state":"ready","available":true}
```

An authenticated HTTP smoke then verified:

```text
auth_mode=guest workspace_present=true before_food_count=7 created_name=Container Gate Food after_food_count=8 replay_status=201
first_status=201 replay_status=201 replay_header=true
migration_rows=25
```

The guest workspace intentionally starts with the demo seed inventory of seven
foods. The smoke added one normalized food, read the dashboard back at eight
foods, and replayed the same `Idempotency-Key` without creating a second lot.
The PostgreSQL readback confirmed normalized workspace rows and the migration
ledger. Authentication tokens and passwords were kept in shell variables and
were not printed or written into evidence.

### Final result

The post-fix container boot gate is **passed** for this local disposable
environment. The earlier pre-fix restart-loop observation remains above as
historical evidence; it is not the current status.

This does not prove production image-digest approval, managed PostgreSQL
failover, network-partition recovery, external object-storage retention or
encryption, external email/push delivery, or production cutover ownership.

The exact disposable Compose project, containers, network, volumes, and
temporary smoke files must be removed after this readback; no repository or
production database is a cleanup target.
