# Storage event error recovery readback — 2026-09-09

## 확인한 결함

`POST /api/foods/{food_id}/storage-events`의 정상 mutation은 active workspace lock과
`WorkspaceMutation.run()`을 이미 사용하고 있었습니다. 그러나 `InventoryInvariantError`,
not-found와 일반 예외를 처리하는 catch에서 `store.flush()`를 다시 호출하고 있었습니다.
이는 `WorkspaceMutation`이 이미 복원한 snapshot을 불필요하게 재저장하려는 이중 flush이며,
persistence failure가 재발하면 원래의 422/404 또는 retry 가능한 구조화 오류를 잃을 수
있었습니다.

## 설계와 변경

- `WorkspaceMutation`이 mutation failure 뒤 inventory, partial split, opened state, storage
  event와 Grocy outbox snapshot을 복원하도록 기존 구조를 유지합니다.
- storage event route의 예외 처리부에서는 더 이상 직접 `flush()`하지 않습니다.
- inventory invariant는 기존 422, defensive not-found는 기존 404, 일반 persistence failure는
  `storage_event_persistence_unavailable` typed `503`, `retryable: true`,
  `action: retry_later`로 반환합니다.
- frontend는 실패 후 dashboard를 다시 읽어 optimistic state를 server state로 맞추고,
  sheet가 닫힌 상태의 global `다시 시도` action에서 동일 Idempotency-Key를 재사용합니다.
  이미 성공한 앞선 event는 replay되고, 실패한 다음 event만 이어서 처리할 수 있습니다.
- storage event idempotency conflict, partial lot split, first `opened_at`, Grocy outbox
  status semantics는 변경하지 않았습니다.

## 회귀 검증

- storage API targeted: **8 passed**
- double-flush prevention and snapshot rollback/retry: **passed**
- connected typed persistence retry: **1 passed**
- API 전체 mirror: **477 passed, 8 warnings**
- connected frontend/backend E2E: **81 passed**
- frontend build: protected runtime **28 passed**, Vite **757 modules**, initial index
  **309.43 kB**, AddFoodSheet chunk **58.91 kB**, MealPlanSheet chunk **36.91 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**
- Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**
- Python compile, shell syntax, Compose config, scoped `git diff --check`: **passed**

## 범위와 남은 위험

이 readback은 local single storage-event projection의 failure recovery와 frontend retry를
검증합니다. 여러 storage event를 하나의 server batch transaction으로 처리하지 않으며,
move 후 open 같은 연속 요청은 각 event의 Idempotency-Key와 replay semantics에 의존합니다.
최신 route의 multi-process PostgreSQL HTTP smoke, 외부 Grocy compensation, managed failover/
network partition, reverse-proxy response reset, backup/WAL/read-replica retention, legal
retention과 실제 device/CI는 운영 acceptance입니다.
