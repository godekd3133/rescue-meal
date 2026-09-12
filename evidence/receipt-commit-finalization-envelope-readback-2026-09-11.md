# Receipt commit finalization error envelope readback — 2026-09-11

## Scope

Keep receipt finalization recovery discoverable to the frontend without exposing
server-side transaction identifiers or internal exception details.

## Root cause

When `WorkspaceMutation` rolled back a receipt finalization failure and the
`needs_reconciliation` marker flush succeeded, the route returned a plain string that
included the internal commit transaction ID. That response did not satisfy the typed
`code/detail/retryable/action` contract and could not be classified consistently by
`MealApi`.

## Change

- Keep receipt/lot business-state rollback and the `needs_reconciliation` marker.
- Return `receipt_commit_persistence_unavailable` with HTTP `503`.
- Include only a user-safe detail, `retryable: true`, and `action: retry_later`.
- Exclude transaction ID, exception text, and receipt payload from the response.
- Preserve the separate `receipt_commit_reconciliation_unavailable` response when the
  marker flush itself fails, including its pending identity behavior.

## Verification

- Before the fix, the new response assertion was red because `detail` was a string.
- After the fix, finalization, pending-marker, and reconciliation-marker tests: **3 passed**.
- The response contains the typed code and retry metadata.
- The generated transaction ID does not occur in the failure response body.
- Backend full suite: **500 passed, 8 warnings**.
- Full connected browser suite: **103 passed**.

## Limits

This readback covers the local API/frontend error contract. It does not prove operator
reconciliation UX, external Grocy transaction state, reverse-proxy response reset,
managed PostgreSQL failover, or external provider delivery.
