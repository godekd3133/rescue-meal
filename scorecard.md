# Rescue Meal Scorecard

승인 상태: Director 승인 완료 (2026-09-02)

이 scorecard는 수업용 화면을 넘어 실제 사용 가능한 상용앱 수준으로 고도화할 때의 판단 기준 초안입니다. 각 항목은 20점 만점이며, 전체 100점입니다.

## Alignment /20

- 사용자의 실제 일상 문제를 해결하는가
- 영수증·바코드·라벨 → review → inventory → rescue meal 핵심 흐름을 유지하는가
- 소비기한을 추정값으로 오인시키지 않는가

## Accuracy and safety /20

- OCR 원문·후보·사용자 확인값·출처가 분리되는가
- 표시 날짜와 추정 소비 우선순위가 분리되는가
- 보관 방식·개봉·부분 수량이 계산과 UI에 반영되는가
- 정보 부족 시 abstain하고 `safe_to_eat`를 만들지 않는가

## Product UX /20

- 사용자가 다음 행동을 즉시 이해할 수 있는가
- 애매한 결과를 수정할 수 있고 잘못된 입력을 반영 전에 막는가
- 모바일 키보드·스크롤·접근성·오류 복구 흐름이 자연스러운가

## Reliability and data integrity /20

- workspace isolation, lot identity, quantity conservation, idempotency가 보장되는가
- 인증 만료·네트워크 실패·동시 변경·외부 동기화 실패를 구분하는가
- API/UI/build/E2E evidence가 실제 계약을 검증하는가

## Production readiness /20

- PostgreSQL/Grocy 실제 readback과 migration이 가능한가
- 관측성·readiness·보안·개인정보 보존/삭제 정책이 있는가
- camera/device, account recovery, notification delivery, performance, deployment가 검증됐는가

## Scoring rule

- 18~20: 현재 증거로 상용 운영 판단 가능
- 14~17: 동작하지만 운영 전 보강 필요
- 10~13: prototype 수준, 중요한 증거 누락
- 0~9: 요구사항 또는 안전 경계 미충족

## Latest implementation readback — 2026-09-06

- 최종 회귀 수치는 API **369 passed**, frontend TypeScript/Vite build passed, service-worker contract **5 passed**, fixture·mobile runtime Playwright **34 passed**, disposable SQLite API를 포함한 connected Playwright E2E **65 passed**, Sites worker test **4 passed**이며, `git diff --check` passed입니다. 기존 표의 누적 기능 목록은 이 최신 readback과 함께 해석합니다.
- 다일 식단 후보를 기존 deterministic matcher에서 materialize하고 OR-Tools CP-SAT로 최대 3일에 배치했습니다. recipe 중복과 shared lot capacity 초과를 차단하고, solver 복구 시 `deterministic-greedy` provenance를 반환합니다.
- 다일 planner와 단일 식단에 명시적 `servings`를 연결해 1인분 기준량·lot allocation·부족 재료·CP-SAT capacity·저장 snapshot을 같은 값으로 계산합니다. 현재 UI는 1~4인분, API는 1~8인분을 지원합니다. 상세 결과는 [servings readback](evidence/servings-readback-2026-09-05.md)입니다.
- 저장된 2인분 식단을 장보기 목록으로 재동기화할 때도 `plan.servings`를 보존해 부분 부족량과 전체 부족량을 구분하는 API 회귀를 추가했습니다. 시금치 1팩 부족과 두부 2모 부족이 정확히 materialize되는 것을 확인했습니다.
- 장보기 입고 확인을 구매 수량·보관 위치 선택 → 기존 lot을 보존한 새 inventory lot 생성 → recipe/multi-day source 재동기화 → manual checked history 보존 순서로 연결했습니다. `purchased_at`은 기록하지만 실제 소비기한은 `unknown`으로 두고, 상품명·보관 위치 기반 AI 값은 소비 우선순위 참고값으로만 표시합니다. 동일 `Idempotency-Key` replay와 payload 변경 `409`를 API에서, 수량·냉동 선택·source 정리를 connected E2E에서 확인했습니다.
- 장보기 입고에는 lot과 분리된 durable operation ledger를 추가했습니다. SQLite/PostgreSQL reconstruction·migration 019·export fingerprint·guest transfer field/preview count를 연결하고, disposable PostgreSQL에서 lot 전량 소비 → API restart → 동일 key 재시도 시 lot 재생성 없이 `409`가 되는 것과, 두 API process의 동일 key 최초 동시 write에서 한쪽이 동일 lot을 `201 + idempotency_replayed=true`로 회복하는 것을 확인했습니다. 같은 key의 다른 수량(`1 vs 2`) 경합도 `201 + 409`로 차단하는 재현 가능한 두-process HTTP smoke를 통과했으며, 같은 workspace에서 독립 item을 5라운드 반복하는 bounded stress와 6개 operation의 재시작 후 재생성 차단도 통과했습니다. revision lock 중 API process를 강제 종료하는 crash-before-commit smoke에서 rollback·다른 process의 최초 retry·재시작 replay를 확인했고, commit 직후 응답 전 process 종료를 재현한 post-commit smoke에서도 다른 process와 재시작 process의 동일 lot replay를 확인했습니다. 실제 reverse proxy response reset·장시간 churn·rolling deploy·failover는 별도 gate입니다 ([multi-process receive readback](evidence/postgres-multiprocess-receive-readback-2026-09-05.md), [crash recovery readback](evidence/postgres-crash-recovery-readback-2026-09-05.md), [post-commit crash readback](evidence/postgres-post-commit-crash-readback-2026-09-05.md)).
- 프론트 build는 local filesystem mirror에서 protected runtime integrity 28개·TypeScript·Vite 757 modules·Sites output·Sites worker test 4개를 통과했습니다. 원래 OneDrive 작업트리의 `Keyboard.png` 직접 read timeout은 source/build 실패와 분리해 기록했습니다. 상세 결과는 [frontend build readback](evidence/frontend-build-readback-2026-09-05.md)와 [PWA update/cache readback](evidence/pwa-update-cache-readback-2026-09-06.md)입니다.
- 입고 endpoint는 구매 수량과 사용자가 고른 보관 상태를 기록하지만 소비기한·`safe_to_eat`를 자동 확정하지 않습니다. nutrition·budget·상품별 포장 단위와 live PostgreSQL/Grocy는 미검증입니다. 상세 결과는 [multi-day optimizer readback](evidence/multi-day-optimizer-readback-2026-09-05.md)과 [servings readback](evidence/servings-readback-2026-09-05.md)입니다.
- account deletion은 auth row를 `active → deleting`으로 먼저 고정하고, workspace write guard·일반 요청 `423`·failure `503`·같은 session delete 재시도를 연결했습니다. SQLite restart·API failure injection·schema/readiness contract와 API **369 passed**를 확인했으며, disposable PostgreSQL 두 process의 fence 대기·`423` 차단·purge·기존 token `401`도 실제 readback했습니다. 상세 결과는 [account deletion fence readback](evidence/account-deletion-fence-readback-2026-09-06.md)와 [PostgreSQL multi-process account deletion readback](evidence/postgres-account-deletion-multiprocess-readback-2026-09-06.md)입니다. backup/WAL/object storage/Grocy 삭제는 아직 운영 acceptance입니다.
- account deletion crash recovery는 revision lock에서 대기 중인 API process SIGKILL을 주입해 workspace transaction rollback과 durable `deleting` fence 유지를 확인하고, 재시작한 API의 같은 session delete resume, 기존 token/login `401`, 관련 PostgreSQL scoped rows `0`을 실제 readback했습니다 ([crash-recovery readback](evidence/postgres-account-deletion-crash-recovery-readback-2026-09-06.md)). reverse proxy reset·rolling deploy·managed failover·backup/WAL/object storage/Grocy 삭제는 아직 운영 acceptance입니다.

## Previous self-review — 2026-09-05

| 영역 | 점수 | 근거와 남은 위험 |
| --- | ---: | --- |
| Alignment | 19/20 | 영수증·보관·날짜·Rescue Meal 핵심 흐름이 실제 UI/API에 연결됨 |
| Accuracy and safety | 16/20 | 표시 날짜와 추정 우선순위 분리, abstain과 사용자 확인 gate, OCR 전 blurred image focus warning, known recipe allergen filter와 unknown metadata abstain은 검증됨; 외부 recipe별 metadata·교차 접촉·관할 rule 승격은 미완료 |
| Product UX | 19/20 | receipt correction, 업로드 원본 대조 preview와 상품 line·라벨 날짜 후보 선택→safe bbox 강조 overlay, 표시 날짜 수정 후 확인 반영, storage picker, 구매 출처·상품 후보 source/provenance 표시, receipt 후보 commit 및 stale 후보 제거, 첫 개봉일·시각 표시, 알림 timezone 선택·quiet-hours 기준 표시, auth CTA, I1250 백그라운드 후보 polling·사용자 적용, I1250 miss 뒤 Open Food Facts 후보 표시·경고·적용, 날짜 의미 보존, 라벨 상품명·보관 힌트·포장일 후보 보존, 포장지 보관조건과 실제 위치 불일치 경고·storage_mismatch 알림, AI 추론 근거·추론 불가 확인 필요 상태, GS1 날짜 후보 확인 후 저장, provider 장애·한도 초과 사용자 안내, guest 기록 transfer preview/import·skip/reload 재확인과 알림 설정 전달, password change 429 안내, 계정 삭제 confirmation gate, reduced-motion을 포함한 CSS card/toast animation, 카메라 guide crop과 crop 실패 fallback, 53개 recipe catalog의 alternatives·3일 preview·bundle 저장·history 재열기·같은 조건 재진입 복원·날짜별 선택·선택 후보 단일 plan 저장·bundle 날짜 progress·부족 재료 장보기 목록 체크/삭제/자동 정리·직접 추가·홈 장보기 큐 진입·구매 수량/보관 위치 입고 확인·재고 반영·재시도·체크/삭제, 알레르기 조건 chip 저장/재계산, source status·bounded filter·pending import를 포함한 recipe review UI, 상품명·브랜드·분류 직접 수정과 상품 정보 변경 이력, 영수증 GTIN 표시·사용자 선택 후보 조회·적용, `단위 환산`·`단위 확인 필요` 근거 표시, 모바일 키보드, named dialog semantics·Escape 종료·원래 trigger 포커스 복귀와 fixture/mobile runtime 34개·connected E2E 62개가 검증됨; 실제 매장 annotation 기반 bbox 정확도·실기기 camera/VoiceOver/TalkBack 검증과 protected barrel dynamic import warning은 남음 |
| Reliability and data integrity | 19/20 | 360 API tests, workspace/lot/CORS/idempotency·guest transfer snapshot fingerprint/conflict/idempotent replay·password-change/account-delete account/IP rate limit·persistent auth rate-limit event·product provider status/cache·Open Food Facts v3.6 live readback·I1250/Open Food Facts name fallback source/provenance/no-date boundary·SQLite shared product cache/rate-limit/single-flight cross-connection contract·I1250 shared name cache/rate-limit/single-flight PostgreSQL readback·privacy-safe provider runtime metrics/status/Prometheus scrape·provider runtime production preflight settings gate·receipt alias persistence·I1250 endpoint·product enrichment worker·inference trace·첫 개봉일 full/partial/repeat invariant·child creation event history·date-review allocation warning·disabled queue observability·PostgreSQL schema readiness·ordered 001→020 migration runner·migration ledger/checksum drift guard·`search_text`/`pg_trgm`/workspace-storage index·receipt/label review observation ID contract·receipt candidate lot provenance·stale candidate 제거·product provenance before/after audit·상품 프로필 correction before/after audit·날짜 보관조건 persistence·실제 위치 불일치 warning·storage_mismatch 알림·workspace export/guest transfer audit 보존·normalized persistence/readback·disposable PostgreSQL restart readback·account auth restart/password rotation/purge readback·auth/workspace/readiness read transaction cleanup·상품 후보 provenance JSONB/restart readback·상품명 수정 후 수량/보관/DateAssertion 보존·disposable Grocy add/open/consume/transfer·transaction ID/location readback·custom backup/빈 DB restore·client/server major guard·두 connection 동시 flush 1 commit/1 stale conflict readback·notification timezone/date-boundary/quiet-hours·planner timezone consistency contract·53개 curated recipe catalog exact-match/regression·source import bounded-range validation·API image tzdata/ZoneInfo runtime readback·missing-index fail-closed·workspace-scoped database page·row-lock lease/workspace refresh·EXIF orientation input normalization·account workspace purge·credential/session invalidation·multi-day preview side-effect-free·bundle 저장/재시도/latest/history·선택 recipe_id 재검증·다일 후보 단일 저장·linked day progress 및 이중 소비 방지·기존 plan 재시도 시 bundle day 연결 보정·shopping source 기여량/중복 방지·manual source 보존/absolute upsert·입고 새 lot 보존·recipe source 동시 정리·manual checked history·receive idempotency replay/conflict·MealPreferences persistence/export/transfer·workspace snapshot lease/유휴 LRU eviction·active lease 동시 purge 차단·FastAPI lifespan close·workspace cache/pool settings preflight·operation pool fake contract·aggregate connection budget preflight·disposable operation pool exhaustion/persistence/shutdown·receipt GTIN line/lot parity·planner quantity_match/unit alias/incompatible-unit guard·password reset provider URL safety/transient retry/per-token idempotency key readback·controlled sheet focus lifecycle readback 통과; 운영 PostgreSQL/Grocy와 provider encryption/retention·shared owner pool 통합·rolling deploy churn·pool/failover는 미검증 |
| Production readiness | 15/20 | local SQLite preview, disposable PostgreSQL normalized readback와 custom backup/빈 DB restore, disposable Grocy add/open/consume/transfer readback, receipt metadata privacy lifecycle, account deletion core purge, notification preference·browser permission·subscription/native unsubscribe·VAPID delivery worker core, workspace data export, account session rotation·password reset core·provider bounded retry/idempotency adapter·privacy-safe client error grouping 경계까지 준비됨; 실제 external browser push 수신, email provider delivery/deduplication/bounce, 운영 PostgreSQL/Grocy object storage lifecycle·backup encryption/retention·external telemetry collector, deployment는 미완료 |
| **합계** | **86/100** | 상용앱 vertical slice로는 진행됐지만 외부 전달·인프라 release gate는 아직 통과하지 않음 |

이 평가는 승인된 기준에 따른 현재 증거 기반 자가평가이며, 출시 준비도를 과장하지 않습니다. 다음 우선순위는 Production Readiness의 운영 backup object policy·failover·Grocy/provider delivery와 실제 password-reset email·알림 전달·실기기 검증입니다.

추가 검증: 빈 account workspace·빈 보관 위치 필터가 첫 식품 추가/전체 목록 복귀 CTA로 이어지고, 홈 날짜와 식단 보조 문구가 고정 fixture가 아닌 현재 상태에서 생성되는 것을 [home empty-state readback](evidence/home-empty-state-readback-2026-09-03.md)로 확인했습니다. 지난 표시 날짜·unknown lot의 홈/상세 확인 안내는 [home date-review readback](evidence/home-date-review-readback-2026-09-03.md)로 확인했습니다. 점수는 외부 인프라·실기기 미검증 범위가 그대로이므로 86/100을 유지합니다.

추가 보관조건 검증: 라벨의 `applicable_storage_type`·`storage_condition_text`를 lot에 저장하고 실제 위치가 달라졌을 때 상세·planner·`storage_mismatch` 알림으로 확인을 유도하되 날짜·안전 판정을 바꾸지 않는 흐름을 API·SQLite·normalized PostgreSQL·connected UI에서 확인했습니다. 상세 결과는 [상품 provenance·상품 프로필 correction·보관조건 readback](evidence/product-provenance-readback-2026-09-04.md)에 기록했습니다.

