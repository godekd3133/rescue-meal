# Product-info write/read recovery readback — 2026-09-10

## Defect found

`PATCH /api/foods/{food_id}/product-info` could succeed while the immediate
follow-up dashboard read failed. The frontend discarded the successful PATCH
response, treated the read failure as a mutation failure, and restored the
previous local product name. This hid a durable server write and left the
detail sheet showing stale product information.

## Change

`Prototype.tsx` now applies the successful `ApiFood` PATCH response through the
same `mapApiFood` read-model conversion before attempting `syncDashboard()`.
The mutation failure path still restores the previous food and exposes the
existing typed retry action. If only the follow-up dashboard read fails, the
updated product remains visible and the user receives a separate message that
the save succeeded but the latest list could not yet be re-read.

## Verification

```bash
RESCUE_MEAL_E2E_API_PORT=8049 \
RESCUE_MEAL_E2E_WEB_PORT=4449 \
  npm run test:connected -- \
  --grep "connected product info persistence failure restores"
```

Result: **1 passed**.

The test injects a typed `product_info_persistence_unavailable` response on
the first PATCH, verifies the inline retry, lets the second PATCH reach the
API, and verifies that the returned product update is visible after retry.
The focused test passed after the response/read separation; it failed before
the change with the old product name still rendered after `attempts === 2`.

The regression was then strengthened so the second PATCH succeeds while the
follow-up `/api/dashboard` read is deliberately aborted after the initial
successful dashboard has populated a stale cache. The retry still keeps the
new product name visible, proving that the cache fallback cannot overwrite a
successful mutation. The strengthened test passed on the final code with
dedicated ports `8057/4457`.

After the fix, the complete connected browser lane was rerun with
`RESCUE_MEAL_E2E_API_PORT=8056` and `RESCUE_MEAL_E2E_WEB_PORT=4456`.
Result before the final cache-preservation strengthening: **99 passed**. This
included the product-info retry scenario, guest
account settings, receipt/label/barcode intake, planner, shopping, storage,
account recovery, and workspace revision tests.

The final code was revalidated with the same full connected suite on
`RESCUE_MEAL_E2E_API_PORT=8058` and `RESCUE_MEAL_E2E_WEB_PORT=4458`.
Result: **99 passed** after the stale-cache regression was added.

## Boundary

This proves the frontend write/read lifecycle for product profile correction
and does not replace the backend mutation recovery, PostgreSQL managed
failover, reverse-proxy response reset, or external provider acceptance gates.
