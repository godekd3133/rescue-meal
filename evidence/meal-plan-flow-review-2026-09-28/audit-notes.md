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

## Mobile date-recheck keyboard path — 2026-09-29

1. **Home, 320×740 light/dark — improved.** Keyboard focus on the first priority-food row is now outlined with a blue 2px ring, instead of relying on the subtle hover/focus tint. Both color variants are visible and remain inside the phone screen (`120` dark, `121` light).
2. **Spinach detail, 320×740 dark — improved.** The icon button for date guidance and the `포장지에서 날짜 다시 확인` action each show the same offset blue ring when reached with Tab. The source, date, warning, and 44px target remain unchanged (`118`, `119`).
3. **Date recheck, 320×740 dark — improved.** Focus is visible on camera, the photo-selection label (for the focused 1×1 file input), the sample action, and close. All three intake choices remain fully visible; the sample action occupies y=689–735 and its ring stays inside the viewport (`115`–`117`).
4. **Return path — healthy.** Escape closes the date sheet and returns to its trigger, then closes detail and returns to the Home food row. The existing date is still `2026.09.02`. The final preview is restored to Home, 393×852 dark (`122`).

- The existing-food label tab panel no longer creates an extra invisible Tab stop: it uses `tabIndex=-1` while its camera/photo/sample controls are present, so the selected tab advances directly to camera.
- The new 320px end-to-end keyboard regression passed in light and dark, asserting visible 2px rings and ≥3:1 contrast. The broader focus/backdrop group was 9/12: three out-of-scope failures remain in receipt preview (`aria-live` expectation) and notification trigger naming (`/알림 확인/`); no code in those areas changed.
- Captured and inspected this run's evidence: `105` Home, `107` detail, `109` date sheet; pre-fix focus `106`, `108`, `110`, `112`; after-fix focus `113`–`121`; restored Home `122`. Guest preview reports zero JavaScript errors, one pre-existing Apple web-app meta warning, and no `/api/` traffic. Camera, file picker, sample OCR, date save, consumption, and shopping actions were not activated. Screen-reader and physical-device behavior remain unverified.

## Food Detail record-action focus — 2026-09-29

1. **Food Detail, 393×852 dark — copy and sequence healthy; keyboard cue missing before fix.** The package date/source and storage state appear before the date warning. The warning explicitly says the app cannot decide whether food is safe, and the consume action remains below that note. However, Tab focus on product edit, consume, and discard previously had no visible location cue (`125`–`127`).
2. **Food Detail, 393×852 dark — improved.** A consistent blue focus ring now surrounds product edit, consume, discard, and storage choices. Amber review styling, coral discard styling, current-storage indication, target sizes, and the safety copy are preserved (`128`–`131`).
3. **Food Detail, 320×740 light/dark — improved.** The 46px consume action and its focused ring remain fully visible below the safety explanation in both themes. Current run shows dark and light captures (`133`, `134`); the two-theme native test also checks all detailed controls.
4. **Return — healthy.** No action was activated. Escape returns focus to the Home spinach row and leaves inventory/date unchanged; the browser is restored to 393×852 dark Home (`135`).

- The focused native route regression passed in both themes. It verifies the `aria-describedby` link to `consume-safety-hint`, distinct 2px focus rings with ≥3:1 contrast, and unchanged `냉장` selection while the user only traverses storage buttons with Tab.
- Build passed with protected runtime integrity (28 files) and 770 Vite modules; `git diff --check` passed. No `/api/` traffic, consume event, discard event, product edit, or storage mutation occurred. Real hardware keyboard, VoiceOver/TalkBack, and physical safe-area behavior remain unverified.

## Approved-route Axe and live-preview recheck — 2026-09-29

1. **Home, 393×852 dark — healthy.** Fresh capture `136` shows the priority count separate from the two-food date-review notice and leaves the primary meal action clear.
2. **Food Detail, 393×852 dark — healthy.** Fresh capture `137` preserves printed date/source, storage/opened state, and neutral recheck guidance before the record actions.
3. **Keyboard action sequence — improved.** Fresh capture `138` shows the safety-gated `먹은 기록 남기기` action with a blue focus ring while its note says to record only food already eaten and that the app cannot judge safety. The button was not activated. Escape restored Home with its trigger focused; capture `139` confirms the current 393×852 dark handoff.

- The three approved-route Axe checks passed with zero violations: Home, Food Detail, and the date recheck sheet in light and dark. The runner initially found port 4174 occupied, so it was rerun on isolated port 4597 without disturbing that process.
- Fresh live-page readback confirms 393×852, dark, Home, Tuesday September 29, and no open dialogs. Browser console has 0 errors and 1 existing Apple web-app meta warning. No consume/discard/storage/date mutation, file chooser, camera, or OCR action was run. Device keyboard and screen-reader acceptance remain unverified.

## Home keyboard entry-point focus — 2026-09-29

1. **Header and inventory link — improved.** Guest/account, theme, notification, and `전체 식품 보기` now show a blue focus ring with Tab; the notification badge remains readable (`147`–`149`).
2. **Primary and supporting Home actions — improved.** The meal CTA, add-food action, date-review summary, and shopping summary show the same 2px accent ring while preserving their semantic colors and copy (`150`–`153`, 393px dark).
3. **Narrow light Home — improved.** At 320×740, the CTA, date summary, and shopping summary rings stay inside the screen and above the fixed navigation (`154`–`156`).
4. **Bottom navigation — improved.** Keyboard focus on Food and Meal gets a separate `::before` ring; the selected Home underline remains unchanged (`146`). Final preview is restored to Home, 393×852 dark (`157`).

- The native Home focus regression passed across 320/393px and light/dark, covering the header, inventory link, three priority rows, meal CTA, add action, both summaries, and Food/Meal tabs. It checks 2px rings and ≥3:1 contrast without activating a control.
- The browser stayed within the approved Home scope. No inventory row, shopping summary, date summary, add-food, meal-plan, or navigation button was activated; no data changed. Screen-reader, physical keyboard, and actual device safe-area behavior remain unverified.
- After the Home styling update, the approved-route Axe checks were rerun: Home, Food Detail, and date recheck in light/dark all passed with 0 violations (3 tests).
- The Home-only contrast test also passed for the meal CTA label and supporting text in light and dark; both remain ≥4.5:1.

