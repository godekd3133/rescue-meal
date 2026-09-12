# Storage event sequence exact replay readback — 2026-09-11

## Scope

Ensure a same-key storage-event sequence is replayed only when the persisted sequence
has the same cardinality and each event matches the incoming target chain and payload.

## Reproduction

The existing `_existing_storage_event_sequence()` loop only iterated over incoming
requests. After a complete two-event sequence was stored, a same-key one-event prefix
was incorrectly returned as a successful `200` replay. This violated the data contract
that only the same complete payload may replay.

## Change

- Build deterministic persisted IDs for sequence indexes `0` and `1` once per lookup.
- Treat index `1` without index `0` as a partial sequence and return `409`.
- After validating all incoming events, reject a persisted tail beyond the incoming
  cardinality as a different sequence with `409`.
- Preserve same-payload replay, target child-lot chaining, atomic `WorkspaceMutation`,
  one-event compatibility, and response-only inventory snapshots.

## Verification

- Red regression before the fix: shorter prefix returned **200**.
- After the fix: shorter prefix and existing atomic replay targeted checks **2 passed**.
- Backend full suite: **500 passed, 8 warnings**.
- Full connected browser suite: **101 passed**.

## Limits

The contract covers the current maximum two-event local sequence. It does not add a
general multi-event batch API or prove external Grocy transaction compensation,
managed PostgreSQL failover, or response-reset recovery.
