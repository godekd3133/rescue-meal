# 1차 구현 상태 — 2026-09-01 (최종 readback 2026-09-06)

> 최신 상태는 아래 `2026-09-06 continuation readback`의 누적 기록과 각 날짜별 evidence를 우선합니다. 이전 baseline 수치와 Docker daemon 부재 문구는 당시 상태를 설명하는 역사 기록입니다.

## 2026-09-04 continuation readback

- API 전체 pytest (PostgreSQL workspace DDL/read transaction·workspace snapshot/operation pool lifecycle·aggregate connection budget·sanitized receipt/label fixture·quality-adaptive OCR 경계 보강 후): **306 passed**; Rescue Meal prototype runtime baseline **24 passed**, 최신 isolated prototype **25 passed**, connected frontend/backend E2E **48 passed**
- 직전 continuation snapshot의 API baseline: **278 passed**
- connected frontend/backend E2E: **48 passed**
- disposable PostgreSQL normalized migration `001→018`, `/ready`, 라벨 보관조건 저장, 실제 위치 변경 후 날짜 보존, API restart/direct SQL readback: passed
- product profile correction과 `FoodProductInfoAuditEvent`, provenance removal audit, `DateAssertion.applicable_storage_type`·`storage_condition_text`, `storage_mismatch` notification: passed
- 실제 recipe allocation lot의 보관조건 mismatch가 planner `date_review_required`·재료명·조리 전 안내문으로 이어지는 경계: passed
- production build mirror: TypeScript, Vite **754 modules**, Sites output, protected mobile runtime integrity **28 files**: passed
- disposable PostgreSQL backup/restore: custom archive 생성·mode 600·client/server major guard·빈 DB restore·normalized schema와 lot/date-storage readback: passed; 운영 object storage encryption/retention/scheduler는 별도
- disposable PostgreSQL two-connection concurrency: 동시 full-snapshot flush에서 1 commit·1 stale conflict·1 lot readback·workspace cleanup: passed; aggregate pool sizing·failover·network partition은 별도
- disposable PostgreSQL account auth: register → normalized inventory write/read → API restart/login → password rotation·old token `401` → account purge와 credential/projection 0건: passed; auth/workspace/readiness read path의 `idle in transaction` cleanup도 `pg_stat_activity`로 passed ([PostgreSQL auth readback](../evidence/postgres-auth-live-readback-2026-09-04.md))
- disposable PostgreSQL connection lifecycle: request/worker workspace lease·유휴 snapshot store LRU eviction·eviction 후 재오픈 data readback·active lease 동시 purge 차단·FastAPI router/auth shutdown close와 `pg_stat_activity` connection 0건: passed ([PostgreSQL connection lifecycle readback](../evidence/postgres-connection-lifecycle-readback-2026-09-04.md)); operation pool은 별도 readback
- disposable PostgreSQL operation pool: `max_size=2` 두 lease 점유·세 번째 checkout timeout·`PooledConnectionProxy` workspace persistence/reopen/purge·connection 반환 후 idle transaction 0·pool shutdown connection 0: passed ([PostgreSQL operation pool readback](../evidence/postgres-operation-pool-readback-2026-09-04.md)); shared owner 통합·multi-process aggregate sizing·failover는 별도 운영 gate
- disposable PostgreSQL migration ledger: `rescue_schema_migrations`에 001→018 파일별 SHA-256을 기록하고, 동일 checksum migration은 재실행 시 skip하며, 의도적 checksum drift는 migration body 실행 전에 거부함: passed ([PostgreSQL migration ledger readback](../evidence/postgres-migration-ledger-readback-2026-09-04.md)); production backup/retention/failover 및 crash-between-body-and-ledger는 별도 운영 gate
- PostgreSQL aggregate connection budget: production preflight가 `process × (2 base/auth + pool max) + reserved <= max_connections`를 검증하고, CI disposable PostgreSQL에서 `SHOW max_connections=100`·`required=20`·현재 `pg_stat_activity`를 readback하도록 연결함; 실제 managed failover·network partition·rolling deploy 장시간 churn은 별도 운영 gate
- 상세 증거: [상품 provenance·상품 프로필 correction·보관조건 readback](../evidence/product-provenance-readback-2026-09-04.md)
- OCR bbox 경계: [OCR bbox boundary readback](../evidence/ocr-bbox-boundary-readback-2026-09-04.md)
- backup/restore 경계: [PostgreSQL backup/restore readback](../evidence/postgres-backup-restore-readback-2026-09-04.md)
- concurrency 경계: [PostgreSQL concurrency readback](../evidence/postgres-concurrency-readback-2026-09-04.md)
- account auth·transaction lifecycle 경계: [PostgreSQL auth readback](../evidence/postgres-auth-live-readback-2026-09-04.md)
- workspace connection lifecycle·operation pool 경계: [PostgreSQL connection lifecycle readback](../evidence/postgres-connection-lifecycle-readback-2026-09-04.md), [PostgreSQL operation pool readback](../evidence/postgres-operation-pool-readback-2026-09-04.md), [connection lifecycle 설계](../docs/postgres-connection-lifecycle.md)
- aggregate connection budget 경계: [PostgreSQL connection budget readback](../evidence/postgres-connection-budget-readback-2026-09-04.md)

## 2026-09-05 continuation readback

- password reset provider adapter: provider/reset URL safety, bounded timeout·attempt·backoff, transient `408/425/5xx`·network retry, permanent `4xx` stop, token-free SHA-256-derived `Idempotency-Key`, provider call total 45초 hard cap을 추가했고 API/preflight/email unit 회귀를 통과함 ([account recovery readback](../evidence/account-recovery-readback-2026-09-02.md))
- 현재 API 전체 pytest: **353 passed**; frontend `tsc --noEmit`, Python compile, `git diff --check`: passed
- connected frontend/backend E2E: **56 passed**; password reset provider contract와 홈 장보기 큐 vertical slice를 포함함
- 카메라 프레이밍 crop: `CameraCapture`가 `object-fit: cover`의 화면 guide rectangle을 intrinsic video pixel로 매핑해 가이드 안쪽만 JPEG 입력으로 전달하고, layout metric이 없으면 전체 frame으로 fallback함. mock 640×480 crop E2E 1개와 TypeScript 검증은 통과했으며, 실제 기기·원근·반사·흐림·annotation 정확도는 별도 gate ([camera guide crop readback](../evidence/camera-guide-crop-readback-2026-09-05.md))
- isolated prototype full suite: `tests/prototype.spec.ts` **25 passed**(전용 direct-Vite runner); 일반 `npm run check:runtime`·full runtime 재실행은 OneDrive `public/assets/android/Keyboard.png` read `ETIMEDOUT`로 별도 blocked
- sanitized receipt fixture와 `750 1 750` amount-row regression: API `tests/test_pipeline.py` **16 passed**, 전체 API **301 passed**; 원본 이미지 OCR 정확도·실제 매장 coverage는 별도 benchmark gate ([receipt fixture readback](../evidence/receipt-fixture-readback-2026-09-05.md))
- quality-adaptive OCR input: 저대비·저조도 이미지에만 방향 정규화 후 dimension-preserving `autocontrast` 입력을 적용하고 `ocr_input_profile`을 응답하며, blur-only 입력은 source bytes/profile을 유지함; unit/API targeted readback passed. PaddleOCR UVDoc·원근/반사 보정·실제 accuracy uplift는 원본 bbox 역변환과 annotation benchmark 전까지 별도 운영 gate
- quality-adaptive OCR 회귀: 전체 API **306 passed**, OCR worker **2 passed**; FastAPI deprecation warning은 기존 범위
- 사장님 제공 라벨 구조 fixture: ambiguous `(포장)년·월·일`/`유효년·월·일`은 `unknown`, 날짜 없는 가공식품은 일반 EAN·`frozen` hint만 유지; label parser parameterized readback passed ([sanitized label fixture readback](../evidence/label-fixture-readback-2026-09-05.md))
- receipt GTIN vertical slice: 영수증 상품행 뒤 정상 GTIN을 14자리로 정규화해 draft·normalized receipt line·구매 lot에 보존하고, 매장 내부/가변중량 코드는 `null`로 보류함. review 화면의 사용자 선택 바코드 후보 조회·`mfds_c005` 후보 적용·GTIN 포함 commit을 connected E2E로 통과시켰으며, 제품 후보는 보관/출처 보조일 뿐 소비기한을 만들지 않음 ([receipt GTIN readback](../evidence/receipt-gtin-readback-2026-09-05.md))
- 현재 환경 disposable PostgreSQL 16 normalized readback: migration `001→018` 적용·18개 checksum skip, `/ready`, API receipt draft/commit, normalized receipt line·lot GTIN readback을 통과함. backup·concurrency·workspace lifecycle·operation pool readback은 기존 evidence를 유지하며, 운영 object-storage encryption/retention·managed failover·network partition은 별도 gate ([PostgreSQL live readback](../evidence/postgres-live-readback-2026-09-05.md), [receipt GTIN readback](../evidence/receipt-gtin-readback-2026-09-05.md))
- 최종 회귀(영수증 GTIN 기준): API 전체 **324 passed**, frontend `tsc --noEmit` passed, connected frontend/backend Playwright E2E **50 passed**. 새 receipt GTIN 시나리오는 line의 바코드 조회 → `mfds_c005` 후보 적용 → barcode 포함 commit까지 검증했으며, fixture-only runtime error의 console 출력은 해당 테스트 계약으로 허용된 기존 경계임
- planner quantity contract: `mg↔g↔kg`·`L↔ml`·`ml↔cc` 같은 동일 물리 차원만 환산하고 `팩↔개`·`모↔개`는 보류하도록 `quantity_match=exact|converted|incompatible|missing`을 planner·API·조리 UI에 연결함. 한국어/영문 metric alias·API JSON·기존 `팩` 조리 완료 회귀·`단위 환산`·`단위 확인 필요` connected UI를 확인했으며, API 전체 **327 passed**, frontend `tsc --noEmit` passed, connected frontend/backend Playwright E2E **52 passed** ([planner quantity contract readback](../evidence/planner-quantity-contract-readback-2026-09-05.md))
- 홈 장보기 큐 vertical slice: connected dashboard 성공 뒤 기존 `GET /api/shopping-list`를 홈 `SHOPPING LIST` 카드에 노출하고, lazy `ShoppingListSheet`에서 source·수량·체크 상태를 확인하도록 연결함. 조회 실패는 전체 offline 상태와 분리해 sheet 재시도로 회복하고, 체크/삭제는 기존 PATCH/DELETE 계약을 사용하며 계정 전환 중 이전 workspace 응답이 덮어쓰지 않도록 generation guard를 적용함. `POST /api/shopping-list/manual`로 식단과 무관한 물건을 추가하고 동일 상품·단위의 manual 기여를 갱신하는 흐름, 모바일 키보드가 열린 상태의 pointerdown 제출까지 연결함. connected E2E에서 홈 카드 → 목록 sheet → `aria-pressed=false/true` 체크 → 삭제 → 빈 상태 → `생수 2병 · 직접 추가` 추가와 GET 503 시 dashboard 연결 유지·sheet 재시도를 확인했고, 기존 목록 mutation까지 포함한 당시 회귀는 API **346 passed**, connected suite **55 passed** ([home shopping queue readback](../evidence/home-shopping-queue-readback-2026-09-05.md))

장보기 입고 확인 vertical slice: `ShoppingListSheet`에서 구매 수량과 냉장·냉동·실온 보관 위치를 확인한 뒤 `POST /api/shopping-list/{item_id}/receive`로 기존 lot을 보존하는 새 inventory lot을 생성함. `purchased_at`은 기록하지만 실제 소비기한은 `unknown`으로 두고, 상품명·보관 위치 기반 값은 AI 소비 우선순위 참고값으로만 표시함. recipe/multi-day source는 같은 요청에서 자동 정리하고 manual source는 충분한 수량 입고 시 checked history로 남기며, `Idempotency-Key` retry는 같은 lot을 replay함. API **348 passed**, connected suite **56 passed**로 수량·보관·source 제거·재시도 경계를 검증함 ([home shopping queue readback](../evidence/home-shopping-queue-readback-2026-09-05.md))

장보기 입고 durable idempotency hardening: 별도 `ShoppingListReceiveOperation` ledger를 SQLite와 PostgreSQL compatibility projection에 추가하고 migration `019_shopping_receive_operations.sql` 및 export/guest transfer에 연결함. lot을 전량 소비한 뒤 API를 재시작해도 같은 key가 새 lot을 만들지 않고 `409`가 되는 실제 disposable PostgreSQL readback, 원본 key 비노출 export, 19개 migration checksum skip, 두 API process의 동일 key 최초 동시 write 뒤 `201 + idempotency_replayed=true` replay recovery를 확인함. guest transfer preview/완료 응답의 operation 건수와 프론트 보류 import 판정도 연결함 ([shopping receive idempotency readback](../evidence/shopping-receive-idempotency-readback-2026-09-05.md)). 장시간 multi-process churn·failover·crash recovery는 별도 운영 gate

추가 multi-process receive smoke: 독립된 두 개의 단일 worker Uvicorn process를 같은 disposable PostgreSQL에 연결하고 하나의 guest workspace를 공유한 뒤 동일 key를 동시에 입고했다. 동일 payload는 두 응답이 `201 initial + 201 replay`이고 같은 lot을 가리키는지, `1 vs 2` 수량 payload conflict는 `201 + 409`로 차단되는지 확인했으며, 두 승자 lot을 소비하고 두 process를 종료한 다음 새 process에서 같은 key가 `409`로 차단되는 것도 확인했다. 이후 같은 workspace의 독립 item을 5라운드 연속 경합하는 bounded stress를 추가 실행해 operation ledger 6건과 재시작 후 6개 key의 `409`를 확인했고, CI workflow는 `rounds=4`로 연결했다 ([PostgreSQL multi-process receive readback](../evidence/postgres-multiprocess-receive-readback-2026-09-05.md)).
추가 crash recovery smoke: revision row를 실제 `FOR UPDATE`로 잠근 뒤 입고 중인 API process를 `SIGKILL`해 commit 전 transaction rollback을 확인하고, 두 번째 process의 `201 initial` 및 재시작 process의 동일 lot `201 replay`를 직접 readback했다 ([PostgreSQL crash recovery readback](../evidence/postgres-crash-recovery-readback-2026-09-05.md)). commit 직후 응답 전 crash·장시간 churn·rolling deploy·failover는 여전히 운영 acceptance다.
추가 post-commit crash recovery smoke: smoke 전용 middleware가 입고 handler의 `store.flush()` 반환 뒤, Uvicorn이 HTTP response를 보내기 전에 process를 `SIGKILL`하도록 구성했다. 클라이언트가 정상 응답을 받지 못한 뒤 두 번째 process와 재시작 process가 모두 동일 lot을 `201 replay`하고, operation/lot이 각각 1건인 것을 직접 readback했다 ([PostgreSQL post-commit crash readback](../evidence/postgres-post-commit-crash-readback-2026-09-05.md)). 실제 reverse proxy response reset·managed failover·network partition은 여전히 운영 acceptance다.
- OCR worker 운영 경계: `Dockerfile`과 Compose target을 `linux/amd64`로 고정하고 `PP-OCRv5_mobile_det + korean_PP-OCRv5_mobile_rec`, CPU 경로 `enable_mkldnn=False`, source pixel/max-side budget을 적용했다. `/health`는 모델 미초기화 liveness `200`, `/ready`는 실제 synthetic `predict()` warm-up 후 readiness `200`이 되며, 첫 predict backend 오류는 unavailable/`503`으로 차단한다. disposable worker에서 model import·synthetic text `complete`·사장님 제공 영수증 3장/라벨 2장 `complete`와 `oom=false`를 확인했고, worker unit **10 passed**·compile·Compose config도 통과했다 ([OCR worker readiness readback](../evidence/ocr-worker-readiness-readback-2026-09-05.md)). 매장별 annotation 정확도·cold/warm latency·memory·replica sizing·운영 reverse proxy는 별도 acceptance다.
- frontend build isolation readback: 현재 `apps/web` source를 local filesystem mirror에서 `npm run build`·protected runtime 28개 integrity·Vite 755 modules·Sites output과 `npm run test:sites` 4개를 통과시킴. 원래 OneDrive 작업트리의 직접 `check:runtime`은 `Keyboard.png` read `ETIMEDOUT`으로 별도 blocked이며, protected file과 lock은 수정하지 않음 ([frontend build readback](../evidence/frontend-build-readback-2026-09-05.md))
- CI web release gate는 demo build와 production build를 분리하고, production 쪽에는 실제 외부 endpoint 대신 HTTPS placeholder만 주입해 `VITE_DEPLOYMENT_MODE=production` fail-closed 경로를 검증함. 실제 API/TLS/CORS 연결은 staging acceptance로 남김

## 2026-09-06 continuation readback

- 모호한 라벨 review UI: `kind=unknown` 날짜도 원본 preview와 함께 유지하고, 날짜 종류·실제 보관 위치를 모두 선택하기 전에는 반영하지 않도록 고도화함. 날짜 없는 면은 OCR 상품명을 편집 가능한 직접 입력 초안으로 넘기며, 후보 날짜는 다시 의미를 선택할 수 있음
- 중단된 영수증 review 재개: connected 홈이 `review_required`·미반영 receipt summary를 `검수할 영수증` 카드로 노출하고, 사용자가 닫았던 draft를 `GET /api/receipts/{id}`로 다시 불러와 상품 검수 화면으로 복귀시킴. pending draft가 여러 개면 선택 sheet에서 원하는 영수증을 고를 수 있음. 원본 bytes는 저장하지 않으므로 재개 화면은 preview 없이 안전한 metadata·line 정보만 표시하고, 재고 commit은 기존 사용자 반영 단계 전까지 일어나지 않음
- receipt commit 동시성·재시도: 같은 receipt ID에 대한 API 프로세스 내부 동시 요청을 receipt별 lock으로 직렬화하고, 다른 프로세스는 기존 PostgreSQL workspace revision으로 차단함. deterministic fixture에서 `committed 1건 + 409 1건`, 생성 lot 1건과 lock registry lifecycle을 확인했으며, `Idempotency-Key`·payload fingerprint·transaction 결과 lot 목록을 normalized migration 020에 보존함. 실패 attempt 뒤 `needs_reconciliation`과 후속 `committed` transaction을 분리 보존하고, disposable PostgreSQL에서 migration `001→020` fresh apply → API process restart → 동일 key/payload `200 + idempotency_replayed=true`, 다른 payload `409`, receipt unique constraint `0개`, DB `1 lot + 1 transaction`을 직접 readback했으며, 같은 시나리오를 `.github/workflows/verify.yml`의 `postgres-live`에 `postgres_receipt_commit_idempotency_smoke.py`로 연결함 ([receipt commit concurrency readback](../evidence/receipt-commit-concurrency-readback-2026-09-06.md), [receipt commit idempotency readback](../evidence/receipt-commit-idempotency-readback-2026-09-06.md))
- account deletion durable fence: auth row를 `active → deleting`으로 먼저 원자 고정하고 workspace write guard와 일반 요청 `423 account_deletion_in_progress`로 중복 접근을 차단함. purge 또는 credential 삭제가 `503`으로 중단돼도 fence를 SQLite/PostgreSQL에 남기며, 같은 session의 delete 요청으로 재시도할 수 있고 `GET /api/auth/me`는 복구 UI를 위해 `account_status=deleting`만 반환함. SQLite restart·API failure injection·schema/readiness contract·기존 token login `401`·재시도 성공과 disposable PostgreSQL 두 process의 fence 대기·`423` 차단·purge·기존 token `401`을 확인하고, 최신 connected E2E **65 passed**에서 새로고침 후 삭제 진입점을 다시 발견하는 흐름까지 확인함 ([account deletion fence readback](../evidence/account-deletion-fence-readback-2026-09-06.md), [PostgreSQL multi-process account deletion readback](../evidence/postgres-account-deletion-multiprocess-readback-2026-09-06.md))
- account deletion crash recovery: revision row를 실제 `FOR UPDATE`로 잠근 상태에서 삭제 중인 API process를 `SIGKILL`하고, 대기 중 workspace transaction rollback·독립적으로 commit된 `deleting` fence 유지·재시작 후 같은 session delete resume·기존 token/login `401`·auth/reset-token/compatibility-food/normalized-lot/revision scoped rows `0`을 disposable PostgreSQL에서 확인함 ([PostgreSQL account deletion crash-recovery readback](../evidence/postgres-account-deletion-crash-recovery-readback-2026-09-06.md)). reverse proxy response reset·rolling deploy·managed failover·backup/WAL/object storage 보존은 별도 운영 acceptance
- notification delivery read-before-send 경계: worker가 tick 시작 시 현재 unread notification·연결된 push device snapshot을 만들고 기존 pending delivery와 대조해, 사용자가 이미 읽었거나 알림 대상·기기 연결에서 사라진 row를 외부 provider 호출 없이 `cancelled`로 보존하도록 고도화함. `cancelled`를 `dead_letter`·실제 provider 시도 건수와 분리하고 worker response/heartbeat에 카운트를 연결했으며, SQLite 재시작 후 상태 보존과 알림 설정 화면의 `읽음 후 취소` 표시까지 확인함. 해당 변경 시점의 notification delivery targeted **11 passed**, API 전체 **360 passed**, connected E2E **62 passed**를 통과했으며, 이후 최신 전체 회귀는 API **369 passed**·connected E2E **65 passed**로 갱신됨. 실제 외부 Push Service 수신·provider별 운영 acceptance는 별도 gate임 ([notification delivery cancellation readback](../evidence/notification-delivery-cancellation-readback-2026-09-06.md))
- 프론트 검증: local mirror의 TypeScript, `git diff --check`, 변경 frontend trailing whitespace 검사, 보호 runtime 28개 integrity, `npm run build`(Vite 757 modules + Sites output), `npm run test:sites` 4개, fixture·mobile runtime Playwright **34 passed**와 connected frontend/backend E2E **65 passed**를 확인함. build/runtime/Sites와 두 E2E suite 모두 현재 source를 복사한 local mirror에서 실행했으며, connected API는 disposable SQLite를 사용함
- 원래 OneDrive 작업트리의 `npm run check:runtime`은 `public/assets/android/Keyboard.png` dataless 파일 read `ETIMEDOUT`으로 여전히 직접 실행 불가. 보호 파일·lock은 변경하지 않았으며 “항상 이 장치에 유지” hydration 후 직접 gate를 다시 실행해야 함 ([label review UI readback](../evidence/label-review-ui-readback-2026-09-06.md))
- 영수증 review 재개 상세 경계와 fixture readback은 [receipt review resume readback](../evidence/receipt-review-resume-readback-2026-09-06.md)에 기록함
- 바텀시트 접근성 readback: 모든 sheet 전환을 app-owned helper로 통합해 controlled Radix dialog의 이름·제목·설명 semantics를 유지하고, `Escape` 종료 후 exit animation이 끝나면 원래 trigger로 포커스를 복귀함. fixture·mobile runtime **34 passed**, connected E2E **62 passed**, 보호 runtime 28개·TypeScript/Vite build를 현재 source mirror에서 확인했으며, common protected `BottomSheet`는 수정하지 않음 ([bottom-sheet accessibility readback](../evidence/bottom-sheet-accessibility-readback-2026-09-06.md))

