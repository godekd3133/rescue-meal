# Native Home first-fold refinement — 2026-09-24

## Scope and user goal

Read the current native mobile shell at `320×740` and `393×852` in light/dark themes. The user should quickly understand today's priority, reach the meal action and every-review-items shortcut, and never mistake estimated priority for a printed date. The Home CTA was opened only to inspect the meal-plan preview and closed without saving or recording consumption.

## Current-run findings

1. **Home before — mixed.** At `320×740`, the priority card was 140px tall and included a 29px helper sentence repeating the hero and CTA. The visible list heading repeated the queue count already shown in the priority summary. The all-review action measured 30px. See `01-home-native-320-light-before.png` and `02-home-native-320-dark-before.png`.
2. **Meal-plan entry — healthy safety order.** The CTA opens `오늘의 식단`; `사용 전 확인 2건 · 날짜·보관 · 알레르기` appears before the recipe. The preview was closed without `미리보기 식단 저장` or any cooking action. See `03-meal-plan-entry-320-dark-before.png`.
3. **Home after — improved.** Healthy-state helper copy is removed while empty, unknown, checking, offline, and reauthentication states retain status copy. The mobile card is 104px at 320px and 152px at 393px. The duplicate visible count and 320px kicker are hidden while the heading's accessible name keeps the queue count. The all-review action is now 44px and the meal CTA remains above the fixed navigation. Final captures: `21-home-native-320-dark-empty-shopping-final.png`, `17-home-native-320-light-final.png`, `23-home-native-393-dark-empty-shopping-final.png`, and `24-home-native-393-light-empty-shopping-final.png`.
4. **Empty shopping entry — improved.** The empty-state card is now 50px at widths up to 420px; its kicker and title fit fully above the fixed nav at both 320px and 393px. On `320×740`, the title ends at y=614 with the nav starting at y=628; at `393×852`, the title ends at y=730 with the nav starting at y=740. Supporting instructions stay in the button's accessible name while being visually clipped from this compact card. See the final Home captures in step 3.
5. **Shopping summary destination — healthy.** The 50px empty-list card opens the named `장보기 목록` sheet. It repeats that the list is empty, explains that the demo preview is not saved, and offers separate meal-derived versus direct-add paths. The inspection closed without checking, adding, or saving any item. See `20-shopping-summary-destination-320-dark.png`.
6. **Optional install action — moved out of the first fold.** The install/service-worker prompts now follow the pantry list and review guide. At Home scroll position 0 they no longer peek underneath the fixed navigation. At the bottom of the pantry, the install panel is fully visible at y=476–542 with 44px install/close controls, above the nav at y=628. No horizontal overflow was observed. See `18-install-prompt-reachable-after-scroll-320-light-final.png`.

The measured before-state shopping card began at y=622 on 320px and its title fell beneath the nav. The final compact entry begins at y=573, ends at y=623, and leaves a 5px gap before the nav at y=628.

## Changes and evidence boundaries

- The short healthy-state copy is removed; stale/unknown/empty states preserve their context-specific status message.
- The queue count remains in the priority card and heading's accessible name; the duplicate visual count is removed on mobile.
- The 320px section kicker is hidden, the priority card is compacted, and the review shortcut target is 44px.
- The empty shopping preview is 50px wide-and-short mobile UI, fully visible above the nav; its helper remains available to assistive technology. A regression check verifies the card's touch height, first-fold reachability, and accessible helper name.
- Optional install/update prompts now appear after the pantry, so they remain available after scrolling without competing with the first-fold task.
- Browser UI state remained a local demo. The meal preview was not saved; no food/date/storage/consumption or shopping-list mutation was made. Network readback showed local static resources and ephemeral image blobs, not an API request.
- `01-home-320-dark-before.png` came from the default web shell and is excluded from this native-shell audit; captures `04–07` are intermediate before the optional-prompt reorder. Accepted native baseline captures are `01-home-native-320-light-before.png`, `02-home-native-320-dark-before.png`, and `03-meal-plan-entry-320-dark-before.png`.
- Final 320px Home captures are `17-home-native-320-light-final.png` and `21-home-native-320-dark-empty-shopping-final.png`; final 393px Home captures are `23-home-native-393-dark-empty-shopping-final.png` and `24-home-native-393-light-empty-shopping-final.png`. `20-shopping-summary-destination-320-dark.png` is the empty-shopping destination; `18-install-prompt-reachable-after-scroll-320-light-final.png` shows the complete lower prompt action. `10–16` and `19` preserve earlier refinement checkpoints.
- Regression assertions cover concise status copy, retained accessible priority count, 104px 320 card, 44px review target, all three queue rows meeting touch height, CTA/shopping action above nav, accessible empty-shopping help, and install prompt ordering.
- Automated UI tests were not run by preference. Physical-device safe areas, actual iOS/Android install prompts, VoiceOver/TalkBack, and Dynamic Type remain unverified.
- `npm run check:runtime` passed (28 protected files); final `npm run build` passed (770 Vite modules and Sites output); `git diff --check` passed. Latest native browser readback returned to Home at 320px in dark mode, with no open dialogs.
