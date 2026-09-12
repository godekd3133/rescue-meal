# Final current-source readback — 2026-09-11

## Scope

This readback records the current canonical source after fixing the initial
dashboard revision baseline race. It keeps source/static, API, browser, fixture,
packaging, and operational acceptance as separate evidence lanes.

## Root cause and change

The initial `GET /api/dashboard` response already updated the client-wide
`mealApi.workspaceRevision`, but the initial connection effect did not copy that
value into `dashboardRevisionRef`. If a visibility event arrived before the first
poll completed, the first poll could treat the new remote revision as initialisation
and skip the dashboard refresh. The fix seeds the dashboard polling baseline when
the initial successful dashboard payload is applied:

```ts
rememberDashboardRevision(mealApi.workspaceRevision);
```

This preserves monotonic revision handling, the visible-tab and open-sheet guards,
and the existing `syncDashboard(true)` home-only refresh boundary. No timeout or
test-only wait was added.

## Verification

| Lane | Command / ports | Result |
|---|---|---|
| Focused dashboard regression | `RESCUE_MEAL_E2E_API_PORT=8074 RESCUE_MEAL_E2E_WEB_PORT=4474 npm run test:connected -- --grep "connected home refreshes after a cross-device dashboard revision"` | **1 passed** |
| Full connected browser | `RESCUE_MEAL_E2E_API_PORT=8075 RESCUE_MEAL_E2E_WEB_PORT=4475 npm run test:connected` | **101 passed** |
| Fixture/mobile runtime | `MOBILE_RUNTIME_TEST_PORT=4476 npm run test:runtime` | **35 passed + 3 skipped** |
| Native narrow viewport | `NATIVE_RUNTIME_TEST_PORT=4487 npm run test:native` | **4 passed** (320×740, native shell) |
| Production fail-closed | `VITE_DEPLOYMENT_MODE=production VITE_API_BASE_URL=https://api.ci.rescue-meal.invalid MOBILE_RUNTIME_TEST_PORT=4477 npm run test:runtime -- --grep "production boot never presents demo inventory"` | **1 passed** |
| Backend | `UV_CACHE_DIR=/tmp/rescue-meal-uv-cache-current-20260911 uv run --locked pytest` from `services/api` | **499 passed, 8 warnings** |
| Mutation readback contract | `npm run test:mutation-readback` from `apps/web` | **3 passed** |
| Mutation targeted connected lanes | product/date/provenance **4** + manual/receipt **7** | **11 passed** |
| Optimistic mutation contract | `npm run test:optimistic-mutation` from `apps/web` | **3 passed** |
| Storage event targeted connected tests | move/open/consume/discard storage flows, ports `8100/4504` | **3 passed** |
| Container smoke | `sh infra/container-smoke.sh` (`rescue-meal-container-smoke-2956`) | migration **25**, API/OCR ready, guest `7→8`, replay **201 + header**, exact cleanup passed |
| Frontend build | `VITE_DEPLOYMENT_MODE=demo npm run build` from `apps/web` | TypeScript passed; **759 Vite modules**; Sites output prepared |
| Sites worker | `npm run test:sites` from `apps/web` | **4 passed** |
| Integrity | `git diff --check`, shell syntax, Node syntax, workflow YAML parse | passed |

## Boundaries

The result proves current local source, API, connected browser interactions, the
fixture/mobile runtime, production configuration fail-closed behavior, and Sites
packaging. It does not prove real iOS/Android camera permissions or screen readers,
external provider delivery, managed PostgreSQL failover, object-storage
retention/encryption, signed artifact promotion, or production cutover.

## Latest current-source rerun

After the response-only storage snapshot persistence fix, the full connected browser
suite was rerun on disposable API/web ports `8116/4516`:

