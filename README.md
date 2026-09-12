# Rescue Meal

영수증·바코드·식품 라벨을 이용해 식료품 재고를 빠르게 등록하고, 실제 표시 날짜와 보관 이력을 구분해 관리하며, 먼저 사용해야 할 재료 중심으로 식단을 제안하는 오픈소스 기반 서비스입니다.

## 현재 상태

- 단계: 1차 vertical slice + 상용화 운영 경계 고도화 및 검증
- 현재 canonical 작업본: `/Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal`. 대상에서 API **508 passed / 8 warnings**, connected full lane latest **108 passed (fresh rerun; earlier long run 103/106 timing-sensitive)**, fixture/mobile **39 passed + 3 skipped**(전체 42 tests), native viewport lane **14 passed**, production fail-closed **1 passed**, TypeScript/Vite **760 modules**, Sites **4 passed**, 실제 disposable PostgreSQL normalized live smoke와 migration `001→025` ledger readback을 확인함. 이전 affected connected flows는 focused PDF/manual-priority/planner **3/3/3 passed**, inventory pagination **10 passed**로 별도 readback했으며, account first-fold·food detail responsive/action reachability·320px camera recovery·native focus containment·primary intake idle prefetch·printed-date fixture determinism을 각각 readback에 기록함. 기존 OneDrive source는 provider metadata-only 상태를 확인한 뒤 제거했으며 canonical target이 유일한 code source임 ([final current-source readback](evidence/final-current-source-readback-2026-09-11.md), [2026-09-12 current-source readback](evidence/final-current-source-readback-2026-09-12.md), [Android Pixel readback](evidence/android-pixel-preview-readback-2026-09-11.md))
- 현재 PostgreSQL schema baseline: additive migration `001→025`; Compose의 one-shot `migrate` service와 `infra/postgres/migrate.sh --apply`가 schema authority이며, API startup runtime DDL은 기본 비활성화됨. `021_account_deletion_fence.sql`은 `active → deleting` durable account lifecycle을, `022_receipt_review_metadata.sql`은 normalized receipt review metadata를, `023_manual_food_idempotency.sql`은 수동 식품 명령 replay ledger를, `024_recipe_catalog_revision.sql`은 shared recipe catalog optimistic revision을, `025_storage_locations.sql`은 workspace-scoped 사용자 정의 보관 위치와 lot/event location reference를 추가함
- 사용자 정의 보관 위치: `김치냉장고`·`냉동 서랍` 같은 이름을 계정 화면에서 관리하고, 영수증·라벨·직접 입력·장보기 입고·상세 이동과 홈/재고 목록 표시 및 bounded location filter에서 사용함; canonical 보관 분류와 소비기한 판정은 변경하지 않음 ([custom storage location readback](evidence/custom-storage-location-readback-2026-09-09.md))
- 사용자 정의 위치는 현재 lot뿐 아니라 과거 storage event·장보기 입고 이력이 참조해도 삭제하지 못하게 보호하며, 최근 보관 기록에는 `김치냉장고 → 실온`처럼 실제 위치명을 표시함. AccountSheet는 payload 없는 `/api/storage-locations/revision`을 tab 복귀·30초 bounded probe로 확인해 다른 기기의 변경을 감지하고, 편집 중인 목록을 stale 상태로 남기지 않음 ([custom storage history readback](evidence/custom-storage-history-readback-2026-09-09.md))
- 알림 센터도 payload 없는 `/api/notifications/revision`을 초기 목록과 함께 기억하고, 열린 화면의 tab 복귀·30초 bounded probe에서 다른 기기 변경을 감지하면 최신 알림을 자동 반영함. 읽음/전체 읽음 mutation이 진행 중이면 현재 목록을 보존하고 완료 뒤 갱신하며, 실제 알림 생성·읽음 상태·안전 판정 계약은 변경하지 않음 ([notification cross-device readback](evidence/notification-cross-device-readback-2026-09-09.md))
- 홈 dashboard도 payload 없는 `/api/dashboard/revision`을 초기 dashboard와 함께 기억하고, 홈 화면의 tab 복귀·30초 bounded probe에서 다른 기기 재고 변경을 감지하면 최신 inventory와 Rescue Queue를 자동 반영함. 초기 `GET /api/dashboard` 성공 response의 revision을 polling baseline에 seed해 연결 직후 첫 visibility probe가 remote revision을 초기화로 소비하지 않도록 함. 활성 재고 검색이 있으면 `inventory-search` channel도 다시 실행하며, sheet가 열려 있거나 일반 dashboard sync가 진행 중이면 자동 교체를 보류하고 사용자 작업 toast가 있으면 background 안내가 덮지 않음 ([dashboard cross-device readback](evidence/dashboard-cross-device-readback-2026-09-09.md), [dashboard baseline recovery](evidence/final-current-source-readback-2026-09-11.md), [dashboard search cross-device readback](evidence/dashboard-search-cross-device-readback-2026-09-09.md))
- 열린 ShoppingListSheet도 payload 없는 `/api/shopping-list/revision`을 목록과 함께 기억하고, 다른 기기에서 장보기 항목이 바뀌면 최신 목록을 자동 반영함. 체크·삭제·입고·직접 추가 mutation 중에는 현재 목록을 보존하고 완료 뒤 queued refresh를 수행함 ([shopping list cross-device readback](evidence/shopping-list-cross-device-readback-2026-09-09.md))
- 검수 대기 영수증 queue도 payload 없는 `/api/receipts/revision`을 summary와 함께 기억하고, queue sheet가 열린 동안 다른 기기에서 draft가 반영·삭제되면 최신 summary 목록을 자동 반영함. 실제 영수증 draft 입력 화면이 열리면 probe를 중단해 사용자가 검토 중인 내용을 덮지 않음 ([receipt queue cross-device readback](evidence/receipt-queue-cross-device-readback-2026-09-09.md))
- 식품 상세도 dashboard revision을 이용해 다른 기기 변경을 감지하지만, 자동 payload 교체 대신 현재 상품 정보·보관·날짜 입력을 유지한 stale alert만 표시함. 사용자가 `최신 상태 확인`을 눌렀을 때만 최신 food를 다시 읽어 local draft를 명시적으로 교체함 ([food detail cross-device readback](evidence/food-detail-cross-device-readback-2026-09-09.md))
- 계정 설정도 account sheet가 열린 동안 dashboard revision을 tab 복귀·30초 bounded probe로 확인함. 다른 기기 변경 시 인증 account와 guest account 양쪽에 `다른 기기에서 계정 설정이 변경됐어요` alert를 표시하고 알림 설정·보관 위치·영수증 privacy·Grocy panel의 local draft를 유지하며, 사용자가 `최신 계정 설정 확인`을 눌렀을 때만 dashboard sync 성공 후 하위 panel을 다시 읽음 ([account settings cross-device readback](evidence/account-settings-cross-device-readback-2026-09-09.md))
- PostgreSQL readiness는 전체 compatibility projection table·핵심 column/index와 `rescue_schema_migrations` `001→025` baseline을 fail-closed로 확인하며, migration body와 ledger row를 locked psycopg transaction으로 함께 확정함 ([current schema gate readback](evidence/postgres-schema-gate-readback-2026-09-08.md))
- 운영 로그는 metric뿐 아니라 JSON access log도 route template만 기록해 resource ID·query string을 남기지 않음 ([access-log route-template readback](evidence/access-log-route-template-readback-2026-09-08.md))
- 인증 보조 데이터는 token TTL+grace 기반 cleanup만 수행하며, 만료 reset token·오래된 revoked hash 외의 업무 audit·재고·receipt·idempotency ledger는 삭제하지 않음 ([auth security retention readback](evidence/auth-security-retention-readback-2026-09-08.md))
- 날짜 assertion·상품 provenance persistence failure는 `WorkspaceMutation` 공통 recovery seam으로 rollback하고 concurrency stale snapshot은 복원하지 않음. 전체 workspace mutation 원자성은 아직 주장하지 않음 ([WorkspaceMutation readback](evidence/workspace-mutation-readback-2026-09-08.md))
- durable SQLite/PostgreSQL workspace projection reload는 `_AtomicStoreStateMixin` copy-on-write read snapshot으로 materialize하며, reload 중 동시 reader가 transient empty collection을 보지 않고 load failure 때 이전 snapshot을 유지함 ([durable read snapshot readback](evidence/durable-read-snapshot-readback-2026-09-08.md))
- durable reload 시작 이후 route가 기록한 local mutation도 state swap에서 보존해 pending write 유실을 막음. 이 경계는 reload 중 reader/write regression과 API/browser 회귀로 확인했으며, managed failover/partition은 별도 운영 gate임
- receipt·manual food·shopping receive·storage event의 retry identity 계산은 `OperationLedger` Module로 집중했으며, 기존 key digest·payload fingerprint·scoped ID byte contract와 domain별 replay/conflict semantics를 보존함 ([OperationLedger readback](evidence/operation-ledger-readback-2026-09-08.md))
- primary intake는 `AddFoodSheet` lazy split을 유지하면서 `openAdd()` intent prefetch와 resolve gate를 사용해 control 없는 dialog shell을 열지 않고, load 실패는 retry toast로 복구함 ([intake chunk prefetch readback](evidence/intake-chunk-prefetch-readback-2026-09-08.md))
- `WorkspaceMutation` 적용 caller는 active store `RLock`으로 snapshot→mutation→flush→restore를 직렬화해 refresh interleaving을 줄임. direct route·worker/provider transaction까지 전체 atomicity를 의미하지 않음 ([WorkspaceMutation lock readback](evidence/workspace-mutation-lock-readback-2026-09-08.md))
- storage event direct route의 idempotency precheck·lot validation·InventoryRepository mutation·Grocy outbox·rollback을 WorkspaceMutation과 active lock으로 편입했고, same-key concurrent request의 단일 event/replay를 확인함 ([storage event mutation readback](evidence/storage-event-mutation-readback-2026-09-08.md))
- single meal-plan save의 candidate validation·saved audit staging·flush·phantom rollback을 WorkspaceMutation으로 편입하고, existing plan replay·concurrent save·connected planner 재진입을 유지함 ([meal-plan save mutation readback](evidence/meal-plan-save-mutation-readback-2026-09-08.md))
- single meal-plan save의 regular persistence failure는 `meal_plan_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)으로 반환하며, `MealPlanSheet`는 실패 당시 preview payload를 유지한 inline `다시 시도`를 이 code에만 제공합니다. snapshot/recipe conflict와 validation에는 blind retry를 노출하지 않습니다 ([meal-plan save envelope readback](evidence/meal-plan-save-envelope-readback-2026-09-11.md))
- single meal-plan completion의 allocation validation·consumed event/outbox·plan/bundle progress·completed audit를 WorkspaceMutation과 `reprioritize(persist=False)`로 묶어 flush failure phantom consumption을 차단함 ([meal-plan completion mutation readback](evidence/meal-plan-completion-mutation-readback-2026-09-08.md))
- multi-day bundle save의 bundle lock·preview rematerialization·snapshot hash/day identity·bundle/day staging·flush/restore를 WorkspaceMutation으로 편입하고, preview side-effect-free·retry/history/conflict·linked progress를 유지함 ([multi-day bundle save mutation readback](evidence/multi-day-bundle-save-mutation-readback-2026-09-08.md))
- multi-day bundle save의 regular persistence failure는 `multi_day_plan_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)으로 반환하며, `MealPlanSheet`는 실패 당시 bundle payload를 유지한 3일 식단 영역 inline `다시 시도`를 이 code에만 제공합니다. snapshot conflict·validation과 linked day completion semantics는 그대로 유지합니다 ([multi-day save envelope readback](evidence/multi-day-save-envelope-readback-2026-09-11.md))
- 운영 readiness와 worker capacity/configuration 실패도 안전한 typed `503` envelope로 구분합니다. API `/ready` 저장소 장애는 `readiness_storage_unavailable` retry, 인증/worker 설정 누락은 `configure_server`, OCR `/ready`·capacity는 `ocr_model_unavailable`·`ocr_worker_busy` retry로 응답하며, 예외 원문·token은 노출하지 않습니다 ([operational 503 envelope readback](evidence/operational-503-envelope-readback-2026-09-11.md))
- 2026-09-12 현재 source 재검증에서 auth/recipe 설정·guest provisioning·workspace export rate limit까지 포함한 API **508 passed / 8 warnings**, connected **108/108 passed**, fixture/mobile **39 passed + 3 skipped**, native **14 passed**, build **760 modules**를 확인했습니다 ([final current-source readback 2026-09-12](evidence/final-current-source-readback-2026-09-12.md), [export rate-limit readback](evidence/export-rate-limit-readback-2026-09-12.md))
- workspace 전체 JSON export는 IP·opaque workspace bucket 기준 시간당 6회 기본 rate limit과 typed `account_export_rate_limited` `429`를 사용하며, AccountSheet는 다운로드를 만들지 않고 재시도 안내를 표시합니다 ([export rate-limit readback](evidence/export-rate-limit-readback-2026-09-12.md))
- 식품 상세는 393×852에서 `상태가 이상해 폐기하기`까지 iPhone safe boundary 안에 열리고, 320×740에서도 `먹었어요`·`보관 상태 저장`을 초기 스크롤 없이 확인할 수 있도록 responsive snap과 좁은 폭 card rhythm을 적용했습니다. focused detail regressions **2 passed**, full native **14 passed**, accepted captures와 geometry는 [food detail compact first-fold readback](evidence/food-detail-first-fold-compact-readback-2026-09-12.md)에 기록했습니다.
- receipt commit은 pending transaction marker를 먼저 durable flush한 뒤 receipt/workspace lock과 WorkspaceMutation outer flush로 lot·receipt 상태·alias/provenance audit·Grocy outbox를 finalization함. `persist=False` staging과 regular failure snapshot rollback, `needs_reconciliation` marker, GTIN/replay/pending retry/concurrent/final-flush-failure 회귀를 확인했으며 외부 Grocy transaction·managed failover·response reset은 별도 gate임 ([receipt commit mutation readback](evidence/receipt-commit-mutation-readback-2026-09-08.md))
- receipt commit 시작 marker flush failure와 finalization 일반 persistence failure는 transaction ID를 노출하지 않는 `receipt_commit_persistence_unavailable` typed 503으로 반환하고, finalization rollback 뒤 reconciliation marker flush failure는 durable pending identity를 유지한 `receipt_commit_reconciliation_unavailable` typed 503으로 반환함. 프론트는 시도 단위 commit key·draft payload·resolved receipt를 보존해 global `다시 시도`에서 같은 commit을 replay하고 auth/duplicate/workspace conflict에는 blind retry를 제공하지 않음 ([receipt commit retry readback](evidence/receipt-commit-retry-readback-2026-09-09.md), [finalization envelope readback](evidence/receipt-commit-finalization-envelope-readback-2026-09-11.md))
- multi-day bundle의 저장된 날짜 조리 완료는 별도 bundle endpoint가 아니라 linked single-plan completion을 사용하며, final flush failure 때 plan 완료·bundle day progress·inventory·consumed event를 함께 rollback하고 retry로 `completed`에 도달하는 회귀를 고정함 ([multi-day day completion recovery readback](evidence/multi-day-day-completion-recovery-readback-2026-09-08.md))
- single-plan completion의 regular persistence failure는 `meal_plan_completion_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)로 반환하며, `MealPlanSheet`는 실패 당시 plan·consumption payload를 유지한 inline `다시 시도`를 이 code에만 제공합니다. rollback·`already_completed`·linked bundle semantics는 유지하고, workspace conflict·allocation validation에는 blind retry를 노출하지 않습니다 ([meal-plan completion envelope readback](evidence/meal-plan-completion-envelope-readback-2026-09-11.md))
- planner의 preview/latest/preferences/alternatives/history/audit와 nested shopping read는 `WorkspaceSyncCoordinator`의 channel·AbortSignal lifecycle을 사용함. planner preview·barcode/label parse·label intake·inference·guest-transfer preview처럼 POST이지만 workspace를 바꾸지 않는 요청은 cross-tab mutation invalidation을 발행하지 않고, meal-plan save/complete와 preference mutation만 `meal-plan` channel을 갱신함. 같은 origin의 다른 탭 변경은 열린 planner를 다시 읽고, 다른 기기 변경은 planner와 알림 센터의 revision-only probe가 각 화면의 local draft/read state 보호 규칙에 따라 처리함 ([meal-plan client transport readback](evidence/meal-plan-client-transport-readback-2026-09-08.md), [notification cross-device readback](evidence/notification-cross-device-readback-2026-09-09.md))
- 구현: 선택한 모바일 콘셉트 기반 프론트엔드 + FastAPI API + Python 3.12 PaddleOCR worker
- GitHub: [godekd3133/rescue-meal](https://github.com/godekd3133/rescue-meal)
- 현재 구현된 것: 홈 Rescue Queue, 식품 상세·보관 이벤트, 부분 lot 이동·개봉·먹은 기록·폐기 확인, 첫 개봉 시각(`opened_at`)과 append-only event 이력·부분 개봉 child lot 보존, 영수증 검토·반영, 이미지 품질 gate, 실제 이미지 OCR worker, 라벨 날짜 후보, 바코드 후보 조회, C005·Open Food Facts 제품 resolver, I1250 제품명 review endpoint와 I1250 miss 뒤 Open Food Facts 상품명 fallback, workspace별 receipt-name alias, 직접 입력, 재고 기반 레시피 미리보기·대안 메뉴 3개 preview·선택 후보 보존 저장·3일 meal preview·bundle 저장/최신 복원/history·날짜별 선택·bundle 날짜별 planned/saved/completed progress·부족 재료·직접 추가 장보기 목록·재고 보충 시 recipe source 자동 정리·manual source 보존·체크/삭제·조리순서·식단 저장/재조회·snapshot/audit·사용량 조정·조리 완료 차감, receipt line별 distinct purchase lot·source provenance·구매일·영수증 출처를 보여주는 재고 상세, 원본 영수증 수명주기 정책·draft 삭제·commit metadata 비식별화, InventoryRepository mutation seam, 날짜·첫 개봉일 기준 추정 우선순위·Grocy 보류 작업을 모은 workspace 알림 센터·읽음 상태·사용자 timezone 기준 날짜/quiet hours·slim API image의 IANA timezone DB 보장, guest workspace 인증·SQLite 격리, PWA shell·API 동기화 경로, 선택적 COOKRCP01 review-draft importer·운영 CLI·recipe_admin RBAC·shared catalog·review actor audit·승인 recipe planner 연결, Grocy unit-aware mapping·receipt/storage-event outbox·상품·보관 위치 mapping·상품 mapping before→after audit·add/open/consume/transfer retry/dead-letter·manual retry·stale in-flight reconciliation·workspace lease·별도 worker tick, 회원가입 직후 guest workspace 기록 preview·명시적 account import·보류 import 재확인·충돌 409·idempotent replay, 계정 설정에서 Grocy 상태·worker heartbeat·상품/위치 mapping·상품 mapping before→after audit·blocked/pending/dead-letter/reconciliation outbox를 확인하고 저장하는 UX
- 장보기 입고 확인: 구매 수량·보관 위치를 사용자가 선택하면 기존 lot을 덮어쓰지 않는 새 inventory lot을 만들고, recipe source 자동 정리·manual checked history·Idempotency-Key replay를 지원함. lot이 이후 소비·폐기되어도 durable operation ledger가 같은 key의 재생성을 막음. guest transfer preview/완료 응답과 보류 import 화면에도 ledger 건수를 반영함. 수동 식품 create/correction도 같은 key digest·payload fingerprint ledger를 사용해 중복 lot과 소비 후 재생성을 차단함 ([manual food idempotency readback](evidence/manual-food-idempotency-readback-2026-09-07.md)). 실제 소비기한은 포장지 확인 대상으로 남김
- 수동 식품 create/correction은 `manual_food_lock`·`WorkspaceMutation` outer flush로 lot·priority·audit·idempotency ledger를 함께 저장하고, final flush failure 때 기존 상태를 복원한 뒤 `manual_food_persistence_unavailable` typed 503과 동일-key retry를 제공합니다. target correction은 수량·단위·구매/개봉 provenance를 보존하고, PostgreSQL 두 process replay/restart/correction race를 확인했습니다 ([manual food mutation recovery readback](evidence/manual-food-mutation-recovery-readback-2026-09-08.md))
- 현재 추가 구현: workspace별 알레르기 회피 조건 8종, 중복 제거·고정 순서 정규화, recipe allergen metadata 기반 filter와 unknown metadata abstain, export·guest transfer·SQLite/PostgreSQL projection 계약
- 이미지 intake 고도화: 스마트폰 EXIF 방향 보정 후 OCR 전달, 원본 SHA-256 보존, `orientation_corrected` quality provenance
- OCR worker 운영 경계: `/health`는 모델을 초기화하지 않는 liveness, `/ready`는 실제 PaddleOCR `predict()` warm-up까지 통과해야 하는 readiness로 분리함. CPU 동시 추론은 기본 process당 1건으로 제한하고, queue timeout은 `503`으로 닫음. 현재 pinned PaddlePaddle Linux CPU wheel에 맞춰 Docker target을 `linux/amd64`로 고정하고 `PP-OCRv5_mobile_det + korean_PP-OCRv5_mobile_rec`, `enable_mkldnn=False`, source pixel/max-side budget을 사용함; 실제 첨부 5장 runtime smoke는 통과했지만 매장 정확도·cold/warm latency·replica sizing은 별도 acceptance ([OCR worker readiness readback](evidence/ocr-worker-readiness-readback-2026-09-05.md))
- 전자 영수증 PDF intake: 텍스트 레이어가 있는 PDF는 `pypdf`로, 스캔 PDF는 제한된 `pypdfium2` page render 후 기존 OCR adapter로 line parser에 연결하고, 원본 PDF preview를 review 화면에 유지함; 암호화·손상·quota 초과 PDF는 상품을 추정하지 않고 명시적 재입력/OCR 필요 상태로 중단함 ([PDF receipt readback](evidence/pdf-receipt-readback-2026-09-03.md))
- 영수증 layout provenance: 바코드·매장 내부 코드행 뒤의 금액행 continuation과 `맛타리버섯 2팩`·`처음처럼(병)` 단위를 보존하고, 마트·음료/주류·식당 형식의 `template_id`·confidence를 review draft에 연결함; 매장 원문·주소·전화번호는 저장하지 않음 ([receipt layout readback](evidence/receipt-layout-readback-2026-09-03.md))
- 영수증 parser fixture: 첨부 원본을 저장하지 않고 비식별화한 마트 10개 상품·음료/주류·식당 형식을 고정했으며, 바코드 continuation과 `750 1 750` 같은 콤마 없는 금액행을 구분해 상품 line을 보존함 ([receipt fixture readback](evidence/receipt-fixture-readback-2026-09-05.md))
- 라벨 parser fixture: 사장님 제공 구조를 비식별화해 `(포장)년·월·일`과 `유효년·월·일`이 붙은 신선식품 날짜를 `unknown`으로 보류하고, 날짜 없는 가공식품은 일반 EAN·보관 hint만 유지함 ([label fixture readback](evidence/label-fixture-readback-2026-09-05.md)); 실제 PaddleOCR observation 줄바꿈까지 포함한 날짜·가변중량 barcode 안전 경계는 [label safety readback](evidence/ocr-label-safety-readback-2026-09-05.md)에서 확인함
- 모호한 라벨 검수 UX: 날짜 숫자만 읽힌 `unknown` 후보도 원본 preview와 함께 유지하고, 사용자가 날짜 종류와 실제 보관 위치를 모두 선택하기 전에는 반영하지 않음; 날짜 없는 면은 OCR 상품명을 편집 가능한 직접 입력 초안으로 이어줌 ([label safety readback](evidence/ocr-label-safety-readback-2026-09-05.md), [label review UI readback](evidence/label-review-ui-readback-2026-09-06.md))
- 중단된 영수증 검수 재개: connected 홈에서 아직 재고에 반영하지 않은 `review_required` draft를 다시 발견하고, 여러 pending draft는 선택 sheet에서 골라 원본 image/PDF bytes 없이 safe metadata·상품 line만 복원해 검수를 이어감. workspace 전환 중 늦게 도착한 이전 summary 응답은 generation guard로 폐기하며, 사용자가 확인·반영하기 전에는 StockLot을 만들지 않음 ([receipt review resume readback](evidence/receipt-review-resume-readback-2026-09-06.md))
- 영수증 draft·commit 동시성·재시도: 동일 receipt fingerprint의 미완료 draft는 process 안에서 lock으로 중복 생성을 막고 `X-Idempotency-Replayed`로 기존 검수 초안을 반환하며, flush 실패 뒤 process-local phantom도 복원함. 같은 receipt ID의 commit 요청은 API 프로세스 안에서 receipt별 lock으로 직렬화하고, PostgreSQL 프로세스 간 stale write는 workspace revision으로 차단함. 동일 영수증을 중복 탭하거나 여러 기기에서 동시에 반영해도 lot가 중복되지 않으며, 응답 유실 뒤 같은 `Idempotency-Key`·payload는 transaction/lot 결과를 replay하고 다른 payload는 `409`로 안내함 ([receipt draft idempotency readback](evidence/receipt-draft-idempotency-readback-2026-09-07.md), [receipt commit concurrency readback](evidence/receipt-commit-concurrency-readback-2026-09-06.md), [receipt commit idempotency readback](evidence/receipt-commit-idempotency-readback-2026-09-06.md))
- receipt draft 저장은 fingerprint lock·active mutation lock·`WorkspaceMutation` outer flush를 사용하고, final failure는 `receipt_draft_persistence_unavailable` typed 503과 phantom 없는 retryable capture 상태로 반환함. `openAdd()`는 AddFoodSheet/LazyBottomSheet resolve 후 sheet를 열어 PDF/file input과 직접 입력 tab이 준비되기 전 dialog shell을 노출하지 않음 ([receipt draft mutation and intake readiness readback](evidence/receipt-draft-mutation-readiness-readback-2026-09-08.md))
- 알림 delivery 경합: 사용자가 pending 알림을 먼저 읽거나 푸시 기기 연결을 해지하면 다음 worker tick이 외부 push를 호출하지 않고 `cancelled`로 이력을 보존하며, `dead_letter`·실제 전달 건수와 분리해 worker heartbeat와 알림 설정 화면에 표시함 ([notification delivery cancellation readback](evidence/notification-delivery-cancellation-readback-2026-09-06.md))
- 바텀시트 접근성: controlled Radix dialog의 이름·제목·설명 semantics를 유지하고 `Escape`로 닫을 수 있으며, exit animation 이후 원래 열기 버튼으로 포커스를 복귀함. fixture·mobile runtime **34 passed**, connected E2E **62 passed**와 TypeScript/Vite build에서 확인했으며 common protected runtime은 수정하지 않음 ([bottom-sheet accessibility readback](evidence/bottom-sheet-accessibility-readback-2026-09-06.md))
- 촬영 입력 UX 고도화: 영수증·라벨에 `getUserMedia` 기반 후면 카메라 프리뷰·프레이밍 가이드·촬영 결과 전달과 사진 보관함 fallback을 함께 제공하고, 권한 실패·OCR 실패 시 재촬영·재선택 경로를 유지함; 브라우저 API는 실기기 권한·카메라 수신·촬영 품질을 보증하지 않으므로 별도 acceptance
- 카메라 입력은 화면 프레이밍 가이드 안쪽을 `object-fit: cover` intrinsic pixel 기준으로 실제 crop해 OCR에 전달하며, layout metric이 없는 환경에서는 전체 frame으로 fallback함; 원근·반사·흐림 보정과 소비기한 확정은 하지 않음 ([camera guide crop readback](evidence/camera-guide-crop-readback-2026-09-05.md))
- 저대비·저조도 입력에는 원본 좌표와 SHA-256을 유지하는 조건부 `autocontrast` OCR profile을 적용하고 `ocr_input_profile`로 기록함; 흐림·반사·원근·잘림은 자동 복구하지 않으며 실제 인식률 상승은 annotation benchmark에서 별도 검증함
- 상품명 기반 priority endpoint는 검토된 rule provider를 기본으로 사용하고, `RESCUE_MEAL_INFERENCE_PROVIDER=ollama`일 때만 규칙 미매칭 요청을 private Ollama structured-output provider로 보강함; Pydantic schema·bounded timeout·abstain·review-only 경계를 적용하고 표시 날짜·소비기한·`safe_to_eat`를 모델에 요청하지 않음 ([local AI inference readback](evidence/local-ai-inference-readback-2026-09-05.md))
- 상품명 보강은 MFDS I1250을 우선 조회하고 miss 뒤 Open Food Facts legacy `/cgi/search.pl`을 제한된 fallback으로 사용함; 검색 후보는 source·confidence·provenance만 전달하고 소비기한·보관조건·섭취 가능 여부를 생성하지 않음 ([Open Food Facts name fallback readback](evidence/open-food-facts-name-fallback-readback-2026-09-05.md))
- 운영 설정 fail-closed: `VITE_DEPLOYMENT_MODE=production`에서는 HTTPS `VITE_API_BASE_URL`이 없거나 잘못되면 데모 fixture를 띄우지 않고 설정 차단 화면을 표시함; 개발·시연용 `demo`는 기존대로 유지함 ([runtime config readback](evidence/frontend-runtime-config-readback-2026-09-03.md))
- connected E2E는 disposable SQLite API와 허용된 CORS origin을 사용하고, 강제 좌표 click이 아닌 semantic click으로 실행함 ([connected E2E isolation readback](evidence/connected-e2e-readback-2026-09-03.md))
- receipt·label OCR 요청은 새 입력이 오면 이전 upload를 abort하고 오래된 응답을 무시함 ([intake concurrency readback](evidence/intake-concurrency-readback-2026-09-03.md))
- CI `postgres-live` job은 disposable `pgvector/pg16`에서 migration apply와 normalized API read/write/search smoke를 실행함; 실제 CI 통과 전에는 live PostgreSQL로 주장하지 않음 ([CI PostgreSQL live gate readback](evidence/ci-postgres-live-gate-readback-2026-09-03.md))
- disposable PostgreSQL 검증 환경에서 receipt commit까지의 migration `001→020`, normalized `/ready`, partial-open parent/child, `opened_at`·event readback, 상품 정보 수정 후 source audit·날짜 보관조건 불일치 경고·영수증 GTIN line/lot readback·receipt commit idempotency metadata/restart 복원·shopping receive Idempotency-Key replay를 실제 확인함. 현재 schema baseline은 account deletion fence·normalized receipt review metadata·manual food idempotency ledger·shared recipe catalog revision·workspace-scoped 사용자 정의 보관 위치를 포함한 migration `025`까지이며, `postgres-live` CI에도 사용자 정의 위치 assignment/readback과 receipt/meal-plan/manual-food 두 process replay·revision conflict·normalized readback smoke를 연결함 ([live PostgreSQL opened-at readback](evidence/live-postgres-opened-at-readback-2026-09-04.md), [shared product runtime readback](evidence/shared-product-runtime-readback-2026-09-04.md), [shared name enrichment readback](evidence/shared-name-enrichment-readback-2026-09-04.md), [상품 후보 provenance readback](evidence/product-provenance-readback-2026-09-04.md), [receipt GTIN readback](evidence/receipt-gtin-readback-2026-09-05.md), [shopping receive idempotency readback](evidence/shopping-receive-idempotency-readback-2026-09-05.md), [receipt commit idempotency readback](evidence/receipt-commit-idempotency-readback-2026-09-06.md), [receipt draft idempotency readback](evidence/receipt-draft-idempotency-readback-2026-09-07.md), [manual food lot boundary readback](evidence/manual-food-lot-boundary-readback-2026-09-07.md), [recipe review recovery readback](evidence/recipe-review-recovery-readback-2026-09-08.md)); 장시간 multi-process churn·failover·Grocy 외부 반영은 별도 gate
- PostgreSQL custom backup/빈 DB restore 스크립트와 client/server major-version guard를 추가하고 disposable DB에서 archive·mode 600·normalized schema·lot/date-storage readback을 확인함. 호스트 PostgreSQL CLI가 없는 macOS에서도 Docker client image로 같은 경로를 실행하는 wrapper와 DSN non-disclosure contract를 추가했으며, 실제 Docker-backed backup/restore readback은 별도 기록함 ([backup/restore readback](evidence/postgres-backup-restore-readback-2026-09-04.md), [portable client wrapper readback](evidence/postgres-client-wrapper-readback-2026-09-10.md)); object storage encryption·retention·scheduler·운영 cutover는 별도 gate
- PostgreSQL migration runner가 `rescue_schema_migrations` ledger에 파일별 SHA-256을 기록하고, 재실행 시 일치하는 migration을 건너뛰며 checksum drift를 실행 전에 거부하도록 고도화함; 001→018 receipt-line barcode schema 뒤 019 durable shopping-receive operation ledger, 020 receipt-commit idempotency metadata/normalized retry history, 021 durable account-deletion fence, 022 normalized receipt review metadata, 023 manual food idempotency ledger, 024 shared recipe catalog revision, 025 workspace-scoped custom storage location projection을 additive migration으로 추가했고 기존 migration checksum을 건드리지 않음 ([migration ledger readback](evidence/postgres-migration-ledger-readback-2026-09-04.md), [receipt GTIN readback](evidence/receipt-gtin-readback-2026-09-05.md), [shopping receive idempotency readback](evidence/shopping-receive-idempotency-readback-2026-09-05.md), [account deletion fence readback](evidence/account-deletion-fence-readback-2026-09-06.md), [receipt draft idempotency readback](evidence/receipt-draft-idempotency-readback-2026-09-07.md), [manual food lot boundary readback](evidence/manual-food-lot-boundary-readback-2026-09-07.md), [recipe review recovery readback](evidence/recipe-review-recovery-readback-2026-09-08.md))
- 실제 두 PostgreSQL connection의 동시 full-snapshot flush에서 1개 commit·1개 stale conflict·1개 lot readback과 conflict workspace cleanup을 확인함 ([PostgreSQL concurrency readback](evidence/postgres-concurrency-readback-2026-09-04.md)); aggregate pool sizing·failover·network partition은 별도 운영 gate
- 두 개의 독립 Uvicorn API process가 같은 PostgreSQL workspace에서 동일 장보기 `Idempotency-Key`를 동시에 처리하는 smoke를 추가하고, 동일 payload는 `201 initial + 201 replay`·단일 lot, `1 vs 2` 수량 conflict는 `201 + 409`, lot 소비 후 process 재시작은 `409` 재생성 차단으로 실제 확인함. 같은 workspace에서 독립 item 5라운드 bounded stress와 operation ledger 6건 readback, revision-lock crash-before-commit의 rollback·retry·replay, commit 직후 응답 전 process 종료의 동일 lot replay도 통과함 ([PostgreSQL multi-process receive readback](evidence/postgres-multiprocess-receive-readback-2026-09-05.md), [PostgreSQL crash recovery readback](evidence/postgres-crash-recovery-readback-2026-09-05.md), [PostgreSQL post-commit crash readback](evidence/postgres-post-commit-crash-readback-2026-09-05.md)); 장시간 churn·rolling deploy·failover·실제 reverse proxy response reset은 별도 운영 gate
- account deletion process crash recovery도 disposable PostgreSQL에서 확인함. 삭제 중 revision lock에서 대기하던 API process를 실제 `SIGKILL`한 뒤 transaction rollback과 durable `deleting` fence를 확인하고, API 재시작 후 같은 session delete 재시도·기존 token/login `401`·scoped rows `0`을 readback함 ([account deletion crash recovery readback](evidence/postgres-account-deletion-crash-recovery-readback-2026-09-06.md)); reverse proxy reset·rolling deploy·managed failover·backup/WAL/object storage 보존은 별도 운영 gate
- disposable PostgreSQL에서 account register → inventory write/read → API restart/login → password rotation·old token 401 → account purge와 credential/projection 0건을 확인하고, auth/workspace/readiness cursor의 `idle in transaction` cleanup도 `pg_stat_activity`로 확인함 ([PostgreSQL auth readback](evidence/postgres-auth-live-readback-2026-09-04.md))
- PostgreSQL workspace store의 request/worker lease, 유휴 snapshot LRU cache 상한, eviction 후 재오픈 readback, FastAPI lifespan의 router/auth/Grocy close와 operation-scoped pool을 구현함. disposable PostgreSQL에서 base+auth+2-cache lifecycle, pool `max_size=2` checkout timeout, pooled persistence/reopen, idle transaction 0건과 shutdown connection 0건을 확인함. 추가로 base/auth/shared direct owner를 reconnectable adapter로 감싸고 실제 backend termination 뒤 readiness·auth/read·복구 후 write·scoped cleanup을 확인함 ([PostgreSQL connection lifecycle readback](evidence/postgres-connection-lifecycle-readback-2026-09-04.md), [PostgreSQL operation pool readback](evidence/postgres-operation-pool-readback-2026-09-04.md), [PostgreSQL direct connection recovery readback](evidence/postgres-direct-connection-recovery-readback-2026-09-07.md), [connection lifecycle 설계](docs/postgres-connection-lifecycle.md)); shared owner를 하나의 pool로 통합한 것은 아니며 aggregate sizing·managed failover는 별도 운영 gate
- production preflight가 rolling deploy까지 포함한 API process 수·reserved headroom·실제 PostgreSQL `max_connections`를 요구하고 `process × (2 base/auth + pool max) + reserved <= max_connections`를 fail-closed로 검증함; CI disposable PostgreSQL의 `SHOW max_connections`와 현재 `pg_stat_activity` readback을 연결했지만 managed failover·network partition은 별도 운영 gate
- CI API job은 sanitized valid publisher⊆admin recipe profile을 preflight하고, admin 밖 publisher profile은 `recipe-publisher-not-admin`와 non-disclosure를 요구하는 negative gate로 차단함; 실제 GitHub Actions 성공은 별도 acceptance ([CI production preflight gate readback](evidence/ci-production-preflight-readback-2026-09-08.md))
- CI release contract는 web job에서 `workspace-sync`·service-worker lane을 별도로 실행하고, `postgres-live`에서 custom location revision 증가와 history 참조 후 DELETE `409 storage_location_in_use`를 확인하도록 고정함; 실제 GitHub Actions runner 성공과 운영 PostgreSQL failover는 별도 acceptance ([CI release contract readback](evidence/ci-release-contract-readback-2026-09-09.md))
- web CI는 source revision·dependency lock hash·migration hash·compiled Sites artifact hash를 secret/workspace data 없이 `rescue-meal-release-manifest-v1` JSON으로 만들고, `--require-artifacts`로 빌드 산출물 누락을 fail-closed 차단한 뒤 artifact로 보존함; local contract는 통과했지만 실제 GitHub Actions artifact retention·signed provenance·release promotion은 별도 acceptance ([release provenance manifest readback](evidence/release-provenance-manifest-readback-2026-09-09.md))
- recipe review mutation은 사용자 workspace와 분리된 opaque `recipe-catalog` key·`recipe-review` channel로 다른 운영자 탭을 invalidate하고, 열린 local editor는 덮어쓰지 않은 채 queue만 다시 읽음; server push·실시간 ordering은 별도 acceptance ([recipe review realtime readback](evidence/recipe-review-realtime-readback-2026-09-08.md))
- 다른 기기/브라우저 변경은 `/api/recipe-review/revision` revision-only probe로 tab 복귀와 30초마다 확인하고, 선택 draft가 원격에서 바뀌면 local editor를 stale로 잠가 명시적 최신 reload를 요구함; probe 실패 시 기존 queue를 지움 없이 보존 ([recipe review revision probe readback](evidence/recipe-review-revision-probe-readback-2026-09-08.md))
- 열린 planner도 `/api/meal-plans/revision` revision-only probe를 tab 복귀·30초 주기로 확인함; 다른 기기에서 식단이나 재고가 바뀌면 현재 alternative·인분·lot 사용량 선택을 유지한 채 `최신 식단 확인`을 요구하고, 사용자 action 이후에만 최신 preview/latest를 다시 materialize함 ([meal-plan cross-device readback](evidence/meal-plan-cross-device-readback-2026-09-09.md))
- product master provider runtime: PostgreSQL/SQLite shared cache, provider별 atomic rate-limit window, barcode cache-miss single-flight lease, cache TTL·namespace·fail-closed schema gate ([shared product runtime readback](evidence/shared-product-runtime-readback-2026-09-04.md))
- 상품 후보 provenance: 바코드·영수증 후보를 사용자가 적용하면 source·원본 URL·confidence·source freshness·상품 기준 보관 힌트·검토 메모를 lot에 저장하고 상세 화면에서 보여줌; 후보와 다른 상품명을 최종 반영하면 stale provenance를 제거하고 before/after audit를 남기며, 상세 화면의 상품명·브랜드·분류 직접 수정은 수량·보관 위치·표시 날짜를 보존한 채 상품 정보 audit를 남김. 라벨이 읽은 보관조건도 표시 날짜 assertion에 보존하고 실제 위치가 다르면 재계산 없이 확인 경고를 표시함; 개별 포장 소비기한은 계속 별도 날짜 확인 gate로 유지함 ([상품 후보 provenance readback](evidence/product-provenance-readback-2026-09-04.md))
- 상품 정보 수정은 `WorkspaceMutation` outer flush로 profile·provenance removal audit·product-info audit·priority를 함께 저장하고, 실패 시 `product_info_persistence_unavailable` typed 503과 기존 상태 보존·detail sheet inline retry를 제공합니다. quantity/unit/purchase/opened provenance와 DateAssertion은 유지합니다 ([product-info mutation recovery readback](evidence/product-info-mutation-recovery-readback-2026-09-08.md))
- 영수증 privacy erase는 `WorkspaceMutation` outer flush로 미반영 draft 삭제 또는 committed/pending metadata redaction을 확정하고, flush 실패 시 `receipt_privacy_persistence_unavailable` typed 503과 기존 receipt·재고 provenance·commit transaction 보존을 제공합니다. 계정의 `영수증 원본 관리`는 열린 sheet 내부 inline `다시 시도`를 제공하며, `confirm: true`·`deleted_draft`·`redacted_committed`·`redacted_pending` semantics를 유지합니다 ([receipt privacy mutation recovery readback](evidence/receipt-privacy-mutation-recovery-readback-2026-09-08.md))
- 장보기 목록의 계획 source 동기화·직접 추가·read-time reconciliation은 `WorkspaceMutation` outer flush로 source merge를 확정하고, flush 실패 시 `shopping_list_persistence_unavailable` typed 503과 기존 목록 보존을 제공합니다. MealPlanSheet와 홈 ShoppingListSheet는 열린 sheet 내부 inline `다시 시도`로 같은 source/payload 또는 최신 목록 재조회를 실행하며, source quantity·checked·manual merge semantics를 유지합니다 ([shopping list mutation recovery readback](evidence/shopping-list-mutation-recovery-readback-2026-09-09.md), [shopping list read reconciliation recovery readback](evidence/shopping-list-read-reconciliation-recovery-readback-2026-09-09.md))
- 영수증 product-enrichment enqueue와 dead-letter retry는 job map을 `WorkspaceMutation` snapshot/outer flush로 저장하고, 실패 시 `product_enrichment_persistence_unavailable` typed 503과 기존 검수/job 상태 보존을 제공합니다. AddFoodSheet는 열린 검수 화면에서 `다시 시도`를 제공하며 queued/in-flight polling과 succeeded candidate merge를 유지합니다 ([product-enrichment mutation recovery readback](evidence/product-enrichment-mutation-recovery-readback-2026-09-09.md))
- 장보기 입고는 새 inventory lot·planned source 정리·checked 상태·receive operation ledger를 `WorkspaceMutation` outer flush로 함께 확정하고, flush 실패 시 `shopping_receive_persistence_unavailable` typed 503과 기존 목록/재고/ledger 보존을 제공합니다. 같은 Idempotency-Key retry는 동일 lot으로 replay하며, ShoppingListSheet는 열린 receive form에서 `다시 시도`를 제공합니다 ([shopping receive mutation recovery readback](evidence/shopping-receive-mutation-recovery-readback-2026-09-09.md))
- 보관·개봉·소비·폐기 storage event는 `WorkspaceMutation` restore 뒤 직접 flush하지 않고 `storage_event_persistence_unavailable` typed 503을 반환합니다. optimistic 상태는 dashboard read로 복구하며 sheet가 닫힌 상태의 global `다시 시도`가 같은 Idempotency-Key를 재사용해 성공한 event는 replay하고 실패한 event를 이어서 처리합니다 ([storage event error recovery readback](evidence/storage-event-error-recovery-readback-2026-09-09.md))
- 보관 위치 이동과 최초 개봉처럼 하나의 사용자 의도에서 함께 발생하는 두 local storage event는 `POST /api/foods/{food_id}/storage-event-sequence`로 한 번에 확정합니다. sequence 전체를 `WorkspaceMutation` outer flush로 묶고, flush 실패 시 `storage_event_sequence_persistence_unavailable` typed 503과 동일 Idempotency-Key retry를 제공해 이동만 저장되는 부분 상태를 막습니다. 단일 event endpoint와 외부 Grocy transaction은 기존 별도 경계를 유지합니다 ([storage event sequence readback](evidence/storage-event-sequence-readback-2026-09-09.md))
- guest-to-account transfer는 source·target workspace ID 순서의 cross-workspace lock 안에서 ready/conflict를 재확인한 뒤 복사합니다. preview 직후 account에 들어온 기록을 guest snapshot이 덮지 않으며, target flush failure는 `guest_transfer_persistence_unavailable` typed 503과 기존 account 상태 복원으로 반환합니다. source guest workspace는 삭제하지 않고, 기존 fingerprint 기반 replay/conflict semantics를 유지합니다 ([guest transfer lock/recovery readback](evidence/guest-transfer-lock-recovery-readback-2026-09-09.md))
- 포장지 보관조건과 현재 보관 위치가 다르면 상세 화면과 알림 센터에서 `storage_mismatch` advisory를 보여주며, custom location이 있으면 `김치냉장고` 같은 실제 위치 이름도 함께 표시함; 날짜·소비기한·섭취 안전 판정은 자동으로 바꾸지 않음
- disposable Grocy 4.7.0에서 receipt add/open/consume/transfer와 transaction ID·냉장→냉동 location readback을 확인함; 운영 Grocy backup/restore·key rotation·crash recovery·undo는 별도 gate ([live Grocy sync readback](evidence/live-grocy-sync-readback-2026-09-04.md))
- CI `connected-e2e` job은 disposable SQLite API·Vite·Chromium으로 실제 frontend/backend 연결 suite를 실행함; CI 통과 전에는 connected release gate로 주장하지 않음 ([connected E2E isolation readback](evidence/connected-e2e-readback-2026-09-03.md))
- 렌더링 예외는 app-owned `RuntimeErrorBoundary`가 사용자용 복구 화면으로 전환하고, 예외 상세를 화면에 노출하지 않음 ([runtime error boundary readback](evidence/runtime-error-boundary-readback-2026-09-03.md))
- 렌더링 복구 이벤트는 원문·stack·식품/계정 데이터를 제외한 surface·error kind·release만 FastAPI structured log로 best-effort 전송하고, secure mode에서는 별도 rate limit을 적용함 ([client error telemetry readback](evidence/client-error-telemetry-readback-2026-09-03.md))
- 식단 안전 확인 고도화: 실제 recipe allocation lot의 표시 날짜·불완전 의미·포장지 보관조건과 현재 보관 위치 불일치를 `date_review_required`로 안내하고 자동 소비기한 판정은 하지 않음
- 홈 날짜 안전 안내: 오늘/지난 표시 날짜·`unknown`·포장일/제조일을 Rescue Queue·재고 목록·식품 상세에서 `조리 전 날짜 확인`으로 안내하며 소비기한을 자동 확정하지 않음
- 홈 UX 고도화: 비어 있는 account workspace·보관 위치 필터 결과에 다음 행동 CTA를 제공하고, 현재 날짜·실제 Rescue Queue 기반 식단 보조 문구를 표시함
- 홈 빈 상태·현재 날짜의 실제 브라우저 readback은 [home empty-state readback](evidence/home-empty-state-readback-2026-09-03.md)에 기록함
- 홈 날짜 확인의 실제 브라우저 readback은 [home date-review readback](evidence/home-date-review-readback-2026-09-03.md)에 기록함
- 재고 검색·검색 결과 없음 복구의 실제 브라우저 readback은 [inventory search readback](evidence/inventory-search-readback-2026-09-03.md)에 기록함
- 연결 모드 재고 검색은 workspace-scoped server search와 `더 보기` page contract를 사용하고, 데모/오프라인에서는 로컬 fallback을 사용함
- PostgreSQL 연결 모드는 migration `009_inventory_search.sql`의 `pg_trgm` 검색 projection과 workspace/storage 복합 경로를 사용하며, SQL 계약과 live 검증 경계는 [PostgreSQL search readback](evidence/postgres-search-readback-2026-09-03.md)에 기록함
- 영수증 review는 업로드한 원본을 브라우저 임시 URL로 대조해 보여주고, 재선택·화면 전환 시 URL을 폐기함; 원본 파일 bytes는 재고 기록에 저장하지 않으며 이 경계는 [receipt source preview readback](evidence/receipt-source-preview-readback-2026-09-03.md)에 기록함
- 영수증 review는 상품 line에 연결된 safe observation ID·정규화 bbox·confidence만 overlay payload로 받아 line 선택 시 원본 위치를 강조함; OCR 원문·전화번호·주소는 overlay 응답에 포함하지 않으며 [receipt bbox overlay readback](evidence/receipt-bbox-overlay-readback-2026-09-03.md)에 기록함
- 라벨 review도 날짜 후보에 연결된 safe observation ID·정규화 bbox·confidence만 원본 preview에 강조하며, 포장일·제조일을 소비기한으로 승격하지 않음; 사용자가 표시 날짜를 수정한 뒤 확인할 수 있고 위치 연결이 불가능한 날짜는 직접 확인 필요 상태로 유지함
- 영수증·라벨 `getUserMedia` 카메라 surface·촬영 결과 전달·사진 fallback과 OCR 실패 후 재촬영 경로는 [capture input readback](evidence/capture-input-readback-2026-09-03.md)에 기록함; 실제 iOS/Android 카메라 권한·촬영 품질은 별도 acceptance
- 최근 고도화: 영수증 line별 상품명·수량·단위·보관 위치 보정, workspace별 사용자 확인 상품명 alias와 `user_confirmed_alias → local_rule → parser` waterfall, storage suggestion과 보관 기준별 우선순위, 구매일 또는 첫 개봉일 기준 inference, receipt provenance를 재고 상세에 표시하는 UX, 실제 lot ID 정합성, storage event `Idempotency-Key`와 timeout 1회 재시도, account 401 재로그인 CTA, 오류 응답 CORS, workspace별 알레르기 회피 조건·중복 제거·unknown recipe abstain, 프로젝트 context/scorecard
- 알림 고도화: workspace별 앱 내 알림 on/off·사전 확인 기간·조용한 시간 설정, HTTPS Web Push subscription 저장·fingerprint summary·기기 해지, delivery outbox·선택적 `notification-worker`·VAPID/pywebpush 전송·retry/dead-letter/410 정리·service worker push 표시/클릭 복귀 경계
- 제품 기준정보 고도화: receipt draft와 분리된 I1250 우선 product-enrichment job, I1250 miss 뒤 Open Food Facts legacy name-search fallback, service-token worker, workspace lease·retry·stale recovery·heartbeat, review 화면 백그라운드 polling과 사용자 후보 적용
- 오프라인·업데이트 고도화: 마지막 성공 dashboard를 workspace namespace별 read-only cache로 복원하고 `오프라인 · 최근 화면`과 동기화 시각을 표시, stale 상태의 write 자동 재생 방지를 유지함. PWA navigation은 network-first, 정적 asset은 destination 제한 stale-while-revalidate로 처리하고, waiting worker는 사용자가 `새로고침`을 선택할 때만 적용함 ([PWA 업데이트·캐시 정책 readback](evidence/pwa-update-cache-readback-2026-09-06.md))
- 데이터 portability: workspace 재고·구매 summary·보관 event·식단·알림 설정을 민감한 원문과 분리해 JSON으로 내보내기
- 계정 privacy lifecycle: 현재 비밀번호와 `DELETE` 확인 문구 후 auth row를 durable `deleting`으로 고정하고 account workspace purge·credential 삭제를 수행함; 중간 regular failure는 `account_deletion_persistence_unavailable` typed `503`(`retryable=true`, `action=retry_later`)으로 반환하고 AccountSheet는 해당 code에만 inline retry를 제공함. 일반 요청은 `423 account_deletion_in_progress`, 완료 후 기존 token은 `401`이며, disposable PostgreSQL 두 process의 fence·purge·row 삭제는 [multi-process account deletion readback](evidence/postgres-account-deletion-multiprocess-readback-2026-09-06.md)으로 확인함 ([account deletion envelope readback](evidence/account-deletion-envelope-readback-2026-09-11.md))
- 계정 보안 고도화: 로그인한 account의 password change, `session_version` rotation, 기존 token 즉시 무효화, password change account/IP rate limit·429·Retry-After, generic password-reset request·30분 one-time reset token·완료 후 새 session 발급, password provider의 bounded transient retry·per-token idempotency key, 보안 Compose profile의 auth rate limit·Retry-After
- 현재 문서가 정의하는 것: MVP 범위, 안전 경계, 데이터 출처, OSS 역할, 검증 방법, API 계약, 상용화 scorecard
- 현재 문서가 증명하지 않는 것: 운영 환경의 OCR 정확도, 한국 상품 조회율, 식품 안전, 실제 폐기량 감소, 실기기·운영 런타임 안정성

초기 샘플 영수증 3장에 대한 macOS Vision 기준선과 실제 PaddleOCR worker 결과는 [Vision benchmark](evidence/vision-ocr-parser-benchmark-2026-09-01.md)와 [PaddleOCR benchmark](evidence/paddleocr-benchmark-2026-09-01.md)에 기록했습니다. 이 결과는 실제 이미지 draft 생성 가능성을 보여주지만 모든 매장에 대한 자동 입고 성능을 증명하지 않습니다.

농산물 가변중량 라벨과 가공식품 포장 라벨의 OCR·날짜 후보·바코드 조회 결과는 [식품 라벨 가능성 Spike](evidence/label-feasibility-spike-2026-09-01.md)에 기록했습니다.

## 핵심 사용자 문제

식료품 관리 서비스가 계속 사용되지 않는 가장 큰 이유는 등록 비용이 높기 때문입니다. Rescue Meal은 다음 입력을 한 재고 흐름으로 연결합니다.

1. 일반 포장식품: 바코드로 상품 식별 후 날짜 라벨을 추가 촬영하거나 직접 확인합니다.
2. GS1 2D 식품: 바코드에 실제 날짜가 포함된 경우 해당 값을 파싱합니다.
3. 영수증: 구매 항목을 추출·매칭하고, 모호한 항목만 사용자 확인 후 재고에 반영합니다.
4. 포장 신선식품: 가격표·중량·포장일·소비기한 라벨을 OCR로 읽고 확인합니다.
5. 낱개 농산물·남은 음식: 구매일·조리일·보관 위치·사용자 알림일을 빠르게 등록합니다.

## 제품 약속

Rescue Meal은 음식이 안전한지 자동 판정하지 않습니다.

- 라벨에 실제로 표시된 날짜는 `표시 날짜`로 보존합니다.
- 사용자가 확인한 날짜와 자동 추출 날짜를 구분합니다.
- 보관 이력과 카테고리 규칙으로 계산한 값은 `추정 소비 우선일`로만 표시합니다.
- 추정 소비 우선일을 소비기한·유통기한·안전 보증으로 표현하지 않습니다.
- 포장지의 보관 방법과 실제 사용자 보관 상태가 다르면 사용자에게 불일치를 알립니다.
- 알레르기 회피 조건은 확인된 recipe metadata에만 적용하고, metadata가 없으면 보수적으로 추천을 보류합니다. `알레르기 없음`이나 의료적 안전을 보증하지 않습니다.

## 대표 흐름

### 영수증 기반 자동 입고

```text
영수증 촬영 또는 업로드
→ OCR 및 매장 템플릿 판별
→ 구매일·매장·라인 항목·수량·가격 추출
→ 기존 상품·바코드·별칭과 매칭
→ 중복 영수증 검사
→ 낮은 신뢰도 항목만 사용자 검토
→ 확인된 항목을 구매 묶음(stock lot)으로 생성
→ 날짜가 없는 항목은 라벨 촬영 또는 빠른 입력 요청
→ Grocy가 연결된 경우 상품·단위 mapping 확인 후 외부 입고 outbox 생성
```

영수증 OCR 결과는 즉시 확정 재고로 들어가지 않습니다. `uploaded → extracting → review_required → confirmed → committed` 상태를 거쳐야 합니다.

### 보관 위치 변경

```text
냉장 닭가슴살 4팩
→ 2팩을 냉동으로 이동
→ 냉장 2팩 lot + 냉동 2팩 lot으로 분할
→ 이동 시각과 이전·이후 보관 위치를 storage event로 기록
→ 실제 라벨 날짜는 변경하지 않음
→ 냉동 2팩의 추정 소비 우선일만 별도 재계산
→ Grocy가 연결된 경우 transfer outbox로 외부 위치도 동기화
```

### Rescue Queue

사용자 홈에는 날짜 하나가 아니라 이유가 보이는 우선순위를 제공합니다.

```text
오늘 먼저 사용

