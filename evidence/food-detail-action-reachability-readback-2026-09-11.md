# Food detail action reachability readback — 2026-09-11

## Finding

At `320 x 740`, the responsive detail sheet correctly keeps its header visible,
but its primary mutation row is part of a scrollable long form. The product needs
to prove that the row can be reached above the safe-area boundary, not only that
the sheet fits horizontally.

## Current behavior

After scrolling `.sheet-content` to its maximum position:

- Native safe-area boundary: `706px` (`740px - 34px`)
- `.detail-actions`: `y=577.875..621.875px`
- Document width: `320px`
- Accepted screenshot: `evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740-actions-scrolled.png`

Both `먹었어요` and `보관 상태 저장` are fully above the safe-area boundary.

## Verification

- Focused scroll reachability regression: **1 passed**
- Full native viewport suite: **14 passed**
- Fixture/mobile: **39 passed + 3 skipped** across **42 tests**
- Frontend build: **760 Vite modules**, protected runtime **28 files**
- `git diff --check`: passed

## Acceptance boundary

This proves local native-shell scroll reachability. It does not prove physical
touch scrolling physics, VoiceOver rotor navigation, Dynamic Type, or OEM inset
behavior.
