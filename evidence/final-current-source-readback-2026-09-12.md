# Final current-source lane readback — 2026-09-12

## Scope and source identity

This readback covers the current canonical checkout at
`/Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal` after the operational `503` envelope
and remaining auth/recipe configuration closure. The checkout is intentionally shared and dirty;
this readback does not imply a commit, clean tree, or production promotion.

## Current implementation result

- API operational failures now distinguish retryable readiness/worker states from server configuration
  errors. The remaining plain auth secret, account session, guest provisioning, recipe review, and
  recipe import configuration strings were removed from the active route paths.
- Existing product behavior remains unchanged: domain mutation rollback/idempotency, preview side-effect
  freedom, linked meal-plan completion, liveness/readiness separation, and external provider boundaries
  remain separate contracts.

## Verification lanes

| Lane | Command or boundary | Result |
| --- | --- | ---: |
| API full | `services/api/.venv/bin/python -m pytest tests -q` | **508 passed / 8 warnings** |
| API targeted auth/recipe regression | `test_api.py` + `test_recipe_review.py` | **204 passed** |
| API export rate-limit regression | export endpoint | **2 passed** |
| OCR worker full | `services/ocr-worker/.venv/bin/python -m pytest tests -q` | **10 passed** |
| Fixture/mobile | `MOBILE_RUNTIME_TEST_PORT=4510 npm run test:runtime -- --workers=1` | **39 passed + 3 skipped** |
| Native 320×740 | `NATIVE_RUNTIME_TEST_PORT=4511 npm run test:native -- --workers=1` | **14 passed** |
| Historical pre-export connected lane | API `8152`, web `4552`, one worker | **107/107 passed (4.2m)** |
| Latest connected disposable full lane | API `8157`, web `4557`, one worker | **108/108 passed (5.0m)** |
| Connected export rate-limit focused lane | API `8154`, web `4554`, one worker | **1 passed** |
| TypeScript/Vite build | `npm run build` | **760 modules**, protected runtime **28** |
| Sites worker | `npm run test:sites` | **4 passed** |
| Release manifest | `npm run test:release-manifest` | **2 passed** |
| Python/shell/static integrity | `compileall`, `bash -n`, `git diff --check` | passed |

The connected lane was run with a disposable SQLite API and explicit CORS origin. It included the
multi-day typed retry, receipt/date/product flows, recipe review, auth, custom storage, and shopping
receive scenarios. The run exited cleanly and its web/API processes were removed by the test harness.
The later export-rate-limit focused lane used the same disposable launcher and confirmed the typed
429 AccountSheet recovery without a download.

## Flake investigation

An earlier full connected attempt ended **106 passed / 1 failed** at the initial `표시 유통기한`
assertion in the printed-date scenario. The same scenario passed in a focused disposable run, and the
fresh full rerun above passed **107/107** without changing the assertion or adding an arbitrary delay.
The evidence is classified as full-lane startup/resource timing, not as a product contract failure.

## Boundaries still open

This local evidence does not prove physical iOS/Android camera or screen-reader behavior, external
email/Web Push delivery, managed PostgreSQL failover, external Grocy transaction compensation, reverse
proxy retry/reset behavior, backup/WAL/object-storage retention, signed artifact promotion, or actual
production cutover. Existing deprecation warnings are non-blocking and unchanged.

## Latest current-source continuation — 2026-09-12

- The printed-date connected fixture now derives a local-calendar date seven days
  ahead instead of pinning `2026-09-12`, isolating printed-date meaning from the
  product's normal today/expired urgency state. Focused repeat: **3 passed**.
- The primary intake path now warms `AddFoodSheet` and BottomSheet in a zero-delay
  post-commit task while retaining the lazy code split and explicit user-intent
  retry path. This removes the first-tap chunk-load race observed in long connected
  runs without merging the intake chunk into the initial bundle.
- Latest full connected on ports `8157/4557`: **108/108 passed (5.0m)**.
- Latest full API on current source: **508 passed / 8 warnings**. Full fixture/mobile:
  **39 passed + 3 skipped** across **42 tests**. Full native: **14 passed**. Build:
  **760 Vite modules**, protected runtime **28**, Sites **4**, service-worker **5**,
  workspace-sync **9**, release manifest **2**, and diff-check passed.
- The accepted native camera recovery, detail large-text/action reachability, and
  native focus-containment evidence remain under `evidence/design-qa-2026-09-11/`
  with dedicated readbacks.

