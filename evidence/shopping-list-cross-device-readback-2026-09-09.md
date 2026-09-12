# Shopping-list cross-device revision readback — 2026-09-09

## Result

`PASS` for the local ShoppingListSheet freshness contract. An open shopping list now notices a
workspace revision made outside the current browser context and refreshes the derived list while
protecting an item mutation already in progress.

## Implemented boundary

- `GET /api/shopping-list/revision` returns only `{ "revision": n }` with the normal workspace
  revision response header.
- A shopping-list read obtains the list and revision baseline together. If the revision read is
  unavailable because of an older server/proxy, the list remains usable and a later probe can
  establish the baseline.
- While ShoppingListSheet is open, the frontend probes on visible-tab return and every 30 seconds.
  A higher revision triggers a fresh list read and shows
  `다른 기기에서 장보기 목록이 바뀌어 최신 목록을 불러왔어요.`.
- Check, delete, receive, and manual-add mutations block probe/list replacement. A cross-tab
  refresh request received during an item mutation is queued and runs after the mutation while
  the sheet remains open.
- Successful local mutation responses update the list revision baseline. Existing source merge,
  checked history, receive lot identity, idempotency, offline, and workspace conflict contracts
  remain unchanged.

## Verification

All source/build checks used disposable local mirror `/tmp/rescue-meal-verify.QT7VWs`; no external
user data or persistent production database was used.

- Full API pytest — **496 passed, 8 warnings**.
- Shopping-list revision API targeted regression — **1 passed**.
- PostgreSQL contract — **30 passed** with an isolated mirror virtual environment.
- Full connected browser suite — **94 passed**, including automatic cross-device list refresh and
  item-mutation pending deferral/queued refresh.
- `npm run test:runtime` after the shopping-list source change — **35 passed, 2 skipped**;
  workspace-sync **9**, Sites **4**, service-worker **5**, release-manifest **1**.
- Mirror `npx tsc --noEmit` — passed.
- Mirror `npm run build` — passed with protected mobile runtime **28 files**, Vite **757 modules**,
  initial client JS **318.34 kB**, and ShoppingListSheet **10.76 kB**. The pre-existing ineffective
  dynamic import warning for `BottomSheet` remains.
- Manual conflict-marker/trailing-whitespace scan — passed. No files were staged, committed,
  pushed, reset, or cleaned.

## Remaining acceptance

This readback does not prove real multi-device scheduling, server push ordering, managed PostgreSQL
failover/network partition behavior, purchase-order/payment semantics, or iOS/Android background
tab/device accessibility. Docker Desktop's PostgreSQL live gate remains paused while the local
Docker VM is read-only/unhealthy.
