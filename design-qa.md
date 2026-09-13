# Rescue Meal design QA — Emerald Atelier final visual pass

## Source visual truth

- Original source: /Users/kimminkyu/.codex/generated_images/01a089d3-ea3a-7601-a729-7438361f33f0/exec-394154ea-a520-4327-8272-9fec8781dfc9.png
- Original source pixels: 853 x 1844
- Normalized comparison source: evidence/design-qa-2026-09-11/source-emerald-atelier-normalized.png
- Normalized source pixels: 393 x 852
- Source surface: Emerald Atelier Rescue Meal home concept

## Implementation evidence

- Workspace: /Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal
- App-owned UI: apps/web/src/Prototype.tsx, apps/web/src/prototype.css
- App-owned capture script: apps/web/scripts/capture-design-qa.mjs
- App-owned food cutouts:
  - apps/web/public/assets/food/spinach-cutout-v1.png
  - apps/web/public/assets/food/tofu-cutout-v1.png
  - apps/web/public/assets/food/chicken-cutout-v1.png
- App-owned hero: apps/web/public/assets/food/rescue-hero-background-v1.webp
- Home implementation screenshot: evidence/design-qa-2026-09-11/01-home-screen.png
- Source/implementation comparison: evidence/design-qa-2026-09-11/comparison-home-source-vs-implementation.png
- Primary sheet screenshots:
  - evidence/design-qa-2026-09-11/02-receipt-intake-sheet.png
  - evidence/design-qa-2026-09-11/03-meal-plan-sheet.png
  - evidence/design-qa-2026-09-11/04-food-detail-sheet.png
  - evidence/design-qa-2026-09-11/05-account-sheet.png
  - evidence/design-qa-2026-09-11/06-notifications-sheet.png
- Capture summary: evidence/design-qa-2026-09-11/capture-summary.json

## Capture normalization

- App CSS viewport: 393 x 852
- Browser capture viewport: 1399 x 1200
- deviceScaleFactor: 1
- [data-testid="device-screen"] CSS bounding box: 393 x 852
- Implementation screenshot pixels: 393 x 852
- Source comparison pixels: 393 x 852
- The phone status bar, notch, home indicator, and bezel are protected template chrome. The comparison judges app-owned content inside the screen; the composite retains the phone screenshot as captured evidence so the frame/context is auditable.

## State and interactions

- Fixture state: demo home with seven foods, one notification set, and no authenticated API dependency.
- Dynamic date: the implementation uses the live runtime date (2026-09-11 during capture); the concept image contains the static date 2026-09-10. This is intentional product behavior, not a layout defect.
- Primary interactions tested in the capture run:
  - open receipt intake
  - open meal plan
  - open food detail
  - open account
  - open notifications
  - dismiss every sheet with Escape
- Browser console errors: 0
- Page errors: 0
- Capture result: passed; all six states were saved.

## Full-view and focused comparison evidence

The source and final implementation are placed side by side in comparison-home-source-vs-implementation.png at equal 393 x 852 content pixels. The full view is readable enough to judge the brand lockup, hero crop, status card, queue rows, CTA, safety note, and persistent navigation. The individual sheet screenshots provide focused evidence for intake, meal plan, food detail, account, and notifications; no additional crop was needed for those states because the active controls and copy remain legible at the native 393px capture width.

## Comparison history

### Pass 1 — initial headless capture

- Finding: [P1] Home vertical density was too loose. The first viewport stopped around the first priority item and did not show the complete core loop from status card through the three priority rows, meal CTA, trust note, and navigation.
- Fix: added the final preview-only first-viewport density layer at the end of prototype.css; reduced non-essential hero spacing, compressed row rhythm, hid the redundant mini summary in the selected concept, and preserved the full pantry below the fold.
- Evidence after fix: final home screenshot and comparison composite.

### Pass 2 — safe-area and source framing

- Finding: [P2] The brand lockup sat too close to the protected status/notch region, and the first capture rasterized to 394px because the phone screen started at a half-pixel x coordinate.
- Fix: captured with a 1399px browser viewport so the 393px screen lands on integer coordinates; set preview top padding to 44px; excluded the template-owned custom cursor by moving the pointer outside the phone stage before each screenshot.
- Evidence after fix: implementation screenshots are exactly 393 x 852; no cursor artifact remains; capture-summary.json reports zero console/page errors.

