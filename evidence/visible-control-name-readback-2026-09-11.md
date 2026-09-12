# Visible control accessible-name readback — 2026-09-11

## Scope

Prevent future UI changes from removing accessible names from visible controls across the major Rescue Meal surfaces.

## Coverage

The fixture regression visits Home, receipt intake, meal plan, food detail, account, notifications, and guidance. Within the device screen it checks visible buttons, links, inputs, selects, textareas, tab controls, and switches using the DOM accessible-name precedence `aria-label → aria-labelledby → text → placeholder/title`.

## Readback

- Major-surface accessible-name regression: **1 passed**.
- Full fixture/mobile current source: **38 passed, 3 skipped**; the added audit is included in the current 41-test lane.
- Native viewport: **6 passed**.
- Production build: **passed**, Vite **760 modules**, protected runtime **28 files**.
- This browser contract does not claim VoiceOver/TalkBack speech output or rotor navigation.
