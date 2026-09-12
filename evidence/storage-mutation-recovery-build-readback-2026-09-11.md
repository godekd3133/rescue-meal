# Storage mutation recovery build readback — 2026-09-11

## Scope

Close the current-source TypeScript/Node resolver mismatch in the app-owned optimistic storage mutation recovery WIP without changing its runtime choreography.

## Root cause

`storageMutationRecovery.ts` is imported by `Prototype.tsx` and its unit tests import the `.ts` module directly under Node's strip-types runner. The source import needed an explicit `.ts` suffix for the Node test, while TypeScript rejected that suffix because the no-emit project did not enable `allowImportingTsExtensions`.

## Change

- Kept the explicit `.ts` source import required by the Node strip-types test.
- Enabled `allowImportingTsExtensions` in `apps/web/tsconfig.json`, which is valid for this `noEmit` TypeScript project.
- No mutation behavior or UI flow was changed by the resolver fix.

## Readback

- Optimistic mutation tests: **3 passed**.
- Storage mutation recovery tests: **3 passed**.
- Retry-after-reconciliation regression now covers a second failure without restoring the original stale snapshot; storage recovery contract: **4 passed**.
- Production build: **passed**, protected runtime **28 files**, Vite **760 modules**.
- Full fixture/mobile runtime after the fix: **36 passed, 3 skipped**.
- Sites **4**, service-worker **5**, workspace-sync **9**, release manifest **2** passed.
- `git diff --check`: **passed**.

## Limits

This is local source/build/test evidence for the current worktree. It does not prove managed production deployment, remote CI, or multi-process service recovery.