### Pass 3 — image fidelity and lower-fold drift

- Finding: [P2] Priority rows used square food thumbnails and the status card texture was being overwritten by a later CSS layer. YOUR PANTRY also appeared too early compared with the source concept.
- Fix: generated and integrated transparent spinach/tofu/chicken cutouts, restored the hero-texture layer on the status card at the final cascade position, increased the trust strip rhythm, and pushed the pantry section below the selected first viewport.
- Evidence after fix: final side-by-side comparison and updated detail/meal screenshots.

### Final pass

- No actionable P0/P1/P2 findings remain in the captured states.
- Remaining differences are intentional or P3 polish: live date/count data differs from the static concept, the app keeps protected device chrome, and the CTA uses the existing icon library rather than reproducing the concept's exact fork glyph.

## Required fidelity surfaces

- Fonts and typography: the serif brand and sheet titles, Korean sans UI hierarchy, compact metadata, date labels, and CTA weights were checked in the normalized composite and sheet captures. The implementation intentionally uses system/Avenir/Georgia fallbacks rather than embedding an unlicensed font.
- Spacing and layout rhythm: first-viewport vertical rhythm was iterated against the normalized source; status card, three queue rows, CTA, trust strip, and bottom navigation now occupy the same primary composition. Sheet sections use consistent 12–16px internal rhythm and 44px-class actions.
- Colors and visual tokens: deep forest surface, warm ivory text, pistachio primary actions, coral warnings, amber pending states, and slate metadata are consistent across home and all captured sheets.
- Image quality and asset fidelity: the hero uses the workspace-local optimized WebP; priority rows use workspace-local transparent food cutouts; no visible target imagery is replaced with emoji, placeholder boxes, handcrafted SVG, or text glyphs.
- Copy and content: safety language remains explicit that AI does not establish a safe-to-eat date; dynamic data and source-static data differences are documented above rather than silently falsified.

## Non-visual verification

- npm run check:runtime: passed, 28 protected files.
- npm run build: passed, 758 Vite modules and Sites output prepared.
- Fixture/mobile runtime Playwright: 35 passed, 3 skipped.
- Sites worker: 4 passed.
- Service worker: 5 passed.
- Workspace sync: 9 passed.
- Release manifest: 1 passed.
- git diff --check: passed.
- Disposable Compose service smoke: passed; API/OCR readiness, normalized guest read/write, idempotency replay, and exact cleanup verified in evidence/container-smoke-readback-2026-09-11.md.

## Open questions and evidence limits

- The selected source is a visual concept for the home surface, not a complete source mock for every sheet. Sheet QA therefore checks the shared Emerald Atelier design system, hierarchy, control states, touch sizing, copy, and runtime behavior rather than claiming pixel identity to a missing sheet mock.
- Real iOS/Android camera optics, VoiceOver/TalkBack, Dynamic Type, external push delivery, managed database failover, and production traffic cutover remain separate operational/device gates.

## Implementation checklist

- [x] Source and implementation captured at equal normalized CSS dimensions.
- [x] Home first-viewport hierarchy compared side by side.
- [x] Intake, meal plan, food detail, account, and notification sheets captured.
- [x] Primary open/dismiss interactions exercised.
- [x] Console and page errors checked.
- [x] P0/P1/P2 visual findings fixed and re-captured.
- [x] Runtime, build, fixture, service-worker, Sites, sync, and service smoke evidence recorded.

## Native iPhone viewport pass

