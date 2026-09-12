# Guest transfer preview single-flight readback — 2026-09-12

## Symptom and root cause

The existing connected registration flow was configured so the first guest-transfer preview
returned a temporary `503` and the next preview returned a ready `200`. A fresh full connected run
and a focused rerun both failed to show the retry panel. Code tracing showed two producers: the
registration submit handler explicitly requested the preview, while the `authMe` effect started a
second preview after the new account state was set. The two responses could race, so the UI did not
preserve the first failed attempt deterministically.

## Fix

`AccountSheet` now uses a registration-scoped `guestTransferPreviewInFlightRef`. The account-state
effect does not start its recovery probe while registration is already fetching the preview, and
the ref is cleared in a `finally` block for both success and failure. The existing retry, pending
transfer storage, explicit import/skip, and conflict semantics are unchanged.

## Verification

| Lane | Result |
| --- | ---: |
| Focused regression before fix | failed: retry panel was absent |
| Focused regression after single-flight guard | **1 passed** |
| Full connected lane after fix | **109/109 passed (4.8m)** |

No arbitrary wait or assertion weakening was added. The change removes duplicate preview work at
the producer boundary; backend transfer payload and persistence contracts were not changed.
