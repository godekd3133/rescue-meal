# Intake tabs accessibility readback — 2026-09-11

## Scope

Make the receipt, barcode, label, and manual-entry tabs a real accessible tab/tabpanel group without changing the selected Emerald Atelier layout or sheet geometry.

## Change

- Added stable tab IDs, `aria-controls`, `aria-selected`, and roving `tabIndex` values.
- Added a matching `role="tabpanel"` with `aria-labelledby` for the active mode.
- Added ArrowLeft/ArrowRight/Home/End keyboard movement with focus restored to the newly selected tab.
- Avoided the existing broad `*[class*="-panel"]` surface rule by naming the wrapper `mode-tabpanel`; the first attempt with `mode-panel` was caught in the rendered screenshot and removed.

## Readback

- Receipt intake tab test with semantic linkage and ArrowLeft/ArrowRight movement: **1 passed**.
- Native 320px viewport suite: **4 passed**.
- Full isolated fixture/mobile runtime after the semantic implementation: **35 passed, 3 skipped**.
- Production build: **passed**, protected runtime **28 files**, Vite **759 modules**.
- Receipt sheet geometry after the final class-name correction: width **393px**, content safe-area padding **53px**, document/body width **393px**, console/page errors **0**.
- Accepted final receipt capture: `evidence/design-qa-2026-09-11/native/native-receipt-sheet.png`.
- `git diff --check`: **passed**.

## Limits

This verifies browser DOM semantics, keyboard focus movement, rendered geometry, and the fixture interaction. Actual VoiceOver rotor navigation and TalkBack tab announcements remain physical-device acceptance gates.
