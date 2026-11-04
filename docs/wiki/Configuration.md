# 설정과 외부 연동

설정 목록의 기준은 [환경변수 예제](https://github.com/godekd3133/rescue-meal/blob/main/.env.example)입니다. 예제의 placeholder는 로컬 안내용이며 운영 비밀값으로 사용할 수 없습니다. shell·secret manager에서 실제 값을 공급하고 Git에 저장하지 않습니다. Vite 환경변수는 빌드 산출물에 포함되므로 provider key·서버 token을 넣지 않습니다.

## 주요 설정

| 설정 | 목적 |
| --- | --- |
| `VITE_APP_SHELL` | `web` 웹 화면 / `preview` 폰 미리보기 |
| `VITE_DEPLOYMENT_MODE` | `demo` 개발·시연 / `production` 운영 설정 gate |
| `VITE_API_BASE_URL` | 웹이 연결할 API 주소 |
| `RESCUE_MEAL_SQLITE_PATH` | 로컬 SQLite 파일 |
| `RESCUE_MEAL_DATABASE_URL` | PostgreSQL DSN |
| `RESCUE_MEAL_INVENTORY_MODE` | PostgreSQL normalized adapter 선택 |
| `RESCUE_MEAL_AUTH_REQUIRED`, `RESCUE_MEAL_AUTH_SECRET` | 인증 필수 여부와 서버 비밀값 |
| `RESCUE_MEAL_CORS_ORIGINS` | 허용할 frontend origin 목록 |
| `RESCUE_MEAL_OCR_URL` | 별도 OCR 서비스 주소 |
| `RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS` | 외부 상품 검색 사용 여부 |
| `RESCUE_MEAL_OBSERVABILITY_TOKEN` | 내부 metric scrape 인증 |

운영 웹은 HTTPS API 주소를 요구합니다. 운영 설정이 빠지면 fixture 화면으로 성공한 것처럼 보이지 않도록 차단합니다. 로컬 실행과 Compose의 기본 인증 설정이 다를 수 있으므로 실행 경로의 실제 환경을 확인하세요.

## 연동의 역할

| 연동 | 사용 범위 | 문서 |
| --- | --- | --- |
| PaddleOCR | 이미지 → 검토 후보 | [OCR](https://github.com/godekd3133/rescue-meal/blob/main/docs/ocr-pipeline.md) |
| ZXing·GS1 | 바코드 입력·검증 | [바코드](https://github.com/godekd3133/rescue-meal/blob/main/docs/barcode-camera.md) |
| C005·I1250·Open Food Facts | 상품 후보와 출처 | [상품 조회](https://github.com/godekd3133/rescue-meal/blob/main/docs/product-resolver.md) |
| COOKRCP01·OR-Tools | 레시피 자료와 재고 기반 계획 | [레시피 import](https://github.com/godekd3133/rescue-meal/blob/main/docs/recipe-importer.md) |
| Grocy | 명시적 mapping·outbox 기반 외부 재고 동기화 | [Grocy](https://github.com/godekd3133/rescue-meal/blob/main/docs/grocy-adapter.md) |
| Web Push | 선택적 알림 전달 | [알림 전달](https://github.com/godekd3133/rescue-meal/blob/main/docs/notification-delivery.md) |

Grocy·알림·상품 보강 worker는 선택적 Compose profile과 별도 runner를 제공합니다. worker는 서비스 token과 명시적 workspace allowlist를 사용하며 tenant 범위를 임의로 발견하지 않습니다. 외부 연동 사용 전 필요한 key·약관·라이선스와 실제 연결 상태를 확인합니다.

상세: [OSS 목록](https://github.com/godekd3133/rescue-meal/blob/main/docs/oss-catalog.md) · [통합 계약](https://github.com/godekd3133/rescue-meal/blob/main/docs/oss-integration.md) · [이메일 복구](https://github.com/godekd3133/rescue-meal/blob/main/docs/account-recovery.md)