- `RESCUE_MEAL_E2E_API_PORT=8116 RESCUE_MEAL_E2E_WEB_PORT=4516 npm run test:connected -- --trace=retain-on-failure --max-failures=1` — **101 passed (4.2m)**.
- `MOBILE_RUNTIME_TEST_PORT=4500 npm run test:runtime -- --workers=1` — **36 passed + 3 skipped**.
- `MOBILE_RUNTIME_TEST_PORT=4499 npm run test:runtime -- --grep "expandable Add to Home Screen guidance" --repeat-each=10 --workers=1` — **10 passed**.
- `NATIVE_RUNTIME_TEST_PORT=4501 npm run test:native` — **4 passed**.
- API full baseline — **499 passed, 8 warnings**.
- Contract lanes — mutation-readback **3**, optimistic-mutation **3**, workspace-sync **9**, service-worker **5**, release-manifest **2** passed.
- Frontend build — TypeScript passed; **759 Vite modules**; Sites packaging prepared; `npm run test:sites` — **4 passed**.

Two earlier full connected/fixture observations contained a page-close, claim-click
timeout, or missing iOS guidance locator while stale or concurrent Playwright/Vite
processes were present on the host. The focused repeats and the cleaned full rerun did
not reproduce them. This is recorded as a test-host concurrency boundary, not as a
product success claim or a reason to weaken the application timeout/interaction
contract.

## Latest implementation hardening

### Guest transfer transport

`AccountSheet` no longer owns a second guest-transfer `fetch` implementation. The
preview and confirmed transfer now use explicit `mealApi` methods with the account
session token, source guest token in the request body, shared timeout/error parsing,
workspace revision response tracking, and an abort signal for the re-entry preview
effect. The confirmed transfer sends the current target workspace revision and emits
the normal workspace mutation invalidation; the user-facing import/skip/conflict
decision remains in `AccountSheet`.

The connected guest registration scenario verified preview failure → explicit retry →
skip → reload → import persistence retry. A mocked preview response revision `11` was
observed again as `If-Rescue-Meal-Revision: 11` on the later transfer request. The
guest registration and conflict tests passed (**2 passed**), and the full connected
suite passed (**101 passed**).

### Exact storage sequence replay

The storage sequence replay seam now validates persisted deterministic event cardinality
as well as each incoming event. A completed two-event sequence cannot be replayed by a
same-key one-event prefix, and an index-1-only orphan is treated as a partial sequence.
The red regression returned `200` before the fix; after the fix the shorter payload and
existing atomic replay checks passed (**2 passed**), and the backend full suite passed
(**500 passed, 8 warnings**).

The changes preserve the existing storage response-only `inventory` snapshot rule:
the snapshot is attached to response copies and is not persisted into durable event
payloads.

## Latest storage recovery Module rerun

`apps/web/src/storageMutationRecovery.ts` now sits above the existing
`optimisticMutation.ts` primitive. It owns only the storage-specific recovery
choreography: mutation rejection restores through the lower Module, performs one
best-effort dashboard reconciliation, and exposes the same retry closure to the
caller. A successful mutation whose dashboard readback returns false or throws is
reported to `onSuccess` with `synced=false` and does not enter the failure retry path.
The first rejected attempt restores the pre-mutation snapshot, while a retry after
reconciliation does not restore that stale snapshot if it fails again.

- `npm run test:storage-mutation-recovery` — **4 passed**.
- Storage connected targeted move/open/consume/discard and location flows — **14 passed**.
- Full connected browser suite on disposable API/web `8126/4528` — **103 passed (5.1m)**.
- Backend full suite with exact sequence replay guard — **500 passed, 8 warnings**.
- `npm run build` — protected runtime **28**, TypeScript passed, **760 Vite modules**, Sites output prepared.
- `npm run test:sites` — **4 passed**.

The caller still owns operation identity, storage event payload and child-lot
semantics, typed error/conflict messaging, Grocy status, authoritative inventory
materialization, and the global retry toast. The Module does not claim atomicity for
external Grocy/provider transactions or managed PostgreSQL failover.

## Latest receipt commit error-envelope hardening

Receipt finalization now keeps the existing business-state rollback and
`needs_reconciliation` marker, but returns a typed `503` envelope instead of a plain
string containing the internal commit transaction ID. The response uses
`receipt_commit_persistence_unavailable`, `retryable: true`, and `action: retry_later`;
transaction ID, exception text, and receipt payload are excluded. Pending-marker flush
failure and reconciliation-marker flush failure remain separate typed paths.

