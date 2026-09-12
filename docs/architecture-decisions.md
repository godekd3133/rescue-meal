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
- 결정 보강: local receipt commit과 Grocy 외부 write를 분리하고, 모든 외부 대상은 outbox에 남기되 mapping이 확인된 항목만 `pending` 외부 호출로 전환한다. 미확인 항목은 `blocked`로 보존하며, 외부 transaction ID readback이 없으면 성공으로 확정하지 않는다.
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

바코드 endpoint의 실행 순서는 별도로 `local fixture → C005(설정된 경우) → Open Food Facts(설정된 경우)`로 둔다. C005의 `POG_DAYCNT`는 제품 기준 참고 문구와 명시적 보관 힌트로만 반환하고, `DateAssertion`이나 개별 lot 소비기한으로 자동 승격하지 않는다. 메모리 모드에서는 bounded process cache를 사용하고, SQLite 파일/PostgreSQL 모드에서는 migration `012_product_provider_runtime.sql`의 shared product-master cache·짧은 single-flight lease·provider별 atomic rate-limit window를 사용한다. cache/lease에는 개별 lot 날짜를 저장하지 않으며, 실제 provider quota·backup/restore·장애 운영은 별도 gate다.

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
- 현재 preview plan ID를 save retry의 멱등 키로 재사용한다. 동일 `plan_id` 재시도에 `bundle_id`와 `bundle_day_index`가 함께 오면 기존 단일 계획을 다시 계산하지 않고도 같은 3일 bundle 날짜 연결을 보정하며, 다른 bundle/date 연결은 `409`로 거절한다. 변경 조건: recipe version·inventory lot·수량 충돌 검증이 필요해지면 저장 payload에 snapshot/hash와 요청 fingerprint를 추가한다.

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

## ADR-018 — 외부 재고 동기화는 모든 재고 이벤트를 outbox로 통일

- 상태: `accepted`
- 결정: 영수증 입고뿐 아니라 `opened`, `consumed`, `discarded`, `moved`, `frozen`, `thawed`도 로컬 `StorageEvent`를 먼저 확정한 뒤 workspace-scoped Grocy outbox로 보낸다.
- 매핑: 상품명·단위는 `GrocyProductMapping`, 실온·냉장·냉동은 `GrocyLocationMapping`으로 분리한다. 이동 계열은 출발·도착 location ID가 모두 사용자 확인된 경우에만 외부 write를 허용한다.
- operation: `receipt_add → add`, `opened → open`, `consumed/discarded → consume`, `moved/frozen/thawed → transfer`로 변환한다. 폐기는 `spoiled=true`, 소비는 `spoiled=false`와 `exact_amount=true`로 구분한다.
- 멱등성: 입고는 `receipt:{receipt_id}:lot:{lot_id}`, 이벤트는 `storage-event:{event_id}`를 사용하며, Grocy 응답 transaction ID를 읽지 못하면 성공으로 확정하지 않는다.
- 복구: 3회 실패한 `dead_letter`만 운영자 확인 후 새 pending cycle로 재시도할 수 있으며, 이전 오류·메모·수동 재시도 횟수를 보존한다. 외부 write가 이미 실행됐을 수 있는 `in_flight`는 자동 재시도하지 않는다.
- 불확실성 처리: stale `in_flight`는 외부 호출 없이 `reconciliation_required`로 전환하고, 운영자가 transaction ID를 제시한 `already_applied` 또는 외부 미반영을 확인한 `not_applied`만 선택할 수 있다.
- 이유: 외부 Grocy가 잠시 꺼져 있거나 mapping이 비어 있어도 사용자의 실제 재고 행동을 잃지 않아야 하며, 입고만 동기화하고 소비·폐기를 빠뜨리면 두 재고가 조용히 어긋난다.
- 미검증 경계: disposable Grocy 4.7.0 container에서 stock quantity/location mutation과 transaction ID readback은 확인했지만, 운영 Grocy의 backup/restore·중복 요청 외부 idempotency·processor crash 뒤 `in_flight` recovery·undo/compensation은 아직 운영 claim이 아니다 ([live Grocy sync readback](../evidence/live-grocy-sync-readback-2026-09-04.md)).

## ADR-019 — Grocy outbox worker는 명시된 workspace만 lease로 처리

- 상태: `accepted`
- 결정: `grocy-worker`는 `RESCUE_MEAL_GROCY_WORKSPACE_IDS`로 전달된 workspace만 순회하고, workspace별 `grocy-outbox` lease를 획득한 경우에만 stale scan과 pending process를 실행한다.
- 연결: 별도 worker는 DB/Grocy credential을 소유하지 않고 `RESCUE_MEAL_GROCY_WORKER_TOKEN`으로 API의 단일 workspace tick만 호출한다. API가 실제 store·Grocy client·heartbeat write를 소유한다.
- lease: SQLite는 `BEGIN IMMEDIATE`, PostgreSQL은 `(workspace_id, lease_key)` row lock을 사용한다. lease가 살아 있는 다른 worker는 해당 workspace를 건너뛰며, process 종료 뒤 lease 만료를 기다린다.
- 경계: worker는 workspace를 자동 발견하거나 추측하지 않는다. stale `in_flight`는 재호출하지 않고 reconciliation state로 남긴다.
- 이유: API와 worker가 같은 outbox를 동시에 집어 외부 재고를 중복 변경하는 것을 막고, guest/account tenant 경계를 운영자가 명시적으로 통제하기 위해서다.
- 미검증 경계: 실제 다중 프로세스 PostgreSQL 경쟁, 운영 Grocy mutation 운영 장애, Kubernetes/Compose scheduler 장애 복구는 별도 운영 환경에서 추가 검증한다. disposable Grocy worker tick과 transaction ID readback은 [live Grocy sync readback](../evidence/live-grocy-sync-readback-2026-09-04.md)에서 확인한다.

## ADR-020 — Grocy 상품 매핑 변경은 before/after audit으로 보존

- 상태: `accepted`
- 결정: `GrocyProductMapping`의 생성·수정마다 actor, 시각, `before`, `after` snapshot을 workspace-scoped `GrocyProductMappingAuditEvent`로 별도 저장한다. 이력 조회 endpoint는 읽기 전용으로 제공하고 계정 설정에서 상품별로 확인한다.
- 저장: SQLite/PostgreSQL durable store는 일반 projection 전체 재작성과 분리된 insert 경로를 사용한다. 이력에는 Grocy API key나 upstream response body를 저장하지 않는다.
- 이유: 마지막 수정자만 남기면 잘못된 Grocy product ID·단위 연결을 되돌리거나 외부 재고 불일치가 시작된 시점을 추적할 수 없다. 특히 상품 매핑은 이후 receipt/storage outbox의 외부 write 대상을 결정하므로 변경 원인이 운영 증거가 된다.
- 경계: 현재는 생성·수정 audit readback까지 검증했으며, 감사 로그 retention·관리자별 조회 권한·실제 Grocy catalog diff는 운영 PostgreSQL/Grocy 환경에서 별도 정책과 검증이 필요하다.

## ADR-021 — 알림은 재고에서 파생하고 읽음 상태만 저장

- 상태: `accepted`
- 결정: 표시 날짜, 사용자 알림일, 추정 소비 우선일, 확인이 필요한 Grocy outbox 상태는 현재 workspace 재고에서 매 요청마다 결정적으로 계산한다. 서버에는 알림 원문을 무기한 복제하지 않고 안정적인 `notification_id`별 `read_at`만 저장한다.
- 안전 경계: `printed_date`·`user_reminder`·`estimated_window`·`unknown_date`를 서로 다른 source로 노출하고, 어떤 알림도 섭취 가능·안전 여부를 판정하지 않는다. `estimated_window`는 먼저 확인할 순서일 뿐 실제 소비기한이 아니다.
- 이유: 식품 상태가 바뀌었을 때 오래된 알림 문서가 현재 재고를 가리지 않아야 하며, 읽음 상태는 앱 재실행·다른 기기에서도 유지되어야 한다. 파생 계산과 읽음 persistence를 분리하면 날짜 규칙을 테스트하고 전달 채널을 나중에 교체할 수 있다.
- 경계: 현재는 앱 안 알림 센터·읽음 상태·workspace별 timezone·Web Push delivery outbox/worker contract까지 구현했다. 실제 browser push service 수신, 메일·ntfy 채널, 알림 retention과 다중 기기 동시 읽음 정책은 별도 운영 단계다.

## ADR-022 — 재고 mutation은 InventoryRepository seam을 통과

- 상태: `accepted`
- 결정: receipt commit의 새 구매 lot 생성, partial move/open/consume/discard, meal-plan consume은 `InventoryRepository`의 command를 통해서만 재고 수량·부모/자식 lot 관계를 변경한다. HTTP route는 request validation, append-only StorageEvent, Grocy outbox와 response mapping을 담당하고 lot mutation 자체를 직접 구현하지 않는다.
- 불변조건: canonical 상품명은 lot identity가 아니며, 확인된 receipt line마다 새 lot ID를 만든다. 부분 mutation은 부모 수량 감소와 child 생성이 함께 일어나고, 소비·폐기는 현재 수량을 초과할 수 없다.
- 호환성: 현재 `FoodResponse`를 read model로 유지하되 source receipt ID/line ID/purchased-at을 함께 보존한다. PostgreSQL에서는 `RESCUE_MEAL_INVENTORY_MODE=normalized`일 때 `rescue_inventory_*` relational adapter와 `rescue_api_*` compatibility projection을 같은 transaction으로 dual-write/read한다.
- 이유: 같은 상품의 다른 구매를 합치면 서로 다른 소비기한·보관 상태·Grocy idempotency key가 손실된다. mutation 규칙을 한 곳에 두면 in-memory/SQLite/PostgreSQL Adapter가 같은 command invariant를 공유하고 API route의 Locality가 높아진다.
- 미검증 경계: 현재 seam과 compatibility projection·SQLite persistence·normalized adapter SQL contract는 검증했지만, 실제 PostgreSQL normalized row/FK/두 connection 동시성, normalized projection을 유일한 source로 승격하는 acceptance는 Docker live 환경에서 아직 검증하지 않았다.

## ADR-023 — PostgreSQL workspace snapshot은 revision 충돌을 명시적으로 거부

- 상태: `accepted`
- 결정: `PostgresStore`는 workspace별 `rescue_api_workspace_revisions` row를 `SELECT ... FOR UPDATE`로 잠근 뒤, 로드한 revision과 현재 revision이 같을 때만 compatibility projection과 normalized inventory를 flush한다. revision이 달라지면 write를 중단하고 현재 DB 상태를 다시 읽은 뒤 HTTP `409`로 재시도를 요구한다.
- 이유: process 내부 `RLock`만으로는 여러 API process의 전체 snapshot flush를 보호할 수 없다. stale snapshot을 조용히 덮어쓰는 것보다 사용자가 최신 데이터를 다시 읽고 재시도하는 명시적 충돌이 안전하다.
- 경계: revision guard는 projection/normalized flush에 적용되며, route는 repository가 최신 snapshot을 reload한 뒤 stale snapshot을 다시 복원하지 않고 명시적 `409`를 전달한다. live PostgreSQL 두 connection에서 실제 충돌·재시도·사용자 경험이 정상 동작하는지는 Docker 환경에서 추가 검증한다. 충돌을 자동 merge하거나 무조건 retry하지 않는다.

## ADR-024 — liveness와 readiness, request correlation을 분리

- 상태: `accepted`
- 결정: `/health`는 프로세스 liveness만 반환하고, `/ready`는 현재 저장소의 `SELECT 1` 연결 상태와 선택적 Grocy 설정 상태를 별도로 반환한다. 모든 HTTP response에는 검증·생성된 `X-Request-ID`를 붙이고, 운영에서 `RESCUE_MEAL_ACCESS_LOG=true`인 경우 method·path·status·duration만 JSON access log로 남긴다.
- 개인정보·비밀 경계: request body, query string, Authorization header, API key, upstream response body는 access log에 기록하지 않는다. 사용자가 전달한 request ID는 제한된 문자 집합과 길이를 통과한 경우에만 재사용한다.
- 이유: healthcheck가 살아 있다는 사실과 실제 DB write readiness를 혼동하지 않아야 하며, 영수증·Grocy·알림 장애를 하나의 correlation ID로 추적할 수 있어야 한다.
- 경계: 현재 local SQLite/in-memory readiness와 middleware contract를 검증했으며, 실제 log collector·trace backend·PostgreSQL failover·alert threshold는 운영 인프라에서 추가한다.

## ADR-018 — 외부 레시피는 protected review 후 planner에 노출

- 상태: `accepted`
- 결정: COOKRCP01 원문은 shared recipe catalog의 review draft로 저장한다. 새 운영환경은 `recipe_admin` account `ra1` token을 사용하고, 기존 operator token은 local migration fallback으로만 허용한다. 제목·재료 canonicalization·단위·예상 조리시간·안전 메모·license 확인을 모두 통과한 `approved` draft만 `recipe_catalog` source의 planner `RecipeSpec`으로 변환한다.
- `pending`·`rejected` draft는 사용자 식단 후보에서 제외하고, 이미 승인된 draft는 같은 source ID 재수집으로 덮어쓰지 않는다.
- review action은 actor account와 변경 필드·snapshot hash를 append-only audit event로 남긴다. recipe catalog는 사용자 inventory workspace와 분리한다.
- 이유: 공개 레시피의 raw 재료 표현·이미지 이용조건·조리시간은 자동으로 확정할 수 없으며, 외부 데이터가 식품 lot의 소비기한이나 안전성을 보증하지 않기 때문이다.
- 변경 조건: 조직별 초대·role 변경·OAuth·다중 관리자 정책이 필요해지면 현재 bootstrap allowlist와 static migration fallback을 조직 권한 서비스로 교체한다.

## ADR-025 — 영수증 보관 추천은 서버 참고값, 보관 확정은 사용자 override

- 상태: `accepted`
- 결정: receipt draft는 상품명으로 계산한 `storage_suggestion`을 반환하되 이를 사용자 확정 보관 상태로 간주하지 않는다. review 화면은 line마다 `ambient`·`refrigerated`·`frozen`을 선택하게 하고, commit 시 `overrides.storage_type`을 lot에 기록한다.
- 날짜 없는 상품은 확정 날짜를 만들지 않고 선택된 보관 위치를 `estimated_use_first_window`의 입력으로만 사용한다. 보관 추천과 소비기한은 서로 다른 provenance다.
- receipt에 `purchased_at`이 있으면 이를 rule inference의 `reference_date`로 사용해 과거 구매를 오늘 구매로 재계산하지 않는다. 구매일이 없을 때만 현재 날짜를 사용한다.
- 이유: 같은 상품 유형도 구매 상태·판매 형태·사용자 실제 보관 위치가 다를 수 있으며, 모든 영수증 line을 냉장으로 저장하면 실온·냉동 제품의 우선순위가 왜곡된다. 반대로 상품명만으로 보관을 확정하면 사용자가 모르는 가정을 사실처럼 보게 된다.
- 경계: 현재 rule-based suggestion과 UI/API override는 테스트했지만, 제조사 라벨의 보관조건·사용자 custom location·관할별 rule snapshot은 운영 데이터로 추가 검증해야 한다.

## ADR-026 — 계정 인증 실패는 오프라인과 분리하고 CORS를 오류 응답까지 보장

- 상태: `accepted`
- 결정: 프론트는 HTTP 401을 status가 보존된 `MealApiError`로 처리한다. guest token은 한 번 재발급하지만 account token이 만료되면 workspace를 guest로 자동 전환하지 않고 `auth_required`와 재로그인 CTA를 표시한다.
- API의 CORS middleware는 auth/workspace short-circuit보다 바깥에 둔다. invalid-token 401에도 `Access-Control-Allow-Origin`, credentials, `X-Request-ID`를 유지해 브라우저가 인증 오류를 네트워크 오류로 오인하지 않게 한다.
- 이유: 오프라인 fallback과 인증 만료는 사용자 행동과 데이터 위험이 다르며, account workspace를 조용히 바꾸면 기록이 다른 공간에 저장될 수 있다.
- 경계: 현재 만료 token·CORS·재로그인 화면과 password reset core contract는 local API와 browser E2E로 검증했다. 외부 email provider delivery, OAuth, refresh-token rotation, HTTPS/secret manager 운영 주입은 별도 검증한다.

## ADR-027 — 사용자 재시도 가능한 storage mutation은 idempotency key로 재생

- 상태: `accepted`
- 결정: `POST /api/foods/{food_id}/storage-events`는 선택적 `Idempotency-Key`를 받는다. workspace와 key로 만든 deterministic event ID가 이미 있고 요청이 같은 의미면 기존 event를 그대로 반환하며, 같은 key로 다른 event를 요청하면 `409`로 거부한다. frontend는 이 key가 있는 storage mutation의 network failure를 동일 key로 한 번 재시도한다.
- 이유: 모바일 timeout은 서버가 작업을 완료한 뒤 response만 잃는 경우가 있다. 이동·개봉·소비·폐기가 새 event로 중복 기록되면 재고 수량과 Grocy outbox가 동시에 틀어질 수 있으므로, 사용자 행동 단위의 재시도 경계를 API에 둔다.
- 호환성: header가 없는 기존 요청은 기존 event 생성 경로를 유지한다. 식단 저장은 기존 `plan_id`, 식단 완료는 `already_completed`, 영수증은 fingerprint가 각각 별도 멱등 경계로 동작한다. 동일 날짜 확인은 같은 이미 확정된 payload를 다시 보내면 기존 FoodResponse를 반환한다.
- 경계: local SQLite·in-memory와 PostgreSQL compatibility/normalized event ID 흐름은 코드 계약과 API 테스트로 확인했지만, 여러 PostgreSQL process가 같은 key를 동시에 처음 처리하는 live race는 Docker 환경에서 추가 검증한다.

## ADR-028 — Web Push는 delivery outbox와 explicit worker로 분리

- 상태: `accepted`
- 결정: notification은 현재 workspace의 unread 상태와 push subscription에서 delivery record를 파생한다. 날짜 임박·날짜 의미 확인·포장지 보관조건 불일치(`storage_mismatch`)·Grocy 확인 필요를 현재 재고에서 계산하며, `notification-worker`는 명시된 workspace만 lease로 처리하고, API 내부 tick이 VAPID/pywebpush 전송·quiet hours·bounded retry·dead-letter·404/410 subscription 정리를 수행한다. API는 worker heartbeat와 delivery 상태를 readback한다.
- 안전 경계: `push_enabled=false`, subscription 없음, VAPID 설정 없음 중 하나라도 있으면 전송하지 않는다. payload에는 제목·확인 문구·stable tag·상대 경로만 넣고 OCR 원문·access token·endpoint를 넣지 않는다. private key와 worker token은 서버 환경에만 둔다.
- 이유: notification read model을 무기한 복제하지 않으면서도 retry와 process crash를 추적해야 하고, API request path에서 직접 push를 반복하면 사용자 요청 latency와 중복 전달이 섞이기 때문이다.
- 경계: local worker/provider contract와 SQLite/PostgreSQL projection schema는 검증했지만, 실제 browser push service 수신·VAPID 운영 key·외부 delivery response·다중 worker PostgreSQL race·timezone별 quiet hours는 아직 acceptance 전이다.

## ADR-029 — 제품 기준 정보 enrichment는 receipt commit과 분리

- 상태: `accepted`
- 결정: 영수증 OCR은 먼저 `ReceiptDraft`를 만들고, I1250 제품 기준 정보 조회는 별도의 `ProductEnrichmentJob`으로 요청한다. job은 `queued → in_flight → succeeded/dead_letter` 상태와 workspace별 lease·heartbeat를 가진다.
- worker는 제품 후보·`POG_DAYCNT`·보관 문구의 provenance만 receipt line에 추가한다. canonical 상품명·보관 위치·DateAssertion·StockLot을 자동 변경하지 않으며, 후보 적용과 commit은 사용자의 review action으로 남긴다.
- 실패: provider disabled/미설정은 job을 삭제하지 않고 queued 상태로 보존한다. timeout·rate limit·예외는 bounded retry/backoff 후 dead-letter로 격리하고 stale `in_flight`는 재처리 가능한 queued 상태로 복구한다.
- 연결: 별도 worker는 MFDS API key를 소유하지 않고 service-token API tick만 호출한다. API가 workspace store와 I1250 adapter를 소유하며, Compose `product-enrichment` profile은 명시된 workspace만 처리한다.
- 이유: 상품 API가 느리거나 외부 quota에 도달해도 사용자의 영수증 draft와 구매 기록은 지연 없이 살아 있어야 한다. 제품 기준 참고값과 개별 팩의 표시 날짜도 서로 다른 provenance로 유지해야 한다.
- 경계: local worker, SQLite persistence, FakeCursor/MockTransport, browser enqueue/polling contract는 검증했지만 실제 I1250 key·quota·PostgreSQL multi-process 경쟁·live worker container는 아직 acceptance 전이다.

## ADR-030 — backend priority inference는 설명 가능한 trace를 보존

- 상태: `accepted`
- 결정: 날짜가 없는 식품의 `estimated_use_first_window`에는 가능할 때 `provider`, `provider_version`, `rule_id`, `evidence_refs`, `reasoning`, 비민감 `input_sha256`를 함께 보존한다. 이 trace는 compatibility JSON projection과 normalized priority-window projection에 동일하게 기록한다.
- 안전 경계: trace와 confidence는 계산 과정을 설명할 뿐 식품 안전·섭취 가능 여부·개별 포장 소비기한을 의미하지 않는다. 입력이 부족하면 기존 abstain 경계를 유지하고 trace가 있다고 확정값으로 승격하지 않는다.
- 이유: 상품명·보관 방식·개봉 상태가 바뀌었을 때 왜 우선순위 범위가 달라졌는지 재현할 수 있어야 하고, 개발용 규칙을 관할 출처가 승인한 소비기한 데이터로 오해하지 않게 해야 한다.
- 경계: 현재 rule-assisted provider의 input hash·compatibility/normalized persistence·API readback contract는 검증했지만, 실제 관할 rule snapshot 승격·모델 trace backend·장기 보존정책은 운영 gate로 남긴다.

## ADR-031 — guest 기록은 자동 merge하지 않고 명시적 account transfer로 복사

- 상태: `accepted`
- 결정: 회원가입으로 새 account workspace가 만들어질 때 기존 guest token에 기록이 있으면 먼저 preview를 보여주고, 사용자가 승인한 `confirm=true` 요청만 source workspace의 업무 데이터를 target account workspace로 복사한다. source는 삭제하지 않는다.
- 안전 경계: target workspace에 이미 다른 기록이 있으면 `409`로 멈춘다. source와 target의 transfer snapshot fingerprint가 동일한 재요청만 `already_transferred`로 처리하며, import 뒤 source 내용이 바뀌면 같은 ID라도 `409`로 멈춘다. transfer preview 자체는 write를 수행하지 않는다.
- UX: 사용자가 즉시 가져오지 않으면 guest token과 target workspace ID를 브라우저의 pending 상태로 보관하고, 동일 account workspace로 다시 들어왔을 때만 재확인한다. 다른 account에는 보류 transfer를 노출하지 않는다.
- 이유: 첫 실행의 guest 기록을 잃지 않으면서도 계정 데이터와 무관한 기록을 조용히 섞으면 안 된다. 명시적 승인·원본 보존·충돌 거절을 조합하면 사용자가 데이터 이동 범위를 이해하고 재시도할 수 있다.
- 경계: local SQLite/API와 browser E2E는 검증했지만, live PostgreSQL 다중 process 동시 transfer, 계정 삭제·복구 시 pending token 정리, 브라우저 storage 정책별 복구는 운영 acceptance에서 추가한다.

## ADR-032 — recipe alternatives는 preview-only로 제공

- 상태: `accepted`
- 결정: 현재 재고와 조리시간으로 최대 3개의 서로 다른 recipe 후보를 계산하는 `POST /api/meal-plans/options`를 추가하되, 후보 조회와 선택은 저장하지 않는다. 사용자가 선택한 후보만 기존 `POST /api/meal-plans`를 통해 workspace plan으로 저장한다.
- 안전 경계: 대안도 동일한 canonical alias·단위·수량·우선순위·missing ingredient 규칙을 사용하며, 부족한 재료를 재고에 만들지 않는다. 10분처럼 시간·단위 조건을 만족하는 후보가 하나뿐이면 빈 대안 상태를 보여준다.
- 저장 경계: 사용자가 대안 또는 다일 날짜를 선택해 단일 식단으로 저장할 때 `recipe_id`와 snapshot을 함께 보내며, 서버가 선택 후보를 다시 검증한다. 표시용 available quantity의 변동은 snapshot 충돌로 보지 않지만 allocation은 조리 완료 시 live lot 수량으로 재검증한다.
- 이유: recipe catalog가 커져도 첫 추천을 강제로 바꾸지 않고, 사용자가 다른 메뉴를 선택할 수 있게 하면서 저장·소비·audit 경계를 기존 단일 plan 계약으로 유지한다.
- 경계: 현재 최대 3개 단일 meal preview이며, 다일 식단·재료 재사용 최적화·사용자 선호 학습은 별도 기능이다.

## ADR-033 — 3일 식단은 명시적 bundle 저장으로만 영속화한다

- 상태: `accepted`
- 결정: `POST /api/meal-plans/multi-day-preview`는 계속 side-effect-free로 유지하고, 사용자가 저장 버튼을 누른 경우에만 `POST /api/meal-plans/multi-day`가 bundle을 workspace에 저장한다. bundle은 날짜별 plan과 `snapshot_hash`를 함께 보존하지만, 하위 plan을 단일 meal history에 자동 추가하거나 재고를 차감하지 않는다.
- 재시도: 프론트는 preview id를 `bundle_id`로 재사용한다. 같은 bundle id와 snapshot의 재요청은 기존 결과를 반환하고, 다른 snapshot을 같은 id로 덮어쓰려는 요청은 `409`로 거절한다.
- 복원: `GET /api/meal-plans/multi-day/latest`와 `GET /api/meal-plans/multi-day/history`는 현재 workspace 범위에서만 저장 bundle을 반환한다. 재진입 시 현재 재고·조리 시간·snapshot이 일치할 때만 latest를 화면에 복원한다.
- 저장소: SQLite compatibility store와 PostgreSQL workspace projection에 별도 `multi_day_meal_plans` 컬렉션/테이블을 둔다. workspace export와 명시적 guest→account transfer 대상에도 포함한다.
- 진행 상태: bundle day는 `planned`·`saved`·`completed`와 연결된 단일 `meal_plan_id`·`completed_at`을 보존한다. 단일 plan completion 성공 시 같은 bundle day를 완료로 갱신하고, 완료된 날짜는 새 단일 plan으로 다시 연결하지 않는다.
- 이유: 미리보기 계산과 사용자의 데이터 생성 의사를 분리해야 하며, 모바일 네트워크 재시도에서 같은 3일 계획이 중복 생성되거나 다른 재고 snapshot으로 조용히 덮어써지면 안 된다.
- 경계: local SQLite/API·browser E2E·PostgreSQL FakeCursor 계약은 검증하지만, live PostgreSQL migration/apply와 bundle 하위 plan의 일괄 완료·영양/예산 최적화는 별도 운영 gate다.

## ADR-034 — 장보기 목록은 명시적 source 동기화로 관리한다

- 상태: `accepted`
- 결정: 저장된 단일 식단 또는 multi-day bundle에서 사용자가 버튼을 눌렀을 때만 부족 재료를 workspace shopping list에 추가한다. preview나 recipe 계산만으로 구매 목록을 만들지 않는다.
- 데이터: 항목은 `canonical_name + unit`으로 stable ID를 만들고, 여러 recipe source의 기여량을 `sources`에 보존한다. bundle source는 날짜별 `day_index`를 함께 기록한다.
- 재동기화: 같은 source를 다시 추가하면 기존 source 기여를 교체해 중복을 막는다. `GET /api/shopping-list`도 source의 현재 재고 가용성을 재검증해 보유하게 된 기여를 자동 제거하고, 다른 source 기여는 유지한다.
- 직접 추가: 식단과 무관한 물건은 `POST /api/shopping-list/manual`로 `manual` source를 만든다. 같은 `canonical_name + unit`이면 manual 기여만 absolute upsert하고 recipe source 기여는 보존하며, recipe reconciliation은 manual source를 건드리지 않는다.
- 입고 확인: 사용자가 장보기 항목에서 구매 수량과 보관 위치를 확인하면 `POST /api/shopping-list/{item_id}/receive`가 기존 lot을 덮어쓰지 않는 새 inventory lot을 생성한다. 같은 요청에서 recipe/multi-day source를 재동기화하고, 충족된 계획 source는 제거하며, manual source는 필요하면 `checked` 이력으로 남긴다. `Idempotency-Key`가 있으면 같은 입고를 replay해도 lot이 중복 생성되지 않는다.
- 안전 경계: 장보기 목록과 입고 확인은 소비기한 확정·안전 판정·구매 주문·결제 상태가 아니다. 입고 lot의 `purchased_at`과 사용자가 고른 보관 위치는 기록하지만 실제 포장지 날짜는 자동으로 만들지 않고, 상품명·보관 위치 기반 AI 값은 소비 우선순위 참고값으로만 표시한다.
- 저장소: SQLite `shopping_list`와 PostgreSQL `rescue_api_shopping_list` projection을 사용하며 export·guest transfer에 포함한다.
- 이유: recipe 부족 재료를 실제 구매 후 재고로 연결하되, AI나 planner가 구매 사실·소비기한·안전·결제를 자동 확정하지 않게 하기 위해서다. lot 단위 입고와 idempotency를 사용해 기존 재고 손실과 네트워크 재시도 중복을 함께 막는다.
- 경계: local HTTP·SQLite reconstruction·browser UI·PostgreSQL contract는 검증하지만 실제 마켓 cart 연동·가격·재고 availability·결제는 별도 범위다.

## ADR-035 — 알레르기 회피는 workspace preference와 metadata abstain으로 처리한다

- 상태: `accepted`
- 결정: 사용자가 선택한 주요 알레르기 회피 항목을 `MealPreferences`로 현재 workspace에 저장하고, 단일 recipe preview·대안 메뉴·3일 preview·저장 검증에 같은 planner filter를 적용한다. planner는 recipe metadata와 회피 항목의 교집합이 있는 후보를 제외한다.
- metadata: 팀 작성 starter recipe는 canonical ingredient와 검토된 제목·조리 단계의 curated rule로 `allergens`를 계산한다. 재료 배열에서 빠진 소스 표현도 보수적으로 포착하기 위한 규칙이다. 외부 recipe는 review를 통과해도 `allergens`가 명시되지 않으면 `unknown`으로 남긴다. 회피 조건이 있는 동안 unknown recipe를 안전하다고 가정하지 않고 후보에서 제외한다.
- 응답: `MealPlanResponse`는 `allergens`, `allergen_metadata_status`, `preference_filtered`, `preference_note`를 보존한다. `known`은 현재 metadata가 확인되었다는 뜻이고 `allergens=[]`는 알레르기 없음·교차 접촉 없음·섭취 가능을 의미하지 않는다.
- 안전 경계: 이 기능은 선호 기반 후보 필터일 뿐 의료 프로필, 식품 안전, `safe_to_eat`, 소비기한 판정이 아니다. 라벨의 미량 성분·교차 접촉·제조시설 정보가 없는 경우도 있으므로 UI와 문서에 명시적 면책을 표시한다.
- 저장/이전: SQLite `meal_preferences`와 PostgreSQL `rescue_api_meal_preferences`(migration 008)에 workspace 범위로 저장한다. export에는 포함하고, guest transfer preview/import에도 변경 여부와 반영 여부를 별도 field로 표시한다. 중복 code는 서버에서 제거하고 고정 순서로 정규화한다.
- 이유: 상품명·recipe 제목만으로 알레르기 안전을 확정하면 위험한 false negative가 생길 수 있다. 알려진 metadata만 사용하고 모르는 후보를 보류하는 쪽이 사용자에게 설명 가능하며, 이후 외부 recipe provider를 추가해도 안전 경계를 유지한다.
- 경계: curated starter recipe·SQLite/API·browser UI·PostgreSQL FakeCursor 계약은 검증했지만, 외부 recipe별 allergen label coverage, `may contain`·교차 접촉 semantics, 관할별 법정 항목, 도메인/법무 검토, live PostgreSQL과 실기기 acceptance는 남아 있다.

## ADR-036 — 계정 삭제는 재인증 후 durable fence 아래 workspace purge와 credential 삭제를 분리한다

