# Project Context

## Domain

Rescue Meal은 영수증·바코드·포장 라벨로 식료품 기록을 줄이고, 사용자가 확인한 정보만 재고 lot으로 반영하는 안전 중심 소비자용 모바일 PWA입니다. 소비기한을 추정해 확정하지 않고, 표시 날짜·사용자 확인 날짜·상품 유형과 보관 방식에 따른 소비 우선순위를 분리합니다.

## Role

제품 방향을 지키면서 프론트엔드·백엔드·데이터 계약·오픈소스 연동·운영 검증을 함께 진행하는 구현 에이전트입니다. 현재 목표는 수업용 결과물을 상용앱 수준의 vertical slice로 고도화하는 것입니다.

## Codebase

- `apps/web`: React + Vite 모바일 PWA prototype. `Prototype.tsx`와 `prototype.css`가 app-owned UI입니다.
- `apps/web/src/mobile`: PhoneFrame, MobileScroll, BottomSheet, KeyboardInput 등 보호된 모바일 런타임.
- `services/api`: FastAPI API, SQLite local adapter, PostgreSQL projection/normalized inventory contract, auth, receipt/label pipeline, planner, notification, Grocy outbox.
- `services/ocr-worker`: PaddleOCR remote worker.
- `infra`: Docker Compose와 PostgreSQL migration.
- `docs`: product/data/OSS/operation contracts.
- `evidence`: 실행한 검증과 확인하지 못한 범위를 기록하는 append-only 성격의 readback 문서.

## Current authoritative decisions