추가 UX 검증: 상품명·브랜드·카테고리 검색과 0건 결과의 검색 조건 초기화는 [inventory search readback](evidence/inventory-search-readback-2026-09-03.md)에서 확인했습니다. 연결 모드에서는 workspace-scoped server bounded page·`더 보기`를 사용하고, demo/오프라인만 dashboard payload local fallback을 사용합니다. 대규모 재고의 `search_text`·`pg_trgm`·workspace/storage index와 readiness gate는 [PostgreSQL search readback](evidence/postgres-search-readback-2026-09-03.md)에서 확인했으며, live `EXPLAIN`·latency·cursor pagination은 Production Readiness 확장 항목입니다.

추가 UX 검증: 영수증 파일 선택 후 review에서 업로드 원본을 `blob:` preview로 대조하고, 원본 파일을 재고 기록에 저장하지 않는다는 안내를 확인했습니다. [receipt source preview readback](evidence/receipt-source-preview-readback-2026-09-03.md)에 기록했습니다.

추가 UX 검증: 영수증·라벨 `CameraCapture`의 후면 카메라 요청·프레이밍 surface·권한 거부 사진 fallback, mock video frame의 JPEG 변환→기존 receipt intake 전달, `object-fit: cover` guide rectangle의 intrinsic pixel crop을 확인했습니다. 실제 iOS/Android 권한·렌즈·원근·반사·촬영 품질은 여전히 Production Readiness gate이며 [capture input readback](evidence/capture-input-readback-2026-09-03.md)와 [camera guide crop readback](evidence/camera-guide-crop-readback-2026-09-05.md)에 기록했습니다.

추가 parser fixture 검증 (2026-09-05): 비식별화한 마트·음료/주류·식당 영수증 fixture와 콤마 없는 금액행 regression을 추가하고 API 전체 **301개 테스트**를 통과했습니다. 원본 영수증 이미지는 fixture로 저장하지 않았으며, OCR 인식률 증거로 확장하지 않았습니다 ([receipt fixture readback](evidence/receipt-fixture-readback-2026-09-05.md)).

추가 OCR 입력 품질 검증 (2026-09-05): 저대비·저조도에만 dimension-preserving `low_contrast_enhanced` profile을 적용하고, blur-only 입력은 source bytes/profile을 유지하는 unit/API readback을 추가했습니다. 전체 API **306개**와 OCR worker **2개**가 통과했습니다. 원근·반사·UVDoc 자동 보정과 실제 accuracy uplift는 원본 bbox 역변환·매장 annotation 전까지 미검증이므로 점수는 86/100을 유지합니다 ([OCR preprocessing readback](evidence/ocr-preprocessing-readback-2026-09-05.md)).

추가 라벨 fixture 검증 (2026-09-05): 실제 제공 라벨 구조를 비식별화해 포장일/유효일 인접 ambiguity와 날짜 없는 가공식품을 고정했고, 소비기한 자동 승격 없이 일반 EAN·보관 hint만 보존하는 parser readback을 통과했습니다 ([sanitized label fixture readback](evidence/label-fixture-readback-2026-09-05.md)).

추가 운영 검증: frontend production build에서 `VITE_DEPLOYMENT_MODE`를 생략하거나 API 설정이 잘못되면 demo fixture를 렌더링하지 않는 fail-closed guard를 새 preview origin에서 확인했습니다. CI의 일반 web build는 의도를 명확히 하기 위해 `VITE_DEPLOYMENT_MODE=demo`를 명시하며, 실제 HTTPS API·TLS/CORS·실기기 검증은 Production Readiness 점수에 아직 포함되지 않습니다. 상세 결과는 [frontend runtime config readback](evidence/frontend-runtime-config-readback-2026-09-03.md)에 기록했습니다.

추가 안정성 검증: `Prototype` 렌더링 예외를 의도적으로 발생시키는 test-only route에서 `RuntimeErrorBoundary`의 복구 화면·redaction·reload CTA를 확인했습니다. 외부 오류 collector 연결, 설치형 PWA crash/reload, 서비스 워커 업데이트 장애는 여전히 운영 후속 범위이며 점수는 86/100을 유지합니다. 상세 결과는 [runtime error boundary readback](evidence/runtime-error-boundary-readback-2026-09-03.md)에 기록했습니다.

추가 운영 안정성 검증: Error Boundary가 exception 원문·stack 없이 제한된 grouping field만 client-error API로 best-effort 전송하고, API가 raw field를 거부하며 secure mode rate limit과 JSON log grouping을 적용하는 것을 확인했습니다. 실제 Sentry/OpenTelemetry collector·source map scrub·retention·alert와 production origin delivery는 미완료이므로 점수는 86/100을 유지합니다. 상세 결과는 [client error telemetry readback](evidence/client-error-telemetry-readback-2026-09-03.md)에 기록했습니다.

추가 입력 경로 검증: 텍스트 레이어가 있는 전자 영수증 PDF를 `pypdf`로, 스캔 PDF를 제한된 `pypdfium2` page render 후 OCR adapter로 기존 receipt parser와 review UI에 연결하고, 암호화·손상·renderer/OCR engine 부재 PDF는 상품 추정 없이 중단하는 API/connected/demo readback을 확인했습니다. PDF layout/table·page-aware bbox와 실제 온라인몰 PDF template coverage는 아직 후속 범위이므로 점수는 86/100을 유지합니다. 상세 결과는 [PDF receipt readback](evidence/pdf-receipt-readback-2026-09-03.md)에 기록했습니다.

추가 receipt layout 검증: 바코드/매장 코드행 뒤 금액행 연결, 괄호 단위(`병`)·count unit(`팩`) 보존, 영수증 형식 profile(`template_id`·confidence)과 식당 inventory 차단을 parser/API/UI 계약으로 확인했습니다. 매장별 merchant/template coverage와 실제 OCR annotation은 후속이므로 점수는 86/100을 유지합니다. 상세 결과는 [receipt layout readback](evidence/receipt-layout-readback-2026-09-03.md)에 기록했습니다.

추가 storage lifecycle 검증: `opened` event의 최초 `occurred_at`을 lot `opened_at`으로 저장하고, 부분 개봉 child 분리·반복 개봉 불변·구매일과 다른 개봉일 기준 inference·SQLite/normalized PostgreSQL persistence·상세 UI 표시를 확인했습니다. disposable PostgreSQL apply/readback·API restart 복원·Idempotency-Key replay까지 [opened lifecycle readback](evidence/opened-lifecycle-readback-2026-09-04.md)와 [live PostgreSQL opened_at readback](evidence/live-postgres-opened-at-readback-2026-09-04.md)에서 확인했으며, 운영 PostgreSQL backup/restore·Grocy·다중 process race·실기기 검증은 남아 있어 점수는 86/100을 유지합니다.

추가 OCR 안정성 검증: 로컬 PaddleOCR와 원격 worker의 이미지 바깥·비유한·빈 bbox를 API 공통 review 좌표 계약에서 clip 또는 `null`로 제한하고, API 전체 280개·prototype runtime 24개·connected E2E 48개를 통과했습니다. 실제 매장 annotation 기반 위치 정확도와 실기기 촬영 품질은 여전히 운영 gate이므로 점수는 86/100을 유지합니다. 상세 결과는 [OCR bbox boundary readback](evidence/ocr-bbox-boundary-readback-2026-09-04.md)에 기록했습니다.

추가 local AI provider 검증: 기본 rules provider를 보존한 채 규칙 미매칭 priority 요청에만 optional Ollama structured output fallback을 연결하고, Pydantic schema 재검증·bounded timeout/response·confidence cap·abstain·opened_at 기준일·frontend review-only 표시를 확인했습니다. API 315개·connected E2E 49개와 프론트 타입 검사를 통과했지만 실제 Ollama model 및 domain annotation 정확도는 검증 전이므로 점수는 86/100을 유지합니다. 상세 결과는 [local AI inference readback](evidence/local-ai-inference-readback-2026-09-05.md)에 기록했습니다.

추가 live PostgreSQL 검증: 기존 disposable readback에서 migration 001→017·checksum skip, normalized `/ready`·API write/search, custom backup·빈 DB restore, two-connection stale conflict, workspace lifecycle, operation pool timeout·shutdown을 통과했고, 최신 별도 disposable에서는 migration 001→018·18개 checksum skip·receipt line/lot GTIN parity·`/ready`·C005 source check를 추가 확인했습니다. 운영 object-storage encryption/retention·managed failover·network partition은 여전히 별도 gate이므로 점수는 86/100을 유지합니다. 상세 결과는 [PostgreSQL live readback](evidence/postgres-live-readback-2026-09-05.md)과 [receipt GTIN readback](evidence/receipt-gtin-readback-2026-09-05.md)에 기록했습니다.

추가 PostgreSQL release-gate 재검증 (2026-09-05): 별도 Compose project에서 migration `001→018` fresh apply·18개 checksum skip, custom backup mode `600`, 새 빈 DB restore, `foods=7`·`normalized_lots=7`·`schema=ready`, concurrency/lifecycle/operation-pool smoke를 다시 통과했습니다. 이후 별도 disposable에서 migration `001→019` fresh apply·19개 checksum skip, 장보기 입고 operation ledger와 lot 삭제 후 API restart 409를 추가 확인했습니다. CI workflow의 migration 기대값은 `019/19개`로 갱신했으며, 실제 GitHub Actions 성공과 managed 운영 DB acceptance는 아직 확인하지 않았습니다.

추가 상품명 provider 검증 (2026-09-05): MFDS I1250 후보가 없을 때만 Open Food Facts legacy 상품명 검색을 호출하고, 검색 전용 rate-limit·provider별 cache/single-flight·기호-only 입력 조기 종료·source/provenance·confidence 상한·no-date 경계를 API와 비동기 worker mock readback으로 확인했습니다. 해당 provider 단계 snapshot은 API 322개·connected E2E 49개였고, 이후 영수증 GTIN vertical slice 기준 회귀는 API **324개**, connected E2E **50개**, frontend TypeScript 검증을 통과했습니다. 실제 MFDS/OFF key·한국 상품 coverage·legacy search quota·실기기 review는 아직 미검증이므로 점수는 86/100을 유지합니다 ([Open Food Facts name fallback readback](evidence/open-food-facts-name-fallback-readback-2026-09-05.md)).

추가 planner 검증 (2026-09-05): 동일 물리 차원의 metric 단위만 환산하고, `팩/모/개`처럼 포장 의미가 다른 단위는 `quantity_match=incompatible`과 `단위 확인 필요`로 보류하는 정책을 planner·API·조리 UI에 연결했습니다. 한국어/영문 단위 alias, 환산된 available quantity와 원래 lot allocation, 기존 `팩` 조리 완료 회귀를 API **327개**·connected E2E **52개**·frontend TypeScript 검증으로 확인했습니다. 상품 catalog 기반 포장 단위 환산과 운영 데이터 coverage는 미검증이므로 점수는 86/100을 유지합니다 ([planner quantity contract readback](evidence/planner-quantity-contract-readback-2026-09-05.md)).

추가 OCR worker 운영 검증 (2026-09-05): PaddleOCR `PP-OCRv5_mobile_det + korean_PP-OCRv5_mobile_rec`·`enable_mkldnn=False` 실행 경로, `linux/amd64` image, native dependency, source pixel/max-side budget, `/health` liveness·`/ready` 실제 predict warm-up·Compose `healthy`, synthetic label와 사장님 제공 영수증 3장/라벨 2장 `/ocr complete`를 확인했습니다. worker unit **10 passed**, API 전체 **353 passed**, Python compile·workflow YAML·Compose config·`git diff --check`도 통과했습니다. 이 검증은 runtime 가능성과 샘플 처리 안정성만 증명하며 실제 매장 annotation 정확도·cold/warm latency·memory·replica sizing·실기기 카메라는 미검증이므로 scorecard 총점은 **86/100**을 유지합니다 ([OCR worker readiness readback](evidence/ocr-worker-readiness-readback-2026-09-05.md)).

추가 상용 UX 검증 (2026-09-06): 사용자가 닫은 `review_required` 영수증을 connected 홈의 `검수할 영수증` 카드에서 다시 발견하고, 여러 pending draft 중 원하는 항목을 선택하며, 원본 image/PDF bytes 없이 safe metadata·상품 line만 복원해 검수를 이어가는 흐름을 구현했습니다. 이미 commit·redaction된 draft는 재개하지 않고, workspace 전환 중 늦게 도착한 이전 receipt summary는 generation guard로 폐기합니다. resume·다중 선택·workspace switch targeted 각 1개와 replay 성공 문구 targeted 1개를 포함한 전체 connected E2E **62개**, frontend TypeScript, `git diff --check`, protected runtime 28개·Vite 755 modules·Sites 4개 build mirror를 통과했습니다 ([receipt review resume readback](evidence/receipt-review-resume-readback-2026-09-06.md)). 원본 미리보기는 재개하지 않으며, 실제 다중 기기 동시 수정·장기 draft retention·외부 notification은 별도 acceptance입니다.

## Current self-review — 2026-09-06

이번 readback 기준으로 `Product UX`는 **19/20**, `Reliability and data integrity`는
**19/20**으로 조정했습니다. 영수증 intake가 중단되어도 사용자가 다음 진입점을
잃지 않고, 원본 비저장 정책을 이해한 상태에서 상품 line을 다시 확인할 수 있으며,
workspace 전환 stale-response와 같은 receipt의 동시 commit 중복 lot도 회귀 테스트로
막았습니다. receipt lock registry도 active request 종료 뒤 회수하도록 해 장기 프로세스
메모리 누적 경계를 추가했습니다. 같은 key/payload의 receipt commit이 process restart 뒤
동일 transaction/lot를 replay하고 다른 payload를 `409`로 거부하는 normalized PostgreSQL
readback도 추가했습니다. 실패 attempt 뒤 retry의 `needs_reconciliation` 및
`committed` transaction 이력 분리와 fresh migration의 receipt unique constraint 제거도
직접 확인했습니다. `Alignment 19/20`, `Accuracy and safety 16/20`, `Reliability and data
integrity 19/20`, `Production readiness 15/20`은 외부 provider·실기기·운영 인프라
검증이 아직 남아 있어 유지합니다.
알림 worker가 이미 읽혔거나 해지된 기기의 pending delivery를 외부 provider 호출 없이
`cancelled`로 보존하고, 취소 상태의 SQLite 재시작 readback과 heartbeat 카운트를
확인했습니다. 이번 변경 후 API 전체 **364 passed**, notification delivery targeted **11 passed**,
connected E2E **64 passed**, normalized PostgreSQL receipt commit process-restart smoke와
frontend production build도 통과했습니다.

추가 접근성 검증: 모든 controlled bottom sheet가 visible title/description과 연결된
named dialog semantics를 유지하고, `Escape`로 닫힌 뒤 exit animation이 끝나면 원래
열기 버튼에 포커스를 복귀하도록 app-owned sheet transition helper를 연결했습니다.
fixture·mobile runtime **34 passed**, connected E2E **62 passed**, TypeScript/Vite build와
protected runtime 28개를 통과했으며, 실제 iOS VoiceOver·Android TalkBack·Dynamic Type는
별도 acceptance로 남깁니다 ([bottom-sheet accessibility readback](evidence/bottom-sheet-accessibility-readback-2026-09-06.md)).

추가 PWA 검증: install 시 `skipWaiting()`을 보류하고 navigation network-first·정적
destination stale-while-revalidate·API/write/dynamic GET bypass·old cache purge를
service worker contract **5개**로 고정했습니다. production에서 waiting worker가 생기면
사용자에게 `새로고침`·`나중에`를 제시하고, 사용자가 선택할 때만 `SKIP_WAITING`과
`controllerchange` reload를 수행합니다. build는 protected runtime **28개**와 Vite
**757 modules**, Sites **4개**를 통과했으며 실제 release 간 update와 실기기 설치는
남아 있습니다 ([PWA update/cache readback](evidence/pwa-update-cache-readback-2026-09-06.md)).

