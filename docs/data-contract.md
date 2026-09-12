# Rescue Meal 데이터 계약

## 1. 설계 원칙

1. 상품 master와 구매 lot을 분리한다.
2. 영수증 추출 결과는 검토 전까지 재고를 변경하지 않는다.
3. 표시 날짜와 계산 날짜를 분리한다.
4. 모든 날짜에는 종류·출처·신뢰도·확인자를 기록한다.
5. 보관 상태 변경은 현재 값 덮어쓰기가 아니라 append-only event로 기록한다.
6. 일부 수량의 상태 변경은 lot 분할로 표현한다.
7. 계산 규칙은 버전과 출처를 가져야 한다.
8. 추정값은 식품 안전 판정으로 사용하지 않는다.
9. 서로 다른 영수증의 같은 상품은 서로 다른 구매 lot으로 보존한다.
10. PostgreSQL workspace snapshot은 revision 충돌 시 stale write를 허용하지 않는다.
11. 알레르기 회피는 알려진 recipe metadata에만 적용하고, metadata가 없으면 안전하다고 추정하지 않는다.
12. 첫 개봉 시각은 lot 상태와 append-only event의 동일한 기준으로 보존하며, 반복 개봉은 최초 시각을 덮어쓰지 않는다.
13. durable projection reload는 완성된 read snapshot 단위로 공개하며, loader 중간 상태를 reader에게 노출하지 않는다.

## 1.3 Retryable operation identity

receipt·manual food·shopping receive·storage event의 retry identity는
`OperationLedger` Module에서 정규화합니다. Module은 optional `Idempotency-Key`를
trim하고 `[A-Za-z0-9._:-]{1,128}` 형식을 검증하며, 원문 대신 SHA-256 digest를 만들고
정렬된 canonical JSON payload에서 64자리 fingerprint를 계산합니다. 기존 workspace·item
scoped lot/event ID의 separator와 digest 길이도 이 Module에서 보존합니다.

domain Adapter는 receipt/item scope, durable operation record, lot 존재 여부, replay
response와 conflict detail을 계속 판정합니다. 따라서 공통 identity 계산이
`manual_food_idempotency_conflict`, receipt commit conflict, shopping receive conflict,
storage event conflict를 같은 사용자 메시지나 같은 record로 잘못 합치지 않습니다.

## 1.1 Workspace revision 선행조건

PostgreSQL workspace projection은 성공한 write마다 durable revision을 증가시킵니다. workspace
범위의 응답은 최신 revision을 `X-Rescue-Meal-Workspace-Revision` response header로 반환하고,
CORS 환경에서는 이 header를 `Access-Control-Expose-Headers`에 포함해야 브라우저 client가 읽을
수 있습니다. SQLite compatibility store는 기존 호환 동작을 유지하며 이 header를 생성하지 않습니다.

프론트는 현재 session에서 관찰한 가장 큰 revision을 기억합니다. `GET`을 제외한 workspace
mutation에는 관찰한 값이 있을 때 다음 선택 header를 붙입니다.

```text
If-Rescue-Meal-Revision: 16
```

순수 계산·parse인 `POST /api/barcodes/parse`, `POST /api/labels/*`,
`POST /api/inference/priority`, meal-plan preview/options, guest-transfer preview는
revision 선행조건에서 제외합니다. 이 endpoint들은 workspace read model을 변경하지
않으므로 다른 기기의 저장 때문에 계산 요청이 불필요하게 충돌하지 않아야 합니다.

서버는 workspace lease를 얻고 최신 snapshot을 읽은 뒤 mutation handler를 실행하기 전에 이 값을
검사합니다. client revision과 현재 revision이 다르면 handler와 `flush`를 실행하지 않고 다음
응답을 반환합니다.

```http
HTTP/1.1 409 Conflict
X-Rescue-Meal-Conflict: workspace_revision
X-Rescue-Meal-Workspace-Revision: 17
```

```json
{
  "code": "workspace_revision_conflict",
  "detail": "다른 기기에서 workspace가 먼저 변경되었습니다. 최신 목록을 다시 불러온 뒤 재시도해 주세요.",
  "retryable": true,
  "action": "reload_and_retry",
  "expected_revision": 16,
  "current_revision": 17
}
```

이 응답은 stale payload를 자동으로 덮어쓰지 않는 경계입니다. client는 response의 현재 revision을
기억하고 최신 dashboard/read model을 다시 읽은 뒤, 사용자가 현재 내용을 확인하고 mutation을
재시도하게 합니다. 같은 `409`라도 영수증 fingerprint 중복, idempotency key 재사용, 날짜 정정
불변조건, recipe snapshot 충돌은 각각의 기존 domain code와 규칙을 유지하며
`workspace_revision_conflict`로 오인하지 않습니다.

## 1.2 Durable read snapshot

요청 middleware가 SQLite 또는 PostgreSQL workspace projection을 재로드할 때 loader는
public collection을 먼저 비우지 않습니다. `_AtomicStoreStateMixin`의 private loading
state에 inventory·receipt·meal plan/bundle·notification·Grocy·recipe audit·idempotency
ledger를 모두 materialize한 뒤 state reference를 한 번 교체합니다. 다른 request reader는
그동안 이전의 완성된 snapshot을 읽고, reload 시작 이후 이전 state에서 감지된 local
mutation은 새 state에 보존하며, load 중 예외가 발생하면 이전 snapshot이 유지됩니다.

이 규칙은 저장이 성공했는데도 planner latest read가 일시적으로 `null`이 되는 transient
empty projection을 차단합니다. 이는 local/adapter read lifecycle 계약이며 PostgreSQL
revision 선행조건·operation pool·query/commit replay 금지·managed failover 또는
multi-replica ordering을 대신하지 않습니다.

## 2. 핵심 엔터티

### Product

상품 또는 식재료의 공통 정보입니다.

```json
{
  "id": "product_uuid",
  "canonical_name": "서울우유 나100% 1L",
  "category_id": "milk",
  "default_unit": "ml",
  "default_storage_location_id": "storage-location-uuid",
  "grocy_product_id": 123,
  "active": true
}
```

### ProductAlias

영수증 축약명·매장 SKU·바코드를 상품에 연결합니다.

```json
{
  "id": "alias_uuid",
  "product_id": "product_uuid",
  "alias_type": "receipt_name",
  "value": "서울우유1L",
  "store_id": "store_uuid",
  "source": "user_confirmed",
  "confidence": 1.0
}
```

### StorageLocation

`StorageLocation`은 사용자가 실제 보관 장소를 구분하기 위한 workspace-scoped
표시 이름입니다. 안전·우선순위 계산의 canonical `storage_type`은 별도로 유지하며,
사용자 정의 위치의 예는 `김치냉장고`, `냉장고 2단`, `냉동 서랍`입니다. 기본 위치
`ambient`, `refrigerated`, `frozen`은 API가 항상 제공하고 삭제할 수 없습니다.

```json
{
  "id": "storage-location-uuid",
  "name": "김치냉장고",
  "storage_type": "refrigerated",
  "temperature_celsius": null,
  "temperature_source": "not_measured",
  "created_at": "2026-09-10T09:00:00+00:00"
}
```

`storage_location_id`가 있으면 해당 위치가 가진 `storage_type`과 요청의
`storage_type`이 반드시 같아야 합니다. 불일치는 `storage_location_type_mismatch`
로 거부하고, 현재 lot·storage event·장보기 입고 operation이 참조하는 사용자 정의
위치는 `storage_location_in_use`로 삭제를 거부합니다. 이름 중복은 같은 canonical 분류 안에서만
`storage_location_duplicate`로 거부합니다. 위치 CRUD는
`GET/POST /api/storage-locations`, `PATCH/DELETE /api/storage-locations/{id}`로
제공하며, 모든 mutation은 workspace revision·cross-tab `storage-locations`
invalidation·retryable persistence error 경계를 따릅니다.

`GET /api/storage-locations/revision`은 위치 목록을 포함하지 않는 현재 workspace
revision marker입니다. AccountSheet는 이를 tab 복귀·30초 bounded probe에 사용하며,
revision이 바뀌면 편집 중인 이름·삭제 확인 상태를 닫고 최신 위치 목록을 다시 읽습니다.
probe 실패는 기존 목록을 지우지 않습니다. SQLite local adapter는
`workspace_metadata`에 revision을 저장하고, in-memory adapter는 process-local marker를
사용합니다. PostgreSQL은 기존 workspace revision/header를 사용합니다.

식품 수동 추가, 영수증 commit override, 장보기 수령, storage event의 target에는
선택적 `storage_location_id`를 전달할 수 있습니다. 위치 이름 변경은 lot의
canonical class나 날짜 assertion을 바꾸지 않고 이후 read model에서 최신 이름으로
표시합니다. 이름 변경은 과거 storage event와 장보기 입고 operation의 location ID가
같은 read model 이름을 계속 가리키도록 합니다. 과거 기록을 보존해야 하므로 참조가
남은 위치는 삭제 대신 이름 변경을 사용할 수 있습니다.

### Workspace revision read markers

`GET /api/dashboard/revision`과 `GET /api/notifications/revision`은 각각 dashboard와
알림 payload를 반환하지 않고 현재 workspace의 `{ "revision": n }`만 반환합니다. 두
endpoint는 같은 workspace revision source와 `X-Rescue-Meal-Workspace-Revision` response
header를 사용하며, marker 자체는 재고·알림 내용이나 안전 판정의 version이 아닙니다.

홈 dashboard는 초기 payload와 marker를 함께 기억하고, sheet가 열리지 않은 상태에서 tab
복귀·30초 bounded probe가 더 높은 revision을 읽으면 inventory·Rescue Queue를 자동 재조회합니다.
일반 dashboard sync와 probe는 동시에 실행하지 않으며, sheet가 열렸거나 사용자 toast가 있으면
background refresh가 현재 작업 결과를 교체하거나 덮지 않습니다. dashboard refresh가 성공하면
현재 query/filter가 있는 `inventory-search` channel도 다시 실행해 기본 inventory와 검색 결과가
서로 다른 revision으로 남지 않게 합니다. 알림 센터는 별도
`/api/notifications/revision` marker를 사용해 열린 목록을 자동 재조회하지만, 읽음·전체 읽음
mutation 중에는 refresh를 보류하고 완료 뒤 queued refresh를 수행합니다. probe 실패·hidden
tab·workspace 전환은 기존 read model을 삭제하지 않습니다. ShoppingListSheet는
`/api/shopping-list/revision` marker를 사용해 열린 장보기 목록을 자동 재조회하며, 체크·삭제·
입고·직접 추가 mutation 중에는 목록을 교체하지 않고 cross-tab refresh를 mutation 완료 뒤
queued refresh로 처리합니다. 검수 대기 `receipt-queue` sheet는
`/api/receipts/revision` marker로 summary queue만 자동 재조회하며, 실제 AddFoodSheet 검수
화면이 열리면 probe를 중단해 OCR/draft 입력을 교체하지 않습니다. 네 marker 모두 payload나
안전 판정의 version이 아니라 workspace 변경 감지용 read marker입니다. 열린
FoodDetailSheet는 dashboard revision 증가를 stale alert로만 표시하고, 사용자가 명시적으로
최신 상태 확인을 선택하기 전에는 food payload와 상품 정보/보관/날짜 draft를 자동 교체하지
않습니다.

AccountSheet도 같은 dashboard revision marker를 account sheet가 열린 동안에만 tab 복귀·
30초 bounded probe로 확인합니다. revision이 증가하면 인증 account와 guest account 화면에
stale alert를 표시하지만 notification preference·사용자 정의 보관 위치·receipt privacy·
Grocy 하위 panel의 local draft와 확인 상태는 자동 교체하지 않습니다. 사용자가
`최신 계정 설정 확인`을 선택하면 기존 dashboard read가 성공한 뒤 parent refresh nonce를
증가시켜 각 하위 panel이 최신 workspace 값을 다시 읽습니다. probe failure·hidden tab·
workspace reset·실패한 명시적 refresh에서는 기존 계정 화면을 유지합니다. parent nonce는
기존 same-tab `externalRefreshNonce`와 합산하며, 이 marker는 account settings의 read
freshness를 알릴 뿐 실제 multi-device scheduling·server push·managed failover를 보장하지
않습니다.

### PurchaseReceipt

```json
{
  "id": "receipt_uuid",
  "file_sha256": "...",
  "fingerprint": "...",
  "fingerprint_version": "receipt-fingerprint-v1",
  "store_id": "store_uuid",
  "receipt_number": "1234",
  "purchased_at": "2026-09-01T13:20:00+09:00",
  "template_id": "grocery-mart-v1",
  "template_confidence": 0.9,
  "total_amount": 28400,
  "status": "review_required",
  "ocr_engine": "paddleocr",
  "ocr_model_version": "pinned-version",
  "commit_transaction_id": null,
  "created_at": "2026-09-01T14:00:00+09:00"
}
```

`template_id`와 `template_confidence`는 OCR이 사용한 보수적인 영수증 형식
profile의 provenance입니다. `grocery-mart-v1`, `retail-beverage-v1`,
`restaurant-card-v1`, `grocery-generic-v1`, `generic-v1` 중 하나이며,
매장 주소·전화번호·상호 원문을 저장하거나 상품·소비기한을 확정하는 값이
아닙니다. profile confidence가 낮아도 review/commit gate를 우회하지 않습니다.

상태:

```text
uploaded
→ extracting
→ review_required
→ confirmed
→ committed
| rejected
```

`committed` 영수증은 동일 fingerprint로 다시 입고할 수 없습니다.

`POST /api/receipts/{receipt_id}/commit`은 검토가 끝난 line만 `confirmed_line_ids`로 받으며, 사용자가 OCR 후보를 수정한 경우 `overrides`에 보정값을 함께 보냅니다.

```json
{
  "confirmed_line_ids": ["line-1", "line-2"],
  "overrides": {
    "line-2": {
      "canonical_name": "새송이버섯",
      "quantity": 1,
      "unit": "봉",
      "storage_type": "refrigerated",
      "storage_location_id": "storage-location-uuid"
    }
  }
}
```

