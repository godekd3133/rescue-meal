# Rescue Meal 구현 계획

기준일: 2026-09-11
상태: 1차 vertical slice + 운영 경계 고도화 진행 중

## 1. 목표

Rescue Meal은 장을 본 뒤 식재료를 하나씩 입력하는 부담을 줄이고, 영수증·바코드·라벨로 재고 초안을 만든 뒤 사용자가 확인한 정보만 식료품 현황에 반영하는 서비스입니다.

핵심 사용자 결과는 다음 한 줄로 고정합니다.

```text
영수증 한 장
→ 모호한 항목만 확인
→ 상품별 구매 lot 생성
→ 냉장·냉동·실온·개봉 이력 관리
→ 표시 날짜와 추정 소비 우선일 분리
→ 알레르기 회피 조건을 적용한 먼저 사용할 식재료와 식단 제안
```

## 2. 현재 상태와 가정

- 프로젝트 디렉터리: 로컬 수업 작업 폴더의 `rescue-meal`
- GitHub: `godekd3133/rescue-meal`
- 현재 소스: `apps/web` React/Vite 모바일 PWA와 `services/api` FastAPI API, SQLite compatibility store, PostgreSQL normalized projection 구현
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

현재 환경 preflight 결과는 [환경 Preflight](../evidence/environment-preflight-2026-09-01.md)에 기록했습니다. Python 3.12와 `uv`를 우선 사용하며, Docker Desktop daemon이 실행된 뒤에야 Grocy·PostgreSQL baseline을 재현할 수 있습니다. production secret·DB·CORS·provider 설정은 [Production preflight readback](../evidence/production-preflight-readback-2026-09-03.md)의 configuration gate를 먼저 통과해야 합니다.

## 2차 진행 상태

2026-09-03 기준으로 다음 항목은 코드와 테스트가 있습니다.

- FastAPI health/dashboard 및 receipt commit skeleton
- 영수증·라벨 이미지 intake endpoint의 명시적 OCR engine 상태와 모바일 카메라 촬영·사진 보관함 fallback UI
- PaddleOCR optional adapter의 지연 초기화
- Python 3.12 PaddleOCR worker, remote adapter, model version trace
- OCR worker의 liveness(`/health`)·실제 `predict()` warm-up을 포함한 model readiness(`/ready`) 분리, `PP-OCRv5_mobile_det` + 한국어 recognition model·pixel budget preprocessing, thread-safe 단일 초기화, process당 bounded inference slot·queue timeout과 Compose readiness gate
- 영수증 텍스트 parser의 상품·할인·환불·소계·결제 분류
- 라벨 날짜의 소비기한·유통기한·포장일·제조일·불명확 의미 분리
- `parse-text` 기반 review draft fixture와 API 테스트
- PostgreSQL/pgvector 초기 스키마와 Docker Compose baseline
- 일반 GTIN·GS1 AI·가변중량 barcode parser 및 날짜 없는 상품의 abstaining priority inference
- local fixture 우선 상품 resolver 및 Open Food Facts·식품안전나라 C005 feature-flagged adapter, 제품 기준 기간·보관 힌트 provenance·bounded cache
- workspace별 사용자 확인 영수증 상품명 alias projection과 `user_confirmed_alias → local_rule → parser` 매칭 후보 readback
- receipt draft별 I1250 product enrichment job enqueue·retry/dead-letter·workspace lease/heartbeat와 review polling 경계
- 상품명·보관·개봉·첫 개봉일 기반 `estimated_use_first_window`의 provider/version/rule/evidence/reasoning/input hash trace와 normalized readback
- receipt commit coordinator의 rollback·재시도·reconciliation transaction 경계
- signed guest workspace token과 SQLite workspace isolation, auth-required 401 경계
- 회원가입 후 guest workspace transfer preview·명시적 copy·source 보존·target conflict 409·skip/reload 보류 import
- 조리 가능 시간 10·20·30·45분 선택과 planner preview/save 요청 전달
- 식사 인원수 1~4인분 선택과 planner 필요량·allocation·다일 capacity·저장 snapshot 전달; API는 1~8인분을 호환 계약으로 허용
- COOKRCP01 공개 레시피를 review draft와 source/license/revision으로 보존하는 importer 경계와 운영 CLI
- protected recipe review API의 canonical 재료·단위·예상 조리시간·안전 메모·license 승인 gate와 approved catalog planner 연결
- InventoryRepository의 receipt line별 distinct purchase lot·source provenance·partial storage/consume mutation seam과 workspace notification/read-state contract
- `002_inventory_authority.sql`의 workspace-scoped normalized inventory adapter와 `RESCUE_MEAL_INVENTORY_MODE=normalized` 명시적 dual-write/read 경로
- 영수증 review의 raw/canonical 상품명·수량·단위·line별 보관 위치 보정과 `storage_type` 기반 추정 우선순위 전달
- receipt lot 생성 ID와 inventory 저장 키 정합성, invalid-token 401의 CORS header 보장, account session 만료 시 명시적 재로그인 CTA
- 네트워크 오류를 인증 만료와 구분하고, 최신 dashboard를 명시적으로 다시 읽는 오프라인 `다시 연결` CTA
- 영수증 원본 bytes 비저장 정책, 미반영 draft 삭제, commit metadata 비식별화·재고 보존과 계정 화면의 2단계 확인 UX
- workspace별 알림 기간·조용한 시간·Web Push subscription 저장/해지와 service worker 표시 경계
- workspace별 IANA timezone 저장·검증과 앱 알림 날짜/Push quiet-hours 동일 기준 적용
- API `python:3.12-slim` image에 `tzdata` runtime dependency를 명시하고 컨테이너 내부 IANA timezone readback 검증
- 마지막 성공 dashboard의 workspace-scoped read-only offline cache, stale 라벨·동기화 시각·logout cache purge 경계
- workspace data export에서 업무 기록과 secret/raw receipt field를 분리하는 portability 경계
- account password reset의 generic request·30분 one-time token·hash-only persistence·session rotation·reset URL query 제거 경계
- password reset HTTP provider adapter의 HTTPS/loopback URL safety·bounded timeout/attempt/backoff·transient retry·per-token idempotency key 경계; 실제 provider delivery/readback·bounce는 운영 acceptance
- account password change의 account/IP persistent rate limit·`429`·`Retry-After`·identity 비노출 경계
- workspace별 `MealPreferences` 8종 알레르기 회피 조건·중복 정규화·curated recipe metadata filter·unknown metadata abstain·export/guest transfer 연결
- account delete의 현재 비밀번호·`DELETE` confirmation gate·durable `active → deleting → deleted` fence·workspace purge·credential/reset token 삭제·기존 token 401 readback·실패 후 재시도와 일반 요청 `423` 차단
- frontend initial bundle optimization: app-owned motion 제거·CSS animation·DeferredBottomSheet mount 지연으로 500KB advisory 아래 달성; protected mobile barrel dynamic import warning은 운영 gate로 기록
- planner의 실제 allocation lot 날짜 확인 경계: `date_review_required`·표시 날짜 의미 보존·조리 전 확인 안내
- OR-Tools CP-SAT 기반 3일 식단 선택: 기존 deterministic candidate만 대상으로 recipe 중복 금지·lot 원단위 capacity·연속 날짜를 함께 계산하고, solver 불가 시 `deterministic-greedy` fallback과 `optimization_engine` provenance를 반환
- 카메라 프레이밍 가이드와 실제 OCR 입력을 일치시키는 intrinsic pixel crop, 유효하지 않은 layout metric의 전체 frame fallback, 기존 receipt/label handler 재사용
- 홈 Rescue Queue·재고 목록·식품 상세의 날짜 확인 경계: 오늘/지난 표시 날짜·`unknown`·포장일/제조일을 조리 전 확인으로 연결
- 빈 account workspace·빈 보관 위치 필터의 명시적 다음 행동 CTA와 현재 날짜·실제 Rescue Queue 기반 홈 카피
- 재고 dashboard의 server-scoped 상품명·브랜드·카테고리 검색·bounded page·`더 보기`와 데모/오프라인 local fallback 탐색 UX
- connected workspace 홈의 장보기 큐 요약 카드·lazy bottom sheet·조회 실패 재시도·체크/삭제 mutation·직접 장보기 항목 upsert·계정 전환 generation guard를 기존 shopping-list API에 연결; demo에는 서버 상태를 만들지 않음
- 장보기 항목의 구매 수량·보관 위치 확인을 `POST /api/shopping-list/{item_id}/receive`에 연결하고, 기존 lot을 덮어쓰지 않는 새 입고 lot·상품명 기반 소비 우선순위 참고값·recipe source 자동 정리·manual checked history·Idempotency-Key replay를 API와 connected UI에서 검증
- 장보기 입고의 durable `ShoppingListReceiveOperation` ledger를 SQLite/PostgreSQL·export·guest transfer에 연결하고, guest transfer preview/완료 건수와 프론트 보류 import 판정에도 반영하며, lot 삭제 뒤 동일 key 재생성을 `409`로 차단; migration 019과 repository reconstruction으로 재시작 경계를 검증하고, PostgreSQL revision 충돌 뒤 동일 payload replay 및 `1 vs 2` payload conflict 차단을 확인
- PostgreSQL 재고 검색 projection의 `search_text` backfill·`pg_trgm`/workspace-storage index·bounded DB page와 readiness/migration 계약; live `EXPLAIN`·대량 latency·normalized-only write consistency는 운영 gate
- EXIF orientation이 있는 업로드를 quality 측정·OCR 입력 전에 정규화하고 원본 upload hash는 유지하는 이미지 intake 경계
- 영수증 원본 preview와 상품 line별 safe OCR observation ID·정규화 bbox overlay를 연결하고, 라벨 날짜 후보에도 safe source link·bbox preview를 연결하며, normalized projection에 receipt review link를 보존하는 계약; 실제 매장 annotation·label/date pixel 정확도는 운영 gate
- 로컬 PaddleOCR와 원격 OCR worker의 bbox를 API 공통 bottom-left normalized 좌표로 finite/geometry 검증하고 화면 경계에 clip하며, 완전히 보이지 않는 box는 review payload에서 제외하는 계약
- 전자 영수증 PDF의 텍스트 레이어를 `pypdf`로, 스캔 PDF를 제한된 `pypdfium2` page render 후 기존 OCR adapter로 추출해 receipt parser/review draft에 연결하고, PDF 원본 preview·MIME/signature 검증·암호화/render/OCR 실패 경계를 추가함; page-aware PDF bbox/layout/table semantics는 별도 후속 범위
- 영수증 generic text layout에서 상품행 뒤 barcode/매장 code-only row를 최대 2개 건너뛰고 단가·수량·금액행을 연결하며, 괄호 단위와 안전한 `template_id`/confidence를 receipt draft와 review header에 연결함; merchant별 실제 annotation/coverage는 후속 범위
- 영수증 상품행과 이어지는 정상 GTIN만 14자리 값으로 정규화해 receipt line·review 화면·구매 lot에 전달하고, 매장 내부/가변중량 코드는 보류함. review 화면에서 사용자가 선택한 line만 바코드 상품 후보를 조회·적용하며, 후보의 보관 힌트와 provenance는 반영하되 소비기한·`DateAssertion`은 만들지 않음; migration `018_receipt_line_barcode.sql`과 normalized readback으로 확인함
- planner의 `mg↔g↔kg`·`L↔ml`·`ml↔cc` 동일 차원 환산과 한국어/영문 metric 단위 alias 정규화, `quantity_match=exact|converted|incompatible|missing` 근거를 API·식단 UI·조리 완료 사용량에 연결함. `팩↔개`·`모↔개`처럼 포장 의미가 다른 단위는 환산하지 않고 `단위 확인 필요`로 보류하며, 기존 JSON meal-plan snapshot과 호환되는 additive response field로 유지함
- `RuntimeErrorBoundary`의 privacy-safe client error report와 FastAPI `/api/client-errors` structured grouping·secure-mode rate limit을 연결함; 외부 telemetry collector·source map scrub·retention/alert는 운영 gate
- 바코드·영수증 상품 후보의 `ProductProvenance` current snapshot과 applied/replaced/removed before/after audit, source removal UI, SQLite/PostgreSQL persistence, export·guest transfer, stale candidate 제거를 연결함. 식품 상세의 상품명·브랜드·분류 직접 수정, 기존 source 제거, 수량·보관·DateAssertion 보존, `FoodProductInfoAuditEvent` history와 migration 016도 연결함; 실제 provider 운영 최신성·retention·backup/restore는 운영 gate
- 라벨 OCR의 `storage_hint`·보관조건 문구를 `DateAssertion`에 보존하고, 실제 lot 보관 위치와 다를 때 날짜를 자동 변경하지 않는 상세 경고·`storage_mismatch` 알림·실제 recipe allocation의 조리 전 날짜 확인·SQLite/normalized PostgreSQL persistence·migration 017을 연결함; 실제 온도·포장 상태·관할별 보관 문구 해석은 운영 gate
- PostgreSQL migration runner에 `rescue_schema_migrations` ledger·파일 checksum drift guard·재실행 skip을 추가하고 disposable PostgreSQL에서 최초 apply/재실행/drift 차단을 검증함; 운영 cutover·backup/retention은 별도 gate
- production preflight에 API process 수·reserved headroom·실제 PostgreSQL `max_connections`를 명시하는 aggregate connection budget을 추가하고 `process × (2 base/auth + pool max) + reserved <= max_connections` 초과를 fail-closed로 차단함; CI disposable PostgreSQL의 `SHOW max_connections` readback까지 연결했지만 managed failover·network partition은 별도 gate
- base snapshot·shared product/name cache·recipe catalog·auth가 사용하는 direct PostgreSQL owner를 reconnectable adapter로 감싸고, query/commit 자동 replay 없이 다음 요청에서 bounded reconnect하는 503 경계를 추가함; 실제 backend termination 뒤 readiness·auth/read·recovery write·scoped cleanup smoke와 CI를 연결했지만 managed failover·network partition은 별도 gate
- 같은 workspace receipt fingerprint의 pending draft를 process lock·PostgreSQL revision으로 수렴시키고, 기존 draft replay header·full-input fingerprint·legacy compatibility·flush failure phantom rollback을 연결함; 두 API process의 동시 request에서 `201 initial + 201 replay`, compatibility/normalized receipt 1개 readback을 확인했지만 의미적 영수증 동일성 판단은 하지 않음
- 식단 저장·조리 완료에 plan/bundle별 process lock과 PostgreSQL revision winner replay를 연결하고, 두 API process의 `completed + already_completed` completion race에서 plan·saved/completed audit·compatibility/normalized consumed event 중복을 차단함; 실제 Grocy 외부 보상과 managed failover는 별도 gate
- 기본 Playwright fixture/mobile runtime lane에서 API connected spec을 명시적으로 제외하고, connected config를 분리해 fixture/mobile **35 passed + 2 skipped**와 connected **69 passed**를 각각 재현함; CI web job에도 Chromium 설치와 runtime test를 추가했지만 실기기 camera·PWA 설치는 별도 acceptance
- CI web job이 demo build와 별도로 HTTPS API placeholder를 주입한 production build를 수행해 frontend fail-closed configuration path도 release 전에 컴파일·패키징 검증함; 실제 API/TLS/CORS 도달성은 staging acceptance

