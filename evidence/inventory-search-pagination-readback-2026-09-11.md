# Inventory search pagination lifecycle readback — 2026-09-11

## Finding

The connected inventory-search contract intermittently sent the second page with
`offset=0` instead of `offset=1`. The producer/consumer trace showed that the
server-search effect owned both query lifecycle and storage-location presentation:
`storageLocations` identity changes could clear the current search result and
restart the first page while the user was paging.

## Change

`PrototypeContent` now keeps the latest storage locations in an app-owned ref for
search response materialization. The inventory-search effect no longer restarts
when the storage-location presentation list changes. A separate reconciliation
updates only `storageLocationName` on already-materialized search results, so a
location rename remains visible without discarding pagination state or replaying
page zero. No protected runtime file was changed.

## Verification

- Existing connected pagination contract repeated **10 passed** on disposable API/web
  ports `8143/4543` after the fix.
- Focused PDF connected regression repeated **3 passed** on `8139/4539`.
- Focused manual-priority connected regression repeated **3 passed** on `8140/4540`.
- Focused planner cooking-time connected regression repeated **3 passed** on `8144/4544`.
- Fixture/mobile runtime: **38 passed + 3 skipped**.
- Frontend build: **760 Vite modules**, protected runtime **28 files**.
- Sites / service-worker / workspace-sync / release manifest: **4 / 5 / 9 / 2 passed**.
- `git diff --check`: passed.

## Full-lane boundary

An earlier long full connected run collected **106 tests** and ended **103 passed / 3
failed** in PDF preview, inventory pagination, and planner history assertions. After
the pagination fix and current test set update, a fresh full connected run on ports
`8146/4546` collected **107/107 passed (4.8m)**. The earlier failures remain historical
timing evidence; the current full lane is clean.