1. 냉장 시금치 — 구매 후 4일, 실제 소비기한 없음
2. 개봉 우유 — 라벨 소비기한 3일 전, 개봉 후 경과 2일
3. 해동 닭가슴살 — 어제 냉동실에서 냉장실로 이동
```

## 권장 OSS·공개 데이터 구성

| OSS | 역할 |
|---|---|
| Grocy | 상품·재고 lot·보관 위치·소비·폐기·레시피 기준 시스템 |
| ZXing Browser | 카메라 기반 EAN/UPC/QR/DataMatrix 해독 |
| GS1 Barcode Syntax Engine | GTIN·로트·생산일·포장일·Best Before·Expiration 파싱 |
| Open Food Facts | 바코드 기반 상품명·브랜드·카테고리 보조 후보 조회, I1250 miss 뒤 명시적 상품명 검색 fallback |
| 식품안전나라 C005 | 바코드·제품 기준 소비기한·보관 문구 후보 조회(legacy) |
| PaddleOCR | 한국어 영수증·포장 라벨 OCR 및 key information extraction |
| Ollama | 규칙 미매칭 상품명에 대한 private structured-output priority 보조 후보(선택 기능) |
| invoice2data | 매장별 영수증 템플릿·라인 항목 추출 실험 |
| USDA FoodKeeper Data | 저장 위치별 기간 모델의 공개 데이터 후보(OSS 코드가 아닌 open data) |
| OR-Tools | 낭비 위험·부족 재료·조리시간을 고려한 식단 최적화 |
| ntfy | 자체 호스팅 가능한 알림 전송 |
| FastAPI | OCR·상품 매칭·Grocy·최적화 사이의 adapter API |
| Docker Compose | 전체 실행환경 재현 |

Grocy를 기준 재고 시스템으로 재현하고, Rescue Meal은 영수증 intake·날짜 provenance·보관이력·Rescue Score·식단 최적화를 확장하는 companion service를 우선 검토합니다.

## MVP 범위

### 포함

- 영수증 이미지 업로드
- 구매일·매장·라인 항목 OCR
- 상품 별칭 기반 매칭
- 중복 영수증 차단
- 검토 후 일괄 재고 반영
- 바코드 상품 등록
- 라벨 날짜 OCR 및 사용자 확인
- 실온·냉장·냉동 위치 관리
- 개봉·냉동·해동·분할 이력
- 표시 날짜와 추정 소비 우선일 분리
- Rescue Queue
- 팀 작성 starter recipe 53개 기반 식단 추천과 외부 source-backed catalog 확장 경계
- 알레르기 회피 조건 8종 저장과 metadata 불명확 recipe 보수적 제외
- 소비·폐기 기록

### 제외

- 음식 사진만으로 부패 여부 판정
- 자동으로 식품 안전 또는 섭취 가능 여부 판정
- 모든 마트 영수증 범용 지원
- 모든 한국 상품 자동 식별
- 카드사·마트 계정 연동
- 냉장고 IoT 온도 자동 수집
- 생성형 AI가 임의 레시피 생성
- 영양·질병·알레르기 의료 판단

## 검증 질문

1. 한국 영수증에서 구매일·매장·라인 항목을 어느 정도 정확히 추출할 수 있는가?
2. 영수증의 축약 상품명을 기존 상품과 안전하게 매칭할 수 있는가?
3. 잘못된 자동 입고를 막으면서 사용자 확인 시간을 줄일 수 있는가?
4. 실제 포장 라벨에서 날짜와 날짜 의미를 구분할 수 있는가?
5. 보관 위치 변경·개봉·냉동·해동을 사용자가 계속 기록할 수 있는가?
6. Rescue Queue와 식단이 기준 방식보다 폐기 위험 재료를 더 많이 사용하는가?
7. 알레르기 회피 조건이 recipe preview·대안·3일 계획·guest transfer·export에서 workspace별로 누출 없이 유지되는가?

구체적인 계약은 다음 문서를 따릅니다.

개발 단계별 커밋 구조와 각 단계의 코드·문서·검증 연결은 [개발 진행 맵](docs/development-map.md)에서 한 번에 볼 수 있습니다. 커밋 제목은 제품 문제와 구현 의존성이 이어지도록 구성했으며, 각 단계의 완료 claim과 아직 남은 검증 경계를 함께 적었습니다.

- [제품 흐름](docs/product-brief.md)
- [데이터 계약](docs/data-contract.md)
- [OSS 통합 경계](docs/oss-integration.md)
- [OSS·공공 데이터 카탈로그](docs/oss-catalog.md)
- [구현 계획](docs/implementation-plan.md)
- [개인정보와 데이터 수명주기](docs/privacy-data-lifecycle.md)
- [Workspace 데이터 export](docs/data-export.md)
- [Account 보안과 session rotation](docs/account-security.md)
- [계정·workspace 삭제 설계](docs/account-deletion.md)
- [계정·workspace 삭제 readback](evidence/account-deletion-readback-2026-09-03.md)
- [계정 삭제 durable fence readback](evidence/account-deletion-fence-readback-2026-09-06.md)
- [Password change rate-limit readback](evidence/password-change-rate-limit-readback-2026-09-03.md)
- [Account password recovery](docs/account-recovery.md)
- [Shared auth rate-limit readback](evidence/auth-rate-limit-readback-2026-09-03.md)
- [Backend priority inference trace readback](evidence/inference-trace-readback-2026-09-03.md)
- [Production configuration preflight](infra/README.md#production-preflight)
- [Production preflight readback](evidence/production-preflight-readback-2026-09-03.md)
- [PostgreSQL schema readiness readback](evidence/postgres-readiness-readback-2026-09-03.md)
- [PostgreSQL migration runner readback](evidence/postgres-migration-runner-readback-2026-09-03.md)
- [Disposable PostgreSQL opened_at readback](evidence/live-postgres-opened-at-readback-2026-09-04.md)
- [PostgreSQL backup/restore readback](evidence/postgres-backup-restore-readback-2026-09-04.md)
- [PostgreSQL concurrency readback](evidence/postgres-concurrency-readback-2026-09-04.md)
- [PostgreSQL account authentication readback](evidence/postgres-auth-live-readback-2026-09-04.md)
- [PostgreSQL connection lifecycle readback](evidence/postgres-connection-lifecycle-readback-2026-09-04.md)
- [PostgreSQL operation pool readback](evidence/postgres-operation-pool-readback-2026-09-04.md)
- [PostgreSQL aggregate connection budget readback](evidence/postgres-connection-budget-readback-2026-09-04.md)
- [PostgreSQL connection lifecycle 설계](docs/postgres-connection-lifecycle.md)
- [상품 후보 provenance readback](evidence/product-provenance-readback-2026-09-04.md)
- [Disposable Grocy external sync readback](evidence/live-grocy-sync-readback-2026-09-04.md)
- [GS1 date candidate readback](evidence/gs1-date-readback-2026-09-03.md)
- [Web Push browser readback](evidence/web-push-browser-readback-2026-09-03.md)
- [Runtime error boundary readback](evidence/runtime-error-boundary-readback-2026-09-03.md)
- [Client error telemetry readback](evidence/client-error-telemetry-readback-2026-09-03.md)
- [API runtime observability contract](docs/observability.md)
- [Web/API security baseline](docs/security-baseline.md)
- [알림 선호와 Web Push delivery 경계](docs/notification-delivery.md)
- [아키텍처 결정 기록](docs/architecture-decisions.md)
- [실현 가능성·검증 계획](docs/feasibility-validation-plan.md)
- [OCR intake pipeline](docs/ocr-pipeline.md)
- [디자인 QA](docs/design-qa.md)
- [환경 Preflight](evidence/environment-preflight-2026-09-01.md)
- [Repository publication preflight](evidence/repository-publication-preflight-2026-09-02.md)
- [실제 첨부 이미지 OCR benchmark](evidence/vision-ocr-parser-benchmark-2026-09-01.md)
- [실제 PaddleOCR benchmark](evidence/paddleocr-benchmark-2026-09-01.md)
- [Image quality focus readback](evidence/image-quality-focus-readback-2026-09-03.md)
- [Image orientation readback](evidence/image-orientation-readback-2026-09-03.md)
- [Live API → PaddleOCR receipt readback](evidence/live-ocr-api-readback-2026-09-03.md)
- [OCR bbox boundary readback](evidence/ocr-bbox-boundary-readback-2026-09-04.md)
- [전자 영수증 PDF receipt readback](evidence/pdf-receipt-readback-2026-09-03.md)
- [Receipt layout/template readback](evidence/receipt-layout-readback-2026-09-03.md)
- [부분 lot parent/child readback](evidence/partial-lot-readback-2026-09-01.md)
- [바코드 카메라 흐름](docs/barcode-camera.md)
- [바코드 상품 resolver 운영 경계](docs/product-resolver.md)
- [바코드 상품 resolver readback](evidence/product-resolver-readback-2026-09-02.md)
- [영수증 제품정보 enrichment worker readback](evidence/product-enrichment-readback-2026-09-03.md)
- [연결 상태와 timeout 경계](evidence/connection-status-2026-09-01.md)
- [PWA 설치·오프라인 경계](docs/pwa-offline.md)
- [PWA 설치 CTA·manifest readback](evidence/pwa-install-readback-2026-09-04.md)
- [PWA 오프라인 재연결 readback](evidence/pwa-offline-reconnect-readback-2026-09-02.md)
- [PWA 업데이트·캐시 정책 readback](evidence/pwa-update-cache-readback-2026-09-06.md)
- [PWA production build evidence](evidence/pwa-build-2026-09-01.md)
- [storage event history readback](evidence/storage-history-readback-2026-09-01.md)
- [추정 날짜 확정 흐름](docs/date-assertion-correction.md)
- [추정 날짜 사용자 확정 readback](evidence/date-correction-readback-2026-09-01.md)
- [Guest workspace 인증·데이터 격리](docs/auth-workspace.md)
- [Guest workspace isolation readback](evidence/auth-workspace-readback-2026-09-01.md)
- [Guest → account workspace transfer readback](evidence/guest-account-transfer-readback-2026-09-03.md)
- [영수증 review·보관 보정 readback](evidence/receipt-review-readback-2026-09-02.md)
- [영수증 원본 대조 미리보기 readback](evidence/receipt-source-preview-readback-2026-09-03.md)
- [영수증 OCR bbox overlay readback](evidence/receipt-bbox-overlay-readback-2026-09-03.md)
- [중단된 영수증 검수 재개 readback](evidence/receipt-review-resume-readback-2026-09-06.md)
- [인증 세션 만료·CORS readback](evidence/auth-session-readback-2026-09-02.md)
- [프로젝트 context](context.md)
- [상용화 scorecard](scorecard.md)
- [PostgreSQL tenant-aware contract](evidence/postgres-tenant-contract-2026-09-01.md)
- [Inventory authority readback](evidence/inventory-authority-readback-2026-09-02.md)
- [Notification center readback](evidence/notification-readback-2026-09-02.md)
- [Notification delivery readback](evidence/notification-delivery-readback-2026-09-02.md)
- [Account recovery readback](evidence/account-recovery-readback-2026-09-02.md)
- [API observability readback](evidence/observability-readback-2026-09-02.md)
- [Compose auth/readiness readback](evidence/compose-readiness-readback-2026-09-02.md)
- [Security headers readback](evidence/security-headers-readback-2026-09-02.md)
- [Mutation idempotency readback](evidence/mutation-idempotency-readback-2026-09-02.md)
- [기존 bundle optimization readback](evidence/bundle-optimization-readback-2026-09-02.md)
- [최신 bundle optimization readback](evidence/bundle-optimization-readback-2026-09-03.md)
- [Meal plan date-review readback](evidence/date-review-readback-2026-09-03.md)
- [Grocy REST adapter](docs/grocy-adapter.md)
- [Grocy adapter contract evidence](evidence/grocy-adapter-contract-2026-09-01.md)
- [Grocy sync outbox readback](evidence/grocy-sync-readback-2026-09-02.md)
- [재고 기반 레시피 플래너](docs/recipe-planner.md)
- [식단 조건과 알레르기 회피 설계](docs/meal-preferences.md)
- [공개 레시피 importer 운영 경계](docs/recipe-importer.md)
- [공개 레시피 importer readback](evidence/recipe-importer-readback-2026-09-02.md)
- [recipe review workflow readback](evidence/recipe-review-readback-2026-09-02.md)
- [레시피 플래너 readback](evidence/recipe-planner-readback-2026-09-01.md)
- [planner v2·조리 완료 readback](evidence/recipe-planner-completion-readback-2026-09-02.md)
- [PostgreSQL meal-plan save/complete idempotency readback](evidence/postgres-meal-plan-idempotency-readback-2026-09-07.md)
- [recipe starter catalog expansion readback](evidence/recipe-catalog-expansion-readback-2026-09-03.md)
- [recipe alternatives readback](evidence/recipe-alternatives-readback-2026-09-03.md)
- [multi-day meal preview readback](evidence/multi-day-meal-preview-readback-2026-09-03.md)
- [multi-day meal bundle readback](evidence/multi-day-meal-bundle-readback-2026-09-03.md)
- [meal preferences readback](evidence/meal-preferences-readback-2026-09-03.md)
- [shopping list readback](evidence/shopping-list-readback-2026-09-03.md)

## 1차 로컬 실행

프론트엔드는 선택안의 iPhone/Pixel 모바일 런타임을 보존한 Vite 앱입니다. API 없이도 화면 fixture로 동작하며, 아래처럼 FastAPI를 함께 켜면 `VITE_API_BASE_URL`을 통해 실제 API 응답을 읽고 변경 이벤트를 전송합니다.

터미널 1 — API:

```bash
cd services/api
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