추가 workspace read/write 검증: `WorkspaceSyncCoordinator`가 dashboard·알림·장보기·재고
검색·receipt summary와 계정 설정 read/export를 opaque workspace key 및 channel ticket으로
묶고, 실행별 `AbortSignal`을 provider와 `mealApi` fetch까지 전달합니다. 성공한 mutation은
`BroadcastChannel`/`localStorage` Adapter를 통해 같은 workspace의 다른 탭을 invalidate합니다.
PostgreSQL은 마지막으로 관찰한 revision을 mutation 선행조건으로 받아 stale write를
구조화된 `workspace_revision_conflict` 409에 멈추고, client는 현재 revision을 반영해
최신 read model을 다시 읽은 뒤 사용자가 재시도하도록 안내합니다. workspace 전환·동일
channel 경쟁·명시적 invalidate·provider failure·실제 abort signal·transport 전달의 최신성
계약 **8개**, connected E2E **64개**, API 전체 **364개**(7 warnings), fixture/mobile **34개**,
protected runtime **28개**, Vite **757 modules**, Sites **4개**를 통과했습니다. notification
worker cancellation reason metric과 token-protected Prometheus scrape도 확인했으며,
multi-replica metric collector/alert·자동 merge·managed PostgreSQL failover는 별도 gate입니다
([workspace sync readback](evidence/workspace-sync-readback-2026-09-06.md)).

추가 PostgreSQL direct owner 복구 검증 (2026-09-07): base/auth/shared direct
connection을 bounded reconnect adapter로 통합하고, 끊긴 query·fetch·commit은
재실행하지 않는 `503` 경계를 고정했습니다. disposable PostgreSQL에서 고유
`application_name` API session 4개를 실제 종료한 뒤 readiness·auth/read·기존
inventory read·복구 후 단일 write·scoped cleanup을 확인했으며, 전체 API
**377 passed**, connected E2E **65 passed**, direct adapter targeted **6 passed**,
preflight/pool/contract targeted **56 passed**를 통과했습니다. managed failover·network partition·
multi-replica metrics와 외부 운영 acceptance가 남아 있으므로 점수는 **88/100**을
유지합니다 ([PostgreSQL direct connection recovery readback](evidence/postgres-direct-connection-recovery-readback-2026-09-07.md)).

추가 웹 테스트 lane 분리 검증 (2026-09-07): fixture-only `npm run test:runtime`이
API를 요구하는 connected spec을 잘못 실행하지 않도록 기본 Playwright config에
명시적 `testIgnore`를 추가했습니다. 현재 mirror에서 fixture/mobile **34 passed**,
Web Push key 미설정 **2 skipped**, connected API/browser **65 passed**를 각각
분리해 확인했으며 CI web job에도 fixture runtime 실행을 연결했습니다. 테스트
서버 계약이 섞이지 않도록 한 개선이며 외부 device acceptance는 여전히 남아
있으므로 점수는 **88/100**을 유지합니다.

추가 receipt draft 멱등성 검증 (2026-09-07): pending draft 중복 생성과
fingerprint 충돌을 process lock·full-input hash·legacy compatibility·
PostgreSQL revision replay로 닫았습니다. 실제 두 process live smoke에서
`201 initial + 201 replay`, draft ID 1개, compatibility/normalized
receipt 각 1개를 확인했고, flush failure phantom rollback·다른 구매일
분리·replay header API 회귀를 추가했습니다. API 전체는 **382 passed**입니다.
이는 review queue와 네트워크 재시도의 데이터 품질을 높인 것이며, 의미적
영수증 동일성·실제 provider/managed DB 운영 acceptance는 남아 있으므로
점수는 **88/100**을 유지합니다 ([receipt draft idempotency readback](evidence/receipt-draft-idempotency-readback-2026-09-07.md)).

추가 normalized receipt metadata parity 검증 (2026-09-07): `022_receipt_review_metadata.sql`
additive migration으로 `template_id`·`template_confidence`·`merchant_name`을
normalized projection에 보존했습니다. fresh `001→022` migration ledger 22개와
실제 두 process `201 initial + 201 replay`, metadata 보존,
compatibility/normalized receipt 각 1개를 확인했습니다. 기존 volume migration과
managed DB 운영 acceptance가 남아 있으므로 점수는 **88/100**을 유지합니다.

추가 meal-plan 저장·완료 race 검증 (2026-09-07): plan/bundle별 lock과
PostgreSQL revision winner replay를 추가해 동일 plan save를 1개로 수렴시키고,
동시 completion을 `completed + already_completed`로 처리했습니다. 실제 두
process smoke에서 plan 1개·saved/completed audit 각 1개·compatibility/
normalized consumed event 각 3개를 확인했고, 공통 snapshot의 saved plan/
shopping rollback과 save flush failure phantom 차단도 API fixture로
확인했습니다. managed failover와 실제
Grocy compensation은 남아 있으므로 점수는 **88/100**을 유지합니다
([meal-plan idempotency readback](evidence/postgres-meal-plan-idempotency-readback-2026-09-07.md)).

추가 수동 식품 lot 경계 검증 (2026-09-07): `POST /api/foods`의 이름 기반
무조건 upsert를 create/correction intent로 분리했습니다. target 없는 직접 입력은
같은 상품명도 새 lot으로 보존하고, 라벨·GS1 보정은 사용자가 고른
`lot_action=correct + target_food_id` 또는 단일 label 호환 후보만 갱신합니다.
라벨 화면에 새 lot/기존 lot picker를 추가해 다중 lot의 임의 선택과 trusted 날짜 overwrite를
차단하고, target 수량·단위·구매/개봉 provenance·unknown date history를 보존하며,
저장 실패 phantom lot rollback을 확인했습니다. API 전체 **393 passed**, protected
runtime **28개**, Vite **757 modules**, fixture/mobile **35 passed + 2 skipped**,
연결 라벨의 create/correct payload를 포함한 connected E2E **69 passed**를 local mirror에서 확인했습니다.
disposable PostgreSQL multi-process smoke도 확인했습니다. 이후 수동 command
idempotency ledger와 frontend 동일-key retry도 추가로 확인했습니다. 라벨 picker의 실기기 동작,
managed failover/network partition, 실제 기기/운영 OCR은 아직
acceptance이므로 총점은 **88/100**을
유지합니다 ([manual food lot boundary readback](evidence/manual-food-lot-boundary-readback-2026-09-07.md)).

추가 수동 command idempotency 검증 (2026-09-07): 같은 `Idempotency-Key`·payload의
수동 식품 입력이 하나의 lot과 replay header로 수렴하고, payload 변경·소비 후
재생성을 각각 `409`로 멈추는 API 회귀와 SQLite reconstruction을 확인했습니다.
fresh PostgreSQL migration `001→023`, 두 process replay와 target correction
race, raw key 비저장 export를 readback했으며, 상세 결과는
[manual food idempotency readback](evidence/manual-food-idempotency-readback-2026-09-07.md)에
기록했습니다. ledger retention·managed failover·reverse-proxy response reset은
운영 acceptance로 남아 총점은 **88/100**을 유지합니다.

추가 PostgreSQL schema capability/migration gate 검증 (2026-09-07): readiness
contract·ledger baseline test **27 passed**, API 전체 회귀 **405 passed, 8 warnings**, fresh disposable PostgreSQL
`001→023` apply·재실행 skip·동시 runner의 `23 applied + 23 skipped`, Compose
one-shot `migrate` service code 0, migration 후 runtime DDL 없이 normalized
`/ready 200`·`/health 200`을 확인했습니다. 전체 compatibility projection의
table·핵심 column/index를 readiness에 연결하고, `migrate.py`가 session-level
advisory lock 아래 body와 ledger를 같은 transaction으로 처리합니다. managed
failover·network partition·rolling deploy cutover는 운영 acceptance이므로
총점은 **88/100**을 유지합니다 ([PostgreSQL schema gate readback](evidence/postgres-schema-gate-readback-2026-09-07.md)).

추가 운영 privacy hardening (2026-09-08): JSON access log를 raw URL path가 아닌
route template으로 제한하고, password-reset token·revoked account-token hash는
TTL+grace 이후에만 SQLite/PostgreSQL에서 정리하도록 했습니다. 업무 audit·재고·
receipt·idempotency ledger는 cleanup 대상에서 제외했으며, auth retention smoke와
전체 API **405 passed, 8 warnings**를 확인했습니다. 실제 log shipper/collector,
법정 보존·backup/WAL·managed 운영은 별도 acceptance이므로 총점은 **88/100**을
유지합니다 ([access-log route-template readback](evidence/access-log-route-template-readback-2026-09-08.md), [auth security retention readback](evidence/auth-security-retention-readback-2026-09-08.md)).

| 영역 | 점수 | 이번 변경 후 판단 |
| --- | ---: | --- |
| Alignment | 19/20 | 영수증·보관·날짜·Rescue Meal 핵심 흐름과 중단 후 재개 흐름이 일치함 |
| Accuracy and safety | 16/20 | 원본 미저장, review-only draft, 날짜/보관 확인 gate를 유지함; 실제 매장 annotation·관할 rule 검토는 남음 |
| Product UX | 19/20 | 홈 pending receipt entry, metadata-only resume, stale draft unavailable, workspace switch guard, 공통 workspace read/export coordinator, cross-tab mutation refresh, named dialog semantics와 원래 trigger 포커스 복귀, 사용자 승인 PWA update 안내, manual lot correction 안내·새 lot/기존 lot picker·일시 실패 후 동일 key `다시 시도` action과 semantic E2E가 추가됨; 실기기 camera/screen reader·실제 사용자 테스트는 남음 |
| Reliability and data integrity | 19/20 | workspace/channel ticket·실제 AbortSignal 전달·cross-tab transport와 account panel remount를 포함한 read lifecycle, PostgreSQL revision precondition과 structured workspace conflict 409, receipt ID별 in-process commit lock, active request 종료 뒤 weak registry 회수, `Idempotency-Key`·payload fingerprint·receipt/receive/manual command operation ledger의 compatibility/normalized persistence, process restart replay와 payload conflict 409, consumed lot 재생성 차단, read-before-send notification delivery의 `cancelled`·reason별 safe runtime metric·재시작 보존, service worker navigation/cache/bypass contract, manual create/correction lot identity·date overwrite guard·snapshot rollback을 disposable PostgreSQL/SQLite·Node VM·manual two-process smoke에서 검증함; ledger retention·multi-replica collector/alert·자동 merge·managed failover·network partition·release 간 worker acceptance는 남음 |
| Production readiness | 15/20 | local/disposable DB·OCR worker·build/readiness 경계는 준비됨; managed DB failover, 외부 메일/push/telemetry, device acceptance는 미검증 |
| **합계** | **88/100** | 상용앱 수준의 검증 가능한 vertical slice이며 외부 운영 release gate 전 단계 |

이 점수는 2026-09-05의 86/100 평가를 이번 connected resume·workspace isolation
증거만큼 조정한 것입니다. 실제 외부 운영 시스템의 성공으로 해석하지 않습니다.

## Current self-review — 2026-09-08

사용자 설정·알림 mutation recovery slice를 추가했습니다. `WorkspaceMutation`의
snapshot에 식단 조건·알림 설정·push 연결·알림 읽음 상태를 명시하고, 일반 저장 실패
시 기존 상태를 복원하는 typed retryable API error와 열린 sheet 내부 retry UI를
연결했습니다. SQLite와 disposable PostgreSQL store 재구성에서 네 상태의 보존을
확인했으며, 전체 API **417 passed**, fixture/mobile runtime **35 passed + 2 skipped**,
connected E2E **70 passed**, frontend build와 protected runtime **28개**를 통과했습니다.

점수는 **88/100**을 유지합니다. Reliability/Data Integrity와 Product UX의 현재
19/20은 유지하되, 실제 OS Web Push 수신·managed PostgreSQL failover/network
partition·외부 provider/telemetry collector·실기기 camera/accessibility·법정/백업
retention·실제 GitHub Actions 성공이 아직 확인되지 않았기 때문입니다. 이번
readback은 local/disposable persistence와 UI retry 계약을 증명하며, production
notification delivery 또는 전체 worker atomicity를 증명하지 않습니다
([notification mutation recovery readback](evidence/notification-mutation-recovery-readback-2026-09-08.md)).

추가 worker runner 고도화 (2026-09-08): notification·Grocy·product-enrichment
standalone runner가 HTTP 200 body-level `error`를 실패로 놓치지 않도록 공통
`app/worker_runner.py` scheduling contract로 통합했습니다. `--once` 실패 exit code 1,
30초 기준 최대 300초 backoff, 정상 cycle recovery reset과 line-flush 구조화 로그를
검증했으며, worker runner/script targeted **16 passed**, notification·Grocy·
product-enrichment domain을 포함한 combined targeted **39 passed**를 확인했습니다. 이 변경은 scheduler 재호출 안정성을 높이지만 외부 Push/Grocy
provider 성공이나 managed infrastructure 복구를 증명하지 않으므로 총점은 **88/100**을
유지합니다 ([worker runner recovery readback](evidence/worker-runner-recovery-readback-2026-09-08.md)).

추가 Grocy mutation recovery (2026-09-08): product/location mapping, mapping audit,
reconciliation, dead-letter retry를 local workspace assertion으로 한정해
`WorkspaceMutation`의 한 번의 outer flush와 inline retry로 연결했습니다. 실제
disposable PostgreSQL close/reopen에서 mapping·location·outbox·audit를 복원했고,
API rollback/contract **22 passed**, connected mapping retry와 frontend build를
확인했습니다. 외부 Grocy transaction과 worker crash 중 provider call은 별도
acceptance이므로 총점은 **88/100**을 유지합니다
([Grocy mutation recovery readback](evidence/grocy-mutation-recovery-readback-2026-09-08.md)).

추가 shared recipe catalog recovery (2026-09-08): COOKRCP draft와 review audit를
user workspace와 분리된 `RecipeCatalogMutation`으로 묶어 import·검토 수정·승인·반려
실패 시 draft status와 audit를 함께 복원하도록 했습니다. SQLite·disposable PostgreSQL
재구성·API failure rollback·connected 관리자 retry와 전체 API **437 passed**를 확인했습니다.
다중 admin stale write는 별도 catalog revision fence로 차단했으며, 실제 source
provider와 managed database 운영은 아직 별도
acceptance이므로 총점은 **88/100**을 유지합니다
([recipe review recovery readback](evidence/recipe-review-recovery-readback-2026-09-08.md)).

추가 shared recipe review ownership (2026-09-08): revision fence만으로 표현할 수 없던
다중 관리자 담당 ownership을 pending draft별 explicit `claim`/`release`와 bounded lease로
구체화했습니다. claim 없는 수정·승인·반려, 다른 actor의 active claim, 만료 claim을 각각
typed 409로 구분하고, 만료 recovery·same-actor no-op·release·flush rollback·approve 후
자동 해제를 SQLite/PostgreSQL payload와 actor audit에서 확인했습니다. 관리자 UI는 담당자
상태를 표시하고 non-owner 편집/승인을 비활성화합니다. ownership/API targeted **33 passed**,
full API **439 passed**, full connected **71 passed**, fixture/mobile **35 passed + 2 skipped**,
build/protected runtime **28개**를 통과했습니다. 조직/팀 RBAC·legacy token removal·외부
provider·managed failover와 실기기 acceptance는 남아 있으므로 총점은 **88/100**을
유지합니다
([recipe review ownership readback](evidence/recipe-review-ownership-readback-2026-09-08.md)).

