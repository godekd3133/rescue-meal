# Single meal-plan save typed failure envelope readback — 2026-09-11

## Scope

This readback covers the local contract for `POST /api/meal-plans` when the outer
`WorkspaceMutation` flush fails, plus the connected planner retry action. Multi-day bundle save,
external provider transactions, managed PostgreSQL failover/partition, reverse-proxy response reset,
and production cutover remain separate acceptance gates.

## Root cause and red loop

Single meal-plan save already used a plan lock and `WorkspaceMutation`, so the failed mutation did not
leave a saved plan or `saved` audit event. However, the route's regular persistence exception was not
caught. A forced flush failure escaped through FastAPI/TestClient as the original `RuntimeError` instead
of a structured HTTP response.

The phantom regression was changed to exercise the HTTP route and require a typed envelope. Before the
fix it failed at the producer boundary with the raw simulated exception. This distinguished the
response-contract defect from the already-working phantom rollback.

## Backend change

Both the legacy no-`plan_id` compatibility path and the normal plan-lock path now preserve
`HTTPException` validation and `ConcurrentWorkspaceWriteError` winner replay, while mapping regular
persistence failures to:

```json
{
  "detail": {
    "code": "meal_plan_persistence_unavailable",
    "detail": "식단을 저장하지 못했습니다. 기존 식단과 workspace 상태를 유지했어요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

The response does not include exception text. The plan and saved audit snapshot remain absent after
failure, and same-plan replay, snapshot conflict, recipe conflict, and multi-day route ownership are
unchanged.

Targeted API coverage for the save flush envelope, WorkspaceMutation seam, concurrent save, and revision
probe passed **4**. The full API suite passed **500** tests with **8 existing deprecation warnings**.

## Frontend change

`mealApi.ts` exposes `isMealApiMealPlanPersistenceError()`. `MealPlanSheet.tsx` stores the failed
preview payload (`inventory_ids`, `plan_id`, `snapshot_hash`, recipe/bundle identity, and servings)
and shows inline `다시 시도` only for the typed persistence code. The retry reuses the failed payload;
snapshot/recipe conflicts, validation, and untyped errors do not receive this action.

The connected browser regression forces the first save request to return the typed `503`, verifies the
safe recovery copy and retry button, clicks retry, compares both request bodies, and lets the second
request reach the disposable API. Focused save retry: **1 passed**.

## Current verification lanes

| Lane | Result |
|---|---:|
| API full | 500 passed, 8 warnings |
| Connected Playwright | 106 passed / 3.9m fresh rerun |
| Fixture/mobile Playwright | 38 passed + 3 skipped / 41 tests |
| Native 320×740 Playwright | 11 passed |
| TypeScript + Vite | 760 modules |
| Protected runtime | 28 files passed |
| Sites worker | 4 passed |
| Release manifest | 2 passed |

An earlier long connected run reported `103/106` with timing-sensitive PDF, inventory-pagination, and
planner-history failures. Those flows passed clean focused repeats, and the later fresh full rerun passed
`106/106`; both observations are retained separately rather than silently rewriting the earlier evidence.

The known protected `BottomSheet` ineffective dynamic-import warning remains unchanged. This evidence
does not prove physical device behavior, external provider delivery, managed infrastructure, or signed
production promotion.