- 상태: `accepted`
- 결정: account settings의 계정 삭제는 현재 비밀번호와 정확한 `DELETE` 확인 문구를 요구한다. 확인이 끝나면 auth repository가 account row를 `active → deleting`으로 원자적으로 고정한 뒤 현재 account workspace를 tenant 범위로 purge하고, password reset token과 account credential을 삭제한다. account row는 마지막 단계까지 남겨 실패나 process crash 뒤 같은 session의 delete 요청이 재개될 수 있게 한다.
- 안전 경계: 기본 UI는 접혀 있으며 두 조건이 맞을 때만 제출한다. guest token은 `403`, 비밀번호가 틀리면 `401`, 확인 문구가 틀리면 `422`로 중단한다. `deleting` 중 일반 account/workspace 요청은 `423 account_deletion_in_progress`로 차단하고 같은 session version의 delete 요청만 허용한다. default demo workspace와 shared recipe catalog는 이 endpoint의 삭제 대상이 아니다.
- 저장소: in-memory/SQLite/PostgreSQL store는 fixture를 복원하지 않는 purge 경로를 사용한다. PostgreSQL은 compatibility와 normalized inventory projection을 `workspace_id` 조건으로 지우고, account auth row는 `021_account_deletion_fence.sql`의 상태·시각 필드와 별도 transaction으로 lifecycle을 보존한다. workspace write guard가 `deleting` 상태의 일반 flush/provision/mutation을 fail closed한다.
- 세션: `deleting` 중 기존 account token은 일반 API에 접근하지 못하고, 최종 account row가 삭제되면 context 검증이 실패해 `401`이 된다. 복구 화면이 상태를 잃지 않도록 `GET /api/auth/me`만 workspace 데이터를 열지 않고 `account_status=deleting`을 반환한다. 프론트는 성공 후 pending guest transfer와 account token을 제거하고 새 guest workspace로 전환한다.
- 이유: 영수증 원문 비식별화만으로는 계정 전체 삭제 요구를 충족하지 못한다. 비밀번호 재확인과 명시 문구, workspace 범위 purge를 함께 두어 실수와 다른 tenant 삭제 위험을 줄인다.
- 경계: local/in-memory/SQLite/API·browser confirmation·failure retry 계약과 PostgreSQL schema/adapter contract는 검증하지만, auth DB와 workspace DB의 distributed transaction, PostgreSQL live multi-process purge/crash acceptance, backup/WAL/object storage/Grocy retention과 법적 삭제기한은 운영 정책으로 남긴다.

## ADR-037 — 첫 화면 성능을 위해 app-owned animation과 sheet mount를 분리한다

- 상태: `accepted`
- 결정: `Prototype.tsx`의 Rescue Queue 카드·toast animation은 `motion/react` 직접 import 대신 CSS animation으로 유지하고, phone-scoped `BottomSheet`는 실제 첫 open 전에는 mount하지 않는다. sheet 내부의 data-heavy component는 기존 lazy boundary를 유지한다.
- 접근성: `prefers-reduced-motion: reduce`에서는 카드/toast animation을 비활성화한다. sheet를 한 번 연 뒤에는 닫혀도 mounted state를 유지해 기존 exit animation·keyboard·portal 계약을 깨지 않는다.
- 결과: initial client JS가 501,488 bytes에서 474,327 bytes로 줄어 500KB advisory 아래가 됐다. CSS는 88,227 bytes로 늘었고 gzip은 149.64KB다.
- 경계: protected `mobile/index.ts`가 `BottomSheet`를 정적으로 export하므로 Vite가 `INEFFECTIVE_DYNAMIC_IMPORT` warning을 출력한다. 따라서 BottomSheet module이 완전히 별도 network chunk가 됐다고 주장하지 않고, mount 지연과 app-owned motion 제거만 성능 증거로 인정한다.
- 이유: 첫 화면에서 사용하지 않는 sheet/animation runtime이 초기 상호작용을 지연시키지 않아야 하며, protected mobile runtime을 수정하지 않고도 제품 UI의 개성을 유지해야 한다.
- 검증: `npm run check:runtime`, `npm run build`, demo/prototype·mobile runtime 22개, connected E2E 34개, Sites 4개와 bundle readback을 통과했다.

## ADR-038 — 날짜가 임박한 lot는 planner에서 조리 전 확인을 요구한다

- 상태: `accepted`
- 결정: planner가 recipe allocation을 구성한 뒤, 실제 사용될 lot 중 오늘/지난 `use_by`·`sell_by`·`best_before` 또는 의미가 불완전한 `unknown`·`production_date`·`packaging_date`를 `date_review_required`로 표시한다.
- 안전 경계: 이 상태는 확인 안내일 뿐 소비기한 재추정, `safe_to_eat` 판정, 자동 폐기·재고 차감을 수행하지 않는다. `sell_by`와 `best_before`도 종류를 바꾸지 않고 원래 표시 의미를 보존한다.
- 응답: `MealPlanResponse`에 `date_review_required`, `date_review_foods`, `date_review_note`를 보존하며 recipe allocation에 들어간 food만 목록에 포함한다. 단일 preview·options·multi-day preview·저장 plan에 동일한 필드를 적용한다.
- 이유: 먼저 먹을 식품을 추천하는 서비스가 표시 날짜 확인이 필요한 lot를 아무 설명 없이 조리 대상으로 보여주면 사용자가 경고를 놓칠 수 있다. 다만 날짜가 지났다는 사실만으로 앱이 안전 결정을 대신하지 않도록 advisory gate로 제한한다.
- 경계: 고정 date fixture·API·SQLite/browser UI는 검증하지만 관할별 표시 규칙, 사용자 실제 보관 온도, 포장 훼손·부패 여부, 실기기 알림·도메인 안전 검토는 별도 운영 gate다.

## ADR-039 — 홈의 빈 상태는 다음 행동을 명시하고 데모 고정 문구를 제거한다

- 상태: `accepted`
- 결정: API workspace가 비어 있거나 보관 위치 필터에 결과가 없을 때 홈은 빈 목록만 보여주지 않고, 첫 식품 추가·전체 목록 복귀처럼 현재 상태를 해결하는 CTA를 함께 제공한다. 우선 식품이 없을 때도 Rescue Queue의 이유와 다음 확인 방법을 안내한다.
- 카피: 홈 날짜 eyebrow는 브라우저 로컬 현재 날짜를 사용하고, 자정이 지나면 분 단위 ticker로 갱신한다. 식단 CTA의 보조 문구는 실제 `priorityFoods`에서 생성하며, 특정 개발자 이름이나 고정 식품명을 사용자 화면에 박아 넣지 않는다.
- 안전 경계: 빈 상태 CTA는 식품을 자동 생성하거나 planner 결과를 가장하지 않는다. 식품이 없을 때 식단 CTA는 영수증 입력으로 연결하고, 보관 위치 필터 결과가 없을 때는 필터를 해제하거나 새 식품을 추가하게 한다.
- 이유: 새 account workspace의 첫 화면이 조용히 비어 있으면 사용자는 서비스가 고장 났는지 시작 방법을 모른다. 정적 날짜·개발용 이름·fixture 식품명도 시간이 지나거나 다른 사용자에게 노출되면 상용앱 신뢰를 떨어뜨린다.
- 경계: app-owned `Prototype.tsx`·`prototype.css`와 browser E2E에서 검증하며, 사용자 프로필/닉네임 동기화는 별도 기능으로 남긴다. protected mobile runtime은 수정하지 않는다.
- 검증: empty connected workspace E2E, demo 현재 날짜 eyebrow assertion, connected E2E 전체, production build와 `npm run check:runtime`을 통과한다.

## ADR-040 — 날짜 확인 경계는 planner뿐 아니라 홈과 상세에도 반복한다

- 상태: `accepted`
- 결정: planner의 `date_review_required`와 같은 의미를 홈 Rescue Queue 카드, 재고 목록, 식품 상세에 일관되게 표시한다. 오늘/지난 `use_by`·`sell_by`·`best_before`는 `조리 전 날짜 확인`, `unknown`은 `날짜 확인 필요`, `production_date`·`packaging_date`는 `날짜 의미 확인`으로 표현한다.
- 표시 원칙: 목록은 사용자가 위험 신호를 놓치지 않도록 확인 상태를 우선 표시하고, 상세는 포장지 날짜·보관 상태·개봉 여부를 다시 확인할 문구를 제공한다. 표시 날짜 종류와 원래 날짜 값은 상세의 date proof에 계속 보존한다.
- 안전 경계: 확인 상태는 소비기한 만료·섭취 불가·부패를 판정하지 않는다. estimated priority와 user reminder는 실제 표시 날짜 경고로 변환하지 않으며, 확인 안내가 자동 폐기·재고 차감·`safe_to_eat`를 만들지 않는다.
- 이유: 사용자는 planner보다 홈 재고 목록과 Rescue Queue를 먼저 보는 경우가 많다. 한 화면에서만 날짜 주의를 보여주면 같은 식품이 다른 화면에서 확정값처럼 읽힐 수 있으므로 동일한 safety vocabulary를 반복한다.
- 경계: frontend의 `FoodItem.dateAssertionKind`와 표시 날짜를 기준으로 한 UI advisory이며, 실제 포장 상태·온도·부패·관할 규정 판정은 서비스 책임 범위 밖이다. PostgreSQL/Grocy live와 실기기 카메라·도메인 검토는 별도 gate다.
- 검증: demo overdue printed date, connected unknown fixture, detail callout, demo/prototype 15개, connected 38개, production build readback을 통과한다.

## ADR-041 — 재고 검색은 연결 모드 server bounded page와 demo fallback으로 제공한다

- 상태: `accepted`
- 결정: 홈 재고 목록에 상품명·브랜드·카테고리를 검색하는 `KeyboardInput`을 제공하고, 보관 위치 필터와 함께 적용한다. 연결 모드에서는 workspace-scoped `GET /api/inventory/search`가 bounded page를 반환하고, PostgreSQL projection은 migration `009_inventory_search.sql`의 `search_text`·`pg_trgm` index를 사용한다. 결과가 없으면 검색 조건 초기화 CTA를 보여준다. 데모/오프라인 fixture에서는 이미 받은 dashboard inventory를 로컬에서 좁힌다.
- 안전 경계: 검색은 재고를 만들거나 삭제하지 않고, 날짜·보관·lot provenance·Rescue Queue를 변경하지 않는다. 검색 결과 0개는 재고 없음이 아니라 현재 조건과 일치하는 항목이 없다는 뜻이다.
- UX: 모바일 키보드 runtime과 연결된 입력을 사용하고 blur 시 keyboard를 숨긴다. 검색어를 지우는 버튼과 모든 검색 조건을 초기화하는 버튼을 분리해 결과 복구 경로를 명확히 한다.
- 이유: 실제 사용량이 늘어나면 보관 위치 필터만으로는 원하는 식품을 찾기 어렵다. 검색 조건을 서버에서 workspace 경계 안에 적용하고 응답을 bounded page로 제한하면 connected mode의 전송량과 결과 복구를 제어할 수 있으며, demo/오프라인은 기존 fixture UX를 잃지 않는다.
- 경계: SQLite·demo adapter는 workspace snapshot을 materialize하지만, PostgreSQL adapter는 workspace-scoped `search_text` projection에 DB filter·count·bounded page를 위임한다. normalized mode는 현재 호환 projection과 dual-write하며, 외부 normalized-only write의 projection consistency, 실제 `EXPLAIN`·latency, cursor pagination·검색 ranking은 live 운영 gate다. protected mobile runtime은 수정하지 않는다.
- 검증: API inventory search filter/page metadata, PostgreSQL FakeCursor의 workspace/storage/search_text SQL contract, live HTTP `q=두부` readback, connected UI의 server result·2페이지, demo local search·검색 결과 없음·초기화, `npm run build`, `npm run check:runtime`, connected/demo 회귀를 통과한다. 실제 PostgreSQL apply/readback은 Docker daemon 부재로 미검증이다.

## ADR-042 — 영수증 원본 대조는 상품 line safe bbox overlay로 제한한다

- 상태: `accepted`
- 결정: 이미지 영수증 intake가 성공하면 상품 line에 연결된 observation의 stable ID·confidence·0~1 정규화 bbox만 `review_observations`로 반환한다. `ReceiptLineDraft.source_observation_ids`가 line과 위치를 연결하고, 웹 review는 원본 `blob:` preview의 실제 aspect ratio 안에서 선택 line의 위치를 강조한다.
- 개인정보 경계: OCR `text` 전체를 overlay payload로 다시 보내지 않는다. 상품 line으로 분류되지 않은 전화번호·주소·결제 정보의 observation은 응답에서 제외하며, 원본 이미지 bytes도 저장하지 않는다. normalized PostgreSQL projection은 migration `010_receipt_review_locations.sql`로 safe ID 연결만 보존한다.
- 안전 경계: bbox highlight는 OCR이 정확하다는 증거나 소비기한·섭취 가능·식품 안전 판정이 아니다. label/date는 별도 safe source-link 계약(ADR-043)을 사용하며, 실제 매장 template annotation과 field별 위치 정확도는 별도 검증 대상이다. 위치가 없거나 비정상인 bbox는 UI에서 버린다.
- 이유: 사용자가 OCR 후보와 영수증 원본을 빠르게 대조할 수 있게 하면서도, 영수증의 민감한 텍스트를 새로운 공개 응답 표면에 복제하지 않기 위해서다. ID와 위치를 분리하면 parser가 line을 합치는 방식이 바뀌어도 review 연결 계약을 유지할 수 있다.
- 경계: local/remote OCR adapter·API·SQLite/normalized projection contract·connected browser fixture는 검증하지만, 실제 매장별 annotation 정확도, 카메라 crop/원근 보정, label/date field별 pixel 정확도, live PostgreSQL migration은 별도 운영 gate다.

## ADR-043 — 라벨 날짜 후보는 safe source link로만 원본 위치를 강조한다

- 상태: `accepted`
- 결정: 이미지 라벨 intake가 날짜 후보를 만들면 후보의 `source_observation_ids`와 `review_observations`의 id·confidence·0~1 정규화 bbox만 연결한다. 숫자 observation과 날짜 후보가 보수적으로 매칭되지 않으면 빈 source link를 유지하고 위치를 추측하지 않는다.
- 의미 경계: `packaging_date`·`production_date`는 `consumption_date_candidate`로 승격하지 않는다. `use_by`·`sell_by`·`best_before`도 OCR 후보 상태를 유지하며 사용자가 원본 라벨과 날짜 의미를 확인해야 저장할 수 있다.
- 개인정보 경계: label overlay payload에는 OCR `text`를 넣지 않으며, 원본 라벨은 브라우저의 transient `blob:` URL로만 대조한다. 서버는 날짜 후보 response의 기존 검토용 문맥과 overlay 위치 계약을 분리한다.
- 이유: 작은 가격표·포장 라벨에서 날짜 숫자와 인접한 중량·상품 코드가 혼동될 수 있으므로, 사용자가 원본 영역과 의미를 동시에 확인하게 하되 시스템이 소비기한을 추측하거나 안전을 보증하지 않게 하기 위해서다.
- 검증: 실제 사장님 제공 라벨에서 `packaging_date=2017-06-28`, `source_observation_ids=["obs-11"]`, `consumption_date_candidate=null` readback, API safe payload test, connected browser active bbox test를 통과한다. 실제 매장별 annotation dataset과 실기기 camera crop은 운영 acceptance gate다.

## ADR-044 — 개봉일은 lot의 최초 상태 전이로 고정하고 추정 기준에만 사용한다

- 상태: `accepted`
- 결정: `opened` storage event의 `occurred_at`을 unopened lot의 최초 `opened_at`으로 저장한다. 같은 lot에 반복 개봉 요청이 들어와도 최초 시각을 유지하며, SQLite JSON·PostgreSQL normalized lot·compatibility projection이 같은 값을 보존한다.
- 부분 수량: 일부만 개봉하면 parent lot의 수량과 unopened 상태를 유지하고, 새 child lot에만 `opened=true`·`opened_at=event.occurred_at`을 기록한다. 이미 개봉된 lot을 이동·분할할 때는 child가 기존 최초 개봉 시각을 상속한다.
- 이력 조회: partial event의 주체는 수량을 분리한 parent로 유지하되, `GET /api/foods/{child_food_id}/storage-events`는 child를 생성한 event도 함께 반환해 child 상세에서 개봉 출처를 확인할 수 있게 한다.
- 추론 경계: 표시 날짜가 없는 lot의 `estimated_use_first_window`만 첫 개봉일을 기준일로 사용해 개봉 후 우선순위를 계산한다. 라벨·GS1·사용자 확인 날짜는 덮어쓰지 않으며, 추정 결과는 소비기한·안전 판정·`safe_to_eat`로 승격하지 않는다.
- 이유: `opened=true`만 저장하면 구매일과 개봉일이 다른 식품의 우선순위가 틀어지고, 부분 개봉에서는 어느 lot이 실제 개봉됐는지 잃어버린다. 이벤트 시각과 상태 필드를 한 transaction 경계에서 함께 보존하면 재시작·재시도·audit에서 동일한 lifecycle을 재현할 수 있다.
- 검증: `InventoryRepository` full/partial/repeat-open invariant, inference opened-date anchor, API first-open readback, SQLite reconstruction, normalized PostgreSQL write/load contract, disposable PostgreSQL apply/readback과 process restart, migration dry-run, connected detail UI 48개와 TypeScript 검증을 통과한다. 운영 PostgreSQL backup/restore·다중 process race·Grocy 외부 open semantics·실기기 acceptance는 별도 운영 gate다.

## ADR-045 — 알림 날짜와 quiet hours는 사용자 timezone을 함께 사용한다

- 상태: `accepted`
- 결정: `NotificationPreferences`에 IANA `timezone`을 저장하고, 앱 내 알림·planner 날짜의 현재 날짜 경계와 Web Push delivery worker의 quiet-hours 비교에 같은 timezone을 사용한다. 기본값은 한국 서비스 기준 `Asia/Seoul`이며 notification record의 저장 시각은 UTC로 유지한다.
- 검증: 잘못된 timezone은 API `422`로 거부하고, UTC `2026-09-03T15:30Z`를 한국 시간 `2026-09-04T00:30`으로 변환하는 날짜 경계와 UTC `13:30Z`를 한국 시간 22:30으로 해석하는 `22:00~07:00` quiet-hours를 unit/worker test와 connected settings UI에서 확인한다.
- 이유: 서버 UTC 시각만 비교하면 한국 사용자의 자정·조용한 시간이 어긋나 알림이 하루 늦거나 밤에 전달될 수 있다. 날짜 계산과 전달 억제를 동일한 사용자 설정으로 묶어야 앱 알림과 push 알림이 서로 다른 시각을 가리키지 않는다.
- 경계: 현재는 선택된 timezone을 저장·검증하고 브라우저의 현재 timezone을 저장 전 draft action으로 제안하며, API image의 explicit `tzdata`로 IANA DB 의존성도 보장하는 기능이다. 자동 저장 policy·서머타임 전환별 device acceptance·다중 기기별 timezone 정책·push provider 전달은 별도 운영 검증 대상이다.

## ADR-046 — 상품 provenance 현재값과 변경 audit를 분리한다

- 상태: `accepted`
- 결정: 바코드·영수증 후보를 lot에 적용할 때 `FoodResponse.product_provenance`에는 현재 상품 source snapshot만 저장하고, 적용·교체·제거는 별도의 workspace-scoped append-only before/after event로 기록한다. 상품 source는 개별 포장 `DateAssertion`과 별개다.
- 후보 승격: receipt commit에서는 최종 canonical 상품명과 정확히 일치하는 후보만 lot provenance로 승격한다. 사용자가 후보와 다른 상품명을 입력하면 stale candidate와 provenance를 제거하고, 외부 source가 확인한 것처럼 남기지 않는다.
- 사용자 제어: 식품 상세의 `상품 출처 다시 확인`은 상품명·수량·날짜를 바꾸지 않고 현재 provenance만 제거한다. 제거 전 snapshot은 `removed` event의 `before`에 남겨 사용자가 변경 이유를 확인할 수 있다.
- 저장소: SQLite는 append-only audit payload table, PostgreSQL은 migration `015_product_provenance_audit.sql`의 `(workspace_id, id)` projection과 food/time index를 사용한다. 일반 flush는 기존 event를 삭제하지 않으며, export·guest transfer·account purge 경계를 함께 적용한다.
- 이유: 현재 source만 덮어쓰면 후보 교체·수동 수정·잘못된 source 제거의 원인을 재현할 수 없다. 반대로 날짜 assertion에 source를 섞으면 상품 식별과 개별 포장 날짜를 혼동하므로 두 문제를 분리한다.
- 경계: audit는 후보 선택의 설명 가능성을 제공할 뿐 상품 최신성·소비기한·섭취 안전을 보증하지 않는다. 실제 provider 변경·운영 retention·backup/WAL·다중 process failover·실기기 acceptance는 별도 gate다.

## ADR-047 — 저장된 lot의 상품 프로필 correction은 날짜·재고 상태와 분리한다

- 상태: `accepted`
- 결정: 사용자가 식품 상세에서 canonical 상품명·브랜드·분류를 직접 고칠 수 있게 하되, 수정 범위는 상품 프로필 필드로 제한한다. 수량·단위·구매일·보관 상태·개봉 상태·포장지 `DateAssertion`은 이 요청에서 변경하지 않는다.
- provenance 무효화: 현재 `product_provenance`가 있으면 상품 identity가 바뀌었을 가능성이 있으므로 현재 snapshot을 제거한다. 제거는 별도의 `ProductProvenanceAuditEvent(action=removed)`로, 프로필 전후 값은 `FoodProductInfoAuditEvent`로 저장해 두 원인을 혼동하지 않는다.
- 저장 경계: profile update, provenance removal, before/after audit, priority 재계산과 durable flush를 하나의 workspace write로 처리한다. no-op 요청은 event를 만들지 않으며, PostgreSQL revision 충돌은 stale write를 거절한다.
- UX: 상품 정보 수정 화면은 사용자가 직접 확인한 값이라는 점과 기존 source가 제거된다는 점을 먼저 알리고, 저장 후 상품 정보 변경 이력에서 어떤 필드가 바뀌었는지 보여준다. 이 화면은 소비기한·섭취 안전을 판정하는 기능이 아니다.
- 이유: 상품 master 후보의 이름이 잘못됐을 때 날짜나 재고 상태까지 재생성하면 사용자 확인값을 잃을 수 있다. identity correction과 package-specific date/storage state를 분리해야 자동 추론의 안전 경계를 지킬 수 있다.
- 검증: API correction contract, SQLite reconstruction, PostgreSQL FakeCursor contract, disposable PostgreSQL normalized migration `001→017`·API restart·direct SQL readback, connected browser 48개, runtime integrity와 production build를 통과한다. 운영 backup/restore·다중 process race·실제 provider 최신성은 별도 gate다.

## ADR-048 — 표시 날짜가 전제하는 보관조건은 advisory mismatch로만 표시한다

- 상태: `accepted`
- 결정: 라벨 OCR이 `냉장·냉동·실온` 보관조건을 읽으면 `DateAssertion.applicable_storage_type`과 선택적인 `storage_condition_text`에 함께 보존한다. 이 값은 실제 온도 측정값이나 소비기한 계산 결과가 아니다.
- 비교: 식품 상세의 현재 선택 위치와 날짜 assertion의 보관조건이 다르면 `포장지 보관조건과 현재 위치가 달라요` 경고를 표시한다. 사용자가 저장 전 위치를 바꿔도 원래 표시 날짜·날짜 종류·확인 상태는 자동으로 변경하지 않는다.
- planner: recipe에 실제 allocation된 lot 중 같은 불일치가 있으면 `date_review_required`와 `date_review_foods`에 포함하고 `date_review_note`를 보관조건 확인 문구로 바꾼다. 추천 자체를 숨기거나 조리를 자동 차단하지 않는다.
- 제품 후보와 구분: `ProductProvenance.storage_hint`는 상품 master 후보의 보조 힌트이므로 더 약한 안내로 표시한다. 라벨의 날짜 assertion 조건과 product master 후보 조건을 한 source로 합치지 않는다.
- 저장: SQLite JSON payload와 PostgreSQL normalized date assertion projection이 두 필드를 함께 보존한다. migration `017_date_storage_condition.sql`과 readiness gate로 기존 volume의 누락 schema를 fail-closed 처리한다.
- 이유: 냉장·실온 보관은 같은 상품의 실제 품질 유지 조건을 바꿀 수 있지만, 앱이 위치 차이만으로 소비기한을 다시 계산하면 잘못된 확정값이 된다. 사용자에게 원본 조건과 현재 상태의 차이를 알려 확인 행동만 유도한다.
- 경계: 현재는 OCR/label fixture·API·SQLite/normalized persistence·connected 상세 UI·`storage_mismatch` notification navigation을 검증한다. 실제 냉장고 온도, 포장 훼손·개봉 후 조건, 관할별 보관 문구 해석과 안전 판단은 앱이 대신하지 않으며 별도 도메인 검토 대상이다.

## ADR-049 — PostgreSQL migration은 ledger와 checksum drift guard를 사용한다

- 상태: `accepted`
- 결정: 기존 PostgreSQL volume의 schema 상태를 Docker init SQL 재실행 여부로 추측하지 않는다. `infra/postgres/migrate.sh --apply`가 `rescue_schema_migrations`에 migration 파일명·SHA-256·적용 시각을 기록하고, 같은 checksum의 migration은 건너뛰며 기록된 checksum과 현재 파일이 다르면 migration body를 실행하기 전에 중단한다.
- 적용: ledger가 없는 기존 volume은 backup·target DSN·현재 schema를 검토한 뒤 명시적인 `--apply`로 ordered 001→017을 bootstrap한다. migration 파일은 이미 적용된 뒤 수정하지 않고, schema 변경은 새 additive migration과 새 checksum으로 추가한다. `--dry-run`은 여전히 DB에 연결하지 않고 순서와 현재 파일 checksum만 출력한다.
- 안전 경계: ledger 기록은 애플리케이션 request나 startup DDL이 아니라 운영 migration command의 책임이다. migration body가 성공한 뒤 ledger row를 기록하며, command가 그 사이 중단되면 다음 실행은 idempotent body를 다시 확인한 뒤 ledger를 기록한다. checksum drift를 억지로 업데이트하거나 자동으로 기존 migration을 덮어쓰지 않는다.
- 이유: 새 volume에서는 모든 init SQL이 실행되지만 기존 volume에서는 init SQL이 다시 실행되지 않는다. ledger와 drift guard를 두면 배포 담당자가 어떤 파일이 적용됐는지 확인할 수 있고, 과거 migration을 조용히 수정해 환경별 schema가 달라지는 사고를 먼저 차단한다. 이 Module은 적용 순서·checksum·재실행 정책을 작은 Interface 뒤에 숨겨 migration 변경의 Locality와 운영 Leverage를 높인다.
- 검증: disposable PostgreSQL에서 최초 apply 001→017·두 번째 apply의 17개 skip·의도적으로 변조한 ledger checksum에 대한 사전 drift 차단을 통과한다. 실제 운영 backup/restore cutover·object storage retention·다중 runner 장애 복구 정책은 별도 운영 gate다 ([migration ledger readback](../evidence/postgres-migration-ledger-readback-2026-09-04.md)).

## ADR-050 — PostgreSQL connection pool은 process 합산 예산을 production preflight에서 검증한다

- 상태: `accepted`
- 결정: `PostgresOperationPool`의 `max_size`를 단일 API process의 상한으로만 해석하지 않는다. production 설정은 동시에 실행될 전체 API process 수(`RESCUE_MEAL_POSTGRES_PROCESS_COUNT`), 운영·관리·failover 여유(`RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS`), 실제 PostgreSQL `max_connections`를 함께 명시해야 한다. preflight는 `P × (2 base/auth + M pool) + R <= max_connections`를 계산해 초과 시 API image가 Uvicorn을 시작하지 않게 한다.
- 적용: `P`에는 rolling deploy 동안 겹치는 구·신 process를 모두 포함한다. `M`은 `RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE`이고, `R`에는 migration·monitoring·superuser reserved·managed failover에 필요한 여유를 포함한다. 설정값 검사는 connectivity check가 아니므로 live database의 `SHOW max_connections` readback은 별도 CI/운영 smoke에서 수행한다.
- 안전 경계: 이 계산은 현재 API가 직접 소유한 base/auth/workspace pool을 보수적으로 세는 값이다. shared product/recipe owner가 별도 connection을 만들거나 worker가 DB를 직접 사용하도록 바뀌면 `R` 또는 계산 Module을 먼저 갱신해야 한다. capacity가 불명확한 상태에서 `max_connections`를 기본 추정하지 않는다.
- 이유: process 하나의 pool cap은 전체 배포의 cap이 아니며, rolling deploy에서 구·신 process가 겹치면 예상치 못한 `too many connections`가 readiness와 write path를 동시에 무너뜨릴 수 있다. 이 작은 Module과 preflight Interface에 예산 계산을 두면 connection ownership 지식의 Locality를 유지하면서 운영 Leverage를 얻고, pool Implementation 변경 시 영향 Depth를 드러낼 수 있다.
- 검증: preflight unit test에서 정상 budget·초과 budget·누락/비정상 capacity를 확인하고, CI disposable PostgreSQL에서 `SHOW max_connections=100`, `required=20`, 현재 `pg_stat_activity` count readback을 연결한다. 실제 managed PostgreSQL의 failover·network partition·장시간 connection churn은 별도 운영 gate다.

## ADR-051 — 카메라 프레이밍 가이드 안쪽만 OCR 입력으로 사용한다

- 상태: `accepted`
- 결정: `CameraCapture`의 화면 가이드를 장식으로만 두지 않고, 촬영 시 video의 intrinsic pixel에서 가이드 rectangle에 대응하는 영역을 계산해 crop한다. preview가 `object-fit: cover`인 현재 UI와 같은 scale/offset을 재현하고, 결과를 JPEG로 만들어 기존 receipt/label `onFile` handler에 전달한다.
- fallback: `videoWidth`·`videoHeight`·layout rectangle이 없거나 계산 결과가 유효하지 않으면 전체 frame을 사용한다. 좌표는 intrinsic video bounds로 clamp하고, 너무 작은 crop은 OCR 입력을 만들지 않는다. 이렇게 하면 브라우저가 layout metric을 제공하지 않는 환경에서도 촬영 기능을 조용히 실패시키지 않는다.
- 안전 경계: crop은 주변 배경과 개인정보가 섞일 가능성을 줄이는 입력 전처리일 뿐 원근 보정·반사 제거·흐림 복원·역광 보정·날짜 의미 판정이 아니다. 캔버스 결과도 기존과 같이 transient file로만 intake에 넘기며 원본 bytes를 재고 기록에 저장하지 않는다. OCR 후보와 표시 날짜의 사용자 확인 gate, `safe_to_eat`를 만들지 않는 경계를 유지한다.
- 이유: 사용자가 가이드 안에 문서를 맞춰도 전체 방·식탁·다른 영수증이 OCR 입력에 포함되면 인식 정확도와 개인정보 최소화가 동시에 나빠진다. crop 계산을 작은 Module로 두고 기존 입력 Interface를 재사용하면 camera/library 두 경로의 downstream 품질·review 계약을 바꾸지 않고 입력 품질을 개선할 수 있다.
- 검증: mock 640×480 video와 guide rectangle에서 `x=64`, `y=38.4`, `width=512`, `height=403.2`를 확인하는 prototype E2E 1개와 TypeScript 검증을 통과했다 ([camera guide crop readback](../evidence/camera-guide-crop-readback-2026-09-05.md)). 실제 iOS/Android camera, perspective/reflective condition, annotation 기반 OCR 정확도는 별도 운영 acceptance다.

## ADR-052 — 저대비 OCR 보정은 원본 좌표를 보존하는 조건부 입력 변환으로 제한한다

