# Primary intake idle-prefetch readback — 2026-09-12

## Finding

The primary intake path already prefetched its lazy chunks after a user tap, but
that left the first tap racing the `AddFoodSheet`/BottomSheet module fetch. During
long connected runs, the user intent could wait without a visible intake dialog,
and PDF/label tests intermittently timed out at the first intake control.

## Change

After the initial Prototype commit, the app now queues an idle task that warms
`AddFoodSheet` and `BottomSheet`. The modules remain code-split; the explicit
`openAdd()` prefetch and retry toast remain the failure path. The initial build
still reports **760 Vite modules**, and the main client chunk remains code-split
with the existing structural BottomSheet dynamic-import warning.

## Verification

- Focused PDF connected repeat after prefetch timing change: **3 passed** on `8155/4555`
- Full connected current source: **108/108 passed (5.0m)** on `8157/4557`
- Full fixture/mobile: **39 passed + 3 skipped** across **42 tests**
- Full native: **14 passed**
- Frontend build: **760 Vite modules**, protected runtime **28 files**
- `git diff --check`: passed

## Acceptance boundary

This proves local chunk-warm behavior and connected test stability. It does not
prove production CDN cache hit rate, offline chunk availability, or real-device
network performance.