## Latest UI continuation — food detail first-fold responsive pass

- Fresh native iPhone captures found the 393×852 food-detail destructive action
  below the calibrated `818px` safe boundary and the 320×740 primary mutation
  row below the initial `706px` boundary.
- The app-owned detail snap now uses a bounded live viewport (`max 0.993`,
  `(viewportHeight - 6) / 852`); the narrow breakpoint tightens only repeated
  supporting-card gaps/padding while preserving 44px controls and safety copy.
- Current geometry: at 393×852 the sheet is `y=6..852`, primary actions are
  `y=717.484..761.484`, and destructive action is `y=773.484..817.484`; at
  320×740 primary actions are `y=646.641..690.641` above the `706px` boundary.
- Accepted captures: `evidence/design-qa-2026-09-12/native-continuous-20260912/native-food-detail-sheet.png` and `native-food-detail-320x740.png`; both were inspected and native capture reported zero console/page errors.
- Focused detail regressions **2 passed**; full native **14 passed**; fixture/mobile
  **39 passed + 3 skipped / 42**; build **760 modules**, protected runtime **28**;
  Sites/service-worker/workspace-sync/release manifest **4/5/9/2 passed**;
  `git diff --check` passed.
- Physical iOS VoiceOver/Dynamic Type/compositor/OEM inset and signed production
  artifact acceptance remain separate gates.

Readback: [food detail compact first-fold](food-detail-first-fold-compact-readback-2026-09-12.md).

The same responsive layer raises `food-subline`, `food-meta-line`, and
`date-source` from `7px` to `8px` at `max-width:360px`. The accepted 320px home
capture keeps queue rows at `50px`, the meal CTA at `y=509.031..551.031`, the
reserved nav at `y=628..706`, and document/body width at `320px`; focused home
regression passed **1**.

## Latest current-source continuation — export actor/time audit and guest preview single-flight — 2026-09-12

- Workspace export now records successful generation in a separate `WorkspaceExportAuditEvent`.
  The row contains verified actor ID/role, safe request ID, `rescue-meal-export-v1`, and UTC export
  time only. It excludes Authorization/token/IP/payload, is not returned in the export JSON, and its
  insert does not advance workspace revision. Reset/purge removes the workspace-scoped audit row.
- A forced audit persistence failure returns `account_export_audit_persistence_unavailable` typed
  `503` with `Retry-After: 1`; API response and frontend Blob/download are both absent. API actor
  success/failure **2 passed**, SQLite reconstruction/reset **1 passed**, PostgreSQL adapter SQL
  contract **1 passed**, and AccountSheet connected failure **1 passed**.
- A pre-existing guest registration failure was traced to duplicate guest preview producers: the
  registration submit handler and `authMe` effect could issue the same preview concurrently. The
  registration-scoped single-flight ref now suppresses the effect while submit owns the preview.
  Focused regression after the fix **1 passed**; fresh full connected **109/109 passed (4.8m)**.
- Current source lanes: API **512 passed / 8 warnings**, fixture/mobile **39 passed + 3 skipped**,
  native **14 passed**, TypeScript/Vite **760 modules**, protected runtime **28**, Sites **4**,
  service-worker **5**, workspace-sync **9**, release manifest **2**, `git diff --check`, Python
  compileall, shell syntax, and no-plain-503 static scan all passed. Migration dry-run is
  **001→026**; the earlier disposable live PostgreSQL evidence remains **001→025**, so live 026
  export-audit readback is not claimed.

Readbacks: [export audit](export-audit-readback-2026-09-12.md), [guest transfer preview
single-flight](guest-transfer-preview-single-flight-readback-2026-09-12.md).

## Latest UI continuation — queue metadata long-label safety — 2026-09-13

- A synthetic native `320×740` queue state with a long user storage location and date provenance reproduced the risk of an unbounded storage pill overlapping the date source.
- `apps/web/src/prototype.css` now bounds `.food-meta-line`, `.storage-pill`, and `.date-source` with single-line ellipsis. Current geometry is storage `x=62..145.719`, date `x=151.719..244`, metadata `x=62..244`, document/body width `320px`.
- Native full suite **14 passed**, build **760 Vite modules**, protected runtime **28**, and `git diff --check` passed. Physical localized font rasterization and extreme string acceptance remain separate.

Readback: [design QA](../design-qa.md#current-queue-metadata-long-label-pass-2026-09-13).
