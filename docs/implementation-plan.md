# Rescue Meal 구현 계획

기준일: 2026-09-01
상태: 1차 vertical slice 구현 진행 중

## 1. 목표

Rescue Meal은 장을 본 뒤 식재료를 하나씩 입력하는 부담을 줄이고, 영수증·바코드·라벨로 재고 초안을 만든 뒤 사용자가 확인한 정보만 식료품 현황에 반영하는 서비스입니다.

핵심 사용자 결과는 다음 한 줄로 고정합니다.

```text
영수증 한 장
→ 모호한 항목만 확인
→ 상품별 구매 lot 생성
→ 냉장·냉동·실온·개봉 이력 관리
→ 표시 날짜와 추정 소비 우선일 분리
→ 먼저 사용할 식재료와 식단 제안
```

## 2. 현재 상태와 가정

- 프로젝트 디렉터리: 로컬 수업 작업 폴더의 `rescue-meal`
- GitHub: `godekd3133/rescue-meal`
- 현재 소스: `apps/web` 모바일 프로토타입과 `services/api` FastAPI 인메모리 MVP 구현
- 현재 문서: 제품 흐름·데이터 계약·OSS 카탈로그·검증 계획·영수증/라벨 spike·1차 구현 상태
- 기본 팀 규모 가정: 3~5명
- 기본 기간 가정: 12~15주
- 기본 클라이언트: 모바일 카메라를 사용할 수 있는 반응형 PWA
- 기본 실행환경: Linux + Docker Compose
- 기본 서버: FastAPI + Python
- 기본 저장소: PostgreSQL + pgvector
- 재고 기준 시스템 후보: Grocy REST API
- 고정 hardware: 없음
- 실시간 마트·카드·쇼핑몰 계정 연동: 제외

팀 규모·기간·개발환경이 다르면 역할과 순서를 조정하지만, `영수증 → review → lot → storage event → rescue queue`의 핵심 순서는 바꾸지 않습니다.

현재 환경 preflight 결과는 [환경 Preflight](../evidence/environment-preflight-2026-09-01.md)에 기록했습니다. Python 3.12와 `uv`를 우선 사용하며, Docker Desktop daemon이 실행된 뒤에야 Grocy·PostgreSQL baseline을 재현할 수 있습니다.

## 2차 진행 상태

2026-09-01 기준으로 다음 항목은 코드와 테스트가 있습니다.

- FastAPI health/dashboard 및 receipt commit skeleton
- 영수증·라벨 이미지 upload endpoint의 명시적 OCR engine 상태
- PaddleOCR optional adapter의 지연 초기화
- Python 3.12 PaddleOCR worker, remote adapter, model version trace
- 영수증 텍스트 parser의 상품·할인·환불·소계·결제 분류
- 라벨 날짜의 소비기한·유통기한·포장일·제조일·불명확 의미 분리
- `parse-text` 기반 review draft fixture와 API 테스트
- PostgreSQL/pgvector 초기 스키마와 Docker Compose baseline
- 일반 GTIN·GS1 AI·가변중량 barcode parser 및 날짜 없는 상품의 abstaining priority inference
- local fixture 우선 상품 resolver 및 Open Food Facts feature-flagged adapter
- receipt commit coordinator의 rollback·재시도·reconciliation transaction 경계
- signed guest workspace token과 SQLite workspace isolation, auth-required 401 경계
- 조리 가능 시간 10·20·30·45분 선택과 planner preview/save 요청 전달
- COOKRCP01 공개 레시피를 review draft와 source/license/revision으로 보존하는 importer 경계와 운영 CLI

실제 PaddleOCR worker와 첨부 이미지 benchmark는 완료했지만, 운영용 품질 gate·annotation·모든 매장 template은 아직 검증 전입니다. ZXing Browser camera adapter·권한 실패 fallback·guest workspace isolation·email/password account register/login은 구현했고, PostgreSQL API projection의 tenant-aware connection/read/write·account/revoke adapter와 Grocy HTTP adapter도 추가했습니다. 다만 normalized domain table의 tenant mapping, live PostgreSQL/Grocy migration·stock readback, Grocy product ID mapping/outbox, GS1 camera path, 관할 출처가 승인된 운영용 rule snapshot은 아직 검증 전입니다. OAuth·계정 복구는 아직 없습니다. 세부 evidence는 [1차 구현 상태](build-status-2026-09-01.md), [OCR intake pipeline](ocr-pipeline.md), [PaddleOCR benchmark](../evidence/paddleocr-benchmark-2026-09-01.md), [barcode camera flow](barcode-camera.md), [guest workspace](auth-workspace.md), [PostgreSQL tenant contract](../evidence/postgres-tenant-contract-2026-09-01.md), [Grocy adapter contract](../evidence/grocy-adapter-contract-2026-09-01.md)를 기준으로 합니다.

