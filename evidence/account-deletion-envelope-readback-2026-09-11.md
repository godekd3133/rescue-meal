# Account deletion typed failure envelope readback — 2026-09-11

## Scope

This readback covers the local `POST /api/account/delete` persistence-failure contract and its
AccountSheet retry UI. It does not claim distributed auth/workspace atomicity, backup/WAL/object-storage
deletion, external Grocy compensation, managed PostgreSQL failover/partition, or production cutover.

## Root cause and red loop

The account deletion flow already acquired a durable `active → deleting` fence before purging the
workspace. When the purge failed, the account row stayed fenced and later deletion requests could
resume. The route nevertheless returned a plain string `503` detail. The pre-fix regression failed at
the producer/consumer boundary with:

```text
TypeError: string indices must be integers, not 'str'
```

after attempting to inspect `failed.json()["detail"]["code"]`. This showed that the fence/retry behavior
was present but the public error envelope was not typed.

## Backend contract

Regular purge or credential persistence failure now returns:

```json
{
  "detail": {
    "code": "account_deletion_persistence_unavailable",
    "detail": "계정 삭제를 완료하지 못했습니다. 삭제 상태를 유지했어요. 같은 화면에서 다시 시도해 주세요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

The response excludes password, token, email, and exception text. The existing fence remains durable;
normal workspace writes remain blocked by `423 account_deletion_in_progress`; `GET /api/auth/me` still
exposes only `account_status=deleting` for recovery; and the same session-version request can retry.

Backend targeted account deletion tests (success/purge failure/rate limit) passed **3**. The full API
suite passed **500** tests with **8 existing deprecation warnings**.

## Frontend contract

`mealApi.ts` exposes `isMealApiAccountDeletionPersistenceError()`. `AccountDeletionPanel` maps the
typed error to the existing safe recovery copy and renders an inline `다시 시도` button only for that
code. The button reuses the already entered current password and exact `DELETE` confirmation payload.
Authentication failure, malformed confirmation, rate limit, and an untyped `503` do not receive this
inline retry action.

The connected regression uses the first request as a typed `503`, verifies the recovery alert and retry
button, compares both request bodies, allows the second request to succeed, and separately verifies the
rate-limit path has no inline retry. Result: **2 passed**.

## Final related lanes

| Lane | Result |
|---|---:|
| API full | 500 passed, 8 warnings |
| Connected Playwright | 105 passed |
| Fixture/mobile Playwright | 38 passed + 3 skipped / 41 tests |
| Native 320×740 Playwright | 11 passed |
| TypeScript + Vite | 760 modules |
| Protected runtime | 28 files passed |

The account deletion and native changes were not committed or published. Existing dirty worktree WIP
and long-running preview/API processes remain outside this readback's mutation scope.
