# Camera permission recovery accessibility readback — 2026-09-11

## Scope

Make the camera permission/error recovery state announce its transition to assistive technology while preserving the existing photo-library fallback and input-method recovery actions.

## Change

`CameraCapture` now marks the unavailable recovery region with `aria-live="polite"` and `aria-atomic="true"`. The existing region label, recovery heading, photo fallback, and `입력 방법 다시 보기` action remain unchanged.

## Readback

- Forced `getUserMedia()` rejection in the fixture browser.
- Opened the receipt camera flow at `393 x 852`.
- Confirmed the recovery region rendered with `aria-live=polite` and `aria-atomic=true`.
- Confirmed the recovery surface measured `353 x 340` inside the sheet.
- Confirmed photo-library and input-method recovery actions remained visible.
- Captured and inspected `evidence/design-qa-2026-09-11/native/native-camera-denied.png`.
- Camera fallback regression: **1 passed**.
- Full isolated fixture/mobile runtime: **35 passed, 3 skipped**.
- Native viewport regression: **4 passed**.
- Production build: **passed**, protected runtime **28 files**, Vite **759 modules**.
- Console/page errors during the focused capture: **0**.

## Limits

The live announcement contract is verified in the browser DOM and fixture flow. Actual VoiceOver speech, hardware camera interruption, and physical iOS/Android permission sheets remain device acceptance gates.
