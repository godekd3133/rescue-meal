# Rescue Meal 아키텍처 결정 기록

기준일: 2026-09-01

이 문서는 현재까지 합의된 설계 결정을 기록합니다. `proposed`는 feasibility spike에서 바뀔 수 있고, `accepted`는 MVP 기준으로 유지합니다.

## ADR-001 — 서비스의 핵심 약속

- 상태: `accepted`
- 결정: MealRescue는 식품 안전 판정 서비스가 아니라 식재료 입력·보관 이력·소비 우선순위·식단 계획 서비스다.
- 허용: 상품 분류, 라벨 날짜 후보, 제품 기준 참고 기간, 먼저 사용할 우선순위.
- 금지: 상품명만으로 실제 소비기한 생성, `safe_to_eat` 판정, 사진만으로 부패 판정.
- 이유: 소비기한은 표시된 보관방법과 개별 제품 상태의 영향을 받으며, 상품명만으로 lot과 보관 이력을 알 수 없다.

## ADR-002 — 실제 표시 날짜와 추정값 분리

- 상태: `accepted`
- 결정: `DateAssertion`은 `date_kind`, `date_source`, `confidence`, `user_confirmed`, `applicable_storage_type`을 가진다.
- 실제 표시 날짜: 포장 라벨·GS1·사용자 확인에서 얻은 날짜.
- 추정값: `estimated_use_first`로만 저장하며 소비기한으로 승격하지 않는다.
- 이유: 포장일·제조일·품질유지기한·소비기한의 의미가 다르다.

## ADR-003 — 상품 master와 StockLot 분리

- 상태: `accepted`
- 결정: 상품 공통정보는 Product에, 구매시점·수량·날짜·보관 상태는 StockLot에 저장한다.
- 이유: 같은 상품을 다른 날 구매하면 날짜와 보관 상태가 다르고, 일부 수량만 냉동·개봉·조리될 수 있다.

## ADR-004 — 보관 변경은 event로 기록

- 상태: `accepted`
- 결정: 현재 보관 위치만 덮어쓰지 않고 `StorageEvent` append-only 기록을 만든다.
- 부분 이동: parent lot 수량을 줄이고 child lot을 만든다.
- 상태 변경: `moved`, `opened`, `frozen`, `thawed`, `split`, `consumed`, `discarded`를 구분한다.
- 이유: 보관 이력이 사라지면 추정 우선순위와 오류 원인을 재현할 수 없다.

## ADR-005 — 영수증은 review 후 입고

- 상태: `accepted`
- 결정: OCR은 draft를 만들 뿐이고 `review_required`를 거쳐야 StockLot을 생성한다.
- 자동 확정 허용 후보: 사용자가 확인한 alias와 높은 confidence의 동일 상품·수량.
- review 필수: 신규 상품, 중량상품, 취소·할인, 수량 누락, 후보 다중 매칭, 식품 유형 불명.
- 이유: 제공받은 영수증 샘플에서 날짜·수량·할인·매장 내부 코드 오인식이 확인됐다.

## ADR-006 — 문서 유형을 먼저 판별

- 상태: `accepted`
- 결정: OCR 결과를 inventory parser에 바로 넣지 않고 `grocery_receipt`, `retail_beverage_receipt`, `restaurant_receipt`, `produce_label`, `packaged_label`, `unknown`으로 분기한다.
- 식당 영수증: 식료품 재고에서 제외하고 leftover quick add로만 전환한다.
- 이유: 식당 영수증과 카드전표가 겹치면 결제정보와 메뉴가 섞이며, 자동 입고 대상이 아니다.

## ADR-007 — Grocy는 companion integration

- 상태: `proposed`
- 결정: Grocy를 fork해 전체 UI를 다시 만들지 않고, 공식 API와 고정 버전 Docker를 먼저 재현한 뒤 FastAPI adapter로 연결한다.
- Rescue API가 관리: receipt staging, provenance, review, rule, planner run.
- Grocy가 관리 후보: 확정 상품·재고·소비·폐기·recipe.
- 필수: Grocy stock ID mapping, commit idempotency, compensation/reconciliation.
- 변경 조건: Grocy undo/compensation이 실험에서 재현되지 않으면 Rescue DB를 committed read model로 승격하고 Grocy는 reference adapter로 낮춘다.

## ADR-008 — 벡터 검색은 pgvector 우선

- 상태: `proposed`
- 결정: PostgreSQL을 이미 사용하는 MVP에서는 pgvector를 먼저 검토하고 Qdrant와 동시에 운영하지 않는다.
- 용도: receipt raw name, canonical product, alias, recipe ingredient embedding.
- 이유: metadata·transaction·유사도 검색을 한 DB에서 관리할 수 있다.
- 변경 조건: embedding 규모·필터·운영 요구가 pgvector를 넘으면 Qdrant를 별도 비교한다.

## ADR-009 — 상품 정보 source priority

- 상태: `accepted`
- 우선순위:

```text
사용자 확인 alias
→ local catalog
→ 식품안전나라 I1250
→ 라벨 OCR
→ Open Food Facts
→ legacy C005
```

- `I1250`: 제품명·품목유형·제품 기준 소비기한 참고.
- `C005`: 바코드·제품 기준 정보의 legacy 비교용. 공식 안내의 최신화 중단 경고를 항상 표시.
- Open Food Facts: product enrichment·taxonomy 후보. 데이터가 없거나 불완전할 수 있음.
- 실제 포장 라벨 날짜: 위 source보다 우선.

