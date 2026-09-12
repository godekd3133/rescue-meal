# Workspace export rate-limit readback — 2026-09-12

## Scope

This readback covers the sensitive `GET /api/account/export` snapshot boundary and the rate-limit
slice specifically. The endpoint still returns the existing `rescue-meal-export-v1` JSON schema on
success. Actor/time audit was implemented as a follow-up slice; its current evidence is in
[export audit readback](export-audit-readback-2026-09-12.md).

## Root cause and red loop

Export can contain the current workspace's inventory, receipt summaries, storage history, meal plans,
preferences, and idempotency summaries. Before this change it had no dedicated rate limit. The new
regression configured one request per window and demonstrated that the second export still returned
`200`, so the endpoint had no protection at the route boundary.

## Contract

The export route uses two opaque buckets for every request:

```text
ip:export:<opaque client IP>
workspace:export:<opaque current workspace>
```

The default configuration is six requests per hour:

```text
RESCUE_MEAL_EXPORT_RATE_LIMIT_ENABLED=true
RESCUE_MEAL_EXPORT_RATE_LIMIT_MAX_REQUESTS=6
RESCUE_MEAL_EXPORT_RATE_LIMIT_WINDOW_SECONDS=3600
```

When either bucket is exhausted, the route returns HTTP `429` without constructing an export body:

```json
{
  "detail": {
    "code": "account_export_rate_limited",
    "detail": "데이터 내보내기 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

The response carries `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining`. The error does
not echo workspace ID, client IP, request ID, export payload, or any secret. Persistent SQLite and
PostgreSQL auth repositories reuse the existing database-backed limiter; in-memory fixture mode uses
the existing process-local fallback.

## Frontend behavior

`MealApi` classifies `account_export_rate_limited` with a dedicated guard. AccountSheet displays
`데이터 내보내기 요청이 많아요. 잠시 후 다시 시도해 주세요.` inside the export region, does not create
a Blob or download, and keeps the success status absent.

## Verification

| Lane | Result |
| --- | ---: |
| Red API rate-limit regression | second request incorrectly returned `200` |
| API export targeted | **2 passed** |
| AccountSheet typed 429 connected | **1 passed** |
| API full suite | **508 passed / 8 warnings** |
| Connected full lane including export test | **107 passed / 1 unrelated timing failure** (historical) |
| Connected export focused lane | **1 passed** |
| TypeScript/Vite | **760 modules** |
| Protected runtime | **28 passed** |

The full connected run's one unrelated failure was the existing date-confirmation retry scenario;
the export test passed in that run and in its focused rerun. A later clean current-source connected
rerun on ports `8157/4557` collected **108/108 passed (5.0m)**, so the export regression and current
connected lane are now green; the earlier one-failure observation remains historical timing evidence.

## Remaining acceptance boundary

Large workspace streaming/compression, audit operational query/retention policy, external gateway abuse control,
PostgreSQL replica/WAL/backup retention alignment, and production-specific rate-limit tuning remain
separate acceptance gates.
