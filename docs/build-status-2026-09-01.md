# 1차 구현 상태 — 2026-09-01 (최종 readback 2026-09-02)

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
→ 직접 입력
→ 먼저 먹을 재료 기반 식단 미리보기
→ 조리 순서·안전 메모 확인
→ 식단 저장
→ 저장 식단 최신 조회
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
- server-side token revoke와 logout 후 동일 token 401 차단
- production build의 PWA manifest·service worker shell과 `/api`·write bypass 경계
- PostgreSQL DSN을 선택할 수 있는 projection repository 코드와 `rescue_api_*` schema
- PostgreSQL API projection의 workspace 복합키·workspace filter·account/revoke table adapter
- Grocy config·API key·system info status와 stock operation HTTP adapter (외부 write는 아직 비활성)
- recipe fixture 5개 기반 planner v2의 exact/curated alias·단위·수량·여러 lot allocation·사용량 조정·조리시간·source metadata·snapshot/audit 검증과 `preview → save → latest → complete` workspace persistence
- Python 3.12 PaddleOCR worker와 API remote OCR adapter
- OCR 응답의 detection/recognition model version trace
- Pillow 기반 해상도·밝기·대비·윤곽 image quality gate와 review warning
- local fixture 우선 상품 resolver와 Open Food Facts feature-flagged 보조 조회
- 실제 첨부 영수증을 프론트에서 선택해 동일 OCR draft를 review 후 commit하는 end-to-end 흐름
- ZXing Browser 기반 동적 카메라 바코드 scan과 카메라 실패 시 수동 입력 fallback

앱 코드의 주요 위치:

- `apps/web/src/Prototype.tsx`
- `apps/web/src/prototype.css`
- `apps/web/src/mealApi.ts`
- `services/api/app/auth.py`
- `services/api/app/grocy.py`
- `apps/web/src/BarcodeScanner.tsx`, `ConnectionStatus.tsx`, `FoodHistory.tsx`, `DateAssertionEditor.tsx`
- `apps/web/public/assets/food/`

### FastAPI MVP

위치: `services/api`

