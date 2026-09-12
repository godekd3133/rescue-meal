# Large-text baseline readback — 2026-09-11

## Scope

Make the selected mobile hierarchy respond to a root text-size preference without changing the default Emerald Atelier composition or allowing the first actions to fall under the native navigation bar.

## Change

- Added a final rem-based large-text baseline for the native/preview brand, greeting, hero copy, rescue count, priority heading, priority rows, sheet title, and intake heading.
- Preserved the calibrated compact 320px values through a dedicated small-viewport override.
- Added -webkit-text-size-adjust: 100% so a native webview does not discard the text-size contract through automatic text adjustment.
- Strengthened the large-text regression to assert that the greeting and priority heading computed font sizes actually increase, not merely that the page remains inside the viewport.

## Readback

- Baseline at 393 x 852: greeting 24px, priority heading 17px.
- Root text preference 125%: greeting 30px, priority heading 21.25px.
- Large-text document/body scroll width: 393px / 393px.
- Large-text meal CTA: top=634.8, bottom=687.8.
- Large-text 식품 추가 action: top=689.8, bottom=724.8; native navigation starts at 740px.
- At the 320px compact viewport, the 125% primary actions remain above the nav: meal bottom `568.1px`, add bottom `612.1px`, nav top `628px`; the safety note continues below the fixed nav as scroll content.
- A 20px scroll reaches the large-text safety note above the fixed navigation; compact safety guidance reachability regression: **1 passed**.
- Baseline and 125% captures were inspected:
  - evidence/design-qa-2026-09-11/native/native-home-large-text-baseline-393x852.png
  - evidence/design-qa-2026-09-11/native/native-home-large-text-393x852.png
- Sheet captures at 125% were also inspected:
  - evidence/design-qa-2026-09-11/native/native-meal-large-text-393x852.png
  - evidence/design-qa-2026-09-11/native/native-food-detail-large-text-393x852.png
- Native viewport suite: 4 passed.
- Major sheet hierarchy regression: 1 additional test passed; receipt sheet title/description increased 20→25px / 11→13.75px, meal recipe title increased 20→25px, and food detail hero title increased 19→23.75px under the same 125% root preference.
- Production build: passed, protected runtime 28 files, Vite 759 modules.

## Limits

The browser root-size simulation proves the app-owned CSS contract. Actual iOS Dynamic Type settings, OS font substitution, VoiceOver text navigation, and physical device typography remain device acceptance gates.
