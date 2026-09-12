# Authoritative mutation readback Module readback — 2026-09-11

## Scope

`apps/web/src/mutationReadback.ts` deepens the shared read-after-write seam used
by product-info, date assertion, product provenance, manual food, and receipt
commit mutations. It does not
take ownership of domain rollback, workspace conflict, typed persistence errors,
or modal-specific retry UI.

## Interface contract

The Module accepts only three operations:

1. run the authoritative mutation;
2. apply its non-empty response to the local read model;
3. run a best-effort dashboard readback.

It applies the response before the readback and reapplies it when readback returns
`false` or throws. An empty mutation response is a mutation failure and never
invokes the readback. The result distinguishes `value` from `synced`, so callers
can tell “write succeeded, latest read unavailable” from a failed write.

## Callers migrated

- `PATCH /api/foods/{food_id}/date-assertion`
- `DELETE /api/foods/{food_id}/product-provenance`
- `PATCH /api/foods/{food_id}/product-info`
- `POST /api/foods`
- `POST /api/receipts/{receipt_id}/commit`

The caller still owns optimistic rollback, workspace conflict handling, typed
persistence failure messages, retry keys, and modal-local status. The shared
Module owns only the invariant that a durable success must not be hidden by a
stale follow-up read.

## Verification

| Lane | Result |
|---|---:|
| `npm run test:mutation-readback` | **3 passed** |
| Connected targeted product-info/date/provenance/manual-food/receipt tests | **11 passed** (4 product/date/provenance + 7 manual/receipt) |
| Full connected browser, ports `8091/4493` | **101 passed** |
| Frontend build | TypeScript passed; **758 Vite modules** |

## Boundary

This proves local frontend mutation/read ordering and preserves existing API
contracts. It does not prove managed database failover, external provider
transactions, or production network response resets.