- `/health`
- `POST /api/auth/guest`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/integrations/grocy/status`
- `GET /api/dashboard`
- `GET /api/products/by-barcode/{barcode}`
- `GET /api/products/resolve/{barcode}`
- `POST /api/barcodes/parse`
- `POST /api/inference/priority`
- `RESCUE_MEAL_SQLITE_PATH` — local 개발용 파일 영속화 선택지
- `RESCUE_MEAL_DATABASE_URL` — PostgreSQL projection repository 선택
- `POST /api/foods`
- `PATCH /api/foods/{food_id}/date-assertion`
- `POST /api/receipts/intake`
- `POST /api/receipts/parse-text`
- `POST /api/labels/intake`
- `POST /api/labels/parse-text`
- `POST /api/receipts/drafts`
- `POST /api/receipts/{receipt_id}/commit`
- `GET /api/commit-transactions`
- `POST /api/foods/{food_id}/storage-events`
- `GET /api/foods/{food_id}/storage-events`
- `POST /api/meal-plans/preview`
- `POST /api/meal-plans`
- `GET /api/meal-plans/latest`
- `POST /api/meal-plans/{plan_id}/complete`
- `GET /api/meal-plans/history`

별도 OCR worker 위치: `services/ocr-worker`. Python 3.12 + PaddleOCR 3.7.0 + PaddlePaddle 3.3.1을 사용하며, API는 `RESCUE_MEAL_OCR_URL`로 worker를 선택합니다.

기본 저장소는 검증용 in-memory이고, 현재 열린 preview는 SQLite durable mode입니다. 응답 모델에는 다음 생산용 필드를 먼저 고정했습니다.

- 표시 날짜의 종류·값·출처·신뢰도·사용자 확인 여부
- `estimated_use_first_window`와 안전 면책 문구
- 상품 master 성격의 canonical name과 구매 수량·단위
- 보관 코드 `ambient`·`refrigerated`·`frozen`
- 영수증 fingerprint와 draft 상태
- line type, match confidence, review status
- 보관 이벤트의 이전/이후 위치와 수량

## 중요 안전 동작

1. 영수증 draft를 만드는 것만으로는 재고가 생성되지 않습니다.
2. 상품 라인이 아니거나 낮은 confidence인 항목은 review 상태로 남습니다.
3. 소비기한·유효년월일 등 라벨에서 확인된 날짜는 영수증의 추정값으로 덮어쓰지 않습니다.
4. 날짜가 없으면 `unknown` + `estimated_use_first_window`로 보관하고, 소비기한으로 이름을 바꾸지 않습니다.
5. 보관 위치 변경은 날짜 assertion을 변경하지 않고 storage event로 기록합니다.
6. 전체 소비·폐기는 현재 MVP 재고에서 제거하고, 부분 소비·폐기는 수량만 감소시키며 이벤트를 남깁니다.
7. API 어디에도 `safe_to_eat: true` 같은 자동 섭취 판정 필드를 만들지 않았습니다.

## 실제 검증 결과

### 정적·빌드

```text
apps/web: npm run check:runtime  → Mobile runtime integrity check passed (28 protected files)
apps/web: npm run build          → TypeScript + Vite build passed
services/api: uv run pytest      → 71 passed, 3 warnings
services/ocr-worker: uv run pytest → 1 passed
apps/web: `tests/prototype.spec.ts` → 11 passed (app E2E)
apps/web: `tests/connected-prototype.spec.ts` → 2 passed (API 연결 E2E)
apps/web: `tests/mobile-runtime.spec.ts` → full suite 7 passed, keyboard transition 1 flaky; isolated line 100 rerun 1 passed
apps/web: npm run test:sites     → 4 passed
infra: docker compose config     → syntax/config expansion passed
sqlite: HTTP create → restart → readback → persisted
PaddleOCR: worker health + 5 image uploads → complete
PaddleOCR: 프론트 파일 선택 → review 10 lines → 동일 draft commit → dashboard readback → complete
quality gate: 실제 receipt/produce label → pass → PaddleOCR → review_required
```

현재 production build의 초기 client chunk는 `504.16KB`이고 Vite의 `500KB` advisory warning이 표시됩니다. 카메라 scanner `437.90KB`, meal planner `16.24KB`, storage history `2.02KB`, date assertion editor `1.73KB`, account sheet `4.76KB`, connection status `0.45KB`는 lazy chunk로 분리되어 초기 화면에서 사용 시점에 로드됩니다. manifest·service worker도 production 정적 산출물에 포함됩니다. build 실패는 아니지만, 운영 bundle budget을 엄격히 적용할 때는 다음 성능 작업에서 main chunk를 추가로 줄여야 합니다.

테스트 실행 시 FastAPI/Starlette의 `httpx` 관련 deprecation warning 2개가 표시됩니다. 앱 고유 E2E·API·Sites 검증에는 실패가 없습니다. 템플릿 모바일 runtime은 전체 8개 중 7개가 통과했고 `keyboard and its attached footer dismiss on the same transition`이 전체 순회에서 간헐 실패했으며, 동일 테스트 단독 재실행은 통과했습니다. 해당 템플릿 파일은 보호 범위라 임의 수정하지 않았습니다.

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
- API 연결 모드에서 `서버 연결됨`, 별도 오프라인 포트에서 `오프라인 · 임시 화면` 표시 확인
- 실제 연결 모드에서 guest session 발급·Bearer dashboard readback과 서버 재시작 후 동일 workspace 재고 readback 확인
- 실제 연결 모드에서 같은 SQLite 파일로 API를 재시작한 뒤 동일 guest workspace의 저장 식단 `저장됨` 상태 복원 확인
- 두 guest workspace 중 한 곳에만 식품을 추가한 뒤 inventory count `8 / 7` isolation 확인
- `AUTH_REQUIRED=true` 별도 process에서 무인증 401·guest 200·유효 token 200·변조 token 401 확인
- 실제 연결 프론트에서 account register·login profile·logout 후 guest workspace 전환 확인
- Grocy 미설정 연결 프리뷰에서 integration status `disabled` 확인; mock transport operation contract는 API 테스트에서 확인
- 연결 모드에서 guest token·dashboard·레시피 preview·조리순서·save toast를 실제 브라우저로 확인
- 연결 모드에서 `조리 완료로 기록` 후 matched lot 소비 event와 dashboard 재고 7→5 갱신을 실제 브라우저로 확인
- API readback에서 시금치 0.5팩+0.5팩 multi-lot allocation과 lot별 소비 event 2개를 확인
- connected E2E에서 닭가슴살 사용량 1팩→0.5팩 조정 후 pantry 잔량 1.5팩을 확인
- API에서 `consumed_allocations`에 lot별 사용량·단위를 저장하고 `kg↔g` metric conversion fixture를 통과
- API에서 snapshot hash 충돌·save/complete audit event를 확인
- connected E2E에서 `식단 기록 보기`로 저장 audit과 snapshot hash를 화면에 표시하는 것을 확인
- connected E2E에서 완료 후 `최근 식단 보기`로 이전 plan의 조리 완료 상태를 다시 표시하는 것을 확인
- production build의 `manifest.webmanifest`·`sw.js` 생성과 Sites packaging 파일 확인
- 앱 E2E 11개: 홈 상세 저장·계정 sheet·영수증 review·라벨 확인 반영·바코드 후보 조회·카메라 실패 fallback·추정 날짜 확정·부분 lot 이동·부분 폐기 확인·보관 필터·demo 레시피 저장/완료
- 연결 모드 E2E 1개: 실제 API dashboard·preview·조리순서·save·latest 복원·complete·CORS 경계

프론트 연결 모드에서는 `VITE_API_BASE_URL=http://127.0.0.1:8000`을 사용했고, 현재 열린 preview API는 `storage: sqlite-local`로 실행 중입니다. Uvicorn 로그에서 dashboard, storage event, receipt draft/commit, manual food 요청을 확인했습니다.