실제 PaddleOCR worker와 첨부 이미지 benchmark는 완료했지만, 운영용 품질 gate·annotation·모든 매장 template은 아직 검증 전입니다. ZXing Browser camera adapter·권한 실패 fallback·guest workspace isolation·email/password account register/login/password change/password reset core는 구현했고, 날짜·추정 우선순위·Grocy 확인 필요 작업을 현재 workspace에서 계산하는 in-app notification center와 읽음 상태 persistence도 추가했습니다. PostgreSQL API projection의 tenant-aware connection/read/write·account/revoke adapter와 Grocy HTTP adapter·상품/단위·보관 위치 mapping-aware receipt/storage-event outbox, account 설정 화면, 상품 mapping before→after audit, dead-letter 수동 재시도·stale in-flight reconciliation·API-mediated background worker tick도 추가했습니다. product enrichment는 receipt draft와 분리된 I1250 job·review polling·workspace refresh·PostgreSQL row-lock lease·disabled queue observability까지 연결했습니다. 소비·폐기·개봉은 `consume/open`, 이동·냉동·해동은 location mapping 기반 `transfer`로 별도 처리하며, 모든 외부 write는 transaction ID readback과 retry/dead-letter/reconciliation으로 추적합니다. receipt review는 상품명·수량·단위·보관 위치를 사용자 확인값으로 커밋하고, `ambient`·`refrigerated`·`frozen`에 따른 추정 우선순위 범위를 분리합니다. account 401은 CORS가 보장된 typed error로 전달해 workspace를 조용히 바꾸지 않고 재로그인을 요구합니다. disposable PostgreSQL normalized migration·partial-open write/read·restart 복원과 disposable Grocy 4.7.0 add/open/consume/transfer·transaction ID/location readback은 확인했지만, 운영 PostgreSQL/Grocy backup/restore·key rotation·crash recovery·undo, 실제 다중 worker 경쟁, GS1 camera path, 관할 출처가 승인된 운영용 rule snapshot은 아직 검증 전입니다. OAuth·실제 password-reset email delivery·Web Push/ntfy 전달은 아직 운영 검증 전입니다. 세부 evidence는 [1차 구현 상태](build-status-2026-09-01.md), [OCR intake pipeline](ocr-pipeline.md), [PaddleOCR benchmark](../evidence/paddleocr-benchmark-2026-09-01.md), [live OCR API readback](../evidence/live-ocr-api-readback-2026-09-03.md), [barcode camera flow](barcode-camera.md), [guest workspace](auth-workspace.md), [receipt review readback](../evidence/receipt-review-readback-2026-09-02.md), [product enrichment readback](../evidence/product-enrichment-readback-2026-09-03.md), [auth session readback](../evidence/auth-session-readback-2026-09-02.md), [PostgreSQL tenant contract](../evidence/postgres-tenant-contract-2026-09-01.md), [Grocy adapter contract](../evidence/grocy-adapter-contract-2026-09-02.md), [live Grocy sync readback](../evidence/live-grocy-sync-readback-2026-09-04.md), [Grocy mapping audit readback](../evidence/grocy-mapping-audit-readback-2026-09-02.md), [notification readback](../evidence/notification-readback-2026-09-02.md)을 기준으로 합니다.

회원가입 직후에는 guest 기록을 preview하고 사용자가 승인한 경우에만 account workspace로 복사합니다. 원본 guest workspace는 삭제하지 않으며, 건너뛴 transfer는 같은 account workspace로 재진입했을 때만 다시 확인합니다. 자세한 계약과 readback은 [guest account transfer readback](../evidence/guest-account-transfer-readback-2026-09-03.md)을 기준으로 합니다.

계정 password reset core와 bounded provider adapter의 API·repository·브라우저·unit 검증은 [account password recovery](account-recovery.md)와 [account recovery readback](../evidence/account-recovery-readback-2026-09-02.md)을 기준으로 합니다. 실제 메일 provider 전달·idempotency 동작·bounce·abuse 방어·OAuth는 운영 전 별도 acceptance lane입니다.

계정 전체 삭제의 비밀번호·확인 문구·workspace purge·credential 삭제 경계는 [계정·workspace 삭제 설계](account-deletion.md)와 [account deletion readback](../evidence/account-deletion-readback-2026-09-03.md)을 기준으로 합니다. durable fence·실패 후 재시도·두 process의 `423` 차단과 purge readback은 [PostgreSQL multi-process account deletion readback](../evidence/postgres-account-deletion-multiprocess-readback-2026-09-06.md)에서 확인했으며, auth/workspace 분산 transaction을 주장하지 않습니다. backup/WAL/object storage/Grocy 보존과 운영 보상 workflow는 별도 acceptance lane입니다.

레시피 영역은 2026-09-01~02에 fixture 기반 `preview → 시간 선택 → save → latest → 사용량 확인 → complete` vertical slice까지 구현했고, 이번 단계에서 팀 작성 starter fixture를 53개로 확장했습니다. planner v2는 curated alias와 필요 단위·수량을 검증하고, 같은 재료의 여러 lot를 allocation으로 분배하며, 사용자가 완료 직전 lot별 사용량을 조정할 수 있습니다. 조리 가능 시간은 10·20·30·45분 중 하나를 선택하고 `max_minutes`로 preview/save 요청에 전달하며, 최신 저장 계획을 복원할 때도 시간 제한을 비교합니다. 조리 완료 뒤에는 matched lot에만 `meal_plan_id`가 연결된 소비 event를 남깁니다. 미리보기는 저장하지 않고, 저장 버튼을 눌렀을 때만 SQLite/PostgreSQL API projection에 workspace별 계획을 남깁니다. 현재는 starter catalog 53개·recipe alternatives·이전 날짜 allocation을 차감하는 workspace timezone 기준 3일 preview·bundle 저장/최신 복원/history·날짜별 선택·workspace별 `MealPreferences` 8종 회피 조건·curated metadata filter·unknown recipe abstain·동일 물리 차원 metric 단위 환산과 `quantity_match` 근거 표시까지 구현했으며, 외부 allergen metadata/교차 접촉 semantics·canonical product ID와 검토된 포장 단위 매핑·영양/예산 최적화·bundle 하위 plan 일괄 완료는 다음 단계에서 다듬습니다. 세부 계약과 readback은 [재고 기반 레시피 플래너](recipe-planner.md), [식단 조건과 알레르기 회피 설계](meal-preferences.md), [recipe catalog expansion readback](../evidence/recipe-catalog-expansion-readback-2026-09-03.md), [recipe alternatives readback](../evidence/recipe-alternatives-readback-2026-09-03.md), [multi-day meal preview readback](../evidence/multi-day-meal-preview-readback-2026-09-03.md), [multi-day meal bundle readback](../evidence/multi-day-meal-bundle-readback-2026-09-03.md), [planner v2·조리 완료 readback](../evidence/recipe-planner-completion-readback-2026-09-02.md)을 기준으로 합니다.

COOKRCP01 레시피는 `recipe_admin` account로 `import → shared pending draft 저장 → canonical 재료·단위·예상 조리시간·안전 메모·license 검토 → approve`하는 별도 vertical slice를 추가했습니다. `approved` draft만 shared `recipe_catalog` source의 `RecipeSpec`으로 모든 user planner에 합쳐지고, `pending`·`rejected`는 사용자 추천에서 제외됩니다. account `ra1` role token, actor audit event, SQLite/PostgreSQL shared catalog projection, opt-in review 화면, draft 단위 explicit claim/release와 만료 claim recovery, reviewer/publisher capability 분리까지 구현했으며, 팀/프로젝트 단위 RBAC·OAuth·audit 보존정책은 다음 상용화 단계입니다. 세부 계약은 [공개 레시피 importer 운영 경계](recipe-importer.md), [COOKRCP importer readback](../evidence/recipe-importer-readback-2026-09-02.md), [recipe review readback](../evidence/recipe-review-readback-2026-09-02.md)을 기준으로 합니다.