### 다일 식단 최적화 readback

- 기존 `plan_recipe`가 materialize한 후보만 OR-Tools CP-SAT에 전달하고, 같은 recipe 중복 선택 금지·원래 lot 단위 capacity·최대 3일 연속 배치를 적용했습니다. 첫 CP-SAT 요청의 14.66초 cold import 지연은 FastAPI readiness 전 preload로 이동했고, 첫 readiness 이후 preview는 0.08초로 readback했습니다.
- custom lot-capacity/empty-inventory unit test와 API `optimization_engine` response contract를 통과했습니다. connected UI에는 `재고·중복 사용을 함께 최적화했어요.` provenance 안내를 연결했습니다. API 전체 **331 passed**, frontend TypeScript, connected frontend/backend Playwright E2E **52 passed**, `git diff --check`를 최종 확인했습니다.
- solver version/latency benchmark, nutrition·budget·servings·포장 단위 constraint, live PostgreSQL/Grocy mutation은 다음 acceptance gate입니다 ([multi-day optimizer readback](../evidence/multi-day-optimizer-readback-2026-09-05.md)).

## 결론

첫 번째 모바일 콘셉트를 기준으로 Rescue Meal의 핵심 수직 흐름을 로컬에서 실행·검증할 수 있는 상태입니다.

```text
홈 Rescue Queue
→ 식품 상세
→ 냉장·냉동·실온 보관 변경
→ 개봉·먹은 기록
→ 영수증 사진/샘플
→ OCR 후보 review
→ 식품 목록 반영
→ 라벨 실제 표시 날짜 확인
→ 바코드 상품 후보 조회
→ 제품 기준 정보 백그라운드 보강
→ 후보 적용 후 commit
→ 직접 입력
→ 먼저 먹을 재료 기반 식단 미리보기
→ 실제 allocation lot의 표시 날짜·보관조건 확인
→ workspace 알레르기 회피 조건 적용·unknown recipe 보류
→ 조리 순서·안전 메모 확인
→ 식단 저장
→ 홈 장보기 큐에서 부족 재료 확인·체크
→ 구매 수량·보관 위치 확인
→ 새 구매 lot 생성·계획 source 자동 정리
→ 저장 식단 최신 조회
→ 공개 레시피 review draft 수집
```

현재 구현은 “상용앱의 계약과 사용자 흐름을 먼저 검증하는 1차 vertical slice”입니다. OCR 모델, 실데이터베이스, Grocy 연동이 들어간 상용 운영판이라고 부를 단계는 아닙니다.

## 구현된 경계

### 모바일 프론트엔드

위치: `apps/web`

- 선택한 첫 번째 비주얼 방향의 warm ivory·sage·coral 톤과 모바일 카드 밀도 구현
- 템플릿 소유의 기기 프레임·상태바·키보드·safe-area 런타임 보존
- 홈 화면의 보관 수·Rescue Queue·전체 식품 목록·보관 위치 필터
- 식품 상세 sheet의 보관 위치 변경, 개봉 toggle, 먹은 기록
- 영수증 입력 sheet의 `사진 선택`과 샘플 영수증 review
- 영수증 후보별 선택/해제, 낮은 confidence의 `확인 필요` 표기
- 라벨 입력 sheet의 실제 표시 날짜 예시와 목록 반영
- 바코드 숫자 입력과 상품 후보 조회 상태
- 직접 입력 식품·수량·보관 위치 등록
- Rescue Meal 식단 preview·조리 가능 시간 선택·보유/부족 재료·조리순서·안전 메모·실제 저장·snapshot/audit 조회·lot별 사용량 조정·조리 완료·부분 차감 상태
- 실제 raster 식품 이미지 7종: 시금치·두부·닭가슴살·버섯·달걀·우유·토마토
- OCR optional adapter, 영수증 line parser, 라벨 날짜 의미 parser
- 이미지 intake의 `needs_ocr_engine`·`failed`·`review_required` 상태
- OCR text fixture를 review draft로 바꾸는 독립 API
- PostgreSQL + pgvector 초기 스키마와 Docker Compose baseline 선언
- 일반 GTIN·GS1 AI·가변중량 바코드 parser와 날짜 없는 상품의 abstaining backend inference
- `RESCUE_MEAL_SQLITE_PATH` 기반 local durable repository와 재시작 persistence 검증
- receipt commit coordinator의 snapshot rollback·재시도·중복 409·`needs_reconciliation` 기록
- 부분 수량 보관 이동·개봉·소비·폐기에서 부모 lot 수량을 줄이고 자식 lot/event를 남기는 흐름
- 폐기 전 확인 UI와 부분 폐기 기록, 복합 보관 변경 시 child lot 대상 순차 event 처리
- API 연결·동기화 상태 배지와 JSON/multipart 공통 8초 timeout, offline fallback 표시
- signed guest workspace token·request별 SQLite DB routing·auth-required 401 경계
- email/password account register·login·profile·logout과 빈 account workspace persistence
- 회원가입 직후 guest 기록 preview·명시적 account workspace import·보류 import 재확인·충돌 409·idempotent replay
- account password change와 session_version 기반 기존 token 즉시 무효화
- generic password-reset request·30분 one-time token·SQLite/PostgreSQL hash 저장·완료 후 session rotation과 reset URL query 제거
- secure Compose profile의 guest/register/login/password-reset/password-change rate limit·`Retry-After`와 opaque identity bucket
- Compose API 환경변수 전달·secure auth default·`/ready` auth/configuration gate와 readiness healthcheck
- API의 CSP·Permissions-Policy·frame/MIME/referrer security headers와 frontend hosting header 요구사항·카메라 권한 최소화
- Web Push delivery outbox·VAPID/pywebpush adapter·quiet hours·retry/dead-letter/410 cleanup·notification worker heartbeat contract
- storage mutation의 `Idempotency-Key`·deterministic event replay·key 충돌 `409`·network timeout 1회 재시도
- PostgreSQL revision conflict 시 route stale snapshot rollback 방지·명시적 `409` 전달
- receipt line별 distinct purchase lot·source provenance·InventoryRepository mutation seam
- workspace별 dashboard read-only offline cache·stale 상태 라벨·명시적 reconnect, workspace JSON export와 secret/raw receipt field 제외 경계
- 계정 화면의 Grocy 연결 상태·worker heartbeat·상품 매핑 검색/수정·상품별 before→after 변경 이력·실온/냉장/냉동 location 매핑·blocked/pending/dead-letter/reconciliation outbox 확인·저장·수동 재시도 UX
- server-side token revoke와 logout 후 동일 token 401 차단
- production build의 PWA manifest·service worker shell과 `/api`·write bypass 경계
- PostgreSQL DSN을 선택할 수 있는 projection repository 코드와 `rescue_api_*` schema
- PostgreSQL API projection의 workspace 복합키·workspace filter·account/revoke table adapter
- `002_inventory_authority.sql`의 workspace-scoped normalized product·receipt·line·lot·date·event·transaction tables와 명시적 `RESCUE_MEAL_INVENTORY_MODE=normalized` dual-write/read adapter
- PostgreSQL workspace revision guard와 stale snapshot reload/HTTP 409 충돌 계약
- `/health`·`/ready` liveness/readiness 분리, X-Request-ID correlation, secret-safe JSON access log middleware
- Grocy config·API key·system info status와 stock operation HTTP adapter, 상품·단위·보관 위치 mapping-aware receipt/storage-event outbox/processor
- 선택적 COOKRCP01 공개 레시피 importer/status endpoint, 원문 review draft와 source/license/revision 보존
- `services/api/scripts/import_cookrcp.py` 운영 CLI, bad row `rejected_rows` 격리, planner 자동 승격 차단
- protected recipe review API의 import/list/canonical review/approve/reject와 승인 recipe planner 연결
- account `ra1` token의 `user`·`recipe_admin` RBAC, shared recipe catalog, actor·snapshot audit event
- account 삭제의 현재 비밀번호·`DELETE` confirmation gate·account workspace purge·credential/reset token 삭제·기존 token 401 경계
- `?review=1` opt-in `RecipeReviewPanel`, runtime token 비저장·source provenance·license 확인 UX
- recipe starter fixture 30개 기반 planner v2의 exact/curated alias·단위·수량·여러 lot allocation·사용량 조정·조리시간·대안 메뉴·3일 preview·KST 날짜·source metadata·snapshot/audit 검증과 `preview → save → latest → complete` workspace persistence
- workspace별 알레르기 회피 조건 8종·중복 제거/고정 순서 정규화·curated recipe metadata filter·unknown external recipe abstain·MealPlan metadata·export/guest transfer 연결
- EXIF orientation이 있는 업로드를 quality 측정·OCR 입력 전에 정규화하고 원본 hash는 유지하는 이미지 intake 경계(`orientation_corrected` provenance)
- Python 3.12 PaddleOCR worker와 API remote OCR adapter
- OCR 응답의 detection/recognition model version trace
- Pillow 기반 해상도·밝기·대비·윤곽·focus image quality gate와 review warning
- local fixture 우선 상품 resolver와 Open Food Facts·식품안전나라 C005 feature-flagged 보조 조회, I1250 제품명 review endpoint, I1250 miss 뒤 Open Food Facts legacy name-search fallback, 제품 기준 기간·보관 힌트 provenance, workspace별 영수증 상품명 alias waterfall
- receipt draft를 막지 않는 I1250/Open Food Facts product enrichment job·service-token worker·workspace lease·retry/stale recovery·heartbeat와 review polling
- 실제 첨부 영수증을 프론트에서 선택해 동일 OCR draft를 review 후 commit하는 end-to-end 흐름
- ZXing Browser 기반 동적 카메라 바코드 scan과 카메라 실패 시 수동 입력 fallback

앱 코드의 주요 위치:

- `apps/web/src/Prototype.tsx`
- `apps/web/src/prototype.css`
- `apps/web/src/mealApi.ts`
- `services/api/app/auth.py`
- `services/api/app/grocy.py`
- `services/api/app/grocy_worker.py`, `services/api/scripts/run_grocy_worker.py`
- `services/api/app/product_enrichment.py`, `services/api/scripts/run_product_enrichment_worker.py`
- `apps/web/src/BarcodeScanner.tsx`, `ConnectionStatus.tsx`, `FoodHistory.tsx`, `DateAssertionEditor.tsx`
- `apps/web/public/assets/food/`

### FastAPI MVP

위치: `services/api`

