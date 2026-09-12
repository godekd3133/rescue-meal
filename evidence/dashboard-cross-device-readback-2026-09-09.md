# Dashboard cross-device revision readback — 2026-09-09

## Result

`PASS` for the local home freshness contract. The home dashboard can detect a workspace
change made outside the current browser context without replacing an open sheet or overwriting
a user-facing mutation result with a late background notice.

## Implemented boundary

- `GET /api/dashboard/revision` returns only `{ "revision": n }` and uses the normal workspace
  revision response header. It does not duplicate inventory, Rescue Queue, or workspace data.
- The initial dashboard read obtains the payload and revision baseline together. A revision read
  failure is soft for compatibility, so a dashboard payload can still render and the next
  successful probe can establish the baseline.
- The frontend probes only while the home screen is active (`sheet === null`), on visible-tab
  return and every 30 seconds. A higher revision triggers a fresh dashboard read, which updates
  inventory and Rescue Queue from the current workspace.
- The probe does not compete with a regular `syncDashboard()` call. If a sheet opens during a
  probe, the response is rejected at the application boundary. A background refresh notice is
  emitted only when no current user toast exists, preserving completion, account deletion, and
  guest-transfer outcomes.
- Existing same-context workspace invalidation, offline dashboard cache, revision precondition,
  and date/storage safety semantics remain unchanged.

## Verification

All source/build checks used the disposable local mirror `/tmp/rescue-meal-verify.QT7VWs` for
repeatable reads because the OneDrive checkout intermittently exposes `compressed,dataless`
placeholders. No external user data or persistent production database was used.

- Full API pytest — **495 passed, 8 warnings**.
- Dashboard revision API targeted regression — **1 passed**; Python `compileall -q app` passed.
- PostgreSQL contract — **30 passed** with an isolated mirror virtual environment.
- Full connected browser suite — **92 passed**, including home cross-device revision refresh and
  the existing planner/account/guest-transition toast regressions that initially exposed the
  dashboard probe race.
- `npm run test:runtime` — **35 passed, 2 skipped**; `npm run test:workspace-sync` — **9 passed**;
  `npm run test:sites` — **4 passed**; `npm run test:service-worker` — **5 passed**;
  `npm run test:release-manifest` — **1 passed**.
- Mirror `npx tsc --noEmit` — passed. Workspace tsc was separately blocked by the OneDrive
  `apps/web/tsconfig.json` dataless read timeout, not by a TypeScript diagnostic.
- Mirror `npm run build` — passed with protected mobile runtime **28 files**, Vite **757 modules**,
  initial client JS **316.44 kB**, and the pre-existing ineffective dynamic import warning for
  `BottomSheet`.
- Manual conflict-marker/trailing-whitespace scan — passed. No files were staged, committed,
  pushed, reset, or cleaned.

## Remaining acceptance

This readback does not prove iOS/Android background-tab scheduling, server push ordering, managed
PostgreSQL failover/network partition behavior, or production deployment identity. Docker
Desktop's PostgreSQL live gate remains paused while the local Docker VM is read-only/unhealthy.