서버 재시작 후에도 로컬 재고를 유지해 보고 싶으면 API 명령에 `RESCUE_MEAL_SQLITE_PATH=../../data/rescue-meal.local.db`를 붙입니다. PostgreSQL을 준비한 뒤에는 `RESCUE_MEAL_DATABASE_URL=postgresql://...`을 사용하면 PostgreSQL projection repository를 선택합니다. Compose PostgreSQL 경로는 `RESCUE_MEAL_INVENTORY_MODE=normalized`로 workspace-scoped normalized receipt/line/lot/date/event adapter를 명시합니다. 기본 명령은 검증용 in-memory fixture를 사용합니다.

터미널 1.5 — 선택적 Grocy background worker:

```bash
cd services/api
RESCUE_MEAL_API_BASE_URL=http://127.0.0.1:8000 \
RESCUE_MEAL_GROCY_WORKER_TOKEN=server-side-worker-secret \
RESCUE_MEAL_GROCY_WORKSPACE_IDS=account-workspace-id \
uv run python scripts/run_grocy_worker.py
```

worker는 DB나 Grocy API key를 직접 사용하지 않고 API의 service-token tick endpoint만 호출합니다. 여러 workspace를 넣을 때는 comma-separated ID를 명시하고, 단발 검증은 마지막에 `--once`를 붙입니다.
`--once`에서 HTTP 오류나 HTTP 200 response body의 `error`가 하나라도 있으면 exit
code 1을 반환합니다. 장기 실행은 API 장애가 지속될 때 기본 interval에서 최대
300초까지 bounded exponential backoff를 적용하고, 정상 cycle에서 기본 주기로
돌아옵니다.