- `/health`
- `/ready`
- `POST /api/auth/guest`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/account/guest-transfer/preview`
- `POST /api/account/guest-transfer`
- `POST /api/account/delete`
- `GET /api/notifications`
- `POST /api/notifications/{id}/read`
- `POST /api/notifications/read-all`
- `GET /api/integrations/grocy/status`
- `GET /api/integrations/grocy/mappings`
- `GET /api/integrations/grocy/mappings/{canonical_name}/events`
- `PUT /api/integrations/grocy/mappings/{canonical_name}`
- `GET /api/integrations/grocy/location-mappings`
- `PUT /api/integrations/grocy/location-mappings/{storage_type}`
- `GET /api/integrations/grocy/outbox`
- `POST /api/integrations/grocy/outbox/process`
- `POST /api/integrations/grocy/outbox/{id}/retry`
- `POST /api/integrations/grocy/outbox/reconciliation-scan`
- `POST /api/integrations/grocy/outbox/{id}/reconcile`
- `GET /api/integrations/grocy/worker/status`
- `POST /api/internal/grocy/workspaces/{workspace_id}/tick` — service token으로 호출하는 worker tick
- `GET /api/integrations/product-enrichment/worker/status`
- `POST /api/internal/product-enrichment/workspaces/{workspace_id}/tick` — service token으로 호출하는 I1250 우선·Open Food Facts fallback enrichment worker tick
- `GET /api/integrations/recipes/cookrcp/status`
- `POST /api/recipe-review/drafts/import`
- `GET /api/recipe-review/drafts`
- `PATCH /api/recipe-review/drafts/{draft_id}`
- `POST /api/recipe-review/drafts/{draft_id}/approve`
- `POST /api/recipe-review/drafts/{draft_id}/reject`
- `GET /api/recipe-review/drafts/{draft_id}/events`
- `GET /api/dashboard`
- `GET /api/products/by-barcode/{barcode}`
- `GET /api/products/resolve/{barcode}`
- `GET /api/products/resolve-name/{product_name}`
- `GET /api/product-aliases?q={상품명}`
- `POST /api/barcodes/parse`
- `POST /api/inference/priority` (기본 rules; optional Ollama fallback은 명시 설정 시 규칙 미매칭만 review-only 처리)
- `RESCUE_MEAL_SQLITE_PATH` — local 개발용 파일 영속화 선택지
- `RESCUE_MEAL_DATABASE_URL` — PostgreSQL projection repository 선택
- `POST /api/foods`
- `PATCH /api/foods/{food_id}/date-assertion`
- `POST /api/receipts/intake`
- `GET /api/receipts/{receipt_id}`
- `POST /api/receipts/{receipt_id}/product-enrichment`
- `GET /api/receipts/{receipt_id}/product-enrichment`
- `POST /api/receipts/{receipt_id}/product-enrichment/retry`
- `POST /api/receipts/parse-text`
- `POST /api/labels/intake`
- `POST /api/labels/parse-text`
- `POST /api/receipts/drafts`
- `POST /api/receipts/{receipt_id}/commit`
- `GET /api/commit-transactions`
- `POST /api/foods/{food_id}/storage-events` — 선택적 `Idempotency-Key`로 timeout 재시도 replay
- `GET /api/foods/{food_id}/storage-events`
- `POST /api/meal-plans/preview`
- `POST /api/meal-plans/options`
- `POST /api/meal-plans/multi-day-preview`
- `POST /api/meal-plans/multi-day` — 사용자가 승인한 3일 bundle 저장
- `GET /api/meal-plans/multi-day/latest` — 동일 workspace 최신 bundle 복원
- `GET /api/meal-plans/multi-day/history` — 저장 bundle history
- `POST /api/meal-plans`
- `GET /api/meal-plans/latest`
- `POST /api/meal-plans/{plan_id}/complete`
- `GET /api/meal-plans/history`
- `GET /api/shopping-list`
- `POST /api/shopping-list`
- `POST /api/shopping-list/{item_id}/receive`
- `PATCH /api/shopping-list/{item_id}`
- `DELETE /api/shopping-list/{item_id}`
- `GET /api/meal-preferences`
- `PUT /api/meal-preferences`

별도 OCR worker 위치: `services/ocr-worker`. Python 3.12 + PaddleOCR 3.7.0 + PaddlePaddle 3.3.1을 사용하며, API는 `RESCUE_MEAL_OCR_URL`로 worker를 선택합니다.

기본 저장소는 검증용 in-memory이고, 현재 열린 preview는 SQLite durable mode입니다. 응답 모델에는 다음 생산용 필드를 먼저 고정했습니다.

- 표시 날짜의 종류·값·출처·신뢰도·사용자 확인 여부
- `estimated_use_first_window`와 안전 면책 문구
- 상품 master 성격의 canonical name과 구매 수량·단위
- 보관 코드 `ambient`·`refrigerated`·`frozen`
- 영수증 fingerprint와 draft 상태
- line type, match confidence, review status
- 보관 이벤트의 이전/이후 위치와 수량
- `MealPreferences.avoid_allergens`와 recipe의 `allergens`·metadata 상태·preference filter reason

## 중요 안전 동작

1. 영수증 draft를 만드는 것만으로는 재고가 생성되지 않습니다.
2. 상품 라인이 아니거나 낮은 confidence인 항목은 review 상태로 남습니다.
3. 소비기한·유효년월일 등 라벨에서 확인된 날짜는 영수증의 추정값으로 덮어쓰지 않습니다.
4. 날짜가 없으면 `unknown` + `estimated_use_first_window`로 보관하고, 소비기한으로 이름을 바꾸지 않습니다.
5. 보관 위치 변경은 날짜 assertion을 변경하지 않고 storage event로 기록합니다.
6. 전체 소비·폐기는 현재 MVP 재고에서 제거하고, 부분 소비·폐기는 수량만 감소시키며 이벤트를 남깁니다.
7. API 어디에도 `safe_to_eat: true` 같은 자동 섭취 판정 필드를 만들지 않았습니다.
8. receipt line의 `storage_suggestion`은 참고값이고, 최종 `storage_type`은 사용자 확인 override로 lot에 기록합니다.
9. receipt `purchased_at`은 날짜 없는 상품의 추정 우선순위 reference date로 사용하며, account 401은 오프라인과 구분해 재로그인을 요구합니다.
10. 알레르기 회피 조건이 있으면 metadata가 겹치는 recipe와 metadata가 없는 외부 recipe를 추천하지 않으며, `known`은 알레르기 없음이나 의료적 안전을 뜻하지 않습니다.

## 2026-09-05 추가 검증 — optional local AI inference

상품명 기반 `/api/inference/priority`에 optional Ollama provider contract를
추가했습니다. 기본 `rules` 경로와 내부 재고 mutation은 그대로 유지하고,
`RESCUE_MEAL_INFERENCE_PROVIDER=ollama`일 때 규칙 미매칭 explicit request에만
Ollama `/api/chat`을 호출합니다. 모델에는 개봉 전 일수 범위만 요청하고 서버가
기준일·개봉일을 적용합니다. Pydantic structured output 재검증, 0.75 confidence
cap, 64KiB response bound, 1~30초 timeout, invalid output/장애 abstain을
검증했습니다. 실제 Ollama model download·운영 benchmark·모델 연결성은 아직
검증하지 않았습니다.

```text
services/api: test_inference.py + test_preflight.py → structured output success,
opened_at anchor, schema rejection, default rules, provider outage abstain,
Ollama configuration preflight passed
```

## 실제 검증 결과

### 정적·빌드

```text
apps/web: npm run check:runtime  → Mobile runtime integrity check passed (28 protected files)
apps/web: npm run build          → TypeScript + Vite build passed
services/api: uv run pytest      → 236 passed, 7 warnings
password reset provider contract → configured provider URL·Bearer token·reset URL payload 전달, API response token 비노출, bounded transient retry·per-token idempotency key·permanent 4xx stop
auth rate-limit contract → persistent SQLite/PostgreSQL atomic bucket·in-memory fallback·429·Retry-After·identity 비노출
password change rate-limit → account/IP bucket·wrong-password 401→429·Retry-After·identity 비노출·frontend 안내 passed
shared auth rate-limit readback → SQLite persistence·PostgreSQL advisory-lock SQL contract·opaque bucket passed; live database race 대기
shared auth rate-limit HTTP smoke → persistent SQLite API first `200`·second `429`·restart 후 `429` readback passed
backend priority inference trace → provider/version/rule/evidence/reasoning/input hash·compatibility/normalized readback passed; 개발용 rule snapshot 경계 유지
production configuration preflight → secure fixture pass·empty environment safe failure·secret non-disclosure·CI wiring passed; connectivity smoke test는 별도
PostgreSQL schema readiness → normalized table/column·inference trace 필수 field·missing-schema fail-closed FakeCursor contract passed; live PostgreSQL는 Docker daemon 부재로 미검증
PostgreSQL migration runner → ordered 001→010 dry-run/checksum·no-DSN apply failure·CI wiring passed; live apply는 backup/psql/Docker 환경 필요
PostgreSQL inventory search → `search_text`·`pg_trgm`·workspace/storage index migration, readiness required column/index gate, workspace-scoped COUNT/page SQL contract passed; live EXPLAIN/index/readback는 Docker daemon 부재로 미검증
services/api: uv run python scripts/import_cookrcp.py --help → passed
services/ocr-worker: uv run pytest → 2 passed
apps/web: `tests/prototype.spec.ts` → 16 passed (app E2E·receipt correction·storage picker·purchase provenance·notification center·inventory search·uploaded receipt source preview)·safe bbox overlay
apps/web: `tests/connected-prototype.spec.ts` → 38 passed (API 연결·receipt override·duplicate receipt conflict·account 401 re-auth·offline reconnect/cache fallback·receipt privacy·notification preference·workspace export·password change/session rotation·password change 429 안내·password reset request/link completion·storage mutation idempotency/network retry·notification read/food 이동·Grocy 설정·상품 mapping before→after 이력·dead-letter/reconciliation 복구·I1250 제품정보 보강·사용자 편집 보존·날짜 의미 보존·sell_by 라벨 저장 의미 보존·packaging_date 라벨 저장 의미 보존·AI 소비 우선순위 근거 표시·추론 불가 상태의 확인 필요 표시·GS1 날짜 후보와 상품 후보 동시 확인·recipe review·RBAC E2E·회원가입 후 guest workspace transfer·skip/reload 보류 transfer·계정 삭제 confirmation UI·계정 삭제 rate-limit 안내·조리 전 날짜 확인 callout·빈 workspace 첫 행동·server inventory search·inventory search page·inventory search retry·offline local search fallback·3일 bundle 저장/조건 일치 재진입 복원·bundle history 재열기·선택한 날짜 단일 plan 저장·bundle 날짜 progress·장보기 목록 생성/체크/삭제·날짜 선택·알레르기 조건 저장/재계산)·safe bbox overlay
apps/web: `tests/mobile-runtime.spec.ts` → 8 passed
apps/web: npm run test:sites     → 4 passed
infra: docker compose config     → default + grocy + notifications + product-enrichment profiles syntax/config expansion passed
sqlite: HTTP create → restart → readback → persisted
PaddleOCR: worker health + 5 image uploads → complete
PaddleOCR: 프론트 파일 선택 → review 10 lines + 원본 대조 preview → 동일 draft commit → dashboard readback → complete·상품 line bbox overlay
quality gate: 실제 receipt/produce label → pass → PaddleOCR → review_required
Grocy mock: mapping gap → blocked → mapping/unblock → transaction readback → succeeded
Grocy storage event mock: consume/open/transfer/discard → transaction readback → succeeded
Grocy dead-letter mock: 3회 실패 → dead_letter → manual retry → pending → passed
Grocy reconciliation mock: stale in_flight → reconciliation_required → explicit decision → passed
Grocy worker tick: workspace lease → reconciliation scan → bounded process → heartbeat → passed
Grocy worker HTTP: service token → API internal tick → heartbeat readback → passed
Notification worker HTTP: service token → API internal tick → VAPID disabled heartbeat → passed
Grocy mapping audit: 최초 연결·ID/단위 수정 → before/after readback → SQLite 재시작 → passed
InventoryRepository: 동일 상품 다중 receipt → distinct lot/provenance → partial mutation conservation → passed
Normalized inventory adapter: migration 010 review link/schema contract → explicit mode dual-write/read wiring → passed (FakeCursor contract)
Postgres concurrency guard: workspace revision mismatch → stale write rejected/reloaded → passed (FakeCursor contract)
Observability: request ID/header·readiness·secret-safe JSON formatter → passed
Security headers: API CSP·Permissions-Policy·X-Frame-Options·nosniff → passed; frontend hosting policy documented, delivery unverified
Notification delivery: outbox·VAPID adapter·worker lease/heartbeat contract·browser permission/subscription/native unsubscribe → passed; live external browser push unverified
Web Push browser integration → permission request·subscription PUT·server DELETE·native unsubscribe·permission denial 2 passed; fixture only, external Push Service receive unverified
Notification center: 표시 날짜/추정/미확인/Grocy → unread/read persistence → passed
Grocy isolated HTTP: configured 없는 receipt commit → not_configured, outbox 0개; worker service-token tick → heartbeat; no-Bearer processor/retry/internal tick → 401
Product enrichment worker: receipt draft enqueue → workspace refresh → workspace row-lock lease → I1250 provider mock/Open Food Facts fallback candidate → line source·provenance readback → passed; disabled provider leaves job queued
Open Food Facts name fallback: I1250 miss → legacy search mock → `open_food_facts` candidate·confidence·provenance·no date fields → API/worker readback passed; live coverage·legacy endpoint monitor remains open
Live receipt intake: attached sample → API 8000 → remote PaddleOCR 8002 → grocery draft 10 product lines → review_required → passed; verification draft deleted after readback
Live label intake: attached produce label → API 8000 → remote PaddleOCR 8002 → `packaging_date` candidate with `consumption_date_candidate=null` → passed
Image quality focus gate: clear/blurred synthetic documents → `blur_score` calibration·review warning → passed
Image orientation: EXIF orientation 6 → quality measurement/OCR input normalized·source hash preserved → passed
Frontend bundle: CSS animation·DeferredBottomSheet mount boundary → initial JS 481,347 bytes·gzip 151.50KB·CSS 95,594 bytes → passed; protected mobile barrel의 ineffective dynamic import warning은 기록됨
Mobile camera surface readback: 영수증·라벨 `getUserMedia` 후면 카메라 프리뷰·프레이밍 가이드·사진 보관함 fallback·OCR 실패 재촬영 CTA → [capture input readback](../evidence/capture-input-readback-2026-09-03.md)
```

현재 production build의 초기 client chunk는 `481.34KB`(정확히 481,347 bytes)이며, 기존 500KB advisory 아래로 내려왔습니다. Vite build report 기준 gzip은 `151.50KB`입니다. 카메라 scanner `437.95KB`, AddFood sheet `33.54KB`, account sheet `58.39KB`, food detail `9.51KB`, recipe review `10.26KB`, meal planner `32.39KB`, notification sheet `2.47KB`, guidance sheet `2.12KB`, storage history `2.06KB`, date assertion editor `1.80KB`, connection status `0.56KB`는 lazy chunk로 분리되어 사용 시점에 로드됩니다. notification center·receipt privacy·notification preferences·workspace export·password change·password recovery·account deletion·AI 소비 우선순위 근거·추론 불가 확인 필요·GS1 날짜 후보 확인·Web Push permission/subscription/unsubscribe·guest transfer·recipe alternatives·3일 meal preview·bundle 저장·bundle history·bundle 날짜 progress·장보기 목록·알레르기 조건 UI·빈 workspace/필터 상태 CTA·홈 날짜 확인 안내·재고 검색·서버 검색 page·영수증 원본 대조 preview·상품 line safe bbox overlay·라벨 날짜 safe bbox overlay·표시 날짜 수정 확인은 필요한 sheet가 열릴 때 로드되며 CSS 산출물은 `95,594 bytes`입니다. manifest·service worker도 production 정적 산출물에 포함됩니다. protected `mobile/index.ts` barrel 때문에 `INEFFECTIVE_DYNAMIC_IMPORT` warning이 남아 있고, 이를 module이 완전히 분리됐다는 증거로 해석하지 않습니다. BarcodeScanner는 `437.95KB` lazy chunk로 남아 있어 초기 화면 비용에는 포함되지 않습니다.

테스트 실행 시 FastAPI/Starlette의 `httpx` 관련 deprecation warning이 표시됩니다. demo/prototype E2E 16개와 mobile runtime 8개(합계 24개), 연결 E2E 38개, API 236개, OCR worker 2개, Sites 4개가 통과했습니다. 이번 라벨 날짜 원본 대조·영수증 원본 대조 preview·표시 날짜 수정 확인·단일 식단 재시도 시 3일 계획 날짜 연결 복구 변경 뒤에도 보호된 runtime 파일은 수정하지 않았습니다.

### 브라우저

Codex in-app Browser의 실제 `http://127.0.0.1:4173/` 화면에서 다음을 확인했습니다.

- 첫 화면 DOM과 모바일 화면 캡처
- 식단 sheet 열기와 저장 상태
- 식품 상세 sheet 열기
- 냉장 → 냉동 보관 변경 및 저장 toast
- 먹은 기록 후 보관 수 7 → 6, Rescue Queue 3 → 2 갱신
- 샘플 영수증 열기 → 후보 선택 해제 → 2개 반영
- 라벨 샘플 인식 → `유효년월일 2026.09.02` 실제 표시 상태
- 바코드 후보 조회 입력 상태
- 직접 입력 `파프리카` 2개·실온 등록
- API 연결 모드에서 냉장 → 냉동 변경 후 AI 우선순위 날짜 범위 재계산 확인
- API 연결 모드에서 닭가슴살 2팩 중 1팩만 냉장으로 이동해 원본 1팩 + child lot 1팩으로 분리되는 readback 확인
- API 연결 모드에서 2팩 중 1팩 이동 + 개봉을 함께 저장해 child lot에만 `opened: true`가 붙는 readback 확인
- API 연결 모드에서 상세 sheet를 다시 열어 storage event history를 readback하는 경로 확인
- 앱 E2E에서 추정 날짜 두부를 상세 sheet의 `소비기한 + 2026-09-12`로 사용자 확인 저장하고, 실제 연결 API에서는 추정 window 제거·이전 `unknown` history 보존을 readback
- API 연결 모드에서 `서버 연결됨`, dashboard cache가 없는 오프라인 상태에서 `오프라인 · 임시 화면`, 마지막 성공 dashboard 뒤 reload 단절에서 `오프라인 · 최근 화면`과 stale 안내 표시 확인
- 실제 연결 모드에서 guest session 발급·Bearer dashboard readback과 서버 재시작 후 동일 workspace 재고 readback 확인
- 실제 연결 모드에서 같은 SQLite 파일로 API를 재시작한 뒤 동일 guest workspace의 저장 식단 `저장됨` 상태 복원 확인
- 두 guest workspace 중 한 곳에만 식품을 추가한 뒤 inventory count `8 / 7` isolation 확인
- `AUTH_REQUIRED=true` 별도 process에서 무인증 401·guest 200·유효 token 200·변조 token 401 확인
- 실제 연결 프론트에서 account register·login profile·logout 후 guest workspace 전환 확인
- 실제 연결 프론트에서 account register 후 guest 기록 preview·명시적 import·skip 후 reload 재확인·source workspace 보존 확인
- transfer import 이후 source lot 내용이 바뀌면 snapshot fingerprint 불일치로 재요청 `409`가 되는 것을 API·live HTTP에서 확인
- Grocy 미설정 연결 프리뷰에서 integration status `disabled` 확인; mock transport operation contract는 API 테스트에서 확인
- 연결 모드에서 guest token·dashboard·레시피 preview·조리순서·save toast를 실제 브라우저로 확인
- 연결 모드에서 `조리 완료로 기록` 후 matched lot 소비 event와 dashboard 재고 7→5 갱신을 실제 브라우저로 확인
- 연결 모드에서 `식단 조건 설정`의 대두·콩 chip 선택·저장 성공·추천 재계산 안내를 확인했습니다. 이 테스트의 preferences endpoint는 suite 간 workspace 상태 오염을 막기 위해 브라우저 route mock으로 격리했습니다.
- 연결 모드에서 계정 삭제 패널의 기본 접힘·현재 비밀번호·정확한 `DELETE` 확인 문구·제출 disabled gate를 확인했습니다. 삭제 endpoint는 브라우저 테스트에서 격리 mock으로 처리하고, 실제 workspace purge·token 차단은 별도 live HTTP readback으로 확인했습니다.
- receipt/storage event 응답에서 Grocy `not_configured` 상태를 확인하고, configured mock에서는 `needs_mapping`→`queued`→`succeeded` processor flow와 consume/open/transfer/discard operation을 API로 확인
- account 설정 connected E2E에서 상품 mapping 최초 연결·ID 수정 후 상품별 `before → after` 이력, dead-letter 재시도와 stale in-flight scan 후 transaction ID 기반 `already_applied` reconciliation을 확인
- API readback에서 시금치 0.5팩+0.5팩 multi-lot allocation과 lot별 소비 event 2개를 확인
- connected E2E에서 닭가슴살 사용량 1팩→0.5팩 조정 후 pantry 잔량 1.5팩을 확인
- API에서 `consumed_allocations`에 lot별 사용량·단위를 저장하고 `kg↔g` metric conversion fixture를 통과
- API에서 snapshot hash 충돌·save/complete audit event를 확인
- connected E2E에서 `식단 기록 보기`로 저장 audit과 snapshot hash를 화면에 표시하는 것을 확인
- connected E2E에서 완료 후 `최근 식단 보기`로 이전 plan의 조리 완료 상태를 다시 표시하는 것을 확인
- 연결 모드에서 서버 알림을 열고 날짜 알림을 읽음 처리한 뒤 해당 식품 상세로 이동하는 것을 확인
- `?review=1`에서 operator review panel을 열고 pending source draft·provenance·license checkbox·승인 안내를 표시하는 것을 확인
- review token을 body에 렌더링하지 않고, token 미설정 API의 `503`을 사용자 안내로 처리하는 것을 확인
- production build의 `manifest.webmanifest`·`sw.js` 생성과 Sites packaging 파일 확인
- 앱 E2E 16개: 홈 상세 저장·계정 sheet·notification center·영수증 correction/storage picker·receipt 구매 출처 표시·업로드 영수증 원본 대조 preview·라벨 확인 반영·바코드 후보 조회·카메라 실패 fallback·추정 날짜 확정·부분 lot 이동·부분 폐기 확인·보관 필터·demo 레시피 저장/완료·재고 검색/결과 없음/초기화·safe bbox overlay
- 연결 모드 E2E 38개: 실제 API dashboard·receipt override·duplicate receipt conflict·account 401 re-auth·offline reconnect·dashboard cache fallback·receipt privacy metadata 삭제 경계·notification preferences 저장·workspace export download·password change/session rotation·password change 429 안내·password reset request generic response·password reset link completion·storage mutation idempotency/network retry·notification read/food 이동·preview·조리순서·save·latest 복원·complete·최근 식단·조리시간·CORS 경계·Grocy 설정·상품 mapping 이력·recipe review surface·recipe_admin token 없는 접근·barcode 제품 기준 기간/보관 힌트 후보 카드·회원가입 guest transfer·skip/reload 보류 transfer·계정 삭제 confirmation UI·계정 삭제 rate-limit 안내·조리 전 날짜 확인 callout·빈 workspace 첫 행동·server inventory search·inventory search page·inventory search retry·offline local search fallback·3일 bundle 저장/같은 조리시간 재진입 복원·bundle history 재열기·선택 날짜 단일 plan 저장·bundle 날짜 progress·장보기 목록 생성/체크/삭제·날짜 선택·알레르기 조건 저장/재계산

프론트 연결 모드에서는 `VITE_API_BASE_URL=http://127.0.0.1:8000`을 사용했고, 현재 열린 preview API는 `storage: sqlite-local`로 실행 중입니다. Uvicorn 로그에서 dashboard, storage event, receipt draft/commit, manual food 요청과 guest→account transfer preview/import/replay를 확인했습니다.

OCR text endpoint에는 실제 샘플 구조를 축약한 fixture를 보내 상품명·단가·수량·합계 분리와 할인 line 제외를 확인했습니다. PaddleOCR remote image endpoint에는 사용자 첨부 영수증·라벨을 보내 품질 gate `pass`, model version, 실제 `review_required` draft와 날짜 후보를 확인했습니다. OCR worker가 없을 때는 별도 환경에서 `needs_ocr_engine`과 `draft: null`을 확인했습니다. GS1 괄호형·`]d2` element string·Digital Link fixture와 상품명 기반 priority inference도 별도 테스트했습니다. SQLite 모드에서 직접 등록한 식품이 서버 재시작 뒤에도 남는지 HTTP readback으로 확인했습니다.

commit coordinator fixture에서는 두 번째 line 처리 실패를 주입해 재고가 7개에서 변하지 않는지, `needs_reconciliation` transaction이 남는지, 원인 제거 후 재시도가 9개를 만들고 중복 재시도가 409인지 확인했습니다.