- Receipt OCR은 `draft → review → commit` 단계로 분리합니다.
- `raw_name`과 사용자 확인 `canonical_name`을 분리하고, receipt line마다 새 StockLot을 생성합니다.
- 상품명·수량·단위·보관 위치는 사용자가 확인한 값으로 기록하며, 소비기한 확정과 혼동하지 않습니다.
- 날짜가 없을 때 backend rule inference는 `estimated_use_first_window`만 생성하고 `requires_confirmation`을 유지합니다.
- `ambient`·`refrigerated`·`frozen`에 따른 참고 우선순위는 storage event와 lot 상태에 반영합니다.
- receipt `purchased_at`이 있으면 날짜 없는 lot의 우선순위 inference 기준일로 사용합니다.
- 첫 `opened` event의 `occurred_at`은 lot의 `opened_at`으로 보존하고, 반복 개봉은 최초 시각을 덮어쓰지 않습니다. 부분 개봉은 unopened parent와 opened child를 분리하며, 표시 날짜가 없는 lot의 priority inference만 첫 개봉일을 기준으로 다시 계산합니다. 라벨·사용자 확인 날짜는 계속 우선합니다.
- account 401은 workspace를 조용히 바꾸지 않고 재로그인을 요구합니다.
- AccountSheet가 열린 동안 dashboard revision이 증가해도 인증 account·guest account 하위 panel의 local draft·확인 상태를 자동 교체하지 않고 `다른 기기에서 계정 설정이 변경됐어요` alert를 표시합니다. 사용자가 `최신 계정 설정 확인`을 눌러 dashboard sync가 성공한 경우에만 parent refresh nonce로 notification preferences·storage locations·receipt privacy·Grocy panel을 다시 읽습니다. 기존 same-tab invalidation과 실제 multi-device/device acceptance 경계는 유지합니다.
- 네트워크 오류는 오프라인 상태로 표시하고, 최신 dashboard는 사용자가 명시적으로 `다시 연결`을 눌렀을 때만 재동기화합니다. offline write는 자동 재생하지 않습니다.
- 마지막 성공 dashboard는 token raw value가 아닌 workspace namespace별 read-only local cache로 보존하고, network failure 시 `최근 화면`으로 명시합니다. account logout/session clear는 해당 cache를 제거하며, stale cache에서는 write를 재생하지 않습니다.
- 재고 상세는 receipt lot의 구매일·영수증 상품 항목 연결을 사용자에게 보여주되, 내부 receipt/line ID와 원본 파일명은 노출하지 않습니다. 구매 출처는 소비기한 확정값과 별도입니다.
- 영수증 review는 업로드한 `File`을 브라우저 `blob:` 임시 URL로 원본 대조 preview에 보여주며, 재선택·mode 전환·실패 재시작·unmount에서 URL을 폐기합니다. 상품 line에는 safe observation ID·정규화 bbox·confidence만 연결해 선택 line의 원본 위치를 강조하고 OCR text는 overlay payload에서 제외합니다. 라벨 review도 날짜 후보에 연결된 safe observation ID·정규화 bbox·confidence만 별도로 overlay하며, 날짜 의미를 확인할 수 없는 후보는 소비기한으로 승격하지 않습니다. 현재 서버는 OCR 처리 중 bytes를 사용하고 metadata만 receipt에 남기므로, 이 preview를 원본 저장 기능으로 해석하지 않습니다. 실제 매장 annotation 기반 위치 정확도와 label/date pixel acceptance는 후속 범위입니다.
- 영수증·라벨 입력은 `getUserMedia`의 `facingMode=environment` 후면 카메라 프리뷰·프레이밍 가이드·촬영 결과와 사진 보관함 fallback을 같은 OCR handler로 연결합니다. 촬영 시 `object-fit: cover` 화면 좌표를 intrinsic video pixel로 매핑해 가이드 안쪽만 crop하고, layout/video metric이 없거나 비정상이면 전체 frame으로 fallback합니다. 권한 실패·OCR 실패 시 재촬영·재선택을 제공합니다. 브라우저 E2E는 crop 계산·권한 실패·fallback 계약을 확인하지만 실제 기기 권한·렌즈·원근·반사·촬영 품질은 운영 gate입니다.
- connected 홈은 `review_required`이고 아직 재고에 반영되지 않은 receipt draft를 `검수할 영수증` 카드로 다시 발견하게 합니다. pending draft가 여러 개면 선택 sheet에서 원하는 receipt를 고를 수 있습니다. `GET /api/receipts/{id}`로 안전한 line·merchant·template metadata만 재구성하고, 원본 image/PDF bytes가 저장되지 않았다는 안내와 함께 preview 없는 review를 보여줍니다. 이미 commit·redaction된 draft는 재개하지 않으며, receipt summary에도 workspace 전환 generation guard를 적용해 이전 workspace의 늦은 응답이 새 workspace에 섞이지 않게 합니다. 재개는 사용자가 확인·반영하기 전까지 StockLot을 만들지 않습니다.
- 같은 receipt ID의 commit은 API 프로세스 내부에서 receipt별 lock으로 직렬화하고, 첫 요청만 lot를 만든 뒤 키 없는 중복 요청은 `409`로 종료합니다. transport retry가 보낸 동일 `Idempotency-Key`·동일 payload는 durable transaction 결과를 replay하고, 키 재사용 payload 변경은 `409`로 차단합니다. 서로 다른 프로세스의 stale write는 PostgreSQL workspace revision guard가 차단하므로, pending transaction을 남긴 process crash 뒤에도 동일 key가 새 lot 없이 이어집니다. 브라우저도 마지막으로 관찰한 `X-Rescue-Meal-Workspace-Revision`을 mutation의 `If-Rescue-Meal-Revision`으로 전달하며, 불일치하면 handler 전에 구조화된 `workspace_revision_conflict` 409를 받고 최신 read model을 확인한 뒤 사용자가 재시도합니다. 유효 receipt lock은 활성 요청 동안만 weak registry에 유지하고 완료 뒤 회수합니다. 자동 merge·managed failover·network partition은 운영 acceptance입니다.
- receipt draft는 fingerprint lock과 active mutation lock 안에서 pending review projection을 `WorkspaceMutation` outer flush로 저장합니다. 동일 fingerprint pending draft는 `X-Idempotency-Replayed`로 재사용하고 committed receipt는 `409`로 막으며, persistence failure는 `receipt_draft_persistence_unavailable` typed 503으로 phantom 없이 반환합니다. `openAdd()`는 AddFoodSheet와 LazyBottomSheet를 모두 resolve한 뒤 dialog를 열어 file/tab control이 준비되기 전 shell을 노출하지 않습니다 ([receipt draft mutation and intake readiness readback](evidence/receipt-draft-mutation-readiness-readback-2026-09-08.md)).
- OCR 이미지 품질이 낮은 경우에도 원본 SHA-256·preview·bbox 좌표를 보존하기 위해 대비가 낮거나 극단적으로 어두운 입력에만 `low_contrast_enhanced` profile을 적용합니다. 흐림·반사·원근·잘림은 자동 복구하지 않고 `source` 입력과 재촬영 안내를 유지하며, 응답 profile은 정확도·소비기한·안전 판정이 아닙니다. PaddleOCR UVDoc은 원본 역변환 좌표 계약 전까지 비활성입니다.
- OCR worker는 `/health` liveness와 `/ready` model readiness를 분리하고, readiness에서 모델 생성뿐 아니라 실제 `predict()` warm-up까지 통과시킵니다. PaddleOCR initialization/warm-up은 process 내부 lock으로 직렬화하며, CPU inference slot 기본값은 1건·queue timeout 초과는 `503`입니다. 현재 pinned PaddlePaddle Linux CPU wheel의 target은 `linux/amd64`, model은 `PP-OCRv5_mobile_det` + `korean_PP-OCRv5_mobile_rec`, 실행 backend는 `enable_mkldnn=False`입니다. source pixel 25,000,000·max side 2,048px preprocessing으로 extreme input을 제한합니다. Docker disposable readback은 image platform·model import·health/ready·synthetic OCR complete·실제 첨부 5장 순차 complete와 OOM 없는 상태를 확인했지만 매장별 annotation 정확도·cold/warm latency·replica sizing·실기기는 별도 gate입니다.
- frontend `VITE_DEPLOYMENT_MODE`는 개발 서버의 `demo`와 명시적 `production`을 분리합니다. 개발 서버에서만 mode 생략을 demo로 허용하고, production build에서는 mode 자체를 명시해야 하며 production에서 HTTPS `VITE_API_BASE_URL`이 없거나 잘못되면 demo fixture를 렌더링하지 않고 설정 차단 화면에서 멈춥니다. 이는 저장되지 않는 입력을 정상 성공처럼 보이는 배포 실수를 막기 위한 fail-closed 경계입니다. 실제 API/TLS/CORS 도달성은 별도 운영 gate입니다.
- connected frontend origin은 API의 `RESCUE_MEAL_CORS_ORIGINS`에 정확히 허용되어야 합니다. 허용되지 않은 origin은 fixture로 조용히 전환하지 않고 offline/reconnect 상태로 남기며, 실제 HTTPS origin·CORS·TLS readback은 운영 gate입니다.
- receipt·label intake는 요청 generation을 사용해 최신 파일·mode만 UI에 반영합니다. 오래된 OCR 응답은 늦게 도착해도 review를 덮어쓰지 않으며, 실제 HTTP 취소와 worker 비용 회수는 별도 운영 범위입니다.
- app-owned workspace read는 `WorkspaceSyncCoordinator` Module의 opaque workspace key·workspace version·channel request ticket과 실행별 `AbortController`를 사용합니다. dashboard·알림·장보기·재고 검색·receipt summary와 계정 notification preference·receipt privacy·Grocy read/export를 같은 Interface(`prepareWorkspace → run(signal)`)로 통과시키며, provider 준비 전 요청을 예약하고 완료 후 최신성을 재확인해 겹친 오래된 provider가 state를 되돌리지 않게 합니다. 같은 channel의 새 실행·invalidate는 이전 signal을 중단하고 `mealApi` fetch까지 전달합니다. 성공한 mutation은 raw token 없이 `BroadcastChannel` 우선·`localStorage` fallback transport로 같은 workspace의 다른 탭을 invalidate하며, account settings panel은 workspace ID key로 재생성하고 식단 화면은 active cleanup을 유지합니다. PostgreSQL workspace write는 revision 선행조건으로 stale payload를 거부하고, 프론트는 structured 409 뒤 새 read를 표시합니다. notification worker는 cancellation reason별 safe process-local Prometheus counter와 token-protected scrape endpoint를 제공하며, 이는 multi-replica collector/alert와 분리됩니다. 이는 client read/write lifecycle 경계이며 이미 시작된 worker CPU 비용·자동 merge·managed failover는 별도입니다.
- durable SQLite/PostgreSQL workspace projection은 `_AtomicStoreStateMixin` copy-on-write read snapshot을 사용합니다. 요청 중 refresh는 private loading state를 먼저 완성한 뒤 reference를 교체하므로 동시 reader가 transient empty collection을 보지 않으며, reload 시작 이후 감지된 local mutation도 보존하고 loader failure는 이전 read snapshot을 유지합니다. 이는 planner latest/read lifecycle의 local adapter 경계이고, PostgreSQL revision guard·operation pool·managed failover·network partition·rolling deploy·다중 replica ordering을 대체하거나 증명하지 않습니다.
- retryable receipt·manual food·shopping receive·storage event의 operation identity는 `OperationLedger` Module에서 key normalization·SHA-256 digest·canonical payload fingerprint·legacy scoped ID를 계산합니다. domain scope·durable record·replay response·conflict detail은 각 Adapter가 유지하며 key 원문은 저장하지 않습니다.
- `MealPlanSheet`의 preview·latest·preferences·alternatives·multi-day history·audit·nested shopping read는 `WorkspaceSyncCoordinator`의 `meal-plan`/`shopping-list` channel과 실행별 `AbortSignal`을 사용합니다. planner preview·barcode parse·label parse/intake·inference·guest-transfer preview처럼 POST이지만 workspace를 바꾸지 않는 요청은 mutation invalidation을 발행하지 않으며, meal-plan save/complete와 preference mutation만 열린 planner를 invalidate합니다. same-origin cross-tab 변경은 current planner를 다시 읽고 stale 응답을 폐기하며, planner와 알림 센터의 cross-device revision probe는 각 화면의 local state 보호 규칙을 유지한 채 보조 refresh를 수행합니다 ([meal-plan client transport readback](evidence/meal-plan-client-transport-readback-2026-09-08.md), [notification cross-device readback](evidence/notification-cross-device-readback-2026-09-09.md)).
- primary intake의 `AddFoodSheet`는 initial bundle을 줄이는 lazy split을 유지하되 `openAdd()` user intent에서 chunk를 prefetch하고 resolve 후에만 dialog를 열어 control 없는 shell을 노출하지 않습니다. load 실패는 retry toast로 복구하며 실제 mobile network·CDN·OS picker·camera permission은 별도 gate입니다.
- `WorkspaceMutation` 적용 caller는 active store의 process-local `RLock`으로 snapshot·mutation·flush·restore를 직렬화합니다. date/provenance/shopping/notification/push/preferences/Grocy mapping/retry의 refresh interleaving을 줄이지만 receipt·meal-plan·storage direct route, 외부 worker transaction, 전체 workspace atomicity를 주장하지 않습니다.
- storage event direct route도 active workspace lock 안에서 idempotency precheck·lot validation을 수행하고, `WorkspaceMutation`으로 InventoryRepository mutation·Grocy outbox·rollback을 연결합니다. 동일 key concurrent request는 단일 event/replay로 수렴하지만 receipt·meal-plan direct route와 외부 Grocy transaction까지 전체 atomicity를 의미하지 않습니다.
- single meal-plan save는 기존 plan별 lock을 유지하면서 `WorkspaceMutation`으로 candidate validation 이후 saved plan·audit staging·flush·regular failure rollback을 수행합니다. plan_id replay와 PostgreSQL winner semantics는 유지하고 multi-day bundle/completion은 별도 contract입니다.
- single meal-plan completion도 plan별 lock과 `WorkspaceMutation`을 사용합니다. allocation 검증 후 consumed storage event·Grocy outbox·plan/bundle progress·completed audit를 staging하고 `reprioritize(persist=False)`와 outer flush로 묶어 flush failure 시 phantom consumption을 복원합니다. multi-day bundle save와 외부 provider transaction은 별도 contract입니다.
- multi-day bundle save도 `bundle_id`별 lock과 `WorkspaceMutation`으로 preview rematerialization·snapshot hash/day identity 검증·bundle/day staging·flush/restore를 수행합니다. preview는 side-effect-free로 유지하며, 저장한 날짜의 completion은 `bundle_id`·`bundle_day_index`로 연결한 single-plan completion route가 bundle progress까지 같은 `WorkspaceMutation` snapshot/flush로 처리합니다. 외부 provider transaction은 별도 contract입니다 ([multi-day day completion recovery readback](evidence/multi-day-day-completion-recovery-readback-2026-09-08.md)).
- receipt commit은 `CommitTransactionRecord(status=pending)`를 먼저 durable flush해 crash/retry identity를 보존한 뒤, receipt lock과 active workspace lock 안의 `WorkspaceMutation`으로 lot·receipt 상태·alias/provenance audit·Grocy outbox·saved transaction을 한 번에 finalization합니다. finalization 내부의 `upsert_from_receipt(persist=False)`와 `reprioritize(persist=False)`는 중간 persistence를 막고, regular finalization failure는 business snapshot을 복원한 뒤 transaction을 `needs_reconciliation`으로 남깁니다. 시작 marker flush failure는 `receipt_commit_persistence_unavailable` typed 503과 phantom 제거로, reconciliation marker 재flush failure는 durable pending identity를 유지한 `receipt_commit_reconciliation_unavailable` typed 503으로 반환하며 frontend는 같은 commit key와 고정 payload로 retry합니다. PostgreSQL concurrency winner/replay 경로와 외부 Grocy transaction·managed failover·response reset은 별도 contract입니다 ([receipt commit retry readback](evidence/receipt-commit-retry-readback-2026-09-09.md)).
- `data/fixtures/labels/`에는 원본 이미지를 저장하지 않고, 제공 라벨 구조를 비식별화한 ambiguous-date·no-date fixture를 둡니다. `(포장)년·월·일`과 `유효년·월·일`이 좌표 없이 인접하면 `unknown`으로 보류하고, 날짜 없는 상품은 일반 barcode/storage hint만 유지하며 소비기한을 만들지 않습니다.
- connected E2E는 공유 persistent SQLite를 사용하지 않고 disposable database와 명시적 CORS origin을 사용해야 합니다. Grocy retry 등 mobile button 검증은 `force:true` 좌표 click이 아니라 semantic click/actionability로 실행하며, 상세 진단은 connected E2E readback에 기록합니다.
- 기본 `npm run test:runtime`은 fixture-only Playwright lane으로 `connected-prototype.spec.ts`를 수집하지 않습니다. connected API/browser 검증은 `playwright.connected.config.ts`와 `npm run test:connected`에서만 실행해 두 lane의 서버 계약을 섞지 않습니다.
- 현재 PostgreSQL schema baseline은 additive migration `026_export_audit.sql`까지입니다. normalized receipt는 `template_id`·`template_confidence`·`merchant_name`을 compatibility JSON과 함께 저장·복원하고, 수동 식품 create/correction command는 key digest·payload fingerprint replay ledger를 함께 저장하며, shared recipe catalog는 별도 revision fence를 사용하고, workspace-scoped 사용자 정의 보관 위치는 canonical `storage_type`과 별도로 normalized lot/event reference에 보존하며, workspace export 성공 요청은 actor/time audit를 별도 append-only row에 보존합니다. 기존 volume은 `infra/postgres/migrate.sh --apply`를 명시적으로 실행해야 합니다.
- 재고 검색은 canonical `storage_type` 필터와 별도로 사용자 정의 `storage_location_id` bounded filter를 지원하며, connected home의 위치 picker와 서버 검색 결과는 같은 location ID를 사용합니다. 위치가 삭제되면 열린 필터는 전체 목록으로 복귀하고, demo/오프라인에서는 이미 받은 dashboard snapshot에서 같은 조건으로 필터링합니다.
- meal plan save는 preview `plan_id`, multi-day save는 `bundle_id`, completion은 plan ID와 `completed_at`을 identity로 사용합니다. plan/bundle lock과 PostgreSQL revision winner replay로 동일 save를 수렴시키고, completion race는 `completed + already_completed` 및 단일 consumed audit/event 결과로 검증합니다.
- `postgres-live`는 현재 fresh schema migration `001→026`까지 적용·재실행 skip을 확인하고, 사용자 정의 보관 위치의 create/assignment/readback과 export audit row의 workspace/actor/time persistence, receipt draft metadata/draft race·meal-plan save/complete race·manual food two-process replay/correction race smoke를 함께 실행합니다. GitHub Actions 실제 성공 전에는 CI pass로 승격하지 않습니다.
- `apps/web`의 `npm run test:connected`는 disposable SQLite API launcher와 Vite를 함께 기동하고 종료 시 임시 DB를 삭제해 connected E2E를 재현합니다. 실제 사용자 persistent DB를 테스트 대상으로 사용하지 않습니다.
- CI `ocr-worker`는 Python 3.12 worker unit와 `linux/amd64` Docker image build를 수행하고, `postgres-live`는 disposable `pgvector/pg16` service에서 001→026 migration apply와 normalized `/ready`·dashboard·사용자 정의 보관 위치 assignment/readback·workspace export actor/time audit persistence·inventory write/search·상품 후보 provenance·상품 프로필 correction·날짜 보관조건 persistence·receipt commit idempotency field/restart·두 API process replay/conflict·custom backup/빈 DB restore·두 connection stale overwrite guard·account auth restart/password rotation/delete smoke·operation pool exhaustion/persistence/shutdown smoke·manual food replay/correction race를 수행하도록 구성되어 있습니다. 실제 GitHub Actions 성공 전에는 CI pass로 승격하지 않습니다.
- PostgreSQL workspace store는 request·Grocy/notification/product-enrichment worker lease로 snapshot 수명을 보호하고, 유휴 durable workspace만 `RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE`(기본 16, 1~256) LRU cache에서 닫습니다. physical workspace operation은 `PostgresOperationPool`의 `RESCUE_MEAL_POSTGRES_POOL_*` bounded checkout을 사용하며, `PooledConnectionProxy`가 full-snapshot cursor부터 commit/rollback까지 같은 connection을 유지합니다. FastAPI lifespan은 router/pool·auth·Grocy resource를 명시적으로 닫습니다. pool은 process별 workspace operation 상한이고 shared product/recipe/auth owner를 통합하지 않습니다. production preflight는 `RESCUE_MEAL_POSTGRES_PROCESS_COUNT`·`RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS`·실제 `RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS`를 요구하고 `process × (2 base/auth + pool max) + reserved <= max_connections`를 검사하지만, managed PostgreSQL failover와 network partition은 별도 운영 gate입니다.
- PostgreSQL migration은 Docker init SQL에만 의존하지 않습니다. `infra/postgres/migrate.sh --apply`가 `rescue_schema_migrations`에 migration 이름·SHA-256·적용 시각을 기록하고, 같은 checksum은 skip하며 변경된 파일은 실행 전에 drift로 중단합니다. 새 변경은 기존 migration 수정이 아니라 additive migration으로 추가하고, ledger가 없는 기존 volume은 backup·DSN 검토 후 명시적으로 bootstrap합니다.
- CI `connected-e2e`는 disposable SQLite API launcher·Vite·Chromium으로 `connected-prototype.spec.ts`를 실행하도록 구성되어 있습니다. 실제 GitHub Actions 성공 전에는 CI connected pass로 승격하지 않습니다.
- 알림은 workspace별 `lead_days`·IANA `timezone`·앱 내 표시·조용한 시간·push 의향으로 저장하며, 앱 날짜 경계·planner 날짜·Web Push quiet hours에 같은 사용자 timezone을 적용합니다. 현재 재고의 표시 날짜·추정 우선순위·포장지 보관조건 불일치(`storage_mismatch`)·Grocy 확인 필요를 별도 알림으로 파생하고, custom location이 있으면 불일치 문구에도 실제 위치 이름을 표시합니다. 기본 timezone은 `Asia/Seoul`이고, 프론트는 브라우저의 현재 기기 timezone을 자동 저장하지 않은 채 사용자가 선택할 수 있는 draft action으로 제안합니다. 저장 시각은 UTC이고 API image는 explicit `tzdata` runtime dependency로 IANA timezone DB를 보장합니다. Web Push endpoint는 서버 내부에만 보관하고 UI/API summary에는 fingerprint만 노출합니다. VAPID delivery worker가 없으면 실제 발송을 주장하지 않습니다.
- notification delivery는 unread notification×subscription outbox와 explicit workspace worker lease/heartbeat로 처리합니다. VAPID/pywebpush 설정·`push_enabled`·subscription이 모두 있을 때만 전송하며, quiet hours·bounded retry·dead-letter·404/410 정리를 적용합니다. local preview는 VAPID가 없으면 disabled heartbeat만 기록합니다.
- workspace export는 재고·구매 summary·보관 event·식단·알림 설정만 제공하고 password/token/OCR 원문·파일명·push endpoint는 제외합니다. 성공 요청의 actor·role·safe request ID·UTC 시각은 `WorkspaceExportAuditEvent`로 별도 저장하며 export JSON에는 넣지 않습니다. audit persistence failure는 snapshot/Blob 없이 typed `503`으로 닫고, audit insert는 workspace revision을 올리지 않습니다. export는 읽기 전용이며 import/법적 portability 완전 충족과 혼동하지 않습니다.
- account password change는 `session_version`을 증가시키고 기존 account token을 즉시 무효화한 뒤 새 token을 발급합니다. legacy 6-part token은 version 0으로만 호환합니다.
- account password reset은 generic request 응답을 사용해 계정 존재 여부를 노출하지 않습니다. 30분 one-time token의 원문은 설정된 메일 provider에 transient delivery하고 저장소에는 hash만 보관하며, 완료 시 password와 `session_version`을 동시에 교체하고 새 session을 발급합니다. provider가 없으면 메일을 보내지 않습니다.
- account 삭제는 현재 비밀번호와 정확한 `DELETE` 확인 문구를 요구한 뒤 auth row를 durable `deleting`으로 고정하고 account workspace purge와 credential/reset token 삭제를 수행합니다. 중간 실패는 `503`으로 남고 같은 session의 삭제 요청으로 재시도할 수 있으며, 일반 account/workspace 요청은 `423 account_deletion_in_progress`로 차단됩니다. 성공 후 기존 stateless token은 `401`이며, shared recipe catalog와 guest source는 자동 삭제하지 않습니다. auth DB·workspace DB·backup/WAL의 distributed deletion은 운영 정책으로 남깁니다.
- 회원가입 직후 guest 기록은 preview 후 사용자 승인으로만 account workspace에 복사합니다. source는 삭제하지 않고, target 충돌은 `409`, 동일 재요청은 `already_transferred`로 처리합니다. 건너뛴 transfer는 target workspace ID에 묶어 같은 account 재진입 때만 재확인합니다. import의 ready/conflict 판정과 copy는 두 workspace ID의 고정 순서 lock 안에서 함께 수행해 preview 직후의 account write가 guest snapshot에 덮이지 않게 하며, target flush failure는 `guest_transfer_persistence_unavailable` typed 503과 기존 target snapshot restore로 복구합니다 ([guest transfer lock/recovery readback](evidence/guest-transfer-lock-recovery-readback-2026-09-09.md)).
- meal planner는 단일 preview·최대 3개 대안·최대 3일 preview를 제공하고, 3일 preview에서는 이전 날짜 allocation 수량을 다음 날짜 working inventory에서 차감합니다. 사용자가 승인한 다일 bundle은 `bundle_id`·`snapshot_hash`로 저장/재시도/latest/history 복원을 지원하며, 대안·다일 날짜를 단일 plan으로 저장할 때도 `recipe_id`를 서버에서 재검증합니다. bundle day는 `planned`·`saved`·`completed` 상태와 단일 plan 연결을 보존하고, 조리 완료 성공 시 같은 bundle progress를 갱신합니다. 단일 plan history 자동 추가·재고 자동 차감은 하지 않습니다. 영양/예산 최적화와 bundle 하위 plan 일괄 완료는 아직 별도 범위입니다.
- 장보기 목록은 저장된 단일 plan 또는 multi-day bundle에서 사용자가 명시적으로 추가한 부족 재료만 `canonical_name + unit`으로 합산합니다. source별 기여량·bundle day를 보존하고, 같은 source 재동기화는 중복하지 않습니다. `GET /api/shopping-list` 때 현재 inventory를 재검증해 새로 보유하게 된 source 기여분은 자동 제거하며, 장보기 항목은 소비기한 확정·구매 주문·결제 상태를 의미하지 않습니다.
- 장보기 입고에 `Idempotency-Key`가 있으면 lot과 분리된 `ShoppingListReceiveOperation`을 같은 workspace flush에 저장합니다. 동일 요청은 lot replay, payload 변경은 `409`, lot이 소비·폐기되어 사라진 뒤 같은 key가 오면 재생성 없이 `409`입니다. SQLite/PostgreSQL·export·guest transfer에 record를 보존하고 guest transfer preview/완료 건수 및 보류 import 판정에도 반영하지만 원본 key는 저장하지 않습니다.
- 실제 PostgreSQL 두 process의 bounded multi-round receive stress와 revision-lock crash-before-commit smoke를 통과했습니다. lock 대기 중 process를 `SIGKILL`해도 부분 lot/operation이 commit되지 않고, 다른 process의 같은 key retry가 최초 입고를 만들며, 재시작 process가 같은 lot을 replay합니다. commit 직후 응답 전 crash·managed failover·network partition은 운영 acceptance로 남깁니다.
- 별도 smoke middleware로 commit 후 HTTP response 전 process 종료도 재현했습니다. 클라이언트가 정상 응답을 받지 못해도 다른 process와 재시작 process가 durable operation을 replay하며 operation/lot을 중복 생성하지 않습니다. 실제 reverse proxy response reset·managed failover·network partition은 운영 acceptance로 남깁니다.
- meal planner의 `MealPreferences`는 workspace별 주요 알레르기 회피 8종을 저장합니다. 서버는 중복 code를 제거하고 고정 순서로 정규화하며, 알려진 `recipe.allergens`와 겹치는 후보를 제외합니다. 팀 작성 recipe는 canonical ingredient·검토된 제목·조리 단계 curated rule로 metadata를 계산하고, 외부 recipe가 metadata를 제공하지 않으면 회피 조건이 있는 동안 abstain합니다. `known`은 알레르기 없음·교차 접촉 없음·의료적 안전을 보증하지 않으며, 조건은 export·guest transfer·SQLite/PostgreSQL projection에 포함합니다.
- meal plan은 실제 allocation된 lot 중 날짜가 오늘/지난 `use_by`·`sell_by`·`best_before`, `unknown`·`production_date`·`packaging_date`, 또는 포장지 `applicable_storage_type`과 현재 위치가 다른 식품을 `date_review_required`로 표시합니다. `date_review_foods`와 안내문에는 실제 확인 대상 재료명을 포함하고, 홈 Rescue Queue·재고 목록·식품 상세도 같은 의미의 `조리 전 날짜 확인` 안내를 표시합니다. 이는 포장 날짜·보관 상태 확인 안내이고 소비기한 재추정·`safe_to_eat` 판정·자동 차감은 하지 않습니다.
- 홈은 계정 workspace가 비어 있거나 보관 위치 필터 결과가 없을 때 조용히 빈 화면을 보여주지 않고, 첫 식품 추가·전체 목록 복귀 CTA를 제공합니다. 날짜 헤더는 로컬 현재 날짜로 갱신하고 식단 CTA 보조 문구는 실제 우선 식품에서 생성하며, demo 사용자 이름을 고정하지 않습니다.
- 재고 목록은 보관 위치와 함께 상품명·브랜드·카테고리를 검색할 수 있습니다. 연결 모드에서는 workspace-scoped `/api/inventory/search`가 bounded page와 `total`·`has_more`를 반환하고, PostgreSQL projection은 migration `009_inventory_search.sql`의 정규화 검색 문자열·`pg_trgm` index 계약을 사용합니다. 데모/오프라인 fixture에서는 dashboard payload를 로컬 필터링합니다. 결과가 없으면 검색 조건 초기화 CTA를 제공합니다.
- Grocy external write는 outbox·idempotency·transaction ID readback·retry/dead-letter/reconciliation 경계 안에서만 수행합니다.
- secure Compose profile은 `RESCUE_MEAL_AUTH_REQUIRED=true`·auth rate limit을 기본으로 전달하고 API healthcheck는 `/ready`를 봅니다. `/ready`는 required auth secret이 없으면 실패하며, persistent SQLite/PostgreSQL auth store에서는 rate-limit bucket도 shared atomic event storage를 사용하고 in-memory mode만 process-local fallback으로 남깁니다.
- API는 CSP·Permissions-Policy·frame/MIME/referrer security headers를 적용합니다. protected Sites worker는 수정하지 않고 frontend headers를 hosting/reverse proxy 요구사항으로 둡니다. HSTS는 TLS reverse proxy의 책임으로 두고, frontend `connect-src`는 실제 배포 origin에 맞춰 더 좁혀야 합니다.
- `AUTH_REQUIRED=true`인 secure mode에서는 local development CORS origin을 자동 허용하지 않고 `RESCUE_MEAL_CORS_ORIGINS`의 명시 origin만 허용합니다. local optional mode에서만 4173 defaults를 유지합니다.
- storage event는 선택적 `Idempotency-Key`로 deterministic replay를 지원하고, frontend는 해당 mutation의 network failure를 동일 key로 한 번 재시도합니다. key 충돌은 `409`이며 header 없는 legacy 요청은 호환 경로로 남깁니다.
- 바코드 product resolver는 `local fixture → C005(설정된 경우) → Open Food Facts(설정된 경우)` 순서로 후보를 만들고, provider별 상태·confidence·provenance·source freshness를 함께 보존합니다. C005의 `POG_DAYCNT`와 명시적 보관 문구는 제품 기준 참고값일 뿐 개별 팩 `DateAssertion`으로 승격하지 않습니다.
- 사용자가 barcode 또는 receipt 후보를 적용한 lot는 `product_provenance`에 source URL·confidence·source freshness·상품 기준 storage hint·검토 메모를 보존하고, applied/replaced/removed before/after audit event를 append-only로 남깁니다. 상품 provenance는 package-specific `DateAssertion`과 별도이며, barcode 상품명을 직접 수정하면 프론트가 해당 provenance를 제거합니다. 식품 상세에서 상품명·브랜드·분류를 직접 고치면 기존 provenance를 제거하고 `FoodProductInfoAuditEvent`를 남기되 수량·단위·구매일·보관 상태·개봉 상태·DateAssertion은 보존합니다. receipt canonical 이름이 후보와 달라지면 commit 시 backend가 stale `match_candidates`와 lot provenance를 함께 제거합니다. 두 audit는 SQLite/PostgreSQL projection·workspace export·guest transfer에 포함됩니다.
- `PATCH /api/foods/{food_id}/product-info`는 active mutation lock과 `WorkspaceMutation` outer flush로 profile·provenance removal audit·product-info audit·priority를 함께 저장합니다. regular failure는 `product_info_persistence_unavailable` typed 503으로 기존 lot state를 유지하고, 열린 detail sheet는 optimistic profile을 원복한 inline retry를 제공합니다. PATCH가 성공한 뒤 후속 dashboard read만 실패해도 성공 response를 즉시 local read model에 반영해 durable 변경을 숨기지 않고, `syncDashboard()`가 stale cache를 잠시 표시한 경우에도 성공한 profile을 다시 보존하며 최신 목록 재조회 실패를 별도 안내합니다. quantity/unit/purchase/opened provenance와 DateAssertion은 변경하지 않습니다 ([product-info mutation recovery readback](evidence/product-info-mutation-recovery-readback-2026-09-08.md), [write/read recovery readback](evidence/product-info-write-read-recovery-readback-2026-09-10.md)).
- `PATCH /api/foods/{food_id}/date-assertion`도 성공한 `ApiFood` response를 즉시 local read model에 반영하고, 후속 dashboard read나 stale cache가 사용자 확인 날짜를 덮지 못하게 보존합니다. PATCH 자체 failure는 기존 typed retry/rollback을 유지하며, date meaning·수량·보관·개봉 provenance 경계는 변하지 않습니다 ([date write/read recovery readback](evidence/date-write-read-recovery-readback-2026-09-11.md)).
- `DELETE /api/foods/{food_id}/product-provenance`도 성공 `ApiFood` response를 즉시 적용하고 stale cache가 성공한 출처 제거를 되돌리지 않게 합니다. typed mutation failure는 이전 provenance를 즉시 복구하며, detail sheet가 열린 동안에는 Radix `aria-hidden` 아래 global toast에 의존하지 않고 modal-local `role=alert`·inline `다시 시도`와 `role=status`를 사용합니다 ([product provenance write/read recovery readback](evidence/product-provenance-write-read-recovery-readback-2026-09-11.md)).
- 라벨 OCR이 읽은 보관조건은 `DateAssertion.applicable_storage_type`·`storage_condition_text`로 저장합니다. 실제 lot 위치와 다르면 날짜를 바꾸거나 소비기한을 재추정하지 않고 식품 상세에서 포장지 조건과 현재 위치의 불일치를 경고하며, 실제 recipe allocation에 포함될 때 planner 조리 전 확인과 `storage_mismatch` 알림으로 같은 사실을 연결합니다. 이 값은 migration 017과 normalized PostgreSQL read/write/restart contract에 포함됩니다.
- I1250은 바코드 흐름에 억지로 섞지 않고 `/api/products/resolve-name/{product_name}` 별도 review endpoint로 두며, 외부 lookup flag와 서버 key가 모두 있을 때만 제품명·제조사·품목유형·`POG_DAYCNT` 후보를 반환합니다.
- I1250 name lookup도 성공 1일·미조회 10분·장애 60초의 별도 process cache를 사용해 같은 review line의 반복 조회로 공공 API quota를 소모하지 않게 합니다.
- 날짜가 없는 식품의 `estimated_use_first_window`에는 `rule-assisted-backend-inference` provider/version/rule/evidence/reasoning/input hash trace를 보존하지만, 표시 날짜·소비기한·`safe_to_eat`로 승격하지 않습니다.
- `/api/inference/priority`는 `rules`를 기본 provider로 사용하고, `RESCUE_MEAL_INFERENCE_PROVIDER=ollama`일 때 규칙 미매칭 요청에만 private Ollama structured-output fallback을 사용합니다. Pydantic schema·bounded response·abstain을 적용하며 서버가 기준일/개봉일을 계산하고 모델은 개봉 전 일수만 반환합니다. 모델 confidence는 cap되고 항상 review-only이며, 모델 장애는 내부 재고 mutation과 분리된 보류 응답으로 degrade합니다.
- product master 외부 조회는 bounded process cache(성공 7일·미조회 15분·장애 60초)를 사용합니다. multi-worker shared cache와 provider별 분산 rate limiter는 Redis/PostgreSQL 운영 gate로 남깁니다.
- 영수증 상품명 매칭은 `user_confirmed_alias → local_rule → parser` 후보 waterfall로 처리하고, 사용자가 commit에서 확인한 raw 상품명과 canonical 상품명의 차이는 workspace-scoped alias projection에 저장합니다. alias는 다음 draft의 후보 정확도를 높일 뿐 receipt review/commit gate와 날짜 확정 gate를 우회하지 않습니다.
- I1250 receipt enrichment는 draft 생성과 분리된 `queued → in_flight → succeeded/dead_letter` job으로 처리하며, API service-token tick·workspace refresh·PostgreSQL row-lock lease·stale recovery·bounded retry·heartbeat를 사용합니다. worker는 match candidate provenance만 추가하고 canonical 상품명·보관 위치·DateAssertion을 자동 변경하지 않습니다.
- 첫 화면에 필요하지 않은 AddFood·FoodDetail·Notification·Guidance·Account·MealPlan sheet는 lazy chunk로 분리하고, app-owned `motion/react` 직접 의존도와 closed sheet mount를 줄였습니다. 최신 telemetry/PDF 포함 build에서 initial client JS는 Vite 기준 485.52KB로 500KB advisory 아래이며, CSS animation은 reduced-motion을 지원합니다. protected mobile worker/runtime은 수정하지 않고, `mobile/index.ts` barrel의 ineffective dynamic import warning은 별도 경계로 기록합니다.
- `Prototype` app-owned content는 `RuntimeErrorBoundary`로 감싸 렌더링 예외 시 빈 화면 대신 저장 기록 보호 안내와 reload action을 보여줍니다. 사용자 화면에는 exception detail을 노출하지 않고, 실제 telemetry·실기기 crash/reload acceptance는 운영 후속 범위입니다.
- `RuntimeErrorBoundary`는 예외 원문·stack을 보내지 않고 제한된 `surface`·`error_kind`·`VITE_APP_VERSION`만 `/api/client-errors`로 best-effort report합니다. API는 extra field/release pattern을 거부하고 secure mode에서 opaque IP rate limit과 JSON grouping log를 적용하며, Sentry/collector·retention·alert 정책은 운영 후속 범위입니다.
- 전자 영수증은 이미지와 별도로 text-layer PDF를 `pypdf` adapter로, scan PDF는 최대 3쪽·scale 2의 `pypdfium2` PNG render 후 기존 OCR adapter로 receipt parser/review draft에 연결합니다. PDF는 page-local safe bbox를 원본 multi-page preview에 매핑하지 않으므로 overlay 위치를 만들지 않고, 암호화·손상·render/OCR engine 부재는 상품 추정 없이 `needs_ocr_engine`/`failed`로 중단합니다. multi-page layout/table semantics와 page-aware bbox는 후속 범위입니다.
- receipt text parser는 상품행 뒤 최대 2개의 숫자-only barcode/store-code row를 건너뛰고 다음 단가·수량·금액행을 연결하며, 상품명 괄호 단위와 count unit을 보존합니다. parser는 안전한 `template_id`·confidence만 draft provenance로 남기고 매장 header 원문은 저장하지 않습니다. 현재 profile은 grocery mart·retail beverage·restaurant card·generic이며 실제 매장별 template benchmark는 후속입니다.
- 알레르기 조건 UI는 MealPlan sheet 내부에서만 노출하며, 저장 성공 뒤 planner를 다시 계산합니다. 외부 recipe metadata coverage·`may contain`·교차 접촉·관할별 법정 항목은 상용화 전 도메인 검토 대상입니다.
- 수동 식품 입력은 `POST /api/foods`의 `lot_action=create|correct` semantics를 따른다. `create` 또는 target 없는 직접 입력은 같은 canonical 상품명도 새 inventory lot을 만들고, 라벨·GS1/product provenance 보정은 사용자가 선택한 `correct + target_food_id`를 사용한다. target 없는 legacy label의 단일 lot fallback과 exact barcode lot fallback만 호환하며 다중 lot은 `food_lot_selection_required` 409로 멈춘다. 이미 trusted 날짜가 다른 값으로 덮어써지지 않고, unknown/estimated에서 첫 확인 날짜로 바뀔 때만 `date_assertion_history`를 append한다. target 보정은 수량·단위·구매/개봉 provenance를 보존하고, 저장 실패에는 snapshot rollback을 적용한다. 라벨 화면에는 새 lot/기존 lot picker가 연결됐다. 상세 evidence는 `evidence/manual-food-lot-boundary-readback-2026-09-07.md`다.
- 수동 식품 command는 프론트가 한 번의 시도마다 `Idempotency-Key`를 만들고 network retry 동안 재사용한다. API는 key digest·validated payload fingerprint·lot/action만 `ManualFoodOperationRecord`에 저장하며, 동일 key replay는 `201 + X-Idempotency-Replayed`, payload 변경은 `409`, 소비·폐기된 lot replay는 `manual_food_operation_lot_missing` 409다. migration `023_manual_food_idempotency.sql`, SQLite/PostgreSQL/export/guest transfer persistence와 two-process replay smoke를 연결했다.
- `POST /api/foods`의 create/correction mutation은 `manual_food_lock`·active mutation lock 안의 `WorkspaceMutation` snapshot/outer flush로 lot·priority·audit·manual operation ledger를 함께 확정합니다. `reprioritize(persist=False)`로 중간 persistence를 막고 regular failure는 `manual_food_persistence_unavailable` typed 503과 기존 상태 보존으로 반환하며, PostgreSQL concurrency winner는 stale restore 없이 replay합니다. frontend는 같은 key를 유지한 retry action을 사용하고, two-process normalized PostgreSQL create/replay/restart/correction race를 확인했습니다 ([manual food mutation recovery readback](evidence/manual-food-mutation-recovery-readback-2026-09-08.md)).
- 수동 식품 반영과 날짜 assertion 저장이 일시적으로 실패하면 sheet를 닫은 뒤에도 같은 command payload/key 또는 날짜 입력을 재사용하는 명시적 `다시 시도` toast action을 보여줍니다. 날짜 저장은 snapshot rollback으로 기존 assertion/history를 유지합니다. 인증 만료·workspace conflict·lot 선택 필요·이미 확인된 날짜 충돌에는 자동 재시도 action을 노출하지 않고 해당 복구 문구를 유지합니다.
- PostgreSQL readiness는 workspace store가 실제로 사용하는 전체 compatibility projection table과 핵심 column/index를 확인합니다. `infra/postgres/migrate.sh --apply`는 migration 파일의 outer transaction wrapper를 메모리에서만 제거하고, 하나의 psycopg session-level advisory lock 아래 각 migration body와 ledger row를 같은 transaction으로 commit합니다. production API는 명시적 migration runner가 없는 상태를 정상 startup으로 간주하지 않는 방향으로 운영해야 하며, managed failover는 별도 acceptance입니다.
- JSON access log의 `path`는 raw `request.url.path`가 아니라 FastAPI route template만 기록합니다. 정상·예외 응답 모두 `route_template_from_scope()`를 통해 전달하고, query string이나 resource value가 섞인 invalid route는 `__unmatched__`로 축약합니다. 실제 reverse proxy/log shipper/collector retention은 운영 acceptance입니다.
- authentication helper retention은 `PASSWORD_RESET_TTL + 1시간` 이후의 expired/오래된 used reset token과 `ACCOUNT_TOKEN_TTL + 1시간` 이후의 revoked account-token hash만 정리합니다. startup과 `services/api/scripts/cleanup_auth_records.py` maintenance tick에서 실행하며, 유효 token·grace 안의 revoke row·business audit·receipt/idempotency 데이터는 삭제하지 않습니다. 법정 보존과 backup/WAL/external provider는 운영 acceptance입니다.
- `WorkspaceMutation.run()`은 snapshot에 포함된 app-owned workspace mutation의 regular failure rollback과 PostgreSQL concurrency conflict stale-snapshot 보호를 소유합니다. 현재 date assertion·product provenance·shopping list check/delete·meal preferences·notification preferences·push subscription·notification read-state에 적용합니다. 설정·구독·읽음 저장소 메서드는 `persist=False`로 outer flush에 위임하고, SQLite/PostgreSQL `_persist_all()`은 해당 상태를 같은 transaction으로 재구성합니다. persistence failure는 typed retryable error와 기존 상태 유지 안내를 반환하며, 열린 sheet의 retry는 inline alert가 소유합니다. notification delivery·worker lease/heartbeat·recipe/Grocy 외부 상태와 managed failover는 별도 acceptance이며 전체 mutation 원자성을 주장하지 않습니다.
- receipt privacy erase도 `WorkspaceMutation` 적용 caller입니다. `privacy_erase_receipt(persist=False)`가 미반영 draft 삭제 또는 committed/pending source filename·OCR raw name redaction을 staging하고 outer flush가 확정합니다. regular failure는 `receipt_privacy_persistence_unavailable` typed 503으로 기존 receipt 상태·inventory provenance·commit transaction을 보존하며, PostgreSQL revision conflict는 winner snapshot을 유지합니다. account `영수증 원본 관리`는 열린 sheet overlay 안에서 대상 receipt 삭제/redaction을 재시도하고, `confirm` validation·`deleted_draft`·`redacted_committed`·`redacted_pending` semantics를 유지합니다. backup/WAL/read replica/object storage/legal retention과 외부 provider 삭제는 별도 운영 gate입니다 ([receipt privacy mutation recovery readback](evidence/receipt-privacy-mutation-recovery-readback-2026-09-08.md)).
- shopping source/read reconciliation도 `WorkspaceMutation` 적용 caller입니다. `POST /api/shopping-list`는 `_sync_shopping_list(persist=False)`, `/manual`은 `_add_manual_shopping_list_item(persist=False)`, `GET /api/shopping-list`는 `_reconcile_shopping_list_sources(persist=False)`로 계획/manual derived projection을 staging하고 outer flush에서 확정합니다. regular failure는 `shopping_list_persistence_unavailable` typed 503으로 기존 목록을 보존하며, MealPlanSheet·ShoppingListSheet는 열린 sheet inline retry 또는 최신 목록 재조회를 사용합니다. receive inventory lot transaction과 managed/provider 운영은 별도 gate입니다 ([shopping list mutation recovery readback](evidence/shopping-list-mutation-recovery-readback-2026-09-09.md), [shopping list read reconciliation recovery readback](evidence/shopping-list-read-reconciliation-recovery-readback-2026-09-09.md)).
- product-enrichment enqueue/retry도 `WorkspaceMutation` 적용 caller입니다. snapshot에 `product_enrichment_jobs`를 포함하고, receipt review의 job 생성 및 dead-letter 재시작을 `persist=False` staging 후 outer flush로 확정합니다. regular failure는 `product_enrichment_persistence_unavailable` typed 503으로 기존 draft/job 상태를 보존하며, AddFoodSheet는 같은 검수 화면에서 inline retry를 제공합니다. worker의 외부 제품 조회·provider cache/rate limit·lease/heartbeat transaction은 별도 운영 gate입니다 ([product-enrichment mutation recovery readback](evidence/product-enrichment-mutation-recovery-readback-2026-09-09.md)).
- shopping receive도 local transaction recovery를 사용합니다. active mutation lock 안에서 새 lot·shopping source reconciliation·checked 상태·`shopping_receive_operations` ledger·priority를 `persist=False`로 staging하고 `WorkspaceMutation` outer flush로 확정합니다. regular failure는 `shopping_receive_persistence_unavailable` typed 503으로 기존 inventory/list/ledger를 보존하며, frontend는 동일 Idempotency-Key를 유지한 inline retry를 제공합니다. 외부 Grocy transaction/compensation과 managed PostgreSQL 운영은 별도 gate입니다 ([shopping receive mutation recovery readback](evidence/shopping-receive-mutation-recovery-readback-2026-09-09.md)).
- storage event의 정상 mutation은 `WorkspaceMutation`이 outbox·priority·inventory·event를 확정하고, 예외 처리부는 복원된 snapshot을 다시 flush하지 않습니다. regular failure는 `storage_event_persistence_unavailable` typed 503으로 기존 lot/부분 split/opened/consume/discard 상태를 보존하며, frontend는 dashboard refresh 뒤 같은 Idempotency-Key의 global retry를 제공합니다. 이동과 최초 개봉처럼 하나의 사용자 의도에서 함께 발생하는 최대 2개 local event는 `storage-event-sequence` endpoint로 child target chain과 단일 outer flush를 사용하며, `storage_event_sequence_persistence_unavailable` typed 503·전체 rollback·동일 key replay를 제공합니다. 외부 Grocy compensation과 2개를 넘는 batch는 별도 gate입니다 ([storage event error recovery readback](evidence/storage-event-error-recovery-readback-2026-09-09.md), [storage event sequence readback](evidence/storage-event-sequence-readback-2026-09-09.md)).
- `app/worker_runner.py`는 notification·Grocy·product-enrichment HTTP runner의 공통 scheduling contract입니다. HTTP 오류와 HTTP 200 body-level `error`를 모두 실패로 판정하고, `--once` 실패는 exit code 1, 장기 실행은 최대 300초 bounded exponential backoff, 정상 cycle은 기본 interval 복귀를 사용합니다. 이 loop는 API tick 재호출만 소유하고 lease·heartbeat·외부 delivery transaction은 각 worker/API가 소유합니다.
- Grocy product/location mapping·mapping audit·outbox reconciliation/manual retry는 `WorkspaceMutation`으로 local assertion을 복구합니다. mapping refresh가 바꾸는 관련 receipt `commit_transactions` 상태도 snapshot에 포함합니다. mapping audit는 `persist=False`로 outer flush에 위임하고, SQLite/PostgreSQL compatibility `_persist_all()`에서 workspace-scoped audit persistence를 유지합니다. 외부 Grocy 호출·provider transaction·worker lease/heartbeat는 별도 경계입니다.
- shared recipe catalog의 draft/import/review/approve/reject와 audit event는 user workspace와 다른 owner/scope이므로 `RecipeCatalogMutation`으로 별도 snapshot/flush합니다. migration `024_recipe_catalog_revision.sql`의 catalog revision으로 stale multi-process write를 `recipe_catalog_revision_conflict` 409로 차단하고 winner를 reload합니다. pending draft에는 explicit `claim`/`release`와 bounded ownership lease를 추가해 claim 없는 또는 다른 actor의 PATCH/approve/reject를 typed 409로 차단하고, 만료 claim은 다음 admin이 회수합니다. review queue는 인증 actor 기준 `all|mine|unassigned`로 필터링하며 만료 claim은 `unassigned`로 회수 가능하게 남깁니다. 성공한 recipe mutation은 user workspace와 분리된 opaque `recipe-catalog` key·`recipe-review` channel로 다른 운영자 탭을 invalidate하고, 다른 기기/브라우저는 revision-only probe로 보완합니다. 열린 editor가 원격에서 바뀌거나 사라지면 자동 교체하지 않고 stale로 잠가 명시적 reload를 요구합니다. `RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS`가 설정된 환경에서는 reviewer와 publisher decision capability도 분리하며 capabilities endpoint와 UI가 reviewer-only 상태를 표시합니다. production에서는 shared `RESCUE_MEAL_RECIPE_REVIEW_TOKEN`을 preflight·`/ready`·runtime에서 fail-closed로 차단하고 개별 `recipe_admin` account를 요구하며, publisher/admin allowlist 형식과 publisher⊆admin 관계도 preflight에서 확인합니다. 일반 persistence failure에서 draft status·claim·audit를 함께 복원하고 `recipe_review_persistence_unavailable` retryable error를 반환합니다. 외부 COOKRCP fetch·license 판단·planner materialization·조직/팀 hierarchy RBAC는 별도 경계입니다.