## Home inventory scroll and bottom navigation — 2026-09-29

1. **Home first fold, 393×852 dark — healthy.** The meal CTA, date-review summary, and shopping empty state sit above the fixed navigation. The current page has no horizontal overflow (scroll width 393px).
2. **Inventory at settled bottom scroll — healthy.** The list heading/search, three 44px filter chips, review summary, and 72px rows remain usable. The install banner and its supporting note are above the bottom nav at the maximum scroll position; transient overlap observed mid-scroll clears when scrolling settles at the end.
3. **Return to Home — healthy.** The browser scroll position returned to zero and the preview stayed at Home, 393×852 dark (`161`). No filter or item was selected/opened.

- Inspected current-run captures `159`–`161`. DOM geometry confirmed the scroll container width equals the viewport, maximum scroll is 924px, and final content/footer clears the 744px navigation top. The `보관 위치 필터` control remains at a 44px target; its options were not opened or changed. No shopping, install, record, or API-backed action was activated.

## Mobile preview handoff and evidence scope correction — 2026-09-29

- Opened the current local preview at `http://127.0.0.1:4190/` and set the live viewport to `393×852`. The final state is Home at scroll position zero in dark mode. Capture `165-mobile-home-live-preview-393-dark.png` shows the keyboard focus ring on the theme control; capture `158-home-first-fold-393-dark-before-scroll.png` is the same first fold without that temporary focus cue.
- Evidence review found that `159`/`160` and their duplicate captures `163`/`164` show the dedicated **내 식품 목록** screen with the Food bottom-navigation item active, not the lower inventory section of Home as the preceding heading states. Those images show the install banner partly behind the fixed navigation during mid-scroll (`159`/`163`) and fully clear above it at the scroll endpoint (`160`/`164`). They do not evidence the Home inventory geometry. The default `전체 7` chip is visible; no filter was changed and no food row was opened in those captures.
- Fresh live-page readback after returning Home reports `393×852`, no horizontal overflow, zero JavaScript errors, and one existing Apple web-app meta warning. This is browser evidence only; physical-device safe areas and assistive-technology behavior remain unverified.

## Narrow mobile priority labels and printed-date recheck — 2026-09-29

1. **Home, 320×740 and 393×852 dark — healthy.** The priority-row action labels fit their right-side date column; the apparent clipping in the scaled preview was not reproducible at either CSS viewport. The longest label measures 62px inside a 72px column at 320px (`166`–`167`). The primary meal action, date-review summary, shopping summary, and bottom navigation remain visible (`167`).
2. **Spinach detail, 320×740 dark — healthy for date review.** The printed source/date (`2026.09.02`, `포장지 표시`), opened/refrigerated state, neutral package-check guidance, and 44px date-recheck action appear in that order. The consume guidance stays immediately beside the consume action; later storage controls continue below the fold (`168`).
3. **Date recheck, 320×740 dark — healthy.** The existing date is repeated with `저장 전까지 기록은 그대로예요`; label copy asks the user to verify what the printed date means before treating it as a use-by date. Camera, photo, and optional sample actions are visible, but none was activated (`169`).
4. **Return — healthy.** Escape closes date review back to the unchanged spinach detail with focus on `포장지에서 날짜 다시 확인`, then closes detail back to the Home spinach row (`170`). Final preview was restored to Home, 393×852 dark (`171`).

- Added a regression assertion to `keeps home food source details readable across narrow viewport themes`: all three `.priority-state-label` strings must avoid text overflow and remain inside `.priority-date` at 320/393px in light/dark. This preserves the present wording because the suspected defect was not confirmed.
- Current focused native checks passed **3/3**, covering Home metadata/action fit, all 320px label-input choices, and return focus in both themes. Current Axe/contrast checks passed **4/4** for Home, Food Detail, date recheck light/dark, and primary Home copy. `npm run check:runtime` passed with 28 protected files.
- No filters, camera, photo chooser, sample OCR, date edit/save, consume/discard, or storage control was activated. Browser console remained at 0 errors with one existing Apple web-app meta warning. Physical-device safe area, VoiceOver/TalkBack, and camera behavior remain unverified.

## Narrow Home notification and headline clearance — 2026-09-29

1. **Home, 393×852 dark — unchanged and healthy.** The notification stays in the top action row. Fresh current-run capture `172` records the baseline; after the narrow-only adjustment, `175` shows the same 393px composition.
2. **Home, 320×740 dark — improved.** Baseline `173` placed the notification's 44×44 hit box at x=262..306 and the two-line headline's full box at x=14..306. The text glyphs did not visibly collide, but the interactive target overlapped the headline box by 44px. The narrow layout now reserves 52px to the right of the heading, leaving an 8px geometric gap while preserving its two-line wrap and first-fold CTA positions (`174`).

- The existing notification viewport regression now asserts that 320px heading and target separation. It failed before the CSS change with expected `notification.left >= 314`, received `262`; it passes after. The native action-size, first-fold, priority-order, and CTA set passed **5/5** after updating one stale test expectation from `확인하고 오늘 식단 만들기` to the current visible label `오늘 식단 만들기`.
- Home Axe and CTA contrast checks passed **2/2**. Protected mobile runtime passed (**28 files**), production build passed (**770 Vite modules**), and `git diff --check` passed.
- Only the Home surface was inspected; the notification itself was not opened. Physical device rendering, screen reader reading order, and widths below 320px remain unverified. Other legacy test selectors for the previous meal CTA name were not audited in this pass.

## Customer-facing CTA selector alignment and static intake/shopping review — 2026-09-29

