# Production configuration preflight readback

기준일: 2026-09-03

production 배포 전에 저장소 설정 실수를 차단하는 `services/api/scripts/preflight_production.py`를 추가하고, 실제 CLI·테스트·CI wiring을 확인했습니다. 이 도구는 DB/provider 연결을 증명하는 도구가 아니라, 안전한 production 설정이 주입됐는지 검사하는 configuration gate입니다.

## 검사 범위

- PostgreSQL DSN과 `normalized` inventory mode
- 인증 required, 32자 이상 non-default auth secret
- persistent auth rate limit
- HTTPS CORS origin과 wildcard 차단
- OCR worker URL
- HTTPS password-reset base URL과 email provider URL
- default PostgreSQL password 차단
- Grocy/VAPID partial configuration
- 외부 상품 조회를 켠 경우 MFDS API key와 enrichment worker token
- secret value를 출력하지 않는 오류 보고

## 실행 readback

| 검증 | 결과 |
|---|---|
| secure production fixture CLI | passed; `Production preflight passed` |
| empty/preview-like environment CLI | 의도된 exit 1; 설정 key와 안전한 설명만 출력 |
| secret value non-disclosure test | passed |
| partial Grocy/VAPID and insecure CORS tests | passed |
| API 전체 pytest | 203 passed, 7 deprecation warnings |
| API/OCR Python compileall | passed |
| `uv lock --check` | passed |
| CI production fixture step | `.github/workflows/verify.yml`에 연결 완료 |
| API image startup gate | `RESCUE_MEAL_ENVIRONMENT=production`일 때 preflight 후 Uvicorn 실행하도록 연결 |
| API image fail-closed shell behavior | preflight non-zero 시 후속 Uvicorn 명령이 실행되지 않는 `set -e` simulation passed |

secure fixture의 CLI 출력에는 secret 값 대신 다음 한 줄만 포함됐습니다.

```text
Production preflight passed. Connectivity and provider delivery require separate smoke tests.
```

빈 환경은 database/auth/rate-limit/CORS/provider URL 등 필요한 설정을 오류로 보고하고 `Production preflight failed. No secret values were printed.`로 종료했습니다. 이 실패는 검문소가 의도대로 작동했다는 증거입니다.

## 운영 경계

preflight 통과만으로 다음을 주장하지 않습니다.

- 실제 PostgreSQL 연결·migration·backup/restore
- OCR/MFDS/Grocy/email/Web Push provider 도달성
- 다중 worker lease 경쟁과 장애 복구
- domain/TLS/reverse proxy와 실제 mobile device acceptance

실제 배포는 secret manager 환경을 주입한 뒤 다음을 실행하고, 이어서 별도 connectivity smoke test를 수행해야 합니다.

```bash
cd services/api
uv run python scripts/preflight_production.py --mode production
```

Compose를 사용할 때는 API service에 `RESCUE_MEAL_ENVIRONMENT=production`을
명시해야 합니다. `local`/`preview`에서는 개발 환경의 빈 provider 설정을
허용하지만, production에서는 이미지 startup gate가 필요한 설정 오류를
먼저 차단합니다.

## 2026-09-03 clean local-mirror regression re-run

OneDrive 경로에서 Python dependency 파일을 읽는 중 `ETIMEDOUT`이 발생할 수
있어, 소스 코드를 `/tmp`의 로컬 mirror에 복사하고 `uv.lock`을 고정한 새
환경에서 회귀 테스트를 다시 실행했습니다. mirror는 API가 기대하는
repository root 구조(`services/api`, `data/fixtures`, `infra/postgres`,
`apps/web/public/assets/food`)를 유지했습니다.

| 검증 | 결과 |
|---|---|
| API clean environment | `uv sync --frozen --dev` 후 `pytest -q`: **236 passed** |
| OCR worker clean environment | Python 3.12 `uv sync --frozen --dev` 후 `pytest -q`: **2 passed** |
| Web TypeScript | `apps/web` `tsc --noEmit`: passed |
| Web camera browser contract | permission fallback·mock frame JPEG 전달·video readiness gate·전체 demo suite: **20 passed** |

이 재실행은 application source와 test contract의 회귀 부재를 확인하지만,
실제 PostgreSQL/Grocy 연결·provider delivery·실기기 카메라 acceptance를
대체하지 않습니다. 원본 OneDrive 작업 폴더의 직접 build/test가 같은
filesystem timeout으로 중단될 수 있다는 운영 환경 이슈도 별도로 남깁니다.

## 2026-09-03 Docker lifecycle follow-up

Docker Desktop daemon을 기동한 뒤 Rescue Meal PostgreSQL을 별도 포트로
검증했다. Compose 설정과 migration dry-run은 통과했고 `pgvector/pg16`
image pull도 완료했지만, 다음 두 시도 모두 Docker API의 `create` 이후
`start` 단계에서 응답하지 않았다.

| 시도 | 결과 |
|---|---|
| Compose `db` service, host port `55432` | `rescue-meal-db-1`이 `Created` 상태에 머무름 |
| bind mount 없는 bare `pgvector/pg16`, host port `55433` | `rescue-meal-db-smoke-20260903b`가 `Created` 상태에 머무름 |

두 경우 모두 `Running=false`, start event 없음, `docker start` client
응답 없음이 확인됐다. 이는 OneDrive migration bind mount만의 문제로
단정할 수 없는 Docker Desktop container-start 문제이므로 live PostgreSQL
readback으로 승격하지 않는다. 이번 검증에서 생성한 container·volume·network와
client process는 삭제했으며, 사용자가 이미 실행 중이던 `portlink-*`
container는 변경하지 않았다.