## 2026-09-08 current overrides

- The current PostgreSQL schema baseline is additive migration `001→026`; older `023`, `024`, and `025` references in historical readback bullets describe the state at the time of those records. `024_recipe_catalog_revision.sql` is required for the shared catalog optimistic fence, `025_storage_locations.sql` is required for workspace-scoped custom locations and normalized lot/event location references, and `026_export_audit.sql` is required for workspace export actor/time audit; all are checked by readiness before production API startup.

## 2026-09-09 current environment override

- Local Docker Desktop's `desktop-linux` socket exists but server `_ping`/`docker info` hangs. The VM `Docker.raw` is about 926 GiB on a 96%-full host Data volume with about 35 GiB free; console evidence shows ext4 journal/block I/O errors and a read-only remount. Do not prune/reset/delete Docker data or terminate unrelated long-running Docker commands. Live PostgreSQL/Compose evidence is paused until the host operator recovers a writable Docker VM ([Docker daemon readiness readback](evidence/docker-daemon-readiness-readback-2026-09-09.md)).

## 2026-09-09 storage history override

- 사용자 정의 보관 위치 삭제는 현재 lot뿐 아니라 storage event의 이전·이후 location ID와 장보기 입고 operation의 location ID를 검사합니다. 참조가 남아 있으면 `storage_location_in_use` `409`로 차단해 audit 이름을 보존하고, `FoodHistory`는 현재 `StorageLocation` read model 이름으로 `김치냉장고 → 실온`을 표시합니다. 위치 목록의 payload-free `/api/storage-locations/revision`은 tab 복귀·30초 bounded probe에 사용하며, revision 변경 시 AccountSheet가 편집·삭제 확인 상태를 닫고 최신 목록을 재조회합니다. SQLite는 `workspace_metadata` revision, in-memory는 process-local marker, PostgreSQL은 기존 workspace revision/header를 사용합니다. API **492 passed**, connected **88 passed**, fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**, protected runtime **28**, Vite **757 modules** build를 확인했으며 실제 운영 DB race·background tab/device accessibility는 별도 acceptance입니다 ([custom storage history readback](evidence/custom-storage-history-readback-2026-09-09.md)).

