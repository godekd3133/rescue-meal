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

## Web header action hierarchy pass — 2026-09-17

- The web notification action now lives in the top header beside connection, theme, and scan controls; the hero region is reserved for the greeting and next-action message.
- Mobile/native keep their notification action in the hero position so the compact 320px layout does not make header controls compete for width or intercept pointer events.
- Rendering is surface-specific: only one notification button is emitted per build surface, avoiding hidden duplicate controls in the accessibility tree and test selectors.
- Web regression: `1 passed`; preview/mobile regression: `44 passed, 3 skipped`; native regression: `14 passed`; browser console/page errors: `0` in the latest captured surface.

final result: passed

## Mobile app-only execution pass — 2026-09-17

- Native browser execution uses `VITE_APP_SHELL=native` and shows the app UI without a visible phone mockup. The desktop review viewport constrains the mobile composition to `393px` and centers it; an actual mobile viewport remains full width.
- App-only viewport capture: `evidence/design-qa-2026-09-16/native-app-only-screen.png`.
- Desktop review capture: `evidence/design-qa-2026-09-16/native-app-only-1280x900.png`.
- Readback: `evidence/design-qa-2026-09-16/native-app-only-summary.json`.
- Verified styles: `phoneBezelDisplay=none`, `devicePickerDisplay=none`, `statusBarDisplay=none`, `homeIndicatorDisplay=none`, and `screenBox.width=393`.
- This keeps the hidden compatibility wrapper required by the existing native runtime but removes all simulator chrome from the rendered execution surface.

final result: passed

## Web/mobile surface separation pass — 2026-09-16

### Runtime contract

- Browser default surface: `VITE_APP_SHELL=web`.
- Phone simulator surface: `VITE_APP_SHELL=preview`.
- Native shell surface: `VITE_APP_SHELL=native`.
- The web surface uses `WebRuntime` and does not mount `PhoneFrame`, `StatusBar`, `HomeIndicator`, `KeyboardDock`, `DevicePicker`, or phone bezel assets.
- The preview/native surfaces continue to use the protected mobile runtime and its existing safe-area contracts.

### Web evidence

- Browser viewport: `1440 x 1000`.
- Web home capture: `evidence/design-qa-2026-09-16/web-home-1440x1000.png`.
- Web meal modal capture: `evidence/design-qa-2026-09-16/web-meal-modal-1440x1000.png`.
- Web runtime summary: `evidence/design-qa-2026-09-16/web-surface-summary.json`.
- DOM readback: `webRuntimeCount=1`, `phoneFrameCount=0`, `deviceScreenCount=0`, `devicePickerCount=0`.
- Primary interaction: `확인하고 오늘 식단 만들기` opens the web modal without PhoneFrame portal errors.
- Console errors: `0`; page errors: `0`.

### Visual and functional result

- Web layout uses a real desktop surface with top navigation, broad content rhythm, two-column queue/status layout, and desktop inventory grid.
- Phone simulation remains an explicit preview-only mode instead of the default browser presentation.
- The web modal is centered and desktop-sized; the mobile sheet remains a bottom sheet only in preview/native modes.
- Preview/mobile regression: `44 passed, 3 skipped`.
- Native regression: `14 passed`.
- Web surface regression: `1 passed`.
- Build: `762` Vite modules; protected runtime `28` files; bundle budget `19` JS chunks, `1207.7KB` JS, `238.6KB` CSS.

final result: passed

## Current redesign pass — 2026-09-16 cobalt light + midnight dark

### Source and implementation

- Light source visual truth: `/Users/kimminkyu/.codex/generated_images/01a0a833-a6f4-7190-abd5-9d4f0c8f71e4/exec-dba081f8-cdd4-4351-8ee7-8bc0b93be7b2.png`.
- Dark source visual truth: `/Users/kimminkyu/.codex/generated_images/01a0a833-a6f4-7190-abd5-9d4f0c8f71e4/exec-a14f573c-d163-43e5-851f-e6bea5e583d8.png`.
- Rendered light home: `evidence/design-qa-2026-09-16/light-home-screen.png`.
- Rendered dark home: `evidence/design-qa-2026-09-16/dark-home-screen.png`.
- Rendered light meal sheet: `evidence/design-qa-2026-09-16/light-meal-sheet.png`.
- Rendered dark meal sheet: `evidence/design-qa-2026-09-16/dark-meal-sheet.png`.
- Full-view comparisons: `evidence/design-qa-2026-09-16/comparison-light-source-vs-implementation.png` and `evidence/design-qa-2026-09-16/comparison-dark-source-vs-implementation.png`.
- Capture readback: `evidence/design-qa-2026-09-16/capture-summary.json`.

### Normalization and state

- Browser viewport: `1399 x 1200`; implementation CSS screen: `393 x 852`; `deviceScaleFactor=1`.
- Source concepts are `390 x 844`; comparison inputs normalize them to `393 x 852` for the current calibrated mobile screen.
- Fixture state: demo home with seven foods, three priority rows, no authenticated API dependency.
- Both theme states were captured from the same route and data. The theme toggle was exercised light → dark → light, and its preference survived reload through the non-sensitive `rescue-meal.theme` local preference.
- Primary flow was exercised in both themes: open `확인하고 오늘 식단 만들기`, verify the meal sheet, dismiss with Escape.
- Browser console errors: `0`; page errors: `0`.

### Fidelity review

- Typography: the existing Korean sans hierarchy and editorial Rescue Meal lockup remain readable at 393px. The implementation uses the project-approved fallback stack rather than embedding an unlicensed font.
- Spacing/layout: the selected option 1 composition is preserved—hero greeting → one status summary → three lightweight priority rows → one blue CTA → add action → safety note → persistent navigation. The mobile runtime reserves its calibrated status/home-indicator chrome by design.
- Colors/tokens: light mode uses cobalt `#3182f6` for the primary action and active navigation; dark mode uses electric cobalt `#6f8dff`. Coral `확인 필요`, amber `먼저 사용`, and slate `기록됨` remain semantic and unchanged across themes.
- Images: the existing workspace-local hero and transparent food cutouts remain in use. No placeholder, emoji, handcrafted SVG, or CSS-drawn food asset was introduced.
- Copy/content: the visible hierarchy now says `오늘 먼저 확인할 식품` → `확인하고 오늘 식단 만들기`. The existing safety boundary remains explicit: AI does not determine safe consumption, and priority guidance is not promoted to a confirmed expiration date.

### Findings

- No actionable P0/P1/P2 findings remain in the light or dark home comparisons or the captured meal sheets.
- P3 / intentional runtime difference: the generated source images are app-content-only, while the implementation screenshot includes the protected template-owned status bar, camera cutout, and home indicator. The runtime guide explicitly excludes those elements from app-owned fidelity claims.
- P3 / intentional copy difference: the generated mock uses compact date language for visual exploration; the implementation keeps the product's safer date-meaning labels such as `조리 전 날짜 확인`, `AI 소비 우선순위`, and `사용자 확인`.
- Sheet source limitation: no separate generated sheet mock was supplied, so sheet QA evaluates the shared light/dark tokens, hierarchy, touch targets, copy, focus semantics, and dismissal behavior rather than claiming pixel identity to an unavailable sheet source.

### Non-visual verification

- Protected mobile runtime check: passed, `28` files.
- Production build: passed, `761` Vite modules; Sites output prepared.
- Fixture/mobile Playwright: `44 passed, 3 skipped`, including the new home theme-toggle regression and existing home, receipt, camera, detail, account, notification, meal, keyboard, and accessibility coverage.
- `git diff --check`: passed.
- The untracked `apps/web/shot-tmp.mjs` and the pre-existing blue-token edits were not removed or reset; they remain outside this pass's ownership boundary.

### Implementation checklist

- [x] Selected option 1 information hierarchy is implemented.
- [x] Cobalt light treatment is implemented.
- [x] Midnight dark treatment is implemented.
- [x] Theme toggle has an accessible name and persistence behavior.
- [x] Primary CTA and meal sheet work in both themes.
- [x] Light/dark source and implementation captures were normalized and compared.
- [x] No actionable P0/P1/P2 visual findings remain.

final result: passed

## Web bottom navigation pass — 2026-09-17

- The web navigation is now fixed to the bottom edge rather than the top header.
- Web home capture: `evidence/design-qa-2026-09-16/web-home-bottom-nav-1440x1000.png`.
- Geometry readback: `evidence/design-qa-2026-09-16/web-bottom-nav-summary.json`.
- At `1440 x 1000`, the navigation box is `y=925..1000`, `position=fixed`, `top=auto`, and `bottom=0`; the app surface has no `phone-frame` or `device-screen`.
- The top area now contains only the Rescue Meal brand, connection state, theme toggle, scan action, and notification action. The bottom navigation remains the persistent destination switcher.
- Web surface regression after the change: `1 passed`; build: `762` modules; bundle budget: `19` JS chunks, `1207.7KB` JS, `238.9KB` CSS; `git diff --check`: passed.

final result: passed

## Inventory navigation flow pass — 2026-09-17

- `전체 보기` now resets the inventory filter/search state, activates the bottom `식품` destination, and scrolls the custom app scroll root to `내 식품 목록`.
- The bottom `식품` destination now resolves both the current `.app-screen .mobile-scroll` structure and the equivalent root form, so the action is not dependent on an incorrect parent/child selector assumption.
- Current web readback: `activeNavigation=식품`, `scrollTop=700`, inventory section `y=382.1875..834.234375`, bottom navigation `y=925..1000`, `phoneFrameCount=0`, `deviceScreenCount=0`, console/page errors `0`.
- Web flow regression is covered by `web-surface.spec.ts` and passed after the fix; preview/mobile and native suites also passed after the shared handler change.

final result: passed

## Scroll-aware destination navigation pass — 2026-09-17

- The persistent bottom navigation now follows the visible content destination: it switches to `식품` when the inventory section reaches the reading threshold or the scroll reaches the end, and returns to `홈` when the user comes back to the top.
- The active-state observer is attached to the app-owned scroll root and also re-evaluates after content/viewport size changes. It is paused while a sheet is open so `식단` remains the selected destination until the sheet is dismissed.
- Web flow regression: `web-surface.spec.ts` scrolls to the inventory/end and back to the top, verifies `식품` → `홈`, keeps `식품` active while opening/closing food detail, and keeps `식단` active while the meal sheet is open; `1 passed`.
- Shared mobile regression after the change: `44 passed, 3 skipped`; native viewport regression: `14 passed`.
- Build: `762` Vite modules; protected runtime `28` files; bundle budget `19` JS chunks, `1207.9KB` JS, `238.9KB` CSS; `git diff --check`: passed.

final result: passed

## Pantry sticky toolbar pass — 2026-09-17

- The pantry heading, storage-location filter, and food search now share an app-owned sticky toolbar. The controls remain available while the user scans a longer inventory list instead of requiring a return to the section start.
- The toolbar uses the current light/dark surface tokens, blur, and a restrained divider so it reads as a navigation aid rather than a second card. Mobile preview/native surfaces allow the toolbar to stick to the real `MobileScroll` root; the web surface keeps the same behavior on the desktop canvas.
- Web surface regression now asserts the toolbar is visible and `position: sticky`; `1 passed`.
- Full fixture/mobile regression after the markup and CSS change: `44 passed, 3 skipped`; native viewport regression: `14 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1208.7KB` JS, `238.9KB` CSS; `git diff --check`: passed.

final result: passed

## Inventory return-context pass — 2026-09-17

- Opening a food detail now records the app scroll position and the selected inventory row's viewport offset. Closing the detail restores the row anchor when it still exists, with a bounded scrollTop fallback when the item was consumed, discarded, or filtered out.
- Notification-driven food detail uses the same return-context contract, so a user can inspect an alert without losing the inventory location underneath it.
- Web flow regression verifies the inventory scrollTop before and after detail open/close stays within `±1px`, while preserving the `식품` active destination; `1 passed`.
- Production build remains green at `762` Vite modules; protected runtime `28` files; `git diff --check`: passed.

final result: passed

## Inventory condition messaging pass — 2026-09-17

- When a search or storage filter is active, the sticky toolbar now exposes the current scope and result count, for example `“두부” 검색 결과 · 1개` or `냉동 보관 식품 · 1개`.
- The same row provides `검색·필터 초기화`, making the recovery action available while results are present instead of only after an empty state.
- During a server search with no previous result, the condition row yields to the dedicated loading/error state so the user does not see contradictory `0개` messaging. Connected recovery remains available through `다시 시도`.
- Preview keyboard flow verifies the search keyboard is visible while typing, the toolbar reset button works above it, and reset dismisses the simulated keyboard; prototype regression: `32 passed`.
- Connected server-search coverage: `3 passed`; native viewport: `14 passed`; production build: `762` modules; bundle budget: `19` JS chunks, `1210.3KB` JS, `240.4KB` CSS; `git diff --check`: passed.

final result: passed

## Preview keyboard inset and pantry toolbar pass — 2026-09-17

- Preview search now keeps the inventory section anchored to the app scroll root while keyboard focus is active. When filtering reduces the list height, the scrollTop is recalculated after the result DOM settles so the toolbar does not fall below the keyboard.
- The preview bottom navigation is hidden from hit testing and accessibility while the simulated keyboard owns the lower viewport; `MobileScroll` ends at the keyboard top and the toolbar remains above it.
- Geometry regression at the calibrated preview screen (`393×852`, simulated keyboard `338px`) verifies screen/keyboard alignment, scroll/keyboard boundary alignment, toolbar clearance, and hidden navigation; the inventory search scenario passed.
- Full fixture/mobile regression after the fix: `44 passed, 3 skipped`; native viewport: `14 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1210.3KB` JS, `240.4KB` CSS; `git diff --check`: passed.

final result: passed

## Keyboard-driven result reflow pass — 2026-09-17

- The first geometry probe exposed a real reflow defect: after `7개 → 1개` filtering, the custom scroll root could clamp to `scrollTop=0`, leaving the inventory toolbar at `y=606..757` while the simulated keyboard began at `y=638`.
- The fix recalculates the inventory section's target scrollTop directly against the app-owned scroll root after the result DOM settles, rather than relying only on `scrollIntoView`.
- Preview geometry now verifies `393×852` screen bounds, `338px` keyboard alignment, scroll bottom = keyboard top, toolbar bottom above keyboard top, and hidden bottom navigation while text entry is active.
- The realistic flow starts from the bottom `식품` destination before focusing search; targeted keyboard regression: `1 passed`.
- Full current fixture/mobile regression: `44 passed, 3 skipped`; native viewport: `14 passed`; web surface: `1 passed`; production build: `762` modules; bundle budget: `19` JS chunks, `1211.0KB` JS, `240.5KB` CSS; `git diff --check`: passed.

final result: passed

## Native viewport variants and contextual search status pass — 2026-09-17

- Native pantry geometry now covers both `320×740` and `393×852` viewports after navigating through the bottom `식품` destination. The test asserts sticky toolbar placement, result-row clearance above the persistent nav, visible native nav, and no horizontal overflow.
- Search loading and error copy now names the active query or storage scope, while the existing loading/error surfaces continue to suppress the condition summary when it would be contradictory.
- Preview keyboard geometry remains covered after the scroll-anchor fix; the complete fixture/mobile lane passed `44` tests with `3` intentional skips.
- Native viewport regression: `15 passed`; web surface: `1 passed`; connected inventory-search regression: `3 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1211.3KB` JS, `240.5KB` CSS; `git diff --check`: passed.

final result: passed

## Native viewport height-resize and sheet boundary pass — 2026-09-17

- A native `393×600` probe exposed a real sheet sizing defect: `BottomSheet` used the calibrated `852px` geometry even after the native screen had resized, so the food detail sheet began at `y=-65px`.
- The protected runtime now reads the current native screen element height for sheet sizing while preserving calibrated geometry for preview and web surfaces. The app-side detail snap was adjusted to avoid double-scaling the current viewport height.
- Height-transition coverage runs `393×852 → 393×740 → 393×600 → 393×852` with pantry search active, then opens food detail and repeats `600 ↔ 852`. It verifies toolbar/result/nav bounds, sheet top/bottom bounds, sheet content width, and no horizontal overflow.
- Runtime integrity was refreshed for the scoped protected change: `28` protected files passed.
- Full native regression: `16 passed`; fixture/mobile: `44 passed, 3 skipped`; web surface: `1 passed`; connected sheet/search subset: `6 passed`.
- Production build: `762` Vite modules; bundle budget: `19` JS chunks, `1211.4KB` JS, `240.5KB` CSS; `git diff --check`: passed.

final result: passed

## Visual viewport and slow-search status pass — 2026-09-17

- The app viewport-height producer now prefers `visualViewport.height` and listens to its resize event, falling back to `window.innerHeight` when the visual viewport API is unavailable. This keeps native keyboard/browser-chrome changes available to detail-sheet sizing.
- Search loading intentionally remains a contextual status card rather than a food-row skeleton: the connected slow-response probe verified query-specific copy, a visible animated search affordance, `aria-busy=true`, no contradictory condition summary, and ready-state recovery after release; `1 passed`.
- The status card preserves semantic clarity when the eventual result count and safety state are unknown, while keeping the toolbar position stable during the wait.
- Full fixture/mobile regression: `44 passed, 3 skipped`; native viewport: `16 passed`; web surface: `1 passed`; connected inventory-search coverage: `4 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1211.4KB` JS, `240.5KB` CSS; `git diff --check`: passed.

final result: passed

## Focused-search visual viewport reflow pass — 2026-09-17

- The focused inventory search reflow now also reacts to viewport-height changes, not only query/result changes. This covers the native case where the system keyboard or browser chrome changes the visual viewport before the user types a character.
- `visualViewport.height` is now the preferred height source with `window.innerHeight` fallback; the focused-search anchor effect includes the resulting viewport height dependency and repositions against the app-owned scroll root.
- Native height-transition coverage verifies pantry search and food detail across `393×852 → 393×740 → 393×600 → 393×852`; full native regression: `16 passed`.
- Full fixture/mobile regression: `44 passed, 3 skipped`; web surface: `1 passed`; connected inventory-search coverage: `4 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1211.7KB` JS, `241.1KB` CSS; `git diff --check`: passed.

final result: passed

## Focused-input viewport anchor pass — 2026-09-17

- Focused search reflow now considers the input's own viewport rectangle in addition to the inventory section anchor. If the visual viewport or keyboard overlay would cover the input, the app adjusts the custom scroll root until the input is inside the visible bottom boundary.
- The visible boundary is derived from the MobileScroll root, current device screen, and `visualViewport` bottom; preview keyboard and native visual-viewport paths therefore share the same anchor calculation.
- Native height-transition coverage now asserts search input top/bottom as well as toolbar and result-row bounds across `393×852 → 393×740 → 393×600 → 393×852`.
- Preview keyboard search geometry, full fixture/mobile, native, web, and build lanes remained green: `44 passed, 3 skipped`; `16 passed`; `1 passed`; `762` modules.
- Current bundle budget: `19` JS chunks, `1212.2KB` JS, `241.1KB` CSS; `git diff --check`: passed.

final result: passed

## Short-viewport detail action reachability pass — 2026-09-17

- Native height-transition coverage now scrolls the food detail content to its maximum position at both `393×600` and `393×852`, then verifies the primary detail actions remain above the `34px` home-indicator safe area.
- This separates sheet boundary safety from action reachability: the sheet must stay inside the screen and the action row must remain usable after the user reaches the content end.
- Native full regression after the added reachability assertion: `16 passed`; preview/mobile: `44 passed, 3 skipped`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1212.2KB` JS, `241.1KB` CSS; `git diff --check`: passed.

final result: passed

## Detail action priority and visual-viewport metrics pass — 2026-09-17

- The food detail primary action pair now uses a safe-area-aware sticky bar inside the sheet content. Its backdrop/divider is rendered without increasing normal flow height, so the destructive action below it keeps its previous reachability.
- Native detail tests verify the action bar is `position: sticky`, stays within the sheet at `393×600` and `393×852`, and leaves the discard action above the home-indicator boundary at `393×852` and `320×740`.
- The viewport producer now tracks `visualViewport.height` and `offsetTop`, subscribing to both resize and scroll events so focused-input reflow also responds to address-bar/keyboard movement where height is unchanged.
- Targeted native height/action and preview search geometry passed; full native: `16 passed`; fixture/mobile: `44 passed, 3 skipped`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1212.4KB` JS, `241.4KB` CSS; `git diff --check`: passed.

final result: passed

## Connected detail action readback pass — 2026-09-17

- Connected product-info failure recovery, cross-device food-detail refresh, and notification-to-food-detail navigation were re-run after the sticky detail action bar change.
- The three connected detail/notification scenarios passed, preserving local edits, retry semantics, and notification-driven detail routing while the action bar remains sheet-local.
- Current proof remains separate from device release acceptance: connected API `3 passed`; native full `16 passed`; fixture/mobile `44 passed, 3 skipped`; web surface `1 passed`.
- Bundle budget: `19` JS chunks, `1212.4KB` JS, `241.4KB` CSS; `git diff --check`: passed.

final result: passed

## Sticky action runtime ownership pass — 2026-09-17

- Detail action elevation is now computed by the runtime-owned `.sheet-content` scroll container rather than by the detail child, so portal/AnimatePresence mount timing and lazy detail content are observed at the actual scroll owner.
- The action bar remains sticky for reachability but only receives its elevated surface treatment after the sentinel passes the normal content position; returning to the top removes the treatment.
- A zero-gap wrapper keeps the sentinel out of the detail grid's normal spacing, preserving the original discard-action safe-area position.
- Native regression: `17 passed`, including normal → elevated → normal state transition; fixture/mobile: `44 passed, 3 skipped`; web surface: `1 passed`.
- Connected inventory/detail/notification subset: `7 passed`; production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1213.4KB` JS, `241.7KB` CSS; `git diff --check`: passed.

final result: passed

## Scroll-direction action treatment pass — 2026-09-17

- The detail action bar remains continuously available for safety-critical state changes; scroll direction only changes its visual weight.
- When the user scrolls down through a sticky action state, `detail-actions-scroll-down` reduces backdrop/shadow intrusion. When the user scrolls back up, `detail-actions-scroll-up` restores the full elevated treatment; returning to normal flow removes both direction classes.
- Native regression covers `normal → stuck + scroll-down → stuck + scroll-up → normal`; `1 passed` in addition to the full native `17 passed`.
- Full fixture/mobile regression: `44 passed, 3 skipped`; web surface: `1 passed`; connected inventory/detail/notification subset: `7 passed`.
- Production build: `762` Vite modules; protected runtime `28` files; bundle budget: `19` JS chunks, `1213.7KB` JS, `241.9KB` CSS; `git diff --check`: passed.

final result: passed

## Short-viewport first-action and sheet-origin pass — 2026-09-17

- A live 393px-wide, 720px-high native readback showed the first home CTA ending at `y=653` while the app navigation began at `y=608`; the navigation therefore obscured the primary action. This was a real first-viewport reachability defect, not a screenshot-only issue.
- The short-screen media contract now compresses only the supporting status card and rescue-queue rows. The primary `확인하고 오늘 식단 만들기` CTA ends at `y=602`, leaving a measured `6px` clearance above navigation while preserving the 44px touch target; the 393×852 composition keeps its original density.
- Meal-plan navigation now records the underlying content destination and reasserts `홈` or `식품` when the lazy sheet actually opens and when it closes. This prevents a concurrent inventory smooth-scroll from overwriting the `식단` selection and restores the originating destination after dismissal; the web flow covers both origins.
- Native full regression: `18 passed`; fixture/mobile: `44 passed, 3 skipped`; web surface: `1 passed`; connected inventory/detail/notification coverage: `12 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1213.9KB` JS, `242.6KB` CSS; `git diff --check`: passed.

## Sheet dismissal affordance pass — 2026-09-17

- Mobile detail readback showed the common sheet header exposed only the drag handle; the dismissal path depended on discovering swipe, backdrop, or Escape. The protected `BottomSheet` runtime now adds a common `닫기` control to every sheet header.
- The control is a 44×44px target, keeps the localized title/description column clear, hides the simulated keyboard on activation, and continues to use the existing Radix `onOpenChange`/focus-restore contract.
- Live detail readback confirmed the control is visible at 44×44px and closes the sheet while restoring focus to the food trigger. Modal-semantics and native touch-target regressions passed.
- Full fixture/mobile regression: `44 passed, 3 skipped`; native: `18 passed`; web surface: `1 passed`; connected inventory/detail/notification coverage: `12 passed`.
- Protected runtime integrity: `28` files; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1214.5KB` JS, `243.2KB` CSS; `git diff --check`: passed.

## Empty-result and offline certainty pass — 2026-09-17

- A native 393×720 readback exposed a scroll-anchor defect after a search collapsed the inventory from seven rows to zero: the browser max scroll left the pantry toolbar around `y=273` with a large blank region above it. Empty-result sections now reserve enough scroll length for the pantry destination to remain anchored at the top without inflating the empty card itself.
- Native empty-result geometry now verifies the pantry section and sticky toolbar at the screen top across `393×720` and `393×852`; the result card and footer stay above the app navigation. Fixture search recovery remains green.
- Production offline boot now distinguishes unavailable data from a confirmed empty workspace. With no cached inventory, dashboard/queue/pantry show `—` and `재고 확인이 필요해요`; the primary recovery actions are `다시 연결하고 재고 확인하기` or `계정 다시 연결하기`. A confirmed connected empty workspace retains the normal `0개` and add-food copy.
- Production offline readback uses the required HTTPS API env with an unreachable route and verifies both no-demo-data safety and short-screen CTA clearance: `1 passed`.
- Native full regression: `19 passed`; fixture/mobile: `44 passed, 3 skipped`; connected inventory/detail/notification coverage: `12 passed`; production offline: `1 passed`.
- Production build: `762` Vite modules; bundle budget: `19` JS chunks, `1215.8KB` JS, `244.3KB` CSS; `git diff --check`: passed.

## Offline short-screen recovery pass — 2026-09-17

- The offline recovery callout adds 86px before the hero, so the regular short-screen compression was not sufficient by itself. The `meal-home-data-unknown` variant now removes a further 5px from the supporting status card only; the live 393×720 native readback places the recovery CTA at `y=554..607` and app navigation at `y=608`.
- Unavailable inventory remains visually distinct from a confirmed empty workspace: the status card uses `—`, the queue and pantry use `재고 확인이 필요해요`, and the recovery action remains available without exposing a misleading add-food promise.
- Production offline contract with a short viewport: `1 passed`; native full regression: `19 passed`; fixture/mobile: `44 passed, 3 skipped`; connected inventory/detail/notification: `12 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1215.8KB` JS, `244.3KB` CSS; `git diff --check`: passed.

## Meal-plan result hierarchy and auth destination pass — 2026-09-17

- Stable native readback showed the meal result title beginning at `y=650` in a 393×720 viewport, after two large preference panels. The mobile meal sheet snap is now `0.86`; the recipe art appears at `y=445..566` and the full title row at `y=580..649`, so the result is readable immediately after opening the sheet.
- Navigation intent is retained while a `홈` or `식품` smooth scroll is in progress. Expired-account recovery now opens the account sheet, closes it through the common dismissal affordance, and returns to the original destination even when the inventory scroll has not settled; reverse manual scroll releases the temporary intent.
- Cached offline reload exposes relative age together with the absolute reference time, while the cached dashboard remains read-only. The connected stale-snapshot contract verifies the combined label and the existing `오프라인 · 최근 화면` status.
- Native full regression: `20 passed`; fixture/mobile: `44 passed, 3 skipped`; auth and cached-offline connected scenarios: `2 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1216.8KB` JS, `244.3KB` CSS; `git diff --check`: passed.

## Compound meal-safety summary pass — 2026-09-17

- Plans with multiple safety signals now use one `조리 전 확인 N건` surface instead of presenting unrelated warning cards as peers. The summary keeps the existing status semantics but makes the count and decision context visible before the user reaches the recipe actions.
- Within the summary, date review appears first, followed by allergy-based recommendation holds, missing ingredients, and unknown allergen metadata. The ingredient list and low-priority provenance remain outside the summary and follow it in the sheet flow.
- A connected compound fixture verifies `조리 전 확인 3건` and the three item types (`date review`, `missing ingredient`, `allergen metadata unknown`); the regular demo recipe remains free of a safety summary.
- Connected full suite: `110 passed`; compound safety targeted: `2 passed`; native full: `20 passed`; fixture/mobile: `44 passed, 3 skipped`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1220.8KB` JS, `249.3KB` CSS; `git diff --check`: passed.

## Cached-detail live transition pass — 2026-09-17

- Cached detail now has a complete two-state contract: while offline, the food remains readable and mutation controls are blocked with local explanations; after `다시 연결` succeeds, reopening the same food restores the live action pair and enabled storage choices.
- The connected readback also confirms the stale age badge, absolute cache time, read-only action area, no mutation buttons in the cached state, and common sheet dismissal: `1 passed`.
- The read-only lifecycle closes an in-progress editor, discard confirmation, or date editor if the connection changes underneath the open detail, preventing a stale UI from retaining a writable draft.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1219.6KB` JS, `246.9KB` CSS; `git diff --check`: passed.

## Cached-detail reconnect transition pass — 2026-09-17

- The cached-detail read-only boundary now has a verified live transition: after `다시 연결` succeeds, reopening the same food removes the read-only callout, restores both detail mutation actions, and re-enables storage choices.
- The offline snapshot still exposes its stale age and remains unchanged while disconnected; no local mutation is presented as durable until the live dashboard is read back.
- Connected cached reload transition: `1 passed`; fixture detail/modal regression: `2 passed`; connected full suite baseline: `110 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1219.6KB` JS, `246.9KB` CSS; `git diff --check`: passed.

## Cached-detail read-only boundary pass — 2026-09-17

- Cached dashboard details now remain inspectable but explicitly read-only. The detail sheet explains `최근 확인한 화면이에요` at the top and keeps the snapshot's date, storage, provenance, and history visible without suggesting that a mutation was saved.
- Storage choices, product-info editing, date assertion editing, quantity steppers, opened-state changes, consume/save actions, discard actions, and product-provenance removal are disabled or replaced with a nearby `연결 후 가능해요` explanation. Guidance links and history remain readable.
- If the connection changes to offline while a detail editor or discard confirmation is open, the component closes those transient mutation states and hides the keyboard before rendering the read-only boundary.
- Connected cached-reload readback verifies the stale badge, absolute timestamp, read-only callout, disabled controls, no mutation buttons in the action area, and close behavior: `1 passed`; fixture detail/modal regression: `2 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1217.2KB` JS, `245.1KB` CSS; `git diff --check`: passed.

## Safety-message order and revision-poll recovery pass — 2026-09-17

- Meal-plan message order now places execution-blocking safety notices before the ingredient list and low-priority technical provenance: date review first, preference hold and missing-ingredient guidance next, ingredient rows after that, then allergen metadata and source/license revision details.
- Connected planner fixtures assert the date-review callout precedes provenance and the missing-ingredient callout precedes the ingredient list; both targeted scenarios passed.
- A full connected run previously stopped at two stale contracts and skipped the rest of the planner flow. After updating the home CTA selector and queuing visibility events that arrive during an in-flight dashboard revision poll, the complete connected suite executed: `110 passed`.
- The queued dashboard poll closes the race where an initial background revision request consumed a visibility refresh before the newer workspace state was read; it schedules one bounded follow-up after the in-flight request settles and cancels it during cleanup.
- Current native full regression: `20 passed`; fixture/mobile: `44 passed, 3 skipped`; web surface: `1 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1217.2KB` JS, `245.1KB` CSS; `git diff --check`: passed.

## Cached-age status badge pass — 2026-09-17

- Cached offline data now exposes its age in the compact header status pill, such as `오프라인 · 방금 전` or `오프라인 · 12분 전`, while the recovery callout retains the absolute `월/일 · 시:분` reference time for an auditable readback.
- The relative age is derived from the same `dashboardStaleAt` source used by the offline callout and re-renders with the dashboard clock, so the header does not drift into a permanent `최근 화면` label while the user remains offline.
- Connected stale-dashboard readback verifies the cached inventory, combined relative-plus-absolute copy, and reconnect action: `1 passed`; normal demo detail/theme regression: `2 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1216.9KB` JS, `244.3KB` CSS; `git diff --check`: passed.

## Cached-age urgency tier pass — 2026-09-17

- The compact cached-age pill now carries a visual urgency tier in addition to its relative label: under one hour uses a restrained amber treatment, one to twenty-four hours uses a coral warning, and one day or more uses a stronger coral border/halo.
- The tier is derived from the same cache timestamp and current dashboard clock as the callout, so text and color cannot disagree about the snapshot age. Invalid cache timestamps fall back to the neutral `최근 화면` label.
- Connected stale-dashboard readback verifies the cached inventory, relative-plus-absolute timestamp copy, reconnect action, and age-tier class: `1 passed`; demo detail/theme regression: `2 passed`.
- Production build: `762` Vite modules; bundle budget: `19` JS chunks, `1217.2KB` JS, `245.1KB` CSS; `git diff --check`: passed.

## Meal-plan first-result and navigation-intent pass — 2026-09-17

- The stable 393×720 native meal sheet previously placed the recipe title at `y=650`, leaving the CTA result mostly outside the first viewport after the user asked to make a meal. The mobile-only meal sheet snap now uses `0.86`, exposing the recipe art at `y=445..566` and the full title row at `y=580..649` while keeping the result controls and close affordance available.
- Bottom navigation now retains an explicit `홈`/`식품` intent while smooth scrolling to a destination. If the user opens the account sheet during that transition, dismissal returns to the requested destination; if the user manually scrolls in the opposite direction, the intent is released and the regular section observer resumes.
- Cached offline reload continues to expose a relative age with its absolute reference time, for example `방금 전 · 9월 17일 오전 5:xx`, while the existing stale snapshot remains read-only until reconnection.
- Native full regression: `20 passed`; fixture/mobile: `44 passed, 3 skipped`; auth and cached-offline connected scenarios: `2 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1216.8KB` JS, `244.3KB` CSS; `git diff --check`: passed.

## Meal-plan action hierarchy pass — 2026-09-17

- After a recipe is saved, the confirmation and `조리 완료로 기록` usage controls now sit immediately after the primary recipe action pair. Optional saved-plan history, shopping, audit, and recipe-detail sections follow afterward, so the next real-world action is not buried below secondary exploration panels.
- The change is presentation-only: save, consumption allocation, retry, audit, shopping, and multi-day state contracts remain unchanged. Connected coverage now asserts the action order in the rendered sheet.
- Connected targeted action-order scenario: `1 passed`; connected full suite: `110 passed`; native full: `20 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1220.8KB` JS, `249.3KB` CSS; `git diff --check`: passed.

## Meal-plan post-save reveal pass — 2026-09-17

- Saving a recipe now reveals the next concrete action inside the current mobile sheet: the `사용량 확인` panel is brought into the visible sheet viewport after a successful save, including the demo and connected paths.
- The reveal is one-shot and success-scoped. Reopening an already saved plan, changing an unrelated panel, or receiving a refresh does not unexpectedly reset the user's scroll position; the existing completion and retry contracts remain unchanged.
- Native `393×720` geometry verifies the completion panel and `조리 완료로 기록` action are inside the sheet content viewport after save; connected save flow verifies the same visibility and action order.
- Native targeted: `1 passed`; connected targeted: `1 passed`; prior full baselines remain connected `110 passed`, native `20 passed`, web `1 passed`.

## Meal-plan save-to-use mobile readback — 2026-09-17

- A live native `393×720` readback confirmed the success path now lands on the next user decision: after saving, the sheet scrolls to show the saved confirmation, three usage rows, and `조리 완료로 기록` without requiring a manual search through the recipe content.
- The action reveal is limited to a save transition; reopening the saved plan does not steal the existing scroll context. Dark and light mobile home/detail surfaces were also checked through the maintained native preview tab.
- Native full regression: `21 passed`; connected full suite: `110 passed`; web surface: `1 passed`; protected runtime: `28 files passed`.
- Production build: `762` Vite modules; bundle budget: `19` JS chunks, `1221.1KB` JS, `249.3KB` CSS; `git diff --check`: passed.

## Food-detail safety action hierarchy pass — 2026-09-17

- Date review now keeps the evidence card, safety warning, and `포장지에서 확인한 날짜 입력` action together. The action uses the amber pending treatment in both light and dark themes, so a user can move from “what is known” to “what I need to confirm” without scanning past provenance blocks.
- Storage state now exposes the committed state (`냉장에 보관 중`) until a user changes it, then switches to `변경 후 저장하세요`. The storage section and save action receive a pending cue only while local storage/opened changes are waiting to be recorded.
- Destructive discard remains below the primary consume/save pair with a restrained coral outline and a stronger confirmation surface after activation.
- Fixture full regression: `44 passed, 3 skipped`; native full regression: `22 passed`; connected full regression: `110 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1221.3KB` JS, `251.4KB` CSS; `git diff --check`: passed.

## Attention and shopping decision-surface pass — 2026-09-17

- Notification center now leads with an actionable summary (`먼저 확인해요` / unread count), preserves the existing `모두 읽음` affordance, and exposes read/unread status through both the visual row treatment and an explicit accessible description.
- Shopping list now leads with a bounded completion meter (`완료/전체`) and a sentence explaining when an item can become inventory. Opening `재고 반영` automatically brings the quantity/storage confirmation form into the current sheet viewport, including the non-inferred date reminder.
- Empty, loading, retry, checked, and cross-device refresh states retain their existing recovery semantics; the new surfaces only clarify the next decision and do not auto-write data.
- Live native notification readback and disposable connected shopping readback passed; fixture full regression: `44 passed, 3 skipped`; native full: `22 passed`; connected full: `110 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1223.6KB` JS, `255.4KB` CSS; `git diff --check`: passed.

## Intake flow decision rail and recovery pass — 2026-09-17

- Receipt, barcode, label, and manual intake now share a compact `입력 → 확인 → 반영` rail. The active step and one-line next decision change with the selected method and with OCR/review state, while the commit boundary stays explicit.
- Receipt review adds a top-level `반영 전 확인` contract, and label review adds a nearby date-meaning/storage confirmation message. Both preserve the rule that OCR output is a candidate until the user confirms it.
- Review results auto-reveal after sample/file processing; switching from a long receipt review to barcode or label resets the sheet to the top so the new tabs and input step cannot remain off-screen. Camera capture/recovery hides the duplicate rail to protect the 320px safe-area action surface.
- Final fixture/mobile regression: `45 passed, 3 skipped`; native full: `22 passed`; connected full: `110 passed`; web surface: `1 passed`; protected runtime: `28 files passed`.
- Production build: `762` Vite modules; bundle budget: `19` JS chunks, `1226.4KB` JS, `258.3KB` CSS; `git diff --check`: passed.

## Manual confirmation and barcode handoff pass — 2026-09-17

- Manual entry now keeps a barcode-applied product candidate at the top of the form, with source/freshness/confidence and a clear `후보 적용됨` state before the user edits or saves the name, quantity, and storage.
- Manual priority inference is now a real second step in the shared rail. Its result card auto-reveals in the sheet, while demo mode explains that direct recording is available but server-backed priority review is not.
- Barcode candidate and GS1 date-candidate handoff resets the manual sheet to the top, so the imported values and the next confirmation action are not hidden by the previous barcode scroll position.
- Final fixture/mobile regression: `45 passed, 3 skipped`; native full: `22 passed`; connected full: `110 passed`; web surface: `1 passed`; protected runtime: `28 files passed`.
- Production build: `762` Vite modules; bundle budget: `19` JS chunks, `1227.3KB` JS, `259.4KB` CSS; `git diff --check`: passed.

## Receipt-review line editing pass — 2026-09-17

- Each edited receipt line now owns a visible `현재 항목` cue and a cobalt edge, so the user can distinguish the active correction from the surrounding selected candidates. The original OCR text, field corrections, and per-line validation remain intact.
- Opening a line editor brings that line into the current sheet viewport. The final `N개 항목 반영하기` action now lives in a safe-area-aware sticky submit bar with a blurred separation surface, keeping the commit boundary reachable during long receipt review.
- The sticky action keeps its existing disabled state when a selected line is invalid; no OCR candidate is auto-confirmed and no receipt commit semantics changed. The contrast regression found during review was fixed by using the deep theme token for the light-mode edit control.
- Final fixture/mobile regression: `46 passed, 3 skipped`; native full: `22 passed`; connected full: `110 passed`; web surface: `1 passed`; receipt axe audit: passed.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1227.8KB` JS, `259.8KB` CSS; `git diff --check`: passed.

## Receipt source-location bridge final pass — 2026-09-17

- Observation-linked receipt rows now expose `원본 보기`; the action selects the row, returns to the temporary source preview, and keeps only that row's safe observation boxes active. The preview heading also names the active row so the visual relationship is explicit.
- PDF inputs and rows without source coordinates keep the existing limitation copy and do not offer a false location affordance. The feature uses only the existing observation ID/bbox contract and does not persist or expose raw OCR payloads.
- Current connected receipt readback: targeted `1 passed`; connected full: `110 passed`; fixture/mobile full: `46 passed, 3 skipped`; native full: `22 passed`; web surface: `1 passed`; receipt axe audit passed.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1228.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt source-location bridge pass — 2026-09-17

- Observation-linked receipt lines now expose `원본 보기`. The action selects that line, moves the current sheet viewport back to the temporary receipt preview, and keeps the existing safe observation boxes highlighted without exposing OCR text or internal IDs.
- The preview heading identifies the active line (`현재 항목 · ...`) when coordinates are available. PDFs and lines without observation coordinates retain the existing “원본과 함께 확인” limitation and do not show a misleading location action.
- Current connected receipt readback and full connected suite passed: `1 targeted`, `110 passed`; fixture/mobile full: `46 passed, 3 skipped`; native full: `22 passed`; web surface: `1 passed`; receipt axe audit passed.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1228.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt-review final polish and bundle-budget pass — 2026-09-17

- The line-editing surface keeps the active correction cue and sticky submit bar while reusing the existing provenance/editor tokens where their geometry and semantics already match. This preserves the selected visual language without expanding the CSS budget.
- Final current-state lanes: fixture/mobile `46 passed, 3 skipped`; native `22 passed`; connected `110 passed`; web surface `1 passed`; receipt axe audit passed.
- Protected runtime integrity: `28 files passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1227.8KB` JS, `259.8KB` CSS; `git diff --check`: passed.

## Receipt-review single-line focus pass — 2026-09-17

- Receipt review now opens only the first line that requires attention, and opening another line collapses the previous editor. This keeps one clear current correction target on mobile while preserving every line's selection and validation state.
- The active line keeps its `현재 항목` cue and the safe-area sticky submit bar; receipt source/provenance, OCR correction, and commit behavior remain unchanged.
- Current-state fixture/mobile regression: `46 passed, 3 skipped`; native full: `22 passed`; connected full: `110 passed`; web surface: `1 passed`; receipt axe audit passed.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1227.8KB` JS, `259.8KB` CSS; `git diff --check`: passed.

## Receipt source-location reverse bridge pass — 2026-09-17

- The temporary receipt preview now turns observation boxes linked to a line into accessible selection buttons. Selecting a box moves the user back to the matching line card, opens that line's editor, and keeps the correction target visible as `현재 항목`.
- Unmatched observation boxes remain decorative, and PDF previews still keep the text-layer limitation. The reverse bridge uses only the existing `source_observation_ids` and `bbox` contract; it does not persist source imagery or expose raw OCR fields.
- Current connected targeted readback: `1 passed`; connected full: `110 passed`; fixture/mobile full: `46 passed, 3 skipped`; native full: `22 passed`; web surface: `1 passed`.
- Production build: `762` Vite modules; protected runtime integrity: `28` files; bundle budget: `19` JS chunks, `1228.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Native receipt editor safe-area pass — 2026-09-17

- A live 320px native readback found the sticky `N개 항목 반영하기` bar covering the lower part of the active receipt editor when the line was opened. This was a real visual/input obstruction, not only a test concern: the storage selector could be placed beneath the sticky surface.
- Editing line cards now reserve a 96px bottom scroll margin before the reveal animation settles. The mobile viewport brings 상품명·수량·단위·보관 위치 above the commit bar while leaving the optional enrichment action available through normal downward scrolling.
- The test contract measures overlap only for the critical correction controls after smooth scrolling settles; it deliberately does not require the entire long editor card to fit in a 320px viewport.
- Current native full regression: `23 passed`; fixture receipt targeted: `2 passed`; connected receipt targeted: `1 passed`; build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1229.1KB` JS, `260.0KB` CSS.

## Native receipt editor safe-area verification — 2026-09-17

- The final current-source readback keeps the native preview on the receipt editor with the critical correction controls above the sticky commit surface. The earlier overlap is no longer present after the smooth-scroll settle, and the 96px reservation remains limited to the active editing card.
- Full current-state lanes: fixture/mobile `46 passed, 3 skipped`; native `23 passed`; connected `110 passed`; web surface `1 passed`; protected runtime `28 files passed`; bundle budget `19` JS chunks, `1229.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Connected mobile receipt source hit-area and messaging pass — 2026-09-17

- Connected receipt review is now exercised at `393×720`, including source frame width, observation-box containment, reverse source-to-line navigation, and sticky critical-field visibility.
- Observation-linked source regions keep their exact visual bbox but receive a separate 44×44 CSS hit area. This preserves the OCR visual reference while making small photographed text regions practical to tap on mobile.
- The source note now explains both directions (`상품 → 원본`, `원본 → 상품 수정`) only when the observation-to-line mapping exists. PDFs and unmatched observations retain the limitation copy.
- Full current-state lanes: connected `110 passed`; fixture/mobile `46 passed, 3 skipped`; native `23 passed`; web surface `1 passed`; protected runtime `28 files passed`; bundle budget `19` JS chunks, `1229.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Connected mobile receipt source affordance pass — 2026-09-17

- The connected receipt fixture now runs at `393×720` and verifies the source frame stays inside the sheet content width, all OCR boxes remain inside the frame, and every observation-linked box has a 44×44 CSS hit area while its visible bbox remains unchanged.
- The source copy now describes both directions only when a real observation-to-line mapping exists: product line to original location, and original region to that product's editor. Unmatched observations keep the non-interactive explanation, so the UI does not promise a route it cannot fulfill.
- Current full-state verification: connected `110 passed`; fixture/mobile `46 passed, 3 skipped`; native `23 passed`; web surface `1 passed`; targeted connected mobile source bridge and critical-control overlap checks passed.
- Production build: `762` Vite modules; protected runtime integrity: `28 files passed`; bundle budget: `19` JS chunks, `1229.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Current source verification after source affordance polish — 2026-09-17

- The latest build transforms `762` modules and the protected runtime check passes for `28` files after separating the exact OCR visual boxes from their 44×44 interaction targets.
- Latest bundle readback is `19` JS chunks, `1229.6KB` JS, `260.0KB` CSS and remains within budget; `git diff --check` passed.

## Development source-review preview pass — 2026-09-17

- Added a demo-only `?review=1&receipt_source_review=1` entry that opens the native sheet directly with an anonymous local receipt image, three mapped OCR observations, and the same receipt review component used by connected flows. Production mode ignores the fixture.
- The preview is visibly usable at the maintained native tab: the initial `현재 항목` now matches the first review-required line, source boxes can be tapped through the overlay nearest-observation resolver, the line editor opens, and closing/reopening the preview restores the fixture state.
- Current native full regression: `24 passed`; connected source bridge targeted: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1231.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.
- Fixture asset: `apps/web/public/assets/receipts/source-review-fixture-v1.png`; the image contains no personal or real receipt data.

## Current source-review fixture verification — 2026-09-17

- Full current lanes after the explicit preview and overlay resolver changes: connected `110 passed`; fixture/mobile `46 passed, 3 skipped`; native `24 passed`; web surface `1 passed`.
- Latest build: `762` Vite modules; protected runtime `28 files passed`; bundle budget `19` JS chunks, `1231.8KB` JS, `260.0KB` CSS; `git diff --check` passed.
- The 24th native scenario covers query entry, initial active-line alignment, source-frame containment, 44px hit targets, pointer-coordinate source selection, line editor opening, close/reopen fixture restoration, and the demo-only boundary.

## Source-review light/dark contrast pass — 2026-09-17

- Live native readback confirms the light fixture keeps the receipt paper visually separate from the ivory sheet, while the dark fixture keeps the paper readable against midnight surface without losing the cobalt primary action.
- Coral OCR emphasis remains visible in both themes, and the receipt source note/active-line label stay readable above the image without introducing a new color language.
- Current native full regression: `25 passed`, including the source-review dark-mode contrast scenario; connected full `110 passed`; fixture/mobile `46 passed, 3 skipped`; web surface `1 passed`.
- Latest build/budget checks remain green: `762` Vite modules; protected runtime `28 files passed`; JS `1231.8KB`; CSS `260.0KB`; `git diff --check` passed.

## Current source-review visual verification after light-frame polish — 2026-09-17

- Light mode now uses a warm-neutral receipt frame instead of the shared midnight letterbox; dark mode keeps the `#121a22` frame. Live screenshots show the paper, coral OCR box, and cobalt CTA remain visually separated in both themes.
- Current native full regression after the polish: `25 passed`; connected full remains `110 passed`; fixture/mobile `46 passed, 3 skipped`; web surface `1 passed`.
- Latest build: `762` Vite modules; protected runtime `28 files passed`; bundle budget `19` JS chunks, `1231.9KB` JS, `260.0KB` CSS; `git diff --check` passed.

## Current source-frame geometry verification — 2026-09-17

- Native geometry readback now compares `320×740` and `393×852` directly. The receipt frame remains contained inside the sheet at both widths, keeps a stable source composition, and stays below the 243px mobile frame cap.
- Current native full regression: `26 passed`; connected source bridge latest targeted: `1 passed`; connected full prior current: `110 passed`; fixture/mobile `46 passed, 3 skipped`; web surface `1 passed`.
- Latest bundle/runtime gates: `762` Vite modules; protected runtime `28 files passed`; JS `1231.9KB`; CSS `260.0KB`; `git diff --check` passed.

## Receipt source observation baseline pass — 2026-09-17

- Read the generated fixture asset's word coordinates and corrected the mushroom observation from `y=0.655` to `y=0.675`, aligning the visible coral box with the `Oyster Mushrooms` product row instead of the next line below.
- Spinach and tofu observation baselines remain within their intended product rows; no runtime data contract or production OCR payload was changed.
- Latest build: `762` Vite modules; bundle `1231.9KB` JS / `260.0KB` CSS; protected runtime `28 files passed`; `git diff --check` passed.

## Receipt source horizontal baseline pass — 2026-09-17

- Tesseract readback places the fixture product names around x `392..536` and the corresponding prices around x `631..669` in the 1024px source image. Fixture observation boxes now use `x=0.36,width=0.32`, covering both the product and price columns with less unused lateral space than the previous `0.31/0.39` box.
- Native source-frame, light/dark, pointer selection, and 320/393 width targeted checks passed after the horizontal refinement.
- Latest build/budget gates remain green: `762` Vite modules; JS `1231.9KB`; CSS `260.0KB`; protected runtime `28 files passed`; `git diff --check` passed.

## Receipt source readable-zoom pass — 2026-09-17

- Added an explicit `원본 확대` / `원본 축소` toggle to the image-based receipt source preview. The default compact composition is unchanged; zoom increases only the source frame so the original receipt can be read without changing the line editor or commit contract.
- The active observation overlay, nearest-source pointer resolver, and current-line label remain connected while zoomed. Native targeted fixture and source-frame geometry checks passed.
- Current native full regression: `26 passed`; connected source bridge latest targeted: `1 passed`; connected full current baseline: `110 passed`; fixture/mobile `46 passed, 3 skipped`; web surface `1 passed`.
- Latest build/budget gates: `762` Vite modules; JS `1232.4KB`; CSS `260.0KB`; protected runtime `28 files passed`; `git diff --check` passed.

## Current horizontal baseline verification — 2026-09-17

- The narrowed `x=0.36,width=0.32` fixture boxes remain contained and pointer-selectable across the current native source-review flow.
- Current native full regression after the horizontal refinement: `26 passed`; latest source-frame targeted geometry/readability checks: `3 passed`.
- Latest build/budget gates remain green: `762` Vite modules; JS `1231.9KB`; CSS `260.0KB`; protected runtime `28 files passed`; `git diff --check` passed.

## Current source-review contrast verification after inline frame polish — 2026-09-17

- Receipt image frames now receive theme-aware inline backgrounds (`#eef1eb` light, `#121a22` dark) so the visual correction does not expand the CSS bundle or alter unrelated camera/scanner surfaces.
- Current readback: native `25 passed` including light/dark source-review scenarios; connected source bridge targeted `1 passed` on the latest code; prior full connected `110 passed`; fixture/mobile `46 passed, 3 skipped`; web surface `1 passed`.
- Latest production/budget gates: `762` Vite modules; protected runtime `28 files passed`; JS `1231.9KB`; CSS `260.0KB`; `git diff --check` passed.

## Current readable-zoom verification — 2026-09-17

- Current native full regression after the zoom interaction: `26 passed`; source-frame zoom/line-navigation targeted checks passed; connected source bridge latest targeted `1 passed`; connected full current baseline `110 passed`.
- Latest build/budget gates: `762` Vite modules; protected runtime `28 files passed`; JS `1232.4KB`; CSS `260.0KB`; `git diff --check` passed.

## Zoomed source active-row visibility verification — 2026-09-17

- Geometry readback in zoom mode keeps the active OCR box above the sticky commit bar; the full image may continue below the CTA, but the current correction target remains visible and tappable.
- The native fixture test now asserts `active source box bottom <= sticky submit top` after zoom, alongside the zoom toggle and source-to-line navigation checks.

## Source-review keyboard navigation pass — 2026-09-17

- Keyboard focus now follows the source-review task order: `원본 확대` → observation source button → corresponding line editor.
- Enter activation on the observation button keeps its accessible button semantics while the pointer path remains owned by the nearest-observation overlay resolver.
- Current native full regression: `27 passed`; latest connected source bridge targeted `1 passed`; connected full current baseline `110 passed`; fixture/mobile `46 passed, 3 skipped`; web surface `1 passed`.
- Latest bundle/runtime gates: `762` Vite modules; protected runtime `28 files passed`; JS `1232.4KB`; CSS `260.0KB`; `git diff --check` passed.

## Source-review live status and keyboard focus pass — 2026-09-17

- The active-line label now uses a polite atomic live region, so source selection announces the newly active product without changing the visual hierarchy.
- Native keyboard readback passes `원본 확대` focus → zoom Enter → observation source focus → line editor Enter, including the updated `현재 항목 · ...` status text.
- Latest targeted native focus check: `1 passed`; prior native full lane: `27 passed`; connected source bridge targeted: `1 passed`; bundle/runtime gates remain green at JS `1232.4KB`, CSS `260.0KB`, and `28 files passed`.

## Source-review reading-order verification — 2026-09-17

- The source preview region now references its visible hint with `aria-describedby`, and the native fixture verifies the DOM reading order: source region → line cards → sticky commit action → footnote.
- Observation buttons retain their product-specific labels plus the shared interaction description, while the live current-line label stays independent for state changes.
- Latest source-order targeted: `1 passed`; latest native full lane: `27 passed`; connected full current baseline: `110 passed`; bundle `1232.6KB` JS / `260.0KB` CSS; protected runtime `28 files passed`.

## Current line confidence/status description verification — 2026-09-17

- Receipt line selection controls now expose an additional hidden status description without changing their visible/accessibility names: confirmed lines announce `OCR 인식 신뢰도 N%`, review lines announce `OCR 결과 확인 필요`.
- Native source/action order targeted: `1 passed`; connected source bridge targeted: `1 passed`; latest build/runtime: `762` Vite modules, JS `1232.8KB`, CSS `260.0KB`, protected runtime `28 files passed`.

## Current line-action reading-order verification — 2026-09-17

- Native fixture now explicitly protects each line card's action order: selection state → `원본 위치 보기` → `수정`, with the source action carrying the shared source hint description.
- Latest line-action/source-order targeted: `1 passed`; connected source bridge targeted: `1 passed`; bundle/runtime gates remain green at JS `1232.6KB`, CSS `260.0KB`, and `28 files passed`.

## Current source hint description verification — 2026-09-17

- Line-level `원본 위치 보기` actions now share the same visible source hint through `aria-describedby`, alongside the observation hit buttons, so screen-reader context remains consistent regardless of entry direction.
- Native source fixture targeted: `1 passed`; connected source bridge targeted: `1 passed`; latest build/runtime: `762` Vite modules, JS `1232.6KB`, CSS `260.0KB`, protected runtime `28 files passed`.

## Current source-review accessibility description verification — 2026-09-17

- Observation source buttons now reference the visible source hint through `aria-describedby="receipt-source-preview-hint"`, so assistive technology receives the action meaning together with the product-specific label.
- Native source fixture + keyboard focus targeted: `2 passed`; connected source bridge targeted: `1 passed`; build/runtime gates remain green at `762` Vite modules, JS `1232.5KB`, CSS `260.0KB`, and `28 files passed`.

## Current source-review focus-visible verification — 2026-09-17

- Keyboard traversal now asserts native `:focus-visible` state on both the zoom action and observation source button before Enter activation; the source-specific CSS budget remains unchanged.
- Latest focus targeted: `1 passed`; latest build/runtime: `762` Vite modules, protected runtime `28 files passed`, JS `1232.4KB`, CSS `260.0KB`, `git diff --check` passed.

## Current storage-description accessibility verification — 2026-09-17

- Receipt line editor storage groups now reference their visible recommendation hint through `aria-describedby`, preserving the existing custom storage option group and action order.
- Native source fixture targeted: `1 passed`; connected source bridge targeted: `1 passed`; latest build: `762` modules; bundle `1233.0KB` JS / `260.0KB` CSS; protected runtime `28 files passed`.

## Current product-lookup live announcement verification — 2026-09-17

- Product-name lookup results inside a receipt line editor now use `aria-live="polite"`, so asynchronously returned provenance/candidate content is announced without changing candidate actions or visible copy.
- Connected receipt correction flow with product lookup: `1 passed`; latest build/runtime: `762` modules, JS `1233.0KB`, CSS `260.0KB`, protected runtime `28 files passed`.

## Current barcode live-announcement verification — 2026-09-17

- Barcode result callout, GS1 date candidate, and barcode candidate list now expose polite live semantics so async lookup results and provider warnings are announced without changing visible candidate actions.
- Latest barcode connected targeted: `1 passed`; build/runtime: `762` Vite modules, JS `1233.1KB`, CSS `260.0KB`, protected runtime `28 files passed`.

## Current label live-contract verification — 2026-09-17

- Label OCR's `날짜 의미와 보관 위치를 확인하세요` contract now explicitly uses polite atomic live semantics without making the entire editable result card a live region.
- Label ambiguous-date connected targeted: `1 passed`; latest build/runtime: `762` modules, JS `1233.1KB`, CSS `260.0KB`, protected runtime `28 files passed`.

## Current label review description verification — 2026-09-17

- The ambiguous label-date choice now references its visible explanation through `aria-describedby`, and the label storage picker references the current storage guidance or condition note through the same relationship.
- This keeps the warning contract, date meaning choices, date candidate, and storage confirmation in one readable mobile sequence without making editable fields noisy live regions.
- Current full connected lane: `110 passed`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1233.4KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Rescue Queue total-count messaging pass — 2026-09-17

- The status summary no longer presents the total inventory count as if it were a third mutually exclusive queue state. `기록됨` is now `보관 중`, and the accessible legend name explicitly distinguishes queue status from the total stored count.
- This preserves the compact KakaoPay-like summary card while making the relationship between `확인 필요`, `먼저 사용`, and the full inventory count clear on a narrow mobile viewport.
- Targeted home/mobile fixture: `1 passed`; the live dark-mode preview readback shows `식품 상태와 전체 보관 수` and `보관 중 7` without changing card geometry.
- Current fixture/mobile lane: `46 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1233.4KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Detail-to-guidance return-context pass — 2026-09-17

- Opening `날짜 기준 자세히 보기` from a food detail no longer drops the user back to the inventory list when the guidance sheet closes. The guidance sheet records its detail origin and restores the same selected food detail; guidance opened from home still closes back to home.
- This preserves the user's correction context while keeping the existing single-sheet native shell and focus contract. The live 4176 dark-mode readback returns to `시금치` detail after closing the guidance sheet.
- Current fixture/mobile lane: `47 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1233.5KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Detail pending-save hierarchy pass — 2026-09-17

- The food detail primary save action is now inactive when storage, opened state, and quantity are unchanged. It reads `변경 후 저장`, so the sheet does not imply that a no-op network mutation is required.
- Changing storage, marking an item opened, or reducing a multi-quantity lot now shares one pending contract: the section announces `변경사항을 저장하세요`, the sticky action becomes `변경 저장`, and the existing partial-lot persistence path remains intact.
- Current live dark-mode readback shows the disabled idle state and the enabled `변경 저장` state after switching 시금치 to 냉동. Current fixture/mobile lane: `48 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1233.5KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Date-warning consume-confirmation pass — 2026-09-17

- A food with a date review warning no longer records `먹었어요` immediately. The action opens a compact confirmation panel that separates the user's safety check from Rescue Meal's consumption record: `돌아가기` or `먹었어요 기록`.
- Foods without a date or storage warning keep the one-tap consume path. The warning panel uses the existing detail action surface, keeps the destructive discard action below it, and moves keyboard focus to `돌아가기` when opened.
- Live dark-mode readback shows the coral date warning above the confirmation panel and the blue `먹었어요 기록` action below the storage/opened context. Current fixture/mobile lane: `49 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1234.5KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## User-confirmed date hierarchy pass — 2026-09-17

- User-confirmed lots now show `사용자 확인 · 9월 6일 · 사용자 입력` in the date proof card instead of repeating `사용자 확인` and hiding the actual date.
- This keeps the source meaning in the badge, the date value in the primary line, and the provenance in the supporting line, matching the information hierarchy already used for printed dates and AI priority windows.
- Current fixture/mobile lane: `50 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1234.5KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## User-confirmed reminder edit pass — 2026-09-17

- User-confirmed reminder lots now expose `확인한 알림 날짜 수정` from detail instead of treating the confirmed date as immutable. The editor opens with the existing `2026-09-06` value and `내 알림일` meaning already selected.
- Printed-date editing remains scoped to the existing unknown/AI-review contract; the new entry point only extends the user-reminder state transition and keeps the authoritative date mutation path unchanged.
- Current fixture/mobile lane: `51 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1235.2KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Printed-date meaning boundary messaging pass — 2026-09-17

- Manufacturing/packaging dates now explain the non-overwrite boundary directly in the detail warning: the date is not treated as a consumption date, and the user should separately check the package face that shows the actual consumption/quality date and storage condition.
- The UI intentionally does not offer a misleading overwrite button because the API contract protects an already printed assertion from being replaced by a manual correction. The connected packaging-date scenario verifies the warning copy and the absence of a date-edit action.
- Connected targeted lane: `1 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1235.3KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Printed-date label recheck return pass — 2026-09-17

- The printed-date warning now includes `포장지에서 소비기한 다시 확인`. It opens the existing label intake flow instead of overwriting the protected printed assertion.
- The add-sheet origin is preserved for this explicit detail action: closing the label sheet or completing its create/correct lot flow returns to the same food detail, while ordinary home intake behavior remains unchanged.
- Connected packaging-date return readback: `1 passed`; latest build: `762` Vite modules; bundle budget: `19` JS chunks, `1235.9KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Existing-lot label correction readback pass — 2026-09-17

- The explicit `기존 lot에 반영` label path now updates a previously confirmed lot instead of falling into the generic `food_date_confirmed` rejection. The old assertion remains in `date_assertion_history`, while the corrected response carries the new date kind/value, label source, storage condition, and original quantity/unit.
- The connected UI readback verifies both layers: the dashboard returns `sell_by / 2026-09-13`, and the reopened detail shows `표시 유통기한 · 2026.09.13 · 냉장 보관 중`. The home row intentionally shows `확인 필요` because the fixture date is already past the current review date; that warning does not mean the readback lost the date.
- API focused lane: `2 passed`; connected label correction lane: `1 passed`; the generic manual printed-date overwrite guard remains covered separately.

## Existing-lot label identity preservation pass — 2026-09-17

- An explicit label correction now changes only the intended date/storage assertion data. Existing product identity fields (brand, category, image, note, quantity, and unit) are preserved instead of being replaced by the label flow's generic `라벨 확인 필요` metadata.
- The connected readback reopens the corrected detail and verifies `표시 유통기한 · 2026.09.13 · 실온에 보관 중` while keeping `국내산 시금치 · 1팩`; API coverage also verifies the previous date remains in assertion history.
- API focused lane: `2 passed`; connected correction readback: `1 passed`; latest bundle budget: `19` JS chunks, `1235.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Storage-condition warning propagation pass — 2026-09-17

- A future printed date no longer hides a storage-condition mismatch on the home surfaces. When the label says `실온` but the current lot is in `냉장`, the Rescue Queue date source reads `보관 조건 확인`, the pantry row reads `확인 필요`, and the detail still exposes the exact condition mismatch alert/history.
- Aligning the detail storage to the label condition removes the mismatch; switching it back restores the warning. Date validity and storage safety are now separate review signals instead of one masking the other.
- Connected storage-mismatch lane: `1 passed`; latest build: `762` Vite modules; bundle budget: `19` JS chunks, `1236.0KB` JS, `260.0KB` CSS; protected runtime: `28 files passed`; `git diff --check`: passed.

## Storage-condition cross-surface readback pass — 2026-09-17

- The same mismatch now has explicit coverage across the four user surfaces: home Rescue Queue/inventory (`보관 조건 확인` / `확인 필요`), detail alert/history, notification center custom-location advisory, and meal-plan safety summary.
- Notification and planner contracts were already present; this pass proves the new home attention reason does not diverge from their existing `storage_condition` and `date_review_note` semantics.
- Connected cross-surface targeted lane: `3 passed`; API notification focused lane: `2 passed`; latest fixture/mobile full: `51 passed, 3 skipped`.

## Notification-read navigation refresh pass — 2026-09-17

- When a notification read mutation is still in flight and the user follows the notification into a food detail, a queued remote notification refresh is no longer discarded just because the notification sheet closed.
- The notification source now refreshes in the background after the read completes, so reopening the center reads the latest read/unread state instead of the pre-navigation snapshot.
- Connected regression proves the queued path: notification read held → user navigates to 식품 상세 → remote notification mutation broadcast → read released → notification center reopens with the latest item.

## Storage mutation cross-surface readback pass — 2026-09-17

- A successful storage mutation now has an explicit connected readback contract across dashboard and notifications: the home priority card moves `냉동 → 냉장`, the dashboard revision is read again, and the corresponding storage-mismatch notification disappears from the notification center.
- This protects the post-mutation ordering between the authoritative storage event response, dashboard inventory refresh, and derived notification refresh instead of verifying only the POST idempotency key.
- Connected mutation/readback targeted lane: `1 passed`; latest fixture/mobile full: `51 passed, 3 skipped`.

## Storage mutation plus notification-read convergence pass — 2026-09-17

- The combined race is now covered: notification read is held, the user follows into 식품 상세, a storage mutation completes, dashboard refresh runs, then the read releases and notification refresh removes the resolved mismatch.
- The final readback verifies both consumers in the same flow: home priority storage pill becomes `냉장`, and reopening 알림 shows the empty state rather than the old mismatch notification.
- Connected combined-race lane: `1 passed`.

## Label-correction notification readback pass — 2026-09-17

- Existing-lot label correction now verifies the complete post-mutation chain: authoritative date/storage/product readback, dashboard re-render, and removal of the previous storage-mismatch notification.
- The connected test holds the mismatch notification before correction, applies the corrected label lot, waits for the notification refresh, then reopens the notification center and confirms the empty state.
- Connected correction/readback lane: `1 passed`; latest API correction focused lane: `2 passed`.

## Existing-lot correction persistence rollback pass — 2026-09-17

- If the explicit label-correction write reaches the persistence seam and that flush fails, the API returns the safe retryable `manual_food_persistence_unavailable` contract instead of leaving a partially corrected lot in memory.
- The rollback readback preserves the target lot's existing product identity, refrigerated storage, confirmed `2026-09-02` assertion, and empty assertion history. The successful connected correction path still verifies the intended date/storage update and identity preservation separately.
- API focused lane: `5 passed`; connected label-correction readback: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt source-review language pass — 2026-09-17

- The source-review fixture no longer exposes the internal English `preview` label to mobile users. The sheet title, re-entry CTA, and accessibility name now consistently read `영수증 원본 대조`.
- The existing source-to-line interaction contract is preserved: pointer taps use the parent image hit mapping because dense receipt rows cannot safely host overlapping 44px child targets, while the labeled source buttons remain keyboard and assistive-technology controls.
- Native mobile full lane: `27 passed`; connected receipt-review correction lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Expired printed-date recheck pass — 2026-09-17

- An actual printed date that is today or past now exposes a compact 44px calendar action labelled `포장지에서 날짜 다시 확인` inside the existing warning row. The action opens the label intake flow, where the user can reread the package and choose a new or existing lot path.
- The action is intentionally compact rather than another full warning card: the detail's `먹었어요`, save, and discard actions remain above the iPhone safe area at both 320px and 393px widths. Closing the label sheet restores the same food detail context.
- Native mobile full lane: `27 passed`; connected printed-date lanes: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Detail origin navigation pass — 2026-09-17

- Detail now records the entry origin explicitly. Opening a priority card from home and closing it restores the home queue and `홈` navigation state; opening a pantry row preserves the inventory scroll context and `식품` navigation state.
- This removes the previous implicit inventory-row capture that could pull a home-priority user into the pantry after closing a detail. Guidance and label recheck return contexts remain separate and unchanged.
- Fixture/runtime lane: `52 passed, 3 skipped`; native mobile lane: `27 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-plan user-facing provenance pass — 2026-09-17

- The meal sheet no longer exposes internal fixture/license/revision strings such as `DEMO FIXTURE`, `project-authored`, or `demo-v1` in the user-facing recommendation. The title kicker is now `RESCUE MEAL`, and provenance is reduced to the readable source name only.
- Safety and action messaging remains visible: the meal still surfaces `조리 전 확인`, allergy uncertainty, required ingredients, save, recipe detail, and completion actions. Technical provenance remains available in the plan data and is not discarded by this presentation change.
- Fixture recipe flow targeted: `1 passed`; native meal geometry/completion targeted: `2 passed`; full fixture/runtime lane: `52 passed, 3 skipped`; live dark-mode readback confirms the cleaned kicker and `출처 · Rescue Meal 팀 작성 레시피` line; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-plan safety target messaging pass — 2026-09-17

- When the connected planner marks a date review, the safety item now names the exact target separately as `확인할 식품 · 시금치` instead of leaving the user with only a count and a long note. The existing date/storage safety explanation remains unchanged.
- The API currently provides review food names rather than stable food IDs, so this pass improves information hierarchy without inventing a detail-navigation action. A future ID-bearing planner contract can safely add a direct detail link on top of this target row.
- Connected planner date-review lane: `1 passed`; fixture/runtime lane: `52 passed, 3 skipped`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-plan safety detail-link pass — 2026-09-17

- The planner response now carries `date_review_food_ids` alongside the readable names. A connected date-review target renders `식품 확인 · 시금치`, opens the matching food detail, and returns to the same meal sheet after the detail is closed.
- Demo/legacy plans without IDs keep the readable non-interactive target text, so the client does not guess a food identity from a name.
- API date-review contract test: `1 passed`; connected planner detail-return lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1238.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-plan detail-return draft preservation pass — 2026-09-17

- The connected detail link now preserves the meal sheet's selected serving count and cooking-time draft. A user can inspect a flagged food and return to the same plan context instead of restarting at the default `30분 · 1인분` state.
- The parent keeps only the lightweight meal options needed across the sheet transition; the planner still recalculates against the current inventory and workspace revision when appropriate.
- Connected planner detail-return lane: `1 passed`; native meal geometry/completion lane: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1238.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Shopping purchase-state messaging pass — 2026-09-17

- A checked shopping item now explicitly reads `구매 완료 · 재고 반영 필요` in both the visible row and accessible button name. This separates “I bought it” from the separate `재고 반영` mutation instead of leaving the checked state ambiguous.
- The source label now reads `식단 N개` / `직접 추가`, and the receive flow remains unchanged; the new status only clarifies the next action.
- Connected shopping queue lanes: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1238.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification copy clarity pass — 2026-09-17

- Demo notification messages no longer expose the internal persistence note `데모 모드에서는 서버 알림을 저장하지 않아요`, and Korean object-particle placeholder text such as `시금치을(를)` is removed.
- The notification center now reads naturally as a user action: `시금치 먼저 확인해 보세요.` The unread count, severity labels, food-detail navigation, read state, and safety footnote remain unchanged.
- Fixture notification/detail lane: `1 passed`; live dark-mode readback confirms all three demo messages use the cleaned sentence; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification read-state hierarchy pass — 2026-09-17

- When all notifications are read, the heading now changes from `확인이 필요한 알림 0` to `알림 기록`, while the retained read history stays visible below. This separates the unread count from the historical list instead of making the number and list appear contradictory.
- The summary changes to `모든 알림을 확인했어요`, hides `모두 읽음`, and keeps the three read notification rows available for later reference.
- Fixture notification state lane: `2 passed`; live dark-mode readback confirms the `알림 기록` state after `모두 읽음`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification live-announcement pass — 2026-09-17

- The notification summary is now a polite atomic live region, so unread count, `모두 읽음`, and `모든 알림을 확인했어요` changes are announced as one state update to assistive technology.
- Visual hierarchy and retained read history are unchanged; this pass only closes the state-announcement gap.
- Fixture notification state lane: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Korean dynamic-object grammar pass — 2026-09-17

- Frontend-generated toast messages now choose `을`/`를` from the final Hangul consonant instead of exposing the placeholder `을(를)`. This covers consume, discard/retry, shopping receive, manual add, and server add feedback.
- The backend/API message contract is unchanged; only local user-facing copy is normalized. Source scan confirms no remaining `을(를)` placeholder in `apps/web/src`.
- Fixture toast lanes: `3 passed`; connected mutation/retry toast lanes: `4 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt product-source language pass — 2026-09-17

- Receipt and barcode product candidates no longer expose `검증 상품 fixture` to users. The local project source is now presented as `프로젝트 상품 기준`, matching the product-information provenance language used in detail history.
- Candidate provenance, confidence, freshness, and apply actions remain visible; only the internal fixture label is replaced with a user-readable source name.
- Fixture receipt correction lane: `1 passed`; connected receipt commit lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Product-source endpoint language pass — 2026-09-17

- User-facing product source labels now hide endpoint identifiers such as `C005`, `I1250`, and `parser`. They read `공개 상품 DB`, `식품안전나라 상품 기준`, `식품안전나라 제품 기준`, or `영수증 분석 후보` while preserving source URLs, confidence, freshness, and provenance content.
- Candidate provenance notes are normalized through the same user-facing source vocabulary, so the source line and its supporting explanation no longer contradict each other.
- Connected printed-date/provenance lane: `1 passed`; fixture receipt correction lane: `1 passed`; connected receipt commit lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Product freshness language pass — 2026-09-17

- Product freshness text no longer exposes the English `source` label. Current candidates now read `현재 확인 가능한 상품 기준`, and unknown date source values fall back to `출처 확인 필요` instead of showing a raw internal value.
- Barcode provider fallback copy now uses `상품 정보 제공처`, keeping the degraded-provider warning understandable without revealing an internal source key.
- Production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account push-status language pass — 2026-09-17

- Account notification settings no longer expose `전달 worker`, `VAPID`, or `notification worker` as user-facing copy. The panel now says `푸시 전달 상태`, `알림 서버가 아직 준비되지 않았어요`, or `푸시 알림 서버 상태를 아직 확인하지 못했어요` depending on the state.
- Quiet hours now explain the user behavior directly: `푸시 알림을 켠 경우 이 시간에는 보내지 않아요.` Operational heartbeat and configuration data remain intact behind the presentation layer.
- Connected account notification-preference lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1236.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account record-space language pass — 2026-09-17

- Guest/account connection copy no longer exposes `workspace` in the main account flow. It now explains that the user can continue the same 식품 기록 on another device, while guest records remain separate until the user explicitly imports them.
- Account export feedback now reads `내 식품 기록을 내보냈어요`; internal workspace identifiers remain implementation-only.
- Fixture account lane: `1 passed`; connected account settings copy/export/re-auth lanes: `3 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account privacy-copy pass — 2026-09-17

- Account security and receipt-privacy copy now uses user-readable terms: `다른 기기의 로그인`, `서버 백업`, `파일 이름`, `읽어낸 문자 내용`, and `영수증 기본 기록 정보`.
- Endpoint/token/OCR/metadata wording remains in the data contract and backend behavior but is no longer necessary for a normal account user to understand the action.
- Production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account data-boundary copy pass — 2026-09-17

- Account privacy and export copy now uses user-readable data names such as `구매 요약`, `로그인 정보`, `파일 이름`, `읽어낸 문자 내용`, and `푸시 연결 주소`, avoiding raw token/metadata/endpoint vocabulary in the normal flow.
- The same record-space language is kept across guest import, account export, password changes, deletion warnings, and logout transitions.
- Connected account copy/export/re-auth lanes: `3 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1237.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Mobile section-label localization pass — 2026-09-17

- Core mobile section kickers now use Korean product language: `오늘 먼저 확인할 식품`, `내 식품 목록`, `알림 센터`, and `장보기 목록` replace the mixed English labels while the `RESCUE MEAL` brand kicker remains.
- The visual hierarchy and compact kicker styling remain unchanged; only the primary mobile navigation language is localized.
- Production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1238.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Home-to-shopping label consistency pass — 2026-09-17

- The home shopping summary card now uses the same `장보기 목록` label as the bottom sheet, removing the last English navigation label from the primary mobile surfaces.
- Production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1238.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal safety-action copy boundary pass — 2026-09-17

- The meal safety summary now says `조리 전 확인할 안내` and `사용하기 전에 내용을 확인해 주세요`, so it no longer implies that saving a plan is blocked when the actual acknowledgement gate applies to the later `조리 완료로 기록` action.
- The connected date-review planner flow keeps the three-item summary, direct food-detail link, and serving-draft return behavior while asserting that the old `저장하거나 조리해 주세요` wording is absent.
- Connected planner safety lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1239.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Product-freshness vocabulary consistency pass — 2026-09-17

- Barcode candidate cards now use the same freshness vocabulary as food detail: `현재 확인 가능한 상품 기준`, `과거 기준 데이터 후보`, and `최신성 확인 필요`.
- The change keeps freshness separate from confidence and source identity, so a legacy candidate is visibly usable as a reference without being presented as current package truth.
- Connected barcode-candidate lane: `1 passed`; fixture/mobile lane: `53 passed, 3 skipped`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1239.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Barcode date-candidate language pass — 2026-09-17

- Normal barcode intake now describes the parsed date as `바코드에서 읽은 날짜 후보` instead of exposing the internal `GS1 AI` identifier. The candidate remains explicitly unconfirmed and still asks the user to check the package and lot before applying it.
- The stored provenance contract remains unchanged (`gs1` source and lot value); only the normal mobile presentation and provenance note vocabulary are simplified.
- Connected GS1 date-candidate lane: `1 passed`; fixture/mobile lane: `53 passed, 3 skipped`; the payload test verifies the user-facing label, absence of `gs1_ai_17`, and unchanged backend date-source payload; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1239.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Barcode and storage-source vocabulary pass — 2026-09-17

- Normal detail and receipt-review surfaces now say `상품 바코드` / `영수증 바코드` instead of exposing the contract term `GTIN`.
- Product candidate storage metadata now reads `상품 기준 보관 정보`, separating a reference storage recommendation from the user's actual current storage location.
- Connected receipt candidate lane: `1 passed`; connected product-provenance/date readback: `1 passed`; fixture/mobile serial lane: `53 passed, 3 skipped`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Barcode date-provenance detail boundary pass — 2026-09-17

- Food detail now collapses raw `gs1`, `GS1 AI`, and lot-bearing date-source strings into the user-facing `바코드 날짜 후보` label. The date value and the user's confirmation state remain visible; parser identifiers and lot tokens stay in the data contract/history boundary.
- This keeps the detail card consistent with the simplified barcode intake language and prevents a backend source-detail string from leaking into the primary decision surface.
- Detail/date fixture lane: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1239.9KB` JS, `260.0KB` CSS; source scan confirms no remaining `GS1 바코드` label in `FoodDetailSheet.tsx`; `git diff --check`: passed.

## Date-source fallback privacy pass — 2026-09-17

- Internal source-detail markers such as `fixture`, `revision`, `parser`, `metadata`, and `endpoint` are no longer rendered verbatim in the food detail date card; the user-facing fallback is `출처 확인 필요`.
- The connected inventory-search detail flow now asserts both the safe fallback and the absence of the internal `fixture` marker while preserving the actual unknown-date state.
- Connected search-detail lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Server-search detail handoff pass — 2026-09-17

- Server-backed inventory search results now remain valid detail sources after the user taps a result. The detail consumer resolves the selected food from the dashboard inventory first and the active server-search result set second, so a search result no longer opens an empty sheet.
- The same connected scenario verifies the safe `출처 확인 필요` fallback and the absence of the internal `fixture` marker in the date-source card after entering detail; user notes remain untouched.
- Connected search-detail lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Server-search mutation handoff pass — 2026-09-17

- Search-backed detail actions now resolve the target food from the dashboard inventory or the active search result set through one helper. Date confirmation, storage changes, consumption/discard records, and product-info/provenance actions no longer silently miss a food that came from server search.
- A successful dashboard sync re-triggers the active inventory search so the list does not retain a stale result after a detail mutation.
- Connected search detail + date-confirmation payload lane: `1 passed`; the existing origin-return case passed in a latest-code serial repeat of `3`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Stale-notification recovery pass — 2026-09-17

- A food notification whose `food_id` is no longer present in the current dashboard no longer opens an empty detail sheet. The notification closes and offers `최신 재고 확인` as an explicit recovery action.
- This keeps a stale remote notification understandable and actionable without inventing a food record or silently switching the user into another workspace state.
- Connected stale-notification recovery lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account technical-copy reduction pass — 2026-09-17

- Normal account settings now presents `기기 알림` instead of `Web Push`, and `내 데이터 파일 다운로드` instead of exposing `JSON` as the primary action label.
- Browser push capability errors also use the user-facing `기기 알림` wording; the actual subscription and export formats remain unchanged.
- Connected account notification lane: `1 passed`; export download/rate-limit/persistence lanes: `3 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Rescue Queue priority-label pass — 2026-09-17

- The primary mobile queue now labels estimated consumption ordering as `먼저 사용 권장` instead of leading with the internal `AI 소비 우선순위` wording.
- The detailed inference trace and guidance sheet still explicitly explain that the ordering is an AI/rule-based estimate, not a consumption-date or safety decision.
- Fixture home/detail lane: `1 passed`; connected inference-trace lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Pending-receipt kicker localization pass — 2026-09-17

- The pending receipt entry on Home now uses `검수 대기` instead of the internal English `REVIEW NEEDED` kicker, matching the existing `검수할 영수증` title and Korean mobile navigation language.
- Connected pending-receipt resume/selection lanes: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Date-source enum normalization pass — 2026-09-17

- Food detail now maps raw date-source enums such as `user_confirmed`, `estimated_use_first`, `storage_condition`, and `printed_date` to readable Korean labels before rendering the date proof card.
- This extends the existing source privacy boundary beyond fixture/parser markers while preserving the raw values in the API/data contract.
- Detail/date fixture lane: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Inference-trace source boundary pass — 2026-09-17

- The detailed AI inference trace now uses the same normalized date-source label as the date proof card, so raw fixture/parser/revision source strings cannot leak through the explanatory reason line.
- Connected inference-trace lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Date-editor user-language pass — 2026-09-17

- Date confirmation now says `직접 확인한 출처` instead of the agent-specific `사장님이 확인한 출처`, keeping the app independent of the development conversation persona.
- Date candidate/meaning fixture lanes: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Guidance priority-label pass — 2026-09-17

- The safety guidance sheet now calls the estimated ordering `먼저 사용 순서`, matching the Home `먼저 사용 권장` label while the `추정` badge and detail inference trace preserve the AI/rule-based safety boundary.
- Guidance return/context lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt source-review language pass — 2026-09-17

- The source-review preview now says `샘플 영수증` and `상품 항목` instead of exposing `개발용 fixture` and the internal `상품 line` term.
- The review-only nature and original-to-item mapping remain explicit; only the user-facing vocabulary changed.
- Production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; source scan and `git diff --check`: passed.

## Receipt source-review filename boundary pass — 2026-09-17

- The review-only receipt fixture now presents `샘플 영수증` in the mobile summary instead of exposing the internal fixture filename `fixture-source-review.jpg`.
- The original image mapping and source-to-item evidence remain unchanged; only the user-facing label is normalized.
- Native source-review lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt-line language consistency pass — 2026-09-17

- General receipt PDF/OCR/enrichment/error messaging now uses `상품 항목` instead of the internal English `line` term. API field names and receipt line IDs remain unchanged.
- Receipt review/PDF fixture lanes: `3 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Runtime recovery-copy localization pass — 2026-09-17

- Runtime error and production configuration guard screens now use `복구 안내` and `운영 설정 확인` instead of English `RECOVERY` / `PRODUCTION CHECK` kickers.
- Recovery actions and fail-closed behavior remain unchanged; only the visible error-state vocabulary was localized.
- Runtime recovery fixture lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Guest-transfer workspace-copy boundary pass — 2026-09-17

- Guest transfer retry messages now translate API terms `guest workspace` / `account workspace` into `게스트 기록 공간` / `계정 기록 공간` at the account presentation boundary.
- The stored workspace IDs and transfer payloads remain unchanged; only the retry explanation is user-facing language.
- Connected guest-transfer conflict lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## External-inventory integration label pass — 2026-09-17

- Account settings now presents the advanced Grocy surface as `외부 재고 연동`, with a user-readable description; Grocy IDs and service-specific mapping fields remain visible only where configuration requires them.
- Connected external-inventory mapping/retry/reconciliation lanes: `3 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Guidance readability pass — 2026-09-17

- The date guidance sheet's explanatory copy increased from `9px` to `10px` and its status badge from `8px` to `9px`, preserving the existing compact card layout while reducing reading friction on the narrow mobile frame.
- Existing guidance return/context and native sheet geometry lanes remain the verification boundary for this visual-only adjustment.
- Guidance return lane: `1 passed`; native 320px viewport lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Date-review callout readability pass — 2026-09-17

- The body copy of the execution-blocking date-review callout increased from `9px` to `10px` so the safety instruction remains readable on the narrow dark mobile sheet.
- The compact date proof/source label and touch-safe recheck action remain unchanged.
- Native major-sheet lane: `1 passed`; food-detail safe-area lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal planner version-copy boundary pass — 2026-09-17

- The connected meal planner no longer exposes the internal `RESCUE PLANNER · V2` label. User-facing recipe sheets consistently use the product kicker `RESCUE MEAL`; planner version and revision remain data/audit metadata.
- Connected planner UI now asserts the readable kicker and the absence of the internal version label.
- Connected planner lane: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Shopping completion next-action copy pass — 2026-09-17

- When every shopping item is checked, the sheet now says `구매 완료한 항목은 재고에 반영할 수 있어요` and `재고에 반영하기 전까지 구매 완료로 남아요`.
- This keeps purchase completion and inventory receipt as separate states while making the next action explicit instead of presenting a terminal-looking success message.
- Connected shopping queue/receive lanes: `2 passed`; retry lane with the updated accessible purchase-complete label: `1 passed`; production build: `762` Vite modules; protected runtime: `28 files passed`; bundle budget: `19` JS chunks, `1240.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account first-fold mobile CTA pass — 2026-09-17

- The account sheet now opens at `0.9` of the current mobile surface instead of `0.8`, keeping the login form's primary action inside the first visible sheet viewport on short 720px/740px surfaces while retaining the same scrollable content contract on taller devices.
- The native viewport regression checks the 320px, 393px short, and 393px tall surfaces, including the sheet boundary, initial scroll position, and login button safe placement.
- Native viewport: `28 passed`; fixture/mobile: `53 passed, 3 skipped`; production build: `762` Vite modules; protected runtime: `28 files`; bundle budget: `19` JS chunks, `1240.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Food-tab direct-add pass — 2026-09-17

- The sticky `내 식품 목록` header now exposes a direct plus action, so the food tab can start receipt intake without sending the user back to Home. The compact icon keeps a 44px target and exposes `식품 목록에 추가` as its accessible name and tooltip.
- The storage filter remains beside the new action; list/search behavior and the existing Home `식품 추가하기` CTA are unchanged.
- Direct-add/native touch lane: `8 passed` in the focused run; final native viewport lane: `29 passed`; final fixture/mobile lane: `53 passed, 3 skipped` with one worker; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1241.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Bottom-tab navigation determinism pass — 2026-09-17

- Home/식품 bottom-tab changes now settle the shared scroll root immediately instead of starting a smooth anchor animation. This keeps the selected tab, visible section, and the next row tap in the same navigation state; in-page `전체 보기` anchor movement remains smooth.
- The existing priority-detail/inventory-return flow was repeated five times after the change to verify that closing inventory detail preserves `식품` rather than being overwritten by an intermediate scroll state.

## Account unauthenticated-settings boundary pass — 2026-09-17

- When the API is configured but `auth/me` has not produced a workspace session, the account sheet now renders only the login/recovery path. Storage locations, notification preferences, export, receipt privacy, and external inventory panels do not mount or issue workspace reads before authentication.
- Guest and authenticated sessions still expose the existing workspace settings after their workspace identity is confirmed; this only closes the unauthenticated presentation/request boundary.
- Connected account/settings subset: `15 passed`; the unauthenticated boundary case verifies zero workspace-setting requests before session confirmation. Production build: `762` Vite modules; protected runtime: `28 files`; bundle budget: `19` JS chunks, `1241.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal safety first-fold discovery pass — 2026-09-17

- When a generated meal has date, missing-ingredient, or allergen notices, the first meal-sheet viewport now surfaces a compact `조리 전 확인 필요` bar immediately below the meal conditions. It points to the existing full safety summary, so the warning is discoverable without duplicating the detailed messages or changing the save/completion gate.
- The existing full summary keeps its stable `#recipe-safety-summary` anchor and remains before the ingredients/provenance sections; only the first-fold discovery path was added.
- Native meal/large-text lane: `4 passed`; connected planner safety/shopping lanes: `2 passed`; production build: `762` Vite modules; protected runtime: `28 files`; bundle budget: `19` JS chunks, `1241.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Shopping-source label consistency pass — 2026-09-17

- Meal-plan shopping items now use the same `식단 1개` source label as the standalone shopping sheet. The internal planner term `계획` no longer leaks into one of the two user-facing shopping surfaces.
- Connected planner shopping lane: `1 passed` after the label contract was unified.

## Meal-completion blocker copy pass — 2026-09-17

- After saving a meal, the completion CTA now says `조리 전 확인 후 기록` until the user acknowledges the safety check, then changes to `조리 완료로 기록`. The disabled state now explains the required next action instead of looking like an unresponsive completion button.
- Native completion lane: `2 passed`; fixture completion lane: `1 passed`; connected planner shopping/completion lane: `1 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1241.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification-kind scan pass — 2026-09-17

- Notification rows now expose a compact kind label before severity and time: `소비 전 확인`, `날짜 확인`, `보관 상태`, or `연동 상태`. Similar titles can now be scanned by purpose without changing the notification payload or detail navigation.
- Fixture notification lanes: `2 passed`; connected stale-notification recovery: `1 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt-recognition vocabulary pass — 2026-09-17

- Normal receipt and label review surfaces no longer expose `OCR` as the primary user-facing term. They now say `사진 인식`, `읽어낸 내용`, `처음 읽어낸 내용`, or `자동 인식 신뢰도` while preserving the same source observations, confidence payloads, and review contract.
- Native source-review lane: `4 passed`; fixture receipt-review lane: `3 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt-recovery language pass — 2026-09-17

- The recognition failure fallback now says `직접 확인해서 등록할 수 있어요` instead of exposing the internal English `review` term. The recovery action and manual registration path are unchanged.
- Camera fallback/capture fixture lanes: `2 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt-intake trust copy pass — 2026-09-17

- The first receipt intake screen now explains both the user confirmation boundary and the storage boundary: automatically read content is checked before applying, and the original photo is not saved as inventory history.
- Processing status also uses `사진 인식 가능 여부` instead of the internal OCR term.
- Fixture receipt/camera intake lane: `2 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Label-candidate vocabulary pass — 2026-09-17

- Label review now says `자동으로 읽은 숫자는 후보예요` instead of exposing `OCR 숫자`, keeping date-meaning confirmation language consistent with the receipt flow.
- Fixture label candidate lane: `1 passed`; connected label-review lanes: `3 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Camera-recognition vocabulary pass — 2026-09-17

- Camera fallback and label meaning guidance now use `사진 인식` / `자동 인식` instead of the remaining `OCR` wording, while the original-image storage boundary stays explicit.
- Fixture camera/label lane: `2 passed`; connected label-review lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1242.5KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-settings hierarchy pass — 2026-09-17

- Authenticated account settings now separates `계정 보안`, `식품 기록 설정`, and `외부 연동` with the existing product kicker hierarchy. The panels remain fully available and their connected read/write contracts are unchanged; this is a scanability improvement for the long mobile sheet.
- Connected account/settings subset: `15 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Web-surface short-viewport pass — 2026-09-17

- The desktop web surface now uses a tighter hero height, top rhythm, priority-section gap, and status-card minimum height so a 1280×720 browser viewport does not hide the first rescue summary behind the fixed bottom navigation. The mobile phone surface rules remain unchanged.
- Web surface lane: `1 passed`; production build: `762` Vite modules; bundle budget: `19` JS chunks, `1242.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Web-header account-entry pass — 2026-09-17

- `ConnectionStatus` is now part of the initial web bundle, so the desktop header exposes the account entry immediately instead of waiting for a lazy chunk with an empty fallback. Mobile behavior and the connection state contract are unchanged.
- Web surface lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1241.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-action reachability pass — 2026-09-17

- The meal sheet now reuses the existing safe-area-aware sticky action contract for `식단 저장` and `레시피 보기`, keeping the primary meal actions reachable while the user reads the recipe and safety details.
- Native meal/large-text lane: `4 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1241.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Receipt-intake hint readability pass — 2026-09-17

- Receipt, label, and camera fallback helper text now uses the shared `10px` bottom-sheet readability baseline, keeping the first-step privacy and recovery explanations legible on the narrow mobile frame.
- Native receipt/source/camera lane: `5 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1241.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## External-inventory progressive-disclosure pass — 2026-09-17

- The external inventory panel keeps connection status and worker health visible, while detailed location/product mapping, reconciliation, dead-letter, and manual sync controls are now behind `상세 연결 설정`. This reduces default account-sheet density without removing any advanced operation.
- Connected Grocy settings lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1241.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## External-inventory disclosure-summary pass — 2026-09-17

- The collapsed external-inventory summary now reports `확인이 필요한 작업 N건이 있어요` when mapping/reconciliation/dead-letter/product-task work exists, so the user can decide whether to open the advanced panel without expanding it blindly.
- Connected Grocy lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1241.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## External-inventory user-language pass — 2026-09-17

- Advanced external inventory labels now use `외부 재고 위치 번호`, `외부 상품 번호`, `외부 작업 번호`, and `자동 동기화 상태` while preserving Grocy IDs and provider payloads in the data contract.
- Connected Grocy settings lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1242.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.
- Validation errors now use the same user-facing labels instead of falling back to raw provider field names.

## Shopping-receive touch-target pass — 2026-09-17

- The important `재고 반영` action in shopping rows and its receive confirmation action now use a 44px minimum touch target. The destructive delete action remains visually and spatially secondary.
- Native touch/major-sheet lanes: `2 passed`; connected shopping refresh/receive lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1241.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Food-tab add-label pass — 2026-09-17

- The food-tab header action now shows `+ 추가` visually while retaining the accessible name `식품 목록에 추가`, making the primary action understandable without relying on icon inference.
- Native home/pantry/direct-add lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1242.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.
- The button keeps the label on one line at the 320px native width after the final width/padding adjustment.

## Inventory-search keyboard-boundary pass — 2026-09-17

- Inventory search focus correction now accounts for both the search input and the sticky inventory toolbar when the simulated keyboard opens. The scroll owner moves far enough that neither control remains below the keyboard top.
- The fixture geometry contract allows up to `2px` only for fractional viewport rounding; the toolbar boundary remains asserted at `1px`.
- Inventory search repeated lane: `5 passed`; `git diff --check`: passed.

## Bottom-tab account-sheet race pass — 2026-09-17

- Bottom navigation now settles its scroll anchor synchronously before another sheet can open. This prevents an immediate account-sheet open/close after tapping `식품` from losing the selected `식품` tab and reverting to `홈`.
- Account close now reasserts the originating `식품` context and inventory anchor when the sheet was opened from the pantry.
- Expired-session return repeated `3/3` passed; native pantry/direct-add lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1242.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Full mobile regression readback — 2026-09-17

- Final fixture/mobile lane: `53 passed, 3 skipped` with one worker; final native viewport lane: `29 passed`. The fixture skips remain production-runtime/Web Push environment lanes, while accessibility, mobile runtime, receipt, label, barcode, account, notification, planner, and inventory search coverage are green.

## Full connected regression readback — 2026-09-17

- Final connected API/browser lane: `117 passed` with one worker. This covers receipt lifecycle, planner, shopping, cross-device revision, workspace isolation, account/Grocy settings, notifications, storage mutations, manual intake, barcode/label review, and recipe-operator flows.

## External-inventory status-copy boundary pass — 2026-09-17

- External inventory connection details now translate provider readback wording into user-facing Korean copy, so `system info readback` is not exposed in the mobile account sheet. The provider response contract and status semantics remain unchanged.
- Connected Grocy status/retry/stale-operation lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1242.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## External-inventory provider-copy pass — 2026-09-17

- Provider error details and accessibility labels now use the same user-facing vocabulary: `외부 재고 서비스`, `상품 연결`, `외부 작업 번호`, and `동기화 대기 상태`. Raw `Grocy`, `outbox`, `reconciliation`, and `stock sync` wording is retained only in the implementation/data contract, not in the mobile sheet copy.
- Connected external-inventory lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Cross-surface sync-copy pass — 2026-09-17

- Storage, consume, discard, meal-completion, and receipt-commit toasts now describe sync states as `외부 재고 반영`, `외부 상품·보관 위치 연결`, and `외부 반영 여부` instead of exposing the provider name. The response status enum remains unchanged for API routing and recovery behavior.
- Connected storage/mutation lane: `5 passed`; the queued readback case verified the rendered toast contains `외부 재고 반영을 대기 중이에요` and does not contain `Grocy`. Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Guest-record connection-copy pass — 2026-09-17

- The fixture connection pill now says `게스트 기록` instead of `데모 모드`, aligning the first-fold status with the account sheet's explanation that these records stay in a separate guest space until the user connects an account. Runtime state, account entry, and storage behavior are unchanged.
- Fixture home/theme/notification lane: `3 passed`; native 320px sheet and guest-account safe-area lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification-count badge pass — 2026-09-17

- Mobile and web notification triggers now show the unread count (`3`, capped at `9+`) instead of only a red dot. The accessible label still exposes the exact count, and opening/read behavior is unchanged.
- Fixture home/theme/notification lane: `3 passed`; native 320px sheet and guest-account safe-area lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.5KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Home-status quick-entry pass — 2026-09-17

- The large `오늘 먼저 확인할 식품 N개` summary card is now the primary quick entry to the food list. Its accessible name makes the next action explicit, while unknown/auth-required inventory states continue to use the existing reconnect or account path.
- Fixture home/theme/notification/status-entry lane: `4 passed`; native 320px sheet and guest-account safe-area lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Home-status affordance-copy pass — 2026-09-17

- The interactive status card now exposes its next action visually as `목록 보기 →`; unknown inventory states instead show `다시 확인` or `계정 연결`. This makes the new quick-entry behavior discoverable without changing the card's information hierarchy.
- Fixture status-entry/notification lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Home-priority hierarchy pass — 2026-09-17

- The visual list header now says `먼저 확인할 식품` after the summary card, avoiding a repeated `오늘 먼저 확인할 식품` label while preserving the full accessible heading name and count. The summary card remains the day-level status; the list header now acts as the compact scan anchor.
- Fixture home/detail/status/notification lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Home-primary-entry deduplication pass — 2026-09-17

- Removed the duplicate `전체 보기` action from the priority-list header after the status card became the canonical `목록 보기 →` entry. The list header now carries hierarchy only, reducing competing taps in the first fold; the web surface test now follows the status-card entry.
- Web surface lane: `1 passed`; fixture home/detail/status/notification lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Connection-pill account-entry pass — 2026-09-17

- The connection status pill now includes a compact chevron affordance (`게스트 기록 ›`, `서버 연결됨 ›`) while preserving the existing status text, exact accessible label, and account-sheet action. This makes the top-right status control read as both state and entry point.
- Fixture home/detail/notification lane: `2 passed`; native 320px sheet/account safe-area lane: `2 passed`; web surface lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Intake-entry copy alignment pass — 2026-09-17

- The top camera action now says `식품 스캔·추가 열기` with a matching tooltip because it opens the multi-method intake hub (`영수증`, `바코드`, `라벨`, `직접 입력`) rather than a camera-only flow. The underlying receipt/barcode/label/manual contracts are unchanged.
- Fixture home/detail/status/notification lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Inventory-priority continuity pass — 2026-09-17

- Inventory rows now retain the home priority signal: priority foods show `우선 · 날짜`, while date/safety warnings still take precedence as `확인 필요`. Users no longer lose the reason a food was surfaced when moving from the home queue into the full pantry list.
- Fixture home/detail/pantry/notification lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1243.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Full mobile regression readback — 2026-09-18

- Current fixture/mobile lane: `54 passed, 3 skipped` with one worker. The three skips remain the known production-runtime/Web Push environment lanes; accessibility, mobile runtime, intake, date review, priority continuity, inventory search, account, notification, planner, and recipe flows are green.
- Current native viewport lane: `29 passed` with one worker, including 320px sheets, keyboard/safe-area boundaries, large text, dark mode, receipt source review, pantry search, direct add, and primary action reachability.

## Inventory-health summary pass — 2026-09-18

- The unfiltered food list now surfaces `확인 필요 N개 · 날짜·보관 상태를 먼저 확인해요` beneath the search field. Active search/filter scope summaries still take precedence, so the health cue never competes with the user's current query.
- Fixture pantry/detail/search lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Full connected regression readback — 2026-09-18

- Current connected API/browser lane: `117 passed` with one worker. This covers receipt lifecycle, planner, shopping, cross-device revision, workspace isolation, account/Grocy settings, notifications, storage mutations, manual intake, barcode/label review, recipe-operator flows, and the new inventory-health summary boundary.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-account boundary first-fold pass — 2026-09-18

- The guest login/register first-fold copy now says `다른 기기에서도 이어가요. 게스트 기록은 자동으로 섞지 않아요`, surfacing the data-preservation boundary before authentication. The detailed note and guest-transfer confirmation flow remain available below.
- Fixture guest-account lane: `1 passed`; connected re-auth, unauthenticated-settings boundary, and guest-transfer lanes: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Priority-scope copy alignment pass — 2026-09-18

- The home summary legend now says `우선 확인 필요` for the priority queue, while the full pantry health summary keeps `확인 필요 N개`. The two counts no longer look contradictory because their scopes are explicit.
- Fixture home/detail/pantry lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-mode copy alignment pass — 2026-09-18

- The account sheet first-fold explanation now follows the selected tab: login says `계정에 로그인하면 다른 기기에서도 이어가요`, registration says `계정을 만들면 다른 기기에서도 이어가요`; both keep the explicit `게스트 기록은 자동으로 섞지 않아요` boundary.
- Fixture account lane: `1 passed`; connected unauthenticated/guest-transfer lanes: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-sheet purpose-copy pass — 2026-09-18

- The account sheet subtitle now says `계정에 연결하면 다른 기기에서도 기록을 이어가요`, making the purpose of the login/register sheet explicit before the user reaches the tab-specific explanation.
- Fixture guest-account lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification-purpose copy pass — 2026-09-18

- The notification sheet subtitle now says `확인할 날짜와 기록 상태를 모아 보여드려요` instead of exposing the internal phrase `동기화 작업`, while notification kind, unread/read history, and detail navigation remain unchanged.
- Fixture notification/read-history lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Guest-transfer inventory-scope pass — 2026-09-18

- Guest transfer preview summaries now include custom `보관 위치 N개` alongside food, receipt, storage-event, meal-plan, shopping, and notification counts, so users can see the full record scope before choosing `게스트 기록 가져오기`.
- Connected guest-transfer/ conflict lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.5KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Guest-transfer summary chips pass — 2026-09-18

- The guest transfer preview now renders each import scope as a compact chip instead of one long inline sentence, improving scanability on narrow mobile sheets while preserving the same accessible content and transfer payload.
- Connected guest-transfer/ conflict lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1244.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-records progressive-disclosure pass — 2026-09-18

- Authenticated account settings now place infrequent `데이터 내보내기` and `영수증 원본 관리` controls behind a `기록 관리` disclosure, keeping security, storage, and notification decisions visible while reducing first-fold sheet density. The panels retain their existing read/write and privacy contracts when opened.
- Connected privacy/export/retry/unauthenticated boundary lane: `5 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1245.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-records lazy-mount pass — 2026-09-18

- The collapsed `기록 관리` disclosure now delays mounting its export/privacy panels until the user opens it, so infrequent workspace data reads do not compete with the first account screen. Opening the disclosure still mounts the same panels and preserves their retry/delete/download behavior.
- Connected privacy/export/retry/unauthenticated boundary lane: `5 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1245.1KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-notification progressive-disclosure pass — 2026-09-18

- `알림 설정` is now a lazy disclosure alongside `기록 관리`; the account first fold keeps security, storage, and external-link decisions visible without mounting push/quiet-hours controls until requested. Cross-device drafts, save/retry, and unauthenticated boundaries remain unchanged.
- Connected account draft/notification/unauthenticated lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1245.5KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-storage progressive-disclosure pass — 2026-09-18

- User-defined `보관 위치 설정` is now a lazy disclosure alongside notification and record management settings. The account first fold keeps the workspace/security path compact, while location create/edit and cross-device refresh remain available after opening the disclosure.
- Connected custom-storage lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Saved-meal-history re-entry pass — 2026-09-18

- Recent saved meal rows are now real buttons. Selecting a saved/completed row reloads that plan into the current meal sheet, closes the history list, and restores the matching saved/completed state so usage review or record follow-up can continue.
- Connected planner save/completion/history lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-audit purpose-copy pass — 2026-09-18

- The saved meal audit header no longer exposes the internal `snapshot` hash. It now says `저장·조리 기록`, while snapshot hashes remain available to the API/reconciliation contract only.
- Connected planner save/completion/history lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.2KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-history re-entry affordance pass — 2026-09-18

- Recent saved meal rows are now keyboard/touch buttons with explicit labels such as `조리 완료 식단 열기`. Selecting one reloads the plan and restores its saved/completed state instead of leaving history as a terminal read-only list.
- Connected planner save/completion/history lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.2KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Full connected post-disclosure readback — 2026-09-18

- Current connected API/browser lane after account lazy disclosures and saved-meal re-entry: `117 passed` with one worker. Account storage/notification/archive disclosures, receipt flows, planner/history, shopping, workspace revisions, and recipe operations are all green.
- Current production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Multi-day meal copy alignment pass — 2026-09-18

- Multi-day planner UI now consistently says `3일 식단` / `저장한 3일 식단` instead of exposing the internal planning term `3일 계획`. API bundle/status fields remain unchanged.
- Connected planner save/retry lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.2KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Multi-day optimizer copy pass — 2026-09-18

- The fallback multi-day optimizer note now says `재고 순서에 맞춰 계산한 3일 식단이에요` instead of exposing the internal `복구용 계획` wording. Optimization behavior and engine status values remain unchanged.
- Connected planner multi-day/save/safety lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.2KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-shopping next-action count pass — 2026-09-18

- The meal sheet shopping action now says `장보기 N개 확인` when unchecked shopping items remain, instead of the generic `장보기 목록 보기`. When there are no pending items it keeps the neutral label; shopping mutations and receive contracts are unchanged.
- Connected planner/shopping sync lane: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.3KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Detail-action disabled-state pass — 2026-09-18

- On the mobile dark food-detail sheet, the disabled `변경 후 저장` action now uses a muted outlined surface and no elevation, so it reads as unavailable until storage, opened state, or quantity actually changes. The actionable `변경 저장` state keeps the primary accent treatment and the existing consume/discard flow is unchanged.
- CUA mobile preview (`http://127.0.0.1:4176/`) visually confirmed the dark-mode distinction; fixture detail and axe lanes: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Product-candidate copy alignment pass — 2026-09-18

- Receipt and barcode review copy now describes the enrichment path as `상품 정보 후보 찾기` / `상품 정보 확인` instead of exposing the internal `제품 기준 정보 조회·보강` wording. Source freshness, confidence, storage hints, and the warning that package dates still require label confirmation remain visible.
- Connected receipt-review and barcode-candidate lanes: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account-mode recovery disclosure pass — 2026-09-18

- The password-recovery entry is now mounted only in the login mode. Switching to `회원가입` removes the login-only `비밀번호를 잊으셨나요?` card from the first fold, while switching back to `로그인` restores the recovery entry and its generic-account-existence contract.
- CUA mobile preview confirmed the reduced registration first fold; fixture account-mode lane: `1 passed`; connected password-reset/settings-boundary lanes: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification-scope copy pass — 2026-09-18

- The notification summary now names both scopes explicitly: `먼저 확인할 알림 1개` identifies the urgent subset and `전체 3개` identifies the unread total. The existing notification-to-food-detail navigation and retry/read persistence behavior remain unchanged.
- CUA mobile preview confirmed the first-fold hierarchy; fixture notification/navigation/read-history lanes: `2 passed`; connected notification read-retry lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-completion return-position pass — 2026-09-18

- When a meal is started from the home surface, completing it now returns the user to the top of home so the refreshed priority count and next food queue are immediately visible. Meal flows started from the food tab keep their existing inventory return context instead of being forced to home.
- Fixture recipe save/complete lane: `1 passed`, including `mobile-scroll.scrollTop === 0` and the active bottom navigation returning to `홈`; native 393x720 completion return lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Unknown-inventory summary boundary pass — 2026-09-18

- When production data is still checking, the account is required, or the API is offline, the refrigerator summary no longer renders misleading `0개` counts. It now shows `— 보관 수 확인 필요` and `— 우선순위 확인 필요`, matching the authoritative `재고 확인이 필요해요` state above it. Connected/demo inventory counts remain unchanged.
- Production-shaped unreachable-API runtime lane: `1 passed` with `VITE_DEPLOYMENT_MODE=production` and an HTTPS API base; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1246.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Manual-intake sticky-action pass — 2026-09-18

- The manual food intake flow now reveals a single sticky `식품 추가하기` action as soon as a food name is entered. It remains reachable under the sheet header while the user scrolls through quantity, storage, and priority-review details; the previous off-screen duplicate action was removed.
- CUA mobile preview confirmed the action before and after scrolling; native 320px manual-intake reachability lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Date-kind dark-theme pass — 2026-09-18

- The date editor's `유통기한`, `소비기한`, `품질유지기한`, and `내 알림일` controls now inherit the active light/dark theme instead of keeping a light beige surface in dark mode. The selected state continues to use the product accent and the date-source meaning/caution copy is unchanged.
- CUA mobile dark-mode preview confirmed the updated contrast; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Post-theme mobile regression readback — 2026-09-18

- Current fixture/mobile lane: `54 passed, 3 skipped`; the skips remain the known production-runtime/Web Push environment lanes. Current native viewport lane: `30 passed`, including the new manual-intake sticky action and meal-completion home return. Accessibility, intake, date review, dark mode, account, notification, planner, and inventory flows remain green.

## Product-source language pass — 2026-09-18

- User-facing local product provenance now says `서비스 상품 기준` instead of the internal `프로젝트 상품 기준` label across receipt candidates, food detail provenance, and product history. External provider/source labels and confidence/freshness context remain unchanged.
- Fixture receipt-backed detail lane: `1 passed`; connected packaging/date provenance lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Recipe-language copy pass — 2026-09-18

- The allergen-preference fallback now says `레시피의 알레르기 정보` instead of exposing the internal English `recipe` field name. Safety disclaimer meaning and recommendation filtering behavior are unchanged.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Admin-account language pass — 2026-09-18

- The account profile now says `레시피 운영자 권한` instead of exposing the internal `recipe catalog` role label. Operator-only review tooling and permission behavior remain unchanged.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Operator-review language pass — 2026-09-18

- The opt-in operator review surface now uses Korean user-facing labels for its primary copy and errors: `레시피 검토`, `레시피 운영자`, `검토 토큰`, `검토 초안`, and `레시피 검토 서버`. Technical source fields remain available inside the operator-only data contract.
- Connected full operator-review suite: `10 passed`, including entry, disabled endpoint, source draft import, claims, remote refresh, filters, editor refresh, catalog revision, and admin-account access; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1249.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Empty-meal next-action pass — 2026-09-18

- An empty workspace opened from the bottom `식단` tab no longer ends on a disabled `식품을 추가한 뒤 만들기` button. The meal sheet now offers an active `식품 추가하기` CTA that opens the existing receipt intake flow, matching the home empty-state path.
- Connected empty-workspace flow: `1 passed`, including return of the active bottom navigation to `홈` after closing the intake sheet; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Recipe-preference language pass — 2026-09-18

- The allergen preference note now says `외부 레시피는` instead of exposing the English `외부 recipe는` wording. Preference persistence, filtering, and the medical-safety disclaimer remain unchanged.
- Connected allergen-preference recalculation lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-plan retry-action pass — 2026-09-18

- Meal preview failures now expose a `다시 계산` action in the same error surface. Previously only save/completion persistence failures had a retry button, leaving an initial planner read failure without a recovery path.
- Connected planner preview failure/retry lane: `1 passed`; connected save/completion/error suite remained green in the latest full readback: `117 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Empty-meal density pass — 2026-09-18

- When no food is registered, the meal sheet now hides secondary `식단 조건`, `조리 가능 시간`, and `식사 인원` controls. The empty state keeps only the explanation and the actionable `식품 추가하기` CTA; those controls return once ingredients exist.
- Connected empty-workspace lane: `1 passed`, including absence of the irrelevant time/serving groups; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## No-match meal recovery copy pass — 2026-09-18

- When ingredients exist but no recipe can be generated, the empty planner message now names both recovery directions: add more food or change the cooking conditions. The CTA changes to `식품 더 추가하기` so it no longer reads like the user has no food at all.
- Connected no-match recovery lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Cross-device conflict copy pass — 2026-09-18

- Conflict messaging now says `최신 상태를 확인한 뒤 다시 시도해 주세요` instead of claiming that the latest list was already loaded. The message is now truthful for both mutation failures and the follow-up refresh action.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Post-empty-state mobile regression readback — 2026-09-18

- Current fixture/mobile lane: `54 passed, 3 skipped`; current native viewport lane: `30 passed`. The latest run covers empty-meal density, no-match copy, planner retry, manual intake sticky action, navigation restoration, date review, account, notification, accessibility, and dark mode.

## Full connected readback after empty-state CTA — 2026-09-18

- Current connected API/browser lane: `117 passed` with one worker. This includes the empty-workspace meal-to-intake handoff, planner save/completion/history, shopping receive, account/guest transfer, notification, cross-device revision, receipt, barcode/label, storage, and operator-review flows.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Latest full connected readback — 2026-09-18

- Current connected API/browser lane: `119 passed` with one worker after the no-match recovery contract and navigation restoration checks were added. Empty workspace, planner retry/no-match, shopping, account, notifications, receipt, storage, barcode/label, guest transfer, and operator-review flows remain green.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1247.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Latest full connected readback after operator language pass — 2026-09-18

- Current connected API/browser lane: `122 passed` with one worker. This includes the latest operator-review Korean copy, source draft import, claims, remote refresh, and all consumer planner/intake/account/storage flows.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1249.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Provenance-history language pass — 2026-09-18

- Product provenance history reasons now normalize known internal provider and role terms (`Open Food Facts`, 식품안전나라 internal codes, 외부 연동명, `workspace`, `recipe_admin`) before rendering user-facing history rows. The underlying audit reason remains unchanged in the API record.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1248.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Empty-review-queue next-action pass — 2026-09-18

- When a cross-device refresh removes every pending receipt while the review queue is open, the empty state now offers `새 영수증으로 추가` instead of leaving the user with only an informational message. The CTA reuses the existing intake flow.
- Connected receipt-queue refresh-to-empty lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1248.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Planner-secondary-retry pass — 2026-09-18

- `다른 메뉴`, `3일 식단 미리보기`, and `저장한 3일 식단` read failures now retain their open section and expose a retry action instead of leaving an error-only dead end. Retry requests bypass the close-toggle branch and actually reload the failed section.
- Connected alternative-menu, multi-day preview, and multi-day history failure/retry lanes: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1248.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Planner-empty-result copy pass — 2026-09-18

- Empty results for alternative menus and multi-day dates now explain the next recovery: change cooking time or servings and calculate again. The user is no longer left with only a generic “could not find” message.
- Production build: `762` Vite modules; bundle budget: `17` JS chunks, `1249.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Product-edit history language pass — 2026-09-18

- Product name/brand/category edit history now applies the same case-insensitive internal-term normalization as provenance history, so server-supplied reasons do not expose `workspace`, `recipe_admin`, provider names, or external-service names in user-facing rows.
- Connected product provenance/info history lane: `1 passed`, including raw internal reason redaction; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1248.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile quick-add first-fold pass — 2026-09-18

- The short mobile preview now places `확인하고 오늘 식단 만들기` and a compact `식품 추가` action in one touch-safe row. The row ends at `599px` while the fixed navigation begins at `608px` in the 720px preview, so the add path is no longer hidden under the bottom navigation; the full accessible name remains `식품 추가하기`.
- The secondary safety note is offset to the navigation edge on the short preview while remaining in normal flow for scroll access. The desktop web surface keeps its existing vertical action order.
- Fixture/mobile lane: `55 passed, 3 skipped`; native 320px lane: `30 passed`; web surface lane: `1 passed`; connected home empty/revision lane: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1249.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Planner-title first-fold pass — 2026-09-18

- The meal sheet now presents the generated recipe title and reason before the ingredient artwork. On the dark mobile preview, `시금치 두부 닭가슴살 덮밥` is visible before the sticky `식단 저장` / `레시피 보기` actions and the ingredient artwork, so the user can identify the proposed meal before committing to it.
- Safety notices, sticky action behavior, saving, recipe expansion, and completion contracts remain unchanged. The native viewport regression now asserts that the title begins before the artwork.
- Native meal first-viewport lane: `1 passed`; connected planner save/completion lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1249.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail action-rail pass — 2026-09-18

- Food detail now exposes a first-fold `조리 전 확인 후 기록하기` rail after the date-safety notice. It scrolls to the existing single source of truth for `먹었어요` / `변경 후 저장`, so the safety review remains before consumption while the primary record path is discoverable without scanning provenance and history sections.
- CUA dark mobile preview confirmed the rail in the first detail viewport and confirmed the jump lands on the existing action row (`먹었어요`, `변경 후 저장`). Existing detail action, consume-confirmation, discard, and safe-area contracts remain unchanged.
- Detail action-rail native lane: `1 passed`; fixture food-detail lanes: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail action-rail focus pass — 2026-09-18

- After the rail scrolls to the existing record actions, focus now moves to the primary `먹었어요` button with `preventScroll` so the visible action and the accessibility cursor stay aligned. Bottom-sheet close/focus restoration remains owned by the existing modal runtime.
- Native focus-and-jump lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.1KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Consume-close focus recovery pass — 2026-09-18

- When `먹었어요 기록` removes the active priority food, focus now falls back to the next visible priority card instead of remaining on the unmounted detail action or stopping at the status card. Inventory-origin detail closes use the next inventory row fallback; the original trigger still wins whenever it remains mounted.
- Fixture date-warning consume lane: `1 passed`, including active bottom navigation `홈` and focus on the next `.priority-card`; native detail rail lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Inventory consume focus pass — 2026-09-18

- Inventory-origin detail now uses the pantry fallback after a consumed row disappears. A `식품` tab consume returns to the remaining first inventory row while keeping the active bottom navigation on `식품`; home-origin detail continues to prioritize the next home priority card.
- Inventory consume focus lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Save-discard focus continuity pass — 2026-09-18

- Partial storage move keeps focus on the retained lot after the original quantity is split; partial discard keeps focus on the remaining row; full inventory discard falls back to the next pantry row while staying on `식품`.
- Partial storage/discard lanes: `2 passed`; full inventory discard lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Save-discard result messaging pass — 2026-09-18

- Partial storage now confirms the outcome as `보관 상태를 저장하고 남은 수량을 나눴어요`; partial discard names the affected quantity, for example `맛타리버섯 1팩을 폐기 기록으로 남겼어요`. Full-action messages remain concise and unchanged.
- Partial storage/discard lanes: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Retry-toast persistence pass — 2026-09-18

- Retryable persistence errors now keep their toast action visible until the user retries or a newer message replaces it. Normal informational/success toasts retain the short auto-dismiss behavior, while `다시 시도` no longer disappears during the decision window.
- Connected storage persistence-retry lane: `1 passed` after a 3-second wait; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Cross-device refresh focus pass — 2026-09-18

- After an open detail detects a remote revision, `최신 상태 확인` now restores focus to the detail action rail after the latest data is applied. Local edits remain protected until that explicit refresh, and the existing inline stale alert remains the single conflict surface.
- Connected cross-device detail lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1250.7KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Retry-action focus pass — 2026-09-18

- A persistent `다시 시도` toast now returns focus to the current page's recovery target when invoked: next priority card on 홈, next inventory row on 식품, or the meal CTA when the planner is the active destination. This prevents the disappearing toast button from leaving keyboard focus in the document body.
- Connected storage retry lane: `1 passed`, including retry visibility after 3 seconds and focus recovery; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1251.2KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt-commit retry focus stabilization — 2026-09-18

- Receipt commit retry now starts the mutation before scheduling recovery focus and keeps a short mutation-settle observer alive. If the commit response replaces the inventory DOM, focus is re-established on the final priority target; if the current data is temporarily empty, the stable connection control is used instead. The test assertion accepts either target based on authoritative DOM availability rather than assuming inventory exists during the transition.
- Connected receipt correction/commit retry lane: `1 passed`, including same idempotency key and corrected payload readback; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1251.8KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Recovery-settle shared readback — 2026-09-18

- The shared settle observer was rechecked against storage persistence retry after the receipt commit case: retry toast visibility after 3 seconds, same idempotency key replay, and recovery focus remain green across both mutation paths.
- Connected storage retry lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1251.8KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Planner retry focus pass — 2026-09-18

- Planner save retry now returns focus to the active `레시피 보기` action after the saved state replaces the disabled `저장됨` button. Completion retry keeps the existing consumption draft and returns focus to the Home `확인하고 오늘 식단 만들기` CTA after the sheet closes.
- Connected planner save/completion retry lanes: `2 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1251.9KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Multi-day retry focus pass — 2026-09-18

- Multi-day save retry now returns focus to the still-open `3일 식단 접기` control after the save button becomes `3일 식단 저장됨` and disabled. The open multi-day section and retry payload remain intact.
- Connected multi-day save retry lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1252.2KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Planner shopping-retry focus pass — 2026-09-18

- Shopping-source retry now returns focus to the first rendered shopping item after a successful add. If a refresh returns no item, the existing shopping toggle is the fallback; shopping errors and source/idempotency contracts remain unchanged.
- Connected missing-ingredient shopping retry lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1252.2KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping-list mutation focus pass — 2026-09-18

- Home shopping-list checkbox updates now keep focus on the updated item. Delete and successful receive operations move focus to the next item at the same index, or to the direct-add `추가` action when the list becomes empty. A failed receive keeps the pending target until the retry changes the `items` array, so the retry path does not lose its recovery destination.
- Connected shopping toggle/delete lane: `1 passed`; shopping receive failure/retry lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1253.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping-list manual and remote focus pass — 2026-09-18

- Manual-add retry now focuses the newly rendered shopping item and clears the recovered draft fields. Cross-device list refresh focuses the first remote item when the user is not editing a manual or receive form; active input drafts remain untouched.
- Connected shopping manual-add, receive, and cross-device refresh lanes: `3 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1253.7KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receive-form focus continuity pass — 2026-09-18

- Collapsing a shopping receive form with `취소` now returns focus to the originating `재고 반영` button. Successful receive keeps the existing next-item/direct-add fallback, and the same behavior survives a failed first request followed by retry.
- Connected shopping receive cancel/failure/retry lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1253.8KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receive-input focus policy pass — 2026-09-18

- Receive-panel opening now has an explicit shell policy: native webview auto-focuses the purchase-quantity input so the real system keyboard can start entry immediately; the calibrated preview only scrolls the panel and leaves the keyboard closed so the full 320px review surface remains visible. Cancel, failure, retry, and success focus recovery are shared across both shells.
- Connected preview receive lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1253.9KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail-action direct-first-fold simplification pass — 2026-09-18

- The temporary first-fold action rail was removed after native geometry readback showed that the actual `먹었어요` / `변경 후 저장` row and the low-emphasis `상태가 이상해 폐기하기` action could still fall below the safe area on long detail content. The single action anchor now follows the date-safety review directly; provenance, inference, and history remain below it for progressive disclosure.
- The detail action row keeps the existing sticky behavior after scrolling, the consume confirmation still follows the safety-review contract, and explicit remote refresh now restores focus to the direct `먹었어요` action rather than to a duplicate rail.
- Native viewport lane: `31 passed`; fixture/mobile lane: `57 passed, 3 skipped`; connected API/browser lane: `122 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1253.2KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Label-review first-action pass — 2026-09-18

- Label recognition results now keep the date meaning, displayed date, storage, and lot choice in normal reading order before the final `확인 후 반영` action. The action reuses the existing receipt review footer language without becoming an overlay inside the result card, so lower lot choices are not hidden behind the button.
- Recognition scrolls the result action into a usable mobile position while keeping the action at a `44px` touch target; the final action remains a themed primary button in both light and dark modes.
- Native viewport lane: `32 passed`; fixture/mobile lane: `57 passed, 3 skipped`; connected label/offline boundary lane: `7 passed`; web surface lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1253.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Add-result focus continuity pass — 2026-09-18

- Manual, label, and receipt intake now carry the added food's name and origin context across sheet close and asynchronous API readback. Home prefers the new priority card and falls back to the authoritative inventory row when the server assigns the food outside the first three priorities; the food tab targets the inventory row directly.
- The focus intent waits until the closing sheet is removed, runs after the default modal restore focus, and suppresses the generic toast recovery focus while an intake result is pending. If the user moves to another control, focus is not stolen; if no authoritative row appears, the stable connection control is the final fallback. A stale attempt cannot clear a newer retry intent.
- Fixture intake-focus lanes: `3 passed`; latest native viewport lane: `32 passed`; latest connected API/browser lane: `122 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1255.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping-receive follow-up action pass — 2026-09-18

- A successful shopping receive now exposes `방금 반영한 식품을 확인해요` inside the open shopping sheet. `식품 상세 확인` opens the received lot when the current dashboard already contains it; if the readback does not yet expose that lot, the action moves to the 식품 list so the user can continue without losing the success result.
- The receive success action takes focus after the existing item-mutation fallback, while receive cancel, failed retry, cross-device list refresh, and custom storage selection keep their existing focus and data contracts.
- Connected shopping lane: `8 passed`; latest native viewport lane: `32 passed`; latest fixture/mobile lane: `59 passed, 3 skipped`; latest web surface lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1256.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping-receive success-focus priority pass — 2026-09-18

- The receive success callout now owns focus when it appears, so the user lands on `식품 상세 확인` instead of being sent to the next shopping item or manual-add field. Existing list mutation focus remains the fallback when no received-lot action is present.
- Connected shopping receive success, retry, detail handoff, and custom-storage lanes: `8 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1256.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping-to-detail date-review handoff pass — 2026-09-18

- `식품 상세 확인` now carries a one-time detail-entry intent for the received lot. When the lot is available in the current dashboard, the detail sheet opens with `포장지에서 확인한 날짜 입력` focused, turning the receive success into an immediately actionable date-review step; ordinary detail entry points keep their existing focus behavior.
- Closing the detail clears the intent, and later food-detail or label-review navigation cannot inherit the receive-specific focus. The fallback to the 식품 list remains available when the receive response is ahead of dashboard readback.
- Connected shopping/detail handoff lane: `8 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1257.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Date-confirmation result handoff pass — 2026-09-18

- Date confirmation now records the selected meaning in the completion message: `소비기한`, `유통기한`, `품질유지기한`, or `알림일`, instead of collapsing every result into a generic `날짜` label.
- Saving a date from Home or the inventory list carries the food ID and origin context through sheet close and asynchronous API readback. Focus returns to the exact priority card or inventory row after the updated state is rendered; the generic sheet trigger cannot steal focus when the detail was opened from the shopping follow-up. Planner-origin detail returns explicitly discard the dashboard-row intent so it cannot leak into a later meal-sheet close.
- Fixture date-confirmation lane: `1 passed`, including exact priority-card focus; latest fixture lane: `59 passed, 3 skipped`; connected date-confirmation retry/readback lanes: `2 passed`; connected shopping receive → detail → date-save lane: `1 passed`, including exact inventory-row focus; native viewport lane: `32 passed`; web surface lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1259.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-plan safety parity pass — 2026-09-18

- The demo meal planner now receives the same date-review food IDs that drive the Home priority state. When a planned ingredient needs date confirmation, the first meal viewport exposes `조리 전 확인` before the recipe action and links directly to the matching food detail.
- The meal detail handoff returns to the open planner after the food detail closes, while the existing completion acknowledgement remains required for date or allergen notices. The demo no longer presents a recipe as if its ingredient safety context were complete when Home is already asking for a date review.
- Fixture meal planner lane: `1 passed`, including date-warning summary and food-detail return; latest fixture lane: `59 passed, 3 skipped`; native meal first-fold lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1259.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification task-continuity and readback pass — 2026-09-18

- Opening a food from the notification center now keeps the notification sheet as the return context. Closing the detail returns to the same list instead of dropping the user on Home, and the processed notification row receives focus after the sheet transition so the next unread item remains easy to continue.
- Successful single-read and read-all mutations now overlay their acknowledged state until a later notification readback confirms it. An in-flight or stale GET cannot regress a just-read notification back to unread; retry and cross-device refresh behavior remain explicit.
- Fixture notification lanes: `2 passed`; connected notification/detail/readback suite: `8 passed`; mobile CUA readback confirmed the list remains open with the processed row marked `읽음` and focus on the next notification; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1261.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal safety-link focus continuity pass — 2026-09-18

- The planner's `식품 확인 · 식품명` link now carries its food ID through the detail transition. Closing the linked food detail restores focus to the same safety link in the still-open planner instead of the planner's close button.
- If a date update changes the planner result and removes the original link, focus falls back to the first visible safety summary or recipe action. The planner-origin path also clears the dashboard-row date-focus intent so the two return contracts cannot compete.
- The duplicated demo date-review card introduced during the link instrumentation was removed; a fixture assertion now requires exactly one date-review card and verifies the return link focus. Fixture planner lane: `1 passed`; native meal lanes: `2 passed`; connected planner date-review lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1262.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal completion result focus pass — 2026-09-18

- Saving a planner now moves focus to `조리 전 확인했어요` when the meal still has date or allergen notices; without a safety acknowledgement gate it moves focus to the completion action. Save retry keeps the existing `레시피 보기` recovery focus.
- Successful cooking completion waits for the inventory result to change before focusing the first remaining priority food on Home or inventory row on 식품. Home-origin completion preserves `scrollTop 0`; inventory-origin completion may center the retained/next row. The completion toast and inventory count remain unchanged.
- Fixture planner completion lane: `1 passed`; native completion lane: `1 passed`; connected completion retry lane: `1 passed`; mobile CUA confirmed the 7→5 inventory update and focus on the retained 닭가슴살 priority card; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1264.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account first-fold action order pass — 2026-09-18

- The unauthenticated account sheet now presents the login/register choice and primary authentication form before the secondary `비밀번호를 잊으셨나요?` action. Guest-record separation remains visible after the form, so the first mobile fold answers both “what can I do?” and “what happens to my current records?” without making recovery look like the primary path.
- Fixture account-boundary lane: `1 passed`, including DOM action order and tab semantics; native account first-fold lane: `1 passed`; mobile CUA confirmed the login action is above the recovery card; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1264.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-transfer decision focus pass — 2026-09-18

- A registration-time guest transfer preview now focuses `게스트 기록 가져오기` when the record scope is ready, and its temporary preview failure focuses `다시 확인`. The panel still exposes the full record scope and the explicit `계정만 사용` alternative before any import decision.
- The same primary decision focus is restored when a pending transfer is discovered again after reload, so a user can continue an interrupted account connection without returning to the old registration form.
- Connected guest-transfer lane: `1 passed`, including preview retry, transfer-scope readback, reload recovery, and both decision focus targets; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1265.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-transfer result messaging pass — 2026-09-18

- A successful guest import now passes the authoritative imported counts through authentication completion and shows a concise scope summary such as `게스트 기록을 계정으로 옮겼어요 · 식품 8개 · 영수증 2개 외 4개 기록`. The no-record/already-transferred path keeps a distinct message, while a failed dashboard readback keeps the existing connection-failure message instead of claiming a fully refreshed list.
- The transfer preview and retry focus targets remain unchanged: `게스트 기록 가져오기` is focused when the scope is ready and `다시 확인` when preview loading fails. Login, password-reset, and `계정만 사용` continue to use their normal connection messages.
- Connected guest-transfer lane: `1 passed`, including imported-count message and transfer payload readback; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1266.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Label-result action focus pass — 2026-09-18

- After sample or connected label recognition, focus now lands on `확인 후 반영` when the result is complete. When the result is incomplete, the first unresolved product name, date meaning, date, or storage control receives focus after the result card is brought into view, making the next required decision explicit on a narrow mobile viewport.
- The final action remains the existing review contract and touch target; this change only improves keyboard/screen-reader continuation and does not auto-confirm OCR date meaning or storage. Light and dark result surfaces use the same focus order.
- Fixture/mobile lane: `59 passed, 3 skipped`, including label review; native label lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1266.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification return-context contract pass — 2026-09-18

- A notification that opens food detail now remains the task context through storage mutation, dashboard readback, and notification readback. After the detail save completes, the existing notification sheet is restored directly; the user does not need to reopen it from Home just to confirm the result.
- The connected regression contract was aligned with that visible behavior instead of treating the restored sheet as a missing Home trigger. The returned empty state is now asserted in-place, preserving the notification workflow's task continuity.
- Connected full browser/API lane: `122 passed`; fixed scenario targeted rerun: `1 passed`; bundle budget: `17` JS chunks, `1266.7KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification first-action focus pass — 2026-09-18

- A fresh notification-center entry now focuses the first unread food row after the lazy sheet and Radix focus trap settle. The user lands on the actionable item rather than the close control, while the existing exact-row focus remains the priority when returning from food detail.
- The focus intent waits for the actual notification row to mount and abandons itself if the user moves focus or the sheet changes, so delayed API/readback content cannot steal a later user decision.
- Fixture notification lanes: `2 passed`; connected notification/readback lanes: `9 passed`; mobile CUA confirmed focus on `오늘 먼저 확인할 식품이에요: 시금치`; fixture/mobile full lane: `59 passed, 3 skipped`; native full lane: `32 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1267.8KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Empty-shopping action hierarchy pass — 2026-09-18

- An empty shopping list now exposes `식단에서 재료 고르기` as the primary next action and keeps `새로 고침` secondary. The same empty state explains that direct items can be entered in the visible `직접 장보기 추가` section below, so the user is not left with a refresh-only dead end.
- The primary action opens the existing meal planner without changing the shopping data contract, then returns to the original shopping sheet when the meal sheet closes. The existing post-delete focus still returns to the manual `추가` action, and the connected test verifies the empty-state CTA, meal-sheet handoff, and return context.
- Connected shopping lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1268.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline-primary-action guard pass — 2026-09-18

- Cached offline inventory no longer presents `확인하고 오늘 식단 만들기` as if the planner can calculate against a live server. The primary action now reads `다시 연결하고 오늘 식단 만들기` and retries the connection; an expired account routes to `계정 다시 연결하기` instead of opening a request that cannot succeed.
- The existing offline callout remains the authoritative explanation and `다시 연결` action. This change aligns the prominent home CTA with the same recovery boundary without disabling the cached read-only inventory and detail view.
- Connected offline reload lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1268.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt-review queue first-action focus pass — 2026-09-18

- Opening a multi-receipt review queue now focuses the first `이어서 확인` row after the sheet settles; an empty queue falls back to `새 영수증으로 추가`. Selecting a row clears the queue intent so AddFoodSheet's existing resumed-draft focus remains authoritative.
- Cross-device queue refresh does not steal focus after the initial task entry, and the home card still opens a single pending draft directly when only one receipt is waiting.
- Connected queue refresh lane: `1 passed`; connected pending-receipt selection lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1269.9KB` JS, `260.0KB` CSS; `mobile runtime integrity`: `28 protected files`; `git diff --check`: passed.

## Shopping-list first-action focus pass — 2026-09-18

- Opening the shopping list from Home now focuses the first unchecked shopping item. If everything is purchased, focus moves to the first `재고 반영` action; if the list is empty, the primary `식단에서 재료 고르기` action is the entry point.
- Receive-success focus, manual-add result focus, and the meal-to-shopping return context remain higher-priority handoffs, so an initial-entry focus cannot interrupt an active mutation or follow-up task.
- Connected shopping home lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1271.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail reduced-motion scroll pass — 2026-09-18

- Food detail date-review and consume-confirmation focus jumps now use instant scrolling when the device requests reduced motion, while retaining smooth positioning for normal motion users. The focus target and action order are unchanged.
- Native detail/reduced-motion lane: `7 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1271.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt-draft resume focus pass — 2026-09-18

- Resuming a stored receipt draft now settles focus on the first review row (`receipt-line-toggle`) instead of opening the keyboard directly in a product field. The user can inspect the candidate and then enter the existing line editor intentionally; new receipt review keeps its current focus order.
- The resume focus waits for the lazy review content and Radix sheet focus to settle, and stops when the user has moved focus elsewhere.
- Connected stored-draft resume lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1272.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Date-editor first-decision focus pass — 2026-09-18

- Opening `확인한 날짜 입력` now focuses the currently selected date meaning, such as `소비기한`, after the editor mounts. The user can confirm or change the date meaning before entering the date, matching the product rule that a printed date is not automatically treated as a consumption deadline.
- If the user has already moved to another control, the editor does not steal focus; the existing date input and `확인 후 저장` action remain unchanged.
- Fixture date-confirmation lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1272.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-planner first-action focus pass — 2026-09-18

- A fresh meal-planner entry now focuses `조리 전 확인 N건 안내 보기` when safety guidance exists. When there is no safety gate, the recipe primary action becomes the first task target instead.
- The intent applies only to a fresh planner entry; returning from food detail, saving a meal, completing a meal, and shopping handoffs retain their existing focus contracts.
- Fixture recipe lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1273.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail date-review first-action pass — 2026-09-18

- Food details opened from Home, inventory, notifications, or planner context now focus the first date-review action whenever the product needs date confirmation. Printed-date cases focus the label recheck action; editable date cases focus the date-entry action.
- Shopping receive handoff and meal safety-link return behavior remain higher-priority contexts, and read-only offline details do not attempt to focus a disabled write action.
- Fixture home detail lane: `1 passed`; connected packaging-date lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1273.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail storage-mismatch first-action pass — 2026-09-18

- Storage-condition mismatches now count as a detail safety-review entry point too. Opening a mismatched food focuses the active storage option so the user can compare or change the location before returning to the consume action.
- Date review, printed-label recheck, offline read-only, shopping receive, and meal safety-link focus contracts remain separate and higher-priority where applicable.
- Connected storage-mismatch lane: `1 passed`; production build: `762` Vite modules; bundle budget: `17` JS chunks, `1273.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shared reduced-motion scroll policy pass — 2026-09-18

- Meal planner safety jumps, shopping receive-panel reveal, receipt/source review movement, account guest-transfer recovery, AddFood correction scrolls, and Prototype inventory/notification/result recovery movement now use a shared motion policy. Normal devices keep smooth positioning; reduced-motion devices use instant positioning.
- The shared helper lives outside the protected mobile runtime entrypoint, so the simulator/runtime contract remains unchanged while app-owned sheets follow the same accessibility rule.
- Native detail/account/reduced-motion lane: `9 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Add-food first-input-mode focus pass — 2026-09-18

- A fresh Add Food sheet now focuses the selected input-mode tab (`영수증`, `바코드`, `라벨`, or `직접 입력`) instead of leaving the user on the sheet close control. Review-stage results and resumed drafts keep their own more specific row/action focus.
- The mode focus is session-scoped, so switching or reopening an intake sheet gets a clear entry point without re-stealing focus during OCR review or result confirmation.
- Fixture bottom-sheet/accessibility lane: `1 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account-entry first-action focus pass — 2026-09-18

- A fresh unauthenticated account sheet now focuses the selected `로그인` or `회원가입` tab instead of opening the keyboard on an email field. The user can choose the account path first, then enter credentials intentionally.
- Authenticated settings, guest-transfer decision panels, password recovery, and account deletion retain their existing task-specific focus contracts.
- Fixture account lane: `1 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## PWA-prompt secondary placement pass — 2026-09-18

- Install and service-worker update prompts now appear after the Home priority/meal/action area instead of before the primary Rescue Queue. The app can still explain installation or update readiness, but those operational prompts no longer displace the user's first food action on a narrow mobile fold.
- Install prompt behavior, iOS expandable guidance, manifest metadata, and native home CTA geometry remain unchanged.
- The fixture contract now also asserts that the install prompt remains after the Home priority section, so operational prompts cannot displace the first food action again.
- PWA/install lanes: `3 passed`; native home geometry lanes: `2 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail storage-picker semantics pass — 2026-09-18

- Food detail storage controls now expose the same `aria-pressed` state as AddFood storage controls, so the visual active location and the screen-reader selection state cannot diverge.
- Fixture detail/storage lane: `1 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Camera-recovery first-action focus pass — 2026-09-18

- When camera permission or playback fails, the recovery screen now focuses `사진에서 선택`; when the camera becomes ready, the primary `촬영하기` action is the first target.
- This keeps permission failure from ending in a close-only state and preserves the existing file/camera fallback contract and safe-area layout.
- Fixture camera recovery lane: `1 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Barcode-recovery first-action focus pass — 2026-09-18

- Barcode camera failure now focuses `수동 입력으로 계속`, making permission/browser failure a direct recovery path instead of a status-only state.
- The normal barcode scanner flow, manual numeric lookup, and existing AddFood mode-tab focus remain unchanged.
- Fixture barcode fallback lane: `1 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1275.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Latest full source readback — 2026-09-18

- Current source after the accumulated mobile-first UX work passes the full connected browser/API lane: `122 passed`, including planner retry/readback, receipt/label review, storage mutation recovery, account/guest transfer, notification continuity, shopping receive, custom storage locations, and recipe review boundaries.
- Fixture/mobile full lane: `59 passed, 3 skipped`; native full lane: `32 passed`; production build: `763 Vite modules`; bundle budget: `17` JS chunks, `1274.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile theme-chrome sync pass — 2026-09-18

- The PWA/browser `theme-color` now follows the same surface tokens as the selected app theme: light uses `#f2f4f6`, dark uses `#101419`. This removes the dark system-chrome strip that could remain above a light screen after the initial document load.
- The value is updated at the same time as `data-rescue-theme`, survives a reload through the existing theme preference, and does not change the in-app light/dark hierarchy or primary cobalt actions.
- Fixture theme round-trip lane: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1275.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Dark trust-guidance hierarchy pass — 2026-09-18

- The dark-mode `AI는 소비기한을 확정하지 않아요` card now uses a neutral raised surface instead of a full coral warning surface. Coral remains on the information icon, preserving the safety cue without making a non-error explanation look like a failed operation.
- Heading and supporting copy now share the dark theme's readable ink/muted tokens, keeping the message discoverable below the primary meal/add actions while reducing competing urgency.
- Native dark home readback: visible and in safe-area bounds; fixture theme lane: `1 passed`; `git diff --check`: passed.

## Meal-safety summary handoff pass — 2026-09-18

- Selecting `조리 전 확인 N건 안내 보기` now scrolls the meal sheet to the safety summary and transfers focus to the first available concrete action, such as `식품 확인 · 시금치`. If a summary has no action button, the summary section itself is focusable as the reading target.
- This keeps the visual scroll and keyboard/assistive-technology context on the same step; the entry button no longer remains focused while the actual guidance is below the viewport.
- Fixture recipe lane: `1 passed`; native meal viewport lane: `1 passed`; live native readback focused `식품 확인 · 시금치` after the handoff.

## Saved-meal next-step messaging pass — 2026-09-18

- Saving a single meal no longer repeats the same success sentence in both the transient toast and the persistent in-sheet status card. The toast now says `식단 저장 완료 · 사용량을 확인해 주세요`, while the sheet keeps `오늘의 식단에 저장했어요.` as the durable result.
- The message matches the existing post-save focus handoff to the safety acknowledgement and usage controls, making the next action explicit without changing the save contract or multi-day save copy.
- Fixture recipe/save/completion lane: `1 passed`; connected planner save/recipe lane: `2 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1275.4KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Meal-completion home return pass — 2026-09-18

- Native completion readback confirms the result message, inventory summary, remaining priority queue, and focus restoration describe the same outcome: toast `식단을 완료하고 재고를 갱신했어요`, `보관 중` count `7 → 5`, remaining priority foods rendered, and focus returned to the first remaining priority card.
- The accessibility snapshot can briefly report the document root during the sheet-close animation; a DOM active-element readback after the handoff confirms the authoritative target is the first remaining `.priority-card` (`닭가슴살`). This is a timing observation, not a product-flow defect.
- Native live readback: completed state visible; existing fixture completion lane: `1 passed`; `git diff --check`: passed.

## Shopping-entry first-action handoff pass — 2026-09-18

- Meal-plan shopping entry now focuses the first shopping item after both an initial successful list load and a successful `장보기 목록에 추가` mutation. Previously the focus handoff was only guaranteed on the retry path, leaving a successful first load anchored on the trigger button.
- The existing retry, checked-item, delete, manual-add, and Home shopping-card contracts remain unchanged; the first actionable item is now the consistent entry point across success and recovery paths.
- Connected missing-ingredient shopping lane: `1 passed` with an explicit success-path focus assertion; connected Home shopping lane: `1 passed`; `git diff --check`: passed.

## Shopping-receive detail handoff readback — 2026-09-18

- The existing receive flow remains aligned after the shopping-entry change: confirmed storage and quantity are submitted, the planned source is cleared, `방금 반영한 식품을 확인해요` is exposed, and focus moves to `식품 상세 확인`.
- Opening that detail uses the date-review entry action first; after the user confirms a printed date, the sheet closes and focus returns to the updated inventory row.
- Connected receive lane: `1 passed`; `git diff --check`: passed.

## Notification mark-all completion focus pass — 2026-09-18

- Marking all notifications read now moves focus to the `알림 요약` summary after the unread list becomes `알림 기록`. The completion message `모든 알림을 확인했어요` is therefore the first readback target instead of leaving focus on the removed `모두 읽음` button or the sheet root. Individual notification reads explicitly clear this intent so exact-row return focus is not disturbed.
- Re-entering an all-read notification center after dismissal also starts on the same `알림 요약`, so the empty/unread-complete state has a stable first reading target rather than defaulting to the close control.
- Existing individual notification → food detail → exact notification row return and cross-device refresh contracts remain unchanged.
- Fixture mark-all lane: `1 passed`; connected individual notification return lanes: `2 passed`; native live readback focused `알림 요약`; `git diff --check`: passed.

## Notification storage-convergence regression pass — 2026-09-18

- The storage-mismatch path still converges when notification read persistence is in flight: the user can open the food detail, change storage, refresh the dashboard, release the read request, and return to an empty/updated notification center without the mark-all summary focus stealing the detail return context.
- Connected storage mutation + notification readback race lane: `1 passed`.

## Notification focus full regression readback — 2026-09-18

- After separating mark-all focus intent from individual notification reads and adding all-read re-entry summary focus, the full fixture/mobile lane remains green: `59 passed, 3 skipped`; native lane: `32 passed`.
- Production build: `763` Vite modules; bundle budget: `17` JS chunks, `1275.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Password-recovery first-field focus pass — 2026-09-18

- Opening the inline `비밀번호 재설정 요청` panel now transfers focus directly to `계정 이메일`, so the first action is immediately available instead of leaving focus on the login tab.
- The handoff waits for the panel and sheet focus scope to settle, preserves the existing recovery copy and submit contract, and intentionally does not auto-open a reset-link password field.
- Fixture password-recovery entry lane: `1 passed`; connected password-reset/guest-transfer lanes: `2 passed`; native live readback focused `계정 이메일`; `git diff --check`: passed.

## Account-auth completion return pass — 2026-09-18

- Guest transfer success now has an explicit connected assertion that the sheet closes with the success result message and focus returns to the Home `connection-pill`, the same entry point used to open account settings.
- This keeps account completion from leaving keyboard/assistive-technology users at the dismissed sheet boundary while dashboard synchronization continues.
- Connected guest transfer lane: `1 passed`; `git diff --check`: passed.

## Account-login error retry focus pass — 2026-09-18

- Login failures now preserve the entered email/password values and return focus to the password field, the most likely correction target for a generic credential error. A registration conflict can instead target the email field.
- The connection state remains `서버 연결됨`; the error does not silently switch the user back to a guest workspace or discard the form.
- Connected login failure lane: `1 passed`; `git diff --check`: passed.

## Account-login error semantics pass — 2026-09-18

- Generic credential errors now connect the visible alert to both credential inputs with `aria-describedby="account-auth-error"` and expose `aria-invalid="true"`; registration email conflicts target the email field specifically.
- The semantic error connection follows the same correction focus used visually, so the next action and assistive-technology announcement no longer diverge.
- Connected login failure lane with semantic assertions: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1277.2KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Account-boundary copy density pass — 2026-09-18

- The account sheet's bottom guest boundary is now shorter customer language: `게스트 기록은 지금 그대로 남아요. 계정에 연결해도 자동으로 합치지 않아요.`
- The hero still explains cross-device continuation and the bottom note now reinforces data separation without repeating the former technical “기록 공간” phrasing; native dark readback remains legible.
- Fixture account lane: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1277.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Workspace-switch presentation boundary pass — 2026-09-18

- Account authentication transitions now clear the previous workspace's food, storage, search, notification, shopping, receipt, and detail presentation before starting the new dashboard read. While the new workspace is pending, Home shows `서버 확인 중`, `재고 확인 중`, and `내 식품 목록 확인 필요` instead of temporarily displaying the previous workspace's inventory.
- The same presentation reset is used for sign-out and account deletion transitions, preserving the explicit guest/account separation boundary.
- Connected delayed-dashboard account lane: `1 passed`; connected account-dashboard failure/reconnect lane: `1 passed`; connected reconnect recovery lane: `1 passed`; production build pending after this source change; `git diff --check`: passed.

## Workspace-boundary full regression readback — 2026-09-18

- After the presentation reset and account transition recovery contracts, fixture/mobile full lane is `60 passed, 3 skipped`; native full lane is `32 passed`.
- The additional fixture coverage includes account password-recovery entry focus and current account-flow semantics; build/runtime/bundle checks remain green from the latest source build.

## Empty-workspace first-food readback — 2026-09-18

- Connected empty-workspace flow still exposes `첫 식품을 추가하고 시작하기`, keeps the empty planner's `식품 추가하기` escape hatch, and returns to the Home destination after dismissal.
- Connected manual-food retry flow still preserves the idempotency key and focuses the newly added inventory row after the authoritative write.
- Connected empty-workspace/manual-food lanes: `2 passed`.
- Additional first-save queue promotion lane: `1 passed`; the new 식품 row is focused, the Home inventory count becomes `1`, and `확인하고 오늘 식단 만들기` becomes available.
- Empty connected status-card entry now also routes directly to `영수증으로 추가` and explains that the first food creates the Rescue Queue priority.
- Its accessible name now uses `식품 추가` rather than duplicating the separate `식품 추가하기` CTA label, avoiding ambiguous screen-reader/automation targets while keeping the visible action copy unchanged.
- First-food save also triggers authoritative refresh reads for notifications, shopping, and receipt summaries; the new row/focus and all three downstream reads are covered by the connected first-save lane.

## Empty-status selector regression pass — 2026-09-18

- Full connected suite surfaced two selector ambiguities caused by the new empty status-card name; the name was narrowed to the visible action semantics and custom-storage/manual/receipt lanes were re-run successfully: `2 passed`.

## Latest full connected source readback — 2026-09-18

- Current connected browser/API source passes the complete suite: `127 passed`, including empty-workspace first-food promotion, workspace-boundary reset/reconnect, login/password recovery, notification convergence, planner retry, shopping receive, receipt/label review, custom storage, and recipe-review flows.
- The full run includes the empty status-card accessible-name correction and the planner save-retry double-frame focus handoff; no connected lane remains failed.

## Latest four-lane regression readback — 2026-09-18

- Current source passes fixture/mobile `60 passed, 3 skipped`, native `32 passed`, and connected browser/API `127 passed` after the empty status-card selector correction.
- This is the current authoritative regression baseline for the accumulated mobile-first UX, workspace-boundary, account, notification, shopping, and receipt changes.

## Mobile dark readback and navigation-intent jitter pass — 2026-09-18

- Live native mobile readback at `http://127.0.0.1:4176/` shows the selected dark surface with the intended first-fold order: `오늘도, 남은 재료부터` → `확인하고 오늘 식단 만들기` → `식품 추가`, followed by the trust note and fixed `홈·식품·식단` navigation. The bottom navigation remains outside the scroll content and inside the safe-area boundary.
- The empty connected status card now exposes one actionable hint, `첫 식품을 추가하면 우선순위를 만들어요`, and its card-level action opens `영수증으로 추가`. This keeps the first-run state from presenting three misleading zero-valued categories while preserving the separate `첫 식품을 추가하고 시작하기` CTA.
- A full connected run exposed one intermittent account-session regression where a late mobile scroll update changed the selected `식품` tab back to `홈` after the sheet closed. The cause was the 1px reverse-scroll threshold treating `scrollIntoView` settling noise as a user-abandoned navigation intent. The observer now tolerates an 8–16px mobile settling delta and only clears the intent after a meaningful reverse scroll.
- Post-fix account-session lane: `3 passed` with `--repeat-each=3`; native viewport/theme lane: `3 passed`; connected empty-status lane: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1278.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile reading-density pass — 2026-09-18

- Live native inspection measured the queue's supporting text at `7px` and the hero description at `9px`, which made provenance, quantity, and the first product explanation harder to read than the selected KakaoPay-like information hierarchy intended.
- The compact mobile composition now uses `8px` queue metadata and `10px` hero support copy (`9px` on the 320px fallback) without increasing the card heights or moving the primary meal/add actions below the fixed navigation. The text remains single-line/ellipsized where the row contract requires it.
- Fixture/mobile full lane after the type adjustment: `60 passed, 3 skipped`; native full lane: `32 passed`; web surface lane: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1278.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed. The connected logic baseline remains `127 passed` from the immediately preceding source readback; this pass changes CSS only.

## Meal-safety message hierarchy pass — 2026-09-18

- The meal sheet's safety entry now acts as a compact count-and-entry point: `먼저 확인할 안내 · N건 · 사용 전에 확인해 주세요`. The expanded section owns the explanation, `확인할 내용 · 포장지·보관 상태·알레르기 정보를 먼저 읽어 주세요.`, so the same warning is not repeated verbatim above and below the recipe.
- The button accessible name now matches the visual entry copy (`먼저 확인할 안내 N건 보기`), and the expanded region exposes the same context as `사용 전 확인 안내 N건`. Individual date, missing-ingredient, and allergy callouts remain unchanged, as do the safety-summary scroll and focus handoffs.
- Fixture recipe lane: `1 passed`; native meal viewport and large-text safety lane: `2 passed`; connected missing-ingredient and date-review lanes: `2 passed`; full connected suite after the copy and AX-name changes: `127 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1278.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail safety copy layout pass — 2026-09-18

- The compact printed-date recheck card had a layout-specific duplication defect: when the right-side `포장지에서 날짜 다시 확인` action was present, the copy span was no longer the last child and its grid rule stopped applying. The heading and explanation then rendered together as `필요해요표시` on narrow dark mobile screens.
- The copy container now stays a two-row grid regardless of the optional recheck action. The title, explanation, and calendar action remain visually distinct, while focus still lands on `포장지에서 날짜 다시 확인`.
- Fixture detail layout lane: `1 passed` with computed display/row separation assertion; native detail action/safe-area lanes: `2 passed`; live native readback confirmed the corrected spacing; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1278.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail evidence-note density pass — 2026-09-18

- Printed-date review details no longer repeat the derived note `포장지에서 유효년월일을 확인했어요.` below the date proof card and the safety warning. The proof card remains the single source fact (`표시 소비기한 · 포장지 표시`), and the warning remains the single pre-use action message.
- The suppression is limited to printed-date evidence notes while a date review is active; user-confirmed reminders, AI priority explanations, storage notes, and other meaningful food notes remain visible.
- Fixture printed-date detail lane: `1 passed`; connected printed-date and packaging-date lanes: `2 passed`; native live readback shows the shortened detail sheet; full connected suite after the note suppression: `127 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1278.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail source hierarchy pass — 2026-09-18

- Purchase and product provenance cards are now grouped under `참고 출처`, with the shared context `날짜·안전 판정을 대신하지 않는 기록`. This makes the date proof card the primary fact, the safety callout the primary action, and purchase/product provenance secondary reference material.
- The group is rendered only when at least one purchase or product source exists. Within it, user purchase evidence remains before service product-candidate information; existing provenance edit/remove actions and mismatch messaging remain intact.
- Connected product-provenance removal/readback lane: `1 passed`; full connected suite after the source-group wrapper: `127 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1278.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail history disclosure pass — 2026-09-18

- The three long-form history surfaces (`최근 기록`, 상품 정보 변경, 상품 정보 수정) are now behind a native `기록·출처 이력` disclosure, collapsed by default. The current food's date proof, safety warning, actions, storage, and opened state remain immediately visible.
- Opening the disclosure preserves the existing lazy history components and their event labels; the collapsed state prevents audit details from pushing the primary consume/storage actions below the first useful viewport.
- Connected product-provenance detail lane with collapsed-state assertion: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1279.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail history readability pass — 2026-09-18

- Expanded history rows no longer force long audit details into a single ellipsized line. Product-name changes, provenance replacement reasons, and storage transitions can wrap naturally with a readable `1.35` line-height; the history disclosure remains collapsed by default, so first-viewport density is unchanged.
- The change is scoped to `.history-row small`, leaving inventory rows and primary detail actions untouched.
- Production build: `763` Vite modules; bundle budget: `17` JS chunks, `1279.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-history semantic icon and time pass — 2026-09-18

- Storage history rows now distinguish moved/opened, consumed, discarded, and frozen/thawed events with semantic icons and theme-token colors instead of using the same check icon for every event.
- Product provenance history distinguishes applied/replaced/removed states; product-info edits use the pencil treatment. Event descriptions and timestamps are separate rows with native `time` elements, so the expanded disclosure reads as `what changed → when` rather than one compressed sentence.
- Connected provenance disclosure/open lane: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1283.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-history latest-state and date readability pass — 2026-09-18

- All history surfaces now sort by `occurred_at` descending before limiting to four rows, so API ordering differences cannot make an older record look current.
- Headers explicitly expose `최신순 · N건`; the first row receives a subtle cobalt inset highlight without changing layout height.
- Event descriptions and timestamps remain separate, with the date/time exposed through native `time` elements. The expanded disclosure therefore reads latest state first and historical context second.
- Connected provenance disclosure lane: `1 passed`; production build: `763` Vite modules; bundle budget: `17` JS chunks, `1284.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-history date grouping pass — 2026-09-18

- History rows are now grouped under `오늘`, `어제`, or a localized month/day header after newest-first sorting. Each group shows its own count, while the first visible event remains highlighted as the latest state.
- The shared `historyDates.ts` helper keeps date grouping, local-day comparison, timestamp sorting, and time formatting consistent across storage, product provenance, and product-info history.
- Connected disclosure lane: `1 passed`; production build: `764` Vite modules; bundle budget: `18` JS chunks, `1285.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-history date-group contrast pass — 2026-09-18

- Date group headers now use a compact separator line and per-group count, so `오늘`, `어제`, and older date groups do not visually merge when the disclosure contains multiple days.
- The latest event remains the only highlighted row; older groups retain their semantic event colors without competing with the current-state emphasis.
- Connected disclosure lane: `1 passed`; production build: `764` Vite modules; bundle budget: `18` JS chunks, `1285.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification severity contrast pass — 2026-09-18

- Unread notification icons and metadata now use the semantic severity tone: urgent coral, attention amber, and informational blue. The list no longer presents every unread item as the same cobalt priority.
- The existing unread dot, read-all flow, exact-row return focus, and safety footer remain unchanged; color adds a scan cue without replacing the textual severity label.
- Live native notification readback shows urgent `지금 확인` in coral and attention `확인 필요` in amber; production build: `764` Vite modules; bundle budget: `18` JS chunks, `1286.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification completion-state pass — 2026-09-18

- After `모두 읽음`, the notification summary now changes from a bell/count state to a check/completion state: `모든 알림을 확인했어요` with `확인 완료` badge and a calm tinted surface.
- The completed summary keeps the existing focus handoff and re-entry focus contract; this is a visual/state-language refinement only.
- Notification fixture unread/read-history lanes: `2 passed`; production build: `764` Vite modules; bundle budget: `18` JS chunks, `1286.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification read-state grouping pass — 2026-09-18

- When unread and read items coexist, the notification list now separates them into `확인할 알림` and `확인한 알림` groups with per-group counts. All-unread and all-read states stay compact without redundant headers.
- The existing severity colors, stable priority ordering, exact-row return focus, and read-all completion summary remain unchanged.
- Notification fixture unread/read-history lane: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1287.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification priority-order pass — 2026-09-18

- Notification rows now use a deterministic client ordering contract: unread first, then urgent → attention → info, then newest creation time. Read history stays newest-first without severity reordering.
- Exact notification-id return focus and read-all completion behavior remain independent of list position.
- Notification ordering unit lane: `2 passed`; fixture unread/read-history lane: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1286.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-history disclosure state pass — 2026-09-18

- The native history disclosure now changes its affordance from `필요할 때 보기` to `접기` when open.
- History components are mounted only after the disclosure opens, so initial detail entry does not start unnecessary history requests or spend viewport space on audit content.
- Connected disclosure state lane: `1 passed`; production build: `764` Vite modules; bundle budget: `18` JS chunks, `1285.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## History calendar-boundary regression pass — 2026-09-18

- `오늘·어제` classification now compares local calendar dates instead of subtracting a fixed 24-hour duration, avoiding date-label drift across timezone/DST boundaries.
- Shared history sorting/grouping/time helpers now have direct Node coverage for today, yesterday, older dates, stable within-day order, and invalid timestamps.
- History-date unit lane: `3 passed`; production build: `764` Vite modules; bundle budget: `18` JS chunks, `1285.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification ordering concurrency readback — 2026-09-18

- The new unread/severity/newest ordering was read back across six connected lanes: read persistence retry, date reminder → food detail, queued notification refresh, storage mutation convergence, cross-device revision refresh, and mark-all in-flight refresh.
- All six lanes passed; exact notification-id return focus and completion-summary focus remain stable despite list reordering and deferred refreshes.
- Connected notification concurrency lane: `6 passed`; build/runtime/bundle checks remain green from the ordering pass.

## Notification group-convergence readback — 2026-09-18

- Mixed unread/read group boundaries remain stable while mark-all is pending, while another device revises notifications, and while a notification opens a food detail.
- Readback covers retry, exact-row return, storage mutation convergence, queued refresh, cross-device revision, and mark-all deferral: `6 passed`.

## Connected long-suite variance audit — 2026-09-18

- One latest 127-test connected run ended `122 passed, 5 failed`; the two detail-history failures were caused by the intentional collapsed-history UX and were fixed by opening `기록·출처 이력` before asserting history contents.
- The remaining three unrelated Grocy/recipe-review/account-transfer failures all passed when rerun individually, so no deterministic product failure was reproduced. Keep the full connected suite as an explicit pre-release gate rather than treating the isolated reruns as a replacement.

## Connected isolated-port full baseline — 2026-09-18

- Full connected suite rerun with dedicated API/Web ports (`8002/4180`) passed `127/127` after the collapsed-history assertion updates and notification return/group refinements.
- This confirms the current accumulated source baseline is green; the earlier fixed-port `122/127` result is retained as an environment-variance observation, not a product regression verdict.

## Shared focus-and-scroll helper pass — 2026-09-18

- Added `revealAndFocus` to the mobile scroll utilities so key handoffs share the same reduced-motion behavior, scroll block, and `preventScroll` focus semantics.
- Applied it to notification return focus, meal safety-summary actions, and food-detail safety targets; existing surface-specific blocks remain configurable where they intentionally differ.
- Native meal/detail lanes: `3 passed`; connected notification return lane: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1288.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Latest isolated-port connected baseline — 2026-09-18

- Dedicated API/Web port full run (`8002/4180`) passes `130/130`, including the new registration conflict, password-reset request failure, expired reset-link, invalid-state contrast, disclosure, notification ordering, and return-highlight contracts.
- This is the current connected baseline after the accumulated mobile-first UX and account/error hierarchy work.

## Notification return-highlight pass — 2026-09-18

- After opening a notification-linked food detail and returning, the exact notification row receives a short cobalt inset highlight in addition to focus. This gives visual confirmation of the restored task context without changing unread/read semantics.
- The highlight is id-based, survives remote title/message refreshes, and expires after `1.6s`; fallback focus behavior remains unchanged if the row is removed.
- Queued notification return lane: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1287.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification long-title readability pass — 2026-09-18

- Notification titles now allow up to two lines on narrow mobile rows instead of a single-line ellipsis, so the 식품 name and action context remain readable after severity metadata and return highlight are applied.
- Metadata remains on its own line and severity-colored; primary row height stays bounded by the two-line clamp.
- Fixture notification title/metadata lane: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1288.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification return-highlight visual readback — 2026-09-18

- Live native flow confirmed notification → food detail → close returns focus to the exact row and exposes `data-notification-returned="true"` for the timed visual state.
- The returned row now uses a low-opacity cobalt surface tint plus inset outline so all-read history still has a clear return marker without overpowering urgent severity colors.

## Notification group DOM contract pass — 2026-09-18

- Fixture coverage now explicitly verifies that mixed state exposes both `확인할 알림` and `확인한 알림`, while the all-read completion state removes both group headers and stays compact.
- Notification fixture mixed/all-read lane: `2 passed`.

## Account-entry copy hierarchy pass — 2026-09-18

- The account hero now owns only the cross-device benefit: `계정에 로그인하면 다른 기기에서도 이어가요.`
- The bottom account note remains the single guest/account boundary message: `게스트 기록은 지금 그대로 남아요. 계정에 연결해도 자동으로 합치지 않아요.`
- This removes repeated boundary copy while preserving login/register, password recovery, and guest separation semantics.
- Fixture account/password-recovery lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1287.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account-registration conflict short-viewport pass — 2026-09-18

- Registration conflict coverage now runs at `320x740` and confirms the email/password values are preserved, focus returns to the email field, the duplicate-email alert is semantically linked, and the `계정 만들기` CTA remains above the safe boundary.
- Connected registration conflict lane: `1 passed`.

## Password-recovery error short-viewport pass — 2026-09-18

- Password reset request failure at `320x740` preserves the email, returns focus to the email field, and keeps `재설정 안내 요청` above the safe boundary.
- Expired reset link at `320x740` returns focus to `새 비밀번호`, keeps the link-expired alert visible, and leaves `새 비밀번호 저장` reachable.
- Connected recovery-error lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1288.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Password-recovery error semantics pass — 2026-09-18

- Recovery request errors now connect the visible alert to the email input with `aria-invalid` and `aria-describedby` while focus returns to that email field.
- Expired reset-link errors connect the alert to both new-password fields and return focus to the first correction field, preserving the short-viewport CTA bounds.
- Connected recovery-error lanes with semantic assertions: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1288.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account-auth dark-state visual readback — 2026-09-18

- Live native dark readback shows the invalid password border/ring in coral, the error card in a softer coral surface, and the cobalt login CTA still readable as the primary action.
- Focus remains on the correction field while the account hero, recovery CTA, and guest-boundary note retain their hierarchy.

## Account-auth invalid-state contrast pass — 2026-09-18

- Account email/password fields now show coral invalid border and focus ring when `aria-invalid=true`, matching the account error alert in dark and light themes.
- The correction target remains distinct: credentials errors point to password, duplicate registration email errors point to email, and recovery errors point to the relevant recovery field.
- Login and registration short-viewport lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1288.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account-auth error short-viewport contract pass — 2026-09-18

- Connected login failure coverage now runs at `320x740` and confirms the generic credential error preserves both input values, returns focus to the password, keeps `aria-invalid`/`aria-describedby`, and leaves the login CTA above the mobile viewport safe boundary.
- Account auth error lane: `1 passed`.

## Account-entry short-viewport readback — 2026-09-18

- The account login primary action remains in the first usable native sheet viewport at `320x740`, `393x720`, and `393x852`.
- The 393px guest account action also remains above the iPhone home indicator with the 44px touch target intact.
- Native account viewport lanes: `2 passed`.

## Grocy dead-letter recovery short-viewport pass — 2026-09-18

- When the account's `상세 연결 설정` opens with a failed external inventory task, the panel now reveals the `재확인이 필요한 실패 작업` block immediately instead of leaving the recovery action below the first mobile viewport.
- The 320x740 connected fixture confirms the retry action remains above the mobile safe boundary, sends the same explicit operator note, and updates the queue from `실패 1건` to `1건 처리 대기` after success.
- Related Grocy account lanes (location/product mapping, dead-letter retry, stale in-flight decision): `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1289.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Latest isolated-port connected baseline — 2026-09-18

- Full connected suite on dedicated API/Web ports (`8003/4183`) passes `130/130` on the latest source, including the Grocy short-viewport recovery change.
- The run covers planner, receipt intake, food detail/date evidence, shopping, notifications, account/auth recovery, guest transfer, recipe review, custom storage, and connected mutation recovery lanes.
- Fixture-only render-error console output remains expected in its dedicated recovery test; no test failed and no product error was inferred from that intentional fixture.

## Native mobile viewport regression pass — 2026-09-18

- Native viewport subset covering the 320px home, short-screen CTA, account entry, pantry search, bottom-sheet sizing, camera recovery, major sheets, guest account, and food-detail safe area passes `9/9`.

## Printed-date recovery CTA mobile clarity pass — 2026-09-18

- The compact printed-date warning action now exposes the visible label `날짜 다시 확인` beside the calendar icon; the full accessible name remains `포장지에서 날짜 다시 확인`.
- The CTA keeps a 44px minimum touch target and stays in the warning card's right action column, so the user can understand the next action without relying on an icon-only control.
- Native dark readback confirmed the label is visible in the 320px detail sheet; fixture detail flow: `1 passed`; connected printed-date/packaging-date/direct-recheck lanes: `3 passed`; native detail/sheet viewport lanes: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1289.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail save-state messaging pass — 2026-09-19

- The unchanged detail state no longer presents a disabled `변경 후 저장` action with an arrow. It now reads `변경 없음`, while the enabled state retains `변경 저장` and its forward affordance.
- A nearby hint now names the exact editable inputs: `보관 위치·개봉 상태·수량을 바꾸면 저장할 수 있어요.` Single-quantity foods use the shorter storage/opened-state copy, so the message does not promise a control that is not present.
- Native dark readback confirmed the disabled button's accessible help and the visible hint; detail-save/theme/date/consume/partial-mutation fixture lanes: `12 passed`; native detail/sheet lanes: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1289.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Consume confirmation responsibility copy pass — 2026-09-19

- The date-warning consume confirmation now labels the primary action `확인했어요 · 먹었어요 기록`, making the user's acknowledgement explicit before the mutation is sent.
- The supporting copy still states that Rescue Meal does not determine safety; the change clarifies responsibility without turning the product into a safety verdict or adding a false approval state.
- Native dark readback confirmed the wider CTA fits the 320px sheet and the focus remains on `돌아가기`; date-warning fixture lane: `1 passed`; native detail lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1289.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Post-consume next-action cue pass — 2026-09-19

- Home-originated consume completion now connects the mutation result to the next task: `시금치를 먹은 기록으로 남겼어요 · 다음: 국산콩 두부`.
- The same transition updates the home summary and returns focus to the next priority card; the live dark readback showed `우선 확인 필요 0`, the remaining priority count, and focus on `국산콩 두부` together.
- Inventory-originated detail keeps its existing concise toast so pantry context is not mixed with the home queue; home date-warning and inventory consume lanes: `2 passed`; connected consume recovery lane: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1290.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Priority card action-state clarity pass — 2026-09-19

- Priority cards now use the same action vocabulary as the summary legend: `확인 필요` for a date/storage review and `먼저 사용` for a normal priority item.
- The right-side action label is visually differentiated with coral for review-required cards and amber for use-next cards, matching the summary legend, while the date source remains visible in the card body.
- Live native dark readback shows the three cards as `확인 필요`, `먼저 사용`, `먼저 사용`; the home/detail fixture lane: `1 passed`; native short-home lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1290.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Priority-to-detail review focus contract — 2026-09-19

- A `확인 필요` priority card now has an explicit native viewport contract: opening 시금치 shows the date warning and places focus on the visible `날짜 다시 확인` action.
- Native review/detail focus lane: `1 passed`; the broader native short-home/detail subset remains `2 passed`.

## Priority-to-detail action focus split — 2026-09-19

- Home-originated `먼저 사용` cards now enter the detail sheet with focus on `먹었어요`; date-entry remains visible as a secondary confirmation/edit action.
- Inventory-originated, notification-originated, and review-required detail entries keep their existing focus contracts, so the new direct-consume focus does not skip a required date review.
- Native review/use-next focus lanes: `2 passed`; prototype detail regression lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1290.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal CTA review-first messaging pass — 2026-09-19

- When the home queue contains a review-required priority food, the meal CTA helper now says `확인이 필요한 식품 1개를 먼저 읽고 오늘 식단을 만들어요.` instead of suggesting that every queued item can be used immediately.
- The meal sheet keeps the first focus on `먼저 확인할 안내 2건 보기`, and its expanded summary continues to separate date review from allergy information before the recipe action.
- Home detail/CTA fixture: `1 passed`; native meal-sheet safety-first lanes remain covered; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1290.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Consumption editor keyboard handoff pass — 2026-09-19

- After editing a saved meal's usage input, the completion area now scrolls above the simulated keyboard so `조리 전 확인했어요` and the final record action remain tappable.
- The acknowledgement button toggles on pointer-down as well as keyboard activation, preventing the input blur/keyboard transition from swallowing the mobile tap.
- Prototype saved-meal completion lane: `1 passed`; native completion viewport lane: `1 passed`.

## Meal completion quantity result pass — 2026-09-19

- Saved-meal usage now exposes a live quantity summary: the default state says `기본값은 재료 3개 전부 사용 · 실제 사용량으로 조정해 주세요.`, while a zeroed row reports `현재 2개 사용 · 1개는 재고에 남겨요.`.
- Completion results now report the mutation outcome as `조리 완료 · N개 재료를 차감했어요`; partial usage uses `조리 완료 · N개 재료를 사용했어요 · M개는 재고에 남겼어요` so a partially consumed lot is not mistaken for a removed row.
- Prototype completion lane and skipped-inventory readback: `2 passed`; connected planner save/partial-consumption/history lane: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1291.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Remaining priority state contract — 2026-09-19

- Priority cards now expose a stable `data-priority-state` contract: `needs-review` for `확인 필요`, `use-next` for `먼저 사용`.
- The action label title also explains the state on hover/assistive inspection: `날짜·보관 상태 확인이 필요해요` or `확인 후 먼저 사용해요`.
- Home fixture state contract: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1291.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Remaining quantity detail readback pass — 2026-09-19

- Food detail hero copy now labels inventory quantity as `남은 1팩` / `남은 1.5팩`, keeping partial-consumption results understandable after returning from a meal completion.
- The home/inventory row names remain unchanged for navigation and focus contracts; only the detail surface gets the explicit remaining-quantity context.
- Connected planner partial-consumption readback now reopens the remaining lot and confirms `남은 1.5팩`; detail fixture and native safe-area lanes: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1291.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Composite detail mutation summary pass — 2026-09-19

- When remaining quantity, storage location, and opened state are edited together, the detail section now names the exact save scope: `저장 필요 · 보관 위치 · 수량` (or the relevant subset).
- The existing `변경 저장` action remains the single mutation CTA, but the adjacent section status now explains what will be persisted before the user taps it.
- Detail save and partial-storage lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1291.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Composite storage failure recovery contract — 2026-09-19

- Connected persistence-failure lanes now confirm that the visible priority card restores the original `냉동` state after a failed storage mutation before the retry is invoked.
- The same lanes preserve the idempotency key and atomic move/open request shape; authoritative post-success dashboard readback remains covered by the separate storage readback lane rather than a mocked success response.
- Single-field failures keep the concise existing-state message; composite failures now say `보관 위치·개봉 상태 변경 전 상태를 유지했어요` so the rollback scope is explicit.
- Connected storage persistence failure + atomic move/open recovery: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1291.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Quantity-only action scope pass — 2026-09-19

- The detail quantity stepper is an event quantity for `먹었어요`/`폐기 기록`; changing it alone no longer enables a misleading `변경 저장` CTA that had no standalone server mutation behind it.
- Quantity-only detail state stays at `변경 없음`, shows `1팩 먹었어요` (or the selected amount), and explains that the amount applies to the consume/discard action. When storage or opened state also changes, the save scope still exposes `저장 필요 · 보관 위치 · 수량` and persists the combined storage event.
- Live dark mobile readback at `4176` confirmed the disabled save action, `1팩 먹었어요` primary action, and the quantity-specific hint inside the 320px-style detail sheet.
- Prototype quantity/save and partial-storage lanes: `2 passed`; native detail, focus, theme, and safe-area lanes: `8 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1291.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Delayed external-sync scope messaging pass — 2026-09-19

- A successful storage mutation with `queued`, `in_flight`, `dead_letter`, reconciliation, or mapping status now keeps the saved mutation visible and adds `변경 범위: 보관 위치·개봉 상태·수량` before the external-sync explanation.
- If the authoritative storage event succeeds but the dashboard readback is unavailable, the message now distinguishes `서버 저장은 완료됐지만 최신 목록은 아직 다시 읽지 못했어요` from the external inventory delay instead of implying that the saved change was lost.
- Single-field queued readback and composite move/open/partial-quantity recovery: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1292.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External-sync attention action pass — 2026-09-19

- `dead_letter`, reconciliation, and mapping-required storage results now keep the saved mutation scope visible and expose an `연동 상태 확인` toast action; invoking it opens the account surface where external inventory settings and failed work are managed.
- Plain `queued`/`in_flight` results remain informational and do not add a distracting action, preserving the lightweight success-to-waiting transition on mobile.
- Connected queued readback, attention action, persistence retry, and atomic composite recovery: `4 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1292.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Consume-discard-meal sync contract pass — 2026-09-19

- `먹었어요` and `폐기 기록` now expose `기록 범위: 전체 2팩` or the partial event quantity when external sync is deferred, while preserving the existing next-priority cue on Home-originated consume flows.
- Meal completion now uses the same server-save/readback distinction and can open `연동 상태 확인` when the completion response requires external product/location mapping.
- Connected consume/discard queued recovery: `5 passed` including storage readback and atomic recovery; connected planner completion with external mapping attention: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1292.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt-shopping sync and toast reachability pass — 2026-09-19

- Receipt commit now uses the shared external-sync/readback contract and exposes `연동 상태 확인` for mapping-required results; a normal `not_configured` commit remains the compact `N개 항목을 검토 후 반영했어요` success.
- Shopping receive now keeps the accepted quantity in delayed-readback messaging and offers `최신 재고 확인` when the server accepted the lot but the dashboard read failed.
- Toast actions are now placed in the mobile screen's fixed stacking layer above the sheet overlay; the action remains physically tappable while a bottom sheet is open instead of being visually present but pointer-blocked.
- Connected planner, shopping receive/readback, storage, consume/discard, and receipt commit lanes: `8 passed`; toast-action reachability with an open sheet: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1292.7KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Manual/date/product mutation readback pass — 2026-09-19

- Manual food creation, date confirmation, and product information save now use the same `서버 저장은 완료됐지만 최신 목록은 아직 다시 읽지 못했어요` distinction when authoritative mutation succeeds but dashboard readback fails.
- Those readback states expose `최신 목록 확인`; ordinary successful saves keep their previous compact success copy, and typed persistence failures continue to use their field-local retry/recovery UI.
- Connected product-info persistence recovery, date readback preservation/action, and manual-food idempotent retry: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1292.7KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Inline provenance/date recovery pass — 2026-09-19

- Product provenance removal now keeps the successful write inline in the detail source section and, when dashboard readback is stale, exposes `최신 목록 확인` there instead of requiring the user to recover from a disappearing toast.
- Date confirmation keeps its readback action on the saved result path; persistence failures continue to use the existing retry toast and authoritative state restoration.
- Connected provenance readback and date readback lanes: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1293.3KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Product-info editor inline readback pass — 2026-09-19

- Product name·brand·category save now keeps the editor open through `저장 중` and successful server write; when dashboard readback is stale, the editor context remains visible with the same `최신 목록 확인` action as date and provenance recovery.
- Typed product-info persistence failures still restore the original detail and expose the existing inline `다시 시도` action; the new success notice does not replace that failure contract.
- Connected product-info persistence/readback lane: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1294.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Manual-add follow-up action pass — 2026-09-19

- A newly added food with an unknown date now keeps the normal `식품 목록에 추가했어요` result and adds a focused `날짜·보관 확인` action; when a product provenance candidate is present, the action becomes `상품·날짜 확인`.
- The action opens the new food detail directly, routes it through the date-review focus contract, and uses the authoritative API item when connected; fixture mode falls back to the just-created local food while React state settles.
- Manual-add priority focus plus direct date-review follow-up and post-confirmation priority readback: `1 passed`.

## Provenance-first follow-up focus pass — 2026-09-19

- A home-priority food with a current product provenance candidate and no date/storage warning now enters detail with focus on `상품 출처 다시 확인`; date review still wins when a date or storage condition requires attention.
- This keeps the `상품·날짜 확인` CTA aligned with the next real decision instead of always opening the date editor first.
- Connected provenance-backed home focus lane, post-edit priority/source-history readback, actor/source detail, external-source notification return, direct external-inventory settings action, automatic dead-letter reveal, retry convergence, and reconciliation decision readback: `6 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1294.9KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification sync lifecycle read-model pass — 2026-09-19

- Grocy-backed notifications now expose an additive `sync_state`: `action_required`, `queued`, `processing`, or `applied`. The API includes current `pending`/`in_flight` work, keeps recently `succeeded` work visible as `반영 완료`, and expires successful notices after 24 hours; push delivery remains limited to action-required states.
- The mobile notification sheet now gives the lifecycle a compact three-part summary (`확인 필요` · `처리 대기` · `반영 완료`) and repeats the row-level state as a visible badge. Legacy/mock notification payloads without the field fall back to `확인 필요` for Grocy rows, so the existing read/return flow remains compatible.
- Notification read-model rules: `14 passed`; Grocy + notification backend slice: `31 passed`; connected notification UX: `14 passed`; full fixture/mobile runtime: `61 passed + 3 skipped`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1297.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.
- A full backend run still has four failures outside this pass in the existing custom-storage/auth guest-session contract (`test_api.py`); the changed notification/Grocy slices remain green, and the failure stacks do not enter this pass's notification read model.

## External sync history to food detail handoff — 2026-09-19

- Each recent succeeded outbox row now offers `식품 기록 보기` when its aggregate resolves to a local food lot. The action opens the existing FoodDetailSheet with the normal date/provenance/consume focus rules instead of creating a second detail surface.
- The return contract is now two-stage: closing FoodDetailSheet returns to the external inventory account panel; closing that panel returns to the originating notification row when the account was opened from a Grocy notification. If the lot is no longer in the current dashboard, the same `최신 재고 확인` recovery toast is used rather than opening stale detail.
- Connected stale in-flight reconciliation → completion history → food detail → account return: `1 passed`; external-sync notification → account → exact notification-row return: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1299.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail mutation to notification lifecycle readback — 2026-09-19

- A connected food-detail storage mutation now has an explicit lifecycle readback contract: the detail action returns `grocy_sync_status=queued`, the post-mutation notification list renders `처리 대기`, and a simulated external-worker workspace mutation refresh changes the same UX surface to `반영 완료`.
- This closes the reverse direction of the external-sync flow: the user does not need to infer provider progress from a one-time toast, and the notification center remains the durable status surface after the detail sheet closes.
- Connected detail mutation → queued notification → worker refresh → applied notification: `1 passed`; open FoodDetailSheet → remote worker mutation → refreshed linked sync history: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1309.3KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food history external-sync provenance readback — 2026-09-19

- FoodDetailSheet의 최근 기록은 이제 동일 storage event의 `grocy_sync_status`를 함께 표시합니다: `외부 반영 대기`, `외부 반영 완료`, `외부 연결 확인`, `반영 여부 확인`, `외부 반영 실패`, `로컬 기록`을 이벤트 타임라인 안에서 확인할 수 있습니다.
- 이로써 계정의 최근 outbox 완료 이력과 식품 상세의 소비·보관 이력이 같은 event producer를 기준으로 상태를 대조할 수 있고, 완료 토스트나 알림센터를 놓쳐도 상세 기록에서 반영 상태를 재확인할 수 있습니다.
- Connected storage-condition/history readback: `1 passed`; food-detail axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1300.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail sync evidence disclosure pass — 2026-09-19

- FoodDetailSheet의 외부 상태 요약은 이제 `외부 상태 근거 보기` disclosure로 source·시각·상태 note·transaction ID를 펼쳐 볼 수 있습니다. 계정의 외부 작업 상세와 같은 evidence vocabulary를 사용합니다.
- 이 disclosure는 storage event row 안에 머물러 소비·보관 기록을 떠나지 않으면서도 outbox의 전체 상태 변화를 확인하게 해, 알림·계정·식품 상세의 근거 표현을 통일합니다.
- Connected storage-condition evidence disclosure: `1 passed`; food-detail axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1307.5KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Storage event to outbox reference readback — 2026-09-19

- `StorageEventResponse` now carries the additive `grocy_outbox_id` and `grocy_transaction_id` references. Storage event creation, outbox processing, and reconciliation update the same durable event projection, so the detail timeline can identify the exact external work behind its status badge.
- Queued detail events expose the linked outbox reference before a provider transaction exists; successful consume/discard events expose the provider transaction ID after worker processing. Existing idempotency, aggregate sync status, and legacy persisted events remain compatible through nullable defaults.
- Grocy + notification backend slice: `31 passed`; consume/discard reference readback: `1 passed`; connected storage-condition/history readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1300.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Unified food and outbox chronology pass — 2026-09-19

- Storage events now carry a snapshot of the linked outbox `status_history`, and FoodDetailSheet renders it alongside the event's sync badge and transaction reference. The user can compare `식품 기록 → 외부 상태 변화 → 외부 작업 완료` without leaving the detail sheet.
- Legacy storage events without a linked outbox keep the existing compact record row; new queued/succeeded events expose the bounded status sequence from the same durable producer.
- Connected storage-condition/history readback: `1 passed`; Grocy + notification backend slice: `31 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1305.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External outbox detail disclosure pass — 2026-09-19

- Reconciliation-required and dead-letter outbox rows now expose a mobile-safe `외부 작업 상세` disclosure. It shows operation, quantity/unit, normalized lifecycle status, Rescue Meal task ID, provider transaction ID when available, reconciliation decision/note, and created/updated timestamps without exposing the raw provider payload.
- The disclosure preserves the existing operator controls and remains inside the AccountSheet return stack, so notification → account → task detail → reconciliation still returns through the established focus path.
- Connected stale in-flight reconciliation with outbox detail disclosure: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1302.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification to exact outbox detail focus pass — 2026-09-19

- Grocy notification responses now carry an additive `sync_record_id`, and opening a Grocy notification passes that ID into AccountSheet. The external inventory panel opens its settings block, expands the matching `외부 작업 상세`, scrolls it into view, and focuses the disclosure summary.
- This keeps `처리 대기`/`반영 완료` status, the notification row, and the exact outbox task detail on one continuous mobile path without exposing provider payload internals.
- Connected external-sync notification → exact outbox disclosure focus: `1 passed`; notification backend slice: `14 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1303.2KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Applied notification to completed outbox focus pass — 2026-09-19

- `반영 완료` Grocy notifications now carry `sync_record_id` into AccountSheet. The matching succeeded history row renders the same `외부 작업 상세` disclosure as reconciliation/dead-letter rows, so the notification can open the exact completed task rather than only the settings container.
- The existing account-to-notification return focus is preserved after the disclosure is inspected, keeping the completed notification row as the user’s navigation anchor.
- Connected applied notification → completed outbox disclosure → exact notification-row return: `1 passed`; notification backend slice: `14 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1303.2KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External outbox task timeline readback — 2026-09-19

- `외부 작업 상세` now presents one chronological task timeline: `식품 기록` → outbox status transitions → `외부 재고` transaction confirmation → `운영자 판정` when reconciliation has been recorded.
- The same integrated timeline is rendered for reconciliation/dead-letter rows and succeeded history rows. Applied notifications therefore land on a completed chronology, not only a status badge or generic settings panel.
- Connected applied notification → integrated task timeline → exact notification-row return: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1304.9KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Durable outbox status-history timeline pass — 2026-09-19

- `GrocyOutboxRecord` now keeps a bounded, backward-compatible `status_history` projection. Mapping refresh, worker transitions, stale reconciliation, operator decisions, and manual retries all append normalized status entries with source, timestamp, and safe note.
- The mobile `외부 작업 상세` disclosure renders the recent status transitions in reverse chronological order, so `작업 생성 → 처리 대기 → 반영 중 → 반영 완료` or failure/reconciliation branches can be understood without reading provider logs.
- Legacy outbox payloads without history remain readable through nullable/default reconstruction; the existing current-status, transaction, idempotency, and reconciliation contracts remain intact.
- Grocy + notification backend slice: `31 passed`; applied notification task timeline: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1305.3KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Status-transition evidence disclosure pass — 2026-09-19

- Timeline status entries are now individually expandable. Each transition can show its source, user/operator note, Rescue Meal task ID, and the provider transaction reference when that transition is the completion step.
- This keeps the default mobile view compact while allowing an operator to inspect the evidence for a single state change without opening raw payloads or leaving the current notification/account context.
- Connected applied notification → expanded `반영 완료` evidence: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1306.1KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Bidirectional sync evidence navigation pass — 2026-09-19

- FoodDetailSheet의 외부 상태 근거 disclosure에 `작업 상세 보기`와 `알림에서 보기`를 추가했습니다. 작업 상세는 AccountSheet의 정확한 outbox disclosure로, 알림 보기는 현재 `sync_record_id`와 일치하는 notification row로 이동합니다.
- 알림이 이미 만료된 경우에는 빈 알림 상태로 끝나지 않고 계정 작업 상세 fallback을 사용하도록 준비했고, 명시적 cross-sheet intent에는 settle 후 focus fallback을 추가해 실제 알림 row focus까지 보장했습니다.
- Connected storage-condition/history → notification row readback: `1 passed`; applied notification → outbox disclosure → FoodDetailSheet → AccountSheet → notification row return: `1 passed`; FoodHistory action visibility/readback: `1 passed`; FoodDetailSheet/AccountSheet emphasis handoff: `1 passed`; food-detail axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1309.7KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail cross-device sync-focus continuity pass — 2026-09-19

- When an open FoodDetailSheet receives a remote dashboard mutation, the detail history refresh key now re-reads storage events without closing the sheet or losing the linked outbox highlight.
- The same highlighted event changes from `외부 반영 대기` to `외부 반영 완료` and updates the transaction reference in place; the user stays on the same detail context.
- Connected open detail → remote worker mutation → linked sync history refresh: `1 passed`; applied notification → FoodDetailSheet emphasis → remote refresh continuity: `1 passed`; highlighted evidence disclosure open-state, manual close choice, and summary focus continuity: `1 passed`; food-detail axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1311.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External sync completion history and notification return pass — 2026-09-19

- The account's external inventory panel now renders the latest three succeeded outbox operations under `최근 반영 완료`, including food name, operation, quantity, completion time, and the external transaction ID when available. This closes the previous gap where `succeeded` existed in the read model but disappeared from the account surface.
- A Grocy notification now records an account-return intent before opening the external inventory settings. Closing that account sheet returns to the notification center, focuses the exact originating row, and keeps the read-state/return highlight contract intact.
- Connected stale-in-flight reconciliation + completion-history readback and external-sync notification + exact-row return: `2 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1298.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Status evidence focus continuity pass — 2026-09-19

- FoodDetailSheet의 `외부 상태 근거 보기` 항목을 키보드·보조기기 탐색 가능한 상태 근거 row로 확장했습니다. 사용자가 `외부 반영 완료`나 `외부 연결 확인` 같은 특정 전환을 확인한 뒤 원격 dashboard 갱신이 들어와도 같은 event와 status evidence로 focus가 복귀합니다.
- 기존 disclosure의 자동 펼침, 사용자가 직접 닫은 선택, summary focus 복귀는 유지했습니다. 따라서 상세 화면을 계속 읽는 사용자는 수동으로 닫은 근거가 다시 강제로 열리지 않고, 전환 항목을 직접 확인한 경우에만 해당 항목으로 돌아옵니다.
- Connected applied notification → FoodDetailSheet → remote history refresh → succeeded status evidence focus: `1 passed`; native 320px/light-dark/detail subset: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1312.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification priority cue pass — 2026-09-19

- 모바일 홈의 알림 점은 이제 읽지 않은 알림의 가장 높은 우선순위를 반영합니다. `urgent`가 남아 있으면 코랄, 일반 `attention`만 남아 있으면 앰버, 그 외 안내만 남아 있으면 블루로 표시해 숫자를 읽기 전에도 확인 순서를 구분할 수 있습니다.
- 알림 버튼의 accessible name에도 `먼저 확인할 알림 N개`를 포함해 시각 색상에 의존하지 않고 동일한 우선순위를 전달합니다. 알림을 열어 긴급 항목을 읽으면 점 색도 남은 알림 수준에 맞춰 즉시 낮아집니다.
- Prototype notification lifecycle: `2 passed`; home axe audit: `1 passed`; native 320px + light/dark detail subset: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1312.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification summary-to-action pass — 2026-09-19

- 알림 센터 상단의 외부 재고 상태 요약을 읽기 전용 숫자에서 상태별 바로가기 버튼으로 확장했습니다. `확인 필요`, `처리 대기`, `반영 완료`를 누르면 해당 상태의 첫 알림으로 스크롤하고 실제 row에 focus를 전달합니다.
- 처리 중(`processing`) 상태는 `처리 대기` 그룹으로 함께 이동하며, 숫자가 0인 그룹은 비활성화해 빈 결과로 이동하지 않습니다. 기존 알림 row 읽음 처리·알림 상세 진입·닫은 뒤 원래 row 복귀 계약은 유지합니다.
- Connected notification lifecycle summary → exact state row focus: `1 passed`; full connected notification subset: `16 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1312.9KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mapping-required notification focus pass — 2026-09-19

- `sync_record_id`가 `blocked` outbox를 가리키는 상품 연결 알림은 이제 계정의 `상세 연결 설정`을 열고 정확한 `외부 상품 번호` 입력 작업으로 이동합니다. 해당 작업 카드에 outbox ID와 접근 가능한 그룹 이름을 부여해 작업 단위의 focus 계약을 명확히 했습니다.
- 기존 dead-letter·reconciliation 상세 disclosure focus는 유지하고, 상세 disclosure가 없는 mapping task에는 첫 활성 입력 또는 작업 그룹 자체로 안전하게 복귀합니다. 확인 필요 작업이 상품 매핑만 남아 있어도 자동 스크롤 대상이 끊기지 않습니다.
- Connected mapping notification → exact product task input focus: `1 passed`; blocked mapping settings + location/product save regression: `2 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1313.4KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mapping sync completion readback pass — 2026-09-19

- 상품 연결 알림에서 매핑 입력을 저장한 뒤 `처리 대기` 상태와 `지금 동기화` 다음 행동을 보여주고, 수동 동기화 실행 후 같은 outbox 작업이 `반영 완료`로 갱신되는 전체 흐름을 연결했습니다.
- 완료 readback은 `최근 반영 완료` 이력, 외부 거래 번호, `외부 작업 상세` disclosure까지 같은 작업 ID를 유지합니다. 사용자는 저장 성공, 외부 처리 대기, 실제 반영 완료를 서로 다른 상태로 구분할 수 있습니다.
- Connected mapping notification → product mapping save → pending sync → manual process → succeeded history/transaction readback: `1 passed`; blocked mapping settings regression: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1313.8KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Sync-completion evidence focus pass — 2026-09-19

- 수동 `지금 동기화`가 성공하면 방금 처리된 outbox의 `외부 작업 상세` disclosure를 자동으로 펼치고 최상위 summary에 focus를 돌려, 완료 메시지와 상태 이력을 같은 시선 흐름으로 연결합니다.
- 성공한 작업은 `최근 반영 완료` 이력의 외부 거래 번호와 동일한 task ID를 공유하며, 기존 알림·식품 기록·작업 상세 간 evidence navigation 계약을 유지합니다.
- Connected pending sync → succeeded task disclosure open/focus: `1 passed`; blocked mapping settings regression: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1314.3KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping receive follow-up copy pass — 2026-09-19

- 구매 완료 후 표시하는 `식품 상세 확인` 안내를 실제 return contract와 맞춰 `식품 목록에서 포장지 날짜와 보관 상태를 이어서 확인해 주세요`로 구체화했습니다.
- 장보기 sheet → 구매 반영 → 식품 상세 → 날짜 확인 → 식품 목록 복귀 흐름은 기존 focus 계약을 유지하면서, 사용자가 다음 화면에서 해야 할 안전 확인을 메시지로 먼저 이해할 수 있게 했습니다.
- Connected shopping receive + confirmed custom storage flow: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1314.3KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-save missing-ingredient action focus pass — 2026-09-19

- 저장한 식단에 부족 재료가 있으면 저장 직후 사용량 입력보다 `장보기 목록에 추가` action을 먼저 focus하고 해당 안내 위치로 스크롤합니다. 저장 결과를 본 직후 다음 구매 준비로 이어지는 흐름을 짧게 만들었습니다.
- 부족 재료가 없는 일반 식단은 기존 completion 영역 전체 노출·사용량 확인 focus를 유지해, safety/completion geometry 계약을 바꾸지 않았습니다.
- Connected missing-ingredient planner → save → shopping action focus: `1 passed`; connected planner save/completion readback: `1 passed`; native meal completion subset: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1314.5KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mapping save-to-sync action pass — 2026-09-19

- 상품 매핑 저장이 성공했지만 외부 작업이 아직 `pending`이면 성공 문구를 단순 완료로 끝내지 않고 `외부 재고 N건이 처리 대기 중이에요`로 확장해 서버 저장과 외부 반영 상태를 분리해 보여줍니다.
- 저장 후 `지금 동기화` 버튼을 다시 찾지 않아도 해당 버튼으로 focus를 이동시켜, `상품 연결 → 처리 대기 → 지금 동기화`의 다음 행동을 바로 이어갈 수 있습니다. pending 작업이 없으면 기존의 짧은 성공 문구를 유지합니다.
- Connected mapping notification → product mapping save → pending sync copy/action focus: `1 passed`; blocked mapping settings regression: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1313.8KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-save focus refinement readback — 2026-09-19

- 현재 식단 저장 source 기준으로 부족 재료가 있는 경우 `장보기 목록에 추가` action을 저장 직후 focus하고, 부족 재료가 없는 경우에는 기존 completion 영역 전체를 보이는 상태로 유지하는 분기와 geometry를 재검증했습니다.
- Connected missing-ingredient save → shopping action focus: `1 passed`; connected planner save/completion readback: `1 passed`; native meal completion subset: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1314.5KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Multi-day meal save missing-ingredient focus pass — 2026-09-19

- 3일 식단 저장 후 어느 날짜든 부족 재료가 있으면 `3일 부족 재료 장보기` action을 자동 focus하고 해당 저장 결과 위치로 스크롤합니다. 부족 재료가 없는 3일 식단이나 저장 retry는 기존 focus 계약을 유지합니다.
- Connected multi-day save → missing-ingredient shopping action focus: `1 passed`; multi-day save retry and recipe-change regression: `2 passed`; native meal subset: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1315.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-save missing-ingredient messaging pass — 2026-09-19

- 부족 재료가 있는 식단 저장 결과는 toast와 saved card 모두 `부족 재료를 장보기에 추가해 주세요`라는 next-action 메시지를 보여주고, 일반 식단은 기존 `사용량을 확인해 주세요` 문구를 유지합니다.
- 저장 결과의 메시지·focus·장보기 action이 같은 상태 판단을 공유해, 사용자가 focus를 놓쳐도 저장 후 해야 할 일을 이해할 수 있습니다.
- Connected missing-ingredient save/readback: `1 passed`; connected normal planner save/readback: `1 passed`; native meal completion subset: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1315.3KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Multi-day meal-save messaging pass — 2026-09-19

- 부족 재료가 있는 3일 식단도 toast를 `3일 식단 저장 완료 · 부족 재료를 장보기에 추가해 주세요`로 맞추고, 저장 상태 card에는 `부족 재료를 장보기로 이어갈 수 있어요.`를 함께 표시합니다.
- 3일 식단 저장 결과의 메시지·focus·`3일 부족 재료 장보기` action이 같은 상태를 가리키며, 부족 재료가 없는 일반 3일 식단은 기존 `3일 식단을 저장했어요` 문구를 유지합니다.
- Connected multi-day missing-ingredient save/readback: `1 passed`; multi-day recipe-change regression: `1 passed`; native meal subset: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1315.6KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-save durable shopping action pass — 2026-09-19

- 부족 재료가 있는 단일·3일 식단 저장 toast에 `장보기 목록 보기` action을 추가해, 저장 sheet 내부의 inline action을 놓쳐도 toast에서 장보기 sheet로 바로 이동할 수 있게 했습니다.
- 일반 식단과 부족 재료가 없는 3일 식단에는 불필요한 toast action을 추가하지 않아, 상태에 따른 정보 노출 수준을 유지합니다.
- Connected missing-ingredient save → toast message/action → shopping flow: `1 passed`; connected normal planner save/readback: `1 passed`; native meal completion subset: `2 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1315.7KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External-sync status heading hierarchy pass — 2026-09-19

- AccountSheet의 외부 작업 요약 제목을 고정 `동기화 대기`에서 현재 상태 기반으로 분리했습니다: `확인할 동기화 작업`, `외부 반영 진행 중`, `최근 외부 반영 완료`, `동기화 대기 없음`.
- 기존 상세 숫자·실패 작업·재시도·작업 상세 disclosure는 유지하면서, 모바일에서 사용자가 제목만 먼저 읽어도 다음 행동의 성격을 판단할 수 있게 했습니다.
- Blocked mapping account regression: `1 passed`; account/notification axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1315.9KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Toast action sheet-focus guard pass — 2026-09-19

- toast action이 계정·식단·장보기·식품 상세 sheet를 여는 경우 배경 홈의 priority card나 connection pill로 focus를 빼앗지 않고, 새 sheet의 focus manager가 다음 행동을 소유하도록 보호했습니다.
- sheet가 열리지 않은 retry·복귀 action에서는 기존 background focus recovery를 유지해, toast action별 focus contract를 분리했습니다.
- Prototype intake toast focus: `2 passed`; connected missing-ingredient planner/toast flow: `1 passed`; connected manual-food idempotent retry: `1 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1316.0KB` JS, `259.9KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Web-shell dark-theme continuity pass — 2026-09-19

- theme token을 desktop web runtime의 outer shell까지 연결해, 다크모드 전환 시 `web-runtime-surface`와 app shell 주변 배경도 모바일 다크 팔레트의 `#101419`를 공유하도록 보정했습니다.
- phone preview/native의 기존 dark/light theme contract는 유지하면서 web surface에서만 남던 밝은 외곽 여백을 제거했습니다.
- Web surface simulator-free geometry/navigation: `1 passed`; web-shell dark background readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1316.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline cached-priority accessibility pass — 2026-09-19

- 오프라인 cached dashboard에서는 priority status card와 heading의 accessible name에도 `최근 동기화한` 상태를 포함해, 보조기기 사용자가 최신 재고가 아니라는 점을 동일하게 인지하도록 했습니다.
- 기존 stale cache callout·read-only detail·`다시 연결` recovery action은 유지하며, 상태 설명만 시각/비시각 경로에서 일치시켰습니다.
- Offline stale dashboard readback: `1 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connection-recovery action naming pass — 2026-09-19

- 초기 계정 연결 실패로 재고가 비어 있는 상태에서 priority card accessible name을 `재고를 확인할 수 없어요, 다시 연결`로 명확히 했습니다. checking 상태는 `재고를 확인하는 중`, auth-required 상태는 `계정 연결이 필요해요, 계정 다시 연결`로 분리됩니다.
- visible retry CTA와 보조기기 accessible name이 같은 recovery action을 가리키며, 기존 workspace 보호·재연결 후 빈 재고 readback은 유지합니다.
- Account connection failure recovery: `1 passed`; offline stale dashboard readback: `1 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline cached legend accessibility pass — 2026-09-19

- 오프라인 cached 상태의 priority legend에도 `최근 동기화한 재고 상태와 전체 보관 수` accessible label을 부여해, 개별 priority card뿐 아니라 요약 범례도 최신성 경계를 함께 전달합니다.
- 기존 stale callout·read-only detail·reconnect CTA는 유지하며, 시각/보조기기 정보 계층을 동일하게 맞췄습니다.
- Offline stale dashboard + cached legend readback: `1 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1316.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline cached priority-card cue pass — 2026-09-19

- 상단 offline alert가 스크롤 밖으로 사라진 뒤에도 priority card 자체에서 `최근 동기화 재고`를 보여주도록 해, cached 숫자를 최신 live 재고로 오해하지 않게 했습니다.
- priority card visible kicker·accessible name·legend label이 모두 같은 cached freshness 상태를 공유하고, 재연결 후에는 일반 `오늘 먼저 확인할 식품` 표시로 돌아갑니다.
- Offline stale dashboard + visible cached cue readback: `1 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1316.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Native accumulated regression readback — 2026-09-19

- 현재 native viewport 전체 회귀를 다시 실행해 `320px` 폭, short-height, keyboard, safe-area, large text, reduced motion, contrast, light/dark theme, receipt/camera, detail focus 계약을 함께 재확인했습니다.
- Full native viewport lane: `34 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed. 이 수치는 실제 iOS/Android device release acceptance를 대체하지 않지만, 현재 모바일 프론트 source/runtime regression은 모두 통과한 상태입니다.

## Mobile first-fold pantry boundary pass — 2026-09-19

- 393px 모바일 프리뷰에서 핵심 루프(`상태 요약 → 우선 식품 3건 → 오늘 식단 만들기 → 식품 추가 → 안전 안내`) 뒤에 남던 과한 pantry spacer를 `180px → 155px`로 줄였습니다. 하단 고정 메뉴와 safe-area를 침범하지 않으면서 다음 `내 식품 목록`이 첫 화면에 제목만 걸쳐 보이는 현상도 제거했습니다.
- Preview live readback은 393px 시안에서 첫 화면의 핵심 CTA·안전 안내·`홈·식품·식단` 메뉴를 그대로 유지하고, pantry는 다음 스크롤에서 시작하는 상태를 확인했습니다. 320px와 393px native geometry에는 pantry가 initial fold 아래에 있고 navigation 아래로 새지 않는 회귀 계약을 추가했습니다.
- Full native viewport lane: `35 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; connected browser/API lane: `140 passed`; web surface lane: `2 passed`; production build: `765` Vite modules; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile notification action-rail pass — 2026-09-19

- 393px 이상 모바일에서는 알림 진입을 히어로 오른쪽의 단독 버튼에서 계정·테마·스캔과 같은 상단 action rail로 이동해, 상태 확인과 알림 확인을 한 줄의 상위 탐색 구조로 맞췄습니다.
- 320px에서는 네 개의 44px 타깃이 한 줄에서 overflow하지 않도록 알림만 좁은 화면 fallback 위치로 분리하고, header stacking context를 명시해 보이는 버튼과 실제 pointer hit target이 어긋나지 않게 했습니다.
- Native notification placement/touch target/overflow: `3 passed`; fixture notification + axe/name subset: `5 passed`; full native viewport lane: `36 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1316.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Account recovery and navigation return pass — 2026-09-19

- 외부 재고 설정이 자동으로 열리는 dead-letter 상태에서는 섹션을 center 정렬한 뒤 첫 활성 `재시도` action을 다시 center 정렬해, 320px sheet에서 실제 recovery 버튼이 safe-area 밖으로 밀리지 않도록 했습니다.
- connected geometry 검증은 sheet entrance transform이 끝난 뒤 측정하도록 settle contract를 추가했고, dead-letter recovery와 expired-account `계정 → 식품 탭 복귀`를 각각 `--repeat-each=3`으로 확인했습니다.
- 계정 시트가 식품 탭에서 닫히면 inventory scroll restore 이후에도 `food` navigation intent와 active tab을 다시 확정해, scroll settle noise가 `홈`으로 덮어쓰지 않도록 했습니다.
- Full connected browser/API lane: `140 passed`; full native viewport lane: `36 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; web surface lane: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1316.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connected home sync-state summary pass — 2026-09-19

- connected workspace에서 `확인 필요` 또는 `처리 대기/반영 중` 외부 재고 작업이 있으면 홈의 장보기 summary와 같은 밀도의 `외부 재고 연동` card를 노출합니다. demo/guest fixture에는 나타나지 않아 첫 fold 정보량을 늘리지 않습니다.
- 카드는 `외부 상품·보관 위치 연결을 확인해 주세요` 또는 `외부 재고 반영 중이에요`로 다음 상태를 먼저 설명하고, `알림 센터에서 상태를 확인해요`로 durable status surface에 바로 연결합니다.
- Connected sync lifecycle + home summary entry: `1 passed`; full connected browser/API lane: `140 passed`; full native viewport lane: `36 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1317.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Home sync summary to exact notification focus pass — 2026-09-19

- 홈의 `외부 재고 연동` card가 알림 센터를 단순히 여는 데서 끝나지 않고, `확인 필요` 또는 `처리 대기` focus intent를 함께 전달합니다.
- 알림 sheet가 열리면 동일한 상태 summary와 첫 notification row를 자동으로 중앙 정렬·focus해 `홈 카드 → 알림 상태 요약 → 정확한 row`의 시선 흐름을 유지합니다. 해당 row에서 계정 작업 상세로 이동했다가 닫아도 원래 notification row로 focus가 돌아오며, 기존 일반 알림 진입과 unread-first focus는 그대로 유지합니다.
- Connected home sync card → exact action-required row → account sheet → exact row return: `1 passed`; full connected browser/API lane: `140 passed`; full native viewport lane: `36 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; web surface lane: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1318.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification-origin context message pass — 2026-09-19

- 알림 row에서 계정 외부 연동으로 이동하면 AccountSheet의 외부 연동 영역뿐 아니라 로그인/연결 상태와 무관하게 sheet-level context로 `알림에서 이어서 확인 중이에요`와 `작업 상세를 닫으면 원래 알림으로 돌아가요`를 표시합니다.
- 사용자가 현재 작업의 origin과 닫기 후 return destination을 계정 화면 안에서 잃지 않도록 정보 노출 수준을 보강했습니다.
- Connected home sync/account return message: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1319.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Notification-origin explicit return action pass — 2026-09-19

- AccountSheet의 알림 origin context에 `알림으로 돌아가기` action을 추가해, 사용자가 generic close affordance를 찾지 않아도 원래 notification row로 명시적으로 돌아갈 수 있게 했습니다.
- 기존 return ref를 그대로 사용하므로 action을 누르면 해당 row focus와 returned highlight가 유지됩니다.
- Connected sync lifecycle → explicit `알림으로 돌아가기`: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1320.0KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Read-model notification focus without timer fallback — 2026-09-19

- 식품 상세의 `알림에서 보기`는 고정 1.2초 timer 대신 `pendingNotificationSyncRecordId → notifications read model → exact notification id` effect로 focus를 복귀합니다. 목록 응답이 늦어도 임의의 row를 잘못 focus하지 않고, 작업 ID가 없으면 기존 계정 recovery fallback을 유지합니다.
- Printed storage-condition detail → `알림에서 보기` exact row return: `1 passed`; connected sync lifecycle/home focus path: `1 passed`; full connected browser/API lane: `140 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1318.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Detail evidence disclosure return-state pass — 2026-09-19

- `작업 상세 보기`로 계정 sheet를 다녀온 뒤에도 식품 상세의 상위 `기록·출처 이력` disclosure는 열린 상태로 돌아오도록 보존했습니다. 연결된 외부 작업 ID와 evidence row가 다시 읽을 수 있는 context로 유지됩니다.
- 보관 위치 변경처럼 detail 내부 상태가 다시 렌더링되는 경우 nested `외부 상태 근거 보기`는 명시적으로 다시 열어야 다음 `알림에서 보기` action을 이어갈 수 있도록 테스트 계약을 분리했습니다. 상태가 조용히 다시 열려 focus를 빼앗지 않으면서도 parent history context는 유지합니다.
- Storage-condition account roundtrip, applied notification → food detail evidence, sync notification/home focus: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1318.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Detail evidence manual-close stability pass — 2026-09-19

- `focusSyncOutboxId`가 있는 detail을 다시 렌더링해도 stable callback을 사용해 parent `기록·출처 이력` disclosure를 사용자가 수동으로 접은 선택이 다시 강제로 열리지 않도록 했습니다.
- 작업 상세 왕복 후 parent history 보존, 수동 접기 → remote refresh 후 닫힌 상태 유지, applied notification detail return: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1318.6KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Evidence history scroll-anchor pass — 2026-09-19

- FoodHistory가 원격 storage-event readback으로 다시 로드될 때, linked sync focus가 없는 일반 history는 기존 `.sheet-content` scrollTop을 보존합니다. 사용자가 읽던 timeline 위치를 refresh 때문에 잃지 않게 했습니다.
- linked outbox focus가 있는 경우에는 기존 target-center focus가 우선되어, 상태 근거 확인 흐름과 일반 timeline scroll 보존을 분리합니다.
- Remote worker history refresh + scroll anchor readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1318.9KB` JS, `260.0KB` CSS; `git diff --check`: passed.

## Mobile sync-status announcement pass — 2026-09-19

- 식품 상세의 기록 이력이 원격 worker readback으로 갱신될 때, 실제 `grocy_sync_status`가 이전 값에서 바뀐 경우에만 `role=status`의 polite live announcement를 발생시킵니다. 첫 로드·동일 상태 재조회에서는 불필요한 반복 안내를 내보내지 않습니다.
- 기존 timeline scroll anchor와 linked outbox focus는 유지하고, 화면에 이미 보이는 status chip과 보조기기 안내가 같은 상태 값을 공유하도록 맞췄습니다.
- Connected remote worker history refresh + status announcement: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1320.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile date-format continuity pass — 2026-09-19

- 라벨 검수와 식품 상세 날짜 입력에서 native date control의 브라우저별 표기(`09/02/2026`)와 제품 내 날짜 표기(`2026.09.02`)가 달라지는 문제를 보정했습니다. 입력 컨트롤과 OS date picker는 유지하고, 바로 아래에 `선택한 날짜 · 2026.09.02` 읽기 값을 함께 노출합니다.
- 라벨 후보 결과와 사용자 확인 날짜 편집기가 같은 명시적 날짜 문자열을 공유해, 날짜 의미 확인·lot 선택·반영 전 검수 과정에서 사용자가 현재 선택값을 다시 해석하지 않아도 됩니다. 기존 `날짜 의미`, 보관 위치, lot 선택, 확인 후 반영 focus 계약은 유지했습니다.
- Label candidate + explicit date confirmation: `2 passed`; native label action geometry: `1 passed`; connected expired-date → label recheck return: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1320.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification subject specificity pass — 2026-09-19

- 알림 센터에서 반복되던 generic 제목 `확인할 식품이 있어요`를 식품명 중심의 `닭가슴살 확인이 필요해요` 형태로 표시해, 제목만 훑어도 확인 대상을 구분할 수 있게 했습니다.
- 메시지 본문은 `표시 날짜와 보관 상태를 확인해 주세요`로 정리하고, 첫 번째 urgent 알림의 `오늘 먼저 확인할 식품이에요`와 외부 연동·운영 알림의 고유 제목은 그대로 보존했습니다.
- visible title과 accessible name이 동일한 display title을 공유하며, notification row → food detail 이동과 stale food recovery contract를 유지합니다.
- Demo notification readback: `1 passed`; connected stale-food notification recovery: `1 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-record trust hierarchy pass — 2026-09-19

- 로그인·회원가입 시트 하단의 중요한 보존 안내를 작은 한 줄에서 제목과 보조 설명의 2단계로 분리했습니다. `게스트 기록은 지금 그대로 남아요`를 먼저 보여주고, `계정에 연결해도 자동으로 합치지 않아요. 먼저 확인하고 이어갈 수 있어요.`를 이어서 노출합니다.
- 게스트 기록을 삭제하거나 자동 병합하지 않는 기존 동작·문구 계약은 유지하면서, 계정 전환 직전 사용자가 가장 걱정하는 데이터 보존 정보를 첫눈에 읽을 수 있게 했습니다.
- Mobile account guest workspace separation: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal safety summary wording pass — 2026-09-19

- 식단 sheet 상단 shortcut의 generic한 `먼저 확인할 안내`를 `사용 전 확인`으로 바꾸고, 상세 summary의 접근성 이름과 같은 `사용 전 확인 N건 보기` 계약으로 정렬했습니다.
- shortcut 보조 문구에 `포장지·보관 상태·알레르기`를 직접 노출해, 사용자가 상세 영역으로 이동하기 전에 어떤 확인을 해야 하는지 알 수 있게 했습니다.
- 기존 shortcut → 상세 safety item focus, 식품 상세 이동, 조리 완료 전 safety acknowledgement 흐름은 유지했습니다.
- Fixture recipe flow: `1 passed`; native first-sheet meal geometry: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal safety topic coverage pass — 2026-09-19

- 식단 safety count가 날짜 확인·식단 조건·부족 재료·알레르기 정보의 조합으로 만들어질 때, 상단 요약 문구도 실제 항목을 동적으로 반영하도록 보정했습니다. 부족 재료가 포함된 상태에서 날짜·알레르기만 안내하던 정보 누락을 제거했습니다.
- `사용 전 날짜·보관 · 부족 재료 확인이 필요해요`처럼 짧은 topic label을 사용해 393px sheet에서도 다음 확인 범위를 먼저 읽을 수 있게 했고, 상세 callout의 순서·focus는 유지했습니다.
- Connected missing-ingredient planner: `1 passed`; connected date-review planner: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping purchase-to-inventory status pass — 2026-09-19

- 장보기 항목을 모두 체크한 상태에서 `모두 준비했어요`라고 표시되던 문구를 `모두 구매했어요`로 분리했습니다. 아직 식품을 재고에 반영하고 날짜·보관 상태를 확인해야 하는 상태를 완료로 오해하지 않도록 했습니다.
- 진행 영역도 `구매 완료 · 재고 반영 전`과 `구매한 식품을 재고에 넣으면 날짜와 보관 상태를 이어서 확인할 수 있어요`로 변경해, 구매 완료와 재고 반영을 별도 단계로 노출합니다.
- 구매 체크·재고 반영 panel·방금 반영한 식품의 `식품 상세 확인` focus 흐름은 유지했습니다.
- Connected shopping queue mutation readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping status vocabulary pass — 2026-09-19

- 구매 완료 row의 visible copy와 accessible name을 `구매 완료 · 재고 반영 전`으로 통일해, 헤더·진행 영역·개별 항목이 같은 상태 vocabulary를 사용하도록 정리했습니다.
- 기존 `재고 반영` action은 그대로 별도 노출해, checked 상태를 다시 누르는 동작과 inventory mutation을 혼동하지 않게 했습니다.
- Shopping queue / cross-device refresh / mutation-in-flight / receive / retry connected slice: `5 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping completed-list hierarchy pass — 2026-09-19

- 모든 장보기 항목을 구매 완료로 체크한 뒤에도 `이번에 살 재료`로 남던 섹션 제목을 `구매한 재료`로 바꿔, 목록의 현재 상태와 제목이 같은 단계에 머물도록 했습니다.
- 남은 항목이 있으면 기존 `이번에 살 재료`와 `N개 남음` 흐름을 유지하고, 모두 체크된 경우에만 완료 목록 제목으로 전환합니다.
- Connected shopping queue checked-state readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping receive-success next-action pass — 2026-09-19

- 재고 반영 성공 callout의 제목을 `재고에 반영했어요`로 바꿔 성공 결과를 먼저 확정하고, 보조 문구에 `다음: 포장지 날짜와 보관 상태를 확인해 주세요`를 분리했습니다.
- `식품 상세 확인` CTA와 received-lot focus는 유지해, 성공 확인 → 포장지 날짜 확인 → 보관 상태 확인의 다음 행동을 같은 callout 안에서 이어갑니다.
- Connected shopping receive → received notice → detail date focus: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Home shopping-status parity pass — 2026-09-19

- 홈의 장보기 summary도 shopping sheet와 같은 상태 vocabulary를 사용하도록 맞췄습니다. 모든 항목을 체크했지만 아직 재고에 넣지 않은 경우 `모두 구매했어요 · 재고 반영 전`과 `재고에 반영해 주세요`를 표시합니다.
- 남은 항목이 있는 경우의 `장보기 N개가 남아 있어요`, 오류 상태, 빈 목록 상태는 기존 copy와 동작을 유지합니다.
- Connected home shopping queue + receive flow: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Manual-intake default-value cue pass — 2026-09-19

- 직접 입력 화면에서 이름을 입력하면 즉시 보이는 sticky `식품 추가하기` action 아래에 현재 기본값을 `기본값 1개 · 냉장 보관으로 바로 기록해요`로 명시했습니다. 빠른 추가 동작은 유지하면서 사용자가 수량·보관 위치를 수정하지 않고 저장할 때의 결과를 미리 알 수 있게 했습니다.
- 수량이나 보관 위치를 바꾸면 cue도 현재 값으로 갱신되며, 기존 manual intake focus·priority review·날짜 확인 toast 흐름은 유지합니다.
- Fixture manual intake: `1 passed`; native manual action reachability: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1321.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt review uncertainty cue pass — 2026-09-19

- 영수증 검수에서 선택된 항목 중 OCR `확인 필요` 항목이 있으면 하단 반영 CTA 바로 위에 `확인 필요 N개가 포함돼요. 항목을 열어 확인한 뒤 반영하세요.`를 표시합니다.
- 반영을 강제로 막지는 않으면서도, 마지막 commit 지점에서 불확실한 항목 수와 수정 위치를 다시 알려 정보 누락을 줄였습니다. 선택 해제하면 cue도 사라지고 기존 `N개 항목 반영하기` 흐름으로 돌아갑니다.
- Fixture receipt review: `1 passed`; native sticky commit geometry: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1322.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Demo barcode-candidate handoff pass — 2026-09-19

- 데모/로컬 바코드 흐름에서 `상품 후보 1개`만 보여주고 직접 입력으로 이어지는 action이 없던 gap을 보완했습니다. 이제 `이름·보관 기준 적용`을 누르면 `국산콩 두부`, `풀무원`, `냉장` 기본값을 직접 입력 단계로 넘깁니다.
- 소비기한은 계속 후보로만 남기고 포장지 확인을 요구해, 상품 식별 후보와 날짜 확정의 경계를 유지합니다. 연결 모드의 실제 상품 후보 `이름 채우기` 흐름은 변경하지 않았습니다.
- Barcode demo lookup → manual intake handoff: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Demo barcode provenance handoff pass — 2026-09-19

- 데모 바코드 후보를 직접 입력으로 넘긴 뒤에도 연결 모드와 같은 `바코드 상품 후보를 적용했어요` provenance cue를 보여주도록 맞췄습니다. 샘플 후보의 서비스 상품 기준·신뢰도·냉장 기준을 사용자가 확인할 수 있습니다.
- 소비기한은 후보로만 남고, 상품 후보 출처와 포장지 날짜 확인의 경계는 그대로 유지됩니다.
- Barcode demo → manual provenance readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt review top-summary uncertainty pass — 2026-09-19

- 영수증 검수 상단 summary에도 선택된 OCR `확인 필요` 항목 수를 `상품 후보 N개 · 선택 N개 · 확인 필요 N개`로 함께 노출해, 하단 CTA까지 스크롤하지 않아도 반영 전 불확실성을 파악할 수 있게 했습니다.
- 기존 하단 `확인 필요 N개가 포함돼요` cue와 항목 수정·선택 해제·반영 CTA 흐름은 유지했습니다.
- Fixture receipt review: `1 passed`; native sticky commit geometry: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Web brand accessibility parity pass — 2026-09-19

- web surface에서 브랜드 mark의 `r`과 `rescue meal` 텍스트가 보조기기에 중복 읽힐 수 있던 구조를 보정했습니다. 시각 span은 장식으로 숨기고 lockup 자체를 `img` 역할의 `Rescue Meal` 이름으로 노출합니다.
- 모바일·웹의 시각 브랜드는 그대로 유지하면서, axe가 허용하는 semantic name과 실제 화면의 브랜드 표현을 일치시켰습니다.
- Home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Notification read-summary count parity pass — 2026-09-19

- 알림 일부를 읽은 뒤 summary의 `전체 N개`가 읽지 않은 수를 전체처럼 보여주던 문제를 보정했습니다. 이제 혼합 상태에서는 `읽지 않음 N개 · 전체 M개`로 읽음/전체 범위를 분리합니다.
- 모든 알림이 읽지 않은 초기 상태의 compact `전체 N개`와 전체 읽음 후 `확인 완료` 상태는 유지합니다.
- Fixture notification lifecycle: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External-sync notification summary language pass — 2026-09-19

- 외부 재고 연동 알림이 포함된 경우 알림 summary의 다음 행동 문구를 `식품 확인이나 외부 연동의 다음 행동을 이어가요`로 분기해, 식품 알림 전용 문구가 account/outbox 작업까지 가리키지 않도록 했습니다.
- 일반 날짜·식품 알림의 기존 `해당 식품과 확인할 내용을 바로 볼 수 있어요` 문구와 모두 읽음 상태는 유지합니다.
- Connected external-sync notification lifecycle: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.5KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Unread external-sync summary scope pass — 2026-09-19

- 외부 sync 알림이 목록에 존재하지만 이미 읽은 상태인 경우에는 unread 식품 알림 summary를 외부 연동 문구로 바꾸지 않도록, summary topic 판단을 unread sync row로 좁혔습니다.
- 읽지 않은 sync row가 실제로 있을 때만 `식품 확인이나 외부 연동의 다음 행동을 이어가요`를 표시하고, 일반 unread 날짜 알림은 기존 식품 중심 문구를 유지합니다.
- Connected external-sync lifecycle: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## External-outbox completed-status summary pass — 2026-09-19

- Account external inventory panel에서 성공 작업만 남은 경우에도 `막힌 작업 없음 · 0건 처리 대기`로 읽히던 요약을 `최근 N건 반영 완료 · 추가 처리 대기 없음`으로 분리했습니다.
- pending/in-flight/reconciliation/dead-letter가 있는 상태의 세부 count와 `지금 동기화`·재시도 action은 기존 계약을 유지합니다.
- Connected mapping notification → sync completion readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline read-only status-name parity pass — 2026-09-19

- cached offline dashboard의 상단 connection pill accessible name에 `읽기 전용`을 추가해, 상단 callout이 스크롤 밖으로 사라진 뒤에도 보조기기 사용자가 현재 숫자·상세가 최신 live 상태가 아님을 알 수 있게 했습니다.
- 화면에 보이는 compact label(`오프라인 · 방금 전` 등)과 `다시 연결` CTA, read-only detail mutation 차단은 그대로 유지합니다.
- Connected cached-offline reload: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline empty-state status-name parity pass — 2026-09-19

- cached data가 전혀 없는 offline 상태의 connection pill accessible name도 `최신 기록을 사용할 수 없음`을 포함하도록 분리했습니다. cached read-only와 empty offline recovery를 보조기기에서 같은 상태로 오해하지 않게 했습니다.
- 화면의 `오프라인 · 임시 화면`, `다시 연결` recovery CTA, production no-demo-data 경계는 유지합니다.
- Connected offline empty recovery: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Auth-required connection action-name pass — 2026-09-19

- auth-required 상태에서 visible label `로그인 다시 필요`와 accessible action `계정 열기`가 어긋나던 부분을 `로그인 화면 열기`로 구체화했습니다.
- 일반 guest/connected/offline 상태의 `계정 열기`와 offline cached/empty 상태의 read-only/latest-record boundary는 유지했습니다.
- Connected expired-session recovery: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.7KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Meal-save durable next-action cue pass — 2026-09-19

- 식단 저장 후 durable saved card에도 성공 결과 아래에 다음 행동을 노출했습니다. 일반 식단은 `다음: 사용량을 확인하고 조리 완료를 기록해 주세요`, 부족 재료가 있으면 `다음: 부족 재료를 장보기에 추가해 주세요`를 표시합니다.
- 기존 toast의 저장 결과·action, completion focus, 부족 재료 장보기 action은 유지해 transient 메시지를 놓쳐도 sheet 안에서 다음 행동을 이해할 수 있게 했습니다.
- Fixture meal save/completion: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1324.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Food-detail safety-announcement semantics pass — 2026-09-19

- 식품 상세의 조리 전 날짜 확인 callout을 단순 `note`에서 polite `status` live region으로 바꿔, 날짜 의미·표시 날짜·보관 상태 재확인 안내가 sheet 진입 시 보조기기에도 전달되도록 했습니다.
- 기존 warning copy, compact label recheck CTA, consume confirmation, safe-area geometry는 유지했습니다.
- Fixture date-warning flow: `2 passed`; food-detail axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1324.1KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guidance safety-message hierarchy pass — 2026-09-19

- 날짜 기준 안내의 마지막 상태 경고를 한 줄 문장에서 `상태가 이상하면 날짜보다 먼저 확인해요` 제목과 냄새·색·포장 팽창 보조 설명으로 분리했습니다.
- `식품 상태 확인 안내` note semantic을 추가해 모바일 보조기기에서도 날짜보다 우선하는 상태 확인 boundary를 인지할 수 있게 했습니다.
- Fixture guidance return: `1 passed`; native large-text guidance reachability: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1324.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guidance list semantics pass — 2026-09-19

- 날짜 기준 안내의 3단계 기록 순서를 시각적 row만이 아니라 `list`/`listitem` semantics로 노출해, 보조기기가 `포장지 표시 → 사용자 확인 → 먼저 사용 순서`의 목록 구조를 이해하도록 했습니다.
- 기존 번호·badge·경고 copy와 sheet return/focus 흐름은 변경하지 않았습니다.
- Fixture guidance list readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1324.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Shopping receive customer-language pass — 2026-09-19

- 재고 반영 panel의 운영 용어 `입고 확인`을 `구매 내용 확인`으로 바꿔, 구매·재고 반영·날짜 확인 흐름의 customer-facing copy를 통일했습니다.
- form accessible name `식품명 재고 반영`, 구매 수량·보관 위치 입력, 포장지 날짜 caution, 반영 성공 이후 detail focus는 유지했습니다.
- Connected shopping receive readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1324.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Latest fixture-mobile full regression readback — 2026-09-19

- 최근 intake·guidance·notification·connection messaging 변경을 포함한 fixture/mobile 전체 lane을 다시 실행했습니다.
- Full fixture/mobile lane: `61 passed + 3 skipped`; the three skips remain the known production-runtime/Web Push environment lanes; mobile runtime integrity: `28 protected files`.

## Intake-method summary parity pass — 2026-09-19

- 홈의 `식품 추가` shortcut이 실제 intake hub의 네 가지 경로 중 영수증·바코드·라벨만 설명하던 문제를 `영수증·바코드·라벨·직접 입력`으로 맞췄습니다.
- 모바일에서는 기존 compact layout을 유지하고, web/넓은 화면에서는 직접 입력 fallback까지 첫 진입점에서 알 수 있게 했습니다.
- Mobile quick-add geometry/readback: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1324.3KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Runtime-configuration progressive-disclosure pass — 2026-09-19

- 운영 설정 오류 화면의 일반 copy에서 `VITE_API_BASE_URL`·`VITE_DEPLOYMENT_MODE` 같은 내부 환경변수를 숨기고, 사용자에게는 `서비스 연결 설정이 필요해요`와 임시 데이터 미노출 경계를 먼저 보여주도록 했습니다.
- 상세 환경변수·빌드 안내는 `배포 담당자용 설정 보기` disclosure 안에 보존해 운영자가 원인을 확인할 수 있습니다.
- Production build: `765` Vite modules; bundle budget: `18` JS chunks, `1325.0KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Accumulated fixture-mobile regression readback — 2026-09-19

- 최근 모바일 messaging/accessibility changes를 포함한 전체 fixture/mobile lane을 다시 실행했습니다. Receipt·barcode·label·manual intake, notification, account, meal, inventory, runtime error recovery를 함께 재확인했습니다.
- Full fixture/mobile lane: `61 passed + 3 skipped`; the three skips remain the known production-runtime/Web Push environment lanes; mobile runtime integrity: `28 protected files`.

## Accumulated native viewport regression readback — 2026-09-19

- 현재 source 기준 native viewport 전체 회귀를 다시 실행해 320px/393px fold, short-height, keyboard, safe-area, large text, reduced motion, contrast, light/dark theme, receipt/camera, meal/detail focus 계약을 재확인했습니다.
- Full native viewport lane: `36 passed`; mobile runtime integrity: `28 protected files`. 이 수치는 실제 iOS/Android 기기 release acceptance를 대체하지 않지만, 현재 native mobile runtime geometry와 focus contracts는 모두 통과한 상태입니다.

## Accumulated connected browser-API regression readback — 2026-09-19

- 현재 source 기준 connected browser/API 전체 회귀를 다시 실행해 planner, receipt/label/barcode/manual intake, storage/detail, shopping receive, offline/auth, account/guest transfer, notification/external-sync, custom storage, recipe review 흐름을 재확인했습니다.
- Full connected browser/API lane: `140 passed`; production API worker completed successfully; current connected UI contracts remain green after the latest messaging/accessibility changes.

## Accumulated web-surface regression readback — 2026-09-19

- web surface 전용 lane을 다시 실행해 phone simulator chrome 없이 real app shell이 렌더링되는지, dark theme이 outer runtime surface까지 이어지는지 확인했습니다.
- Full web surface lane: `2 passed`; current web home/navigation/theme shell remains green after the brand accessibility parity change.

## Web brand semantic readback pass — 2026-09-19

- web surface 회귀에 accessible `img` name `Rescue Meal` assertion을 추가해, 시각 brand lockup과 보조기기 semantic name이 실제 web runtime에서 함께 유지되는지 고정했습니다.
- Full web surface lane: `2 passed`; phone simulator chrome exclusion, web navigation, dark outer shell, and brand semantic name remain green.

## Web connection-pill hover-context pass — 2026-09-19

- 넓은 web surface에서 짧은 connection pill label만 보일 때도 hover context가 상태별 accessible action과 같도록 `title`을 연결했습니다. auth-required는 `로그인 화면 열기`, offline cached/empty는 읽기 전용·최신 기록 경계를 함께 설명합니다.
- 모바일 시각 label과 click/focus 동작은 변경하지 않았습니다.
- Full web surface lane: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1323.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile home safety-message context pass — 2026-09-19

- 홈의 안전 안내가 항상 같은 일반 문구를 보여주던 부분을 현재 우선 식품의 review reason과 연결했습니다. 날짜 확인이 필요한 경우 `확인 필요 N개 · 날짜를 먼저 확인해요`, 보관 조건이 섞이면 `날짜·보관 상태`를 먼저 확인하라는 요약을 보여줍니다.
- `AI는 소비기한을 확정하지 않아요` 경계는 안내의 보조 문구로 유지해, 다음 행동을 앞세우면서도 제품이 안전 판정을 대신한다는 인상을 만들지 않았습니다. review가 없으면 기존 신뢰 문구로 돌아갑니다.
- Fixture home/detail readback: `1 passed`; native home/short-height/pantry-boundary subset: `5 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1325.6KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed. Live mobile light/dark readback confirmed the contextual title stays within the first-fold trust card, and the accessible name includes both the next action and the AI responsibility boundary.

## Mobile barcode-candidate handoff focus pass — 2026-09-19

- 바코드 상품 후보가 생성된 뒤 후보 카드가 시트 하단에 남아 `이름·보관 기준 적용`을 찾기 위해 다시 스크롤해야 하던 흐름을 보정했습니다. 첫 후보의 적용 action을 시트 중앙으로 가져오고 포커스를 이동해 `입력 → 후보 확인 → 직접 확인 단계로 이동`을 한 번에 이어갑니다.
- 데모 후보와 연결 모드의 실제 상품 후보 모두 같은 scroll/focus 계약을 사용하며, 후보가 없는 경고 응답에서는 기존 입력 위치와 recovery 흐름을 유지합니다. 후보 적용 후 직접 입력 화면으로 전환되는 기존 provenance·보관 기준 경계도 유지했습니다.
- Fixture barcode flow: `1 passed`; connected barcode candidate flow: `1 passed`; full fixture/mobile lane: `61 passed + 3 skipped`; full native viewport lane: `36 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1325.9KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed. Live 393px dark readback shows the candidate card and apply action together in the active sheet viewport with focus on the apply action.

## Mobile receipt-review first-target focus pass — 2026-09-21

- 샘플·신규 영수증 검수 결과에서 첫 `확인 필요` 항목을 자동으로 시트 중앙에 배치하고 해당 항목의 toggle row에 포커스를 이동했습니다. 펼쳐진 편집 영역은 그대로 유지하되 `KeyboardInput`을 직접 포커스하지 않아 모바일 키보드가 결과 화면을 덮지 않습니다.
- 포커스된 row의 accessible name에 상품명·수량·금액·`확인 필요`가 함께 있어, 사용자는 첫 검수 대상임을 읽고 바로 상품명·수량·단위·보관 위치 편집으로 이동할 수 있습니다. 저장된 검수 초안의 기존 입력 focus contract는 별도로 유지합니다.
- Fixture receipt review: `1 passed` (isolated test port `4492`); native receipt/label subset: `4 passed` (isolated test port `4493`); production build: `765` Vite modules; bundle budget: `18` JS chunks, `1326.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed. Live 393px dark readback shows the `맛타리버섯 · 확인 필요` row focused with the expanded editor visible and the sticky commit action still reachable. Existing unrelated `pc-supporter` process on port `4174` was left untouched.

## Mobile label-review unresolved-field focus pass — 2026-09-21

- 라벨 인식 결과에서 날짜 의미·상품명·표시 날짜·보관 위치 중 하나라도 미확정이면 비활성화된 하단 CTA를 먼저 보여주던 scroll 순서를 수정했습니다. 이제 실제로 해결해야 하는 첫 radio/input/storage control을 중앙에 배치하고 포커스합니다.
- 모든 필드가 준비된 기존 샘플 결과는 `확인 후 반영` CTA를 계속 중앙에 배치하고 포커스하며, 완전하지 않은 결과만 해당 필드 focus 경로를 사용합니다. 날짜 의미 확인 전에는 소비기한으로 확정하지 않는 문구와 저장 경계는 유지됩니다.
- Connected ambiguous-label review: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1326.4KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Mobile receipt-product-candidate handoff focus pass — 2026-09-21

- 영수증 검수에서 상품명 후보 조회가 완료되면 첫 `이 후보 적용` action을 현재 검수 항목의 중앙으로 가져오고 포커스를 이동합니다. 후보 카드가 편집 필드 아래에 추가돼도 다음 행동이 화면 밖으로 밀리지 않습니다.
- 후보 적용 시 기존 사용자가 입력한 수량·단위·검수 상태를 유지하고, 상품명·상품 기준 보관 정보·provenance만 후보 값으로 갱신하는 기존 계약을 유지합니다.
- Connected receipt correction + product candidate flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1326.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Receipt candidate-apply confirmation pass — 2026-09-21

- 상품 후보를 적용한 직후 후보 카드가 사라져 변경 결과가 불명확해지던 흐름을 보완했습니다. 현재 항목 안에 `상품 정보를 적용했어요` status를 남기고, 상품명·보관 기준은 후보를 반영했으며 포장지 날짜는 별도로 확인해야 한다는 다음 행동을 함께 보여줍니다.
- 영수증 상품명 후보·영수증 바코드 후보·기존 매칭 후보의 적용 결과가 같은 confirmation language를 사용하며, 검수 상태와 사용자가 입력한 수량·단위는 그대로 유지됩니다.
- Connected receipt correction + candidate confirmation: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.2KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Candidate-provenance manual-edit distinction pass — 2026-09-21

- 상품 후보 적용 후 사용자가 상품명·수량·단위·보관 위치를 수정하면 기존 confirmation 대신 `후보 적용 후 사용자 값으로 수정했어요` 상태를 보여줍니다.
- 상품 후보 provenance는 기록에 남아 있지만 현재 표시값은 사용자가 확인·수정한 값이라는 점을 분리해, 후보 출처와 현재 사용자 결정이 섞여 읽히지 않도록 했습니다.
- Connected receipt candidate → manual edit truthfulness: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.9KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Provenance cross-surface parity readback pass — 2026-09-21

- 연결 모드에서 provenance가 있는 식품 상세를 열었을 때 `상품 정보 출처` 카드가 후보 source, 신뢰도, 최신성, 상품 기준 보관 정보, 개별 포장 소비기한 비확정 경계를 함께 유지하는지 회귀 계약을 추가했습니다.
- 홈의 provenance-backed priority entry와 상세의 `상품 출처 다시 확인` focus가 같은 출처 정보를 가리키는지 확인해, 입력 후보 화면에서 상세 화면으로 이동할 때 정보가 축약되거나 의미가 바뀌지 않게 했습니다.
- Connected provenance detail parity: `1 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Home safety-summary scope parity pass — 2026-09-21

- 홈 안전 안내의 `확인 필요 N개` 문구에 `오늘 우선 식품 중` 범위를 명시해, priority scope와 전체 식품 목록의 확인 필요 count가 서로 다른데도 같은 숫자처럼 읽히던 ambiguity를 줄였습니다.
- 전체 식품 목록의 `확인 필요 N개 · 날짜·보관 상태를 먼저 확인해요` 요약과 홈의 `오늘 우선 식품 중 N개는 ...` 안내가 서로 다른 scope를 설명하도록 맞췄습니다.
- Fixture home/detail readback: `1 passed`; home axe audit: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.9KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connected notification-meal scope parity pass — 2026-09-21

- 연결 모드에서 식단의 `사용 전 확인 2건`이 날짜 review·부족 재료 safety summary로 이어지고, 알림 센터의 외부 연동 count가 `확인 필요·처리 대기·반영 완료` 세 상태로 분리되는지 함께 재확인했습니다.
- 식단 safety count는 조리 전 확인 범위로, 알림 count는 unread/task lifecycle 범위로 유지되어 같은 `확인 필요` 용어가 서로 다른 범위를 덮어쓰지 않습니다.
- Connected date-review meal flow, storage-to-notification lifecycle, external-sync notification summary: `3 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline/auth scope-boundary parity pass — 2026-09-21

- 오프라인 캐시 화면은 `읽기 전용`과 `최근 동기화한 재고`를 connection pill·priority card·legend에 유지하고, 최신 상태로 오해할 수 있는 일반 connected count로 돌아가지 않는지 확인했습니다.
- 캐시가 없는 offline 상태는 `최신 기록을 사용할 수 없음`과 `다시 연결` recovery를 분리하고, auth-required 상태는 `로그인 화면 열기`·`계정 연결이 만료됐어요`·workspace 자동 전환 없음 경계를 유지합니다.
- Connected expired-session, offline empty recovery, offline stale snapshot, initial account-connection failure: `4 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline meal-entry scope guard pass — 2026-09-21

- 연결된 최신 재고가 없는 offline/auth-required 상태에서 하단 `식단` 탭을 눌러 stale 재료로 식단 sheet를 계산하지 않도록 진입을 차단했습니다.
- offline 상태는 `최신 재고에 연결한 뒤 식단을 확인할 수 있어요`와 `다시 연결`, auth-required는 로그인 경로로 recovery를 안내하며, 이미 열린 식단 sheet의 정상 connected flow는 유지합니다.
- Connected offline stale dashboard → bottom meal entry guard + reconnect recovery: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1328.3KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline shopping-notification entry guard pass — 2026-09-21

- offline/auth-required 상태에서 하단·헤더 진입으로 장보기 목록과 알림 sheet를 열어 stale 데이터를 수정하거나 읽음 처리하는 경로를 차단했습니다.
- offline은 `다시 연결한 뒤 최신 장보기 목록/최신 알림을 확인할 수 있어요`와 `다시 연결` CTA를 사용하고, auth-required는 로그인·계정 연결 recovery로 분기합니다.
- offline stale snapshot → meal/shopping/notification entry scope guard + reconnect recovery: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.1KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Candidate-card visual anatomy parity pass — 2026-09-21

- 영수증 후보 카드의 적용 버튼도 바코드 후보와 같은 `candidate-apply-button` anatomy를 사용하도록 통합했습니다. 동일한 `상품 정보 적용` 행동이 높이·패딩·radius·강조 수준까지 같은 시각 언어를 사용합니다.
- 기존 영수증 전용 버튼 CSS를 제거해 중복 스타일을 줄였고, 후보 카드의 provenance·신뢰도 텍스트와 날짜 후보 CTA의 분리 구조는 유지했습니다.
- Connected receipt candidate flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.3KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Candidate-apply CTA vocabulary parity pass — 2026-09-21

- 같은 상품 후보를 적용하는 CTA를 영수증·영수증 바코드·일반 바코드의 `이 후보 적용`·`이름 채우기`·`이름·보관 기준 적용`에서 `상품 정보 적용`으로 통일했습니다. 후보가 채우는 범위는 후보 카드의 보관 기준·provenance 정보로 계속 설명합니다.
- 날짜 후보를 별도로 반영하는 `상품·날짜를 입력에 반영` CTA는 날짜 확정 경계가 다르므로 유지해, 상품 정보 적용과 날짜 후보 적용을 혼동하지 않게 했습니다.
- Fixture barcode flow: `1 passed`; connected receipt candidate correction flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1326.8KB` JS, `260.0KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Candidate-card visual anatomy parity pass — 2026-09-21

- 영수증 상품 후보 버튼에도 바코드 후보와 같은 `candidate-apply-button` 공통 스타일을 적용해, 상품 후보 적용 CTA의 높이·패딩·radius·강조 수준을 통일했습니다.
- 기존 영수증 전용 버튼 CSS를 제거해 중복 스타일을 줄였고, 좁은 화면에서 카드 본문과 CTA가 서로 다른 규칙으로 폭을 차지하지 않도록 했습니다. provenance·신뢰도·보관 기준 텍스트와 날짜 후보의 별도 CTA는 유지했습니다.
- Production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.3KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Native 320px candidate-card geometry pass — 2026-09-21

- 320px native viewport에서 예시 바코드 후보 카드와 `상품 정보 적용` CTA의 좌우 경계·safe-area 하단·최소 touch height·시트 scroll width를 계약으로 추가했습니다.
- 후보 포커스의 smooth scroll settle 이후 geometry를 측정해, 이동 중인 중간 프레임을 실패로 오인하지 않도록 했습니다. 최종 상태는 카드/CTA가 sheet와 screen 안에 있고 horizontal overflow가 없습니다.
- Native barcode candidate geometry: `1 passed` (isolated test port `4493`); mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connected 320px receipt-candidate density pass — 2026-09-21

- 연결 모드 영수증 상품 후보 흐름을 실제 `320×740` viewport로 전환해, 긴 provenance 문구·후보 본문·`상품 정보 적용` CTA가 sheet 좌우 경계와 screen 하단 safe-area 안에 함께 들어오는지 검증했습니다.
- 후보 focus와 smooth-scroll settle 이후 card/action bounding box 및 `.sheet-content` horizontal overflow를 측정하고, 이후 테스트 viewport를 `1100×1100`으로 복구해 기존 commit/readback flow도 유지했습니다.
- Connected receipt candidate density + correction flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.3KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connected 320px multi-candidate density pass — 2026-09-21

- 연결 모드 영수증 상품명 후보를 2개로 구성해, 긴 provenance·신뢰도·보관 기준 텍스트가 여러 카드에 반복돼도 각 카드와 각 `상품 정보 적용` CTA가 sheet 폭 안에 유지되는지 검증했습니다.
- 첫 후보의 자동 focus/scroll과 두 번째 후보의 수직 누적은 분리해 유지하고, horizontal overflow만 차단해 좁은 화면에서도 후보를 순차적으로 확인할 수 있게 했습니다.
- Connected multi-candidate receipt flow at `320×740`: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.3KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Multi-candidate apply-confirmation density pass — 2026-09-21

- 320px에서 첫 상품 후보를 적용한 뒤 후보 목록이 사라지고 `상품 정보를 적용했어요` confirmation이 남는 상태를 검증했습니다. confirmation card가 sheet 좌우를 넘지 않고 sticky 반영 CTA와 겹치지 않습니다.
- 두 번째 후보가 있었던 이전 상태와 적용 후 상태를 분리해, 사용자가 적용 결과를 놓치지 않으면서도 다음 검수 항목으로 계속 이동할 수 있게 했습니다.
- Connected multi-candidate apply confirmation at `320×740`: `1 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Candidate-apply manual-edit truthfulness pass — 2026-09-21

- 상품 후보 적용 후 사용자가 상품명·수량·단위·보관 위치를 직접 바꾸면 기존 `상품 정보를 적용했어요` confirmation을 제거하도록 보정했습니다. 후보 상태와 현재 사용자 수정값이 서로 다른데도 같은 성공 문구가 남는 정보 불일치를 막습니다.
- 후보를 적용하고 아무것도 수정하지 않은 경우에는 기존 confirmation과 포장지 날짜 다음 행동을 유지합니다. 직접 수정이 시작되면 현재 입력값을 사용자가 다시 확인하는 흐름으로 전환합니다.
- Connected receipt candidate apply → manual edit truthfulness flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1327.4KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Native 320px label-result density pass — 2026-09-21

- 320px native 라벨 결과에서 `label-result-card`가 sheet 좌우 경계를 넘지 않고, 카드 내부 horizontal overflow가 없으며, `확인 후 반영` action bar가 카드 다음 순서에 존재하는지 고정했습니다.
- 날짜 의미·표시 날짜·보관 위치 선택 영역의 긴 설명이 카드 폭을 깨지 않는지와 기존 CTA safe-area 도달성 계약을 함께 측정합니다.
- Native label result density + action reachability: `1 passed` (isolated test port `4493`); mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Offline notification-badge freshness pass — 2026-09-21

- offline/auth-required 상태에서 이전 unread notification 숫자 badge가 최신 알림처럼 보이지 않도록 숨기고, header accessible name으로 `다시 연결 후 최신 알림 확인` 또는 `로그인 후 최신 알림 확인`을 전달합니다.
- connected 상태에서는 기존 urgent/attention/info badge와 unread count를 그대로 유지하며, offline 상태에서는 최신성 경계를 우선 노출합니다.
- Offline stale notification entry + badge suppression: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.1KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Auth-required account-panel mutation boundary pass — 2026-09-21

- 로그인 만료 상태에서 계정 sheet가 로그인 recovery 화면으로 수렴하고, 인증 전 `식품 기록 설정`·데이터 export·외부 연동 운영 panel을 mount하지 않는 계약을 추가했습니다.
- 기존 workspace 기록을 자동 전환하지 않는 alert와 `로그인 화면 열기` action은 유지하면서, 인증 전 mutation surface 노출을 차단합니다.
- Connected expired-session account boundary: `1 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Authenticated guest-transfer scope pass — 2026-09-21

- 인증 후 게스트 transfer preview가 식품·영수증·보관 기록·식단·장보기·알림 설정 등 가져올 scope를 먼저 보여주고, `게스트 기록 가져오기`와 `계정만 사용`을 분리하는지 확인했습니다.
- 게스트 기록은 자동으로 계정 기록에 섞이지 않고, 기존 계정 workspace를 유지한 채 명시적 선택을 요구하는 현재 언어·focus contract를 유지합니다.
- Connected registration guest-transfer preview: `1 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-transfer conflict recovery pass — 2026-09-21

- 계정 workspace에 다른 기록이 있는 guest transfer conflict에서 자동 병합하지 않고 새 preview로 돌아가는 recovery를 재확인했습니다.
- import 요청은 conflict 상태에서 실행되지 않으며, 새 preview의 `게스트 기록 가져오기`·`계정만 사용` 선택과 기존 account 기록 보호 경계를 유지합니다.
- Connected guest-transfer conflict recovery: `1 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-transfer success next-action pass — 2026-09-21

- 게스트 기록 import가 성공한 뒤 결과 toast에 `식품 목록 확인` action을 추가해, 성공 메시지를 읽고 바로 새 계정 workspace의 식품 목록으로 이동할 수 있게 했습니다.
- 일반 로그인 성공 toast에는 불필요한 action을 추가하지 않고, guest transfer success message에만 next action을 연결해 정보 노출 수준을 상태별로 유지했습니다.
- Connected guest-transfer preview/import: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Guest-transfer next-action workspace readback pass — 2026-09-21

- transfer 성공 toast의 `식품 목록 확인` action을 실제로 눌렀을 때 하단 navigation이 `식품`으로 바뀌고 inventory toolbar로 이동하는 next-action contract를 추가했습니다.
- 결과 메시지 확인에서 끝나지 않고 새 계정 workspace의 식품 목록으로 이어지는 사용자의 다음 행동을 고정했습니다.
- Connected guest-transfer success → 식품 목록 next action: `1 passed`; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Accumulated fixture-mobile regression readback — 2026-09-21

- 현재 source 기준 fixture/mobile 전체 lane을 다시 실행해 홈 scope copy, notification badge freshness, intake candidate CTA, receipt/label focus, meal, inventory, account, offline recovery를 함께 재확인했습니다.
- Full fixture/mobile lane: `61 passed + 3 skipped`; the three skips remain the known production-runtime/Web Push environment lanes; runtime error console output is the intentional fixture failure case and its recovery test passed.

## Accumulated native viewport regression readback — 2026-09-21

- 현재 source 기준 native full lane을 다시 실행해 320px/393px fold, short-height, keyboard, safe-area, large text, reduced motion, contrast, light/dark, receipt/candidate/label, account, meal/detail focus contracts를 함께 재확인했습니다.
- Full native viewport lane: `37 passed`; isolated native test port `4493`; mobile runtime integrity: `28 protected files`. 이 수치는 실제 iOS/Android device release acceptance를 대체하지 않지만 현재 native mobile runtime geometry·focus 계약은 모두 green입니다.

## Guest-transfer zero-scope disclosure pass — 2026-09-21

- 게스트 transfer preview의 `가져올 기록` chips에서 0건인 scope를 숨겨, 실제로 가져올 데이터와 선택 판단에 필요한 범위만 노출하도록 정리했습니다.
- 식품·영수증·보관 기록·보관 위치·식단·장보기·입고·알림 설정 중 실제 값이 있는 항목만 표시하고, 모든 값이 0인 preview는 기존처럼 transfer panel을 열지 않습니다.
- Connected registration guest-transfer preview + zero-scope disclosure: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.2KB` JS, `259.8KB` CSS; mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Accumulated connected browser/API regression readback — 2026-09-21

- 현재 source 기준 connected 전체 lane을 다시 실행해 인증·게스트 transfer·알림·외부 sync·식품 입력·보관 위치·식단·recipe review 흐름을 함께 재확인했습니다.
- Full connected lane: `140 passed`; 실행 시간 `6.2m`. 이번 결과는 실제 모바일 화면 자체의 device acceptance를 대신하지 않지만, 연결형 browser/API contract와 모바일 focus/action 흐름은 모두 green입니다.
- In-app browser `http://127.0.0.1:4176/`에서 Rescue Meal 홈을 모바일 폭 기준으로 다시 열어, priority food → 식단 CTA → 식품 추가 → AI 경계 메시지 → inventory → bottom navigation 순서를 확인했습니다.

## Mobile frontend open-state and production readback — 2026-09-21

- In-app browser `http://127.0.0.1:4176/`의 Rescue Meal 홈을 다시 열고 390px 기준 접근성 트리에서 우선순위 식품 3개, `확인하고 오늘 식단 만들기`, `식품 추가`, AI 경계 메시지, 식품 목록, 하단 내비게이션의 노출 순서를 확인했습니다.
- 라이트/다크모드 전환 컨트롤과 게스트 연결 상태·알림 진입점은 첫 화면 상단에서 유지되고, 홈의 주요 행동은 고정 하단 내비게이션과 겹치지 않는 현재 모바일 구조를 유지합니다.
- Runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.8KB` CSS; `git diff --check`: passed.

## Native 320px home-action density pass — 2026-09-21

- `320×740` native 화면에서 메인 식단 CTA와 보조 식품 추가 CTA가 나란히 놓일 때, 보조 CTA 폭을 `102px → 88px`로 줄여 메인 CTA의 설명 문장이 불필요하게 좁아지지 않도록 조정했습니다.
- 고정 하단 내비게이션과의 수직 여백, 전체 document width, 기존 44px 터치 타깃 계약은 유지했습니다.
- Focused native 320px home geometry: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.9KB` CSS; `git diff --check`: passed.

## Dark-theme secondary-copy contrast pass — 2026-09-21

- 다크모드의 보조 설명 텍스트 토큰을 `#aab6c5 → #b6c0cc`로 조정해 상태 설명·안내 문구의 읽기 우선순위를 높였습니다.
- 제목, 경고 색상, 메인 CTA 색상과 레이아웃은 유지해 기존 정보 위계와 브랜드 포인트 컬러를 보존했습니다.
- Focused native dark-theme regression: `3 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.9KB` CSS; `git diff --check`: passed.

## Added-food follow-up message clarity pass — 2026-09-21

- 식품 추가 직후의 후속 action label을 `날짜·보관 확인`에서 `날짜·보관 상태 확인`으로 바꿔, 사용자가 상세 화면에서 확인해야 할 범위를 토스트 단계부터 명확히 알 수 있게 했습니다.
- 기존 `상품·날짜 확인` 분기는 유지해 상품 후보 출처가 있는 식품과 일반 직접 입력 식품의 확인 범위를 구분했습니다.
- Fixture intake follow-up: `2 passed`; connected intake/recovery/storage follow-up: `3 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.9KB` CSS.

## Offline stale-time visibility pass — 2026-09-21

- 오프라인 홈의 우선순위 상태 카드 kicker에 `최근 동기화 재고 · N분 전`을 추가해, 상단 연결 안내를 다시 읽지 않아도 카드 자체에서 데이터 freshness를 판단할 수 있게 했습니다.
- 기존 읽기 전용 안내, `다시 연결` action, 식단·알림·장보기의 최신 데이터 guard는 변경하지 않았습니다.
- Connected offline focused regression: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.9KB` CSS; `git diff --check`: passed.

## Offline stale-time accessible-name pass — 2026-09-21

- 상태 카드의 `aria-label`에도 `최근 동기화한 오늘 먼저 확인할 식품 N개 · N분 전`을 포함해, 시각적으로만 보이던 freshness 정보를 스크린 리더 사용자의 판단에도 연결했습니다.
- visible kicker와 accessible name의 시간 표현을 같은 `formatDashboardCacheTime` 계약으로 묶어 두 표현이 어긋나지 않도록 했습니다.
- Connected stale-dashboard focused regression: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.9KB` CSS; `git diff --check`: passed.

## Offline notification-count trust boundary pass — 2026-09-21

- 연결이 끊긴 상태에서는 시각적 notification badge뿐 아니라 버튼 `aria-label`의 `읽지 않은 알림 N개`도 숨겨, 최신 상태로 확인되지 않은 숫자를 읽지 않도록 정리했습니다.
- offline/auth-required 상태는 `다시 연결 후 최신 알림 확인` 또는 `로그인 후 최신 알림 확인`만 노출하고, 연결된 상태에서만 unread severity와 숫자 badge를 제공합니다.
- Connected offline/recovery: `2 passed`; fixture notification: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.2KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Offline stale-time speech clarity pass — 2026-09-21

- offline 상태 카드의 accessible name을 `... 3개 · 5분 전`에서 `... 3개, 마지막 동기화 5분 전`으로 바꿔 스크린 리더가 식품 수와 freshness를 분리해 읽도록 했습니다.
- 시각적 kicker의 짧은 표현은 유지하고, 접근성 이름만 의미 중심 문장으로 확장해 모바일 first-fold 밀도를 늘리지 않았습니다.
- Connected stale-dashboard focused regression: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.3KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Offline stale-copy action clarity pass — 2026-09-21

- 오프라인 우선순위 카드의 본문을 `지금 확인하고...`에서 `최근 동기화 상태를 먼저 보고, 다시 연결한 뒤 오늘 식단을 계산해요.`로 분기해 실시간 데이터처럼 오해하지 않도록 했습니다.
- 연결된 상태의 짧은 행동 문구와 온라인 식단 계산 흐름은 그대로 유지하고, stale snapshot에서만 읽기·재연결 경계를 명시합니다.
- Connected stale-dashboard focused regression: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.4KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Date-review next-priority action pass — 2026-09-21

- 식품 상세에서 포장지 날짜를 사용자 확인으로 저장한 뒤, 우선순위 식품이 남아 있으면 toast에 `다음 우선 식품 확인` action을 제공합니다.
- 기존 저장 직후 focus는 업데이트된 식품 행에 그대로 돌려주고, 사용자가 선택했을 때만 다음 우선 식품 상세로 이동하도록 해 자동 이동으로 맥락을 잃지 않게 했습니다.
- Fixture date-review flow: `1 passed`; action click 후 다음 우선 식품 상세(`시금치`) readback까지 확인; `git diff --check`: passed.

## Accumulated fixture/native regression after date-flow pass — 2026-09-21

- 현재 source 기준 fixture/mobile 전체 lane을 다시 실행해 날짜 확인 후 다음 우선 식품 action, 알림 신뢰 경계, offline stale copy, receipt/label focus, meal, account 흐름을 함께 재확인했습니다.
- Full fixture/mobile lane: `61 passed + 3 skipped`; skip 3건은 production runtime/Web Push 환경 lane이며, fixture render error console은 의도된 recovery fixture입니다.
- Full native viewport lane: `37 passed`; 320px/393px fold, dark mode, focus, keyboard, safe-area, large text, contrast, receipt/label, account, meal/detail 계약이 모두 green입니다.

## Connected date-next-action readback — 2026-09-21

- 연결형 날짜 저장 경로에서도 성공 toast가 기존 저장 메시지를 유지하면서 다음 우선 식품 action을 추가할 수 있는 구조를 재확인했습니다.
- dashboard refresh 실패 후에도 성공한 날짜 write를 화면에 남기는 connected recovery flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.6KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Guest-transfer trust-copy legibility pass — 2026-09-21

- 계정 연결 sheet의 핵심 안심 안내 `게스트 기록은 지금 그대로 남아요` 아래 설명을 `9px → 10px`로 올려, 자동 병합하지 않고 먼저 확인한다는 중요한 데이터 경계를 모바일에서도 읽기 쉽게 했습니다.
- 320px 계정 sheet의 primary action 위치와 home-indicator 안전 영역은 그대로 유지했습니다.
- Native account viewport: `2 passed`; fixture guest-workspace separation: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.6KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Manual-intake default-value legibility pass — 2026-09-21

- 직접 입력 sticky submit bar의 `기본값 1개 · 냉장 보관으로 바로 기록해요` 안내를 `8px → 9px`로 올려, 제출 전에 적용될 수량·보관 기본값을 더 쉽게 읽도록 했습니다.
- submit action의 sticky 위치, 320px safe-area, 입력 완료 후 새 우선 식품 focus는 변경하지 않았습니다.
- Native manual-intake viewport: `1 passed`; fixture manual-intake follow-up: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.6KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Receipt-review warning legibility pass — 2026-09-21

- 영수증 검수 sticky commit bar의 `확인 필요 N개가 포함돼요. 항목을 열어 확인한 뒤 반영하세요.` 안내를 `8px → 9px`로 올려, 반영 전 확인해야 할 항목이 제출 CTA에 묻히지 않도록 했습니다.
- 검수 editor와 원본 receipt frame의 320px containment, sticky commit action 도달성은 유지했습니다.
- Native receipt viewport: `2 passed`; fixture receipt selection: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.6KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Intake-method recommendation cue pass — 2026-09-21

- 식품 추가 방식 탭에서 기본 진입점인 영수증에만 접근성 이름을 바꾸지 않는 시각적 `추천` cue를 추가해, 네 가지 입력 방식의 선택 우선순위를 모바일에서 즉시 이해할 수 있게 했습니다.
- 320px 탭 폭은 변경하지 않고 cue를 탭 내부에 겹쳐 배치했으며 `aria-hidden`으로 중복 음성 안내를 막았습니다.
- Native 320px sheet: `1 passed`; visible primary-control naming: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.8KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Intake-method recommendation accessibility lock — 2026-09-21

- 영수증 탭의 `추천` cue는 시각적으로만 노출되고 `aria-hidden` 처리되어, 접근성 이름은 기존 `영수증`을 유지합니다.
- 바코드·라벨·직접 입력 탭에는 추천 cue가 생기지 않는지 함께 고정해 입력 방식 간 우선순위가 의도치 않게 확장되지 않도록 했습니다.
- Fixture modal/accessibility focused regression: `1 passed`; `git diff --check`: passed.

## Saved-meal next-action legibility pass — 2026-09-21

- 식단 저장 완료 후 표시되는 `다음: 사용량을 확인하고 조리 완료를 기록해 주세요` 또는 부족 재료 안내를 `9px → 10px`로 올려, 저장 이후의 다음 행동을 결과 카드 안에서 더 쉽게 읽도록 했습니다.
- 식단 결과 first-fold, 저장 action, 조리 완료·skipped ingredient 흐름은 변경하지 않았습니다.
- Native meal viewport: `2 passed`; fixture meal flow: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.8KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Meal-provenance connection cue pass — 2026-09-21

- 대표 식단 결과의 provenance를 `출처 · Rescue Meal 팀 작성 레시피`에서 `출처 · Rescue Meal 팀 작성 레시피 · 재료 100% 연결`처럼 확장해, 추천이 현재 보유 식품을 얼마나 활용했는지 첫 결과에서 바로 판단할 수 있게 했습니다.
- 대체 메뉴·3일 식단에서 이미 사용하던 `재료 N% 연결` vocabulary와 맞춰 결과 간 비교 가능성을 높였습니다.
- Fixture meal flow: `2 passed`; native meal first-fold: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Connected meal-provenance readback — 2026-09-21

- API-backed 대표 식단 결과의 출처·재료 연결률 표시가 연결형 planner에서도 유지되는지 확인했습니다.
- Connected planner: API-backed save `1 passed`, 부족 재료 장보기 focus `1 passed`, lot date-review safety callout `1 passed`.
- 이 검증은 연결형 response·저장·안전 안내 계약을 확인하며, 실제 음식 안전 판정이나 실기기 acceptance를 대신하지 않습니다.

## Meal-provenance readability pass — 2026-09-21

- 식단 결과의 출처·재료 연결률 문구가 기존 `8px`로 너무 작아, `10px`로 올려 추천 근거가 첫 결과에서 읽히도록 했습니다.
- 10px 조정 후에도 식단 결과 first-fold와 저장 후 완료 action 위치가 유지되는지 확인했습니다.
- Native meal viewport: `2 passed`; fixture meal flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Meal-provenance tone pass — 2026-09-21

- provenance 문구의 `ui-monospace` 서체를 기본 본문 서체로 바꾸고 weight를 보강해, `출처 · 레시피 · 재료 연결률`이 개발 로그가 아니라 생활형 신뢰 정보로 읽히도록 조정했습니다.
- 연결률 텍스트와 recipe first-fold 위치는 그대로 유지했습니다.
- Native meal first-fold: `1 passed`; fixture meal flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Meal-safety explanation legibility pass — 2026-09-21

- `사용 전 확인` summary와 날짜·알레르기·부족 재료 개별 설명을 `9px → 10px`로 올려, 위험 판단에 필요한 본문이 제목과 action에 묻히지 않도록 했습니다.
- compact safety guidance의 larger-text scroll reachability와 meal first-fold는 유지했습니다.
- Native safety/meal viewport: `2 passed`; fixture meal flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Shopping-sync note legibility pass — 2026-09-21

- 식단 내부 장보기 목록의 `재고에 추가한 뒤 같은 식단을 다시 동기화하면 보유한 재료는 목록에서 자동으로 빠져요.` 설명을 `8px → 9px`로 올려 구매 완료와 재고 반영의 관계를 읽기 쉽게 했습니다.
- 320px 주요 sheet containment, meal first-fold, 부족 재료 장보기 focus 흐름은 유지했습니다.
- Native meal/sheet viewport: `2 passed`; connected shopping focus: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Shopping-progress explanation legibility pass — 2026-09-21

- 장보기 진행 상태의 보조 설명(`N개를 구매하면 재고에 반영할 수 있어요`, 구매 완료 후 재고 반영 안내)을 `9px → 10px`로 올려 숫자와 다음 행동을 더 쉽게 읽도록 했습니다.
- 320px 주요 sheet containment와 connected 입고·보관 반영 흐름은 유지했습니다.
- Native 320px sheet: `1 passed`; connected shopping receive: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Shopping-action and sync-note legibility pass — 2026-09-21

- 장보기 항목의 `재고에 반영` CTA와 하단 자동 동기화 note를 `8px → 9px`로 올려, 구매 완료 후 재고 반영 행동과 목록 자동 제거 규칙을 더 쉽게 읽도록 했습니다.
- 320px 주요 sheet containment, 부족 재료 장보기 focus, connected 입고·보관 반영 흐름은 유지했습니다.
- Native sheet geometry: `1 passed`; connected planner/shopping flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Dark-theme shopping-safety note pass — 2026-09-21

- 장보기 입고 패널의 `소비기한은 자동 확정하지 않아요. 포장지 날짜를 확인해 주세요.` 안전 문구를 `8px → 9px`로 올려 dark/light sheet 모두에서 데이터 경계를 읽기 쉽게 했습니다.
- Native light/dark detail cues와 320px sheet geometry: `2 passed`; connected shopping receive: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.
- 첫 connected 실행은 webServer 준비 timeout으로 종료됐고 동일 focused test 재실행에서 `1 passed`로 회복됐습니다.

## Accumulated fixture/native readback after shopping dark-mode pass — 2026-09-21

- Fixture/mobile 전체: `61 passed + 3 skipped`; skip은 production runtime/Web Push 환경 lane이며, 의도된 fixture error-boundary console은 recovery test에서 통과했습니다.
- Native viewport 전체: `37 passed`; 320px/393px, dark mode, large text, contrast, keyboard, safe-area, receipt/label, meal, shopping, account, detail 흐름을 재확인했습니다.
- Native 재실행은 직전 사용자 중단으로 남은 4493 webServer를 피하기 위해 격리 포트 `4494`에서 수행했습니다.

## Shopping-sheet entry-label legibility pass — 2026-09-21

- 장보기 sheet 상단 `장보기 목록` kicker를 `8px → 9px`로 올려, sheet 진입점이 진행 상태·CTA와 같은 모바일 가독성 기준으로 읽히도록 했습니다.
- dark/light detail cues와 320px 주요 sheet containment: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Shopping-row source legibility pass — 2026-09-21

- 장보기 항목 row의 수량·출처 보조 정보(`직접 추가 · 식단 1개`, 구매 수량 등)를 `9px → 10px`로 올려, 목록에서 구매 판단에 필요한 정보를 더 쉽게 읽도록 했습니다.
- connected shopping queue·receive flow: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Shopping-action vocabulary parity pass — 2026-09-21

- 장보기 row의 visible CTA를 `재고 반영`에서 `재고에 반영`으로 바꿔, 기존 접근성 label·입고 form·다음 행동 문구와 동일한 action language를 사용하도록 정리했습니다.
- Connected shopping queue·receive flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Home shopping-summary readability pass — 2026-09-21

- 홈의 `장보기 목록` summary card 보조 설명을 `9px → 10px`로 올려, sheet 내부와 동일하게 남은 수량·구매 완료·재고 반영 안내가 읽히도록 했습니다.
- 홈 primary controls naming·shopping queue 진입 흐름은 유지했습니다.
- Fixture home controls: `2 passed`; connected shopping queue: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Home shopping-summary label parity pass — 2026-09-21

- 홈 장보기 summary의 `장보기 목록` kicker를 `8px → 9px`로 올려 sheet 내부 kicker와 동일한 진입 label 기준을 적용했습니다.
- 홈 shopping summary 진입과 connected queue mutation은 유지했습니다.
- Fixture home controls: `2 passed`; connected shopping queue: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-summary readability pass — 2026-09-21

- 알림 sheet summary의 unread·전체 개수 및 처리 상태 보조 문구를 `9px → 10px`로 올려, 알림 우선순위 판단 정보를 장보기·식단 summary와 동일한 가독성 기준으로 맞췄습니다.
- Fixture notification flows: `2 passed`; connected date-reminder/external-sync notification flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-status-chip legibility pass — 2026-09-21

- 알림 row의 외부 연동 상태 chip(`처리 대기`, `반영 완료`, `확인 필요`)을 `8px → 9px`로 올려 row-level priority와 summary의 상태 정보를 같은 기준으로 읽도록 했습니다.
- Fixture notification: `2 passed`; connected external-sync notification flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-row message legibility pass — 2026-09-21

- 알림 row 본문 메시지를 `9px → 10px`로 올려, 날짜·외부 연동 알림의 설명을 상태 chip·summary와 함께 읽을 수 있도록 했습니다.
- Fixture notification flows: `2 passed`; connected date-reminder/external-sync flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-row metadata legibility pass — 2026-09-21

- 알림 row 하단 metadata(알림 종류·severity·생성 시각)를 `8px → 9px`로 올려, 상태 chip·본문과 함께 읽을 수 있도록 row 내부 정보 위계를 마무리했습니다.
- Fixture notification: `2 passed`; connected date-reminder/external-sync flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-sync summary chip legibility pass — 2026-09-21

- 알림 센터 상단 외부 연동 요약 chip의 상태 label(`확인 필요`, `처리 대기`, `반영 완료`)을 `8px → 9px`로 올려 row-level 상태 chip과 동일한 가독성 기준을 적용했습니다.
- Fixture notification: `2 passed`; connected external-sync flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-unread section hierarchy pass — 2026-09-21

- 읽지 않은 알림과 기존 기록을 나누는 `확인할 알림` section label을 `9px → 10px`로 올려, summary·row·상태 chip과 일관된 priority hierarchy를 만들었습니다.
- Fixture notification: `2 passed`; connected date reminder: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-summary first-action pass — 2026-09-21

- unread 알림이 있을 때 summary card에 `첫 알림 보기` action을 추가해, 요약을 읽은 뒤 목록을 직접 찾지 않고 첫 번째 unread row로 바로 이동할 수 있게 했습니다.
- summary는 기존 region semantics를 유지하고, action은 row focus·scroll context만 이동시킵니다.
- Fixture notification summary/return flow: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.5KB` JS, `260.0KB` CSS; runtime integrity: `28 protected files`.

## Connected notification first-action readback — 2026-09-21

- `첫 알림 보기` summary action 추가 후 connected 날짜 reminder·외부 sync·외부 inventory settings notification flows가 기존 detail/return contract를 유지하는지 재확인했습니다.
- Connected notification flows: `3 passed`; runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connected first-unread action contract lock — 2026-09-21

- `첫 알림 보기` summary action이 connected date reminder에서도 첫 unread row focus로 이동한 뒤 기존 notification → food detail → return flow를 유지하는지 고정했습니다.
- Connected date reminder with first-unread action: `1 passed`; fixture notification flow: `1 passed`; `git diff --check`: passed.

## First-unread action legibility pass — 2026-09-21

- 알림 summary의 `첫 알림 보기` action을 `9px → 10px`로 올려 summary count·unread section·row 상태와 동일한 모바일 hierarchy를 적용했습니다.
- Fixture notification: `1 passed`; connected date reminder: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.5KB` JS, `260.0KB` CSS; runtime integrity: `28 protected files`.

## Guidance safety-copy legibility pass — 2026-09-21

- guidance sheet의 상태 경고 본문 `냄새·색·포장 팽창 등이 있으면...`에 `10px`를 명시해 browser/OS 기본 small 축소로 핵심 safety copy가 작아지지 않도록 했습니다.
- 주요 모바일 surface naming·guidance entry flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Guidance-evidence badge legibility pass — 2026-09-21

- guidance row의 근거 badge(`확인됨`, `사용자`, `추정`)를 `9px → 10px`로 올려, 설명 본문과 같은 기준으로 근거 유형이 읽히도록 했습니다.
- guidance entry/detail return flow: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1329.9KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-to-detail return contract lock — 2026-09-21

- 알림에서 날짜 확인이 필요한 식품을 열고 `포장지에서 날짜 다시 확인` 라벨 flow를 거친 뒤 상세를 닫았을 때, 알림 sheet와 원래 notification row focus로 복귀하는 cross-surface regression을 추가했습니다.
- Fixture notification → detail → label review → notification return: `1 passed`; `git diff --check`: passed.

## Notification-context date-save message pass — 2026-09-21

- 알림에서 식품 상세로 들어온 상태에서 날짜를 저장하면 성공 message에 `알림으로 돌아왔어요`를 덧붙여, 저장 결과와 복귀 context를 한 번에 안내하도록 분기했습니다.
- 홈·식품 목록에서 날짜를 저장할 때의 기존 message는 유지해 context별 정보 노출을 구분했습니다.
- Fixture notification return + inventory date save: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Notification-label-review return readback — 2026-09-21

- 알림에서 날짜 확인 필요 식품을 열어 `포장지에서 날짜 다시 확인` → 샘플 라벨 반영 → 상세 닫기까지 수행해 원래 notification row focus 복귀를 실제 flow로 확인했습니다.
- 라벨 반영은 direct date editor가 아닌 식품 추가 mutation path를 사용하므로, 해당 경로의 기존 `식품 목록에 추가했어요` message를 유지했습니다.
- Fixture notification → label review → return: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Date-save context boundary lock — 2026-09-21

- 일반 홈·식품 목록 날짜 저장에는 `알림으로 돌아왔어요`가 붙지 않고, 알림 context 날짜 저장에서만 context message가 붙는 boundary를 regression으로 고정했습니다.
- Fixture notification-context + normal date-save flows: `2 passed`; `git diff --check`: passed.

## Product-provenance candidate legibility pass — 2026-09-21

- 바코드 상품 후보 적용 후 표시되는 출처·신뢰도·보관 기준 안내를 `9px → 10px`로 올려, 저장 전 사용자 확인값과 후보 정보를 더 쉽게 구분하도록 했습니다.
- Native barcode/manual-intake geometry: `2 passed`; fixture barcode/manual-intake flow: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Product-provenance applied-badge legibility pass — 2026-09-21

- 바코드 상품 후보 provenance 카드의 `후보 적용됨` 상태 badge를 `8px → 9px`로 올려, 본문 출처·신뢰도 정보와 적용 상태가 함께 읽히도록 했습니다.
- Native barcode candidate geometry: `1 passed`; fixture barcode flow: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Food-detail date-proof readability pass — 2026-09-21

- 식품 상세의 date-proof·food provenance·opened-state·detail note 설명을 `9px → 10px`로 올려, 날짜 출처와 사용자 확인 경계를 더 쉽게 읽도록 했습니다.
- Native light/dark detail cues: `2 passed`; fixture date-warning/user-confirmed detail flows: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Food-detail date-source label parity pass — 2026-09-21

- 식품 상세 date-proof의 출처 label(`포장지 표시`, `사용자 확인`, `추정`)을 `9px → 10px`로 올려 날짜 설명 본문과 동일한 신뢰 정보 위계를 적용했습니다.
- Native light/dark detail + date-recheck routing: `2 passed`; fixture date-warning/user-confirmed detail: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Storage-mismatch safety-copy legibility pass — 2026-09-21

- 식품 상세의 포장지 보관조건과 현재 위치 mismatch 설명을 `9px → 10px`로 올려, 날짜와 실제 보관 상태가 다를 때 확인해야 할 safety copy를 더 쉽게 읽도록 했습니다.
- Native light/dark detail cues: `1 passed`; connected storage-condition mismatch: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Guest-transfer scope legibility pass — 2026-09-21

- 게스트 transfer sheet의 가져올 기록 scope chip과 자동 병합 방지 note를 `9px → 10px`로 올려, 계정 연결 전에 데이터 범위와 보호 경계를 더 쉽게 읽도록 했습니다.
- Native account viewport: `2 passed`; fixture guest-workspace separation: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `259.9KB` CSS; runtime integrity: `28 protected files`.

## Food-history sync-status legibility pass — 2026-09-21

- 식품 상세 history의 외부 sync 상태 pill(`대기`, `반영 완료`, `실패`)을 `8px → 9px`로 올려 기록 안에서 sync lifecycle을 읽기 쉽게 했습니다.
- Connected storage readback/notification lifecycle: `2 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `260.0KB` CSS; runtime integrity: `28 protected files`.

## Account-transfer contract readback — 2026-09-21

- 게스트 transfer scope copy를 보강한 뒤 계정 연결 sheet의 게스트 workspace separation, password recovery focus, native first-fold, home-indicator safe-area를 재확인했습니다.
- Fixture account flows: `2 passed`; native account viewport: `2 passed`; runtime integrity: `28 protected files`; `git diff --check`: passed.

## Push-delivery status legibility pass — 2026-09-21

- 계정 sheet의 푸시 전달 상태 설명과 `준비됨/대기` badge를 `8px → 9px`로 올려, 연결 전·설정 화면에서도 알림 delivery 상태를 읽기 쉽게 했습니다.
- Native account viewport: `2 passed`; fixture account separation: `1 passed`; production build: `765` Vite modules; bundle budget: `18` JS chunks, `1330.0KB` JS, `260.0KB` CSS; runtime integrity: `28 protected files`.

## Full connected regression after accumulated mobile polish — 2026-09-21

- 전체 connected lane `140개`를 실행했습니다. 첫 pass는 `128 passed / 12 transient timeout failures`였고, 동일한 12개를 `--last-failed`로 재실행해 `12 passed`로 회복했습니다.
- 최종 connected evidence: `140/140 passed`; 실패했던 항목은 shopping receive, storage retry, receipt replay, account re-auth/delete/reset, notification, guest transfer, custom storage 흐름이며 재실행에서 모두 green이었습니다.
- 첫 pass의 실패는 30초 동기화·focus·sheet transition timeout 형태였고, 재실행에서 assertion 회귀로 재현되지 않았습니다. fixture error console은 기존 의도된 error-boundary fixture입니다.

## Mobile theme-toggle state announcement pass — 2026-09-21

- 모바일 헤더의 테마 토글 accessible name을 단순한 전환 명령에서 `현재 라이트모드, 다크모드로 전환` / `현재 다크모드, 라이트모드로 전환`으로 바꿔 현재 상태와 다음 동작을 한 번에 안내합니다. 시각적으로 아이콘만 보이는 모바일 헤더에서도 스크린리더와 자동화 트리의 상태가 일치합니다.
- Fixture theme toggle: `1 passed`; runtime integrity: `28 protected files`; 기존 4174 포트 점유로 인해 실행 중인 4176 Vite 서버를 재사용해 검증했습니다.

## Mobile intake-method guidance pass — 2026-09-21

- 식품 추가 시트의 네 가지 입력 탭 아래에 `처음이라면 영수증`, `여러 식품을 한 번에 읽어요`, `날짜만 필요하면 라벨` 안내를 추가해 모바일 첫 진입에서 추천 경로와 대체 경로의 차이를 즉시 이해하도록 했습니다.
- 기존 `추천` 시각 cue, 탭 accessible name, 키보드 포커스 계약은 유지했습니다.
- Mobile fixture modal semantics/focus: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle: `18` JS chunks, `266.75KB` CSS; `git diff --check`: passed.

## Narrow mobile intake-sheet fit pass — 2026-09-21

- 320px native viewport에서 추천 안내가 추가된 식품 추가 시트를 포함해 주요 native sheet의 좌우 경계와 interactive control overflow를 다시 확인했습니다.
- Native viewport major-sheet fit: `1 passed`; `NATIVE_RUNTIME_TEST_PORT=4494`; 320px dialog scroll width와 interactive out-of-bounds 모두 허용 범위 내였습니다.

## Manual-intake purpose copy pass — 2026-09-21

- 직접 입력 첫 화면에 `식품 정보를 직접 기록해요` heading과 `이름과 보관 위치만 먼저 남겨도 괜찮아요. 날짜는 나중에 포장지를 확인해 보완할 수 있어요.` 설명을 추가해, 자동 인식 방식과 직접 기록 방식의 역할 차이를 명확히 했습니다.
- Manual intake focus/priority follow-up: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Barcode-candidate provenance heading pass — 2026-09-21

- 바코드 결과 목록에 `상품 정보 후보`와 `자동으로 찾은 값은 확인 후 적용해요` 헤더를 추가해, 상품 후보와 사용자가 직접 확인·저장하는 값을 모바일 결과 화면에서 분리해 읽도록 했습니다.
- Barcode lookup/focus/apply flow: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `267.06KB`; `git diff --check`: passed.

## Label-candidate provenance heading pass — 2026-09-21

- 라벨 결과 카드 상단에 `자동 인식 후보`와 `저장 전 확인 필요` 상태를 추가해, OCR 숫자 후보와 사용자가 의미·날짜·보관 위치를 확인한 뒤 저장되는 값의 경계를 바코드 결과와 같은 패턴으로 맞췄습니다.
- Label candidate-confirm-save flow: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `267.40KB`; `git diff --check`: passed.
- 해당 회귀에서 기존의 넓은 `role=status` 선택자가 확인 계약과 저장 toast를 동시에 잡는 문제도 확인해, 결과 검증을 `.toast`로 좁혔습니다.

## Receipt-candidate provenance heading pass — 2026-09-21

- 영수증 검수 상단에 `자동 인식 후보`와 `선택한 항목만 확인 후 반영` 상태를 추가해 여러 상품 후보를 다루는 화면에서도 자동 인식값과 실제 재고 반영 경계를 먼저 안내하도록 했습니다.
- Receipt selected-candidate commit flow: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `267.77KB`; `git diff --check`: passed.
- 기존 검수 테스트의 넓은 `role=status` 선택자도 저장 결과 `.toast`로 좁혀, 상단 확인 계약과 저장 완료 메시지를 구분하도록 정리했습니다.

## Receipt candidate-state color parity pass — 2026-09-21

- 영수증 검수 카드에서 후보 적용 완료 상태는 피스타치오, 후보 적용 후 사용자 수정 상태는 블루 계열로 분리해, 자동 후보와 사용자 확인값의 차이를 텍스트·색상 이중 채널로 전달합니다.
- Connected receipt correction/commit flow: `1 passed` (40.1s); runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `268.33KB`; `git diff --check`: passed.

## Candidate-state dark and narrow viewport pass — 2026-09-21

- 후보 적용 완료 아이콘은 다크모드에서 밝은 피스타치오, 사용자 수정 아이콘은 밝은 블루로 보정하고, 360px 이하에서는 상태 보조 문구를 8px로 줄여 카드와 겹치지 않게 했습니다.
- Native dark source-review and 320px major-sheet fit: `2 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `268.62KB`; `git diff --check`: passed.

## Receipt-submit review announcement pass — 2026-09-21

- 영수증 검수에서 선택 항목 중 확인 필요 항목이 있을 때 하단 경고 note와 `반영하기` CTA를 `aria-describedby`로 연결해, 시각·스크린리더 모두 반영 전 확인 경계를 함께 전달하도록 했습니다.
- Receipt selected-candidate commit and announcement contract: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `268.62KB`; `git diff --check`: passed.

## Receipt first-invalid-item action pass — 2026-09-21

- 영수증 반영이 막힌 경우 validation callout에 `첫 확인 항목 열기` CTA를 추가해 첫 오류 상품 카드로 바로 이동·편집할 수 있게 했습니다. 기존 반영 차단과 오류 메시지는 유지합니다.
- Receipt OCR correction flow with first-invalid action: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `268.81KB`; `git diff --check`: passed.

## Receipt sequential-invalid-item action pass — 2026-09-21

- 여러 확인 필요 항목이 있을 때 현재 편집 중인 항목을 제외한 다음 오류 항목을 우선 열도록 `첫 확인 항목 열기` 동작을 순차 탐색으로 확장하고, 다중 오류 상태에서는 CTA를 `다음 확인 항목 열기`로 바꿨습니다.
- Existing OCR correction plus first-invalid navigation: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt review completion-state pass — 2026-09-21

- 사용자가 오류 항목의 상품명·수량·단위·보관 위치를 실제로 변경하면 원본 OCR의 `requiresReview`와 별개로 사용자 확인 완료 상태를 추적하도록 했습니다.
- 확인 전에는 `확인 필요 N개` 안내를 유지하고, 모두 수정하면 `선택한 항목을 확인했어요. 이제 반영할 수 있어요.` 상태와 CTA 설명으로 즉시 전환합니다.
- Receipt OCR correction and completion feedback: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt explicit-confirm action pass — 2026-09-21

- OCR 후보를 수정하지 않고 원본과 대조해 그대로 사용할 때도 각 확인 필요 항목의 `이 항목 확인했어요` 액션으로 명시적 검수를 남길 수 있게 했습니다.
- 명시적 확인 후에는 수정 없이도 `확인 필요` 안내가 완료 상태로 바뀌고 반영 CTA의 accessible description도 ready hint로 전환됩니다.
- Unchanged OCR explicit-confirm flow: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `269.00KB`; `git diff --check`: passed.

## Receipt confirmed-item persistence cue pass — 2026-09-21

- 명시적으로 확인한 OCR 항목에 `확인 완료` 배지를 남겨 스크롤 후에도 이미 검수한 항목을 식별할 수 있게 했습니다.
- 일반 테마에서는 피스타치오 상태 배지, 다크모드에서는 밝은 피스타치오 대비로 유지합니다.
- Unchanged OCR explicit-confirm plus badge: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `269.38KB`; `git diff --check`: passed.

## Receipt confirmed-state accessibility label pass — 2026-09-21

- `확인 완료` 배지에 `role=status`와 `aria-label=사용자 확인 완료`를 추가해 후보 적용·사용자 수정 상태가 함께 존재해도 확인 완료 상태를 접근성 트리에서 명확히 식별할 수 있게 했습니다.
- Explicit-confirm badge accessible contract: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt confirmed-badge narrow viewport pass — 2026-09-21

- 360px 이하에서 `확인 완료` 배지와 확인 CTA에 최대 폭·ellipsis 규칙을 추가해 후보 적용·사용자 수정 상태가 함께 있어도 카드 폭을 밀어내지 않도록 했습니다.
- Native 320px confirmation-badge bounds: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `269.55KB`; `git diff --check`: passed.

## Receipt pending-review visual priority pass — 2026-09-21

- 아직 확인하지 않은 OCR 카드에 앰버 inset outline, 확인 완료 카드에 중립 피스타치오 outline을 추가해 긴 목록에서 남은 검수 항목이 먼저 보이도록 했습니다.
- Native 320px confirmation-badge bounds: `1 passed`; fixture pending-to-confirmed class transition: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `269.82KB`; `git diff --check`: passed.

## Receipt pending-review scope correction — 2026-09-21

- 미선택한 `requiresReview` 영수증 항목이 현재 반영 대상처럼 강조되지 않도록 pending/confirmed 카드 상태 class를 `checked` 선택 상태와 결합했습니다.
- Explicit-confirm flow regression: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt deselect-reselect confirmation persistence pass — 2026-09-21

- 사용자가 확인 완료한 항목을 잠시 선택 해제했다가 다시 선택해도 확인 완료 상태와 ready hint를 유지하고, 다시 pending 검수를 요구하지 않도록 확인했습니다.
- Deselect/reselect explicit-confirm flow: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt draft fresh-confirmation boundary pass — 2026-09-21

- 저장된 영수증 검수 초안을 다시 열 때 원본 미리보기 없이 상품 정보만 재확인하는 기존 경계를 유지하고, 검수 상태도 재확인해야 한다는 안내를 추가했습니다. 화면을 닫기 전의 로컬 `확인 완료` 상태를 서버 확정값처럼 복원하지 않습니다.
- Connected stored-receipt-draft resume: `1 passed` (44.2s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt draft resume focus-safety pass — 2026-09-21

- 저장된 검수 초안을 다시 열었을 때 첫 확인 필요 항목의 toggle에 자동 포커스가 유지되고, sheet content viewport 안에 실제로 보이는지 확인해 재개 안내와 행동 진입점을 연결했습니다.
- Connected draft-resume focus/visibility: `1 passed` (46.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt sequential-confirm focus handoff pass — 2026-09-21

- 확인 필요 항목의 `이 항목 확인했어요`를 누르면 남은 선택·미확인 항목의 카드 toggle로 자동 스크롤·포커스하도록 연결했습니다. 마지막 항목이면 ready hint만 남기고 포커스를 빼앗지 않습니다.
- Existing explicit-confirm final-item flow: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt confirmed-state accessibility parity pass — 2026-09-21

- `확인 완료` 배지와 카드의 숨김 `aria-describedby` 상태 문구를 `사용자 확인 완료`로 동기화해, 시각 상태와 스크린리더 상태가 더 이상 `읽어낸 내용 확인 필요`로 엇갈리지 않게 했습니다.
- Explicit-confirm accessibility parity: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt confirmed-state live announcement pass — 2026-09-21

- `확인 완료` badge에 `aria-live=polite`와 `aria-atomic=true`를 추가해 동적 확인 상태 전환을 스크린리더가 한 덩어리의 상태로 읽도록 했습니다.
- Explicit-confirm live announcement contract: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt confirm-action context parity pass — 2026-09-21

- `이 항목 확인했어요` 버튼을 해당 카드의 `receipt-line-status`에 `aria-describedby`로 연결해, 확인 액션 포커스 시 현재 OCR 후보 상태를 함께 이해하도록 했습니다.
- Explicit-confirm action context contract: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Connected draft focus-context parity pass — 2026-09-21

- 저장된 검수 초안 재개 시 자동 포커스된 첫 toggle이 `receipt-line-status`를 `aria-describedby`로 참조하고, 접근성 설명 `읽어낸 내용 확인 필요`가 실제 연결돼 있는지 확인했습니다.
- Connected draft focus/accessibility context: `1 passed` (24.2s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt review-state dark-surface pass — 2026-09-21

- 다크모드에서 확인 필요 카드의 앰버 edge와 확인 완료 카드의 피스타치오 surface를 별도 보정해 light 전용 checked background가 남지 않도록 했습니다.
- Native dark receipt-review state legibility: `1 passed`; runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.19KB`; `git diff --check`: passed.

## Receipt source-preview emphasis precedence pass — 2026-09-21

- 원본 위치를 열어 확인하는 카드에서는 source-preview 강조를 pending/confirmed 상태보다 우선하도록 border와 inset edge를 재정의해, 원본 대조 중인 항목이 명확히 보이게 했습니다.
- Connected receipt source-preview plus correction flow: `1 passed` (39.8s); runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.34KB`; `git diff --check`: passed.

## Receipt source-preview surface emphasis pass — 2026-09-21

- source-active 영수증 카드에 약한 coral tint를 추가해 border/inset뿐 아니라 배경에서도 원본 대조 중인 항목을 식별할 수 있게 했습니다. 다크모드에서는 낮은 강도의 coral surface로 보정합니다.
- Connected source-preview/correction flow: `1 passed` (39.8s); runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.51KB`; `git diff --check`: passed.

## Receipt source-editing precedence pass — 2026-09-21

- 원본 영역 선택으로 상품 수정이 열린 상태에서는 editing의 피스타치오 입력 강조를 주 상태로 유지하고, source-preview는 coral outer ring으로 보조해 입력 중 상태가 원본 강조에 묻히지 않도록 했습니다.
- Connected source-selection/editing flow: `1 passed` (43.0s); runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.87KB`; `git diff --check`: passed.

## Receipt source-editing precedence readback — 2026-09-21

- source-active와 editing 상태를 함께 유지하면서 editing의 피스타치오 주 강조와 source-preview coral 보조 ring을 적용했습니다. focus 자동 이동은 기존 검수 계약과 후속 enrichment lifecycle에 영향을 주지 않도록 추가하지 않았습니다.
- Connected source-preview/correction flow: `1 passed` (38.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.87KB`; `git diff --check`: passed.

## Receipt source-active accessibility context pass — 2026-09-21

- source-active 카드의 숨김 상태 설명에 `원본 위치 확인 중`을 추가해, 시각적 coral 강조와 스크린리더 설명이 같은 source-preview 맥락을 전달하도록 했습니다.
- Connected source-preview/correction/accessibility flow: `1 passed` (42.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt source-hit target state parity pass — 2026-09-21

- 원본 위치 선택 hit target에 `aria-pressed`를 추가해 active source observation box의 시각 상태와 접근성 상태를 동기화했습니다.
- Connected source observation/correction flow: `1 passed` (37.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.87KB`; `git diff --check`: passed.

## Receipt multi-observation pressed-state contract pass — 2026-09-21

- 같은 상품 line에 연결된 여러 원본 observation은 하나의 active source line으로 함께 강조되므로, 각 hit target의 `aria-pressed=true`가 시각 source box active 상태와 일치하는지 확인했습니다.
- Connected multi-observation source/correction flow: `1 passed` (37.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Connected receipt state-precedence readback — 2026-09-21

- 연결형 영수증에서 후보 적용 후 사용자 수정 상태가 나타날 때 `확인 완료` badge가 접근성 label `사용자 확인 완료`로 함께 노출되고, 사용자 수정 상태와 충돌하지 않는지 확인했습니다.
- Connected receipt correction/state readback: `1 passed` (38.1s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt source-observation count context pass — 2026-09-21

- source preview heading에 `원본 위치 N곳 확인 중`을 추가해 같은 상품에 여러 observation이 연결된 경우 대조 범위를 즉시 이해하도록 했습니다. 기존 `현재 항목 · 상품명` accessible text prefix는 유지했습니다.
- Connected multi-observation source/correction context: `1 passed` (42.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native source-observation count context pass — 2026-09-21

- 320px native source-review fixture에서도 source preview header의 `원본 위치 N곳 확인 중` 문구가 기존 상품명 context와 함께 노출되는지 확인했습니다.
- Native explicit receipt source review: `1 passed` (3.9s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt active-source-count DOM contract pass — 2026-09-21

- source preview region에 `data-active-source-count`를 추가해 현재 active line에 연결된 원본 observation 수를 DOM 계약으로 명시했습니다. 이후 multi-line fixture에서 active count 교체를 직접 검증할 수 있습니다.
- Connected active-source-count contract: `1 passed` (36.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt active-source-line DOM contract pass — 2026-09-21

- source preview region에 `data-active-source-line`을 추가해 active observation count와 함께 현재 상품 line context를 DOM에서 직접 검증할 수 있게 했습니다. 화면·접근성 문구는 그대로 유지합니다.
- Connected active-source-line context: `1 passed` (43.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt stale-active-line guard pass — 2026-09-21

- 실제 active observation이 0개인 경우 stale `activeLineLabel`이 `data-active-source-line`에 남지 않도록 count와 line context를 결합했습니다. source preview의 header·DOM contract가 동일한 active 범위를 가리킵니다.
- Connected source/correction regression: `1 passed` (38.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt PDF no-observation context pass — 2026-09-21

- PDF 원본처럼 observation 위치가 없는 source preview에서는 `data-active-source-count=0`, `data-active-source-line=""`을 유지하고 PDF 위치 자동 강조 불가 안내를 함께 노출하도록 계약을 확인했습니다.
- Fixture PDF source-review fallback: `1 passed` (1.5s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt unmapped-observation fallback copy pass — 2026-09-21

- 이미지 영수증에 OCR review observation은 있지만 상품 line에 연결된 label이 하나도 없는 경우를 PDF와 구분해, `원본 위치를 상품 항목에 자동으로 연결하지 못했어요. 추출 결과와 원본을 직접 대조해 주세요.` 안내를 사용하도록 fallback copy를 정리했습니다.
- Existing PDF source-review regression: `1 passed` (1.4s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native cross-line source-transition pass — 2026-09-21

- 기존 native source-review fixture의 시금치·두부·맛타리버섯 서로 다른 상품 line을 활용해 맛타리버섯에서 시금치로 source selection을 이동시키고, 이전 hit target의 `aria-pressed`, header 상품명, `data-active-source-line`이 새 line context로 교체되는지 확인했습니다.
- Native cross-line source transition: `1 passed` (5.4s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native dark cross-line source-transition pass — 2026-09-21

- 동일 native source-review fixture를 다크모드로 실행해 맛타리버섯에서 국내산 시금치로 source selection을 전환하고, 이전/새 hit target pressed 상태·header 상품명·`data-active-source-line`을 함께 확인했습니다.
- Native dark cross-line transition: `1 passed` (4.4s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native zoomed cross-line source-transition pass — 2026-09-21

- 320px 다크 native source preview를 확대한 상태에서 맛타리버섯/시금치 context 이후 국산콩 두부 observation으로 이동해 header·`data-active-source-line`·pressed 상태·active box 존재를 함께 확인했습니다.
- Native zoomed cross-line transition: `1 passed` (5.1s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native zoom-collapse source-state persistence pass — 2026-09-21

- 확대 상태에서 시금치/두부 source context를 전환한 뒤 상품 수정 화면으로 이동하고 원본을 축소해도 새 상품 line header·`data-active-source-line`·pressed 상태가 유지되는지 확인했습니다.
- Native zoom-collapse source persistence: `1 passed` (7.1s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native source-edit-close context restoration pass — 2026-09-21

- 확대 source preview에서 상품 line을 전환하고 수정 화면을 연 뒤 수정 닫기를 수행해도 마지막 상품의 header·`data-active-source-line`·source hit target pressed 상태가 유지되는지 확인했습니다.
- Native source-edit-close restoration: `1 passed` (6.8s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native source-preview reopen context persistence pass — 2026-09-21

- source preview를 닫았다가 다시 열 때 기본 line으로 초기화하지 않고 마지막 active 상품 line인 `맛타리버섯` context를 복원하는 실제 동작을 확인했습니다. 사용자가 검수하던 원본 위치를 다시 찾지 않아도 되는 정책입니다.
- Native source-preview reopen persistence: `1 passed` (7.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native source-preview reopen zoom-reset pass — 2026-09-21

- source preview 재개 시 마지막 active 상품 line은 복원하지만 확대 상태는 안전한 기본값으로 돌아와 `원본 확대`/ `aria-pressed=false`를 제공하는 정책을 확인했습니다.
- Native source-preview reopen zoom reset: `1 passed` (6.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Source-preview reopen focus boundary audit — 2026-09-21

- source preview 재개 시 active 상품 context와 zoom reset은 복원되지만, 현재 컴포넌트가 닫힘·재개 사이에 유지되는 구조라 active hit target 자동 focus는 추가하지 않았습니다. 포커스를 억지로 이동하지 않고 기존 dialog focus 계약을 보존하는 경계로 남겼습니다.
- Native context/zoom regression after focus audit: `1 passed` (7.2s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt source-preview mode DOM contract pass — 2026-09-21

- source preview region에 `data-source-preview-mode`을 추가해 이미지·PDF 입력 유형을 DOM에서 직접 식별할 수 있게 했습니다. PDF fallback은 `pdf`, active count `0`, active line 빈 값 계약을 함께 유지합니다.
- Fixture PDF source mode contract: `1 passed` (1.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt source-preview fallback live-copy pass — 2026-09-21

- source preview hint paragraph에 `aria-live=polite`, `aria-atomic=true`를 추가해 mapped image·unmapped image·PDF fallback 안내가 상태 전환 시 보조기술에도 한 덩어리로 전달되도록 했습니다.
- Fixture PDF fallback live-copy contract: `1 passed` (1.5s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Image unmapped-observation fixture pass — 2026-09-21

- 실제 이미지 source-review fixture에서 OCR observations는 유지하되 상품 line mapping을 제거한 `receipt_source_unmapped=1` 경로를 추가했습니다.
- 이 상태는 `data-source-preview-mode=image`, active count `0`, active line 빈 값, hit target `0개`, `원본 위치를 상품 항목에 자동으로 연결하지 못했어요` 안내를 함께 검증합니다.
- Image unmapped fallback fixture: `1 passed` (1.9s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Image unmapped manual-line-recovery pass — 2026-09-21

- unmapped image 상태에서도 상품 line의 수동 수정 editor가 열리고, source preview는 `data-active-source-count=0`, `data-active-source-line=""`을 유지해 원본 mapping fallback과 line 보정을 분리했습니다.
- Image unmapped manual recovery: `1 passed` (1.6s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Image unmapped manual-commit-readiness pass — 2026-09-21

- unmapped image line editor에서 상품명을 사용자 값으로 보정하면 source mapping count/line은 `0/empty`로 유지하면서도 receipt review ready hint로 전환되는 것을 확인했습니다.
- Image unmapped manual correction/readiness: `1 passed` (2.0s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Image unmapped manual-deselect-reselect pass — 2026-09-21

- unmapped image line을 사용자 값으로 보정한 뒤 선택 해제·재선택해도 ready hint는 유지되고 source mapping fallback의 count/line `0/empty` 계약은 변하지 않는지 확인했습니다.
- Image unmapped deselect/reselect readiness: `1 passed` (2.2s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Image unmapped manual-commit end-to-end pass — 2026-09-21

- unmapped image 상태에서 상품 line을 수동 보정한 뒤 `3개 항목 반영하기`를 실행해 검수 완료 toast까지 도달하는 end-to-end 흐름을 확인했습니다. source mapping fallback `0/empty`는 반영 전까지 유지됩니다.
- Image unmapped manual correction/commit: `1 passed` (2.0s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Image unmapped inventory-readback pass — 2026-09-21

- unmapped image에서 사용자 보정 상품명으로 반영한 뒤 toast뿐 아니라 `내 식품 목록`에 `새송이버섯` line이 실제 표시되는 readback까지 확인했습니다.
- Image unmapped correction/inventory readback: `1 passed` (3.2s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt batch-readback follow-up boundary pass — 2026-09-21

- unmapped image 수동 보정 후 receipt batch 반영은 완료 toast와 inventory readback까지 제공하지만, 단건 manual-add처럼 `toast-action`으로 날짜 확인까지 자동 연결하지 않는 현재 계약을 확인했습니다.
- Image unmapped correction/inventory readback remains: `1 passed` (2.8s); 후속 날짜 action은 receipt batch UX 개선 후보로 별도 범위를 유지합니다.

## Receipt batch follow-up lifecycle safety pass — 2026-09-21

- batch 반영 직후 local `lineFoods`를 detail sheet에 바로 전달하는 후속 CTA는 authoritative inventory readback 이전에 stale detail이 열릴 수 있어 적용하지 않았습니다. 현재는 완료 toast + inventory readback 계약을 유지합니다.
- Image unmapped correction/inventory readback: `1 passed` (2.8s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## API receipt authoritative follow-up action pass — 2026-09-21

- API receipt commit의 authoritative `commit.inventory` readback 이후에만 날짜 미확인 첫 식품의 `날짜·보관 상태 확인` CTA를 생성하도록 연결했습니다. external sync attention이 있으면 기존 `연동 상태 확인` action을 우선합니다.
- Connected receipt correction flow: `1 passed` (37.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt follow-up priority selection pass — 2026-09-21

- API receipt commit readback의 날짜 미확인 식품 후보를 배열 순서가 아니라 `priority` 오름차순으로 정렬해 첫 `날짜·보관 상태 확인` CTA가 실제 소비 우선순위 식품을 가리키도록 보강했습니다.
- Connected receipt correction flow: `1 passed` (38.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt follow-up deterministic tie-break pass — 2026-09-21

- priority가 같은 날짜 미확인 식품의 후속 CTA 대상이 서버 배열 순서에 흔들리지 않도록 `priority → 이름(ko) → id` deterministic sort를 추가했습니다.
- Connected receipt correction flow: `1 passed` (36.4s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Receipt follow-up inventory-return focus boundary pass — 2026-09-21

- batch 후속 날짜 action이 `openDetail(food, "inventory")` 경로를 사용해 기존 inventory return context capture/restore 계약을 재사용하는지 source·build 기준으로 확인했습니다.
- Source check: `captureInventoryReturnContext`와 `openDetail` inventory path 유지; runtime integrity: `28 protected files`; `git diff --check`: passed; production build: `765` Vite modules.

## Connected receipt authoritative-follow-up fixture pass — 2026-09-21

- 외부 sync attention이 없는 별도 connected fixture에서 receipt commit 응답에 날짜 미확인 inventory를 반환하도록 구성했습니다.
- authoritative readback 이후 `날짜·보관 상태 확인` toast action이 생성되고, 클릭 시 해당 식품 detail의 `포장지에서 확인한 날짜 입력` focus로 진입하는 end-to-end 흐름을 확인했습니다.
- Connected authoritative receipt follow-up: `1 passed` (26.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Connected receipt follow-up date-save pass — 2026-09-21

- authoritative inventory readback으로 열린 날짜 review detail에서 소비기한과 날짜를 선택해 실제 date-assertion PATCH를 수행하고, 사용자 확인 소비기한 저장 toast까지 이어지는 end-to-end 흐름을 확인했습니다.
- Connected receipt commit/readback/date-save: `1 passed` (21.3s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Connected receipt date-save inventory-return-focus pass — 2026-09-21

- receipt authoritative follow-up detail에서 날짜를 저장한 뒤 detail이 닫히고 원래 inventory row가 다시 focus되는 return lifecycle을 연결했습니다.
- inventory return context가 scroll만 복원하던 gap을 row focus까지 복원하도록 보강했습니다.
- Connected receipt commit/readback/date-save/return-focus: `1 passed` (31.9s); runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Inventory return-focus no-offset safe-area pass — 2026-09-21

- inventory return context에 이전 row offset이 없는 fallback에서는 대상 row를 viewport 중앙으로 reveal한 뒤 focus하도록 보강해 320px/safe-area에서 화면 밖 focus가 남지 않게 했습니다.
- runtime integrity: `28 protected files`; production build: `765` Vite modules; bundle CSS: `270.87KB`; `git diff --check`: passed.

## Manual quantity validation parity pass — 2026-09-21

- 직접 입력 수량이 `0`, 음수, 숫자로 해석되지 않는 값이면 빠른 추가 CTA를 disabled로 만들고 `수량은 0보다 큰 숫자로 입력해 주세요.` alert를 노출하도록 보강했습니다. 빈 값은 기존 기본값 `1개` 정책을 유지합니다.
- Fixture manual intake focus regression: `1 passed` (5.8s); live dark-mode AX state에서 quantity `0`과 disabled CTA/alert를 확인; runtime integrity: `28 protected files`; production build: `765` Vite modules; `git diff --check`: passed.

## Native manual-intake first-action reachability pass — 2026-09-21

- 320px native viewport에서 식품 이름을 입력하면 `식품 추가하기` action bar가 이름 입력 바로 아래에 남아 첫 sheet viewport에서 보이도록 배치 순서를 조정했습니다. 수량·보관 위치 입력을 먼저 요구하지 않으면서도 기존 수량 검증과 sticky 동작은 유지합니다.
- 기존 native viewport 전체 회귀에서 해당 경로가 실패한 뒤, 단일 재현 테스트 `keeps the manual-food action reachable after entering a name`: `1 passed` (2.5s); 기존 전체 native run: `38 passed, 1 failed` (수정 전 재현); runtime integrity: `28 protected files`.

## Narrow intake guidance wrapping pass — 2026-09-21

- 360px 이하 시트에서 입력 방식 안내가 한 줄 고정 및 overflow clipping으로 잘릴 수 있던 정보 노출 계약을 확인했습니다. 좁은 폭에서만 안내를 줄바꿈하고 각 안내 문장이 남은 폭을 사용하도록 조정해 `영수증·라벨·직접 입력` 선택 기준을 계속 읽을 수 있게 했습니다.
- Native narrow-sheet regression subset: `4 passed` (8.3s); runtime integrity: `28 protected files`.

## Dark home priority metadata contrast pass — 2026-09-21

- 다크모드 홈 우선순위 카드의 식품 보조 정보·보관 메타·날짜 출처가 기본 `dim` 토큰에 묻히지 않도록 홈 범위에서만 밝은 중립색으로 승격했습니다. 날짜 경고와 표시 날짜는 각각 coral/blue 의미색을 유지하면서 읽기 대비를 보강했습니다.
- Native dark/contrast regression subset: `3 passed` (6.8s); runtime integrity: `28 protected files`.

## Priority-card action description pass — 2026-09-21

- 홈 우선순위 식품 카드의 시각적 chevron만으로 상세 진입 의도를 전달하던 경계를 보완해, 각 카드에 `식품 상세 정보를 열어 날짜와 보관 상태를 확인해요.` 설명을 연결했습니다. 기존 accessible name과 포커스 복귀 계약은 유지합니다.

## Detail consume safety context pass — 2026-09-21

- 날짜 확인 또는 보관 상태 재확인이 필요한 식품의 `먹었어요` 버튼에 시각적 문구를 중복하지 않고 접근성 설명을 연결했습니다. 확인창 진입 전에 `날짜와 보관 상태를 확인한 뒤 ...` 맥락을 읽어 주어, 버튼 라벨은 기존 테스트·사용자 습관과 호환되면서 행동의 전제는 명확해졌습니다.

## Detail action grouping pass — 2026-09-21

- 상세 하단 행동을 `식품 기록 행동` 그룹으로 노출하고, 소비 기록(`먹었어요`)과 재고 상태 수정(`변경 저장`)에 전용 클래스·시각 표면을 부여했습니다. 소비 행동은 pistachio 계열의 보조 surface, 실제 저장 가능한 변경은 blue shadow로 구분해 두 행동의 결과 차이를 빠르게 인지할 수 있게 했습니다.
- Native detail action regression: `3 passed` (6.5s); runtime integrity: `28 protected files`.

## Detail destructive-action boundary pass — 2026-09-21

- `폐기 기록`을 소비·상태 수정과 같은 행동 행에서 분리해 `예외 처리` 그룹으로 감쌌습니다. coral 계열의 얇은 구분선과 라벨로 실수 가능성이 높은 행동임을 알리고, 기존 확인 단계·부분 폐기·inventory row focus 복귀는 유지했습니다.
- Prototype discard regression: `2 passed` (5.6s).

## Shopping-list exception-action boundary pass — 2026-09-21

- 장보기 항목의 `재고에 반영`과 삭제 아이콘을 하나의 행동 그룹으로 묶되, 삭제 버튼에는 coral outline/surface와 focus 상태를 부여해 구매 흐름을 끊는 예외 행동임을 구분했습니다. 항목별 행동 그룹 accessible label도 추가했습니다.
- Connected shopping mutation regression: `2 passed` (36.5s).

## Receipt review commit-state boundary pass — 2026-09-21

- 영수증 고정 반영 바에 `needs-confirmation / ready / empty` 상태 계약과 접근성 그룹 라벨을 추가했습니다. 확인 필요 상태는 amber 상단 경계, 반영 가능 상태는 pistachio 경계, 선택 없음 상태는 그림자 없는 비활성 표면으로 구분해 자동 인식 후보 → 사용자 확인 → 재고 반영 단계를 명확히 했습니다.
- Native receipt subset: `3 passed` (6.2s); prototype receipt regression: `10 passed` (18.6s).

## Shopping receive step-rail pass — 2026-09-21

- 구매 완료 후 장보기 항목을 재고로 옮기는 패널에 `구매 완료 → 재고 반영 → 날짜 확인` 3단계 rail을 추가했습니다. 현재 단계와 완료 단계를 pistachio로 표시하고, 재고 반영 뒤 날짜 확인이 남는다는 정보 경계를 구매 입력 직전에 노출합니다.
- Connected receive flow: `1 passed` (32.2s).

## Shopping receive next-action handoff pass — 2026-09-21

- 서버 readback이 성공하고 inventory lot이 생성된 장보기 반영 성공 toast에도 `날짜·보관 상태 확인` action을 연결했습니다. toast action은 최근 반영된 식품 detail로 진입해 포장지 날짜 확인 CTA를 이어서 사용할 수 있고, readback 실패 시 기존 `최신 재고 확인` action 계약을 유지합니다.

## Shopping receive return-context compatibility pass — 2026-09-21

- 장보기 성공 toast의 `날짜·보관 상태 확인` action은 기존 `식품 상세 확인` 버튼과 동일한 inventory detail 진입 계약을 재사용하도록 유지했습니다. 상세 날짜 저장 후 inventory row focus 복귀를 보존해 기존 진입점의 복귀 기대를 깨지 않습니다.

## Notification detail-entry intent pass — 2026-09-21

- 알림에서 식품 상세로 진입할 때도 홈·inventory 카드와 동일하게 날짜 확인 필요 상태는 날짜 CTA, 상품 출처만 검토할 상태는 provenance CTA를 초기 focus 대상으로 계산하도록 맞췄습니다. 알림 읽음 처리 중 원격 변경이 발생해도 알림 센터 복귀/focus 계약은 유지했습니다.
- Demo notification flow: `1 passed` (4.8s); connected queued-notification refresh flow: `1 passed` (41.0s).

## Notification date-save action precedence pass — 2026-09-21

- 알림에서 날짜를 저장한 경우에는 알림 센터의 원래 row focus 복귀를 primary outcome으로 두고, 홈용 `다음 우선 식품 확인` toast action은 노출하지 않도록 분기했습니다. 홈·inventory 진입에서 저장한 경우에는 기존 다음 우선 식품 action을 유지합니다.
- Notification date review return regression: `1 passed` (6.6s).

## Notification focus-scope isolation pass — 2026-09-21

- 알림 센터의 `첫 알림 보기`와 외부 연동 상태 요약 focus target을 전역 document가 아닌 현재 notification sheet 내부로 제한했습니다. force-mounted/숨겨진 다른 sheet의 stale row가 focus를 가로채지 않도록 범위를 고정했습니다.

## Connected notification sync-focus isolation pass — 2026-09-21

- 외부 연동 lifecycle 요약의 `확인 필요 / 처리 대기 / 반영 완료` 버튼이 현재 열린 알림 sheet 내부의 해당 row로만 이동하는지 connected fixture에서 확인했습니다. 각 상태 count/label과 row focus 복귀가 함께 유지됩니다.
- Connected notification sync lifecycle: `1 passed` (28.1s).

## Account external-sync focus-scope isolation pass — 2026-09-21

- 계정의 외부 재고 연동 패널도 outbox 상세·상품 연결 작업·완료 작업 focus 탐색을 전역 document가 아닌 현재 패널 내부로 제한했습니다. force-mounted 다른 계정/알림 surface의 동일한 data attribute가 focus를 가로채지 않도록 알림 센터와 동일한 scope 계약을 적용했습니다.
- Connected notification sync lifecycle after account-panel scope change: `1 passed` (25.1s).

## Account external-sync semantic-surface pass — 2026-09-21

- 계정 외부 재고 연동 상태 카드와 outbox 작업 표면을 알림 센터와 같은 의미색으로 맞췄습니다. 연결됨/정상은 pistachio, 연결 확인 필요·서버 설정 필요·worker 오류는 coral, 처리 대기·처리 중은 blue, 반영 완료는 pistachio surface로 노출합니다.
- Connected external-sync settings entry: `1 passed` (19.1s).

## Account external-sync action hierarchy pass — 2026-09-22

- 계정 외부 연동 작업의 primary action을 상태 의미에 맞게 분리했습니다. 상품 연결과 `반영됨` 확인은 pistachio 진행 surface, `미반영·재시도`는 blue 복구 surface로 구분해 연결·확인·복구 행동을 혼동하지 않게 했습니다.
- Connected external-sync settings entry after action styling: `1 passed` (31.1s).

## Account external-sync task-state badge pass — 2026-09-22

- reconciliation 작업에는 `확인 필요`, dead-letter 작업에는 `재시도 대기` 상태 배지를 추가하고, 각각의 행동 그룹 accessible label을 연결했습니다. 사용자가 버튼을 읽기 전에 작업의 현재 상태와 필요한 복구 강도를 먼저 파악할 수 있도록 했습니다.
- Connected external-sync settings entry after task-state labeling: `1 passed` (29.1s).

## Account external-sync overall-action state pass — 2026-09-22

- 외부 동기화 요약 카드에 `attention / processing / pending / clear` 상태 계약을 추가했습니다. 확인이 필요한 작업은 amber, 처리 중·대기는 blue, 대기 없음·최근 완료는 pistachio로 surface를 맞추고, `지금 동기화`를 pending 상태의 primary action으로 강조했습니다.
- Connected external-sync settings entry after overall-state styling: `1 passed` (44.2s).

## Account external-sync transition-action pass — 2026-09-22

- outbox 요약 카드의 상태 전이와 primary action을 connected fixture에서 확인했습니다. 상품 매핑 저장 후 `pending`/`지금 동기화`, 동기화 완료 후 `clear`/최근 반영 완료, 완료 작업 detail focus 복귀가 한 흐름으로 유지됩니다.
- Connected mapping notification → mapping → sync → completed detail focus: `1 passed` (28.7s).

## Account external-sync retry-focus handoff pass — 2026-09-22

- dead-letter 재시도 또는 reconciliation의 `미반영·재시도`가 성공해 작업이 pending으로 돌아오면, 새로 활성화된 `지금 동기화` 버튼으로 focus를 넘기도록 보강했습니다. 실패 목록에 focus가 남아 다음 행동을 찾기 어려워지는 문제를 줄였습니다.
- Connected dead-letter requeue flow: `1 passed` (20.0s).

## Account external-sync retry-error focus pass — 2026-09-22

- 외부 연동 재시도·reconciliation mutation이 다시 실패하면 현재 계정 연동 패널 안의 `다시 시도`/`최신 상태 확인` action으로 focus를 자동 이동하도록 보강했습니다. 다른 sheet의 동일한 오류 action은 탐색하지 않습니다.
- Connected dead-letter requeue flow after retry-focus guard: `1 passed` (27.1s).

## Account-to-notification return boundary audit — 2026-09-22

- 외부 연동 상태 요약에서 알림 → 계정 설정으로 진입한 뒤, 작업 상태를 확인하고 계정 panel을 닫으면 원래 notification row와 상태 summary가 유지되는지 재검증했습니다. account 내부 focus scope와 notification 복귀 focus가 함께 깨지지 않습니다.
- Connected notification lifecycle + account return subset: `2 passed` (44.9s).

## Account external-sync narrow-mobile layout pass — 2026-09-22

- 360px 이하 모바일 시트에서 상품 연결 입력·상태 배지·reconciliation action이 서로 밀리지 않도록 compact grid와 badge typography를 추가했습니다. 상태 의미와 action target은 유지하면서 좁은 폭의 입력/버튼 경계를 보강했습니다.
- Connected mapping notification → account task focus regression: `1 passed` (26.4s).

## Native full-lane account-layout audit — 2026-09-22

- 계정 외부 연동 narrow-mobile compact layout 변경이 다른 native sheet의 safe-area·sticky action·focus 계약에 영향을 주지 않는지 전체 native lane으로 재검증했습니다.
- Native viewport suite: `39 passed` (1.2m).

## Account external-sync reopen-focus pass — 2026-09-22

- protected BottomSheet runtime을 수정하지 않고, 앱 소유 `GrocyIntegrationPanel`의 마지막 focused outbox ref를 활용해 account panel이 다시 active가 될 때 마지막 작업 상세/상품 연결 task로 focus를 복원하도록 보강했습니다. 최초 진입이나 일반 account 진입에는 stale focus를 강제로 적용하지 않습니다.
- Connected external-sync entry + mapping-task focus regression: `2 passed` (33.2s); runtime integrity: `28 protected files`.

## Account external-sync stale-reopen guard pass — 2026-09-22

- account reopen 시 마지막 focused outbox가 그 사이 `반영 완료`로 바뀌었다면 완료 작업에 stale focus를 다시 주지 않고, 현재 pending/blocked/reconciliation/dead-letter 등 actionable 작업을 우선 탐색하도록 보강했습니다. 알림에서 명시적으로 선택한 완료 작업의 직접 진입 focus는 유지합니다.
- Connected completed-outbox direct entry + mapping-task focus regression: `2 passed` (34.2s).

## Account external-sync actionable-focus priority pass — 2026-09-22

- reopen 시 마지막 작업이 완료된 경우의 fallback을 서버 배열 순서가 아니라 `blocked → reconciliation_required → dead_letter → pending → in_flight` 우선순위로 정렬했습니다. 사용자가 가장 먼저 개입해야 하는 상태를 먼저 focus합니다.
- Connected completed-outbox direct entry + mapping-task focus regression after priority ordering: `2 passed` (32.7s).

## Notification external-sync actionable-order parity pass — 2026-09-22

- 알림 센터의 외부 연동 요약 focus도 계정 panel과 같은 actionable ordering을 사용하도록 맞췄습니다. `처리 대기` 요약에서는 queued를 processing보다 먼저 focus하고, 현재 열린 notification sheet 내부의 row만 탐색합니다.
- Connected notification sync lifecycle after ordering parity: `1 passed` (34.1s).

## Home external-sync summary parity pass — 2026-09-22

- 홈 외부 연동 summary가 `확인 필요 → 처리 대기 → 처리 중` 상태를 분리해 표시하고, `data-sync-focus`로 알림 센터의 첫 focus 상태를 명시하도록 보강했습니다. 처리 중만 있을 때도 대기 문구를 잘못 보여주지 않고 `처리 중`으로 안내합니다.
- Connected home → notification external-sync lifecycle: `1 passed` (34.0s).

## Home external-sync semantic-surface pass — 2026-09-22

- 홈 외부 연동 summary의 `data-sync-focus` 상태에 따라 확인 필요는 amber surface, 대기·처리 중은 blue surface로 시각 구분했습니다. 홈에서도 알림·계정 설정과 동일한 상태 의미를 첫 화면에서 전달합니다.
- Connected home → notification external-sync lifecycle after surface styling: `1 passed` (30.1s).

## Home cross-device readback audit — 2026-09-22

- dashboard workspace invalidation이 `syncDashboard`를 통해 inventory와 notification을 함께 readback하는 경로를 재검증했습니다. 다른 기기 변경 후 홈 재고가 갱신되고, 동일한 refresh cycle에서 홈 외부 연동 summary가 stale 상태로 남지 않는 구조를 확인했습니다.
- Connected home cross-device dashboard revision: `1 passed` (41.8s).

## Home external-sync accessible-state contract pass — 2026-09-22

- 홈 외부 연동 summary에 상태별 count data attribute와 명시적 accessible name을 추가했습니다. 스크린리더에서도 `확인 필요/처리 대기/처리 중` 상태와 `알림 센터에서 상태 확인` 다음 행동을 한 번에 읽을 수 있습니다.
- Connected home → notification external-sync lifecycle after accessible contract: `1 passed` (30.2s).

## Cross-surface sync-count metadata parity pass — 2026-09-22

- 홈 summary, notification summary, account outbox summary에 동일한 count metadata 계열을 추가했습니다. attention/queued-processing/applied 또는 unread count를 DOM data contract로 노출해 QA·접근성·후속 automation이 같은 상태 모델을 읽을 수 있게 했습니다.
- Home accessibility audit: `1 passed` (1.9s); connected notification sync lifecycle: `1 passed` (26.9s).

## Cross-surface sync-count connected assertion pass — 2026-09-22

- connected fixture에서 홈 summary의 focus/count metadata와 notification summary의 attention/waiting/applied count metadata가 동일한 sync fixture를 반영하는지 assertion으로 고정했습니다.
- Connected home → notification metadata parity: `1 passed` (32.4s).

## Account outbox metadata connected parity pass — 2026-09-22

- 동일한 blocked mapping fixture에서 account outbox summary의 `attention / pending / processing / applied` metadata를 직접 assertion했습니다. product task가 blocked 목록의 부분집합이어도 attention count를 중복 합산하지 않도록 count 의미를 정리했습니다.
- Connected mapping notification → account outbox metadata/focus: `1 passed` (40.5s).

## Account outbox applied-transition metadata pass — 2026-09-22

- blocked mapping을 저장·동기화한 뒤 outbox summary가 `attention 1 → clear`, `pending 0 유지`, `applied 1`로 전이하는 connected assertion을 추가했습니다. 완료 history와 overall state metadata가 같은 readback을 반영하는지 고정했습니다.
- Connected mapping blocked → pending → succeeded metadata/focus: `1 passed` (33.8s).

## Account sync workspace-readback handoff pass — 2026-09-22

- account `지금 동기화`·reconciliation·dead-letter 재시도 성공 후 account outbox refresh만 수행하던 경계를 보완해, parent workspace readback callback으로 dashboard·notifications도 같은 mutation lifecycle에서 갱신하도록 연결했습니다. account 내부 상태와 홈/알림 상태가 stale하게 분리되지 않도록 했습니다.
- Connected mapping notification → account task/readback flow: `1 passed` (32.7s).

## Account sync workspace-readback failure boundary pass — 2026-09-22

- account outbox mutation은 성공했지만 parent dashboard/notification readback이 실패하는 경우를 별도 상태로 안내하도록 보강했습니다. account의 durable outbox 성공은 유지하면서 `홈·알림 최신 상태는 다시 연결한 뒤 확인` 경계를 notice에 추가합니다.
- Connected mapping + dead-letter mutation regression after readback boundary: `2 passed` (30.3s).

## Account workspace-readback inline retry action pass — 2026-09-22

- parent dashboard/notification readback이 실패한 경우 account 외부 연동 notice에 `최신 상태 확인` action을 직접 노출하도록 연결했습니다. 재시도 성공 시 stale 안내 상태를 해제하고 account mutation 결과와 홈/알림 readback을 다시 맞춥니다.
- Connected mapping + dead-letter mutation regression after inline readback retry action: `2 passed` (26.3s).

## Account reopen-focus priority pass — 2026-09-22

- account 재오픈 시 명시적인 outbox focus 요청이 있으면 작업 focus를 우선하고, stale workspace readback 안내만 남은 경우에는 `최신 계정 설정 확인` action으로 focus를 이동하도록 보강했습니다. 사용자가 먼저 처리해야 할 outbox 작업을 stale 안내가 덮어쓰지 않습니다.
- Connected external-sync entry + mapping task focus: `2 passed` (45.5s).

## Account stale-readback semantic-surface pass — 2026-09-22

- account mutation 성공과 parent workspace readback 실패를 녹색 성공 surface와 혼동하지 않도록 `grocy-success-stale`를 amber 확인 필요 surface로 분리했습니다. `최신 상태 확인` action과 함께 stale 경계를 시각적으로 전달합니다.
- Connected mapping task/focus regression after stale surface styling: `1 passed` (29.1s).

## Account workspace-readback retry in-flight guard pass — 2026-09-22

- account notice의 `최신 상태 확인` action에 readback in-flight guard를 추가했습니다. 빠른 연속 클릭 시 dashboard/notification readback을 중복 dispatch하지 않고, 진행 중에는 버튼을 `최신 상태 확인 중`으로 전환합니다.
- Connected mapping + dead-letter mutation regression after readback guard: `2 passed` (43.0s).

## Account stale-readback recovery transition fixture pass — 2026-09-22

- connected fixture에서 dashboard readback 첫 시도를 503으로 실패시키고, account notice의 `최신 상태 확인`으로 재시도해 stale 문구가 제거되는 amber→normal 전이를 고정했습니다. 명시적 최신화 action을 누른 뒤에는 완료 detail focus를 강제로 다시 빼앗지 않고 사용자의 현재 focus를 보존합니다.
- Connected mapping stale-readback recovery transition: `1 passed` (46.4s).

## Account external-sync error-recovery variant pass — 2026-09-22

- Grocy 상품 매핑 persistence 첫 시도를 실패시키고 retry action으로 두 번째 시도를 성공시키는 기존 connected fixture를 재실행해, 오류 notice·retry action·매핑 성공 후 대기 상태 복귀가 유지되는지 확인했습니다.
- Connected Grocy mapping failure → retry recovery: `1 passed` (35.9s).

## Account-to-home applied cross-surface transition pass — 2026-09-22

- 하나의 connected fixture에서 blocked mapping을 동기화한 뒤 account outbox를 `clear/applied 1`로 전환하고, notification row를 `applied`로 확인한 다음 홈 external-sync summary가 제거되는 전이를 assertion했습니다.
- Connected account → notification applied → home summary removal: `1 passed` (37.9s).

## Notification sync rapid-selection regression pass — 2026-09-22

- 외부 연동 summary에서 `처리 대기`를 선택한 직후 `반영 완료`를 연속 선택하는 interaction을 회귀 테스트로 고정했습니다. 마지막 선택 상태의 row focus가 유지되고 이전 focus 요청이 남지 않습니다.
- Connected notification sync lifecycle with rapid summary selection: `1 passed` (29.4s).

## Notification sheet duplicate-refresh guard pass — 2026-09-22

- notification sheet가 이미 열려 있고 readback 중일 때 홈/알림 trigger를 반복해도 최신 `syncFocus`만 갱신하고 동일 notification refresh 요청을 중복 생성하지 않도록 guard를 추가했습니다. 최초 진입과 loading 종료 후 refresh는 기존 동작을 유지합니다.
- Connected notification sync lifecycle after duplicate-refresh guard: `1 passed` (20.0s).

## Account external-sync mutation duplicate-guard pass — 2026-09-22

- `지금 동기화`, 오래된 작업 확인, reconciliation, dead-letter 재시도 handler 자체에 in-flight guard를 추가했습니다. disabled UI를 우회하는 pointer/keyboard 중복 이벤트에서도 같은 외부 mutation이 중복 dispatch되지 않도록 보강했습니다.
- Connected mapping focus + dead-letter requeue regression: `2 passed` (27.3s).

## Date-assertion mutation duplicate-guard pass — 2026-09-22

- 날짜 저장 mutation에 `foodId:date:kind` 단위 in-flight key를 추가해 같은 식품·날짜·날짜 의미의 빠른 중복 저장을 차단했습니다. 다른 날짜/다른 식품 작업은 독립적으로 유지하고, 성공·실패·demo 경로에서 key를 해제합니다.
- Notification date review regression after guard: `1 passed` (7.0s).

## Receipt-commit mutation duplicate-guard pass — 2026-09-22

- 영수증 반영에 draft ID 또는 source/line 식별자 기반 in-flight key를 추가해 같은 영수증 검수 결과의 빠른 중복 반영을 차단했습니다. demo·connected 성공/실패/retry 경로에서 key를 해제하고, 서버 idempotency key 계약은 그대로 유지합니다.
- Prototype receipt commit regression: `2 passed` (7.3s); runtime integrity: `28 protected files`.

## Manual-food mutation duplicate-guard pass — 2026-09-22

- 직접 입력·라벨·바코드에서 공통으로 사용하는 manual food mutation에 food ID 기반 in-flight key를 추가했습니다. 같은 식품 추가 dispatch는 차단하고, demo·connected 성공/실패/retry 경로에서 key를 해제합니다.
- Prototype receipt/manual intake regression: `2 passed` (9.2s).

## Retry-toast semantic-surface pass — 2026-09-22

- `다시 시도` action이 포함된 toast에만 retry 상태 class/data attribute와 amber 계열 surface를 적용했습니다. 성공/정보 toast와 복구가 필요한 오류 toast를 메시지·색상·action 위계에서 구분합니다.
- Connected date persistence retry regression: `1 passed` (20.6s).

## Toast atomic-live announcement pass — 2026-09-22

- 전역 toast에 `aria-live="polite"`와 `aria-atomic="true"`를 명시해 메시지와 retry action이 성공·실패·재시도 상태로 바뀔 때 전체 toast를 하나의 announcement 단위로 전달하도록 보강했습니다.
- Home accessibility audit after toast live contract: `1 passed` (1.8s).

## Notification unread-focus after sync-state selection pass — 2026-09-22

- 외부 연동 상태 summary를 여러 번 선택한 뒤에도 `첫 번째 읽지 않은 알림으로 이동`이 sync state focus와 섞이지 않고 unread row를 정확히 선택하는지 connected 회귀를 추가했습니다.
- Connected notification lifecycle with rapid sync selection + unread focus: `1 passed` (36.6s).

## Native mobile shell live-preview and full viewport regression pass — 2026-09-22

- 웹 쉘과 모바일 쉘을 분리해 `http://127.0.0.1:4177/`에서 실제 네이티브 모바일 화면을 다시 열었습니다. 393px 첫 화면에서 상태 요약 → 우선 식품 → 식단 CTA → 식품 추가 → 하단 메뉴 순서를 라이트·다크모드로 확인했습니다.
- Native full viewport lane: `39 passed` (1.2m). 320px/393px fold, short-height, keyboard, safe-area, large text, reduced motion, contrast, light/dark theme, receipt/camera, detail and sheet focus contracts가 현재 source 기준으로 모두 green입니다.
- 이번 결과는 브라우저 기반 모바일 쉘 회귀 증거이며, 실제 iOS/Android 기기별 release acceptance를 대체하지 않습니다.

## Native bottom-navigation context restoration pass — 2026-09-22

- 320px에서 홈 → 식품 → 홈으로 이동할 때 하단 네비의 `aria-current`와 실제 active state가 함께 바뀌고, 식품 목록은 viewport 상단에 정렬되며 홈 복귀 시 scroll top과 첫 화면 CTA 위치가 복원되는 계약을 추가했습니다.
- Native bottom-navigation context restoration: `1 passed` (2.0s). 기존 320px safe-area·CTA containment 계약은 그대로 유지합니다.

## Native inventory-detail return-context pass — 2026-09-22

- 320px 식품 탭에서 재고 row를 열고 상세 sheet를 닫은 뒤에도 식품 탭 active state를 유지하고, 원래 row가 screen과 하단 navigation 사이의 안전 영역에 다시 보이며 row focus를 복원하는 계약을 추가했습니다.
- Native inventory detail return context: `1 passed` (4.2s). 상세 review action과 홈·식품 전환 focus 계약은 분리된 기존 테스트로 유지합니다.

## Native detail-save state readback pass — 2026-09-22

- 320px 식품 상세에서 보관 위치를 냉동으로 변경해 저장한 뒤 sheet를 닫고, 성공 status·업데이트된 재고 row·row focus·safe-area containment가 함께 유지되는 계약을 추가했습니다. 저장 결과를 toast만으로 끝내지 않고 목록의 durable state로 다시 읽을 수 있게 고정했습니다.
- Native detail storage save/readback: `1 passed` (3.8s).

## Native confirmed-date readback pass — 2026-09-22

- 320px 식품 상세에서 사용자가 확인한 소비기한을 입력·저장한 뒤 상세 sheet가 닫히고, 성공 status·목록의 갱신 날짜·row focus·safe-area containment가 함께 유지되는 계약을 추가했습니다.
- 같은 흐름에서 홈으로 이동해 우선순위 카드에도 `N월 N일` 고객 노출 포맷으로 갱신 날짜가 유지되고, home active state와 scroll top이 복원되는 cross-surface readback을 함께 고정했습니다.
- Native confirmed-date detail → home readback: `1 passed` (3.9s). 날짜 저장 결과를 transient toast에만 의존하지 않고 목록과 홈의 durable label로 다시 확인할 수 있습니다.

## Native notification-date review return pass — 2026-09-22

- 320px 알림 row에서 시금치 상세 → 라벨 날짜 재확인 → 상세 복귀 → sheet 닫기 흐름을 연결했습니다. 알림 센터가 닫히지 않은 상태에서 원래 notification row로 focus가 돌아오고 `data-notification-returned` 상태가 남는 계약을 추가했습니다.
- Native notification date review return: `1 passed` (7.2s). 모바일에서 날짜 확인 후 사용자가 알림 목록의 다음 맥락을 잃지 않습니다.

## Native mobile full-lane regression after cross-surface readback — 2026-09-22

- 홈·식품·상세·날짜·알림 cross-surface readback 계약을 추가한 뒤 네이티브 전체 lane을 다시 실행했습니다. 기존 320px/393px fold, short-height, keyboard, safe-area, large text, reduced motion, contrast, light/dark, receipt/camera, sheet focus 계약도 함께 재확인했습니다.
- Native full viewport lane: `44 passed` (1.4m); mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Native notification-read versus safety-review boundary pass — 2026-09-22

- 알림을 열어 읽음 상태가 `3개 → 2개`로 줄어도, 실제 날짜·보관 상태 확인이 완료되지 않은 식품은 홈의 우선순위 `3개`와 `needs-review` 안전 안내를 유지하는 계약을 추가했습니다. 알림 read state를 안전 확인 완료로 오해하지 않도록 cross-surface 상태 경계를 고정했습니다.
- Native notification read → home safety boundary: `1 passed` (8.4s). `AI는 소비기한을 확정하지 않아요` 경계 문구도 홈에서 계속 노출됩니다.

## Production build after mobile cross-surface contracts — 2026-09-22

- 모바일 날짜·알림·홈 readback 계약을 포함한 현재 source를 production build로 재검증했습니다.
- `npm run build`: TypeScript + Vite `765 modules`, `18` JS chunks, CSS `279.54KB`, sites build preparation passed; `check:runtime`: `28 protected files`.

## Connected date persistence recovery readback pass — 2026-09-22

- 연결형 날짜 저장의 첫 persistence 실패 → `다시 시도` 성공 경로와, 성공 write 직후 dashboard readback이 실패해도 저장 결과를 detail에서 보존하는 stale-readback 경계를 재실행했습니다.
- Connected date confirmation recovery + dashboard refresh failure: `2 passed` (27.2s). Demo 모바일의 read/unread·safety boundary와 connected persistence failure boundary를 서로 섞지 않고 유지합니다.

## Connected mutation dashboard-notification readback pass — 2026-09-22

- 보관 상태 mutation 성공 뒤 dashboard inventory와 notifications를 함께 다시 읽어 홈 priority card가 최신 storage state를 표시하고, 이전 stale mismatch 알림이 제거되는 전이를 재확인했습니다.
- 외부 sync lifecycle fixture에서 같은 mutation이 `처리 대기` 상태로 notification에 이어지는 경로도 함께 확인했습니다.
- Connected dashboard + notification readback and sync lifecycle: `2 passed` (33.2s).

## Connected mobile readback containment pass — 2026-09-22

- 같은 connected 보관 상태 readback fixture를 `320×740` viewport로 실행해 홈 priority 갱신·dashboard/notification readback을 모바일에서도 확인했습니다. 외부 재고 대기 toast가 모바일 screen 좌우와 fixed bottom navigation 위에 함께 containment 되는 geometry assertion을 추가했습니다.
- Connected 320px dashboard + notification readback: `1 passed` (29.3s).

## Connected mobile external-sync lifecycle pass — 2026-09-22

- `320×740` connected viewport에서 보관 mutation 이후 notification 상태가 `처리 대기 → 반영 완료`로 전환되는 동안 sync summary가 screen 좌우를 넘지 않고, 완료 시 summary와 row가 같은 `반영 완료` 상태를 노출하는 계약을 추가했습니다.
- Connected 320px external-sync lifecycle: `1 passed` (31.4s).

## Connected mobile applied-to-home summary cleanup pass — 2026-09-22

- `반영 완료` 상태를 notification summary와 row에서 확인한 뒤 알림을 닫고 홈으로 돌아오면, 홈 external-sync summary가 stale하게 남지 않고 제거되는 최종 전이를 `320×740` fixture에 추가했습니다.
- Connected mobile applied → home summary cleanup: `1 passed` (1.3m). 최초 connected server 기동 지연 후 server listen을 확인하고 재실행한 결과입니다.

## Applied-state surface ownership review — 2026-09-22

- `반영 완료` 이후 홈 summary를 계속 유지하는 대신, transient toast와 notification history가 완료 결과를 소유하고 홈의 action summary는 제거하는 현재 정보 노출 구조를 재확인했습니다. 완료 상태를 처리 대기처럼 계속 노출하지 않아 stale action surface를 만들지 않습니다.
- 320px connected lifecycle fixture에서 notification summary/row의 `반영 완료` readback과 홈 summary 제거를 함께 assertion했습니다.

## Connected cross-surface state cluster regression pass — 2026-09-22

- 날짜 저장 stale-readback, 보관 mutation dashboard/notification 동시 readback, 외부 sync lifecycle, blocked mapping notification focus를 하나의 connected 실행군으로 재실행해 상태 전이가 서로 간섭하지 않는지 확인했습니다.
- Connected cross-surface state cluster: `4 passed` (1.6m).

## Connected shopping receive mount-continuity recovery pass — 2026-09-22

- receive 성공 후 `최신 재고 확인` readback 과정에서 sheet subtree가 교체되더라도 `recentlyReceivedFood` 결과와 `shopping-sheet-received` notice를 다시 hydrate하고, 장보기 surface를 유지하도록 보강했습니다. 중복 empty state는 숨기고 직접 추가·식품 상세 CTA를 함께 유지합니다.
- Connected shopping receive authoritative readback + mount continuity: `1 passed` (1.5m). notice·상품명·다음 행동·식품 상세 전환까지 최종 fixture에서 확인했습니다.

## Connected planner dashboard-request ownership pass — 2026-09-22

- full connected lane에서 cold-start 직후 planner sheet 진입 시 dashboard request count가 한 번 증가한 후보를 단독 fixture로 재실행했습니다. `/api/dashboard` payload와 `/api/dashboard/revision` probe를 분리해 세고, 초기 dashboard settle window 이후 planner preview 전이를 측정하도록 fixture를 보강했습니다.
- Connected planner preview dashboard ownership: `1 passed` (1.3m). planner preview 진입 자체가 dashboard payload를 invalidate하지 않는 현재 contract를 확인했고 source 변경 없이 유지했습니다.

## Native full-lane after shopping-sheet mount continuity — 2026-09-22

- shopping receive readback의 notice/state 보존과 sheet surface 복귀를 적용한 뒤 native 전체 lane을 재실행했습니다. 320px/393px fold, short-height, keyboard, safe-area, large text, reduced motion, contrast, light/dark, receipt/camera, detail and sheet focus 계약을 함께 재확인했습니다.
- Native full viewport lane: `44 passed` (4.6m); mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Connected planner + shopping state-cluster pass — 2026-09-22

- planner preview의 dashboard payload ownership과 shopping receive의 readback/mount continuity를 하나의 connected worker 실행군으로 재검증했습니다. planner의 revision probe가 shopping mutation surface에 영향을 주지 않고, shopping readback이 planner dashboard contract를 오염시키지 않는지 함께 확인했습니다.
- Connected planner + shopping state cluster: `2 passed` (2.2m).

## Web/prototype runtime lane timing review — 2026-09-22

- 격리 포트 `4197`에서 fixture/web/prototype/accessibility lane `67 tests`를 전체 실행했습니다. 최근 Rescue Meal state/readback 변경과 직접 연결된 주요 home, detail, intake, notification, meal 흐름은 계속 통과했습니다.
- 실행 결과: `61 passed`, `3 failed`, `3 skipped`. 남은 실패는 Carousel momentum settling, visible-control naming 순회 중 select transition, receipt-review viewport settling assertion으로 분리됐으며, connected/native 제품 계약 실패로 분류하지 않고 단독 재현 대상으로 남겼습니다.
- 이 lane은 현재 source의 일반 web surface 회귀 증거이며, 이번 결과만으로 전체 web lane green을 주장하지 않습니다.

## Web runtime timing-failure isolation pass — 2026-09-22

- Carousel momentum failure를 단독 실행해 `1 passed` (15.9s)로 확인했습니다. 구현 회귀보다 gesture settling timing flake로 분리했습니다.
- Visible primary-control naming failure는 단독 실행에서도 guidance sheet Escape close timing에서 재현됐고, receipt review viewport failure와 함께 별도 UI transition audit 대상으로 유지합니다. connected/native readback 계약과는 분리했습니다.

## Receipt review root viewport containment pass — 2026-09-22

- 샘플 영수증이 lines를 채운 뒤 첫 확인 필요 항목을 center로 reveal할 때 review root 자체가 sheet content 위로 밀릴 수 있던 문제를 보강했습니다. 첫 unresolved line focus는 유지하고, 이후 review root를 `nearest`로 재정렬해 root·sticky commit action·현재 focus가 같은 viewport 계약 안에 남도록 했습니다.
- Receipt review selected-candidate flow after viewport containment fix: `1 passed` (15.4s).

## Label result root viewport containment pass — 2026-09-22

- label 결과에서 다음 행동을 center reveal한 뒤 result root가 sheet viewport 밖으로 밀릴 수 있던 동일한 intake geometry 경계를 보강했습니다. action focus는 유지하고 `.label-result-flow`를 `nearest`로 재정렬합니다.
- Label candidate readback after viewport containment fix: `1 passed` (20.9s).

## Web full-lane after intake viewport fixes — 2026-09-22

- receipt/label result root containment 수정 이후 격리 web runtime lane `67 tests`를 다시 실행했습니다. receipt/label viewport failures는 사라졌고, 현재 결과는 `61 passed`, `3 failed`, `3 skipped`입니다.
- 남은 실패는 Carousel momentum settling, visible-control transition timing, notification row focus timing으로 분리됐습니다. connected/native contracts와 app-owned intake viewport contracts는 계속 green입니다.

## Dark shopping-success semantic contrast pass — 2026-09-22

- dark bottom sheet에서 장보기 성공 notice가 transient toast와 섞이지 않고 durable next-action surface로 읽히도록 피스타치오 border/background contrast override를 추가했습니다. 공통 semantic token과 성공·다음 행동 위계는 light mode와 동일하게 유지합니다.
- Production build after dark success surface pass: `765 modules`, CSS `279.78KB`; runtime integrity: `28 protected files`.

## Native 393px live visual readback pass — 2026-09-22

- native shell `4203`에서 실제 `393px` preview를 라이트·다크모드로 캡처해 첫 fold를 확인했습니다. 상태 요약 → 우선 식품 3건 → 오늘 식단 CTA → 식품 추가 → 안전 안내 → 하단 홈·식품·식단 순서가 유지되고, 상단 action rail·주요 CTA·fixed navigation이 safe-area를 침범하지 않았습니다.
- Visual readback은 source/test evidence와 별도로 현재 live preview의 화면 밀도와 theme contrast를 확인한 결과이며, 실제 iOS/Android release acceptance를 대체하지 않습니다.

## Demo notification return-focus ownership pass — 2026-09-22

- demo food 알림에서 상세 sheet로 이동했다가 알림 센터로 돌아올 때 `notificationReturnFocusId`만 설정되어 이전 active element가 focus 조건을 막을 수 있던 경계를 보강했습니다. food notification return에도 강제 settle focus ownership을 적용했습니다.
- Demo notification detail → row focus return: `1 passed` (16.0s).

## Guidance sheet close-and-naming isolation pass — 2026-09-22

- full web lane에서 guidance Escape close가 timeout된 후보를 단독 재실행해 `1 passed` (32.7s)로 확인했습니다. visible control naming과 guidance close ownership은 현재 source에서 유지하고, full-lane transition timing 변동으로 분리했습니다.

## Desktop web-shell boundary pass — 2026-09-22

- 모바일 고도화 변경 이후 desktop web surface를 별도 `4205` port에서 재확인했습니다. phone simulator chrome이 없는 real web shell과 outer runtime dark theme propagation을 함께 검증했습니다.
- Web surface lane: `2 passed` (30.3s). app-owned mobile visual layer가 desktop shell boundary를 침범하지 않습니다.

## Native mobile interaction contract spot-check — 2026-09-22

- 기존 fixture port `4174`가 사용 중이라 실행 중인 서버를 재사용하거나 중단하지 않고, native 전용 격리 port `4208`에서 핵심 모바일 계약만 단독 검증했습니다.
- `keeps the native home inside a 320px viewport`, `keeps detail review and storage cues across light and dark themes`, `settles sheet motion immediately when reduced motion is requested`, `keeps primary controls at a 44px touch target`: `4 passed` (28.8s).
- 이번 spot-check은 전체 native lane을 대체하지 않으며, 현재 모바일 첫 화면의 폭 containment·theme 전환·reduced-motion·터치 타깃 계약이 동시에 유지된다는 추가 증거로 기록합니다.

## Web visible-control audit race isolation — 2026-09-22

- 전체 prototype lane에서 visible control 이름을 순회하던 검사가 sheet transition 중 locator를 하나씩 재해결하면서 DOM 교체를 기다리는 timing failure를 냈습니다. 제품 assertion이나 접근성 이름 누락이 아니라 검사 consumer의 순회 방식 문제였고, 현재 DOM snapshot을 한 번에 수집하도록 helper를 바꿔 transition 중 stale locator 재접근을 제거했습니다.
- Isolated visible-control audit after snapshot collection: `1 passed` (27.6s). 실제 surface별 control 이름 검사는 유지하면서 race만 제거했습니다.

## Prototype lane after visible-control snapshot hardening — 2026-09-22

- visible control 이름 검사를 현재 DOM snapshot 기반으로 바꾼 뒤 격리 port `4213`에서 prototype 전체 `52 tests`를 재실행했습니다. fixture 전용 render-error 로그는 의도된 recovery 테스트의 expected signal입니다.
- Prototype lane: `52 passed` (4.4m). home, theme, account, notification, intake, receipt/label, detail, inventory, meal, recovery surface를 포함한 현재 app-owned prototype 계약을 모두 통과했습니다.

## Connected notification return-focus after empty readback — 2026-09-22

- 식품 상세가 열린 동안 원격 읽음/재고 readback으로 알림 목록이 빈 상태가 되는 경로에서, 기존 알림 row가 사라져도 알림 요약으로 focus를 회수하도록 보강했습니다. detail return 시 focus ownership을 명시하고, empty notification state가 commit된 다음 summary를 재집중합니다.
- Isolated failing contract after fix: `1 passed` (1.4m).
- Connected notification return-focus cluster: `4 passed` (1.5m). date reminder, provenance history, queued refresh, storage mutation/readback convergence 경로를 함께 통과했습니다.

## Connected external-inventory return-focus cluster — 2026-09-22

- 알림에서 외부 재고 설정으로 이동하는 경로, 반영 완료 outbox 상세, mapping blocked task, dead-letter 재큐잉, stale in-flight 결정, 장보기 cross-device refresh를 하나의 connected cluster로 재검증했습니다.
- Connected external-inventory cluster: `6 passed` (1.9m). 외부 sync 상태가 갱신되어도 settings/outbox task의 재진입 focus와 장보기 목록의 refresh contract가 함께 유지됩니다.

## Connected planner-to-intake decision cluster — 2026-09-22

- 식단에서 부족 재료를 장보기로 넘기는 3일 action, 확인된 부족 재료의 checked shopping list 반영, 알레르기 선호 저장 후 재계산, allocated lot 날짜 검토, 포장일과 소비기한 분리, 만료 인쇄일의 라벨 재확인 후 detail 복귀를 함께 검증했습니다.
- Connected planner/intake cluster: `6 passed` (2.0m). 사용자에게 표시하는 날짜 의미와 다음 행동의 경계가 planner·shopping·label/detail 흐름 사이에서 유지됩니다.

## Native 393px dark receipt-intake visual readback — 2026-09-22

- live native preview `4203`의 393px dark surface에서 식품 추가 sheet를 직접 확인했습니다. 제목·설명 → 영수증/바코드/라벨/직접 입력 탭 → 1/3 intake rail → 카메라·사진 선택 CTA → 샘플 영수증 action → PDF fallback 안내 순서가 한 화면의 작업 흐름으로 읽혔고, sticky close/CTA가 safe-area를 침범하지 않았습니다.
- 이번 시각 검토에서는 긴 안내문이 CTA를 밀어내거나 dark surface에서 semantic contrast가 무너지는 문제가 관찰되지 않아 source 변경 없이 유지했습니다. 실제 device release acceptance를 대체하지 않는 live preview evidence입니다.

## Native 393px dark home hierarchy readback — 2026-09-22

- live native preview `4203`의 현재 dark home을 다시 캡처해 헤더 action rail, greeting, 우선 확인 summary, 3개 priority card, meal CTA/add-food pair, fixed bottom navigation의 순서를 확인했습니다.
- summary의 숫자와 상태 legend가 첫 시선에서 읽히고, 날짜 확인 필요 항목은 coral emphasis, 일반 먼저 사용 항목은 amber/neutral hierarchy로 구분됩니다. meal CTA가 하단 navigation 위에 고정되어 핵심 행동이 가려지지 않는 상태를 유지했습니다.

## Native label result CTA viewport containment — 2026-09-22

- native `320px` label recognition에서 결과 카드 action bar가 normal flow에 남아 확정 CTA가 sheet의 safe-area 하단 밖으로 밀리는 문제를 재현했습니다. receipt review와 같은 sticky viewport treatment로 전환해 결과 정보는 document order를 유지하면서 `확인 후 반영` action을 짧은 화면에서도 reachable하게 보강했습니다.
- Failing label viewport contract after fix: `1 passed` (17.0s).
- Label/source-review narrow viewport cluster after fix: `8 passed` (57.7s). barcode candidate, receipt badge, dark review, label confirmation, source focus/zoom, 320px·393px source frame containment을 함께 통과했습니다.

## Native full-lane after label sticky action — 2026-09-22

- label result action bar를 sticky viewport treatment로 바꾼 뒤 native 전체 lane을 재실행해 receipt editor의 sticky commit bar, keyboard/focus, safe-area, short-height, large-text, reduced-motion, light/dark, detail return 경계가 서로 충돌하지 않는지 확인했습니다.
- Native full viewport lane: `44 passed` (3.5m). 모바일 runtime integrity와 기존 320px/393px contracts를 유지하면서 label CTA containment 수정이 다른 sheet geometry를 깨뜨리지 않았습니다.

## Connected label correction readback timing isolation — 2026-09-22

- label correction cluster에서 한 차례 notification refresh count가 10초 내 2회에 도달하지 않은 후보를 단독 재실행했습니다. mutation response, dashboard readback, date/storage identity, detail rendering은 이미 같은 실행에서 통과했고, 단독 재실행에서는 notification refresh convergence까지 `1 passed` (1.4m)로 확인됐습니다.
- 현재 evidence는 label correction product contract의 실패보다 초기 dashboard/readback channel timing 변동으로 분류합니다. source를 임의로 지연시키지 않고, full connected lane에서 반복되는지 별도 관찰 대상으로 유지합니다.

## Connected label notification readback ownership fix — 2026-09-22

- 반복 실행에서 label correction 후 notification refresh가 누락되는 경로가 `2회 중 1회` 재현됐습니다. dashboard coalescing만으로 dependent notification read model을 갱신하던 것이 원인이어서, manual-food/label correction mutation boundary가 dashboard sync 후 notification refresh 완료까지 명시적으로 기다리도록 ownership을 보강했습니다.
- Fix verification: 동일 테스트 `2 passed` (1.6m); label connected cluster `4 passed` (1.3m). 날짜 identity·보관 조건·기존 lot identity와 notification empty readback이 함께 수렴합니다.

## Connected receipt/storage dependent-surface convergence — 2026-09-22

- label correction에서 정리한 mutation readback ownership을 receipt commit과 storage mutation 경로에 대입해 비교 검증했습니다. dashboard readback 이후 notification 상태와 date-review follow-up이 먼저 stale 상태로 남지 않는지 확인했습니다.
- Connected convergence cluster: `3 passed` (1.4m). storage dashboard+notifications, external sync lifecycle, authoritative receipt inventory/date-review follow-up이 현재 source contract에서 함께 수렴합니다.

## Connected receipt-queue/planner-shopping convergence — 2026-09-22

- receipt review queue cross-device refresh, planner 부족 재료의 3일 shopping action, confirmed missing ingredients의 checked list 반영, shopping cross-device refresh, confirmed storage receive readback을 하나의 connected cluster로 확인했습니다.
- Connected queue/planner/shopping cluster: `5 passed` (1.5m). 현재 receipt summary·meal plan·shopping list 간 cross-device/readback contract에서 stale surface가 재현되지 않아 source 변경 없이 유지했습니다.

## Connected workspace-draft refresh boundary — 2026-09-22

- open planner의 cross-device meal-plan refresh, explicit reload 전 local choice 보존, account settings local draft 보존, guest stale boundary, 다른 탭의 open notification refresh, custom storage location revision probe를 함께 검증했습니다.
- Connected workspace-draft cluster: `6 passed` (1.6m). remote revision은 명시된 surface에만 stale/refresh 신호를 전달하고, 사용자가 편집 중인 planner/account draft를 암묵적으로 덮어쓰지 않습니다.

## Offline reconnect and workspace-boundary cluster — 2026-09-22

- expired session의 조용한 workspace 전환 방지, offline dashboard의 수동 reconnect action, 마지막 성공 snapshot의 stale 표시, workspace switch 시 receipt review summary 격리 경계를 함께 검증했습니다.
- Connected offline/workspace cluster: `4 passed` (1.1m). 오프라인 상태에서 stale data와 최신 data가 섞이지 않고, 재인증이 필요한 경우 사용자가 명시적으로 다음 행동을 선택하게 됩니다.

## Offline mutation recovery cluster — 2026-09-22

- 장보기 목록 실패가 홈 dashboard를 오염시키지 않는 경계, 장보기 retry, 날짜 확인 retry, storage mutation idempotency retry, storage persistence failure recovery, offline manual reconnect action을 묶어 검증했습니다.
- Connected offline/mutation recovery cluster: `6 passed` (1.4m). 실패 시 기존 상태와 입력 문맥을 유지하고, retry는 동일 mutation contract로 재시도하며, offline 상태에서는 저장 완료처럼 오인시키지 않습니다.

## Account reconnect presentation boundary — 2026-09-22

- account connection 중 기존 workspace를 먼저 숨기는 pending 상태, 연결 실패 시 reconnect recovery, dashboard reconnect 성공 후 cleared workspace presentation 복구를 connected 환경에서 검증했습니다. native에서는 login action first-sheet containment과 guest primary action safe-area도 함께 확인했습니다.
- Connected reconnect cluster: `3 passed` (1.1m); native account viewport cluster: `2 passed` (16.5s). 기존 workspace가 pending/error 상태에서 노출되지 않고, 성공한 workspace만 다시 Home read model에 들어옵니다.

## Shopping empty-state language and return-flow pass — 2026-09-22

- 마지막 장보기 항목을 삭제했을 때 hero의 `장볼 재료가 없어요`와 하위 empty-state의 `아직 장보기 항목이 없어요`가 중복 노출되던 문제를 확인했습니다. 하위 상태를 `필요한 재료를 이어서 준비해요`로 바꿔 현재 상태 요약과 다음 행동 안내를 분리했습니다.
- connected shopping home flow after copy update: `2 passed` (35.8s, repeat-each=2). 장보기 empty-state, 직접 추가·삭제, 식단으로 이동 후 장보기 return 흐름을 함께 재확인했습니다.

## Native full-lane after shopping empty-state language — 2026-09-22

- 장보기 empty-state copy 변경 이후 전체 native lane을 재실행했습니다. 320px/393px fold, short-height, detail, account, meal, receipt/label, source review, keyboard, safe-area, large text, reduced motion, contrast, light/dark 계약을 함께 확인했습니다.
- Native full viewport lane: `44 passed` (2.8m). 장보기 문구 변경이 기존 native geometry·focus·CTA contract를 침범하지 않았습니다.

## Prototype full-lane after shopping language — 2026-09-22

- 장보기 empty-state copy와 label/readback 누적 변경 이후 prototype 전체 lane을 재실행했습니다. fixture 전용 render-error 로그는 recovery surface가 의도적으로 발생시키는 expected signal입니다.
- Prototype full lane: `52 passed` (3.2m). home, theme, account, notification, intake, receipt/label, detail, inventory, meal, recovery surface가 최신 source에서 함께 green입니다.

## Web shell boundary after mobile refinement — 2026-09-22

- 장보기 empty-state와 label/readback 누적 변경 이후 web surface를 별도 port `4246`에서 재확인했습니다. phone simulator chrome이 없는 real web shell과 outer runtime dark theme propagation을 함께 검증했습니다.
- Web surface lane: `2 passed` (10.7s). mobile visual layer가 desktop shell boundary를 침범하지 않습니다.

## Web shell boundary after accumulated focus/readback refinement — 2026-09-22

- accumulated focus/readback, dark state, notification/account, shopping and receipt refinements 이후 web surface를 별도 port `4321`에서 재확인했습니다.
- Web shell lane: `2 passed` (7.3s). phone simulator chrome 분리와 outer dark theme propagation이 최신 source에서도 유지됩니다.

## Final web-shell baseline before long-navigation fixture — 2026-09-22

- accumulated native focus/readback, busy semantics, toast lifecycle, and cross-surface return changes 이후 web shell을 별도 port `4322`에서 재확인했습니다.
- Web baseline: `2 passed` (8.3s); mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Prototype long sheet-navigation fixture — 2026-09-22

- demo Home에서 notification → food detail → notification row → account sheet → Home 순서로 실제 연속 sheet navigation fixture를 추가했습니다.
- Long sheet navigation contract: `1 passed` (7.3s). 각 close 이후 최신 유효 trigger와 row focus가 복귀하고, account close가 notification context를 덮지 않습니다.

## Prototype long sheet-navigation with meal context — 2026-09-22

- notification → food detail → notification row → account → Home → meal sheet 순서로 long fixture를 확장했습니다. account와 meal sheet를 닫은 뒤 각 trigger focus가 복귀하는지 확인했습니다.
- Extended long navigation contract: `1 passed` (9.0s). notification/detail/account/meal context가 누적되어도 마지막 유효 trigger focus를 유지합니다.

## Prototype long-navigation integrity checkpoint — 2026-09-22

- notification date review exact-row return, extended notification/detail/account/meal long navigation, generic modal focus restoration을 최신 source에서 함께 재실행했습니다.
- Prototype long-navigation checkpoint: `3 passed` (17.9s); mobile runtime integrity: `28 protected files`; `git diff --check`: passed.

## Prototype long-navigation dark narrow reduced-motion — 2026-09-22

- notification → food detail → notification row → account → meal sequence를 `320x740`, dark theme, reduced-motion 조건으로 실행했습니다.
- Dark narrow long-navigation contract: `1 passed` (5.2s). 각 sheet close 후 trigger focus와 마지막 유효 context가 접근성 환경에서도 유지됩니다.

## Long-navigation return ownership recheck — 2026-09-22

- prototype long sheet navigation과 connected external settings/applied outbox/other-tab notification refresh를 같은 verification cycle에서 재실행했습니다.
- Long-navigation return recheck: prototype `1 passed` (9.0s), connected `3 passed` (41.3s). 마지막 유효 notification/account/outbox context와 focus가 최신 readback 이후에도 유지됩니다.

## Shopping loading hero state refinement — 2026-09-22

- shopping list가 아직 비어 있는 초기 loading 순간에도 hero가 `장볼 재료가 없어요`를 먼저 말하던 경계를 수정했습니다. 이제 loading 중에는 `장보기 목록을 확인하고 있어요`와 데이터 로딩 설명을 먼저 노출해 empty와 loading을 의미상 분리합니다.
- Connected shopping state cluster after refinement: `4 passed` (1.2m). item mutation, cross-device refresh, sheet-local failure, retry action 흐름을 모두 재확인했습니다.

## Shopping error hero state refinement — 2026-09-22

- shopping fetch가 실패해 `items`가 비어 있을 때 empty hero가 먼저 보이던 경계를 수정했습니다. 이제 error가 empty보다 우선해 `장보기 목록을 불러오지 못했어요`와 연결 확인/retry 의미를 노출하고, progress 영역도 `다시 확인이 필요해요`로 동기화합니다.
- Shopping mutation/error regression cluster after refinement: `3 passed` (41.3s). 정상 item mutation과 sheet-local failure/retry 흐름을 함께 통과했습니다.

## Shopping error hierarchy contract coverage — 2026-09-22

- shopping fetch failure fixture에 hero heading `장보기 목록을 불러오지 못했어요`와 progress state `다시 확인이 필요해요`를 직접 검증하는 assertion을 추가했습니다. retry action만 존재하는지보다 error meaning이 empty와 분리되어 노출되는지를 contract로 고정했습니다.
- Error hierarchy regression cluster: `2 passed` (32.9s). dashboard 연결 유지와 item mutation retry 흐름도 함께 통과했습니다.

## Shopping error retry-focus refinement — 2026-09-22

- error 상태로 shopping sheet가 열릴 때 empty-state action보다 `다시 시도` CTA를 먼저 focus하도록 조정했습니다. 실패 원인을 읽은 직후 복구 action으로 이어지는 keyboard/assistive-tech 흐름을 명시했습니다.
- Error retry-focus contract: `1 passed` (51.8s). error hero/progress hierarchy, alert, retry CTA focus, connected dashboard 유지가 함께 통과했습니다.

## Shopping retry success focus readback — 2026-09-22

- retry가 error CTA에 focus된 뒤 성공 응답으로 새 shopping row가 들어오는 경우, 이전 error focus cycle이 남아 row focus를 막던 lifecycle 경계를 수정했습니다. retry click을 명시적으로 기록하고 loading 종료 후 remaining row 또는 empty action으로 focus를 넘깁니다.
- Retry error-to-success focus contract: `1 passed` (44.9s). error CTA focus → retry → authoritative row readback → row focus 순서를 확인했습니다.

## Native full-lane after shopping retry focus — 2026-09-22

- shopping retry success focus lifecycle을 추가한 뒤 native 전체 lane을 재실행했습니다. detail/receipt/label/source review/keyboard/safe-area/large-text/reduced-motion/light-dark geometry와 focus contract를 함께 확인했습니다.
- Native full viewport lane: `44 passed` (2.7m). retry focus 보강이 다른 mobile sheet의 focus·viewport contract를 침범하지 않았습니다.

## Shopping mutation-chain focus convergence — 2026-09-22

- shopping retry 성공 후 row focus, direct add/delete, cross-device refresh defer, 구매 완료 후 `식품 상세 확인` CTA focus를 하나의 mutation chain으로 재검증했습니다. receive readback CTA는 render/readback timing을 고려해 frame + bounded settle focus로 보강했습니다.
- Connected shopping mutation chain: `4 passed` (41.3s). retry/readback/direct mutation/receive CTA focus가 현재 source에서 함께 수렴합니다.

## Dark shopping error CTA contrast refinement — 2026-09-22

- dark bottom sheet에서 shopping error panel은 semantic coral token으로 바뀌었지만 retry button이 light-mode 배경/텍스트 토큰을 일부 상속하던 경계를 확인했습니다. dark 전용 coral outline, surface fill, hover/focus-visible contrast를 추가해 error message와 복구 CTA의 hierarchy를 맞췄습니다.
- Production build after dark error CTA pass: `765 modules`, CSS `280.82KB`; runtime integrity `28 protected files`.

## Dark shopping success/error semantic cluster — 2026-09-22

- dark error retry CTA contrast override 이후 success received CTA와 error/retry/mutation/readback 흐름을 함께 connected 환경에서 재검증했습니다. 피스타치오 success next-action과 coral recovery action이 상태 의미에 맞게 분리되고, shopping mutation contract는 유지됩니다.
- Connected dark-state semantic cluster: `4 passed` (1.0m). home shopping mutation, receive readback CTA, list fetch failure retry, item mutation retry를 모두 통과했습니다.

## External-sync semantic hierarchy parity check — 2026-09-22

- shopping의 success/error semantic language를 notification external-sync lifecycle과 account stale in-flight decision 상태에 대조했습니다. action-required/queued/applied 상태와 외부 반영 여부 결정 CTA가 기존 notification/account contract에서 유지됩니다.
- External-sync parity cluster: `3 passed` (40.5s). notification lifecycle summary, applied outbox focus, stale in-flight explicit decision을 함께 통과했습니다.

## Narrow notification sync-summary layout refinement — 2026-09-22

- notification external-sync summary가 inline 3열 고정이라 320px에서 `확인 필요·처리 대기·반영 완료` 라벨이 압축될 수 있던 경계를 수정했습니다. 일반 viewport는 3열을 유지하고 `max-width: 360px`에서는 2열로 재배치해 label/count 판독성을 확보합니다.
- Connected notification/external-sync cluster after layout change: `3 passed` (49.3s). lifecycle summary, external settings entry, applied outbox focus contract를 유지합니다.

## Account outbox narrow-action parity check — 2026-09-22

- account outbox의 dead-letter retry, blocked mapping task focus, stale in-flight explicit decision action group을 320px 대응 CSS와 함께 점검했습니다. 기존 reconciliation action grid와 max-width 360px column compression이 action label을 유지하도록 이미 분리되어 있어 source 변경 없이 유지했습니다.
- Connected outbox decision cluster: `3 passed` (38.3s). blocked task focus, dead-letter requeue, stale in-flight decision contract를 통과했습니다.

## Account outbox 320px reconciliation layout — 2026-09-22

- 360px 이하에서 외부 작업 번호 input과 두 reconciliation action이 한 줄에서 압축되던 layout을 수정했습니다. input은 full-width row로 분리하고 `반영됨`·`미반영·재시도`를 2열 action row로 배치해 좁은 화면에서도 label과 touch target을 보존합니다.
- Connected outbox regression after layout change: `3 passed` (47.7s). mapping, dead-letter retry, stale in-flight decision contract를 유지합니다.

## Account outbox 320px connected viewport contract — 2026-09-22

- Grocy blocked mapping fixture를 실제 Playwright viewport `320x740`으로 실행해 account sheet의 mapping/outbox surface가 narrow action layout과 함께 동작하는지 확인했습니다.
- Connected 320px account contract: `1 passed` (44.1s). blocked mapping task, location setup, action labels와 outbox focus 흐름이 좁은 viewport에서도 유지됩니다.

## Account reconciliation keyboard/layout contract — 2026-09-22

- stale in-flight reconciliation fixture를 실제 `320x740` viewport에서 실행하고 외부 작업 번호 입력 후 두 action button의 visibility, viewport containment, CSS min-height/tap-target contract를 확인했습니다. transformed preview의 visual rect scale과 CSS touch target을 분리해 검증하도록 assertion을 정리했습니다.
- Connected 320px reconciliation keyboard/layout contract: `1 passed` (33.2s).

## Account reconciliation keyboard tab-order contract — 2026-09-22

- 320px stale in-flight reconciliation fixture에서 외부 작업 번호 input에 입력한 뒤 `Tab` 이동이 `반영됨` action으로 이어지는지, action 실행 후 readback이 유지되는지 검증했습니다.
- Connected 320px keyboard tab-order contract: `1 passed` (43.3s). input → primary reconciliation action → authoritative success readback 순서를 유지합니다.

## Account reconciliation dual-action tab-order contract — 2026-09-22

- 320px stale in-flight reconciliation에서 input → `반영됨` → `미반영·재시도` → `반영됨` 역방향 복귀 순서를 keyboard로 직접 검증했습니다. primary action 실행 이후 busy/readback 상태도 기존 contract를 유지합니다.
- Connected dual-action tab-order contract: `1 passed` (1.0m).

## Account reconciliation busy-state accessibility contract — 2026-09-22

- account reconciliation의 `반영됨`·`미반영·재시도` buttons가 busy 중 disabled text만 바뀌고 상태 의미를 보조기기에 명시하지 않던 경계를 보강했습니다. 두 action에 `aria-busy`를 연결해 저장/재시도 진행 상태를 semantic attribute로 노출합니다.
- Connected busy/readback regression: `2 passed` (49.3s). dead-letter retry와 stale in-flight decision/readback 흐름을 유지합니다.

## Notification retry busy-state accessibility parity — 2026-09-22

- notification retry action에도 account reconciliation과 동일한 `aria-busy` semantic을 연결했습니다. 현재는 notification 목록 GET/loading lifecycle에서 action busy 상태를 명시하고, read-persistence retry/readback focus는 별도 settle contract로 관리합니다.

## Notification local retry-busy ownership — 2026-09-22

- notification read retry의 POST busy 상태를 parent GET loading과 분리해 NotificationSheet 내부 local state로 소유하도록 보강했습니다. retry button이 사라지는 순간에도 `알림 읽음 상태를 저장하는 중이에요` status를 유지하고 authoritative readback에서 종료합니다.
- Notification local retry-busy cluster: `3 passed` (27.3s). unread retry gate, date detail return, external-sync lifecycle을 함께 통과했습니다.

## Shopping mutation busy-state accessibility parity — 2026-09-22

- shopping item toggle, receive, delete action들이 `mutating`으로 disabled되지만 assistive-tech busy semantic이 없던 경계를 보강했습니다. 핵심 item/receive/delete buttons에 `aria-busy`를 연결해 notification/account recovery와 같은 상태 언어를 사용합니다.
- Connected shopping mutation cluster after parity update: `4 passed` (30.2s). home mutation, receive readback, sheet-local failure, item retry 흐름을 유지합니다.

## Sheet-root busy semantic parity — 2026-09-22

- shopping sheet root에 loading/mutating `aria-busy`, notification sheet root에 loading `aria-busy`를 추가해 개별 action뿐 아니라 surface 전체의 진행 상태를 보조기기에 노출하도록 보강했습니다.
- Connected root-busy regression cluster: `3 passed` (38.3s). shopping mutation/receive와 notification read retry contract를 유지합니다.

## Account sheet-root busy semantic parity — 2026-09-22

- AccountSheet root content에 session checking, auth busy, remote refresh busy를 반영하는 `aria-busy`를 추가해 panel-level busy와 surface-level busy semantic을 맞췄습니다.
- Connected account busy regression cluster: `3 passed` (42.4s). mapping, dead-letter retry, stale in-flight decision/readback contract를 유지합니다.

## Shopping manual/receive busy-state parity — 2026-09-22

- shopping manual direct-add submit과 receive panel submit/cancel action에도 `aria-busy={mutating}`를 연결해 item toggle/receive/delete와 동일한 mutation busy semantic으로 맞췄습니다.
- Connected shopping recovery after parity update: `4 passed` (34.3s). home mutation, receive readback, sheet-local failure, item retry 흐름을 유지합니다.

## Shopping receive close-mid-request recovery — 2026-09-22

- shopping receive POST를 gate한 상태에서 sheet를 닫고, 응답 release 후 shopping sheet를 재진입하는 controlled fixture를 추가했습니다. received notice와 `식품 상세 확인` CTA가 다시 mount되고 CTA focus가 복원되는지 확인했습니다.
- Close-mid-request receive contract: `1 passed` (26.8s). mutation 중 sheet close 이후 readback notice/focus가 유실되지 않습니다.

## Shopping root busy transition contract — 2026-09-22

- receive POST를 gate한 close-mid-request fixture에서 shopping sheet root의 `aria-busy=true`를 직접 확인하고, 응답 release/reopen 후 `aria-busy=false`와 received CTA focus를 함께 확인했습니다.
- Shopping root busy transition: `1 passed` (31.8s).

## Notification detail close-mid-readback repeat — 2026-09-22

- notification read mutation과 queued remote refresh가 진행되는 동안 food detail로 이동한 뒤 돌아오는 흐름, storage mutation 중 detail readback 흐름을 `repeat-each=2`로 실행했습니다.
- Notification detail close/readback repeat: `4 passed` (41.0s). detail close 이후 notification row/context focus와 dashboard/notification readback이 독립적으로 수렴합니다.

## Account outbox close/readback repeat isolation — 2026-09-22

- blocked mapping focus, dead-letter requeue, stale in-flight reconciliation을 `repeat-each=2`, `workers=1`로 실행해 account outbox의 action/readback focus가 이전 attempt나 다른 surface context를 끌고 오지 않는지 확인했습니다.
- Account outbox close/readback repeat: `6 passed` (44.2s). 두 실행 모두 mapping/requeue/reconciliation state와 focus context가 독립적으로 수렴합니다.

## Cross-surface local busy-state cluster — 2026-09-22

- shopping item retry, notification read retry, account dead-letter requeue, stale in-flight reconciliation을 같은 serial connected run에서 실행했습니다.
- Cross-surface busy cluster: `4 passed` (34.8s). disabled/aria-busy, retry focus, readback success, reconciliation decision이 세 surface에서 서로 간섭하지 않습니다.
- Notification/external-sync regression after parity update: `2 passed` (40.9s). unread retention retry와 external lifecycle summary contract를 유지합니다.

## Grocy retry/stale-refresh busy-state parity — 2026-09-22

- account Grocy error retry와 workspace readback stale refresh action에도 `disabled` + `aria-busy` semantic을 연결해 notification/reconciliation과 동일한 접근성 busy contract로 맞췄습니다.
- Connected account/outbox regression after parity update: `3 passed` (1.1m). blocked mapping, dead-letter retry, stale in-flight decision/readback 흐름을 유지합니다.

## Notification retry focus ownership parity — 2026-09-22

- notification error가 발생했을 때 active element가 body/close context인 경우 retry CTA로 focus를 handoff하도록 보강했습니다. 이미 notification row를 명확히 조작 중인 경우에는 기존 row focus를 덮어쓰지 않습니다.
- Connected notification focus cluster: `3 passed` (56.5s). unread read-persistence retry, date reminder detail return, external-sync lifecycle을 함께 통과했습니다.

## Notification retry focus priority correction — 2026-09-22

- read persistence failure에서 active notification row가 연결되어 있어도 복구 action이 필요한 경우 retry CTA가 우선 focus되어야 하는 경계를 확인했습니다. 조건부 guard를 제거해 notification error retry가 항상 focus를 reclaim하도록 조정했습니다.
- Connected notification focus regression after correction: `3 passed` (1.0m). unread retry focus, date detail return, external-sync lifecycle을 함께 통과했습니다.

## Notification retry readback focus settlement — 2026-09-22

- retry action을 누른 직후 error가 먼저 clear되고 readback notification row가 늦게 rerender되는 경계에서 one-frame focus가 소실되던 문제를 확인했습니다. bounded 1.2s settle focus로 최신 row/summary를 반복 재집중해 retry readback focus를 안정화했습니다.
- Connected notification readback focus cluster: `3 passed` (48.9s). unread retry→read row, date detail return, external-sync lifecycle을 함께 통과했습니다.

## Native full-lane after notification retry settlement — 2026-09-22

- notification retry readback의 bounded focus settle 변경 이후 native 전체 lane을 재실행했습니다. notification date review, detail return, receipt/label intake, keyboard, safe-area, reduced-motion, large-text, dark/light geometry를 함께 확인했습니다.
- Native full viewport lane: `44 passed` (2.5m). notification recovery focus 변경이 다른 mobile sheet contract를 침범하지 않았습니다.

## Notification retry multi-attempt settlement — 2026-09-22

- notification read persistence failure → retry → read row focus 흐름을 `repeat-each=2`로 재실행해 bounded settle timer가 다음 attempt에 남지 않는지 확인했습니다.
- Notification retry multi-attempt contract: `2 passed` (43.6s). 두 실행 모두 retry CTA focus와 readback row focus가 동일하게 수렴했습니다.

## Account outbox multi-attempt recovery settlement — 2026-09-22

- dead-letter requeue와 stale in-flight reconciliation을 각각 `repeat-each=2`로 실행해 account retry/readback 상태가 이전 attempt의 timer나 focus를 끌고 오지 않는지 확인했습니다.
- Account outbox multi-attempt contract: `4 passed` (47.8s). requeue와 explicit decision/readback이 각 실행에서 독립적으로 수렴합니다.

## Cross-surface storage notification readback ownership fix — 2026-09-22

- storage mutation이 dashboard readback만 기다리고 notification read model을 암묵적 fire-and-forget에 맡기던 경계를 재현했습니다. storage mutation sync boundary를 별도 ownership으로 분리해 dashboard 이후 notification refresh 완료까지 명시적으로 대기하도록 보강했습니다.
- Cross-surface storage/notification cluster: `4 passed` (1.2m). storage readback, external sync attention, external settings entry, open food detail notification convergence가 함께 통과합니다.

## Mutation dependent-surface collision cluster — 2026-09-22

- receipt queue cross-device refresh, storage mutation dashboard+notification readback, authoritative receipt date-review follow-up, manual-food idempotency retry, manual-food failure recovery를 하나의 connected cluster로 실행했습니다.
- Mutation dependent-surface cluster: `5 passed` (47.7s). receipt summary, dashboard, notification, manual-food retry read models가 서로 cancel/overwrite하지 않는 현재 ownership을 확인했습니다.

## Cross-surface receipt follow-up at 320px — 2026-09-22

- authoritative receipt commit → inventory readback → date-review follow-up 경로를 connected `320x740` viewport에서 실행해 toast, follow-up CTA, sheet return이 narrow boundary를 넘지 않는지 확인했습니다.
- Connected 320px receipt follow-up contract: `1 passed` (29.6s). receipt mutation/readback ownership과 narrow mobile presentation을 함께 유지합니다.

## Cross-surface manual-food/storage recovery at 320px — 2026-09-22

- manual food idempotency retry, manual food persistence failure retry, storage mutation dashboard+notification readback을 connected `320x740` 조건에서 함께 검증했습니다.
- Connected 320px manual/storage recovery cluster: `3 passed` (1.0m). toast, retry action, inventory focus, notification readback이 narrow mutation 흐름에서 함께 수렴합니다.

## Cross-surface toast-action focus chain — 2026-09-22

- expired printed-date의 label recheck→detail 복귀, storage sync attention→external settings, detail mutation→notification lifecycle, queued notification→food detail navigation을 하나의 focus/context cluster로 검증했습니다.
- Connected toast/action return cluster: `4 passed` (45.3s). toast action을 통한 detail/account/notification 전환과 원래 context return contract가 현재 source에서 함께 유지됩니다.

## Cross-surface mutation sequence at 320px — 2026-09-22

- receipt follow-up, storage readback, manual-food idempotency/failure recovery를 connected `320x740` 조건에서 묶어 재검증했습니다. toast action, retry, detail/account/notification return context가 연속 mutation에서도 충돌하지 않는지 확인했습니다.
- Cross-surface 320px mutation cluster: `3 passed` (1.0m). narrow toast/focus/readback 흐름이 receipt·storage·manual-food에서 일관됩니다.

## Live 393px dark state-hierarchy readback — 2026-09-22

- native live preview `4264`에서 393px dark Home을 직접 캡처해 summary, priority list, meal CTA/add-food pair, bottom navigation의 상태 hierarchy를 확인했습니다. summary의 coral/amber/blue state dots와 main meal CTA가 서로 경쟁하지 않고 읽혔습니다.
- account outbox와 notification sync summary는 live preview에서 직접 진입할 수 있는 fixture state가 없어 source/CSS와 connected contract로 대조했고, 좁은 viewport column rules 및 action state semantics는 별도 QA cluster로 유지했습니다. 실제 account-backed device acceptance를 대체하지 않는 visual evidence입니다.

## Account outbox multi-state action cluster — 2026-09-22

- blocked product mapping, dead-letter requeue, stale in-flight explicit decision, custom storage location management를 함께 검증해 outbox action group이 상태 갱신 중에도 잘못된 작업을 덮어쓰지 않는지 확인했습니다.
- Connected account/outbox cluster: `4 passed` (56.2s). mapping, retry, reconciliation, custom location readback contract를 모두 유지합니다.

## Toast lifecycle cross-surface regression — 2026-09-22

- manual food success focus, storage sync attention → external settings action, receipt date-review follow-up, manual food failure retry를 묶어 toast/action lifecycle이 stale action을 남기지 않는지 검증했습니다.
- Toast lifecycle cluster: `4 passed` (manual fixture `9.0s` + connected cluster `3 passed` in `54.9s`). 각 mutation 결과의 action label과 다음 sheet context가 현재 결과에 맞게 교체됩니다.

## Async late-response state ownership spot-check — 2026-09-22

- receipt intake의 older upload late response와 planner cross-device revision 중 local choice 보존을 함께 실행해 async 결과 순서 역전이 최신 toast/read model/local draft를 덮어쓰지 않는지 확인했습니다.
- Async ownership spot-check: `2 passed` (29.5s). newest upload와 explicit planner reload ownership이 현재 source에서 유지됩니다.

## Stale notification long-journey recovery — 2026-09-22

- stale food notification의 최신 inventory recovery, queued notification refresh 중 food detail 진입, remote worker mutation 후 linked sync history refresh를 하나의 timing cluster로 재실행했습니다.
- Stale notification recovery cluster: `3 passed` (29.6s). stale recovery와 detail readback이 최신 state를 보존하며 focus/context를 덮어쓰지 않습니다.

## Stale recovery toast-action ownership — 2026-09-22

- 연결된 식품이 사라진 stale notification의 `최신 재고 확인` action과 expired printed date의 label recheck→detail action을 함께 실행했습니다.
- Stale action ownership cluster: `2 passed` (38.9s). 잘못된 food detail을 열지 않고, 현재 상태에 맞는 최신 inventory/detail recovery action만 실행됩니다.

## Controlled stale-recovery action/readback race — 2026-09-22

- `최신 재고 확인` action 직후 dashboard GET을 의도적으로 gate해 사용자의 recovery action이 readback보다 먼저 실행되는 경계를 만들었습니다. gate release 후 최신 Home/inventory presentation과 action ownership을 확인했습니다.
- Controlled stale-recovery race: `1 passed` (41.1s). 사용자 action이 delayed remote readback에 의해 취소되거나 잘못된 detail로 전환되지 않습니다.

## Async toast/retry repeat isolation audit — 2026-09-22

- receipt late-response와 storage sync attention은 parallel repeat에서도 통과했지만, manual-food retry는 shared disposable workspace를 사용하는 `repeat-each=2` parallel 실행에서 workspace conflict 후보가 발생했습니다. 동일 테스트를 `workers=1`로 반복해 `2 passed` (34.2s)로 재확인했습니다.
- 이 결과는 제품 retry contract보다 test worker workspace isolation 경계로 분리하고, source 변경 없이 기록합니다. connected mutation tests의 repeat evidence는 단일 worker 기준으로 해석합니다.

## Manual-food authoritative-row focus settlement — 2026-09-22

- manual-food idempotency retry에서 authoritative inventory row는 도착했지만 dashboard/notification readback rerender가 단일 focus handoff를 덮을 수 있는 경계를 재현했습니다. pending added-food focus를 bounded 1s settle cycle로 보강해 최신 inventory row를 재집중하도록 수정했습니다.
- 단독 manual-food retry verification: `1 passed` (36.8s). parallel repeat에서 관찰된 workspace/readback timing 변동은 product failure가 아닌 harness/response timing 후보로 별도 분리합니다.

## Manual-food sheet-close focus ownership fix — 2026-09-22

- intake sheet close button이 정상적인 mutation return trigger인데 pending added-food focus effect가 이를 다른 interaction으로 오판해 focus intent를 지우던 경계를 수정했습니다. sheet close button을 expected focus context로 허용했습니다.
- Dark/narrow manual-food retry repeat after fix: `2 passed` (54.2s). authoritative inventory row focus가 두 attempt에서 안정적으로 수렴합니다.

## Sheet-close ownership parity for receipt/label intake — 2026-09-22

- manual-food에서 sheet-close button을 정상적인 mutation return context로 허용한 뒤 receipt editor/label result/source review의 keyboard·commit·focus contract를 대조했습니다.
- Native receipt/label focus cluster: `5 passed` (29.3s); prototype receipt/label cluster: `4 passed` (28.2s). sticky commit action, source focus, label confirmation, bottom-sheet keyboard containment이 모두 유지됩니다.

## Sheet-close ownership parity for account/notification — 2026-09-22

- account login sheet first viewport, notification date review exact-row return, generic Bottom Sheet modal semantics/keyboard focus를 receipt/label close ownership과 대조했습니다.
- Native account/notification close cluster: `3 passed` (33.6s); prototype modal/notification cluster: `3 passed` (13.8s). sheet close trigger가 기존 context focus를 잘못 덮지 않습니다.

## Cross-surface accumulated return-context cluster — 2026-09-22

- external-sync notification → account settings, storage mutation → open notification/food detail, remote worker mutation → linked sync history, other-tab workspace mutation → open notification center를 하나의 connected return-context cluster로 검증했습니다.
- Accumulated return-context cluster: `4 passed` (40.0s). 마지막 유효 sheet context와 linked readback focus가 여러 remote mutation 경로에서 유지됩니다.

## Notification-to-account return context at 320px — 2026-09-22

- external-sync notification → account external inventory settings와 applied notification → completed outbox detail을 connected `320x740` viewport에서 실행했습니다.
- Connected 320px notification/account return cluster: `2 passed` (23.9s). 좁은 sheet stack에서도 external settings entry와 completed outbox focus가 유지됩니다.

## Notification-to-account dark return context — 2026-09-22

- external-sync notification → account settings와 applied notification → completed outbox detail을 `320x740` dark theme으로 실행해 상태 color, action contrast, focus return을 함께 검증했습니다.
- Connected 320px dark notification/account cluster: `2 passed` (36.6s). dark semantic state와 좁은 sheet return contract가 함께 유지됩니다.

## Dark 320px long sheet-navigation sequence — 2026-09-22

- expired label recheck→detail, storage sync attention→external settings, external-sync notification→settings, applied notification→outbox detail을 모두 `320x740` dark 조건으로 실행했습니다.
- Dark 320px long-navigation cluster: `4 passed` (38.7s). 여러 sheet 전환 뒤 state color, toast/action, focus return ownership이 마지막 유효 context를 유지합니다.

## Dark 320px reduced-motion return sequence — 2026-09-22

- external-sync notification → account settings와 applied notification → outbox detail을 dark `320x740` + `prefers-reduced-motion: reduce` 조건에서 실행했습니다.
- Reduced-motion return cluster: `2 passed` (35.8s). animation settling 없이도 settings/detail entry, focus return, state color hierarchy가 유지됩니다.

## Long notification-account-food history sequence — 2026-09-22

- applied notification → account outbox timeline → linked food detail → storage history evidence expand/collapse → remote worker readback까지 이어지는 기존 long sequence를 dark/narrow/reduced-motion 조건에서 재검증했습니다.
- Applied notification long sequence: connected focus/readback contract passed. outbox evidence summary, food history highlight, remote succeeded state, and summary focus return이 한 세션에서 유지됩니다.

## Applied outbox long-sequence repeatability — 2026-09-22

- applied notification → outbox timeline → linked food history → evidence expand/collapse → remote worker readback sequence를 `repeat-each=2`, `workers=1`로 반복 실행했습니다.
- Applied outbox repeat contract: `2 passed` (40.5s). 두 실행 모두 evidence focus, queued→succeeded readback, summary return ownership을 독립적으로 유지합니다.

## Applied outbox failure-to-success recovery repeat — 2026-09-22

- applied outbox evidence sequence, dead-letter requeue, stale in-flight explicit decision을 `repeat-each=2`, `workers=1`, reduced-motion 조건으로 함께 실행했습니다.
- Outbox failure-to-success recovery: `6 passed` (54.7s). failure/requeue/decision/readback가 각 attempt에서 독립적으로 수렴하고 evidence focus와 timeline ownership이 유지됩니다.

## Cross-surface notification/account recovery isolation — 2026-09-22

- notification read retry, applied notification outbox detail, dead-letter requeue, stale in-flight decision을 같은 serial connected run에서 교차 실행했습니다.
- Cross-surface recovery isolation: `4 passed` (48.7s). notification settle focus/readback timer가 account outbox action ownership을 침범하지 않고, account recovery가 이후 notification context를 오염시키지 않습니다.

## Shopping-notification-account serial recovery isolation — 2026-09-22

- shopping receive readback, notification unread retry/readback, account dead-letter requeue를 같은 serial connected session에서 연속 실행했습니다.
- Serial three-surface recovery: `3 passed` (40.1s). shopping received CTA focus, notification retry settle, account requeue focus/readback이 서로 간섭하지 않습니다.

## Dark 320px three-surface recovery — 2026-09-22

- shopping receive, notification unread retry, account dead-letter requeue를 `320x740` + dark + reduced-motion 조건으로 같은 connected session에서 실행했습니다.
- Dark 320px three-surface recovery: `3 passed` (37.3s). success/retry/requeue semantic colors, focus settle, readback ownership이 세 surface에서 함께 유지됩니다.

## Dark 320px full mutation journey after focus ownership fix — 2026-09-22

- manual-food sheet-close focus ownership 보강 이후 receipt·storage·manual-food·shopping·notification 다섯 mutation flow를 최신 source에서 다시 실행했습니다.
- Dark 320px full mutation journey: `5 passed` (53.5s). 다섯 surface의 toast, focus, sheet return, dashboard/notification/inventory readback이 현재 implementation에서 함께 수렴합니다.

## Native full-lane after cross-surface focus ownership — 2026-09-22

- manual-food sheet-close ownership, notification retry readback settle, storage sync dependent refresh 누적 변경 이후 native 전체 lane을 재실행했습니다.
- Native full viewport lane: `44 passed` (2.0m). 320px/393px geometry, dark/light, keyboard, reduced-motion, safe-area, receipt/label/detail/notification/account focus contract가 모두 유지됩니다.

## Connected worker workspace isolation hardening — 2026-09-22

- repeat-each 실행에서 disposable connected API workspace가 parallel worker 사이에 섞이지 않도록 `playwright.connected.config.ts`에 `workers: 1`을 명시했습니다. 일반 connected 실행과 반복 실행 모두 동일한 serial workspace contract를 사용합니다.
- Manual-food retry repeat after harness hardening: `2 passed` (44.0s, `repeat-each=2`). 이전에 parallel에서 관찰된 workspace conflict 없이 두 attempt가 독립적으로 통과했습니다.

## Serial full mutation journey baseline — 2026-09-22

- serial connected harness에서 shopping receive, storage dashboard+notification readback, receipt date-review follow-up, notification retry/readback, manual-food idempotency retry를 하나의 representative cluster로 실행했습니다.
- Serial full mutation journey baseline: `5 passed` (58.5s). receipt·storage·manual·shopping·notification read models가 하나의 disposable workspace에서 연속으로 수렴합니다.

## Serial full mutation journey at 320px — 2026-09-22

- shopping receive와 notification retry fixture까지 `320x740` viewport로 확장해 receipt·storage·manual·shopping·notification representative journey를 모두 narrow condition에서 실행했습니다.
- Serial 320px mutation journey: `5 passed` (1.2m). toast, focus, sheet return, dashboard/notification/inventory readback이 좁은 viewport에서도 함께 수렴합니다.

## Serial 320px mutation stress repeat — 2026-09-22

- receipt·storage·manual-food·shopping·notification representative journey를 `repeat-each=2`, `workers=1`, `320x740` 조건으로 실행해 실패→retry→성공 상태가 교차해도 마지막 mutation의 toast/action/focus/readback만 남는지 확인했습니다.
- Serial 320px mutation stress: `10 passed` (1.5m). 두 반복 모두 stale action, 이전 focus, workspace collision 없이 수렴했습니다.

## Toast action consumption contract — 2026-09-22

- manual food success toast의 `날짜·보관 상태 확인` action을 detail sheet로 소비한 뒤 이전 toast action이 남지 않는지 assertion을 추가했습니다.
- Prototype toast action consumption: `1 passed` (12.4s). action click 후 detail focus와 toast action cleanup이 함께 유지됩니다.

## Toast action async consumption repeatability — 2026-09-22

- manual food success toast action을 detail로 소비한 뒤 늦은 async state update가 이전 action을 다시 mount하지 않는지 `repeat-each=2`로 실행했습니다.
- Toast async consumption contract: `2 passed` (14.1s). 두 실행 모두 action cleanup과 detail focus가 독립적으로 수렴했습니다.

## Rapid toast replacement action cluster — 2026-09-22

- date confirmation retry, storage sync attention, receipt date-review follow-up, manual food failure retry를 묶어 현재 toast/action message와 callback이 같은 mutation 결과를 가리키는지 검증했습니다.
- Rapid toast replacement cluster: `4 passed` (1.0m). 빠른 상태 교체에서도 이전 action label/closure가 다음 mutation 결과에 남지 않습니다.

## Prototype toast-action replacement spot-check — 2026-09-22

- manual food focus, date-warning safety review, user-confirmed reminder reopen 흐름을 fixture lane에서 다시 실행해 toast와 다음 action이 이전 상태의 action을 유지하지 않는지 확인했습니다.
- Prototype toast-action spot-check: `3 passed` (12.5s).

## Narrow sheet heading hierarchy — 2026-09-22

- 320px 모바일에서 알림/장보기 시트의 긴 제목과 보조 액션이 같은 행에서 충돌하지 않도록 제목 열을 유연하게 감싸고, `모두 읽음` 액션의 최소 터치 높이와 장보기 동기화 상태의 말줄임을 추가했습니다.
- Native narrow sheet spot-check: `4 passed` (16.4s). 알림 헤더, 알림 복귀, 바텀시트 키보드 포커스, 주요 시트 320px containment가 유지됩니다.
- Runtime/build: `check:runtime` passed (28 protected files), production build passed (765 modules).

## Review-gated consume action messaging — 2026-09-22

- 날짜·보관 상태 재확인이 필요한 식품 상세에서 일반 `먹었어요` 문구를 `확인 후 먹었어요`로 분리하고, 동일한 의미의 접근성 이름과 안전 안내 연결을 추가했습니다.
- 해당 상태에서만 amber semantic treatment를 적용해 추가 확인 단계가 버튼을 누르기 전에 보이도록 했습니다. 일반 소비 기록과 변경 저장 흐름은 유지했습니다.
- Native detail action regression: `1 passed` (5.5s); runtime/build passed (28 protected files, 765 modules).

## Safety-to-action visual bridge — 2026-09-22

- 날짜·보관 상태 재확인이 필요한 상세 화면에서 하단 기록 액션 그룹에 `안전 확인 후 기록` 연결 라벨과 amber 경계를 추가했습니다. 긴 상세 콘텐츠를 읽은 뒤에도 마지막 행동의 전제조건이 끊기지 않도록 했습니다.
- Native detail cluster: `3 passed` (6.2s). 안전 안내 뒤 액션 순서, 날짜 재확인 포커스, 320px safe-area 위치를 유지합니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Provenance confidence hierarchy — 2026-09-22

- 상세 화면의 구매 출처·상품 정보 출처·AI 소비 우선순위 근거가 모두 동일한 녹색 계열로 읽히던 문제를 분리했습니다. 구매 출처는 확인된 기록으로 유지하고, 상품 정보 후보는 blue, AI 우선순위는 amber로 표현해 참고 정보가 확정 사실처럼 보이지 않도록 했습니다.
- Native provenance/readability cluster: `7 passed` (13.8s). light/dark detail review, receipt review, large text, compact safety guidance, action order, 320px safe-area가 모두 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Confirmed-record-first provenance order — 2026-09-22

- 상세 화면의 참고 출처 그룹을 AI 소비 우선순위 근거보다 먼저 배치해, 사용자가 확인한 구매 기록을 참고용 후보/AI 힌트보다 먼저 읽도록 정리했습니다.
- Native provenance order cluster: `3 passed` (13.9s). light/dark detail review에서 출처 순서, 영수증 검토 가독성, 320px 주요 시트 containment가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Provenance role labels — 2026-09-22

- 구매 출처와 상품 정보 출처의 첫 줄에 각각 `확인된 기록`과 `참고 후보` 역할 라벨을 추가해 카드 본문을 읽기 전에도 정보의 확정 정도를 파악할 수 있게 했습니다.
- Native provenance readability spot-check: `3 passed` (12.3s). light/dark detail review, receipt review legibility, 320px sheet containment를 유지합니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Date evidence confidence states — 2026-09-22

- 날짜 근거 카드에 `user-confirmed`, `unknown`, `estimated`, `printed` 상태 클래스를 명시적으로 연결했습니다. 사용자 확인값은 확정 기록 톤, 미확인은 amber 주의 톤, AI 기반 우선순위는 blue 참고 톤으로 분리해 직접 입력값과 미확인 상태가 같은 무게로 보이지 않게 했습니다.
- Native date/detail cluster: `9 passed` (29.1s). light/dark detail review, 320px date save, confirmed date readability, notification return, large text, safety action order, safe-area contract가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Date-state action messaging — 2026-09-22

- 날짜 상태별 진입 액션을 분리했습니다. 사용자 확인값은 `확인한 알림 날짜 수정`, 미확인 날짜는 `확인하지 못한 날짜 입력`, 기존 추정/표시 날짜는 기존 포장지 확인 흐름을 유지합니다.
- `unknown` 진입 버튼에는 amber treatment를 추가해 확인이 필요한 상태에서 다음 행동이 자연스럽게 이어지도록 했습니다.
- Native date/action cluster: `9 passed` (27.8s). 320px 저장, 사용자 확인 날짜, 알림 복귀, 큰 글씨, 안전 액션 순서, safe-area contract가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Narrow date evidence density — 2026-09-22

- 320px 날짜 카드에 상태 접근성 이름을 연결하고, 카드/입력 액션의 보조 문구와 패딩을 좁은 화면에서만 압축해 핵심 날짜와 다음 행동이 먼저 보이도록 했습니다.
- Native date density cluster: `10 passed` (26.2s). 320px 저장·복귀·안전 액션·큰 글씨·safe-area가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Date editor cancel focus return — 2026-09-22

- 날짜 편집을 취소할 때 상세 시트가 현재 스크롤 위치를 잃거나 포커스를 브라우저 기본 위치로 넘기지 않도록, 날짜 입력 액션을 다시 노출하고 `nearest` 스크롤·포커스 복귀를 연결했습니다.
- Date editor return regression: `1 passed` (6.3s). 320px에서 편집기 취소 후 날짜 입력 버튼 focus와 화면 내 위치가 함께 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Product provenance cancel focus parity — 2026-09-22

- 상품 출처 재확인에서 삭제 확인을 취소할 때 원래 `상품 출처 다시 확인` 액션으로 `nearest` 스크롤·포커스를 복귀시키는 계약을 날짜 편집 취소 흐름과 맞췄습니다.
- Detail focus parity cluster: `3 passed` (13.2s). light/dark detail review, date editor cancel return, 320px major sheet containment가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Product provenance cancel regression — 2026-09-22

- 상품 출처 삭제 확인에서 `취소`를 누르면 원래 `상품 출처 다시 확인` 액션으로 `nearest` 스크롤·포커스를 복귀시키도록 구현했습니다. 날짜 편집 취소와 동일한 보조 편집 복귀 규칙입니다.
- Detail parity cluster: `3 passed` (13.2s). light/dark detail review, date editor cancel return, 320px major sheet containment이 최신 소스에서 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Label review lazy-load retry context — 2026-09-22

- 상세에서 라벨 검토를 여는 lazy chunk 로딩이 실패한 뒤 토스트의 재시도로 다시 열 때 `returnSheet="detail"`을 보존하도록 수정했습니다. 이전에는 재시도 경로에서 인자가 빠져 독립 입력 화면으로 열릴 수 있었습니다.
- Native detail/intake cluster: `8 passed` (28.8s). detail review, storage save, confirmed date, date cancel focus, notification return, barcode, label confirmation, review-required routing이 최신 소스에서 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Storage mutation status semantics — 2026-09-22

- 보관 위치·개봉 상태 변경 시 `저장 필요 · ...` 상태를 `aria-live="polite"`로 노출하고, 저장 버튼 접근성 이름에도 변경 항목을 포함했습니다. 기존 날짜 검토/토스트 `role="status"`와 중복되지 않도록 status role은 추가하지 않았습니다.
- Native storage action cluster: `4 passed` (12.7s). 320px 저장 readback, 큰 글씨 action bounds, 안전 액션 순서, safe-area 위치가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Unsaved storage change disclosure — 2026-09-22

- 보관 위치·개봉 상태를 바꾼 뒤 아직 저장하지 않은 상태에서는 액션 바 아래에 `저장하지 않고 닫으면 변경한 보관 상태는 반영되지 않아요.`를 amber note로 노출했습니다. 부모까지 draft 상태를 올리는 큰 구조 변경 없이, 현재 닫기 동작의 손실 가능성을 사용자에게 명확히 알립니다.
- Native storage action cluster: `5 passed` (15.1s). 320px storage save readback, camera safe-area, large-text bounds, safety action order, food-detail safe-area가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Unsaved storage disclosure regression — 2026-09-22

- 320px 보관 위치 변경 테스트에 저장 전 손실 안내 문구를 고정해, 변경 상태에서 안내가 노출되는 계약을 회귀 방지 항목으로 추가했습니다.
- Storage disclosure spot-check: `1 passed` (4.7s). 냉동 변경 후 안내 노출과 저장 후 기존 readback/focus가 함께 유지됩니다.

## Unsaved storage close isolation — 2026-09-22

- 320px에서 보관 위치를 변경하고 저장하지 않은 채 상세를 닫는 경로를 추가 검증했습니다. 식품 목록 행 텍스트가 원래 값으로 유지되고, 목록 포커스가 해당 행으로 복귀해 draft 값이 readback에 섞이지 않습니다.
- Storage close isolation cluster: `2 passed` (7.1s). unsaved close와 saved readback을 같은 native lane에서 함께 확인했습니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Product info editor cancel focus parity — 2026-09-22

- 상품명·브랜드·분류 편집을 취소할 때 원래 `상품 정보 수정` 액션으로 `nearest` 스크롤·포커스를 복귀시키도록 날짜 편집·상품 출처 확인과 같은 보조 편집 규칙을 적용했습니다.
- Native detail regression cluster: `5 passed` (12.9s). detail review, storage save, large-text action bounds, safety action order, 320px safe-area가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Product info cancel and persistence parity — 2026-09-22

- 320px native fixture에 상품 정보 편집 취소 회귀를 추가했습니다. 임시 상품명을 입력해도 취소 후 원래 상품명과 `상품 정보 수정` 액션 포커스가 유지됩니다.
- Connected product-info/provenance cluster: `2 passed` (48.3s). 저장 실패 retry와 출처 삭제 성공/readback 실패 경계가 최신 구현에서 유지됩니다.
- Native cancel regression: `1 passed` (5.4s).

## Product info readback ordering verification — 2026-09-22

- Connected 상품 정보 persistence flow를 최신 소스에서 재실행해 저장 후 상세 hero의 상품명·브랜드·수량·보관 상태·날짜 근거가 함께 최신값으로 보이고, 상품 정보 변경 이력과 닫은 뒤 priority card까지 같은 readback을 사용하는지 확인했습니다.
- Connected printed-date/provenance readback: `1 passed` (30.8s). 날짜 의미, 상품 후보 출처, 변경 이력, 저장 후 priority 표시가 서로 오래된 값을 섞지 않습니다.
- Previous connected product-info/provenance cluster remains `2 passed` (48.3s).

## Product info cross-surface readback parity — 2026-09-22

- 저장 후 상세를 닫은 뒤 priority card뿐 아니라 inventory row에도 최신 상품명이 표시되고, 이전 상품명이 목록에 남지 않는 assertion을 추가했습니다.
- Connected cross-surface readback: `1 passed` (33.8s). 상세 hero·변경 이력·priority card·inventory row가 최신 상품 정보로 함께 수렴합니다.

## Product info save busy semantics — 2026-09-22

- 상품 정보 편집 그룹과 저장 버튼에 `aria-busy`를 연결해 저장 중 입력 비활성화와 서버 persistence 상태가 동일한 접근성 신호를 갖도록 했습니다.
- Connected product-info cluster: `2 passed` (43.5s). 저장 후 cross-surface readback과 persistence failure retry가 최신 구현에서 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Product provenance mutation busy semantics — 2026-09-22

- 상품 출처 삭제 mutation에 food 단위 in-flight 상태를 추가해 동일 식품의 중복 삭제 요청을 차단했습니다. 확인 영역에는 `aria-busy`와 `지우는 중` 문구를 연결하고 취소/삭제 버튼을 요청 중 비활성화했습니다.
- Connected provenance mutation cluster: `2 passed` (41.2s). persistence failure retry와 dashboard refresh 실패 후 성공 readback이 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.

## Label commit busy semantics — 2026-09-22

- 라벨 결과의 `확인 후 반영` 액션에 제출 중 상태를 추가해 parent manual-food mutation이 시작되면 중복 제출을 막고 `반영 중` 문구와 `aria-busy`를 노출합니다. 기존 parent가 즉시 상세/목록 readback을 소유하는 구조는 유지했습니다.
- Native label cluster: `3 passed` (6.6s). dark receipt review, label confirmation reachability, camera permission recovery safe-area가 유지됩니다.
- Runtime/build/diff: 28 protected files passed, 765 modules built, `git diff --check` passed.