- 상태: `accepted`
- 결정: 이미지 품질 gate가 `review_required`이고 grayscale 대비가 낮거나 밝기가 극단적으로 낮은 경우에만 OCR 입력에 `autocontrast`와 제한된 contrast enhancement를 적용한다. 결과는 `ocr_input_profile=low_contrast_enhanced`로 응답에 남기고, 그 외 입력은 `source` profile을 유지한다.
- 원본·좌표 경계: 파일 SHA-256, 브라우저 transient preview, 원본 저장·삭제 정책은 변하지 않는다. 보정은 이미지 크기를 유지한 PNG 입력만 만들기 때문에 PaddleOCR observation의 원본 이미지 좌표 계약을 훼손하지 않는다. 이 변환은 소비기한을 생성하거나 OCR 결과를 확정하지 않는다.
- 보정하지 않는 경우: 흐림·반사·원근 왜곡·잘림은 단순 대비 조정으로 복구됐다고 볼 수 없으므로 sharpening·perspective warp를 자동 적용하지 않고 기존 재촬영 안내를 유지한다. PaddleOCR의 UVDoc 문서 펴기는 결과 이미지와 원본의 대응 변환을 별도로 보존하기 전까지 비활성 상태로 둔다.
- 이유: 낮은 대비는 입력 전처리로 개선 가능성이 있지만, 원근·곡면 보정은 OCR 좌표와 원본 review overlay를 어긋나게 만들 수 있다. 제한된 변환과 명시적인 profile을 두면 품질 개선 시도와 사용자 확인·출처 위치의 안전 경계를 동시에 유지할 수 있다.
- 검증: synthetic low-contrast image가 동일한 800×600 크기의 PNG로 변환되고 profile이 기록되는 unit/API test, blur-only 입력이 source profile과 원본 bytes를 유지하는 test를 통과한다. 실제 OCR accuracy uplift, 장치별 threshold, 반사·원근 annotation, PaddleOCR UVDoc 좌표 역변환은 별도 운영 benchmark gate다.

## ADR-053 — 상품명 조회는 I1250 우선·Open Food Facts 제한 fallback으로 고정한다

- 상태: `accepted`
- 결정: 사용자가 영수증 line의 제품 기준 후보를 요청하거나 비동기 enrichment worker가 처리할 때 `MFDS I1250 → Open Food Facts legacy /cgi/search.pl` 순서로 한 번만 조회한다. I1250 후보가 있으면 Open Food Facts를 호출하지 않고, I1250이 `not_found`·`unavailable`·`rate_limited`이면 공개 상품 DB 검색을 review용 fallback으로 사용한다. 이 경로는 autocomplete·search-as-you-type가 아니다.
- 후보 경계: Open Food Facts 검색 후보는 상품명·브랜드·카테고리·용량·상품 URL만 보강하며 confidence를 `0.66` 이하로 제한한다. `shelf_life_text`, `storage_hint`, `DateAssertion`, `safe_to_eat`를 생성하지 않고, 실제 line에 적용해도 `requires_review=true`와 `open_food_facts` source/provenance를 유지한다. 제품 master의 기간 참고값과 개별 팩의 소비기한은 별도 라벨 날짜 확인 없이는 합치지 않는다.
- 운영: provider별 cache key와 검색 전용 rate-limit bucket을 사용하고, PostgreSQL/SQLite shared cache가 지원하는 single-flight로 같은 query의 중복 호출을 억제한다. Open Food Facts 공식 문서의 User-Agent·검색 호출 제한을 지키며, legacy endpoint의 사용자 기여 데이터와 한국 상품 coverage는 운영 benchmark에서 별도로 측정한다.
- 이유: I1250은 국내 제품·품목제조보고에 유리하지만 모든 축약 영수증 이름을 찾는다고 보장할 수 없고, Open Food Facts는 보조 후보를 넓혀 주지만 사용자 기여 데이터와 최신 v3 full-text search 부재라는 한계가 있다. waterfall과 source provenance를 고정하면 coverage를 넓히면서도 공개 후보가 실제 상품·소비기한으로 과대 해석되는 것을 막을 수 있다.
- 검증: mock legacy search의 query·User-Agent·bounded page size, duplicate/cache·입력 경계, I1250 miss waterfall, API·worker source provenance와 no-date 응답, 전체 API 322개·connected browser 49개·TypeScript 검증을 통과했다. 실제 MFDS/OFF key·한국 coverage·legacy search quota·annotation 정확도·실기기 review는 별도 acceptance gate다 ([Open Food Facts name fallback readback](../evidence/open-food-facts-name-fallback-readback-2026-09-05.md)).

## ADR-054 — 영수증 GTIN은 상품 식별자이며 사용자 선택으로만 제품 후보에 연결한다

- 상태: `accepted`
- 결정: 영수증 상품행과 금액행 사이에서 확인된 정상 GTIN만 14자리로 정규화해 receipt line·review draft·구매 lot에 같은 값으로 보존한다. 매장 내부 SKU·가변중량/제한 유통 코드는 상품 master 식별자로 승격하지 않고 `null`로 남긴다. 기존 migration checksum을 바꾸지 않고 `018_receipt_line_barcode.sql` additive migration으로 compatibility/normalized projection에 nullable `barcode`를 추가한다.
- 사용자 흐름: receipt intake는 외부 상품 조회를 자동 호출하지 않는다. 사용자가 review에서 특정 line의 `바코드로 상품 후보 조회`를 눌렀을 때만 기존 barcode resolver를 호출하고, 후보 적용은 canonical name·storage hint·source provenance를 갱신한다. commit은 여전히 체크된 line과 사용자 확인값을 기준으로 실행한다.
- 안전 경계: GTIN은 제품 식별값일 뿐 개별 포장의 소비기한·유통기한·`DateAssertion`·`safe_to_eat`를 의미하지 않는다. 후보의 제품 기준 기간도 참고 문구로만 남기며, 포장지 날짜 확인 없이는 날짜를 생성하거나 확정하지 않는다.
- 이유: 영수증에는 대개 소비기한이 없고, 같은 상품이라도 lot·구매 시점·보관 상태가 다르다. line과 lot의 식별자를 정규화해 추적성을 얻되, 조회 실패·오인식·provider 최신성 문제를 사용자의 review와 날짜 확인 gate 안에 둔다.
- 검증: parser/API receipt 테스트, migration/readiness 계약, disposable PostgreSQL 001→018 apply·checksum skip·normalized line/lot SQL readback, TypeScript, connected E2E 50개를 통과했다. 실제 매장별 GTIN continuation coverage·실기기 카메라·provider 운영 quota·상품 최신성은 별도 acceptance gate다 ([receipt GTIN readback](../evidence/receipt-gtin-readback-2026-09-05.md)).

## ADR-055 — 단위 환산은 같은 물리 차원만 허용하고 판정 근거를 응답한다

- 상태: `accepted`
- 결정: planner와 조리 완료 화면은 `mg↔g↔kg`, `L↔ml`, `ml↔cc`처럼 계수가 명확한 같은 물리 차원의 단위만 canonical unit으로 환산한다. `그램`·`킬로그램`·`밀리리터`·`리터`·영문 표기는 정규화하지만 `팩`·`모`·`개` 사이의 변환은 상품별 포장 의미가 확인되기 전까지 수행하지 않는다.
- 결과 계약: 각 recipe ingredient는 `quantity_match=exact|converted|incompatible|missing`을 반환한다. `converted`의 `available_quantity`는 recipe 단위 환산 합계이고 `allocations`는 실제 lot의 원래 단위로 보존한다. `incompatible`은 상품명이 맞더라도 재고를 보유로 계산하지 않고 UI에서 `단위 확인 필요`를 표시한다.
- 저장 경계: `quantity_match`는 recipe·allocation·실제 수량을 설명하는 presentation metadata라서 snapshot hash에서 제외한다. 기존 SQLite/PostgreSQL JSON meal-plan payload는 새 필드가 없어도 default로 읽을 수 있고, 새 API는 additive field로 내보낸다.
- completion seam: 프론트의 사용량 입력은 allocation 단위를 사용하고, backend completion은 planner와 같은 unit normalization helper를 사용해 exact alias를 동일하게 처리한다. 실제 재고 단위와 allocation 단위가 물리적으로 다른 legacy payload는 자동 차감하지 않고 기존 skip/review 경계를 유지한다.
- 이유: `kg`와 `g`는 안전하게 비교할 수 있지만 `팩`과 `개`는 제품별 포장 수량이 달라 이름만으로 환산하면 재고를 과대 계산할 수 있다. 변환 여부를 결과에 남겨 사용자가 “왜 보유/부족으로 표시됐는지” 확인할 수 있게 하고, module의 정책을 planner·API·UI·completion에서 재사용해 판단 불일치를 줄인다.
- 검증: planner metric/한국어 alias·incompatible unit test, API response contract, frontend TypeScript, connected E2E에서 `단위 환산` 표시와 기존 `팩` 조리 완료 회귀를 통과한다. 실제 상품 catalog 기반 `팩/모/개` 환산·실제 recipe source 단위 품질·다국가 표기와 운영 데이터 coverage는 별도 acceptance gate다.

## ADR-056 — 다일 식단은 materialized candidate를 CP-SAT로 선택하고 fallback provenance를 남긴다

- 상태: `accepted`
- 결정: `POST /api/meal-plans/multi-day-preview`는 recipe를 새로 생성하거나 재고를 변경하지 않는다. 기존 `plan_recipe`가 동일 원본 inventory에 대해 만든 candidate `PlannedRecipe`만 OR-Tools CP-SAT 선택 Module에 전달하고, solver는 최대 3개의 연속된 날짜와 recipe별 중복 금지·lot별 원래 단위 capacity를 함께 계산한다. 후보 materialization과 ingredient matching의 책임은 deterministic planner에 남겨 solver가 두 번째 재고 진실이 되지 않게 한다.
- 목적함수: 가능한 날짜 수를 가장 먼저 최대화한다. 같은 날짜 수에서는 기존 Rescue score와 matched ratio를 반영하고, solver time limit·single worker·고정 seed·정수 계수·recipe ID 입력 순서를 통해 replay 가능한 결과를 우선한다. `servings`는 이미 명시적 필요량 multiplier로 적용하지만, 영양·예산·상품별 package rule을 목적함수로 최적화하지 않는다.
- fallback: OR-Tools import 실패, 시간 제한 내 해 없음, 또는 solver 오류는 `deterministic-greedy`로 전환한다. fallback은 이전 API의 날짜별 working inventory 차감 규칙을 사용하며, public response는 `optimization_engine`으로 복구 경로를 표시한다. 내부 `MultiDayPlanResult.fallback_reason`은 진단용으로만 보존하고 현재 API에는 노출하지 않는다. fallback 여부는 safety/date assertion을 바꾸지 않는다.
- 저장·안전 경계: preview는 side-effect-free이고 bundle snapshot에는 선택된 day plan·allocation·날짜가 포함된다. `quantity_match`와 engine 설명 metadata는 presentation 정보이므로 단일 plan snapshot hash의 recipe/allocation 계약을 대신하지 않는다. CP-SAT는 소비기한·섭취 가능·`safe_to_eat`·영양 적합성을 판정하지 않는다.
- 이유: 기존 다일 preview를 날짜마다 greedy하게 계산하면 앞날의 선택이 뒷날 가능성을 잠그고, lot를 여러 recipe가 공유할 때 결과가 호출 순서에 의존한다. candidate와 selection을 분리하면 조합 최적화의 Depth를 한 Module에 국소화하면서도 기존 matcher·completion·inventory authority를 재사용할 수 있다.
- 검증: custom lot-capacity fixture에서 2일 후보가 네 lot 수량을 초과하지 않고 서로 다른 recipe를 선택하는 unit test, 53개 fixture의 3일 CP-SAT preview·API response field·connected UI optimizer 안내, API·frontend·connected 회귀를 통과한다. solver version/latency benchmark, 대규모 catalog, nutrition/budget constraint, live PostgreSQL/Grocy mutation은 별도 acceptance gate다.

## ADR-057 — servings는 recipe 기준량을 명시적으로 배수화하고 모든 planner 경계를 관통한다

- 상태: `accepted`
- 결정: 단일 preview·options·다일 preview·단일 저장·bundle 저장은 `servings`를
  `1~8` 정수로 받으며 생략 시 `1`을 사용한다. recipe fixture의
  `ingredients[].amount`는 1인분 기준량으로 보고, deterministic `plan_recipe`가
  필요량을 `amount × servings`로 계산한다. 이 값은 ingredient의 available 판정,
  lot allocation, missing ingredient, CP-SAT shared capacity, response, snapshot
  payload에 같은 값으로 전달한다. 현재 UI는 1~4인분 선택지만 노출한다.
- 저장·호환 경계: 기존 저장 plan에 `servings`가 없으면 읽기 기본값 1을 사용하고,
  새 response는 additive field로 내보낸다. options도 top-level과 각 option에
  servings를 함께 반환한다. 부족한 수량을 맞추기 위해 서버가 재고 lot·재료를
  생성하지 않으며, 저장·completion의 기존 workspace/lot/idempotency 경계를
  변경하지 않는다.
- 안전 경계: servings는 양 조절 조건이지 영양 적합성, 알레르기 안전성, 소비기한,
  섭취 가능 여부의 판정값이 아니다. 포장 단위가 사람 수에 선형으로 늘어나지 않는
  상품은 향후 recipe별 package rule과 사용자 확인이 필요하다.
- 이유: 화면에서만 인원수를 바꾸면 preview와 저장/다일 capacity가 서로 다른 양을
  사용하거나, 저장 후 재진입에서 기존 계획의 조건을 잃을 수 있다. 기존 matcher를
  단일 source of truth로 유지하고 그 앞단에 명시적 multiplier를 넣으면 recipe
  선택·lot conservation·completion이 같은 수량 계약을 공유한다.
- 검증: planner 단위 테스트에서 2인분 필요량·allocation·부족 재료를 확인하고,
  CP-SAT 1일 후보·단일 API·options·multi-day preview/save·범위 밖 422와
  connected Chromium UI의 2인분 request body/표시를 검증한다. nutrition/budget,
  상품별 package conversion, 5인분 이상 UI, 실제 PostgreSQL/Grocy 운영 경로는
  별도 acceptance gate다.

## ADR-058 — 비밀번호 재설정 메일은 idempotent bounded retry 경계로 보낸다

- 상태: `accepted`
- 결정: API는 reset token을 직접 반환하지 않고, 설정된 HTTP email provider에
  `template`, `reset_url`, `expires_at`만 전달한다. provider 호출은
  `RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS`의 bounded timeout과 최대 1~3회의 시도
  예산, 전체 45초 hard cap을 사용한다. `408`, `425`, `5xx`, 네트워크
  `HTTPError`만 재시도하고 영구 `4xx`는 즉시 중단한다.
- 중복 경계: 모든 시도는 token 원문이 아닌 SHA-256 파생
  `Idempotency-Key`를 동일하게 보낸다. provider는 이 key를 message identity로
  취급해 timeout 뒤 재시도를 deduplicate해야 한다. key·Authorization·reset URL은
  access log나 브라우저 response에 기록하지 않는다.
- 설정 경계: 운영 preflight는 provider URL·reset base URL의 HTTPS, timeout
  `1..30`초, attempts `1..3`, backoff `0..2`초를 검증한다. local HTTP는
  loopback stub만 허용하고, 실제 provider sandbox의 delivery/readback·bounce는
  별도 acceptance다.
- 이유: 단발 동기 호출은 provider의 일시적 장애로 사용자가 reset 메일을 받지
  못하거나, timeout 후 재시도 시 같은 메일이 중복 발송될 수 있다. retry 판단과
  message identity를 작은 adapter에 국소화하면 기존 account/token security를
  바꾸지 않고 운영 장애 경계를 테스트할 수 있다.
- 검증: transient `503→202`에서 동일 key로 2회 호출, permanent `400`에서 1회
  호출, URL 안전성·runtime bound·token 비노출 unit test와 API/preflight 회귀를
  통과했다. 외부 provider가 idempotency를 실제로 지키는지, 메일 수신·bounce·
  webhook·운영 abuse monitoring은 아직 확인하지 않았다.

## ADR-059 — 장보기 입고 멱등성은 lot과 분리된 durable operation ledger로 보존한다

- 상태: `accepted`
- 결정: `POST /api/shopping-list/{item_id}/receive`에 `Idempotency-Key`가 있으면
  workspace·항목·key로 만든 deterministic operation ID와 요청 fingerprint를
  `ShoppingListReceiveOperation`으로 저장한다. 이 record는 새 inventory lot,
  shopping source 재정리, manual checked history와 같은 flush에 포함되어 하나의
  workspace snapshot으로 영속화된다.
- replay: 같은 workspace·항목·key로 같은 수량·보관 위치를 다시 보내면 operation이
  가리키는 기존 lot을 그대로 replay한다. 같은 key의 request fingerprint가 다르면
  `409`로 거부한다. operation은 남아 있지만 lot이 전량 소비·폐기되어 없어졌다면
  재생성하지 않고 `409`를 반환해 at-most-once 경계를 지킨다. 최초 동시 write 중
  revision 충돌이 발생한 process는 최신 operation을 다시 읽어 동일 payload를
  replay하고, unrelated conflict는 기존 `409`로 남긴다.
- 저장·이동: SQLite `shopping_receive_operations`, PostgreSQL
  `rescue_api_shopping_receive_operations`, additive migration
  `019_shopping_receive_operations.sql`을 사용한다. export와 guest-to-account
  transfer에는 사용자 기록 재현을 위해 record를 포함하되, 원본 `Idempotency-Key`
  문자열은 저장·로그·응답에 포함하지 않고 fingerprint만 보존한다. transfer
  preview/완료 응답은 각각 `shopping_receive_operation_count`와
  `imported_shopping_receive_operation_count`를 보고해 lot이 이미 소비·폐기된
  뒤에도 보류 import가 프론트 판정에서 빠지지 않게 한다.
- 이유: lot ID만으로 replay를 판정하면 lot이 삭제된 뒤 timeout 재시도가 같은 구매를
  다시 입고시킬 수 있다. 별도 operation identity를 두면 lot lifecycle과 command
  lifecycle을 분리하면서도 기존 재고 authority와 full-snapshot transaction을
  재사용할 수 있다.
- 검증: API에서 정상 replay·payload conflict·lot 제거 후 재생성 차단·동시 flush
  revision race replay, SQLite repository reconstruction, PostgreSQL workspace
  load/persist/read contract, export·guest transfer field contract와 migration 019
  존재를 확인했다. 추가로 두 개의 독립 Uvicorn process가 실제 PostgreSQL workspace를
  공유하는 HTTP smoke에서 동일 payload의 `201 initial + 201 replay`·단일 lot,
  `1 vs 2` 수량 conflict의 `201 + 409`, lot 소비 후 process 재시작 뒤 `409` 재생성
  차단을 확인했다 ([multi-process receive readback](../evidence/postgres-multiprocess-receive-readback-2026-09-05.md)).
  revision row lock 대기 중 API process를 `SIGKILL`하는 crash-before-commit smoke에서도
  부분 commit 없이 다른 process의 최초 retry와 재시작 process의 동일 lot replay를
  확인했다 ([crash recovery readback](../evidence/postgres-crash-recovery-readback-2026-09-05.md)).
  commit 직후 응답 전 process 종료를 재현한 smoke에서도 클라이언트의 정상 응답
  부재 뒤 다른 process와 재시작 process가 동일 lot을 replay하는 것을 확인했다
  ([post-commit crash readback](../evidence/postgres-post-commit-crash-readback-2026-09-05.md)).
  실제 reverse proxy response reset, 장시간 multi-process churn, rolling deploy,
  운영 PostgreSQL failover와 backup retention은 별도 production acceptance다.

## ADR-060 — OCR worker는 liveness·model readiness·inference capacity를 분리한다

- 상태: `accepted`
- 결정: 전용 OCR worker의 `GET /health`는 모델을 초기화하지 않는 process liveness만 반환하고, `GET /ready`가 PaddleOCR 모델 초기화와 작은 합성 PNG에 대한 실제 `predict()` warm-up까지 통과한 경우에만 `200`을 반환한다. Compose healthcheck와 API의 worker startup dependency는 `/ready`를 사용한다.
- 초기화: worker process 안에서 PaddleOCR initialization과 warm-up을 lock으로 직렬화해 첫 동시 요청이 모델을 중복 생성하거나 초기화 중인 `None` 상태를 준비 완료로 관찰하지 않게 한다. 모델 객체 생성 후 첫 추론에서 backend/runtime 오류가 나는 경우도 unavailable로 처리한다. 초기화·warm-up 실패는 고정된 `503` readiness 경계로 반환하며 underlying exception text는 외부에 노출하지 않는다. 현재 pinned CPU 경로는 `PP-OCRv5_mobile_det` detection + `korean_PP-OCRv5_mobile_rec` recognition, `enable_mkldnn=False`로 고정하고 source pixel 25,000,000·max side 2,048px preprocessing을 적용한다.
- 부하: 기본 CPU 경로는 process당 추론 1건이고, `RESCUE_MEAL_OCR_MAX_CONCURRENCY`를 1~8 범위에서 명시 조정할 수 있다. 모든 slot이 사용 중이고 `RESCUE_MEAL_OCR_QUEUE_TIMEOUT_SECONDS` 안에 자리를 얻지 못하면 OCR 요청은 `503`으로 끝낸다. replica 수와 동시성은 실제 latency·memory benchmark 뒤에 조정한다.
- 이유: liveness가 모델 다운로드·초기화에 묶이면 장애 중인 worker를 살아 있지 않은 것으로 오판하고, 모델 초기화 경쟁과 무제한 CPU queue는 첫 촬영·동시 업로드에서 tail latency와 memory pressure를 키운다. readiness와 capacity를 분리하면 API가 model-ready worker만 사용하면서도 overload를 명시적인 retry 경계로 돌려보낼 수 있다.
- 검증: worker unit/API contract에서 health가 `not_initialized`를 유지하는지, readiness unavailable `503`, concurrent initialization 1회와 warm-up 1회, first-predict failure 차단, occupied slot `busy`를 확인했다. amd64 Docker image build, model import, `/health` `200`, `/ready` warm-up `200`, synthetic text `/ocr` `complete`, 실제 첨부 영수증 3장·라벨 2장 `complete`와 OOM 없는 순차 처리, Python compile·Compose config도 disposable runtime에서 확인했다. 모델 accuracy·cold download time·replica sizing·실제 운영 reverse proxy는 별도 acceptance다 ([OCR worker readiness readback](../evidence/ocr-worker-readiness-readback-2026-09-05.md)).

## ADR-061 — OCR observation 경계를 넘는 라벨 의미 추론은 보수적으로 중단한다

- 상태: `accepted`
- 결정: 라벨 parser는 날짜 값만 읽었다고 소비기한을 확정하지 않는다. `(포장)년·월·일`과 `유효년·월·일`처럼 서로 다른 날짜 의미가 날짜 주변 observation에 함께 있으면 좌표가 없는 text-only parser는 `kind=unknown`과 `consumption_date_candidate=null`을 반환한다. 각 후보와 전체 parse 결과는 사용자 확인 전까지 `requires_review=true`를 유지한다.
- barcode 경계: 첫 숫자가 `2`인 가변중량·매장용 코드가 OCR에서 `2`와 뒤 payload로 분리돼도 일반 EAN/GTIN으로 합치지 않는다. 해당 입력은 `barcode=null`과 보류 warning으로 남겨 상품 master 조회 키가 되지 않는다.
- 구현: 날짜 의미 분류는 응답용 짧은 OCR context와 분리된 내부 window를 사용해 줄바꿈으로 떨어진 heading을 놓치지 않으며, 원문 노출 범위는 늘리지 않는다. 의미가 여러 종류로 매칭되면 confidence를 낮춘 후보가 아니라 `unknown`으로 abstain한다.
- 이유: OCR observation은 text·confidence·bbox를 반환하지만 text-only parser가 x좌표나 실제 인쇄 열을 알 수 없는 경우가 있다. 이때 가장 그럴듯한 날짜를 소비기한으로 선택하면 신선식품의 포장일을 소비기한으로 오판하거나 매장용 코드를 외부 상품으로 조회할 수 있다. 상용 앱은 자동화율보다 잘못된 확정 방지를 우선하고, review 화면에서 사용자가 crop·값·보관조건을 확인하게 해야 한다.
- 검증: 실제 첨부 농산물 라벨에서 발견된 `use_by` 오판과 분리된 `2` barcode 오판을 observation-shaped unit fixture로 재현하고 수정했다. `tests/test_pipeline.py` 19개, API 전체 354개, compileall, `git diff --check`, 실제 amd64 worker와 FastAPI remote `/api/labels/intake` 재검증에서 날짜 `unknown`, 소비기한 `null`, barcode `null`, `requires_review=true`를 확인했다 ([OCR label safety readback](../evidence/ocr-label-safety-readback-2026-09-05.md)). 실제 매장 annotation과 날짜 의미 precision/recall은 별도 acceptance다.

## ADR-062 — 모호한 라벨 후보는 웹 검수 카드에서 명시적 확인 전까지 저장하지 않는다

- 상태: `accepted`
- 결정: label intake가 날짜 값은 읽었지만 의미를 `unknown`으로 반환하거나
  `storage_hint=unknown`을 반환하면 웹은 후보를 버리지 않고 원본 preview와 함께
  review card로 유지한다. 사용자는 날짜 종류(`제조일`, `포장일`, `소비기한`,
  `유통기한`, `품질유지기한`)와 실제 보관 위치를 각각 선택해야 `확인 후 반영`을
  실행할 수 있다. 어느 하나라도 비어 있으면 저장 버튼은 비활성화한다.
- 기본값 경계: 서버가 보관조건을 모르면 웹이 `냉장`을 대신 선택하지 않는다. 상품명
  기반 기간 추론이나 product master의 storage hint는 라벨에 실제로 인쇄된 날짜·보관
  조건의 대체값이 아니며, 사용자가 선택한 실제 위치만 `FoodItem.storage`로 commit한다.
- 이유: 기존 실패 화면은 안전했지만, 신선식품 가격표처럼 `2017.06.28` 숫자는
  보이고 의미만 애매한 입력에서 사용자가 확인을 완료할 수 없었다. 반대로 애매한
  숫자를 자동 저장하면 포장일을 소비기한으로 잘못 기록할 위험이 있다. 후보를
  보존하되 명시적 선택을 commit gate로 두면 자동화와 안전한 정정 가능성을 함께
  확보한다.
- 검증: `apps/web`에서 `npx tsc --noEmit`, `git diff --check`를 통과했고,
  연결형 Playwright에는 `unknown` 날짜·보관 fixture와 날짜 종류/냉장 선택 후 버튼
  활성화, 날짜 없는 면의 직접 입력 fallback, 탭 전환 뒤 dialog locator를 검증하는
  테스트를 추가했다. 보호된 OneDrive runtime asset
  `public/assets/android/Keyboard.png`가 dataless 상태라 작업트리 직접
  `npm run check:runtime`은 `ETIMEDOUT`으로 막혀 있지만, 동일 보호 object를 복원한
  임시 mirror의 runtime integrity 28개·`npm run build`·Sites 4개·connected E2E
  58개는 통과했다 ([label review UI readback](../evidence/label-review-ui-readback-2026-09-06.md)).

## ADR-063 — 영수증 원본은 저장하지 않되, 미완료 review draft는 metadata로 재개한다

- 상태: `accepted`
- 결정: 사용자가 영수증 intake를 완료했지만 아직 commit하지 않은
  `review_required` draft는 receipt summary와 안전한 line·template·merchant·구매일
  metadata로 workspace에 남긴다. connected 홈은 `stock_created=false`이고
  `source_redacted=false`인 draft만 `검수할 영수증` 카드로 노출하며, 사용자가 카드를
  선택하면 `GET /api/receipts/{id}`로 draft를 다시 읽어 `ReceiptReview`를 재구성한다.
  이미 commit·삭제·redaction된 draft나 line이 없는 draft는 재개하지 않고 다시 촬영
  안내로 보낸다.
- 원본·commit 경계: 업로드한 receipt image/PDF bytes는 기존 privacy lifecycle대로
  저장하지 않는다. 따라서 재개 화면은 원본 preview를 다시 만들지 않고, 원본이
  저장되지 않았다는 안내와 safe metadata·line review만 표시한다. 사용자가 선택한
  line과 수정값을 명시적으로 제출하기 전에는 StockLot을 만들지 않는다.
- lifecycle 경계: AddFood sheet는 `resumeReceiptId`와 session generation을 사용해
  이전 workspace·이전 요청의 응답이 현재 sheet를 덮어쓰지 않게 한다. sheet를 닫거나
  모드를 바꾸면 local receipt state를 초기화하고, draft가 더 이상 review 대상이
  아니면 stale card를 저장하지 않고 unavailable 상태로 전환한다.
- 이유: 원본 bytes를 재저장하면 개인정보·보존·삭제 범위가 커지고, UI local state만
  유지하면 앱 종료·sheet 닫기 뒤 사용자가 검수를 잃는다. 안전한 review metadata만
  durable하게 남기면 개인정보 경계를 유지하면서 중단·재개 가능한 상용 앱 흐름을
  제공할 수 있다.
- 검증: connected Playwright에서 `GET /api/receipts` summary 카드 → draft detail
  readback → resume callout → source preview 부재 → line review 상태를 확인했고,
  workspace 전환 중 이전 summary 응답을 폐기하는 generation guard도 지연 fixture로
  확인했다. 단일 resume·다중 pending 선택·workspace switch targeted 각 1개와 전체
  connected E2E **62개**를 통과했다. frontend TypeScript와
  `git diff --check`, 보호 asset을 복원한 local mirror의 runtime integrity 28개·Vite
  755 modules build·Sites 4개도 통과했다 ([receipt review resume readback](../evidence/receipt-review-resume-readback-2026-09-06.md)).
  실제 사용자 계정의 장기 draft retention·multi-device conflict·운영 notification
  delivery·외부 object storage는 별도 acceptance다.

## ADR-064 — 같은 영수증 commit은 프로세스 안에서도 한 번만 실행한다

- 상태: `accepted`
- 결정: receipt ID별 `RLock`으로 commit coordinator 전체를 API 프로세스 안에서
  직렬화한다. 첫 요청이 receipt 상태를 `committed`로 전환하고 lot를 만든 뒤, 같은
  receipt에 대한 두 번째 요청은 최신 상태를 읽어 `409`로 종료한다. 서로 다른 API
  프로세스의 경쟁은 기존 PostgreSQL workspace revision lock이 계속 담당한다.
- 안전 경계: lock은 receipt 단위라 서로 다른 영수증 commit은 병렬로 진행할 수 있고,
  lock 안에서 fingerprint·receipt 상태 확인부터 commit transaction·lot 생성·Grocy
  outbox queue·최종 flush까지 같은 시도에 묶는다. 존재하지 않는 임의 receipt ID는
  하나의 fallback lock을 공유해 404 요청이 lock registry를 키우지 못하게 하고, 유효
  receipt lock은 활성 context manager가 참조하는 동안만 `WeakValueDictionary`에 남긴다.
  다른 프로세스가 먼저 write한 경우 workspace revision mismatch를 `409`로 반환하며,
  request-local stale snapshot을 현재 상태로 덮어쓰지 않는다.
- 이유: 동일 프로세스의 threadpool 요청이 거의 동시에 같은 `committed=false` draft를
  읽으면 기존 fingerprint guard만으로는 두 요청이 각각 lot를 만들 수 있었다. 이
  경계를 닫아 재개된 영수증을 여러 기기·재시도·중복 탭에서 반영해도 수량이 중복되지
  않게 하고, 기존 클라이언트의 명시적 conflict 안내와도 일치시킨다.
- 검증: 첫 commit의 lot 생성 직전에 두 번째 commit을 투입하는 deterministic API
  concurrency fixture에서 결과를 `committed 1건 + 409 1건`, 해당 receipt source lot
  1건으로 확인했다. lock registry lifecycle test **1 passed**, API 전체 **356 passed**
  (ADR-065 테스트 추가 전),
  frontend connected E2E **62 passed**, 보호 asset을 복원한 local mirror의 runtime
  integrity 28개·Vite 755 modules build·Sites 4개를 함께 확인했다
  ([receipt commit concurrency readback](../evidence/receipt-commit-concurrency-readback-2026-09-06.md)).
  실제 managed PostgreSQL failover·network partition과 multi-device UX는 별도 운영
  acceptance다.

## ADR-065 — 영수증 commit의 transport retry는 명시적 멱등 키로 replay한다

- 상태: `accepted`
- 결정: `POST /api/receipts/{receipt_id}/commit`은 선택적인
  `Idempotency-Key` 헤더를 받는다. 키가 있으면 workspace 안에서 SHA-256 digest와
  요청 payload fingerprint를 `CommitTransactionRecord`에 보존하고, 같은 receipt·같은
  key·완전히 같은 payload의 후속 요청은 새 lot를 만들지 않고 기존 transaction 결과와
  최신 inventory를 `idempotency_replayed=true`로 반환한다. 같은 키를 다른 receipt나
  다른 line/override payload에 재사용하면 `409`로 거부한다. 키가 없거나 다른 키를
  쓰는 일반 중복 commit은 기존 receipt fingerprint/state guard에 따라 `409`다.