- Native shell server: `VITE_APP_SHELL=native`, demo mode.
- Native CSS viewport: `393 x 852`, `deviceScaleFactor=1`.
- Native home screenshot: `evidence/design-qa-2026-09-11/native/native-home-393x852.png`.
- Native receipt sheet: `evidence/design-qa-2026-09-11/native/native-receipt-sheet.png`.
- Native meal sheet: `evidence/design-qa-2026-09-11/native/native-meal-sheet.png`.
- Native meal sheet after scrolling to its action row: `evidence/design-qa-2026-09-11/native/native-meal-sheet-scrolled.png`.
- Native food detail sheet: `evidence/design-qa-2026-09-11/native/native-food-detail-sheet.png`.
- Native account sheet: `evidence/design-qa-2026-09-11/native/native-account-sheet.png`.
- Native notifications sheet: `evidence/design-qa-2026-09-11/native/native-notifications-sheet.png`.
- Native guidance sheet: `evidence/design-qa-2026-09-11/native/native-guidance-sheet.png`.
- Native camera preparing state: `evidence/design-qa-2026-09-11/native/native-camera-input.png`.
- Native camera permission-denied state: `evidence/design-qa-2026-09-11/native/native-camera-denied.png`.
- Native capture summary: `evidence/design-qa-2026-09-11/native/native-capture-summary.json`.
- Native `device-screen` and `mobile-app-viewport` both measured `393 x 852`.
- Native bottom navigation measured `top=740`, `bottom=818`, `height=78`; the calibrated `34px` device safe-area remains below it.
- Native home content keeps the hero, status card, three queue rows, meal CTA, trust strip, and nav cleanly separated; pantry content is pushed below the first viewport.
- Native receipt and meal sheets opened and dismissed with Escape.
- Native food detail, account, notifications, and guidance sheets opened and dismissed with Escape.
- Native camera preparing and permission-denied states were opened at `393 x 852`; the denied state exposes both photo-library fallback and input-method recovery.
- Native console errors: `0`; page errors: `0`.
- `npm run test:native`: `4 passed`.

## Final product judgment

The selected Emerald Atelier direction now has separate preview-simulator and native-iPhone safe-area rules. The native shell does not paint app content under the iPhone home indicator, the first viewport does not leak the pantry search into the navigation region, and the primary CTA remains visible before scrolling.

## Continuous iPhone improvement pass

- Moved the `식품 추가` action directly below the meal CTA so the primary add path is visible on the first iPhone viewport instead of being pushed after the pantry section.
- Re-captured native iPhone home and preview comparison after the order change; the source-aligned sequence is now status card → three queue rows → meal CTA → 식품 추가 → safety note → bottom navigation.
- Extended native capture geometry checks for both receipt and meal sheets: width `393px`, screen bottom `852px`, sheet content safe-area padding `53px` (34px device inset + 19px content rhythm), document/body horizontal scroll width `393px`, console/page errors `0`.
- Corrected the native harness to allow the iOS sheet surface to paint behind the home-indicator area while requiring its content container to reserve the calibrated inset. Entrance spring settle is awaited before geometry assertions.

## Small iPhone SE viewport pass

- Additional native capture: `evidence/design-qa-2026-09-11/native/native-home-320x740.png`.
- CSS viewport: `320 x 740`, native shell, `deviceScaleFactor=1`.
- Compact rhythm is applied only below `360px`: status card `140px`, priority rows `50px`, meal CTA `42px`, add action `29px`, safety strip `30px`.
- Geometry readback: meal CTA `top=524.5`, `bottom=566.5`; 식품 추가 `top=566.5`, `bottom=595.5`; safety strip `top=595.5`, `bottom=625.5`; bottom nav `top=628`, so no primary action overlaps the navigation region.
- `documentScrollWidth=320`, no interactive element is out of bounds, and the visual capture keeps the core loop readable without horizontal clipping.

## Latest continuous improvement pass

- Moved `식품 추가` into the first-viewport action sequence directly after the meal CTA and re-captured both preview and native iPhone states.
- Added native 320 x 740 coverage for iPhone SE-sized screens. The compact layout keeps the meal CTA, add action, and safety strip above the bottom navigation with no horizontal clipping.
- Added native sheet geometry readback after entrance animation settle. iOS sheet surfaces may extend to the screen bottom, while `.sheet-content` reserves the calibrated 53px inset.
- Current native checks: 393 x 852 home/sheet captures, 320 x 740 home capture, native viewport regression `4 passed`, fixture/mobile runtime `35 passed, 3 skipped`, console/page errors `0`.

## Latest small-screen polish

- Added `word-break: keep-all` to Korean home headings, section headings, and recipe titles so a 320px iPhone does not split a word such as `덮밥` in the middle.
- Re-captured `evidence/design-qa-2026-09-11/native/native-meal-sheet-320x740.png`; the recipe title now wraps between words while the sheet remains within `320px` with no horizontal overflow.

## Long-sheet action reachability pass

- Scrolled the native meal sheet to its maximum scroll position and captured `evidence/design-qa-2026-09-11/native/native-meal-sheet-scrolled.png`.
- The recipe action row ended at `bottom=690.7px`, leaving more than the calibrated 34px native safe area; the sheet content remained `393px` wide with no document overflow.
- This confirms that a user can reach the save/recipe actions without relying on a fixed footer or tapping beneath the iPhone home indicator.

