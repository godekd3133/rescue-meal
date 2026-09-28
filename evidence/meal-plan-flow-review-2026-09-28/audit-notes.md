# Native meal-plan cooking instructions review — 2026-09-28

## Scope and user goal

Review the native guest/demo route Home → today’s meal preview → safety and ingredient review → open and close cooking instructions. Viewports: `320×740` and `393×852`, light and dark. No save, actual cooking, consumption, or inventory mutation.

## Flow findings

1. **Home entry — clear.** The home screen keeps “오늘 식단 만들기” as the primary blue action and separates it from food intake. The date-review count remains a distinct safety shortcut. See `00-home-native-320-dark.png`.
2. **Preview first fold — safety comes before the recipe.** Time and serving options keep 44px targets. The preview presents a date/allergen summary before the recipe, then the specific printed-date and allergen notices. It clearly says the app cannot determine whether the food is safe to eat. See `01-meal-plan-top-320-dark-final.png` and `08-meal-plan-top-393-light.png`.
3. **Reach the cooking action — understandable but scroll-dependent.** The ingredient quantities, temporary-preview boundary, and `임시 저장`/`조리 방법 보기` actions appear together near the bottom. The boundary says the preview disappears on exit and stock is unchanged until cooking completion. At 320px, the action requires scrolling through the safety and ingredient details; both actions remain 44px. No save action was activated. See `02-preview-bottom-320-dark-final.png` and `09-preview-bottom-393-light.png`.
4. **Open cooking instructions — readable in both themes.** Three numbered steps and a separate cooking-safety note appear in full. Step text and the safety note are 12px with an 18px step line-height. Contrast measured 12.11:1/11.75:1 in dark and 13.37:1/11.78:1 in light for step/safety copy. The action is 44px; `aria-expanded` changes from false to true and the chevron points upward while open. See `05-cooking-instructions-320-dark-final.png`, `10-cooking-instructions-393-light.png`, and `11-cooking-instructions-393-dark.png`.
5. **Collapse and focus — healthy.** The same button returns to `조리 방법 보기` with a down chevron; focus remains on that control. Reopening returns to the expanded state. No save confirmation or cooking-complete control appeared.
6. **Check food details and return — fixed.** Before the fix, the planner had `scrollTop=400`, instructions expanded, and the spinach check in view. Opening and closing the linked spinach detail restored focus to that exact check, but restarted at `scrollTop=0` with instructions collapsed. The linked route now returns at `scrollTop=400`, preserves expanded instructions, and keeps focus on `식품 보기 · 시금치`. No date, storage, save, or consume action was changed. Compare `22-before-return-fix-middle-scroll.png` with the freshly reloaded `31-handoff-full-meal-state-preserved-393-dark.png`; detail screenshots are `15-spinach-detail-from-meal-393-dark.png` and `18-spinach-detail-from-middle-scroll.png`.
7. **Reach cooking steps from safety review — shortened.** After opening `날짜와 알레르기 안내 보기`, the full date/allergen details now end with a quiet `조리 순서 바로 보기` action before the ingredient rows. It remains a 44px read-only shortcut; opening it moves to the step panel and focuses `조리 방법 접기`. At 320px dark the safety section runs y=196–497 and the shortcut y=515–559; at 393px light it appears after the same safety checks before the ingredient list. No save or completion action appeared. See `40-safety-shortcut-320-dark-centered.png`, `41-shortcut-instructions-centered-320-dark.png`, `42-safety-shortcut-393-light.png`, `43-shortcut-instructions-393-light.png`, `44-safety-shortcut-393-dark.png`, and `45-shortcut-instructions-393-dark.png`.

## Strengths, risks, and next opportunity

- The ordered relationship between package-date/allergen review, recipe ingredients, and preparation guidance is explicit. A tap reveals instructions only; it is not mislabeled as cooking completion.
- The bottom `조리 방법 보기` control remains after ingredient details, but users can now reach the same steps directly from the completed date/allergen review, before traversing ingredient rows. The safety disclosures remain earlier in reading order and the shortcut explicitly says it only shows instructions. The linked-food round trip retains scroll and disclosure state.
- The fixed sheet header covers earlier content during scroll as expected, so the final 320px capture keeps the instruction panel fully visible and shows the preceding preview boundary without clipping its sentence. Earlier captures were rejected and recorded in `design-qa.md`.

