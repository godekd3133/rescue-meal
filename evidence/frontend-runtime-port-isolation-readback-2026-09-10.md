# Frontend runtime port-isolation readback — 2026-09-10

## Result

Passed. The fixture-only Playwright lane now fails closed when its requested
server port is already occupied instead of silently allowing Vite to move to
another port or reusing an unrelated application. A dedicated port run
continues to validate the Rescue Meal runtime.

## Root cause found

The first local `npm run test:runtime` run reported 35 failures, all with the
same symptom: Rescue Meal elements such as `.fixture-carousel`, the home
region, and the add-food button were absent. The default test port `4174` was
already serving another local project. `playwright.config.ts` had
`reuseExistingServer: true` by default, so the test lane accepted that
unrelated server. The failures were therefore invalid environment evidence,
not product behavior.

## Change under test

`apps/web/playwright.config.ts` now:

- passes `--strictPort` to Vite so the server cannot silently move away from
  the requested port;
- defaults to `reuseExistingServer: false`;
- allows explicit reuse only with `MOBILE_RUNTIME_REUSE_SERVER=1`;
- continues to support `MOBILE_RUNTIME_TEST_PORT` for an isolated local or CI
  run.

## Executed readback

- With the canonical target's other local service still occupying `4174`, the
  default lane stopped before running tests with:
  `http://127.0.0.1:4174/tests/runtime-fixture.html is already used`.
  It did not run against the unrelated application.
- `MOBILE_RUNTIME_TEST_PORT=4451 npm run test:runtime` passed:
  **35 passed, 2 skipped** across the 37-test fixture/mobile lane.
- The passing lane covered the phone runtime, Carousel gesture ownership,
  keyboard/sheet dismissal, iPhone/Pixel layout, PWA install/manifest,
  receipt/label/barcode/camera intake, date confirmation, lot split/discard,
  inventory search/filter, recipe completion, and render-error recovery.
- `npm run check:runtime` passed with 28 protected runtime files.

## Final runtime revalidation

After the later product-info read-after-write fix and connected timeout
configuration, the current target was revalidated with:

```bash
MOBILE_RUNTIME_TEST_PORT=4459 npm run test:runtime
```

Result: **35 passed, 3 skipped**. The third skip is the production-only test,
which is intentionally excluded when the lane runs in demo mode. The
production contract was then run explicitly:

```bash
VITE_DEPLOYMENT_MODE=production \
VITE_API_BASE_URL=https://api.ci.rescue-meal.invalid \
MOBILE_RUNTIME_TEST_PORT=4460 \
  npm run test:runtime -- \
  --grep "production boot never presents demo inventory"
```

Result: **1 passed**. Production boot did not present demo inventory when the
API was unreachable.

## Boundary

This closes local fixture-server misrouting and strengthens the evidence lane.
It does not prove real device camera permissions, OS accessibility, Web Push
delivery, or connected API/managed-database operation; those remain separate
gates.
