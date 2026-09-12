# Grocy REST adapter

## 현재 구현

`services/api/app/grocy.py`에 Grocy HTTP client를 추가했습니다. `GROCY_BASE_URL`과 `GROCY_API_KEY`가 모두 설정된 경우에만 client를 만들고, 그렇지 않으면 외부 요청을 하지 않습니다.

현재 지원하는 adapter operation:

- `GET /api/system/info` — Grocy version/status readback
- `GET /api/stock/products/by-barcode/{barcode}` — barcode를 Grocy internal product ID 후보로 조회
- `POST /api/stock/products/{productId}/add` — 구매 stock 추가 payload 생성
- `POST /api/stock/products/{productId}/consume` — 소비/폐기 payload 생성
- `POST /api/stock/products/{productId}/open` — 개봉 처리 payload 생성
- `POST /api/stock/products/{productId}/transfer` — 위치 이동 payload 생성

Grocy API key는 `GROCY-API-KEY` header로 전달합니다. endpoint와 payload 필드는 [Grocy 공식 OpenAPI](https://github.com/grocy/grocy/blob/master/grocy.openapi.json)의 현재 stock API 계약을 기준으로 합니다.

## Rescue Meal과의 연결 경계

```text
Rescue Meal review/commit
→ user-confirmed ProductAlias + Grocy product ID mapping
→ Grocy add stock
→ response transaction ID/readback
→ Rescue Meal commit transaction committed
```

```text
Rescue Meal opened event
→ Grocy open
→ transaction ID 저장
→ 실패 시 reconciliation queue
```

```text
Rescue Meal consumed/discarded event
→ Grocy consume(spoiled=false/true, exact_amount=true)
→ transaction ID 저장
→ 실패 시 reconciliation queue
```

```text
Rescue Meal moved/frozen/thawed event
→ 확인된 storage type ↔ Grocy location ID
→ Grocy transfer
→ transaction ID 저장
→ 실패 시 reconciliation queue
```

현재는 receipt commit이나 storage event에 Grocy write를 동기식으로 섞지 않고, local mutation 뒤에 workspace-scoped outbox를 생성합니다. 상품명·단위 mapping이 없으면 `blocked/needs_mapping`으로 남기고, 이동 계열은 출발·도착 storage mapping까지 모두 확인될 때만 `pending/queued`가 됩니다. 별도 process endpoint에서만 Grocy write를 실행하며, 응답에 transaction ID가 없으면 성공으로 취급하지 않고 retry/dead-letter로 보냅니다. `GET /api/integrations/grocy/status`는 read-only 상태 확인을 유지합니다.

## Outbox workflow

```text
영수증 review commit
→ Rescue Meal local lot + commit transaction committed
→ Grocy outbox 생성
   ├ mapping 없음 → blocked / needs_mapping
   └ mapping 있음 → pending / queued
→ canonical name ↔ Grocy product ID mapping 저장
→ POST /api/integrations/grocy/outbox/process
→ Grocy add / open / consume / transfer
→ transaction_id readback
→ succeeded 또는 3회 실패 후 dead_letter
```

```text
processor에서 in_flight 잔류 감지
→ stale reconciliation scan
→ reconciliation_required
   ├ 외부 반영됨 + transaction ID → succeeded
   └ 외부 미반영 → pending 재시도
```

지원 API:

- `GET /api/integrations/grocy/mappings?q={상품명}&limit={n}` — 현재 workspace mapping 검색/조회와 마지막 변경 주체 readback
- `GET /api/integrations/grocy/mappings/{canonical_name}/events?limit={n}` — 상품 매핑 생성·수정의 `before → after` audit readback
- `PUT /api/integrations/grocy/mappings/{canonical_name}` — 명시적 상품 ID mapping 저장 및 blocked outbox 재개
- `GET /api/integrations/grocy/location-mappings` — 실온·냉장·냉동과 Grocy location ID 연결 조회
- `PUT /api/integrations/grocy/location-mappings/{storage_type}` — 보관 위치 mapping 저장 및 이동 outbox 재개
- `GET /api/integrations/grocy/outbox?status=pending` — 외부 동기화 대기 목록
- `POST /api/integrations/grocy/outbox/process` — 검증된 Bearer workspace token으로 최대 100건의 add/open/consume/transfer를 명시적으로 처리
- `POST /api/integrations/grocy/outbox/{id}/retry` — `dead_letter` 한 건을 운영자 확인 후 새 pending cycle로 재등록
- `POST /api/integrations/grocy/outbox/reconciliation-scan` — 오래된 `in_flight`를 외부 확인 필요 상태로 전환
- `POST /api/integrations/grocy/outbox/{id}/reconcile` — 운영자가 외부 반영 여부와 transaction ID를 명시적으로 확정
- `GET /api/integrations/grocy/worker/status` — 현재 workspace worker heartbeat readback
- `POST /api/internal/grocy/workspaces/{workspace_id}/tick` — service token으로 호출하는 단일 workspace worker tick

각 outbox는 입고의 `receipt:{receipt_id}:lot:{lot_id}`, 상태 변경의 `storage-event:{event_id}` idempotency key를 가집니다. 입고 요청의 note에는 key를 전달하고, consume은 폐기일 때만 `spoiled=true`로 보냅니다. `grocy_unit`이 Rescue Meal lot unit과 정확히 일치하지 않으면 mapping이 있어도 blocked 상태로 남깁니다. 3회 외부 실패는 `dead_letter`로 격리하며, 운영자가 retry endpoint나 설정 화면에서 새 시도 cycle을 명시적으로 시작할 수 있습니다. 수동 재시도 횟수·메모·이전 dead-letter 오류도 outbox에 보존합니다. processor가 stale `in_flight`를 발견하면 외부 호출을 반복하지 않고 `reconciliation_required`로 전환합니다. 운영자가 `already_applied`와 transaction ID를 입력하면 succeeded, `not_applied`를 선택하면 pending으로 되돌립니다. 상품 mapping을 생성·수정하면 별도의 append-only audit event에 actor, 시각, `before`, `after` snapshot을 저장하고, 계정 설정 화면에서 상품별 이력을 열람할 수 있습니다. 실제 Grocy transaction 조회·중복 방지·undo는 live container에서 추가 확인해야 하므로, 이번 reconciliation은 운영자가 확인한 assertion을 기록하는 계약입니다.

## Background worker

`infra/docker-compose.yml`의 `grocy-worker`는 API와 별도 프로세스로 실행됩니다. worker는 DB나 Grocy API key를 직접 열지 않고 service token으로 API 내부 tick endpoint만 호출합니다. `RESCUE_MEAL_GROCY_WORKSPACE_IDS`에 명시된 workspace를 순서대로 순회하며, 각 workspace마다 다음을 수행합니다.

```text
workspace lease 획득
→ stale in-flight scan
→ pending outbox 최대 process_limit 처리
→ lease 해제
```

lease는 API의 SQLite에서는 `BEGIN IMMEDIATE`, PostgreSQL에서는 workspace 복합키 row lock으로 보호합니다. 다른 worker가 lease를 보유하면 그 workspace는 건너뛰고, process가 죽으면 lease 만료 뒤 다음 tick에서 stale reconciliation 대상이 됩니다. worker는 workspace를 자동 발견하지 않으므로 운영 scheduler 또는 Compose 환경변수에 대상 workspace를 명시해야 합니다. 기본 Compose 실행에는 `grocy` profile이 필요하고, `RESCUE_MEAL_GROCY_WORKER_TOKEN`은 API와 worker에 같은 secret으로 주입해야 합니다.

단발 실행은 다음처럼 확인할 수 있습니다.

```bash
cd services/api
uv run python scripts/run_grocy_worker.py --once
```

실제 API tick을 실행하려면 `RESCUE_MEAL_API_BASE_URL`, `RESCUE_MEAL_GROCY_WORKER_TOKEN`, `RESCUE_MEAL_GROCY_WORKSPACE_IDS`를 설정해야 하며, token이 없으면 worker는 disabled JSON만 출력하고 종료합니다.

runner는 API가 HTTP 200을 반환하더라도 tick response의 `error`가 있으면 실패로
취급합니다. `--once`는 그런 실패에서 exit code `1`을 반환하고, 장기 실행은
기본 interval에서 시작해 최대 300초까지 `2^n` bounded backoff를 적용합니다.
정상 cycle이 확인되면 backoff streak를 초기화합니다. 이 scheduler 경계는 Grocy
외부 호출·outbox transaction·lease 자체를 대신하지 않으며, API tick이 반환한
heartbeat와 outbox 상태를 별도 증거로 유지합니다.

## 설정

```text
GROCY_BASE_URL=http://grocy:9283
GROCY_API_KEY=secret-manager-value
GROCY_TIMEOUT_SECONDS=5
```

API key와 response body는 error message나 로그에 넣지 않습니다. timeout은 1~30초로 제한합니다.

상품 mapping은 서버가 상품명만으로 추론하지 않습니다. 사용자가 확인한 mapping 예시는 다음과 같습니다.

```http
PUT /api/integrations/grocy/mappings/곤약
Content-Type: application/json

{"grocy_product_id": 42, "grocy_unit": "팩", "source": "user_confirmed"}
```

## 검증

- 설정이 불완전하면 `disabled`
- mock `system/info` readback과 version 추출
- barcode lookup URL
- add/consume/open/transfer method와 JSON payload
- API key header 전달
- HTTP failure 시 status만 포함하고 response body/API key는 노출하지 않음
- Grocy 미설정 receipt commit은 `not_configured`로 남고 외부 호출하지 않음
- mapping 없는 configured commit은 `needs_mapping` outbox로 남고 외부 호출하지 않음
- mapping 저장 후 blocked outbox가 pending으로 재개됨
- transaction ID readback 성공은 `succeeded`, 3회 실패는 `dead_letter`
- dead-letter 수동 재시도는 이전 오류·메모·횟수를 보존하며 pending cycle로 재등록됨
- stale in-flight scan은 외부 호출 없이 `reconciliation_required`로 전환됨
- reconciliation은 transaction ID가 없으면 `already_applied`를 거부하고, `not_applied`만 pending으로 재등록함
- worker `--once`가 workspace lease를 획득하고 bounded tick 결과를 JSON으로 출력함
- 다른 worker가 lease를 보유한 workspace는 외부 호출 없이 건너뜀
- disposable Grocy 4.7.0 container에서 receipt add/open/consume/transfer와 transaction ID·location/stock readback을 확인했습니다. 운영 Grocy backup/restore·API key rotation·다중 worker crash/in-flight reconciliation·transaction undo는 별도 acceptance입니다 ([live Grocy sync readback](../evidence/live-grocy-sync-readback-2026-09-04.md)).