- crash/retry 경계: 같은 process 안에서는 ADR-064의 receipt lock이 active request를
  직렬화한다. process가 pending transaction을 durable하게 남긴 뒤 종료된 경우에는
  동일 key/payload의 다음 요청이 그 pending transaction을 이어 받아 처리한다. 여러
  process가 같은 key를 동시에 이어 받으면 PostgreSQL workspace revision이 한 번만
  snapshot을 확정하고, 패배한 process는 reload 후 committed transaction을 찾으면
  정상 replay한다. transaction-level `created_lot_ids`·`skipped_line_ids`를 저장해
  응답이 lot lifecycle에 의존하지 않게 한다.
- 저장: compatibility `rescue_api_commit_transactions` JSON payload와 normalized
  `rescue_inventory_commit_transactions`에 같은 파생 필드를 저장한다. 기존 migration은
  수정하지 않고 `020_receipt_commit_idempotency.sql`로 normalized 컬럼을 추가하며,
  실패 attempt와 성공 retry를 함께 감사할 수 있도록 normalized projection의 receipt
  단일 unique 제약을 제거한다. 원본 key·Authorization·receipt bytes는 저장하지 않는다.
- 클라이언트: 웹은 한 번의 receipt 반영 시도마다 key를 생성하고, `request()`의
  network retry는 그 동일 key를 유지한다. HTTP `409`는 사용자가 다른 요청을 다시
  제출한 충돌로 남기며, replay 성공은 기존 commit 성공 화면과 동일하게 최신
  dashboard를 재동기화한다.
- 이유: 모바일 환경에서는 서버가 commit을 끝냈지만 response가 timeout으로 유실될 수
  있다. 매번 새 key를 만들면 사용자는 재시도할 때 중복 반영 충돌을 보게 되고, key를
  저장하지 않으면 lot가 삭제된 이후에도 command의 완료 여부를 알 수 없다. key digest와
  payload fingerprint를 transaction ledger에 보존하면 네트워크 재시도만 안전하게
  replay하면서 수동으로 다른 내용을 제출하는 실수는 계속 차단할 수 있다.
- 검증: API에서 동일 key·payload의 `200 initial + 200 replay`, 동일 transaction/lot,
  key 재사용 payload conflict `409`, 기존 no-key duplicate `409`를 확인하고,
  normalized adapter write/load와 migration 020 contract를 추가했다. 실패 attempt 뒤
  재시도하면 `needs_reconciliation` 이력과 새 `committed` transaction이 모두 남는
  회귀도 확인했다. 별도 disposable
  `pgvector/pg16`에서 migration `001→020`을 적용한 뒤 API process를 재시작해 같은
  receipt의 `200 + idempotency_replayed=true`, DB `1 lot + 1 transaction`, receipt
  단일 unique constraint `0개`를 직접 readback했다. 같은 절차를
  `postgres_receipt_commit_idempotency_smoke.py`로 자동화해
  `postgres-live` workflow에도 연결했다. connected browser에서 실제 commit request에
  key가 붙는지와 frontend typecheck/build도 검증했다 ([receipt commit idempotency readback](../evidence/receipt-commit-idempotency-readback-2026-09-06.md)).
  실제 reverse proxy response reset, managed PostgreSQL failover, rolling deploy 중
  key retention/cleanup 정책은 별도 production acceptance다.

## ADR-066 — 읽힌 알림의 pending push delivery는 취소하고 이력을 보존한다

- 상태: `accepted`
- 결정: notification worker는 tick 시작 시 현재 workspace에서 계산한 알림 중
  `read_at=null`인 ID와 현재 연결된 push device fingerprint를 active set으로
  고정한다. 기존 `pending` delivery의 `notification_id` 또는
  `endpoint_fingerprint`가 active set에 없으면 외부 Push Service를 호출하지 않고
  `status=cancelled`로 변경한다. 이는 사용자가 알림을 읽은 경우, 알림 조건이
  사라진 경우, 기기 연결을 해지한 경우 모두에 적용한다.
- 상태 경계: `cancelled`는 전송 시도 실패인 `dead_letter`와 다르다. `processed`는
  실제 sender 호출 시도만 세고, 취소 건수는 `cancelled`로 별도 반환·heartbeat
  기록한다. pending row와 취소 사유는 삭제하지 않아 SQLite 재시작과 normalized
  projection에서 운영 이력을 확인할 수 있다. 이미 `in_flight`인 요청은 provider
  호출과 경쟁시키지 않고 stale recovery로 pending이 된 뒤 active-set 대조에서
  취소할 수 있다.
- 이유: notification center에서 사용자가 먼저 읽은 직후 worker가 실행되면 오래된
  알림이 다시 push되거나, 해지된 기기의 delivery가 발송 실패처럼 남는 race가 생긴다.
  read state·device target과 delivery outbox를 tick 안에서 같은 snapshot으로 대조하면
  불필요한 방해를 줄이고, provider 실패와 사용자 행동·기기 해지를 운영 지표에서
  혼동하지 않는다.
- 검증: 읽음 직전 pending 상태와 구독 해지 직전 pending 상태를 각각 만든 뒤 다음
  tick에서 `processed=0`, `cancelled=1`, sender 호출 0회, `dead_lettered=0`을
  확인했고, `cancelled` row가 SQLite reopen 뒤에도 유지되는 것을 확인했다.
  notification delivery targeted **11 passed**, API 전체 **360 passed**를 통과했다. 실제 외부 Push Service 수신·provider rate limit·다중
  device acceptance는 별도 production gate다 ([notification delivery cancellation readback](../evidence/notification-delivery-cancellation-readback-2026-09-06.md)).

## ADR-070 — notification cancellation은 safe runtime metric으로 별도 관측한다

- 상태: `accepted`
- 결정: notification worker는 `cancelled` 상태를 `notification_inactive`와
  `subscription_inactive` reason으로 process-local runtime counter에 기록한다.
  queue·실제 provider 시도·성공·재시도·dead-letter·stale recovery·lease 상태도 같은
  bounded counter로 집계하고, `/api/internal/notifications/metrics`에서 worker token
  검증 후 Prometheus text로 제공한다.
- 안전 경계: metric에는 workspace ID, notification ID, endpoint fingerprint, payload,
  provider error 원문을 넣지 않는다. API process별 snapshot이며 다중 replica 합계,
  장기 보존, alert는 외부 Prometheus/OpenTelemetry collector가 소유한다.
- 이유: `cancelled`와 `dead_letter`를 response/heartbeat에서 구분하는 것만으로는
  운영자가 read-before-send race와 해지 기기 비율을 추세로 볼 수 없다. 고정된 low-cardinality
  reason만 노출하면 개인정보를 늘리지 않고 worker 비용과 사용자 행동에 따른 취소를
  provider 장애와 분리해 관찰할 수 있다.
- 검증: 읽음·구독 해지 cancellation reason, tick 누적, Prometheus text, token 보호와
  secret/identity 비노출을 notification/API test로 확인한다. multi-replica collector,
  alert rule, durable metric retention과 실제 provider delivery는 별도 운영 gate다.

## ADR-067 — controlled bottom sheet는 종료 후 원래 trigger로 포커스를 복귀한다

- 상태: `accepted`
- 결정: 앱이 `Dialog.Trigger` 없이 `open` state를 제어하는 bottom sheet도 시트를 여는
  현재 `HTMLElement`를 app-owned `Prototype.tsx`가 기억한다. 시트가 닫힐 때는 공통
  protected runtime을 수정하지 않고, exit animation으로 `data-testid="bottom-sheet"`
  DOM이 제거된 뒤 같은 element가 아직 연결되어 있고 disabled가 아니면
  `focus({ preventScroll: true })`를 호출한다. sheet 전환 중에는 기존 trigger를
  유지해 notifications → detail 같은 연속 이동에서 중간 sheet로 포커스가 튀지 않게 한다.
- semantics: Radix `Dialog.Content`가 제공하는 `role="dialog"`, `aria-labelledby`,
  `aria-describedby`와 visible title/description을 검증 대상으로 삼는다. `Prototype.tsx`의
  모든 sheet open/close 경로는 한 helper를 통과하며, common `mobile/BottomSheet.tsx`는
  protected runtime integrity 대상이므로 변경하지 않는다.
- 이유: controlled Radix root에는 자동 focus restore를 연결할 `Dialog.Trigger`가 없을 수
  있다. 이 상태에서 `Escape`로 닫으면 키보드·스크린리더 사용자는 홈의 어느 위치로
  돌아왔는지 잃고, 다음 Tab 순서도 예측할 수 없다. app-owned opener를 기준으로 복귀하면
  시각적 exit animation과 semantic focus lifecycle을 함께 보존한다.
- 검증: named dialog와 title/description 연결, `Escape` 종료, 원래 `식품 추가하기`
  trigger focus 복귀를 Playwright focused test **1 passed**로 확인했다. fixture·mobile
  runtime suite는 **34 passed**, disposable SQLite API를 자동 기동한 connected E2E는
  **62 passed**, protected runtime 28개·TypeScript/Vite build·Sites test 4개도 통과했다
  ([bottom-sheet accessibility readback](../evidence/bottom-sheet-accessibility-readback-2026-09-06.md)).
- 경계: 실제 iOS VoiceOver·Android TalkBack, Dynamic Type/큰 글씨, OS별 focus ring,
  실기기 카메라 권한·screen-reader announcement는 별도 acceptance다.

## ADR-068 — PWA는 최신 navigation을 우선하고 업데이트 적용은 사용자에게 맡긴다

- 상태: `accepted`
- 결정: service worker의 navigation 요청은 network-first로 처리해 새 배포의 HTML을
  우선 반영한다. 네트워크가 끊긴 경우에만 캐시된 `/` shell로 복귀한다. manifest와
  같은 출처의 정적 GET asset은 stale-while-revalidate로 캐시 hit를 즉시 반환하고
  백그라운드에서 최신 응답을 저장한다. `/api/`와 모든 non-GET 요청은 계속 bypass한다.
- 업데이트 경계: install 단계에서 `skipWaiting()`을 호출하지 않는다. 앱은
  `updateViaCache: "none"`으로 registration을 확인하고, 기존 controller가 있는
  탭에서 waiting worker가 감지되면 app-owned prompt를 보여준다. 사용자가
  `새로고침`을 누른 경우에만 `SKIP_WAITING` 메시지를 보내고 `controllerchange` 후
  reload한다. `나중에`를 선택하면 현재 검수·입력 화면을 강제로 끊지 않는다.
- 이유: 고정 `cache-first` HTML은 배포 이후에도 오래된 JS chunk를 계속 열 수 있고,
  무조건적인 `skipWaiting()`은 영수증 review나 수동 날짜 확인 중인 화면을 예고 없이
  reload할 수 있다. 최신 HTML과 명시적 적용을 분리하면 stale shell 복구와 입력 보호를
  함께 만족한다. cache 이름을 바꾸면 activate에서 이전 Rescue Meal cache를 정리한다.
- 검증: service worker contract test에서 install takeover 보류, navigation fresh
  response/cache update, offline shell fallback, static background refresh, API/write
  bypass, waiting update message, old cache purge를 확인한다. production build에서는
  TypeScript·Vite bundle·Sites packaging을 함께 확인한다. 실제 배포 간 waiting worker,
  iOS/Android standalone update, OS별 reload·splash 동작은 별도 acceptance다.

## ADR-069 — workspace-scoped read model은 공통 Coordinator가 수명과 무효화를 소유한다

- 상태: `accepted`
- 결정: `Prototype`의 dashboard·알림·장보기·재고 검색·receipt summary와 계정 설정의
  notification preference·receipt privacy·Grocy read·workspace export는 `WorkspaceSyncCoordinator`
  Module을 통과한다. Coordinator의 Interface는 `prepareWorkspace → run(channel,
  operation(signal)) → WorkspaceSyncResult`이며, `mealApi.prepareWorkspace()`가 현재 guest/
  account token에서 opaque workspace namespace를 준비하는 Adapter 역할을 맡는다. 각 실행은
  `AbortController`를 소유하고 provider와 `mealApi` read operation에 같은 `AbortSignal`을
  전달한다.
  응답은 `current=false`이면 화면 read model에 반영하지 않는다.
- 수명 규칙: 요청 의도는 workspace 준비 전 channel version으로 예약한다. 이후 workspace
  key와 workspace version, channel별 request version을 함께 ticket에 고정한다. provider가
  끝난 뒤에도 preparation ticket이 최신인지 재확인하므로 오래된 provider completion이
  최신 channel/workspace state를 되돌릴 수 없다. 계정 전환·로그아웃·인증 오류는
  `invalidateAll()`과 명시적 상태 초기화를 수행하고, 같은 workspace의 검색/새로고침
  경쟁은 channel invalidate로 이전 응답을 폐기하며 동시에 이전 실행의 `AbortSignal`을
  중단한다. provider 실패도 최신 request ticket을 소비하므로 앞선 요청이 실패 뒤에
  되살아나지 않는다. `mealApi.request()`와 upload는 성공한 non-GET mutation을
  `WorkspaceSyncTransport`로 publish하고, transport는 `BroadcastChannel`을 우선 사용하며
  불가능한 브라우저에서는 `localStorage` event로 fallback한다. 메시지에는 raw token 대신
  opaque workspace key·허용된 channel·source/id만 담고, 같은 workspace의 다른 탭만 해당
  read model을 invalidate/reload한다.
- Seam과 책임: API의 token/session 처리와 서버의 workspace isolation은 기존
  `mealApi`·backend 계약이 소유하고, Coordinator는 취소 신호를 client fetch boundary까지
  전달하지만 worker의 이미 시작된 CPU 비용이나 서버-side write transaction을 대신하지
  않는다. 다중 기기 write의 stale 판정은 PostgreSQL workspace revision 선행조건과
  `If-Rescue-Meal-Revision`/`X-Rescue-Meal-Workspace-Revision` contract가 소유하고,
  Coordinator는 conflict response 뒤의 read refresh와 화면 안내를 연결한다. 이 Seam은
  자동 merge나 conflict resolution 정책까지 결정하지 않으며,
  `AccountSheet`의 workspace-keyed panel remount와 `MealPlanSheet`의 active cleanup은
  각 화면의 local state를 보호하는 보조 Implementation으로 남긴다.
- 다중 기기 write 규칙: client가 마지막으로 관찰한 revision을 mutation header로 보낼 수
  있게 하고, server는 최신 workspace snapshot을 확인한 뒤 값이 다르면 handler/flush 전에
  구조화된 `409 workspace_revision_conflict`를 반환한다. response의 현재 revision과
  `retryable: true`, `action: reload_and_retry`를 통해 client가 최신 read model을 다시
  읽도록 하며, domain conflict나 idempotency conflict와 섞지 않는다. 현재 정책은
  last-write-wins나 자동 merge가 아니라 reject → reload → user retry다.
- 이유: 화면별 generation ref는 receipt summary에는 유효해도 dashboard·알림·shopping
  list·계정 패널 사이의 workspace 전환을 하나의 규칙으로 표현하지 못한다. 늦은 guest
  응답이 account 화면에 들어가거나, provider 준비 실패 뒤 이전 응답이 부활하는 문제를
  중앙 ticket으로 차단하면 read model locality가 좋아지고 새 화면이 같은 수명 계약을
  재사용할 수 있다. 이후 cache/reconnect/worker 결과를 확장할 때도 이 Module을
  leverage할 수 있다.
- 검증: Coordinator 자체의 workspace switch·동일 channel 경쟁·명시적 invalidate·
  provider failure·겹친 provider completion·실제 abort signal 최신성 계약과 transport
  adapter 전달 계약 **8개**, TypeScript 검사를 통과했다. receipt summary의 account
  workspace switch, 두 탭의 mutation invalidation/notification center 갱신을 포함한
  connected E2E와 revision header 전파 E2E를 통과했고, account panels는 동일 coordinator와
  workspace-keyed remount를 사용한다. notification worker cancellation reason metric과
  token-protected Prometheus endpoint는 별도 worker/API 회귀로 확인했다. 자동 merge를
  포함한 다중 기기 conflict resolution, multi-replica collector/alert, server push/cache
  invalidation과 managed failover는 별도 acceptance다.

## ADR-071 — 운영 metrics는 하나의 low-cardinality scrape surface로 합친다

- 상태: `accepted`
- 결정: API는 `RequestRuntimeMetrics` Module에서 FastAPI route template·HTTP method·
  status·bounded latency histogram만 process-local로 집계한다. `/api/internal/metrics`는
  `RESCUE_MEAL_OBSERVABILITY_TOKEN`을 표준 `Authorization: Bearer`로 검증한 뒤 HTTP
  metrics와 기존 product provider·notification delivery metrics를 하나의 Prometheus
  text response로 합친다. product/notification별 최소 권한 metrics endpoint는 기존
  worker token 계약과의 호환성을 위해 유지한다.
- 안전 경계: route template를 얻지 못하면 `__unmatched__`, 허용된 template 수를 넘으면
  `__other__`로 접고, query string·실제 resource ID·workspace ID·payload·secret·provider
  error 원문은 metric label에 넣지 않는다. metrics는 process-local이며 global durable
  counter나 개인정보 저장소가 아니다.
- 이유: request JSON log, product runtime metric, notification runtime metric을 각각
  수집하면 collector 설정이 세 갈래로 나뉘고 장애 시 상관관계가 어렵다. 작은
  low-cardinality Interface 하나를 제공하면 운영 collector가 route latency와 worker
  상태를 같은 replica label 아래 scrape할 수 있어 관측성의 locality와 leverage가
  좋아진다. 반대로 자동으로 raw path를 label에 넣으면 사용자 ID가 cardinality와
  개인정보로 새어 나가므로 명시적으로 금지한다.
- 검증: missing/wrong Bearer token의 `401/403`, route template·latency histogram,
  query/secret 비노출, product·notification metrics 합성, production preflight의
  observability secret 필수 조건을 API/observability/preflight 회귀로 확인한다.
  실제 Prometheus/OpenTelemetry collector의 multi-replica aggregation, retention,
  alert, 외부 운영 장애 대응은 별도 acceptance다.

## ADR-072 — 같은 receipt fingerprint의 pending draft는 재사용한다

- 상태: `accepted`
- 결정: `POST /api/receipts/drafts`는 workspace 안에서 동일한 receipt
  fingerprint의 미완료 draft를 발견하면 새 ID를 만들지 않고 기존 draft를
  반환한다. 기존 draft를 반환한 HTTP response에는
  `X-Idempotency-Replayed: true`를 붙인다. 이미 commit된 fingerprint는
  기존과 같이 `409`로 거부한다.
- 동시성·실패 경계: fingerprint별 `RLock`이 같은 process의 중복
  생성 window를 직렬화하고, PostgreSQL process 간 경쟁은 workspace revision이
  승자를 확정한다. 패배한 process는 `flush`가 최신 snapshot을
  reload한 뒤 승자의 pending draft를 반환한다. flush가 일반 실패하면
  process-local snapshot을 복원해 DB에 없는 phantom draft를 이후 요청에
  반환하지 않는다.
- 이유: 모바일에서는 같은 사진의 OCR 결과가 network retry·중복 탭·앱
  재진입으로 여러 번 draft 생성 요청이 될 수 있다. 이를 새 draft로 만들면
  사용자가 검수할 영수증 목록에서 같은 영수증을 반복 확인하게 된다. draft
  dedupe는 review 편의만 제공하며 상품명·수량·보관 위치 확인이나 StockLot
  생성, 소비기한 확정을 앞당기지 않는다.
- 검증: 같은 pending fingerprint의 순차 재요청에서 동일 draft ID·replay
  header·단일 in-memory record를 확인했고, flush failure 후 phantom이
  남지 않는 API 회귀를 추가했다. 전체 API 회귀는 **382 passed**이며,
  disposable PostgreSQL cross-process race와 normalized metadata parity를
  live smoke에서 별도로 증명했다.

## ADR-073 — 식단 저장·완료는 plan identity별로 수렴시킨다

- 상태: `accepted`
- 결정: preview에서 발급한 `plan_id`와 저장 bundle의 `bundle_id`를
  command identity로 보고, 같은 process에서는 identity별 lock을 사용한다.
  PostgreSQL process 간 경쟁에서는 workspace revision이 한 snapshot만
  확정하게 하며, 동일 snapshot·recipe의 패배 save는 승자 plan을 반환한다.
- 완료 경계: `POST /api/meal-plans/{plan_id}/complete`는 plan별 lock으로
  한 process의 중복 소비를 막고, 다른 process가 먼저 완료한 경우 최신
  `completed_at`과 consumed allocation을 `already_completed`로
  반환한다. planner 추천은 계속 side-effect-free이고 완료 시점에 현재 lot
  수량·단위를 다시 검증한다.
- rollback 경계: workspace `snapshot()/restore()`는 foods·receipts뿐 아니라
  saved meal plans와 shopping list도 deep copy한다. save/complete 도중
  persistence failure가 나도 process-local plan이나 장보기 상태가 durable
  상태와 어긋난 채 남지 않는다.
- 이유: 모바일에서는 저장·완료 요청이 timeout 또는 중복 탭으로 동시에
  도착할 수 있다. 저장 plan과 완료 event의 identity를 분리하면 같은 화면
  상태만 같아 보이고 실제 재고가 두 번 차감되는 문제가 생길 수 있다.
- 검증: API fixture의 same plan concurrent save에서 plan 1개와 saved audit
  1개를 확인했고, disposable PostgreSQL 두 process에서
  `save=200 initial+replay`, `completion=completed+already_completed`,
  plan 1개, saved/completed audit 각 1개, compatibility/normalized consumed
  event 각 3개를 readback했고, save flush failure phantom rollback fixture도
  통과했다. 실제 managed failover·외부 Grocy 보상은
  별도 운영 acceptance다.

## ADR-074 — 수동 식품 입력은 새 lot, 라벨 보정은 명시적 lot

- 상태: `accepted`
- 결정: `POST /api/foods`에서 `lot_action="create"`인 일반 수동 입력은
  `target_food_id`가 없어야 하며 canonical 상품명이 기존 재고와 같아도 새
  inventory lot을 만든다. 라벨·GS1 날짜 또는 제품 후보를 기존 lot에 반영하는
  경우에는 `lot_action="correct"`와 `target_food_id`를 보내며,
  target의 수량·단위·구매 provenance·개봉 상태는 보존한다. 기존 label client와의
  호환을 위해 target이 없더라도 trusted date 보정 대상이 workspace에서 정확히 한
  lot이면 재사용한다. exact `barcode_lot`이 호환 barcode와 함께 정확히 한 lot을
  가리키는 경우도 이 호환 경로를 사용할 수 있다. product provenance 보정은 target
  없이 이름만으로 기존 lot을 합치지 않고 새 lot에 적용한다.
- 날짜 경계: `unknown`/`estimated_use_first` lot을 처음 확인된 날짜로 바꿀 때만
  이전 assertion을 history에 append한다. 이미 trusted date가 있는 lot에 다른
  날짜를 보내는 요청은 `food_date_already_confirmed` 409로 거부하고, 같은 날짜
  값의 legacy lot은 사용자 확인 metadata만 승격한다. 상품명·보관 위치로 만든
  window는 target lot의 구매일·최초 개봉일을 기준으로 재계산하며 소비기한이나
  안전 판정으로 승격하지 않는다.
- 실패 경계: 수동 lot 생성·보정은 identity별 process-local lock과 PostgreSQL
  workspace revision을 함께 사용한다. audit event를 포함한 `foods` snapshot을
  mutation 전에 보존하고 persistence 실패 시 복원하며, revision 충돌에서는
  stale snapshot을 되돌리지 않고 최신 승자 snapshot을 유지한다.
- 이유: canonical 상품명은 product master의 검색값이지 구매 lot의 identity가
  아니다. 기존의 이름 기반 무조건 upsert는 다른 구매의 소비기한·보관 상태·수량을
  임의의 lot에 덮어쓸 수 있었고, 라벨 재촬영이 이미 확인된 날짜를 조용히 바꿀 수
  있었다. create와 correction intent를 분리하면 수동 입력의 편의와 lot/date
  provenance를 동시에 유지할 수 있다.
- 검증: 같은 상품의 수동 입력이 두 lot을 유지하는 API 회귀, target 보정의 수량
  보존·date history·동일 날짜 metadata 승격, 다중 lot의 명시적 선택 차단, 저장
  실패 후 phantom lot rollback, 연결/fixture 라벨 검수의 새 lot·기존 lot 선택
  payload를 확인했다. disposable PostgreSQL two-process target race도
  `201 + 409 → retry`와 normalized date assertion readback으로 확인했으며,
  managed failover와 실제 기기에서 여러 lot을 선택하는 UX는 별도 acceptance다.

## ADR-075 — 수동 식품 command는 key digest ledger로 replay한다

- 상태: `accepted`
- 결정: `POST /api/foods`는 선택적 `Idempotency-Key`를 받는다. 프론트는 한 번의
  create/correction 시도에 key를 만들고 네트워크 retry 동안 같은 key를 유지한다.
  서버는 workspace별 `ManualFoodOperationRecord`에 key digest·validated request
  fingerprint·lot ID·action만 저장하고 원본 key는 저장하지 않는다.
- replay 경계: 같은 workspace·key·payload의 재요청은 기존 lot을 `201`과
  `X-Idempotency-Replayed: true`로 반환한다. 같은 key의 payload가 다르면
  `manual_food_idempotency_conflict` 409, 원래 lot이 이미 소비·폐기되어 사라졌으면
  `manual_food_operation_lot_missing` 409로 멈춘다. 새 lot을 재생성하거나 현재
  target의 수량을 추정해 복구하지 않는다.
- 저장: operation ledger는 SQLite와 PostgreSQL compatibility projection에
  workspace composite key로 저장하고 workspace snapshot/rollback·export·guest
  transfer에 포함한다. create/correction mutation과 ledger insert는 같은 flush로
  확정하며, revision 충돌 뒤 승자 operation이 보이면 패배 process는 해당 response를
  replay한다.
- 이유: 라벨·바코드 입력은 OCR/provider보다 네트워크 response 유실 가능성이 더
  흔한 사용자 mutation이다. 이름 기반 lot 분리만으로는 같은 명령의 재전송을 구별할
  수 없고, 반대로 canonical 이름으로 dedupe하면 새 구매를 기존 lot에 합칠 수 있다.
  command identity를 별도 ledger로 두면 새 lot 생성과 retry 안전성을 동시에 유지할
  수 있다.
- 검증: API의 create replay·payload conflict·소비 후 재생성 차단, SQLite
  reconstruction, disposable PostgreSQL two-process replay와 normalized lot/date
  readback을 확인한다. managed failover·reverse-proxy response reset·ledger
  retention/compaction 정책은 별도 운영 acceptance다.

## ADR-076 — PostgreSQL schema capability와 migration ledger를 readiness의 단일 진입점으로 둔다

- 상태: `accepted`
- 결정: PostgreSQL readiness는 workspace store가 실제로 사용하는 전체
  compatibility projection table과 핵심 column/index를 확인한다. 현재 목록에는
  food·receipt·fingerprint·storage event·commit transaction·single/multi-day
  meal plan·shopping/receive·manual food·notification·product enrichment·Grocy
  mapping/outbox/worker state와 auth/provider cache 관계가 포함되며,
  `RESCUE_MEAL_INVENTORY_MODE=normalized`일 때 normalized product/receipt/lot/date/
  priority 관계를 추가한다. 부분적인 table 목록만 확인하고 API를 ready로 올리는
  상태는 허용하지 않는다.
- migration 실행: `infra/postgres/migrate.sh --apply`는 원본 SQL 파일을
  수정하지 않고 `infra/postgres/migrate.py`의 하나의 psycopg session-level
  advisory lock 아래 migration을 순서대로 적용한다. 각 migration의 outer
  `BEGIN`/`COMMIT` wrapper는 메모리에서만 제거해 body와
  `rescue_schema_migrations` ledger row를 같은 transaction으로 commit한다.
  이미 같은 checksum인 migration은 skip하고, checksum drift는 body 실행 전에
  중단한다. 실행 전 backup·DSN 검토와 실행 후 `/ready`·read/write smoke는
  운영자의 책임으로 남긴다.
- 실패/복구 경계: migration body 또는 ledger insert가 실패하면 해당
  transaction은 rollback되고 advisory lock은 session 종료 시 해제된다. runner가
  중간 종료되어도 schema body만 성공하고 ledger만 빠지는 상태를 만들지 않는
  것을 목표로 한다. `CREATE INDEX CONCURRENTLY`처럼 transaction 밖에서만 가능한
  SQL은 현재 migration contract에 포함하지 않으며, 필요하면 별도 migration
  execution class를 먼저 결정한다. 앱 runtime DDL은 호환성 테스트를 위한
  명시적 경로로만 남기고 production migration의 대체로 취급하지 않는다.
- 이유: workspace store의 `_has_rows()`와 `_persist_all()`은 여러
  compatibility 관계를 함께 읽고 쓰므로 일부 관계만 readiness에 선언하면
  실제 장애가 API startup 이후에 발견된다. 또한 여러 deploy process가 동시에
  runner를 실행할 수 있어 session-level lock과 body/ledger 원자성이 필요하다.
  schema capability를 하나의 Interface에 모으면 migration·readiness·운영
  smoke의 locality와 failure 진단 leverage가 올라간다.
- 검증: readiness contract가 전체 compatibility table·핵심 column/index를
  요구하는지 synthetic schema test로 확인했고, fresh disposable PostgreSQL에서
  migration `001→023` apply·재실행 skip·manual food two-process smoke와
  normalized `/ready` read/write를 함께 확인한다. 실제 managed PostgreSQL
  failover·network partition·rolling deploy 중 migration cutover는 별도 운영
  acceptance다.

## ADR-077 — 인증 helper는 token TTL 기반 cleanup만 수행한다

- 상태: `accepted`
- 결정: password reset token과 revoked account-token hash는 업무 데이터와 별도의
  `authentication_helper` retention class로 둔다. reset token은
  `PASSWORD_RESET_TTL` 30분과 1시간 grace, revoked account-token hash는
  `ACCOUNT_TOKEN_TTL` 30일과 1시간 grace가 지난 뒤에만 cleanup한다. 유효 reset
  token, grace 안의 revoked hash, account·inventory·receipt·business audit·각종
  idempotency record는 이 작업의 대상이 아니다.
- 실행: SQLite/PostgreSQL `AccountRepository`의
  `cleanup_expired_security_records()`를 API startup에서 한 번 실행하고,
  `services/api/scripts/cleanup_auth_records.py`를 운영 maintenance schedule에서
  반복 실행할 수 있다. PostgreSQL auth repository는 migration runner가 schema를
  준비한 뒤 `initialize_schema=False`로 열며, cleanup script가 auth table을 만들거나
  다른 workspace 데이터를 순회하지 않는다.
- 실패/보호: cleanup SQL transaction이 실패하면 rollback하고 in-memory token cache를
  바꾸지 않는다. raw token/email/workspace ID를 로그나 결과에 출력하지 않는다. 이
  retention은 법정 보존 정책이 아니며, backup/WAL/object storage/external
  provider의 삭제·보존은 운영 정책과 별도 acceptance다.
- 이유: 만료된 helper row를 계속 보존하면 장기 운영에서 불필요한 보조 데이터가
  누적되지만, 너무 짧은 cleanup은 아직 유효한 stateless token의 revocation 판단을
  잃을 수 있다. TTL+grace를 code-level invariant로 두면 token validity와 cleanup의
  관계를 설명할 수 있고, 업무 audit을 임의로 삭제하는 위험을 피한다.
- 검증: SQLite에서 expired reset 2개와 TTL+grace 밖 revoked hash 1개만 삭제하고
  fresh/grace row를 보존하는 fixture를 확인했으며, PostgreSQL auth/schema contract와
  전체 API 회귀를 통과했다. 실제 managed scheduling·legal retention·backup/WAL
  readback은 별도 운영 acceptance다.

## ADR-078 — WorkspaceMutation은 snapshot 범위가 명확한 mutation에만 적용한다

