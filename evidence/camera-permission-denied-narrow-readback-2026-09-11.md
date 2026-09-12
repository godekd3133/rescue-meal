# Camera permission-denied narrow readback — 2026-09-11

## Current behavior

At `320 x 740`, a forced `NotAllowedError` renders the camera recovery region
inside the native safe area:

- Recovery region: `y=294..634px`, width `280px`
- Safe-area boundary: `706px`
- `사진에서 선택`: `y=499.8..543.8px`
- `입력 방법 다시 보기`: `y=499.8..543.8px`
- Document/body width: `320px`
- Console/page errors: `0`
- Recovery region exposes `aria-live="polite"` and `aria-atomic="true"`

Accepted screenshot:
`evidence/design-qa-2026-09-11/native-continuous-20260911/native-camera-denied-320x740.png`.

## Verification

- Focused camera narrow regression: **1 passed**
- Full native viewport suite: **14 passed**
- Fixture/mobile: **39 passed + 3 skipped** across **42 tests**
- Frontend build baseline: **760 Vite modules**, protected runtime **28 files**
- `git diff --check`: passed

## Acceptance boundary

This proves local permission-denied recovery geometry and DOM live-region semantics.
It does not prove the physical iOS/Android permission sheet, camera optics, VoiceOver/
TalkBack narration, or OEM inset behavior.
