# Date assertion write/read recovery readback — 2026-09-11

## Defect found

`PATCH /api/foods/{food_id}/date-assertion` could succeed while the immediate
dashboard read failed. The frontend discarded the successful `ApiFood`
response and treated the follow-up read as part of the mutation result. A
stale dashboard cache could therefore hide a date that the user had already
confirmed and the server had already stored.

## Change

`Prototype.tsx` now:

- checks that the date PATCH returns a non-null `ApiFood`;
- maps the response through the existing `mapApiFood` conversion;
- applies the confirmed date to the local read model before the dashboard
  refresh;
- reapplies that successful response if `syncDashboard()` fails after exposing
  a stale cache;
- keeps the existing rollback and inline retry behavior for a failed PATCH;
- distinguishes a successful date write from a later latest-list read failure.

The date meaning contract is unchanged: a user-confirmed printed date remains
separate from an estimated priority window and does not become a safety
decision.

## Regression coverage

The connected test suite contains both paths:

1. First PATCH returns typed `food_date_persistence_unavailable`; the retry
   sends the same user intent and the second PATCH reaches the API.
2. A strengthened test lets the second PATCH succeed, then aborts the
   dashboard read after a stale cache has been populated. The user reopens the
   food detail and still sees the confirmed date `2026.09.30`.

Focused date tests on dedicated API/web ports `8060/4461`: **2 passed**.

The final full connected lane ran with dedicated API/web ports `8061/4462`
after the change and the strengthened regression: **100 passed**. It includes
receipt, label, barcode, camera, planner, shopping, storage, account,
cross-device, product-info, and date assertion flows.

## Additional verification

- `npm run check:runtime`: 28 protected files passed.
- `npx tsc --noEmit`: passed.
- `VITE_DEPLOYMENT_MODE=demo npm run build`: Vite **757 modules**, Sites
  output prepared.
- No backend source or database was changed by this frontend slice.

## Boundary

This proves the frontend mutation/read lifecycle using a disposable connected
API and deterministic failure injection. It does not prove managed PostgreSQL
failover, reverse-proxy response reset, external provider delivery, real
device behavior, or production cutover.
