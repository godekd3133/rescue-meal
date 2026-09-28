# Native meal-plan preview flow — 2026-09-24

## Scope and user goal

Local native demo, `320×740` and `393×852`, dark mode. Follow Home → 오늘의 식단 preview → `사용 전 확인` details → existing spinach detail → return to the recipe → bottom actions. Inspect only; do not change time/servings, save the preview, open cooking instructions, or mark food eaten.

## Steps and findings

1. **Home entry — healthy.** The primary `확인하고 오늘 식단 만들기` CTA is visible above the fixed navigation and opens the named meal-plan sheet. See `01-home-native-320-dark.png`.
2. **Preview first fold — healthy safety order, tiny controls.** Cooking-time and serving selectors are 44px high and precede the selected recipe. `사용 전 확인 2건 · 날짜·보관 · 알레르기` appears before the recipe. At 320px selector labels were 9px, making the controls visually harder to scan even though the targets were large. See baseline `02-meal-plan-top-native-320-dark.png` and `05-meal-plan-top-native-393-dark.png`.
3. **Read check details — healthy.** `사용 전 확인 2건 보기` scrolls the sheet to the two details: spinach printed-date/storage confirmation and incomplete allergen metadata. Safety text is explicit that the app does not decide whether food is safe. Guest demo shows no nonfunctional preference-settings control. See `06-meal-plan-safety-details-393-dark.png`.
4. **Open related food — healthy.** `식품 확인 · 시금치` opens the existing spinach detail. Closing it returns to the meal sheet with focus on that same check button. No recipe or inventory write occurs. See `07-meal-plan-food-check-detail-393-dark.png`.
5. **Bottom actions — reachable.** At 320px max scroll, `미리보기 저장` and `조리 방법 보기` each measure 44px at y=535–579, with `최근 식단 보기` at y=590–634. At 393px they measure 44px at y=647–691, history at y=702–746. The preview save is not sticky; reaching the actions requires scrolling through the safety and ingredient details. See `03-meal-plan-bottom-native-320-dark.png` and `11-meal-plan-actions-bottom-393-dark.png`.
6. **Selector readability — improved.** Time/servings option labels now measure 11px at both widths while every option remains 44px high. At 320px their widths are 61px; at 393px, 58.3px. See `09-meal-plan-options-320-dark-readable.png` and `10-meal-plan-options-393-dark-readable.png`.

## Changes

- Raised meal time/serving option labels from 9px to 11px at ≤360px and from 10px to 11px at 361–420px. No option, selection, schedule, or recipe state was changed during visual verification.
- Added a native-viewport regression assertion for the 11px labels and 44px dimensions across 320px and 393px.

## Evidence limits

- `04-meal-plan-top-native-393-dark.png` was rejected: it was captured after resizing an open sheet and showed a scrolled state. `05` was captured after resetting sheet scroll to zero and is the accepted top-state screenshot.
- This was the local guest/demo fixture. The preview-save, cooking, purchase, and consume actions were never activated; no persistent record changed and no API request was observed.
- Automated UI tests were not run by preference. Physical-device layout, actual cooking use, VoiceOver/TalkBack, and Dynamic Type remain unverified.
- Final handoff leaves the app at the native `320×740` dark Home screen: `13-handoff-home-native-320-dark.png`.