The finalization, pending-marker, and reconciliation-marker regressions passed
(**3 passed**), the backend suite passed (**500 passed, 8 warnings**), and the full
connected browser suite passed (**103 passed**).

## Latest current-source UI/platform continuation — 2026-09-11

The current source now also includes the native/preview Emerald Atelier accessibility and
platform hardening that followed the storage recovery work:

- fixture/mobile full lane: **41 tests, 38 passed, 3 skipped**
- native 320px lane: **9 passed**
- Pixel edge + sheet focused regression: **1 passed**
- build: **760 Vite modules**, protected mobile runtime **28 files**
- Sites **4**, service-worker **5**, workspace-sync **9**, release manifest **2**
- camera permission fallback live announcement, intake tab/tabpanel semantics, iOS install
  guidance expanded-state semantics, large-text Home/sheet hierarchy, and visible-control
  accessible-name audit are covered by focused browser evidence
- Home/sheet primary controls use the 44px touch baseline; Pixel app viewport and meal sheet
  terminate at `1028px` with Android navigation beginning at `1029px`

The accepted visual evidence includes the native iPhone Home/sheet/camera states, large-text
Home/meal/detail captures, Pixel Home/meal captures, and the touch-target captures under
`evidence/design-qa-2026-09-11/`. The browser/fixture evidence does not claim physical
VoiceOver/TalkBack speech, OS Dynamic Type, camera optics/permission sheets, OEM insets,
external provider delivery, managed failover, signed artifact promotion, or production cutover.

## Latest connected rerun — current source

- `RESCUE_MEAL_E2E_API_PORT=8132 RESCUE_MEAL_E2E_WEB_PORT=4532 npm run test:connected -- --workers=1 --reporter=line` — **103 passed (3.9m)**.
- The run covered the current receipt/storage mutation recovery, custom-location, planner,
  account/guest transfer, notification, recipe review, and cross-device revision contracts.
- This connected result remains separate from fixture/native device and accessibility lanes;
  it does not promote local browser evidence into managed production or physical-device acceptance.

## BottomSheet bundle boundary

The current build retains one `INEFFECTIVE_DYNAMIC_IMPORT` warning for `BottomSheet` because
the protected mobile barrel statically re-exports the module. A static app-owned import was
tested but expanded the main client chunk to approximately `537.5KB`; it was reverted to keep
the current split bundle's main client chunk near `330.25KB`. The protected runtime remains at
28-file integrity pass, and no protected runtime refactor was made.

## Meal-plan completion typed failure envelope — current source

- Backend red regression before the change: a forced `WorkspaceMutation` flush failure returned HTTP
  `503` with a string `detail`, so indexing `detail.code` raised `TypeError: string indices must be
  integers, not 'str'`. The route still restored the plan/inventory snapshot; only the public error
  shape was wrong.
- Backend green: `services/api/tests/test_api.py` completion flush-failure, normal completion and
  linked multi-day completion recovery targeted **3 passed**. The failure response is now
  `meal_plan_completion_persistence_unavailable`, `retryable=true`, `action=retry_later`, with a
  user-safe detail and no simulated exception text.
- Frontend green: the connected regression forces the first completion request to return the typed
  `503`, verifies the inline alert and `다시 시도`, confirms the consumption input remains `0.5`, then
  verifies the second request body is equivalent in meaning to the first and the real completion
  succeeds. Focused connected **1 passed**; full connected after the final payload-snapshot change
  **105 passed (4.4m)** on ports `8136/4536` after the current account/detail first-fold changes.
- Other final lanes: backend **500 passed / 8 warnings**, fixture/mobile **38 passed + 3 skipped** out
  of 41, native viewport **11 passed**, protected runtime **28 files**, TypeScript/Vite **760 modules**,
  Sites **4 passed**, release manifest **2 passed**. Dedicated test ports were free after shutdown.
- This readback proves local API/UI rollback and typed retry behavior only. It does not prove external
  Grocy transaction compensation, managed PostgreSQL failover/partition, reverse-proxy response reset,
  physical VoiceOver/TalkBack/Dynamic Type, signed artifact promotion, or production cutover.

## Account sheet first-fold reachability — current source