## 2026-09-09 CI release gate override

- web CI가 `npm run test:workspace-sync`와 `npm run test:service-worker`를 별도 release step으로 실행하고, `postgres-live`가 custom location revision 증가·history reference 후 DELETE `409 storage_location_in_use`를 readback하도록 workflow를 강화했습니다. PostgreSQL contract **30 passed**, workflow YAML/shell checks와 local mirror contract를 확인했지만 실제 GitHub Actions 성공·managed PostgreSQL failover는 별도 acceptance입니다 ([CI release contract readback](evidence/ci-release-contract-readback-2026-09-09.md)).

## 2026-09-09 release provenance override

- `apps/web/scripts/create-release-manifest.mjs`가 source head/branch/dirty state, deployment mode, dependency lock·mobile runtime lock·migration SHA-256, compiled Sites artifact size/hash를 `rescue-meal-release-manifest-v1`로 materialize합니다. token·provider key·password·OCR source bytes·workspace data는 포함하지 않으며, 필수 input과 `--require-artifacts` compiled output 누락은 fail-closed로 중단합니다. local mirror manifest test **1 passed**, current migration baseline **26 files**, artifact records **4**, `contains_secrets=false`를 확인했고, web CI는 `/tmp` manifest를 `actions/upload-artifact@v4`로 보존하도록 연결했습니다. 실제 GitHub Actions artifact retention·signed provenance·release promotion은 별도 acceptance입니다 ([release provenance manifest readback](evidence/release-provenance-manifest-readback-2026-09-09.md)).

