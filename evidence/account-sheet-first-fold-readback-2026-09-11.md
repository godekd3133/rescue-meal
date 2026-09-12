# Account sheet first-fold readback — 2026-09-11

## Finding

A fresh native iPhone capture at `393 x 852` showed that the guest account sheet
opened with its primary `로그인` action partly below the viewport. Before the fix,
the account `snap=0.7` surface began at `y=256px`; the submit button measured
`y=829.7..873.7px`, so a user had to scroll before the first account action was
fully tappable.

## Change

The app-owned account sheet now opens at `snap=0.8`. The current capture measures
the sheet at `y=170..852px`, keeping the account lead, password-reset entry,
login/register tabs, both fields, and the complete `로그인` action in the first
393px-wide viewport. The existing `.sheet-content` safe-area padding remains
`53px`; the change does not alter the protected BottomSheet runtime.

The native regression waits for the sheet entrance transform to settle before
measuring geometry. This avoids treating the spring's intermediate off-screen
position as a layout failure.

## Current evidence

- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-account-sheet-393x852.png`
- Capture summary: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-capture-summary.json`
- Screen: `393 x 852`, sheet width `393px`, sheet bottom `852px`, content safe-area padding `53px`
- Capture console errors: `0`; page errors: `0`
- The accepted screenshot was inspected after capture and shows the complete primary login action above the iPhone home-indicator boundary.

## Verification lanes

| Lane | Result |
|---|---|
| Focused account first-fold native regression | **1 passed** |
| Full native viewport suite (including the later detail first-fold regression) | **11 passed** |
| Fixture/mobile runtime | **38 passed + 3 skipped** |
| Latest full connected lane on ports `8146/4546` | **107 passed (4.8m)** |
| Frontend build | **760 Vite modules**, protected runtime **28 files** |
| Sites / service-worker / workspace-sync / release manifest | **4 / 5 / 9 / 2 passed** |
| `git diff --check` | passed |

## Acceptance boundary

This readback proves the current local source, native-shell geometry, and browser
interaction contract. It does not prove physical iOS VoiceOver speech, Dynamic Type
font substitution, the real home-indicator compositor, OEM inset behavior, or signed
production artifact promotion.
