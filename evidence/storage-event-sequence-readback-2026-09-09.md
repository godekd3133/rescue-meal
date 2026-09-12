# Storage event sequence readback — 2026-09-09

## 확인한 결함

상세 식품 화면에서 사용자가 보관 위치를 바꾸면서 처음 개봉하는 경우,
`Prototype.saveFood()`가 `moved`와 `opened`를 서로 다른 `POST /api/foods/{food_id}/storage-events`
요청으로 보낼 수 있었습니다. 첫 번째 요청이 저장된 뒤 두 번째 요청이 timeout 또는 persistence
failure가 되면, 사용자에게는 하나의 행동처럼 보이는 변경이 서버에는 이동만 반영된 부분 상태로
남을 수 있었습니다. 각 요청에 Idempotency-Key가 있어 재시도는 가능했지만, 두 event를 함께
확정한다는 원자성은 보장하지 못했습니다.

## 설계와 변경

- `StorageEventSequenceRequest`는 `events`를 1~2개로 제한하고, sequence 요청에는
  `Idempotency-Key`를 필수로 요구합니다.
- `POST /api/foods/{food_id}/storage-event-sequence`는 workspace와 key/index로 계산한
  deterministic event ID를 사용합니다. 이미 전체 sequence가 있으면 요청 payload와 target
  food chain을 검증한 뒤 `X-Idempotency-Replayed: true`로 같은 결과를 반환합니다. 일부만
  남은 sequence나 payload 충돌은 `409`로 중단합니다.
- sequence의 각 event는 앞 event가 만든 child lot을 다음 event의 target으로 연결합니다.
  모든 inventory mutation, storage event, Grocy outbox projection, priority 계산은
  `WorkspaceMutation.run()` 안에서 staging하고, `reprioritize(persist=False)`와 단일 outer
  flush로 확정합니다. 일반 persistence failure에서는
  `storage_event_sequence_persistence_unavailable` typed `503`과 retry metadata를 반환하며
  전체 sequence를 snapshot으로 복원합니다.
- PostgreSQL revision conflict에서는 stale snapshot을 복원하지 않고 winner sequence를
  재조회해 replay합니다. 이 local transaction에는 외부 Grocy provider 호출·compensation과
  managed database failover가 포함되지 않습니다.
- 프론트는 이동과 최초 개봉이 동시에 요청된 경우에만 sequence endpoint를 사용하고, 이동만
  또는 개봉만인 기존 단일 endpoint semantics는 유지합니다. sequence failure는 global
  retry toast에서 동일 Idempotency-Key를 재사용하며, 실패 전 optimistic state는 dashboard
  read로 서버 상태에 맞춥니다.

## 회귀 검증

- sequence API targeted: **3 passed**
  - WorkspaceMutation 사용과 순차 child target 연결
  - 전체 sequence flush failure rollback 및 동일 key retry
  - Idempotency-Key 필수 검증
- connected sequence flow: **1 passed**
  - 최초 typed `503` 후 동일 key inline/global retry
  - request payload가 `[moved, opened]` 두 event인지 확인
- API 전체 mirror: **480 passed, 8 warnings**
- connected frontend/backend E2E 전체: **82 passed**
- frontend build: protected runtime **28**, Vite **757 modules**, initial index
  **309.99 kB**, AddFoodSheet **58.91 kB**, MealPlanSheet **36.91 kB**, AccountSheet
  **64.17 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**
- Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**
- source와 verification mirror의 sequence 관련 파일 `cmp`: **match**
- Python compile, shell syntax, Compose config, scoped `git diff --check`: **passed**

## 범위와 남은 위험

이번 계약은 사용자 화면에서 함께 발생하는 최대 2개의 local storage event만 원자화합니다.
복수 event batch API 전체, 외부 Grocy transaction/compensation, reverse-proxy response reset,
managed PostgreSQL failover·network partition·rolling deploy, backup/WAL/read-replica와 법정
retention, 실제 camera/accessibility/device, 외부 provider·push/email/telemetry delivery,
CI/deploy 성공은 이 readback으로 증명하지 않습니다.