## 2026-09-09 planner cross-device override

- 열린 `MealPlanSheet`는 초기 preferences·preview·latest와 함께 payload-free `/api/meal-plans/revision`을 기억하고, visible tab 복귀·30초 bounded probe에서 revision이 바뀌면 current alternative·servings·lot별 consumption draft를 덮지 않은 채 `다른 기기에서 식단이나 재고가 변경됐어요` alert와 `최신 식단 확인` action을 보여줍니다. 사용자 action 이후에만 최신 preview/latest를 재materialize하며, 성공한 planner preference/save/complete/shopping mutation은 response workspace revision을 baseline으로 반영합니다. API **493 passed**, connected **89 passed**, fixture planner **1 passed**, build protected runtime **28**·Vite **757 modules**를 확인했고 실제 multi-device scheduling·server push는 별도 acceptance입니다 ([meal-plan cross-device readback](evidence/meal-plan-cross-device-readback-2026-09-09.md)).

## 2026-09-09 notification cross-device override

- 열린 알림 센터는 목록을 읽을 때 payload-free `/api/notifications/revision`도 함께 확보해 baseline을 만들고, visible tab 복귀·30초 bounded probe에서 revision이 증가하면 `다른 기기에서 알림 상태가 바뀌어 최신 목록을 불러왔어요.` 안내와 함께 최신 목록을 자동 반영합니다. 읽음·전체 읽음 mutation 중에는 probe/목록 교체를 보류하고, mutation 완료 뒤 queued refresh로 수렴합니다. probe 실패·hidden tab·workspace 전환에서는 기존 목록을 유지하며, 알림은 계속 재생성하고 `notification_id`별 `read_at`만 저장합니다. API 전체 **494 passed, 8 warnings**, connected 전체 **91 passed**, fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**, protected runtime **28**, Vite **757 modules** build를 mirror에서 확인했습니다. 실제 browser push ordering·multi-device scheduling·managed PostgreSQL와 background-tab/device accessibility는 별도 acceptance입니다 ([notification cross-device readback](evidence/notification-cross-device-readback-2026-09-09.md)).

## 2026-09-09 dashboard cross-device override

- 홈 dashboard는 payload-free `/api/dashboard/revision`을 dashboard read와 함께 baseline으로 기억하고, `sheet === null`인 홈 화면에서 visible tab 복귀·30초 bounded probe로 revision 증가를 확인하면 최신 dashboard를 자동 재조회합니다. sheet/form이 열려 있으면 probe를 시작하지 않고, probe와 일반 `syncDashboard()`가 동시에 실행되지 않도록 in-flight guard를 두며, probe가 시작된 뒤 sheet가 열려도 응답 적용 직전에 다시 차단합니다. background refresh notice는 현재 사용자 toast가 없을 때만 표시해 사용자 mutation 결과를 덮지 않습니다. API 전체 **495 passed, 8 warnings**, connected 전체 **92 passed**, protected runtime **28**, Vite **757 modules** build를 mirror에서 확인했으며 실제 device background scheduling·managed PostgreSQL failover·server push ordering은 별도 acceptance입니다 ([dashboard cross-device readback](evidence/dashboard-cross-device-readback-2026-09-09.md)).

## 2026-09-09 shopping-list cross-device override

- 열린 `ShoppingListSheet`는 목록 read와 함께 payload-free `/api/shopping-list/revision`을 확보해 baseline을 만들고, tab 복귀·30초 bounded probe에서 revision 증가 시 최신 장보기 목록을 자동 재조회합니다. 체크·삭제·입고·직접 추가 mutation 중에는 probe와 목록 교체를 보류하며, cross-tab refresh가 도착하면 queued marker를 남겨 mutation 완료 뒤 현재 sheet가 열려 있을 때만 refresh합니다. 목록 read·revision probe 실패는 기존 list를 지우지 않고, 성공한 자체 mutation response의 workspace revision은 baseline에 반영합니다. API 전체 **496 passed, 8 warnings**, connected 전체 **94 passed**, build **757 modules**를 mirror에서 확인했으며 실제 multi-device scheduling·server push ordering·managed PostgreSQL는 별도 acceptance입니다 ([shopping list cross-device readback](evidence/shopping-list-cross-device-readback-2026-09-09.md)).

## 2026-09-09 dashboard search follow-up override

- dashboard revision으로 홈 inventory를 갱신할 때 활성 검색 조건도 `inventory-search` retry channel로 다시 실행합니다. 따라서 다른 기기 변경 뒤 기본 dashboard는 최신인데 검색 결과만 남는 split-brain 상태를 막고, `WorkspaceSyncCoordinator`가 기존 query/filter의 늦은 응답을 계속 폐기합니다. API 전체 **496 passed, 8 warnings**, connected 전체 **95 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules** build를 mirror에서 확인했습니다. 실제 device background scheduling·managed PostgreSQL·multi-replica ordering은 별도 acceptance입니다 ([dashboard search cross-device readback](evidence/dashboard-search-cross-device-readback-2026-09-09.md)).

## 2026-09-09 receipt queue cross-device override

- 검수 대기 summary queue는 목록 read와 함께 payload-free `/api/receipts/revision`을 확보하고, `sheet === "receipt-queue"`인 동안 tab 복귀·30초 bounded probe에서 revision 증가 시 최신 summary를 자동 재조회합니다. 사용자가 실제 `AddFoodSheet` 검수 화면을 열면 probe를 중단해 OCR/draft 입력을 덮지 않으며, probe 실패·workspace 전환에서는 기존 queue를 유지합니다. API 전체 **497 passed, 8 warnings**, connected 전체 **96 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules** build를 mirror에서 확인했으며 실제 multi-device scheduling·server push ordering·managed PostgreSQL는 별도 acceptance입니다 ([receipt queue cross-device readback](evidence/receipt-queue-cross-device-readback-2026-09-09.md)).

## 2026-09-09 food-detail cross-device override

- 열린 `FoodDetailSheet`는 dashboard revision을 visible-tab·30초 bounded probe로 확인하되, 다른 기기 변경을 감지해도 food payload나 local 상품 정보 draft를 자동 교체하지 않습니다. revision이 증가하면 현재 입력을 유지한 `다른 기기에서 이 식품이나 재고가 변경됐어요` stale alert를 표시하고, 사용자가 `최신 상태 확인`을 눌렀을 때만 `syncDashboard()`로 최신 food를 적용합니다. API 전체 **497 passed, 8 warnings**, connected 전체 **97 passed**, mirror build **757 modules**를 확인했으며 실제 device background scheduling·managed PostgreSQL·server push ordering은 별도 acceptance입니다 ([food detail cross-device readback](evidence/food-detail-cross-device-readback-2026-09-09.md)).

## 2026-09-09 account settings cross-device override

- `AccountSheet`는 열린 동안 기존 dashboard revision을 visible-tab·30초 bounded probe로 확인합니다. 다른 기기에서 변경되면 인증 account와 guest account 양쪽에 `다른 기기에서 계정 설정이 변경됐어요` alert를 표시하지만 알림 설정·사용자 정의 보관 위치·영수증 privacy·Grocy 하위 panel의 local draft와 확인 상태는 자동 교체하지 않습니다. 사용자가 `최신 계정 설정 확인`을 선택한 뒤 dashboard sync가 성공한 경우에만 parent refresh nonce를 증가시켜 하위 panel을 다시 읽습니다. 기존 same-tab `externalRefreshNonce`와 workspace/channel lifecycle은 유지합니다. authenticated account scenario **1 passed**, canonical target의 guest branch connected scenario **1 passed**, mirror TypeScript/build **passed**, protected runtime **28**, Vite **757 modules**를 확인했습니다. 실제 multi-device scheduling·server push·managed PostgreSQL failover·device accessibility는 별도 acceptance입니다 ([authenticated account settings readback](evidence/account-settings-cross-device-readback-2026-09-09.md), [guest account settings readback](evidence/account-settings-guest-cross-device-readback-2026-09-10.md)).

## Tools and validation

- Frontend: `npm run check:runtime`, `npm run build`, Playwright E2E, Sites worker tests.
- Backend: `uv run pytest` from `services/api`.
- Local runtime: API `127.0.0.1:8000`, OCR worker `127.0.0.1:8002`, frontend preview `127.0.0.1:4173` or isolated test ports.
- Docker daemon availability was used for the disposable PostgreSQL normalized readback, custom backup/빈 DB restore, two-connection concurrency, and account auth/read-transaction readback recorded in `evidence/live-postgres-opened-at-readback-2026-09-04.md`, `evidence/postgres-backup-restore-readback-2026-09-04.md`, `evidence/postgres-concurrency-readback-2026-09-04.md`, and `evidence/postgres-auth-live-readback-2026-09-04.md`; mock/FakeCursor evidence does not substitute for live readback, and production PostgreSQL/Grocy acceptance remains separate.
- Disposable Grocy 4.7.0의 receipt add/open/consume/transfer와 worker token·transaction ID·location readback은 `evidence/live-grocy-sync-readback-2026-09-04.md`에 기록되어 있습니다. 운영 Grocy의 backup/restore·key rotation·crash recovery·undo는 별도 acceptance입니다.

## Working boundaries

- Preserve unrelated dirty work and never reset, clean, broad-stage, commit, or push without explicit scope.
- Treat source/static, unit/API, browser E2E, packaged build, live database, and external Grocy evidence as separate claims.
- Do not claim production readiness while production PostgreSQL/Grocy operations, device camera, external privacy retention, external password-reset email delivery, push delivery, and external telemetry collector remain unverified.

## 2026-09-10 canonical target and live PostgreSQL override

- Canonical development path is `/Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal`. The old OneDrive source path was verified to contain only its provider metadata entry and was removed after the target's Git/worktree and required checks passed; the target is now the sole code source. Generated dependency caches, local DBs, `dist`, and test results remain intentionally regenerated/excluded.
- Docker Desktop `desktop-linux` recovered and a disposable Compose PostgreSQL 16 normalized readback on project `rescue-meal-live-20260910` passed migrations `001→025`, checksum rerun ledger count `25`, `/ready`, metrics non-disclosure, custom storage/provenance/search/history, backup/restore, connection lifecycle/pool, multi-process receive, crash/idempotency, account deletion, and direct connection recovery. The exact disposable volume/network were removed after readback.
- API image packaging was rechecked in disposable Compose project `rescue-meal-container-gate-20260910` after the planner catalog path fix. Rebuilt API/migrate/OCR images, PostgreSQL and migration `001→025`, OCR worker `/health`/`/ready`, API `/health`/`/ready`, guest auth, normalized dashboard read/write `7→8`, and same-key `201 + X-Idempotency-Replayed: true` all passed; the exact project containers/network/volumes were removed. This is local container evidence, not managed production/failover/cutover proof ([API container boot readback](evidence/api-container-boot-readback-2026-09-10.md)).
- `infra/container-smoke.sh` codifies that boot gate with PID-scoped project collision checks and cleanup of exact containers, volumes, networks, and local Compose-built images. Post-fix execution passed with migration rows `25`, API/OCR ready, guest dashboard `7→8`, and idempotency replay `201 + X-Idempotency-Replayed=true`; CI `container-boot` now runs the same gate with a 20-minute bound ([container smoke readback](evidence/container-smoke-readback-2026-09-11.md)).
- A real concurrent `GET /api/shopping-list` reconciliation conflict was found in the live multi-process smoke. The route now reloads the winner snapshot and retries once; second conflicts remain explicit. Final local API baseline is **499 passed / 8 warnings**, PostgreSQL contract **30**, connected **101**, fixture/mobile **35 + 3 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**, protected runtime **28**, Vite **757**. Managed failover, reverse-proxy reset, production backup retention/encryption, external providers, and device accessibility remain separate acceptance gates.
- PostgreSQL backup/restore now routes through `infra/postgres/postgres-client.sh`: host clients are preferred only as a complete set, Docker `postgres:16-alpine` is a portable fallback, archive paths are explicitly mounted, Docker DSNs use environment pass-through and host-loopback mapping, and a local disposable Docker backup→empty restore→normalized lot readback passed. Production image-digest approval, object-storage encryption/retention, managed failover, and cutover remain separate gates ([portable client wrapper readback](evidence/postgres-client-wrapper-readback-2026-09-10.md)).
- Fixture-only Playwright now passes `--strictPort` to Vite and defaults to not reusing an existing server; explicit reuse requires `MOBILE_RUNTIME_REUSE_SERVER=1`. A default-port collision previously routed 35 tests to another local app and was corrected at the test-server boundary. Dedicated `MOBILE_RUNTIME_TEST_PORT=4451 npm run test:runtime` passes **35 passed + 2 skipped**, while the occupied default port fails before test collection with an explicit already-used message ([frontend runtime port-isolation readback](evidence/frontend-runtime-port-isolation-readback-2026-09-10.md)).
- Final runtime revalidation after product-info read-after-write recovery: demo fixture/mobile **35 passed + 3 skipped** (production-only test intentionally excluded), explicit production fail-closed boot **1 passed**, and final connected browser **99 passed**. The connected config uses a 30-second test timeout and 10-second expectation timeout to cover the API's bounded 8-second client request budget without treating slow disposable fixtures as product failures.
- Current Emerald Atelier compact layout keeps the add-food action's visible accessible name as `식품 추가하기` and composes the Korean eyebrow explicitly as `weekday, month day`; stale test selectors/locale assumptions were updated without changing the visual direction. Final connected browser is **101 passed** and fixture/mobile is **35 passed + 3 skipped** after this alignment.