추가 recipe review capability RBAC (2026-09-08): 기존 `recipe_admin`을 reviewer capability와
publisher decision capability로 분리할 수 있도록 optional publisher email allowlist와
capabilities endpoint를 추가했습니다. reviewer-only account는 claim·편집·저장은 가능하지만
approve/reject를 수행할 수 없고, 관리자 UI도 게시 버튼을 disabled 처리합니다. 기존 allowlist
미설정 환경과 `ra1` token 형식은 호환됩니다. capability API/connected targeted **12/5 passed**,
full API **440 passed**, full connected **72 passed**, fixture/mobile **35 passed + 2 skipped**,
build/protected runtime **28개**를 통과했습니다. 조직 hierarchy·publisher rotation·legacy
token removal·외부 provider와 managed failover가 남아 있으므로 총점은 **88/100**을 유지합니다
([recipe review capability RBAC readback](evidence/recipe-review-rbac-readback-2026-09-08.md)).

추가 recipe review assignment queue (2026-09-08): pending draft를 `전체`·`내 작업`·
`미배정`으로 필터링할 수 있게 해 ownership 기능을 실제 운영 queue에 연결했습니다. active
claim만 `mine`에 포함하고 expired claim은 회수 가능하도록 `unassigned`에 남깁니다. API
targeted **14 passed**, connected targeted **6 passed**, full API **444 passed**, full connected
**73 passed**, build/protected runtime **28개**를 확인했습니다. 실시간 multi-admin invalidation·
조직 assignment policy가 남아 있으므로 총점은 **88/100**을 유지합니다
([recipe review queue filter readback](evidence/recipe-review-queue-filter-readback-2026-09-08.md)).

추가 recipe review cross-tab invalidation (2026-09-08): shared `recipe-catalog` key와
`recipe-review` channel을 통해 다른 운영자의 claim/release/import/mutation 이후 queue를
갱신하고, 열린 local editor는 덮어쓰지 않도록 했습니다. 선택된 draft가 원격에서 바뀌면
명시적 최신 draft 확인 전까지 editor를 stale로 잠급니다. transport **9 passed**, connected
recipe targeted **8 passed**, full API **444 passed**, full connected **75 passed**, build/
protected runtime **28개**를 통과했습니다. server push·실시간 ordering·조직 assignment가
남아 있으므로 총점은 **88/100**을 유지합니다
([recipe review realtime readback](evidence/recipe-review-realtime-readback-2026-09-08.md)).

추가 recipe review cross-device revision probe (2026-09-08): 다른 browser/device에서
BroadcastChannel 메시지를 받지 못한 경우에도 `/api/recipe-review/revision`을 tab 복귀와
30초마다 확인해 revision 변경 시에만 queue를 재조회하도록 했습니다. 선택 draft 변경은
local editor를 stale로 잠그고 명시적 최신 reload를 요구하며 probe 실패 시 기존 상태를
보존합니다. recipe API targeted **15 passed**, connected targeted **9 passed**, full API
**445 passed**, full connected 최종 **76 passed**, runtime **35 passed + 2 skipped**,
build/protected runtime **28개**를 확인했습니다. server push·event ordering·조직 assignment가
남아 있으므로 총점은 **88/100**을 유지합니다
([recipe review revision probe readback](evidence/recipe-review-revision-probe-readback-2026-09-08.md)).

추가 CI production preflight gate (2026-09-08): API workflow가 sanitized valid
publisher⊆admin profile과 admin 밖 publisher negative profile을 실제 preflight CLI로
실행하도록 연결했습니다. negative path는 non-zero exit·error code·email value
non-disclosure를 확인합니다. workflow/contract targeted **51 passed**, full API **443 passed**,
YAML parse와 관련 diff check를 통과했습니다. 실제 GitHub Actions 성공·secret manager·배포
connectivity는 아직 확인하지 않았으므로 총점은 **88/100**을 유지합니다
([CI production preflight gate readback](evidence/ci-production-preflight-readback-2026-09-08.md)).

추가 production legacy-token fail-closed gate (2026-09-08): shared recipe review token이
production에서 설정되면 preflight·`/ready`·runtime review request를 모두 차단하고,
개별 `recipe_admin` account 사용을 요구하도록 했습니다. token 원문 비노출과 local/preview
legacy compatibility를 유지하며, preflight/runtime targeted **34 passed**, full API **442 passed**,
frontend connected 최종 **72 passed**를 확인했습니다. 실제 secret-manager rotation·legacy
secret 폐기·deployment pipeline, managed failover·외부 provider·실기기·CI는 미검증이므로
총점은 **88/100**을 유지합니다
([recipe review legacy-token gate readback](evidence/recipe-review-legacy-token-gate-readback-2026-09-08.md)).

추가 recipe publisher allowlist preflight (2026-09-08): publisher/admin email 형식과
publisher⊆admin 관계, publisher-only 설정을 production preflight에서 검증하도록 했습니다.
정상 설정과 잘못된 설정을 모두 회귀로 확인했으며 preflight **22 passed**, full API
**443 passed**를 확인했습니다. 조직 directory sync·실제 role 관리·secret manager 운영은
남아 있으므로 총점은 **88/100**을 유지합니다
([recipe review capability RBAC readback](evidence/recipe-review-rbac-readback-2026-09-08.md)).

추가 durable read snapshot 검증 (2026-09-08): SQLite/PostgreSQL durable workspace
projection reload를 copy-on-write state로 바꿔 loader가 public collection을 비우는
동안 동시 reader가 transient empty state를 보지 않게 했습니다. 또한 reload 중 발생한
local write가 state swap에서 유실되지 않도록 변경 field를 보존했습니다. blocking reload
regression은 수정 전 저장된 meal plan을 `KeyError`로 잃었고, local-write regression도
수정 전 flush 후 plan을 잃었지만, 수정 후 두 경계를 확인했습니다. API 전체 **447 passed,
8 warnings**, connected E2E **76 passed**, planner 저장→닫기→재진입 및 camera/library
fallback을 통과했습니다. 이는 local/adapter read lifecycle 증거이며 managed PostgreSQL
failover·network partition·rolling deploy·multi-replica ordering은 여전히 별도 gate이므로
총점은 **88/100**을 유지합니다 ([durable read snapshot readback](evidence/durable-read-snapshot-readback-2026-09-08.md)).

추가 OperationLedger·primary intake readiness 검증 (2026-09-08): retryable receipt·manual
food·shopping receive·storage event의 identity 계산을 `OperationLedger` Module로
집중하고, domain별 scope/replay/conflict semantics는 보존했습니다. 또한 AddFoodSheet
lazy split은 유지한 채 `openAdd()` intent prefetch와 resolve gate를 연결해 control 없는
dialog shell을 열지 않도록 했습니다. Module **4 passed**, API 전체 **451 passed, 8 warnings**,
receipt/idempotency targeted **10 passed**, connected targeted **5 passed**, full connected
**76 passed**, protected runtime **28개**, Vite **757 modules**, fixture/mobile **35 passed +
2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다. 실제
provider/device/CDN/managed 운영 gate가 남아 있으므로 총점은 **88/100**을 유지합니다
([OperationLedger readback](evidence/operation-ledger-readback-2026-09-08.md), [intake chunk prefetch readback](evidence/intake-chunk-prefetch-readback-2026-09-08.md)).

추가 WorkspaceMutation operation lock 검증 (2026-09-08): 적용된 workspace mutation의
snapshot·mutation·flush·restore를 active store `RLock`으로 직렬화해 refresh와 같은
process mutation의 interleaving을 줄였습니다. lock unit **4 passed**, API 전체 **452
passed, 8 warnings**, connected E2E **76 passed**를 확인했습니다. direct receipt/meal-plan/
storage route, worker/provider transaction, managed failover와 전체 workspace atomicity는
별도 gate이므로 총점은 **88/100**을 유지합니다 ([WorkspaceMutation lock readback](evidence/workspace-mutation-lock-readback-2026-09-08.md)).

추가 storage event mutation seam 검증 (2026-09-08): 핵심 inventory 행동의 direct route를
active workspace lock과 `WorkspaceMutation`으로 편입해 Idempotency-Key precheck부터
InventoryRepository mutation·Grocy outbox·rollback까지 순서를 고정했습니다. same-key
concurrent HTTP에서 단일 event/replay를 확인했고, API 전체 **454 passed, 8 warnings**,
connected E2E **76 passed**, protected runtime **28개**, Vite **757 modules**를 유지했습니다.
direct receipt/meal-plan route, 외부 Grocy transaction, managed 운영 gate는 남아 있으므로
총점은 **88/100**을 유지합니다 ([storage event mutation readback](evidence/storage-event-mutation-readback-2026-09-08.md)).

추가 single meal-plan save mutation seam 검증 (2026-09-08): 단일 plan 저장의 candidate/
bundle identity 검증과 saved audit staging을 `WorkspaceMutation`으로 감싸 snapshot·flush·
regular failure rollback을 공통화했습니다. 기존 plan replay·concurrent save·planner
재진입을 유지했으며 API **455 passed, 8 warnings**, connected **76 passed**, protected
runtime **28개**, Vite **757 modules**를 확인했습니다. multi-day/completion·외부 Grocy와
managed 운영 gate는 남아 있으므로 총점은 **88/100**을 유지합니다 ([meal-plan save mutation readback](evidence/meal-plan-save-mutation-readback-2026-09-08.md)).

추가 single meal-plan completion mutation seam 검증 (2026-09-08): allocation validation 후
consumed storage event·Grocy outbox·plan/bundle progress·completed audit를
`WorkspaceMutation`으로 묶고 `reprioritize(persist=False)`를 사용해 flush failure 시
phantom consumption을 남기지 않게 했습니다. completion targeted **12 passed**, API 전체
**457 passed, 8 warnings**, connected **76 passed**, protected runtime **28개**, Vite
**757 modules**를 확인했습니다. multi-day bundle·외부 Grocy/provider·managed 운영 gate는
남아 있으므로 총점은 **88/100**을 유지합니다 ([meal-plan completion mutation readback](evidence/meal-plan-completion-mutation-readback-2026-09-08.md)).

추가 multi-day bundle save mutation seam 검증 (2026-09-08): bundle_id별 lock과
`WorkspaceMutation`으로 preview rematerialization·snapshot hash/day identity 검증·bundle/
day staging·flush/restore를 묶었습니다. preview side-effect-free와 retry/history/conflict,
selected day/link repair/progress를 유지했으며 multi-day targeted **7 passed**, API 전체
**458 passed, 8 warnings**, connected **76 passed**, protected runtime **28개**, Vite
**757 modules**를 확인했습니다. day completion·외부 Grocy/provider·managed 운영 gate는
남아 있으므로 총점은 **88/100**을 유지합니다 ([multi-day bundle save mutation readback](evidence/multi-day-bundle-save-mutation-readback-2026-09-08.md)).

추가 receipt commit mutation seam 검증 (2026-09-08): pending transaction marker를 먼저
durable flush해 crash/retry identity를 보존하고, receipt별 lock과 active workspace lock 안의
`WorkspaceMutation` outer flush로 final lot·receipt·alias/provenance audit·Grocy outbox를
묶었습니다. `persist=False` staging과 regular failure snapshot rollback,
`needs_reconciliation` marker를 확인했으며 structural/GTIN/replay/pending retry/concurrent/
rollback/final flush failure targeted **7 passed**, API 전체 **460 passed, 8 warnings**,
connected **76 passed**, protected runtime **28개**, Vite **757 modules**를 통과했습니다.
외부 Grocy transaction·managed failover·network partition·response reset·실기기/CI는
여전히 미검증이므로 총점은 **88/100**을 유지합니다
([receipt commit mutation readback](evidence/receipt-commit-mutation-readback-2026-09-08.md)).

추가 multi-day linked day completion recovery 검증 (2026-09-08): bundle day completion을
별도 endpoint로 분기하지 않고 `bundle_id`·`bundle_day_index`로 연결한 single-plan
completion의 `WorkspaceMutation` snapshot에 day progress를 포함했습니다. final flush
failure 때 plan은 미완료, day는 `saved`, inventory와 consumed event는 원상태로 복원되며
retry 뒤 `completed`로 진행하는 정상/실패 targeted **2 passed**, API 전체 **461 passed, 8
warnings**, connected **76 passed**를 확인했습니다. 외부 Grocy transaction·managed
failover·network partition·response reset·실기기/CI는 여전히 미검증이므로 총점은
**88/100**을 유지합니다
([multi-day day completion recovery readback](evidence/multi-day-day-completion-recovery-readback-2026-09-08.md)).

추가 meal-plan client transport lifecycle 검증 (2026-09-08): `MealPlanSheet`의
preview/latest/preferences/alternatives/history/audit와 nested shopping read를
`WorkspaceSyncCoordinator` channel·AbortSignal로 통과시키고, planner preview 등 POST이지만
workspace를 변경하지 않는 read-only 요청은 mutation invalidation에서 제외했습니다. 실제
meal-plan save/complete·preference mutation은 `meal-plan` channel로 열린 planner를 갱신하며,
same-origin cross-tab planner refresh와 dashboard non-invalidation targeted **2 passed**,
workspace-sync **9 passed**, API 전체 **461 passed, 8 warnings**, fixture/mobile **35 passed +
2 skipped**, build protected runtime **28개**, Vite **757 modules**, connected **78 passed**를
확인했습니다. 일반 planner cross-device probe·managed failover·외부 provider/device/CI는
미검증이므로 총점은 **88/100**을 유지합니다
([meal-plan client transport readback](evidence/meal-plan-client-transport-readback-2026-09-08.md)).

추가 manual food mutation recovery 검증 (2026-09-08): `POST /api/foods`의 create/correction을
`manual_food_lock`·active mutation lock·`WorkspaceMutation` outer flush로 묶고,
`manual_food_persistence_unavailable` typed 503과 기존 목록 보존·동일-key retry를
연결했습니다. refactor 전 seam 호출 0회와 수정 후 manual API **16 passed**, PostgreSQL
two-process create/replay/restart/correction race, connected manual UI **3 passed**, API 전체
**463 passed, 8 warnings**, connected **78 passed**, typed retry/readiness wiring build protected runtime
**28개**·Vite **757 modules**·initial index **307.81 kB**·AddFoodSheet **58.67 kB**를 확인했습니다. 외부 Grocy/provider,
managed failover·network partition·response reset·legal retention·실기기/CI는 여전히
미검증이므로 총점은 **88/100**을 유지합니다
([manual food mutation recovery readback](evidence/manual-food-mutation-recovery-readback-2026-09-08.md)).

추가 receipt draft mutation·intake readiness 검증 (2026-09-08): receipt draft create를
fingerprint/active lock과 `WorkspaceMutation` outer flush로 묶고,
`receipt_draft_persistence_unavailable` typed 503·phantom 없는 상태·pending replay를
연결했습니다. `openAdd()`의 AddFoodSheet/LazyBottomSheet resolve gate와 outer Suspense
경계로 PDF/file input/직접 입력 tab이 준비되기 전 dialog shell을 노출하지 않으며, draft
targeted **6 passed**, PDF/typed failure UI **2 passed**, API 전체 **464 passed, 8 warnings**,
connected **79 passed**, build protected runtime **28개**·Vite **757 modules**·initial index
**307.81 kB**·AddFoodSheet **58.67 kB**를 확인했습니다. OCR/device/CDN·managed failover·
외부 provider·legal retention·CI는 여전히 미검증이므로 총점은 **88/100**을 유지합니다
([receipt draft mutation and intake readiness readback](evidence/receipt-draft-mutation-readiness-readback-2026-09-08.md)).

