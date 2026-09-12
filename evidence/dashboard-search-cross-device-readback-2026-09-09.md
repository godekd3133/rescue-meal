# Dashboard active-search cross-device readback — 2026-09-09

## Result

`PASS` for the active inventory-search freshness follow-up. When a home dashboard revision
changes, an already visible bounded search result is re-run so the dashboard's base inventory
and search view do not point at different workspace revisions.

## Implemented boundary

- A successful home-only dashboard revision refresh increments the existing `inventory-search`
  retry channel when a query or storage filter is active.
- The existing request key, canonical `storage_type`/custom `storage_location_id` filters,
  bounded pagination, and `WorkspaceSyncCoordinator` stale-response rejection remain the source
  of truth; no search payload or safety rule changed.
- Demo/offline mode continues to filter the already received dashboard locally. The follow-up
  applies only to connected server-bounded search.

## Verification

All checks used the disposable local mirror `/tmp/rescue-meal-verify.QT7VWs`; no external user
data or persistent production database was used.

- Full API pytest — **496 passed, 8 warnings**.
- Focused connected active-search revision scenario — **1 passed**.
- Full connected browser suite — **95 passed**.
- `npm run test:runtime` — **35 passed, 2 skipped**; workspace-sync **9**, Sites **4**,
  service-worker **5**, release-manifest **1**.
- Mirror `npx tsc --noEmit` — passed.
- Mirror `npm run build` — passed with protected mobile runtime **28 files**, Vite **757 modules**,
  initial client JS **318.37 kB**. The pre-existing ineffective dynamic import warning for
  `BottomSheet` remains.
- Manual conflict-marker/trailing-whitespace scan — passed. No files were staged, committed,
  pushed, reset, or cleaned.

## Remaining acceptance

This readback does not prove true multi-device scheduling, server push ordering, managed
PostgreSQL failover/network partition behavior, or iOS/Android background-tab/device
accessibility. Docker Desktop's PostgreSQL live gate remains paused while the local Docker VM is
read-only/unhealthy.