## 2026-09-11 current-source UI and platform override

- Current app-owned UI source includes the Emerald Atelier native/preview visual system, camera permission live announcement, intake tab/tabpanel semantics, iOS install guidance semantics, root-size-responsive large-text hierarchy, 44px primary touch targets, Pixel Android navigation-edge placement, and Pixel meal-sheet safe-area readback. The compact 320px safety note may continue below the fixed nav under 125% text, while meal/add primary actions remain above it.
- Current fixture/mobile lane is **39 passed + 3 skipped** with the Pixel and visible-control accessibility regressions included; the full source test count is **42**. Native viewport lane is **14 passed**, including reduced-motion, high-contrast, 320px safety-note reachability, guest account first-fold primary-action reachability, food-detail state/action reachability, narrow camera recovery, and native focus containment. Current TypeScript/Vite build is **760 modules**, protected runtime **28**, Sites **4**, service-worker **5**, workspace-sync **9**, and release manifest **2**. The account sheet uses app-owned `snap=0.8` and the detail sheet `snap=0.93` at `393×852` so their primary state/actions are above the calibrated `34px` iPhone safe-area boundary ([account first-fold readback](evidence/account-sheet-first-fold-readback-2026-09-11.md), [detail first-fold readback](evidence/food-detail-first-fold-readback-2026-09-11.md)).
- `storageMutationRecovery.ts` and `optimisticMutation.ts` are current app-owned WIP modules. `allowImportingTsExtensions` in the no-emit web tsconfig is required for the same explicit `.ts` source import to pass both TypeScript build and Node strip-types contract tests. Physical VoiceOver/TalkBack/Dynamic Type, camera/OEM insets, external delivery, managed failover, and signed production cutover remain separate acceptance gates.

## 2026-09-11 dashboard revision baseline override

- 초기 connected dashboard 성공 응답은 이미 `mealApi.workspaceRevision`에 workspace revision을
  저장하고 있었지만, 초기 connection effect가 dashboard polling ref에 baseline을 seed하지 않아
  연결 직후 visibility event가 첫 probe의 초기화 경로로 소비될 수 있었습니다. 이제 payload를
  local read model에 적용할 때 `rememberDashboardRevision(mealApi.workspaceRevision)`을 함께
  호출해 첫 visible-tab probe가 revision 증가를 실제 remote change로 평가하고
  `syncDashboard(true)`를 실행합니다. 수정 전 failure를 재현한 뒤 focused **1 passed**(`8074/4474`),
  full connected **101 passed**(`8075/4475`)를 확인했습니다.
- 같은 current source에서 API **499 passed / 8 warnings**, fixture/mobile **35 passed + 3 skipped**,
  production fail-closed **1 passed**, TypeScript/Vite **757 modules**, Sites **4 passed**가
  통과했습니다. 이 보정은 브라우저 lifecycle 경계이며 실제 device background scheduling·server
  push ordering·managed PostgreSQL failover·실기기 접근성은 별도 acceptance입니다.

## 2026-09-11 native narrow-viewport override

- `apps/web/playwright.native.config.ts`와 `tests/native-viewport.spec.ts`를 추가해
  `VITE_APP_SHELL=native` 320×740 viewport를 별도 Playwright lane으로 고정했습니다. body/document/
  device screen/home horizontal overflow, 주요 interactive element의 좌우 bounds, 식품 추가 bottom
  sheet의 width/scroll width, 주요 식단·알림·계정·상세 sheet bounds, 125% text preference 상태를
  검사하며 `NATIVE_RUNTIME_TEST_PORT=4487 npm run test:native`는 **4 passed**입니다. 이는 현재
  native shell의 좁은 폭 회귀를 자동화하지만
  실제 OS font scaling·카메라·VoiceOver/TalkBack은 별도 acceptance입니다.

## 2026-09-11 Playwright lane isolation override

- native viewport spec은 default fixture glob에서 제외하고 `playwright.native.config.ts`의
  exact `testMatch`, `VITE_APP_SHELL=native`, `320×740`과 전용 port로 분리했습니다. 따라서
  preview frame과 native CSS viewport가 서로의 결과를 오염시키지 않습니다. default fixture
  `MOBILE_RUNTIME_TEST_PORT=4482 npm run test:runtime`은 **35 passed + 3 skipped**, native
  `NATIVE_RUNTIME_TEST_PORT=4487 npm run test:native`는 **4 passed**이며 web CI에도 두 step을
  연결했습니다.

## 2026-09-11 Playwright server cleanup override

- fixture/native config의 webServer는 `npm run check:runtime && exec
  ./node_modules/.bin/vite ... --strictPort`로 직접 Vite process를 실행합니다. npm wrapper
  아래에 stale Vite가 남아 전용 port를 점유하던 실행 경계를 보완했으며, fixture focused
  `4488`과 native focused `4489`를 각각 **1 passed**로 실행한 뒤 두 port가 free임을 확인했습니다.
  full fixture `4490`은 **35 passed + 3 skipped**, full native `4491`은 **4 passed**였고 두 port도
  종료 후 free였습니다. 이는 테스트 process cleanup 계약이며 production supervisor lifecycle과는
  별도입니다.

## 2026-09-11 authoritative mutation readback override

- `apps/web/src/mutationReadback.ts`는 mutation success response를 best-effort dashboard read보다
  먼저 local read model에 적용하고, sync가 false/throw인 경우 authoritative response를 다시
  적용하는 깊은 Module입니다. empty response는 `AuthoritativeMutationResponseError`로 mutation
  failure가 되며, readback 실패는 `synced=false` 결과로 분리됩니다. product-info/date/provenance/
  manual food/receipt commit caller는 domain-specific rollback·typed error·retry UI를 계속 소유하고,
  공통 response/read ordering만 이 Module에 위임합니다. contract **3 passed**, targeted connected
  **manual/receipt + product/date/provenance** 회귀, full connected **101 passed**, TypeScript/Vite
  **759 modules**를 확인했습니다.

## 2026-09-11 optimistic storage mutation override

- `apps/web/src/optimisticMutation.ts`는 storage event의 optional inventory snapshot을 활용하면서
  optimistic apply·mutation failure restore·best-effort dashboard sync·readback 실패 시
  optimistic state 재적용을 소유합니다. storage move/open sequence·consume·discard caller는
  idempotency key·workspace conflict·typed error·Grocy status·retry UI를 계속 소유하고, server가
  만든 child lot identity는 response snapshot으로 local read model에 반영합니다.
  contract **3 passed**, storage targeted **3 passed**, full connected **101 passed**,
  TypeScript/Vite **759 modules**를 확인했습니다.

## 2026-09-11 container snapshot override

- `StorageEventResponse.inventory` additive response 변경 이후 `sh infra/container-smoke.sh`를
  project `rescue-meal-container-smoke-91136`에서 재실행했습니다. migration **25**, API/OCR
  ready, guest dashboard **7→8**, same-key replay **201 + X-Idempotency-Replayed=true**를 통과했고
  exact containers/volumes/network/images가 cleanup 뒤 absent임을 확인했습니다. 이는 local packaged
  stack evidence이며 managed PostgreSQL/provider/production cutover는 별도 acceptance입니다.

## 2026-09-11 response-only persistence override

- storage event response snapshot은 SQLite/PostgreSQL durable payload에 저장하지 않도록
  `_storage_event_persistence_payload()`가 `inventory`를 제거하고, route는 workspace mutation
  flush 이후 response copy에만 current inventory를 붙입니다. replay도 current response snapshot을
  재구성합니다. API targeted **2 passed**, full API **499 passed / 8 warnings**, packaged smoke
  `rescue-meal-container-smoke-2956` migration **25**·ready·7→8·replay를 확인했고 exact resource
  cleanup도 통과했습니다.

## 2026-09-11 current-source verification stability override

- response-only storage snapshot 변경을 포함한 현재 source에서 disposable connected browser 전체
  suite를 `RESCUE_MEAL_E2E_API_PORT=8116 RESCUE_MEAL_E2E_WEB_PORT=4516 npm run test:connected`
  로 다시 실행해 **101 passed (4.2m)**를 확인했습니다. 앞선 두 전체 실행의 page-close/click timeout은
  제품 API 응답·recipe review claim·date mutation의 고정 재현이 아니었고, 같은 focused connected
  시나리오를 각각 **5회** 반복해 통과시킨 뒤 stale/동시 Vite·Playwright 프로세스를 분리한 전체
  실행에서 사라졌습니다.
- 현재 fixture/mobile lane은 `MOBILE_RUNTIME_TEST_PORT=4500 npm run test:runtime -- --workers=1`에서
  **36 passed + 3 skipped**, iOS 설치 안내 focused **10 passed**, native `320×740` lane은
  `NATIVE_RUNTIME_TEST_PORT=4501 npm run test:native`에서 **4 passed**입니다. production/push skip은
  운영 조건이므로 demo fixture 성공으로 해석하지 않습니다.
- 현재 contract lanes는 mutation-readback **3**, optimistic-mutation **3**, workspace-sync **9**,
  service-worker **5**, release-manifest **2** passed이며, TypeScript/Vite **759 modules** build와
  Sites **4 passed**도 재확인했습니다. 이 결과는 local source/lane isolation의 안정성 근거이며,
  실제 OS accessibility/camera, provider delivery, managed failover와 production cutover는 별도
  acceptance입니다.

## 2026-09-11 guest transfer transport override

- AccountSheet의 guest preview/import 자체 fetch를 `mealApi.previewGuestTransfer()`와
  `mealApi.transferGuestWorkspace()`로 수렴했습니다. explicit account session token과 source guest
  token을 분리하고, 중앙 8초 timeout·typed error·workspace revision header 기억을 사용합니다.
  실제 transfer에는 target revision을 `If-Rescue-Meal-Revision`으로 보내며 성공 mutation
  invalidation을 발행하고, reload/re-entry preview는 AbortSignal로 중단합니다. pending preview,
  사용자 import/skip decision, conflict/retry UX는 AccountSheet에 남깁니다.
- guest registration/re-entry/conflict connected **2 passed**와 full connected **101 passed**에서
  같은 기존 흐름을 확인했고, preview response revision `11`이 이후 import request header로
  전달되는 회귀를 추가했습니다. source guest token은 local broadcast/cache에 넣지 않습니다.

## 2026-09-11 exact storage sequence replay override

- 동일 storage sequence key의 replay는 incoming event 개수보다 persisted deterministic index가
  더 많을 때 prefix replay를 허용하지 않고 `409`로 중단합니다. index 1만 남은 orphan partial도
  재조정 필요 `409`로 닫으며, 완성 payload의 target chain/type/location/quantity 검증은 유지합니다.
  수정 전 red test에서 shorter payload가 `200` replay였고, 수정 후 shorter/기존 atomic replay
  **2 passed**, backend 전체 **500 passed / 8 warnings**를 확인했습니다.

## 2026-09-11 guest transfer and exact replay implementation override

- AccountSheet는 자체 guest transfer `fetch`를 제거하고 `mealApi`의 explicit account-session
  Interface를 사용합니다. preview/import의 timeout·typed error·revision response tracking을
  중앙화하고, confirmed transfer는 target revision header와 workspace invalidation을 유지하며
  re-entry preview effect는 cleanup abort를 전달합니다. connected guest registration/conflict
  **2 passed**, full connected **101 passed**, TypeScript/Vite build **759 modules**를 확인했습니다.
- storage-event sequence replay는 persisted index tail/orphan cardinality까지 검사합니다. 같은
  key의 shorter prefix는 `409`이며, same-payload full replay와 atomic flush는 유지됩니다. red→green
  targeted **2 passed**, backend 전체 **500 passed / 8 warnings**입니다.

## 2026-09-11 storage mutation recovery override

- `apps/web/src/storageMutationRecovery.ts`는 기존 `optimisticMutation.ts` 위에서 storage
  caller의 recovery choreography만 소유합니다. `saveFood`·`consumeFood`·`discardFood`는
  optimistic apply/restore와 mutation body·operation key를 계속 결정하고, Module은 mutation
  reject 뒤 dashboard `sync()` 1회와 caller-provided retry closure를 연결합니다. 성공 mutation의
  readback false/throw는 `synced=false` 성공 결과로 보존해 failure retry로 잘못 재진입하지 않습니다.