- Fresh native `393 x 852` capture found the guest account sheet's `snap=0.7` initial surface
  clipping the `로그인` submit action at `y=829.7..873.7px`. The app-owned account snap is now
  `0.8`; the settled sheet measures `y=170..852px`, with the complete account lead, recovery
  entry, login/register tabs, fields, and primary login action in the first viewport.
- The native regression waits until the sheet bottom matches the device-screen bottom before
  reading the `34px` home-indicator boundary. Focused first-fold **1 passed**, full native **11
  passed**, and the current fixture/mobile **38 passed + 3 skipped**.
- Accepted capture/readback: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-account-sheet-393x852.png`,
  `evidence/account-sheet-first-fold-readback-2026-09-11.md`.
- This is local native-shell/browser geometry evidence; physical VoiceOver/TalkBack speech, OS
  Dynamic Type, OEM insets, and the real iOS home-indicator compositor remain separate gates.

## Food detail mutation-action first-fold reachability — current source

- Fresh native `393 x 852` capture found that the detail `snap=0.78` state control
  started below the `818px` safe-area boundary; after the earlier `snap=0.84` toggle
  fix, `먹었어요` and `보관 상태 저장` still measured `y=843.2..887.2px`.
- The detail snap is now `0.93`; the settled sheet measures `y=60..852px`, and the
  opened-state control plus both primary mutation actions are visible above the
  calibrated `34px` home-indicator boundary. The current native regression checks
  both the toggle and `.detail-actions` after entrance settle.
- Accepted capture/readback: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-sheet-393x852.png`,
  `evidence/food-detail-first-fold-readback-2026-09-11.md`.
- Full native remains **13 passed**, fixture/mobile **39 passed + 3 skipped**, and the
  current build remains **760 Vite modules** with protected runtime **28 files**.
- This is local native-shell/browser geometry evidence; physical VoiceOver/TalkBack speech,
  OS Dynamic Type, OEM insets, and the real iOS home-indicator compositor remain separate gates.

## Latest current-source connected boundary — 2026-09-11

- The latest fresh full connected run on current source collected **107/107 passed (4.8m)**
  on ports `8146/4546`, including PDF preview, inventory pagination, and planner history.
- Clean focused repeats passed: PDF **3**, manual priority **3**, planner cooking-time **3**,
  and inventory pagination **10**. The inventory pagination source fix separates
  storage-location presentation updates from search pagination lifecycle; readback:
  `evidence/inventory-search-pagination-readback-2026-09-11.md`.
- This is promoted as the current full connected pass. Fixture/mobile **38 passed + 3 skipped**,
  native **11 passed**, build **760 modules**, protected runtime **28**, Sites **4**,
  service-worker **5**, workspace-sync **9**, release manifest **2**, and diff-check passed.

## Food detail narrow viewport — current source

- A fresh 320×740 native capture found the fixed 393×852 detail `snap=0.93` sheet
  starting at `y=-52px`, clipping the handle and title.
- The current source derives a bounded snap from viewport height. At 320×740 the
  sheet settles at `y=8..740px` and the `시금치` title at `y=47.2..69.2px`; 393×852
  keeps the existing `y=60..852px` composition.
- Focused narrow major-sheet **1 passed**, full native **14 passed**, fixture/mobile
  **39 passed + 3 skipped**, build **760 modules**, protected runtime **28**, and
  diff-check passed. Readback: `evidence/food-detail-narrow-viewport-readback-2026-09-11.md`.

## Modal keyboard focus containment — current source

- The fixture lane permanently traverses the receipt BottomSheet with **24 Tab** and
  **24 Shift+Tab** steps. No active element escapes the dialog, and Escape restores
  focus to `식품 추가하기`.
- Focused containment **1 passed**, fixture/mobile **39 passed + 3 skipped** across
  **42 tests**, native **14 passed**, build **760 modules**, and diff-check passed.
- Readback: `evidence/modal-focus-containment-readback-2026-09-11.md`.

## Food detail large-text narrow reachability — current source

- At `320×740 + 125% root text`, the detail title is `23.75px` and max-scroll
  `.detail-actions` ends at `y=622.109px`, below the `706px` safe-area boundary.
