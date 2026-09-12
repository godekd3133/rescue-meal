# Native bottom-sheet focus containment readback — 2026-09-11

## Scope

The fixture lane already proved keyboard focus containment, but the native shell
portal/scale layer needed its own regression. This pass verifies the same contract
at `393 x 852` inside the native phone screen.

## Current behavior

- Open receipt BottomSheet at native `393 x 852`
- Forward traversal: **24 Tab** steps, zero escapes
- Reverse traversal: **24 Shift+Tab** steps, zero escapes
- Escape closes the sheet and restores focus to `식품 추가하기`
- Protected BottomSheet runtime unchanged

## Verification

- Focused native focus-containment regression: **1 passed**
- Full native viewport suite: **14 passed**
- Fixture/mobile: **39 passed + 3 skipped** across **42 tests**
- Frontend build baseline: **760 Vite modules**, protected runtime **28 files**
- `git diff --check`: passed

## Acceptance boundary

This proves native-shell DOM focus containment and restoration. It does not prove
physical VoiceOver/TalkBack speech, Switch Control, rotor navigation, or OS-level
focus narration.
