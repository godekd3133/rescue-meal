# Guest transfer transport readback — 2026-09-11

## Scope

Centralize the account-session guest workspace preview/import transport without changing
the user's explicit transfer decision or the source workspace retention policy.

## Root cause

`AccountSheet` had a private `fetch` helper for guest transfer. It duplicated the
8-second timeout and typed error parsing but did not use the shared workspace revision
headers, response revision memory, mutation invalidation, or an abort signal for the
re-entry preview effect.

## Change

- Added `mealApi.previewGuestTransfer(session, guestAccessToken, signal?)`.
- Added `mealApi.transferGuestWorkspace(session, guestAccessToken, signal?)`.
- Both methods use the explicit account session token and never replace the global
  guest/account session as a side effect.
- Preview keeps its existing read-only revision/broadcast exemption.
- Confirmed transfer sends `If-Rescue-Meal-Revision` when a target revision is known,
  remembers the response revision, and broadcasts the normal workspace mutation.
- AccountSheet retains pending preview, import/skip, conflict, and retry UI; its
  re-entry preview aborts on effect cleanup.

## Verification

- Connected guest registration/preview/retry/import and conflict scenarios: **2 passed**.
- The preview response supplied revision `11`; the later confirmed transfer request
  carried `If-Rescue-Meal-Revision: 11`.
- Full connected browser suite on disposable API/web `8122/4522`: **101 passed**.
- Frontend build: protected runtime **28**, TypeScript passed, Vite **759 modules**.

## Limits

This proves the browser transport and local workspace revision contract. It does not
prove account refresh-token rotation, multi-device UI delivery, managed database
transactionality, or production identity/cutover.
