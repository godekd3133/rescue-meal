# BottomSheet import boundary readback — 2026-09-11

## Scope

Classify the recurring Vite ineffective dynamic-import warning without weakening the protected mobile runtime or increasing the initial application bundle.

## Observation

`Prototype.tsx` lazy-loads `mobile/BottomSheet`, but the protected `mobile/index.ts` barrel is statically imported by the app runtime and re-exports the same module. Vite therefore reports that the dynamic import cannot move the module into another chunk.

## Safe alternative check

A static `BottomSheet` import was tested in the app-owned Prototype boundary. It removed the ineffective dynamic-import warning but expanded the main client chunk to approximately **537.5KB**, compared with the current split bundle where the main client chunk is approximately **330.25KB** and BottomSheet remains behind the existing lazy boundary.

The static experiment was reverted. `App.tsx` and `src/mobile/index.ts` remain protected and were not changed.

## Current readback

- Current production build: **passed**, Vite **760 modules**, Sites output prepared.
- Current known warning: `INEFFECTIVE_DYNAMIC_IMPORT` for `src/mobile/BottomSheet.tsx`.
- Protected mobile runtime integrity: **28 files passed**.
- Full fixture/mobile current source: **38 passed, 3 skipped**; connected browser: **103 passed**.
- `git diff --check`: **passed**.

## Decision boundary

The warning remains documented as a structural barrel/runtime boundary. Removing it safely requires an explicit protected mobile-runtime refactor that can preserve both the initial bundle size and the runtime export contract; no protected runtime mutation is authorized by the current task.