- Focused large-text **2 passed**, native **14 passed**, fixture/mobile **39 passed +
  3 skipped** across **42 tests**, build **760 modules**, protected runtime **28**,
  and diff-check passed.
- Accepted/readback: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740-large-text.png`,
  `evidence/food-detail-large-text-narrow-readback-2026-09-11.md`.

## Account deletion typed failure envelope — current source

- Backend red regression before the change: forced `WorkspaceStoreRouter.purge_workspace` failure
  returned HTTP `503` with a string `detail`, so the existing durable-fence recovery test could not
  inspect `detail.code`. The account row still remained `deleting` and the next request could resume
  purge.
- Backend green: regular account deletion persistence failure now returns
  `account_deletion_persistence_unavailable`, `retryable=true`, `action=retry_later`, with no
  password/token/email/exception text. The durable `deleting` fence, `423` write blocking,
  `/api/auth/me` recovery status, and same-session retry remain unchanged.
- Frontend green: `AccountDeletionPanel` shows inline `다시 시도` only for the typed code. The connected
  regression forces the first request to fail, compares the second request payload with the first,
  verifies the rate-limit path has no inline retry action, and confirms successful deletion transitions
  to the new guest workspace. Typed retry/rate-limit connected **2 passed**.

## Native first-fold settle measurement — current source

- The food-detail first-fold regression once observed `toggle.bottom=818.008972px` while the calibrated
  boundary was `818px`. Three repeats passed and direct measurement showed the stable layout at
  `817.234px`; the failure was an entrance spring transform being sampled before it settled.
- `native-viewport.spec.ts` now waits for sheet bottom alignment and computed entrance transform `none`
  before measuring the 34px safe-area boundary. No protected BottomSheet or product layout was changed.
  Final native viewport suite: **11 passed**.

## Single meal-plan save typed failure envelope — current source

- Backend red regression: forced `WorkspaceMutation` flush failure on `POST /api/meal-plans` escaped
  through the route as raw `RuntimeError`; the plan phantom rollback worked, but the HTTP error contract
  was missing.
- Backend green: both no-`plan_id` compatibility and plan-lock paths now return
  `meal_plan_persistence_unavailable` typed `503` with `retryable=true` and `action=retry_later` for
  regular persistence exceptions. Validation and concurrency winner replay remain separate, and the
  exception text is excluded.
- Frontend green: `MealPlanSheet` keeps the failed preview payload and exposes inline `다시 시도` only
  for this typed code. The connected test compares the first and retry request bodies and then lets the
  real disposable API save the plan. Focused save retry **1 passed**.
- Final current source lanes before the multi-day retry addition: API **500 passed / 8 warnings**,
  connected **106 passed (3.9m)**, fixture/mobile **38 passed + 3 skipped**, native **11 passed**,
  protected runtime **28**, build
  **760 Vite modules**, Sites **4 passed**, release manifest **2 passed**.
- An earlier long connected run had **103/106** timing-sensitive failures in unrelated PDF/inventory/
  planner-history flows; clean focused repeats and the final fresh full rerun are recorded separately.

## Multi-day bundle save typed failure envelope — current source

- Backend red regression: forced outer `WorkspaceMutation` flush failure on the bundle-lock route
  escaped as raw `RuntimeError`, although the lower module restored the bundle/day snapshot.
- Backend green: regular failures in both bundle-id and compatibility paths now return
  `multi_day_plan_persistence_unavailable` typed `503` with `retryable=true` and
  `action=retry_later`; validation, bundle conflict and concurrency winner replay remain separate.
- Frontend green: `MealPlanSheet` preserves the failed bundle payload and shows inline `다시 시도` only
  in the 3-day plan region for that typed code. The connected test compares the first and retry request
  bodies and confirms the second request saves the bundle. Focused retry **1 passed**.
- Multi-day targeted API **4 passed**, full API **507 passed / 8 warnings**, final full connected
  **107/107 passed**, fixture/mobile **39 passed + 3 skipped**, native **14 passed**, build **760
  modules**, Sites **4 passed**, release manifest **2 passed**. A fresh full connected baseline before
  adding this test passed **106/106**; the added regression is included in the final **107/107** result.