OCR text endpoint에는 실제 샘플 구조를 축약한 fixture를 보내 상품명·단가·수량·합계 분리와 할인 line 제외를 확인했습니다. PaddleOCR remote image endpoint에는 사용자 첨부 영수증·라벨을 보내 품질 gate `pass`, model version, 실제 `review_required` draft와 날짜 후보를 확인했습니다. OCR worker가 없을 때는 별도 환경에서 `needs_ocr_engine`과 `draft: null`을 확인했습니다. GS1 fixture와 상품명 기반 priority inference도 별도 테스트했습니다. SQLite 모드에서 직접 등록한 식품이 서버 재시작 뒤에도 남는지 HTTP readback으로 확인했습니다.

commit coordinator fixture에서는 두 번째 line 처리 실패를 주입해 재고가 7개에서 변하지 않는지, `needs_reconciliation` transaction이 남는지, 원인 제거 후 재시도가 9개를 만들고 중복 재시도가 409인지 확인했습니다.

사용자 첨부 영수증·라벨 원본의 macOS Vision 기준선과 bbox grouping 결과는 [Vision OCR parser benchmark](../evidence/vision-ocr-parser-benchmark-2026-09-01.md), 실제 PaddleOCR 결과는 [PaddleOCR benchmark](../evidence/paddleocr-benchmark-2026-09-01.md), 부분 lot의 HTTP parent/child readback은 [partial lot readback](../evidence/partial-lot-readback-2026-09-01.md), storage event history는 [storage history readback](../evidence/storage-history-readback-2026-09-01.md), 추정 날짜 확정 readback은 [date correction readback](../evidence/date-correction-readback-2026-09-01.md), guest workspace isolation과 account revoke는 [auth workspace readback](../evidence/auth-workspace-readback-2026-09-01.md), PostgreSQL tenant-aware projection contract는 [PostgreSQL tenant contract](../evidence/postgres-tenant-contract-2026-09-01.md), Grocy HTTP adapter는 [Grocy adapter contract](../evidence/grocy-adapter-contract-2026-09-01.md), PWA manifest·service worker는 [PWA build evidence](../evidence/pwa-build-2026-09-01.md), planner v2·조리 완료는 [planner v2 completion readback](../evidence/recipe-planner-completion-readback-2026-09-02.md), 바코드 camera adapter와 fallback 경계는 [barcode camera flow](barcode-camera.md), 연결 상태와 timeout은 [connection status](../evidence/connection-status-2026-09-01.md)에 기록했습니다.