추가 product-info mutation recovery·inline retry 검증 (2026-09-08): 상품 프로필 수정의
target/no-op·provenance removal audit·product-info audit·priority를 active mutation lock과
`WorkspaceMutation` outer flush로 묶고, `product_info_persistence_unavailable` typed 503과
기존 lot state 보존·detail inline retry를 연결했습니다. product-info API targeted **3 passed**,
final-flush rollback/typed retry, connected inline retry **1 passed**, API 전체 **466 passed,
8 warnings**, connected **80 passed**, build protected runtime **28개**·Vite **757 modules**·
initial index **308.25 kB**를 확인했습니다. 최신 route의 multi-process PostgreSQL HTTP smoke,
managed failover·network partition·external provider/device/legal/CI는 미검증이므로 총점은
**88/100**을 유지합니다
([product-info mutation recovery readback](evidence/product-info-mutation-recovery-readback-2026-09-08.md)).

추가 receipt privacy mutation recovery 검증 (2026-09-08): 미반영 draft 삭제와 committed/
pending receipt source metadata redaction을 `WorkspaceMutation` outer flush로 묶고,
`receipt_privacy_persistence_unavailable` typed 503·snapshot rollback·기존 inventory
provenance/commit transaction 보존을 연결했습니다. `confirm: true` validation과
`deleted_draft`·`redacted_committed`·`redacted_pending` semantics를 API에서 유지하고,
계정 sheet는 열린 overlay 내부 inline retry를 제공합니다. privacy API targeted **5 passed**,
SQLite persistence **1 passed**, API 전체 **468 passed, 8 warnings**, connected **80 passed**,
protected runtime **28개**, Vite **757 modules**, fixture/mobile **35 passed + 2 skipped**,
Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다. 이 증거는 local
workspace/adapter recovery의 범위이며 backup/WAL/read replica/object storage·법정 retention,
managed failover/network partition·외부 provider/device/CI는 미검증이므로 총점은 **88/100**을
유지합니다 ([receipt privacy mutation recovery readback](evidence/receipt-privacy-mutation-recovery-readback-2026-09-08.md)).

추가 shopping list source mutation recovery 검증 (2026-09-09): 계획 기반 장보기 source
동기화와 직접 추가를 `WorkspaceMutation` outer flush로 묶고,
`shopping_list_persistence_unavailable` typed 503·snapshot rollback·기존 source/quantity/
checked 상태 보존을 연결했습니다. MealPlanSheet와 홈 ShoppingListSheet는 열린 sheet 내부
inline retry로 동일 source/payload를 재실행하며, shopping API targeted **7 passed**, connected
plan/manual retry **2 passed**, API 전체 **470 passed**, connected **80 passed**, protected
runtime **28개**, Vite **757 modules**, initial index **308.54 kB**, fixture/mobile **35 passed +
2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다. 이 증거는
local shopping projection recovery의 범위이며 GET reconciliation·receive lot transaction,
managed failover/network partition·외부 provider/device/legal/CI는 미검증이므로 총점은
**88/100**을 유지합니다 ([shopping list mutation recovery readback](evidence/shopping-list-mutation-recovery-readback-2026-09-09.md)).

추가 shopping list read reconciliation recovery 검증 (2026-09-09): 표면상 read인
`GET /api/shopping-list`의 derived source 제거·갱신을 `WorkspaceMutation` outer flush로
원자화하고, partial flush failure에서 `shopping_list_persistence_unavailable` typed 503과
기존 목록 snapshot 보존을 연결했습니다. shopping API targeted **9 passed**, API 전체 **472
passed**, connected **80 passed**, protected runtime **28개**, Vite **757 modules**, initial
index **308.54 kB**, MealPlanSheet **36.91 kB**, fixture/mobile **35 passed + 2 skipped**,
Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다. 이 증거는 local
derived projection recovery 범위이며 receive inventory transaction·external provider,
managed failover/network partition·read replica/legal/CI는 미검증이므로 총점은 **88/100**을
유지합니다 ([shopping list read reconciliation recovery readback](evidence/shopping-list-read-reconciliation-recovery-readback-2026-09-09.md)).

추가 product-enrichment queue mutation recovery 검증 (2026-09-09): receipt review의
enqueue/dead-letter retry job map을 `WorkspaceMutation` snapshot에 포함하고,
`product_enrichment_persistence_unavailable` typed 503·snapshot rollback·기존 draft/job
상태 보존을 연결했습니다. AddFoodSheet는 typed persistence failure를 검수 화면 내부
inline `다시 시도`로 복구하며, product-enrichment API/worker targeted **10 passed**,
connected receipt retry **1 passed**, API 전체 **474 passed**, connected **80 passed**,
protected runtime **28개**, Vite **757 modules**, initial index **308.65 kB**, AddFoodSheet
**58.91 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**, service-worker **5**,
workspace-sync **9**를 확인했습니다. 이 증거는 API job persistence와 UI retry 범위이며
worker 외부 provider/cache/rate-limit·lease/heartbeat, managed failover/network partition,
external delivery/device/legal/CI는 미검증이므로 총점은 **88/100**을 유지합니다
([product-enrichment mutation recovery readback](evidence/product-enrichment-mutation-recovery-readback-2026-09-09.md)).

추가 shopping receive mutation recovery 검증 (2026-09-09): 새 inventory lot·planned source
정리·checked 상태·receive operation ledger·priority를 `WorkspaceMutation` outer flush로
원자화하고, `shopping_receive_persistence_unavailable` typed 503·snapshot rollback·동일
Idempotency-Key replay를 연결했습니다. receive API targeted **4 passed**, final-flush
rollback/replay·same-key concurrency, connected receive retry **1 passed**, API 전체 **476
passed**, connected **80 passed**, protected runtime **28개**, Vite **757 modules**, initial
index **309.02 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**, service-worker **5**,
workspace-sync **9**를 확인했습니다. 이 증거는 local lot/list/ledger transaction 범위이며
외부 Grocy compensation·managed failover/network partition·backup/WAL/read replica·device/
legal/CI는 미검증이고 Docker daemon unresponsive로 disposable PostgreSQL smoke도 실행하지
못했으므로 총점은 **88/100**을 유지합니다
([shopping receive mutation recovery readback](evidence/shopping-receive-mutation-recovery-readback-2026-09-09.md)).

추가 storage event error recovery 검증 (2026-09-09): 이미 `WorkspaceMutation`을 사용하던
storage event route의 catch에서 직접 flush하던 우회를 제거하고,
`storage_event_persistence_unavailable` typed 503과 snapshot rollback·동일 Idempotency-Key
global retry를 연결했습니다. storage API targeted **8 passed**, 이중 flush 방지와 rollback/
retry, connected typed retry **1 passed**, API 전체 **477 passed**, connected **81 passed**,
protected runtime **28개**, Vite **757 modules**, initial index **309.43 kB**, fixture/mobile
**35 passed + 2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다.
이번 증거는 local single-event recovery 범위이며 composite event batch·외부 Grocy compensation,
managed failover/network partition·backup/WAL/read replica·device/legal/CI는 미검증이므로
총점은 **88/100**을 유지합니다
([storage event error recovery readback](evidence/storage-event-error-recovery-readback-2026-09-09.md)).

추가 composite storage event sequence 검증 (2026-09-09): 사용자가 보관 위치 이동과 최초
개봉을 함께 요청할 때 기존의 두 단일 HTTP mutation 사이에 남던 부분 저장 경계를
`POST /api/foods/{food_id}/storage-event-sequence`로 구체화했습니다. 최대 2개 event를
workspace/key/index 기반 deterministic ID와 child-lot target chain으로 연결하고,
inventory·storage event·Grocy outbox·priority를 `WorkspaceMutation` 단일 outer flush로
확정합니다. final flush failure에서는 `storage_event_sequence_persistence_unavailable`
typed 503과 전체 snapshot rollback을 확인했으며, frontend는 동일 Idempotency-Key의
retry로 재수행합니다. sequence API targeted **3 passed**, connected retry **1 passed**,
API 전체 **480 passed**, connected 전체 **82 passed**, fixture/mobile **35 passed + 2 skipped**,
protected runtime **28개**, Vite **757 modules**, initial index **309.99 kB**, AddFoodSheet
**58.91 kB**, MealPlanSheet **36.91 kB**, AccountSheet **64.17 kB**, Sites **4**,
service-worker **5**, workspace-sync **9**를 확인했습니다. 외부 Grocy transaction/
compensation, managed failover/network partition, response reset, backup/WAL/read replica,
legal retention, 실제 device/CI/deploy는 미검증이므로 총점은 **88/100**을 유지합니다
([storage event sequence readback](evidence/storage-event-sequence-readback-2026-09-09.md)).

추가 guest transfer cross-workspace race recovery 검증 (2026-09-09): guest-to-account import의
`ready` 판정과 target copy를 source·target workspace ID 고정 순서의 두 lock 안으로 묶어,
preview 직후 account write가 guest snapshot으로 덮이지 않게 했습니다. 일반 target flush
failure에서는 `guest_transfer_persistence_unavailable` typed 503과 기존 account snapshot
restore를 확인하고, PostgreSQL revision conflict는 stale restore 없이 전역 conflict로
전달하도록 했습니다. source 삭제·fingerprint replay·기존 conflict semantics는 유지합니다.
guest transfer flush rollback/retry·target write race targeted **3 passed**, 전체 API
**482 passed, 8 warnings**, connected full E2E **83 passed**, connected transfer UI targeted
**2 passed**, frontend build protected runtime **28**·Vite **757 modules**·initial index
**310.10 kB**를 확인했습니다. 실제 multi-process
transfer, distributed commit, managed failover, backup/WAL/legal retention은 미검증이므로
총점은 **88/100**을 유지합니다
([guest transfer lock/recovery readback](evidence/guest-transfer-lock-recovery-readback-2026-09-09.md)).

추가 receipt commit pending identity recovery 검증 (2026-09-09): 시작 pending marker flush
failure의 phantom transaction 제거와 `receipt_commit_persistence_unavailable` typed 503,
finalization rollback 뒤 reconciliation marker flush failure의 durable pending identity 보존과
`receipt_commit_reconciliation_unavailable` typed 503을 구현했습니다. 프론트는 사용자 시도
단위 commit key·고정 draft payload·resolved receipt ID를 보존해 global retry에서 같은 commit을
replay하며, auth/duplicate/workspace conflict에는 blind retry를 제공하지 않습니다. receipt
commit targeted **12 passed**, connected retry **1 passed**, API 전체 **484 passed, 8 warnings**,
connected 전체 **83 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime
**28개**, Vite **757 modules**, initial index **310.48 kB**를 확인했습니다. 외부 Grocy
transaction·response reset·managed failover/network partition·backup/WAL/read replica·법정
retention·실기기/CI/deploy는 미검증이므로 총점은 **88/100**을 유지합니다
([receipt commit retry readback](evidence/receipt-commit-retry-readback-2026-09-09.md)).

추가 사용자 정의 보관 위치·검색 filter 검증 (2026-09-09): canonical
`ambient`·`refrigerated`·`frozen` class를 유지하면서 workspace-scoped 위치 CRUD,
receipt/manual/shopping/storage-event 전달, 홈·재고 목록 위치 표시와 custom location
bounded search filter, storage mismatch 알림의 실제 위치 이름을 연결했습니다. AccountSheet의
추가·이름 수정·삭제, 연결된 manual food/receipt commit/shopping receive payload, 재고 filter
query와 mismatch-notification·detail-warning·planner-warning display를 connected E2E **7 passed**와 API targeted **7 passed**로 확인했습니다. 전체 API **491 passed,
8 warnings**, PostgreSQL contract **30 passed**, connected **87 passed**, fixture/mobile
**35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**,
protected runtime **28**, Vite **757 modules**를 확인했습니다. 실제 GitHub Actions,
managed PostgreSQL/Grocy 운영·외부 위치 mapping·온도 센서·실기기 camera/accessibility와
OneDrive placeholder I/O는 별도 gate로 남아 있으므로 총점은 **88/100**을 유지합니다
([custom storage location readback](evidence/custom-storage-location-readback-2026-09-09.md)).

Docker readiness diagnosis (2026-09-09): the local `desktop-linux` socket exists
but `_ping`/`docker info` hangs because the Docker VM console reports ext4 journal
and block write errors followed by a read-only remount. `Docker.raw` is about
926 GiB and the host Data volume is 96% full with about 35 GiB free. No Docker
data was pruned or reset; live PostgreSQL/Compose evidence remains an explicit
host-recovery gate. This changes the blocker diagnosis but not the project
score, which remains **88/100** while local/API/browser evidence continues
([Docker daemon readiness readback](evidence/docker-daemon-readiness-readback-2026-09-09.md)).

## Current self-review — 2026-09-09

사용자 정의 보관 위치의 후속 무결성·동기화 경계를 추가했습니다. 현재 lot가 사라진 뒤에도
storage event 또는 장보기 입고 operation이 위치 ID를 참조하면 `storage_location_in_use`
`409`로 삭제를 막아 이력의 이름을 보존하고, `FoodHistory`는 현재 위치 read model에서
이름을 해석해 이동 경로를 보여줍니다. AccountSheet에는 payload-free revision-only probe를
추가해 tab 복귀와 30초 주기로 다른 기기의 위치 변경을 감지하며, revision이 바뀌면 편집·삭제
확인 상태를 닫고 최신 목록을 다시 읽습니다. in-memory/SQLite/PostgreSQL별 revision marker와
conflict response header 우선순위를 각각 검증했습니다.

API 전체 **492 passed, 8 warnings**, PostgreSQL contract **30 passed**, connected 전체
**88 passed**(history 표시·삭제 guard·cross-device probe 포함), fixture/mobile **35 passed + 2 skipped**,
workspace-sync **9 passed**, Sites **4**, service-worker **5**, protected runtime **28**,
Vite **757 modules** build를 확인했습니다. Alignment **19/20**, Accuracy and safety
**16/20**, Product UX **19/20**, Reliability and data integrity **19/20**, Production
readiness **15/20**, 총점 **88/100**은 유지합니다. 운영 PostgreSQL multi-process race,
실제 background tab/device accessibility, managed failover, 외부 provider와 법정 retention은
여전히 별도 acceptance입니다 ([custom storage history readback](evidence/custom-storage-history-readback-2026-09-09.md)).

추가 CI release contract completeness 검증 (2026-09-09): web workflow에
`workspace-sync`·service-worker contract lane을 명시하고, `postgres-live` smoke에
custom location revision 증가와 history reference 후 `storage_location_in_use` `409`
삭제 guard readback을 연결했습니다. PostgreSQL contract **30 passed**, workflow YAML·shell
검증과 local mirror의 workspace-sync **9**, service-worker **5**, connected **88 passed**를
확인했습니다. GitHub Actions 실제 성공, runner artifact promotion, managed PostgreSQL
failover는 아직 별도 acceptance이므로 총점은 **88/100**을 유지합니다
([CI release contract readback](evidence/ci-release-contract-readback-2026-09-09.md)).

추가 release provenance manifest 검증 (2026-09-09): source head/branch/dirty state,
dependency lock·runtime lock·migration SHA-256과 compiled Sites artifact hash를
`rescue-meal-release-manifest-v1` JSON으로 묶고, secret·workspace data omission test와
required artifact 누락 fail-closed, web CI artifact upload를 연결했습니다. manifest test
**1 passed**, migration baseline **25 files**, artifact records **4**, PostgreSQL contract
**30 passed**를 확인했습니다.
실제 GitHub Actions artifact retention·signed provenance·release promotion은 별도
acceptance이므로 총점은 **88/100**을 유지합니다
([release provenance manifest readback](evidence/release-provenance-manifest-readback-2026-09-09.md)).