## Accessibility and verification limits

- DOM readback confirmed named dialog, accessible disclosure state, retained focus, 44px action size, 12px operational copy, and measured color contrast. This is not a complete screen-reader, keyboard, zoom, Dynamic Type, or physical-device acceptance test.
- Browser showed zero JavaScript errors and one existing deprecated Apple web-app meta warning. The local guest fixture made no API call during this route. Plan saving, actual cooking, purchase, and consume-record actions were never activated.
- The narrow mobile UI regression was added but not executed. `npm run check:runtime` passed for 28 protected files; `npm run build` passed with 770 Vite modules and Sites output; `git diff --check` was clean; local preview returned HTTP 200. The targeted TypeScript-only check of the already-dirty native viewport spec reports unrelated existing `boundingBox()` and `SVGElement.offsetWidth/offsetHeight` type errors, which were not changed. No `/api/` request appeared in the browser network list.

## Nested detail return evidence

- Before: `22-before-return-fix-middle-scroll.png` shows a 400px scroll offset, an expanded cooking panel, and the spinach check in view. `21-return-after-middle-scroll-cooking-open.png` captures the pre-fix return, where the scroll offset and open panel were lost.
- Food detail: `15-spinach-detail-from-meal-393-dark.png` and `18-spinach-detail-from-middle-scroll.png`.
- After: `31-handoff-full-meal-state-preserved-393-dark.png` shows the same check position and the cooking panel still open. Browser readback confirmed the saved scroll offset (`400px`), focus returned to the spinach check, and no save/completion state appeared.
- Intermediate pre-fix returns are `16-return-from-spinach-detail-393-dark.png` and `19-return-after-middle-scroll-393-dark.png`. Hot-reload frames `24-hmr-meal-state.png` and `25-hmr-meal-state.png` are not used as final visual evidence.

## Accepted screenshots

- Home and preview: `00-home-native-320-dark.png`, `01-meal-plan-top-320-dark-final.png`, `02-preview-bottom-320-dark-final.png`, `06-home-native-393-dark.png`, `07-home-native-393-light.png`, `08-meal-plan-top-393-light.png`, `09-preview-bottom-393-light.png`.
- Open instructions: `05-cooking-instructions-320-dark-final.png`, `10-cooking-instructions-393-light.png`, `11-cooking-instructions-393-dark.png`, `12-handoff-cooking-instructions-393-dark.png`.
- Nested detail round trip: `22-before-return-fix-middle-scroll.png`, `15-spinach-detail-from-meal-393-dark.png`, `18-spinach-detail-from-middle-scroll.png`, and `31-handoff-full-meal-state-preserved-393-dark.png`.
- Safety-summary shortcut: `40-safety-shortcut-320-dark-centered.png`, `41-shortcut-instructions-centered-320-dark.png`, `42-safety-shortcut-393-light.png`, `43-shortcut-instructions-393-light.png`, `44-safety-shortcut-393-dark.png`, and `45-shortcut-instructions-393-dark.png`. `38-safety-details-with-step-shortcut-320-dark.png` and `39-shortcut-opened-instructions-320-dark.png` predate the final centered transition and are superseded.
- Latest dark handoff after the shortcut round trip: `45-shortcut-instructions-393-dark.png`. The centered shortcut view in 393px dark is `44-safety-shortcut-393-dark.png`.

## Recent-history disclosure and empty state — 2026-09-28

