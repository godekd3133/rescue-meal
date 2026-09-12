# Custom storage location vertical slice readback

## Scope

This readback covers the workspace-scoped custom storage location slice for
Rescue Meal. A custom location such as `김치냉장고` keeps the canonical
`ambient`/`refrigerated`/`frozen` class and adds an optional location ID for
user-facing precision. The location name is not treated as a safety rule or a
measured temperature.

The implementation includes:

- `GET/POST /api/storage-locations` and `PATCH/DELETE /api/storage-locations/{id}`
  with duplicate, canonical-class mismatch, in-use delete, workspace conflict,
  and typed persistence failure handling.
- Optional `storage_location_id` on manual food creation, receipt commit
  overrides, shopping-list receive, and storage-event targets. Receipt and
  shopping receive retry fingerprints include the selected location.
- SQLite and normalized PostgreSQL projection persistence, dashboard/export
  location readback, guest-transfer counts, and migration `025_storage_locations.sql`.
- `GET /api/inventory/search?storage_location_id=...` bounded filtering in both
  compatibility/in-memory and PostgreSQL adapter paths; the canonical
  `storage_type` filter remains independently available.
- AddFoodSheet receipt/label/manual pickers, ShoppingListSheet receive picker,
  FoodDetailSheet state picker, AccountSheet custom-location CRUD, and
  `storage-locations` workspace invalidation.

## Evidence lanes

### API and contract

In the disposable verification mirror:

- Full API suite: **491 passed, 8 warnings**.
- Custom location CRUD/assignment/SQLite reconstruction plus receipt commit
  custom override and shopping receive custom ID/replay: **5 passed, 1 warning**.
- Storage mismatch notification rule and API readback using the custom
  location name: **2 passed, 1 warning**.
- PostgreSQL projection/migration contract: **30 passed**.
- `verify.yml` YAML parsing passed. The workflow now checks migration rerun
  `001→025`, ledger row count `25`, and a normalized live smoke that creates a
  custom location, assigns it to a food, searches by that location, reads it
  from dashboard, and verifies the restored custom-location row and normalized
  lot location reference.

### Frontend

In the disposable connected browser environment:

- Connected E2E: **87 passed** with one worker.
- New custom-location coverage: account manager create/rename/delete,
  manual food POST, receipt commit override, shopping receive POST, and
  mismatch-notification, detail-warning, and planner-warning display: **7 passed**.
- Fixture/mobile Playwright lane: **35 passed, 2 skipped**.
- Workspace sync contract: **9 passed**.
- Sites worker contract: **4 passed**.
- Service worker contract: **5 passed**.
- Frontend build: protected runtime integrity **28 files passed**, Vite
  **757 modules**, initial index **312.87 kB**, AddFoodSheet **60.64 kB**,
  AccountSheet **72.83 kB**, ShoppingListSheet **10.59 kB**, and
  FoodDetailSheet **17.62 kB**. The pre-existing ineffective dynamic-import
  warning for `BottomSheet.tsx` remains.
- Direct `npx tsc --noEmit` passed on the workspace checkout.

## Important boundary

The workspace checkout is under OneDrive. Its runtime-integrity read and Vite
protected-asset copy intermittently returned `ETIMEDOUT` while reading or
copying `public/assets/android/Keyboard.png`; the same source was built and
runtime-checked in the local temporary verification mirror. This is recorded
as storage I/O evidence, not treated as a source/build assertion failure.

This readback does not claim a successful GitHub Actions run, managed
production PostgreSQL migration, external Grocy location mapping, temperature
sensor integration, device camera behavior, or backup/WAL/object-storage
retention. Those remain separate operational acceptance gates.
