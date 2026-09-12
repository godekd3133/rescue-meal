# Reduced-motion sheet readback — 2026-09-11

## Scope

Make the protected BottomSheet motion respect the user's `prefers-reduced-motion` setting without editing the protected mobile runtime component.

## Change

The app-owned `Prototype` tree now provides `MotionConfig reducedMotion="user"`, allowing the existing Motion components inside the lazy BottomSheet to honor the media preference while preserving normal spring/drag behavior for users who do not request reduced motion.

## Readback

- Native reduced-motion focused test: **1 passed**.
- With `prefers-reduced-motion: reduce`, the receipt sheet settled at the screen bottom within the short readback window rather than waiting for the normal spring animation.
- Full native viewport suite after the change: **8 passed**.
- Full fixture/mobile current source after the change: **38 passed, 3 skipped** across 41 tests.
- Production build: **passed**, protected runtime **28 files**, Vite **760 modules**.
- The browser runner emitted Motion's expected development warning for reduced-motion emulation; no page error or test failure occurred.

## Limits

This verifies the webview/browser preference contract. Physical OS animation settings, VoiceOver/TalkBack speech, and device-specific compositor behavior remain separate device acceptance gates.
