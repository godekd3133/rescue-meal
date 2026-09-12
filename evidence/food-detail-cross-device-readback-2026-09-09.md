# Food-detail cross-device stale readback — 2026-09-09

## Result

`PASS` for the local FoodDetailSheet stale-protection contract. An open food detail now detects
a workspace change made outside the current browser context without replacing the user's local
detail edits automatically.

## Implemented boundary

- The detail sheet reuses the workspace dashboard revision marker and probes on visible-tab return
  and every 30 seconds while the detail sheet is open.
- A higher revision displays `다른 기기에서 이 식품이나 재고가 변경됐어요` as a stale alert;
  the current product info/quantity/storage/date draft remains visible and editable.
- Only the explicit `최신 상태 확인` action invokes `syncDashboard()` and applies the latest food
  payload. The alert explains that unsaved local detail input may then be replaced.
- Normal storage-event, date-assertion, product-info, idempotency, workspace-conflict, and offline
  recovery contracts remain unchanged.

## Verification

All checks used disposable local mirror `/tmp/rescue-meal-verify.QT7VWs`; no external user data
or persistent production database was used.

- Focused connected detail scenario — **1 passed**.
- Full connected browser suite — **97 passed**.
- Full API pytest — **497 passed, 8 warnings**.
- Mirror `npx tsc --noEmit` — passed.
- Mirror `npm run build` — passed with protected mobile runtime **28 files**, Vite **757 modules**,
  initial client JS **321.51 kB**, and `FoodDetailSheet` **18.24 kB**. The pre-existing ineffective
  dynamic import warning for `BottomSheet` remains.
- Existing product-info persistence retry, storage-condition mismatch, date-confirmation retry,
  partial storage, consume, discard, and receipt-provenance detail scenarios remain green in the
  full connected suite.
- Manual conflict-marker/trailing-whitespace scan — passed. No files were staged, committed,
  pushed, reset, or cleaned.

## Remaining acceptance

This readback does not prove true multi-device scheduling, server push ordering, managed PostgreSQL
failover/network partition behavior, or iOS/Android background-tab/device accessibility. Docker
Desktop's PostgreSQL live gate remains paused while the local Docker VM is read-only/unhealthy.