사용자 첨부 영수증·라벨 원본의 macOS Vision 기준선과 bbox grouping 결과는 [Vision OCR parser benchmark](../evidence/vision-ocr-parser-benchmark-2026-09-01.md), 실제 PaddleOCR 결과는 [PaddleOCR benchmark](../evidence/paddleocr-benchmark-2026-09-01.md), 부분 lot의 HTTP parent/child readback은 [partial lot readback](../evidence/partial-lot-readback-2026-09-01.md), storage event history는 [storage history readback](../evidence/storage-history-readback-2026-09-01.md), 추정 날짜 확정 readback은 [date correction readback](../evidence/date-correction-readback-2026-09-01.md), guest workspace isolation과 account revoke는 [auth workspace readback](../evidence/auth-workspace-readback-2026-09-01.md), PostgreSQL tenant-aware projection contract는 [PostgreSQL tenant contract](../evidence/postgres-tenant-contract-2026-09-01.md), Grocy HTTP adapter는 [Grocy adapter contract](../evidence/grocy-adapter-contract-2026-09-01.md), Grocy mapping/outbox contract는 [Grocy sync readback](../evidence/grocy-sync-readback-2026-09-02.md), PWA manifest·service worker는 [PWA build evidence](../evidence/pwa-build-2026-09-01.md), planner v2·조리 완료는 [planner v2 completion readback](../evidence/recipe-planner-completion-readback-2026-09-02.md), 바코드 camera adapter와 fallback 경계는 [barcode camera flow](barcode-camera.md), 상품 후보·C005 legacy·bounded cache 경계는 [product resolver](product-resolver.md), 연결 상태와 timeout은 [connection status](../evidence/connection-status-2026-09-01.md)에 기록했습니다.
guest→account 명시적 복사·원본 보존·skip/reload 보류 import·재요청 idempotency는 [guest account transfer readback](../evidence/guest-account-transfer-readback-2026-09-03.md)에 기록했습니다. password change의 account/IP rate limit·`429`·`Retry-After`·identity 비노출은 [password change rate-limit readback](../evidence/password-change-rate-limit-readback-2026-09-03.md)에 기록했습니다.
Pillow `blur_score` focus warning과 기존 image quality gate calibration은 [image quality focus readback](../evidence/image-quality-focus-readback-2026-09-03.md)에 기록했습니다. recipe options endpoint·대안 선택·preview-only side effect 경계는 [recipe alternatives readback](../evidence/recipe-alternatives-readback-2026-09-03.md)에 기록했습니다. multi-day preview·allocation 차감·Asia/Seoul 날짜·날짜별 선택은 [multi-day meal preview readback](../evidence/multi-day-meal-preview-readback-2026-09-03.md)에, bundle 저장·idempotent retry·최신 복원·SQLite/PostgreSQL projection 계약은 [multi-day meal bundle readback](../evidence/multi-day-meal-bundle-readback-2026-09-03.md)에 기록했습니다.
장보기 목록의 명시적 source 동기화·중복 방지·재고 보충 시 GET 자동 재정리·체크/삭제·SQLite/PostgreSQL projection은 [shopping list readback](../evidence/shopping-list-readback-2026-09-03.md)에 기록했습니다.
장보기 항목의 구매 수량·보관 위치 확인·새 lot 생성·소비기한 미확정·recipe source 자동 정리·manual checked history·Idempotency-Key replay는 [홈 장보기 큐 readback](../evidence/home-shopping-queue-readback-2026-09-05.md)에 기록했습니다.
workspace 알레르기 회피 조건의 중복 제거·curated recipe filter·unknown metadata abstain·SQLite/PostgreSQL projection·export/guest transfer 계약과 연결 UI는 [meal preferences readback](../evidence/meal-preferences-readback-2026-09-03.md)에 기록했습니다.
계정 삭제의 비밀번호·확인 문구·workspace purge·credential 삭제·기존 token 차단은 [account deletion readback](../evidence/account-deletion-readback-2026-09-03.md)에 기록했습니다.
스마트폰 EXIF 방향 보정과 원본 hash/OCR input 분리 readback은 [image orientation readback](../evidence/image-orientation-readback-2026-09-03.md)에 기록했습니다.
공개 레시피 source adapter·review draft·bad row 격리·CLI 결과는 [COOKRCP01 importer readback](../evidence/recipe-importer-readback-2026-09-02.md), 운영 경계와 승격 기준은 [공개 레시피 importer 운영 경계](recipe-importer.md), protected review workflow와 화면 readback은 [recipe review readback](../evidence/recipe-review-readback-2026-09-02.md)에 기록했습니다.
InventoryRepository의 receipt line별 distinct lot·provenance·partial mutation 결과는 [inventory authority readback](../evidence/inventory-authority-readback-2026-09-02.md), workspace notification center와 읽음 persistence는 [notification readback](../evidence/notification-readback-2026-09-02.md)에 기록했습니다.
영수증으로 생성된 lot의 구매일·원본 line 연결을 상세 화면에서 확인하는 흐름은 [purchase provenance readback](../evidence/purchase-provenance-readback-2026-09-02.md)에 기록했습니다.
영수증 원본 bytes의 비저장 정책, 미반영 draft 삭제, commit metadata 비식별화와 재고 보존 결과는 [privacy lifecycle readback](../evidence/privacy-lifecycle-readback-2026-09-02.md)에 기록했습니다.
workspace별 알림 선호·Web Push subscription 저장/해지·service worker click 경계는 [notification delivery readback](../evidence/notification-delivery-readback-2026-09-02.md)에 기록했습니다.
receipt product enrichment job·I1250 worker lease/retry/heartbeat·background enqueue UI 경계는 [product enrichment readback](../evidence/product-enrichment-readback-2026-09-03.md)에 기록했습니다.
workspace 업무 데이터를 secret/raw field 없이 JSON으로 내려받는 경계는 [data export readback](../evidence/data-export-readback-2026-09-02.md)에 기록했습니다.
account password change와 session version rotation 결과는 [account security readback](../evidence/account-security-readback-2026-09-02.md)에 기록했습니다.
account password reset의 generic request·one-time completion·session rotation·URL query 제거 결과는 [account recovery readback](../evidence/account-recovery-readback-2026-09-02.md)에 기록했습니다.
Compose의 auth env 전달·`/ready` 보안 gate·readiness healthcheck 결과는 [Compose readiness readback](../evidence/compose-readiness-readback-2026-09-02.md)에 기록했습니다.
storage event의 timeout 재시도·동일 event replay·key 충돌 차단 결과는 [mutation idempotency readback](../evidence/mutation-idempotency-readback-2026-09-02.md)에 기록했습니다.
revision conflict route가 stale snapshot을 복원하지 않고 `409`로 전달하는 경계는 mutation idempotency readback과 API concurrency contract에 반영했습니다.
sheet lazy loading과 초기 bundle budget 개선 결과는 [bundle optimization readback](../evidence/bundle-optimization-readback-2026-09-02.md)에 기록했습니다.
X-Request-ID·`/ready`·secret-safe structured access log 결과는 [observability readback](../evidence/observability-readback-2026-09-02.md)에 기록했습니다.

## 아직 실제 구현으로 주장하면 안 되는 것

- 모든 매장·라벨 조건에서의 PaddleOCR 운영 정확도 및 품질 gate threshold 적합성
- 실제 iPhone/Android 카메라 권한·포장 조건에서 ZXing/GS1 인식률
- 한국 마트 영수증의 범용 템플릿 지원
- 상품명만으로 소비기한을 확정하는 기능
- Open Food Facts·식품안전나라의 실제 운영 key/coverage·legacy name-search 운영 quota·Grocy live external stock mutation·PostgreSQL 정규화 domain-table 실연동 (Open Food Facts v3.6 product readback·mock name-search fallback·PostgreSQL shared product/name cache와 provider별 rate-limit/single-flight cross-connection readback은 확인했지만, 실제 운영 key/coverage·provider backup/restore/failover·Grocy/정규화 domain 운영 acceptance는 미검증)
- OAuth 계정·권한 모델·실제 password-reset email provider·원본 영수증 저장소의 외부 lifecycle/법적 보존정책 운영 (현재 API는 reset core와 원본 bytes 비저장·receipt metadata 삭제/비식별화 경계만 구현)
- 실제 browser push service 수신·운영 VAPID key 주입·provider delivery readback, 메일/ntfy 채널, 사용자별 timezone·보상 트랜잭션
- 상태 사진만으로 부패 여부나 섭취 가능 여부를 판정하는 기능
- 식품안전나라 COOKRCP01에 대한 실제 운영 key 호출·rate limit·이용조건 승인
- 조직별 role policy·OAuth·review audit 보존/retention 운영 구현
- 외부 recipe별 알레르기 metadata coverage·교차 접촉(`may contain`) semantics·관할별 법정 항목·도메인 검토가 완료된 알레르기 안전 기능

현재 열린 preview는 signed guest/account token으로 SQLite workspace를 선택한 뒤 Pillow 품질 gate와 PaddleOCR remote worker를 사용해 이미지 intake를 실제 처리합니다. worker가 없는 기본 API 모드는 `needs_ocr_engine`을 반환하고, OCR text fixture parser는 독립적으로 실행됩니다. SQLite local workspace repository와 disposable PostgreSQL normalized projection readback은 연결됐습니다. 상품 resolver는 local fixture·mock Open Food Facts 바코드·mock Open Food Facts legacy name search·mock C005·mock I1250 응답과 product/name bounded cache 경계를 테스트했으며, 사용자 서비스에서 외부 lookup은 feature flag가 꺼져 있습니다. C005·I1250의 제품 기준 `POG_DAYCNT`와 Open Food Facts 검색 후보는 참고값으로만 표시되고 개별 팩 소비기한으로 승격되지 않습니다. 영수증 OCR 상품명은 workspace별 사용자 확인 alias·local rule·parser 후보로 분리되고, I1250 miss 뒤 Open Food Facts candidate도 source/provenance와 함께 review 단계에서만 재사용할 수 있습니다. distinct purchase lot·부분 lot 이동·복합 개봉·부분 폐기·workspace isolation·email/password account auth·token revoke·password reset core·recipe-linked complete·workspace notification/read state·notification delivery outbox/worker disabled tick은 API pytest와 앱 E2E/연결 readback에서 검증했으며, normalized production DB·외부 재고 시스템의 동일 transaction/readback과 OAuth·실제 reset email delivery·실제 browser push 수신은 아직 남아 있습니다. 전체 template runtime은 이번 isolated run에서 8개 모두 통과했습니다.

normalized inventory adapter, additive migration, workspace revision guard, and operation-scoped workspace pool은 disposable PostgreSQL에서 migration `001→017`·normalized mode startup·API restart·보관조건 readback·두 connection stale overwrite guard·pool exhaustion/persistence/shutdown까지 실행했습니다. custom backup/빈 DB restore도 disposable 환경에서 확인했지만 운영 backup object encryption/retention·shared owner 통합·multi-process aggregate sizing·failover·network partition은 여전히 별도 acceptance입니다.

## 다음 구현 순서

1. 운영 PostgreSQL의 backup object encryption/retention·shared owner pool sizing·managed failover·network partition과 normalized-only 운영 전환을 검증하고 Product·Receipt·ReceiptLine·StockLot·DateAssertion·StorageEvent·MealPreferences readback을 닫는다. API process aggregate cap은 production preflight와 disposable `SHOW max_connections` readback으로 닫았지만 rolling deploy·장시간 churn은 남아 있다.
2. 현재 Pillow gate와 camera guide crop을 유지하면서 원근·반사까지 확장하고 benchmark annotation으로 threshold를 calibration한다.
3. 2~3개 영수증 유형의 실제 이미지 parser fixture를 만들고 line type/discount/refund/합계 분류를 고정한다.
4. 현재 ZXing Browser camera adapter를 실기기와 GS1 DataMatrix fixture에 연결하고 GS1 Syntax Engine·Python parser 결과를 대조한다.
5. MFDS I1250·Open Food Facts 후보 waterfall을 실제 운영 key·coverage·legacy search quota와 annotation benchmark로 검증하고 검토된 rule snapshot을 rule retriever에 연결한다. 2026-09-05 read-only probe에서는 v3.6 barcode read는 성공했지만 legacy name search가 HTTP 503이어서 adapter의 rate-limited/review recovery를 확인했을 뿐이며, 정상 검색 coverage는 아직 승격하지 않는다. optional Ollama provider는 annotation benchmark를 통과한 category에만 승격한다.
6. 현재 commit coordinator와 `grocy-worker`를 live container에 연결하고 product ID/unit/location mapping·mapping audit retention·부분 실패·재시도·외부 readback·실제 in-flight reconciliation·다중 workspace lease를 검증한다.
7. 현재 shared recipe catalog의 조직별 RBAC·review actor audit 보존정책과 allergen metadata/교차 접촉 semantics를 고도화하고, 승인 recipe를 원출처·canonical ingredient·lot snapshot이 있는 30~50개로 확장한 뒤 OR-Tools Rescue Planner를 연결한다.
8. OAuth·외부 password-reset email delivery·외부 upload retention, 실제 browser push acceptance와 shared delivery storage, 모바일 PWA 운영 검증을 추가한다.

각 단계에서도 실제 표시 날짜와 AI 소비 우선순위를 분리하는 현재 계약을 유지해야 합니다.

추가 PWA 운영 UX 검증: service worker의 install takeover를 사용자 승인 전까지 보류하고,
navigation은 network-first·정적 asset은 destination 제한 stale-while-revalidate로
분리했습니다. `/api/`·write·동적 GET은 cache에서 제외하고, 기존 controller의 waiting
worker는 `새 버전이 준비됐어요` 안내에서 사용자가 `새로고침`을 눌렀을 때만
`SKIP_WAITING`·`controllerchange` reload를 수행합니다. `npm run test:service-worker`
**5 passed**, Sites **4 passed**, protected runtime **28개**, Vite **757 modules**,
fixture/mobile **34 passed**, connected E2E **62 passed**를 fresh local mirror에서
확인했습니다. 실제 release 간 worker update·iOS/Android standalone 설치·CDN quota는
별도 운영 acceptance입니다 ([PWA update/cache readback](../evidence/pwa-update-cache-readback-2026-09-06.md)).

추가 workspace read lifecycle 검증: `WorkspaceSyncCoordinator` Module이 dashboard·알림·
장보기·재고 검색·receipt summary와 계정 설정 read/export를 opaque workspace key와
workspace/channel request ticket으로 통합했습니다. 계정 전환·로그아웃·인증 오류에서는
전체 read를 invalidate하고, account panel은 workspace ID key로 재생성합니다. provider
준비 실패도 최신 request intent를 예약하므로 이전 workspace 응답이 되살아나지 않으며,
같은 channel의 새 실행·invalidate는 실제 `AbortSignal`을 `mealApi` fetch까지 전달합니다.
성공한 mutation은 raw token 없이 `BroadcastChannel` 우선·`localStorage` fallback으로
같은 workspace의 다른 탭에 channel invalidation을 전달합니다. Coordinator/transport
contract **8 passed**, PostgreSQL stale revision precondition·structured 409 API test와
revision header propagation·notification worker metric endpoint·read-only POST exemption을 포함한 API 전체 **364 passed**(7 warnings), connected E2E
**64 passed**, fixture/mobile **34 passed**, protected runtime **28개**, Vite **757 modules**,
Sites **4개**를 fresh local mirror에서 확인했습니다. notification worker cancellation
reason metric과 token-protected Prometheus scrape도 추가했으며, 여러 replica의 collector
합계/retention/alert·자동 merge·managed PostgreSQL failover/network partition은 별도 운영
acceptance입니다
([workspace sync readback](../evidence/workspace-sync-readback-2026-09-06.md)).

추가 PostgreSQL direct owner 복구 검증 (2026-09-07): base snapshot·auth
repository·shared product/name cache·recipe catalog가 공용으로 사용하는 direct
connection을 `ReconnectablePostgresConnection`으로 감쌌습니다. connection 수립만
bounded retry하고, 끊긴 query/fetch/commit은 자동 replay하지 않으며 현재 요청을
`503`으로 끝낸 뒤 다음 요청에서 새 connection을 사용합니다. 별도 disposable
PostgreSQL에서 고유 `application_name`을 가진 API process의 backend 4개를 실제
종료한 뒤 `/ready`·`/api/auth/me`·기존 inventory read·복구 후 신규 write·account
scoped cleanup을 모두 확인했고, cleanup 실패 시에도 생성된 workspace/account만
정리하도록 smoke를 보강했습니다. API 전체 **377 passed**, connected E2E
**65 passed**, direct connection targeted **6 passed**, preflight/pool/contract
targeted **56 passed**, Python
compile과 diff check를 통과했습니다. 이 결과는 의도적인 backend termination
복구를 증명하며 managed failover·network partition·backup object retention은
아직 운영 acceptance입니다 ([PostgreSQL direct connection recovery readback](../evidence/postgres-direct-connection-recovery-readback-2026-09-07.md)).

추가 웹 테스트 lane 분리 검증 (2026-09-07): 기본 `playwright.config.ts`가 API를
기대하는 `connected-prototype.spec.ts`까지 수집해 fixture-only Vite 서버에서
연쇄 실패하던 경계를 `testIgnore`로 분리했습니다. 기본 `npm run test:runtime`은
fixture/mobile **34 passed**, Web Push 환경변수 미설정으로 **2 skipped**가 되었고,
connected API/browser 검증은 기존 별도 config의 **65 passed**를 유지했습니다.
CI web job에도 Chromium 설치와 기본 runtime test를 추가해 build/Sites만 통과하는
공백을 제거했습니다.

추가 receipt draft 멱등성 검증 (2026-09-07): 같은 workspace에서 동일한 receipt
fingerprint의 pending draft를 process별 lock과 PostgreSQL workspace revision으로
수렴시켰습니다. fingerprint는 구매일·매장·template·line 세부값을 포함한
validated full-input hash로 확장해 매번 `image.jpg`인 다른 구매가 합쳐지지
않게 했고, 기존 legacy fingerprint는 persisted safe field를 추가 대조합니다.
같은 draft를 재사용한 응답에는 `X-Idempotency-Replayed: true`를 붙이며,
flush 실패 시 process-local phantom draft를 복원합니다. 두 API process의 실제
동시 PostgreSQL 요청에서 `201 initial + 201 replay`, 동일 draft ID 1개,
compatibility receipt 1개·normalized receipt 1개를 readback했습니다. API 전체
**382 passed**와 [receipt draft idempotency readback](../evidence/receipt-draft-idempotency-readback-2026-09-07.md)을
확인했으며, 의미적으로 같은 영수증인지 판정하거나 원본 image/PDF를 저장하는
기능은 아닙니다.

추가 meal-plan 저장·조리 완료 race 검증 (2026-09-07): preview의 `plan_id`와
다일 저장의 `bundle_id`에 process별 lock을 추가하고, PostgreSQL revision
conflict 뒤 승자 plan을 replay하도록 보강했습니다. plan별 동시 완료는 한 요청만
현재 lot를 소비하고 다른 요청은 `already_completed`로 회복합니다. 두 API
process live smoke에서 저장 `200 initial + replay`, completion
`completed + already_completed`, plan 1개, saved/completed audit 각 1개,
compatibility/normalized consumed event 각 3개를 readback했습니다
([meal-plan idempotency readback](../evidence/postgres-meal-plan-idempotency-readback-2026-09-07.md)).

추가 normalized receipt review metadata parity 검증 (2026-09-07): receipt draft
idempotency cross-process smoke를 확장해 normalized loader가
`template_id`·`template_confidence`·`merchant_name`을 재시작/경합
후에도 반환하는지 확인했습니다. `022_receipt_review_metadata.sql` additive
migration을 추가하고 당시 범위의 `001→022` fresh apply·checksum ledger 22개·재실행 skip을
통과시켰습니다. live 결과는 `initial=201`, `replay=201`, 동일 draft ID
1개, compatibility/normalized receipt 각 1개,
`metadata_preserved=true`입니다. 기존 migration checksum은 수정하지 않았고,
기존 volume은 ordered `migrate.sh --apply`가 필요합니다.

추가 수동 식품 lot 경계 검증 (2026-09-07): `POST /api/foods`의 기존 이름 기반
무조건 upsert를 `lot_action=create|correct` intent로 분리했습니다. target 없는
직접 입력은 같은 상품명이어도 새 lot을 만들고, 라벨·GS1 또는 제품 후보 보정은
사용자가 선택한 `target_food_id`를 사용합니다. legacy label 보정은 정확히 한 lot일
때만 허용하며 다중 lot은 `food_lot_selection_required` 409로 차단합니다. 이미
trusted 날짜가 다른 값으로 덮어써지지 않고, unknown에서 처음 확인된 날짜로
승격될 때만 history를 append하며 target의 수량·단위·구매/개봉 provenance를
보존합니다. API 전체 **393 passed**, protected runtime **28개**, Vite **757
modules**, fixture/mobile **35 passed + 2 skipped**, 연결 라벨 payload
`lot_action=correct + target_food_id` 회귀를 포함한 connected E2E **66 passed**를
임시 local mirror에서 확인했고 상세 결과는
[manual food lot boundary readback](../evidence/manual-food-lot-boundary-readback-2026-09-07.md)에
기록했습니다. 라벨 picker의 실기기 동작, managed PostgreSQL failover/network
partition, 실제 기기 카메라·운영 OCR은 아직 별도 acceptance입니다.

추가 수동 식품 command 멱등성 검증 (2026-09-07): `POST /api/foods`에
`Idempotency-Key` digest·validated payload fingerprint ledger를 연결했습니다.
동일 key·payload는 기존 lot과 `X-Idempotency-Replayed: true`를 replay하고,
payload 변경은 conflict, 소비·폐기된 lot은 재생성 없이 `409`로 중단합니다.
SQLite/PostgreSQL compatibility projection·export·guest transfer와
`023_manual_food_idempotency.sql` migration에 반영했으며, fresh disposable
PostgreSQL에서 `001→023` ledger apply·재실행 skip·두 process cross-process
replay·target correction race를 확인했습니다. 결과는
`initial=201 replay=201 restart_replay=201 race=[201, 409] retries=1 lots=1
quantity=3팩 date_history=1 normalized_date_assertions=2 current=1 operations=1`입니다.
API 전체 **393 passed**, fixture/mobile **35 passed + 2 skipped**, connected
E2E **66 passed**, protected runtime **28개**, Vite **757 modules**를
local mirror에서 확인했습니다. raw key는 저장하지 않으며, managed failover·
reverse-proxy response reset·ledger retention은 별도 운영 acceptance입니다
([manual food idempotency readback](../evidence/manual-food-idempotency-readback-2026-09-07.md)).

