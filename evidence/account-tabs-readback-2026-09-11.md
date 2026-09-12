# Account tabs accessibility readback — 2026-09-11

## Scope

Bring AccountSheet's login/register tab surface to the same tab/tabpanel accessibility contract as intake mode tabs.

## Change

- Added stable tab and panel IDs with `aria-controls`/`aria-labelledby`.
- Added roving `tabIndex` values and ArrowLeft/ArrowRight/Home/End focus movement.
- Kept the existing login/register UI and workspace semantics unchanged.

## Readback

- Account tab semantics and ArrowLeft/ArrowRight regression: **1 passed**.
- Major visible-control accessible-name audit continues to pass across account and other surfaces.
- Full fixture/mobile current source: **38 passed, 3 skipped** across 41 tests.
- Native viewport: **9 passed**.
- Production build: **passed**, protected runtime **28 files**, Vite **760 modules**.

## Limits

This verifies DOM semantics and keyboard focus movement. Actual VoiceOver/TalkBack tab announcement and rotor behavior remain physical-device acceptance gates.
