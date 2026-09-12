# Food detail first-fold compact readback — 2026-09-12

## Finding

Fresh native captures found two related first-fold issues in the food detail
sheet. At `393 x 852`, the detail sheet opened at `snap=0.93`; its primary
actions were visible, but the destructive `상태가 이상해 폐기하기` action
measured `y=825.296..869.296px`, below the calibrated iPhone safe-area
boundary at `818px`. At `320 x 740`, the sheet filled the available height but
the primary mutation row measured `y=712.953..756.953px`, so `먹었어요` and
`보관 상태 저장` were only partly visible before the user scrolled.

## Change

The app-owned detail snap now uses a bounded live-viewport calculation with a
`0.993` upper bound and a `6px` top allowance:

```ts
Math.min(0.993, Math.max(0.78, (viewportHeight - 6) / 852))
```

At narrow widths, only the supporting detail cards tighten their vertical gap
and vertical padding. The hero, date proof, warning, note, storage, and opened
cards retain their hierarchy; primary and destructive controls keep the
existing `44px` hit box. No protected mobile runtime file was changed.

The same `max-width: 360px` pass raises the home queue's secondary food metadata
from `7px` to `8px`. This keeps the compact queue readable while preserving the
existing `50px` row height and first-fold CTA/nav positions.

## Current geometry

| Viewport | Sheet | Primary actions | Destructive action | Safe boundary |
|---|---:|---:|---:|---:|
| `393 x 852` | `y=6..852` | `y=717.484..761.484` | `y=773.484..817.484` | `818px` |
| `320 x 740` | `y=6..740` | `y=646.641..690.641` | `y=697.641..741.641` | `706px` |

At `320 x 740`, `.food-subline`, `.food-meta-line`, and `.date-source` resolve
to `8px`; queue rows remain `50px`, the meal CTA remains `y=509.031..551.031`,
the reserved app navigation remains `y=628..706`, and document/body width
remain `320px`.

The 320px primary row is now fully visible above the home-indicator boundary
without requiring an initial scroll. The destructive action remains lower in
the content hierarchy and is fully reachable after scrolling; this preserves a
deliberate separation between common mutation and destructive actions.

## Evidence

- Accepted `393 x 852` detail capture: `evidence/design-qa-2026-09-12/native-continuous-20260912/native-food-detail-sheet.png`
- Accepted `320 x 740` detail capture: `evidence/design-qa-2026-09-12/native-continuous-20260912/native-food-detail-320x740.png`
- Accepted `320 x 740` home typography capture: `evidence/design-qa-2026-09-12/native-continuous-20260912/native-home-320x740.png`
- Full native capture summary: `evidence/design-qa-2026-09-12/native-continuous-20260912/native-capture-summary.json`
- Source visual truth retained at `/Users/kimminkyu/.codex/generated_images/01a089d3-ea3a-7601-a729-7438361f33f0/exec-394154ea-a520-4327-8272-9fec8781dfc9.png`; this iteration is a responsive/detail interaction follow-up to the selected Emerald Atelier home visual.

Both accepted captures were inspected after rendering. The 393px capture
shows the complete detail action hierarchy, and the 320px capture shows both
primary actions above the safe boundary. The native capture reported zero
console errors and zero page errors.

## Verification lanes

| Lane | Result |
|---|---|
| Focused 393px detail action regression | **1 passed** |
| Focused 320px initial + max-scroll action regression | **1 passed** |
| Full native viewport suite | **14 passed** |
| Fixture/mobile baseline | **39 passed + 3 skipped / 42 tests** |
| Frontend build | **760 Vite modules**, protected runtime **28 files** |
| Sites / service-worker / workspace-sync / release manifest | **4 / 5 / 9 / 2 passed** |
| `git diff --check` | passed |

## Acceptance boundary

This readback proves local native-shell geometry, responsive CSS, and browser
interaction reachability. It does not prove physical iOS VoiceOver speech,
Dynamic Type font substitution, real compositor/home-indicator behavior, OEM
insets, or signed production artifact promotion.
