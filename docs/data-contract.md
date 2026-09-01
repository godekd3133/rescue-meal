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

## 2. 핵심 엔터티

### Product

상품 또는 식재료의 공통 정보입니다.

```json
{
  "id": "product_uuid",
  "canonical_name": "서울우유 나100% 1L",
  "category_id": "milk",
  "default_unit": "ml",
  "default_storage_location_id": "fridge-main",
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
  "total_amount": 28400,
  "status": "review_required",
  "ocr_engine": "paddleocr",
  "ocr_model_version": "pinned-version",
  "commit_transaction_id": null,
  "created_at": "2026-09-01T14:00:00+09:00"
}
```

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

### ReceiptCommitTransaction

영수증의 review 결과를 확정 재고와 외부 재고 시스템(Grocy 등)에 반영하는 시도입니다.

```json
{
  "id": "commit_uuid",
  "receipt_id": "receipt_uuid",
  "fingerprint": "...",
  "status": "needs_reconciliation",
  "error_code": "grocy_timeout"
}
```

상태는 다음처럼 이동합니다.

```text
pending
→ committed
→ needs_reconciliation (중간 실패 시)
→ committed (재시도 성공 시)
```

중간 실패에서는 이미 생성된 lot를 부분 성공으로 표시하지 않습니다. 현재 API MVP는 snapshot rollback 후 `needs_reconciliation` transaction을 남기고, 운영 PostgreSQL adapter에서는 동일 의미를 DB transaction·outbox·외부 readback으로 구현해야 합니다.

운영 조회 endpoint는 `GET /api/commit-transactions`이며, 자동 retry 대신 현재 transaction 상태와 `error_code`를 반환합니다.

### ReceiptLine

```json
{
  "id": "line_uuid",
  "receipt_id": "receipt_uuid",
  "line_number": 4,
  "raw_text": "서울우유1L 2 5960",
  "raw_name": "서울우유1L",
  "quantity": 2,
  "weight": null,
  "unit_price": 2980,
  "total_price": 5960,
  "line_type": "product",
  "matched_product_id": "product_uuid",
  "match_source": "user_confirmed_alias",
  "match_confidence": 0.99,
  "review_status": "confirmed"
}
```

`line_type`은 최소 `product`, `discount`, `refund`, `subtotal`, `payment`, `unknown`을 지원합니다.

### StockLot

같은 상품이라도 구매시점·표시 날짜·보관 상태가 다르면 별도 lot입니다.

```json
{
  "id": "lot_uuid",
  "product_id": "product_uuid",
  "parent_lot_id": null,
  "source_receipt_line_id": "line_uuid",
  "quantity": 2,
  "unit": "pack",
  "purchased_at": "2026-09-01T13:20:00+09:00",
  "current_storage_location_id": "fridge-main",
  "current_state": "unopened",
  "grocy_stock_id": "grocy-id",
  "version": 1
}
```

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

현재 API의 `FoodResponse`는 현재 assertion과 함께 이전 assertion을 `date_assertion_history` 배열로 보존합니다. `unknown` 또는 `estimated_use_first` lot만 `PATCH /api/foods/{food_id}/date-assertion`으로 사용자가 확정할 수 있습니다. 이미 `use_by`·`best_before`로 확인된 표시 날짜는 이 correction path가 덮어쓰지 않으며 `409`를 반환합니다.

### StorageLocation

```json
{
  "id": "fridge-main",
  "name": "주방 냉장고",
  "storage_type": "refrigerated",
  "temperature_celsius": null,
  "temperature_source": "not_measured"
}
```

`storage_type`:

```text
ambient
refrigerated
frozen
custom
```

온도를 실제 센서로 측정하지 않았다면 추정 온도를 저장하지 않고 `not_measured`로 남깁니다.

### StorageEvent

```json
{
  "id": "event_uuid",
  "stock_lot_id": "lot_uuid",
  "event_type": "moved",
  "from_location_id": "fridge-main",
  "to_location_id": "freezer-main",
  "quantity": 2,
  "occurred_at": "2026-09-02T20:00:00+09:00",
  "source": "user_input",
  "created_child_lot_id": "child_lot_uuid",
  "meal_plan_id": "meal_uuid"
}
```

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

## 3. 핵심 불변조건

### 영수증

- `confirmed` 이전에는 StockLot을 생성하지 않는다.
- 한 PurchaseReceipt fingerprint는 한 번만 `committed`될 수 있다.
- 제외·환불·할인 라인은 StockLot을 생성하지 않는다.
- 모든 committed StockLot은 원본 ReceiptLine 또는 명시적 사용자 입력을 추적할 수 있어야 한다.
- 한 영수증의 lot 생성과 Grocy 반영은 하나의 commit transaction으로 취급한다. 중간 실패 시 모두 rollback하거나 재시도 가능한 pending 상태로 남기며 부분 입고를 성공으로 표시하지 않는다.
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

### MealPlan

재고 우선순위로 계산한 레시피 계획입니다. `MealPlan`은 식품 안전 판정이나 소비기한의 대체 값이 아닙니다.

```json
{
  "id": "meal_uuid",
  "snapshot_hash": "64-character-sha256",
  "saved_at": null,
  "recipe_id": "spinach-tofu-chicken-bowl",
  "planner_version": "recipe-planner-v2",
  "source": "recipe_fixture",
  "recipe_source_name": "Rescue Meal 팀 작성 레시피",
  "recipe_source_url": null,
  "recipe_license": "project-authored",
  "recipe_source_revision": "recipes-v1",
  "max_minutes": 30,
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

`POST /api/meal-plans/preview`는 `saved_at: null`인 계획을 계산만 하고 저장소를 변경하지 않습니다. `POST /api/meal-plans`는 계산 결과를 현재 workspace에 저장하고 `saved_at`과 `snapshot_hash`를 채우며 `saved` audit event를 추가합니다. `GET /api/meal-plans/latest`는 현재 workspace의 마지막 저장 계획을 반환하고, `GET /api/meal-plans/history`는 최근 저장 식단 목록을 반환하며, `GET /api/meal-plans/{plan_id}/events`는 계획의 저장·완료 audit을 반환합니다. 보유하지 않거나 필요량이 부족한 재료는 `missing_ingredients`와 `available: false`로 분리하며 서버가 임의로 StockLot을 생성하지 않습니다. 사용자가 `POST /api/meal-plans/{plan_id}/complete`에 선택적 `consumptions`를 보내면 각 lot의 planner allocation을 넘지 않는 범위에서 입력한 양만 검증·차감합니다. 결과는 `consumed_allocations`, `completed_at`, `consumed_food_ids`에 기록하고 `completed` audit event를 추가합니다. 완료 시점에 제외된 재료명은 `completed_skipped_ingredients`에 저장하고, 프론트는 전체 차감과 구분된 안내를 표시합니다. 조리 완료 확인 없이 소비 차감하지 않습니다.
