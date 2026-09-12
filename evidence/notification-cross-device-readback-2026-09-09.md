# Notification cross-device revision readback — 2026-09-09

## Result

`PASS` for the local cross-device freshness contract. The open notification center now
detects a workspace change through a payload-free revision marker and refreshes the derived
notification list without treating the marker as notification content or a food-safety result.

## Implemented boundary

- `GET /api/notifications/revision` returns only `{ "revision": n }` and receives the normal
  `X-Rescue-Meal-Workspace-Revision` response header.
- A notification list read obtains the list and revision baseline together. If an older server
  or proxy cannot provide the revision response, the list read remains usable and the next
  successful probe establishes the baseline.
- While the notification sheet is open, the frontend probes on visible-tab return and every
  30 seconds. A higher revision triggers a fresh list read and the user-visible notice
  `다른 기기에서 알림 상태가 바뀌어 최신 목록을 불러왔어요.`.
- A read or mark-all request in flight prevents the probe and prevents a completed background
  list read from replacing the current list. A refresh requested during the mutation is queued
  and runs after the mutation only when the notification sheet is still open.
- Existing notification derivation, stable notification IDs, `read_at` persistence, workspace
  revision preconditions, and the distinction between advisory notifications and food-safety
  decisions are unchanged.

## Verification

All checks used a disposable local mirror so OneDrive placeholder I/O could not change the
result of source/build reads. No external user data or persistent production database was used.

- `PYTHONPATH=. UV_PROJECT_ENVIRONMENT=... uv run pytest` — **494 passed, 8 warnings**.
- Notification API revision/read-recovery targeted run — **3 passed**; `test_api.py` — **177
  passed, 5 warnings**.
- `test_postgres_contract.py` with an isolated mirror virtual environment — **30 passed**.
- `npx playwright test --config=playwright.connected.config.ts` — **91 passed**. This includes
  the automatic cross-device refresh scenario and the mark-all-in-flight deferral scenario.
- Notification connected subset — **6 passed**; the existing same-context cross-tab read
  refresh, read persistence retry, custom storage mismatch, and revision-header cases remain
  green.
- `npm run test:runtime` — **35 passed, 2 skipped**; `npm run test:workspace-sync` — **9 passed**;
  `npm run test:sites` — **4 passed**; `npm run test:service-worker` — **5 passed**;
  `npm run test:release-manifest` — **1 passed**.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed with protected mobile runtime **28 files**, Vite **757 modules**,
  initial client JS **315.06 kB**, and `NotificationSheet` **2.79 kB**. The pre-existing Vite
  ineffective dynamic import warning for `BottomSheet` remains.
- The last available scoped `git diff --check` was clean before OneDrive's `.git/HEAD` became
  unreadable; the final changed files also passed manual conflict-marker and trailing-whitespace
  checks. No files were staged, committed, pushed, reset, or cleaned.

## Remaining acceptance

The readback does not prove browser push delivery ordering, server-side push fan-out, true
multi-device scheduling, managed PostgreSQL failover/network partition behavior, or iOS/Android
background-tab and screen-reader behavior. Docker Desktop's local PostgreSQL gate remains
paused because the Docker VM is read-only/unhealthy; no prune, reset, delete, or unrelated
process termination was performed.