- 상태: `accepted`
- 결정: `WorkspaceMutation.run()`은 app-owned workspace state의 snapshot을 만든
  뒤 mutation과 durable `flush()`를 실행한다. 일반 예외에서는 process-local
  snapshot을 복원하고 예외를 caller에 전달하며, `ConcurrentWorkspaceWriteError`는
  PostgreSQL store가 이미 reload한 승자 snapshot을 보존하기 위해 restore하지
  않는다. 현재는 snapshot에 포함된 date assertion·product provenance·shopping list
  check/delete·meal preferences·notification preferences·push subscription·알림
  read-state mutation에 적용한다.
- 오류 계약: 적용 route는 persistence failure를
  `food_date_persistence_unavailable`,
  `product_provenance_persistence_unavailable`,
  `shopping_list_item_persistence_unavailable`,
  `meal_preferences_persistence_unavailable`,
  `notification_preferences_persistence_unavailable`,
  `push_subscription_persistence_unavailable`, 또는
  `notification_read_persistence_unavailable`,
  `grocy_mapping_persistence_unavailable`,
  `grocy_location_mapping_persistence_unavailable`, 또는
  `grocy_outbox_persistence_unavailable` structured detail로 반환하고,
  `retryable=true`, `action=retry_later`를 제공한다. 이 error는 외부 Grocy 상태를
  자동 재호출하거나 revision conflict를 merge한다는 뜻이 아니다.
- 저장소 경계: 설정·구독·읽음 상태·Grocy mapping audit의 public mutation 메서드는
  `persist=False`를
  지원한다. 이 경로에서는 method-level direct commit을 하지 않고 outer
  `WorkspaceMutation`의 flush가 SQLite/PostgreSQL의 전체 상태 transaction을
  소유한다. Grocy mapping/location 및 outbox reconcile/retry는 snapshot에 포함된
  workspace state로 같은 outer flush를 사용한다. 기존 worker 호출은 기본
  `persist=True`로 유지해 worker lease/delivery의 lifecycle을 바꾸지 않는다.
- 적용 제한: snapshot tuple에 없는 notification delivery·worker lease/heartbeat·
  recipe review state·Grocy worker state에는 이 Module을 적용하지 않는다. Grocy
  worker가 외부 API를 호출하는 중간 transaction에도 적용하지 않는다. 해당
  상태를 포함하지 않은 snapshot으로 전역 atomicity를 주장하면 false rollback
  증거가 되므로, 먼저 상태별 repository transaction 또는 좁은 snapshot contract를
  결정한다.
- 이유: 여러 route가 동일한 recovery 순서를 복사하면 한 route는 stale snapshot을
  복원하고 다른 route는 복원하지 않는 drift가 생긴다. 공통 Module은 caller가
  `mutation`만 제공하도록 해 failure ordering의 locality와 테스트 leverage를
  높인다. 적용 범위를 명시적으로 제한하면 기존 idempotency·revision·외부
  reconciliation 결정을 침범하지 않는다.
- 검증: Module unit에서 regular failure restore·concurrency no-restore·success
  result를 확인하고, date assertion API rollback·product provenance route·shopping
  check/delete rollback·설정/구독/읽음 상태 rollback을 API 회귀로 확인한다.
  SQLite 재구성, disposable PostgreSQL 재구성, 알림 설정/센터 retry UI를 별도로
  확인한다. notification delivery/worker의 전체 lifecycle·recipe/Grocy 전체
  mutation과 managed failover는 별도 acceptance다.

## ADR-079 — API-backed worker runner는 body-level error와 bounded backoff를 공통 처리한다

- 상태: `accepted`
- 결정: notification·Grocy·product-enrichment의 standalone HTTP runner는 API
  response status만으로 성공을 판정하지 않는다. HTTP 200이어도 tick response의
  `error`가 있으면 실패 cycle로 분류한다. `--once`는 하나의 workspace라도 실패하면
  exit code `1`로 종료하고, 장기 실행은 기본 interval을 기준으로
  `30→60→120→240→300초` bounded exponential backoff를 적용한다. 정상 전체 cycle은
  failure streak를 초기화하고 기본 interval로 복구한다.
- 소유권: runner는 workspace allowlist를 발견하거나 변경하지 않고 API service-token
  tick을 재호출하는 scheduling만 소유한다. lease·heartbeat·outbox/delivery
  transaction·provider retry는 API와 각 domain worker가 소유하며, runner backoff와
  domain-level retry는 서로 다른 시간축이다.
- 이유: 현재 tick endpoint는 내부 예외를 안전한 response `error` field로 반환하므로
  `raise_for_status()`만 호출하면 HTTP 200 실패를 성공으로 오인할 수 있다. 또한
  고정 interval 재호출은 API·DB 장애가 지속될 때 불필요한 부하를 만든다. 공통 loop로
  판정·exit·backoff를 국소화하면 세 worker script의 drift와 scheduler별 장애 해석
  차이를 줄일 수 있다.
- 안전 경계: error log에는 response body·service token·provider 원문을 복사하지
  않고 오류 종류와 bounded 상태만 출력한다. backoff는 외부 provider의 delivery
  성공이나 crash recovery를 증명하지 않으며, 실제 Push/Grocy/provider 운영 readback,
  managed failover, multi-replica metrics는 별도 acceptance다.
- 검증: 공통 runner의 delay cap·once failure·failure/recovery cycle과 세 script의
  HTTP 200 body-level error/success contract를 unit test로 확인한다. `--help`와
  기존 notification·Grocy·product-enrichment 전체 API 회귀를 함께 통과시킨다.

## ADR-080 — Grocy 사용자 설정과 운영 assertion은 외부 sync worker와 분리해 복구한다

- 상태: `accepted`
- 결정: Grocy product mapping, storage location mapping, `reconciliation_required`
  판정, dead-letter manual retry는 `WorkspaceMutation`의 snapshot 범위 안에서
  로컬 workspace 상태·관련 receipt `commit_transactions` 상태와 mapping audit를
  한 번의 outer flush로 저장한다. 일반
  persistence failure는 기존 mapping/outbox 상태를 복원하고 typed retryable
  response를 반환한다. 이 경계는 외부 Grocy API 호출을 포함하지 않는다.
- direct commit 경계: `record_grocy_mapping_audit_event()`는 `persist=False`를
  지원한다. mapping route가 mapping·outbox projection·audit event를 memory에서
  함께 갱신한 뒤 outer flush를 실행하므로, audit만 먼저 commit되고 mapping이
  실패하는 순서를 허용하지 않는다. worker와 기존 직접 호출은 기본 `persist=True`
  를 유지한다.
- 안전 경계: reconciliation의 `already_applied`는 운영자가 입력한 Grocy
  transaction ID를 보존할 뿐 외부 history를 자동 조회하지 않는다. manual retry는
  outbox 상태만 `dead_letter → pending`으로 되돌리며, 외부 중복 호출을 자체적으로
  보장하지 않는다. 실제 provider idempotency는 기존 outbox key·Grocy adapter
  계약의 책임이다.
- 이유: mapping과 audit가 별도 commit되면 UI에는 “연결됨”으로 보이지만 변경 이력이
  사라지거나, outbox가 새 mapping을 사용하지 못하는 phantom 상태가 생길 수 있다.
  반대로 worker 외부 호출까지 같은 snapshot에 억지로 넣으면 provider transaction과
  local rollback을 잘못 atomic하다고 해석하게 된다. 사용자 assertion과 외부 side
  effect를 분리하면 recovery locality와 운영 판단의 honesty를 함께 유지한다.
- 검증: product/location mapping, reconciliation, dead-letter retry의 flush failure
  rollback API tests와 connected Grocy mapping retry를 통과시키고, SQLite/
  disposable PostgreSQL 재구성에서 mapping/outbox/audit persistence를 별도로
  확인한다. 외부 Grocy provider, worker crash 중 provider transaction, managed
  failover는 별도 acceptance다.

## ADR-081 — shared recipe catalog는 workspace mutation과 분리된 catalog transaction을 사용한다

- 상태: `accepted`
- 결정: COOKRCP review draft와 review audit event는 사용자 workspace가 아닌
  shared recipe catalog projection의 state로 취급한다. `RecipeCatalogMutation`은
  catalog draft/event snapshot을 만든 뒤 import·검토 수정·승인·반려 mutation과
  하나의 catalog flush를 수행한다. 일반 persistence failure에서는 이전 draft와
  audit 목록을 복원하고 `recipe_review_persistence_unavailable` typed retryable
  response를 반환한다.
- 소유권: catalog transaction은 source fetch, license/이미지 권한 판단, recipe
  approval policy를 대신하지 않는다. 승인된 catalog recipe가 planner 후보로
  materialize되는 경계와 사용자 workspace inventory transaction도 합치지 않는다.
  shared catalog는 workspace별 데이터가 아니므로 `WorkspaceMutation` snapshot에
  억지로 넣지 않는다.
- direct commit 경계: `record_recipe_review_event()`는 `persist=False`를 지원하고,
  catalog mutation 내부에서 draft와 audit를 memory에 함께 갱신한 뒤 SQLite 또는
  PostgreSQL catalog transaction으로 저장한다. 기존 직접 호출은 기본 `persist=True`
  로 호환한다.
- 이유: draft를 먼저 저장하고 audit를 나중에 저장하면 승인 결과가 planner에 노출된
  뒤 운영자는 변경 근거를 잃을 수 있다. 반대로 workspace snapshot과 shared catalog를
  한 transaction으로 가정하면 서로 다른 owner·scope·connection lifecycle을 왜곡한다.
  별도 Module을 두면 shared catalog의 rollback locality를 확보하면서 user workspace
  isolation도 유지한다.
- 검증: import/update/approve persistence failure에서 draft status와 audit가 함께
  복원되는 API test, SQLite와 disposable PostgreSQL shared catalog close/reopen,
  connected 관리자 review retry, 전체 API/frontend 회귀를 확인한다. 다중 admin
  cross-process conflict,
  source provider delivery와 managed database failover는 별도 acceptance다.

## ADR-082 — shared recipe review는 explicit claim과 bounded lease로 ownership을 표현한다

- 상태: `accepted`
- 문제: catalog revision은 두 관리자의 stale payload가 서로 덮어쓰는 것을 막지만,
  누가 현재 draft를 검토하는지 표현하지 않아 여러 관리자가 같은 pending draft를
  동시에 편집하거나 승인하려고 시도할 수 있다. 단순히 최신 revision을 재로드하는
  것만으로는 운영자 작업의 ownership과 중단 후 회복을 설명하지 못한다.
- 결정: pending recipe draft는 `claim`을 명시적으로 획득한 actor만 PATCH·approve·reject할
  수 있게 한다. claim은 actor id/email, 획득 시각, 만료 시각을 draft payload에 nullable로
  저장하며 기본 TTL은 `RESCUE_MEAL_RECIPE_REVIEW_CLAIM_TTL_SECONDS=3600`이다. TTL은
  300~86400초로 bounded 한다. 현재 담당자는 `release`로 자발적으로 해제하고, 만료된
  claim은 다음 관리자가 다시 claim하여 회수한다. approve/reject 성공 시 active claim은
  자동으로 제거한다.
- 충돌 계약: active claim이 다른 actor에게 있으면 `recipe_review_claim_conflict` 409,
  claim 없이 mutation하면 `recipe_review_claim_required` 409, 만료된 claim으로 mutation하면
  `recipe_review_claim_expired` 409를 반환한다. claim/release와 만료 claim 회수는 shared
  catalog draft/audit snapshot에 포함하고 catalog revision을 함께 전진시킨다.
- 호환성: ownership field는 기존 JSON payload에서 missing이면 `null`로 읽히므로 기존
  draft를 파괴적 migration 없이 로드할 수 있다. 그러나 공유 legacy token은 actor가 하나로
  합쳐지므로 조직 운영에서는 개별 `recipe_admin` account token을 사용한다.
- 경계: 이 결정은 draft 단위 ownership과 stale-write 보호만 다룬다. 조직/팀/프로젝트
  RBAC, 관리자 휴가·업무 재배정 정책, 외부 source/license 승인, provider transaction,
  managed PostgreSQL failover는 별도 운영 정책이다.
- 검증: unclaimed mutation 차단, 동일 actor idempotent claim, 다른 actor claim/release
  conflict, expired claim recovery와 `claimed`/`released` audit, SQLite/PostgreSQL payload
  reconstruction, connected claim→approve UI flow를 API/browser 회귀로 확인한다.

## ADR-083 — recipe review와 publish decision capability를 분리한다

- 상태: `accepted`
- 문제: `recipe_admin` 단일 role만으로는 draft canonicalization을 담당하는 검토자와
  planner에 공개할 승인·반려 결정을 내리는 게시 담당자를 분리할 수 없다. claim ownership은
  누가 작업 중인지 표현하지만 해당 actor가 publish decision을 할 권한이 있는지는 보장하지
  않는다.
- 결정: 기존 `recipe_admin` role은 review capability로 유지하고,
  `RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS`가 비어 있지 않은 경우에만 해당 normalized account
  email을 approve/reject publisher로 허용한다. allowlist가 비어 있으면 기존 동작과의
  호환성을 위해 모든 `recipe_admin`이 publish decision을 수행할 수 있다. 이 정책은 서버가
  읽으며 browser나 token payload가 권한을 결정하지 않는다.
- API: `GET /api/recipe-review/capabilities`는 `can_review`, `can_publish`, policy kind,
  ownership enabled, actor type만 반환한다. publisher email allowlist 자체는 반환하지 않는다.
  reviewer-only actor의 approve/reject는 `recipe_review_publish_forbidden` 403과
  `contact_recipe_publisher` action으로 종료한다.
- UI: reviewer-only actor도 claim·편집·저장을 수행할 수 있지만 planner 승인·반려 버튼은
  disabled 상태로 표시한다. API는 최종 권한 경계이므로 오래된 frontend가 버튼을 노출해도
  서버가 우회되지 않는다.
- 호환성: account role과 `ra1` token 형식에는 변경이 없다. legacy shared review token은
  publisher allowlist가 비어 있을 때만 기존 publish fallback을 유지하며, allowlist가 설정되면
  개인 email이 없어 publish할 수 없다.
- 경계: 이 결정은 capability 분리만 다루며 조직/팀/프로젝트 계층 RBAC, delegated assignment,
  publisher rotation, legacy token 폐기, 외부 source/license 정책과 managed failover는 별도다.
- 검증: reviewer capability response, reviewer edit/publish denial, publisher claim/approve,
  connected reviewer-only UI, full API/browser regression을 확인한다.

## ADR-084 — production에서는 shared recipe review token을 fail-closed로 차단한다

- 상태: `accepted`
- 문제: `RESCUE_MEAL_RECIPE_REVIEW_TOKEN`은 local migration을 위해 남아 있는 shared
  fallback이라 개별 actor identity와 책임 추적을 제공하지 않는다. 문서에 “production에서
  비워라”라고 적는 것만으로는 secret 설정 실수 후 배포를 막을 수 없다.
- 결정: `RESCUE_MEAL_ENVIRONMENT=production`에서 legacy token이 non-empty이면 production
  preflight가 `recipe-review-legacy-token` error를 반환하고, API `/ready`는
  `recipe_review_legacy_token_disabled` 503으로 준비 상태를 거부한다. token header를 사용한
  runtime recipe review request도 같은 typed 503으로 종료한다. account 기반 `recipe_admin`
  인증은 영향을 받지 않는다.
- 비노출: error detail·access log·metrics에는 token 원문을 넣지 않는다. preflight는 setting
  이름과 remediation만 출력한다.
- 경계: 이 gate는 잘못된 legacy secret 설정의 production 승격을 차단하지만, secret manager
  rotation·실제 secret 폐기·배포 pipeline이 이 값을 주입하지 않는다는 조직 운영 증명은
  대신하지 않는다.
- 검증: production preflight rejection, runtime review rejection, readiness rejection,
  secret redaction과 기존 local/preview legacy compatibility를 API 회귀로 확인한다.

## ADR-085 — shared recipe review invalidation은 workspace와 분리된 global catalog channel을 사용한다

- 상태: `accepted`
- 문제: recipe draft ownership과 publisher capability는 여러 관리자 계정이 공유하는
  catalog 상태인데 기존 workspace-scoped cross-tab transport만으로는 서로 다른 account
  workspace의 review panel에 claim/release/import 결과를 전달할 수 없다.
- 결정: 성공한 `/api/recipe-review/*` mutation은 `recipe-review` channel과 opaque
  `recipe-catalog` namespace로 `BroadcastChannel` 우선, `localStorage` fallback
  invalidation을 발행한다. 사용자 workspace key·access token·draft payload는 메시지에 넣지
  않는다. `RecipeReviewPanel`은 현재 assignment filter를 다시 읽는다.
- stale editor 보호: 외부 invalidation은 queue 목록을 refresh하지만 열려 있는 local
  editor를 자동으로 교체하지 않는다. panel은 최신 상태를 확인하라는 notice를 보여주며,
  실제 mutation은 catalog revision, claim ownership, publisher capability API가 다시 판정한다.
- 경계: 이 channel은 best-effort advisory notification이다. 서버 push/subscription,
  multi-device delivery guarantee, distributed lock, real-time event ordering을 보장하지
  않는다. mutation 성공 이후에만 발행되며 실패한 mutation을 성공처럼 알리지 않는다.
- 검증: transport shared-key roundtrip, remote operator invalidation, local editor preservation,
  full connected/browser build regression을 확인한다.

## ADR-086 — cross-device recipe review는 revision-only bounded probe를 fallback으로 사용한다

- 상태: `accepted`
- 문제: `BroadcastChannel`/`localStorage` invalidation은 같은 browser storage context의
  tab에는 빠르지만 다른 기기·다른 browser·메시지를 놓친 API process의 변경을 전달하지
  못한다. shared recipe queue가 오래된 상태로 고정될 수 있다.
- 결정: `GET /api/recipe-review/revision`은 인증 actor에게 draft payload 없이 shared catalog
  revision body/header만 반환한다. review panel은 tab visibility 복귀와 30초 bounded interval에서
  이 probe를 실행하고, 관찰한 revision이 달라진 경우에만 현재 assignment queue를 다시 읽는다.
  probe 중복 실행은 in-flight guard로 막는다.
- stale 보호: queue refresh가 선택 draft를 변경하거나 제거하면 local editor를 자동으로 새
  payload로 바꾸지 않고 stale 상태로 잠근다. 운영자가 `최신 draft 불러오기`를 누른 뒤에만
  새 editor를 적용한다. probe 실패는 기존 queue/editor를 삭제하지 않는다.
- 경계: 이 probe는 server push, event ordering, immediate freshness, distributed lock을
  보장하지 않는다. BroadcastChannel/localStorage는 여전히 빠른 경로이며 revision/claim/
  publisher API가 실제 write authority다.
- 검증: revision endpoint/header, visibility probe, revision 변화 queue refresh, selected
  editor preservation/stale lock, probe failure preservation, full API/browser build 회귀를
  확인한다.

## ADR-087 — durable workspace projection reload는 copy-on-write read snapshot을 사용한다

- 상태: `accepted`
- 문제: 요청마다 SQLite/PostgreSQL workspace projection을 refresh하는 동안 loader가
  public collection을 빈 객체로 교체하고 행을 다시 채우면, 동시 read가 DB의 완성된
  상태가 아닌 transient empty state를 관찰할 수 있다. 저장 요청은 성공했는데도
  `/api/meal-plans/latest`가 `null`을 반환하는 planner 재진입 경쟁이 이 경계에서
  재현되었다. 또한 reload 중 route가 현재 state에 기록한 local mutation이 완료 후
  state reference 교체로 유실될 수 있었다.
- 결정: durable `SqliteStore`·`PostgresStore`는 projection state field를 private
  loading dictionary에 먼저 materialize한다. 모든 load가 성공하면 state reference를
  교체하고, load가 실패하면 기존 read snapshot을 유지한다. reload 시작 시점 이후
  이전 state에서 변경된 local field는 새 state에 보존한다. loader thread만 private
  state를 보며 다른 reader는 이전 complete state를 읽는다.
- 범위: inventory·receipt·meal plan/bundle·notification·Grocy·recipe audit와
  idempotency ledger를 포함하는 workspace projection에 적용한다. query·commit 재실행,
  PostgreSQL revision guard, operation pool, 외부 worker transaction 책임은 바꾸지 않는다.
- 안전성: 일반 write는 기존 revision/flush 경계를 그대로 사용한다. 이 결정은
  managed PostgreSQL failover, network partition, rolling deploy 또는 multi-replica
  ordering을 증명하지 않는다.
- 검증: reload 중 blocking reader가 기존 saved plan을 계속 보는 regression과 reload
  중 local write가 flush 후에도 보존되는 SQLite regression, PostgreSQL bootstrap
  contract, API 전체 회귀와 connected planner save→close→reopen을 확인한다.

## ADR-088 — retryable user operation identity는 OperationLedger Module에 집중한다

- 상태: `accepted`
- 문제: receipt, manual food, shopping receive, storage event가 각각 key trim/검증,
  SHA-256 digest, sorted JSON fingerprint, scoped ID를 별도로 계산하고 있었다. 공통
  규칙의 작은 차이는 같은 transport retry를 서로 다른 operation으로 보거나, 기존
  durable ledger와 호환되지 않는 ID를 만들 위험이 있다.
- 결정: `OperationLedger` Module이 optional `Idempotency-Key` normalization, key
  digest, canonical payload fingerprint, colon-separated scoped digest ID를 소유한다.
  Module은 key 원문을 저장하거나 domain record를 읽지 않는다.
- Adapter 책임: 각 domain Adapter는 workspace/item/receipt scope, durable record,
  lot 존재 여부, replay response, conflict status/detail, 외부 provider transaction을
  계속 소유한다. OperationLedger는 서로 다른 안전 semantics를 하나의 generic replay
  response로 합치지 않는다.
- 호환성: manual food, receipt commit, storage event, shopping receive의 기존 digest
  및 stable ID byte contract를 유지한다. legacy helper 이름은 기존 test/seam 호환을
  위해 유지하고 내부 implementation만 Module 호출로 위임한다.
- 검증: key invalid/trim, canonical ordering, Pydantic payload, identity digest,
  legacy scoped ID unit, 네 domain idempotency/replay API 회귀, PostgreSQL contract와
  full connected E2E를 확인한다.
- 경계: ledger retention/compaction, response reset, managed PostgreSQL failover,
  network partition, provider delivery, cross-replica ordering은 별도 운영 acceptance다.

## ADR-089 — primary intake intent에서 AddFoodSheet lazy chunk를 prefetch한다

- 상태: `accepted`
- 문제: AddFoodSheet를 lazy chunk로 분리한 상태에서 사용자가 식품 추가 버튼을 누르면
  BottomSheet dialog shell이 먼저 visible해지고, file input·camera control을 포함한
  AddFoodSheet가 늦게 mount될 수 있다. full connected 실행에서 실제 `setInputFiles()`
  timeout으로 관찰되었다.
- 결정: AddFoodSheet의 lazy split은 유지하되, `openAdd()`가 사용자 intent 시점에
  동일 dynamic import를 prefetch하고 module resolve 후에만 add dialog를 연다. control 없는
  shell을 사용자에게 ready 상태로 노출하지 않으며, module load 실패는 retry toast로
  같은 intent를 다시 실행한다.
- 성능: initial bundle에 AddFoodSheet implementation을 정적으로 포함하지 않는다.
  production build에서 AddFoodSheet chunk와 initial index JS 크기를 별도로 확인한다.
- 범위: receipt·label·barcode·manual intake가 공유하는 AddFoodSheet load만 다룬다.
  실제 network/CDN cache, OS file picker, camera permission, 실기기 acceptance는 포함하지
  않는다.
- 검증: prefetch 전 full-suite timeout, prefetch 후 receipt/label intake repeat, full
  connected, protected runtime와 production build를 확인한다.

## ADR-090 — WorkspaceMutation은 active store lock으로 operation 구간을 직렬화한다

- 상태: `accepted`
- 문제: 공통 `WorkspaceMutation` Module이 snapshot·mutation·flush·restore를 제공하지만
  lock이 없으면 같은 workspace의 projection refresh나 다른 적용 mutation이 중간에
  끼어들 수 있다. 특히 durable state의 snapshot과 flush가 서로 다른 state를 보는
  위험이 있다.
- 결정: `InMemoryStore`와 `WorkspaceStoreRouter`가 `mutation_lock()`을 제공하고,
  `WorkspaceMutation.run()`은 lock을 지원하는 store에서 전체 operation을 그 lock 안에
  실행한다. SQLite/PostgreSQL은 기존 process-local `RLock`을 재사용하며, test double은
  `nullcontext`로 호환한다.
- 범위: 현재 `WorkspaceMutation.run()`을 사용하는 date/provenance/shopping/
  notification/push/preferences/Grocy mapping/reconciliation/retry caller에 적용한다.
  receipt·meal-plan·storage direct route와 worker의 외부 provider transaction은 이 결정의
  자동 atomic 범위가 아니다.
- 안전성: PostgreSQL revision guard가 cross-process authority로 남고, 일반 failure는
  기존 snapshot restore, concurrency conflict는 winner snapshot 보존 규칙을 유지한다.
- 검증: lock depth unit regression, API 전체 회귀, connected planner/receipt/shopping/
  notification/Grocy 흐름을 확인한다.

## ADR-091 — storage event direct route는 WorkspaceMutation과 active lock을 사용한다

- 상태: `accepted`
- 문제: storage event route가 직접 snapshot·InventoryRepository mutation·Grocy outbox
  append·reprioritize·flush·restore를 수행해 공통 WorkspaceMutation lock을 우회했다.
  Idempotency-Key precheck도 lock 밖에 있어 동일 key 동시 요청의 duplicate event 위험이
  있었다.
- 결정: active workspace `mutation_lock()` 안에서 idempotency lookup/conflict check와
  lot validation을 먼저 수행하고, 실제 mutation과 durable flush/regular failure restore는
  `WorkspaceMutation.run()`으로 실행한다. `ConcurrentWorkspaceWriteError`는 winner
  snapshot을 보존하도록 그대로 전파한다.
- Adapter 책임: `InventoryRepository`는 quantity conservation·partial split·opened_at·
  consume/discard invariant를 유지하고, storage route는 response·Grocy sync status와
  domain error semantics를 유지한다.
- 검증: structural seam test, same-key concurrent HTTP test의 단일 event/replay,
  InventoryRepository/API/full connected regression을 확인한다.
- 경계: receipt/meal-plan direct route, worker/provider transaction, managed failover,
  network partition, reverse-proxy response reset은 이 결정에 포함하지 않는다.

## ADR-092 — single meal-plan save는 WorkspaceMutation recovery seam을 사용한다

- 상태: `accepted`
- 문제: 단일 `POST /api/meal-plans`가 plan별 lock과 revision replay는 사용하지만,
  candidate materialization 후 plan 저장·saved audit append·flush·phantom rollback은
  private helper에 직접 구현되어 `WorkspaceMutation`의 공통 recovery/operation lock을
  우회했다.
- 결정: active workspace mutation lock과 기존 plan별 lock을 유지하면서
  `WorkspaceMutation.run()`이 single-plan save의 snapshot·staging mutation·flush·regular
  failure restore를 소유한다. `_create_meal_plan()`은 plan/bundle identity 검증과 saved
  plan/audit staging만 수행한다.
- 호환성: `plan_id` replay, snapshot/recipe conflict, PostgreSQL winner reload, saved audit
  1건 semantics를 유지한다. plan_id 없는 legacy save도 동일 workspace mutation lock을
  사용한다.
- 범위: multi-day bundle save와 meal-plan completion/consumed event 전체 transaction은
  이 결정에 포함하지 않는다. 외부 Grocy provider transaction과 managed failover도
  별도 운영 acceptance다.
- 검증: structural seam, preview/latest recovery, flush failure phantom, concurrent same-
  plan save, full API와 connected planner regression을 확인한다.

## ADR-093 — single meal-plan completion은 중간 persistence 없이 WorkspaceMutation으로 저장한다

- 상태: `accepted`
- 문제: completion route가 여러 consumed storage event와 plan/bundle/audit 상태를 직접
  snapshot·flush·restore하고 있었다. durable adapter의 기본 `reprioritize()`가 중간에
  persist하면 이후 실패 시 partial consumption이 남을 수 있다.
- 결정: 기존 plan별 lock 안에서 `WorkspaceMutation.run()`으로 completion 전체를 실행하고,
  completion 중 `reprioritize(persist=False)`를 사용해 consumed event·plan 상태·bundle
  progress·audit를 하나의 outer flush에서 확정한다. regular failure는 전체 snapshot을
  복원하고, revision conflict는 winner snapshot을 유지한다.
- 호환성: allocation quantity/unit validation, no-consumed `409`, already-completed
  replay, linked bundle progress, Grocy sync status와 consumed audit response를 유지한다.
- 범위: single-plan completion과 linked single-plan day만 다루며, multi-day bundle save,
  외부 Grocy transaction, managed failover/network partition은 별도다.
- 검증: structural seam, normal/adjusted/multi-lot/changed-lot completion, flush failure
  phantom regression, full API와 connected E2E를 확인한다.

## ADR-094 — multi-day bundle save는 bundle lock과 WorkspaceMutation으로 저장한다

- 상태: `accepted`
- 문제: multi-day preview는 side-effect-free지만 bundle save가 direct snapshot/flush/
  restore를 사용해 공통 recovery Seam을 우회했다. bundle state와 day state가 flush 전에
  실패하면 process-local phantom bundle이 남을 수 있었다.
- 결정: `bundle_id`별 lock을 유지하면서 `WorkspaceMutation.run()`이 multi-day save의
  preview rematerialization, snapshot hash/identity 검증 후 bundle과 day state staging,
  outer flush와 regular failure restore를 소유한다. bundle_id 없는 호환 요청도 active
  workspace mutation lock을 사용한다.
- 호환성: bundle retry/history/latest, 다른 snapshot `409`, servings/day plan payload,
  selected single-day save와 linked progress semantics를 유지한다.
- 범위: bundle save만 다룬다. multi-day day completion/consumed event transaction,
  외부 Grocy provider와 managed failover/network partition은 별도다.
- 검증: structural bundle Seam, preview/servings/retry/history/conflict, selected day/link
  repair/progress, full API와 connected E2E를 확인한다.

## ADR-095 — receipt commit은 pending marker와 finalization을 분리한다

- 상태: `accepted`
- 문제: receipt commit finalization이 direct snapshot/flush/restore를 사용하고 lot 생성·
  reprioritize가 중간 persistence를 일으키면 여러 lot 중 일부만 durable해질 수 있다.
  반면 commit 시작 시 pending transaction을 먼저 저장하는 것은 crash/retry identity에
  필요하다.
- 결정: receipt별 lock과 active workspace mutation lock을 유지한다. pending
  `CommitTransactionRecord`는 먼저 durable flush하고, 그 뒤 finalization만
  `WorkspaceMutation.run()`으로 실행한다. finalization은 `upsert_from_receipt(persist=False)`와
  `reprioritize(persist=False)`를 사용해 lot·receipt·outbox·alias/audit·transaction
  결과를 하나의 outer flush에서 확정한다.
- 실패 처리: finalization regular failure는 pending snapshot으로 business state를
  복원하고 transaction을 `needs_reconciliation`으로 durable하게 남긴다. PostgreSQL
  revision conflict는 winner snapshot을 보존하며 동일 operation replay를 우선한다.
- 호환성: GTIN lot 연결, receipt commit idempotency/replay/conflict, pending retry,
  concurrent commit 1 lot, Grocy sync status와 기존 response semantics를 유지한다.
- 경계: 외부 Grocy provider transaction·managed failover·network partition·response reset과
  ledger retention은 별도 운영 acceptance다.
- 검증: structural, GTIN/replay/pending/concurrent/rollback/final-flush-failure API와
  full connected regression을 확인한다.

## ADR-096 — multi-day day completion은 linked single-plan completion transaction을 재사용한다

- 상태: `accepted`
- 문제: multi-day bundle의 특정 날짜를 완료할 때 bundle progress, single plan, inventory와
  consumed event가 서로 다른 persistence 경계를 가지면 final flush 실패 시 날짜만
  `completed`로 남거나 소비 event가 유실될 수 있다. 반면 현재 UI/API는 bundle 날짜를
  single plan으로 먼저 연결한 뒤 기존 completion route를 호출한다.
- 결정: 별도 bundle-level completion endpoint를 추가하지 않고
  `bundle_id`·`bundle_day_index`로 연결된 `MealPlan`의
  `POST /api/meal-plans/{plan_id}/complete`를 source of truth로 사용한다. 기존 plan lock과
  active workspace lock, `WorkspaceMutation` snapshot/outer flush가 bundle day progress를
  함께 소유하며 `reprioritize(persist=False)`로 중간 persistence를 막는다.