- The history expander now exposes `aria-expanded`/`aria-controls`, a down/up chevron, and a named region that is actually hidden when collapsed. Connected loading gets a status message instead of a transient empty result; guest and connected empty-history copy are distinct.
- The guest empty state explains both where a temporary plan appears and when it disappears. In the current 393×852 dark capture, the open disclosure, history heading, calendar icon, and empty-state title are visible. Supporting copy continues below the existing viewport position; the viewport was not scrolled further because browser-interaction approval was bounded to Home → food detail → date review.
- Added a light/dark native viewport regression for collapsed/expanded state, region visibility, exact guest copy, and 12px text. The test has not been run. No save, cooking, or consumption action was activated.
- Screenshot: `46-history-empty-dark-393.png`. Read-only browser checks found no `/api/` request, zero JavaScript errors, and one existing deprecated Apple web-app meta warning.

## Fresh mobile date-recheck flow — 2026-09-28

### Numbered steps

1. **Home — healthy.** At 393×852 dark, “오늘 식단 만들기” remains the dominant action while a separate 44px row says two items need package-date/storage review. See `50-date-flow-home-dark-393.png`.
2. **Spinach detail — healthy.** The printed source and date are shown together; the warning asks the user to recheck the label, storage, and opened state without claiming the item is safe or unsafe. The 44px `포장지에서 날짜 다시 확인` action follows that guidance. See `51-date-flow-spinach-detail-dark-393.png`.
3. **Date recheck — healthy after refinement.** Existing date and persistence boundary appear before input. The selected label route offers camera/photo input; a separate warning asks the user to verify what the printed date means before storing it as a use-by date. The method hint, step heading, and input instruction now render at 12px. See final 393px and 320px captures `53-date-flow-clear-copy-dark-393.png` and `54-date-flow-clear-copy-dark-320.png`.

### Findings and limits

- The first implementation of the 12px copy pushed the 46px camera button to y=704–750 on a 320×740 screen, clipping its lower 10px. Reducing vertical gaps only in the recheck form pulled it to y=689–735 without shrinking copy or controls. The optional sample-label action remains below the 320px fold and can be reached by scrolling; the camera/photo choices are fully visible.
- Focus opened on the selected `라벨` tab; the heading, selected tab, existing-date group, and step progress expose a coherent structure in the accessibility tree. Close is 44×44; tabs are 58×54 at 320px and 76×54 at 393px; camera and sample actions are 46px tall. This does not prove screen-reader or keyboard conformance.
- No image, camera permission, sample OCR, date change/save, consume action, or API call was activated. The browser showed zero JavaScript errors and one existing deprecated Apple web-app meta warning. Physical safe-area/device behavior and connected persistence were not tested.
- Added native viewport assertions for 12px guidance and full camera-action fit at 320px. UI automation remains unrun. Runtime integrity, production build, and scoped `git diff --check` passed.

### Accepted evidence

- `50-date-flow-home-dark-393.png`
- `51-date-flow-spinach-detail-dark-393.png`
- `53-date-flow-clear-copy-dark-393.png`
- `54-date-flow-clear-copy-dark-320.png`

## Continued date-review information hierarchy — 2026-09-28

- Benchmarked against KakaoPay's published principles of accessibility, clear graphic/text distinction, and explicit information priority; this is a principle-level reference, not a visual clone. The separate consumer-protection charter emphasizes clear and transparent information ([design retrospective](https://story.kakaopay.com/225-kakaopay-design/), [charter](https://www.kakaopay.com/qna/consumer/consumer_protection)).
- Raised the date-recheck persistence sentence and OCR date-meaning warning headline from 11px to 12px, matching the nearby support text and the local safety-copy minimum. Dark contrast measured 9.38:1, 13.39:1, and 8.02:1 across the persistence/helper, warning headline, and warning body; the blue camera label measured 5.78:1.
- At 393×852 dark the camera action is y=711–757. At 320×740 dark, the initial 12px change left only 3px at the bottom; reducing only the date-review form gap to 8px moved it to y=687–733 and leaves 7px clear. Camera/photo hit targets remain 46px.
- Final screenshots: `55-date-copy-12px-dark-393.png`, `56-date-copy-12px-dark-320.png`. These supersede `53`/`54` for the final copy/rhythm.
- Current date remains 2026-09-02 with its `포장지 표시` source. No camera, photo chooser, sample OCR, date edit/save, consumption, or API action was used. Screen-reader, keyboard, physical device safe-area, light theme, and connected persistence remain unverified. Runtime/build/diff checks passed; UI automation remains unrun.