## Camera recovery pass

- The native camera preparing state keeps the framing guide, camera title, close action, disabled-until-ready capture button, photo-library fallback, and privacy note inside one bounded sheet.
- A forced `NotAllowedError` reproduces the permission-denied state. The recovery surface presents `사진에서 선택` and `입력 방법 다시 보기` without exposing a browser exception or leaving the user in a dead end.
- Both states measured `393px` document width with no console/page errors; the existing camera crop and media-permission contracts remain covered by fixture/mobile tests.

## Continuous iPhone polish — latest pass

- Updated PWA metadata for the Emerald Atelier surface: Safari standalone status bar and manifest theme/background now use the deep forest `#071512` instead of the previous light/sage transition colors.
- Added missing accessible names for the food-detail opened-state switch and account in-app notification switch; the native audit now exposes the intended control labels to assistive technology.
- Re-captured native 393 x 852 food detail, account, notifications, and guidance sheets plus the maximum-scroll meal action state. Every sheet measured `393px` wide with `53px` safe-area content padding and no body/document horizontal overflow.
- Large-type and 320 x 740 checks remain clean. Current verification: build `759` modules, native viewport `4 passed`, fixture/mobile runtime `35 passed, 3 skipped`, mutation helper tests `6 passed`, and console/page errors `0` in capture runs.

## Accessibility contrast pass

- Emulated `prefers-contrast: more` at `393 x 852` and captured `evidence/design-qa-2026-09-11/native/native-home-high-contrast-393x852.png`.
- Contrast mode raises border and supporting-text tokens without changing the Emerald Atelier hierarchy; document/body width remains `393px` and no interactive element leaves the viewport.
- Contrast capture console/page errors: `0`.

## Production offline empty-state pass

- Reproduced production mode with an unreachable HTTPS API at `393 x 852` native viewport and captured `evidence/design-qa-2026-09-11/native/native-production-offline-393x852.png`.
- The screen correctly shows `오프라인 · 임시 화면`, a single `다시 연결` action, zero inventory, and the primary `첫 식품을 추가하고 시작하기` CTA without demo fixture food.
- Removed the redundant secondary `식품 추가하기` action when the workspace has zero foods; it remains available once a real inventory exists. The offline summary confirms `secondaryAdd=0`, `fixtureFood=0`, and document width `393px`.
- Browser-level `ERR_CONNECTION_REFUSED` messages from the intentionally unreachable test API are recorded separately in `native-production-offline-summary.json`; no page errors or app-thrown errors occurred.

## Native install icon pass

- Added the iOS `apple-touch-icon` link and PNG install assets at 180 x 180, 192 x 192, and 512 x 512; the manifest now serves raster icons for `any` and `maskable` install purposes.
- Verified the new assets in the production build and canonical preview: all returned HTTP 200 with `image/png` and exact dimensions.
- Added release provenance and fixture assertions for the HTML link, manifest entries, PNG signature, dimensions, and reachable assets.
- PWA-focused runtime checks passed **2**, full fixture/mobile runtime passed **35 with 3 skipped**, build passed at **759 modules**, and `git diff --check` passed.
- iPhone Safari user-agent simulation at `393 x 852` rendered the install prompt, opened/collapsed the `홈 화면에 추가` instructions, and dismissed the prompt with `0` console/page errors; capture: `evidence/design-qa-2026-09-11/native/native-ios-install-prompt.png`.
- Physical Safari/Android launcher rendering remains a device acceptance gate; this pass closes only the source/static/build/HTTP metadata gap.

## Camera permission announcement pass

- The camera permission-denied recovery region now uses `aria-live="polite"` and `aria-atomic="true"`, so the transition is exposed to assistive technology while the photo-library and input-method recovery actions remain available.
- Forced `getUserMedia()` rejection at `393 x 852` rendered the recovery state at `353 x 340` with `0` console/page errors; accepted capture: `evidence/design-qa-2026-09-11/native/native-camera-denied.png`.
- Camera fallback regression passed **1**, native viewport passed **4**, full fixture/mobile runtime passed **35 with 3 skipped**, and the build passed at **759 modules**.
- Physical VoiceOver/TalkBack speech and real permission-sheet behavior remain device acceptance gates.

## Intake tab semantics pass