`raw_name`은 OCR 원문, `canonical_name`은 사용자 확인 후 재고 lot에 기록할 이름입니다. `quantity`는 0보다 커야 하고 `unit`은 비어 있지 않아야 하며, `canonical_name`도 빈 문자열일 수 없습니다. `storage_type`은 `ambient`, `refrigerated`, `frozen` 중 하나이며, 선택적 `storage_location_id`가 있으면 위치의 canonical class와 일치해야 합니다. 입력하지 않으면 기존 호환 기본값인 `refrigerated`를 사용합니다. 이 검증은 영수증 화면의 입력 검증과 별개로 서버에서 다시 수행합니다. 보정값은 상품명·수량·단위·보관 위치의 확인일 뿐이며 소비기한을 확정하지 않습니다.

네트워크 timeout 뒤 같은 commit을 안전하게 재시도하려면 요청에
`Idempotency-Key` 헤더를 붙입니다. 키 원문은 저장하지 않고 SHA-256 digest만
transaction에 보존합니다. 같은 workspace·receipt·키·요청 payload를 다시 보내면
기존 `commit_transaction_id`, `created_lot_ids`, `skipped_line_ids`와 최신 inventory를
반환하며 `idempotency_replayed=true`가 됩니다. 같은 키로 다른 receipt나 다른
line/override payload를 보내면 `409`로 거부합니다. 키 없이 재전송하거나 다른 키를
사용하면 기존 receipt 중복 방지 규칙에 따라 `409`가 됩니다. commit 시도 중 process가
종료되어 `pending` transaction만 남은 경우, 같은 키와 같은 payload의 후속 요청은
그 transaction을 이어 받아 처리할 수 있습니다. 따라서 영수증 검수 화면은 한 번의
반영 시도에 하나의 키를 만들고, transport-level retry에서도 같은 키를 유지해야 합니다.

### ReceiptCommitTransaction

영수증의 review 결과를 확정 재고와 외부 재고 시스템(Grocy 등)에 반영하는 시도입니다.

```json
{
  "id": "commit_uuid",
  "receipt_id": "receipt_uuid",
  "fingerprint": "...",
  "status": "needs_reconciliation",
  "error_code": "grocy_timeout",
  "grocy_sync_status": "needs_mapping",
  "idempotency_key_digest": "sha256...",
  "request_payload_fingerprint": "sha256...",
  "created_lot_ids": [],
  "skipped_line_ids": ["line-3"]
}
```

상태는 다음처럼 이동합니다.

```text
pending
→ committed
pending
→ needs_reconciliation (중간 실패 시, 기존 시도 보존)

needs_reconciliation 기존 시도 보존
→ 새 retry transaction 생성
→ pending
→ committed
```

같은 `pending` transaction이 process 종료 뒤 복구되면 그 record를 이어서
`committed`로 만들 수 있습니다. 반대로 로컬 commit 자체가 실패해
`needs_reconciliation`으로 남은 record는 실패 이력으로 보존하고, 이후 재시도는
새 transaction을 만들어 `pending → committed`로 진행합니다. 로컬 receipt commit은
먼저 확정하고, Grocy 동기화는 `grocy_sync_status`와 별도 outbox로 추적합니다.
`not_configured`는 외부 설정 없음, `needs_mapping`은 canonical 상품·Grocy product
ID·기본 단위 연결이 없거나 맞지 않음, `queued`는 외부 처리 대기, `succeeded`는
transaction ID readback 완료, `dead_letter`는 3회 실패, `needs_reconciliation`은
외부 반영 여부가 불확실해 운영자 판정이 필요한 상태를 뜻합니다. Grocy processor
실패는 lot를 되돌리지 않고 outbox retry/dead-letter로 분리합니다.

`created_lot_ids`와 `skipped_line_ids`는 성공한 commit 결과를 replay하기 위한
transaction-level 결과입니다. `idempotency_key_digest`와
`request_payload_fingerprint`는 재시도 동일성만 확인하는 파생값이며 원본 헤더,
Authorization, 영수증 원본 파일 bytes를 대신하지 않습니다. compatibility JSON
projection과 normalized PostgreSQL projection 모두 이 필드를 보존해야 process
재시작 후에도 같은 요청을 중복 lot 없이 replay할 수 있습니다.

운영 조회 endpoint는 `GET /api/commit-transactions`이며, 자동 retry 대신 현재 transaction 상태와 `error_code`를 반환합니다.

### GrocyProductMapping

사용자 canonical 상품과 Grocy 내부 product ID·기본 단위의 명시적 연결입니다. 서버는 상품명만으로 Grocy ID나 단위를 추론하지 않습니다.

```json
{
  "canonical_name": "곤약",
  "grocy_product_id": 42,
  "grocy_unit": "팩",
  "barcode": null,
  "source": "user_confirmed",
  "updated_by": "account-123",
  "updated_by_email": "owner@example.com",
  "updated_at": "2026-09-02T00:00:00Z"
}
```

`GET /api/integrations/grocy/mappings?q=두부&limit=100`은 현재 workspace에서 상품명을 검색합니다. `updated_by`와 `updated_by_email`은 마지막 매핑 변경 주체이며, guest workspace에서는 email 없이 `guest`로 기록됩니다.

### GrocyProductMappingAuditEvent

상품 매핑 생성·수정의 append-only 감사 record입니다. 매핑 조회 응답의 마지막 수정자만으로는 잘못된 Grocy product ID·단위 연결을 복원하거나 원인을 추적할 수 없으므로, 서버는 변경 시점의 `before`와 새 `after` snapshot을 함께 저장합니다. `before: null`은 최초 연결을 뜻합니다.

```json
{
  "id": "grocy-mapping-audit-...",
  "canonical_name": "닭가슴살",
  "action": "updated",
  "actor_id": "account-123",
  "actor_email": "owner@example.com",
  "occurred_at": "2026-09-02T00:10:00Z",
  "before": {
    "canonical_name": "닭가슴살",
    "grocy_product_id": 88,
    "grocy_unit": "팩",
    "barcode": null,
    "source": "user_confirmed",
    "updated_by": "account-123",
    "updated_by_email": "owner@example.com",
    "updated_at": "2026-09-02T00:00:00Z"
  },
  "after": {
    "canonical_name": "닭가슴살",
    "grocy_product_id": 89,
    "grocy_unit": "팩",
    "barcode": null,
    "source": "user_confirmed",
    "updated_by": "account-123",
    "updated_by_email": "owner@example.com",
    "updated_at": "2026-09-02T00:10:00Z"
  }
}
```

`GET /api/integrations/grocy/mappings/{canonical_name}/events?limit=20`은 현재 인증 workspace의 해당 상품 이력을 최신순으로 반환합니다. 이 endpoint는 조회 전용이며, audit 저장소는 workspace scope를 유지하고 일반 mapping/outbox projection flush와 분리된 insert 경로를 사용합니다.

### GrocyLocationMapping

Rescue Meal의 보관 유형과 Grocy location ID를 사용자가 확인해 연결합니다. 서버는 `냉장`이라는 의미만으로 Grocy의 실제 location ID를 추론하지 않습니다.

```json
{
  "storage_type": "refrigerated",
  "grocy_location_id": 20,
  "source": "user_confirmed",
  "updated_at": "2026-09-02T00:00:00Z"
}
```

### GrocyOutboxRecord

영수증 commit과 보관·소비 event 후 Grocy write를 실행하기 위한 재시도 가능한 workspace record입니다. `operation`은 `receipt_add`, `open`, `consume`, `transfer` 중 하나입니다.

```json
{
  "id": "grocy-outbox-...",
  "operation": "receipt_add",
  "aggregate_id": "lot_uuid",
  "idempotency_key": "receipt:receipt_uuid:lot:lot_uuid",
  "canonical_name": "곤약",
  "grocy_product_id": 42,
  "quantity": 1,
  "unit": "팩",
  "spoiled": false,
  "from_grocy_location_id": null,
  "to_grocy_location_id": 20,
  "status": "pending",
  "attempts": 0,
  "last_error": null,
  "last_dead_letter_error": null,
  "manual_retry_count": 0,
  "last_retry_note": null,
  "last_retry_at": null,
  "in_flight_started_at": null,
  "last_in_flight_started_at": null,
  "reconciliation_count": 0,
  "last_reconciliation_decision": null,
  "last_reconciliation_note": null,
  "last_reconciled_at": null,
  "grocy_transaction_id": null
}
```

`POST /api/integrations/grocy/outbox/process`만 실제 Grocy write를 수행합니다. `consumed`는 `consume`, `discarded`는 `consume(spoiled=true)`, `opened`는 `open`, `moved/frozen/thawed`는 `transfer`로 변환됩니다. 이동은 출발·도착 location mapping이 모두 있어야 pending으로 전환됩니다. processor는 response에서 transaction ID를 읽지 못하면 성공으로 표시하지 않으며, 3회 실패 후 `dead_letter`로 격리합니다. `POST /api/integrations/grocy/outbox/{id}/retry`는 dead-letter 한 건만 새 시도 cycle로 되돌리고, 이전 오류·운영자 메모·수동 재시도 횟수를 보존합니다. `in_flight`는 외부 write가 이미 실행됐을 수 있어 자동 재시도하지 않으며, stale scan 뒤 `reconciliation_required`로 전환해 운영자에게 `already_applied` 또는 `not_applied` 판정을 요구합니다.

### GrocyWorkerHeartbeat

worker가 workspace별 tick 결과를 저장하는 운영 관측 record입니다. Grocy credential이나 원문 응답은 저장하지 않습니다.

```json
{
  "workspace_id": "account_workspace",
  "worker_id": "grocy-worker-a",
  "last_tick_at": "2026-09-02T12:00:00Z",
  "last_success_at": "2026-09-02T12:00:00Z",
  "lease_acquired": true,
  "grocy_configured": true,
  "processed": 4,
  "succeeded": 3,
  "retried": 1,
  "dead_lettered": 0,
  "blocked": 0,
  "last_error": null
}
```

`GET /api/integrations/grocy/worker/status`는 현재 인증 workspace의 heartbeat만 반환합니다. heartbeat가 없다는 것은 worker가 해당 workspace를 아직 처리하지 않았다는 뜻이지, Grocy가 정상이라는 뜻이 아닙니다.

### Notification

현재 workspace 재고에서 계산한 확인 알림입니다. 알림 자체는 영구 문서로 저장하지 않고 매 요청마다 재생성하며, 사용자가 읽었는지 여부만 `notification_id`와 `read_at`으로 저장합니다. 따라서 식품의 날짜·보관 상태가 바뀌면 이전 알림을 그대로 재사용하지 않고 새 안정 ID를 만들 수 있습니다.

```json
{
  "id": "food-date:milk-1:use_by:2026-09-02",
  "kind": "date_due",
  "severity": "urgent",
  "title": "오늘 확인할 날짜예요",
  "message": "저지방 우유의 포장에 표시된 소비기한이 오늘(9월 2일)이에요. 포장 상태와 보관 방법을 확인하세요.",
  "canonical_name": "저지방 우유",
  "food_id": "milk-1",
  "due_date": "2026-09-02",
  "source": "printed_date",
  "action": "food",
  "read_at": null,
  "created_at": "2026-09-02T09:00:00Z"
}
```

`kind`는 `date_due`, `date_check`, `storage_mismatch`, `grocy_sync`, `severity`는 `urgent`, `attention`, `info`입니다. `source=printed_date`·`user_reminder`는 표시 날짜/사용자 알림일을 뜻하고, `source=estimated_window`는 AI 소비 우선순위 범위일 뿐 실제 소비기한이 아닙니다. 날짜가 없으면 `unknown_date` 확인 알림을 만들며, `storage_condition`은 포장지 보관조건과 현재 lot 위치가 다르다는 advisory입니다. lot에 custom `storage_location_id`가 있으면 이 advisory의 실제 위치 문구에는 location name을 사용합니다. 어떤 알림도 섭취 가능·안전 여부를 판정하지 않습니다. `grocy_outbox`의 `blocked`, `dead_letter`, `reconciliation_required`만 `grocy_sync` 알림으로 노출합니다.