터미널 1.55 — 선택적 Web Push notification worker:

```bash
cd services/api
RESCUE_MEAL_API_BASE_URL=http://127.0.0.1:8000 \
RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN=server-side-notification-secret \
RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS=account-workspace-id \
uv run python scripts/run_notification_worker.py
```

notification worker도 DB·VAPID private key를 직접 열지 않고 API service-token tick
endpoint만 호출합니다. 사용자가 push를 켜지 않았거나 VAPID/구독이 없으면 API가
외부 발송 없이 bounded tick을 반환합니다. 외부 Push Service 수신 성공은 별도
운영 acceptance입니다.

터미널 1.6 — 선택적 제품 기준 정보 enrichment worker:

```bash
cd services/api
RESCUE_MEAL_API_BASE_URL=http://127.0.0.1:8000 \
RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKER_TOKEN=server-side-enrichment-secret \
RESCUE_MEAL_PRODUCT_ENRICHMENT_WORKSPACE_IDS=account-workspace-id \
uv run python scripts/run_product_enrichment_worker.py
```

제품정보 worker는 I1250 key를 직접 받지 않고 API tick만 호출합니다. API에 `RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS=true`와 `MFDS_API_KEY`가 설정되어야 실제 후보를 조회하며, I1250 miss 때는 제한된 Open Food Facts 상품명 fallback을 시도합니다. worker가 없어도 receipt draft·수동 review·commit은 계속 동작합니다.

