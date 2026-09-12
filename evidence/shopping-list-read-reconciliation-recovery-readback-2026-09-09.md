# Shopping list read reconciliation recovery readback — 2026-09-09

## 확인한 결함

`GET /api/shopping-list`는 목록을 읽는 endpoint처럼 보이지만, 현재 재고와 저장된
meal-plan/multi-day source를 대조해 derived shopping projection을 삭제·갱신합니다. 기존에는
각 `_sync_shopping_list()` 호출이 직접 `flush()`했기 때문에 source가 여러 개일 때 앞선
reconciliation만 durable하고 뒤의 실패가 발생하는 partial list 위험이 있었습니다.

## 설계와 변경

- `get_shopping_list()`는 `_reconcile_shopping_list_sources(persist=False)`와 최종
  `_sorted_shopping_list()` read model을 `WorkspaceMutation.run()` 안에서 실행합니다.
- 모든 source reconciliation은 memory에 staging하고 하나의 outer `flush()`에서 확정합니다.
  regular persistence failure에서는 이전 shopping list snapshot을 복원하고
  `shopping_list_persistence_unavailable` typed `503`, `retryable: true`,
  `action: retry_later`를 반환합니다.
- PostgreSQL revision conflict는 stale snapshot restore 없이 global conflict handler로
  전파합니다.
- GET read는 frontend mutation broadcast를 발행하지 않습니다. 기존 계획/manual source write,
  shopping receive inventory lot·operation transaction과는 별도입니다.
- MealPlanSheet와 홈 ShoppingListSheet의 기존 read retry가 typed failure 뒤 최신 목록을
  다시 읽습니다. partial list를 성공 상태로 남기지 않습니다.

## 회귀 검증

- shopping API targeted: **9 passed**
- read reconciliation seam invocation: **passed**
- partial reconciliation flush-failure rollback/retry: **passed**
- API 전체 mirror: **472 passed, 8 warnings**
- connected frontend/backend E2E: **80 passed**
- frontend build baseline: protected runtime **28 passed**, Vite **757 modules**, initial index
  **308.54 kB**, MealPlanSheet chunk **36.91 kB**, AccountSheet chunk **64.16 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**
- Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**
- Python compile, shell syntax, Compose config, scoped `git diff --check`: **passed**

## 범위와 남은 위험

이 readback은 local in-memory/SQLite/PostgreSQL compatibility projection의 read-time shopping
reconciliation recovery를 검증합니다. 계획/manual source write recovery는
[shopping list mutation recovery readback](shopping-list-mutation-recovery-readback-2026-09-09.md)에
기록되어 있습니다. 이번 slice에서는 latest route의 multi-process PostgreSQL HTTP smoke,
shopping receive의 inventory/operation 전체 transaction, 외부 provider, managed failover/
network partition, read replica/backup/WAL, legal retention과 실제 device/CI를 검증하지
않았습니다.