- 호환성: `planned → saved → completed`, linked `meal_plan_id`, single-plan
  `already_completed`, consumed allocation/event와 bundle history/readback semantics를
  유지한다. final flush failure는 plan/day/inventory/consumed event를 원복하고 retry가
  `completed`로 진행한다.
- 경계: local linked day transaction만 다룬다. 별도 bundle endpoint, 외부 Grocy
  transaction, managed failover/network partition, response reset과 multi-replica ordering은
  운영 acceptance다.
- 검증: linked day 정상 completion/중복 방지와 final flush failure rollback/retry **2 passed**,
  API 전체 **461 passed**, 기존 connected E2E **76 passed**를 확인한다.

## ADR-097 — planner read는 Coordinator lifecycle을 사용하고 read-only POST는 broadcast하지 않는다

- 상태: `accepted`
- 문제: `MealPlanSheet`의 preview/latest/preferences/history/audit와 nested shopping read가
  direct fetch로 실행되어 workspace/channel abort와 stale-response 판정을 공유하지 않았다.
  또한 HTTP method가 POST라는 이유만으로 planner preview와 label/barcode parse 같은
  read-only 작업이 workspace mutation invalidation을 발행했다.
- 결정: `meal-plan` channel을 추가하고 planner read를 `WorkspaceSyncCoordinator.run()`에
  통과시킨다. `mealApi` read는 실행별 `AbortSignal`을 전달하고, meal-plan save/complete와
  meal-preference 변경만 `meal-plan` invalidation을 발행한다. preview/options/
  multi-day-preview, barcode parse, label parse/intake, inference와 guest-transfer preview는
  명시적 broadcast exemption으로 둔다. nested shopping read는 `shopping-list` channel을
  사용한다.
- 호환성: planner preview는 계속 side-effect-free이며 save/complete/revision semantics,
  existing shopping read/write와 cross-tab recipe transport를 유지한다. same-origin 다른
  탭의 meal-plan mutation은 열린 planner가 다시 읽고, `current=false` response는 state를
  덮어쓰지 않는다.
- 경계: BroadcastChannel/localStorage는 best-effort advisory이며 일반 planner의
  cross-device revision probe, managed failover/network partition, response reset, 실제
  device network/CDN/cache와 multi-replica ordering은 운영 acceptance다.
- 검증: planner preview non-invalidation과 same-origin cross-tab refresh **2 passed**,
  workspace-sync **9 passed**, fixture/mobile **35 passed + 2 skipped**, build protected
  runtime **28**, Vite **757 modules**, connected E2E **78 passed**를 확인한다.

## ADR-098 — manual food create/correction은 WorkspaceMutation과 typed retry를 사용한다

- 상태: `accepted`
- 문제: `POST /api/foods`가 새 lot create와 target correction을 처리하면서 idempotency
  operation ledger·lot·priority·product/date audit를 직접 snapshot/flush/restore했다.
  이 경계는 다른 workspace mutation과 lock/recovery contract가 달랐고, persistence failure가
  일반 문자열 오류라 frontend가 복구 원인을 구분하기 어려웠다.
- 결정: `manual_food_lock`과 active workspace `mutation_lock()`을 유지하면서 create와
  correction의 state mutation을 `WorkspaceMutation.run()` 안에서 수행한다.
  `reprioritize(persist=False)`로 lot·audit·manual operation을 staging하고 outer flush에서
  확정하며, 기존 operation replay는 inference 전에 반환한다. regular failure는
  `manual_food_persistence_unavailable` typed `503`으로 기존 상태를 보존하고, PostgreSQL
  concurrency conflict는 stale restore 없이 winner/replay 경로를 유지한다.
- 호환성: target 없는 create의 새 lot semantics, `correct + target_food_id`의 수량·단위·
  구매/개봉 provenance 보존, same-key replay/payload conflict, 소비된 lot 재생성 차단,
  date/provenance audit와 기존 response semantics를 유지한다.
- 경계: local workspace transaction과 compatibility/normalized projection까지만 다룬다.
  외부 Grocy/provider transaction, managed failover/network partition, response reset, legal
  retention과 multi-replica ordering은 운영 acceptance다.
- 검증: refactor 전 seam 호출 0회 regression, manual-food API **16 passed**, final-flush
  rollback/retry, disposable PostgreSQL two-process smoke, connected manual-food **3 passed**,
  API 전체 **463 passed**, connected 전체 **78 passed**를 확인한다.

## ADR-099 — receipt draft persistence와 intake control readiness를 분리해 닫는다

- 상태: `accepted`
- 문제: receipt draft 생성이 fingerprint lock은 사용했지만 direct snapshot/flush/restore로
  남아 있어 공통 workspace recovery와 typed persistence error를 갖지 못했다. 동시에
  AddFoodSheet와 LazyBottomSheet의 lazy loading 중 dialog shell이 먼저 mount되면 사용자가
  file input/tab을 찾기 전에 조작할 수 있었다.
- 결정: receipt fingerprint lock과 active workspace `mutation_lock()` 안에서 committed/
  pending replay를 먼저 판정하고, 새 draft projection을 `WorkspaceMutation.run()`의
  outer flush로 저장한다. regular failure는 `receipt_draft_persistence_unavailable` typed
  503과 phantom 없는 상태로 반환하며, concurrent winner는 stale restore 없이 replay한다.
  `openAdd()`는 AddFoodSheet와 LazyBottomSheet를 모두 resolve한 뒤 sheet를 열고, inner
  AddFoodSheet Suspense를 제거해 outer `DeferredBottomSheet`가 준비 전 shell을 가린다.
- 호환성: pending fingerprint `X-Idempotency-Replayed`, committed receipt `409`, review 전
  StockLot 미생성, PDF/photo intake와 재선택 recovery semantics를 유지한다.
- 경계: local draft persistence와 browser same-origin control readiness만 다룬다. OCR 정확도,
  device permission/network/CDN, managed failover/network partition, response reset과 외부
  provider delivery는 운영 acceptance다.
- 검증: draft seam refactor 전 호출 0회, draft targeted **6 passed**, PDF/typed draft UI
  **2 passed**, API 전체 **464 passed**, connected 전체 **79 passed**, build protected
  runtime **28**·Vite **757**을 확인한다.

## ADR-100 — product-info correction은 WorkspaceMutation과 detail inline retry를 사용한다

- 상태: `accepted`
- 문제: 상품명·브랜드·분류 correction route가 direct snapshot/flush/restore를 사용하고,
  frontend가 optimistic profile 실패를 global toast로만 안내해 열린 detail sheet 안에서
  retry action의 수명과 조작 가능성이 불안정했다.
- 결정: active workspace `mutation_lock()` 안에서 profile target/no-op을 확인하고,
  profile 변경·provenance removal audit·product-info before/after audit·priority 재계산을
  `WorkspaceMutation.run()`과 `reprioritize(persist=False)`로 outer flush한다. regular failure는
  `product_info_persistence_unavailable` typed 503과 기존 state 보존으로 반환한다.
  frontend는 optimistic profile을 원복하고 detail sheet inline alert가 retry를 소유한다.
- 호환성: 상품 프로필만 수정하고 quantity/unit/purchase/opened provenance/DateAssertion은
  보존하며, provenance 제거와 product-info audit의 원인 분리, no-op no-audit, workspace
  revision conflict semantics를 유지한다.
- 경계: local product-info transaction과 UI recovery만 다룬다. 최신 route revision의
  multi-process PostgreSQL HTTP smoke, managed failover/network partition, response reset,
  external provider/device/legal/CI acceptance는 별도다.
- 검증: product-info API targeted **3 passed**, final-flush rollback/typed retry, connected
  inline retry **1 passed**, API 전체 **466 passed**, connected 전체 **80 passed**, build
  protected runtime **28**·Vite **757**을 확인한다.

## ADR-101 — receipt privacy erase는 WorkspaceMutation과 inline retry를 사용한다

- 상태: `accepted`
- 문제: `POST /api/receipts/{receipt_id}/privacy-erase`가 receipt draft 삭제 또는
  committed/pending metadata redaction을 직접 `flush()`하고 있었다. 일반 persistence failure가
  발생하면 공통 `WorkspaceMutation` recovery Seam과 typed retry contract를 거치지 않아,
  draft가 process-local에서 사라지거나 redaction이 부분 적용된 상태로 남을 위험이 있었다.
- 결정: `privacy_erase_receipt(..., persist=False)`는 receipt 삭제·비식별화와 response
  materialization만 staging하고, route는 `WorkspaceMutation.run()`의 snapshot·단일 outer
  flush·regular failure restore를 사용한다. `ConcurrentWorkspaceWriteError`는 PostgreSQL이
  reload한 winner snapshot을 보존하도록 그대로 전파한다.
- 호환성: `confirm: true` validation, 미반영 draft의 `deleted_draft`, commit receipt의
  `redacted_committed`, reconciliation transaction이 참조하는 receipt의 `redacted_pending`
  status를 유지한다. source filename·OCR raw name만 generic marker로 치환하고 lot provenance,
  구매일·수량·DateAssertion·commit transaction·fingerprint는 보존한다.
- frontend Adapter: account의 `영수증 원본 관리`는 persistence 503을
  `receipt_privacy_persistence_unavailable`로 구분하고, 열린 sheet overlay 안에서 기존
  confirmation 대상 receipt를 바로 재시도한다. workspace conflict는 최신 상태 확인으로
  전환한다.
- 범위: local SQLite/PostgreSQL compatibility projection과 account sheet recovery까지다.
  backup/WAL/read replica/object storage/reverse-proxy log, 법정 retention, 외부 Grocy/provider,
  managed failover/network partition과 response reset은 별도 운영 acceptance다.
- 검증: privacy API targeted **5 passed**, SQLite privacy persistence **1 passed**, draft/
  committed/pending flush rollback·retry와 seam 호출 regression, API 전체 **468 passed**,
  connected 전체 **80 passed**, protected runtime **28**·Vite **757**, fixture/mobile
  **35 passed + 2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인한다.

## ADR-102 — shopping list source writes는 WorkspaceMutation과 sheet-local retry를 사용한다

- 상태: `accepted`
- 문제: `POST /api/shopping-list`와 `POST /api/shopping-list/manual`은 실제 workspace 목록을
  생성·갱신하지만 `_sync_shopping_list()`와 manual mutation 내부에서 직접 `flush()`했다.
  따라서 저장 실패 시 plan source와 manual source가 부분적으로 남을 수 있고, 두 caller가
  서로 다른 recovery Interface를 갖게 된다.
- 결정: 계획 source 동기화는 `_sync_shopping_list(..., persist=False)`, 직접 추가는
  `_add_manual_shopping_list_item(..., persist=False)`로 staging한다. 두 route는
  `WorkspaceMutation.run()`의 snapshot·단일 outer flush·regular failure restore를 사용하고,
  `shopping_list_persistence_unavailable` typed `503`을 공통으로 반환한다.
- Adapter/호환성: 기존 source merge·manual source 보존·quantity/checked 재계산과 `422` 입력
  validation을 유지한다. PostgreSQL revision conflict는 stale snapshot을 복원하지 않고
  global conflict Interface로 전파한다. 기존 check/delete의
  `shopping_list_item_persistence_unavailable` error도 프론트 helper가 계속 처리한다.
- frontend Seam: MealPlanSheet의 계획 source와 홈 ShoppingListSheet의 manual add는 열린
  sheet 내부 alert에서 retry action을 소유한다. retry는 기존 source identity 또는 manual
  payload를 재사용하고, workspace conflict는 최신 목록 재조회로 분리한다.
- 범위: local shopping projection의 source creation/update recovery다. GET 자동
  reconciliation, shopping receive의 inventory lot·operation ledger transaction, 외부
  provider, managed failover/network partition, response reset은 별도 운영 acceptance다.
- 검증: shopping API targeted **7 passed**, source/manual seam·flush rollback/retry,
  connected plan/manual retry **2 passed**, API 전체 **470 passed**, connected 전체
  **80 passed**, protected runtime **28**·Vite **757**, initial index **308.54 kB**,
  MealPlanSheet **36.91 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**,
  service-worker **5**, workspace-sync **9**를 확인한다.

## ADR-103 — shopping list read reconciliation도 WorkspaceMutation으로 원자화한다

- 상태: `accepted`
- 문제: `GET /api/shopping-list`는 표면상 read지만 재고가 보충되거나 meal-plan source가
  바뀌면 derived shopping projection을 삭제·갱신한다. 기존에는 source마다
  `_sync_shopping_list()`가 직접 `flush()`해 중간 source만 반영된 상태가 남을 수 있었고,
  read caller가 일반 persistence failure를 구조화해 전달하지 못했다.
- 결정: `get_shopping_list()`는 `_reconcile_shopping_list_sources(persist=False)`와 최종
  read model materialization을 `WorkspaceMutation.run()` 하나로 실행한다. snapshot을 만든 뒤
  모든 source reconciliation을 staging하고 outer flush에서 한 번 확정하며, regular failure는
  이전 shopping list를 복원하고 `shopping_list_persistence_unavailable` typed `503`을 반환한다.
- 호환성: GET response shape, stale planned source 제거, manual source 보존, source quantity/
  checked semantics는 유지한다. `ConcurrentWorkspaceWriteError`는 stale restore 없이
  global conflict Interface로 전파한다. GET은 frontend mutation broadcast를 발행하지 않으며,
  기존 source/manual write와 shopping receive transaction은 별도 caller다.
- frontend Seam: MealPlanSheet와 홈 ShoppingListSheet의 기존 read retry가 typed read failure를
  같은 workspace 목록 재조회로 복구한다. 열린 sheet에서 partial list를 사용자에게 성공처럼
  남기지 않는다.
- 범위: local derived shopping projection의 read-time reconciliation recovery다. 외부
  provider transaction, managed failover/network partition, response reset, backup/WAL/read
  replica와 legal retention은 별도 운영 acceptance다.
- 검증: shopping API targeted **9 passed**, read seam·partial reconciliation flush rollback/
  retry, API 전체 **472 passed**, connected 전체 **80 passed**, protected runtime **28**·Vite
  **757**, initial index **308.54 kB**, MealPlanSheet **36.91 kB**, fixture/mobile **35 passed +
  2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인한다.

## ADR-104 — product-enrichment enqueue/retry는 WorkspaceMutation과 typed retry를 사용한다

- 상태: `accepted`
- 문제: receipt review에서 선택적으로 실행하는 product-enrichment enqueue와 dead-letter
  retry가 job map을 직접 변경하고 `flush()`했다. 공통 snapshot에 job state가 없어서 저장
  실패 후 queued job이 process-local에 남거나 dead-letter 상태가 사라질 수 있었고,
  frontend도 persistence failure와 일시적인 provider/worker 상태를 구분하지 못했다.
- 결정: `WorkspaceMutation` snapshot/restore에 `product_enrichment_jobs`를 포함한다.
  enqueue와 retry route는 job state를 memory에 staging하고 outer `flush()`에서 확정하며,
  일반 persistence failure는 `product_enrichment_persistence_unavailable` typed `503`으로
  반환한다. deterministic receipt/job ID를 사용해 동일 enqueue는 기존 job을 반환하고,
  PostgreSQL revision conflict에서는 stale snapshot을 복원하지 않고 winner job을 반환한다.
- frontend Adapter: AddFoodSheet는 typed persistence failure에서 검수 draft와 product job
  상태를 유지하고 inline `다시 시도`로 enqueue를 재호출한다. 기존 queued/in-flight polling,
  succeeded candidate merge와 dead-letter retry semantics를 유지한다.
- 범위: API가 소유하는 workspace job projection의 enqueue/dead-letter retry persistence다.
  worker의 외부 I1250/Open Food Facts 호출, provider cache/rate limit, lease/heartbeat,
  external delivery, managed failover/network partition과 response reset은 별도 운영
  acceptance다.
- 검증: product-enrichment API/worker targeted **10 passed**, enqueue/retry seam·flush
  rollback/retry, connected receipt review retry **1 passed**, API 전체 **474 passed**,
  connected 전체 **80 passed**, protected runtime **28**·Vite **757**, AddFoodSheet
  **58.91 kB**, initial index **308.65 kB**, fixture/mobile **35 passed + 2 skipped**,
  Sites **4**, service-worker **5**, workspace-sync **9**를 확인한다.

## ADR-105 — shopping receive는 local lot/list/ledger를 WorkspaceMutation으로 원자화한다

- 상태: `accepted`
- 문제: `POST /api/shopping-list/{item_id}/receive`가 새 inventory lot 생성, planned
  source reconciliation, checked 상태, receive operation ledger와 priority를 직접
  snapshot/flush/restore했다. durable adapter의 `reprioritize()`도 중간 persistence를
  일으킬 수 있어 flush 실패 뒤 lot만 남거나 목록/ledger가 어긋날 위험이 있었다.
- 결정: receive route는 idempotency precheck와 기존 lot recovery를 active workspace
  `mutation_lock()` 안에서 수행하고, 새 lot·shopping source·operation ledger·priority를
  `WorkspaceMutation.run()` 안에서 staging한다. `create_manual_lot()`과
  `reprioritize(persist=False)`는 outer flush에 위임한다. regular failure는
  `shopping_receive_persistence_unavailable` typed `503`으로 local snapshot을 복원한다.
- 호환성: `201 received`, same-key `201 + X-Idempotency-Replayed`, 다른 payload `409`,
  consumed lot 재생성 차단, planned source 제거와 manual source checked 보존 semantics를
  유지한다. PostgreSQL revision conflict는 stale restore 없이 winner operation/replay를
  사용한다.
- frontend Seam: ShoppingListSheet의 receive form은 typed failure에서 기존 목록·재고
  보존 안내와 inline `다시 시도`를 표시하며, 같은 request fingerprint의 Idempotency-Key를
  재사용한다. workspace conflict는 최신 dashboard/list 확인으로 분리한다.
- 범위: local compatibility/normalized projection의 lot·list·operation ledger transaction이다.
  외부 Grocy call/compensation, managed failover/network partition, reverse-proxy response
  reset, backup/WAL/read-replica, 실제 device와 external provider delivery는 별도 운영
  acceptance다.
- 검증: receive API targeted **4 passed**, seam·final-flush rollback/retry·same-key
  concurrency regression, connected receive retry **1 passed**, API 전체 **476 passed**,
  connected 전체 **80 passed**, protected runtime **28**·Vite **757**, initial index
  **309.02 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**, service-worker **5**,
  workspace-sync **9**를 확인한다. Disposable PostgreSQL smoke는 Docker daemon
  unresponsive로 이번 revision에서 실행하지 않았다.

## ADR-106 — storage event persistence failure는 WorkspaceMutation restore 후 typed retry를 사용한다

- 상태: `accepted`
- 문제: storage event 정상 mutation은 이미 `WorkspaceMutation`을 사용하고 있었지만,
  `InventoryInvariantError`·not-found·일반 예외 처리에서 다시 직접 `flush()`했다. 이중
  flush는 이미 복원된 snapshot을 불필요하게 저장하려고 하며, persistence failure를 다시
  일으켜 원래의 422/404 또는 구조화된 retry error를 잃을 수 있었다.
- 결정: `create_storage_event()`의 예외는 `WorkspaceMutation`이 restore한 local snapshot을
  그대로 사용한다. validation/not-found는 기존 422/404로 반환하고, 일반 persistence
  failure는 `storage_event_persistence_unavailable` typed `503`으로 반환한다. 예외 처리부는
  직접 flush하지 않는다.
- frontend Adapter: storage move/open/consume/discard의 optimistic 상태는 실패 후 최신
  dashboard로 복원하고, sheet가 닫힌 상태의 global toast에 같은 Idempotency-Key를 재사용하는
  `다시 시도` action을 제공한다. move와 open이 연속된 경우 성공한 event는 replay되고 실패한
  다음 event만 다시 적용된다.
- 호환성: storage event idempotency replay/conflict, partial lot split, opened timestamp,
  Grocy outbox status와 기존 UI success semantics를 유지한다.
- 범위: local inventory/storage event projection과 frontend retry lifecycle이다. 여러 event를
  하나의 server batch로 묶는 별도 transaction, 외부 Grocy compensation, managed failover/
  network partition, response reset과 실제 device acceptance는 별도 운영 gate다.
- 검증: storage API targeted **8 passed**, 이중 flush 방지와 snapshot rollback/retry,
  connected typed retry **1 passed**, API 전체 **477 passed**, connected 전체 **81 passed**,
  protected runtime **28**·Vite **757**, initial index **309.43 kB**, fixture/mobile
  **35 passed + 2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인한다.

## ADR-107 — 함께 발생하는 move+open storage event는 sequence transaction으로 확정한다

- 상태: `accepted`
- 문제: 사용자가 상세 화면에서 보관 위치 변경과 최초 개봉을 한 번에 저장할 때 기존 프론트는
  두 개의 단일 storage-event 요청을 순차 전송했다. 앞 요청만 성공하고 뒤 요청이 실패하면
  한 번의 사용자 의도가 서버에 부분 상태로 남을 수 있었다. 단일 event의 Idempotency-Key와
  retry만으로는 이 경계를 표현할 수 없다.
- 결정: `POST /api/foods/{food_id}/storage-event-sequence`를 추가하고 sequence를 1~2개의
  local event로 제한한다. 요청은 `Idempotency-Key`를 필수로 하며 workspace/key/index 기반
  deterministic event ID와 앞 event의 `created_child_food_id` chain을 사용한다. 전체 event,
  inventory lot, priority와 Grocy outbox projection을 `WorkspaceMutation.run()` 안에서
  staging하고 `reprioritize(persist=False)` 이후 단일 outer flush로 확정한다.
- 실패/재시도: 전체 flush failure는 `storage_event_sequence_persistence_unavailable`
  typed `503`과 retry metadata를 반환하고 전체 snapshot을 복원한다. 전체 sequence가 이미
  존재하면 payload·target chain을 검증해 `X-Idempotency-Replayed: true`로 replay하고, 일부
  sequence·payload 충돌은 `409`로 차단한다. PostgreSQL revision conflict에서는 stale
  snapshot을 복원하지 않고 winner sequence를 재조회한다.
- frontend Adapter: 이동과 최초 개봉이 동시에 요청될 때만 sequence endpoint를 사용한다.
  단일 이동·개봉·소비·폐기 동작은 기존 endpoint를 유지한다. sequence persistence failure는
  동일 Idempotency-Key를 사용하는 global retry action으로 복구하고, 실패 전 optimistic
  상태는 dashboard read로 정렬한다.
- 범위: 최대 2개 local storage event와 compatibility/normalized local projection이다.
  외부 Grocy provider 호출·compensation, 복수 event batch, managed PostgreSQL failover/
  network partition, reverse-proxy response reset과 실제 device acceptance는 별도 gate다.
- 검증: sequence API targeted **3 passed**, connected sequence retry **1 passed**, API 전체
  **480 passed**, connected 전체 **82 passed**, protected runtime **28**·Vite **757**,
  initial index **309.99 kB**, AddFoodSheet **58.91 kB**, MealPlanSheet **36.91 kB**,
  AccountSheet **64.17 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**,
  service-worker **5**, workspace-sync **9**를 확인한다.

## ADR-108 — guest transfer의 ready 판정과 target copy는 동일한 cross-workspace lock에서 수행한다

- 상태: `accepted`
- 문제: guest-to-account transfer는 source·target lock을 사용하고 target flush 실패 시
  memory rollback을 수행했지만, 이전에는 `ready`/`conflict` 판정이 lock 밖에서 실행됐다.
  판정 직후 account workspace에 다른 write가 들어오면 guest snapshot이 그 기록을 덮을 수
  있었고, PostgreSQL revision conflict 뒤 target backup을 복원하면 다른 process의 winner를
  stale snapshot으로 되돌릴 위험도 있었다.
- 결정: transfer copy helper가 source와 target workspace ID 순서로 두 `_lock`을 잡은 뒤
  `ready` 상태·source counts·설정 변경 여부를 다시 계산한다. `ready`가 아니면 copy 없이
  `empty`·`already_transferred`·`conflict` 결과를 반환한다. `ready`일 때만 target backup을
  lock 안에서 만들고 모든 guest transfer field와 meal/notification preferences를 복사한
  뒤 target을 한 번 flush한다.
- 실패/재시도: 일반 persistence failure는 target memory를 backup으로 복원하고
  `guest_transfer_persistence_unavailable` typed `503`, `retryable: true`,
  `action: retry_later`를 반환한다. `ConcurrentWorkspaceWriteError`는 stale target
  restore 없이 전파해 전역 workspace conflict 응답을 사용한다. source guest workspace는
  성공·실패 어느 경우에도 삭제하지 않는다.
- 호환성: preview/import response shape, fingerprint 기반 `already_transferred`, 다른
  account 기록의 `409` 차단, guest source 변경 후 재요청 conflict, preference·ledger·audit
  field copy semantics는 유지한다. cross-workspace transfer는 단일 `WorkspaceMutation`으로
  합치지 않으며, 두 durable database의 distributed commit·backup/WAL·managed failover는
  별도 운영 gate다.
- 검증: guest transfer failure rollback/retry와 target race regression을 포함한 targeted
  **3 passed**, full API **482 passed, 8 warnings**, connected full E2E **83 passed**,
  frontend build protected runtime **28**·Vite **757 modules**에서 확인한다. AccountSheet의
  typed transfer error·conflict retry UI도 connected targeted **2 passed**로 확인한다.

## ADR-109 — receipt commit의 pending identity와 frontend retry를 분리해 보존한다

- 상태: `accepted`
- 문제: receipt commit은 finalization 전에 pending transaction을 저장하지만, 시작 pending
  flush 또는 finalization 실패 뒤 `needs_reconciliation` marker flush가 다시 실패하면
  구조화되지 않은 500이 발생할 수 있었다. 프론트도 commit 실패 후 같은 receipt payload와
  Idempotency-Key를 재사용하는 retry action이 없어 사용자가 안전하게 복구하기 어려웠다.
- 결정: 시작 pending flush 실패는 memory transaction을 제거하고
  `receipt_commit_persistence_unavailable` typed `503`으로 반환한다. finalization은 기존
  `WorkspaceMutation` rollback을 유지하며, marker flush 실패 시 이미 durable한 pending
  transaction을 memory에서 다시 `pending`으로 두고 `receipt_commit_reconciliation_unavailable`
  typed `503`으로 반환한다. `ConcurrentWorkspaceWriteError`는 stale restore 없이 전파한다.
- frontend Adapter: receipt 반영 시 commit key를 사용자 시도 단위로 한 번 생성하고,
  fresh draft payload·resolved draft ID·line overrides를 closure에 보존한다. network 또는
  retryable persistence failure는 sheet를 닫은 뒤 global `다시 시도`에서 같은 key와 payload를
  재사용하며, auth/duplicate/workspace conflict `409`에는 blind retry를 제공하지 않는다.
  fresh draft가 이미 생성된 뒤 commit이 실패해도 새 draft를 다시 만들지 않는다.
- 호환성: 기존 pending transaction reconciliation, same-key replay/conflict, receipt
  fingerprint, commit 전 StockLot 미생성, 외부 Grocy outbox status semantics는 유지한다.
  pending marker와 finalization은 서로 다른 local persistence phase이며, 외부 Grocy provider
  transaction·response reset·managed failover는 별도 운영 gate다.
- 검증: receipt commit targeted **12 passed**, full API **484 passed, 8 warnings**,
  connected commit retry **1 passed**, connected full E2E **83 passed**, fixture/mobile
  **35 passed + 2 skipped**, frontend build protected runtime **28**·Vite **757 modules**를
  확인한다.

## ADR-110 — 사용자 정의 보관 위치는 canonical storage class와 분리한다

- 상태: `accepted`
- 문제: 사용자는 `김치냉장고`·`냉동 서랍`처럼 실제 위치를 구분하고 싶지만, 위치 이름을
  새로운 안전 규칙이나 온도 측정값으로 취급하면 소비 우선순위와 날짜 assertion 계약이
  흔들린다. 기존 `ambient`·`refrigerated`·`frozen` 분류만으로는 입력·입고·이동 화면의
  실제 보관 장소를 다시 확인하기 어렵다.
- 결정: workspace-scoped `StorageLocation` record는 사용자 정의 `id`·`name`과 canonical
  `storage_type`을 함께 가지며, 기본 세 위치는 API가 항상 제공하는 immutable 값으로
  남긴다. `FoodResponse.storage_location_id`, storage event의 from/to location,
  receipt commit override, manual food request, shopping receive request에 선택적
  location ID를 전달하고, 서버는 location class와 request class가 다르면 거부한다.
  location 이름은 read model에서 참조해 표시하며 lot payload에 복제하지 않는다.
- frontend Adapter: AddFoodSheet의 영수증·라벨·직접 입력, ShoppingListSheet의 입고
  확인, FoodDetailSheet의 상태 변경이 같은 custom-picker contract를 사용한다. AccountSheet는
  workspace 위치 CRUD·중복/in-use 오류·persistence retry를 제공하며, 성공한 mutation은
  `dashboard`·`inventory-search`·`storage-locations` cross-tab invalidation을 발행한다.
  홈과 재고 목록은 위치 이름을 표시하고 `storage_location_id` bounded filter를 제공한다.
  storage-condition mismatch 알림과 planner의 조리 전 확인 문구도 custom location 이름을
  사용해 사용자가 실제 확인할 장소를 알 수 있게 한다. `storage_location_id`는 receipt/shopping retry fingerprint에도
  포함해 같은 위치를 선택한 재시도만 replay한다.
- 호환성: canonical storage class·date assertion·priority 계산은 변경하지 않는다.
  기존 위치가 없는 응답은 기존 세 분류 UI로 표시하고, 위치 이름 변경은 lot의 날짜·수량·
  보관 class를 수정하지 않는다. 이미 lot이 참조하는 custom location 삭제는
  `storage_location_in_use`로 차단한다. 실제 온도 센서, 외부 Grocy location mapping,
  managed PostgreSQL 운영과 외부 failover는 별도 acceptance다.
- 검증: API custom CRUD/assignment/reconstruction과 receipt commit override·shopping
  receive replay·custom location notification targeted **7 passed**, PostgreSQL contract **30 passed**, frontend
  connected custom location manager/manual/receipt/shopping/notification/detail/planner warning **7 passed**, fixture/mobile
  **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules**를 확인한다.

## ADR-111 — 사용자 정의 보관 위치는 이력 참조와 revision probe로 보호한다

- 상태: `accepted`
- 문제: 현재 lot가 다른 위치로 이동하거나 소비된 뒤에도 과거 storage event와 장보기 입고
  operation은 사용자 정의 위치 ID를 참조한다. 현재 식품만 검사하고 위치를 삭제하면
  append-only 기록에는 ID만 남아 사용자가 보관 이동의 실제 장소를 다시 확인할 수 없다.
  또한 다른 기기에서 위치 이름을 바꾸거나 삭제해도 열린 AccountSheet가 오래된 목록을
  계속 보여줄 수 있다.
- 결정: 위치 삭제는 현재 `FoodResponse` 참조뿐 아니라 storage event의
  `from_storage_location_id`·`to_storage_location_id`, durable shopping receive operation의
  `storage_location_id`도 검사한다. 하나라도 참조하면 `storage_location_in_use` `409`로
  중단하고 이름 변경은 허용해 이력의 의미를 보존한다. canonical storage class·날짜
  assertion·priority는 그대로 둔다.
- frontend Adapter: `FoodHistory`는 event의 location ID를 현재 workspace
  `StorageLocation` read model로 이름 해석해 이동 기록을 표시한다. AccountSheet는
  payload 없는 `/api/storage-locations/revision`을 초기 목록의 기준 revision으로
  기억하고, tab 복귀와 30초 주기의 bounded probe에서 revision이 바뀐 경우 편집·삭제
  확인 상태를 닫은 뒤 최신 목록을 다시 읽는다. probe 실패는 사용 가능한 기존 목록을
  지우지 않으며, mutation 중에는 probe가 편집 상태를 덮지 않는다.
- 저장소 호환성: in-memory는 process-local revision marker를 사용하고, SQLite는
  `workspace_metadata`의 revision을 durable하게 저장·재구성한다. PostgreSQL은 기존
  workspace revision과 response header를 재사용한다. conflict 응답이 가진 최신 revision
  header는 middleware가 오래된 process-local 값으로 덮어쓰지 않는다.