터미널 0 — 실제 PaddleOCR worker:

```bash
cd services/ocr-worker
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8002
```

API에 `RESCUE_MEAL_OCR_URL=http://127.0.0.1:8002`를 지정하면 이미지 intake가 이 worker를 사용합니다. worker의 `/health`는 liveness만 확인하고, `/ready`가 PaddleOCR 모델 초기화까지 성공해야 Compose healthcheck가 통과합니다. 기본 CPU 동시 추론은 1건이며 `RESCUE_MEAL_OCR_MAX_CONCURRENCY`(1~8)와 `RESCUE_MEAL_OCR_QUEUE_TIMEOUT_SECONDS`(기본 2초)로 명시 조정할 수 있습니다. 현재 pinned PaddlePaddle Linux CPU wheel이 `x86_64` 대상이어서 Compose/Dockerfile은 worker를 `linux/amd64`로 고정합니다. Apple Silicon에서는 Docker emulation이 필요하고 production은 amd64 node 또는 별도 ARM runtime 검증이 필요합니다. worker가 꺼져 있거나 준비되지 않으면 API는 `needs_ocr_engine` 또는 `OCR worker 연결 실패`를 반환하고 임의의 상품을 만들지 않습니다. 정확도·매장 coverage·실기기 촬영은 별도 acceptance입니다.

