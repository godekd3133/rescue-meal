# Food detail large-text narrow readback — 2026-09-11

## Scope

The existing large-text lane increased key sheet typography but did not prove that
a 320×740 detail sheet could still reach its mutation actions after the text-size
preference was applied.

## Current behavior

At `320 x 740` with `html { font-size: 125%; }`:

- Detail sheet: `y=8..740px`
- Detail hero title: `23.75px`
- Detail actions after max scroll: `y=578.109..622.109px`
- Safe-area boundary: `706px`
- Document/body width: `320px`

Both `먹었어요` and `보관 상태 저장` remain fully reachable with no horizontal
overflow. Accepted screenshot:
`evidence/design-qa-2026-09-11/native-continuous-20260911/native-food-detail-320x740-large-text.png`.

## Verification

- Focused large-text native regressions: **2 passed**
- Full native viewport suite: **14 passed**
- Fixture/mobile: **39 passed + 3 skipped** across **42 tests**
- Frontend build baseline: **760 Vite modules**, protected runtime **28 files**
- `git diff --check`: passed

## Acceptance boundary

This proves local browser/native-shell large-text scroll reachability. It does not
prove physical Dynamic Type font substitution, VoiceOver/TalkBack narration, or OEM
text-rendering differences.
