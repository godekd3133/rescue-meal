# Storage mutation recovery Module readback — 2026-09-11

## Scope

Concentrate the repeated recovery choreography for storage move/open, consume, and
discard without merging the existing optimistic and authoritative response Modules.

## Root cause

The three `Prototype` callers each repeated the same sequence after invoking
`runOptimisticMutation`: restore/reconcile after a rejected mutation, map error
dispositions, and register a retry closure. Their event payloads and user-facing
messages legitimately differed, but the mechanical ordering could drift.

## Change

- Added `apps/web/src/storageMutationRecovery.ts`.
- `runStorageMutationRecovery()` delegates optimistic apply/restore and readback
  semantics to `runOptimisticMutation()`.
- A rejected mutation triggers exactly one best-effort `sync()` before
  `onFailure(error, retry)` is delivered.
- The retry callback reruns the same options closure, so the caller's original
  `Idempotency-Key` and event payload remain intact.
- Only the first attempt restores the pre-mutation snapshot. A retry created after
  reconciliation uses a no-op restore so a second failure cannot overwrite newer
  authoritative state with the stale first snapshot.
- A successful mutation with readback `false` or a thrown readback error remains a
  successful `onSuccess` result with `synced=false`; it does not receive a mutation
  failure retry.
- `Prototype.saveFood`, `consumeFood`, and `discardFood` use the Module. Payload,
  child-lot logic, Grocy status, typed error messages, inventory mapping, and global
  toast ownership remain in `Prototype`.
- Added `npm run test:storage-mutation-recovery` and a CI web step.

## Verification

- Contract test: **4 passed**.
- Storage connected targeted lane: **14 passed**.
- Full connected browser suite on disposable API/web `8126/4528`: **103 passed**.
- Backend full suite: **500 passed, 8 warnings**.
- Frontend build: protected runtime **28**, TypeScript passed, Vite **760 modules**.
- Sites worker: **4 passed**.

## Limits

This Module does not own domain operation identity, external provider transaction
compensation, whole-workspace atomicity, managed database failover, or physical-device
acceptance.
