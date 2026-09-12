# Bottom sheet focus containment readback — 2026-09-11

## Scope

The existing modal semantics and focus-restoration test proved that a sheet returns
focus to its trigger after Escape, but did not permanently cover keyboard traversal
while the sheet remained open. A fresh native probe also measured 24 forward Tab and
24 reverse Shift+Tab steps with no focus escape.

## Change

Added a fixture regression for the app-owned receipt BottomSheet contract. Every
forward and reverse keyboard step must keep `document.activeElement` inside the
open dialog, and Escape must remove the dialog and restore focus to the original
`식품 추가하기` trigger.

## Verification

- Focused focus-containment regression: **1 passed**
- Traversal: **24 Tab + 24 Shift+Tab** steps, zero escapes
- Focus restoration: passed
- The test does not modify the protected BottomSheet runtime; it verifies the
  existing Radix modal contract through the app-owned surface.

## Acceptance boundary

This proves DOM keyboard focus containment and restoration. It does not prove
physical VoiceOver/TalkBack speech, Switch Control, or OS-level focus narration.