- `npm run test:storage-mutation-recovery` contract **4 passed**, storage connected targeted
  **14 passed**, full connected **103 passed**, build **760 modules**를 확인했습니다. Grocy status,
  typed error/conflict 문구, authoritative inventory materialization과 global toast는 caller
  소유로 유지합니다. generic all-domain mutation engine이나 external provider transaction은
  이 Module에 포함하지 않습니다.

## 2026-09-11 storage retry stale-snapshot override

- storage recovery의 첫 mutation failure는 기존 optimistic snapshot을 restore하지만, 그 뒤
  dashboard reconciliation을 거친 retry failure에서는 최초 snapshot을 다시 restore하지 않습니다.
  `runStorageMutationRecovery()`가 첫 attempt에만 restore callback을 전달하고 retry closure에는
  no-op restore를 사용해, reconciliation 이후 authoritative state를 stale local 배열로 덮지
  않게 합니다. retry는 같은 operation key/payload를 유지하고 `sync()`와 caller error disposition만
  다시 수행합니다.
- `npm run test:storage-mutation-recovery`는 **4 passed**(첫 restore·retry 동일 closure·성공 후
  readback false/throw·retry stale restore 차단), storage connected targeted는 **14 passed**입니다.

## 2026-09-11 receipt finalization error envelope override

- receipt commit finalization의 일반 persistence failure가 내부 transaction ID를 포함한 plain
  string을 반환하던 경로를 제거하고, business rollback과 `needs_reconciliation` marker 저장은
  유지한 채 `receipt_commit_persistence_unavailable` typed `503`으로 반환합니다. response에는
  사용자용 detail·`retryable: true`·`action: retry_later`만 포함하며 transaction ID·예외 원문·receipt
  payload는 넣지 않습니다. pending marker flush failure의
  `receipt_commit_persistence_unavailable`과 reconciliation marker flush failure의
  `receipt_commit_reconciliation_unavailable` 구분은 유지합니다.
- red→green finalization envelope test와 pending/reconciliation marker tests **3 passed**,
  backend 전체 **500 passed**, connected 전체 **103 passed**를 확인했습니다. frontend는 기존
  receipt commit key/payload retry와 typed error mapping을 그대로 사용합니다.

## 2026-09-11 meal-plan completion error envelope override

- `POST /api/meal-plans/{plan_id}/complete`의 `WorkspaceMutation` regular persistence failure가
  plain `식단 완료를 롤백했습니다.` detail을 반환하던 경로를 제거했습니다. plan·inventory·consumed
  event·linked bundle day·audit snapshot rollback, `ConcurrentWorkspaceWriteError` winner replay,
  `completed`/`already_completed`와 allocation validation은 그대로 두고,
  `meal_plan_completion_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)와
  사용자용 detail만 반환합니다.
- `mealApi`에 전용 completion persistence type guard를 추가하고, `MealPlanSheet`는 typed failure
  때만 inline `다시 시도`를 표시합니다. 실패 시점의 plan/consumption payload를 보존해 retry가
  같은 입력을 보내며, workspace conflict·allocation/validation·일반 오류에는 blind retry를
  노출하지 않습니다. 성공 시 기존 dashboard sync/linked bundle update 흐름을 사용합니다.
- red→green API flush-failure **3 targeted passed**, typed 503→same payload retry **1 connected
  passed**, backend 전체 **500 passed / 8 warnings**, full connected **104 passed**, fixture/mobile
  **38 passed + 3 skipped**, native **9 passed**, TypeScript/Vite **760 modules**, Sites **4 passed**,
  release manifest **2 passed**를 확인했습니다. external Grocy/provider, managed DB failover,
  physical device와 production cutover는 별도 acceptance입니다.

## 2026-09-11 account sheet first-fold reachability override

- fresh native `393×852` capture에서 account `snap=0.7`의 `로그인` primary action이
  `y=829.7..873.7px`로 잘리던 UI 결함을 확인하고 account sheet만 `snap=0.8`로 올렸습니다.
  현재 sheet top은 `170px`이며 계정 lead·password recovery·tabs·두 입력·로그인 action이
  첫 화면에 함께 들어옵니다. 회귀는 entrance spring settle 후 `34px` safe-area boundary를
  검사하며, protected BottomSheet runtime은 변경하지 않습니다.
- focused first-fold native **1 passed**, full native **11 passed**, fixture/mobile **38 passed +
  3 skipped**, connected **105 passed**, build **760 modules**, Sites/service-worker/
  workspace-sync/release manifest **4/5/9/2 passed**, capture console/page errors **0**.
  Physical VoiceOver/TalkBack/Dynamic Type/OEM inset은 별도 acceptance입니다.

## 2026-09-11 food detail first-fold reachability override

- fresh native `393×852` capture에서 detail `snap=0.78`의 `개봉됨` 상태 control이
  `y≈822px`부터 시작하고, 후속 `snap=0.84`에서도 `먹었어요`·`보관 상태 저장`이
  `y=843.2..887.2px`로 잘리던 UI 결함을 확인해 detail sheet를 `snap=0.93`으로 올렸습니다.
  현재 sheet top은 `60px`이며 food hero·date proof·warning·provenance·storage choices·
  opened state·primary mutation actions가 첫 화면에 함께 들어옵니다.
  회귀는 entrance spring settle 후 `34px` safe-area boundary를 검사하며 protected
  BottomSheet runtime은 변경하지 않습니다.
- focused detail first-fold native **1 passed**, full native **14 passed**, fixture/mobile
  **39 passed + 3 skipped**, current connected detail/first-opened targeted **3 passed** and
  latest full connected **107/107 passed**, build **760 modules**, capture console/page errors **0**.
  Physical VoiceOver/TalkBack/
  Dynamic Type/OEM inset은 별도 acceptance입니다.

## 2026-09-11 inventory search pagination lifecycle override

- `storageLocations` identity change가 active server inventory search effect를 재시작해
  pagination 결과를 비우고 page zero를 다시 요청할 수 있던 lifecycle 결함을 확인했습니다.
  latest storage locations는 ref로 search response에 적용하고, location-name 변경은 기존
  rows만 reconcile하도록 분리해 offset contract를 보존합니다.
- pagination focused **10 passed** (`8143/4543`), PDF/manual-priority/planner focused
  **3/3/3 passed**, fixture/mobile **39 passed + 3 skipped**, build **760 modules**,
  Sites/service-worker/workspace-sync/release manifest **4/5/9/2 passed**.
- earlier long full connected run은 **103/106 passed**였고 PDF, inventory, planner assertions가
  실패했지만, pagination lifecycle fix 이후 fresh full connected rerun은 **107/107 passed**였습니다.
  이전 결과는 historical timing evidence로 남기고 current full-lane은 clean으로 승격합니다.

## 2026-09-11 account deletion error envelope override

- `POST /api/account/delete`의 durable `deleting` fence·workspace purge·credential 삭제 resume
  semantics는 유지하면서 coordinator regular failure를 plain `503`에서
  `account_deletion_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)로
  정렬했습니다. password·token·email·예외 원문은 response에 넣지 않습니다.
- `mealApi` 전용 type guard와 `AccountDeletionPanel` inline `다시 시도`를 연결했습니다. typed
  failure에서만 사용자가 입력한 current password/`DELETE` payload로 재시도하고, `401`·`422`·`429`와
  typed code 없는 `503`에는 retry action을 자동 노출하지 않습니다.
- 수정 전 purge-failure envelope regression이 string detail에서 red였고, 이후 API targeted
  **3 passed**, typed retry/rate-limit connected **2 passed**, backend 전체 **500 passed / 8 warnings**,
  full connected **105 passed**, build **760 modules**를 확인했습니다. distributed deletion,
  backup/WAL/object storage/Grocy 보존과 managed failover는 별도 acceptance입니다.

## 2026-09-11 native sheet settle measurement override

- food-detail first-fold regression의 `818.008972px` 실패는 최종 layout clipping이 아니라
  spring transform이 남은 시점에 측정한 test lifecycle 문제였습니다. native helper가 sheet bottom
  일치만 기다리지 않고 computed entrance transform `none`까지 기다린 뒤 safe-area boundary를
  검사하도록 보강했습니다. protected BottomSheet와 제품 layout은 변경하지 않았습니다.
- 반복 확인에서 안정 상태의 toggle bottom은 `817.234px`였고, 보강 후 native 전체 **11 passed**,
  fixture/mobile **38 passed + 3 skipped**, build **760 modules**를 확인했습니다. physical
  compositor·VoiceOver/TalkBack·Dynamic Type·OEM inset은 별도 acceptance입니다.

## 2026-09-11 single meal-plan save error envelope override

- `POST /api/meal-plans`의 regular `WorkspaceMutation` flush failure가 plan_id 경로에서 raw
  `RuntimeError`로 전파되던 contract drift를 수정했습니다. plan/saved audit snapshot rollback,
  plan lock, same-plan concurrency winner replay, snapshot/recipe validation과 multi-day 별도
  contract는 유지하고 `meal_plan_persistence_unavailable` typed `503`(`retryable=true`,
  `action=retry_later`)으로 응답합니다.
- `mealApi` 전용 type guard와 `MealPlanSheet` failure-payload snapshot을 추가했습니다. 실패 당시
  `inventory_ids`·`plan_id`·`snapshot_hash`·recipe/bundle identity·servings를 보존해 typed failure에만
  inline `다시 시도`를 제공하며, conflict·validation·untyped error에는 저장 retry action을 노출하지
  않습니다.
- red→green phantom/typed envelope API targeted **4 passed**, typed save retry connected **1 passed**,
  full API **500 passed / 8 warnings**, fresh full connected **106 passed (3.9m)**, fixture/mobile
  **38 passed + 3 skipped**, native **11 passed**, build **760 modules**를 확인했습니다. 이전 long
  connected run의 **103/106** timing-sensitive result와 clean rerun은 별도 evidence로 보존합니다.
  multi-day bundle persistence, external provider와 managed failover는 별도 acceptance입니다.

## 2026-09-11 multi-day bundle save error envelope override

- `POST /api/meal-plans/multi-day`의 regular `WorkspaceMutation` flush failure가 bundle lock 경로에서
  raw `RuntimeError`로 전파되던 contract drift를 수정했습니다. bundle/day/history snapshot rollback,
  bundle replay/history/latest, snapshot conflict, linked single-plan completion semantics와 preview
  side-effect-free 경계는 유지하고 `multi_day_plan_persistence_unavailable` typed `503`
  (`retryable=true`, `action=retry_later`)으로 응답합니다.
- `mealApi` 전용 type guard와 `MealPlanSheet` 3일 식단 영역의 failure-payload snapshot을 추가했습니다.
  실패 당시 `inventory_ids`·`bundle_id`·`snapshot_hash`·`max_minutes`·`servings`를 유지해 typed
  failure에만 inline `다시 시도`를 제공하며, snapshot conflict·validation·untyped error에는
  bundle retry action을 노출하지 않습니다.
- red→green bundle envelope/rollback API targeted **4 passed**, typed bundle retry connected **1
  passed**, full API **507 passed / 8 warnings**, final full connected **107/107 passed**,
  fixture/mobile **39 passed + 3 skipped**, native **14 passed**, build **760 modules**, Sites **4
  passed**, release manifest **2 passed**를 확인했습니다. external provider, distributed bundle
  transaction, managed failover/partition과 production cutover은 별도 acceptance입니다.

## 2026-09-11 food detail narrow viewport override

- 393×852 detail `snap=0.93`은 320×740에서 fixed `792px` sheet를 만들어 top `-52px`로
  handle/title을 clipping했습니다. live viewport height 기반 bounded snap을 추가해 320×740은
  sheet `y=8..740px`, title `y=47.2..69.2px`로 settle하고 393×852 composition은 유지합니다.
- Focused narrow major-sheet **1 passed**, native 전체 **14 passed**, fixture/mobile **39 passed +
  3 skipped**, build **760 modules**, protected runtime **28**. Physical compositor/Dynamic Type/
  VoiceOver/TalkBack/OEM inset은 별도 acceptance입니다.

## 2026-09-11 food detail narrow large-text override

- `320×740 + 125% root text`에서 detail title은 `23.75px`로 증가하고 max-scroll action
  bottom은 `622.109px`, safe-area boundary는 `706px`로 유지되어 `먹었어요`·`보관 상태 저장`
  도달성이 보존됩니다. document/body width는 `320px`입니다.
- Focused large-text native **2 passed**, native 전체 **14 passed**, fixture/mobile **39 passed +
  3 skipped**, build **760 modules**, protected runtime **28**. Physical Dynamic Type/font
  substitution/VoiceOver/TalkBack/OEM rendering은 별도 acceptance입니다.

## 2026-09-11 operational readiness/worker typed 503 override

- API `/ready`의 storage/auth configuration failure, workspace acquisition의 pool/storage failure,
  OCR worker `/ready` model failure·`/ocr` capacity timeout, internal Grocy/notification/
  product-enrichment/observability worker token 누락을 plain `503`에서 safe `code`, `retryable`,
  `action` envelope로 정렬했습니다. recipe review/import 설정, guest provisioning, account session
  발급까지 같은 경계를 적용했습니다. 일시 장애만 `Retry-After: 1`과 `retry_later`를 사용하고,
  설정 누락은 `configure_server`/`configure_storage`로 fail-closed합니다. exception 원문·token·
  workspace data는 반환하지 않습니다.
- 수정 전 plain 503 red regression **4 failed**, 초기 slice API **504 passed**, auth/recipe
  configuration closure 후 API 전체 **507 passed**, OCR worker 전체 **10 passed**, `git diff --check`를
  확인했습니다. 기존 HTTP 503/success schema와 domain mutation
  retry/rollback semantics는 유지합니다. 외부 load balancer retry, model cold start, managed
  failover/provider delivery와 production deployment health policy는 별도 acceptance입니다.

Readback: [operational 503 envelope](evidence/operational-503-envelope-readback-2026-09-11.md).

## 2026-09-12 workspace export rate-limit override