추가 planner cross-device revision safety 검증 (2026-09-09): 열린 planner가 다른 기기의
식단·재고 변경을 감지해도 현재 alternative·인분·lot 사용량 선택을 자동으로 덮지 않고,
사용자가 `최신 식단 확인`을 눌렀을 때만 최신 preview/latest를 다시 materialize하도록
연결했습니다. API 전체 **493 passed**, connected 전체 **89 passed**, fixture planner
**1 passed**, protected runtime **28**, Vite **757 modules** build를 확인했습니다.
실제 multi-device scheduling·server push ordering·managed failover는 별도 acceptance이므로
총점은 **88/100**을 유지합니다
([meal-plan cross-device readback](evidence/meal-plan-cross-device-readback-2026-09-09.md)).

추가 notification cross-device revision safety 검증 (2026-09-09): 열린 알림 센터가 초기
목록과 payload-free `/api/notifications/revision`을 함께 기억하고, tab 복귀·30초 bounded
probe에서 revision 증가를 감지하면 현재 알림을 최신 목록으로 자동 갱신하도록 연결했습니다.
전체 읽음 저장이 진행 중일 때는 probe와 목록 교체를 보류하고, 저장 완료 뒤 queued refresh로
최신 상태에 수렴합니다. API 전체 **494 passed, 8 warnings**, connected 전체 **91 passed**,
fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker
**5**, protected runtime **28**, Vite **757 modules** build를 disposable local mirror에서
확인했습니다. 실제 Web Push 전달 순서·multi-device scheduling·managed PostgreSQL failover와
background tab/device accessibility는 별도 acceptance이므로 총점은 **88/100**을 유지합니다
([notification cross-device readback](evidence/notification-cross-device-readback-2026-09-09.md)).

추가 dashboard cross-device revision safety 검증 (2026-09-09): 홈 dashboard read와 함께
payload-free `/api/dashboard/revision`을 확보하고, 홈 화면의 tab 복귀·30초 bounded probe에서
revision이 증가하면 최신 inventory와 Rescue Queue를 자동 재조회하도록 연결했습니다. sheet가
열렸거나 일반 dashboard sync가 진행 중이면 probe/응답 적용을 보류하고, background 안내가
조리 완료·계정 전환 등 사용자 toast를 덮지 않는 회귀를 추가했습니다. API 전체 **495 passed,
8 warnings**, connected 전체 **92 passed**, PostgreSQL contract **30 passed**, fixture/mobile
**35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**, protected
runtime **28**, Vite **757 modules** build를 확인했습니다. 실제 device background scheduling·
server push ordering·managed PostgreSQL failover는 별도 acceptance이므로 총점은 **88/100**을
유지합니다 ([dashboard cross-device readback](evidence/dashboard-cross-device-readback-2026-09-09.md)).

추가 shopping-list cross-device revision safety 검증 (2026-09-09): 열린 ShoppingListSheet가
목록 read와 payload-free `/api/shopping-list/revision`을 함께 기억하고, tab 복귀·30초 bounded
probe에서 revision 증가 시 최신 장보기 목록을 자동 반영하도록 연결했습니다. 체크·삭제·입고·
직접 추가 mutation 중에는 현재 목록을 보존하고, cross-tab refresh 요청은 mutation 완료 뒤
queued refresh로 처리했습니다. API 전체 **496 passed, 8 warnings**, connected 전체 **94 passed**,
PostgreSQL contract **30 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime
**28**, Vite **757 modules** build를 확인했습니다. 실제 multi-device scheduling·server push
ordering·managed PostgreSQL failover는 별도 acceptance이므로 총점은 **88/100**을 유지합니다
([shopping list cross-device readback](evidence/shopping-list-cross-device-readback-2026-09-09.md)).

추가 dashboard active-search cross-device safety 검증 (2026-09-09): dashboard revision refresh가
기본 inventory와 Rescue Queue뿐 아니라 현재 홈 검색 조건의 `inventory-search` channel도 다시
실행하도록 보완했습니다. 다른 기기 변경 뒤 검색 결과만 오래 남는 split-brain 상태와 dashboard
read race를 connected 회귀로 차단했습니다. API 전체 **496 passed, 8 warnings**, connected 전체
**95 passed**, fixture/mobile **35 passed + 2 skipped**, workspace-sync **9**, Sites **4**,
service-worker **5**, protected runtime **28**, Vite **757 modules** build를 확인했습니다.
실제 device background scheduling·multi-replica ordering·managed PostgreSQL failover는 별도
acceptance이므로 총점은 **88/100**을 유지합니다
([dashboard search cross-device readback](evidence/dashboard-search-cross-device-readback-2026-09-09.md)).

추가 receipt review queue cross-device safety 검증 (2026-09-09): 검수 대기 summary queue가
payload-free `/api/receipts/revision`을 목록과 함께 기억하고, queue sheet의 tab 복귀·30초
bounded probe에서 revision 증가 시 최신 summary만 자동 갱신하도록 연결했습니다. 실제
AddFoodSheet가 열리면 probe를 중단해 사용자가 검토 중인 OCR/draft를 덮지 않습니다. API 전체
**497 passed, 8 warnings**, connected 전체 **96 passed**, fixture/mobile **35 passed + 2 skipped**,
protected runtime **28**, Vite **757 modules** build를 확인했습니다. 실제 multi-device scheduling·
server push ordering·managed PostgreSQL failover는 별도 acceptance이므로 총점은 **88/100**을
유지합니다 ([receipt queue cross-device readback](evidence/receipt-queue-cross-device-readback-2026-09-09.md)).

추가 food-detail cross-device stale safety 검증 (2026-09-09): 열린 `FoodDetailSheet`가 다른
기기 변경을 감지해도 현재 상품 정보·보관·날짜 입력을 자동 교체하지 않고 stale alert를 표시하며,
사용자가 `최신 상태 확인`을 선택한 경우에만 최신 dashboard/food를 적용하도록 연결했습니다.
API 전체 **497 passed, 8 warnings**, connected 전체 **97 passed**, fixture/mobile **35 passed +
2 skipped**, protected runtime **28**, Vite **757 modules** build를 확인했습니다. 실제 device
background scheduling·server push ordering·managed PostgreSQL failover는 별도 acceptance이므로
총점은 **88/100**을 유지합니다
([food detail cross-device readback](evidence/food-detail-cross-device-readback-2026-09-09.md)).

추가 account settings cross-device stale boundary 검증 (2026-09-09): 열린 `AccountSheet`가
기존 dashboard revision을 visible-tab·30초 bounded probe로 확인하고, 더 높은 revision을 읽어도
알림 설정·사용자 정의 보관 위치·영수증 privacy·Grocy 하위 panel의 local draft와 확인 상태를
자동 교체하지 않도록 했습니다. 인증 account와 guest account 모두에 `다른 기기에서 계정 설정이
변경됐어요` alert를 표시하고, 사용자가 `최신 계정 설정 확인`을 눌러 dashboard sync가 성공한
뒤에만 parent refresh nonce로 하위 panel을 다시 읽습니다. authenticated account scenario
**1 passed**에 이어 canonical target의 guest branch connected scenario도 **1 passed**로
재실행했습니다. mirror TypeScript **passed**, protected runtime **28**, Vite **757 modules**,
initial client JS **323.11 kB**, AccountSheet **74.79 kB** build를 확인했습니다. 실제
multi-device scheduling·server push ordering·managed PostgreSQL failover·VoiceOver/TalkBack은
별도 acceptance입니다. 총점은 **88/100**을 유지합니다
([authenticated account settings readback](evidence/account-settings-cross-device-readback-2026-09-09.md),
[guest account settings readback](evidence/account-settings-guest-cross-device-readback-2026-09-10.md)).

추가 product-info write/read recovery 검증 (2026-09-10): PATCH가 성공한 뒤 후속
dashboard read가 실패하면 기존 구현이 이미 저장된 상품명·브랜드를 이전 local state로
되돌리는 lifecycle 결함을 확인했습니다. 성공한 `ApiFood` response를 먼저 local
read model에 반영하고, read refresh 실패는 별도 안내로 분리하도록 수정했습니다.
첫 `product_info_persistence_unavailable` 실패·inline retry·두 번째 PATCH 성공·최신
상품명 표시를 dedicated connected test **1 passed**로 확인했고, stale dashboard cache가
후속 read failure 때도 성공한 PATCH 결과를 덮지 않는 강화 회귀도 **1 passed**로
통과했습니다. 최종 수정 후 full connected suite도 **99 passed**로 통과했습니다.
실제 managed failover·reverse-proxy response reset·external provider는 별도 acceptance이므로
총점은 **88/100**을 유지합니다
([product-info write/read recovery readback](evidence/product-info-write-read-recovery-readback-2026-09-10.md)).

최종 frontend 회귀 상태도 갱신했습니다. demo fixture/mobile lane은 **35 passed + 3
skipped**(production-only test는 별도), production fail-closed boot scenario는 명시적
환경에서 **1 passed**, 최종 connected lane은 **99 passed**입니다. `npm run check:runtime`
**28 protected files**, TypeScript/Vite **757 modules**, Sites **4 passed**도 최종 상태에서
확인했습니다. 실제 기기·외부 provider·managed 운영 acceptance는 아직 남아 있으므로
총점은 **88/100**을 유지합니다
([frontend runtime port-isolation readback](evidence/frontend-runtime-port-isolation-readback-2026-09-10.md)).

## Current self-review — 2026-09-11 dashboard baseline recovery

최종 current source connected rerun에서 dashboard cross-device test 하나가 실패했습니다.
초기 dashboard response가 `mealApi.workspaceRevision`만 갱신하고 polling baseline ref를
갱신하지 않아, 연결 직후 visibility probe가 remote revision을 초기 baseline으로 소비한
lifecycle 결함이었습니다. 테스트 timeout을 완화하지 않고 초기 성공 read 적용 시
`rememberDashboardRevision(mealApi.workspaceRevision)`을 호출하도록 수정했습니다.

수정 후 focused dashboard regression **1 passed**(`8074/4474`), full connected browser
**101 passed**(`8075/4475`), API **499 passed / 8 warnings**, fixture/mobile **35 passed + 3
skipped**(`4476`), production fail-closed **1 passed**(`4477`), TypeScript/Vite **757 modules**,
Sites **4 passed**, shell/Node/workflow YAML/diff checks passed를 확인했습니다. 이 결과는
frontend·backend local integration의 현재 baseline을 강화하지만, 실제 device camera/VoiceOver/
TalkBack, provider delivery, managed PostgreSQL failover, object-storage lifecycle, production
cutover를 증명하지 않으므로 총점은 **88/100**으로 유지합니다.

추가 native narrow-viewport 검증: `VITE_APP_SHELL=native` 320×740 viewport에서 body/document/
device screen/home horizontal overflow와 visible interactive bounds를 검사하고, 식품 추가와 주요
식단·알림·계정·상세 bottom sheet bounds, 125% text preference 상태를 `NATIVE_RUNTIME_TEST_PORT=4487
npm run test:native` **4 passed**로 고정했습니다. 이는 브라우저 기반 좁은 폭 회귀를 증명하지만 실제 OS
font scale·iOS/Android camera·VoiceOver/TalkBack은 별도 acceptance이므로 총점은 **88/100**을
유지합니다.

추가 Playwright server cleanup 검증: fixture/native webServer가 `npm` wrapper를 남기지 않도록
`check:runtime && exec ./node_modules/.bin/vite`로 직접 실행하도록 보완했습니다. fixture
focused `4488`과 native focused `4489`가 각각 **1 passed**하고 종료 후 전용 port가 free임을
확인했습니다. full fixture `4490`은 **35 passed + 3 skipped**, full native `4491`은 **4 passed**로
통과했고 두 port도 free였습니다. production supervisor lifecycle은 별도 acceptance입니다.

추가 authoritative mutation readback Module 검증: product-info/date/provenance/manual food/receipt
commit의 성공 response를 후속 stale dashboard read가 덮지 않도록 `mutationReadback.ts`에 공통
ordering을 모으고, empty response·read false·read throw contract를 **3 passed**로 고정했습니다.
manual/receipt와 product/date/provenance connected targeted 회귀, full connected **101 passed**,
TypeScript/Vite **759 modules** build를
확인했으며 총점은 외부 운영 acceptance가 남아 **88/100**을 유지합니다.

추가 optimistic storage mutation Module 검증: move/open sequence·consume·discard의 optimistic
apply/restore/readback ordering을 공통화하고, contract **3 passed**, storage connected targeted
**3 passed**, full connected **101 passed**, fixture/mobile **35 passed + 3 skipped**, native
**4 passed**, TypeScript/Vite **759 modules**를 확인했습니다. 외부 provider transaction·managed
failover·실기기 acceptance는 남아 있으므로 총점은 **88/100**을 유지합니다.

추가 container smoke 재검증: storage response snapshot 변경 이후 disposable packaged stack
`rescue-meal-container-smoke-91136`에서 migration **25**, API/OCR readiness, guest dashboard
**7→8**, same-key replay **201 + replay header**, exact resource cleanup을 통과했습니다.
managed PostgreSQL failover·provider delivery·production cutover는 여전히 별도 acceptance입니다.

추가 response-only persistence 검증: storage event inventory snapshot은 response copy에만
포함하고 durable SQLite/PostgreSQL event payload에서는 제거했습니다. API targeted **2 passed**와
full API **499 passed / 8 warnings**, packaged smoke `rescue-meal-container-smoke-2956`의
migration **25**·readiness·guest **7→8**·replay·exact cleanup을 확인했습니다.

## Current self-review — 2026-09-11 guest transport and exact replay hardening

guest workspace transfer의 자체 frontend fetch를 `mealApi` 중앙 Interface로 수렴해 account
session/source guest token 분리, typed error, timeout, target workspace revision 전파와 re-entry
abort를 한 곳에서 관리하도록 했습니다. connected guest registration/conflict **2 passed**와
full connected **101 passed**로 import/retry/conflict 흐름과 revision header 전파를 확인했습니다.

또한 storage-event sequence의 deterministic replay가 짧은 prefix payload를 `200`으로 반환할 수
있던 실제 red 결함을 수정해, persisted tail/orphan cardinality를 함께 검사하고 `409`로 닫았습니다.
수정 후 backend **500 passed / 8 warnings**, fixture/mobile **36 passed + 3 skipped**, native
**6 passed**, TypeScript/Vite **759 modules**, Sites **4 passed**를 확인했습니다.

이번 변경은 transport·replay safety의 Locality를 높이지만 실제 기기 camera/accessibility,
외부 provider delivery, managed PostgreSQL failover/network partition, object-storage retention,
signed artifact와 production cutover는 여전히 별도 acceptance입니다. 따라서 scorecard는
**88/100**을 유지합니다.

## Current self-review — 2026-09-11 current-source verification stability

현재 response-only storage snapshot source를 기준으로 connected 전체 **101 passed**(`8116/4516`),
API 전체 **499 passed / 8 warnings**, fixture/mobile **36 passed + 3 skipped**(`4500`, worker 1),
native 320px **4 passed**(`4501`), TypeScript/Vite **759 modules**, Sites **4 passed**를 재확인했습니다.
mutation-readback **3**, optimistic-mutation **3**, workspace-sync **9**, service-worker **5**,
release-manifest **2** contract도 통과했습니다. iOS 설치 안내 focused 반복은 **10 passed**입니다.

connected 전체와 fixture 병렬 lane에서 관찰된 일회성 page-close/locator 실패는 별도 동시·잔류
Playwright/Vite 프로세스가 있던 호스트에서만 발생했고, focused 반복과 정리된 전체 rerun에서는
재현되지 않았습니다. 이를 제품 결함이 해결됐다는 근거로 과장하지 않고, 테스트 실행 환경의
재현성 경계로 기록합니다. 실제 iOS/Android camera·VoiceOver/TalkBack, 외부 provider delivery,
managed PostgreSQL failover/network partition, object-storage retention, signed artifact와
production cutover는 여전히 별도 acceptance이므로 점수는 **88/100**을 유지합니다.