지원 API는 `GET /api/notifications?unread_only={bool}&limit={n}`, `GET /api/notifications/revision`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`입니다. 읽음 API는 현재 workspace에서 실제로 계산된 알림 ID만 허용하고, 알 수 없는 ID에는 `404`를 반환합니다.

`GET /api/notifications/revision`은 알림 payload를 반환하지 않고 현재 workspace의 `revision`만
반환합니다. 열린 알림 센터는 목록 read와 함께 이 값을 baseline으로 기억하고, tab 복귀 또는
30초 bounded probe에서 값이 증가하면 최신 목록을 자동으로 다시 읽습니다. 이때 읽음·전체
읽음 mutation이 진행 중이면 probe와 목록 교체를 보류하고, mutation 완료 뒤 queued refresh를
수행해 pending read 결과를 덮어쓰지 않습니다. probe 실패·hidden tab·workspace 전환은 현재
목록을 지우지 않으며, revision은 알림 내용이나 안전 판정의 버전이 아니라 workspace 변경을
감지하기 위한 read marker입니다.

Web Push delivery outbox는 알림·subscription별 deterministic ID로 별도 보존하며,
`status`는 `pending`, `in_flight`, `succeeded`, `dead_letter`, `cancelled` 중 하나입니다.
worker tick 시작 시 현재 `read_at=null`인 알림과 현재 연결된 push device만 active
대상으로 삼고, 기존 pending delivery가 이미 읽혔거나 대상 device가 해지되어 사라졌으면
외부 push를 호출하지 않고 `cancelled`로 남깁니다. `cancelled`는 provider 호출 실패를
의미하는 `dead_letter`와 다르며, worker response/heartbeat의 `cancelled` 카운트로
별도 관측합니다. 이 상태는 원인 확인을 위해 row를 삭제하지 않고 SQLite
재시작·normalized projection에도 보존합니다.

알림 선호 설정은 `GET/PUT /api/notification-preferences`로 관리합니다.
`timezone`은 IANA timezone 이름이며 기본값은 `Asia/Seoul`입니다. 서버는
저장 시각을 UTC로 유지하되, 표시 날짜의 오늘 경계와 `quiet_hours_start`·
`quiet_hours_end` 비교에는 사용자가 저장한 timezone을 적용합니다. 이 값은
식품의 소비기한·안전 판정을 바꾸는 설정이 아니라 알림과 planner의 날짜 기준입니다.

### ReceiptLine

```json
{
  "id": "line_uuid",
  "receipt_id": "receipt_uuid",
  "line_number": 4,
  "raw_text": "서울우유1L 2 5960",
  "raw_name": "서울우유1L",
  "barcode": "08801234567890",
  "quantity": 2,
  "weight": null,
  "unit_price": 2980,
  "total_price": 5960,
  "line_type": "product",
  "matched_product_id": "product_uuid",
  "match_source": "user_confirmed_alias",
  "match_confidence": 0.99,
  "match_candidates": [
    {
      "source": "user_confirmed_alias",
      "canonical_name": "서울우유 나100% 1L",
      "brand": null,
      "category": null,
      "quantity_text": null,
      "confidence": 0.98,
      "provenance_note": "이 workspace에서 사용자가 확인한 영수증 별칭"
    }
  ],
  "review_status": "confirmed",
  "storage_suggestion": "refrigerated"
}
```

`line_type`은 최소 `product`, `discount`, `refund`, `subtotal`, `payment`, `unknown`을 지원합니다. `storage_suggestion`은 상품명 기반의 참고 추천이며 사용자 확인 전의 값입니다. review 화면은 이를 line별로 수정하고, commit의 `overrides.storage_type`으로 확정된 lot에 전달합니다. receipt의 `purchased_at`이 있으면 날짜 없는 lot의 `estimated_use_first_window` 계산 기준일로 사용합니다. 추천·보관 위치는 소비기한 확정과 다른 데이터입니다.

`barcode`는 영수증의 상품명과 금액 사이에서 확인된 정상 GTIN만 보존한 값이며,
일반 숫자행·매장 내부 SKU·가변중량 코드는 `null`로 남깁니다. GTIN은 상품
식별자이므로 개별 포장에 인쇄된 제조일·소비기한·안전 여부를 의미하지 않습니다.
commit 후에는 동일 값이 receipt line과 구매 lot의 `FoodResponse.barcode`에
복사되어 바코드 재조회와 출처 대조에 사용할 수 있지만, 날짜 assertion은
여전히 `unknown` 또는 사용자가 포장지에서 확인한 값으로만 기록합니다.

`match_source`와 `match_candidates`는 `user_confirmed_alias → local_rule → parser` waterfall과 사용자가 선택한 `mfds_i1250`·`open_food_facts` 제품 기준 후보의 근거입니다. 사용자 확인 alias는 workspace별 `raw_name_key`로 저장되고 다음 OCR draft에 재사용되지만, alias나 외부 제품 후보가 날짜·보관 위치를 확정하지는 않습니다. 현재 compatibility API readback은 `GET /api/product-aliases?q={상품명}`으로 제공합니다.

`POST /api/receipts/drafts`는 같은 workspace에서 동일한 receipt fingerprint의
미완료 draft가 이미 있으면 새 draft를 만들지 않고 기존 draft를 반환합니다.
이는 같은 사진의 network retry나 사용자의 중복 탭이 pending review 목록을
늘리지 않도록 하는 draft-level idempotency입니다. 기존 draft를 반환한 응답에는
`X-Idempotency-Replayed: true`가 붙습니다. 이미 commit된 fingerprint는 계속
`409`로 차단합니다. 같은 fingerprint 요청이 서로 다른 PostgreSQL process에
동시에 도착하면 workspace revision이 먼저 승리한 snapshot을 확정하고, 패배한
process는 최신 snapshot에서 기존 draft를 다시 찾아 replay합니다. flush 실패 시
process-local phantom draft를 복원하지 않습니다. 이 기능은 receipt draft를
재사용할 뿐이며, 사용자 review·보관 위치 확인·commit 전에는 StockLot이나
소비기한을 만들지 않습니다.

### ManualFoodRequest와 lot 선택

`POST /api/foods`는 영수증이 없거나 신선식품을 사용자가 직접 등록할 때 사용하는
compatibility intake입니다. `lot_action="create"`는 `canonical_name`이 이미
재고에 있더라도 새로운 inventory lot을 만들며, 같은 상품명을 합쳐 기존 lot의
수량·날짜·보관 상태를 덮어쓰지 않습니다. 새 앱 client는 create/correction 의도를
항상 명시하는 것을 권장합니다. 필드가 없는 legacy 요청은 아래 호환 규칙을 따릅니다.

라벨·GS1 확인 결과를 기존 lot에 반영할 때는 `lot_action="correct"`와
`target_food_id`를 함께 보냅니다. 이
target은 상품명·브랜드·분류·현재 보관 위치·상품 provenance와 날짜 확인을 보정하는
대상이며, 수동 입력 화면의 기본 수량·단위로 기존 lot 수량을 바꾸지 않습니다. target
lot의 구매일·영수증 연결·개봉 상태는 보존됩니다. target의 canonical 상품명이 입력과
다르면 상품 정보 수정 endpoint로 보내며, 임의로 다른 lot을 합치지 않습니다.

기존 label client와의 호환을 위해 `target_food_id`가 없더라도 상품명이 현재
workspace에서 정확히 하나인 경우에는 trusted date(`production_date`,
`packaging_date`, `sell_by`, `use_by`, `best_before`, `user_reminder`) 보정에 한해
그 lot을 재사용합니다. `barcode_lot`과 호환되는 barcode가 정확히 하나의 lot을
식별하는 경우에도 같은 규칙을 적용할 수 있으며, 여러 후보면
`409 food_lot_selection_required`와 대상 `food_ids`를 반환합니다. product provenance
보정은 이름만으로 기존 lot을 합치지 않으며 target을 보내야 합니다. 명시적 target이
없는 새 product 후보는 새 lot에 적용합니다.

이미 trusted date가 있는 lot에 다른 날짜를 보내면 `409 food_date_already_confirmed`로
거부합니다. 날짜 값·종류가 같고 legacy lot에 사용자 확인 flag가 없던 경우에는 확인
metadata만 승격하며 이력을 중복 생성하지 않습니다. `unknown`/`estimated_use_first`
에서 처음 확인된 날짜로 승격할 때는 기존 assertion을 `date_assertion_history`에
append합니다. 상품명·보관 위치로 계산되는 `estimated_use_first_window`는 target lot의
구매일·최초 개봉일을 기준으로 다시 계산되는 review-only 참고값이며 소비기한·안전
판정이 아닙니다.

수동 lot 생성·target 보정은 한 identity 안에서 process-local lock과 workspace
revision/flush를 함께 사용합니다. persistence 실패 시 foods와 관련 audit event를
원래 snapshot으로 복원하고, PostgreSQL revision 충돌에서는 stale snapshot을 복원하지
않고 최신 workspace를 다시 읽어 `workspace_revision_conflict`로 반환합니다.

### 수동 식품 command 멱등성

네트워크 timeout 뒤 직접 입력·라벨 보정 요청을 재시도할 때는 같은
`Idempotency-Key`를 유지합니다. API는 원본 key를 저장하지 않고
`SHA-256(idempotency_key)`와 검증된 request payload fingerprint만
`ManualFoodOperationRecord`로 저장합니다. 같은 workspace·key·payload를 다시 보내면
기존 `FoodResponse`를 `201`로 replay하고 `X-Idempotency-Replayed: true`를 붙입니다.
같은 key에 다른 payload를 보내면 `409 manual_food_idempotency_conflict`로 거부합니다.

operation의 lot이 이후 소비·폐기되어 현재 inventory에서 사라진 경우에도 같은 key의
재시도는 `409 manual_food_operation_lot_missing`으로 중단하며 새 lot을 만들지
않습니다. 이 ledger는 SQLite와 PostgreSQL compatibility projection, workspace
export·guest transfer에 보존되어 API process 재시작이나 guest-to-account 이동 뒤에도
동일 command의 중복 생성을 막습니다. Idempotency-Key가 없는 legacy 요청은 이
command-level replay 보장을 받지 않으므로 모바일 client는 입력 한 번마다 key를
생성하고 transport retry 동안 재사용해야 합니다.

### WorkspaceMutation persistence recovery

snapshot에 포함된 app-owned workspace mutation은 `WorkspaceMutation.run()` seam을
사용할 수 있습니다. 이 Module은 mutation 전 snapshot을 만들고 durable `flush()`를
실행합니다. 일반 persistence 예외에서는 process-local snapshot을 복원하며,
PostgreSQL `workspace_revision_conflict`는 이미 reload된 승자 snapshot을 잃지 않도록
stale snapshot을 복원하지 않습니다.

`WorkspaceMutation.run()`은 active store의 `mutation_lock()`을 통해 snapshot 생성부터
mutation·flush·실패 시 restore까지 하나의 process-local `RLock` 안에서 실행합니다.
따라서 같은 적용 caller의 refresh/interleaving을 줄이지만, 직접 mutation route나
worker의 외부 provider transaction까지 전체 workspace atomicity를 의미하지 않습니다.

현재 적용 endpoint와 typed error는 다음과 같습니다.

```text
PATCH  /api/foods/{food_id}/date-assertion
       food_date_persistence_unavailable
POST   /api/foods
       manual_food_persistence_unavailable
POST   /api/receipts/drafts
       receipt_draft_persistence_unavailable
POST   /api/receipts/{receipt_id}/commit
       receipt_commit_persistence_unavailable
       receipt_commit_reconciliation_unavailable
POST   /api/meal-plans/{plan_id}/complete
       meal_plan_completion_persistence_unavailable
POST   /api/meal-plans
       meal_plan_persistence_unavailable
POST   /api/meal-plans/multi-day
       multi_day_plan_persistence_unavailable
POST   /api/account/delete
       account_deletion_persistence_unavailable
DELETE /api/foods/{food_id}/product-provenance
       product_provenance_persistence_unavailable
PATCH  /api/shopping-list/{item_id}
       shopping_list_item_persistence_unavailable
DELETE /api/shopping-list/{item_id}
       shopping_list_item_persistence_unavailable
PUT    /api/meal-preferences
       meal_preferences_persistence_unavailable
PUT    /api/notification-preferences
       notification_preferences_persistence_unavailable
PUT    /api/push/subscriptions
       push_subscription_persistence_unavailable
DELETE /api/push/subscriptions/{endpoint_fingerprint}
       push_subscription_persistence_unavailable
POST   /api/notifications/{notification_id}/read
       notification_read_persistence_unavailable
POST   /api/notifications/read-all
       notification_read_persistence_unavailable
PUT    /api/integrations/grocy/mappings/{canonical_name}
       grocy_mapping_persistence_unavailable
PUT    /api/integrations/grocy/location-mappings/{storage_type}
       grocy_location_mapping_persistence_unavailable
POST   /api/integrations/grocy/outbox/{outbox_id}/reconcile
       grocy_outbox_persistence_unavailable
POST   /api/integrations/grocy/outbox/{outbox_id}/retry
       grocy_outbox_persistence_unavailable