- 검증 경계: API 전체 **492 passed, 8 warnings**, custom storage/history connected
  **8 passed**를 포함한 connected 전체 **88 passed**, fixture/mobile **35 passed + 2 skipped**,
  workspace-sync **9**, Sites **4**, service-worker **5**, protected runtime **28**,
  Vite **757 modules** build를 확인한다. Docker daemon 장애로 운영 PostgreSQL live
  readback은 이번 변경에서 실행하지 않았고, 실제 multi-device race·background tab
  scheduling·VoiceOver/TalkBack은 별도 acceptance다.

## ADR-112 — CI는 앱 계약 lane과 custom storage live gate를 명시적으로 실행한다

- 상태: `accepted`
- 문제: web workflow는 fixture/mobile runtime과 Sites packaging을 실행하지만,
  `WorkspaceSyncCoordinator`와 service-worker contract test를 별도 release step으로
  고정하지 않았다. 또한 `postgres-live` smoke는 custom location create/assignment와
  backup/restore를 확인하면서도 revision-only probe와 historical delete guard를 실제
  normalized API 경계에서 확인하지 않았다.
- 결정: web job은 build·fixture/mobile 뒤에 `npm run test:workspace-sync`와
  `npm run test:service-worker`를 항상 실행한다. `postgres-live`는 custom location을
  만든 뒤 `/api/storage-locations/revision`이 증가하는지 확인하고, 해당 lot를 다른
  canonical class로 이동해 history reference를 만든 뒤 location DELETE가
  `409 storage_location_in_use`로 보호되는지 readback한다.
- 경계: workflow contract와 local mirror는 step 존재·명령·문구를 검증하지만 실제
  GitHub Actions 성공, managed PostgreSQL multi-process ordering, Docker/Grocy 운영,
  release artifact promotion은 별도 gate다.

## ADR-113 — release provenance는 secret-free manifest artifact로 남긴다

- 상태: `accepted`
- 문제: 현재 build·test evidence는 여러 문서와 CI step에 나뉘어 있어 source revision,
  dependency lock, migration baseline, compiled Sites output이 같은 release attempt에
  속하는지 한 파일로 확인하기 어렵다. raw token·workspace data를 artifact에 넣으면
  provenance를 만들기 위해 privacy 경계를 훼손할 위험도 있다.
- 결정: `apps/web/scripts/create-release-manifest.mjs`가 현재 git head/branch/dirty
  상태, Node/deployment mode, `package-lock.json`·`uv.lock`·runtime lock·migration
  SHA-256, 존재하는 compiled Sites artifact의 size/hash를
  `rescue-meal-release-manifest-v1` JSON으로 기록한다. manifest에는 access token,
  provider key, password, OCR source bytes, workspace data를 절대 포함하지 않는다.
- CI 연결: web job은 manifest contract test를 실행한 뒤 production build 산출물과
  함께 `--require-artifacts` manifest를 `/tmp`에 만들어 누락된 compiled output을
  fail-closed로 차단하고 `actions/upload-artifact@v4`로 보존한다. local
  mirror test는 git metadata가 없는 checkout에서도 구조를 검증하고, 실제 CI에서는
  `GITHUB_SHA`·`GITHUB_REF_NAME`을 fallback으로 사용한다.
- 검증 경계: manifest 생성·secret omission·input hash·migration baseline·artifact
  hash와 CI YAML contract는 local에서 검증하지만, 실제 GitHub Actions artifact retention,
  signed provenance, release promotion과 external deployment identity는 별도 acceptance다.

## ADR-114 — 열린 planner는 cross-device 변경을 감지하되 local 선택을 자동으로 덮지 않는다

- 상태: `accepted`
- 문제: `MealPlanSheet`는 같은 workspace의 다른 탭 invalidation과 workspace switch
  stale guard를 사용하지만, 다른 기기에서 식단을 저장하거나 재고를 변경한 경우에는
  열린 화면의 recipe preview·서빙 수·lot 사용량이 오래된 상태로 남을 수 있다. 이때
  자동으로 최신 응답을 교체하면 사용자가 조정한 사용량이나 아직 저장하지 않은 메뉴가
  사라질 수 있다.
- 결정: payload-free `GET /api/meal-plans/revision`으로 workspace revision만 확인한다.
  planner open 상태에서 tab 복귀와 30초 주기로 probe하며, revision 변경 시 현재 plan,
  alternative, multi-day preview, consumption draft를 유지한 채
  `다른 기기에서 식단이나 재고가 변경됐어요` alert와 `최신 식단 확인` action을 보여준다.
  사용자가 action을 눌렀을 때만 preview/latest/preferences를 다시 읽고 최신 plan을
  materialize한다.
- 자체 mutation: planner가 성공시킨 meal preference·single/multi-day save·complete와
  shopping mutation은 response의 workspace revision을 baseline으로 기억해 자신의
  변경을 remote conflict로 오인하지 않는다. read-only preview/history/alternatives는
  mutation broadcast를 만들지 않는다.
- 호환성·경계: canonical recipe/lot/date safety contract와 기존 same-tab invalidation은
  유지한다. probe 실패·hidden tab·진행 중인 mutation은 화면을 바꾸지 않는다. 실제
  multi-device visibility scheduling, server push ordering, managed failover와 external
  provider transaction은 별도 acceptance다.
- 검증: API 전체 **493 passed**(8 warnings), connected 전체 **89 passed**, 신규
  cross-device planner scenario, fixture planner **1 passed**, build protected runtime
  **28**·Vite **757 modules**를 확인한다.

## ADR-115 — 열린 알림 센터는 cross-device 변경을 자동 반영하되 읽음 mutation을 보호한다

- 상태: `accepted`
- 문제: 알림 본문은 현재 재고와 설정에서 매번 재생성되므로 같은 workspace의 다른 기기에서
  읽음 상태나 재고가 바뀌어도 열린 알림 센터가 오래된 목록을 계속 보여줄 수 있다. 반대로
  읽음·전체 읽음 요청 중에 background refresh가 실행되면 아직 반영되지 않은 사용자 작업을
  오래된 GET 응답이 덮을 수 있다.
- 결정: payload-free `GET /api/notifications/revision`을 추가하고, 알림 목록 read가
  성공할 때 revision endpoint를 함께 읽어 baseline을 기억한다. 알림 센터가 열린 동안 tab
  복귀와 30초 주기의 bounded probe로 revision을 확인하며, 값이 증가하면 목록을 자동으로
  다시 읽고 `다른 기기에서 알림 상태가 바뀌어 최신 목록을 불러왔어요.` 안내를 표시한다.
  알림 본문·`notification_id`·`read_at`의 기존 파생/영속성 계약은 변경하지 않는다.
- mutation 보호: 읽음 또는 전체 읽음 request가 진행 중이면 probe와 목록 state 교체를
  보류한다. 진행 중에 도착한 refresh 요청은 queued marker로 남기고, mutation이 끝난 뒤
  현재 화면이 알림 센터인 경우에만 최신 목록을 다시 읽는다. 성공한 자체 읽음 response의
  workspace revision은 baseline에 반영해 자신의 변경을 원격 변경으로 오인하지 않는다.
- 실패/호환성: revision probe 실패·hidden tab·workspace 전환은 현재 목록을 지우지 않고
  다음 probe 또는 명시적 refresh에 맡긴다. 오래된 서버가 revision endpoint를 제공하지
  않거나 proxy가 payload를 읽지 못해도 목록 read 자체는 성공할 수 있도록 revision read는
  보조 경로로 처리한다. 이 marker는 Web Push delivery ordering, multi-device scheduling,
  managed PostgreSQL failover, background tab/device accessibility를 보장하지 않는다.
- 검증: API 전체 **494 passed, 8 warnings**, notification revision/read recovery targeted
  회귀, connected 전체 **91 passed**(cross-device 자동 갱신·전체 읽음 pending guard 포함),
  fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**,
  service-worker **5**, protected runtime **28**, Vite **757 modules** build를 disposable
  local mirror에서 확인한다.

## ADR-116 — 홈 dashboard는 sheet가 닫힌 동안에만 cross-device 변경을 자동 반영한다

- 상태: `accepted`
- 문제: dashboard는 inventory와 Rescue Queue를 포함하는 현재 read model이지만, 같은
  browser의 mutation broadcast가 닿지 않는 다른 기기에서 재고·보관·장보기·식단이 바뀌면
  홈 화면이 오래된 내용을 계속 보여줄 수 있다. 반대로 sheet가 열려 있거나 일반 mutation
  직후에 dashboard를 자동 교체하면 사용자가 보고 있던 입력·조리 완료·계정 전환 결과를
  background read가 덮을 수 있다.
- 결정: payload-free `GET /api/dashboard/revision`을 추가하고, 초기 dashboard read와
  함께 revision baseline을 기억한다. `sheet === null`인 홈 화면에서만 tab 복귀·30초
  bounded probe를 수행하며 revision이 증가하면 inventory와 Rescue Queue를 다시 읽는다.
  revision marker는 dashboard payload나 안전 판정의 version이 아니라 workspace 변경
  감지용 read marker로만 사용한다.
- 경합 보호: 일반 `syncDashboard()`와 revision probe는 동시에 실행하지 않는다. probe가
  시작된 뒤 sheet가 열리면 응답 적용 직전에 다시 중단하며, background refresh 성공 notice는
  현재 user-facing toast가 없을 때만 표시한다. 이로써 조리 완료·계정 삭제·guest transfer
  같은 mutation의 최종 안내를 보존한다. sheet가 닫힌 뒤 effect가 재설치되면 최신 revision을
  다시 확인한다.
- 실패/호환성: revision endpoint가 없거나 probe가 실패해도 기존 dashboard/cache는 지우지
  않고 다음 probe·수동 reconnect에 맡긴다. 기존 same-tab invalidation, offline cache,
  workspace revision precondition과 API payload는 변경하지 않는다. 실제 device background
  scheduling·server push ordering·managed PostgreSQL failover는 별도 acceptance다.
- 검증: API 전체 **495 passed, 8 warnings**, PostgreSQL contract **30 passed**, connected
  전체 **92 passed**(홈 cross-device refresh와 background toast 경합 회귀 포함),
  fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules**
  build를 disposable local mirror에서 확인한다.

## ADR-117 — 열린 장보기 목록은 cross-device 변경을 자동 반영하되 item mutation을 보호한다

- 상태: `accepted`
- 문제: ShoppingListSheet는 현재 재고와 식단에서 파생된 장보기 항목을 보여주지만, 다른
  기기에서 항목을 추가·체크·삭제하거나 입고하면 열린 목록이 stale 상태로 남을 수 있다.
  동시에 체크·삭제·입고·직접 추가 요청 중에 background read가 실행되면 사용자의 현재
  mutation 결과를 오래된 목록이 덮을 수 있다.
- 결정: payload-free `GET /api/shopping-list/revision`을 추가하고, 장보기 목록 read가
  성공할 때 revision endpoint를 함께 읽어 baseline을 기억한다. 열린 ShoppingListSheet에서
  tab 복귀와 30초 bounded probe를 수행하며 revision이 증가하면 최신 목록을 자동으로
  다시 읽고 `다른 기기에서 장보기 목록이 바뀌어 최신 목록을 불러왔어요.` 안내를 표시한다.
  `ShoppingListItem`의 source·checked·quantity semantics와 inventory receive contract는
  변경하지 않는다.
- mutation 보호: item check/delete/receive/manual-add가 진행 중이면 probe와 목록 state
  교체를 보류한다. 같은 workspace의 cross-tab invalidation으로 refresh가 요청되면 queued
  marker로 남기고 mutation 완료 뒤 현재 sheet가 열려 있을 때만 최신 목록을 읽는다. 성공한
  자체 mutation response의 workspace revision은 baseline에 반영해 자기 변경을 remote 변경으로
  오인하지 않는다.
- 실패/호환성: revision probe 실패·hidden tab·workspace 전환은 기존 목록을 지우지 않으며,
  오래된 서버가 revision endpoint를 제공하지 않아도 목록 read는 보조 marker 없이 계속
  동작한다. 이 marker는 구매 주문·결제 상태·Web Push ordering·multi-device scheduling·
  managed PostgreSQL failover를 보장하지 않는다.
- 검증: API 전체 **496 passed, 8 warnings**, PostgreSQL contract **30 passed**, connected
  전체 **94 passed**(cross-device 자동 갱신·item mutation pending guard 포함),
  fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules**
  build를 disposable local mirror에서 확인한다.

## ADR-118 — dashboard cross-device refresh는 활성 inventory search도 다시 실행한다

- 상태: `accepted`
- 문제: W9.78의 dashboard revision refresh가 `foods`와 Rescue Queue를 최신화해도 홈에서
  검색 중인 경우 `inventorySearchResults`가 이전 query/filter 결과로 남을 수 있다. 그러면
  같은 화면 안에서 기본 inventory와 검색 결과가 서로 다른 workspace revision을 가리킨다.
- 결정: home-only dashboard revision refresh가 성공하고 현재 inventory search가 활성화되어
  있으면 `inventory-search` retry channel을 한 번 증가시켜 기존 query/filter의 bounded search
  request를 다시 실행한다. 검색 자체의 `storage_type`·`storage_location_id` 분리, offset/page
  contract, `WorkspaceSyncCoordinator` stale response guard는 그대로 유지한다.
- 경합/호환성: dashboard sheet가 열려 있거나 일반 dashboard sync와 경쟁할 때는 기존 W9.78
  guard가 응답 교체를 막는다. 새 revision endpoint나 검색 payload field는 추가하지 않고,
  demo/offline local filter와 server search의 기존 경계를 유지한다. 이 보완은 실제
  multi-device scheduling·server push ordering·managed PostgreSQL failover를 보장하지 않는다.
- 검증: API 전체 **496 passed, 8 warnings**, connected 전체 **95 passed**(dashboard refresh 후
  active inventory search 재실행 포함), fixture/mobile **35 passed + 2 skipped**, workspace-sync
  **9**, Sites **4**, service-worker **5**, protected runtime **28**, Vite **757 modules**
  build를 disposable local mirror에서 확인한다.

## ADR-119 — 영수증 검수 대기열은 summary만 cross-device 자동 갱신한다

- 상태: `accepted`
- 문제: 홈 dashboard의 receipt summary는 이미 다시 읽지만, 여러 pending draft를 고르는
  `receipt-queue` sheet를 열어 둔 채 다른 기기에서 draft를 commit·삭제하면 queue가 stale
  상태로 남을 수 있다. 반대로 실제 `AddFoodSheet` 검수 화면까지 자동 refresh하면 사용자가
  수정 중인 OCR line과 draft를 덮을 위험이 있다.
- 결정: payload-free `GET /api/receipts/revision`을 추가하고 receipt summary read와 함께
  baseline을 기억한다. `sheet === "receipt-queue"`인 동안 tab 복귀와 30초 bounded probe를
  수행하며 revision이 증가하면 summary queue만 자동 재조회하고
  `다른 기기에서 검수 대기 영수증이 바뀌어 최신 목록을 불러왔어요.` 안내를 표시한다.
  실제 AddFoodSheet가 열리면 probe를 중단한다.
- 경계/호환성: receipt draft payload·원본 bytes·OCR observation·commit idempotency와
  workspace revision precondition은 변경하지 않는다. probe 실패·hidden tab·workspace
  전환에서는 기존 queue를 지우지 않으며, 오래된 서버가 revision endpoint를 제공하지
  않아도 summary list read는 보조 marker 없이 동작한다. 실제 multi-device scheduling,
  server push ordering, managed PostgreSQL failover와 device accessibility는 별도 acceptance다.
- 검증: API 전체 **497 passed, 8 warnings**, PostgreSQL contract **30 passed**, connected
  전체 **96 passed**(queue cross-device refresh 포함), fixture/mobile **35 passed + 2 skipped**,
  protected runtime **28**, Vite **757 modules** build를 disposable local mirror에서 확인한다.

## ADR-120 — 식품 상세는 cross-device 변경을 stale alert로만 알리고 자동 교체하지 않는다

- 상태: `accepted`
- 문제: `FoodDetailSheet`는 상품명·브랜드·분류·보관 위치·개봉 상태·날짜 확인·부분 수량을
  local draft로 편집한다. 다른 기기에서 같은 workspace의 inventory가 바뀌었다고 dashboard
  payload를 자동 교체하면 사용자가 입력 중인 상세 draft가 사라질 수 있다.
- 결정: 열린 detail sheet는 기존 dashboard revision marker를 visible-tab 복귀·30초 bounded
  probe로 확인한다. revision이 증가하면 food payload를 자동 적용하지 않고
  `다른 기기에서 이 식품이나 재고가 변경됐어요` stale alert만 표시한다. 사용자가
  `최신 상태 확인`을 선택한 경우에만 `syncDashboard()`로 최신 food를 적용하며, 그 시점에
  local detail draft가 최신 server state로 명시적으로 교체될 수 있음을 안내한다.
- 호환성/경계: storage event·date assertion·product info mutation의 기존 conflict/retry와
  dashboard revision precondition은 유지한다. sheet가 닫히면 detail probe를 정리하며, 일반
  dashboard sync가 진행 중인 동안에는 probe를 실행하지 않는다. probe 실패·hidden tab·
  workspace 전환은 현재 detail draft를 지우지 않는다. 실제 multi-device scheduling·server
  push ordering·managed PostgreSQL failover·device accessibility는 별도 acceptance다.
- 검증: API 전체 **497 passed, 8 warnings**, connected 전체 **97 passed**(local detail edit
  유지와 명시적 최신 확인 포함), fixture/mobile **35 passed + 2 skipped**, protected runtime
  **28**, Vite **757 modules** build를 disposable local mirror에서 확인한다.

## ADR-121 — 계정 설정은 cross-device 변경을 draft 보존 alert로 알리고 명시적으로 갱신한다

- 상태: `accepted`
- 문제: `AccountSheet`에는 알림 설정·사용자 정의 보관 위치·영수증 개인정보·Grocy mapping과
  같은 하위 panel의 local draft가 있다. 다른 기기에서 같은 workspace의 설정이나 재고가
  바뀌었다고 panel을 즉시 다시 읽으면 사용자가 작성 중인 값이나 삭제 확인 상태를 오래된
  응답이 덮을 수 있다. 반대로 아무 표시도 하지 않으면 사용자는 자신이 저장하려는 값이
  현재 workspace와 다른지 알 수 없다.
- 결정: account sheet가 열린 동안에만 기존 payload-free `GET /api/dashboard/revision`을
  tab 복귀·30초 bounded probe로 확인한다. 더 높은 revision을 읽으면 인증 account와
  guest account 화면 모두에 `다른 기기에서 계정 설정이 변경됐어요` alert를 표시하고,
  현재 입력 중인 draft를 유지한다. revision-only read는 child panel을 자동 refresh하지
  않는다.
- 명시적 갱신: 사용자가 `최신 계정 설정 확인`을 선택하면 기존 `syncDashboard()`를 먼저
  실행한다. 성공한 경우에만 parent-owned account refresh nonce를 증가시켜 notification
  preferences·storage locations·receipt privacy·Grocy panel이 최신 workspace 값을 다시
  읽게 한다. 실패하면 alert와 현재 draft를 유지하고 재시도를 허용한다. dashboard sync가
  관찰한 revision은 account baseline에 반영해 자체 요청을 remote change로 오인하지 않는다.
- 호환성/경계: 기존 same-tab `WorkspaceSyncTransport`의 `externalRefreshNonce`와
  workspace/channel `AbortSignal` lifecycle은 유지하며 parent nonce와 합산한다. 이 결정은
  account panel read를 최신화하는 UI 경계이지, multi-device scheduler·server push·실제
  OS background visibility·managed PostgreSQL failover를 보장하지 않는다.
- 검증: deterministic browser fixture의 authenticated account stale scenario **1 passed**,
  canonical target의 guest-branch connected scenario **1 passed**(dedicated API/web
  ports `8042/4442`), mirror TypeScript **passed**, protected runtime **28**, Vite **757
  modules** build를 확인했다. 실제 multi-device scheduling·server push·OS background
  visibility·managed PostgreSQL failover는 별도 acceptance다 ([guest account settings
  readback](../evidence/account-settings-guest-cross-device-readback-2026-09-10.md)).

## ADR-122 — derived shopping-list read는 concurrent reconciliation conflict를 한 번 복구한다

- 상태: `accepted`
- 문제: `GET /api/shopping-list`는 meal-plan source와 현재 inventory를 reconciliation하기
  때문에 읽기처럼 보여도 `WorkspaceMutation` outer flush를 수행한다. 두 API process가
  같은 workspace를 동시에 warm하면 한 process가 winner snapshot을 저장하고 다른 process가
  stale snapshot conflict `409`를 반환할 수 있어, 단순 화면 진입이 사용자의 재시도 상태로
  변한다.
- 결정: route는 첫 `ConcurrentWorkspaceWriteError`에서 현재 workspace durable snapshot을
  다시 읽고 reconciliation/read를 한 번 재실행한다. 두 번째 conflict는 그대로 typed
  workspace conflict로 반환한다. stale 객체를 merge하거나 무한 retry하지 않으며, derived
  source 변경의 원자성·기존 `shopping_list_persistence_unavailable` recovery semantics는
  유지한다.
- 검증: API regression `test_shopping_list_read_reconciliation_retries_after_concurrent_workspace_conflict`,
  API 전체 **498 passed / 8 warnings**, 실제 PostgreSQL 두 process receive smoke **4 rounds
  passed**를 확인했다. managed failover·read replica·reverse proxy reset·provider
  transaction은 별도 acceptance다.

## ADR-123 — PostgreSQL backup/restore는 host client와 Docker client를 같은 계약으로 감싼다

- 상태: `accepted`
- 문제: backup/restore 스크립트가 host `pg_dump`·`pg_restore`·`psql` 바이너리를 직접
  요구하면 macOS 개발 환경처럼 PostgreSQL server는 Docker에 있고 host client가 없는
  환경에서 이미 검증한 archive/restore 경로를 재현할 수 없다. 반대로 도구 하나만
  설치된 상태에서 host와 container client를 섞으면 client/server major guard의 전제가
  불분명해진다.
- 결정: `infra/postgres/postgres-client.sh`를 단일 client boundary로 두고, `auto`에서는
  필요한 전체 toolchain이 host에 있을 때만 host를 선택하며 그렇지 않으면 Docker
  `postgres:16-alpine` 또는 명시된 approved image를 선택한다. `host`와 `docker`를
  운영자가 명시할 수도 있으며, 둘 다 준비되지 않으면 archive mutation 전에 fail-closed로
  종료한다. `backup.sh`와 `restore.sh`는 이 wrapper를 통해 version query, server query,
  archive read/write, schema readback을 모두 실행한다.
- 보안·경로: Docker mode는 archive parent directory만 absolute path로 bind mount하고,
  DSN은 container environment로 전달해 Docker command argument에 넣지 않는다.
  Docker Desktop host-loopback DSN만 `host.docker.internal`로 변환하며 Compose service
  name은 보존한다. 빈 DB restore, no-overwrite, mode `600`, production confirmation,
  client/server major equality guard는 변경하지 않는다.
- 검증: shell/argument contract, Docker 미준비 fail-closed, disposable PostgreSQL 16
  migration `001→025`, Docker-backed custom archive mode `600`, 빈 DB restore,
  normalized lot 1건과 `storage_condition_text` readback을 통과했다. image digest
  approval, object-storage encryption/retention/scheduler, managed failover와 production
  cutover은 별도 acceptance다 ([portable client wrapper readback](../evidence/postgres-client-wrapper-readback-2026-09-10.md)).

## ADR-124 — 성공한 product-info mutation은 후속 dashboard read 실패로 되돌리지 않는다

- 상태: `accepted`
- 문제: 상품 프로필 PATCH가 서버에서 성공한 뒤 dashboard read가 일시적으로 실패하면,
  frontend가 PATCH response를 버리고 read failure를 전체 mutation failure처럼 처리할 수
  있었다. 이 경우 실제 서버 값은 사용자 확인 상품명으로 바뀌었지만 detail sheet는 이전
  이름으로 복원되어, 재시도 여부와 durable state가 불일치했다.
- 결정: `PATCH /api/foods/{food_id}/product-info`의 성공 `ApiFood` response를 먼저
  `mapApiFood`로 현재 local read model에 반영한다. 이후 `syncDashboard()`는 최신 목록을
  보강하는 bounded read로 실행하며, 그 read만 실패하면 `syncDashboard()`가 stale
  last-successful cache를 적용하더라도 성공한 profile을 다시 local model에 보존하고
  `최신 목록은 아직 다시 읽지 못했어요` 안내를 표시한다. PATCH 자체의 typed persistence
  failure·workspace conflict·auth failure는 기존 rollback/retry/conflict 경계를 유지한다.
- 이유: 이미 확정된 server mutation을 stale read 결과로 숨기지 않아야 하며, UI가
  “저장 실패”와 “저장은 됐지만 최신 read 실패”를 구분해야 사용자가 같은 payload를
  불필요하게 중복 전송하지 않는다. quantity/unit/purchase/opened provenance와
  DateAssertion은 계속 보존한다.
- 검증: 첫 `product_info_persistence_unavailable` response, inline retry, 두 번째 PATCH
  success, 최신 상품명 표시를 connected dedicated lane에서 **1 passed**로 확인했다
  ([product-info write/read recovery readback](../evidence/product-info-write-read-recovery-readback-2026-09-10.md)).

## ADR-125 — 성공한 date assertion mutation은 stale dashboard read로 되돌리지 않는다

- 상태: `accepted`
- 문제: 사용자가 포장지의 날짜 의미를 확인한 뒤 `PATCH /api/foods/{food_id}/date-assertion`
  이 성공해도, 이어지는 dashboard read가 실패하면 frontend가 성공 응답을 버리고 stale
  cache 또는 이전 read model을 표시할 수 있었다. 그러면 서버의 사용자 확인 날짜와 화면의
  날짜가 달라져 사용자가 같은 날짜를 다시 입력하게 된다.
- 결정: date PATCH가 반환한 non-null `ApiFood`를 `mapApiFood`로 즉시 local read model에
  반영한다. 이후 dashboard read는 최신 목록을 보강하는 bounded read로만 취급하고, read가
  실패해 stale cache를 적용하더라도 성공한 date response를 다시 보존한다. PATCH 자체의
  typed persistence failure·workspace conflict·auth failure는 기존 rollback/retry/conflict
  semantics를 유지한다.
- 이유: 사용자 확인 날짜는 safety decision이 아니라 provenance가 있는 명시적 관찰값이다.
  이미 저장된 관찰을 후속 read 장애 때문에 숨기면 데이터 신뢰와 재시도 semantics가 동시에
  깨진다. 날짜 종류·보관조건·수량·구매/개봉 provenance는 기존 계약대로 분리한다.
- 검증: typed failure→retry와 성공 PATCH 이후 의도적 dashboard read failure·stale cache
  보존을 connected dedicated lane에서 **2 passed**, 최종 full connected suite에서 **100
  passed**, TypeScript/runtime/build 회귀를 확인했다 ([date write/read recovery readback](../evidence/date-write-read-recovery-readback-2026-09-11.md)).

## ADR-126 — 초기 dashboard response의 revision을 polling baseline으로 seed한다

- 상태: `accepted`
- 문제: 초기 `GET /api/dashboard`는 `X-Rescue-Meal-Workspace-Revision`을
  `mealApi.workspaceRevision`에 저장하지만, 초기 연결 effect가 이를
  `dashboardRevisionRef`에 기록하지 않았다. 사용자가 연결 직후 탭으로 복귀하면 첫
  dashboard revision probe가 `previousRevision === null` 경로로 들어가 현재 remote revision을
  baseline으로만 저장하고, 실제 remote 변경에 대한 dashboard 재조회가 생략될 수 있었다.
- 결정: 초기 dashboard payload를 성공적으로 local read model에 적용하는 시점에
  `rememberDashboardRevision(mealApi.workspaceRevision)`을 호출한다. revision은 기존처럼
  monotonic max semantics를 유지하고, probe interval·sheet guard·`syncDashboard(true)`의
  home-only 경계는 변경하지 않는다. 테스트 timeout을 늘리거나 remote 변경을 무시하는
  우회는 하지 않는다.
- 이유: 이미 성공한 dashboard read가 제공한 workspace revision은 polling lifecycle의
  authoritative baseline이므로, 첫 visibility event도 정상적인 remote-change 관찰로
  평가되어야 한다. 이를 통해 화면 연결 시점과 첫 probe 완료 시점의 경합을 제거하면서
  다른 sheet의 draft 보호·workspace sync contract는 그대로 보존한다.
- 검증: 수정 전 동일 source에서 revision probe는 증가했지만 dashboard call이 증가하지 않는
  connected failure를 재현했다. 수정 후 dashboard cross-device focused test는 전용
  `8074/4474`에서 **1 passed**, full connected suite는 `8075/4475`에서 **101 passed**,
  fixture/mobile은 **35 passed + 3 skipped**, production fail-closed는 **1 passed**,
  API 전체는 **499 passed / 8 warnings**, TypeScript/Vite는 **757 modules**로 확인했다.
- 경계: 이 결정은 browser lifecycle과 local revision baseline을 보장한다. 실제 OS background
  scheduling·server push ordering·managed PostgreSQL failover·real-device screen-reader는
  별도 acceptance다.

## ADR-127 — preview fixture와 native narrow-viewport Playwright lane을 분리한다

- 상태: `accepted`
- 문제: `apps/web/tests/**/*.spec.ts`를 수집하는 기존 fixture config에 native shell의
  320px 회귀 spec을 그대로 두면, `npm run test:runtime`이 desktop preview phone-frame
  viewport에서 native 전용 bounds assertion을 실행하게 된다. 반대로 native 회귀를 fixture
  결과에 섞으면 viewport contract가 무엇을 실제로 증명하는지 불분명해진다.
- 결정: default `playwright.config.ts`는 `native-viewport.spec.ts`를 명시적으로 제외하고,
  `playwright.native.config.ts`는 `VITE_APP_SHELL=native`, `320×740`, 별도 port와 exact
  `testMatch`를 소유한다. CI web job은 fixture/mobile lane과 native lane을 순서대로 실행한다.
  두 lane 모두 `--strictPort`와 non-reuse server 경계를 유지한다.
- 이유: preview frame scaling과 실제 native CSS viewport는 서로 다른 증거다. 각각의
  environment를 명시적으로 고정하면 잘못된 viewport에서 통과하는 false positive를 막고,
  narrow-width failure가 일반 fixture 결과에 섞이는 것을 방지한다.
- 검증: default fixture lane은 전용 `4482`에서 **35 passed + 3 skipped**, native lane은
  전용 `4487`에서 **4 passed**로 통과했다. build는 TypeScript와 Vite **757 modules**, CI
  workflow YAML parse와 `git diff --check`도 통과했다.
- 경계: browser viewport와 CSS bounds만 보장한다. OS font-scale semantics, physical-device
  rendering, camera, VoiceOver/TalkBack과 managed production은 별도 acceptance다.

## ADR-128 — Playwright webServer는 직접 실행 process를 소유하고 종료한다

- 상태: `accepted`
- 문제: `playwright.config.ts`와 native config가 `npm run dev`를 webServer command로 사용하면
  test runner 종료 뒤 npm wrapper와 child Vite가 분리되어 전용 port를 계속 점유하는 경우가
  있었다. 테스트 결과는 통과해도 다음 lane 또는 개발 서버가 stale process와 충돌하고, 종료된
  test가 외부 상태를 남긴다.
- 결정: 두 Playwright config의 webServer command를
  `npm run check:runtime && exec ./node_modules/.bin/vite ... --strictPort`로 고정한다.
  protected runtime integrity check는 유지하고, `exec`로 Vite가 command process를 직접
  대체하게 해 Playwright의 process-group 종료 대상에 포함한다. 기존 port isolation,
  `reuseExistingServer=false`, native exact test match는 유지한다.
- 이유: 서버 lifecycle은 테스트 assertion이 아니라 실행 경계의 책임이다. 전용 port를
  점유한 stale process를 남기지 않아 반복 가능한 local/CI lane과 개발 환경을 보장한다.
- 검증: fixture focused test는 `4488`에서 **1 passed**, native focused test는 `4489`에서
  **1 passed**였고 각 종료 후 `lsof`로 해당 port가 free임을 확인했다. full fixture/native
  lane·build·workflow YAML은 같은 source에서 별도 readback한다.
- 경계: local Playwright webServer cleanup을 보장할 뿐, production supervisor·container
  orchestration·managed hosting lifecycle은 별도 운영 acceptance다.

## ADR-129 — authoritative mutation response/read ordering은 공통 Module로 소유한다