터미널 2 — 모바일 프론트:

```bash
cd apps/web
npm ci --prefer-offline --no-audit --no-fund
VITE_DEPLOYMENT_MODE=demo VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 4173
```

브라우저에서 `http://127.0.0.1:4173/`을 열면 됩니다. 프론트 런타임 무결성은 `npm run check:runtime`, fixture/mobile runtime은 `npm run test:runtime`, native 320px shell 회귀는 `VITE_APP_SHELL=native NATIVE_RUNTIME_TEST_PORT=4481 npm run test:native`, 프론트 빌드는 `npm run build`, 백엔드 API smoke는 `cd services/api && uv run pytest`로 확인합니다. 다른 로컬 앱이 기본 fixture 포트 `4174`를 사용 중이면 `MOBILE_RUNTIME_TEST_PORT=4451 npm run test:runtime`처럼 전용 포트를 지정합니다. Playwright fixture lane은 요청 포트를 엄격히 사용하고, 다른 서버를 자동 재사용하거나 Vite가 다른 포트로 이동한 상태를 정상으로 취급하지 않습니다. 연결형 browser E2E는 `npm run test:connected` 한 번으로 disposable SQLite API와 Vite를 함께 띄워 실행합니다. PostgreSQL two-process lot 경계는 `cd services/api && RESCUE_MEAL_DATABASE_URL=... RESCUE_MEAL_AUTH_SECRET=... uv run python scripts/postgres_manual_food_lot_smoke.py`로 확인합니다. production-shaped PostgreSQL/OCR/API container와 normalized read/write/idempotency replay는 `sh infra/container-smoke.sh`로 실행하며, 이 명령은 자기 disposable Compose resources만 정리합니다. 각 Playwright lane은 서로 다른 server/config contract를 사용합니다.