- Receipt, barcode, label, and manual-entry tabs now expose stable `aria-controls`/`aria-labelledby` relationships, a roving tab stop, and ArrowLeft/ArrowRight/Home/End navigation.
- A temporary `mode-panel` wrapper caused a visible surface-cascade regression; the rendered receipt capture caught it, and the wrapper was renamed to `mode-tabpanel` so the existing panel surface rule cannot recolor it.
- Final receipt capture retains the Emerald Atelier surface and measures `393px` wide with `53px` safe-area content padding and no document overflow.
- Tab regression passed **1**, native viewport passed **4**, full fixture/mobile runtime passed **35 with 3 skipped**, and the build passed at **759 modules**.
- Readback: `evidence/accessible-intake-tabs-readback-2026-09-11.md`.

## iOS install guidance semantics pass

- The iOS install prompt now exposes `aria-expanded` and `aria-controls` for the `설치 방법` action; the expandable instruction note has a stable ID and `role="note"`.
- iPhone Safari user-agent simulation at `393 x 852` verified closed → open → closed state transitions with the existing compact visual prompt and no forced navigation.
- Focused guidance regression passed **1**, and the production build passed at **759 modules** with protected runtime **28 files**.
- Readback: `evidence/pwa-install-guidance-accessibility-readback-2026-09-11.md`.

## Large-text baseline pass

- The app-owned first-viewport hierarchy now uses rem sizing for the key reading elements while retaining the default 1x pixel composition and compact 320px overrides.
- At 393 x 852, root text size 125% changed the greeting from 24px to 30px and the priority heading from 17px to 21.25px.
- The large-text meal CTA ended at 687.8px and the 식품 추가 action at 724.8px; the native navigation begins at 740px, so neither primary action is covered.
- Baseline and large-text captures are saved under evidence/design-qa-2026-09-11/native/.
- Baseline, home 125%, meal 125%, and food-detail 125% captures are saved under evidence/design-qa-2026-09-11/native/.
- Native viewport regression passed **8** including reduced-motion settling, large-text safety reachability, meal/detail sheet typography, and touch targets; build passed at **760 modules**; actual iOS Dynamic Type remains a physical-device gate.
- Readback: `evidence/large-text-readback-2026-09-11.md`.

## Touch target baseline pass

- Primary Home, header, intake, meal, detail, notification, and install controls now use a 44px hit-box baseline where the compact visual system previously rendered 25–38px boxes.
- The first viewport remains safe: meal CTA bottom `653.4px`, add action bottom `699.4px`, trust card bottom `739.4px`, native navigation top `740px`.
- At 320px, default compact rhythm ends the safety note at `625px` before the nav at `628px`; with 125% text, the primary add action ends at `612.1px`, and the safety note remains scrollable content below the fixed nav.
- Native touch-target regression passed **1 additional test**; the native suite now passes **7** tests.
- The opened-state toggle keeps its compact visual track while exposing a `44x44` button box.
- Recipe action/history and food-detail discard actions also use the 44px baseline.
- Captures: `evidence/design-qa-2026-09-11/native/native-touch-target-home-393x852.png`, `native-touch-target-meal-393x852.png`, and `native-touch-target-detail-393x852.png`.
- Readback: `evidence/touch-target-readback-2026-09-11.md`.

## Android Pixel safe-area pass

- Pixel 10 preview no longer double-reserves the Android navigation bar; app navigation now ends at the reserved viewport edge.
- Readback geometry: app viewport bottom 1028px, Android navigation top 1029px, app nav bottom 1028px.
- Pixel edge regression passed 1, build passed at 760 modules, and the accepted capture is `evidence/design-qa-2026-09-11/pixel-touch-target-home.png`.
- Readback: `evidence/android-pixel-preview-readback-2026-09-11.md`.

## Android Pixel sheet safe-area pass

- Pixel meal sheet also ends at the reserved app viewport edge (`1028px`) rather than floating above the Android navigation bar; content reserves the expected `67px` bottom space.
- Accepted capture: `evidence/design-qa-2026-09-11/pixel-meal-sheet.png`.

## Visible control naming pass

- Added a major-surface regression that checks visible Home, receipt, meal, detail, account, notification, and guidance controls for a non-empty DOM accessible name.
- The check covers aria-label, aria-labelledby, visible text, placeholder, and title fallback order without claiming physical screen-reader speech output.
- Focused accessible-name regression passed **1**; current fixture/mobile lane is **38 passed + 3 skipped** across **41 tests**, native **6 passed**, and build **760 modules**.
- Readback: `evidence/visible-control-name-readback-2026-09-11.md`.