- 상태: `accepted`
- 문제: product-info, date assertion, product provenance mutation이 각각 성공 response를
  local read model에 적용하고 dashboard를 다시 읽는 순서를 직접 구현하면서, 후속 stale cache가
  이미 성공한 write를 숨기지 않도록 하는 invariant가 여러 caller에 반복됐다. 한 caller가 이
  순서를 빠뜨리면 durable server state와 화면 state가 다시 갈라질 수 있다.
- 결정: `apps/web/src/mutationReadback.ts`의 Module이 `mutate → apply authoritative response
  → best-effort sync → failed sync 시 response 재적용` 순서를 소유한다. empty response는
  mutation failure로 처리하고, readback failure는 `{ value, synced: false }` 결과로 분리한다.
  caller는 domain-specific rollback, workspace conflict, typed persistence error와 modal-local
  retry/status UI를 계속 소유한다.
- 이유: 세 caller가 실제로 같은 invariant를 공유하므로 hypothetical seam이 아니라 real seam이다.
  작은 Interface 뒤에 response/read ordering을 숨기면 변경의 Locality와 test Leverage가 높아지고,
  product-info/date/provenance가 서로 다른 구현으로 drift하는 것을 막는다.
- 검증: Module contract **3 passed**, connected targeted product-info/date/provenance/manual-food/
  receipt **11 passed**, full connected **101 passed**, frontend build TypeScript와 Vite **758 modules**를
  확인했다.
- 경계: 이 Module은 local mutation/read ordering만 보장하며, 외부 provider transaction·managed
  PostgreSQL failover·production network response reset은 별도 acceptance다.

## ADR-130 — storage event optimistic lifecycle은 authoritative response와 별도 Module로 둔다

- 상태: `accepted`
- 문제: storage move/open sequence·consume·discard는 event metadata 중심으로 설계되어
  dashboard read failure 시 optimistic state를 어떻게 보존할지 frontend caller마다 직접
  구현하고 있었다. stale cache가 성공한 event를 숨기거나 rollback ordering이 서로 달라질
  수 있고, partial move/open은 server가 만든 child lot identity를 local에서 추측할 수 없다.
- 결정: `StorageEventResponse`에 additive `inventory` snapshot을 포함하고, sequence의 각 event도
  최종 inventory snapshot을 전달한다. frontend의 `optimisticMutation` Module은 optimistic apply
  → mutation → mutation failure restore → best-effort sync → readback 실패 시 optimistic state
  재적용을 소유하며, mutation 성공 response에 inventory가 있으면 caller가 이를 authoritative
  local read model로 적용한다. `mutationReadback.ts`와 분리해 optimistic UX와 full response
  ordering을 각각 보존하고, event idempotency key·workspace conflict·typed error·Grocy status와
  사용자 retry는 caller가 계속 소유한다.
- 이유: authoritative Food response mutation과 event-based optimistic mutation은 서로 다른
  Interface를 요구한다. 두 Module을 유지하되 optional inventory snapshot을 통해 partial child
  lot도 server identity로 수렴시키면, 세 storage event caller의 lifecycle invariant와 stale
  dashboard 보호를 한 seam에 모으면서 response semantics도 실제 source of truth에 맞출 수 있다.
- 검증: backend 전체 **499 passed / 8 warnings**, Module contract **3 passed**, storage connected
  targeted **3 passed**, full connected **101 passed**, fixture/mobile **35 passed + 3 skipped**,
  native **4 passed**, Vite **759 modules**를 확인했다.
- 경계: external Grocy/provider transaction, managed PostgreSQL failover, physical device는
  별도 acceptance다.

## ADR-131 — guest transfer transport는 account session을 중앙 `mealApi` Interface로 통과시킨다

- 상태: `accepted`
- 문제: `AccountSheet`의 guest workspace preview/import가 `mealApi`를 우회해 자체 `fetch`,
  timeout, 오류 body parsing을 구현하고 있었다. 그 결과 account workspace의 revision header를
  보내거나 기억하지 못했고, transfer 성공 invalidation과 unmount 시 in-flight preview abort도
  중앙 transport와 분리되어 있었다.
- 결정: `mealApi.previewGuestTransfer(session, guestAccessToken, signal?)`와
  `mealApi.transferGuestWorkspace(session, guestAccessToken, signal?)`를 추가한다. 두 method는
  명시적으로 전달된 account session token으로만 요청하고, 기존 8초 timeout·typed
  `MealApiError`·workspace revision response 기억을 재사용한다. preview는 기존대로 workspace
  revision/mutation broadcast에서 제외하고, 실제 transfer는 현재 account workspace의
  `If-Rescue-Meal-Revision`을 전달하고 성공 후 `recipe`가 아닌 workspace mutation invalidation을
  발행한다. AccountSheet는 pending transfer decision/retry UX를 계속 소유하며, 재진입 preview
  effect의 `AbortController`만 중앙 method에 전달한다.
- 이유: guest token은 source workspace 식별자이고 account session은 target write authority다.
  두 credential을 한 `mealApi` Interface에서 구분하면 token persistence·workspace revision·error
  parsing·fetch timeout 지식의 Locality를 확보하면서도 source token을 raw cache나 broadcast
  payload에 넣지 않는다. caller는 사용자의 명시적 import/skip decision을 계속 소유해 transport
  Module이 UI pass-through가 되지 않게 한다.
- 호환성: 등록 직후 preview의 기존 503→재확인 흐름, reload 후 pending transfer, 같은 account
  workspace conflict, `confirm=true` body와 legacy token payload는 유지한다. transfer response의
  revision은 다음 target read/write의 baseline으로만 사용하며 source workspace를 자동 삭제하지
  않는다.
- 검증: connected guest registration/preview/retry/import와 conflict scenario **2 passed**,
  import retry request의 `If-Rescue-Meal-Revision` 전파를 **11** fixture 중 guest transfer
  assertion으로 확인했고, full connected **101 passed**, TypeScript/Vite build를 통과했다.
- 경계: 실제 account session refresh token, multi-device transfer UI 운영, managed database
  transaction과 external delivery는 별도 acceptance다.

## ADR-132 — storage event sequence replay는 persisted cardinality까지 exact match한다

- 상태: `accepted`
- 문제: deterministic event ID를 key/index로 계산하는 sequence replay가 incoming request에
  포함된 event만 순회했다. 이미 2개 event가 저장된 sequence에 같은 key의 1개 prefix를 보내면
  첫 event만 찾아 `200 replay`할 수 있어, 동일 payload만 replay한다는 operation identity 계약을
  위반할 가능성이 있었다.
- 결정: `_existing_storage_event_sequence()`는 sequence index `0..1`의 persisted ID를 준비해
  index 1만 남은 orphan partial 상태를 `409`로 중단하고, incoming request보다 뒤의 persisted
  tail event가 있으면 다른 payload sequence로 판단해 `409`를 반환한다. 모든 incoming event가
  존재하고 target food chain·type·location·quantity가 일치하며 cardinality도 같을 때만 replay
  response를 만든다. 정상적인 1-event sequence는 index 1이 없을 때 그대로 호환한다.
- 이유: event sequence는 최대 2개지만 move→child/open target chain과 inventory snapshot을
  함께 운반한다. prefix replay를 허용하면 caller가 완성된 사용자 의도를 불완전한 응답으로
  받거나 retry state를 잘못 판단할 수 있다. cardinality 검사를 deterministic ID seam에 두면
  domain body/lot semantics는 유지하면서 replay safety의 Locality와 테스트 Leverage를 얻는다.
- 호환성: same key·same two-event payload의 `X-Idempotency-Replayed=true`와 atomic flush,
  1-event sequence, payload conflict 및 partial sequence `409` semantics는 유지한다. storage
  event response-only `inventory` snapshot persistence 분리도 변경하지 않는다.
- 검증: 수정 전 prefix replay가 **200**으로 반환되는 red test를 확인했고, 수정 후 shorter replay
  payload **409**, 기존 atomic sequence replay targeted **2 passed**, backend 전체 **500 passed,
  8 warnings**, full connected **101 passed**를 확인했다.
- 경계: 이미 손상된 외부 provider transaction, managed PostgreSQL failover/partition과
  sequence 2개를 넘는 별도 batch API는 이 결정의 범위 밖이다.


## ADR-133 — storage caller의 recovery choreography를 좁은 Module로 수렴한다

- 상태: `accepted`
- 문제: `saveFood`, `consumeFood`, `discardFood`가 각각 `optimisticMutation` 호출 뒤
  mutation failure 시 dashboard를 다시 읽고 caller별 error disposition으로 같은 retry
  closure를 global toast에 등록하는 순서를 반복하고 있었다. 한 caller가 readback 실패를
  mutation failure로 잘못 분류하거나 retry closure에서 operation identity를 잃으면 storage
  event의 optimistic state와 durable state가 다시 갈라질 수 있다.
- 결정: `apps/web/src/storageMutationRecovery.ts`의 `runStorageMutationRecovery()`가 기존
  `runOptimisticMutation()` 위에서 storage-specific 순서를 소유한다. mutation reject 시
  lower Module의 restore가 끝난 뒤 `sync()`를 정확히 한 번 best-effort로 실행하고,
  caller에게 `onFailure(error, retry)`를 전달한다. retry는 같은 caller closure를 다시 실행한다.
  mutation 성공 후 dashboard readback이 `false`이거나 throw한 경우에는 optimistic reapply가
  유지된 `synced=false` 결과를 `onSuccess`로 전달하며 failure retry path로 재진입시키지 않는다.
- caller 책임: move/open/consume/discard payload, partial quantity와 child target, Idempotency-Key,
  `workspace_revision_conflict`·typed persistence·일반 오류 문구, Grocy status 조합,
  `syncDashboard` Adapter와 global toast surface는 `Prototype`에 남긴다. authoritative
  `inventory` response를 `FoodItem`으로 materialize하는 것도 caller가 소유한다.
- 이유: 세 caller가 같은 recovery invariant를 실제로 공유하지만 event 의미와 사용자 문구는
  다르다. 이 좁은 Interface는 response/read ordering을 다시 generic mutation engine으로
  합치지 않고도 recovery Locality와 test Leverage를 높인다. `mutationReadback.ts`와
  `optimisticMutation.ts`의 분리 및 ADR-130의 책임 배치를 유지한다.
- 호환성: transport-level Idempotency-Key retry와 explicit user retry를 중복 실행하지 않고,
  successful mutation + stale dashboard readback을 성공 상태로 보존하며, 기존 storage event
  response-only `inventory` snapshot과 Grocy notice를 변경하지 않는다.
- 검증: pure recovery contract **3 passed**, storage connected targeted **14 passed**
  (move/open/consume/discard와 location flows), full connected **103 passed**, frontend build
  TypeScript/Vite **760 modules**를 확인했다.
- 경계: 전체 workspace transaction, external Grocy compensation, managed PostgreSQL failover,
  device background scheduling과 다른 domain mutation의 generic retry는 이 Module 범위 밖이다.

## ADR-134 — receipt commit finalization failure는 transaction ID 없는 typed envelope를 반환한다

- 상태: `accepted`
- 문제: receipt finalization 중 일반 예외가 발생하면 rollback 뒤
  `영수증 반영을 롤백했습니다. 재시도 transaction: ...`라는 plain string을 반환했다. 이
  응답은 내부 transaction ID를 노출하고 `code`, `retryable`, `action`을 제공하지 않아
  `MealApi`와 frontend의 typed retry contract가 finalization failure에서 약해졌다.
- 결정: finalization business state rollback과 `needs_reconciliation` transaction marker 저장은
  유지하되, marker flush가 성공한 일반 failure response는
  `receipt_commit_persistence_unavailable` typed `503`으로 반환한다. envelope는 사용자용
  detail, `retryable: true`, `action: retry_later`만 포함하며 transaction ID·예외 원문·receipt
  payload를 포함하지 않는다. marker flush 자체가 실패한 별도 경로는 기존
  `receipt_commit_reconciliation_unavailable` typed `503`과 pending identity 보존을 유지한다.
- 이유: transaction record는 server-side retry identity이고 client에 내부 ID를 노출할 필요가
  없다. 동일한 typed envelope를 사용하면 `mealApi`가 domain failure를 안정적으로 분류하고,
  frontend는 이미 보존한 Idempotency-Key와 receipt payload로 명시적 retry를 수행할 수 있다.
  failure response의 Locality를 높이면서 pending marker와 finalization의 두 persistence
  phase를 섞지 않는다.
- 호환성: finalization rollback, `needs_reconciliation` 상태, same-key retry, duplicate/conflict
  `409`, marker flush failure와 external Grocy outbox semantics는 변경하지 않는다. 기존
  clients가 status만 확인하던 경우에도 HTTP `503`은 유지한다.
- 검증: 수정 전 plain string·transaction ID 노출을 red로 확인했고, 수정 후 final flush failure
  test에서 typed code/retry metadata와 ID 비노출을 확인했다. pending marker failure와
  reconciliation marker failure targeted **3 passed**, backend 전체 **500 passed, 8 warnings**,
  connected 전체 **103 passed**를 확인했다.
- 경계: transaction ID 기반 운영자 reconciliation UI, external provider transaction, managed
  failover/response reset과 실제 mail/provider delivery는 별도 acceptance다.

## ADR-135 — storage retry는 reconciliation 뒤 stale snapshot을 복원하지 않는다

- 상태: `accepted`
- 문제: 첫 storage mutation 실패에서는 optimistic 상태를 최초 snapshot으로 되돌려야 하지만,
  그 뒤 dashboard reconciliation을 거친 retry가 다시 실패하면 같은 최초 snapshot을 다시
  `restore`할 수 있었다. 그 사이 다른 기기 또는 authoritative dashboard가 반영한 상태를
  오래된 local 배열로 덮을 위험이 있었다.
- 결정: `storageMutationRecovery.ts`는 첫 attempt에만 `runOptimisticMutation`의 restore
  callback을 전달한다. 첫 실패 후 생성하는 retry closure는 reconciliation 이후의 현재
  authoritative state를 보존하기 위해 restore를 no-op으로 바꾸고, retry 실패 시에는
  `sync()`와 caller error disposition만 수행한다. 성공 mutation의 readback false/throw는
  기존처럼 optimistic reapply와 `synced=false` 결과를 유지한다.
- 이유: restore는 mutation 직전 snapshot 보호 장치이지, 이미 reconciliation된 최신 read model을
  되돌리는 복구 명령이 아니다. attempt phase를 Interface에 숨기면 caller가 operation key와
  오류 의미를 유지하면서 stale rollback의 Locality를 한 곳에서 보장할 수 있다.
- 호환성: 최초 실패의 optimistic restore, 동일 Idempotency-Key retry, workspace conflict/typed
  persistence 문구, Grocy status와 global toast는 유지한다. 자동 retry나 authoritative state
  merge를 추가하지 않는다.
- 검증: retry가 두 번 실패하는 순수 contract에서 첫 restore는 1회, 두 번째 restore는 0회임을
  확인하는 **4 passed**(`storage-mutation-recovery`)와 storage connected targeted **14 passed**,
  full connected **103 passed**, build **760 modules**를 확인했다.
- 경계: multi-process state convergence, external provider transaction, managed PostgreSQL
  failover와 device lifecycle은 별도 acceptance다.

## ADR-136 — meal-plan completion persistence failure는 typed envelope와 고정 retry payload를 사용한다

- 상태: `accepted`
- 문제: `POST /api/meal-plans/{plan_id}/complete`의 `WorkspaceMutation` 일반 예외 경로가
  snapshot rollback 뒤 plain string만 반환하고 있었다. 이 응답은 completion persistence failure를
  구분할 `code`, 재시도 가능 여부, action을 제공하지 않아 frontend가 기존 consumption draft를
  유지하면서 안전하게 복구할 수 없었다.
- 결정: `HTTPException` validation과 `ConcurrentWorkspaceWriteError` winner replay 경로는
  그대로 유지하고, 그 외 completion flush/regular persistence failure만
  `meal_plan_completion_persistence_unavailable` typed `503`으로 반환한다. envelope에는
  사용자용 detail, `retryable: true`, `action: retry_later`만 넣고 예외 원문은 노출하지 않는다.
  `WorkspaceMutation`이 plan·inventory·consumed event·bundle progress·audit snapshot을
  실패 전 상태로 복원하는 기존 책임은 바꾸지 않는다.
- frontend: `mealApi`는 해당 code를 전용 type guard로 분류한다. `MealPlanSheet`는 실패 당시
  plan/consumption payload를 보존하고 inline `다시 시도` action을 이 code에만 노출한다. retry가
  성공하면 기존 completion response와 dashboard sync 흐름을 사용하며, workspace conflict·allocation
  validation·일반 오류에는 completion blind retry를 노출하지 않는다.
- 이유: persistence failure는 local snapshot이 복원되어 동일한 사용자 의도를 다시 실행할 수 있는
  일시적 상태지만, conflict·validation은 최신 상태 확인 또는 입력 수정이 먼저 필요한 다른
  domain 결과다. error classification을 `MealApi`에 두고 payload snapshot을 sheet에 두면
  backend domain semantics와 caller-owned user action을 섞지 않으면서 retry fidelity를 보장한다.
- 호환성: `completed`/`already_completed`, allocation/unit 검증, linked multi-day progress,
  Grocy status와 existing WorkspaceMutation rollback semantics는 유지한다. HTTP status `503`은
  유지하며 기존 plain detail에 의존하지 않는 client는 status만으로도 같은 실패를 감지할 수 있다.
- 검증: 수정 전 API regression은 string detail 때문에 실패했고, 수정 후 completion envelope와
  rollback API targeted **3 passed**, backend 전체 **500 passed / 8 warnings**, typed 503→same
  payload retry connected **1 passed**, full connected **104 passed**, fixture/mobile **38 passed +
  3 skipped**, native **9 passed**, TypeScript/Vite **760 modules**, Sites **4 passed**와 release
  manifest **2 passed**를 확인했다.
- 경계: external Grocy transaction, managed PostgreSQL failover/partition, reverse-proxy response
  reset, physical device accessibility과 production cutover은 이 local recovery contract의
  증명이 아니다.

## ADR-137 — account deletion persistence failure는 durable fence를 유지하는 typed retry envelope를 사용한다

- 상태: `accepted`
- 문제: account deletion coordinator가 `active → deleting` durable fence를 획득한 뒤
  workspace purge 또는 credential 삭제에서 실패하면 route가 plain `503` detail만 반환했다.
  따라서 client가 재개 가능한 삭제 failure와 인증·rate-limit·configuration failure를 같은
  방식으로 분류할 수 없고, 예외 원문을 안전하게 다루는 계약도 route마다 달라질 수 있었다.
- 결정: coordinator의 regular exception은 account row의 `deleting` fence와 기존 resume semantics를
  유지한 채 `account_deletion_persistence_unavailable` typed `503`으로 반환한다. envelope는
  사용자용 detail, `retryable: true`, `action: retry_later`만 제공하며 password·token·email·예외
  원문은 포함하지 않는다. guest/비밀번호/확인 문구 validation, `423 account_deletion_in_progress`,
  rate-limit `429`와 성공 후 account purge semantics는 변경하지 않는다.
- frontend: `mealApi`가 전용 type guard를 제공하고 `AccountDeletionPanel`은 해당 code에만
  inline `다시 시도`를 표시한다. retry는 사용자가 이미 입력한 current password와 정확한
  `DELETE` payload를 다시 사용하며, untyped `503`, `401`, `422`, `429`에는 삭제 retry action을
  자동으로 붙이지 않는다.
- 이유: 삭제는 일반 workspace mutation이 아니라 auth database fence와 workspace purge 사이의
  local saga다. fence를 보존하는 retryable failure를 명시적으로 분류하면 사용자가 삭제가
  완료됐다고 오인하지 않으면서 같은 session에서 purge를 재개할 수 있고, destructive action의
  재확인 UI도 유지된다.
- 호환성: 같은 session version의 deletion retry, 일반 요청의 `423`, `GET /api/auth/me`의
  `account_status=deleting`, 성공 후 기존 token `401`과 새 guest workspace 전환은 유지한다.
- 검증: 수정 전 purge-failure regression은 string detail에서 실패했고, 수정 후 typed envelope와
  durable fence resume API targeted **3 passed**, typed 503→same payload retry connected **1 passed**,
  rate-limit no-inline-retry connected **2 passed**, backend **500 passed / 8 warnings**, full
  connected **105 passed**, build **760 modules**를 확인했다.
- 경계: auth/workspace distributed transaction, backup/WAL/object-storage/Grocy deletion, managed
  PostgreSQL failover/partition, external audit/compensation과 production cutover은 별도 acceptance다.

## ADR-138 — native first-fold geometry regression은 sheet entrance transform settle 후 측정한다

- 상태: `accepted`
- 문제: app-owned sheet의 first-fold regression이 sheet bottom이 화면에 1px 이내라는 조건만
  기다린 뒤 child control을 측정했다. spring animation의 중간 `transform`이 약 `0.009px` 남은
  순간에도 검사가 진행되어, 안정 상태에서는 safe-area 안쪽인 control을 간헐적으로 boundary 밖으로
  판정할 수 있었다.
- 결정: native viewport helper는 device-screen과 sheet bottom의 근접성뿐 아니라 computed
  entrance transform이 `none`이 될 때까지 기다린 뒤 34px home-indicator boundary와 44px control
  height를 검사한다. protected `BottomSheet` runtime이나 제품 layout을 임의로 완화하지 않는다.
- 이유: animation settle 전 geometry는 사용자에게 노출되는 최종 layout이 아니다. settle condition을
  명시하면 timing flake와 실제 first-fold clipping을 구분하면서 boundary assertion의 의미를 보존한다.
- 호환성: account/detail snap과 safe-area padding, reduced-motion behavior와 protected runtime은
  변경하지 않는다. native test의 측정 시점만 안정화한다.
- 검증: food-detail first-fold test의 `818.008972px` 조기 측정 실패를 3회 반복에서 재현·분리했고,
  settle helper 적용 후 native 전체 **11 passed**, fixture/mobile **38 passed + 3 skipped**와
  TypeScript/Vite build **760 modules**를 확인했다.
- 경계: physical iPhone compositor, VoiceOver/TalkBack, OS Dynamic Type, OEM insets와 signed
  production artifact는 이 browser/native-shell geometry evidence의 범위 밖이다.

## ADR-139 — single meal-plan save persistence failure는 typed envelope와 preview payload snapshot을 사용한다

- 상태: `accepted`
- 문제: `POST /api/meal-plans`가 `WorkspaceMutation` outer flush의 regular exception을 route에서
  잡지 않아 FastAPI TestClient까지 raw `RuntimeError`가 전파되고 있었다. phantom rollback은
  동작했지만 client가 저장 실패를 typed persistence failure로 분류하거나 같은 preview 의도를
  명시적으로 retry할 수 없었다.
- 결정: plan_id 없는 호환 경로와 plan lock 경로 모두 `HTTPException` validation 및
  `ConcurrentWorkspaceWriteError` winner replay는 그대로 전파하고, 그 외 regular persistence
  exception만 `meal_plan_persistence_unavailable` typed `503`(`retryable: true`,
  `action: retry_later`)으로 감싼다. `WorkspaceMutation`의 plan·saved audit snapshot rollback은
  기존 그대로 사용한다. multi-day bundle save는 별도 route/contract로 남긴다.
- frontend: `mealApi`에 전용 type guard를 추가하고 `MealPlanSheet`는 실패 당시
  `inventory_ids`, `plan_id`, `snapshot_hash`, recipe/bundle identity와 servings를 보존한다.
  typed persistence failure에만 inline `다시 시도`를 노출하고 snapshot/recipe conflict,
  validation과 untyped error에는 저장 retry action을 추가하지 않는다.
- 이유: preview 결과를 저장하는 단계는 사용자가 이미 승인한 immutable snapshot을 다시 보내는
  retryable local mutation이지만, conflict는 현재 재고/recipe를 다시 확인해야 하는 별도 결과다.
  route 예외 순서를 유지하면 concurrency winner semantics를 훼손하지 않고, payload snapshot을
  caller에 두면 UI가 다른 planner read나 선택 변경과 retry identity를 혼합하지 않는다.
- 호환성: 기존 `plan_id` replay, snapshot/recipe conflict `409`, linked bundle repair,
  `saved` audit와 single-vs-multi-day 저장 범위는 변경하지 않는다. HTTP `503` status도 유지한다.
- 검증: 수정 전 phantom test에서 raw `RuntimeError` 전파를 확인했고, 수정 후 save flush envelope,
  WorkspaceMutation seam, concurrent save와 revision probe targeted **4 passed**, typed 503→same
  payload retry connected **1 passed**, TypeScript/Vite build **760 modules**를 확인했다.
- 경계: multi-day bundle persistence, external provider transaction, managed PostgreSQL failover/
  partition, reverse-proxy response reset과 production cutover은 이 decision의 범위 밖이다.

## ADR-140 — multi-day bundle save persistence failure는 bundle payload를 보존하는 typed retry envelope를 사용한다

- 상태: `accepted`
- 문제: `POST /api/meal-plans/multi-day`가 bundle lock과 `WorkspaceMutation`은 사용하지만,
  regular outer flush exception을 route에서 잡지 않아 raw `RuntimeError`가 전파될 수 있었다.
  bundle rollback 자체는 동작했지만 사용자가 preview와 저장 실패를 구조적으로 구분하거나 같은
  bundle 의도로 retry할 수 없었다.
- 결정: `bundle_id` 없는 호환 경로와 bundle lock 경로 모두 `HTTPException` validation과
  `ConcurrentWorkspaceWriteError` winner replay를 유지하고, 그 외 regular persistence failure만
  `multi_day_plan_persistence_unavailable` typed `503`(`retryable: true`, `action: retry_later`)으로
  반환한다. `WorkspaceMutation`의 bundle/day/history snapshot rollback과 existing bundle replay/
  snapshot conflict semantics는 변경하지 않는다.
- frontend: `MealPlanSheet`는 실패 당시 `inventory_ids`, `bundle_id`, `snapshot_hash`,
  `max_minutes`, `servings`를 보존하고 3일 식단 영역 안에 typed failure 전용 inline `다시 시도`를
  표시한다. retry는 고정된 preview payload를 사용하며 snapshot conflict·validation·untyped error에는
  action을 붙이지 않는다. 단일 plan save/complete와 linked day progress는 기존 caller/route가 계속
  소유한다.
- 이유: multi-day preview는 side-effect-free이고 저장 payload가 day selection의 기준이다. 실패 후
  현재 preview를 다시 계산하거나 다른 bundle state와 합치면 사용자가 승인한 snapshot과 retry identity가
  달라질 수 있다. payload snapshot과 bundle-specific error classification을 caller/`MealApi`에 두면
  history/replay semantics를 보존하면서 복구 가능한 failure만 명시할 수 있다.
- 호환성: bundle idempotent replay, saved/history/latest readback, snapshot conflict, selected
  single-plan day link와 subsequent completion semantics는 유지한다. multi-day preview 자체는
  계속 write-free다.
- 검증: 수정 전 forced flush regression에서 raw `RuntimeError` 전파를 확인했고, 수정 후 multi-day
  envelope/rollback·bundle WorkspaceMutation·day completion recovery targeted **4 passed**, typed
  bundle retry connected **1 passed**, build **760 modules**를 확인했다.
- 경계: external Grocy/provider transaction, managed PostgreSQL failover/partition, distributed bundle
  transaction, reverse-proxy response reset과 physical device acceptance는 별도다.

## ADR-141 — operational readiness와 worker configuration failure는 typed 503 envelope를 사용한다

- 상태: `accepted`
- 문제: domain mutation은 `code`, `retryable`, `action`을 가진 typed `503`으로 정렬됐지만,
  API `/ready`의 저장소/auth 설정 실패, workspace acquisition의 일부 예외, OCR worker의
  model readiness/capacity, 내부 worker token 누락은 plain string `503`을 반환하고 있었다.
  status만으로는 일시 장애와 서버 설정 누락을 자동화·운영 화면에서 구분할 수 없었다.
- 결정: 일시적으로 다시 확인할 수 있는 저장소/worker readiness·capacity 경로에는
  `retryable=true`, `action=retry_later`, `Retry-After: 1`을 사용한다. 서버 설정 누락이나
  workspace 격리 미지원에는 `retryable=false`와 `action=configure_server` 또는
  `configure_storage`를 사용한다. API `/ready`와 worker failure detail은 안전한 사용자 문구와
  code만 포함하고 exception 원문·token·workspace data를 노출하지 않는다.
- 적용 범위: `readiness_storage_unavailable`, `auth_configuration_missing`,
  `ocr_model_unavailable`, `ocr_worker_busy`, 네 종류의 internal worker/config guard,
  `grocy_integration_not_configured`, `recipe_review_configuration_missing`,
  `recipe_import_configuration_missing`, `workspace_provisioning_unavailable`,
  `postgres_pool_unavailable` middleware 경로와 `workspace_storage_unavailable`를 고정한다.
  기존 success response model, HTTP 503 status, domain mutation의 rollback/idempotency와
  production legacy review token의 typed error는 유지한다.
- 이유: readiness와 worker capacity는 동일한 사용자 mutation retry payload를 가지고 있지 않다.
  따라서 transport가 분류할 수 있는 운영 상태만 정규화하고, domain-specific retry를 generic
  coordinator로 합치지 않는다. 설정 오류를 retryable로 표시하지 않아 무한 재시도도 막는다.
- 검증: 수정 전 API 회귀에서 middleware/readiness/worker config plain 503을 red로 확인했고,
  수정 후 초기 운영 slice API 전체 **504 passed**, 남은 auth/recipe configuration closure 후
  API 전체 **507 passed**, OCR worker 전체 **10 passed**를 확인했다. 직접 예외 원문이
  response에 들어가지 않는 것과 worker readiness/capacity의 retry metadata도 고정했다.
- 경계: 외부 load balancer의 retry policy, managed PostgreSQL failover, 실제 OCR model
  download/cold latency, provider delivery와 production deployment health policy는 별도
  acceptance다. 모든 기존 `503`을 이 ADR 하나로 치환한다고 주장하지 않는다.

## ADR-142 — workspace export는 IP/workspace 이중 bucket rate limit과 명시적 429를 사용한다

- 상태: `accepted`
- 문제: `/api/account/export`는 현재 workspace의 재고·receipt summary·보관 이력·식단·선호
  설정을 한 번에 반환하는 민감한 read였지만, 호출 횟수 제한이 없어 짧은 시간에 반복 수집할
  수 있었다. 기존 auth rate limit은 auth endpoint 중심이라 export 호출의 민감도와 guest workspace
  경계를 직접 표현하지 못했다.
- 결정: export는 기본 시간당 6회로 제한하고, client IP와 현재 workspace를 각각 opaque
  SHA-256 bucket으로 계산한다. 두 bucket 중 하나라도 차단되면 body를 생성하지 않고
  `account_export_rate_limited` typed `429`와 `Retry-After`, rate-limit headers를 반환한다.
  `RESCUE_MEAL_EXPORT_RATE_LIMIT_ENABLED`, `...MAX_REQUESTS`, `...WINDOW_SECONDS`로 명시 조정하며
  기본 enable 상태를 유지한다.
- 호환성: 성공 export schema와 직접 JSON 응답은 유지한다. persistent auth repository에서는
  기존 database-backed limiter가 process 간 bucket을 공유하고, in-memory fixture에서는
  process-local fallback을 사용한다. AccountSheet는 429를 성공 download로 처리하지 않고
  다운로드를 만들지 않은 채 retry-later 안내를 보여준다.
- 이유: IP만 사용하면 workspace별 새 token으로 우회할 수 있고 workspace만 사용하면 공격자 IP가
  여러 workspace를 만들어 우회할 수 있다. 이중 bucket은 원문 identity를 저장하지 않으면서
  두 공격면을 함께 제한한다. streaming/압축과 actor/time audit은 별도 문제이므로 이 ADR에서
  암묵적으로 해결하지 않는다.
- 검증: 수정 전 export rate-limit API regression이 두 번째 요청 `200`으로 red였고, 수정 후
  API export targeted **2 passed**, AccountSheet typed 429 connected **1 passed**, API 전체
  **508 passed / 8 warnings**, build **760 modules**와 connected full **108 tests**에 포함된
  export UI flow를 확인했다.
- 경계: 대규모 export streaming/압축, durable actor/time audit, external gateway abuse control,
  PostgreSQL replica/WAL/backup retention, production rate-limit tuning은 별도 acceptance다.