- Fresh Home DOM readback at 393×852 dark confirms the current primary button name is `오늘 식단 만들기` (`.meal-plan-button`). Replaced **36** outdated references to `확인하고 오늘 식단 만들기` across `web-surface`, native, fixture, and connected specs; aligned the remaining offline CTA expectation to `다시 연결해 식단 보기` and its current helper copy. No product behavior or data flow changed.
- A source-only copy check of AddFood and ShoppingList found the intake error mapper turns OCR/provider failures into Korean recovery prompts; the date label flow keeps printed-date meaning separate from a saved use-by date; shopping distinguishes `구매 완료` from `식품 목록에 추가 전` and asks for actual quantity/storage before adding stock. No copy edit was justified by source alone.
- Home-only native layout/focus checks passed **5/5** and Home Axe/contrast checks passed **2/2**. The native, web, connected, and default Playwright configurations all parsed their test inventories (`79`, `2`, `151`, and `87` tests respectively). Test cases that open the meal, intake, or shopping sheets were not executed in this pass; those screens still need an approved visual review.

## Home light/dark mobile side-by-side readback — 2026-09-29

1. **Home, 393×852 light — healthy.** The top actions, two-line hero, priority rows, meal CTA, date-review summary, shopping empty state, and fixed navigation remain in the same hierarchy. The blue CTA and coral date-review accent stay distinct on the warm light surface (`176`).
2. **Home, 320×740 light — healthy.** The narrow hero remains two lines, the notification target stays to its right, and the meal/add actions plus review and shopping summaries fit above the fixed navigation (`177`). No row-label or horizontal overflow issue appeared.
3. **Handoff — restored.** Theme was returned to dark and the browser to Home at 393×852 (`178`). The theme button alone received focus from the reversible preview check; no other control or record was changed.

- These are current-run Home screenshots. No new CSS or product copy change was needed from the light-mode comparison. Home Axe/contrast coverage was already passing in both themes; physical display calibration and screen-reader behavior remain outside browser evidence.

## Offline Home refresh hierarchy and demo fallback disclosure — 2026-09-29

1. **Cached offline Home, 320×740 and 393×852 dark — improved.** The alert now states the cached/read-only status without repeating its old reconnect instruction or offering a second identical retry button. One prominent blue action, `최신 재고 불러오기`, uses a reload icon. Its supporting `<small>` copy exists in the DOM but is hidden at these mobile widths; the visible recovery guidance is the 12px alert and the labeled primary action, which remains above bottom navigation (`186`–`187`).
2. **No-cache demo Home, 393×852 dark — clearer.** The connected demo deliberately keeps `INITIAL_FOODS` as preview fixtures when the API is unreachable. The alert now says `예시 식품 미리보기` and makes clear that actual records could not be loaded, rather than presenting those rows as an unavailable list (`188`).
3. **No-cache demo spinach detail — safer.** Offline now makes Food Detail read-only even when there is no dashboard cache timestamp. The package date/source remain visible, edit/consume/storage mutations are unavailable, and the screen explains the offline limit (`189`). The screenshot path was Home → spinach detail only; no date edit, consume, discard, or storage change was performed.
4. **Online Home after the change — unchanged.** The normal 393×852 dark first fold remains intact (`190`).

- The focused connected Home test passed **1/1** across cached offline at 320/393, no-cache demo at 393, and no-cache spinach detail. Axe reported zero violations on all those screens; monitored food/meal/shopping/receipt mutation requests remained **0**. The API ran with a temporary SQLite database that was removed at test shutdown.
- This pass changes Home offline copy/action hierarchy and an offline read-only condition only. It does not visually verify AddFood or Shopping sheets, real device safe areas, VoiceOver/TalkBack, or production networking.

## Offline Home recovery and no-cache detail follow-up — 2026-09-29

1. **Cached offline Home, 320×740 and 393×852 — recovery works.** The only primary reconnect action is `최신 재고 불러오기`; selecting it refreshes the dashboard and restores `연결됨` plus `오늘 식단 만들기`. The Home stays above the bottom navigation during both the offline and restored states (`186`, `187`, `191`, `192`).
2. **No-cache demo Home, 393×852 — sample disclosure is explicit.** The offline callout now says `예시 식품 미리보기` and distinguishes those demo rows from actual records that failed to load (`188`). After reconnect, current Home returns (`193`).
3. **No-cache spinach detail — read-only.** Following the approved Home → food-detail path, the sample detail shows its printed date and source but removes record actions while offline (`189`). Escape closes it; no date correction, consume, discard, or storage action was taken.

- The focused connected test passed **1/1** across stale-cache offline 320/393, no-cache demo 393, Home → detail → Home, and reconnect recovery. It asserts 12px alert text, a single retry CTA, CTA bounds above the bottom navigation, zero Axe violations on four offline surfaces, and zero food/meal/shopping/receipt mutation requests. The API used a temporary SQLite database that was deleted at test shutdown.
- A no-cache demo case first failed because Food Detail became read-only only when `dashboardStaleAt` existed. The guard now treats every offline detail as read-only; the same focused test confirms the printed date remains visible while edit/storage/consume actions are unavailable.
- Final `npm run check:runtime` passed with 28 protected files; `npm run build` passed with 770 Vite modules; `git diff --check` passed.

### Mobile-copy visibility clarification

- At 320/393px the supporting `<small>` inside the meal CTA is CSS-hidden. The verified mobile recovery message is therefore the 12px offline alert plus the single visible `최신 재고 불러오기` CTA; the helper copy is not counted as visible mobile guidance. Desktop/wider helper-text presentation was not visually audited here.

## Offline retry hierarchy and fixture-data disclosure — 2026-09-29

1. **Cached offline Home, 320×740 and 393×852 — clearer.** Removed the retry button from the status alert so it no longer competes with a second control that called the same reconnect function. The alert now carries read-only/cache status; the single blue primary action is `최신 재고 불러오기` with a reload icon. Its 12px notice stays within the screen and its 44px action remains above the fixed navigation (`186`–`187`).
2. **No-cache demo Home, 393×852 — transparent.** The connected demo intentionally starts with `INITIAL_FOODS`; when the initial dashboard request is unavailable, the banner now labels them as `예시 식품 미리보기` and says actual records did not load (`188`).
3. **No-cache demo detail, 393×852 — read-only.** Opening the sample spinach row while offline shows its printed date and source but no edit/consume/storage mutations (`189`). Escape returns home; pressing the only refresh action restores `연결됨` and `오늘 식단 만들기` (`193`). Cached-offline recovery also returns cleanly at 320/393 (`191`–`192`). Current online Home remains unchanged (`194`).

