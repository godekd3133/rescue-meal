# Native food-detail review flow — 2026-09-24

## Scope and user goal

Current `VITE_APP_SHELL=native` isolated demo in dark mode. Follow Home → spinach detail at `320×740` and `393×852`; verify that the printed date, exact review reason, label-recheck action, safety boundary, and record action read in a useful order. Do not save a date, storage change, consume action, or discard action.

## Steps and findings

1. **Home priority entry — healthy.** The spinach row separates its printed-date evidence (`표시 소비기한`) from the action/state (`날짜 확인`) and opens a named spinach detail dialog. See `01-home-native-320-dark.png`.
2. **Detail before — healthy hierarchy, small title.** The sheet shows storage/opened state, then the exact printed date `2026.09.02` and source `포장지 표시`, followed by the specific reason and a 44px `날짜 다시 확인` action. The reason's body text was 12px, but its important heading was 11px and its action label 10px. See `02-spinach-detail-native-320-dark.png` and `03-spinach-detail-native-393-dark.png`.
3. **Detail after — improved.** The review heading is now 12px and the label-action text is 11px; the explanation stays 12px and the button stays 44px. At `320×740`, the warning panel measures about 125px, the recheck button ends at y=394, and the separate 44px consume-record action remains visible at y=541–585 with the “already eaten only / the app does not judge safety” note before it. At `393×852`, those states remain visible and the consume action is at y=568–612. See `07-spinach-detail-native-320-dark-after.png` and `06-spinach-detail-native-393-dark-top.png`.
4. **Detail scroll end — healthy.** At maximum detail scroll on 320px, the three 44px storage choices end at y=597 and the opened-state control ends at y=668, inside the 740px sheet. The fixture already records spinach as opened, so its irreversible toggle is disabled and copy states that the opened record cannot be undone. See `08-spinach-detail-native-320-scroll-end.png`.
5. **Date recheck entry — improved.** Before this change, the sheet said the current record would not change before save but hid the exact date the user was rechecking. The entry now shows `현재 기록 · 표시 소비기한 · 2026.09.02 · 포장지 표시` in a compact note while preserving the save boundary in the header. The note fits in 44px and camera/photo actions still end at y=726 within the 320px sheet; the sample-only action is below the initial fold. Closing without saving returned focus to the date-recheck action with the same date and refrigerated/opened state. See `16-label-recheck-entry-current-date-320-dark-final.png` and `17-return-without-date-mutation-320-dark.png`.

## Changes

- Raised the Food Detail date-review heading from 11px to 12px.
- Raised the compact label-recheck action label from 10px to 11px while preserving its 44px touch height.
- Added the existing printed-date meaning/value/source to the date-recheck entry so the candidate can be compared with the record being reviewed.
- Added regression assertions for the 12px reason title/body, 11px action label, action spacing, and 44px action size.

## Evidence limits

- Captures `04` and `05` at 393px and `09`/`10` at 320px were rejected because the viewport capture omitted the sheet header during/after an open-sheet viewport resize even though the DOM reported it in bounds. `11` is only a header-element diagnostic, not a flow screenshot. Accepted full-flow captures are `06` at 393px and `07` at 320px, both with the header and sheet content visible.
- The local fixture date is read-only in this pass; actual printed-package confirmation, persistence, physical device safe areas, and VoiceOver/TalkBack were not exercised.
- The `확인 후 먹었어요` and discard buttons were never activated. Automated UI tests were not run by preference.
- Runtime integrity passed (28 protected files); the final build passed (770 Vite modules plus Sites output); `git diff --check` passed. The active preview remains native 320px dark on the spinach detail; at top the original printed date, recheck control, and consume-review action are present. Only local static assets and ephemeral image blobs were requested; no API call or record mutation occurred.
- The recheck entry now carries the existing printed-date meaning, exact value, and source. A separate native regression assertion was added for that summary and cancel/return preservation; automated UI tests remain intentionally unrun.