추가 schema capability/migration gate 검증 (2026-09-07): readiness의
compatibility projection 전체 table·핵심 column/index 계약과 migration ledger
baseline 누락 차단을 API contract **27 passed**로 확인했습니다. 새
`infra/postgres/migrate.py`는 원본 SQL을 수정하지 않고 하나의 PostgreSQL
session-level advisory lock 아래 migration body와 ledger row를 같은 transaction에
넣습니다. fresh disposable PostgreSQL에서 최초 `001→023` 23개 apply, 재실행
23개 skip, 두 concurrent runner의 `23 applied + 23 skipped`, Compose one-shot
`migrate` service code 0을 확인했습니다. migration 이후 runtime DDL 허용 없이
API·shared product cache·recipe catalog·auth repository를 포함한 normalized API를
기동해 `/ready 200`, `/health 200`, ledger 23개와 전체 schema
capability readback을 확인했습니다. 상세 결과는
[PostgreSQL schema gate readback](../evidence/postgres-schema-gate-readback-2026-09-07.md)에
기록했습니다. managed failover·network partition·rolling deploy 중 migration
cutover는 아직 운영 acceptance입니다. 이 변경 이후 전체 API 회귀는
**403 passed, 8 warnings**, connected E2E는 **68 passed**로 확인했습니다.

수동 식품·날짜 확인 실패 복구 UX도 추가했습니다. 일시적인 서버 실패 시 sheet를
닫더라도 같은 command 입력과 `Idempotency-Key` 또는 날짜 확인 입력을 유지하는
`다시 시도` action을 toast에 표시하며, 인증 만료·lot 선택 필요·이미 확인된 날짜
충돌에는 무의미한 재시도를 표시하지 않습니다. connected E2E 전체는 **68 passed**로
갱신되었고,
source OneDrive 경로의 protected `Keyboard.png` I/O timeout은 파일이나 테스트를
완화하지 않고 local mirror에서 검증했습니다. 상세 결과는
[mutation failure recovery readback](../evidence/mutation-failure-recovery-readback-2026-09-08.md)에
기록했습니다.

추가 `WorkspaceMutation` recovery seam 검증 (2026-09-08): snapshot에 포함된 date
assertion·product provenance mutation을 공통 Module로 감싸 regular persistence
failure에서는 process-local state를 복원하고, PostgreSQL concurrency conflict에서는
stale snapshot을 복원하지 않도록 했습니다. `food_date_persistence_unavailable`와
`product_provenance_persistence_unavailable` typed detail을 연결했으며, Module
unit·date API rollback targeted **4 passed**와 전체 API **403 passed, 8 warnings**를
확인했습니다. notification preference·push·worker state·shopping receive/recipe/Grocy
전체 mutation은 snapshot contract가 아직 없어 후속 범위입니다
([WorkspaceMutation readback](../evidence/workspace-mutation-readback-2026-09-08.md)).
추가 shopping mutation recovery UX 검증 (2026-09-08): `PATCH /api/shopping-list/{item_id}`
check와 `DELETE /api/shopping-list/{item_id}`를 `WorkspaceMutation`으로 감싸 일반
persistence failure에서 기존 item/list를 복원하고
`shopping_list_item_persistence_unavailable` typed detail을 반환하도록 했습니다.
열린 bottom sheet에서는 overlay에 가려지는 global toast 대신 오류 alert 내부의
`다시 시도` action이 동일 item mutation을 재전송합니다. API rollback targeted 2개와
shopping connected retry를 확인했고, 최신 전체 API **405 passed, 8 warnings**,
connected E2E **69 passed**입니다. notification preference·push·worker·recipe·Grocy
전체 mutation은 상태별 transaction/snapshot contract 후속 범위입니다
([WorkspaceMutation readback](../evidence/workspace-mutation-readback-2026-09-08.md)).

추가 사용자 설정·알림 mutation recovery 검증 (2026-09-08):
`WorkspaceMutation` snapshot에 `meal_preferences`·`notification_preferences`·
`push_subscriptions`·`notification_read_at`을 추가하고, 해당 store mutation의
`persist=False` 경로를 통해 method-level direct commit을 outer flush 뒤로 미뤘습니다.
SQLite와 PostgreSQL `_persist_all()`이 읽음 상태를 재구성하지 않던 실제 persistence gap도
함께 수정했습니다. 알림 설정·push 연결/해지·단일/전체 알림 읽음 API는 일반 flush
실패에서 이전 상태를 보존하고 typed `retryable` detail을 반환하며, 알림 센터와 계정
설정·식단 조건 화면은 열린 sheet 내부 `다시 시도` action을 제공합니다.

local mirror에서 전체 API **417 passed, 8 warnings**, SQLite notification persistence
targeted **2 passed**, fixture/mobile runtime **35 passed + 2 skipped**, frontend
protected runtime **28개**·Vite **757 modules**·Sites build를 확인했습니다. connected
Playwright 전체는 **70 passed**이며, 새 알림 설정 failure/retry와 notification read
failure/retry가 포함됩니다. 별도 disposable PostgreSQL에서 fresh migration
`001→023` 후 동일 workspace의 설정·push fingerprint·읽음 상태를 한 번의 mutation
flush로 저장하고 store 재구성 후 네 상태를 모두 복원했습니다. 상세 결과는
[notification mutation recovery readback](../evidence/notification-mutation-recovery-readback-2026-09-08.md)입니다.
실제 OS Web Push 수신·managed PostgreSQL failover/network partition·외부 provider와
collector·실기기·GitHub Actions 성공은 여전히 별도 운영 acceptance입니다.

추가 Grocy mutation recovery 검증 (2026-09-08): product mapping·storage location
mapping·reconciliation decision·dead-letter manual retry를 `WorkspaceMutation`으로
감싸 일반 persistence failure에서 기존 mapping/outbox/audit 상태를 복원하고,
`grocy_mapping_persistence_unavailable`,
`grocy_location_mapping_persistence_unavailable`,
`grocy_outbox_persistence_unavailable` typed detail을 반환하도록 했습니다.
mapping audit의 내부 direct commit을 `persist=False`로 지연하고, PostgreSQL
`_persist_all()`에 누락되어 있던 append-only `grocy_mapping_audit_events` 재기록도
추가했습니다.

Grocy + WorkspaceMutation API targeted **20 passed**, PostgreSQL audit outer-flush
contract **2 passed**, connected mapping retry **1 passed**, full connected E2E
**70 passed**, frontend build
protected runtime **28개**·Vite **757 modules**를 확인했습니다. 전체 API는 변경 후
**438 passed, 8 warnings**이며, disposable PostgreSQL fresh migration
`001→023` store close/reopen에서 mapping·location·outbox·audit 4종을 복원했습니다.
외부 Grocy transaction/provider, worker crash 중 provider call, managed failover와
network partition은 별도 운영 acceptance입니다
([Grocy mutation recovery readback](../evidence/grocy-mutation-recovery-readback-2026-09-08.md)).

추가 API-backed worker runner recovery 검증 (2026-09-08): notification·Grocy·
product-enrichment standalone script의 공통 loop를 `app/worker_runner.py`로
통합했습니다. API tick이 HTTP 200이어도 body-level `error`가 있으면 실패로 판정하고,
`--once`는 exit code 1을 반환하며 장기 실행은 기본 interval에서 최대 300초까지
bounded exponential backoff를 적용합니다. 정상 cycle은 failure streak를 초기화하고
기본 interval로 복귀하며, 기본 JSON 로그는 line-flush를 유지합니다.

공통 runner/script targeted **16 passed**, 세 worker domain과 공통 runner를 포함한
combined targeted **39 passed**, 전체 API **438 passed, 8 warnings**, 세 worker `--help`와 token-free disabled `--once`
경로를 확인했습니다. 실제 Push/Grocy/MFDS provider, managed DB failover/network
partition, multi-replica collector와 scheduler restart는 별도 운영 gate입니다
([worker runner recovery readback](../evidence/worker-runner-recovery-readback-2026-09-08.md)).

추가 shared recipe catalog recovery 검증 (2026-09-08): user workspace와 owner/scope가
다른 COOKRCP shared catalog에 `RecipeCatalogMutation` snapshot/flush 경계를 추가했습니다.
import·검토 수정·승인·반려는 draft와 review audit event를 한 catalog transaction으로
저장하고, 일반 persistence failure에서 기존 draft status와 audit를 복원합니다.
`recipe_review_persistence_unavailable` typed detail과 관리자 review 화면의 inline
`다시 시도`를 연결했으며, 외부 source fetch·license 판단·planner materialization은
별도 경계로 유지했습니다.

recipe review failure rollback **3 passed**, shared SQLite catalog reconstruction
**1 passed**, disposable PostgreSQL shared catalog reconstruction and stale catalog
revision guard, connected 관리자 approve/revision retry **1 passed**, frontend build
protected runtime **28개**·Vite **757 modules**, 전체 API **437 passed**를 확인했습니다.
다중 admin cross-process conflict·외부 source/provider·managed database failover는
별도 운영 acceptance입니다
([recipe review recovery readback](../evidence/recipe-review-recovery-readback-2026-09-08.md)).

추가 shared recipe catalog revision gate 검증 (2026-09-08): additive migration
`024_recipe_catalog_revision.sql`로 user workspace revision과 분리된 catalog revision
row를 추가했습니다. recipe draft GET은 catalog revision header를 반환하고, frontend는
다음 mutation에 같은 revision을 전달합니다. 다른 API process가 먼저 commit한 뒤
오래된 process가 저장하면 `recipe_catalog_revision_conflict` 409를 반환하고 winner
catalog를 reload하며, stale draft를 덮어쓰지 않습니다.

fresh disposable PostgreSQL migration `001→024`, 두 독립 catalog connection의
`revision 0 → winner revision 1`, stale write 차단·winner reload를 확인했습니다.
stale API request targeted test와 recipe/catalog targeted **12 passed**, frontend
recipe revision header/approve retry targeted **1 passed**, 전체 API **437 passed**를
확인했습니다. 실제 다중 admin 조직 정책·managed failover와 rolling deploy는 별도
운영 acceptance입니다
([recipe review recovery readback](../evidence/recipe-review-recovery-readback-2026-09-08.md)).

추가 shared recipe review ownership 검증 (2026-09-08): revision fence 위에 pending
draft별 explicit `claim`/`release`와 300~86400초 bounded lease를 추가했습니다. claim
없는 PATCH·approve·reject는 `recipe_review_claim_required`/`expired` 409로 멈추고,
다른 운영자의 active claim은 `recipe_review_claim_conflict` 409로 차단합니다. 만료
claim recovery, same-actor no-op claim, release 권한, claim flush failure rollback과
approve 후 claim 자동 해제를 actor audit로 연결했습니다. 기존 JSON payload에는 nullable
default로 읽히므로 migration `025`를 만들지 않았습니다.

ownership API/SQLite targeted **33 passed**, disposable PostgreSQL `001→024` close/reopen
ownership readback, connected ownership flows **4 passed**, full API **439 passed, 8 warnings**,
full connected E2E **71 passed**, fixture/mobile **35 passed + 2 skipped**, protected
runtime **28개**, Vite **757 modules**, Sites **4**, service-worker **5**, workspace-sync
**8**을 확인했습니다. 팀/프로젝트 RBAC·legacy token removal·managed failover는 별도
운영 acceptance입니다
([recipe review ownership readback](../evidence/recipe-review-ownership-readback-2026-09-08.md)).

추가 recipe review capability RBAC 검증 (2026-09-08): 기존 `recipe_admin` role과 token
형식을 유지한 채 `RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS` optional allowlist를 추가했습니다.
allowlist가 비어 있으면 모든 `recipe_admin`이 기존처럼 승인·반려할 수 있고, 설정된 경우
reviewer-only account는 claim·canonicalization·저장만 수행하며 approve/reject는
`recipe_review_publish_forbidden` 403으로 중단됩니다. capabilities endpoint는 allowlist
원문 없이 현재 actor의 `can_review`·`can_publish`·policy kind만 반환하고 reviewer-only
UI의 게시 버튼을 비활성화합니다.

publisher capability API/connected targeted **12 passed / 5 passed**, full API **440 passed,
8 warnings**, full connected E2E **72 passed**, fixture/mobile **35 passed + 2 skipped**,
protected runtime **28개**, Vite **757 modules**, Sites **4**, service-worker **5**,
workspace-sync **8**을 확인했습니다. 조직 hierarchy·legacy token removal·실제 publisher
운영 정책은 별도 acceptance입니다
([recipe review capability RBAC readback](../evidence/recipe-review-rbac-readback-2026-09-08.md)).

추가 recipe review assignment queue 검증 (2026-09-08): pending draft GET에
`assignment=all|mine|unassigned` actor filter를 연결했습니다. `mine`은 현재 actor의
active claim만, `unassigned`는 미배정과 만료 claim을 반환하며 frontend는 `전체`·`내 작업`·
`미배정` 선택 시 queue를 다시 읽습니다. recipe API targeted **14 passed**, connected recipe
targeted **6 passed**, full API **444 passed, 8 warnings**, full connected E2E **73 passed**,
frontend build protected runtime **28개**·Vite **757 modules**를 확인했습니다. 실시간
multi-admin invalidation·조직 assignment policy는 별도 운영 acceptance입니다
([recipe review queue filter readback](../evidence/recipe-review-queue-filter-readback-2026-09-08.md)).

추가 shared recipe review realtime invalidation 검증 (2026-09-08): recipe mutation 성공 시
사용자 workspace와 분리된 opaque `recipe-catalog` key와 `recipe-review` channel로
BroadcastChannel/localStorage invalidation을 발행하도록 연결했습니다. 다른 운영자 panel은
현재 assignment filter를 다시 읽고, 열린 local editor는 덮어쓰지 않은 채 최신 상태 확인
안내를 표시합니다. workspace transport **9 passed**, connected recipe targeted **8 passed**,
full API **444 passed, 8 warnings**, full connected E2E **75 passed**, build protected
runtime **28개**·Vite **757 modules**를 확인했습니다. server push·event ordering·조직
assignment는 별도 운영 acceptance입니다
([recipe review realtime readback](../evidence/recipe-review-realtime-readback-2026-09-08.md)).

추가 recipe review cross-device revision probe 검증 (2026-09-08): draft payload 없이 shared
catalog revision만 반환하는 `/api/recipe-review/revision` endpoint와
`X-Rescue-Meal-Recipe-Catalog-Revision` header를 추가했습니다. review panel은 tab visibility
복귀와 30초 interval에서 probe하고 revision이 변할 때만 queue를 다시 읽으며, 선택 draft가
원격에서 바뀌면 local editor를 stale로 잠그고 명시적 reload를 요구합니다. probe 실패 시
기존 queue/editor를 유지합니다. recipe API targeted **15 passed**, connected recipe targeted
**9 passed**, full API **445 passed, 8 warnings**, full connected E2E **76 passed**, build
protected runtime **28개**·Vite **757 modules**를 확인했습니다. server push·실시간 ordering은
별도 운영 acceptance입니다
([recipe review revision probe readback](../evidence/recipe-review-revision-probe-readback-2026-09-08.md)).

추가 CI production preflight gate 연결 (2026-09-08): `.github/workflows/verify.yml`의 API
job이 full pytest 뒤 sanitized valid publisher⊆admin profile을 preflight하고, publisher가
admin 밖인 negative profile은 non-zero exit와 `recipe-publisher-not-admin`을 요구하며
email value가 출력되지 않는지 확인하도록 했습니다. 현재 workflow YAML parse와 API/CI
contract targeted **51 passed**, full API **443 passed, 8 warnings**를 확인했습니다. 실제
GitHub Actions 성공·secret manager 주입·배포 connectivity는 별도 acceptance입니다
([CI production preflight gate readback](../evidence/ci-production-preflight-readback-2026-09-08.md)).

추가 production recipe review legacy-token gate 검증 (2026-09-08):
`RESCUE_MEAL_ENVIRONMENT=production`에서 shared
`RESCUE_MEAL_RECIPE_REVIEW_TOKEN`이 비어 있지 않으면 production preflight가
`recipe-review-legacy-token` error를 반환하고, `/ready`와 legacy-header runtime request가
`recipe_review_legacy_token_disabled` typed `503`으로 fail-closed 처리되도록 했습니다.
개별 `recipe_admin` account 인증은 유지되며 token 원문은 error/preflight에 노출되지
않습니다. preflight/runtime targeted **34 passed**, full API **442 passed, 8 warnings**,
shell/compile/Compose config와 scoped diff check를 확인했습니다. 실제 secret-manager
rotation·legacy secret 폐기·deployment pipeline readback은 운영 acceptance입니다
([recipe review legacy-token gate readback](../evidence/recipe-review-legacy-token-gate-readback-2026-09-08.md)).

추가 recipe publisher allowlist preflight 검증 (2026-09-08): publisher/admin email의 형식,
publisher allowlist 단독 설정, publisher가 admin allowlist 밖에 있는 구성을 production
preflight에서 fail-closed로 차단했습니다. configuration error는 email 원문을 출력하지
않으며, 정상적인 publisher⊆admin 설정은 통과합니다. preflight suite **22 passed**,
full API 최종 **443 passed, 8 warnings**를 확인했습니다. 실제 조직 directory sync와
role 변경은 별도 운영 acceptance입니다
([recipe review capability RBAC readback](../evidence/recipe-review-rbac-readback-2026-09-08.md)).

추가 durable read snapshot 경쟁 검증 (2026-09-08): 요청 middleware의 SQLite/PostgreSQL
projection reload가 동시 reader에게 transient empty collection을 노출하지 않도록
`_AtomicStoreStateMixin` copy-on-write state를 적용했습니다. loader는 private state를
완성한 뒤 reference를 교체하고, load 실패 시 기존 read snapshot을 유지합니다. 수정 전
blocking reload regression은 저장된 meal plan을 `KeyError`로 잃었고, reload 중 local
write가 state swap에서 유실되는 회귀도 확인했습니다. 수정 후 두 regression·
SQLite/PostgreSQL contract를 통과했습니다. API 전체 **447 passed, 8 warnings**,
connected full E2E **76 passed**, planner 저장→닫기→재진입과 camera/library fallback을
확인했습니다. managed DB failover/network partition·reverse proxy reset·rolling deploy는
별도 운영 acceptance입니다
([durable read snapshot readback](../evidence/durable-read-snapshot-readback-2026-09-08.md)).

추가 OperationLedger identity Module 검증 (2026-09-08): receipt·manual food·shopping
receive·storage event의 key normalization·SHA-256 digest·canonical payload fingerprint·
legacy scoped ID 계산을 공통 Module로 집중하고, domain scope·durable record·replay와
conflict semantics는 각 Adapter에 유지했습니다. Module **4 passed**, idempotency/replay
targeted **10 passed**, PostgreSQL contract targeted **4 passed**, API 전체 **451 passed,
8 warnings**, connected full E2E **76 passed**를 확인했습니다. ledger retention·response
reset·managed failover는 별도 운영 acceptance입니다
([OperationLedger readback](../evidence/operation-ledger-readback-2026-09-08.md)).

추가 primary intake chunk prefetch/gate 검증 (2026-09-08): AddFoodSheet initial lazy split은
유지하면서 `openAdd()` user intent에서 chunk prefetch를 시작하고 resolve 후 dialog를 열어
control 없는 shell을 노출하지 않습니다. load 실패는 retry toast로 복구합니다. prefetch 전 full connected에서 receipt intake
`setInputFiles()` timeout이 관찰됐고, 수정 후 targeted **5 passed**와 full connected
**76 passed**를 확인했습니다. production build는 initial index JS **307.37 kB**와
AddFoodSheet chunk **58.56 kB**를 유지했고 protected runtime **28개**, fixture/mobile
**35 passed + 2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를
통과했습니다. 실제 device network/CDN/cache/OS permission은 별도 운영 acceptance입니다
([intake chunk prefetch readback](../evidence/intake-chunk-prefetch-readback-2026-09-08.md)).