- The connected Home regression passed **1/1**, spanning cached offline 320/393, no-cache demo Home/detail, and explicit reconnect. It checks the Home/detail Axe scan, vertical bounds, alert type/copy, refresh action, no dialogs during Home, and **0** food/meal/shopping/receipt mutation requests. The API used an isolated temporary SQLite database removed by the connected runner.
- Capture limitation: screenshot `189` contains the preview's pointer/tap marker over part of the date card; the DOM/Axe readback passed, but that capture is not used to judge the card's fine visual treatment. Physical devices, screen readers, and production networking remain unverified.
- Follow-up build gates: protected runtime **28 files**, Vite build **770 modules**, and `git diff --check` all passed.

## Date-recheck recommendation cue — 2026-09-29

**Audit scope:** guest mobile preview, 393×852 dark; Home → spinach detail → printed-date recheck. The saved date was not edited. Camera, photo chooser, sample OCR, consumption, and storage actions were not activated.

1. **Home — healthy.** The first screen separates the meal action from the coral date-review summary and keeps the three priority foods and their next actions scannable (`195`). After closing the flow, the same Home state was restored (`199`).
2. **Spinach detail — healthy.** The printed value (`2026.09.02`), `포장지 표시` source, refrigerated/opened state, and neutral recheck guidance precede the 44px `포장지에서 날짜 다시 확인` action. No safe/unsafe judgement is made (`196`).
3. **Date recheck — corrected.** The first fresh capture showed `추천` on the 영수증 tab while 라벨 was selected and the task was explicitly to verify the package date (`197`). The source attached the badge to 영수증 unconditionally. The recommendation is now contextual: an existing-date recheck recommends 라벨; ordinary food intake keeps 영수증 recommended. The accepted after-capture shows the badge over the selected 라벨 tab (`198`).

- Regression was observed red before the source fix and passed **1/1** after it. The existing date-recheck Axe test passed **1/1** in light and dark with zero violations. Both scans follow Home → detail → date recheck only; the sheet was closed without saving and the browser returned to Home. Runtime integrity checks ran as part of both Playwright web-server launches.
- Benchmark note: Kakao Pay's official store descriptions emphasize a short route to payment from any tab and grouping relevant payment benefits/coupons before purchase ([Google Play listing](https://play.google.com/store/apps/details?gl=KR&id=com.kakaopay.app), [App Store listing](https://apps.apple.com/kr/app/%EC%B9%B4%EC%B9%B4%EC%98%A4%ED%8E%98%EC%9D%B4/id1464496236)). This is feature/copy reference, not a current visual screenshot comparison. The transferable principle used here is one context-valid recommendation, while preserving Rescue Meal's own palette and food-safety semantics.
- Evidence limits: browser-emulated mobile only. Real camera/photo handling, screen-reader speech, physical safe-area behavior, and production network conditions remain unverified. The current preview reported zero JavaScript errors and one existing deprecated Apple web-app meta warning.

## 320px light date-recheck flow and Home accessibility-copy polish — 2026-09-29

**Audit scope:** guest preview at 320×740 light; Home → spinach detail → printed-date recheck. The existing date was not saved or changed. Camera, photo selection, sample OCR, consumption, and storage controls were not activated. The user-facing preview was restored to Home at 393×852 dark (`205`).

1. **Home, 320×740 light — healthy.** The two-line hero and notification affordance stay separated; three priority foods, the 54px meal action, the date-review summary, and empty-shopping guidance all remain above the fixed bottom navigation (`200`, final state `203`). The review summary's accessible name had a doubled period because source copy already ended in punctuation. After removing the extra separator and aligning its action wording, the DOM now reads `...살펴봐 주세요. 확인할 식품 목록 보기`; the visible copy did not change.
2. **Spinach detail, 320×740 light — healthy.** Printed date/source and the 44px recheck action remain visible below the package-date warning. The warning asks the user to recheck the package and storage/opened state without deciding safety (`201`).
3. **Date recheck, 320×740 light — healthy after polish.** The existing date/source and save boundary are visible. The selected 라벨 tab carries a now-readable 9px `추천` cue that clears the calendar icon; camera and photo actions are 46px, and the 46px sample action ends at y=735, within the 740px viewport (`204`).

- Red/green checks reproduced the doubled accessible-name punctuation, then passed the corrected exact accessible name. The focused native set passed **4/4**, covering that Home label, 320px light focus return, contextual 라벨 recommendation, and all date-recheck actions fitting in both themes. The printed-date Axe test passed **1/1** with zero violations across 320/393px × light/dark. No screenshot evidence was used to claim real-device or screen-reader acceptance.
- Final gates after these source changes: protected mobile runtime **28 files**, production build **770 modules**, and `git diff --check` passed. Full web/native/connected suites were not run.
- Evidence limits: browser-emulated layout only. Physical safe areas, real camera/photo handling, screen-reader speech, and production networking remain unverified.

## Home review-summary action wording — 2026-09-29

**Audit scope:** Home only at 393×852 dark. No card, filter, or navigation control was activated.

1. **Home review summary — clearer action name.** Its accessible name previously ended in the generic `식품 목록 보기`, although the card opens the filtered list of records that need checking. It now says `확인할 식품 목록 보기`; count, visible title, and safe date/storage reminder remain unchanged. The fresh after-capture confirms the visual layout stays stable (`207`).

- The focused accessible-name assertion failed before the change and passed **1/1** after it. The description still asks users to check both date and storage; the dynamic title identifies why the items entered the review set. Date-only, storage-only, and mixed title prefixes now each have a direct regression check; only the current date-only Home state was captured in the browser. Screenshot/DOM evidence does not prove spoken screen-reader output; VoiceOver/TalkBack remains unverified.
- After this source change, protected mobile runtime **28 files**, production build **770 modules**, and `git diff --check` passed. Full suites were not run.