- 전체 workspace JSON export에 IP와 opaque workspace 이중 bucket rate limit을 연결했습니다.
  기본값은 1시간 6회이며 `account_export_rate_limited` typed `429`, `Retry-After`, rate-limit
  headers를 반환하고 export payload를 만들지 않습니다. persistent auth store에서는 기존
  database-backed limiter를 사용하고 in-memory fixture에서는 process-local fallback을 사용합니다.
- AccountSheet는 이 응답을 성공 download로 취급하지 않고 export 영역에 잠시 후 재시도 안내를
  표시합니다. API export targeted **2 passed**, typed 429 connected **1 passed**, API 전체
  **508 passed / 8 warnings**, full connected **108/108 passed (5.0m)**, build **760 modules**를
  확인했습니다. 앞선 date-retry/server lifecycle failure는 historical run으로 분리했으며,
  streaming/compression·actor audit·운영 gateway는 별도 acceptance입니다.

Readback: [export rate-limit](evidence/export-rate-limit-readback-2026-09-12.md), [current source lane](evidence/final-current-source-readback-2026-09-12.md).

## 2026-09-12 food detail responsive first-fold override

- Fresh native captures found the 393×852 detail destructive action below the
  iPhone safe boundary (`y=825.296..869.296`, boundary `818px`) and the 320×740
  detail primary mutation row below the initial safe boundary
  (`y=712.953..756.953`, boundary `706px`).
- The app-owned detail snap now uses `Math.min(0.993, Math.max(0.78,
  (viewportHeight - 6) / 852))`; at 393×852 the sheet settles at `y=6..852`
  and the destructive action ends at `817.484px`.
- At `max-width: 360px`, only repeated supporting-card gaps/padding are
  tightened. The 44px primary controls remain unchanged; 320×740 primary
  actions now settle at `y=646.641..690.641px` above the `706px` safe boundary.
- The same narrow breakpoint raises home queue secondary metadata
  (`food-subline`, `food-meta-line`, `date-source`) from `7px` to `8px`; queue
  rows remain `50px`, the meal CTA remains `y=509.031..551.031`, nav remains
  `y=628..706`, and document/body width remains `320px`.
- Focused 393/320 detail regressions and full native **14 passed**; fixture/mobile
  **39 passed + 3 skipped**, build **760 modules**, protected runtime **28**,
  Sites/service-worker/workspace-sync/release manifest **4/5/9/2 passed**,
  `git diff --check` passed. Physical VoiceOver/Dynamic Type/OEM inset and
  signed production acceptance remain separate.

Readback: [food detail compact first-fold](evidence/food-detail-first-fold-compact-readback-2026-09-12.md).

## 2026-09-12 container hardening (non-root/limits/log rotation)

- API·OCR worker 컨테이너가 uid `10001(rescue)` 비root로 실행됩니다. entrypoint는
  build-time에 완성된 `/app/.venv` 바이너리를 직접 사용하고, PaddleX 캐시는
  `PADDLE_PDX_CACHE_HOME=/home/rescue/.paddlex`의 named volume에 보관합니다.
- 모든 Compose 서비스에 `no-new-privileges`, json-file 로그 `10m×3`
  non-blocking rotation, `RESCUE_MEAL_*_MEMORY_LIMIT` 기반 memory limit을
  적용했습니다(기본 db 2g·api 1g·ocr 4g·worker 512m).
- `container-smoke.sh`의 migration 검증은 고정 카운트 대신 `infra/postgres/NNN_*.sql`
  파일 수를 기대값으로 사용합니다.
- Compose `config --quiet`(기본·3개 worker profile)와 전체 container smoke를
  통과했습니다: migration ledger `26`, api/ocr `/ready`, guest write `7 -> 8`,
  idempotency replay `201`. read-only rootfs·seccomp·digest pinning·orchestrator
  limit은 별도 운영 gate입니다.

Readback: [container hardening](evidence/container-hardening-readback-2026-09-12.md).
운영 절차: [operations runbook](docs/operations-runbook.md).

## 2026-09-12 export actor/time audit and guest preview single-flight override

- Workspace export now records successful generation in a separate `WorkspaceExportAuditEvent`
  with verified actor ID/role, safe request ID, schema version, and UTC time. It excludes
  Authorization/token/IP/payload, stays out of the downloaded JSON, does not increment workspace
  revision, and is removed by workspace reset/purge. Audit failure returns a typed
  `account_export_audit_persistence_unavailable` `503` before any export body/Blob is produced.
- The PostgreSQL source baseline is now additive migration `001→026`; `026_export_audit.sql` and
  readiness/adapter contracts are present. Migration dry-run, container migration count, and fake
  adapter SQL passed, but the export-audit row itself is not claimed as a managed-production
  readback. Export operational query authorization, retention/alert policy, streaming/compression,
  replica/WAL/backup alignment, and production gateway tuning remain separate gates.
- Full current verification is API **512 passed / 8 warnings**, connected **109/109 passed (4.8m)**,
  fixture/mobile **39 passed + 3 skipped**, native **14 passed**, TypeScript/Vite **760 modules**,
  protected runtime **28**, Sites **4**, service-worker **5**, workspace-sync **9**, release manifest
  **2**. A pre-existing guest-transfer full-lane failure was traced to duplicate preview producers;
  the registration single-flight guard passed its focused regression and the clean full lane.

Readbacks: [export audit](evidence/export-audit-readback-2026-09-12.md), [guest transfer preview
single-flight](evidence/guest-transfer-preview-single-flight-readback-2026-09-12.md).

## 2026-09-13 perf baseline smoke

- `infra/perf-smoke.sh`가 disposable production-shaped 스택에서 dashboard read·
  normalized write의 첫 측정 baseline을 기록합니다. 측정기는
  `services/api/scripts/perf_smoke.py`(stdlib 전용)이며 published host port 경로의
  지연 분포·오류율·`food_count` 정합성을 fail-closed로 검증합니다.
- 첫 측정: sequential read p50 15.3ms/p95 28ms, concurrent read(4w) p95 204ms,
  concurrent write(4w) p95 209ms, same-key 동시 replay 8건 모두 `201`로 단일
  mutation 수렴, 오류 0. 운영 SLO가 아니라 배포 대상별 재측정용 참조값이며,
  p99·지속 부하·OCR 동시 추론 지연·reverse proxy 오버헤드는 별도 범위입니다.

Readback: [perf baseline](evidence/perf-baseline-readback-2026-09-13.md).

## 2026-09-13 disaster-recovery drill

- `infra/dr-drill.sh`가 백업의 실제 복구 가능성을 disposable 스택에서
  end-to-end로 증명합니다: API write path로 시드 → `backup.sh` archive 생성 →
  빈 `rescue_meal_restored` DB에 `restore.sh` 적용 → 복구 DB를 가리키는 두
  번째 API 컨테이너 기동 → 원본 게스트 토큰으로 `food_count` 9→9 일치 확인.
- 인증 레코드·migration ledger가 덤프에 포함되어 복구 DB가
  `rescue-meal-ready`로 승인되고 기존 토큰이 유효한 점까지 함께 검증됩니다.
  `.github/workflows/dr-drill.yml`이 주간 스케줄로 같은 드릴을 돌려
  backup/restore 회귀를 표면화합니다. 운영 DB의 주기·offsite·WAL·retention과
  실제 cutover 리허설은 별도 acceptance입니다.

Readback: [dr drill](evidence/dr-drill-readback-2026-09-13.md).

## 2026-09-13 image vulnerability remediation + CI blocker

- `python:3.12-slim` 베이스가 패치 전 debian 패키지를 포함해 API 이미지에서
  fix 가능 CRITICAL 3 + HIGH 9를 trivy 로컬 스캔으로 발견, 두 Dockerfile에
  `apt-get upgrade` 레이어를 추가해 두 이미지 모두 0건으로 정리했습니다.
- push 후 모든 Actions run이 runner 미할당으로 즉시 실패했습니다(전 워크플로우,
  dependabot PR 포함, rerun 동일). 계정 Actions quota/결제 수준 문제로 추정 —
  마지막 성공 run은 9/1입니다. private repo의 9월 사용량이 macOS 분 10배 과금
  포함 2,000분 초과로 보이며 계정 소유자 확인이 필요합니다.

Readback: [image remediation](evidence/image-vuln-remediation-readback-2026-09-13.md).

## 2026-09-13 public 전환 + 첫 full-green CI

- Repository를 public으로 전환해 private-repo Actions runner 미할당
  블로커를 해소했습니다. 전체 git 이력 사전 secret 스캔은 깨끗했습니다.
- main `403ac71`에서 **Verify·Security scan 전부 success** — public 전환
  이후 노출된 실패를 순차 수정했습니다:
  - trivy-action 존재하지 않는 태그 → `v0.36.0`
  - sarif 모드가 `TRIVY_SEVERITY`를 해제해 MEDIUM fixable에도 fail →
    `limit-severities-for-sarif: "true"` + Dockerfile의 pip·setuptools·
    uv 캐시 제거로 이미지 전 severity 0건
  - upload-sarif가 job당 tool/category 1회 제한 → `category: api-image`/
    `ocr-worker-image` 부여
  - `test_cp_sat_...` `StopIteration`: CP-SAT이 arm64/x86_64에서 같은
    최적 recipe set을 day에 다르게 배정 → `plans[1]` 고정 대신 mushroom
    lot 소진 시퀀스 `[2.0, 1.0]`를 전 plan에서 assert
  - live PG smoke가 product-info PATCH(rename이 display_name까지 덮어씀)
    이후 구 이름 검색을 기대하는 자기모순 → 신 이름 검색·assertion으로 수정
- DR drill workflow를 `workflow_dispatch`로 첫 CI 실행해 **success** —
  backup/restore 회귀 감시가 실제로 동작함을 확인했습니다.
- dependabot: 계약 위반 python 3.14 PR(#3/#4)은 닫았고, actions major
  bump(#1/#2)는 ignore 규칙으로 자동 정리됐습니다. 남은 PR은 정상 semver
  호환 업데이트입니다.

Readback: [ci green](evidence/ci-green-readback-2026-09-13.md).

### Known CI flakes (2026-09-13)

- `mobile-runtime.spec.ts` keyboard/footer drag: footer drag 후 keyboard
  `data-visible` 해제가 CI runner에서 5초 안에 안 끝난 flake 1건
  (`0f8a7ff`). docs-only 커밋이라 제품 회귀 아님. 재발하면 drag→dismiss
  대기 계약을 확인할 것.
- postgres-live smoke의 `Lifecycle close left PostgreSQL connections or
  idle transactions`: 전체 검증 통과 후 종료 시점의 pool drain 타이밍에
  의한 flake 1건 (`0f8a7ff`). 재발하면 종료 grace/retry를 검토할 것.

## 2026-09-13 dependabot queue 정리 + playwright/react 호환 수정

- `@dependabot rebase`로 8개 PR을 수정된 워크플로우로 재검증. 3개의 실제
  문제를 찾아 수정했습니다:
  - **PR #8** (playwright 1.63): `sheet-overlay` 클릭이 (8,8)에서
    `<html>`에 가로채여 타임아웃 — 폰 스크린 라운드 코너 클립 안쪽 좌표를
    가리키던 것. 오버레이 중앙·1/4 지점 클릭으로 수정해 push.
  - **PR #10** (react 19.3): react만 올리고 react-dom 19.2.7 유지 → 앱
    mount 실패로 suite 9분 행잉. react-dom/@types도 19.3.0으로 합쳐 push,
    PR #12는 흡수로 닫음. 최종 조합 로컬 전체 spec 39 passed.
  - **lifecycle drain flake**: `postgres_connection_lifecycle_smoke.py`가
    close 직후 `pg_stat_activity`를 즉시 0으로 assert — killed API의
    backend·pool 소켓 해제는 비동기라 레이스. 15초 drain 윈도우로 수정,
    로컬 PG로 통과 확인.
- **전부 머지 완료**: #5, #6, #7, #8, #9, #10, #11 squash-merge. #12는
  #10에 흡수로 close. 열린 PR 0개. main `d8559f4` 기준 Verify/Security
  초록, 최종 조합(react 19.3 + playwright 1.63 + pytest 9) 로컬 검증 완료.

## 2026-09-14 보안 기능 + perf 회귀 감시

- Public repo에 GitHub secret scanning + push protection을 활성화했습니다
  (둘 다 disabled였음 — repo setting 변경, 코드 변경 없음).
- `.github/dependabot.yml`에 `react` 그룹 추가 — react·react-dom·
  @types/react·@types/react-dom을 항상 한 PR로 묶어 split bump 재발 차단
  (어제 #10/#12 불일치 회귀의 예방책). dev 그룹은 @types/react*를 제외.
- `.github/workflows/perf-smoke.yml` 추가 — `infra/perf-smoke.sh`를 주간
  화요일 실행해 latency/throughput/idempotency baseline 회귀를 표면화.
  dr-drill과 같은 패턴 (workflow_dispatch 가능).

## 2026-09-14 품질 게이트 3종 (a11y·bundle·coverage)

- `apps/web/tests/accessibility.spec.ts`: axe-core로 홈/식품 상세/계정·
  알림/영수증 검토 4개 화면 감사. `.device-screen` 스코프. Radix 시트
  오픈의 `aria-hidden`→포커스 이동 과도기를 피하려고 `openSheet()`가
  `.bottom-sheet` 안 포커스 안착을 폴링 + 250ms settle. 기존
  `test:runtime` step이 자동 포함 — 별도 CI wiring 불필요.
- `apps/web/scripts/check-bundle-size.mjs` + `npm run check:bundle`:
  production `dist/client/assets` 예산 (entry 420KB·chunk 500KB·JS 총
  1500KB·CSS 260KB, baseline 대비 ~15–25% headroom). Verify web job에
  "Check bundle size budget" step 추가.
- API job: `pytest-cov` 추가, `--cov=app --cov-fail-under=80`
  (측정 baseline 84%).
- CI(run 34770919629) 전체 초록. Connected E2E flake 1건 관측:
  `connected label review keeps an ambiguous date and storage
  unconfirmed` — intake 시트 오픈 후 `라벨` 탭 미등장으로 click 타임아웃
  (30s). rerun 통과. 재발 시 시트 오픈 트리거 경로 조사할 것.
