# Product provenance write/read and modal recovery readback — 2026-09-11

## Defect found

The product-provenance removal flow kept its detail sheet open while showing a
global retry toast. Radix hides the underlying device screen with
`aria-hidden="true"` while the sheet dialog is open, so the toast was visible
in the pixels but unavailable to the dialog's accessibility tree. A typed
failure could also re-read stale dashboard data before displaying the short
retry affordance, restoring the confirmation surface and making the action
hard to discover.

## Change

- Added `isMealApiProductProvenancePersistenceError()` for the backend's typed
  `product_provenance_persistence_unavailable` response.
- `DELETE /api/foods/{food_id}/product-provenance` now applies its successful
  `ApiFood` response through `mapApiFood` before a best-effort dashboard read.
- A failed dashboard read cannot replace a successful provenance removal with
  stale cache data.
- Mutation failure restores the previous provenance immediately. Workspace
  conflicts still perform a winner dashboard read.
- Provenance mutation failures render inside `FoodDetailSheet` as a dialog-local
  `role="alert"` with an inline `다시 시도` button. Success/read-refresh status is
  also available as a dialog-local `role="status"`.
- The global toast is no longer the only recovery affordance while this modal
  is open.

## Regression coverage

The connected regression adds a deterministic provenance-bearing dashboard
response and exercises:

1. First provenance DELETE returns typed persistence failure.
2. The detail screen restores the old provenance and exposes an accessible
   inline retry alert.
3. Retry reaches the real API and succeeds.
4. The following dashboard read is aborted after a stale cache has been
   populated.
5. The detail screen keeps the successful removal visible and the provenance
   group remains absent.

Focused provenance tests, including the existing successful removal scenario,
ran on dedicated API/web ports `8069/4470`: **2 passed**.

After the final inline-alert and current visual-direction selector changes, the
full connected lane ran on dedicated API/web ports `8071/4472`:
**101 passed**. This includes receipt/label/barcode/camera intake, planner,
shopping, storage, product-info/date/provenance recovery, account/guest
settings, cross-device revision, and container-facing frontend contracts.

## Related frontend verification

- `MOBILE_RUNTIME_TEST_PORT=4475 npm run test:runtime`: **35 passed + 3
  skipped**. The production-only test remains intentionally separate from the
  demo lane.
- `VITE_DEPLOYMENT_MODE=demo npm run build`: TypeScript passed, Vite **757
  modules**, Sites output prepared.
- The compact Emerald Atelier layout intentionally hides secondary `small`
  descriptors in the add-food button and uses a Korean date eyebrow. Tests now
  assert the visible semantic button name and the app's explicit
  `formatToParts` date composition rather than hidden/engine-dependent text.

## Boundary

This proves the frontend provenance mutation/read lifecycle and modal
accessibility recovery with deterministic connected responses. It does not
prove real screen-reader behavior on iOS/Android, external provider delivery,
managed PostgreSQL failover, or production cutover.