## Light-theme recheck contrast — 2026-09-28

- Replayed Home → spinach detail → date recheck in light mode at 393×852 and checked the same date sheet at 320×740. The date copy, hierarchy, and camera/photo first-fold fit remained consistent with dark mode.
- Measured the light-theme blue text on `사진 선택` and `샘플 라벨 인식` at 3.37:1 before correction. Switched only secondary-control text to the existing deep-blue token; both now measure 4.90:1 on the sheet. The primary action and dark-mode accent remain unchanged. Added a native viewport test assertion for both controls against the sheet surface.
- Accepted light screenshots: `57-date-flow-home-light-393.png`, `58-date-flow-detail-light-393.png`, `59-date-flow-recheck-light-393.png`, and `60-date-flow-recheck-light-320.png`. At 320px, camera/photo controls are 46px high and remain fully visible; the optional sample action is below the fold.
- The active preview preference was restored to dark at 393×852. No camera, photo, sample OCR, date edit/save, consumption, or API action was triggered. UI automation remains unrun; protected runtime, build, and scoped whitespace checks are the verification lanes for this pass.

## Native-shell date recheck — 2026-09-28

- Focused native viewport automation first found stale role locators (the actual sheet is `날짜 다시 살펴보기`; the detail date group is `날짜 정보: 포장 소비기한`) and an unsettled-sheet measurement. Assertions now match the source-accessible names and wait for the bottom sheet's entrance transition to settle.
- In the native 320×740 shell, the previous 0.84 add-sheet snap placed the 46px camera choice below the visible viewport. The date-recheck context now uses a 0.90 snap; other add flows remain at 0.84. The saved-date message is shorter and keeps Korean word boundaries at narrow width.
- Three scoped native cases passed (393×852 light focus return, 320×740 light first fold, 320×740 dark first fold). The 393px light case also passed three repeat runs after stabilizing the sheet transition and polling final button geometry. Final native captures `63-native-recheck-393-settled.png`, `64-native-recheck-320-settled.png`, and `66-native-recheck-320-dark.png` were inspected; intermediate captures `61`/`62` are superseded.
- The native shell intentionally hides simulated phone chrome; the headless browser cannot prove real hardware safe-area interaction. Physical iOS/Android, VoiceOver/TalkBack, and the rest of the native suite remain unverified. No camera, photo, OCR, save, date mutation, or consume action was performed.
- Follow-up verification: protected runtime (28 files), production build (770 Vite modules plus Sites output), and scoped `git diff --check` passed. The broader UI suite remains unrun beyond these two approved-flow tests.
- Final web-shell preview capture `65-date-recheck-web-dark-393-final.png` shows the settled 393×852 dark recheck flow. The earlier statement that UI automation was unrun applied before these focused native checks; the broader native suite remains unrun.

## Focused screen-reader semantics baseline — 2026-09-28

- Added a scoped Axe scan of the date-recheck sheet in light and dark themes after Home → spinach detail → date recheck. `MOBILE_RUNTIME_TEST_PORT=4483 npm run test:runtime -- tests/accessibility.spec.ts --grep 'printed-date recheck sheet passes axe audit in light and dark themes' --workers=1` passed with zero reported violations.
- The scan covers automated accessibility rules for this one sheet in the preview runtime. It does not prove VoiceOver/TalkBack behavior, keyboard interaction, physical safe-area behavior, or accessibility of other flows.
- No camera, file chooser, sample OCR, date save, consumption action, or API request was performed.

## Keyboard focus return — 2026-09-28

- Added a native keyboard regression for the approved date-recheck route. Sixteen forward and sixteen reverse Tab moves kept focus within the recheck dialog; Escape closed it, restored focus to `포장지에서 날짜 다시 확인`, and preserved the existing printed date. The focused test passed.
- This confirms the tested browser focus loop only; it does not replace VoiceOver/TalkBack or physical-device keyboard acceptance. No form value or saved record was changed.

