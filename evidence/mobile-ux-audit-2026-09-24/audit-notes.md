# Mobile home → review-list audit — 2026-09-24

## Audit scope

Combined UX and accessibility readback of the local dark-mode mobile PWA at `320×740`: Home → open the all-review-items summary → inspect the filtered list and safety order → reset filters. The browser remained on the local demo. The interaction changed only the active list filter; no food, date, storage, or consumption record was changed, and no dynamic/API request was observed.

## User goal

Find every food that needs a date/storage check, understand what to review, and return to the full pantry without losing keyboard focus.

## Steps

1. **Home — healthy.** The home summary reports two review-required foods separately from the three-item priority queue. See `01-home-320-dark.png`.
2. **Open review list — healthy.** The summary opens the `확인 필요` filter directly; both spinach and eggs appear with their review reason and printed date. The list adds a concise three-step check order and a clear safety disclaimer. See `02-review-list-320-dark.png`.
3. **Reset control — improved.** Before the change, `검색·필터 초기화` measured `68×32px`, below the app's 44px touch-target convention. It is now `68×44px`; the safety disclaimer is 12px. The final settled state keeps both review rows and the check-order card visible. See `04-review-list-320-dark-final.png`.
4. **Return to all foods — improved.** Reset restores the `전체 7` filter and all seven rows, then moves focus to the selected `전체` filter instead of dropping focus to the document body. See `08-inventory-all-viewport-after-reset.png`.

## Findings and changes

- Increased the filter-reset target from 32px to 44px and made its summary row accommodate the target.
- After reset, focus now lands on the selected `전체` filter. A focused regression assertion was added.
- Increased the review-guide safety disclaimer from 10px to 12px; the 320px readback keeps it on one line.
- Added regression assertions for the 44px target, viewport reachability, focus return, and 12px safety copy.

## Evidence limits

- The `03` capture landed during scroll settling, and the first `05` page capture omitted the fixed nav layer; both were rejected. The inspected app-viewport capture `08-inventory-all-viewport-after-reset.png` is the accepted reset-state evidence.
- The local fixture verifies the review-list route and presentation, not connected inventory freshness or persistence.
- `npm run check:runtime` passed (28 protected files); `npm run build` passed (770 Vite modules and Sites output); `git diff --check` passed. Automated UI tests were not run by preference.
- Physical-device touch, VoiceOver/TalkBack, and zoom/responsive acceptance remain unverified.