운영 프론트엔드는 반드시 `VITE_DEPLOYMENT_MODE=production`과 실제 HTTPS
`VITE_API_BASE_URL`을 빌드 시 주입해야 합니다. production build에서 mode 자체가
빠져도 앱은 차단되며, production 모드에서 API 주소가
없거나 HTTP이면 앱은 데모 fixture를 실행하지 않고 설정 차단 화면을 표시합니다.
또한 API의 `RESCUE_MEAL_CORS_ORIGINS`에 실제 frontend HTTPS origin을 명시해야
하며, 허용되지 않은 origin은 데모 fixture로 조용히 전환되지 않습니다.

### 현재 API 경계

- `GET /health`, `POST /api/auth/guest`, `GET /api/dashboard`, `GET /api/dashboard/revision`, `GET /api/inventory/search?q={query}&storage_type={storage}&offset={offset}&limit={limit}` — workspace 재고 server search와 bounded page, dashboard cross-device revision marker
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — account workspace 연결·profile·token revoke
- `POST /api/account/guest-transfer/preview`, `POST /api/account/guest-transfer` — 회원가입 후 사용자가 승인한 guest 기록 복사·원본 보존·충돌/재요청 경계
- guest transfer import는 두 workspace lock 안에서 상태를 재검증하며, target write race·flush failure를 typed retry/conflict로 처리
- `POST /api/account/delete` — 현재 비밀번호·`DELETE` 확인 후 durable deletion fence를 획득하고 account workspace purge·credential 삭제; 중간 실패 `503`, 일반 요청 중 삭제 상태 `423`
- `POST /api/auth/password/change` — 로그인한 account의 현재 비밀번호 확인·새 비밀번호 저장·기존 session 즉시 무효화
- `POST /api/auth/password-reset/request` — 계정 존재 여부를 노출하지 않는 비밀번호 재설정 요청; 외부 메일 provider가 설정된 경우에만 링크를 transient delivery
- `POST /api/auth/password-reset/complete` — one-time·30분 reset token 검증, 비밀번호 교체, 기존 account session 즉시 무효화, 새 session 발급
- `/health`, `/ready` — liveness와 저장소 readiness를 분리해 확인하며, 모든 응답에 `X-Request-ID`를 포함
- `POST /api/client-errors` — 렌더링 오류의 privacy-safe grouping field 수신·structured log 기록·secure mode rate limit
- `GET /api/integrations/grocy/status` — 설정된 Grocy system info readback, 기본 disabled
- `GET /api/notifications?unread_only={bool}` — 표시 날짜·추정 우선순위·Grocy 확인 필요 작업 알림
- `GET /api/notifications/revision` — 알림 payload 없이 현재 workspace revision만 반환하며 열린 알림 센터의 cross-device refresh probe에 사용
- `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all` — 현재 workspace 알림 읽음 상태 저장
- `GET/PUT /api/notification-preferences` — 앱 내 알림, push 사용 여부, 사전 확인 기간, IANA timezone, 조용한 시간 workspace 설정
- [Notification timezone readback](evidence/notification-timezone-readback-2026-09-04.md)
- [Recipe catalog expansion readback](evidence/recipe-catalog-expansion-readback-2026-09-04.md)
- [Recipe source import UI readback](evidence/recipe-source-import-ui-readback-2026-09-04.md)
- `GET/PUT /api/push/subscriptions`, `DELETE /api/push/subscriptions/{endpoint_fingerprint}` — HTTPS Web Push subscription 저장·fingerprint summary·해지
- `GET /api/integrations/grocy/worker/status` — 현재 workspace의 worker heartbeat readback
- `GET /api/integrations/notifications/worker/status` — 현재 workspace notification delivery worker heartbeat readback
- `GET /api/integrations/product-enrichment/worker/status` — 현재 workspace I1250 product enrichment worker heartbeat readback
- `GET /api/internal/product-runtime/status` — product enrichment worker token으로 현재 API worker의 safe provider/cache/single-flight aggregate readback
- `GET /api/internal/product-runtime/metrics` — 같은 token으로 scrape하는 Prometheus text metrics; barcode·상품명·secret label 없음
- `GET /api/internal/notifications/metrics` — notification worker token으로 scrape하는 safe delivery/cancellation Prometheus metrics; workspace·notification·endpoint identity 없음
- `GET /api/internal/metrics` — observability Bearer token으로 HTTP route/status/latency와 product·notification runtime metrics를 한 번에 scrape; query·token·workspace·payload는 label에 포함하지 않음
- [Provider runtime observability readback](evidence/provider-runtime-observability-readback-2026-09-04.md)
- `POST /api/internal/notifications/workspaces/{workspace_id}/tick` — service token으로 호출하는 workspace별 Web Push delivery tick
- `POST /api/internal/product-enrichment/workspaces/{workspace_id}/tick` — service token으로 호출하는 workspace별 I1250 product enrichment tick
- `POST /api/internal/grocy/workspaces/{workspace_id}/tick` — service token으로 호출하는 workspace별 자동 동기화 tick
- `GET /api/integrations/grocy/mappings?q={상품명}`, `PUT /api/integrations/grocy/mappings/{canonical_name}` — canonical 상품과 Grocy product ID mapping·변경 주체 readback
- `GET /api/integrations/grocy/mappings/{canonical_name}/events?limit={n}` — 상품 mapping `before → after` 변경 이력 readback
- `GET /api/integrations/grocy/location-mappings`, `PUT /api/integrations/grocy/location-mappings/{storage_type}` — 실온·냉장·냉동과 Grocy location ID mapping
- `GET /api/integrations/grocy/outbox`, `POST /api/integrations/grocy/outbox/process`, `POST /api/integrations/grocy/outbox/{id}/retry` — receipt/storage event 외부 stock sync outbox·retry·dead-letter 복구
- `POST /api/integrations/grocy/outbox/reconciliation-scan`, `POST /api/integrations/grocy/outbox/{id}/reconcile` — stale in-flight 외부 반영 여부 확인·명시적 판정
- `GET /api/integrations/recipes/cookrcp/status` — 식품안전나라 COOKRCP01 importer 설정 상태만 확인, 외부 호출 없음
- [Open Food Facts v3.6 readback](evidence/open-food-facts-v36-readback-2026-09-04.md)
- [Open Food Facts name fallback readback](evidence/open-food-facts-name-fallback-readback-2026-09-05.md)
- `POST /api/recipe-review/drafts/import` — `recipe_admin` account로 COOKRCP01 pending draft 저장
- `GET /api/recipe-review/capabilities` — 현재 actor의 review/publisher capability와 policy 종류를 allowlist 원문 없이 반환
- `GET/PATCH /api/recipe-review/drafts`, `GET .../drafts?status=pending&assignment=all\|mine\|unassigned`, `POST /api/recipe-review/drafts/{id}/claim|release|approve|reject`, `GET .../{id}/events` — canonical 재료 검토·RBAC·명시적 draft ownership lease·전체/내 작업/미배정 queue·reviewer/publisher capability·actor audit·승인 gate
- production에서는 `RESCUE_MEAL_RECIPE_REVIEW_TOKEN`이 설정되면 preflight·`/ready`·runtime review guard가 fail-closed로 중단하고, 개별 `recipe_admin` account 사용을 요구함
- `GET /api/products/by-barcode/{barcode}` — 현재는 fixture 상품 후보만 제공
- `GET /api/products/resolve/{barcode}` — local fixture 우선, 외부 lookup flag 시 식품안전나라 C005와 Open Food Facts 후보를 provenance·보관 힌트·provider 상태와 함께 조회; 제품 기준 기간은 개별 팩 날짜로 확정하지 않음
- `GET /api/products/resolve-name/{product_name}` — 외부 lookup flag가 켜지면 MFDS key가 있는 경우 I1250 제품명·제조사·품목유형·제품 기준 기간 후보를 우선 조회하고, key가 없거나 I1250 miss이면 Open Food Facts 상품명 후보를 review용으로 fallback 조회
- `GET /api/receipts/{receipt_id}` — workspace의 receipt draft와 최신 매칭 후보 readback
- `POST /api/receipts/{receipt_id}/product-enrichment` — receipt draft의 제품 기준 정보 enrichment job을 idempotent하게 enqueue
- `GET /api/receipts/{receipt_id}/product-enrichment`, `POST .../product-enrichment/retry` — job 상태 확인·dead-letter 재시도
- `GET /api/product-aliases?q={상품명}` — 현재 workspace에서 영수증 review 중 사용자가 확인한 상품명 별칭 readback
- `POST /api/barcodes/parse` — 일반 GTIN·가변중량·GS1 날짜 AI 분기
- `POST /api/inference/priority` — 날짜가 없을 때 먼저 확인할 순위 범위 추론; 기본 rules, optional `RESCUE_MEAL_INFERENCE_PROVIDER=ollama`는 규칙 미매칭만 private model review로 보강
- `POST /api/foods` — `lot_action=create|correct`를 받는 직접 입력·라벨 보정; 같은 상품명도 새 inventory lot으로 만들며, 라벨·GS1 보정은 `correct + target_food_id`로 특정 lot을 선택하고 trusted 날짜·상품 정보 이력을 보존; `Idempotency-Key`로 같은 명령 replay·payload conflict·소비 후 재생성 차단
- `PATCH /api/foods/{food_id}/date-assertion` — 추정 날짜를 사용자가 확인한 날짜로 확정
- `POST /api/receipts/intake` — 이미지 또는 PDF(text-layer 추출·bounded scan-page render) 업로드와 OCR/parser engine 상태 확인
- `POST /api/labels/intake` — 라벨 이미지 업로드와 OCR engine 상태 확인
- `POST /api/receipts/parse-text` — OCR text fixture를 review draft로 구조화
- `POST /api/labels/parse-text` — OCR text fixture를 날짜 후보로 구조화
- `POST /api/receipts/drafts` — OCR 결과를 받는 staging 계약
- `GET /api/receipts` — 현재 workspace의 receipt 상태·구매일·상품 수·원본 비식별화 상태 summary
- `GET /api/receipts/revision` — receipt summary payload 없이 현재 workspace revision만 반환하며 검수 대기 queue의 cross-device refresh probe에 사용
- `GET /api/privacy/receipt-policy` — 원본 업로드·draft metadata·commit receipt의 보존/삭제 정책
- `POST /api/receipts/{receipt_id}/privacy-erase` — `confirm: true`로 미반영 draft 삭제 또는 commit receipt의 파일명·OCR 원문 비식별화
- `GET /api/account/export` — 현재 workspace의 재고·상품 provenance 변경 이력·구매 summary·보관 event·식단·알림 설정 export (secret·OCR 원문·파일명·push endpoint 제외)
- `GET/POST /api/storage-locations` 및 `PATCH/DELETE /api/storage-locations/{id}` — canonical 보관 분류를 유지하는 사용자 정의 보관 위치 조회·관리
- `GET /api/storage-locations/revision` — 위치 목록을 노출하지 않는 workspace revision marker; 계정 위치 관리자의 cross-device refresh probe에 사용
- `GET /api/inventory/search` — 상품명·브랜드·분류와 canonical `storage_type`, 사용자 정의 `storage_location_id`를 조합한 bounded 재고 검색
- `POST /api/receipts/{receipt_id}/commit` — 검토된 항목만 lot 후보로 반영
- receipt commit의 retryable persistence failure는 동일 Idempotency-Key와 고정 draft payload로 global `다시 시도`를 제공하며, duplicate/workspace conflict는 최신 상태 확인으로 분리
- `GET /api/commit-transactions` — commit·reconciliation 상태 조회
- `POST /api/foods/{food_id}/storage-events` — 이동·개봉·냉동·해동·소비·폐기 이벤트와 Grocy sync 상태; `Idempotency-Key` 사용 시 동일 요청 재생
- `POST /api/foods/{food_id}/storage-event-sequence` — 하나의 사용자 의도에서 함께 발생한 1~2개 local storage event를 순차 child-lot target과 단일 outer flush로 확정; `Idempotency-Key` 필수
- `GET /api/foods/{food_id}/storage-events` — 해당 lot의 최근 보관·소비·폐기 이력 readback
- `GET /api/foods/{food_id}/product-provenance/events` — 상품 source 적용·교체·제거의 workspace-scoped before/after audit readback
- `DELETE /api/foods/{food_id}/product-provenance` — 현재 상품 source만 제거하고 이전 provenance는 audit history로 보존
- `GET /api/foods/{food_id}/product-info/events` — 상품명·브랜드·분류 수정의 workspace-scoped before/after audit readback
- `PATCH /api/foods/{food_id}/product-info` — 사용자가 확인한 상품 프로필을 수정하고 기존 product provenance를 제거; 수량·보관 상태·표시 날짜는 변경하지 않음
- `POST /api/meal-plans/preview` — 저장하지 않는 결정론적 식단 미리보기
- `POST /api/meal-plans/options` — 현재 재료·조리 시간 기준으로 최대 3개의 서로 다른 preview 후보 반환; 저장하지 않음
- `POST /api/meal-plans/multi-day-preview` — 이전 날짜 allocation을 고려한 최대 3일 preview; 저장하지 않음
- `POST /api/meal-plans/multi-day` — 사용자가 승인한 3일 plan bundle 저장; `bundle_id`·`snapshot_hash`로 재시도 idempotency/충돌 검증
- `GET /api/meal-plans/multi-day/latest` — 현재 workspace의 최신 저장 3일 bundle
- `GET /api/meal-plans/multi-day/history` — 현재 workspace의 저장 3일 bundle history
- `GET /api/meal-plans/revision` — 식단 payload 없이 현재 workspace revision만 반환하며 열린 planner의 cross-device probe에 사용
- `POST /api/meal-plans` — 식단 계산 및 workspace 영속 저장; `plan_id` 재시도는 plan별 lock·snapshot 검증·PostgreSQL revision replay로 멱등 처리하고 `bundle_id`·`bundle_day_index`가 있으면 3일 bundle 날짜 연결도 보정
- `GET /api/meal-plans/latest` — 현재 workspace의 마지막 저장 식단
- `POST /api/meal-plans/{plan_id}/complete` — 사용자 확인 후 matched lot 소비 기록 및 식단 완료 처리; 동시 완료는 한 번만 소비하고 다른 요청은 `already_completed`로 반환
- `GET /api/meal-plans/{plan_id}/events` — 식단 snapshot 저장·완료 audit event 조회
- `GET /api/meal-plans/history` — 현재 workspace의 최근 저장 식단 목록
- `GET /api/shopping-list` — 현재 workspace 장보기 목록; 연결 원천의 재고 상태를 읽을 때 자동 재정리
- `GET /api/shopping-list/revision` — 장보기 payload 없이 현재 workspace revision만 반환하며 열린 ShoppingListSheet의 cross-device refresh probe에 사용
- `POST /api/shopping-list` — 저장된 단일 식단 또는 3일 bundle의 부족 재료를 명시적으로 목록에 추가/동기화
- `POST /api/shopping-list/manual` — 식단과 무관한 상품을 직접 추가; 같은 상품명·단위의 manual 기여를 멱등 갱신
- `POST /api/shopping-list/{item_id}/receive` — 구매 수량·보관 위치를 확인해 기존 lot을 보존한 새 inventory lot 생성; recipe source 자동 정리·manual checked history·Idempotency-Key replay
- `PATCH /api/shopping-list/{item_id}` — 장보기 항목 체크 상태 변경
- `DELETE /api/shopping-list/{item_id}` — 장보기 항목 삭제

