# Food detail first-fold readback — 2026-09-11

## Finding

A fresh native iPhone capture at `393 x 852` showed two first-fold defects in the
food detail sheet. With `snap=0.78`, the `개봉됨` state control began at approximately
`y=822px`, below the calibrated iPhone safe-area boundary at `818px`. After the
initial toggle fix, the detail mutation actions still measured `y=843.2..887.2px`,
so `먹었어요` and `보관 상태 저장` were still partly clipped.

## Change

The app-owned food detail sheet now opens at `snap=0.93` instead of `0.78`.
The current settled sheet measures `y=60..852px`; the complete food hero, date
proof, warning, provenance, storage choices, `개봉됨` control, and both primary
mutation actions are visible in the first viewport. The sheet content safe-area
padding remains `53px`, and the protected BottomSheet runtime is unchanged.

The native regression waits for the sheet entrance transform to settle before
measuring both the switch and the primary action row against the `34px`
home-indicator boundary.

## Current evidence

- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-sheet-393x852.png`
- Capture summary: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-capture-summary.json`
- Screen: `393 x 852`, sheet width `393px`, sheet bottom `852px`, content safe-area padding `53px`
- Capture console errors: `0`; page errors: `0`
- The accepted screenshot was inspected after capture and shows the complete opened-state switch, `먹었어요`, and `보관 상태 저장` actions above the home-indicator boundary.

## Verification lanes

| Lane | Result |
|---|---|
| Focused detail first-fold native regression | **1 passed** |
| Full native viewport suite | **11 passed** |
| Fixture/mobile runtime | **38 passed + 3 skipped** |
| Connected detail/first-opened browser regressions on ports `8137/4537` | **3 passed** |
| Latest full connected lane on ports `8146/4546` | **107 passed (4.8m)** |
| Frontend build | **760 Vite modules**, protected runtime **28 files** |
| Sites / service-worker / workspace-sync / release manifest | **4 / 5 / 9 / 2 passed** |
| `git diff --check` | passed |

## Acceptance boundary

This readback proves the current local source, native-shell geometry, and browser
interaction contract. It does not prove physical iOS VoiceOver speech, Dynamic Type
font substitution, the real home-indicator compositor, OEM inset behavior, or signed
production artifact promotion.
