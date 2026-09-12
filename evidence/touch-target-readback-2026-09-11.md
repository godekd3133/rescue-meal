# Touch target readback — 2026-09-11

## Scope

Raise the primary Rescue Meal touch targets to a 44px baseline without allowing the first viewport or sheet geometry to drift under the native navigation bar.

## Change

- Raised header account/scan/notification controls, Home add action, sheet mode/storage/time/serving controls, date guidance, notification mark-all, and install prompt actions to a 44px hit box.
- Kept the safety guidance card at a compact 39px visual/action height and reduced only the meal/add/trust rhythm so its bottom remains above the native nav.
- Added a native viewport regression that measures the Home, receipt, meal, detail, and notification controls.

## Readback

- 393px native Home: scan `44x44`, notification `44x44`, connection `44px` high, 식품 추가 `44px` high.
- 393px native Home: meal CTA bottom `653.4px`, add action bottom `699.4px`, trust card bottom `739.4px`, native nav top `740px`.
- 320px compact Home: default trust note bottom `625px` vs nav top `628px`; under 125% text the primary add action ends at `612.1px` vs nav top `628px`, while the safety note is intentionally scroll content.
- Meal mode choices and recipe time/serving choices: minimum `44px` height.
- Meal recipe save/view/history actions and food-detail discard action: minimum `44px` height.
- Food detail date guidance and storage choices: minimum `44px` hit box.
- Food detail opened-state toggle: `44x44` button box with the original compact track centered inside it.
- Native touch-target regression: **1 additional test passed**; native suite **7 passed**.
- Accepted captures:
  - evidence/design-qa-2026-09-11/native/native-touch-target-home-393x852.png
  - evidence/design-qa-2026-09-11/native/native-touch-target-meal-393x852.png
  - evidence/design-qa-2026-09-11/native/native-touch-target-detail-393x852.png
- The opened-state switch now preserves its compact visual track while exposing a `44x44` button box; its track remains centered inside that hit area.
- Production build: **passed**, protected runtime **28 files**, Vite **759 modules**.

## Limits

The geometry is verified in the native browser shell. Physical finger precision, assistive switch control, and platform gesture arbitration remain device acceptance gates.
