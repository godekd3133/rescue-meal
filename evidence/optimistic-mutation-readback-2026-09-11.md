# Optimistic mutation lifecycle readback — 2026-09-11

## Scope

`apps/web/src/optimisticMutation.ts` deepens the shared lifecycle for storage
event mutations. `StorageEventResponse` now carries an additive `inventory`
snapshot (and sequence events carry the final snapshot), while the Module keeps
optimistic UX, rollback, and readback failure ordering separate from the full
authoritative response Module.

## Interface contract

The Module owns this ordering:

```text
apply optimistic state
→ run mutation
→ on mutation failure restore snapshot
→ on successful mutation run best-effort dashboard read
→ on readback false/throw reapply optimistic state
```

The caller keeps the domain-specific idempotency key, workspace conflict
message, typed persistence error, retry action, and Grocy status presentation.

## Callers migrated

- storage move/open sequence
- consumed storage event
- discarded storage event

This prevents a stale last-successful dashboard cache from hiding a durable
storage event while preserving rollback on mutation failure.

## Verification

| Lane | Result |
|---|---:|
| `npm run test:optimistic-mutation` | **3 passed** |
| Storage response inventory snapshot API tests | **2 passed** |
| Storage connected targeted tests, ports `8100/4504` | **3 passed** |
| Full connected browser, ports `8097/4501` | **101 passed** |
| Backend | **499 passed, 8 warnings** |
| Frontend build | TypeScript passed; **759 Vite modules** |
| Fixture/mobile current lane, `4496` | **35 passed + 3 skipped** |
| Native current lane, `4497` | **4 passed** |

## Boundary

This proves local optimistic mutation/readback lifecycle and idempotent retry
presentation. It does not prove external provider transaction atomicity,
managed PostgreSQL failover, or physical-device behavior.
