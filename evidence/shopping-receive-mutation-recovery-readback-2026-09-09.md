# Shopping receive mutation recovery readback — 2026-09-09

## 확인한 결함

`POST /api/shopping-list/{item_id}/receive`는 사용자가 실제 구매한 장보기 항목을
inventory lot으로 바꾸는 핵심 write입니다. 한 요청에서 새 lot 생성, planned source
reconciliation, checked 상태 변경, `ShoppingListReceiveOperation` ledger 기록과 priority
재계산을 함께 수행하지만, 기존 implementation은 수동 snapshot/restore와 직접 `flush()`를
사용했습니다. durable adapter에서 `reprioritize()`가 중간 persistence를 수행할 수 있어
final flush failure 뒤 lot·목록·ledger가 서로 어긋날 위험이 있었습니다.

## 설계와 변경

- receive route는 active workspace `mutation_lock()` 안에서 idempotency precheck, existing
  lot recovery, item lookup을 수행합니다.
- 새 lot 생성, planned source 재계산, manual source checked 보존, receive operation ledger
  append와 priority 재계산은 `WorkspaceMutation.run()` callback 안에서 staging합니다.
- `create_manual_lot()`은 local store만 변경하고, `reprioritize(persist=False)`로 중간
  persistence를 막은 뒤 하나의 outer `flush()`에서 lot·shopping list·ledger를 확정합니다.
- 일반 persistence failure에서는 `shopping_receive_persistence_unavailable` typed `503`,
  `retryable: true`, `action: retry_later`를 반환하고 inventory lot/list/ledger snapshot을
  복원합니다.
- `ConcurrentWorkspaceWriteError`는 stale snapshot restore 없이 PostgreSQL winner operation을
  조회해 동일 key replay를 유지합니다.
- 기존 contract를 보존합니다. 동일 key·payload는 같은 lot과
  `X-Idempotency-Replayed: true`로 replay하고, 다른 수량/보관 위치는 `409`로 거부하며,
  이미 소비·폐기된 lot은 새 lot으로 재생성하지 않습니다.
- ShoppingListSheet는 receive form이 열린 상태에서도 기존 목록·재고 보존 안내와 동일
  Idempotency-Key의 inline `다시 시도`를 제공합니다.

## 회귀 검증

- receive API targeted: **4 passed**
- WorkspaceMutation seam invocation: **passed**
- final-flush failure rollback of lot/list/ledger: **passed**
- same-key replay/concurrent winner regression: **passed**
- connected receive retry: **1 passed**
- API 전체 mirror: **476 passed, 8 warnings**
- connected frontend/backend E2E: **80 passed**
- frontend build: protected runtime **28 passed**, Vite **757 modules**, initial index
  **309.02 kB**, AddFoodSheet chunk **58.91 kB**, MealPlanSheet chunk **36.91 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**
- Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**
- Python compile, shell syntax, Compose config, scoped `git diff --check`: **passed**

## 범위와 남은 위험

이 readback은 local in-memory/SQLite/PostgreSQL compatibility projection의 receive
transaction과 frontend retry lifecycle을 검증합니다. 최신 route revision의 disposable
PostgreSQL multi-process smoke는 Docker daemon이 `docker info` 요청에 응답하지 않아 이번
revision에서 실행하지 않았습니다. 외부 Grocy call/compensation, managed PostgreSQL
failover/network partition, reverse-proxy response reset, backup/WAL/read-replica retention,
legal retention, 실제 device와 external provider delivery는 별도 운영 acceptance입니다.