추가 WorkspaceMutation operation lock 검증 (2026-09-08): `WorkspaceMutation.run()`이
active store `RLock` 안에서 snapshot·mutation·flush·restore를 수행하도록 확장했습니다.
적용된 date/provenance/shopping/notification/push/preferences/Grocy mapping/retry caller의
refresh interleaving을 줄이며, lock unit **4 passed**, API 전체 **452 passed, 8 warnings**,
connected full E2E **76 passed**를 확인했습니다. direct route·worker 외부 provider transaction과
전체 workspace atomicity는 별도 운영 acceptance입니다
([WorkspaceMutation lock readback](../evidence/workspace-mutation-lock-readback-2026-09-08.md)).

추가 storage event mutation seam 검증 (2026-09-08): storage event direct route의
Idempotency-Key precheck·lot validation·InventoryRepository mutation·Grocy outbox·rollback을
active workspace lock과 `WorkspaceMutation`으로 편입했습니다. same-key concurrent HTTP
request에서 `200 + 200`, 한 initial/한 replay, event 1건·수량 차감 1회를 확인했고,
structural seam·InventoryRepository targeted와 API 전체 **454 passed, 8 warnings**,
connected full E2E **76 passed**를 통과했습니다. direct receipt/meal-plan route와 외부
Grocy transaction은 별도 운영 acceptance입니다
([storage event mutation readback](../evidence/storage-event-mutation-readback-2026-09-08.md)).

추가 single meal-plan save mutation seam 검증 (2026-09-08): `POST /api/meal-plans`의
plan별 lock은 유지하고, candidate/bundle 검증·saved plan/audit staging은 helper에,
snapshot·flush·regular failure restore는 `WorkspaceMutation`에 집중했습니다. save seam,
preview/latest recovery, flush failure phantom, concurrent same-plan save를 통과했으며
API 전체 **455 passed, 8 warnings**, connected full E2E **76 passed**를 확인했습니다.
multi-day bundle·completion과 외부 Grocy transaction은 별도 운영 acceptance입니다
([meal-plan save mutation readback](../evidence/meal-plan-save-mutation-readback-2026-09-08.md)).

추가 single meal-plan completion mutation seam 검증 (2026-09-08): completion의 allocation
validation·consumed storage event/outbox·plan/bundle progress·completed audit를
`WorkspaceMutation`으로 묶고 `reprioritize(persist=False)`로 중간 persistence를 제거했습니다.
structural/normal/adjusted/multi-lot/changed-lot/flush failure phantom targeted **12 passed**,
API 전체 **457 passed, 8 warnings**, connected full E2E **76 passed**를 확인했습니다.
multi-day bundle save와 외부 Grocy transaction은 별도 운영 acceptance입니다
([meal-plan completion mutation readback](../evidence/meal-plan-completion-mutation-readback-2026-09-08.md)).

추가 multi-day bundle save mutation seam 검증 (2026-09-08): bundle_id별 lock을 유지하면서
preview rematerialization·snapshot hash/servings/day identity 검증·bundle/day staging과
flush/restore를 `WorkspaceMutation`으로 편입했습니다. preview side-effect-free, retry/
history/conflict, selected day save/link repair/progress targeted **7 passed**, API 전체
**458 passed, 8 warnings**, connected full E2E **76 passed**를 확인했습니다. day completion과
외부 Grocy transaction은 별도 운영 acceptance입니다
([multi-day bundle save mutation readback](../evidence/multi-day-bundle-save-mutation-readback-2026-09-08.md)).

추가 receipt commit mutation seam 검증 (2026-09-08): crash/retry identity를 위해
`CommitTransactionRecord(status=pending)` 선행 durable flush는 유지하고, receipt별 lock과
active workspace lock 안에서 final lot·receipt·alias/provenance audit·Grocy outbox·saved
transaction staging을 `WorkspaceMutation` outer flush로 묶었습니다. finalization 내부의
`upsert_from_receipt(persist=False)`·`reprioritize(persist=False)`는 중간 persistence를
막으며, regular failure는 business snapshot을 복원하고 transaction을
`needs_reconciliation`으로 남깁니다. structural, GTIN/replay/conflict, pending retry,
concurrent commit, rollback/retry와 final flush failure targeted **7 passed**, API 전체
**460 passed, 8 warnings**, connected full E2E **76 passed**, protected runtime **28개**,
Vite **757 modules**, initial index **307.58 kB**, AddFoodSheet chunk **58.56 kB**,
fixture/mobile **35 passed + 2 skipped**를 확인했습니다. 외부 Grocy
transaction·managed PostgreSQL failover·network partition·reverse-proxy response reset은
별도 운영 acceptance입니다
([receipt commit mutation readback](../evidence/receipt-commit-mutation-readback-2026-09-08.md)).

추가 multi-day linked day completion recovery 검증 (2026-09-08): 별도 bundle completion
endpoint를 추가하지 않고 bundle day를 연결한 single-plan completion이 plan·bundle day
progress·inventory·consumed event를 같은 `WorkspaceMutation` snapshot/outer flush로
처리하는 현재 경계를 고정했습니다. final flush failure에서 day가 `saved`로 복원되고
consumed event가 남지 않으며, retry 뒤 `completed`와 단일 소비 결과를 얻는 targeted
**2 passed**를 확인했습니다. API 전체 **461 passed, 8 warnings**, connected full E2E
**76 passed**를 유지했으며, 외부 Grocy transaction·managed failover·network partition·
response reset은 별도 운영 acceptance입니다
([multi-day day completion recovery readback](../evidence/multi-day-day-completion-recovery-readback-2026-09-08.md)).

추가 meal-plan client transport lifecycle 검증 (2026-09-08): `MealPlanSheet`의
preview/latest/preferences/alternatives/multi-day history/audit와 nested shopping read를
`WorkspaceSyncCoordinator`의 `meal-plan`·`shopping-list` channel 및 실행별 `AbortSignal`로
편입했습니다. planner preview/options/multi-day-preview, barcode parse, label parse/intake,
inference, guest-transfer preview처럼 POST이지만 workspace를 변경하지 않는 요청은 명시적
mutation broadcast exemption으로 제한하고, meal-plan save/complete·preference mutation만
열린 planner를 invalidate합니다. preview non-invalidation과 same-origin cross-tab refresh
targeted **2 passed**, workspace-sync **9 passed**, API 전체 **461 passed, 8 warnings**,
fixture/mobile **35 passed + 2 skipped**, protected runtime **28개**, Vite **757 modules**,
initial index **307.71 kB**, MealPlanSheet chunk **36.38 kB**, connected full E2E
**78 passed**를 확인했습니다. 일반 planner의 cross-device revision probe·managed failover·
network partition·실제 device network/CDN은 별도 운영 acceptance입니다
([meal-plan client transport readback](../evidence/meal-plan-client-transport-readback-2026-09-08.md)).

추가 manual food mutation recovery 검증 (2026-09-08): `POST /api/foods`의 create/correction을
`manual_food_lock`·active mutation lock·`WorkspaceMutation` outer flush로 편입했습니다.
lot·priority·product/date audit·manual operation ledger는 `persist=False` staging 후 한 번에
확정하며, persistence failure는 `manual_food_persistence_unavailable` typed 503과 기존
상태 보존으로 반환합니다. refactor 전 seam 호출 0회 regression을 확인한 뒤 manual-food
API targeted **16 passed**, final flush rollback/retry, SQLite/PostgreSQL persistence,
disposable PostgreSQL two-process create/replay/restart/correction race, connected targeted
**3 passed**, API 전체 **463 passed, 8 warnings**, connected full E2E **78 passed**를 확인했습니다.
typed retry/readiness wiring을 포함한 frontend build도 protected runtime **28개**, Vite **757 modules**,
initial index **307.81 kB**, MealPlanSheet chunk **36.38 kB**, AddFoodSheet chunk **58.67 kB**, fixture/mobile **35 passed +
2 skipped**로 통과했습니다.
실제 외부 Grocy/provider transaction·managed failover·network partition·legal retention은
별도 운영 acceptance입니다
([manual food mutation recovery readback](../evidence/manual-food-mutation-recovery-readback-2026-09-08.md)).

추가 receipt draft mutation·intake readiness 검증 (2026-09-08): receipt fingerprint
lock·active mutation lock과 `WorkspaceMutation` outer flush로 draft projection을 확정하고,
regular failure는 `receipt_draft_persistence_unavailable` typed 503과 phantom 없는 retryable
capture 상태로 반환합니다. PostgreSQL winner draft replay와 pending/committed conflict
semantics는 유지했습니다. `openAdd()`는 AddFoodSheet와 LazyBottomSheet를 모두 resolve한
뒤 dialog를 열고 inner Suspense를 제거해 file input/tab control readiness를 보장합니다.
refactor 전 seam 호출 0회 regression, draft targeted **6 passed**, PDF/typed draft UI
**2 passed**, API 전체 **464 passed, 8 warnings**, connected full E2E **79 passed**,
protected runtime **28개**, Vite **757 modules**, initial index **307.81 kB**, AddFoodSheet
chunk **58.67 kB**, MealPlanSheet chunk **36.38 kB**, fixture/mobile **35 passed + 2 skipped**를
확인했습니다. OCR accuracy·실제 device network/CDN/picker·managed failover·외부 provider는
별도 운영 acceptance입니다
([receipt draft mutation and intake readiness readback](../evidence/receipt-draft-mutation-readiness-readback-2026-09-08.md)).

추가 product-info mutation recovery·inline retry 검증 (2026-09-08):
`PATCH /api/foods/{food_id}/product-info`의 profile/no-op 확인과 profile 변경·provenance
removal audit·product-info audit·priority staging을 active mutation lock과
`WorkspaceMutation` outer flush로 묶었습니다. regular failure는
`product_info_persistence_unavailable` typed 503과 기존 lot state 보존으로 반환하고,
detail sheet는 optimistic profile을 원복한 inline `다시 시도`를 제공합니다. product-info
targeted API **3 passed**, final-flush rollback/typed retry, connected inline retry **1 passed**,
API 전체 **466 passed, 8 warnings**, connected full E2E **80 passed**, protected runtime
**28개**, Vite **757 modules**, initial index **308.25 kB**, FoodDetailSheet chunk **16.62 kB**,
fixture/mobile **35 passed + 2 skipped**를 확인했습니다. 최신 route의 multi-process
PostgreSQL HTTP smoke·managed failover·network partition·외부 provider는 별도 운영
acceptance입니다
([product-info mutation recovery readback](../evidence/product-info-mutation-recovery-readback-2026-09-08.md)).

추가 receipt privacy mutation recovery 검증 (2026-09-08):
`POST /api/receipts/{receipt_id}/privacy-erase`의 draft delete·committed/pending redaction을
active `WorkspaceMutation` outer flush로 편입했습니다. `persist=False` staging과 regular
failure snapshot restore를 적용해 `receipt_privacy_persistence_unavailable` typed 503에서
기존 receipt metadata·inventory provenance·commit transaction을 보존하며, PostgreSQL
revision conflict는 stale snapshot을 복원하지 않습니다. `confirm: true`와
`deleted_draft`·`redacted_committed`·`redacted_pending` response semantics는 유지하고,
Account sheet는 열린 overlay 내부 inline `다시 시도`를 제공합니다. privacy API targeted
**5 passed**, SQLite privacy persistence **1 passed**, API 전체 **468 passed, 8 warnings**,
connected full E2E **80 passed**, protected runtime **28개**, Vite **757 modules**, initial
index **308.33 kB**, AccountSheet chunk **64.17 kB**, fixture/mobile **35 passed + 2 skipped**,
Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**를 확인했습니다.
backup/WAL/read replica/object storage/legal retention·managed failover·external provider/device
acceptance는 별도입니다
([receipt privacy mutation recovery readback](../evidence/receipt-privacy-mutation-recovery-readback-2026-09-08.md)).

추가 shopping list source mutation recovery 검증 (2026-09-09):
`POST /api/shopping-list`와 `/manual`의 계획/manual source merge를 `persist=False`로 staging하고
`WorkspaceMutation` outer flush로 확정했습니다. flush failure에서는
`shopping_list_persistence_unavailable` typed 503과 기존 목록 snapshot 보존을 확인했으며,
source quantity 합산·quantity 변경 시 checked 해제·manual source 유지 semantics를 보존했습니다.
MealPlanSheet 계획 source와 홈 ShoppingListSheet 직접 추가는 열린 sheet inline retry로 같은
작업을 재실행합니다. shopping API targeted **7 passed**, connected plan/manual retry **2 passed**,
API 전체 **470 passed**, connected full E2E **80 passed**, build protected runtime **28개**,
Vite **757 modules**, initial index **308.54 kB**, MealPlanSheet chunk **36.91 kB**, fixture/mobile
**35 passed + 2 skipped**, Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**를
확인했습니다. GET 자동 reconciliation·receive inventory lot/operation transaction·managed
failover/network partition·외부 provider/device/legal acceptance는 별도입니다
([shopping list mutation recovery readback](../evidence/shopping-list-mutation-recovery-readback-2026-09-09.md)).

추가 shopping list read reconciliation recovery 검증 (2026-09-09):
`GET /api/shopping-list`가 inventory/source 변화에 따라 derived list를 갱신하는 실제 mutation임을
확인하고, `_reconcile_shopping_list_sources(persist=False)`를 `WorkspaceMutation` 단일 outer
flush 안으로 편입했습니다. source별 중간 flush failure에서는 이전 목록 snapshot을 복원하고
`shopping_list_persistence_unavailable` typed 503을 반환하며, retry 뒤 보충된 재료가 반영된
최신 목록으로 수렴합니다. shopping API targeted **9 passed**, API 전체 **472 passed**,
connected full E2E **80 passed**, protected runtime **28개**, Vite **757 modules**, initial index
**308.54 kB**, MealPlanSheet chunk **36.91 kB**, fixture/mobile **35 passed + 2 skipped**,
Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**를 확인했습니다.
GET은 frontend mutation broadcast를 발생시키지 않으며, receive lot/operation transaction·
managed failover/network partition·read replica/법정 retention은 별도 acceptance입니다
([shopping list read reconciliation recovery readback](../evidence/shopping-list-read-reconciliation-recovery-readback-2026-09-09.md)).

추가 product-enrichment queue mutation recovery 검증 (2026-09-09):
receipt review의 product-enrichment job map을 `WorkspaceMutation` snapshot에 포함하고,
enqueue와 dead-letter retry를 `persist=False` staging 및 outer flush로 확정했습니다.
flush failure에서는 `product_enrichment_persistence_unavailable` typed 503과 기존
검수 draft/job 상태를 유지하고, PostgreSQL revision conflict에서는 winner job을 stale
restore 없이 사용합니다. AddFoodSheet는 같은 검수 화면의 inline `다시 시도`로 enqueue를
재실행하며, 기존 queued/in-flight polling과 succeeded candidate merge를 유지합니다.
product-enrichment API/worker targeted **10 passed**, connected receipt review retry **1 passed**,
API 전체 **474 passed**, connected full E2E **80 passed**, protected runtime **28개**, Vite
**757 modules**, initial index **308.65 kB**, AddFoodSheet chunk **58.91 kB**, fixture/mobile
**35 passed + 2 skipped**, Sites **4 passed**, service-worker **5 passed**, workspace-sync
**9 passed**를 확인했습니다. worker 외부 provider/cache/rate-limit·lease/heartbeat,
managed failover/network partition·external delivery/device/legal acceptance는 별도입니다
([product-enrichment mutation recovery readback](../evidence/product-enrichment-mutation-recovery-readback-2026-09-09.md)).

추가 shopping receive mutation recovery 검증 (2026-09-09):
`POST /api/shopping-list/{item_id}/receive`의 local lot/list/operation transaction을
active mutation lock과 `WorkspaceMutation` outer flush로 편입했습니다. `create_manual_lot`,
source reconciliation, checked history, `ShoppingListReceiveOperation` ledger와 priority를
중간 persistence 없이 staging하며, final flush failure에서는
`shopping_receive_persistence_unavailable` typed 503과 기존 inventory/list/ledger를 함께
복원합니다. same-key `201 + replay`, 다른 payload `409`, consumed lot 재생성 차단은 유지하고,
ShoppingListSheet receive form은 동일 key의 inline `다시 시도`를 제공합니다. receive API targeted
**4 passed**, connected retry **1 passed**, API 전체 **476 passed**, connected full E2E **80 passed**,
protected runtime **28개**, Vite **757 modules**, initial index **309.02 kB**, fixture/mobile
**35 passed + 2 skipped**, Sites **4 passed**, service-worker **5 passed**, workspace-sync
**9 passed**를 확인했습니다. Docker daemon unresponsive로 disposable PostgreSQL smoke는
미실행이며, 외부 Grocy compensation·managed failover/network partition·backup/WAL/read replica·
device/legal/CI acceptance는 별도입니다
([shopping receive mutation recovery readback](../evidence/shopping-receive-mutation-recovery-readback-2026-09-09.md)).

추가 storage event error recovery 검증 (2026-09-09):
`POST /api/foods/{food_id}/storage-events`의 `WorkspaceMutation` 예외 처리에서 복원된
snapshot을 다시 flush하던 우회를 제거했습니다. validation/not-found semantics는 422/404로
유지하고 일반 persistence failure는 `storage_event_persistence_unavailable` typed 503으로
반환합니다. inventory lot·partial split·opened state·storage event·Grocy outbox는 실패 전
상태로 함께 복원되며, frontend는 dashboard refresh 뒤 global retry toast에서 같은
Idempotency-Key를 재사용합니다. storage API targeted **8 passed**, connected typed retry
**1 passed**, API 전체 **477 passed**, connected full E2E **81 passed**, protected runtime **28개**,
Vite **757 modules**, initial index **309.43 kB**, fixture/mobile **35 passed + 2 skipped**,
Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**를 확인했습니다.
외부 Grocy compensation·composite event batch·managed failover/network partition·device/legal/CI는
별도 acceptance입니다
([storage event error recovery readback](../evidence/storage-event-error-recovery-readback-2026-09-09.md)).

추가 composite storage event sequence 검증 (2026-09-09): 상세 화면에서 보관 위치 이동과
최초 개봉을 함께 저장할 때 두 local event를 `POST /api/foods/{food_id}/storage-event-sequence`로
보내도록 연결했습니다. sequence는 최대 2개로 제한하고, 앞 event가 만든 child lot을 다음
event target으로 연결하며, inventory·storage event·Grocy outbox·priority를
`WorkspaceMutation` 단일 outer flush로 확정합니다. final flush failure는
`storage_event_sequence_persistence_unavailable` typed 503과 전체 snapshot rollback으로
돌아가고, frontend는 동일 Idempotency-Key의 global retry로 재시도합니다. 완성된 sequence는
replay하고 partial sequence·payload 충돌은 `409`로 차단합니다. sequence API targeted
**3 passed**, connected sequence retry **1 passed**, API 전체 **480 passed**, connected full E2E
**82 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime **28개**, Vite
**757 modules**, initial index **309.99 kB**, AddFoodSheet **58.91 kB**, MealPlanSheet
**36.91 kB**, AccountSheet **64.17 kB**, Sites **4 passed**, service-worker **5 passed**,
workspace-sync **9 passed**를 확인했습니다. 외부 Grocy transaction/compensation, managed
failover/network partition, response reset, backup/WAL/read replica/legal retention, 실제
device/CI/deploy는 별도 acceptance입니다 ([storage event sequence readback](../evidence/storage-event-sequence-readback-2026-09-09.md)).

