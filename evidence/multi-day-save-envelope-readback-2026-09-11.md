# Multi-day bundle save typed failure envelope readback — 2026-09-11

## Scope

This readback covers `POST /api/meal-plans/multi-day` when the `WorkspaceMutation` outer flush fails,
and the connected `MealPlanSheet` retry action. Multi-day preview remains side-effect-free. External
Grocy/provider transactions, distributed bundle transactions, managed PostgreSQL failover/partition,
reverse-proxy response reset and production cutover remain separate acceptance gates.

## Root cause and red loop

The multi-day save route already used a `bundle_id` lock and `WorkspaceMutation`, and the lower module
restored the bundle/day snapshot when flush failed. The route did not catch regular persistence
exceptions, however, so a forced flush failure escaped through FastAPI/TestClient as raw
`RuntimeError`. The existing bundle idempotency test was extended before the fix to require the public
typed contract and failed at that route boundary.

## Backend change

The no-`bundle_id` compatibility path and the bundle-lock path now preserve validation and
`ConcurrentWorkspaceWriteError` winner replay while mapping regular persistence failures to:

```json
{
  "detail": {
    "code": "multi_day_plan_persistence_unavailable",
    "detail": "3일 식단을 저장하지 못했습니다. 기존 3일 계획과 workspace 상태를 유지했어요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

The response excludes exception text. Failed bundle/day/history state is restored, while same-bundle
replay, snapshot conflict, latest/history readback and linked day completion remain unchanged.

Targeted API coverage for bundle envelope/rollback, bundle WorkspaceMutation, selected day link and
linked day completion recovery passed **4**. The full API suite remains **500 passed / 8 warnings**.
After this connected retry regression was added, the final fresh connected lane passed **107/107**;
the prior **106/106** run is retained below as the pre-test baseline.

## Frontend change

`mealApi.ts` exposes `isMealApiMultiDayPlanPersistenceError()`. `MealPlanSheet.tsx` stores the failed
bundle payload (`inventory_ids`, `bundle_id`, `snapshot_hash`, `max_minutes`, `servings`) and shows
inline `다시 시도` only inside the `3일 식단` region for that typed code. Retry uses the same preview
payload; snapshot conflict, validation and untyped errors do not receive this action.

The connected regression forces the first bundle save request to return typed `503`, verifies the safe
message and local retry button, compares both request bodies, and lets the second request reach the
disposable API. Focused result: **1 passed**.

## Current verification lanes

| Lane | Result |
|---|---:|
| API full | 500 passed, 8 warnings |
| Multi-day targeted API | 4 passed |
| Connected multi-day retry | 1 passed |
| Final full connected after this added test | 107/107 passed |
| Fixture/mobile | 39 passed + 3 skipped / 42 tests |
| Native 320×740 | 13 passed |
| TypeScript + Vite | 760 modules |
| Sites worker | 4 passed |
| Release manifest | 2 passed |

The known protected `BottomSheet` ineffective dynamic-import warning remains unchanged. This evidence
does not prove physical device behavior, external provider delivery, managed infrastructure or signed
production promotion.