## Home bottom-navigation safe-area surface — 2026-09-28

- In a current `320×740` dark capture, the pantry heading appeared just below the fixed tab bar, inside the bottom safe-area tail. At `393×852`, the top edge of the pantry search showed below the same navigation bar.
- Added a background-only extension of the bottom navigation through the reserved safe-area region on preview/native shells. It does not move nav buttons, reduce their 44px-class targets, clip the scroll container, or remove pantry content from the accessibility tree.
- Native geometry regression passed at 320px and 393px in both light and dark themes. Captures `68-home-320-dark-safe-area-fixed.png`, `69-home-393-light-safe-area-fixed.png`, and `70-home-393-dark-safe-area-fixed.png` show the safe-area tail visually closed; `67-home-320-dark-audit.png` records the prior peek.
- The app remains on Home at 393×852 dark. No other flow, data, or API request was used. Physical iPhone safe-area and VoiceOver/TalkBack confirmation remain separate checks.

## Mobile home preview — 2026-09-28

1. **Home, 393×852 dark — healthy.** The primary meal action, separate date-review notice, pantry cards, and fixed bottom navigation are visible without overlap in the current handoff capture (`71`/`73`).
2. **Home, 320×740 light — healthy with a minor alignment note.** First-fold content remains legible, the bottom navigation fills the reserved safe-area tail, and pantry content does not show through. The notification control wraps onto a second header row but does not collide with the title (`72`).

- Current-run screenshots were saved and visually inspected: `71-home-393-mobile-open-2026-09-28.png`, `72-home-320-light-safe-area-2026-09-28.png`, and `73-home-393-dark-mobile-final-2026-09-28.png`.
- Browser state is restored to Home at 393×852 dark. The page reported zero JavaScript errors and one existing deprecated Apple web-app meta warning. This bounded screenshot pass did not navigate away, save a record, or trigger an API request.
- The existing native safe-area geometry regression covers 320/393px in both themes and passed in the preceding implementation pass. This screenshot review does not prove physical-device safe-area or VoiceOver/TalkBack behavior.

## Mobile home follow-up — card detail readability and hero notification position — 2026-09-28

1. **Header notification, 320×740 dark — healthy as designed.** The previous note called this a second-row wrap; DOM readback shows the control is absolutely positioned in the hero region by `.mobile-hero-notification`, with a 44×44 target at x=262–306, y=84–128. The 2-line heading ends well to its left, so the visible text does not collide. Existing native viewport coverage expects this layout; no header code changed. See `74-home-320-dark-header-slot-current-2026-09-28.png`.
2. **Priority food rows, 320/393 light and dark — improved.** Product/source/date support labels were 10px; the light source text measured 4.64:1 against the app surface. They now render at 11px on preview/native mobile widths through 420px. Light source text uses the existing `#4e5968` slate token at 6.25:1; dark source text remains 9.66:1. Warning-coral labels and action labels retain their existing styles.

- 320×740 rows are 57–58px; the meal action remains fully visible and the document width remains 320px. 393×852 rows are 65–66px with no horizontal overflow. Captures `76-home-320-light-metadata-readable-2026-09-28.png`, `77-home-320-dark-metadata-readable-2026-09-28.png`, `78-home-393-dark-metadata-readable-2026-09-28.png`, and `79-home-393-light-metadata-readable-2026-09-28.png` were saved and inspected.
- The native readability regression passed at 320px and 393px in both themes (4 combinations); the focused safe-area regression passed; the Home Axe scan passed with zero violations. Production build and protected-runtime checks passed, and `git diff --check` was clean.
- Final preview is restored to Home at 393×852 dark (`80-home-393-dark-mobile-handoff-2026-09-28.png`). Browser reported zero JavaScript errors and one existing deprecated Apple web-app meta warning. No other route or data-changing action was used; physical-device safe-area and VoiceOver/TalkBack remain unverified.

## Home shopping empty state — 2026-09-28