## Account tab semantics pass

- Login/register now use the same tab/tabpanel ID, roving focus, and arrow-key contract as intake tabs.
- Account tab focused regression passed **1**, and the current fixture/mobile lane remains **38 passed + 3 skipped**.
- Readback: `evidence/account-tabs-readback-2026-09-11.md`.

## Reduced-motion sheet pass

- The app-owned Prototype tree now provides Motion's user reduced-motion policy to the protected BottomSheet descendants; normal users keep the existing spring/drag presentation.
- Reduced-motion native regression passed **1**, and the full native suite now passes **8** tests.
- Readback: `evidence/reduced-motion-readback-2026-09-11.md`.

## High-contrast native pass

- The existing `prefers-contrast: more` layer is now covered by a native regression: muted text and strong border tokens are raised while screen width, body width, and touch geometry remain stable.
- Focused contrast regression passed **1**; the full native suite now passes **9** tests.
- Readback: `evidence/contrast-readback-2026-09-11.md`.

## Account first-fold action pass

- Fresh native `393 x 852` capture found the guest account sheet's primary `로그인`
  action clipped below the first viewport when the sheet used `snap=0.7`:
  `y=829.7..873.7px` against an `852px` screen.
- Increased only the account sheet snap to `0.8`; the current sheet begins at
  `y=170px`, and the complete login/register form is visible without a first-scroll
  requirement. The existing `53px` content safe-area padding remains unchanged.
- The native regression waits for the entrance spring to settle before reading
  geometry, so the assertion covers the settled UI rather than an animation frame.
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-account-sheet-393x852.png`.
- Focused account first-fold regression passed **1**; full native viewport passed
  **14**; fixture/mobile passed **39 with 3 skipped**; connected current-source passed
  **107/107 in the latest clean lane**; build passed at **760 modules**; Sites/service-worker/workspace-sync/release
  manifest passed **4/5/9/2**; capture console/page errors were **0**.
- Physical VoiceOver/TalkBack speech, OS Dynamic Type, and real device compositor/inset
  behavior remain separate acceptance gates.
- Readback: `evidence/account-sheet-first-fold-readback-2026-09-11.md`.

## Food detail state and mutation-action first-fold pass

- Fresh native `393 x 852` capture found the food detail `개봉됨` state control
  starting around `y=822px`, below the calibrated home-indicator boundary at
  `818px` when the sheet used `snap=0.78`. After that toggle fix, the `먹었어요`
  and `보관 상태 저장` actions still began at `y=843.2px`.
- Increased only the detail sheet snap to `0.93`; the current sheet begins at
  `y=60px`, and the opened-state control plus both primary mutation actions are
  visible without an initial scroll. The existing `53px` content safe-area padding
  remains unchanged.
- The native regression waits for the entrance spring to settle before reading the
  switch and primary action row geometry against the `34px` safe-area boundary.
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-sheet-393x852.png`.
- Focused detail first-fold regression passed **1**; full native viewport passed
  **14**; fixture/mobile passed **39 with 3 skipped**; build passed at **760 modules**;
  current connected detail/first-opened regressions passed **3**; the latest long full
  connected lane passed **107/107**; Sites/service-worker/
  workspace-sync/release manifest passed **4/5/9/2**; capture console/page errors were
  **0**.
- Physical VoiceOver/TalkBack speech, OS Dynamic Type, and real device compositor/inset
  behavior remain separate acceptance gates.
- Readback: `evidence/food-detail-first-fold-readback-2026-09-11.md`.

## Connected inventory pagination lifecycle pass

- The current connected inventory-search path no longer clears and restarts the
  active query when the storage-location presentation list changes. Search page
  materialization reads the latest locations through a ref; location-name changes
  reconcile the existing rows without changing the page offset.
- The existing page-contract regression repeated **10 passed** on ports `8143/4543`.
  Focused PDF/manual-priority/planner regressions repeated **3/3/3 passed** on clean
  disposable ports. Fixture/mobile remained **39 passed + 3 skipped**, build remained
  **760 modules**, Sites/service-worker/workspace-sync/release manifest passed
  **4/5/9/2**, and diff-check passed.