## 아직 실제 구현으로 주장하면 안 되는 것

- 모든 매장·라벨 조건에서의 PaddleOCR 운영 정확도 및 품질 gate threshold 적합성
- 실제 iPhone/Android 카메라 권한·포장 조건에서 ZXing/GS1 인식률
- 한국 마트 영수증의 범용 템플릿 지원
- 상품명만으로 소비기한을 확정하는 기능
- Open Food Facts·식품안전나라·Grocy external stock mutation·PostgreSQL 정규화 domain-table 실연동 (API projection tenant contract와 Grocy adapter skeleton은 구현, live system은 미검증)
- OAuth 계정·권한 모델·원본 영수증 개인정보 보존·삭제 정책의 운영 구현 (email/password account와 token revoke는 구현)
- push 알림, 백그라운드 job, 재시도·보상 트랜잭션
- 상태 사진만으로 부패 여부나 섭취 가능 여부를 판정하는 기능

현재 열린 preview는 signed guest/account token으로 SQLite workspace를 선택한 뒤 Pillow 품질 gate와 PaddleOCR remote worker를 사용해 이미지 intake를 실제 처리합니다. worker가 없는 기본 API 모드는 `needs_ocr_engine`을 반환하고, OCR text fixture parser는 독립적으로 실행됩니다. SQLite local workspace repository는 연결됐고 PostgreSQL projection repository 코드도 추가됐지만, PostgreSQL tenant mapping·connection/readback은 Docker daemon 부재로 아직 검증하지 못했습니다. 상품 resolver는 local fixture와 mock/live Open Food Facts 응답 경계를 테스트했지만, 사용자 서비스에서 외부 lookup은 feature flag가 꺼져 있습니다. 부분 lot 이동·복합 개봉·부분 폐기·guest workspace isolation·email/password account auth·token revoke·recipe-linked complete는 API pytest와 앱 E2E/연결 readback에서 검증했으며, 운영 DB·외부 재고 시스템의 동일 transaction/readback과 OAuth·계정 복구는 아직 남아 있습니다. 전체 template runtime은 이번 isolated run에서 8개 모두 통과했습니다.

## 다음 구현 순서

1. SQL migration과 동일한 repository를 API에 연결하고 Product·Receipt·ReceiptLine·StockLot·DateAssertion·StorageEvent readback을 만든다.
2. 현재 Pillow gate를 카메라 crop/기울기/반사까지 확장하고 benchmark annotation으로 threshold를 calibration한다.
3. 2~3개 영수증 유형의 실제 이미지 parser fixture를 만들고 line type/discount/refund/합계 분류를 고정한다.
4. 현재 ZXing Browser camera adapter를 실기기와 GS1 DataMatrix fixture에 연결하고 GS1 Syntax Engine·Python parser 결과를 대조한다.
5. MFDS I1250·Open Food Facts·검토된 rule snapshot을 rule retriever에 연결하고 현재 inference provider의 개발용 rule을 교체한다.
6. 현재 commit coordinator를 Grocy adapter에 연결하고 product ID mapping·outbox·부분 실패·재시도·외부 readback을 검증한다.
7. 현재 5개 recipe fixture의 alias/수량/multi-lot/조리시간 매칭을 원출처·canonical ingredient·lot snapshot이 있는 30~50개로 확장하고, 이후 OR-Tools Rescue Planner를 연결한다.
8. OAuth·계정 복구·upload retention, 삭제, observability, 알림, 모바일 PWA 운영 검증을 추가한다.

각 단계에서도 실제 표시 날짜와 AI 소비 우선순위를 분리하는 현재 계약을 유지해야 합니다.