1. **Home, 393×852 dark and 320×740 light/dark — needs a visible next step.** The empty shopping button included guidance in its accessible name, but the mobile stylesheet clipped `.shopping-summary-empty-help` to a 1×1px absolutely positioned element. The card showed only `장보기 목록은 비어 있어요`; sighted users did not see how to add items. See current-run baseline captures `81`, `82`, and `83`.
2. **Home, after copy/layout refinement — healthy.** The visible helper now says `식단에서 재료를 담거나 직접 추가해 보세요.` at 11px, one line across 320/393px. At 320px the card grows from 50px to 68px but remains 52px above the fixed nav; the primary meal action remains fully visible. At 393px there is 126px between the card and nav. See `84`–`87`.

- KakaoPay was used as a principle-level comparator: keep main information distinct from its support, check graphic/text contrast, and provide clear and transparent service information ([design article](https://story.kakaopay.com/225-kakaopay-design/), [consumer protection charter](https://www.kakaopay.com/qna/consumer/consumer_protection)). Its logo, icons, typography, and palette were not copied.
- Five Home-only native viewport tests passed, including 320/393px in light/dark, one-line helper fit, 44px-class action spacing, current CTA/list order, and safe-area surface. The scoped Home Axe scan passed. This does not prove VoiceOver/TalkBack or physical-device safe-area behavior.
- The summary row was never opened, so no shopping item was added or changed; no food or consumption record was touched. Final preview remains Home at 393×852 dark. The current preview reports zero JavaScript errors and one existing deprecated Apple web-app meta warning.

## Home → food detail → date recheck — 2026-09-28

1. **Home, 393×852 dark — healthy.** Three priority foods and a separate two-item date/storage review summary are visible. The spinach row includes its source (`포장 소비기한`), date, and `날짜 확인` action. See `88-date-flow-home-393-dark-current.png`.
2. **Spinach detail, 393×852 dark — healthy.** The screen shows the exact printed date (`2026.09.02`), source, refrigerated/opened state, and a neutral message that the date is today or past. It asks the user to recheck the package date and storage/opened state without claiming food safety. The date recheck action is 44px. See `89-date-flow-spinach-detail-393-dark-current.png`.
3. **Date recheck, 393×852 dark — healthy.** The existing date/source is repeated before intake. Header copy says the current record stays unchanged until save; the label note asks the user to verify date meaning before storing it as a use-by date. Camera, photo, and optional sample actions are visible. See `90-date-review-393-dark-current.png`.
4. **Date recheck, 320×740 dark — primary actions healthy; optional sample needs a small scroll.** Camera and photo actions are 46px and fully visible. The sample button extends 5px below the initial viewport, but a 6px scroll reveals the whole 46px action; the sheet has 120px of scroll range. See `91-date-review-320-dark-current.png` and `92-date-review-320-dark-sample-revealed.png`.

- The focused Axe scan passed on the recheck sheet in light and dark with zero violations; this is not a substitute for VoiceOver/TalkBack or device testing.
- The guest flow made no `/api/` request and did not open the camera, photo chooser, sample OCR, date save, consume, or shopping action. Browser readback found zero JavaScript errors and one existing deprecated Apple web-app meta warning. Physical-device safe-area behavior remains unverified.

## Light-mode Home → food detail → date recheck — 2026-09-28

1. **Home, 393×852 light — healthy.** The review-count shortcut is visually distinct from the primary meal action, and the priority rows preserve date source and review labels. See `93-date-flow-home-393-light-current.png`.
2. **Spinach detail, 393×852 light — healthy.** The printed date/source and refrigerated/opened state appear before the action; the warning asks for a package check and does not label the food safe or unsafe. See `94-date-flow-spinach-detail-393-light-current.png`.
3. **Date recheck, 393×852 light — healthy.** The sheet repeats the current record, says it remains unchanged until saving, and tells the user to confirm what the label date means before storing it as a use-by date. Camera and photo actions are both visible. See `95-date-review-393-light-current.png`.
4. **Date recheck, 320×740 light — primary actions healthy; optional sample needs a small scroll.** The helper and date-meaning note wrap to two lines, while the 46px camera/photo actions stay fully visible. The sample button extends to y=745; scrolling 6px brings it to y=693–739. See `96-date-review-320-light-current.png` and `97-date-review-320-light-sample-revealed.png`.

- Dark/light date-recheck Axe coverage passed with zero violations. The visual audit is screenshot/DOM evidence only; it does not prove actual device safe-area, screen-reader, or camera behavior.
- No source code changed in this light-mode comparison. No camera, photo chooser, sample OCR, date edit/save, consumption, or shopping action was activated. Final browser state is Home at 393×852 dark.

## Local-date rollover readback — 2026-09-29

- At 00:05 Asia/Seoul, the loaded Home showed `화요일, 9월 29`, matching the browser's local `Date`; no stale `월요일, 9월 28` header remained. The app's current-date refresh is already scheduled every 60 seconds.
- Added and passed a native regression that starts at 23:59:30 local time and verifies the Home eyebrow changes from Monday, September 28 to Tuesday, September 29 after advancing through midnight without a reload.
- Screenshot: `100-home-393-dark-date-rollover-2026-09-29.png`. Build and protected-runtime checks passed. No data-changing action was performed.

## Optional sample action first-fold fit — 2026-09-28

1. **Date recheck, 320×740 dark — improved.** Before the spacing change, the 46px sample button ended at y=745 while the camera/photo buttons were fully visible. After reducing only the existing-food label recheck panel's repeated gap from 8px to 6px, camera/photo sit at y=637–683 and sample sits at y=689–735, leaving 5px at the viewport edge.
2. **Date recheck, 320×740 light — improved.** Same geometry and 5px clearance; safety copy and button labels retain their original size. No horizontal overflow or scroll is needed to expose any of the three label actions.

- Current-run after captures were saved and inspected: `98-date-review-320-dark-sample-fit-after.png` and `99-date-review-320-light-sample-fit-after.png`.
- The dedicated native regression passed for both themes, asserting all three actions remain at least 43.5px high and fully within the 320×740 viewport. `npm run build` passed with 770 modules and the protected runtime check passed (28 files).
- The modal was closed without saving; no camera, photo chooser, sample OCR, date edit, or consumption action ran. The app is restored to Home at 393×852 dark. Physical-device safe-area and VoiceOver/TalkBack remain unverified.

## 320px light date-sheet focus return — 2026-09-29

1. **Home → spinach detail → date recheck — healthy.** At 320×740 light, the detail still shows the existing printed date/source and the recheck button. Closing the recheck sheet returns focus to that same button; the date remains `2026.09.02`. The focused trigger is within the device screen bounds.

- Added and passed a focused native Playwright regression for this exact light/320 route. Screenshot `101-spinach-detail-320-light-focus-return.png` captures the returned focus state. No camera, photo chooser, OCR, save, or consumption action was performed; physical keyboard and assistive-technology behavior remain separate acceptance checks.

## 320px light/dark date-action focus visibility — 2026-09-29

1. **Keyboard return target — improved.** In both themes at 320×740, dismissing the date-recheck sheet with Escape restores keyboard focus to `포장지에서 날짜 다시 확인`. The stored printed date stays `2026.09.02`; no camera, photo, OCR, or save action runs.
2. **Visible location cue — improved.** The shared native runtime suppresses outlines and box shadows inside the device screen, so focus returned without a perceivable ring. A scoped, theme-aware 2px blue/pistachio border and subtle tint now identify the focused trigger. The focused border is solid, distinct from rest, and passes the 3:1 non-text focus contrast threshold in both themes.

- Native Playwright regression passed for light and dark. Screenshots `102-date-action-focus-visible-320-light-after.png` and `103-date-action-focus-visible-320-dark-after.png` were saved and visually reviewed; `104-home-393-dark-focus-audit-restored.png` records the restored 393×852 dark Home handoff.
- Build passed (protected runtime check: 28 files; Vite: 770 modules), and `git diff --check` passed. Current guest preview has zero JavaScript errors, one existing deprecated Apple web-app meta warning, and no `/api/` requests. Focus behavior on a physical keyboard, VoiceOver/TalkBack, and device safe-area behavior remain unverified.