## ADR-010 — 한국 레시피 source

- 상태: `proposed`
- 결정: 초기 recipe fixture는 Grocy recipe와 식품안전나라 `COOKRCP01` 후보를 사용한다.
- Tandoor·Mealie는 비교 대상으로만 두고 동시에 도입하지 않는다.
- 레시피 재료명과 재고 상품명 사이의 canonical mapping은 팀 코드로 관리한다.

## ADR-011 — AI의 역할

- 상태: `accepted`
- AI 허용:

```text
상품명 정규화
상품 카테고리 후보
보관방법 후보
날짜 field 의미 후보
공식 rule 검색 결과 설명
레시피 ingredient mapping 후보
```

- AI 불허:

```text
source 없는 소비기한 생성
safe_to_eat 판정
실제 소비기한의 자동 연장
고위험 식품의 무검토 날짜 확정
```

- 출력: JSON Schema/Pydantic 검증, source reference, confidence, abstain reason.

## ADR-012 — 보관 규칙 source

- 상태: `accepted`
- 결정: 한국 식품 표시·보관 안내와 제조사·라벨 정보를 우선한다.
- USDA FoodKeeper는 reference-only data로 사용한다.
- 해외·일반 카테고리 기간은 `estimated_use_first` 계산에만 사용한다.
- 규칙에는 jurisdiction, source, revision, rule version이 있어야 한다.

## ADR-013 — 개인정보와 원본

- 상태: `accepted`
- 원본 영수증·라벨은 기본적으로 프로젝트 Git에 넣지 않는다.
- receipt line에 필요하지 않은 카드번호·전화번호·주소는 구조화 데이터에 저장하지 않는다.
- 이미지 공유는 마스킹본을 기본으로 한다.
- 원본 삭제 시점과 파생 OCR 데이터의 보존을 사용자에게 안내한다.
- AI backend에 전달할 때는 전체 영수증보다 필요한 구조화 필드를 우선한다.

## ADR-014 — 검증 상태

- 상태: `accepted`
- 각 결과는 다음 상태를 별도로 기록한다.

```text
oss-reproduced
source-verified
data-verified
build-verified
runtime-verified
human-checked
```

- OCR이 텍스트를 반환한 것은 상품 매칭·소비기한·식품 안전 증거가 아니다.
- API 응답이 존재하는 것은 개별 lot 날짜 증거가 아니다.
- planner가 결과를 낸 것은 실제 폐기량 감소 증거가 아니다.

## ADR-015 — 식단 preview와 저장 분리

- 상태: `accepted`
- 결정: 레시피 추천 sheet를 열 때는 `POST /api/meal-plans/preview`로 계산만 하고, 사용자가 `식단 저장`을 눌렀을 때 `POST /api/meal-plans`로 workspace에 저장한다.
- 저장 계획은 SQLite `meal_plans` 또는 PostgreSQL `rescue_api_meal_plans` projection에 보존하고 `GET /api/meal-plans/latest`로 재조회한다.
- 이유: 화면을 열었다는 사실과 사용자가 식단을 선택해 보존했다는 의도를 구분하고, UI의 `저장됨` 상태가 실제 영속 동작과 일치해야 한다.
- 현재 preview plan ID를 save retry의 멱등 키로 재사용한다. 변경 조건: recipe version·inventory lot·수량 충돌 검증이 필요해지면 저장 payload에 snapshot/hash와 요청 fingerprint를 추가한다.

## ADR-016 — 조리 완료는 명시적 사용자 확인 후 소비 처리

- 상태: `accepted`
- 결정: 저장된 식단은 자동으로 재고를 차감하지 않고, 사용자가 `조리 완료로 기록`을 눌렀을 때 현재 lot의 단위·수량을 다시 검증한 뒤 matched lot에만 `consumed` event를 생성한다.
- 사용자는 완료 직전에 allocation별 소비량을 줄이거나 0으로 설정할 수 있으며, planner 배정량을 초과하는 요청은 거부한다.
- 실제 소비량은 `consumed_allocations`와 allocation별 `consumed` event에 함께 남긴다.
- 수량이 부족하거나 lot가 사라졌거나 단위가 다르면 해당 재료를 건너뛰고 이유를 반환한다. 한 건도 소비하지 못하면 계획을 완료 상태로 바꾸지 않는다.
- 동일 plan의 complete retry는 `already_completed`로 응답하고 추가 event를 만들지 않는다.
- 이유: 레시피 추천은 의도나 실제 조리 완료의 증거가 아니며, 서버가 사용자의 행동을 추정해 이중 차감하면 재고 신뢰성이 무너진다.

## ADR-017 — MealPlan snapshot과 audit event 분리

- 상태: `accepted`
- 결정: preview 결과는 immutable한 `snapshot_hash`를 갖고, save/complete 변화는 별도 workspace-scoped audit event로 기록한다.
- save retry는 같은 `plan_id`와 snapshot이면 기존 결과를 반환하고, 다른 snapshot이면 `409`로 중단한다.
- 이유: recipe fixture나 planner가 변경되어도 과거에 어떤 recipe·allocation·실제 소비량을 사용했는지 재현할 수 있어야 한다.
- 변경 조건: 운영 DB로 전환할 때 JSON projection을 normalized MealPlan/MealPlanEvent 테이블과 동일 transaction으로 이관한다.