## Home review-topic title variants — 2026-09-29

**Audit scope:** 393×852 dark Home; no review card or filtered list was opened.

1. **Date-only state — healthy.** The current rendered title is `포장지 날짜를 살펴볼 식품 2개`. The voice label ends with the more specific `확인할 식품 목록 보기`, matching the filtered destination (`208`).
2. **Storage-only and mixed states — source-logic covered.** The title prefix is `보관 방법을` when only storage is flagged, and `날짜와 보관 방법을` when both are flagged. The broad helper continues to ask for both date and storage checks as a safety reminder; it does not say both are incorrect.

- The title-prefix rule was extracted as a pure helper and covered for date-only, storage-only, and mixed topics; together with the Home accessible-name check, the focused native test set passed **2/2**. Home Axe passed **1/1** with zero violations at 320px and 393px. Only the date-only state was rendered in this run; storage-only/mixed visual states and actual screen-reader speech remain unverified.
- Final gates: protected mobile runtime **28 files**, production build **771 modules**, and `git diff --check` passed. Full suites were not run.

## Home review-topic variants with isolated dashboard fixtures — 2026-09-29

**Audit scope:** Home only at 393×852 dark. Each scenario uses an independent connected-test browser context with a fixture dashboard response. No record action, filter, or other sheet was activated.

1. **Date-only review — healthy.** One printed date is past; Home says `포장지 날짜를 살펴볼 식품 1개`, and that food row offers `날짜 확인` (`210`).
2. **Storage-only review — healthy.** The printed date is still ahead, while recorded and applicable storage differ; Home says `보관 방법을 살펴볼 식품 1개`, and the food row offers `보관 확인` (`211`).
3. **Mixed review — healthy.** One food needs date review and the other storage review; Home says `날짜와 보관 방법을 살펴볼 식품 2개` and exposes each row's corresponding action (`212`).

- A first attempt reused one page across all three fixtures and produced a residual cross-device banner in the latter captures; those images were rejected. Re-running each state in its own browser context produced the clean accepted captures above.
- The connected UI test passed **3/3**; each state also passed its scoped Axe scan with zero violations, and the monitored food/meal/shopping/receipt mutation request list remained empty. This verifies the Home rendering of all title/action variants using fixture-backed responses, not production data or server persistence.
- Evidence limits: browser-emulated 393px only; real screen-reader speech, physical safe areas, and production networking remain unverified.

## Home review-topic variants at 320px light — 2026-09-29

**Audit scope:** Home only at 320×740 light, with isolated connected-test dashboard fixtures. No food action, filter, or sheet was opened; monitored food/meal/shopping/receipt mutations remained absent.

1. **Date-only review — healthy.** One date-review row is visible and the summary stays `포장지 날짜를 살펴볼 식품 1개` (`213`).
2. **Storage-only review — healthy.** One storage-review row shows `보관 확인`, and the summary says `보관 방법을 살펴볼 식품 1개` (`214`).
3. **Mixed review — healthy.** The two rows retain distinct `날짜 확인` and `보관 확인` actions under `날짜와 보관 방법을 살펴볼 식품 2개` (`215`).

- The test matrix now passes **6/6** across the three variants at 320px light and 393px dark, with zero Axe violations per screen and zero monitored record-write requests. Each scenario runs in a fresh browser context; the stale banner from the earlier reused-page capture was not used as evidence.
- These are fixture-backed browser layouts, not persisted user data. Real-device safe areas, spoken screen-reader output, and production networking remain unverified.

## Existing-food date-recheck intake hint — 2026-09-29

**Audit scope:** Home → spinach detail → date recheck at 393×852 dark, with the supporting 320px/date-focus regression. No camera, photo, sample OCR, date save, consume, or storage action was activated.

1. **Date recheck — clearer context.** Before the copy change, the selected 라벨 tab said `포장지 날짜를 사진으로 읽어 기록해요`, which reads like new-food entry even though the sheet header identifies an existing spinach record and promises the stored value remains unchanged (`218`). It now says `포장지 날짜를 다시 읽어 확인해요` for the existing-record recheck context (`219`). The normal new-label-entry fallback remains `...사진으로 읽어 기록해요`.

- The focused recheck assertion reproduced the mismatch before the fix. After the conditional copy change, the 320px/393px date-return cases passed **3/3**; the date-recheck Axe test passed **1/1** with zero violations across 320/393px light/dark.
- The normal new-food label flow was not opened or visually audited in this pass; only its unchanged fallback copy was source-inspected. Physical camera, screen-reader speech, and real-device safe-area behavior remain unverified.
- Final gates after this source change: protected mobile runtime **28 files**, production build **771 modules**, and `git diff --check` passed. Full suites were not run.

## Source-only AddFood/Shopping recovery review — 2026-09-29

**Scope:** static producer → consumer and test-source review only. AddFood and Shopping sheets were not opened in the browser.

- `refreshShoppingList()` distinguishes an expired login (`auth_required`, `로그인이 만료됐어요. 다시 로그인해 주세요.`) from other load failures, but does not set a Shopping `retryAction` for the auth case. `ShoppingListSheet` then falls back to a `다시 시도` button that calls `onRefresh` again. When no items are loaded, the progress header also gives the fixed instruction `인터넷에 연결한 뒤 목록을 다시 불러와 주세요.` and displays `0/0`, regardless of whether the error was authentication-related.
- This is a source-backed recovery/copy mismatch candidate: the message attributes the failure to connectivity and the only local action repeats the failed read even when the producer says login is required. It has not been changed or runtime-confirmed in this pass because the Shopping sheet remains outside the approved visual scope. The existing connected tests found by source search cover mutation retries, not this empty-list auth case.
- Follow-up producer/consumer trace: the auth branch also calls `resetWorkspaceReads()`, which clears the cached shopping rows, so the consumer enters its empty-error branch and announces `0/0`. `ShoppingListSheetProps` exposes no account-opening callback; the only fallback action remains `onRefresh`. A safe acceptance contract is: on an empty-list 401, show the login-specific message with a direct re-login action, suppress the meaningless `0/0` progress header and network-only hint, and assert no food/shopping mutation. This remains a proposal until the sheet can be visually verified.
- Home's own auth recovery is present in source: `auth_required` adds the `계정 연결이 만료됐어요` callout with a `다시 로그인` button, and the main CTA routes to account. `showShoppingSummary` hides the shopping card while the workspace is unauthenticated, avoiding a stale-looking list. This makes the remaining candidate narrower: recovery is missing only while the Shopping sheet stays open after 401; that state has not been opened or changed.
- AddFood’s ordinary label-intake copy remains the untouched fallback; only the already-approved existing-food date-recheck branch received a contextual hint. Its general intake sheet also remains visually unreviewed.

