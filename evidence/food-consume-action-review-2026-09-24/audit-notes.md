# Food detail and consume-record flow — 2026-09-24

## Scope and user goal

Light-theme iPhone preview, isolated demo data only: Home → printed-date food detail → consume-record confirmation. Goal: understand why a food needs review, distinguish a past/uncertain date from a safety judgment, and confirm the exact food and amount before recording that it was eaten.

## Step 1 — Home (`01-home.png`)

- Strengths: the summary separates foods needing attention from general priority; the spinach row identifies `표시 소비기한`, labels the state `날짜 확인`, and keeps the date itself visible.
- UX risk: the optional PWA install prompt is inserted between the main meal action and the safety summary. At the captured 393×852-equivalent iPhone frame, the summary sits beneath the fixed bottom navigation, so the first view gives an optional install action more prominence than the review reminder.
- Accessibility risk: the safety summary remains reachable by scrolling, but its first-fold visibility is reduced. The screenshot cannot prove touch or screen-reader behavior.

## Step 2 — Food detail (`02-food-detail.png`)

- Strengths: the printed date is grouped with its source; the date review explains that the displayed date is today or earlier and offers a direct package-date recheck. It does not declare the food safe or unsafe.
- UX risk: the warning and action are clear, but storage/opened controls appear farther down the sheet. The screen still shows the current storage in the hero; the detail view must not imply that the app has assessed package condition.
- Accessibility risk: screenshot evidence does not establish VoiceOver/TalkBack reading order, focus announcement, or real-device safe-area behavior.

## Step 3 — Consume-record confirmation (`03-consume-confirm.png`)

- Strengths: the confirmation repeats the food and exact quantity, provides a return action, and says the app does not determine food safety. The original date reason remains visible above the confirmation at this viewport, so duplicating it would add noise.
- UX/accessibility risks: the safety explanation is rendered at 10px; the interactive confirmation panel is exposed as `role="alert"` while focus moves into its buttons. Its coral warning surface also resembles a destructive/error state even though this is a neutral record confirmation.
- Evidence limit: stopped before `먹었어요`; no consume event or saved-food mutation was made.
- Browser console: one missing `/favicon.ico` (404) and the existing deprecated `apple-mobile-web-app-capable` meta warning; neither produced a visible blocking error and neither was changed in this flow pass.

## Changes and post-change readback

1. Moved optional install/update prompts after the safety summary and shopping entry. In [`05-home-safety-priority.png`](05-home-safety-priority.png), the review reminder now appears above the fixed bottom navigation; the optional install prompt starts below it and can be reached by scrolling.
2. The consume confirmation is now an explicitly named group within the existing sheet dialog, with polite state announcement; it no longer uses the assertive `alert` role while moving focus into buttons. Its surface now uses neutral amber review styling rather than the coral discard/error treatment. The safety explanation is 12px. [`04-consume-confirm-refined.png`](04-consume-confirm-refined.png) shows the same food/date reason still visible above the confirmation at this viewport, so no redundant reason copy was added.
3. Regression assertions now cover install-prompt ordering, confirmation group naming/description, and 12px safety copy. Protected mobile runtime passed (28 files), production build passed (770 Vite modules plus Sites output), and `git diff --check` passed. Automated UI tests were not run.

Physical-device, VoiceOver/TalkBack announcement, and keyboard/safe-area acceptance remain separate. No final `먹었어요` action was clicked; no consume event or saved-food mutation occurred.

## Narrow viewport follow-up — 320×740

- Before: [`06-native-320-home.png`](06-native-320-home.png) showed `rescue meal` wrapping into two lines and the visible `식품 추가` label splitting at the final syllable.
- After: [`07-native-320-home-refined.png`](07-native-320-home-refined.png) keeps the wordmark and add label on one line; the primary meal CTA and safety summary remain visible above the fixed navigation. The notification affordance remains a separate compact row without covering the greeting.
- [`08-native-320-food-detail.png`](08-native-320-food-detail.png) and [`09-native-320-consume-confirm.png`](09-native-320-consume-confirm.png) confirm the date reason, recheck action, consume review action, and final return/record buttons remain reachable in the narrow sheet. The final record action was not pressed.
- Added native viewport assertions for one-line brand and add-action labels. Protected runtime passed, the 770-module production build passed, and `git diff --check` passed. Automated tests and real-device/screen-reader acceptance remain unrun.

## Unsaved storage-change branch

- In the isolated 320px demo, selected `냉동` without saving, then opened the consume confirmation. It now says the unsaved storage change is not part of the consume record and changes `돌아가기` to `돌아가서 변경 저장`; the exact food and amount remain visible. [`10-native-320-unsaved-state-confirm.png`](10-native-320-unsaved-state-confirm.png) is the readback.
- Chose the return-to-save action, verified `변경 저장` was present, and reloaded the isolated demo. The home returned to 7 fixture foods with spinach back in its original refrigerated state. No storage mutation or consume event was saved.
- Added a regression assertion for the pending-storage copy and return action. Automated UI tests remain unrun.

## Pending storage state confirmation refinement

- The consume mutation receives the food ID and event quantity; storage/opened edits are persisted separately through `변경 저장`. Previously, switching storage and then opening the consume confirmation hid the detail save hint.
- When storage or opened-state edits are pending, the confirmation now states they are not included in the consume record and changes the secondary action to `돌아가서 변경 저장`. Amount-only consumption remains represented by the confirmed quantity.
- In the isolated 320px demo, changed spinach from saved `냉장` to unsaved `냉동`, opened the confirmation, observed the conditional warning, returned to the detail and verified `변경 저장` was still available, then reloaded. The fixture returned to seven foods with the original refrigerated state; no storage or consume event was saved.
- [`10-native-320-unsaved-state-confirm.png`](10-native-320-unsaved-state-confirm.png) captures the pending-state confirmation. Build/runtime integrity passed; automated UI tests remain unrun.