기본 API 저장소는 검증용 in-memory이며, `RESCUE_MEAL_SQLITE_PATH`를 지정하면 local durable repository로 전환되고, `RESCUE_MEAL_DATABASE_URL`을 지정하면 PostgreSQL projection repository를 선택합니다. 현재 receipt/storage/meal consume은 InventoryRepository seam과 compatibility projection을 사용하며, `RESCUE_MEAL_INVENTORY_MODE=normalized`에서는 추가된 workspace-scoped normalized adapter와 dual-write/read합니다. PostgreSQL durable workspace store는 request/worker lease와 `RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE` 기반 유휴 snapshot LRU close를 사용하고, workspace operation은 `RESCUE_MEAL_POSTGRES_POOL_*` 설정의 operation-scoped pool에서 bounded checkout합니다. FastAPI lifespan에서 router/pool/auth/Grocy 리소스를 닫고, base/auth/shared direct owner는 `RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS` 범위에서 연결을 재수립하되 실패한 query/commit은 replay하지 않습니다. disposable PostgreSQL migration·normalized read/write/restart·backup/빈 DB restore·connection lifecycle·operation pool·backend termination recovery와 disposable Grocy add/open/consume/transfer는 확인했지만, 운영 PostgreSQL/Grocy backup object encryption/retention·shared owner pool 통합·다중 process aggregate sizing·managed failover·crash recovery·undo는 아직 production 검증 전입니다. CI web job은 demo build와 별도로 HTTPS placeholder를 사용한 production frontend build도 검사하지만, 실제 API/TLS/CORS 도달성은 staging acceptance입니다. 상세 구현 상태와 검증 결과는 [1차 구현 상태](docs/build-status-2026-09-01.md)에 기록했습니다.

OCR intake의 상태·parser 규칙·실패 경계는 [OCR intake pipeline](docs/ocr-pipeline.md)에 기록했습니다. 레시피 매칭·미리보기·저장·재조회 계약은 [재고 기반 레시피 플래너](docs/recipe-planner.md)에, 외부 레시피 draft·검토·승인 계약은 [공개 레시피 importer 운영 경계](docs/recipe-importer.md)에 기록했습니다.