```

`POST /api/foods/{food_id}/storage-events`도 active workspace `mutation_lock()` 안에서
Idempotency-Key lookup·lot validation·`InventoryRepository` mutation을 수행하고,
`WorkspaceMutation.run()`이 outbox append·reprioritize·flush와 regular failure restore를
소유합니다. 동일 key의 동시 요청은 한 append와 한 inventory mutation으로 수렴하며
다른 요청은 `X-Idempotency-Replayed: true`를 받습니다. PostgreSQL revision conflict는
기존 winner snapshot을 보존하고, 외부 Grocy 호출 중간 상태는 이 local mutation 계약에
포함하지 않습니다.

storage event mutation의 regular persistence failure는 `storage_event_persistence_unavailable`
typed `503`, `retryable: true`, `action: retry_later`로 반환합니다. `WorkspaceMutation`이
이미 복원한 snapshot을 예외 처리부에서 다시 `flush()`하지 않으므로, inventory lot·부분
split·opened 상태·storage event·Grocy outbox가 실패 전 상태로 함께 유지됩니다.
frontend는 dashboard를 다시 읽어 optimistic state를 정리한 뒤, sheet가 닫힌 상태의 global
toast에서 같은 Idempotency-Key로 재시도합니다. move 후 open처럼 연속 event 중 뒤의 요청만
실패한 경우 앞선 event는 replay되고 실패한 event만 다시 수행됩니다.

`POST /api/meal-plans`의 단일 plan 저장은 기존 plan별 lock 안에서
`WorkspaceMutation.run()`을 사용합니다. helper는 현재 inventory와 선택 recipe/bundle
identity를 검증하고 saved plan·`saved` audit event를 memory에 staging하며, outer Module이
flush와 regular failure rollback을 소유합니다. `plan_id`가 같은 동일 snapshot 재시도는
기존 plan과 audit 1건을 replay하고, 다른 snapshot/recipe는 기존 `409` semantics를
유지합니다. multi-day bundle 저장과 completion 소비 event는 별도 transaction contract입니다.

단일 plan 저장의 outer flush에서 regular persistence failure가 발생하면 plan·saved audit와
workspace snapshot을 실패 전 상태로 복원하고 `meal_plan_persistence_unavailable` typed `503`,
`retryable: true`, `action: retry_later`를 반환합니다. `MealPlanSheet`는 실패 당시
`inventory_ids`, `plan_id`, `snapshot_hash`, recipe identity와 servings payload를 유지해 이 code에만
inline `다시 시도`를 제공하며, snapshot/recipe conflict와 validation에는 저장 blind retry를
노출하지 않습니다. multi-day bundle save는 별도 route와 contract를 유지합니다.

`POST /api/meal-plans/{plan_id}/complete`의 single-plan completion도 plan별 lock 안에서
`WorkspaceMutation.run()`을 사용합니다. allocation 검증 후 consumed storage event,
Grocy outbox, plan 완료 상태, linked bundle day progress와 completed audit를 staging하고,
`reprioritize(persist=False)`로 중간 persistence를 막은 뒤 outer flush에서 한 번 확정합니다.
flush failure나 regular failure에서는 plan·inventory·consumed event를 함께 복원하며,
`already_completed`와 PostgreSQL revision winner semantics는 유지합니다. outer flush의 regular
persistence failure는 `meal_plan_completion_persistence_unavailable` typed `503`,
`retryable: true`, `action: retry_later`를 반환하며 exception detail·allocation payload를
response에 노출하지 않습니다. `MealPlanSheet`는 실패 당시 plan과 consumption draft를 유지하고
이 code에만 inline `다시 시도`를 노출해 같은 payload를 다시 보냅니다. workspace revision conflict,
allocation/unit validation과 기타 domain error에는 completion blind retry를 제공하지 않습니다.
multi-day bundle save와 외부 provider transaction은 이 contract에 포함하지 않습니다.

`POST /api/meal-plans/multi-day`의 bundle save는 `bundle_id`별 lock 안에서
`WorkspaceMutation.run()`을 사용합니다. preview를 다시 materialize한 뒤 top-level
`snapshot_hash`, servings, day plan identity를 검증하고 bundle/day state를 staging하며,
outer flush 실패 시 bundle state를 복원합니다. 동일 bundle과 snapshot의 재시도는 기존
bundle/history를 replay하고 다른 snapshot은 `409`로 거절합니다. preview 자체는 계속
side-effect-free입니다. 저장한 날짜의 completion은 별도 bundle endpoint를 만들지 않고
`POST /api/meal-plans`로 연결한 single plan의
`POST /api/meal-plans/{plan_id}/complete`를 사용합니다. 이 route의 snapshot과 outer
flush에는 linked bundle day progress가 포함되므로 final flush failure 때 plan·inventory·
consumed event와 함께 day를 `saved`로 복원하고, retry 때 `completed`로 진행합니다. 외부
Grocy provider transaction은 이 local contract에 포함하지 않습니다.

multi-day bundle의 outer flush regular persistence failure는 bundle/day/history snapshot을
실패 전 상태로 복원하고 `multi_day_plan_persistence_unavailable` typed `503`,
`retryable: true`, `action: retry_later`를 반환합니다. `MealPlanSheet`는 실패 당시
`inventory_ids`, `bundle_id`, `snapshot_hash`, `max_minutes`, `servings`를 유지해 이 code에만
3일 식단 영역의 inline `다시 시도`를 제공하며, snapshot conflict와 validation에는 blind retry를
노출하지 않습니다.

`POST /api/receipts/{receipt_id}/commit`은 pending transaction phase와 finalization
phase를 분리합니다. pending `CommitTransactionRecord`는 crash/retry identity를 위해
먼저 durable flush하며, finalization은 receipt lock과 active workspace lock 안에서
`WorkspaceMutation.run()`으로 receipt state·lot·Grocy outbox·alias/audit를 staging한 뒤
한 번의 outer flush로 확정합니다. `upsert_from_receipt(persist=False)`와
`reprioritize(persist=False)`로 중간 partial persistence를 막습니다. finalization failure는
lot/receipt business state를 rollback하고 transaction만 `needs_reconciliation`으로
남기며, 후속 retry가 같은 pending transaction을 사용합니다. marker flush가 성공한 일반
finalization failure는 transaction ID·예외 원문 없이 `receipt_commit_persistence_unavailable`
typed `503`(`retryable: true`, `action: retry_later`)로 반환하고, marker flush 자체가 실패하면
`receipt_commit_reconciliation_unavailable`로 구분합니다. 외부 Grocy provider 호출 중간
상태는 이 local transaction contract에 포함하지 않습니다.

commit 시작 단계의 pending transaction flush가 실패하면 transaction memory record를 제거하고
`receipt_commit_persistence_unavailable` typed `503`을 반환하므로 phantom commit identity를
남기지 않습니다. finalization rollback 뒤 `needs_reconciliation` marker를 기록하는 flush가
다시 실패해도, finalization 전에 이미 저장한 pending transaction을 memory에서 `pending`으로
유지하고 `receipt_commit_reconciliation_unavailable` typed `503`을 반환합니다. client는
처음부터 하나의 `Idempotency-Key`를 생성해 draft fingerprint와 resolved receipt ID를
재사용하므로, 이후 retry가 같은 pending transaction을 이어받고 새 lot·transaction을
중복 생성하지 않습니다. 인증 만료·workspace conflict·일반 receipt duplicate `409`에는
blind retry를 제공하지 않습니다.

typed detail은 `code`, 사용자용 `detail`, `retryable`, `action`을 포함합니다. 프론트는
날짜·수동 식품처럼 sheet가 닫힌 mutation은 global retry action을 사용하고, 열린
shopping sheet의 check/delete는 overlay에 가려지지 않도록 해당 alert 내부의 retry
button을 사용합니다. 알림 센터의 읽음 저장 실패도 기존 미읽음 상태를 유지한 채
alert 안에서 재시도하며, 알림 설정 화면은 설정 저장·push 연결·push 해지 실패의
종류를 구분해 기존 설정/연결을 유지한다는 안내와 retry action을 보여줍니다.

`POST /api/foods`의 manual create/correction은 `manual_food_lock`과 active
`mutation_lock()` 안에서 idempotency replay/lot selection을 확인하고,
`WorkspaceMutation.run()`으로 lot·priority·audit·manual operation ledger를 하나의
outer flush에 staging합니다. `reprioritize(persist=False)`로 중간 persistence를 막으며,
regular failure는 `manual_food_persistence_unavailable` typed `503`으로 기존 상태를
유지합니다. 동일 key의 replay는 inference를 다시 실행하지 않고, PostgreSQL revision
conflict에서는 stale snapshot을 복원하지 않은 winner/replay 경로를 사용합니다.

`POST /api/receipts/drafts`는 receipt fingerprint lock과 active `mutation_lock()` 안에서
committed conflict와 pending draft replay를 먼저 확인합니다. 새 draft projection은
`WorkspaceMutation.run()`으로 staging한 뒤 outer flush하며, regular persistence failure는
`receipt_draft_persistence_unavailable` typed `503`과 기존 receipt state 보존으로 반환합니다.
PostgreSQL concurrency conflict에서는 winner draft를 다시 읽어 `X-Idempotency-Replayed`
를 유지합니다. receipt draft는 review state만 만들고 StockLot은 commit 전까지 생성하지
않습니다.

`POST /api/receipts/{receipt_id}/privacy-erase`도 active workspace의
`WorkspaceMutation.run()`을 사용합니다. 저장소 메서드는 `persist=False`로 receipt 삭제 또는
`source_filename`·line `raw_name` 비식별화만 staging하고, outer `flush()`가 한 번 확정합니다.
일반 persistence failure에서는 draft 삭제/redaction을 snapshot으로 복원하고
`receipt_privacy_persistence_unavailable` typed `503`을 반환합니다. PostgreSQL revision
conflict에서는 stale snapshot을 복원하지 않고 winner read model을 보존합니다. `confirm: true`가
없으면 기존 `422` validation을 유지합니다. receipt가 committed이거나 어떤
`CommitTransactionRecord`가 참조하면 row와 inventory provenance를 삭제하지 않고 각각
`redacted_committed` 또는 `redacted_pending`으로 응답합니다.

Account의 `영수증 원본 관리`는 이 typed error를 기존 receipt 상태 유지 안내로 표시하고,
열린 sheet overlay를 통과하는 inline `다시 시도` action으로 같은 receipt 작업을 재실행합니다.
workspace conflict는 최신 receipt summary를 다시 읽는 action으로 분리합니다.

### Shopping list source mutation recovery

`POST /api/shopping-list`의 meal-plan/multi-day source 동기화와
`POST /api/shopping-list/manual`의 직접 추가는 `WorkspaceMutation.run()`을 사용합니다.
계획 source 계산과 manual source merge는 `persist=False`로 memory에 staging하고 하나의
outer `flush()`에서 확정합니다. 일반 persistence failure에서는 기존 shopping list snapshot을
복원하고 `shopping_list_persistence_unavailable` typed `503`, `retryable: true`,
`action: retry_later`를 반환합니다. 기존 source merge, manual source와 planned source의
quantity 합산, quantity 변경 시 checked 해제, 공백 정규화와 `422` validation은 유지합니다.

MealPlanSheet와 홈 ShoppingListSheet는 열린 sheet의 alert 안에서 같은 source/manual payload를
재시도합니다. workspace revision conflict는 stale 목록을 덮지 않고 최신 목록 확인으로
분리합니다. `GET /api/shopping-list`의 자동 reconciliation과 `POST /api/shopping-list/{id}/receive`
의 inventory lot·operation ledger transaction은 이 source-write recovery와 별도입니다.

`GET /api/shopping-list`는 read-time derived reconciliation을 수행하므로 예외적으로
`WorkspaceMutation.run()`을 사용합니다. 모든 meal-plan/multi-day source의 제거·갱신은
`persist=False`로 staging한 뒤 한 번의 outer `flush()`에서 확정합니다. 중간 flush가 실패하면
이전 shopping list snapshot을 복원하고 `shopping_list_persistence_unavailable` typed `503`과
`retry_later`를 반환하므로 일부 source만 사라진 목록을 성공 응답으로 노출하지 않습니다.
이 GET은 read-only client transport에서 mutation broadcast를 발생시키지 않으며, receive의
inventory lot transaction과 외부 provider 상태는 이 read recovery contract에 포함하지 않습니다.

### Product-enrichment queue persistence recovery

`POST /api/receipts/{receipt_id}/product-enrichment`와
`POST /api/receipts/{receipt_id}/product-enrichment/retry`는 receipt review를 보조하는
workspace job mutation입니다. `product_enrichment_jobs` map은 `WorkspaceMutation` snapshot에
포함되고, enqueue/dead-letter retry는 memory staging 뒤 하나의 outer `flush()`에서 확정합니다.
동일 receipt의 deterministic job ID가 이미 있으면 기존 job을 반환하며, 일반 persistence
failure는 `product_enrichment_persistence_unavailable` typed `503`, `retryable: true`,
`action: retry_later`로 반환합니다. concurrency conflict에서는 stale job snapshot을
복원하지 않고 winner job을 사용합니다.

AddFoodSheet는 이 typed failure에서 검수 draft와 기존 job state를 유지하고 inline
`다시 시도`로 enqueue를 다시 호출합니다. queued/in-flight polling, succeeded candidate
merge와 dead-letter retry는 유지하지만, worker의 외부 제품 조회·provider cache/rate limit·
lease/heartbeat transaction은 이 API job persistence contract에 포함하지 않습니다.

### Planner client transport

`MealPlanSheet`의 preview, latest plan, meal preferences, alternatives, multi-day history,
audit와 nested shopping read는 `WorkspaceSyncCoordinator`의 `meal-plan` 또는
`shopping-list` channel을 통해 실행별 `AbortSignal`을 전달합니다. workspace 전환·동일
channel 경쟁·명시적 invalidate 뒤 `current=false`인 결과는 화면 state에 반영하지 않습니다.

HTTP method만으로 mutation을 판정하지 않습니다. planner preview/options/multi-day-preview,
barcode parse, label parse/intake, inference와 guest-transfer preview처럼 POST이지만
workspace state를 바꾸지 않는 요청은 `WorkspaceSyncTransport` invalidation을 발행하지
않습니다. 반대로 meal-plan save/complete와 meal-preference 변경은 `meal-plan` channel을
포함해 같은 workspace의 열린 planner가 다시 읽도록 합니다. 메시지는 raw token 대신
opaque workspace key·허용 channel·source/id만 전달하며, same-origin cross-tab delivery는
best-effort advisory입니다.

이 snapshot은 `commit_transactions`, `meal_preferences`, `notification_preferences`,
`push_subscriptions`, `notification_read_at`을 포함합니다. `persist=False` mutation
경로는 저장소 메서드의 직접 commit을 보류하고 하나의 outer `flush()`에 위임합니다.
SQLite와 PostgreSQL `_persist_all()`은 이 네 상태를 같은 transaction으로 지우고 다시
쓰며, process 재구성 뒤에도 복원합니다. 반면 notification delivery·worker
lease/heartbeat·recipe review와 Grocy worker lease/heartbeat는 여전히 이 snapshot
범위 밖입니다. Grocy product/location mapping·mapping audit·outbox reconciliation/
manual retry는 snapshot 안에서 사용자 mutation으로 복구하지만, worker가 외부 Grocy
호출을 수행하는 중간 상태와 provider transaction을 이 계약으로 atomic하다고
해석하지 않습니다.

Recipe review는 사용자 workspace가 아니라 shared recipe catalog projection을
소유하므로 `WorkspaceMutation`과 별도의 `RecipeCatalogMutation`을 사용합니다.
recipe draft와 review audit event는 catalog snapshot에 함께 포함되고, import·검토
수정·승인·반려의 catalog flush가 실패하면 이전 draft status와 audit list를 복원합니다.
이 경계는 planner 노출 승인만 다루며, 외부 COOKRCP fetch와 source/license 판단을
자동 승인하거나 workspace inventory mutation과 같은 transaction으로 합치지 않습니다.
shared catalog는 user workspace revision과 별도로 `rescue_recipe_catalog_revisions`
의 단일 `catalog` row를 사용합니다. review draft GET 응답은
`X-Rescue-Meal-Recipe-Catalog-Revision`을 반환하고, frontend는 다음 mutation에
`If-Rescue-Meal-Recipe-Catalog-Revision`을 전달합니다. stale revision은
`recipe_catalog_revision_conflict` 409와 `reload_and_retry` action으로 중단하며,
현재 revision을 response header/body로 알려 최신 draft를 다시 읽게 합니다. 이
header는 workspace revision과 섞이지 않습니다.

### Recipe review ownership contract

`RecipeDraftRecord`의 ownership field는 shared catalog payload에 nullable로 저장됩니다.

```json
{
  "claimed_by": "account-id-or-legacy-review-token",
  "claimed_by_email": "admin@example.com",
  "claimed_at": "2026-09-08T10:00:00Z",
  "claim_expires_at": "2026-09-08T11:00:00Z"
}
```

`POST /api/recipe-review/drafts/{draft_id}/claim`은 pending draft에 대해서만 현재
`recipe_admin` actor를 지정합니다. active claim이 다른 actor에게 있으면
`recipe_review_claim_conflict` 409와 안전한 owner email만 반환하며, claim을 획득하지
않은 actor의 PATCH/approve/reject는 `recipe_review_claim_required` 또는
`recipe_review_claim_expired` 409로 중단합니다. claim TTL은
`RESCUE_MEAL_RECIPE_REVIEW_CLAIM_TTL_SECONDS`(기본 3600초, 서버에서 300~86400초로
bounded)이며, 만료된 claim은 다음 명시적 claim이 회수합니다. 현재 담당자는
`release`로 해제할 수 있고, approve/reject 성공 시 active claim은 함께 제거됩니다.
claim/release/expired recovery는 `claimed`·`released` audit action으로 보존되며,
legacy token을 사용하는 모든 관리자는 하나의 actor로 보이므로 실제 다중 관리자
운영에는 개별 account token이 필요합니다. 이 ownership payload는 기존 JSON row에
default로 읽히므로 별도 destructive migration을 요구하지 않습니다.

review queue는 `GET /api/recipe-review/drafts`의 `assignment` query로 담당 상태를
좁힐 수 있습니다. `all`은 전체 pending draft, `mine`은 현재 actor의 active claim,
`unassigned`는 active claim이 없는 draft를 반환합니다. claim이 만료된 draft도
`unassigned`에 포함하여 회수 경로를 잃지 않게 합니다. actor는 인증 context에서만
결정하며 query string으로 임의 actor를 지정할 수 없습니다.

`GET /api/recipe-review/revision`은 draft payload 없이 현재 shared catalog revision과
동일한 `X-Rescue-Meal-Recipe-Catalog-Revision` header를 반환하는 저비용 probe입니다.
review panel은 tab visibility 복귀와 30초 bounded interval에서 이 probe를 실행하고,
revision이 달라진 경우에만 현재 assignment filter를 다시 읽습니다. probe 실패는 이미
불러온 queue를 지우지 않으며 다음 visibility/interval에서 재시도합니다. 이 polling은
BroadcastChannel/localStorage를 사용하지 않는 다른 기기·API process 변경을 발견하기
위한 보완 경로이고, claim/revision/publisher API의 write authority를 대신하지 않습니다.

### Shared recipe review invalidation

recipe review mutation이 성공하면 frontend transport는 사용자 workspace key가 아닌
opaque `recipe-catalog` key와 `recipe-review` channel로 cross-tab invalidation을 발행합니다.
이 메시지에는 token·account email·draft payload가 포함되지 않습니다. 열린
`RecipeReviewPanel`은 현재 `assignment` filter를 다시 읽되, 작업 중인 editor를 자동으로
새 payload로 교체하지 않습니다. 선택된 draft 자체가 바뀌거나 사라지면 editor를 stale로
잠그고 “최신 상태 확인” 안내와 명시적 reload action을 보여줍니다. 실제 저장 가능 여부는
`If-Rescue-Meal-Recipe-Catalog-Revision`, claim ownership, publisher capability API가
결정하며 BroadcastChannel/localStorage notification 자체는 best-effort advisory입니다.

### ImageQualityReport

이미지 intake는 원본 bytes의 `file_sha256`과 OCR 처리용 이미지를 분리합니다.

```json
{
  "status": "review_required",
  "width": 800,
  "height": 400,
  "format": "JPEG",
  "brightness": 210.4,
  "contrast": 38.1,
  "edge_energy": 8.7,
  "blur_score": 4.2,
  "orientation_corrected": true,
  "warnings": []
}
```

`orientation_corrected=true`는 스마트폰 EXIF 방향을 OCR 전에 표준 방향으로
보정했다는 처리 provenance입니다. 원본 SHA-256은 그대로 유지하고, 품질 측정과
OCR worker 입력에만 보정 bytes를 사용합니다. 이 값은 OCR 정확도·표시 날짜 의미·
식품 안전을 보증하지 않으며, 품질 warning이 있어도 review/사용자 확인 gate를
우회하지 않습니다.

### OcrReviewObservation

이미지 receipt intake가 성공하면 review 화면용으로 상품 line에 연결된 OCR
관찰 위치만 반환할 수 있습니다. 개인정보가 섞일 수 있는 OCR 원문 `text`는 이
응답에 포함하지 않습니다.

```json
{
  "id": "obs-1",
  "bbox": [0.05, 0.80, 0.30, 0.03],
  "confidence": 0.96
}
```

- `bbox`는 `[x, y, width, height]`의 0~1 정규화 값입니다.
- 원점은 좌측 하단이며, 프론트는 실제 이미지의 aspect ratio 안에서만 overlay를 그립니다.
- `OcrIntakeResponse.review_observations`는 상품 line에 연결된 위치만 포함합니다.
- `ReceiptLineDraft.source_observation_ids`가 해당 line과 관찰 위치를 연결합니다.
- `review_observations`는 원본 이미지 blob을 저장하거나 다시 조회하는 계약이 아니며, 원본 bytes 보존 정책은 별도의 receipt privacy 계약을 따릅니다.
- normalized PostgreSQL inventory mode에서는 migration `010_receipt_review_locations.sql`의 `source_observation_ids` JSONB 컬럼으로 line 연결만 보존하며, OCR text·bbox 원문·업로드 bytes를 저장하지 않습니다.

### LabelDateCandidate source link

이미지 라벨 intake의 날짜 후보는 날짜 의미와 원본 이미지 위치를 별도로
검토합니다. `LabelDateCandidateResponse.source_observation_ids`는 후보를 구성한
OCR observation의 safe ID만 연결하고, `LabelParseResponse.review_observations`는
해당 ID의 bbox·confidence만 제공합니다.

```json
{
  "kind": "packaging_date",
  "value": "2017-06-28",
  "requires_review": true,
  "source_observation_ids": ["obs-11"]
}
```

- `review_observations`에는 OCR `text`를 포함하지 않습니다.
- 날짜가 한 observation 안에서 안전하게 매칭되거나 인접한 연·월·일 observation으로 보수적으로 구성될 때만 source ID를 연결합니다.
- 의미가 `packaging_date` 또는 `production_date`로 분류된 날짜는 `consumption_date_candidate`로 승격하지 않습니다.
- 위치 매칭에 실패해도 날짜 후보 자체를 폐기하지 않으며, source ID를 빈 배열로 반환해 사용자가 라벨 원본을 직접 확인하게 합니다.
- 라벨 원본 preview는 브라우저의 transient `blob:` URL만 사용하고 서버가 원본 bytes를 저장하거나 source ID만으로 이미지를 재구성하지 않습니다.

### 영수증 원본 개인정보 경계

현재 API는 업로드 bytes를 OCR 처리 중 메모리에서만 사용하고 파일 blob을 저장하지 않습니다. 대신 `source_filename`과 `raw_name` 같은 receipt metadata가 workspace 저장소에 남을 수 있으므로 다음 명시적 계약을 제공합니다.

- `GET /api/privacy/receipt-policy`는 원본 bytes의 보존 기간이 `0일(transient)`이고, draft metadata가 사용자 삭제 대상임을 반환합니다.
- `GET /api/receipts`는 파일명·OCR 원문을 반환하지 않고 receipt 상태·구매일·line 수·비식별화 여부만 반환합니다.
- `POST /api/receipts/{receipt_id}/privacy-erase`의 `confirm: true`는 미반영 draft라면 receipt metadata를 삭제합니다.
- 프론트 receipt review는 업로드 직후 브라우저 `File`을 `blob:` 임시 URL로 원본 대조에 보여줄 수 있지만, 이는 서버의 원본 blob을 저장·조회하는 계약이 아닙니다. mode 전환·재선택·unmount에서 URL을 폐기하며, UI는 원본 bytes를 재고 lot에 복사하지 않습니다.
- 이미 commit된 receipt는 lot의 `source_receipt_id`·`source_receipt_line_id`, 수량·구매일·commit transaction·중복 방지 fingerprint를 보존하고, `source_filename`과 line의 `raw_name`만 비식별화합니다. 그래야 재고 수량·거래 감사·재처리 방지의 정합성을 잃지 않습니다.
- commit 실패로 `needs_reconciliation` transaction이 남은 draft는 receipt row를 삭제하지 않고 source metadata만 비식별화합니다. reconciliation/audit 참조를 끊지 않기 위한 경계입니다.
- privacy erase의 local flush가 실패하면 `receipt_privacy_persistence_unavailable`과 기존 receipt 상태를 반환하며, 프론트는 열린 계정 sheet 안에서 해당 대상의 삭제/redaction을 재시도합니다. 이 recovery는 local projection까지만 다루고 backup/WAL/object storage/Grocy 외부 보존을 삭제했다는 뜻이 아닙니다.
- 이 기능은 법정 보존기간 판단이나 backup/WAL/object storage/Grocy의 외부 보존 데이터를 자동으로 지우지 않습니다. account 전체 삭제는 `POST /api/account/delete`에서 현재 비밀번호와 `confirmation=DELETE`를 다시 확인한 뒤 workspace purge와 credential 삭제를 수행하며, 운영에서는 저장소 백업·로그·법무 정책까지 별도 삭제/보존 작업이 필요합니다.
- `POST /api/account/delete`의 workspace purge 또는 credential 단계에서 regular persistence failure가 발생하면 account의 durable `deleting` fence는 유지하고 `account_deletion_persistence_unavailable` typed `503`, `retryable: true`, `action: retry_later`를 반환합니다. response에는 password·token·email·예외 원문을 넣지 않으며, `AccountSheet`는 이 code에만 inline `다시 시도`를 표시합니다. `401`·`422`·`429` 및 typed code가 없는 503에는 삭제 retry action을 추가하지 않습니다.

### StockLot

같은 상품이라도 구매시점·표시 날짜·보관 상태가 다르면 별도 lot입니다. 현재 compatibility `FoodResponse`에도 `source_receipt_id`, 전역 식별 가능한 `source_receipt_line_id`, `purchased_at`을 남겨 어느 영수증에서 생성됐는지 재시작 뒤에도 추적합니다. 개봉이 기록되면 최초 `opened` event의 `occurred_at`을 `opened_at`으로 저장하며, canonical 상품명은 구매 lot의 identity key가 아닙니다.

```json
{
  "id": "lot_uuid",
  "product_id": "product_uuid",
  "parent_lot_id": null,
  "source_receipt_line_id": "line_uuid",
  "barcode": "(01)08801114167523(17)260902(10)LOT-7",
  "barcode_lot": "LOT-7",
  "quantity": 2,
  "unit": "pack",
  "purchased_at": "2026-09-01T13:20:00+09:00",
  "opened_at": null,
  "current_storage_location_id": "storage-location-uuid",
  "current_state": "unopened",
  "grocy_stock_id": "grocy-id",
  "version": 1
}
```

호환 모델의 `storage_type`은 canonical 보관 분류이고, API 응답의 선택적
`storage_location_id`가 사용자 정의 위치를 가리킵니다. UI는 응답의
`storage_locations` 목록으로 ID를 이름에 매핑하며, 이름을 lot payload에 복제해
저장하지 않습니다.

### ProductProvenance

바코드 또는 상품명 기반 후보를 사용자가 확인해 식품 lot에 적용했을 때, 어떤 상품 데이터 source가
상품명·브랜드·분류·보관 힌트를 제공했는지 보존합니다. 이 값은 상품 수준의 후보 provenance이며,
개별 포장에 인쇄된 소비기한·유통기한을 의미하지 않습니다.

```json
{
  "source": "open_food_facts",
  "source_url": "https://world.openfoodfacts.org/product/8801045426204",
  "confidence": 0.62,
  "note": "Open Food Facts 사용자 기여 데이터 후보; 실제 라벨 확인 필요",
  "storage_hint": null,
  "source_freshness": "current"
}
```

`source`는 현재 `local_fixture`, `open_food_facts`, `mfds_c005`, `mfds_i1250`,
`user_confirmed_alias`, `local_rule`, `parser` 중 하나입니다.
`source_url`은 제공되는 경우 원본 상품 정보 페이지이며, `confidence`는 resolver가 계산한 후보
일치도입니다. 바코드·제품 기준 provider 후보는 원본 URL을 제공할 수 있고, receipt match 후보는
영수증 draft에 남은 후보를 materialize하므로 URL이 없을 수 있습니다. `storage_hint`는 상품 기준 참고값이라 사용자가 실제 보관 위치를 선택한
`storage_type`과 다를 수 있습니다. `source_freshness`가 `legacy`이면 과거 기준 데이터임을
표시하고, 어떤 freshness든 포장지 확인 gate를 우회하지 않습니다.

`product_provenance`는 `DateAssertion`과 별도로 저장합니다. 따라서 바코드가 상품을 식별해도
개별 lot의 날짜는 `unknown`으로 남을 수 있으며, 날짜가 없는 신선식품에 상품명만으로 법정
소비기한을 생성하지 않습니다. 사용자가 후보 상품명을 직접 수정하면 해당 provenance를
폐기하고 직접 입력 상태로 전환해야 합니다.

### ProductProvenanceAuditEvent

상품 provenance의 현재 snapshot만으로는 후보가 교체되거나 사용자가 상품명을 수정한 원인을
복원할 수 없으므로, 변경마다 workspace-scoped append-only before/after event를 저장합니다.

```json
{
  "id": "product-provenance-event-uuid",
  "food_id": "lot_uuid",
  "action": "replaced",
  "actor_id": "guest",
  "actor_role": "guest",
  "occurred_at": "2026-09-04T09:00:00Z",
  "before": { "source": "open_food_facts", "confidence": 0.62 },
  "after": { "source": "mfds_c005", "confidence": 0.8 },
  "reason": "상품 후보를 확인해 식품 정보를 갱신했습니다."
}
```

`action`은 `applied`, `replaced`, `removed` 중 하나입니다. 일반 flush는 기존 event를
삭제하거나 갱신하지 않으며, 명시적인 workspace reset/purge만 해당 workspace 이력을
삭제합니다. `GET /api/foods/{food_id}/product-provenance/events`는 최신순 bounded history를
반환하고, `GET /api/account/export`와 guest-to-account transfer에는 전체 provenance audit가
포함됩니다. actor email·provider API key·영수증 OCR 원문은 이 event에 저장하지 않습니다.
`DELETE /api/foods/{food_id}/product-provenance`는 현재 provenance snapshot만 제거하고,
제거 전 snapshot을 `removed` audit event의 `before`로 남깁니다. 상품명·lot·DateAssertion은
이 요청으로 변경하지 않습니다.

### FoodProductInfoAuditEvent

바코드·영수증 후보가 잘못 연결되었거나 사용자가 상품명을 더 정확히 알고 있는 경우를 위해,
식품 상세에서 canonical 상품명·브랜드·분류를 직접 수정할 수 있습니다. 이 수정은 상품 프로필만
바꾸며 수량·단위·구매일·보관 상태·개봉 상태·`DateAssertion`은 변경하지 않습니다. 현재 상품
provenance가 있으면 기존 후보 source는 함께 제거하고, 제품 정보 event의 `before`와 별도의
`ProductProvenanceAuditEvent(action=removed)`로 이유를 보존합니다.

```json
{
  "id": "product-info-event-uuid",
  "food_id": "lot_uuid",
  "action": "updated",
  "actor_id": "guest",
  "actor_role": "guest",
  "occurred_at": "2026-09-04T09:05:00Z",
  "before": {
    "canonical_name": "잘못 읽힌 상품명",
    "display_name": "잘못 읽힌 상품명",
    "brand": "기존 브랜드",
    "category": "기타",
    "product_provenance": { "source": "open_food_facts", "confidence": 0.62 }
  },
  "after": {
    "canonical_name": "사용자 확인 상품명",
    "display_name": "사용자 확인 상품명",
    "brand": "확인한 브랜드",
    "category": "가공식품",
    "product_provenance": null
  },
  "reason": "사용자가 상품명·브랜드·카테고리를 수정했습니다."
}
```

`PATCH /api/foods/{food_id}/product-info`의 요청은 `canonical_name`, `brand`, `category`를
모두 요구하고 서버에서 trim·빈 값·길이를 다시 검증합니다. 세 값이 현재와 같으면 no-op으로
event를 만들지 않습니다. 실제 변경은 현재 food snapshot 변경, 필요 시 provenance 제거 event,
product-info before/after event, priority 재계산, durable `flush`를 한 저장 경계에서 처리합니다.
실패하거나 PostgreSQL workspace revision이 바뀌면 stale write를 허용하지 않고 기존 snapshot을
보존하거나 `409`로 재시도하게 합니다.

`GET /api/foods/{food_id}/product-info/events?limit=50`은 현재 인증 workspace의 최신순 bounded
이력을 반환합니다. 이력은 상품 source의 최신성이나 소비기한을 보증하지 않으며, 변경 이력에
포함된 provenance도 상품 기준 후보일 뿐 개별 포장 날짜를 확정하지 않습니다. workspace export와
명시적 guest-to-account transfer에는 product-info audit 전체를 포함하고, account purge/reset 시
현재 workspace 경계로 함께 삭제합니다.

### InventorySearchResponse

`GET /api/inventory/search`는 현재 인증 workspace의 재고만 검색한다.

```text
GET /api/inventory/search?q=두부&storage_type=refrigerated&storage_location_id=storage-location-uuid&offset=0&limit=40
```

검색 대상은 `canonical_name`, `display_name`, `brand`, `category`이며, 서버는
Unicode NFKC/casefold 기반 상품명 정규화로 공백·구두점 차이를 흡수한다. `storage_type`은
`ambient`, `refrigerated`, `frozen` 중 하나이며 생략하면 모든 canonical class를 검색한다.
`storage_location_id`를 지정하면 해당 사용자 정의 위치의 lot만 검색한다. 두 필터를
함께 보내면 canonical class와 사용자 정의 위치가 모두 일치해야 한다.
`offset`은 0 이상, `limit`은 1~100 범위이고 기본값은 40이다.

응답의 `items` 안 `FoodResponse` 필드는 아래 예시에서 일부만 보였다.

```json
{
  "items": [{ "id": "lot_uuid", "display_name": "국산콩 두부" }],
  "total": 1,
  "offset": 0,
  "limit": 40,
  "has_more": false,
  "query": "두부",
  "storage_type": "refrigerated",
  "storage_location_id": "storage-location-uuid"
}
```

`items`의 실제 구조는 `FoodResponse`와 동일하며, `total`은 조건에 맞는 전체 수,
`has_more`는 다음 page 존재 여부다. 이 endpoint는 read-only 탐색이며 재고·lot·날짜·보관
event·Rescue Queue를 변경하지 않는다. 검색 결과 0개는 workspace 재고가 없다는 뜻이
아니라 현재 조건과 일치하는 항목이 없다는 뜻이다. 연결 모드 프론트는 이 bounded page를
사용하고, demo/오프라인 fallback은 이미 받은 dashboard payload를 로컬에서 필터링한다.
PostgreSQL adapter는 호환 projection의 `search_text`에 저장된 정규화 metadata를 이용해
workspace 조건·검색 조건·보관 위치 조건을 DB에서 먼저 적용한 뒤 `COUNT(*)`와 bounded
`OFFSET/LIMIT` page를 읽는다. `009_inventory_search.sql`은 기존 volume에 `pg_trgm` extension,
검색 문자열 backfill, trigram index, workspace/storage 보조 index를 추가하며, 새 write는
동일한 값을 projection에 채운다. `storage_location_id` 조건은 compatibility payload의
location reference를 사용하며, `025_storage_locations.sql`의 compatibility payload
location index와 normalized lot location column/index를 readiness에서 확인한다.
`RESCUE_MEAL_INVENTORY_MODE=normalized`에서도 현재는
normalized table과 호환 projection을 dual-write하므로 이 검색 경로를 유지한다. 다만 외부에서
normalized table만 직접 변경한 뒤 projection이 따라오는지, 실제 PostgreSQL `EXPLAIN`과 대량
데이터 latency, cursor pagination·검색 ranking은 live 운영 gate로 남는다. SQLite·demo adapter는
기존 workspace snapshot을 materialize해 동일한 response contract를 제공한다.

### DateAssertion

모든 날짜 정보를 독립적으로 저장합니다.

```json
{
  "id": "date_uuid",
  "stock_lot_id": "lot_uuid",
  "date_kind": "use_by",
  "date_value": "2026-09-12",
  "date_source": "label_ocr",
  "source_reference": "receipt-or-label-image#bbox",
  "applicable_storage_type": "refrigerated",
  "storage_condition_text": "0~10℃ 냉장보관",
  "confidence": 0.91,
  "user_confirmed": true,
  "rule_id": null,
  "created_at": "2026-09-01T14:10:00+09:00"
}
```

`date_kind`:

```text
production_date
packaging_date
sell_by
best_before
use_by
user_reminder
estimated_use_first
unknown
```

`date_source`:

```text
gs1
gs1_ai_11
gs1_ai_13
gs1_ai_15
gs1_ai_16
gs1_ai_17
label_ocr
receipt_ocr
user_input
category_rule
```

`applicable_storage_type`은 포장지의 표시 날짜가 전제하는 보관 유형을 알고 있을 때만 `ambient`, `refrigerated`, `frozen` 중 하나로 저장합니다. `storage_condition_text`는 `0~10℃ 냉장보관`처럼 원본 조건을 짧게 설명하는 선택 문구이며, 실제 센서 온도나 법정 소비기한을 의미하지 않습니다. 두 값이 없으면 null로 두고 상품명·현재 위치로 추정하지 않습니다. 식품 상세는 이 조건과 현재 lot 위치가 다를 때 날짜를 재계산하지 않고 포장지 조건 재확인 경고만 표시합니다.

현재 API의 `FoodResponse`는 현재 assertion과 함께 이전 assertion을 `date_assertion_history` 배열로 보존합니다. `unknown` 또는 `estimated_use_first` lot만 `PATCH /api/foods/{food_id}/date-assertion`으로 사용자가 확정할 수 있습니다. 이미 `use_by`·`best_before`로 확인된 표시 날짜는 이 correction path가 덮어쓰지 않으며 `409`를 반환합니다. 날짜 확인 요청에서 새 보관조건을 보내지 않으면 기존 assertion의 보관조건을 유지합니다.

이전 초안에서 사용하던 unscoped `storage_locations` 개념이나
`storage_type=custom` 값은 현재 tenant data 계약이 아닙니다. 사용자 정의 위치는
앞의 `StorageLocation` 엔터티처럼 workspace-scoped record로 저장하고,
`storage_type`에는 canonical `ambient`·`refrigerated`·`frozen` 중 하나만 기록합니다.
온도를 실제 센서로 측정하지 않았다면 추정 온도를 저장하지 않고
`temperature_source=not_measured`로 남깁니다.

### StorageEvent

```json
{
  "id": "event_uuid",
  "stock_lot_id": "lot_uuid",
  "event_type": "moved",
  "from_storage_location_id": "storage-location-uuid",
  "to_storage_location_id": "storage-location-uuid-2",
  "quantity": 2,
  "occurred_at": "2026-09-02T20:00:00+09:00",
  "source": "user_input",
  "created_child_lot_id": "child_lot_uuid",
  "meal_plan_id": "meal_uuid",
  "grocy_sync_status": "queued"
}
```

`from_storage_location_id`와 `to_storage_location_id`는 선택적 workspace-scoped 위치
reference이며, 이동 target의 `storage_type`과 위치의 canonical class가 일치해야 합니다.
`grocy_sync_status`는 해당 local event와 외부 stock 상태의 연결만 나타냅니다.
`needs_mapping`은 로컬 이벤트가 실패했다는 뜻이 아니라, 사용자가 Grocy 상품·단위 또는
보관 위치 연결을 마칠 때까지 외부 write를 보류했다는 뜻입니다.

`opened` event가 unopened lot 전체에 적용되면 API는 event의 `occurred_at`을 해당 lot의 최초 `opened_at`으로 함께 저장합니다. 같은 lot에 반복해서 `opened`가 들어와도 최초 시각은 유지합니다. 일부 수량만 개봉하면 parent lot은 unopened 상태로 남고, 새 child lot만 `opened=true`와 해당 event 시각을 가집니다. 이미 개봉된 lot을 이동·분할할 때는 child가 기존 `opened_at`을 상속합니다. child lot의 이력 조회는 child를 생성한 parent event도 함께 반환해 부분 개봉의 출처를 잃지 않습니다.

표시 날짜(`use_by`, `sell_by`, `best_before` 등)가 없는 lot의 `estimated_use_first_window`는 `opened_at`의 날짜를 priority inference 기준일로 사용해 개봉 후 보관 기간을 반영합니다. 이 계산은 라벨 날짜나 법정 소비기한을 대신하지 않으며, 표시 날짜가 존재하면 그 날짜의 의미와 사용자 확인 상태를 변경하지 않습니다.

모바일 client가 네트워크 timeout 뒤 같은 보관 행동을 재시도할 때는 `Idempotency-Key` header를 함께 보냅니다. workspace와 key로 계산한 event ID가 이미 존재하고 요청의 event type·food·location·수량이 일치하면 저장된 event를 그대로 반환하며, 같은 key로 다른 요청을 보내면 `409`를 반환합니다. client는 이 header가 있는 storage mutation에 한해 network failure 또는 `storage_event_persistence_unavailable` 응답을 같은 key로 다시 시도할 수 있습니다. header가 없으면 기존 호환 경로로 매번 새 event를 생성하므로, 외부 재시도가 가능한 mobile mutation에는 key를 사용해야 합니다.

이동과 최초 개봉처럼 하나의 사용자 의도에서 함께 발생하는 local event는
`POST /api/foods/{food_id}/storage-event-sequence`로 보낼 수 있습니다. 요청은 다음 형태이며
`events`는 1~2개로 제한됩니다.

```json
{
  "events": [
    {"event_type": "moved", "to_storage_type": "refrigerated", "quantity": 2},
    {"event_type": "opened"}
  ]
}
```

sequence 요청에는 `Idempotency-Key`가 필수입니다. 서버는 workspace·key·index로 각 event ID를
결정하고, 앞 event가 child lot을 만들면 다음 event를 그 child lot에 적용합니다. 모든 event와
inventory/priority/Grocy outbox projection은 하나의 `WorkspaceMutation` snapshot/outer flush에서
확정됩니다. 전체 flush가 실패하면 `storage_event_sequence_persistence_unavailable` typed
`503`과 `retryable: true`, `action: retry_later`를 반환하며 sequence 전체를 실패 전 상태로
복원합니다. 동일 key와 동일 payload의 완성된 sequence는 `X-Idempotency-Replayed: true`로
저장 결과를 replay하고, payload가 다르거나 sequence가 일부만 남은 상태는 `409`로 중단합니다.
응답은 `events`, 최종 target인 `final_food_id`, `idempotency_replayed`를 포함합니다.

이 계약은 local event projection까지만 원자화합니다. 외부 Grocy provider 호출·compensation,
managed database failover/network partition, reverse proxy response reset은 별도 운영 계약이며,
프론트는 이동+개봉 조합에서만 sequence를 사용하고 단일 storage event의 기존 호환 endpoint는
그대로 유지합니다.

`event_type`:

```text
purchased
moved
opened
frozen
thawed
split
merged
cooked
consumed
spoiled
discarded
adjusted
```

### StorageRule

```json
{
  "id": "rule_uuid",
  "category_id": "raw_chicken",
  "state": "unopened",
  "storage_type": "refrigerated",
  "duration_min_days": 1,
  "duration_max_days": 2,
  "rule_purpose": "reference_priority",
  "jurisdiction": "US",
  "source_name": "USDA FoodKeeper",
  "source_url": "official-source-url",
  "source_revision": "retrieved-date-or-version",
  "review_status": "reference_only"
}
```

한국 서비스에서 해외 보관 지침은 자동 소비기한으로 사용할 수 없습니다. `reference_only` 규칙은 추정 소비 우선일의 참고값으로만 사용합니다.

### PriorityInferenceTrace

날짜가 없는 식품의 `estimated_use_first_window`에 붙는 설명 가능한 backend inference 기록입니다. 이 값은 소비기한이나 안전 판정이 아니라, 어떤 개발용 규칙으로 먼저 확인할 순서를 계산했는지 재현하기 위한 provenance입니다.

```json
{
  "start_date": "2026-09-03",
  "end_date": "2026-09-04",
  "basis": "상품 유형 + 보관 방식",
  "confidence": 0.7,
  "safety_disclaimer": "안전 판정이나 소비기한 확정이 아닌, 먼저 확인할 순서입니다.",
  "inference_trace": {
    "provider": "rule-assisted-backend-inference",
    "provider_version": "priority-rules-v1",
    "rule_id": "priority.tofu.v1",
    "evidence_refs": ["rule-snapshot:local-reference/tofu/v1"],
    "reasoning": [
      "상품명에서 두부·콩 후보를 찾았습니다.",
      "refrigerated 보관 기준의 2~4일 우선순위 범위를 계산했습니다."
    ],
    "input_sha256": "비민감 입력의 64자리 hash"
  }
}
```

`input_sha256`는 상품명·보관 위치·개봉 여부·첫 개봉일·유효 기준일을 정규화한 입력 fingerprint이며 원문 입력을 대신 저장하지 않습니다. `provider_version`, `rule_id`, `evidence_refs`, `reasoning`은 결과가 바뀌었을 때 rule revision과 correction 원인을 추적하기 위한 값입니다. trace가 있어도 시스템은 `safe_to_eat`나 개별 팩 소비기한을 생성하지 않습니다.

`estimated_use_first_window`가 `null`이면 client는 이를 `unknown`/`확인 필요` 상태로 표시합니다. 이 경우 `AI 소비 우선순위` 카드나 추정 날짜를 표시하지 않고, 사용자가 포장지 날짜를 직접 확인해 `DateAssertion`을 확정할 수 있는 CTA만 제공합니다.

## 3. 핵심 불변조건

### 영수증

- `confirmed` 이전에는 StockLot을 생성하지 않는다.
- 한 PurchaseReceipt fingerprint는 한 번만 `committed`될 수 있다.
- 제외·환불·할인 라인은 StockLot을 생성하지 않는다.
- 모든 committed StockLot은 원본 ReceiptLine 또는 명시적 사용자 입력을 추적할 수 있어야 한다.
- 한 영수증의 local lot 생성은 하나의 commit transaction으로 원자적으로 처리한다. Grocy 반영은 별도 outbox transaction으로 분리하고, mapping gap·외부 실패 시 local lot를 되돌리지 않은 채 `needs_mapping`·`pending`·`dead_letter`로 추적한다. 외부 transaction ID readback 전에는 Grocy 반영을 성공으로 표시하지 않는다.
- 서로 다른 `PurchaseReceipt` 또는 `ReceiptLine`에서 확인된 같은 canonical 상품은 서로 다른 `StockLot` ID를 가져야 하며, 기존 lot의 수량·날짜·보관 상태를 덮어쓰지 않는다.
- PostgreSQL compatibility projection/normalized inventory flush는 workspace revision이 현재 DB revision과 일치할 때만 성공하며, 불일치하면 `409`와 최신 상태 reload를 통해 명시적으로 재시도한다.
- fingerprint 계산법이 바뀌면 `fingerprint_version`을 올리고 이전 값과의 호환 정책을 기록한다.

### 수량

- lot 분할 전후 총수량은 보존되어야 한다.
- 부분 이동에 따른 부모 lot 수량 감소와 child lot 생성은 같은 transaction에서 완료되어야 한다.
- 소비·폐기 이벤트는 현재 수량보다 큰 값을 사용할 수 없다.
- 병합은 같은 Product·단위·호환 가능한 상태에서만 허용한다.

### 날짜

- GS1·OCR·사용자 입력 날짜를 덮어쓰지 않는다. 정정은 새 assertion과 supersedes 관계로 기록한다.
- `estimated_use_first`는 `use_by`로 변환할 수 없다.
- 표시 날짜에는 원본 이미지 영역 또는 GS1 원문이 연결되어야 한다.
- storage rule 계산 결과에는 사용한 rule version이 연결되어야 한다.
- `estimated_use_first_window`가 생성되면 가능한 경우 provider/version/rule/evidence/reasoning/input hash trace를 함께 보존한다.
- 포장 보관조건과 실제 보관조건이 다르면 원래 표시 날짜를 삭제하지 않고 불일치 경고를 생성한다.
- 표시 날짜에는 해당 날짜가 전제하는 보관 조건을 가능한 범위에서 함께 저장한다. 조건을 읽지 못했다면 null로 두고 추정하지 않는다.

### 안전

- 시스템은 `safe_to_eat` boolean을 생성하지 않는다.
- 이미지·냄새·색상만으로 부패 여부를 자동 확정하지 않는다.
- 센서가 없으면 실제 냉장고 온도를 알고 있다고 표시하지 않는다.
- 폐기·소비 결정은 사용자에게 남긴다.

### 개인정보와 원본 파일

- 영수증의 카드번호·회원번호·전화번호·주소 등 재고에 필요하지 않은 정보는 구조화 데이터로 보존하지 않는다.
- 원본 영수증 저장 여부와 삭제 시점을 별도 정책으로 명시한다.
- OCR 결과와 원본 이미지 bbox를 연결하더라도 공유 화면에는 마스킹본을 기본으로 사용한다.
- 원본 삭제 후에도 필요한 파생 데이터가 남는다면 사용자에게 항목과 삭제 방법을 안내한다.

## 4. 파생 값

### effective_display_date

사용자가 확인한 `use_by` 또는 `best_before`를 우선 표시합니다. 없으면 null입니다.

### estimated_use_first_date

다음 값으로 계산할 수 있지만 항상 추정값입니다.

```text
base event date
+ selected storage rule duration
+ state transition adjustment
```

### rescue_score

정렬을 위한 파생 값이며 저장된 사실이 아닙니다. 계산 버전을 함께 기록합니다.

```json
{
  "stock_lot_id": "lot_uuid",
  "score": 78.4,
  "score_version": "rescue-score-v1",
  "reasons": [
    "표시 소비기한 3일 전",
    "개봉됨",
    "현재 레시피 4개에서 사용 가능"
  ]
}
```

### RecipeDraft

외부 레시피는 사용자 식단 후보가 되기 전에 shared review queue에 저장됩니다. `RecipeDraft`의 원문 후보와 사람이 승인한 canonical 값을 분리해야 하며, `status=approved`만 planner가 읽습니다. 이 catalog는 사용자 식품·meal plan workspace와 별도 projection입니다.

```json
{
  "id": "recipe-draft-...",
  "source_id": "cookrcp-123",
  "title": "두부 시금치 볶음",
  "ingredients": [
    {
      "raw_text": "시금치 100g",
      "parsed_name": "시금치",
      "parsed_amount": 100,
      "parsed_unit": "g",
      "canonical_name": "시금치",
      "canonical_amount": 100,
      "canonical_unit": "g",
      "review_status": "approved"
    }
  ],
  "status": "pending",
  "safety_note": null,
  "estimated_minutes": null,
  "source_name": "식품안전나라 조리식품 레시피 DB",
  "source_url": "https://www.foodsafetykorea.go.kr/api/openApiInfo.do?...",
  "license": "public-api-terms-review-required",
  "source_revision": "COOKRCP01",
  "retrieved_at": "2026-09-02T00:00:00Z",
  "created_at": "2026-09-02T00:00:00Z",
  "updated_at": "2026-09-02T00:00:00Z",
  "approved_at": null
}
```

승인 요청은 `license_confirmed=true`, 안전 메모, 5~180분의 예상 조리시간, 모든 재료의 canonical name·양수 수량·단위·`review_status=approved`를 요구합니다. source row를 다시 가져와도 같은 source revision·source ID의 draft를 덮어쓰지 않아 검토 중인 변경과 approved snapshot을 보호합니다. `RecipeDraft`는 소비기한이나 `safe_to_eat` 판정을 포함하지 않습니다.

승인·반려·수정·수집은 `RecipeReviewAuditEvent`로 기록합니다. 이벤트에는 actor account id/email, 전후 status, 변경 필드, draft snapshot hash가 들어가며 API에서만 조회할 수 있습니다. 이벤트는 수정·삭제 endpoint를 제공하지 않는 append-only 계약입니다.

### MealPlan

재고 우선순위로 계산한 레시피 계획입니다. `MealPlan`은 식품 안전 판정이나 소비기한의 대체 값이 아닙니다.

```json
{
  "id": "meal_uuid",
  "snapshot_hash": "64-character-sha256",
  "allergens": ["soy"],
  "allergen_metadata_status": "known",
  "preference_filtered": false,
  "preference_note": null,
  "saved_at": null,
  "recipe_id": "spinach-tofu-chicken-bowl",
  "planner_version": "recipe-planner-v2",
  "source": "recipe_fixture",
  "recipe_source_name": "Rescue Meal 팀 작성 레시피",
  "recipe_source_url": null,
  "recipe_license": "project-authored",
  "recipe_source_revision": "recipes-v1",
  "max_minutes": 30,
  "servings": 1,
  "completed_at": null,
  "consumed_food_ids": [],
  "completed_skipped_ingredients": [],
  "consumed_allocations": [],
  "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
  "ingredients": [
    {
      "canonical_name": "시금치",
      "amount": 1,
      "unit": "팩",
      "available": true,
      "available_food_id": "spinach-1",
      "available_quantity": 1,
      "available_unit": "팩",
      "match_type": "exact",
      "allocations": [{"food_id": "spinach-1", "quantity": 1, "unit": "팩"}]
    }
  ],
  "missing_ingredients": [],
  "matched_ratio": 1.0,
  "score": 121.0,
  "reason": "현재 식품만으로 만들 수 있고, 먼저 먹기 순서가 높은 재료를 우선했어요.",
  "steps": ["..."],
  "safety_note": "날짜와 상태가 이상하면 조리하지 마세요."
}
```

`servings`는 단일·대안·다일 식단 요청과 응답에 공통으로 포함되는 `1~8` 정수이며,
생략하면 `1`입니다. recipe fixture의 ingredient amount는 1인분 기준량으로
해석하고, planner는 기준량에 `servings`를 곱한 뒤 현재 lot의 실제 수량으로
allocation과 부족분을 계산합니다. `MealPlanOptionsResponse`도 top-level
`servings`와 각 option의 `servings`를 함께 반환합니다. 다일 응답은 bundle의
`servings`와 날짜별 `MealPlan.servings`를 동일하게 유지합니다. 이 필드는 수량
계산 조건일 뿐 영양·알레르기 안전·소비기한·섭취 가능 여부를 의미하지 않으며,
부족 재료를 서버가 임의로 생성하지 않습니다. 기존 저장 payload에 필드가 없으면
읽기 기본값 `1`을 적용해 backward compatibility를 유지합니다.

`POST /api/meal-plans/preview`는 `saved_at: null`인 계획을 계산만 하고 저장소를 변경하지 않습니다. `POST /api/meal-plans/options`는 같은 입력으로 최대 3개의 서로 다른 `recipe_id` 후보를 계산하며 저장하지 않습니다. `POST /api/meal-plans/multi-day-preview`는 이전 날짜 allocation을 차감한 최대 3일 후보를 계산하며 저장하지 않습니다. 사용자가 승인한 preview는 `POST /api/meal-plans/multi-day`로 bundle 자체를 저장할 수 있고, `bundle_id`와 `snapshot_hash`가 같은 재시도는 동일 결과를 반환하며 다른 snapshot은 `409`로 거절합니다. `GET /api/meal-plans/multi-day/latest`와 `GET /api/meal-plans/multi-day/history`는 저장된 bundle을 workspace 범위에서 반환합니다. bundle 저장은 하위 plan을 단일 plan history에 자동 추가하거나 재고를 차감하지 않습니다. `POST /api/meal-plans`는 계산 결과를 현재 workspace에 저장하고 `saved_at`과 `snapshot_hash`를 채우며 `saved` audit event를 추가합니다. 대안 또는 다일 날짜를 저장할 때는 `recipe_id`를 함께 보내며, 서버는 승인 catalog와 현재 lot allocation에서 선택 후보를 다시 검증하고 재현할 수 없으면 `409`를 반환합니다. snapshot은 표시용 `available_quantity`·`available_unit`의 변동을 제외하지만, allocation과 recipe 선택은 보존하고 조리 완료 때 live lot 수량을 다시 확인합니다. `GET /api/meal-plans/latest`는 현재 workspace의 마지막 저장 계획을 반환하고, `GET /api/meal-plans/history`는 최근 저장 식단 목록을 반환하며, `GET /api/meal-plans/{plan_id}/events`는 계획의 저장·완료 audit을 반환합니다. 보유하지 않거나 필요량이 부족한 재료는 `missing_ingredients`와 `available: false`로 분리하며 서버가 임의로 StockLot을 생성하지 않습니다. 사용자가 `POST /api/meal-plans/{plan_id}/complete`에 선택적 `consumptions`를 보내면 각 lot의 planner allocation을 넘지 않는 범위에서 입력한 양만 검증·차감합니다. 결과는 `consumed_allocations`, `completed_at`, `consumed_food_ids`에 기록하고 `completed` audit event를 추가합니다. 완료 시점에 제외된 재료명은 `completed_skipped_ingredients`에 저장하고, 프론트는 전체 차감과 구분된 안내를 표시합니다. 조리 완료 확인 없이 소비 차감하지 않습니다.

`GET /api/meal-plans/revision`은 plan payload를 반환하지 않고 현재 workspace revision만
반환합니다. 열린 `MealPlanSheet`는 이 marker를 초기 preview/latest read와 함께 기억하고,
tab 복귀·30초 bounded probe에서 값이 바뀌면 현재 alternative·`servings`·lot별
`consumptionDraft`를 자동으로 덮지 않습니다. 대신 사용자가 `최신 식단 확인`을 선택할
때만 preferences·preview·latest를 다시 읽습니다. hidden tab·probe failure·진행 중인
mutation에서는 현재 화면을 유지합니다.

다일 preview의 `optimization_engine`은 `or-tools-cp-sat` 또는 `deterministic-greedy`입니다. CP-SAT 경로도 기존 deterministic matcher가 materialize한 recipe 후보만 선택하며, 같은 recipe 중복과 원래 lot allocation 합계의 capacity 초과를 허용하지 않습니다. servings가 있으면 모든 candidate의 필요량과 shared lot capacity가 그 인원수 기준으로 계산됩니다. OR-Tools를 사용할 수 없거나 해를 반환하지 못한 경우에는 `deterministic-greedy`로 복구하고, 이 필드로 그 엔진 provenance를 표시합니다. 내부 `MultiDayPlanResult.fallback_reason`은 진단용이며 현재 public response에는 노출하지 않습니다. 이 필드는 solver provenance이며 소비기한·섭취 가능·`safe_to_eat`·영양 적합성 판정을 의미하지 않습니다.

이미 저장된 `plan_id`를 재시도하면서 `bundle_id`와 `bundle_day_index`를 함께 보내면 서버는 snapshot·recipe·기존 bundle 연결을 검증한 뒤, 해당 bundle 날짜를 같은 단일 plan ID로 `saved` 상태에 보정하고 기존 plan을 반환합니다. 다른 bundle/date 연결은 `409`로 거절합니다. 이 보정은 재시도에 따른 중복 plan·중복 audit event를 만들지 않습니다.

식단 조건은 `GET/PUT /api/meal-preferences`에서 현재 workspace에 저장합니다. `avoid_allergens`는 `soy`, `egg`, `milk`, `fish`, `shellfish`, `wheat`, `peanut`, `tree_nut` 중 0개 이상이며 서버가 중복을 제거하고 고정 순서로 반환합니다. 회피 조건이 하나라도 있으면 planner는 `allergens`가 겹치는 recipe와 `allergens=null`인 unknown recipe를 제외합니다. `allergen_metadata_status=known`은 curated rule 또는 명시 metadata가 있다는 뜻이고 `allergens=[]`는 알레르기 없음·교차 접촉 없음·의료적 안전을 뜻하지 않습니다. 조건으로 일반 후보가 제외되어 추천이 보류되면 `recipe_id=no-match`, `preference_filtered=true`, `preference_note`가 반환됩니다. 이 조건과 MealPlan 확장 필드는 단일 preview·options·multi-day preview·저장 결과에 동일하게 적용됩니다.

MealPlan에 배정된 lot 중 표시 날짜가 도래했거나(`use_by`, `sell_by`, `best_before`의 값이 오늘 이전 또는 오늘), 날짜 의미가 불완전한 lot(`unknown`, `production_date`, `packaging_date`), 또는 `applicable_storage_type`과 현재 보관 위치가 다른 lot가 있으면 `date_review_required=true`, `date_review_foods`, `date_review_note`를 반환합니다. 이는 조리 전 표시 날짜·보관 상태·포장지 보관조건을 다시 확인하라는 안내이며, 보관조건 불일치만으로 소비기한을 새로 추정하거나 `safe_to_eat`를 판정하지 않습니다. recipe에 실제 allocation되지 않은 inventory는 이 경고 목록에 들어가지 않습니다.

### MealPreferences

workspace별 식단 회피 조건입니다. 사용자 선호 데이터이며 의료 프로필이나 알레르기 안전 판정 결과가 아닙니다.

```json
{
  "avoid_allergens": ["soy", "egg"]
}
```

SQLite는 `meal_preferences`의 workspace row에 저장하고 PostgreSQL은
`rescue_api_meal_preferences`의 `(workspace_id, id)` 복합키 row에 저장합니다.
workspace export에는 `meal_preferences`로 포함하며, guest transfer preview는
`meal_preferences_changed`, 명시적 import 결과는 `imported_meal_preferences`로
상태를 표시합니다. 조건 자체는 recipe 저장·재고 차감·장보기 항목 생성을 하지 않습니다.

### MultiDayMealPlan day progress

저장된 `MultiDayMealPlanResponse.days[]`는 다음 진행 상태를 가집니다.

```json
{
  "day_index": 2,
  "plan_date": "2026-09-04",
  "status": "completed",
  "meal_plan_id": "meal-linked-progress-1",
  "completed_at": "2026-09-03T12:00:00Z"
}
```

`planned → saved → completed` 순서로만 진행합니다. `saved`는 해당 날짜가
단일 `MealPlanResponse`와 연결됐다는 뜻이고, `completed`는 실제 소비 event가
성공했다는 뜻입니다. bundle day progress는 단일 plan completion과 함께
갱신하며, 이미 완료된 plan 재시도는 추가 event를 만들지 않습니다.

### ShoppingListItem

장보기 목록은 사용자가 명시적으로 추가한 부족 재료 또는 직접 입력한 장보기 항목의
workspace-scoped read/write model입니다.

```json
{
  "id": "shopping-...",
  "canonical_name": "국산콩 두부",
  "quantity": 1,
  "unit": "모",
  "checked": false,
  "sources": [
    {"source_type": "meal_plan", "source_id": "meal-1", "day_index": null, "quantity": 1}
  ],
  "created_at": "2026-09-03T09:00:00Z",
  "updated_at": "2026-09-03T09:00:00Z"
}
```

`POST /api/shopping-list`는 저장된 단일 plan 또는 multi-day bundle을 source로
받아 부족분을 `canonical_name + unit`으로 합칩니다. 같은 source를 재요청하면
기존 source 기여량을 교체하므로 중복되지 않습니다. `GET /api/shopping-list`는
현재 inventory를 재검증해 보유하게 된 재료의 source 기여분을 자동 제거합니다.
이때 저장된 `MealPlan.servings`를 유지한 채 현재 inventory로 recipe를 다시
materialize하므로, 일부만 남은 재료는 `기준량 × servings - 현재 수량`의 부족분만
장보기 수량으로 반영하고 완전히 없는 재료는 전체 servings 기준량을 반영합니다.
`POST /api/shopping-list/manual`은 식단과 무관한 항목을 같은 목록에 추가합니다.
상품명·단위의 앞뒤 공백과 연속 공백은 정규화하고 `canonical_name + unit` stable ID를
사용합니다. 같은 키가 이미 있으면 직접 추가 source의 절대 수량을 교체하며, 기존
meal plan·multi-day source 기여분은 보존합니다. 총 수량이 바뀐 경우에는 확인 상태를
해제하고 다시 구매 확인을 요구합니다. `manual` source는 recipe reconciliation의
대상이 아니므로 재고 보충이나 식단 재동기화로 삭제되지 않습니다.
`PATCH /api/shopping-list/{item_id}`는 `checked`만 바꾸고, `DELETE`는 사용자
확인으로 항목을 제거합니다. 이 model은 소비기한 확정, 구매 주문, 결제 상태를
의미하지 않습니다.

#### 장보기 항목 입고 확인

사용자가 실제로 구매한 뒤 `POST /api/shopping-list/{item_id}/receive`를 호출하면
기존 `/api/foods` compatibility upsert를 사용하지 않고 새로운 inventory lot을
생성합니다. 따라서 같은 상품의 기존 lot 수량을 덮어쓰지 않습니다. 요청은 구매한
수량과 사용자가 선택한 보관 위치를 명시해야 합니다.

```json
{
  "quantity": 2,
  "storage_type": "frozen",
  "storage_location_id": "storage-location-uuid"
}
```

`storage_type`은 `refrigerated`·`frozen`·`ambient` 중 하나이며, 선택적
`storage_location_id`는 해당 class의 사용자 정의 위치를 가리킵니다. 입고 lot에는
`purchased_at=현재 시각`, 실제 포장지 날짜가 없는 `DateAssertion(kind=unknown)`을
저장합니다. 상품명과 보관 위치로 계산한 값은 `estimated_use_first` 우선순위 참고값일
뿐이며, 소비기한·안전 여부·섭취 가능 여부를 자동 확정하지 않습니다. UI도 입고
확인 직후 포장지의 실제 소비기한을 다시 확인하라고 안내합니다.

응답은 새 `inventory_lot`과 입고 후 재동기화된 `items`를 함께 반환합니다.
recipe/multi-day source가 새 lot으로 충족되면 해당 계획 source 기여분은 같은 요청에서
자동 제거되고 `removed_planned_source_count`로 보고합니다. `manual` source는 자동
삭제하지 않으며, 구매 수량이 manual 요구량 이상이면 확인된 이력을 남기기 위해
`checked=true`로 보존합니다.

네트워크 재시도는 `Idempotency-Key` 헤더를 사용합니다. 같은 workspace·항목·키로
같은 수량·보관 위치를 다시 보내면 같은 lot과 현재 목록을 돌려주고
`idempotency_replayed=true`, `X-Idempotency-Replayed: true`를 반환합니다. 같은 키로
다른 수량이나 보관 위치를 보내면 `409`로 거부합니다. 이 판단은 inventory lot과
분리된 `ShoppingListReceiveOperation` ledger를 기준으로 하므로, 최초 입고 lot이
나중에 전량 소비·폐기되어 없어져도 같은 키를 새 lot으로 재생성하지 않고 `409`로
중단합니다. 두 process가 같은 key를 최초 처리하다가 한쪽이 workspace revision 충돌을
얻더라도, 최신 operation이 이미 저장된 경우에는 그 record를 찾아 정상 replay하고,
다른 payload이거나 operation이 없는 unrelated 충돌은 기존 `409` 경계를 유지합니다.
ledger에는 원본 헤더 값 대신 요청 fingerprint만 남기며, SQLite와
PostgreSQL에서 함께 저장되고 workspace export·guest transfer에도 포함됩니다. 게스트
transfer preview와 완료 응답은 이 ledger 건수를 각각
`shopping_receive_operation_count`와 `imported_shopping_receive_operation_count`로
보고하므로, lot이 이미 소비·폐기된 뒤에도 보류 중인 중복 방지 기록이 이전 대상에서
빠지지 않습니다.
입고 endpoint는 실제 구매 주문·결제·배송 상태를 생성하지 않습니다.

입고의 local state 변경은 active workspace `mutation_lock()` 안에서
`WorkspaceMutation.run()`으로 처리합니다. 새 lot, planned source reconciliation, manual
source의 checked 상태, `ShoppingListReceiveOperation` ledger와 priority는
`persist=False`로 staging한 뒤 하나의 outer `flush()`에서 확정합니다. regular persistence
failure에서는 이전 inventory/list/ledger snapshot을 복원하고
`shopping_receive_persistence_unavailable` typed `503`, `retryable: true`,
`action: retry_later`를 반환합니다. 기존 same-key replay/conflict semantics와 PostgreSQL
winner replay는 유지하며, 외부 Grocy transaction이나 compensation은 이 local transaction에
포함하지 않습니다.

### Guest workspace transfer recovery boundary

`POST /api/account/guest-transfer/preview`는 변경 없이 source와 target의 상태·개수·설정
차이를 읽고, `POST /api/account/guest-transfer`는 `confirm: true`일 때만 복사를 수행합니다.
import는 source guest workspace를 삭제하지 않습니다. transfer copy는 source workspace ID와
target account workspace ID의 고정 순서로 두 workspace lock을 잡은 뒤 `ready`/`conflict`/
`already_transferred`/`empty`를 다시 판정합니다. 따라서 preview 뒤 target account에 새
기록이 들어오면 guest snapshot을 덮지 않고 `409`로 중단합니다.

`ready` 상태에서 target copy와 flush가 실패하면 target의 기존 snapshot을 복원하고
`guest_transfer_persistence_unavailable` typed `503`, `retryable: true`,
`action: retry_later`를 반환합니다. PostgreSQL revision conflict는 target backup을
복원하지 않고 winner snapshot을 전역 `workspace_revision_conflict`로 전달합니다. 완성된
source/target fingerprint는 같은 transfer 재요청을 `already_transferred`로 처리하며,
import 후 source가 바뀌면 같은 record ID라도 `409`로 차단합니다. 이 계약은 두 workspace의
distributed transaction이나 backup/WAL/read-replica·managed failover를 증명하지 않습니다.

### Operational unavailability envelope

사용자 mutation의 typed persistence error와 별도로, process가 요청을 처리할 수 없는 운영
경계도 안전한 `503` detail을 사용합니다. HTTP status는 기존과 같지만, 자동화와 client가
일시 장애와 서버 설정 누락을 구분할 수 있도록 `code`, 사용자용 `detail`, `retryable`,
`action`을 제공합니다. retry 가능한 응답에는 `Retry-After: 1`을 붙이고 exception 원문·token·
workspace data는 넣지 않습니다.

```text
GET  /ready
     readiness_storage_unavailable       retryable=true,  action=retry_later
     auth_configuration_missing          retryable=false, action=configure_server