추가 date assertion write/read recovery 검증 (2026-09-11): 성공한 날짜 PATCH response를
먼저 local read model에 반영하고, 후속 dashboard read와 stale cache가 사용자 확인 날짜를
덮지 않도록 보완했습니다. typed failure→retry와 성공 write 후 read failure를 dedicated
connected **2 passed**로 확인했으며, 최종 full connected suite는 **100 passed**로 통과했습니다.
실제 managed failover·reverse-proxy response reset·provider/device acceptance는 별도이므로
총점은 **88/100**을 유지합니다
([date write/read recovery readback](evidence/date-write-read-recovery-readback-2026-09-11.md)).

추가 reproducible container smoke 검증 (2026-09-11): 수동으로 확인했던 API
container boot/read-write 경계를 `infra/container-smoke.sh`로 고정했습니다. PID-scoped
Compose project collision guard, PostgreSQL·OCR/API readiness, migration `001→025`,
guest normalized write `7→8`, same-key replay와 `--rmi local` cleanup을 실제 실행해
통과했습니다. CI `container-boot` job에도 연결했으며, managed failover·object-storage
retention/encryption·production cutover는 별도 acceptance이므로 총점은 **88/100**을
유지합니다
([container smoke readback](evidence/container-smoke-readback-2026-09-11.md)).

추가 API container boot post-fix live gate 검증 (2026-09-10): recipe catalog를 이미지에
패키징하고 root build context를 사용하는 rebuilt API/migrate/OCR stack을 disposable
Compose project에서 실제 기동했습니다. PostgreSQL·migration `001→025`·OCR worker와
FastAPI `/health`·`/ready`, guest auth, normalized dashboard read/write `7→8`, 동일
Idempotency-Key replay `201 + X-Idempotency-Replayed: true`를 통과시키고 exact resources를
제거했습니다. managed PostgreSQL failover·object-storage encryption/retention·production
cutover는 여전히 별도 acceptance이므로 총점은 **88/100**을 유지합니다
([API container boot readback](evidence/api-container-boot-readback-2026-09-10.md)).

## Current self-review — 2026-09-10

canonical 작업본을 `/Users/kimminkyu/Bagelcode/Repository_Personal/rescue-meal`로
이동한 뒤 frontend/backend 통합 검증을 대상 경로에서 다시 수행했습니다. fixture/mobile은
**35 passed + 3 skipped**(production-only test는 별도 실행), connected는 account stale fixture 보강과 shopping read retry를
포함해 **101 passed**, API 전체 최신 baseline은 **499 passed, 8 warnings**, PostgreSQL contract는
**30 passed**, protected runtime **28**, Vite **757 modules**, Sites **4**,
service-worker **5**, workspace-sync **9**, release manifest **1**입니다.

Docker Desktop이 회복된 후 disposable PostgreSQL normalized live gate도 실제로 통과했습니다.
migration ledger `001→025`·재실행 25 rows, `/ready`, metrics token non-disclosure,
custom storage/provenance/search/history, backup/restore, connection lifecycle/pool,
multi-process receive 4 rounds, crash/idempotency, account deletion, direct connection
recovery를 readback했습니다. 동시에 `GET /api/shopping-list` derived reconciliation의
실제 concurrent `409`를 발견해 winner snapshot reload + 1회 bounded retry와 API regression을
추가했습니다. 총점은 외부 provider·managed failover·실기기·법정 retention·GitHub Actions
현재 dirty head promotion이 아직 검증되지 않았으므로 **88/100**을 유지합니다.

([PostgreSQL live readback](evidence/postgres-live-readback-2026-09-10.md))

추가 portable PostgreSQL client wrapper 검증 (2026-09-10): 호스트에
`pg_dump`·`pg_restore`·`psql`이 없는 macOS 경계에서 backup/restore를 같은
스크립트로 재현할 수 있도록 `auto`·`host`·`docker` 선택기를 추가했습니다.
Docker mode는 `postgres:16-alpine` client image, archive parent mount,
`host.docker.internal` loopback mapping, DSN environment pass-through를 사용하고
기존 client/server major guard·mode 600·empty target restore guard를 유지합니다.
shell/argument contract와 disposable PostgreSQL 16에서 migration `001→025` 후
data-bearing archive 생성·빈 DB restore·normalized lot 1건 및
`storage_condition_text` readback을 통과했습니다. host/Docker 모두 없는 경우에는
archive 작업 전에 exit 1로 닫힙니다. 실제 image digest 승인, object-storage
encryption/retention/scheduler, managed failover, production cutover는 아직
운영 acceptance이므로 점수는 **88/100**을 유지합니다
([portable client wrapper readback](evidence/postgres-client-wrapper-readback-2026-09-10.md)).

추가 fixture runtime port isolation 검증 (2026-09-10): 기본 `4174` 포트가 다른
로컬 앱에 점유된 상태에서 fixture lane이 잘못된 앱을 재사용해 35개가 공통으로
실패하는 원인을 확인했습니다. `playwright.config.ts`에 Vite `--strictPort`와
기본 `reuseExistingServer=false`를 적용하고, 명시적 재사용은
`MOBILE_RUNTIME_REUSE_SERVER=1`로만 허용했습니다. 점유 포트 negative check는
테스트 실행 전에 명확한 already-used 오류로 종료했고, 전용 포트
`MOBILE_RUNTIME_TEST_PORT=4451 npm run test:runtime`은 **35 passed + 2 skipped**로
통과했습니다. 이는 실제 device camera/accessibility나 connected/managed 운영을
증명하지 않으므로 총점은 **88/100**을 유지합니다
([frontend runtime port-isolation readback](evidence/frontend-runtime-port-isolation-readback-2026-09-10.md)).

## Current self-review — 2026-09-11 storage mutation recovery

storage move/open/consume/discard caller의 반복 recovery choreography를
`storageMutationRecovery.ts`로 수렴했습니다. `optimisticMutation.ts`의 primitive와
`mutationReadback.ts`의 authoritative response ordering은 합치지 않았고, caller가
operation identity·도메인 오류 의미·Grocy status·global toast를 계속 소유합니다.

pure contract **4 passed**, storage connected targeted **14 passed**, full connected **103 passed**,
API **500 passed / 8 warnings**, fixture/mobile **36 passed + 3 skipped**, native **6 passed**,
TypeScript/Vite **760 modules**, Sites **4 passed**를 확인했습니다. 이번 Module은 mutation reject와
성공 mutation 후 readback 실패를 구분하고, 실패 시 reconciliation을 한 번만 수행하며,
reconciliation 뒤 retry 실패에서는 stale snapshot을 다시 복원하지 않도록 해 사용자 retry의
Locality를 높였습니다.

실제 device camera/accessibility, 외부 provider delivery, managed PostgreSQL failover/network
partition, object-storage retention, signed artifact와 production cutover는 여전히 별도
acceptance이므로 점수는 **88/100**을 유지합니다.

## Current self-review — 2026-09-11 native accessibility, touch, and Pixel pass

현재 UI source에는 카메라 권한 거부 `aria-live`/`aria-atomic`, intake tab/tabpanel semantics와
roving focus, iOS install guidance의 `aria-expanded`/`aria-controls`, Home·sheet large-text
`rem` baseline, 44px touch target, Pixel Android navigation viewport edge 계약이 추가되어 있습니다.
큰 글자 상태에서 Home greeting은 `24→30px`, priority heading은 `17→21.25px`로 증가하고,
393px의 primary action은 native navigation 위에 남습니다. Pixel screen `427×952`에서는 app
viewport·bottom sheet bottom `1028px`, Android navigation top `1029px`를 readback했습니다.

현재 source 회귀는 fixture/mobile **38 passed + 3 skipped**(Pixel·visible-control accessibility regression 포함), native **9 passed**,
PWA guidance focused, storage recovery pure contract **3 passed**, optimistic mutation **3 passed**,
build **760 modules**, Sites **4**, service-worker **5**, workspace-sync **9**, release manifest **2**를
통과했습니다. 이 증거는 Product UX·local build/runtime boundary를 강화하지만 실제 VoiceOver/
TalkBack/Dynamic Type·camera/OEM insets·외부 provider·managed failover·signed production artifact는
여전히 별도 acceptance이므로 총점은 **88/100**을 유지합니다.

세부 readback은 [large-text](evidence/large-text-readback-2026-09-11.md),
[touch target](evidence/touch-target-readback-2026-09-11.md),
[Pixel safe-area](evidence/android-pixel-preview-readback-2026-09-11.md),
[storage build contract](evidence/storage-mutation-recovery-build-readback-2026-09-11.md)에 연결됩니다.

## Current self-review — 2026-09-11 receipt commit error envelope

receipt finalization 일반 persistence failure가 내부 transaction ID를 포함한 plain string으로
응답하던 contract drift를 수정했습니다. rollback과 `needs_reconciliation` marker 보존은 유지하고,
사용자용 detail·`retryable=true`·`action=retry_later`만 담은
`receipt_commit_persistence_unavailable` typed `503`으로 통일했습니다. transaction ID와 예외 원문은
response에 노출하지 않습니다.

finalization·pending marker·reconciliation marker targeted **3 passed**, backend 전체 **500 passed /
8 warnings**, connected 전체 **103 passed**, fixture/mobile **36 passed + 3 skipped**, native **6
passed**, TypeScript/Vite **760 modules**를 확인했습니다. 이는 API/UI 오류 계약의 Locality를 강화하지만
실제 provider delivery·managed failover·device acceptance는 별도이므로 총점은 **88/100**을 유지합니다.

## Current self-review — 2026-09-11 meal-plan completion error envelope

single-plan completion의 regular flush failure가 plain string으로 내려가던 API/UI contract drift를
수정했습니다. `WorkspaceMutation` rollback과 `completed`/`already_completed`/linked bundle
semantics는 유지하고, backend는 `meal_plan_completion_persistence_unavailable` typed `503`을
반환합니다. `MealPlanSheet`는 실패 당시 plan·consumption payload를 보존해 이 code에만 inline
`다시 시도`를 표시하며, workspace conflict·allocation validation에는 blind retry를 제공하지
않습니다.

red→green completion envelope/rollback API targeted **3 passed**, typed 503 retry connected **1
passed**, backend 전체 **500 passed / 8 warnings**, full connected **104 passed**, fixture/mobile
**38 passed + 3 skipped**, native **9 passed**, TypeScript/Vite **760 modules**, Sites **4 passed**와
release manifest **2 passed**를 확인했습니다. 이는 planner failure recovery와 오류 계약의 Locality를
강화하지만 external Grocy/provider transaction·managed PostgreSQL failover/partition·physical
device·signed promotion·production cutover은 여전히 별도 acceptance이므로 총점은 **88/100**을
유지합니다 ([meal-plan completion envelope readback](evidence/meal-plan-completion-envelope-readback-2026-09-11.md)).

## Current self-review — 2026-09-11 account first-fold reachability

fresh native `393 x 852` capture에서 guest account sheet의 `snap=0.7` 초기 높이가
`로그인` primary action을 `y=829.7..873.7px`로 잘라 첫 화면에서 완전히 누를 수 없게
만드는 UI 결함을 확인했습니다. account sheet만 `snap=0.8`로 조정해 sheet top을 `170px`로
올리고, entrance spring settle 이후 `34px` iPhone safe-area boundary를 넘지 않는지 회귀로
고정했습니다. accepted capture는 계정 lead·비밀번호 재설정·tabs·두 입력·로그인 action을
한 화면에 보여 줍니다.

현재 source 검증은 focused account first-fold **1 passed**, native 전체 **14 passed**,
fixture/mobile **39 passed + 3 skipped**, latest full connected **107/107 passed**, build **760 modules**,
protected runtime **28 files**, Sites/service-worker/workspace-sync/release manifest
**4/5/9/2 passed**, diff-check passed입니다. 이는 local browser/native-shell geometry와
interaction contract의 개선 증거이며 실제 VoiceOver/TalkBack speech, OS Dynamic Type,
physical home-indicator compositor, OEM inset과 signed production promotion은 별도
acceptance이므로 총점은 **88/100**을 유지합니다.

Readback: [account sheet first-fold](evidence/account-sheet-first-fold-readback-2026-09-11.md).

## Current self-review — 2026-09-11 food detail first-fold reachability

fresh native `393 x 852` capture에서 food detail sheet의 `snap=0.78` 초기 높이가
`개봉됨` 상태 컨트롤을 `y≈822px`에서 시작하게 해 calibrated iPhone safe-area
boundary `818px` 아래로 일부 잘라내고, 후속 `snap=0.84`에서도 `먹었어요`·
`보관 상태 저장`이 `y=843.2..887.2px`로 남는 UI 결함을 확인했습니다. detail sheet를
`snap=0.93`으로 조정해 sheet top을 `60px`로 올리고, entrance spring settle 후
state toggle와 primary action row의 bottom이 `34px` safe-area boundary 위에 남는지
회귀로 고정했습니다. accepted capture는 food hero·date proof·warning·provenance·
storage choices·opened state·primary mutation actions를 한 화면에 보여 줍니다.

현재 source 검증은 focused detail first-fold **1 passed**, native 전체 **14 passed**,
fixture/mobile **39 passed + 3 skipped**, connected detail/first-opened targeted **3
passed**, latest full connected **107/107 passed**, build **760 modules**, protected runtime **28 files**, Sites/service-worker/
workspace-sync/release manifest **4/5/9/2 passed**, diff-check passed입니다. 이는 local
browser/native-shell geometry와 interaction contract의 개선 증거이며 실제 VoiceOver/
TalkBack speech, OS Dynamic Type, physical compositor/OEM inset과 signed production
promotion은 별도 acceptance이므로 총점은 **88/100**을 유지합니다.

Readback: [food detail first-fold](evidence/food-detail-first-fold-readback-2026-09-11.md).

## Current self-review — 2026-09-11 inventory search pagination lifecycle

The server-search effect previously coupled query lifecycle to the identity of the
`storageLocations` presentation list. A late dashboard/storage-location update could
clear the active rows and restart page zero while the user was requesting the next page,
which produced an occasional second request with `offset=0`.

The current source keeps the latest locations in a ref for search materialization and
reconciles only location names when the presentation list changes. Pagination focused
**10 passed**, PDF/manual-priority/planner focused **3/3/3 passed**, fixture/mobile **39
passed + 3 skipped**, build **760 modules**, protected runtime **28**, Sites/service-worker/
workspace-sync/release manifest **4/5/9/2 passed**, and diff-check passed.

An earlier long connected run collected **106 tests** and returned **103 passed / 3
timing-sensitive failures**. After the inventory pagination lifecycle fix, the fresh full
connected rerun collected **106/106 passed (4.0m)**. The earlier run remains historical
evidence; the current full lane is clean. Total score remains **88/100** until physical
VoiceOver/TalkBack/Dynamic Type/device gates are addressed.

Readback: [inventory search pagination lifecycle](evidence/inventory-search-pagination-readback-2026-09-11.md).

## Current self-review — 2026-09-11 food detail narrow viewport

The detail sheet needed a large `snap=0.93` at 393×852 to keep its mutation actions
visible, but that fixed height clipped the sheet title at `y=-52px` on a 320×740
viewport. The app-owned Prototype now derives a bounded snap from the live viewport:
393×852 keeps the existing composition, while 320×740 settles at `y=8..740px` with
the title visible at `y=47.2..69.2px`.

Focused narrow major-sheet **1 passed**, full native **14 passed**, fixture/mobile
**39 passed + 3 skipped**, build **760 modules**, protected runtime **28**, and
diff-check passed. This improves local responsive/native geometry; physical compositor,
Dynamic Type, VoiceOver/TalkBack and OEM insets remain separate acceptance gates.