추가 guest transfer cross-workspace race recovery 검증 (2026-09-09): 기존 transfer의
`ready` 판정이 source·target lock 밖에 있어 preview 직후 account write가 guest snapshot에
덮일 수 있던 경계를 확인하고 수정했습니다. 이제 source/target workspace ID 고정 순서의
두 lock 안에서 상태를 다시 판정하고, ready일 때만 target backup·copy·flush를 수행합니다.
일반 flush failure는 `guest_transfer_persistence_unavailable` typed 503과 기존 account
snapshot restore로 복구하며, PostgreSQL revision conflict는 stale backup restore 없이
전역 conflict로 전파합니다. source 삭제·fingerprint 기반 already_transferred·기존 conflict
 semantics는 유지합니다. guest transfer targeted **3 passed**, target write race와
 flush rollback/retry를 확인했으며, 최신 API 전체 **482 passed**, connected full E2E
 **83 passed**로 재회귀했습니다. AccountSheet typed error/conflict UI targeted **2 passed**,
 fixture/mobile runtime **35 passed + 2 skipped**, frontend build protected runtime **28**,
 Vite **757 modules**, initial index **310.10 kB**, AccountSheet **64.92 kB**도 확인했습니다.
실제 multi-process guest transfer, distributed source/target commit, managed failover,
backup/WAL/legal retention은 별도 acceptance입니다
([guest transfer lock/recovery readback](../evidence/guest-transfer-lock-recovery-readback-2026-09-09.md)).

추가 receipt commit pending identity recovery 검증 (2026-09-09): 시작 pending marker flush
failure는 memory transaction을 제거하고 `receipt_commit_persistence_unavailable` typed 503으로
반환하며, finalization rollback 뒤 reconciliation marker flush failure는 이미 durable한
pending identity를 유지한 `receipt_commit_reconciliation_unavailable` typed 503으로
반환합니다. 프론트는 사용자 시도 단위 commit key, 고정 draft payload와 resolved receipt ID를
보존해 global `다시 시도`에서 같은 commit을 replay하고, auth/duplicate/workspace conflict에는
blind retry를 제공하지 않습니다. receipt commit targeted **12 passed**, connected commit retry
**1 passed**, API 전체 **484 passed**, connected full E2E **83 passed**, fixture/mobile **35
passed + 2 skipped**, protected runtime **28개**, Vite **757 modules**, initial index
**310.48 kB**, AccountSheet **64.92 kB**, AddFoodSheet **58.91 kB**, MealPlanSheet **36.91 kB**,
Sites **4 passed**, service-worker **5 passed**, workspace-sync **9 passed**를 확인했습니다.
외부 Grocy transaction·response reset·managed failover/network partition·backup/WAL/legal
retention·실기기/CI/deploy는 별도 acceptance입니다
([receipt commit retry readback](../evidence/receipt-commit-retry-readback-2026-09-09.md)).

추가 custom storage location vertical slice 검증 (2026-09-09): canonical
`ambient`·`refrigerated`·`frozen` class를 보존한 workspace-scoped 사용자 정의 보관
위치 CRUD와 duplicate/in-use/type-mismatch guard를 연결하고, SQLite 및 normalized
PostgreSQL projection에 위치 ID를 저장했습니다. AddFoodSheet의 영수증·라벨·직접 입력,
ShoppingListSheet 입고 확인, FoodDetailSheet 보관 변경, AccountSheet 위치 manager가
같은 optional `storage_location_id` 계약을 사용하며, receipt commit·shopping receive
retry fingerprint에도 위치를 포함합니다. `storage-locations` cross-tab invalidation은
dashboard/inventory refresh와 계정 패널 재조회로 이어집니다.

API custom CRUD/assignment/reconstruction·receipt commit override·shopping receive replay·custom
location notification targeted **7 passed**, PostgreSQL contract **30 passed**, API 전체 **491 passed, 8 warnings**,
connected full E2E **87 passed**(custom location **7 passed** 포함), fixture/mobile
**35 passed + 2 skipped**, workspace-sync **9 passed**, Sites **4 passed**, service-worker
**5 passed**, protected runtime **28개**, Vite **757 modules**, initial index **312.87 kB**,
AddFoodSheet **60.64 kB**, AccountSheet **72.83 kB**, ShoppingListSheet **10.59 kB**,
FoodDetailSheet **17.62 kB**를
확인했습니다. OneDrive checkout의 protected asset copy는 간헐적으로 `ETIMEDOUT`이어서
최종 build/readback은 disposable local mirror에서 확인했습니다. 실제 GitHub Actions,
managed PostgreSQL/Grocy 운영, 온도 센서·device camera·backup/WAL/legal retention은
별도 acceptance입니다 ([custom storage location readback](../evidence/custom-storage-location-readback-2026-09-09.md)).

추가 custom storage history safety·cross-device probe 검증 (2026-09-09): 현재 lot만 검사하던
사용자 정의 위치 삭제 guard를 storage event의 `from/to_storage_location_id`와 장보기
`ShoppingListReceiveOperation.storage_location_id`까지 확장해, 과거 기록이 참조하는 위치는
`storage_location_in_use` `409`로 유지했습니다. `FoodHistory`는 `StorageLocation` read
model로 location ID를 해석해 `김치냉장고 → 실온`처럼 실제 이름을 표시합니다. payload-free
`GET /api/storage-locations/revision`과 in-memory process-local marker, SQLite
`workspace_metadata` durable revision, 기존 PostgreSQL workspace revision을 연결하고,
AccountSheet의 tab 복귀·30초 bounded probe가 revision 변경 시 편집·삭제 확인 상태를 닫은
뒤 최신 목록을 재조회하도록 했습니다. probe 실패는 기존 목록을 비우지 않습니다.

API 전체 **492 passed, 8 warnings**, PostgreSQL contract **30 passed**, connected 전체
**88 passed**, fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**,
service-worker **5**, protected runtime **28**, Vite **757 modules** build를 확인했습니다.
OneDrive checkout의 직접 production build는 protected dataless asset I/O 지연 경계가 있어
disposable local mirror에서 compiled artifact를 확인했습니다. Docker daemon이 여전히
읽기 전용 VM 상태라 운영 PostgreSQL live smoke는 실행하지 않았으며, 실제 multi-device race·
background scheduling·VoiceOver/TalkBack과 managed failover는 별도 acceptance입니다
([custom storage history readback](../evidence/custom-storage-history-readback-2026-09-09.md)).

추가 CI release contract completeness 검증 (2026-09-09): web job에
`npm run test:workspace-sync`와 `npm run test:service-worker`를 명시적으로 추가하고,
`postgres-live` normalized smoke에 `/api/storage-locations/revision` 증가와 custom
location history 참조 후 DELETE `409 storage_location_in_use` readback을 연결했습니다.
`test_postgres_contract.py` **30 passed**, workflow YAML·shell validation과 local mirror
workspace-sync **9**, service-worker **5**, connected **88 passed**를 확인했습니다.
실제 GitHub Actions runner 성공·artifact promotion·managed PostgreSQL failover는 별도
acceptance이므로 아직 운영 release claim으로 승격하지 않습니다
([CI release contract readback](../evidence/ci-release-contract-readback-2026-09-09.md)).

추가 release provenance manifest 검증 (2026-09-09): `apps/web/scripts/create-release-manifest.mjs`가
source head/branch/dirty state, Node/deployment mode, `package-lock.json`·`uv.lock`·mobile
runtime lock·migration SHA-256, compiled Sites artifact size/hash를 secret/workspace data 없이
`rescue-meal-release-manifest-v1` JSON으로 기록합니다. manifest contract **1 passed**,
migration baseline **25 files**, artifact records **4**, `contains_secrets=false`, required
artifact 누락 fail-closed, PostgreSQL workflow contract **30 passed**를 확인했으며 web CI
artifact upload를 연결했습니다. 실제
GitHub Actions artifact retention·signed provenance·release promotion은 별도 acceptance입니다
([release provenance manifest readback](../evidence/release-provenance-manifest-readback-2026-09-09.md)).

추가 planner cross-device revision safety 검증 (2026-09-09): `GET /api/meal-plans/revision`을
추가하고 열린 `MealPlanSheet`가 tab 복귀·30초 bounded probe로 workspace revision을
확인하도록 했습니다. 다른 기기에서 식단이나 재고가 바뀌면 current alternative·servings·
lot 사용량 draft는 유지하고 `최신 식단 확인` action을 보여주며, 사용자가 선택한 뒤에만
preferences·preview·latest를 다시 읽습니다. API 전체 **493 passed**, connected 전체
**89 passed**, fixture planner **1 passed**, protected runtime **28**, Vite **757 modules**,
MealPlanSheet **38.52 kB**, initial client JS **313.09 kB**를 확인했습니다. 실제 multi-device
background scheduling·server push ordering·managed PostgreSQL failover는 별도 acceptance입니다
([meal-plan cross-device readback](../evidence/meal-plan-cross-device-readback-2026-09-09.md)).

추가 notification cross-device revision safety 검증 (2026-09-09): `GET /api/notifications/revision`을
추가하고 열린 알림 센터가 목록 read와 함께 payload-free workspace revision을 baseline으로
기억하도록 했습니다. tab 복귀·30초 bounded probe에서 revision이 증가하면 현재 알림을
자동으로 다시 읽고 `다른 기기에서 알림 상태가 바뀌어 최신 목록을 불러왔어요.` 안내를 표시하며,
읽음·전체 읽음 mutation이 진행 중이면 probe와 목록 교체를 보류한 뒤 완료 후 queued refresh를
실행합니다. API 전체 **494 passed, 8 warnings**, connected 전체 **91 passed**, fixture/mobile
**35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**, protected
runtime **28**, Vite **757 modules** build를 disposable local mirror에서 확인했습니다.
OneDrive checkout의 직접 API 실행은 기존 dataless I/O 대기 경계가 있어 mirror 결과를 사용했으며,
실제 Web Push ordering·multi-device scheduling·managed PostgreSQL failover·background tab/device
accessibility는 별도 acceptance입니다 ([notification cross-device readback](../evidence/notification-cross-device-readback-2026-09-09.md)).

추가 dashboard cross-device revision safety 검증 (2026-09-09): `GET /api/dashboard/revision`을
추가하고 dashboard read와 함께 payload-free revision baseline을 확보했습니다. 홈 화면에서만
tab 복귀·30초 bounded probe를 실행해 revision 증가 시 inventory와 Rescue Queue를 자동 재조회하며,
sheet가 열렸거나 일반 dashboard sync가 진행 중이면 probe/응답 적용을 보류합니다. background
refresh notice는 현재 사용자 toast가 없을 때만 표시해 조리 완료·계정 전환 결과를 보존합니다.
API 전체 **495 passed, 8 warnings**, connected 전체 **92 passed**, PostgreSQL contract **30 passed**,
fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**,
protected runtime **28**, Vite **757 modules** build를 disposable local mirror에서 확인했습니다.
workspace의 `tsconfig.json`은 OneDrive `compressed,dataless` read timeout으로 직접 tsc가 막혔고,
동일 source mirror의 tsc/build가 통과했습니다. 실제 device background scheduling·server push
ordering·managed PostgreSQL failover는 별도 acceptance입니다 ([dashboard cross-device readback](../evidence/dashboard-cross-device-readback-2026-09-09.md)).

추가 shopping-list cross-device revision safety 검증 (2026-09-09): `GET /api/shopping-list/revision`을
추가하고 열린 ShoppingListSheet가 목록 read와 함께 revision baseline을 기억하도록 했습니다.
tab 복귀·30초 bounded probe에서 revision 증가 시 최신 장보기 목록을 자동 재조회하며, 체크·삭제·
입고·직접 추가 mutation 중에는 현재 목록을 보존하고 cross-tab refresh를 mutation 완료 뒤 queued
refresh로 처리합니다. API 전체 **496 passed, 8 warnings**, connected 전체 **94 passed**,
PostgreSQL contract **30 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime
**28**, Vite **757 modules** build를 disposable local mirror에서 확인했습니다. 실제 multi-device
scheduling·server push ordering·managed PostgreSQL failover는 별도 acceptance입니다
([shopping list cross-device readback](../evidence/shopping-list-cross-device-readback-2026-09-09.md)).

추가 dashboard active-search cross-device safety 검증 (2026-09-09): dashboard revision으로 홈
inventory와 Rescue Queue를 갱신할 때 활성 `inventory-search` retry channel도 재실행하도록
보완했습니다. 다른 기기 변경 뒤 기본 dashboard와 검색 결과가 서로 다른 revision을 보이는
split-brain 상태를 방지하며, 기존 query/filter와 Coordinator stale-response guard를 유지합니다.
API 전체 **496 passed, 8 warnings**, connected 전체 **95 passed**, fixture/mobile **35 passed + 2 skipped**,
workspace-sync **9**, Sites **4**, service-worker **5**, protected runtime **28**, Vite **757 modules**
build를 disposable local mirror에서 확인했습니다. 실제 device background scheduling·server push
ordering·managed PostgreSQL failover는 별도 acceptance입니다
([dashboard search cross-device readback](../evidence/dashboard-search-cross-device-readback-2026-09-09.md)).

추가 receipt review queue cross-device safety 검증 (2026-09-09): `GET /api/receipts/revision`을
추가하고 검수 대기 summary queue가 목록 read와 함께 revision baseline을 기억하도록 했습니다.
queue sheet의 tab 복귀·30초 bounded probe에서 revision 증가 시 최신 summary 목록만 자동
재조회하고, 실제 AddFoodSheet 검수 화면이 열리면 probe를 중단해 OCR/draft 입력을 교체하지
않습니다. API 전체 **497 passed, 8 warnings**, connected 전체 **96 passed**, fixture/mobile
**35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules** build를 disposable
local mirror에서 확인했습니다. 실제 multi-device scheduling·server push ordering·managed
PostgreSQL failover는 별도 acceptance입니다
([receipt queue cross-device readback](../evidence/receipt-queue-cross-device-readback-2026-09-09.md)).

추가 food-detail cross-device stale safety 검증 (2026-09-09): 열린 FoodDetailSheet가 dashboard
revision 증가를 감지해도 현재 상품 정보·보관·날짜 입력을 자동 교체하지 않고 stale alert를
표시하도록 했습니다. 사용자가 `최신 상태 확인`을 선택한 뒤에만 dashboard/food를 다시 읽어
local draft를 명시적으로 교체합니다. API 전체 **497 passed, 8 warnings**, connected 전체
**97 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules**,
FoodDetailSheet **18.24 kB**, initial client JS **321.51 kB** build를 확인했습니다. 실제 device
background scheduling·server push ordering·managed PostgreSQL failover는 별도 acceptance입니다
([food detail cross-device readback](../evidence/food-detail-cross-device-readback-2026-09-09.md)).

추가 account settings cross-device stale boundary 검증 (2026-09-09): AccountSheet가 열린 동안
기존 `GET /api/dashboard/revision`을 tab 복귀·30초 bounded probe로 확인하고, revision 증가 시
인증 account와 guest account 양쪽에 `다른 기기에서 계정 설정이 변경됐어요` alert를 표시하도록
연결했습니다. 알림 설정·사용자 정의 보관 위치·영수증 privacy·Grocy 하위 panel은 local draft와
확인 상태를 유지하며, 사용자가 `최신 계정 설정 확인`을 선택하고 dashboard sync가 성공한
경우에만 parent refresh nonce를 증가시켜 최신 값을 다시 읽습니다. deterministic browser
fixture **1 passed** for the authenticated account scenario; guest branch scenario added but not rerun,
mirror TypeScript **passed**, `npm run check:runtime` **28 protected files**,
`npm run build` **757 Vite modules**를 확인했습니다. build artifact는 initial client JS
**323.11 kB**, AccountSheet **74.79 kB**였고 기존 ineffective BottomSheet dynamic-import warning은
그대로입니다. prior W9.82 full API **497 passed, 8 warnings**와 connected **97 passed**를
기준선으로 유지했으며, OneDrive source API `/ready` hydration timeout 때문에 이번
frontend-only slice의 full connected rerun으로 승격하지 않았습니다. 실제 multi-device scheduling·
server push ordering·managed PostgreSQL failover·VoiceOver/TalkBack은 별도 acceptance입니다
([account settings cross-device readback](../evidence/account-settings-cross-device-readback-2026-09-09.md)).

## 2026-09-10 canonical target/live PostgreSQL continuation

- canonical 작업본을 `/Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal`로 옮기고,
  target에서 frontend build **757 modules**, protected runtime **28**, fixture/mobile
  **35 passed + 3 skipped**, API **499 passed / 8 warnings**, PostgreSQL contract **30 passed**,
  connected **101 passed**, Sites **4**, workspace-sync **9**, service-worker **5**, release
  manifest **1**을 재확인했습니다. 기존 OneDrive source path는 provider metadata-only 상태를
  확인한 뒤 제거했으며, target이 현재 유일한 code source입니다. generated dependency/cache/DB는
  재생성 대상입니다.
- Docker Desktop server가 회복되어 disposable PostgreSQL 16 normalized live gate를
  재실행했습니다. `001→025` migration apply와 checksum rerun `25 rows`, `/ready`, metrics
  token non-disclosure, custom storage/provenance/search/history, backup/restore, connection
  lifecycle/pool, multi-process receive 4 rounds, crash/replay, receipt draft/commit,
  meal-plan/manual-food idempotency, account deletion fence/crash recovery, direct connection
  recovery를 readback했습니다.
- 실제 두 API process의 concurrent `GET /api/shopping-list` reconciliation에서 한쪽이 stale
  `409`를 반환하는 race를 발견했습니다. `get_shopping_list()`가 winner snapshot을 reload하고
  한 번만 bounded retry하도록 수정했으며, API regression **3 passed**와 live multi-process
  receive **passed**로 고정했습니다. 두 번째 conflict·managed failover·reverse-proxy reset은
  운영 acceptance입니다 ([PostgreSQL live readback](../evidence/postgres-live-readback-2026-09-10.md)).
- canonical target에서 connected guest account settings stale scenario를 전용 ports `8042/4442`로
  실행해 **1 passed**를 추가했습니다. authenticated account와 guest account 모두 revision 증가 시
  local draft를 보존하고 명시적 `최신 계정 설정 확인` 이후에만 child panel을 다시 읽는 계약을 실제
  browser lane에서 확인했습니다 ([guest account settings readback](../evidence/account-settings-guest-cross-device-readback-2026-09-10.md)).
- fixture Playwright lane은 점유 포트에서 unrelated app을 재사용하지 않도록 `--strictPort`와
  explicit reuse opt-in을 사용하며, dedicated port run은 **35 passed + 2 skipped**입니다
  ([frontend runtime port-isolation readback](../evidence/frontend-runtime-port-isolation-readback-2026-09-10.md)).
- PostgreSQL backup/restore는 host client가 없는 macOS에서도 Docker client image로 실행할 수 있도록
  wrapper를 추가했고, disposable PostgreSQL 16 backup→empty restore→normalized lot readback을
  통과했습니다 ([portable client wrapper readback](../evidence/postgres-client-wrapper-readback-2026-09-10.md)).
- `PATCH /api/foods/{food_id}/product-info`가 성공한 뒤 dashboard read가 실패해도 stale cache가
  성공한 상품명·브랜드를 덮지 않도록 frontend read-after-write 경계를 수정했습니다. 첫 typed
  persistence failure→inline retry→성공 PATCH→의도적 dashboard read failure와 stale cache 보존을
  connected 회귀로 확인했고, 최종 full connected suite는 전용 ports `8058/4458`에서 **99 passed**,
  `npm run check:runtime`는 **28 protected files**, TypeScript/build는 **757 Vite modules**로 통과했습니다
  ([product-info write/read recovery readback](../evidence/product-info-write-read-recovery-readback-2026-09-10.md)).
- `PATCH /api/foods/{food_id}/date-assertion`도 성공 response를 즉시 local read model에 반영하고
  stale dashboard cache가 사용자 확인 날짜를 덮지 못하게 보완했습니다. typed failure→retry와
  성공 PATCH 후 의도적 dashboard read failure 회귀를 connected **2 passed**로 확인했고, 최종
  full connected suite는 날짜 시나리오를 포함해 **101 passed**입니다 ([date write/read recovery
  readback](../evidence/date-write-read-recovery-readback-2026-09-11.md)).
- `DELETE /api/foods/{food_id}/product-provenance`도 성공 response/read separation과 stale
  cache 보존을 적용했습니다. modal이 열린 동안 global toast가 `aria-hidden` 아래에 숨겨지는
  문제를 detail-local `role=alert`·inline retry/status로 수정했고, provenance focused **2 passed**와
  현재 compact visual direction에 맞춘 selector/locale 정리 후 fixture/mobile **35 passed + 3 skipped**,
  full connected **101 passed**를 확인했습니다 ([product provenance write/read recovery readback](../evidence/product-provenance-write-read-recovery-readback-2026-09-11.md)).