레시피 영역은 2026-09-01~02에 5개 fixture 기반 `preview → 시간 선택 → save → latest → 사용량 확인 → complete` vertical slice까지 구현했습니다. planner v2는 curated alias와 필요 단위·수량을 검증하고, 같은 재료의 여러 lot를 allocation으로 분배하며, 사용자가 완료 직전 lot별 사용량을 조정할 수 있습니다. 조리 가능 시간은 10·20·30·45분 중 하나를 선택하고 `max_minutes`로 preview/save 요청에 전달하며, 최신 저장 계획을 복원할 때도 시간 제한을 비교합니다. 조리 완료 뒤에는 matched lot에만 `meal_plan_id`가 연결된 소비 event를 남깁니다. 미리보기는 저장하지 않고, 저장 버튼을 눌렀을 때만 SQLite/PostgreSQL API projection에 workspace별 계획을 남깁니다. 현재 30~50개 레시피·대체 단위 환산·3일 최적화는 다음 단계입니다. 세부 계약과 readback은 [재고 기반 레시피 플래너](recipe-planner.md)와 [planner v2·조리 완료 readback](../evidence/recipe-planner-completion-readback-2026-09-02.md)을 기준으로 합니다.

## 3. 범위

### MVP에 포함

- 종이 영수증 이미지 업로드
- 지원 매장 2~3개 영수증 유형
- 영수증 유형 판별
- 구매일·매장·상품 라인·수량·금액 추출
- 상품·할인·환불·합계·결제 라인 분류
- 상품명 별칭과 바코드 기반 후보 매칭
- 낮은 신뢰도 항목 review queue
- 중복 영수증 방지
- review 완료 후 atomic 또는 보상 가능한 stock commit
- 일반 상품 바코드 스캔
- GS1 날짜가 있는 바코드의 AI 파싱
- 포장 라벨 날짜 OCR
- 실온·냉장·냉동 보관 위치
- 개봉·냉동·해동·분할 이력
- 표시 날짜와 추정 소비 우선일 분리
- Rescue Queue
- 한국 레시피 fixture 30~50개
- 현재 재고를 사용하는 3일 식단 후보
- 소비·폐기 기록
- Docker Compose 실행
- README·LICENSE·출처·검증 리포트

### MVP에서 제외

- 모든 마트 영수증 범용 지원
- 바코드만으로 실제 소비기한 생성
- 사진만으로 부패 여부 판정
- 자동 `safe_to_eat` 판정
- 실제 냉장고 온도 센서 연동
- 카드사·마트 계정 로그인 연동
- 자동 환불·반품 신청
- 모든 한국 상품의 완전한 상품 DB 구축
- 대규모 FoodOn ontology reasoning
- Paperless-ngx·Mealie·Tandoor 동시 도입
- Qdrant와 pgvector 동시 운영
- 생성형 AI의 근거 없는 레시피 생성

## 4. 권장 구조

```text
PWA camera / upload
        ↓
FastAPI intake API
        ↓
Receipt / label pipeline
  ├ document type classifier
  ├ PaddleOCR / Docling adapter
  ├ receipt line parser
  ├ ZXing + GS1 Syntax Engine
  └ product resolver
        ↓
Review Queue
  ├ user correction
  ├ source/provenance
  └ duplicate check
        ↓
Commit Coordinator
  ├ Receipt/lot transaction log
  ├ Grocy stock adapter
  └ reconciliation / compensation
        ↓
Inventory + Storage Events
        ↓
Rule Retriever + Rescue Planner
  ├ MFDS product reference
  ├ approved storage rules
  ├ Grocy recipes / COOKRCP01 fixtures
  └ OR-Tools
        ↓
Rescue Queue / Meal Plan / ntfy
```

### 서비스 경계

| 영역 | 책임 | 기준 데이터 |
|---|---|---|
| Intake | 영수증·라벨 원본과 OCR draft | Rescue API staging DB |
| Product resolver | 상품 후보·별칭·출처 | ProductAlias + pgvector |
| Date provenance | 날짜 종류·출처·확인 상태 | DateAssertion |
| Inventory | 확정 재고·수량·소비 | Grocy API와 mapping |
| Storage | 위치 변경·개봉·분할·해동 | StorageEvent |
| Rules | 제품 기준·보관 참고 규칙 | versioned rule snapshot |
| Planning | 재료 우선순위·식단 | deterministic planner run |
| Notifications | 사용자가 해야 할 다음 행동 | ntfy 또는 PWA notification |