다일 planner의 현재 선택 경계는 기존 deterministic `plan_recipe` candidate를
OR-Tools CP-SAT로 조합하는 방식입니다. 최대 3일의 연속 날짜·recipe 중복 금지·각
lot의 원래 단위 capacity를 함께 제약하고, servings가 있으면 모든 candidate의
필요량과 capacity를 인원수 기준으로 계산합니다. solver가 불가하면
`deterministic-greedy` fallback과 `optimization_engine` provenance를 반환합니다.
영양·예산·검토된 포장 단위는 다음 확장 범위이며, 이 모듈은 소비기한이나 섭취
가능 여부를 판정하지 않습니다.

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
- 한국 레시피 fixture 53개
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
  ├ PaddleOCR / pypdf / Docling adapter
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
| Notifications | 사용자가 해야 할 다음 행동 | workspace in-app notification·선호 설정·Web Push subscription·VAPID delivery worker, 이후 live push acceptance/ntfy 검토 |

## 5. 작업 스트림

### WS-0 — 범위·저장소·데이터 보호

| ID | 작업 | 완료 조건 |
|---|---|---|
| W0.1 | Git 저장소 초기화와 기본 branch 결정 | `git status`와 README에 현재 revision 기록 |
| W0.2 | 디렉터리 구조 생성 | `apps/web`, `services/api`, `services/worker`, `data/fixtures`, `docs`, `evidence` 경계 존재 |
| W0.3 | dependency/license manifest | 코드·모델·공공 데이터·API 이용조건을 표로 기록 |
| W0.4 | 개인정보 정책·receipt metadata 수명주기 | 원본 bytes 비저장, 미반영 draft 삭제, commit metadata 비식별화·재고 보존 경계와 운영 미완료 범위 명시 |
| W0.5 | fixture 취급 규칙 | 개인 결제정보 없는 fixture와 원본 hash만 Git에 저장 |

### WS-1 — OSS baseline과 실행환경

| ID | 작업 | 완료 조건 |
|---|---|---|
| W1.1 | Grocy 공식 이미지·고정 버전 실행 | 상품·재고·best-before·consume·spoiled·recipe API readback |
| W1.2 | FastAPI skeleton | `/health`, OpenAPI, pytest smoke |
| W1.3 | PostgreSQL + pgvector | embedding column과 cosine nearest-neighbor sample |
| W1.4 | Docker Compose | web·api·worker·db·Grocy healthcheck와 한 명령 실행 |
| W1.5 | structured logging | X-Request-ID와 secret-safe JSON access log, `/ready` readiness |

### WS-2 — 바코드·제품 조회

| ID | 작업 | 완료 조건 |
|---|---|---|
| W2.1 | ZXing Browser camera adapter | camera UI·권한 실패 fallback 구현, 실기기·fixture readback 대기 |
| W2.2 | GS1 Syntax Engine adapter | AI 11/13/15/16/17 fixture를 DateAssertion 후보로 변환 |
| W2.3 | 가변중량 바코드 분기 | `2` 또는 restricted circulation 후보를 글로벌 GTIN과 분리 |
| W2.4 | Open Food Facts adapter | product lookup success/failure/partial을 모두 저장 |
| W2.5 | 식품안전나라 I1250 adapter | 제품명·제조사·품목유형·`POG_DAYCNT` review endpoint와 mock readback 완료; receipt 비동기 enrichment worker 연결 및 I1250 miss 뒤 Open Food Facts name-search fallback 완료, live key/coverage·검색 quota는 미검증 |
| W2.6 | legacy C005 adapter | 결과에 freshness 경고를 붙이고 primary source로 사용하지 않음; mock response·`POG_DAYCNT`·provider status readback 완료, live key/coverage는 미검증 |

### WS-3 — 영수증·라벨 OCR

| ID | 작업 | 완료 조건 |
|---|---|---|
| W3.1 | 이미지 품질 gate | 잘림·흐림·과노출·기울기 상태와 재촬영 메시지 |
| W3.2 | 영수증 유형 classifier | grocery·retail beverage·restaurant·unknown 분류 |
| W3.3 | PaddleOCR adapter | text, bbox, confidence, model version 저장 |
| W3.4 | 전자 영수증 PDF text/render adapter | `pypdf` text-layer와 최대 3쪽 `pypdfium2` PNG render를 기존 line parser/review draft와 OCR adapter에 연결; page-aware bbox/layout semantics는 후속 |
| W3.5 | store template parser | 2~3개 국내 매장의 header/line/discount 구조화 |
| W3.6 | line type parser | product·discount·refund·subtotal·payment·unknown 구분 |
| W3.7 | label parser | 소비기한·포장일·제조일·중량·원재료 문맥 후보 추출 |
| W3.8 | review UI payload | `getUserMedia` 카메라 surface·프레이밍 가이드와 guide 안쪽 intrinsic crop·사진 보관함 fallback, OCR 재촬영 경로, 업로드 원본 대조 preview와 상품 line·라벨 날짜 후보 safe observation ID·bbox 강조 overlay, 모호한 날짜의 명시적 의미/보관 위치 선택 gate와 날짜 없는 면의 직접 입력 fallback, 중단된 `review_required` receipt draft의 홈 카드·metadata-only 재개 흐름 완료; 실제 매장 annotation 위치 정확도·원근/반사·label/date pixel acceptance는 후속 검증 |

### WS-4 — 상품 매칭과 영수증 commit

| ID | 작업 | 완료 조건 |
|---|---|---|
| W4.1 | ProductAlias 모델 | workspace별 raw name key·canonical·source·confidence·use count 저장; SQLite/PostgreSQL projection readback 완료 |
| W4.2 | 매칭 waterfall | `user_confirmed_alias → local_rule → parser` 후보·source·provenance readback 완료; I1250 제품명 review와 receipt 비동기 enrichment 연결, I1250 miss 뒤 Open Food Facts legacy name-search fallback·source provenance·review gate 완료 |
| W4.3 | 매칭 후보 UI | barcode 후보와 영수증 line의 source/candidate 표시; 실제 매장 coverage benchmark 대기 |
| W4.4 | duplicate fingerprint | 동일 영수증 재처리와 crop 재업로드 방지 fixture |
| W4.5 | commit coordinator | review 완료 전 stock 생성 금지 |
| W4.6a | receipt commit concurrency | 같은 receipt ID의 동시 commit은 프로세스 내 lock과 workspace revision으로 한 번만 lot를 만들고 두 번째 요청은 `409`로 종료; active request 종료 뒤 weak lock registry 회수와 deterministic concurrency readback 완료 |
| W4.6b | receipt commit transport idempotency | `Idempotency-Key`·payload fingerprint·transaction 결과 lot 목록을 compatibility/normalized projection에 보존하고, 같은 key/payload network retry는 기존 결과를 replay, 다른 payload는 `409`; migration 020·pending crash recovery·frontend retry header readback과 `postgres-live` process restart/replay/conflict smoke 연결 완료 |
| W4.6 | retry/compensation | local commit·storage event와 Grocy outbox 분리, 상품/단위/location mapping gap·retry·dead-letter contract; live undo/reconciliation 대기 |
| W4.7 | commit readback | local lot·Grocy outbox·mapping/readback contract; 실제 Grocy StockLot ID readback 대기 |
| W4.8 | 비동기 product enrichment | receipt draft와 I1250/Open Food Facts 조회 분리, enqueue·workspace refresh·row-lock lease·retry/dead-letter·heartbeat·review polling 구현; barcode와 product-name provider의 PostgreSQL shared cache·provider별 rate-limit·single-flight cross-connection readback은 완료, 실제 MFDS/OFF key·coverage·backup/restore/failover·다중 process 전체 acceptance는 후속 |

### WS-5 — lot·보관·날짜 provenance

| ID | 작업 | 완료 조건 |
|---|---|---|
| W5.1 | StockLot 연결 | 영수증 line 하나가 구매 lot을 생성 |
| W5.2 | DateAssertion 연결 | 날짜 종류·출처·bbox·rule version·사용자 확인·표시 날짜 보관조건 저장 |
| W5.3 | StorageLocation | ambient·refrigerated·frozen·custom 지원 |
| W5.4 | StorageEvent | moved·opened·frozen·thawed·split·consumed·discarded replay 및 최초 `opened_at` 보존 |
| W5.5 | partial split | 4팩 중 2팩 이동 시 부모·child lot과 수량 보존 |
| W5.6 | date precedence | 라벨 표시 날짜가 추정값에 의해 덮어써지지 않음 |
| W5.7 | mismatch warning | 라벨 보관조건과 실제 위치가 다를 때 날짜를 바꾸지 않고 상세 경고; API·SQLite·normalized PostgreSQL·connected UI 검증 |

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
| W7.1 | recipe fixture | Grocy recipe 53개와 canonical ingredient ID |
| W7.2 | COOKRCP01 importer | 공식 response adapter, bad row 격리, review draft CLI, 출처·수집일 기록 |
| W7.3 | ingredient matcher | protected review API에서 canonical name·단위·수량을 승인하고 approved recipe만 planner에 연결 |
| W7.4 | Rescue Score | 표시 날짜·개봉·해동·구매일·불확실성 설명 |
| W7.5 | OR-Tools planner | 기존 planner candidate를 대상으로 보유 lot capacity·조리시간·recipe 중복·우선재료를 반영한 3일 선택; 추가 구매는 장보기 목록으로 분리 |
| W7.6 | no-solution handling | 계획 불가능 원인과 제외하면 가능한 항목 표시 |
| W7.7 | consume event | 조리 후 사용량 차감과 recipe 연결 |
| W7.8 | quantity contract | 동일 물리 차원 metric만 환산하고 `quantity_match` 근거를 preview·UI·조리 완료에 전달; 포장 단위 불일치는 자동 추정하지 않음 |

### WS-8 — 화면·알림·사용자 검증

| ID | 작업 | 완료 조건 |
|---|---|---|
| W8.1 | intake screen | 촬영·업로드·진행률·실패·재촬영 상태 |
| W8.2 | review screen | 모호한 필드만 확인하고 일괄 승인 |
| W8.3 | storage screen | lot별 현재 위치·개봉·이동이 보임 |
| W8.4 | Rescue Queue | 우선순위와 이유·출처·주의 문구 표시 |
| W8.5 | meal plan | 보유 재료와 부족 재료를 함께 표시하고 preview/save/latest 상태를 복원 |
| W8.6 | notification | 라벨 촬영·확인·먼저 사용 task 알림, 읽었거나 대상에서 사라진 pending delivery의 `cancelled` 처리 |
| W8.7 | accessibility | 작은 화면·큰 글씨·색상만 의존하지 않는 상태, named dialog semantics·Escape 종료·원래 트리거 포커스 복귀 |

### WS-9 — 검증·문서·발표

