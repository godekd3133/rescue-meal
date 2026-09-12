# Shopping list mutation recovery readback — 2026-09-09

## 확인한 결함

계획의 부족 재료를 장보기 목록으로 materialize하는
`POST /api/shopping-list`와 사용자가 직접 물건을 추가하는
`POST /api/shopping-list/manual`은 workspace state를 변경하는 write였습니다. 기존
implementation은 `_sync_shopping_list()`와 manual mutation에서 직접 `flush()`했기 때문에
공통 `WorkspaceMutation` snapshot/restore Seam을 사용하지 않았습니다. persistence failure가
발생하면 source merge 또는 manual item이 process-local state에 남을 수 있었고, MealPlanSheet와
ShoppingListSheet가 서로 다른 오류/복구 흐름을 가질 수 있었습니다.

## 설계와 변경

- 계획 source 동기화는 `_sync_shopping_list(..., persist=False)`로 계산·merge를 staging하고,
  manual add는 `_add_manual_shopping_list_item(..., persist=False)`로 정규화·merge를 staging합니다.
- 두 route는 `WorkspaceMutation.run()`의 snapshot → mutation → 단일 outer `flush()`를
  사용합니다. 일반 persistence failure에서는 기존 shopping list snapshot을 복원하고
  `shopping_list_persistence_unavailable` typed `503`, `retryable: true`,
  `action: retry_later`를 반환합니다.
- 기존 source merge semantics를 보존합니다. meal-plan/multi-day source와 manual source는
  함께 유지되고 quantity는 합산되며, quantity가 변하면 checked 상태를 해제합니다. 직접 입력의
  연속 공백 정규화와 잘못된 입력 `422`도 유지합니다.
- PostgreSQL revision conflict는 stale snapshot을 복원하지 않고 global conflict handler로
  전파합니다.
- MealPlanSheet의 계획 source 추가와 홈 ShoppingListSheet의 manual add는 열린 sheet 내부
  alert에서 retry합니다. retry는 같은 source identity 또는 manual payload를 재사용하고,
  workspace conflict는 최신 목록을 다시 읽도록 분리합니다.

## 회귀 검증

- shopping API targeted: **7 passed**
- WorkspaceMutation seam invocation: **2 callers passed**
- plan/manual flush-failure rollback 및 retry: **passed**
- connected plan source retry: **1 passed**
- connected manual add retry: **1 passed**
- API 전체 mirror: **470 passed, 8 warnings**
- connected frontend/backend E2E: **80 passed**
- frontend build: protected runtime **28 passed**, Vite **757 modules**, initial index
  **308.54 kB**, MealPlanSheet chunk **36.91 kB**, AccountSheet chunk **64.16 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**
- Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**
- Python compile, shell syntax, Compose config, scoped `git diff --check`: **passed**

## 범위와 남은 위험

이 readback은 local in-memory/SQLite/PostgreSQL compatibility projection의 shopping source
creation/update recovery와 두 frontend sheet의 retry lifecycle을 검증합니다. 기존 shopping
receive의 inventory lot·operation ledger transaction, GET 자동 reconciliation, 외부 provider
transaction, managed PostgreSQL failover/network partition, reverse-proxy response reset,
backup/WAL/read-replica retention, legal retention과 실제 device acceptance는 이 slice에서
검증하지 않았습니다.