## 5. 작업 스트림

### WS-0 — 범위·저장소·데이터 보호

| ID | 작업 | 완료 조건 |
|---|---|---|
| W0.1 | Git 저장소 초기화와 기본 branch 결정 | `git status`와 README에 현재 revision 기록 |
| W0.2 | 디렉터리 구조 생성 | `apps/web`, `services/api`, `services/worker`, `data/fixtures`, `docs`, `evidence` 경계 존재 |
| W0.3 | dependency/license manifest | 코드·모델·공공 데이터·API 이용조건을 표로 기록 |
| W0.4 | 개인정보 정책 초안 | 원본 영수증 보존, 마스킹, 삭제, 공유 정책 명시 |
| W0.5 | fixture 취급 규칙 | 개인 결제정보 없는 fixture와 원본 hash만 Git에 저장 |

### WS-1 — OSS baseline과 실행환경

| ID | 작업 | 완료 조건 |
|---|---|---|
| W1.1 | Grocy 공식 이미지·고정 버전 실행 | 상품·재고·best-before·consume·spoiled·recipe API readback |
| W1.2 | FastAPI skeleton | `/health`, OpenAPI, pytest smoke |
| W1.3 | PostgreSQL + pgvector | embedding column과 cosine nearest-neighbor sample |
| W1.4 | Docker Compose | web·api·worker·db·Grocy healthcheck와 한 명령 실행 |
| W1.5 | structured logging | correlation id와 source/build/version log |

### WS-2 — 바코드·제품 조회

| ID | 작업 | 완료 조건 |
|---|---|---|
| W2.1 | ZXing Browser camera adapter | camera UI·권한 실패 fallback 구현, 실기기·fixture readback 대기 |
| W2.2 | GS1 Syntax Engine adapter | AI 11/13/15/16/17 fixture를 DateAssertion 후보로 변환 |
| W2.3 | 가변중량 바코드 분기 | `2` 또는 restricted circulation 후보를 글로벌 GTIN과 분리 |
| W2.4 | Open Food Facts adapter | product lookup success/failure/partial을 모두 저장 |
| W2.5 | 식품안전나라 I1250 adapter | 제품명·제조사·품목유형 후보와 `POG_DAYCNT` readback |
| W2.6 | legacy C005 adapter | 결과에 freshness 경고를 붙이고 primary source로 사용하지 않음 |

### WS-3 — 영수증·라벨 OCR

| ID | 작업 | 완료 조건 |
|---|---|---|
| W3.1 | 이미지 품질 gate | 잘림·흐림·과노출·기울기 상태와 재촬영 메시지 |
| W3.2 | 영수증 유형 classifier | grocery·retail beverage·restaurant·unknown 분류 |
| W3.3 | PaddleOCR adapter | text, bbox, confidence, model version 저장 |
| W3.4 | Docling PDF adapter | 전자 영수증의 layout/line item 구조화 sample |
| W3.5 | store template parser | 2~3개 국내 매장의 header/line/discount 구조화 |
| W3.6 | line type parser | product·discount·refund·subtotal·payment·unknown 구분 |
| W3.7 | label parser | 소비기한·포장일·제조일·중량·원재료 문맥 후보 추출 |
| W3.8 | review UI payload | 원문 bbox와 추출 필드가 서로 연결되어 보임 |

### WS-4 — 상품 매칭과 영수증 commit

| ID | 작업 | 완료 조건 |
|---|---|---|
| W4.1 | ProductAlias 모델 | 매장·raw name·상품·source·confidence 저장 |
| W4.2 | 매칭 waterfall | alias → local catalog → MFDS → Open Food Facts → user search 순서 |
| W4.3 | 매칭 후보 UI | 상품명·브랜드·용량·출처·confidence 표시 |
| W4.4 | duplicate fingerprint | 동일 영수증 재처리와 crop 재업로드 방지 fixture |
| W4.5 | commit coordinator | review 완료 전 stock 생성 금지 |
| W4.6 | retry/compensation | Grocy 일부 성공 뒤 실패 시 rollback·undo 또는 pending reconciliation |
| W4.7 | commit readback | 모든 line이 대응 StockLot과 Grocy ID를 가짐 |

### WS-5 — lot·보관·날짜 provenance