## Mobile browser preview and approved date-recheck path — 2026-09-29

**Audit scope:** Visible local preview at `http://127.0.0.1:4190/`, resized to 393×852 in dark mode. Interacted only with Home → spinach detail → date recheck, then closed both surfaces and returned to Home. No save, consume/discard, camera, photo selection, or OCR action was activated.

- Home was left open in the mobile viewport. Browser measurements confirmed `innerWidth=393`, `innerHeight=852`, `scrollWidth=393`, no horizontal overflow, and no remaining dialog after returning Home. The console reported 0 errors and one existing Apple web-app meta warning.
- The existing-food date-recheck sheet retained the current recorded date and said the record remains unchanged until saving. Its selected label path showed `포장지 날짜를 다시 읽어 확인해요` and instructed users to check the label before interpreting the date; the flow was closed without advancing or saving.
- Evidence: mobile Home (`220`, and clean return state `222`) and date-recheck sheet (`221`). No food/shopping/meal/receipt record action was triggered. This is a browser-emulated viewport, not a physical-device or installed-app check.

## Date-recheck hierarchy and narrow-screen fit — 2026-09-29

**Audit scope:** Fresh in-app browser capture of Home → spinach detail → date recheck at 393×852 dark, with the date-recheck sheet also inspected at 320×740 dark. No date was saved; no camera, photo, sample OCR, consume/discard, or other sheet was activated.

1. **Home — healthy.** The first fold separates the three-item priority set from the review-required count and provides distinct meal, add-food, and review entry points (`223`); no horizontal overflow was measured.
2. **Spinach detail — healthy.** The printed-date meaning and source appear together, with a review explanation before the date action. The app explicitly says it does not decide whether food is safe (`224`). This sheet continues below the viewport and requires scrolling for lower controls.
3. **Date recheck — improved.** The previous layout put four general intake choices before the date already on record. The existing recorded date now appears first, before method choices; assistive technology hears `날짜 확인 1단계` for this existing-record flow, while its compact visible `입력 · 살펴보기 · 저장` rail is preserved (`225`, `227`).