Readback: [food detail narrow viewport](evidence/food-detail-narrow-viewport-readback-2026-09-11.md).

## Current self-review — 2026-09-11 modal keyboard focus containment

The receipt BottomSheet now has permanent fixture coverage for **24 forward Tab** and
**24 reverse Shift+Tab** steps. Every active element remains inside the open dialog,
and Escape restores focus to the original `식품 추가하기` trigger.

Focused containment **1 passed**, fixture/mobile **39 passed + 3 skipped** across **42
tests**, native **14 passed**, build **760 modules**, and diff-check passed. This proves
DOM keyboard containment and restoration; physical VoiceOver/TalkBack/Switch Control
speech and narration remain separate device acceptance gates.

Readback: [modal focus containment](evidence/modal-focus-containment-readback-2026-09-11.md).

## Current self-review — 2026-09-11 food detail action reachability

At 320×740, the responsive detail sheet now proves max-scroll reachability for its
primary mutation row. After scrolling `.sheet-content` to its end, `.detail-actions`
measures `y=577.875..621.875px` against the safe-area boundary `706px`.

Focused scroll regression **1 passed**, native 전체 **14 passed**, fixture/mobile **39
passed + 3 skipped** across **42 tests**, build **760 modules**, protected runtime **28**,
and diff-check passed. This is local native-shell scroll evidence; physical touch
physics, VoiceOver rotor behavior, Dynamic Type and OEM insets remain separate gates.

Readback: [food detail action reachability](evidence/food-detail-action-reachability-readback-2026-09-11.md).

## Current self-review — 2026-09-11 food detail large-text narrow reachability

At `320×740` with `html { font-size: 125%; }`, the detail title remains `23.75px`
and the max-scroll primary actions end at `y=622.109px`, below the `706px` safe-area
boundary. Document/body width remains `320px`.

Focused large-text native regressions **2 passed**, native 전체 **14 passed**, fixture/mobile
**39 passed + 3 skipped** across **42 tests**, build **760 modules**, protected runtime **28**,
and diff-check passed. This proves local large-text scroll reachability; physical Dynamic
Type, font substitution, VoiceOver/TalkBack and OEM rendering remain separate gates.

Readback: [food detail large-text narrow](evidence/food-detail-large-text-narrow-readback-2026-09-11.md).

## Current self-review — 2026-09-11 account deletion error envelope

account deletion의 durable `deleting` fence와 purge 재개 경계를 유지하면서, regular persistence
failure를 `account_deletion_persistence_unavailable` typed `503`으로 정렬했습니다. 응답에는
password·token·email·예외 원문을 넣지 않고, AccountSheet는 해당 code일 때만 현재 입력한
비밀번호와 `DELETE` payload로 재시도하는 inline action을 표시합니다. `401`·`422`·`429`와
typed code 없는 `503`에는 삭제 retry action을 노출하지 않습니다.

수정 전 purge-failure red regression, 수정 후 API targeted **3 passed**, typed retry/rate-limit
connected **2 passed**, backend 전체 **500 passed / 8 warnings**, full connected **105 passed**,
fixture/mobile **38 passed + 3 skipped**, native **11 passed**, TypeScript/Vite **760 modules**를
확인했습니다. 이 변경은 local account/workspace recovery의 설명 가능성을 높이지만 auth/workspace
distributed transaction, backup/WAL/object-storage/Grocy 삭제, managed failover, production
cutover은 별도 acceptance이므로 총점은 **88/100**을 유지합니다
([account deletion envelope readback](evidence/account-deletion-envelope-readback-2026-09-11.md)).

## Current self-review — 2026-09-11 native sheet settle measurement

food-detail first-fold native 회귀가 spring 중간 transform에서 조기 측정되어 `818.008972px`를
간헐적으로 실패시키던 test lifecycle 문제를 분리했습니다. protected BottomSheet와 제품 layout은
건드리지 않고, native helper가 sheet entrance transform이 `none`이 된 뒤 safe-area geometry를
검사하도록 보강했습니다. 보강 후 native 전체 **11 passed**, fixture/mobile **38 passed + 3
skipped**, build **760 modules**가 green이며 physical compositor·VoiceOver/TalkBack·Dynamic Type는
별도 acceptance입니다 ([native sheet settle readback](evidence/native-sheet-settle-readback-2026-09-11.md)).

## Current self-review — 2026-09-11 single meal-plan save error envelope

single meal-plan save의 regular `WorkspaceMutation` flush failure가 raw `RuntimeError`로 전파되던
API/UI contract drift를 수정했습니다. backend는 `meal_plan_persistence_unavailable` typed `503`을
반환하고, `MealPlanSheet`는 실패 당시 preview payload를 유지해 이 code에만 inline `다시 시도`를
제공합니다. plan lock, saved audit rollback, same-plan concurrency replay, snapshot/recipe conflict와
validation semantics는 유지했습니다.

red→green save envelope/phantom API targeted **4 passed**, typed save retry connected **1 passed**,
backend 전체 **500 passed / 8 warnings**, fresh full connected **106 passed (3.9m)**, fixture/mobile
**38 passed + 3 skipped**, native **11 passed**, TypeScript/Vite **760 modules**를 확인했습니다.
이전 long connected run의 **103/106** timing-sensitive failures는 별도 evidence로 보존합니다.
multi-day bundle persistence, external provider transaction, managed PostgreSQL failover/partition과
production cutover은 별도 acceptance이므로 총점은 **88/100**을 유지합니다
([meal-plan save envelope readback](evidence/meal-plan-save-envelope-readback-2026-09-11.md)).

## Current self-review — 2026-09-11 multi-day bundle save error envelope

multi-day bundle save의 regular `WorkspaceMutation` flush failure가 raw `RuntimeError`로 전파되던
API/UI contract drift를 수정했습니다. backend는 `multi_day_plan_persistence_unavailable` typed
`503`을 반환하고, `MealPlanSheet`는 실패 당시 bundle payload를 유지해 3일 식단 영역에 이 code 전용
inline `다시 시도`를 표시합니다. bundle lock/replay/history/latest, snapshot conflict, linked day
completion semantics와 preview side-effect-free 경계는 유지했습니다.

red→green bundle envelope/rollback API targeted **4 passed**, typed bundle retry connected **1 passed**,
backend 전체 **507 passed / 8 warnings**, final full connected **107/107 passed**, fixture/mobile
**39 passed + 3 skipped**, native **14 passed**, build **760 modules**, Sites **4 passed**, release
manifest **2 passed**를 확인했습니다. multi-day external provider transaction·distributed bundle
transaction·managed failover/partition은 별도 acceptance이므로
총점은 **88/100**을 유지합니다
([multi-day save envelope readback](evidence/multi-day-save-envelope-readback-2026-09-11.md)).

## Current self-review — 2026-09-11 operational readiness/worker typed 503 envelope

운영 장애 경계에서 plain `503`으로만 전달되던 상태를 점검해 API readiness 저장소/auth 설정,
workspace acquisition, OCR worker model readiness/capacity, 내부 worker token 설정, recipe
review/import 설정, guest provisioning과 account session 발급을
`code`, `retryable`, `action`을 가진 safe envelope로 정렬했습니다. 일시 장애만 bounded retry와
`Retry-After: 1`을 허용하고 설정 누락은 `configure_server`/`configure_storage`로 중단하며,
exception 원문·token·workspace data는 노출하지 않습니다.

수정 전 API red **4 failed**, 초기 slice 후 API **504 passed**, auth/recipe configuration closure 후
API 전체 **507 passed**, OCR worker 전체 **10 passed**,
`git diff --check`를 확인했습니다. 이 변경은 Reliability/Production readiness의 local
operational classification을 보강하지만, external load balancer/provider, managed PostgreSQL
failover, model cold-start, physical device와 signed production deployment는 여전히 별도 gate이므로
총점은 **88/100**을 유지합니다
([operational 503 envelope readback](evidence/operational-503-envelope-readback-2026-09-11.md)).

## Current self-review — 2026-09-12 workspace export rate limit

민감한 전체 workspace export에 IP·opaque workspace 이중 bucket rate limit을 추가하고,
한도 초과 시 `account_export_rate_limited` typed `429`와 `Retry-After`를 반환하도록 보강했습니다.
AccountSheet는 Blob/download를 만들지 않고 잠시 후 재시도 안내를 표시합니다. export success
schema와 secret non-disclosure는 유지하며 큰 workspace streaming/compression과 actor/time audit은
별도 운영 범위로 남겼습니다.

export API targeted **2 passed**, typed 429 connected **1 passed**, API 전체 **508 passed / 8 warnings**,
TypeScript/Vite **760 modules**, full connected **108/108 passed (5.0m)**를 확인했습니다. 앞선
date-retry/server lifecycle failure는 historical run으로 분리했습니다.
이는 local export security boundary를 보강한 결과이며, external gateway abuse control·managed
PostgreSQL/backup retention·production rate-limit tuning은 별도 gate이므로 총점은 **88/100**을
유지합니다 ([export rate-limit readback](evidence/export-rate-limit-readback-2026-09-12.md)).

## Current self-review — 2026-09-12 food detail responsive first-fold

Fresh native captures exposed two related layout gaps: at `393×852`, the
destructive detail action ended at `869.296px` below the `818px` iPhone safe
boundary; at `320×740`, the primary mutation row ended at `756.953px` below the
`706px` initial safe boundary. The detail snap now uses a bounded live-viewport
calculation with `0.993` maximum, and the repeated supporting cards tighten only
at `max-width: 360px`. The 44px action boxes and safety hierarchy remain intact.

Current settled geometry is `393×852` sheet `y=6..852`, primary actions
`y=717.484..761.484`, destructive action `y=773.484..817.484`; `320×740`
primary actions `y=646.641..690.641`. Focused detail regressions passed **2**,
full native **14 passed**, fixture/mobile **39 passed + 3 skipped**, build **760
modules**, protected runtime **28**, Sites/service-worker/workspace-sync/release
manifest **4/5/9/2 passed**, and `git diff --check` passed. This is local
native-shell evidence; physical VoiceOver, Dynamic Type font substitution, OEM
insets, and signed production promotion remain separate acceptance gates. Total
score remains **88/100** ([food detail compact first-fold readback](evidence/food-detail-first-fold-compact-readback-2026-09-12.md)).

The same narrow-width pass raises home queue secondary metadata from `7px` to
`8px`. Fresh `320×740` capture confirms `50px` queue rows, unchanged CTA/nav
geometry (`y=509.031..551.031` and `y=628..706`), and document/body width
`320px`; focused home **1 passed** and the full native lane remains **14 passed**.

## Current self-review — 2026-09-12 container hardening/operations runbook

운영 컨테이너를 uid `10001` 비root·`no-new-privileges`·json-file 로그
`10m×3` rotation·서비스별 memory limit 경계로 고정하고, 시작 시 `uv run`
재검증을 제거해 build-time venv 바이너리를 직접 실행하도록 정리했습니다.
migration ledger smoke 검증은 checked-in `NNN_*.sql` 수를 기대값으로 사용해
additive migration 추가 시 깨지지 않습니다. 배포·롤백·백업/복구·스케일링·장애
분류 절차는 `docs/operations-runbook.md`에 묶었습니다.

Compose `config --quiet`(기본·worker profile), 전체 container smoke
(`migration_rows: 26`, `/ready` ×2, guest write `7 -> 8`, idempotent replay
`201`)를 통과하고 실행 중 `uid=10001`·`no-new-privileges`·`mem=1g`·
`log=json-file/10m`을 실제 컨테이너에서 확인했습니다. read-only rootfs·
seccomp·image digest pinning·orchestrator 리소스 필드·signed deployment는
별도 운영 gate이므로 총점은 **88/100**을 유지합니다
([container hardening readback](evidence/container-hardening-readback-2026-09-12.md)).

## Current self-review — 2026-09-12 workspace export actor/time audit

Export success now records a server-side `WorkspaceExportAuditEvent` containing only verified
actor/role, safe request ID, schema version, and UTC generation time. The event is excluded from the
downloaded workspace JSON, does not advance the workspace revision, and is removed by reset/purge.
Audit persistence failure returns `account_export_audit_persistence_unavailable` typed `503` before
any snapshot is returned or frontend Blob/download is created. SQLite persistence/reconstruction and
the PostgreSQL workspace-scoped SQL/readiness contract are covered; live export-audit behavior on a
managed PostgreSQL instance remains unverified.

The adjacent guest-registration preview race was also fixed at the producer boundary: the explicit
registration preview and the `authMe` effect can no longer issue duplicate previews concurrently.
Current verification is API **512 passed / 8 warnings**, connected **109/109 passed (4.8m)**,
fixture/mobile **39 passed + 3 skipped**, native **14 passed**, build **760 modules**, protected
runtime **28**, Sites/service-worker/workspace-sync/release manifest **4/5/9/2 passed**. Total score
remains **88/100** because audit operations/retention, large export streaming/compression, managed
PostgreSQL export audit readback/failover, external providers, physical device accessibility, and
signed production promotion remain separate acceptance gates ([export audit readback](evidence/export-audit-readback-2026-09-12.md), [guest preview readback](evidence/guest-transfer-preview-single-flight-readback-2026-09-12.md)).

## Current self-review — 2026-09-13 perf baseline smoke

`infra/perf-smoke.sh`와 stdlib 전용 측정기 `services/api/scripts/perf_smoke.py`로
disposable production-shaped 스택의 첫 performance baseline을 확보했습니다.
순차 read 120·동시 read 100·동시 write 24·same-key 동시 replay 8에서 오류 0,
read p50 15.3ms/p95 204ms(동시), write p95 209ms, 같은 key 동시 요청이 단일
mutation으로 수렴하고 `food_count`가 정확히 반영됐습니다. 단일 호스트 참조값이며
운영 SLO·p99·지속 부하·OCR 동시 추론·reverse proxy 오버헤드는 별도
acceptance이므로 총점은 **88/100**을 유지합니다
([perf baseline readback](evidence/perf-baseline-readback-2026-09-13.md)).

## Current self-review — 2026-09-13 security scan/monitoring baseline

Trivy filesystem·이미지 취약점 스캔을 `.github/workflows/security-scan.yml`로
추가해 CRITICAL/HIGH(unfixed 제외)에서 fail하고 SARIF를 Security 탭에 올리며,
주간 스케줄로 신규 CVE를 표면화합니다. `infra/monitoring/prometheus-alerts.yml`은
문서화된 low-cardinality metric만 쓰는 11개 규칙(API down·5xx·p95·in-flight·
provider 열화·notification dead letter/침묵)을 정의합니다. 두 파일의 YAML과
모든 metric 이름을 소스 `prometheus_text()`와 대조해 확인했지만, 실제 Actions
실행·Prometheus scrape·alert 발화·첫 CVE triage는 별도 acceptance이므로
총점은 **88/100**을 유지합니다
([security/monitoring baseline readback](evidence/security-monitoring-baseline-readback-2026-09-13.md)).

## Current self-review — 2026-09-13 disaster-recovery drill

백업 스크립트 존재와 복구 가능성은 다릅니다. `infra/dr-drill.sh`가 disposable
스택에서 시드→백업→빈 DB 복구→복구 DB 기반 API 기동→원본 토큰으로
`food_count` 9→9 readback까지 증명했고, `.github/workflows/dr-drill.yml`이
주간 회귀 감시를 추가합니다. 운영 DB 백업 주기·offsite/WAL·retention·
managed failover RPO/RTO·실제 cutover 리허설은 여전히 외부 acceptance이므로
총점은 **88/100**을 유지합니다
([dr drill readback](evidence/dr-drill-readback-2026-09-13.md)).