- An earlier long full connected run collected **106** tests and returned **103 passed /
  3 timing-sensitive failures** in the same three flows. After the pagination lifecycle
  fix, the fresh full connected rerun passed **107/107**, so the current source has a
  clean full-lane result.
- Readback: `evidence/inventory-search-pagination-readback-2026-09-11.md`.

## Food detail narrow-viewport responsive pass

- The detail sheet's 393×852 `snap=0.93` caused a fixed `792px` sheet and clipped
  the title at `y=-52px` on a 320×740 viewport.
- Detail snap is now bounded from the live viewport height: 393×852 keeps the
  existing composition, while 320×740 settles at `y=8..740px` with the title at
  `y=47.2..69.2px`. The handle and title are no longer clipped.
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740.png`.
- Focused narrow major-sheet regression passed **1**; full native passed **14**;
  fixture/mobile baseline remains **39 passed + 3 skipped**; build **760 modules**;
  protected runtime **28**; capture errors **0**.
- Readback: `evidence/food-detail-narrow-viewport-readback-2026-09-11.md`.

## Food detail narrow-viewport action reachability pass

- At 320×740, the detail primary action row is now covered by a max-scroll
  reachability regression rather than only a horizontal/bounds check.
- After scrolling to the end, `.detail-actions` measures `y=577.875..621.875px`
  against the calibrated safe-area boundary `706px`; both primary actions are
  fully reachable.
- Focused scroll regression passed **1**; full native suite passed **14**;
  fixture/mobile is **39 passed + 3 skipped** across **42 tests**.
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740-actions-scrolled.png`.
- Readback: `evidence/food-detail-action-reachability-readback-2026-09-11.md`.

## Camera permission-denied narrow pass

- Forced `NotAllowedError` at 320×740 renders the recovery region at `y=294..634px`
  with both `사진에서 선택` and `입력 방법 다시 보기` at `y=499.8..543.8px`.
- The recovery region stays above the `706px` safe-area boundary, remains 320px wide
  without document overflow, and exposes `aria-live="polite"`/`aria-atomic="true"`.
- Focused camera narrow regression passed **1**; full native passed **14**;
  fixture/mobile remains **39 passed + 3 skipped** across **42 tests**.
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-camera-denied-320x740.png`.
- Readback: `evidence/camera-permission-denied-narrow-readback-2026-09-11.md`.

## Bottom sheet focus containment pass

- Permanent fixture coverage now traverses the open receipt sheet with **24 forward
  Tab** and **24 reverse Shift+Tab** steps; every active element remains inside the
  dialog, and Escape restores focus to `식품 추가하기`.
- Focused regression passed **1**. This verifies DOM keyboard containment and focus
  restoration without changing the protected BottomSheet runtime.
- Current fixture/mobile lane: **39 passed + 3 skipped** across **42 tests**; native **14 passed**.
- Readback: `evidence/modal-focus-containment-readback-2026-09-11.md`.

## Native bottom sheet focus containment pass

- Native `393 x 852` portal traversal now has permanent coverage for **24 forward
  Tab** and **24 reverse Shift+Tab** steps, with zero focus escapes and trigger focus
  restoration after Escape.
- Focused native regression passed **1**; full native suite passed **14**;
  fixture/mobile remains **39 passed + 3 skipped** across **42 tests**.
- Readback: `evidence/native-focus-containment-readback-2026-09-11.md`.

## Food detail narrow large-text reachability pass

- At 320×740 with `html { font-size: 125%; }`, the detail title resolves to
  `23.75px` and the max-scroll primary actions end at `y=622.109px`, below the
  `706px` safe-area boundary with no horizontal overflow.
- Focused large-text native regressions passed **2**; full native passed **14**;
  fixture/mobile remains **39 passed + 3 skipped** across **42 tests**.
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740-large-text.png`.
- Readback: `evidence/food-detail-large-text-narrow-readback-2026-09-11.md`.

## Current source continuation — 2026-09-12 intake readiness

- Printed-date connected fixture now derives a local-calendar target seven days ahead,
  so the test isolates printed-date meaning from the normal today/expired urgency state.
- Primary intake lazy chunks now warm in a zero-delay post-commit task while remaining
  code-split; the explicit user-intent prefetch and retry path remain intact.
- Latest full connected source: **108/108 passed**; API: **508 passed / 8 warnings**;
  fixture/mobile: **39 passed + 3 skipped** across **42 tests**; native: **14 passed**;
  build: **760 modules**; protected runtime: **28 files**.
