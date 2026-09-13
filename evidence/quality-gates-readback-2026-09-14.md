# Quality gates readback — 2026-09-14

## Scope

Three previously absent production-quality gates added in commit `34d438d`:

1. Automated accessibility audit (axe-core)
2. Bundle-size budget on built client assets
3. API test coverage floor

## Accessibility audit

`apps/web/tests/accessibility.spec.ts` — `@axe-core/playwright` 4.11.x,
scans scoped to `.device-screen` so app content plus sheets rendered
through the phone portal are audited, excluding preview chrome.

Surfaces covered (4 tests):

- Home (`main[name="Rescue Meal 홈"]`)
- Food detail sheet (`시금치`)
- Account sheet + notification center (sequential, with exit-animation
  unmount wait between them)
- Receipt review sheet (`영수증으로 추가`, through sample-receipt flow)

Race handling: Radix marks the app viewport `aria-hidden` one frame
before moving focus into the opened sheet. `openSheet()` polls until
`document.activeElement` is inside `[data-testid="bottom-sheet"]` and
adds a 250ms settle delay, so the scan asserts the focus-management
contract instead of flagging the transient frame. Verified stable:
4/4 passed across repeated local runs, and as part of the full
`test:runtime` suite (43 passed, 3 skipped — skips are API-dependent
connected-only specs).

CI wiring: the spec matches `playwright.config.ts` `testMatch:
**/*.spec.ts`, so the existing "Run fixture/mobile runtime tests" step
(`npm run test:runtime`) covers it with no extra wiring.

## Bundle-size budget

`apps/web/scripts/check-bundle-size.mjs` wired as `npm run check:bundle`
and as a "Check bundle size budget" step in the Verify web job after the
production build.

Baseline measured on `dist/client/assets` (production build, 2026-09-14):

- Entry chunk (`index-*.js`): ~360KB → budget 420KB
- Largest lazy chunk (BarcodeScanner): ~437KB → chunk budget 500KB
- Total JS (18 chunks): 1256.6KB → budget 1500KB
- Total CSS: 215.1KB → budget 260KB

Budgets are ~15–25% headroom over baseline; raising them is a
deliberate, evidenced change (noted in the script header).

## Coverage floor

`pytest-cov` added to the API dev group (`pytest==9.1.1`, `pytest-cov==7.1.0`).
Measured baseline: `uv run pytest --cov=app` → **84%** (12,632 stmts,
2,061 missed). CI floor set at **80%** via
`uv run pytest --cov=app --cov-fail-under=80` in the FastAPI tests job —
4% headroom catches real erosion without flapping on unrelated diffs.

## CI verification

Run 34770919629 on `34d438d`:

- All jobs green except Connected browser E2E, which failed once on
  `connected label review keeps an ambiguous date and storage
  unconfirmed` — `getByRole("tab", { name: "라벨" })` never appeared after
  the intake trigger click (30s timeout). Unrelated to this commit
  (no connected-spec or intake-sheet changes). `--failed` rerun passed
  109/109 → run conclusion: **success**. Flake recorded in context.md.
- Security scan run 34770919592: **success**.

## Remaining gaps

- axe audits run in the simulated device viewport only; real-device
  VoiceOver/TalkBack remains an external acceptance item.
- Coverage floor is line coverage on `app/`; branch coverage and the
  OCR worker service are not gated.
- Bundle budgets are raw bytes, not gzip; budgets may need re-tuning if
  code-splitting changes chunk counts materially.