- 최종 runtime lane은 dedicated port `4459`에서 demo fixture/mobile **35 passed + 3 skipped**로
  통과했고, production 환경(`VITE_DEPLOYMENT_MODE=production`·HTTPS placeholder API)에서 demo
  inventory를 노출하지 않는 fail-closed scenario도 **1 passed**입니다. 기본 포트가 점유된 경우
  `--strictPort`가 unrelated app 재사용을 막고 명확히 종료합니다 ([frontend runtime port-isolation
  readback](../evidence/frontend-runtime-port-isolation-readback-2026-09-10.md)).
- API Docker image의 recipe catalog packaging 수정 후 disposable Compose project를 재기동해
  PostgreSQL·migration `001→025`·PaddleOCR worker·FastAPI API의 health/readiness를 모두 확인했습니다.
  guest auth와 normalized dashboard `7개→8개` inventory write, 동일 Idempotency-Key replay
  `201 + X-Idempotency-Replayed: true`까지 readback했으며, project/container/network/volume은
  검증 후 제거했습니다 ([API container boot readback](../evidence/api-container-boot-readback-2026-09-10.md)).

## 2026-09-11 current-source final recovery readback

- full connected rerun에서 초기 dashboard response의 workspace revision이 polling baseline ref에
  seed되지 않아 첫 visibility probe가 remote change를 초기화로 소비하는 lifecycle 결함을
  재현했습니다. 초기 성공 dashboard 적용 시 `rememberDashboardRevision(mealApi.workspaceRevision)`
  을 호출하도록 수정했으며, dashboard focused regression은 `8074/4474`에서 **1 passed**,
  수정 후 full connected browser는 `8075/4475`에서 **101 passed**입니다.
- 수정된 current source 기준 fixture/mobile runtime은 `4476`에서 **35 passed + 3 skipped**,
  명시적 production fail-closed boot는 `4477`에서 **1 passed**, API 전체는 **499 passed / 8 warnings**,
  TypeScript/Vite build는 **757 modules**, Sites worker는 **4 passed**입니다. `git diff --check`,
  shell syntax, Node syntax, workflow YAML parse도 통과했습니다.
- 이 readback은 local source·API·browser·packaging 회복을 증명하며, 실제 iOS/Android 카메라·
  screen reader, external provider delivery, managed PostgreSQL failover, object-storage
  retention/encryption, signed artifact promotion과 production cutover는 별도 acceptance입니다.

## 2026-09-11 native narrow-viewport regression lane

- `VITE_APP_SHELL=native`로 실제 앱 shell을 사용하고 viewport `320×740`에서
  `NATIVE_RUNTIME_TEST_PORT=4487 npm run test:native`를 실행했습니다. horizontal overflow가 없는지,
  visible interactive element가 viewport 밖으로 나가지 않는지, 식품 추가·식단·알림·계정·상세
  bottom sheet가 320px 안에서 scroll/clipping 없이 열리는지, 125% text preference에서도 주요
  bounds가 유지되는지를 검사해 **4 passed**를 확인했습니다.
- 이 lane은 preview phone frame의 scale 효과와 분리된 native CSS 회귀입니다. 실제 OS font
  scaling semantics·camera permission/lens·VoiceOver/TalkBack·실기기 렌더링은 별도 acceptance입니다.

## 2026-09-11 Playwright lane isolation readback

- default fixture config는 `native-viewport.spec.ts`를 수집하지 않도록 명시하고, native config는
  exact test match·`VITE_APP_SHELL=native`·320×740·별도 port를 사용하도록 분리했습니다.
  default fixture는 `4482`에서 **35 passed + 3 skipped**, native lane은 `4487`에서 **4 passed**로
  각각 통과해 preview scaling과 native CSS bounds의 증거를 분리했습니다.

## 2026-09-11 Playwright webServer cleanup readback

- 두 Playwright config의 webServer command를 `npm run check:runtime && exec
  ./node_modules/.bin/vite ... --strictPort`로 바꿔 종료 대상 process를 직접 소유하도록 했습니다.
  fixture focused test는 `4488`에서 **1 passed**, native focused test는 `4489`에서 **1 passed**이며,
  각 test 종료 후 전용 port가 free임을 확인했습니다. 같은 source의 full fixture lane은 `4490`에서
  **35 passed + 3 skipped**, full native lane은 `4491`에서 **4 passed**이며 두 port 모두 종료 후
  free였습니다.

## 2026-09-11 authoritative mutation readback Module

- `apps/web/src/mutationReadback.ts`를 추가해 product-info/date/provenance/manual food/receipt commit 성공 mutation의
  authoritative response 적용 → best-effort dashboard read → read 실패 시 response 재적용 순서를
  공통화했습니다. empty response·read false·read throw를 contract test **3 passed**로 확인하고,
  해당 connected targeted product/date/provenance/manual/receipt **11 passed**, full connected **101 passed**, TypeScript/Vite **758 modules**
  build를 통과했습니다. domain-specific rollback·workspace conflict·retry UI는 각 caller에
  남겨 기존 safety contract를 보존합니다.

## 2026-09-11 optimistic storage mutation Module

- `apps/web/src/optimisticMutation.ts`를 추가해 storage move/open sequence·consume·discard의
  additive inventory snapshot response와 함께 optimistic apply/restore/readback ordering을
  공통화했습니다. Module contract **3 passed**,
  storage connected targeted **3 passed**, full connected **101 passed**, fixture/mobile **35 passed +
  3 skipped**, native **4 passed**, TypeScript/Vite **759 modules**를 확인했습니다.

## 2026-09-11 container smoke after storage response contract

- `StorageEventResponse.inventory` additive response 변경 후 `infra/container-smoke.sh`를
  `rescue-meal-container-smoke-91136`에서 재실행했습니다. migration **25**, API/OCR ready,
  guest dashboard **7→8**, same-key replay **201 + X-Idempotency-Replayed=true**를 통과했고,
  exact project resource cleanup readback도 통과했습니다. managed failover·provider delivery와
  production cutover은 별도 acceptance입니다.

## 2026-09-11 response-only storage snapshot persistence

- storage event `inventory` snapshot을 response copy에만 유지하고 SQLite/PostgreSQL durable
  event payload에서는 제거하도록 serializer와 replay 경로를 보완했습니다. API targeted **2 passed**,
  full API **499 passed / 8 warnings**, packaged smoke `rescue-meal-container-smoke-2956`의
  migration **25**, API/OCR ready, guest **7→8**, replay **201 + header**, exact cleanup을 확인했습니다.

## 2026-09-11 current-source full-lane stability readback

- response-only storage snapshot source에서 connected 전체를 전용 ports `8116/4516`로 다시 실행해
  **101 passed (4.2m)**를 확인했습니다. 앞선 두 실행에서 관찰한 recipe-review click timeout과
  date-detail page-close는 각각 focused 반복·새 disposable API에서 재현되지 않았고, stale/동시
  Playwright·Vite 프로세스를 분리한 같은 전체 순서에서 통과했습니다. 테스트 실행 환경의 간섭
  evidence를 제품 API/브라우저 계약 실패로 승격하지 않습니다.
- fixture/mobile은 `MOBILE_RUNTIME_TEST_PORT=4500 npm run test:runtime -- --workers=1`에서
  **36 passed + 3 skipped**, iOS install guidance focused repeat는 **10 passed**, native
  `NATIVE_RUNTIME_TEST_PORT=4501 npm run test:native`는 **4 passed**입니다. fixture의 production과
  Web Push 3개 skip은 명시적 운영 조건입니다.
- API **499 passed / 8 warnings**, mutation-readback **3**, optimistic-mutation **3**,
  workspace-sync **9**, service-worker **5**, release-manifest **2**, TypeScript/Vite **759 modules**,
  Sites **4 passed**도 현재 source에서 통과했습니다. real device/provider/managed production gate는
  여전히 별도입니다.

## 2026-09-11 guest transfer and exact replay hardening

- AccountSheet의 guest workspace preview/import 자체 fetch를 `mealApi` explicit account-session
  methods로 중앙화했습니다. 중앙 timeout·typed error·workspace revision response 기억을 사용하고,
  실제 transfer에는 target `If-Rescue-Meal-Revision`을 전달하며 성공 invalidation을 발행합니다.
  pending re-entry preview는 effect cleanup에서 abort하고, 기존 사용자의 import/skip/conflict/retry
  decision은 변경하지 않았습니다. connected guest transfer/conflict **2 passed**, full connected
  **101 passed**, build TypeScript/Vite **759 modules**를 확인했습니다.
- storage event sequence replay가 완성 2-event sequence의 1-event prefix를 replay할 수 있던
  payload identity 결함을 수정했습니다. deterministic index 1 tail과 orphan partial을 감지해
  `409`로 중단하고 same-payload full replay만 허용합니다. 수정 전 red **200**, 수정 후 targeted
  **2 passed**, API 전체 **500 passed / 8 warnings**, full connected **101 passed**입니다.

## 2026-09-11 storage mutation recovery Module

- `saveFood`·`consumeFood`·`discardFood`의 repeated storage recovery block을
  `apps/web/src/storageMutationRecovery.ts`로 수렴했습니다. 기존 `optimisticMutation`을
  호출한 뒤 mutation reject에만 dashboard reconciliation을 한 번 수행하고, caller의 typed
  error/Grocy/global retry disposition을 재사용합니다. 성공 mutation 후 readback false/throw는
  `synced=false` 성공 결과로 전달해 이미 저장된 event에 실패 retry를 붙이지 않습니다.
- pure contract **4 passed**, storage connected targeted **14 passed**, full connected **103 passed**를
  확인했습니다. `npm run test:storage-mutation-recovery`를 web CI에 추가했고, TypeScript/Vite
  build는 protected runtime **28**, **760 modules**로 통과했습니다.

- 첫 storage mutation failure에서만 local optimistic snapshot을 복원하고, reconciliation 이후
  retry failure에서는 stale snapshot을 다시 복원하지 않도록 retry phase를 분리했습니다. 이는
  이미 다른 기기 또는 authoritative read가 반영한 상태를 오래된 배열로 덮지 않게 하는 보강입니다.
  pure contract는 **4 passed**로 확장했고, operation key·payload·typed error·Grocy status와
  global retry surface는 caller 책임으로 유지했습니다.

## 2026-09-11 receipt commit finalization typed failure envelope

- receipt commit finalization 일반 예외가 내부 transaction ID를 포함한 plain string으로 반환되던
  경로를 제거하고, rollback과 `needs_reconciliation` marker는 유지한 채
  `receipt_commit_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)로
  반환하도록 보완했습니다. transaction ID·예외 원문·receipt payload는 response에 노출하지
  않습니다. pending marker flush failure와 reconciliation marker flush failure의 기존 typed
  error 구분은 유지합니다.
- finalization/pending/reconciliation targeted **3 passed**, backend 전체 **500 passed / 8 warnings**,
  connected 전체 **103 passed**를 확인했습니다. 실제 transaction reconciliation operator flow,
  external provider와 managed failover는 별도 acceptance입니다.

## 2026-09-11 meal-plan completion typed failure envelope

- `complete_meal_plan()`의 `WorkspaceMutation` regular exception 경로가 plain string을 반환하던
  contract drift를 수정했습니다. plan/inventory/consumed event/bundle progress/audit rollback과
  concurrent winner replay는 유지하고 `meal_plan_completion_persistence_unavailable` typed `503`
  (`retryable=true`, `action=retry_later`)으로 응답합니다. exception 원문과 allocation payload는
  response에 포함하지 않습니다.
- `mealApi` 전용 type guard와 `MealPlanSheet` failure-payload snapshot을 추가해 typed persistence
  failure에만 inline `다시 시도`를 표시하고, retry는 동일 plan/consumption payload를 보냅니다.
  workspace conflict·allocation validation·일반 오류는 기존 안내만 유지합니다.
- 수정 전 API regression은 string detail에서 실패했고, 수정 후 API completion envelope/rollback
  targeted **3 passed**, typed completion retry connected **1 passed**, backend **500 passed / 8
  warnings**, full connected **104 passed**, fixture/mobile **38 passed + 3 skipped**, native **9
  passed**, build **760 modules**, Sites **4 passed**, release manifest **2 passed**를 확인했습니다.
  external provider, managed failover/partition과 physical device는 별도 acceptance입니다.

## 2026-09-11 account deletion typed failure envelope and native settle gate

- account deletion coordinator의 workspace purge/credential regular failure가 durable `deleting`
  fence를 유지하면서 `account_deletion_persistence_unavailable` typed `503`
  (`retryable=true`, `action=retry_later`)을 반환하도록 정렬했습니다. `AccountSheet`는 typed failure에만
  inline `다시 시도`를 제공하고, 인증·확인 문구·rate-limit 및 untyped 503에는 해당 action을
  추가하지 않습니다.
- 수정 전 purge-failure API regression은 string detail에서 실패했고, 이후 API targeted **3 passed**,
  typed retry/rate-limit connected **2 passed**, backend 전체 **500 passed / 8 warnings**, full
  connected **105 passed**, build **760 modules**를 확인했습니다.
- food-detail first-fold native regression의 `818.008972px` 간헐 실패는 spring transform settle
  전에 측정한 test lifecycle 원인이었습니다. native helper가 computed entrance transform `none`까지
  기다린 후 boundary를 검사하도록 보강했고, native 전체 **11 passed**, fixture/mobile **38 passed +
  3 skipped**를 확인했습니다. protected BottomSheet와 제품 layout은 변경하지 않았습니다.

## 2026-09-11 single meal-plan save typed failure envelope

- `POST /api/meal-plans`의 regular `WorkspaceMutation` flush exception이 raw `RuntimeError`로
  노출되던 경로를 수정했습니다. plan/saved-audit rollback, plan lock, same-plan concurrency
  replay, snapshot/recipe validation은 유지하고 `meal_plan_persistence_unavailable` typed `503`
  (`retryable=true`, `action=retry_later`)으로 응답합니다.
- `MealPlanSheet`는 실패 당시 preview의 `inventory_ids`, `plan_id`, `snapshot_hash`, recipe/bundle
  identity와 servings를 저장해 typed failure에만 inline `다시 시도`를 표시하고 같은 payload를
  재전송합니다. multi-day bundle save는 별도 contract로 유지합니다.
- 수정 전 phantom test에서 raw exception 전파를 확인했고, 수정 후 save envelope/rollback,
  WorkspaceMutation seam, concurrency/revision targeted **4 passed**, typed save retry connected
  **1 passed**, full API **500 passed / 8 warnings**, full connected **106 passed**와 build
  **760 modules**를 확인했습니다. external provider/failover는 별도 acceptance입니다.

## 2026-09-11 multi-day bundle save typed failure envelope

- `POST /api/meal-plans/multi-day`의 regular `WorkspaceMutation` flush exception이 raw
  `RuntimeError`로 전파되던 경로를 수정했습니다. bundle/day/history rollback, bundle lock/replay,
  snapshot conflict와 linked single-plan completion semantics는 유지하고
  `multi_day_plan_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)으로
  응답합니다.
- `MealPlanSheet`는 실패 당시 `inventory_ids`, `bundle_id`, `snapshot_hash`, `max_minutes`,
  `servings`를 보존해 3일 식단 영역에 typed failure 전용 inline `다시 시도`를 표시하고 동일
  payload를 재전송합니다. multi-day preview는 계속 side-effect-free입니다.
- 수정 전 bundle flush regression에서 raw exception 전파를 확인했고, 수정 후 multi-day envelope/
  rollback·bundle WorkspaceMutation·linked day recovery targeted **4 passed**, typed bundle retry
  connected **1 passed**, full API **507 passed / 8 warnings**, final full connected **107/107 passed**,
  fixture/mobile **39 passed + 3 skipped**, native **14 passed**, build **760 modules**, Sites **4 passed**,
  release manifest **2 passed**를 확인했습니다.
  external provider/failover와 distributed bundle transaction은 별도 acceptance입니다.

## 2026-09-11 operational readiness/worker typed 503 envelope

- API `/ready` storage/auth failure와 workspace acquisition의 pool/storage failure, OCR worker
  `/ready` model unavailable·`/ocr` capacity timeout, internal worker token configuration missing,
  recipe review/import configuration, guest workspace provisioning과 account session 발급을
  safe typed `503`으로 정렬했습니다. retry 가능한 상태는 `retryable=true`, `action=retry_later`,
  `Retry-After: 1`을 사용하고, 설정 오류는 `retryable=false`와 `configure_server` 또는
  `configure_storage`를 사용합니다. exception 원문과 token은 response에 넣지 않습니다.
- 수정 전 plain 503 red **4 failed**, 초기 slice 후 API **504 passed**, auth/recipe configuration
  closure 후 API 전체 **507 passed**, OCR worker 전체 **10 passed**,
  Python compile·`git diff --check`를 확인했습니다. 기존 success schema·HTTP status와 domain
  mutation rollback/idempotency는 유지하며, external load balancer/failover/provider 운영은 별도
  acceptance입니다 ([operational 503 envelope readback](../evidence/operational-503-envelope-readback-2026-09-11.md)).

## 2026-09-12 workspace export rate-limit

- `/api/account/export`에 IP·opaque workspace 이중 bucket rate limit을 추가했습니다. 기본 시간당
  6회이며 한도 초과 시 export body 없이 `account_export_rate_limited` typed `429`, `Retry-After`,
  `X-RateLimit-Limit/Remaining`을 반환합니다. AccountSheet는 typed 오류를 안내하고 다운로드를
  생성하지 않습니다.
- export API targeted **2 passed**, typed 429 connected **1 passed**, API 전체 **508 passed / 8 warnings**,
  TypeScript/Vite **760 modules**, protected runtime **28**, fresh full connected **108/108 passed
  (5.0m)**를 확인했습니다. 앞선 date-retry/server lifecycle failure는 historical run으로
  분리했으며, streaming/compression·actor audit·운영 gateway는 별도 acceptance입니다
  ([export rate-limit readback](../evidence/export-rate-limit-readback-2026-09-12.md)).

## 2026-09-12 workspace export actor/time audit and guest preview single-flight

- 성공적으로 생성된 workspace export마다 `WorkspaceExportAuditEvent`를 별도 append-only
  저장소에 기록합니다. actor ID/role, 검증된 request ID, schema version, UTC 시각만 저장하고
  Authorization/token/IP/export payload와 audit event 자체는 다운로드 JSON에서 제외합니다.
  audit insert는 workspace revision을 올리지 않으며 reset/purge 때 해당 workspace row를
  삭제합니다. audit 저장 실패는 `account_export_audit_persistence_unavailable` typed `503`,
  `Retry-After: 1`로 snapshot/Blob 전에 종료합니다.
- PostgreSQL source/migration/readiness 계약은 additive `026_export_audit.sql`로 확장했습니다.
  API actor audit **2 passed**, SQLite persist/reconstruct/reset **1 passed**, PostgreSQL adapter
  query contract **1 passed**, AccountSheet connected audit failure **1 passed**, migration dry-run
  `001→026`을 확인했습니다. 동시 container smoke가 migration rows **26**을 확인했지만, live
  managed PostgreSQL의 export-audit row readback은 아직 claim하지 않습니다.
- 회원가입 직후 guest-transfer preview가 submit handler와 `authMe` effect에서 중복 실행되던
  producer race도 single-flight ref로 닫았습니다. focused regression **1 passed**와 fresh full
  connected **109/109 passed (4.8m)**를 확인했습니다.
- 현재 전체 수치는 API **512 passed / 8 warnings**, fixture/mobile **39 passed + 3 skipped**,
  native **14 passed**, TypeScript/Vite **760 modules**, protected runtime **28**, Sites **4**,
  service-worker **5**, workspace-sync **9**, release manifest **2**입니다. 운영 audit 조회·보존·
  알림, large-workspace streaming/compression, external gateway, managed PostgreSQL
  replica/WAL/failover, provider/device/signed release는 별도 acceptance입니다
  ([export audit readback](../evidence/export-audit-readback-2026-09-12.md), [guest preview readback](../evidence/guest-transfer-preview-single-flight-readback-2026-09-12.md)).
