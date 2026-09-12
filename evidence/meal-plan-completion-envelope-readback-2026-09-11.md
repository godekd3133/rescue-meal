# Meal-plan completion typed failure envelope readback — 2026-09-11

## Scope

This readback covers the local contract for `POST /api/meal-plans/{plan_id}/complete` when the
`WorkspaceMutation` outer flush fails, plus the connected browser recovery action. It does not claim
external Grocy transaction compensation, managed PostgreSQL failover/partition, reverse-proxy response
reset, physical device accessibility, signed artifact promotion, or production cutover.

## Root cause and red loop

The route already used `WorkspaceMutation.run()` and restored the plan/inventory/consumed-event
snapshot. Its generic exception handler nevertheless returned a plain string:

```text
HTTP 503
detail = "식단 완료를 롤백했습니다."
```

The regression was extended before the fix to require the typed contract. Running from the repository
root first selected the system Python and failed during collection because `python-multipart` was not
installed in that interpreter. Re-running from `services/api`, the test failed at the exact producer
boundary with:

```text
TypeError: string indices must be integers, not 'str'
```

This isolated the defect to the response envelope rather than rollback or completion mutation logic.

## Backend change and verification

The route now preserves `HTTPException` validation and `ConcurrentWorkspaceWriteError` winner replay,
but maps regular completion persistence failures to:

```json
{
  "detail": {
    "code": "meal_plan_completion_persistence_unavailable",
    "detail": "식단 완료를 저장하지 못했습니다. 기존 재고와 식단을 유지했어요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

The forced-flush regression also verifies that the simulated exception text is absent, the plan remains
uncompleted, no completion event remains, and the three fixture quantities remain unchanged. Targeted
completion recovery (normal completion, linked multi-day flush rollback, typed envelope) passed **3**.
The full API suite passed **500** tests with **8 existing deprecation warnings**.

## Frontend change and verification

`mealApi.ts` now exposes `isMealApiMealPlanCompletionPersistenceError()`. `MealPlanSheet.tsx` maps only
that typed code to the user-safe message `조리 완료를 저장하지 못했어요. 기존 재고와 식단을 유지했어요.`
and shows an inline `다시 시도` button. The first failed plan/consumption payload is retained for the
retry action; the plan and visible consumption draft remain unchanged. Workspace conflicts,
allocation/unit validation, and generic errors do not receive this completion retry action.

The connected browser regression intercepts the first completion request with the typed `503`, verifies
the alert and retry action, confirms chicken usage remains `0.5`, clicks retry, compares both request
bodies, and lets the second request reach the real disposable API. Focused result: **1 passed**.

The final full connected lane ran on disposable API/web ports `8141/4541` with **104 passed (4.0m)**.
The focused retry rerun used `8140/4540` and passed. All dedicated server pairs shut down cleanly.

## Other final lanes

| Lane | Result |
|---|---:|
| API full | 500 passed, 8 warnings |
| Connected Playwright | 104 passed |
| Fixture/mobile Playwright | 38 passed + 3 skipped / 41 tests |
| Native 320×740 Playwright | 9 passed |
| Protected runtime | 28 files passed |
| TypeScript + Vite | 760 modules |
| Sites worker | 4 passed |
| Release manifest | 2 passed |

The known `INEFFECTIVE_DYNAMIC_IMPORT` warning for protected `BottomSheet` remains unchanged. Physical
camera/accessibility and external production infrastructure remain separate acceptance gates.
