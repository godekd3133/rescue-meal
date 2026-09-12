# Product-enrichment mutation recovery readback — 2026-09-09

## 확인한 결함

receipt review에서 사용자가 선택하는 product-enrichment enqueue와 dead-letter retry는
workspace의 durable job map을 변경하는 write였습니다. 기존 route는 job을 직접 변경하고
`flush()`했으며 `WorkspaceMutation` snapshot에 `product_enrichment_jobs`가 포함되지 않았습니다.
따라서 enqueue persistence failure 뒤 queued job이 process-local state에 남거나, dead-letter
retry failure 뒤 job이 queued 상태로 잘못 보일 위험이 있었습니다. AddFoodSheet도 이 오류를
일반 문자열로만 표시했습니다.

## 설계와 변경

- `InMemoryStore.snapshot()`/`restore()`에 deep-copied `product_enrichment_jobs`를 추가해
  job map을 workspace mutation recovery 대상에 포함했습니다.
- `POST /api/receipts/{receipt_id}/product-enrichment`는 receipt 상태와 product line을
  mutation 안에서 확인하고 deterministic `product-enrichment-{receipt_id}` job을 staging합니다.
  이미 존재하는 job은 그대로 반환합니다.
- `POST /api/receipts/{receipt_id}/product-enrichment/retry`는 dead-letter job만 queued로
  되돌리고, 다른 상태는 그대로 반환합니다.
- 두 route 모두 `WorkspaceMutation.run()`의 snapshot → mutation → outer `flush()`를 사용하며,
  regular failure는 `product_enrichment_persistence_unavailable` typed `503`,
  `retryable: true`, `action: retry_later`로 반환합니다.
- PostgreSQL revision conflict는 stale snapshot을 복원하지 않고 reload된 winner job을
  반환합니다.
- AddFoodSheet는 typed failure에서 receipt review draft와 job state를 유지하고 inline
  `다시 시도`로 enqueue를 재실행합니다. 기존 queued/in-flight polling과 succeeded
  candidate merge는 유지합니다.

## 회귀 검증

- product-enrichment API/worker targeted: **10 passed**
- enqueue/retry seam invocation: **passed**
- enqueue flush failure rollback/retry: **passed**
- dead-letter retry flush failure rollback/retry: **passed**
- connected receipt review retry: **1 passed**
- API 전체 mirror: **474 passed, 8 warnings**
- connected frontend/backend E2E: **80 passed**
- frontend build: protected runtime **28 passed**, Vite **757 modules**, initial index
  **308.65 kB**, AddFoodSheet chunk **58.91 kB**, AccountSheet chunk **64.17 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**
- Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**
- Python compile, shell syntax, Compose config, scoped `git diff --check`: **passed**

## 범위와 남은 위험

이 readback은 API가 소유하는 local/SQLite/PostgreSQL compatibility job projection의
enqueue/dead-letter retry recovery와 AddFoodSheet inline retry를 검증합니다. 기존 SQLite
product-enrichment job/worker heartbeat persistence와 worker unit contract는 유지되지만,
이번 slice에서 최신 route의 multi-process PostgreSQL HTTP smoke를 별도로 실행하지는 않았습니다.
worker의 외부 I1250/Open Food Facts transaction, provider cache/rate limit, lease/heartbeat,
external delivery, managed failover/network partition, response reset, legal retention과
실제 device acceptance는 운영 gate입니다.