| ID | 작업 | 완료 조건 |
|---|---|---|
| W9.1 | receipt benchmark | train/tune/eval fixture 분리 |
| W9.2 | label benchmark | packaged·produce·no-date·ambiguous fixture 분리; 비식별화된 produce ambiguous-date·packaged no-date fixture과 parser 회귀 추가, 실제 이미지 annotation은 후속 |
| W9.3 | deterministic replay | 같은 입력·규칙·모델 버전의 결과 hash 일치 |
| W9.4 | API tests | receipt state, duplicate, commit, lot split, date precedence |
| W9.5 | runtime test | 모바일 카메라·업로드·review·commit·queue full flow |
| W9.6 | human check | 등록시간·수정 부담·문구 이해·다음 행동 측정 |
| W9.7 | final docs | README·architecture·data contract·OSS·validation 완성 |
| W9.8 | demo package | 3~5분 성공 흐름과 실패 회복 흐름 준비 |
| W9.9 | PostgreSQL backup/restore runbook | custom archive·mode 600·client/server major guard·빈 DB 원자적 restore·normalized schema/lot/date-storage readback; object storage encryption·retention·scheduler는 운영 acceptance |
| W9.10 | PostgreSQL concurrency smoke | 실제 두 connection의 동시 full-snapshot flush에서 1 commit·1 stale conflict·1 lot readback·workspace cleanup; pool/failover/network partition은 운영 acceptance |
| W9.11 | PostgreSQL account auth/read transaction smoke | 실제 normalized DB에서 register·inventory persistence·API restart/login·session rotation·account purge와 `pg_stat_activity`의 idle transaction cleanup; OAuth/email/shared pool/failover는 운영 acceptance |
| W9.12 | PostgreSQL workspace connection lifecycle | request/worker lease·유휴 snapshot LRU close·eviction 후 재오픈 persistence·FastAPI lifespan shutdown close를 disposable PostgreSQL에서 검증 |
| W9.13 | PostgreSQL operation pool smoke | `PostgresOperationPool`의 per-process `max_size`·checkout timeout·same-connection full-snapshot persistence/reopen·idle transaction cleanup·shutdown close를 disposable PostgreSQL에서 검증; shared owner 통합·multi-process aggregate sizing·failover는 운영 acceptance |
| W9.14 | PostgreSQL migration ledger/drift guard | `rescue_schema_migrations`에 ordered migration checksum 기록·일치 migration skip·drift 사전 차단을 disposable PostgreSQL에서 검증 |
| W9.15 | PostgreSQL aggregate connection budget | production preflight의 process·reserved·max 설정과 `P × (2 + pool max) + R <= max_connections` 검사를 추가하고 CI live `SHOW max_connections` readback |
| W9.16 | camera crop input | visible guide와 `object-fit: cover` intrinsic crop 계산, 전체 frame fallback, mock browser readback; perspective·reflective·실기기 acceptance는 후속 |
| W9.17 | quality-adaptive OCR input | 저대비·저조도에만 dimension-preserving contrast profile 적용·응답 provenance 기록·blur/perspective 자동 warp 금지·source 대비 annotation benchmark 분리 |
| W9.18 | local AI inference provider | 결정적 rule 기본값·Ollama structured-output fallback·Pydantic schema 재검증·bounded timeout/response·abstain·review-only provenance·모델 장애 mutation 분리 |
| W9.19 | multi-day optimizer readback | OR-Tools CP-SAT와 deterministic fallback의 candidate·recipe 중복·lot capacity·API provenance·connected UI 회귀 검증 |
| W9.20 | password reset provider adapter | HTTPS URL safety·bounded timeout/retry·per-token idempotency key·permanent 4xx stop과 API/preflight 회귀; 실제 provider sandbox delivery/bounce는 운영 acceptance |
| W9.21 | home shopping queue UX | connected 홈 카드에서 기존 shopping-list를 발견하고, 목록 sheet의 GET·retry·check·delete·manual item upsert·구매 수량/보관 위치 확인·새 inventory lot 반영·recipe source 정리·Idempotency-Key replay와 workspace 전환 stale-response guard를 connected E2E로 검증; 주문·결제는 범위 밖 |
| W9.22 | durable receive idempotency | 장보기 입고 operation ledger를 SQLite/PostgreSQL compatibility projection에 저장하고, lot 삭제 뒤 재시도 409·request fingerprint conflict·동시 revision 충돌 후 동일 payload replay·export/guest transfer·migration 019·repository reconstruction을 검증; 원본 key는 저장하지 않음 |
| W9.23 | multi-process receive smoke | 실제 PostgreSQL을 공유하는 두 개의 단일 worker API process가 같은 workspace에서 동일 `Idempotency-Key`를 동시에 처리할 때 `201 initial + 201 replay`·단일 lot을 보장하고, 같은 key의 `1 vs 2` 수량 conflict는 `201 + 409`로 차단하며, lot 소비·두 process 종료·재시작 뒤 동일 key가 lot을 재생성하지 않고 `409`가 되는 흐름을 CI/live smoke로 검증; 독립 item 5라운드 bounded stress·6개 operation ledger readback·revision-lock crash-before-commit 및 post-commit response-window recovery를 추가 확인 |
| W9.24 | bottom-sheet accessibility readback | controlled sheet가 Radix named dialog role/title/description을 유지하고 `Escape`로 닫히며, exit animation 이후 원래 trigger로 포커스를 복귀하는 fixture·mobile runtime·connected E2E를 검증; 실기기 VoiceOver/TalkBack·Dynamic Type는 별도 acceptance |
| W9.25 | PWA update/offline contract | navigation network-first·정적 asset stale-while-revalidate·API/write bypass·old cache purge·사용자 승인 `SKIP_WAITING`과 offline shell fallback을 service worker contract test와 production build에서 검증; 실제 OS 설치·배포 간 controllerchange는 실기기/운영 acceptance |
| W9.26 | workspace read/write coordinator | dashboard·알림·장보기·재고 검색·receipt summary와 계정 설정 read/export가 opaque workspace key·workspace/channel ticket과 실행별 `AbortSignal`을 공유하고, workspace 전환·provider failure·동일 channel 경쟁의 stale response와 이전 fetch를 Coordinator contract·account panel remount로 차단; 성공한 mutation은 `BroadcastChannel`/`localStorage` Adapter를 통해 같은 workspace의 다른 탭을 invalidate하고, PostgreSQL은 `If-Rescue-Meal-Revision` 선행조건과 `X-Rescue-Meal-Workspace-Revision` 응답으로 stale write를 구조화된 `409`에 멈춤; Coordinator 8개 contract·revision propagation connected E2E·API 회귀와 notification cancellation reason Prometheus endpoint로 검증; 자동 merge·multi-replica collector/alert·운영 failover는 acceptance |
| W9.27 | unified runtime observability scrape | API request route/status/latency를 bounded process-local metrics로 기록하고, 기존 product·notification metrics와 token-protected `/api/internal/metrics`에서 합쳐 제공; 표준 Bearer secret·production preflight·query/token/identity 비노출 회귀를 연결하고, 실제 collector retention·multi-replica aggregation·alert 발화는 운영 acceptance |
| W9.28 | resumable account deletion fence | auth row를 `active → deleting`으로 원자적으로 고정한 뒤 workspace write guard와 `423` middleware로 일반 접근을 차단하고, purge·credential 삭제 실패 또는 process 재시작 뒤 같은 session의 delete 요청이 재개되도록 구현; SQLite restart·API failure-injection·schema/readiness 계약과 disposable PostgreSQL 두 process fence/purge/기존 token 차단을 검증하고, revision lock 중 API process SIGKILL 뒤 rollback·durable fence·재시작 후 delete resume·scoped rows 0까지 readback했으며 managed backup/WAL/object storage/Grocy 삭제와 운영 보상 workflow는 운영 acceptance |
| W9.29 | PostgreSQL direct owner recovery | base/auth/shared product·recipe direct connection을 reconnectable adapter로 감싸고 connection 수립만 bounded retry, query/fetch/commit replay 금지, 안전한 typed `503`·`Retry-After` 응답을 연결; disposable PostgreSQL에서 application-name backend 4개 termination 뒤 readiness/auth/read/recovery write/scoped cleanup smoke와 API 회귀 완료, managed failover·network partition은 운영 acceptance |
| W9.30 | browser test lane isolation | fixture-only `test:runtime`에서 connected API spec을 제외하고 별도 connected config에서만 실행하도록 Playwright lane을 분리; fixture/mobile `35 passed + 2 skipped`, connected `69 passed`와 CI Chromium/runtime step을 확인했으며 실기기 acceptance는 후속 |
| W9.31 | receipt draft idempotency | 동일 workspace receipt fingerprint의 pending draft를 lock/revision 경계에서 재사용하고 `X-Idempotency-Replayed`를 반환; flush failure phantom rollback·기존 commit `409`·review 전 StockLot 미생성을 API 회귀로 검증하며 receipt image/PDF 원본은 저장하지 않음 |
| W9.32 | meal-plan save/complete race | plan/bundle별 lock과 cross-process revision replay로 동일 plan 저장을 1개로 수렴하고, 완료 경쟁을 `completed + already_completed`로 처리하며 compatibility/normalized consumed event 각 3개·saved/completed audit 각 1개를 실제 PostgreSQL에서 readback; 공통 snapshot의 plan/shopping rollback과 save phantom failure fixture도 검증 |
| W9.33 | manual lot/correction boundary | `lot_action=create|correct`를 명시하고 같은 상품명 직접 입력은 새 lot으로 보존하며, 라벨·GS1 보정은 사용자가 선택한 `target_food_id` 또는 legacy 단일 후보만 허용; 다중 lot picker·trusted date overwrite 차단·date history/product-info audit·수량/구매 provenance 보존·저장 실패 phantom rollback을 API·연결 UI·disposable PostgreSQL two-process smoke에서 검증 |
| W9.34 | manual command idempotency | `Idempotency-Key` 원문 비저장·digest/request fingerprint ledger를 SQLite/PostgreSQL/export/guest transfer에 보존하고, 같은 key replay·payload conflict·소비 후 재생성 차단·cross-process replay를 API·실제 PostgreSQL smoke와 frontend retry에서 검증 |
| W9.35 | mutation failure recovery action | 수동 식품·날짜 확인 반영의 일시적 서버 실패에서 동일 command payload/key를 유지한 `다시 시도` action과 날짜 assertion snapshot rollback을 적용하고, 인증 만료·lot 선택 충돌·확인 날짜 충돌에는 무의미한 retry를 노출하지 않도록 connected/API 회귀로 검증 |
| W9.36 | PostgreSQL schema capability gate | readiness가 workspace store의 전체 compatibility projection table·핵심 column/index를 fail-closed로 확인하고, API·shared cache/catalog/auth의 runtime DDL을 opt-in으로 제한하며, `migrate.sh --apply`가 단일 locked psycopg session에서 migration body와 ledger row를 원자적으로 처리하도록 구현; 동시 runner·실제 managed DB는 별도 acceptance |
| W9.37 | access-log route privacy | JSON access log가 raw URL path 대신 FastAPI route template만 기록하고, query/resource value는 `__unmatched__`로 축약하도록 middleware·observability contract와 API 회귀를 연결; 실제 log shipper/collector retention은 운영 acceptance |
| W9.38 | authentication helper retention | token TTL+grace로 expired password-reset token/revoked hash만 SQLite/PostgreSQL에서 정리하고, startup/maintenance script·raw token 비노출·업무 audit 비대상 경계를 API/실제 DB fixture로 검증; legal retention과 외부 backup은 운영 acceptance |
| W9.39 | WorkspaceMutation recovery seam | snapshot에 포함된 날짜 assertion·상품 provenance mutation을 공통 Module로 감싸 regular failure rollback·concurrency stale snapshot 보호·typed persistence error를 API/unit 회귀로 검증; notification/shopping/recipe/Grocy 전체 적용은 상태 snapshot 계약 후속 |
| W9.40 | shopping mutation recovery UX | shopping list check/delete를 WorkspaceMutation으로 감싸 regular failure rollback·typed persistence error를 연결하고, 열린 sheet overlay에 가려지지 않는 inline retry action과 connected E2E를 검증; notification/push/worker/recipe/Grocy 전체 적용은 후속 |
| W9.41 | recipe review ownership | shared recipe pending draft에 explicit claim/release·bounded lease·expired claim recovery를 연결하고 non-owner write를 typed 409로 차단; `claimed`/`released` audit·SQLite/PostgreSQL payload reconstruction·connected claim→approve를 검증하며 팀/프로젝트 RBAC는 운영 acceptance |
| W9.42 | recipe review capability RBAC | `recipe_admin`의 review와 publisher decision을 optional server-side email allowlist로 분리하고 capabilities endpoint·reviewer-only UI·publish 403·publisher approve를 API/connected 회귀로 검증; 조직 hierarchy·legacy token removal은 운영 acceptance |
| W9.43 | production legacy-token gate | shared recipe review token을 production preflight·`/ready`·runtime에서 fail-closed로 차단하고 token 원문 비노출·개별 account 유도·preflight/API 회귀를 검증; 실제 secret manager/배포 pipeline 적용은 운영 acceptance |
| W9.44 | recipe publisher allowlist preflight | publisher/admin email allowlist 형식과 publisher⊆admin 관계를 production preflight에서 검증하고 publisher-only/외부 publisher 설정을 fail-closed로 차단; 실제 조직 directory sync는 운영 acceptance |
| W9.45 | CI production preflight gate | checked-in API workflow가 sanitized valid publisher profile과 invalid publisher negative case를 preflight CLI로 실행하도록 연결하고 email value non-disclosure·workflow YAML·contract assertion을 검증; 실제 GitHub Actions 성공은 운영 acceptance |
| W9.46 | recipe review assignment queue | pending draft 목록에 `all|mine|unassigned` actor 필터를 연결하고 expired claim을 회수 가능한 unassigned로 노출; API query·connected filter navigation·claim/revision contract를 검증하며 실시간 multi-admin invalidation은 운영 acceptance |
| W9.47 | recipe review realtime invalidation | shared `recipe-catalog` key·`recipe-review` channel로 cross-tab mutation을 전달하고, 열린 editor를 덮어쓰지 않은 채 현재 queue만 재조회; BroadcastChannel/localStorage contract·remote editor preservation·full connected 회귀를 검증하며 server push는 운영 acceptance |
| W9.48 | recipe review cross-device revision probe | payload 없는 catalog revision endpoint와 tab visibility/30초 bounded probe를 연결하고 revision 변경 시에만 queue를 재조회; selected editor stale lock·explicit reload·probe failure queue preservation을 connected/API 회귀로 검증하며 server push는 운영 acceptance |
| W9.49 | durable read snapshot | SQLite/PostgreSQL workspace projection reload를 copy-on-write state reference로 교체해 concurrent reader가 transient empty collection을 보지 않도록 하고, reload 중 감지된 local mutation을 보존하며 loader failure 시 이전 read snapshot을 유지; blocking reader/write regression·API·connected planner re-entry 회귀를 검증하며 managed failover/partition은 운영 acceptance |
| W9.50 | OperationLedger identity module | receipt·manual food·shopping receive·storage event의 key normalization·digest·canonical payload fingerprint·legacy scoped ID 계산을 하나의 Module로 집중하고 domain replay/scope semantics는 Adapter에 유지; four-domain idempotency/replay targeted·API·connected 회귀로 byte-compatible 결과를 검증하며 ledger retention/failover는 운영 acceptance |
| W9.51 | primary intake chunk prefetch/gate | AddFoodSheet lazy split은 유지하되 `openAdd()` user intent에서 chunk prefetch를 시작하고 resolve 후 dialog를 열어 control 없는 shell을 노출하지 않으며, 실패 시 retry toast를 제공; prefetch 전 timeout·receipt/label repeat·full connected·bundle-size 회귀로 검증하고 실기기 network/CDN/permission은 운영 acceptance |
| W9.52 | WorkspaceMutation operation lock | `WorkspaceMutation` 적용 caller의 snapshot·mutation·flush·restore를 active store `RLock`으로 직렬화해 refresh/동일 workspace mutation 간섭을 줄이고, lock 전 구간 regression·API·connected 회귀를 검증; direct worker/provider transaction과 전체 mutation atomicity는 운영 acceptance |
| W9.53 | storage event mutation seam | direct storage event route의 idempotency precheck·lot validation·InventoryRepository mutation·Grocy outbox·rollback을 active workspace lock과 `WorkspaceMutation`으로 편입하고, same-key concurrent request에서 단일 event/replay를 API·connected 회귀로 검증; direct meal/receipt route와 외부 Grocy transaction은 운영 acceptance |
| W9.54 | single meal-plan save mutation seam | 단일 meal-plan save의 plan/bundle 검증·saved audit staging을 `WorkspaceMutation` snapshot/flush/restore와 active lock에 편입하고, existing plan replay·concurrent save·flush failure phantom·connected planner 재진입을 검증; multi-day/completion은 별도 acceptance |
| W9.55 | single meal-plan completion mutation seam | single-plan completion의 allocation validation·consumed storage event/outbox·plan/bundle progress·completed audit staging을 `WorkspaceMutation`과 `reprioritize(persist=False)`에 편입하고, 정상·조정 수량·multi-lot·changed lot·flush failure phantom·connected planner 회귀를 검증; multi-day bundle save와 외부 provider는 운영 acceptance |
| W9.56 | multi-day bundle save mutation seam | multi-day bundle save의 bundle lock·preview rematerialization·snapshot hash/day state 검증·bundle persistence/restore를 `WorkspaceMutation`에 편입하고, preview side-effect-free·servings·retry/history/conflict·selected day/link repair·connected progress 회귀를 검증; day completion과 외부 provider는 운영 acceptance |
| W9.57 | receipt commit mutation seam | receipt commit의 pending transaction 선행 durable flush를 보존하면서 final lot/receipt/outbox/alias/audit staging을 receipt lock·workspace lock·`WorkspaceMutation` outer flush로 편입하고, GTIN/replay/pending retry/concurrent commit/rollback/final flush failure를 검증; 외부 Grocy transaction과 managed failover는 운영 acceptance |
| W9.58 | multi-day linked day completion recovery | 별도 bundle completion endpoint를 만들지 않고 `bundle_id`·`bundle_day_index`로 연결한 single-plan completion의 `WorkspaceMutation` snapshot에 bundle day progress를 포함; final flush failure 시 plan·day·inventory·consumed event rollback과 retry를 API regression으로 검증하며 외부 provider/failover는 운영 acceptance |
| W9.59 | meal-plan client transport lifecycle | planner의 preview/latest/preferences/history/audit와 nested shopping read를 `WorkspaceSyncCoordinator` channel·AbortSignal로 편입하고, read-only POST의 mutation broadcast를 명시적 exemption으로 제한; planner preview의 dashboard non-invalidation·same-origin cross-tab refresh·full connected/build/runtime 회귀를 검증하며 cross-device probe와 운영 delivery는 acceptance |
| W9.60 | manual food mutation recovery seam | `POST /api/foods` create/correction을 `manual_food_lock`·active mutation lock·`WorkspaceMutation` outer flush로 편입하고 `manual_food_persistence_unavailable` typed retry를 연결; create/correction semantics·idempotency replay/conflict·flush rollback·two-process PostgreSQL normalized smoke·connected retry를 검증하며 외부 provider/failover는 운영 acceptance |
| W9.61 | receipt draft mutation and intake readiness | receipt draft create를 fingerprint lock·active mutation lock·`WorkspaceMutation` outer flush와 `receipt_draft_persistence_unavailable` typed recovery로 편입하고, AddFoodSheet/LazyBottomSheet resolve 후 dialog open gate로 file/tab control readiness를 보장; draft replay/rollback·PDF/typed failure UI·full API/connected/build 회귀를 검증하며 OCR/device/CDN/운영 failover는 acceptance |
| W9.62 | product-info mutation recovery and inline retry | `PATCH /api/foods/{food_id}/product-info`를 active mutation lock·`WorkspaceMutation` outer flush·`product_info_persistence_unavailable` typed error로 편입하고 profile/provenance/date/quantity invariant와 no-op audit semantics를 보존; final-flush rollback·connected detail inline retry·API/connected/build/runtime 회귀를 검증하며 최신 route의 multi-process PG smoke와 운영 failover는 acceptance |
| W9.63 | receipt privacy mutation recovery and inline retry | `POST /api/receipts/{receipt_id}/privacy-erase`의 draft delete·committed/pending redaction을 `WorkspaceMutation` outer flush와 `receipt_privacy_persistence_unavailable` typed recovery로 편입; `confirm`·inventory/provenance/transaction 보존·pending reference semantics, flush rollback/retry, connected account-sheet inline retry를 검증하며 backup/WAL/legal retention/managed failover와 외부 저장소 삭제는 운영 acceptance |
| W9.64 | shopping list source mutation recovery and sheet-local retry | `POST /api/shopping-list`와 `/manual`의 plan source/manual source 생성·갱신을 `WorkspaceMutation` outer flush와 `shopping_list_persistence_unavailable` typed recovery로 편입; source merge·checked/quantity semantics, flush rollback/retry, MealPlanSheet·ShoppingListSheet inline retry와 full API/connected/build/runtime 회귀를 검증하며 GET reconciliation·receive lot transaction·managed/provider 운영은 acceptance |
| W9.65 | shopping list read reconciliation recovery | read처럼 보이지만 derived list를 삭제·갱신하는 `GET /api/shopping-list`의 source reconciliation을 `WorkspaceMutation` outer flush로 원자화하고 partial list 방지·`shopping_list_persistence_unavailable` typed retry·read seam/flush rollback·full API/connected 회귀를 검증; receive transaction·provider/failover/read-replica 운영은 acceptance |
| W9.66 | product-enrichment queue mutation recovery and inline retry | receipt review의 product-enrichment job map을 `WorkspaceMutation` snapshot에 포함하고 enqueue/dead-letter retry를 outer flush와 `product_enrichment_persistence_unavailable` typed recovery로 편입; deterministic job replay, flush rollback/retry, AddFoodSheet inline retry와 full API/connected/build/runtime 회귀를 검증하며 worker/provider transaction·cache/rate-limit·managed 운영은 acceptance |
| W9.67 | shopping receive transaction recovery and idempotent retry | 새 inventory lot·planned source reconciliation·checked 상태·receive operation ledger·priority를 active lock과 `WorkspaceMutation` outer flush로 원자화하고 `shopping_receive_persistence_unavailable` typed retry를 연결; same-key replay/conflict·consumed lot 재생성 차단·flush rollback과 connected receive retry를 검증하며 외부 Grocy compensation·managed PostgreSQL/운영 device는 acceptance |
| W9.68 | storage event failure recovery and same-key retry | `POST /api/foods/{food_id}/storage-events`의 예외 처리에서 직접 flush를 제거하고 `storage_event_persistence_unavailable` typed recovery 및 optimistic UI global retry를 연결; validation/partial split/opened/consume/discard/idempotency semantics와 API/connected/build/runtime 회귀를 검증하며 composite event batch·Grocy compensation·managed 운영은 acceptance |
| W9.69 | composite storage event sequence | 이동과 최초 개봉처럼 하나의 사용자 의도에서 함께 발생하는 최대 2개 local event를 `POST /api/foods/{food_id}/storage-event-sequence`로 묶고, workspace/key/index deterministic ID·child-lot target chain·`WorkspaceMutation` 단일 outer flush·`storage_event_sequence_persistence_unavailable` 전체 rollback·동일 key replay/conflict를 API와 connected retry에서 검증; 단일 event 호환 경로·외부 Grocy transaction·복수 batch·managed failover/device/CI는 별도 acceptance |
| W9.70 | guest transfer cross-workspace race recovery | guest-to-account transfer의 ready/conflict 판정과 source→target copy를 workspace ID 고정 순서의 두 lock 안에서 재검증하고, target flush failure의 snapshot restore·`guest_transfer_persistence_unavailable` typed retry·PostgreSQL stale restore 금지·source 보존을 API regression으로 검증; distributed source/target commit·managed failover·backup/WAL/legal retention은 운영 acceptance |
| W9.71 | receipt commit pending identity recovery | pending transaction 시작 flush와 finalization 후 reconciliation marker flush failure를 각각 typed 503으로 구분하고, phantom transaction 제거·durable pending identity 보존·동일 Idempotency-Key retry를 backend/API에서 검증; frontend는 fixed draft payload/resolved receipt와 같은 key를 global retry로 재사용하며 auth/duplicate/workspace conflict에는 blind retry를 제공하지 않음 |
| W9.72 | custom storage location vertical slice | canonical `ambient`·`refrigerated`·`frozen` class를 보존한 workspace-scoped 사용자 정의 위치 CRUD·duplicate/in-use/type-mismatch guard·SQLite/normalized PostgreSQL persistence를 연결하고, manual food·receipt commit·shopping receive·storage-event target에 `storage_location_id`를 전달; AddFood/ShoppingList/Account UI와 홈/재고 custom location 표시·server bounded location filter·storage mismatch 알림의 실제 위치 이름·cross-tab `storage-locations` invalidation·same-key retry를 connected/API/contract/build 회귀로 검증하며 실제 온도 센서·외부 Grocy 위치 mapping·운영 PostgreSQL은 별도 acceptance |
| W9.73 | custom storage history safety and cross-device refresh | 현재 lot뿐 아니라 storage event·shopping receive history가 참조하는 위치의 삭제를 `storage_location_in_use`로 차단해 audit 이름을 보존하고, 최근 보관 기록에 custom location명을 표시; payload-free `/api/storage-locations/revision`과 SQLite/in-memory revision marker, 계정 위치 관리자의 tab 복귀·30초 bounded probe 및 편집 상태 보호를 connected/API/fixture/build 회귀로 검증하며 실제 운영 DB race·실기기 background visibility는 별도 acceptance |
| W9.74 | CI release contract completeness | web job에 workspace-sync·service-worker contract lane을 명시적으로 추가하고, `postgres-live` smoke에 storage-location revision 증가·storage event history 참조 뒤 삭제 `409`·`storage_location_in_use` readback을 연결; workflow YAML·contract test와 local mirror checks로 검증하며 실제 GitHub Actions 실행·운영 PostgreSQL은 별도 acceptance |
| W9.75 | release provenance manifest | source revision·branch/dirty state·dependency lock hash·migration file hash·mobile runtime lock·compiled Sites artifact hash를 secret/workspace data 없이 JSON manifest로 materialize하고, required artifact 누락을 fail-closed 검증한 뒤 local test와 web CI artifact upload를 연결; 실제 GitHub Actions artifact retention·release promotion은 별도 acceptance |
| W9.76 | meal-plan cross-device revision safety | payload-free `/api/meal-plans/revision`과 planner의 visible-tab·30초 bounded probe를 연결하고, 다른 기기에서 식단/재고가 바뀌면 현재 선택·사용량을 덮지 않은 채 최신 상태 확인을 요구; 명시적 reload 후 latest plan 재materialization을 API/connected/runtime/build 회귀로 검증하며 실제 multi-device scheduling·server push는 별도 acceptance |
| W9.77 | notification cross-device revision safety | payload-free `/api/notifications/revision`을 알림 목록 read와 함께 확보하고, 열린 알림 센터의 visible-tab·30초 bounded probe에서 revision 증가 시 최신 목록을 자동 갱신; 읽음·전체 읽음 mutation 중에는 probe/목록 교체를 보류하고 완료 후 queued refresh로 수렴하며 API/connected/runtime/build 회귀로 검증, 실제 Web Push ordering·multi-device scheduling·managed PostgreSQL는 별도 acceptance |
| W9.78 | dashboard cross-device revision safety | payload-free `/api/dashboard/revision`을 dashboard read와 함께 확보하고, 홈 화면의 visible-tab·30초 bounded probe에서 revision 증가 시 inventory/Rescue Queue를 자동 갱신; sheet와 일반 sync 경합을 막고 사용자 toast를 보존하도록 API/connected/build/runtime 회귀로 검증, 실제 device background scheduling·server push·managed PostgreSQL는 별도 acceptance |
| W9.79 | shopping-list cross-device revision safety | payload-free `/api/shopping-list/revision`을 장보기 list read와 함께 확보하고, 열린 ShoppingListSheet의 visible-tab·30초 bounded probe에서 revision 증가 시 최신 항목을 자동 갱신; 체크·삭제·입고·직접 추가 mutation과 cross-tab queued refresh 경합을 API/connected/build 회귀로 검증하며 실제 multi-device scheduling·server push·managed PostgreSQL는 별도 acceptance |
| W9.80 | dashboard active-search cross-device safety | dashboard revision refresh 이후 활성 `inventory-search` retry channel을 재실행해 기본 inventory와 검색 결과의 revision split-brain을 막고, 기존 query/filter·Coordinator stale-response guard를 유지; connected/API/build/runtime 회귀로 검증하며 실제 multi-device scheduling·server push·managed PostgreSQL는 별도 acceptance |
| W9.81 | receipt review queue cross-device safety | payload-free `/api/receipts/revision`을 receipt summary read와 함께 확보하고, 열린 `receipt-queue` sheet의 visible-tab·30초 bounded probe에서 revision 증가 시 최신 summary만 자동 갱신; AddFoodSheet 검수 중에는 probe를 중단해 OCR/draft를 보호하며 API/connected/build/runtime 회귀로 검증, 실제 multi-device scheduling·server push·managed PostgreSQL는 별도 acceptance |
| W9.82 | food-detail cross-device stale protection | dashboard revision 증가를 열린 FoodDetailSheet에서 감지하되 food payload·상품 정보/보관/날짜 draft를 자동 교체하지 않고 stale alert를 표시; 사용자가 `최신 상태 확인`을 선택한 경우에만 최신 dashboard/food를 적용하며 connected/API/build 회귀로 검증, 실제 device background scheduling·server push·managed PostgreSQL는 별도 acceptance |
| W9.83 | account-settings cross-device stale boundary | 열린 AccountSheet의 dashboard revision 증가를 감지하되 인증/guest 하위 panel의 local draft·확인 상태를 자동 교체하지 않고 stale alert를 표시; 사용자가 `최신 계정 설정 확인`을 선택해 dashboard sync가 성공한 경우에만 parent refresh nonce로 notification preferences·storage locations·receipt privacy·Grocy panel을 다시 읽으며 deterministic browser fixture·TypeScript·build로 검증, 실제 multi-device scheduling·server push·managed PostgreSQL·device accessibility는 별도 acceptance |
| W9.84 | PostgreSQL live gate and read-reconciliation retry | disposable Docker PostgreSQL에서 migration `001→025` ledger rerun·normalized `/ready`·metrics non-disclosure·custom location/provenance/search/history readback·backup/restore·connection/pool/concurrency/idempotency/crash/account recovery smoke를 통과시키고, concurrent `GET /api/shopping-list` reconciliation conflict에서 winner snapshot을 reload한 뒤 1회 bounded retry하는 route/API regression을 연결; managed failover·reverse-proxy reset·production backup retention/encryption·external provider는 운영 acceptance |
| W9.85 | Portable PostgreSQL backup client wrapper | host `pg_dump`·`pg_restore`·`psql` toolchain과 Docker PostgreSQL client image를 `auto`/`host`/`docker`로 fail-closed 선택하고, archive parent mount·DSN environment pass-through·Docker Desktop loopback mapping·major-version guard를 backup/restore에 연결; shell/argument-contract와 실제 disposable Docker backup→empty restore→normalized lot readback을 검증하며 image digest approval·object-storage retention/encryption·managed failover·production cutover는 운영 acceptance |
| W9.86 | Fixture runtime port isolation | Playwright fixture lane이 점유된 기본 포트에서 unrelated app을 재사용하거나 Vite fallback port로 이동한 상태를 정상으로 보지 않도록 `--strictPort`·explicit reuse opt-in을 적용; 점유 포트 negative check와 dedicated-port fixture/mobile **35 passed + 3 skipped**, production fail-closed **1 passed**를 검증하며 실제 device/accessibility와 connected/managed 운영은 별도 acceptance |
| W9.87 | Guest account settings stale-boundary rerun | OneDrive hydration 때문에 남아 있던 guest `AccountSheet` cross-device revision scenario를 canonical target의 disposable connected lane에서 전용 ports `8042/4442`로 실행해 **1 passed**; authenticated/guest local draft 보존·명시적 refresh nonce semantics를 함께 기록하며 실제 multi-device scheduling·push ordering·managed failover·device accessibility는 별도 acceptance |
| W9.88 | Product-info mutation response/read separation | `PATCH /api/foods/{food_id}/product-info` 성공 response를 즉시 frontend read model에 반영하고 후속 dashboard read 실패와 stale dashboard cache가 이미 성공한 mutation을 덮지 못하게 분리; first typed persistence failure·same retry key/attempt·second PATCH success·stale name 회귀를 connected **1 passed**와 수정 후 full connected **99 passed**로 검증하며 backend/provider/failover 운영은 별도 acceptance |
| W9.89 | Connected E2E wait budget and final integration rerun | API client의 bounded 8초 request budget과 맞지 않던 Playwright 기본 5초 expectation 경계를 10초 expectation·30초 test timeout으로 명시하고, product-info stale-cache 회귀·guest settings·receipt/label/barcode/planner/shopping/storage/account 전체를 dedicated connected lane에서 **99 passed**로 재확인 |
| W9.90 | API container boot post-fix live gate | recipe catalog packaging/root build-context 수정 뒤 disposable Compose에서 PostgreSQL·migration `001→025`·OCR worker·FastAPI health/readiness, guest auth, normalized dashboard `7→8` write와 same-key `201 + replay`를 실제 확인하고 exact project resources를 제거; managed failover·object-storage lifecycle·production cutover은 운영 acceptance |
| W9.91 | Reproducible disposable container smoke | 수동 API container boot/read-write gate를 PID-scoped `infra/container-smoke.sh`로 고정하고 existing project resource collision·failure cleanup·local image removal·CI `container-boot` 20분 job을 연결; local post-fix execution `migration_rows=25`, API/OCR ready, guest `7→8`, same-key replay passed를 기록하며 managed production acceptance는 별도 |
| W9.92 | Date assertion mutation response/read separation | `PATCH /api/foods/{food_id}/date-assertion`의 성공 `ApiFood` response를 즉시 frontend read model에 반영하고 stale dashboard cache가 사용자 확인 날짜를 덮지 못하게 보완; typed failure/retry와 성공 write 후 dashboard read failure를 connected **2 passed**, 최종 full connected **100 passed**, build/runtime 회귀로 검증하며 managed/provider/device acceptance는 별도 |
| W9.93 | Product provenance mutation response/read and modal retry | `DELETE /api/foods/{food_id}/product-provenance`의 성공 response/read separation·stale cache 보존·typed failure rollback을 연결하고, Radix `aria-hidden` 아래 global toast 대신 detail-local `role=alert`·inline retry/status를 제공; provenance focused **2 passed**, full connected **101 passed**, fixture/mobile **35 passed + 3 skipped**로 검증하며 실기기 screen-reader는 별도 acceptance |
| W9.94 | Emerald Atelier compact selector alignment | 현재 product visual direction의 compact add-food button과 Korean explicit eyebrow composition에 맞춰 stale hidden-descriptor/locale test assertions를 정리하고, UI direction은 유지한 채 fixture/mobile **35 passed + 3 skipped**와 connected **101 passed**를 재확인 |
| W9.95 | Initial dashboard revision baseline recovery | 초기 `/api/dashboard` response header의 workspace revision을 dashboard polling baseline에 즉시 seed해 첫 visible-tab probe가 remote revision을 초기화로 소비하지 않도록 lifecycle 결함을 수정; focused **1 passed**, full connected **101 passed**, fixture/mobile **35 passed + 3 skipped**, production fail-closed **1 passed**, build **757 modules**로 검증하며 실제 device background scheduling·server push·managed failover는 별도 acceptance |
| W9.96 | Native 320px viewport resilience lane | `VITE_APP_SHELL=native`의 320×740 viewport에서 body/document/device screen/home의 horizontal overflow와 visible interactive bounds를 검사하고, 식품 추가·식단·알림·계정·상세 sheet bounds·125% text preference를 Playwright **4 passed**로 고정; 실제 OS font scaling·iOS/Android device accessibility는 별도 acceptance |
| W9.97 | Preview/native Playwright lane isolation | default fixture config에서 native viewport spec을 제외하고 `playwright.native.config.ts`의 native shell·320×740 전용 port/config로 분리해 두 lane의 viewport contract가 섞이지 않도록 고정; fixture **35 passed + 3 skipped**(`4482`)와 native **4 passed**(`4487`)를 재확인하며 실제 device acceptance는 별도 |
| W9.98 | Playwright web-server process cleanup | fixture/native Playwright webServer가 `npm` wrapper 아래 orphan Vite를 남기지 않도록 `check:runtime && exec ./node_modules/.bin/vite`로 실행 process를 직접 소유; focused fixture/native 각 **1 passed** 후 전용 port free readback을 확인하고 전체 lane 회귀를 재실행하며 실제 production server lifecycle은 별도 |
| W9.99 | Authoritative mutation readback Module | product-info/date/provenance/manual food/receipt commit 성공 response를 best-effort dashboard read보다 먼저 적용하고 readback 실패 뒤 재적용하는 공통 `mutationReadback` Module과 contract test **3 passed**를 추가; targeted connected **manual/receipt + product/date/provenance** 회귀와 full connected **101 passed**, build **758 modules**로 검증하며 domain-specific rollback/error policy는 caller에 유지 |
| W9.100 | Optimistic storage mutation lifecycle | storage move/open sequence·consume·discard에 additive inventory snapshot response를 연결하고 `optimisticMutation` Module로 optimistic apply/restore/readback ordering을 공통화; mutation failure snapshot restore·successful write/read failure reapply·storage targeted **3 passed**, full connected **101 passed**, backend **499 passed**, build **759 modules**로 검증하며 provider/failover transaction은 별도 acceptance |
| W9.101 | Container smoke after storage response contract | `StorageEventResponse.inventory` additive response 및 response-only persistence separation 이후 packaged PostgreSQL/OCR/API Compose를 다시 기동해 migration **25**, API/OCR ready, guest dashboard **7→8**, same-key replay **201 + replay header**와 exact resource cleanup을 확인하며 managed failover/provider는 별도 acceptance |
| W9.102 | Current-source full-lane stability readback | response-only storage snapshot 이후 connected 전체 **101 passed**, fixture/mobile worker-1 **36 passed + 3 skipped**, iOS guidance focused **10 passed**, native **4 passed**, API **499 passed / 8 warnings**, mutation/optimistic/workspace/service-worker/release contracts **3/3/9/5/2**, build **759 modules**, Sites **4 passed**를 재확인; 이전 병렬/동시 프로세스 간섭은 제품 실패와 분리해 기록하고 실제 device/provider/managed 운영은 acceptance로 유지 |
| W9.103 | Guest transfer transport centralization | AccountSheet의 자체 guest transfer fetch를 `mealApi`의 explicit account-session method로 수렴하고 8초 timeout·typed error·workspace revision response/read propagation·transfer invalidation·effect abort를 복원; connected registration/conflict **2 passed**, revision header assertion, full connected **101 passed**, build를 검증하며 multi-device/account refresh는 별도 acceptance |
| W9.104 | Exact storage sequence replay cardinality | persisted deterministic event ID의 tail/orphan cardinality를 replay validation에 포함해 완성 2-event sequence의 shorter prefix를 `409`로 차단; 수정 전 red **200**, 수정 후 shorter replay/atomic replay **2 passed**, backend **500 passed**, full connected **101 passed**를 확인하며 external provider/failover는 별도 acceptance |
| W9.105 | Storage mutation recovery Module | `saveFood`·`consumeFood`·`discardFood`의 optimistic mutation failure→single dashboard reconciliation→caller retry choreography를 `storageMutationRecovery.ts`로 수렴하고 성공 readback false/throw를 failure retry와 분리; pure contract **3 passed**, storage connected targeted **14 passed**, full connected **103 passed**, backend **500 passed**, build **760 modules**를 확인하며 provider/failover는 별도 acceptance |
| W9.106 | Native accessibility and large-text hierarchy | 카메라 권한 거부 live announcement, intake tab/tabpanel semantics·roving focus, iOS install guidance `aria-expanded`/`aria-controls`, root text-size에 반응하는 Home·sheet `rem` typography를 연결; fixture/mobile **38 passed + 3 skipped**, native **9 passed**, build **760 modules**와 large-text/native captures로 검증하며 실제 VoiceOver/TalkBack·Dynamic Type는 device acceptance |
| W9.107 | Cross-platform touch target and Pixel safe-area | 핵심 Home·intake·meal·detail·notification·install controls와 opened-state toggle을 44px hit box로 보강하고, Pixel preview의 이중 Android navigation inset을 제거; native touch suite **7 passed**, Pixel edge/sheet focused regression, full fixture **38 passed + 3 skipped**, build **760 modules**로 검증하며 OEM gesture navigation은 device acceptance |
| W9.108 | Current-source mutation resolver/build contract | storage recovery WIP의 Node strip-types와 TypeScript resolver 차이를 `allowImportingTsExtensions`로 명시해 pure optimistic/recovery **3/3 passed**와 production build **760 modules**를 동시에 통과; protected runtime은 변경하지 않고 external provider/failover는 별도 acceptance |
| W9.109 | Storage retry stale-snapshot guard | 첫 mutation failure에서만 local snapshot을 restore하고, reconciliation 이후 retry failure에서는 오래된 snapshot을 다시 복원하지 않고 authoritative sync 결과를 유지하도록 recovery closure를 보강; storage recovery contract **4 passed**, optimistic **3 passed**, build **760 modules**로 검증하며 multi-process/provider transaction은 별도 acceptance |
| W9.110 | BottomSheet import-boundary classification | protected mobile barrel/runtime이 이미 BottomSheet를 static graph에 포함해 ineffective dynamic import warning을 발생시키는 경계를 확인하고, static app-owned 대안의 초기 chunk **537.5KB** 증가를 관찰한 뒤 lazy boundary를 유지; current build **760 modules**·main chunk 약 **330.25KB**·protected runtime **28 passed**를 evidence로 기록하며 protected runtime refactor는 별도 scope |
| W9.111 | Reduced-motion sheet policy | app-owned Prototype tree에서 Motion의 `reducedMotion="user"` policy를 제공해 protected BottomSheet descendants가 OS/browser reduced-motion preference를 따르도록 연결; focused reduced-motion **1 passed**, native **8 passed**, build **760 modules**로 검증하며 physical compositor/accessibility는 device acceptance |
| W9.112 | High-contrast native regression | 기존 `prefers-contrast: more` token layer를 CDP native emulation으로 검증하고 muted/border token·320px width·44px action geometry를 함께 고정; focused contrast **1 passed**, native **9 passed**, build **760 modules**로 검증하며 OS-level contrast/device rendering은 device acceptance |
| W9.113 | Account tab accessibility parity | AccountSheet login/register tabs를 intake와 동일한 tab/tabpanel ID·roving focus·ArrowLeft/ArrowRight/Home/End contract로 수렴; focused account regression **1 passed**, fixture/mobile **38 passed + 3 skipped**, build **760 modules**로 검증하며 physical screen-reader speech는 device acceptance |
| W9.111 | Receipt commit finalization typed failure envelope | finalization 일반 persistence failure의 transaction ID 포함 plain string을 제거하고 `receipt_commit_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)로 통일; red→green receipt targeted **3 passed**, backend **500 passed**, connected **103 passed**를 확인하며 pending marker/reconciliation과 external provider는 별도 acceptance |
| W9.114 | Meal-plan completion typed failure envelope and retry | `POST /api/meal-plans/{plan_id}/complete`의 regular flush failure를 `meal_plan_completion_persistence_unavailable` typed `503`으로 반환하고 rollback semantics를 유지; `MealApi` type guard와 실패 당시 plan/consumption payload를 사용하는 `MealPlanSheet` inline retry를 연결해 conflict/validation에는 blind retry를 노출하지 않음; API targeted **3 passed**, typed retry connected **1 passed**, full API **500 passed**, full connected **104 passed**, fixture/mobile **38 passed + 3 skipped**, native **9 passed**, build **760 modules**, Sites **4 passed**, release manifest **2 passed**를 확인하며 external provider/failover는 acceptance |
| W9.115 | Account sheet first-fold action reachability | fresh native `393×852` capture에서 `snap=0.7` 계정 시트의 `로그인` 버튼이 `y=829.7..873.7px`로 첫 화면 아래에 잘리던 UI 결함을 확인; account-only snap을 `0.8`로 올리고 entrance settle 이후 safe-area 경계를 검사하는 regression을 추가해 focused **1 passed**, full native **10 passed**, fixture/mobile **38 passed + 3 skipped**, connected **104 passed**, build **760 modules**를 확인하며 physical VoiceOver/Dynamic Type/OEM inset은 별도 acceptance |
| W9.116 | Food detail state first-fold action reachability | fresh native `393×852` capture에서 `snap=0.78` 식품 상세의 `개봉됨` 상태 컨트롤이 `y≈822px`부터 시작해 `818px` safe-area boundary 아래로 잘리던 UI 결함을 확인; detail-only snap을 `0.84`로 올리고 entrance settle 이후 toggle boundary regression을 추가해 focused **1 passed**, full native **11 passed**, fixture/mobile **38 passed + 3 skipped**, build **760 modules**를 확인하며 physical VoiceOver/Dynamic Type/OEM inset은 별도 acceptance |
| W9.117 | Food detail mutation-action first-fold reachability | `snap=0.84` 이후에도 `먹었어요`·`보관 상태 저장`이 `y=843.2..887.2px`로 safe-area 아래에 남은 것을 fresh `393×852` capture에서 확인; detail snap을 `0.93`으로 조정하고 toggle·primary action row가 `34px` boundary 위에 남는 settle-aware regression을 확장해 focused **1 passed**, full native **11 passed**, fixture/mobile **38 passed + 3 skipped**, build **760 modules**를 검증하며 physical device acceptance는 별도 |
| W9.118 | Inventory search pagination/storage-location lifecycle | `storageLocations` identity change가 active server search를 page zero로 재시작해 occasional `offset=0` second-page request를 만들던 producer lifecycle 결함을 ref-backed materialization과 name-only reconciliation으로 분리; current pagination focused **10 passed**, PDF/manual-priority/planner focused **3/3/3 passed**, fresh full connected **107 passed (4.8m)**, fixture/mobile **39 passed + 3 skipped**, build **760 modules**를 검증하며 earlier `103/106` run은 historical timing evidence로 분리 |
| W9.118 | Account deletion typed persistence recovery | account deletion fence·workspace purge·credential 삭제의 기존 resume semantics를 유지하면서 regular failure를 `account_deletion_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)로 정렬; `MealApi` type guard와 typed failure 전용 AccountSheet inline retry를 연결하고 `401`·`422`·`429`·untyped `503`에는 blind retry를 노출하지 않음; API targeted **3 passed**, typed retry/rate-limit connected **2 passed**, full API **500 passed**, full connected **105 passed**, build **760 modules**를 확인하며 distributed deletion/backup/provider는 acceptance |
| W9.119 | Food detail narrow-viewport responsive snap | fixed detail `snap=0.93`이 320×740에서 `y=-52px`로 handle/title을 clipping하던 UI 결함을 확인; live viewport height 기반 bounded snap으로 393×852 composition을 유지하면서 320×740 sheet를 `y=8..740px`로 조정하고 focused **1 passed**, full native **11 passed**, fixture/mobile **38 passed + 3 skipped**, build **760 modules**를 검증하며 physical compositor/Dynamic Type는 별도 acceptance |
| W9.120 | Bottom sheet keyboard focus containment | open receipt BottomSheet의 **24 Tab + 24 Shift+Tab** traversal이 dialog 밖으로 빠지지 않고 Escape 후 `식품 추가하기` trigger로 focus를 복원하는 permanent fixture regression을 추가; focused **1 passed**, physical VoiceOver/TalkBack/Switch Control은 별도 acceptance |
| W9.121 | Food detail narrow-viewport action reachability | 320×740 responsive detail의 max-scroll 후 `.detail-actions`가 `y=577.875..621.875px`로 `706px` safe-area boundary 위에 도달하는 regression을 추가; focused **1 passed**, full native **12 passed**, fixture/mobile **39 passed + 3 skipped**, build **760 modules**를 확인하며 physical scroll physics/VoiceOver rotor는 별도 acceptance |
| W9.122 | Food detail narrow large-text reachability | `320×740 + 125% root text`에서 detail title `23.75px`와 max-scroll action bottom `622.109px`를 확인하고 safe-area/overflow regression을 확장; focused large-text **2 passed**, full native **12 passed**, fixture/mobile **39 passed + 3 skipped**를 검증하며 physical Dynamic Type/font substitution은 별도 acceptance |
| W9.123 | Camera permission-denied narrow recovery | forced `NotAllowedError`의 320×740 recovery region(`y=294..634px`)과 `사진에서 선택`·`입력 방법 다시 보기` buttons를 `706px` safe-area boundary 위에서 검증; focused **1 passed**, full native **13 passed**, fixture/mobile **39 passed + 3 skipped**, live-region semantics와 no-overflow를 확인하며 physical permission sheet/optics는 별도 acceptance |
| W9.125 | Native bottom-sheet focus containment | native `393×852` portal에서 receipt sheet의 **24 Tab + 24 Shift+Tab** traversal이 dialog 밖으로 빠지지 않고 Escape 후 trigger focus를 복원하는 regression을 추가; focused **1 passed**, full native **14 passed**, fixture/mobile **39 passed + 3 skipped**, physical VoiceOver/TalkBack/Switch Control은 별도 acceptance |
| W9.124 | Operational readiness/worker typed 503 envelope | API `/ready` storage/auth failure, workspace acquisition, OCR worker `/ready` model failure·`/ocr` capacity, internal worker configuration missing을 safe `code/retryable/action`으로 정렬하고 retryable path의 `Retry-After`를 고정; 수정 전 plain 503 red 이후 API **504 passed**, OCR worker **10 passed**, secret/exception non-disclosure와 기존 success/HTTP status 호환성을 확인하며 external load balancer/failover/provider 운영은 acceptance |
| W9.126 | Remaining auth/recipe configuration 503 closure | recipe review/import 설정, guest workspace provisioning, 공통 auth secret와 account session 발급의 plain `503`을 `code/retryable/action`으로 정렬; retryable provisioning은 `Retry-After`를 사용하고 server configuration은 fail-closed; 수정 전 **4 failed**, 이후 API **507 passed**, recipe-review/API typed response·exception non-disclosure를 확인하며 external provider/failover 운영은 acceptance |
| W9.127 | Workspace export rate limit and typed retry | `/api/account/export`에 IP·opaque workspace 이중 bucket rate limit과 `account_export_rate_limited` `429`, `Retry-After`/rate-limit headers를 연결하고 AccountSheet가 body/download 없이 retry 안내를 표시; export targeted API **2 passed**, typed 429 connected **1 passed**, API **508 passed / 8 warnings**, full connected **108/108 passed (5.0m)**, build **760 modules**를 검증하며 streaming/compression·actor audit·운영 gateway는 acceptance |
| W9.128 | Printed-date fixture determinism | fixed `2026-09-12` printed-date connected fixture가 host date passage에 따라 정상 urgency label과 충돌하던 test coupling을 실행일 `+7일` local-calendar fixture로 분리; printed-date focused **3 passed**, API **508 passed**, latest connected **108 passed**를 확인하며 product date semantics는 변경하지 않음 |
| W9.129 | Primary intake idle prefetch | initial Prototype commit 직후 `AddFoodSheet`·BottomSheet lazy chunks를 warm해 first-tap module fetch 경합을 줄이고, 기존 user-intent prefetch/retry와 code split을 유지; focused PDF **3 passed**, full connected **108 passed**, fixture/mobile **39 passed + 3 skipped**, native **14 passed**, build **760 modules**를 확인하며 CDN/offline/device network은 별도 acceptance |
| W9.119 | Native sheet entrance settle measurement | first-fold safe-area regression이 spring 중간 transform에서 조기 측정되어 `818.008972px`를 간헐적으로 실패시키던 test lifecycle 결함을 분리; app-owned native helper가 sheet bottom과 computed transform settle 후에만 34px boundary를 검사하도록 보강하고 제품 layout/protected runtime은 변경하지 않음; native 전체 **11 passed**, fixture/mobile **38 passed + 3 skipped**, build **760 modules**를 확인하며 physical compositor/OEM inset은 device acceptance |
| W9.120 | Single meal-plan save typed persistence recovery | `POST /api/meal-plans`의 regular `WorkspaceMutation` flush failure가 raw exception으로 전파되던 경로를 `meal_plan_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)으로 정렬; `plan_id` replay/concurrency/validation semantics를 유지하고 `MealPlanSheet`가 실패 당시 preview payload를 보존한 inline retry를 typed code에만 제공; API targeted **4 passed**, typed save retry connected **1 passed**, full API **500 passed / 8 warnings**, full connected **106 passed**, fixture/mobile **38 passed + 3 skipped**, build **760 modules**를 확인하며 multi-day/provider/failover는 acceptance |
| W9.121 | Multi-day bundle save typed persistence recovery | `POST /api/meal-plans/multi-day`의 regular `WorkspaceMutation` flush failure가 raw exception으로 전파되던 경로를 `multi_day_plan_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)으로 정렬; bundle lock/replay/history/snapshot conflict와 linked-day completion semantics를 유지하고 `MealPlanSheet`가 실패 당시 bundle payload를 보존한 3일 영역 inline retry를 typed code에만 제공; API targeted **4 passed**, typed bundle retry connected **1 passed**, full API **500 passed / 8 warnings**, full connected **107 passed**, fixture/mobile **38 passed + 3 skipped**, native **11 passed**, build **760 modules**, Sites **4 passed**, release manifest **2 passed**를 확인하며 external provider/failover는 acceptance |
| W9.130 | Food detail responsive first-fold action reachability | fresh native `393×852`에서 destructive action이 `y=825.296..869.296px`로 `818px` safe boundary 아래, `320×740`에서 primary actions가 `y=712.953..756.953px`로 `706px` 초기 경계 아래에 있던 문제를 확인; live snap을 `max 0.993`으로 조정하고 `max-width:360px`에서 supporting detail card gap/padding만 축소해 393px destructive action `y=773.484..817.484`, 320px primary actions `y=646.641..690.641`로 이동; focused **2 passed**, full native **14 passed**, fixture/mobile **39 passed + 3 skipped**, build **760 modules**, Sites/service-worker/workspace-sync/release manifest **4/5/9/2 passed**를 확인하며 physical VoiceOver/Dynamic Type/OEM inset은 별도 acceptance |
| W9.131 | Compact home metadata readability | fresh `320×740` native capture에서 queue의 secondary `food-subline`·`food-meta-line`·`date-source`가 `7px`로 계산되던 문제를 `max-width:360px`에서 `8px`로 조정; row `50px`, meal CTA `y=509.031..551.031`, reserved nav `y=628..706`, document/body `320px` 유지와 no-overflow를 확인하고 focused home **1 passed**, full native **14 passed**, build **760 modules**를 검증하며 393px source typography는 유지 |
| W9.132 | Workspace export actor/time audit | 성공적으로 생성된 export마다 검증된 actor·role·request ID·UTC 시각·schema version만 별도 append-only audit row에 기록하고, export JSON·workspace revision에는 포함하지 않음; audit persistence 실패는 `account_export_audit_persistence_unavailable` typed `503`과 `Retry-After: 1`로 파일 생성 전에 차단; API actor success/failure **2 passed**, SQLite reconstruction/reset **1 passed**, PostgreSQL workspace-scoped SQL **1 passed**, AccountSheet typed failure **1 passed**, full API **512 passed / 8 warnings**, connected **109/109 passed**, fixture/mobile **39+3 skipped**, native **14 passed**, build **760 modules**를 확인하며 audit 운영 조회·보존·live migration 026과 streaming/compression은 별도 acceptance |
| W9.133 | Guest transfer preview single-flight | 회원가입 submit이 명시적으로 요청한 guest preview와 `authMe` effect의 중복 호출로 첫 일시 실패와 후속 성공 응답이 경쟁하던 producer 결함을 ref 기반 single-flight로 차단; 수정 전 focused retry-panel regression 실패, 수정 후 **1 passed**, fresh full connected **109/109 passed (4.8m)**를 확인하며 transfer payload/import/skip/conflict semantics는 유지 |

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
- `kg↔g`·`L↔ml`처럼 안전한 환산만 허용하고, `팩↔개`·`모↔개`는 `단위 확인 필요`로 보류함

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