- Readbacks: `evidence/date-fixture-determinism-readback-2026-09-12.md`,
  `evidence/intake-idle-prefetch-readback-2026-09-12.md`.

## Current responsive detail pass — 2026-09-12

### Source and implementation

- Source visual truth: `/Users/kimminkyu/.codex/generated_images/01a089d3-ea3a-7601-a729-7438361f33f0/exec-394154ea-a520-4327-8272-9fec8781dfc9.png` (selected Emerald Atelier mobile concept, retained as the home visual reference).
- Implementation: `evidence/design-qa-2026-09-12/native-continuous-20260912/native-food-detail-sheet.png` and `evidence/design-qa-2026-09-12/native-continuous-20260912/native-food-detail-320x740.png`.
- Source pixels: `854 x 1806`; implementation pixels: `393 x 852` and `320 x 740`; implementation CSS viewport and device scale factor: `393 x 852 @ 1x` and `320 x 740 @ 1x`. The source home concept and detail sheet are different interaction states, so this pass treats the selected image as visual language and the native captures as responsive interaction evidence rather than claiming a pixel-identical sheet comparison.

### Finding and fix

- Earlier native geometry showed the 393px detail destructive action below the iPhone safe boundary (`y=825.296..869.296`, boundary `818px`) and the 320px primary mutation row below the initial safe boundary (`y=712.953..756.953`, boundary `706px`).
- The detail sheet snap is now bounded with a live viewport calculation (`max 0.993`, `viewportHeight - 6`), and only the supporting detail cards tighten at `max-width: 360px`. The 44px control boxes and safety copy remain intact.
- Revised geometry is `393px`: sheet `y=6..852`, primary actions `y=717.484..761.484`, destructive action `y=773.484..817.484`; `320px`: sheet `y=6..740`, primary actions `y=646.641..690.641`. The 320px primary actions are fully visible before scrolling; the destructive action remains intentionally lower and is reachable after scroll.
- At `320px`, queue metadata resolves to `8px`; queue rows remain `50px`, the meal CTA remains `y=509.031..551.031`, the reserved navigation remains `y=628..706`, and document/body width remain `320px`.

### Fidelity review

- Typography: the existing Georgia/editorial heading and system Korean body hierarchy are unchanged at the 393px source viewport; at 320px, secondary queue metadata rises from `7px` to `8px` without changing the primary type scale or copy.
- Spacing/layout: tall detail sheets use the additional viewport headroom while narrow sheets reduce only repeated card padding/gaps; no document or sheet horizontal overflow was observed.
- Colors/tokens: Emerald Atelier forest, pistachio action, coral warning, and muted metadata tokens remain unchanged and match the selected concept's hierarchy.
- Images: the existing transparent food cutout and selected hero raster remain in use; no placeholder or CSS-drawn image was introduced.
- Copy/content: the safety distinction between 표시 소비기한, 확인 필요, and 먼저 먹기 remains unchanged.

### Interaction and error checks

- Native captures covered home, receipt, meal, food detail, account, notifications, and guidance states. Console errors: `0`; page errors: `0`.
- Focused 393px detail action regression passed **1**; focused 320px initial/max-scroll action regression passed **1**; full native passed **14**.
- Fixture/mobile passed **39 + 3 skipped / 42 tests**; build passed with **760 Vite modules** and **28 protected runtime files**; Sites/service-worker/workspace-sync/release manifest passed **4/5/9/2**; `git diff --check` passed.

Readback: `evidence/food-detail-first-fold-compact-readback-2026-09-12.md`.

## Current queue metadata long-label pass — 2026-09-13

- A synthetic `320×740` native state with `우리집 김치 전용 냉장고 왼쪽 선반` and `사용자가 포장지에서 확인한 날짜` reproduced the previously unbounded storage pill risk.
- The app-owned queue metadata now keeps the storage pill and date provenance on one line with ellipsis: storage `x=62..145.719`, date `x=151.719..244`, metadata `x=62..244`; document/body width remain `320px`.
- Native full suite **14 passed**, build **760 modules**, protected runtime **28**, and `git diff --check` passed. This is a geometry regression readback; physical font rasterization and localized extreme strings remain separate gates.

Readback: current CSS at `apps/web/src/prototype.css:13627` and current native geometry probe.

final result: passed