OCR worker GET  /ready
     ocr_model_unavailable                retryable=true,  action=retry_later
OCR worker POST /ocr (capacity timeout)
     ocr_worker_busy                      retryable=true,  action=retry_later

API internal worker/config guards
     grocy_worker_configuration_missing
     notification_worker_configuration_missing
     product_enrichment_worker_configuration_missing
     observability_configuration_missing  retryable=false, action=configure_server
     grocy_integration_not_configured       retryable=false, action=configure_integration
     recipe_review_configuration_missing    retryable=false, action=configure_server
     recipe_import_configuration_missing    retryable=false, action=configure_integration
     workspace_provisioning_unavailable     retryable=true,  action=retry_later

API workspace acquisition
     postgres_pool_unavailable             retryable=true,  action=retry_later
     workspace_storage_unavailable        retryable=false, action=configure_storage
```

`GET /ready`와 OCR worker의 success response schema는 그대로 유지하고, failure detail만
typed envelope로 확장합니다. `/api/account/delete`나 meal-plan 같은 domain mutation의
retry payload·rollback semantics를 이 운영 error에 자동 적용하지 않습니다. recipe importer,
legacy review token, auth endpoint의 별도 configuration error는 각 domain contract를 유지하며
이 목록의 blanket replacement를 주장하지 않습니다.
