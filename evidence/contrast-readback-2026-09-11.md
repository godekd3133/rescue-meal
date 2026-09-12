# High-contrast native readback — 2026-09-11

## Scope

Verify that the existing `prefers-contrast: more` tokens are actually applied in the native shell while preserving 320px geometry and 44px primary touch targets.

## Readback

- Chromium CDP emulation matched `(prefers-contrast: more)`.
- `--atelier-muted` resolved to `#b7c8bf`.
- `--atelier-border-strong` resolved to `rgba(235, 246, 238, 0.58)`.
- Device screen remained `320×740`.
- 식품 추가 action remained at least `43.5px` high.
- Document/body width stayed within `320px`.
- Focused contrast regression: **1 passed**.
- Full native viewport suite after the change: **9 passed**.
- Accepted current capture: `evidence/design-qa-2026-09-11/native/native-home-high-contrast-393x852.png`.
- Production build: **passed**, protected runtime **28 files**, Vite **760 modules**.

## Limits

This verifies the browser media-query and geometry contract. Actual OS high-contrast settings, platform color transforms, VoiceOver/TalkBack rendering, and physical-device contrast remain separate acceptance gates.