- The 320px first pass put the sample-label action 2.14px below the viewport. A ≤360px-only 4px spacing reduction brought every 46px capture/photo/example action inside 740px; the final measured sample-action bottom is 738.3px (`226` is the rejected diagnostic capture; `228` is the accepted recapture).
- Benchmark used as a principle, not a visual clone: KakaoPay's official App Store description highlights preparing payment with two taps from any tab. Here the analogous choice is to foreground the user's current date before offering alternate inputs; the listing is not evidence for a full KakaoPay visual audit: [official KakaoPay App Store description](https://apps.apple.com/kr/app/%EC%B9%B4%EC%B9%B4%EC%98%A4%ED%8E%98%EC%9D%B4/id1464496236?platform=ipad).
- Focused native checks passed **3/3**; the printed-date recheck Axe test passed **1/1** across 320/393px light/dark; protected mobile runtime **28 files**, production build **771 modules**, and `git diff --check` passed. The default fixture-test port 4174 belonged to a PC Supporter process and was left untouched; Axe was rerun on isolated port 55183.
- The browser was restored to Home at 393×852 dark with zero dialogs, `scrollWidth=393`, and 0 console errors (`229`). Real VoiceOver/TalkBack output, device safe areas/camera, and production network behavior remain unverified.

## PWA browser-chrome polish — 2026-09-29

**Scope:** Install metadata and brand icon only; no additional in-app flow was opened.

- The browser previously requested missing `/favicon.ico` and warned that only the legacy Apple install-capable meta was present. Added a standard `mobile-web-app-capable` tag while retaining the Apple-specific tags, and linked the existing `rescue-meal-192.png` as the favicon; no new logo asset was created.
- After a fresh in-app-browser navigation, the app remained at Home at 393×852 dark with no horizontal overflow. The favicon request returned **200**, and the newly loaded page reported **0 console errors / 0 warnings**. Final viewport screenshot: `230`.
- PWA metadata contract **2/2**, browser icon-reachability test **1/1**, protected mobile runtime **28 files**, production build **771 modules**, and `git diff --check` passed. Test-only color-environment warnings were emitted by Node, not by the app browser.

## Responsive pantry entry at the Home fold — 2026-09-29

**Audit scope:** Home only, dark theme at 320×740, 393×844, 393×852, and the supported Pixel-width 427×952 browser viewport. No card, sheet, filter, or record action was activated.

1. **Short 320×740 screen — healthy.** Priority foods, meal/add actions, the date-review count, and shopping summary remain the visible Home loop. The pantry section begins below the viewport, and `전체 식품 보기` remains available (`239`).
2. **393×844 and 393×852 — improved.** The prior fixed 155px spacer left 155px after the shopping card and hid the pantry's entry point. The title and search now use the available strip above bottom navigation; the first food image stays below the viewport (`240`, `241`).
3. **Pixel-width 427×952 — healthy.** The spacer grows with viewport height so the same pantry title/search pair lands just above navigation, while food rows stay below the initial view (`242`).

- Source measurements showed the former 155px margin let the native 320×740 inventory section start 5.1px inside the initial screen. The prior spacing assertion also measured from the earlier safety card even though the shopping summary had since become the final Home card. The regression now measures from that actual last card; the spacer adapts to viewport height, keeping the pantry below fold on compact screens and using taller screens for its title/search, not food rows. The intermediate captures `235`–`238` are superseded by the accepted final captures `239`–`242` after the search-to-navigation breathing room was increased.
- The focused native layout test passed **1/1 across all four viewport cases**. Home Axe passed **1/1** at 320px and 393px; runtime integrity **28 files**, production build **771 modules**, and `git diff --check` passed. All captures were opened and visually inspected.
- The 427×952 result is an emulated viewport, not a physical Pixel safe-area or TalkBack check. The current browser is left on Home at 393×852 dark.

## Home light/dark fold parity — 2026-09-29

**Audit scope:** Home only at 393×852. The existing theme control was switched to light for inspection and restored to dark; no list, search, sheet, or record action was used.

- The pantry title/search and fixed navigation retain the same ordering in both themes. The blue meal action, coral date-review summary, and search field remain visually distinct in light mode (`244`) and the browser was restored to the requested dark Home (`245`; dark baseline `243`). Scroll width remained 393px and no dialog remained open.
- The Home Axe test now exercises light and dark at both 320×740 and 393×852, passing **1/1 across all four combinations**. Protected mobile runtime **28 files**, the latest production build **771 modules**, and `git diff --check` passed.
- This is screenshot and automated browser evidence, not physical-device color/brightness, VoiceOver, or TalkBack acceptance.

## Home empty-shopping copy trim — 2026-09-29

**Audit scope:** Home shopping summary only at 320×740 and 393×852, light and dark. The card was not opened; no shopping item or other record was changed.

- The small kicker already names the area `장보기`, so the old title `장보기 목록은 비어 있어요` repeated the same category immediately. It now says `아직 담은 재료가 없어요`; the existing helper still explains both ways to add items.
- The empty summary button now announces `장보기 목록 열기` plus the current empty state; the helper is attached as its accessible description. This names the destination before the status without adding visible clutter; the final DOM and screen readback are `258`/`260`.
- A fresh continuation readback at 393×852 dark confirms the final button name/description, zero horizontal overflow, no open sheets, and the restored Home state (`261`). No shopping action or record mutation occurred.
- Optional benchmark lens: KakaoPay's official guide describes the payment tab as combining a fast entry action with a top summary of recent activity. I interpreted that as separating the `장보기` category, current empty state, and next-step helper into distinct short lines here; this is a hierarchy/copy analogy, not a visual clone ([official guide](https://contents.kakaopay.com/contents/1429)).
- The shorter status fits on one line at both widths in both themes. Accepted final captures: 320px dark/light (`250`, `251`) and 393px light/dark (`259`, `260`); earlier 393px captures (`249`, `253`, `254`) are superseded. Dark Home was restored at 393×852 with no horizontal overflow or open dialog.
- The focused native empty-shopping Home test passed **1/1 across all four viewport/theme cases**, confirming title, helper, and layout. Home Axe passed **1/1 across 320/393px light/dark**, protected runtime **28 files**, production build **771 modules**, and `git diff --check` passed.
- The guest shopping-sheet test expectation was updated for the new title but not run because it continues by opening the Shopping sheet, outside this turn's approved browser scope. The Home-only test covers the visible changed state.
- Fresh continuation capture `262` confirms the final 393×852 dark Home and DOM action name/description, with no open dialog or horizontal overflow.

## Home dark-theme preference persistence — 2026-09-29

**Audit scope:** Home only at 393×852 in the in-app browser. The visible theme control was switched to dark, then the same route was reloaded; no sheet or record action was used.

- The selected mode and `localStorage[rescue-meal.theme]` both read `dark` after the toggle and after reload; the reloaded Home has no open dialog or horizontal overflow (`264`, `265`). This verifies browser-local theme preference persistence in this preview, not OS appearance synchronization or installed-device behavior.

## KakaoPay payment-tab visual benchmark — 2026-09-29

**Scope:** Read-only review of KakaoPay's official PayAttention page in a separate in-app-browser tab; the Rescue Meal preview tab stayed open and was restored as current afterward. No KakaoPay account or action was used.

- The guide's embedded app capture places an always-visible barcode/payment balance first, then shortcut icons, then a recent-transaction/savings summary, followed by membership/benefit content (`256`). This supports a task-first hierarchy with concise status and a visible shortcut; it is a marketing guide's app capture, not a live authenticated session.
- The official App Store listing separately describes payment preparation from any tab with a two-tap shortcut. I use this as interaction-priority context, not as a requirement to imitate its visual design: [KakaoPay payment-tab guide](https://contents.kakaopay.com/contents/1429), [official App Store listing](https://apps.apple.com/kr/app/%EC%B9%B4%EC%B9%B4%EC%98%A4%ED%8E%98%EC%9D%B4/id1464496236).
- Accepted local captures: article overview (`255`) and embedded app screen (`256`); both were opened and visually inspected. The official page's asset descriptions were used only to identify the screen contents; the visual comparison is based on the actual browser capture.

## Date-recheck recommendation badge contrast and accessible cue — 2026-09-29

**Audit scope:** Existing Home → spinach detail → printed-date recheck at 320×740 in light and dark. The date remained unchanged; no camera, photo selection, sample OCR, consume/discard, or save action was activated.

1. **Date-recheck method tabs — improved.** The small `추천` marker grew from 9px to 10px, uses the theme's readable blue token, and the recommended tab is now announced as `라벨, 추천`. At 320px the badge remains clear of the calendar icon.

- Before the change, light-theme accent `#3182f6` on the date sheet's `#f2f4f6` surface measured **3.37:1**. After the change, the light foreground `#2368c8` measures **4.90:1**; dark foreground `#a4b7ff` on `#101419` measures **9.50:1**. The visible primary blue accent remains unchanged.
- Accepted, opened, and visually inspected captures: dark (`271`) and light (`272`); their SHA-256 values differ. Earlier captures (`269`, `270`) were byte-identical and are retained but rejected as theme-comparison evidence.
- The two focused native viewport regressions passed **2/2**, including the readable-tab name and ≥4.5:1 contrast in both themes at 320px. The date-recheck Axe test passed **1/1** across 320/393px light/dark, with zero violations. Protected mobile runtime **28 files** and production build **771 modules** passed; `git diff --check` passed.
- The separate bundle-budget check remains **not passed**: CSS is **352.5KB** against a **260KB** budget. The source stylesheet was **435,752 bytes at HEAD** and is **436,047 bytes now** (+295 bytes), so this small badge change does not explain the existing-sized overage; the budget was not weakened. Full test suites, physical-device rendering, VoiceOver, and TalkBack remain unverified.
- Final in-app preview restored to Home at 393×852 dark, with `scrollWidth=393` and no open dialog. No food, shopping, meal, or receipt record mutation was triggered.

## CSS bundle budget overage diagnosis — 2026-09-29

**Scope:** Read-only stylesheet/build-path analysis after the production bundle gate failed. No CSS thresholds or protected runtime files were changed.

- The checked production stylesheet is **360,910 bytes (352.5KiB)** against the **260KiB** budget; Vite reported **53.07kB gzip**. `src/main.tsx` statically imports the single app-owned `prototype.css`, so the feature styles ship in one global CSS asset.
- PostCSS parsed **2,879 rules**. It found **12 exact-repeat groups** with roughly **997 bytes** of theoretical duplicate payload; restricting to adjacent identical-declaration groups, where consolidation can preserve order, yields about **717 bytes** estimated savings. A Lightning CSS minification probe saved **634 bytes** (`360,910 → 360,276`) without warnings. Neither safe route explains the **92.5KiB** gap.
- The source stylesheet is **435,752 bytes at HEAD** and **436,047 bytes now** (+295 bytes, the date-recommendation styling change). The measured budget failure is therefore not caused by this change. The budget was not raised and no selector was purged without screen coverage.
- The import boundary `src/main.tsx` is protected by `apps/web/AGENTS.md`. A substantial reduction needs component/route-owned style loading and a separately authorized change to that boundary, followed by full runtime integrity and screen regression checks. Current evidence does not justify broad CSS deletion or a budget-policy change.

## Date-recheck recommendation announcement scope — 2026-09-29

- A follow-up producer/consumer check found that announcing `추천` on every default intake tab would change the ordinary receipt tab's existing accessible name (`prototype.spec.ts` asserts `영수증`). The `aria-label="라벨, 추천"` is now conditional on the existing-food date-recheck context; ordinary new-food intake keeps its prior tab name. This keeps the assistive cue aligned with the inspected date-recheck surface without expanding the current browser scope.
- After scoping the announcement, the focused date-recheck native tests passed **2/2**, the date-recheck Axe test passed **1/1** across 320/393px light/dark, and the production build passed **771 modules** with protected runtime **28 files**. The normal receipt intake sheet was not opened in the browser in this pass; its accessible-name compatibility was source-checked against the existing test contract.

## Superseded CSS declaration cleanup — 2026-09-29

**Scope:** Remove only declarations whose exact selector and at-rule context repeat a later declaration of the same property with equal or stronger importance, then remove empty rule blocks left by that pruning. No selector with live declarations, breakpoint, or mobile-runtime file was removed.

- PostCSS found **771** provably superseded declarations and no nested selector blocks. Removing them, plus **163** now-empty rule stubs, reduced `prototype.css` from **436,047 to 407,520 bytes** (−28,527). The production CSS asset fell from **360,910 to 341,832 bytes** (−19,078), with gzip from **53.07kB to 50.39kB**. The source now has **2,716** rules, **9,091** declarations, no empty rules, no nested rules, and **0** remaining shadowed declarations under the same test.
- The raw CSS budget still fails at **333.8KiB / 260KiB**; it is **73.8KiB** over and remains unchanged. This cleanup improves size but is not claimed as bundle-gate closure.
- Post-prune date-recheck captures at 320×740 light (`273`) and dark (`274`) are byte-identical to the pre-prune captures (`272`, `271`). Home at 393×852 dark was also captured and visually checked after the cleanup (`275` vs. prior baseline `264`). Removing empty rule stubs leaves the production CSS asset hash unchanged (`39eed1…06063`). Native date regressions **2/2**, date-recheck Axe **1/1** across 320/393px light/dark, production build **771 modules**, protected runtime **28 files**, and `git diff --check` passed.
- The visible post-prune check used the approved Home → spinach detail → date recheck path; no photo/OCR/save/consume action or other sheet was opened. Real-device rendering and screen-reader speech remain unverified.

## Food-detail first-fold contract revalidation — 2026-09-29

**Scope:** Home → spinach detail at 393×852 dark, with native geometry checks at 320px. No storage, opened-state, consume, or discard control was activated.

- The fresh 393px capture (`276`) shows the printed-date warning and recheck action first, the review-gated consume action and discard action above the calibrated safe-area boundary, and the storage section next. The opened-state switch falls below the initial fold but remains a 44px control that is reachable by scrolling.
- Four focused native tests passed **4/4** after aligning stale assertions with the current copy (`먹은 기록 남기기`, `조리 전에 포장지 날짜를 살펴봐 주세요`). The first-fold contract now explicitly checks primary/destructive actions and state-summary visibility; the opened switch is verified as scroll-reachable instead of required above the fold. This matches `apps/web/AGENTS.md` and the earlier visual baseline (`224`).
- The first two failures in the earlier run were old copy expectations; the 393px geometry assertion also incorrectly required the lower opened-state switch above the safe area. The reviewed screenshot confirms no change to primary/discard reachability.

## Home summary style ownership follow-up — 2026-09-29

- Current `Prototype.tsx` renders the Home review summary as `.trust-card`; a live 393×852 Home readback found one `.trust-card` and no `.rescue-status-card` or `.rescue-status-legend`. A repository source search also found no producer for the `rescue-status-*` classes.
- The stylesheet still contains **55** rescue-status rules (**6,074 bytes**) while legacy prototype, connected, and production tests assert those classes. These rules were not removed because the consuming test scenarios include offline/connected states outside the current browser review scope; the next pass should reconcile those contracts before deleting the legacy style block.
