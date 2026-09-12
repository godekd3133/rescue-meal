# Receipt review queue cross-device readback — 2026-09-09

## Result

`PASS` for the pending receipt summary freshness boundary. An open `receipt-queue` sheet now
detects a workspace revision from another browser/device and refreshes only the summary queue.
The actual AddFoodSheet review surface is excluded so local OCR corrections and draft input are
not replaced automatically.

## Implemented boundary

- `GET /api/receipts/revision` returns only `{ "revision": n }` with the normal workspace
  revision response header and does not expose receipt payload data.
- Receipt summary reads obtain the list and revision baseline together. If the marker read is
  unavailable for compatibility, the summary read remains usable and a later probe can establish
  the baseline.
- While `sheet === "receipt-queue"`, the frontend probes on visible-tab return and every
  30 seconds. A higher revision re-reads pending summaries and shows
  `다른 기기에서 검수 대기 영수증이 바뀌어 최신 목록을 불러왔어요.`.
- Selecting a receipt moves to AddFoodSheet and tears down the queue probe before the detailed
  OCR/draft review begins.
- Existing review-required filtering, receipt commit idempotency, source privacy, and no-StockLot-
  before-confirmation rules remain unchanged.

## Verification

All checks used disposable local mirror `/tmp/rescue-meal-verify.QT7VWs`; no external user data
or persistent production database was used.

- Full API pytest — **497 passed, 8 warnings**.
- Receipt revision API targeted regression — **1 passed**.
- Full connected browser suite — **96 passed**, including the queue cross-device refresh scenario.
- `npm run test:runtime` — **35 passed, 2 skipped**; workspace-sync **9**, Sites **4**,
  service-worker **5**, release-manifest **1**.
- Mirror `npx tsc --noEmit` — passed.
- Mirror `npm run build` — passed with protected mobile runtime **28 files**, Vite **757 modules**,
  initial client JS **320.03 kB**. The pre-existing ineffective dynamic import warning for
  `BottomSheet` remains.
- Manual conflict-marker/trailing-whitespace scan — passed. No files were staged, committed,
  pushed, reset, or cleaned.

## Remaining acceptance

This readback does not prove true multi-device scheduling, server push ordering, managed PostgreSQL
failover/network partition behavior, or iOS/Android background-tab/device accessibility. Docker
Desktop's PostgreSQL live gate remains paused while the local Docker VM is read-only/unhealthy.