| ID | 작업 | 완료 조건 |
|---|---|---|
| W5.1 | StockLot 연결 | 영수증 line 하나가 구매 lot을 생성 |
| W5.2 | DateAssertion 연결 | 날짜 종류·출처·bbox·rule version·사용자 확인 저장 |
| W5.3 | StorageLocation | ambient·refrigerated·frozen·custom 지원 |
| W5.4 | StorageEvent | moved·opened·frozen·thawed·split·consumed·discarded replay |
| W5.5 | partial split | 4팩 중 2팩 이동 시 부모·child lot과 수량 보존 |
| W5.6 | date precedence | 라벨 표시 날짜가 추정값에 의해 덮어써지지 않음 |
| W5.7 | mismatch warning | 라벨 보관조건과 실제 위치가 다를 때 경고 |

### WS-6 — rule retrieval와 backend AI

| ID | 작업 | 완료 조건 |
|---|---|---|
| W6.1 | rule snapshot | MFDS·검토된 공개 자료를 source/version과 함께 저장 |
| W6.2 | product normalizer | raw 상품명을 canonical 후보와 confidence로 반환 |
| W6.3 | storage classifier | 보관 후보와 확인 필요 여부 반환 |
| W6.4 | rule retriever | source 없는 날짜를 만들지 않고 null 반환 |
| W6.5 | priority estimator | `estimated_use_first_window` 범위와 근거 반환 |
| W6.6 | structured output | JSON Schema/Pydantic validation 실패 시 abstain |
| W6.7 | safety gate | `safe_to_eat` 생성 금지, 고위험·정보부족 항목 review |
| W6.8 | trace | model·prompt·retrieved rules·input hash·user correction 저장 |

### WS-7 — 레시피·Rescue Planner

| ID | 작업 | 완료 조건 |
|---|---|---|
| W7.1 | recipe fixture | Grocy recipe 30~50개와 canonical ingredient ID |
| W7.2 | COOKRCP01 importer | 공식 response adapter, bad row 격리, review draft CLI, 출처·수집일 기록 |
| W7.3 | ingredient matcher | `대파 1단`, `대파`, `파` 후보 mapping과 review |
| W7.4 | Rescue Score | 표시 날짜·개봉·해동·구매일·불확실성 설명 |
| W7.5 | OR-Tools planner | 보유량·조리시간·우선재료·추가 구매 제약 반영 |
| W7.6 | no-solution handling | 계획 불가능 원인과 제외하면 가능한 항목 표시 |
| W7.7 | consume event | 조리 후 사용량 차감과 recipe 연결 |

### WS-8 — 화면·알림·사용자 검증

| ID | 작업 | 완료 조건 |
|---|---|---|
| W8.1 | intake screen | 촬영·업로드·진행률·실패·재촬영 상태 |
| W8.2 | review screen | 모호한 필드만 확인하고 일괄 승인 |
| W8.3 | storage screen | lot별 현재 위치·개봉·이동이 보임 |
| W8.4 | Rescue Queue | 우선순위와 이유·출처·주의 문구 표시 |
| W8.5 | meal plan | 보유 재료와 부족 재료를 함께 표시하고 preview/save/latest 상태를 복원 |
| W8.6 | notification | 라벨 촬영·확인·먼저 사용 task 알림 |
| W8.7 | accessibility | 작은 화면·큰 글씨·색상만 의존하지 않는 상태 |

### WS-9 — 검증·문서·발표

| ID | 작업 | 완료 조건 |
|---|---|---|
| W9.1 | receipt benchmark | train/tune/eval fixture 분리 |
| W9.2 | label benchmark | packaged·produce·no-date·ambiguous fixture 분리 |
| W9.3 | deterministic replay | 같은 입력·규칙·모델 버전의 결과 hash 일치 |
| W9.4 | API tests | receipt state, duplicate, commit, lot split, date precedence |
| W9.5 | runtime test | 모바일 카메라·업로드·review·commit·queue full flow |
| W9.6 | human check | 등록시간·수정 부담·문구 이해·다음 행동 측정 |
| W9.7 | final docs | README·architecture·data contract·OSS·validation 완성 |
| W9.8 | demo package | 3~5분 성공 흐름과 실패 회복 흐름 준비 |

## 6. 학기 일정

