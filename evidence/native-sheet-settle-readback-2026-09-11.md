# Native sheet entrance settle readback — 2026-09-11

## Finding

The food-detail first-fold regression measured a toggle bottom of `818.0089721679688px` against the
calibrated iPhone safe-area limit of `818px`. The result was intermittent: three focused repeats all
passed, and direct browser inspection showed the stable toggle bottom at `817.234375px`.

## Root cause

`BottomSheet` uses a spring entrance transform. The test waited until the sheet bottom was within one
pixel of the device screen, but that condition could become true while the computed `transform` still
contained a small positive translation. The test then sampled an intermediate position rather than the
final user-visible layout.

## Change

The app-owned native test now waits for both:

- sheet bottom alignment to the device screen within `0.25px`; and
- computed sheet entrance transform to become `none`.

The protected `BottomSheet` runtime, detail `snap=0.84`, safe-area padding, and product layout were not
changed.

## Verification

- focused food-detail first-fold regression: **passed**;
- focused repeat ×3 before the settle-gate change: **3 passed**;
- full native viewport suite: **11 passed**;
- fixture/mobile suite: **38 passed + 3 skipped**;
- frontend build: protected runtime **28**, TypeScript/Vite **760 modules**.

This proves browser/native-shell timing and geometry only. It does not prove physical iPhone compositor,
VoiceOver/TalkBack speech, OS Dynamic Type, OEM gesture insets, or signed production artifact behavior.
