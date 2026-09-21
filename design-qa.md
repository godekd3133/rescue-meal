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