| 주차 | 목표 | 절대 통과 조건 |
|---:|---|---|
| 1 | scope, Git, fixture policy, dependency/license | 개인 원본을 Git에 넣지 않음 |
| 2 | Grocy·FastAPI·PostgreSQL·Docker baseline | 각 서비스 healthcheck와 공식 예제 readback |
| 3 | barcode·GS1·product lookup | 일반·가변중량·GS1 fixture 분기 |
| 4 | OCR·영수증 유형·label crop | 샘플 영수증 text/bbox 저장 |
| 5 | 매장 parser·discount·refund | line type 오류가 재고를 만들지 않음 |
| 6 | vertical slice 1 | 영수증 → review → stock lot 1개 완주 |
| 7 | lot·storage event | 부분 이동·개봉·분할 replay 통과 |
| 8 | 날짜 provenance·MFDS API | 표시 날짜와 추정값 분리 |
| 9 | backend AI·structured output | source 없는 날짜를 null/abstain |
| 10 | recipe canonicalization·Rescue Score | 재고 기반 레시피 후보 생성 |
| 11 | OR-Tools planner·notification | 식단과 알림이 확정 lot를 참조 |
| 12 | 통합 QA·benchmark | baseline과 proposed 비교표 완성 |
| 13 | 사용자 테스트·실패 회복 | human evidence와 raw data 저장 |
| 14 | 문서·발표·영상 | 3~5분 demo, 설치·실행 문서 |
| 15 | 최종 회귀·패키지 | 같은 source/build의 최종 evidence 묶음 |

## 7. 역할 분담 기본안

팀원 이름은 확정 후 바꾸고, 역할은 겹치더라도 write owner를 한 명으로 유지합니다.

| 역할 | 주 책임 | 보조 책임 |
|---|---|---|
| Backend/Integration | FastAPI, Grocy adapter, commit coordinator, API tests | Docker, PostgreSQL |
| OCR/Data | PaddleOCR, Docling, receipt parser, label/date parser | fixture annotation, DVC |
| Frontend/Product | camera/upload, review, storage, Rescue Queue | accessibility, human test |
| Planner/QA/Docs | rules, AI schema, ingredient mapping, OR-Tools | benchmark, README, presentation |

2~3명 팀이면 Backend+Planner, OCR+QA, Frontend+Docs로 합칩니다. 팀원별 커밋 수를 균등하게 만드는 것보다 실제 책임과 결과물을 README에 연결하는 것이 중요합니다.

## 8. 게이트와 중단 조건

### Gate A — Intake 가능성

다음이 확인되기 전에는 식단 추천을 확장하지 않습니다.

- 영수증 유형을 grocery와 restaurant로 구분
- 상품 라인과 할인 라인을 분리
- 최소 1개 상품을 review 후 lot으로 반영
- 같은 영수증 중복 입고 차단
- 수량 누락이 무음 자동확정되지 않음

### Gate B — 날짜·보관 안전성

- 표시 날짜와 추정 우선일이 화면에서 구분됨
- 포장일을 소비기한으로 자동 변환하지 않음
- 냉장·냉동·실온 이동 event replay
- partial lot split 후 수량 보존
- 정보가 부족한 고위험 식품은 abstain/review

### Gate C — Planner 가치

- canonical ingredient mapping이 fixture에서 재현됨
- 동일 입력에서 같은 계획 생성
- 계획 불가능한 경우 이유 표시
- recipe 추천이 보유 재료와 수량을 초과하지 않음

### Gate D — 제출 증거

- OSS 원본 예제 재현
- 현재 source와 dependency fingerprint
- Docker 실행
- API/unit/integration test
- 모바일 runtime full flow
- 사람 테스트 raw record
- 발표에서 실제 수치와 미검증 claim 분리

### Pivot 조건

- 영수증 review 시간이 수동 입력보다 긴데 줄일 방법이 없음: 매장 지원 범위 축소
- 한국 상품 조회가 낮음: Open Food Facts를 fallback으로 내리고 local alias 우선
- OCR 날짜 의미가 불안정: 실제 날짜 자동 확정 제거, label capture task로 전환
- Grocy compensation/reconciliation이 재현되지 않음: Rescue DB를 staging truth로 확장하고 Grocy는 명시적 adapter로 격하
- storage event 입력 부담이 큼: 사용자가 자주 변경하는 `현재 위치·개봉`만 MVP에 유지
- recipe ingredient mapping이 불안정: OR-Tools 전 식단 필터와 Rescue Queue만 먼저 완성

## 9. 완료 정의

프로젝트 완료는 앱이 화면에 뜨는 것이 아니라 다음 흐름의 동일 revision 증거가 모두 있을 때입니다.

```text
고정 fixture 영수증
→ OCR/parser output
→ review correction
→ committed receipt
→ StockLot/Grocy mapping
→ storage event replay
→ DateAssertion precedence
→ Rescue Queue
→ recipe plan
→ consume/discard event
```

각 단계에는 source version, model version, rule version, input hash, output hash가 연결되어야 합니다. 실제 음식물 폐기량 감소나 장기 사용률은 별도 연구 범위이며, 학기 프로젝트의 로컬 테스트 결과만으로 주장하지 않습니다.
