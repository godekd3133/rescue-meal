# Food detail narrow viewport readback — 2026-09-11

## Finding

The detail sheet was intentionally raised to `snap=0.93` for the 393×852 iPhone
viewport so its primary mutation actions were visible. On a 320×740 viewport, that
fixed snap produced a `792px` sheet and a top coordinate of `-52px`, clipping the
sheet handle and the `시금치` title above the viewport.

## Change

The app-owned Prototype now derives a bounded detail snap from the live viewport
height. The 393×852 composition keeps `snap=0.93`; a 320×740 viewport uses a
`732px` sheet (`snap≈0.86`) with an `8px` top inset. The protected BottomSheet
runtime and the 393×852 visual composition remain unchanged.

## Current evidence

- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740.png`
- Viewport: `320 x 740`
- Sheet geometry: `y=8..740px`, width `320px`
- Sheet title geometry: `y=47.2..69.2px`, text `시금치`
- Document width: `320px`; no horizontal overflow
- Direct capture console/page errors: `0`
- The accepted screenshot was inspected after capture and shows the handle, title,
  detail hero, storage state, and the start of the primary action row without top clipping.

## Verification

- Focused native major-sheet narrow-viewport regression: **1 passed**
- Full native viewport suite after the change: **14 passed**
- Fixture/mobile runtime baseline: **39 passed + 3 skipped**
- Frontend build: **760 Vite modules**, protected runtime **28 files**
- `git diff --check`: passed

## Acceptance boundary

This readback proves the local responsive/native-shell geometry. It does not prove
physical iPhone compositor behavior, Dynamic Type, VoiceOver/TalkBack speech, or OEM
gesture-inset differences.
