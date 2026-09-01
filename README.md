# Rescue Meal

영수증·바코드·식품 라벨을 이용해 식료품 재고를 빠르게 등록하고, 실제 표시 날짜와 보관 이력을 구분해 관리하며, 먼저 사용해야 할 재료 중심으로 식단을 제안하는 오픈소스 기반 서비스입니다.

## 현재 상태

- 단계: 1차 vertical slice 구현 및 검증
- 구현: 선택한 모바일 콘셉트 기반 프론트엔드 + FastAPI API + Python 3.12 PaddleOCR worker
- GitHub: [godekd3133/rescue-meal](https://github.com/godekd3133/rescue-meal)
- 현재 구현된 것: 홈 Rescue Queue, 식품 상세·보관 이벤트, 부분 lot 이동·개봉·먹은 기록·폐기 확인, 영수증 검토·반영, 이미지 품질 gate, 실제 이미지 OCR worker, 라벨 날짜 후보, 바코드 후보 조회, 직접 입력, 재고 기반 레시피 미리보기·조리순서·식단 저장/재조회·snapshot/audit·사용량 조정·조리 완료 차감, guest workspace 인증·SQLite 격리, PWA shell·API 동기화 경로
- 현재 문서가 정의하는 것: MVP 범위, 안전 경계, 데이터 출처, OSS 역할, 검증 방법, API 계약
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
| Open Food Facts | 바코드 기반 상품명·브랜드·카테고리 후보 조회 |
| PaddleOCR | 한국어 영수증·포장 라벨 OCR 및 key information extraction |
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
- 검증된 레시피 30~50개 기반 3일 식단
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

구체적인 계약은 다음 문서를 따릅니다.

개발 단계별 커밋 구조와 각 단계의 코드·문서·검증 연결은 [개발 진행 맵](docs/development-map.md)에서 한 번에 볼 수 있습니다. 커밋 제목은 제품 문제와 구현 의존성이 이어지도록 구성했으며, 각 단계의 완료 claim과 아직 남은 검증 경계를 함께 적었습니다.

- [제품 흐름](docs/product-brief.md)
- [데이터 계약](docs/data-contract.md)
- [OSS 통합 경계](docs/oss-integration.md)
- [OSS·공공 데이터 카탈로그](docs/oss-catalog.md)
- [구현 계획](docs/implementation-plan.md)
- [아키텍처 결정 기록](docs/architecture-decisions.md)
- [실현 가능성·검증 계획](docs/feasibility-validation-plan.md)
- [OCR intake pipeline](docs/ocr-pipeline.md)
- [디자인 QA](docs/design-qa.md)
- [환경 Preflight](evidence/environment-preflight-2026-09-01.md)
- [Repository publication preflight](evidence/repository-publication-preflight-2026-09-02.md)
- [실제 첨부 이미지 OCR benchmark](evidence/vision-ocr-parser-benchmark-2026-09-01.md)
- [실제 PaddleOCR benchmark](evidence/paddleocr-benchmark-2026-09-01.md)
- [부분 lot parent/child readback](evidence/partial-lot-readback-2026-09-01.md)
- [바코드 카메라 흐름](docs/barcode-camera.md)
- [연결 상태와 timeout 경계](evidence/connection-status-2026-09-01.md)
- [PWA 설치·오프라인 경계](docs/pwa-offline.md)
- [PWA production build evidence](evidence/pwa-build-2026-09-01.md)
- [storage event history readback](evidence/storage-history-readback-2026-09-01.md)
- [추정 날짜 확정 흐름](docs/date-assertion-correction.md)
- [추정 날짜 사용자 확정 readback](evidence/date-correction-readback-2026-09-01.md)
- [Guest workspace 인증·데이터 격리](docs/auth-workspace.md)
- [Guest workspace isolation readback](evidence/auth-workspace-readback-2026-09-01.md)
- [PostgreSQL tenant-aware contract](evidence/postgres-tenant-contract-2026-09-01.md)
- [Grocy REST adapter](docs/grocy-adapter.md)
- [Grocy adapter contract evidence](evidence/grocy-adapter-contract-2026-09-01.md)
- [재고 기반 레시피 플래너](docs/recipe-planner.md)
- [공개 레시피 importer 운영 경계](docs/recipe-importer.md)
- [레시피 플래너 readback](evidence/recipe-planner-readback-2026-09-01.md)
- [planner v2·조리 완료 readback](evidence/recipe-planner-completion-readback-2026-09-02.md)

## 1차 로컬 실행

프론트엔드는 선택안의 iPhone/Pixel 모바일 런타임을 보존한 Vite 앱입니다. API 없이도 화면 fixture로 동작하며, 아래처럼 FastAPI를 함께 켜면 `VITE_API_BASE_URL`을 통해 실제 API 응답을 읽고 변경 이벤트를 전송합니다.

터미널 1 — API:

```bash
cd services/api
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

서버 재시작 후에도 로컬 재고를 유지해 보고 싶으면 API 명령에 `RESCUE_MEAL_SQLITE_PATH=../../data/rescue-meal.local.db`를 붙입니다. PostgreSQL을 준비한 뒤에는 `RESCUE_MEAL_DATABASE_URL=postgresql://...`을 사용하면 PostgreSQL projection repository를 선택합니다. 기본 명령은 검증용 in-memory fixture를 사용합니다.

터미널 0 — 실제 PaddleOCR worker:

```bash
cd services/ocr-worker
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8002
```

API에 `RESCUE_MEAL_OCR_URL=http://127.0.0.1:8002`를 지정하면 이미지 intake가 이 worker를 사용합니다. worker가 꺼져 있으면 API는 `needs_ocr_engine` 또는 `OCR worker 연결 실패`를 반환하고 임의의 상품을 만들지 않습니다.

터미널 2 — 모바일 프론트:

```bash
cd apps/web
npm ci --prefer-offline --no-audit --no-fund
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 4173
```

브라우저에서 `http://127.0.0.1:4173/`을 열면 됩니다. 프론트 런타임 무결성은 `npm run check:runtime`, 프론트 빌드는 `npm run build`, 백엔드 API smoke는 `cd services/api && uv run pytest`로 확인합니다.

### 현재 API 경계

- `GET /health`, `POST /api/auth/guest`, `GET /api/dashboard`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — account workspace 연결·profile·token revoke
- `GET /api/integrations/grocy/status` — 설정된 Grocy system info readback, 기본 disabled
- `GET /api/integrations/recipes/cookrcp/status` — 식품안전나라 COOKRCP01 importer 설정 상태만 확인, 외부 호출 없음
- `GET /api/products/by-barcode/{barcode}` — 현재는 fixture 상품 후보만 제공
- `GET /api/products/resolve/{barcode}` — local fixture 우선, 외부 lookup flag 시 Open Food Facts 보조 후보
- `POST /api/barcodes/parse` — 일반 GTIN·가변중량·GS1 날짜 AI 분기
- `POST /api/inference/priority` — 날짜가 없을 때 먼저 확인할 순위 범위 추론
- `POST /api/foods` — 날짜를 확정하지 않는 직접 입력 등록
- `PATCH /api/foods/{food_id}/date-assertion` — 추정 날짜를 사용자가 확인한 날짜로 확정
- `POST /api/receipts/intake` — 이미지 업로드와 OCR engine 상태 확인
- `POST /api/labels/intake` — 라벨 이미지 업로드와 OCR engine 상태 확인
- `POST /api/receipts/parse-text` — OCR text fixture를 review draft로 구조화
- `POST /api/labels/parse-text` — OCR text fixture를 날짜 후보로 구조화
- `POST /api/receipts/drafts` — OCR 결과를 받는 staging 계약
- `POST /api/receipts/{receipt_id}/commit` — 검토된 항목만 lot 후보로 반영
- `GET /api/commit-transactions` — commit·reconciliation 상태 조회
- `POST /api/foods/{food_id}/storage-events` — 이동·개봉·소비·폐기 이벤트
- `GET /api/foods/{food_id}/storage-events` — 해당 lot의 최근 보관·소비·폐기 이력 readback
- `POST /api/meal-plans/preview` — 저장하지 않는 결정론적 식단 미리보기
- `POST /api/meal-plans` — 식단 계산 및 workspace 영속 저장
- `GET /api/meal-plans/latest` — 현재 workspace의 마지막 저장 식단
- `POST /api/meal-plans/{plan_id}/complete` — 사용자 확인 후 matched lot 소비 기록 및 식단 완료 처리
- `GET /api/meal-plans/{plan_id}/events` — 식단 snapshot 저장·완료 audit event 조회
- `GET /api/meal-plans/history` — 현재 workspace의 최근 저장 식단 목록

기본 API 저장소는 검증용 in-memory이며, `RESCUE_MEAL_SQLITE_PATH`를 지정하면 local durable repository로 전환되고, `RESCUE_MEAL_DATABASE_URL`을 지정하면 PostgreSQL projection repository를 선택합니다. PostgreSQL의 정규화된 domain-table read/write mapping과 Grocy 연동은 아직 production 검증 전입니다. 상세 구현 상태와 검증 결과는 [1차 구현 상태](docs/build-status-2026-09-01.md)에 기록했습니다.

OCR intake의 상태·parser 규칙·실패 경계는 [OCR intake pipeline](docs/ocr-pipeline.md)에 기록했습니다. 레시피 매칭·미리보기·저장·재조회 계약은 [재고 기반 레시피 플래너](docs/recipe-planner.md)에 기록했습니다.
