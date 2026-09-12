# Repository publication preflight — 2026-09-02

> 이 문서는 notification center·InventoryRepository vertical slice를 추가하기 전의 publication snapshot입니다. 최신 전체 수치와 현재 범위는 [build status](../docs/build-status-2026-09-01.md)와 [inventory authority readback](inventory-authority-readback-2026-09-02.md), [notification readback](notification-readback-2026-09-02.md)을 기준으로 합니다.

## 목적

GitHub `godekd3133/rescue-meal`에 `main`을 게시하기 직전에 현재 코드·문서·fixture·검증 경계를 다시 확인한 결과입니다. 로컬 DB와 실행 cache는 삭제하거나 이동하지 않았으며, Git ignore 규칙으로 원격 source set에서 제외했습니다.

## 저장소 경계

- 기본 branch: `main`
- 원격 게시 대상: source, tests, fixtures, schema, lock file, 실행 문서, 날짜별 validation evidence
- 원격 제외 대상: `data/*.db`, `.env`, 실제 secret/API key, virtualenv, `__pycache__`, pytest cache, `node_modules`, `dist`, Playwright result, macOS benchmark executable
- compiled macOS Vision tool은 `work/macos_vision_ocr.swift` source와 실행 script를 보존하고 `work/macos_vision_ocr` binary는 제외
- tracked source에는 `/Users/`, `OneDrive`, GitHub token, private key pattern이 없음

## 실행 검증

| 검증 lane | 실행 조건 | 결과 |
| --- | --- | --- |
| Web runtime | `npm run check:runtime` | 통과 — 보호 파일 28개 |
| Web production | `npm run build` | 통과 — TypeScript/Vite/Sites output 생성 |
| Sites worker | `npm run test:sites` | 통과 — 4/4 |
| API | `services/api: uv run pytest` | 통과 — 79 passed, 3 warnings |
| OCR worker | `services/ocr-worker: uv run pytest` | 통과 — 1 passed |
| Python source | `python3 -m compileall -q services/api/app services/ocr-worker/app` | 통과 |
| COOKRCP CLI safety | key 없는 `uv run python scripts/import_cookrcp.py`와 `--help` | 통과 — 외부 호출 없이 expected exit 2, help exit 0 |
| Demo/prototype E2E | `tests/prototype.spec.ts`, 별도 빈 포트 | 통과 — 11/11 |
| Mobile runtime E2E | `tests/mobile-runtime.spec.ts`, 별도 빈 포트, 1 worker | 통과 — 8/8 |
| Connected E2E | fresh API + CORS `127.0.0.1:4203`, fresh web, `tests/connected-prototype.spec.ts` | 통과 — 2/2 |
| Compose syntax | `docker compose -f infra/docker-compose.yml config --quiet` | 통과 |

## 확인된 범위와 남은 경계

`tests/mobile-runtime.spec.ts`의 8개 테스트는 Rescue Meal 전용 빈 포트에서 단독 실행해 모두 통과했습니다. 해당 runtime 파일은 `apps/web/AGENTS.md`의 protected boundary에 해당하며 이번 저장소 정리에서 수정하지 않았습니다. 기본 Playwright 포트에서 다른 프로젝트의 HTML이 제공되거나 사용 중인 포트를 재사용하면 검증 결과로 사용할 수 없으므로, 아래 재현 조건처럼 독립 포트를 사용했습니다.

## 환경 함정과 재현 조건

- 기본 Playwright 포트 `4174`에는 다른 프로젝트의 PC Supporter dev server가 떠 있어 해당 실행은 Rescue Meal 검증으로 사용할 수 없었습니다.
- `4175`도 기존 Rescue Meal dev server가 사용 중이어서 기존 프로세스를 종료하지 않고 `4199`, `4203`, `4204`, `4205`의 빈 포트를 사용했습니다.
- connected E2E는 웹 origin과 API CORS 허용 origin을 일치시켜야 합니다. fresh API를 `8013`, 웹을 `4203`으로 띄우고 `RESCUE_MEAL_CORS_ORIGINS=http://127.0.0.1:4203`, `VITE_API_BASE_URL=http://127.0.0.1:8013`을 사용했을 때 2개 모두 통과했습니다.
- `docker info`는 Docker daemon이 실행 중이지 않아 실패했으며, 실제 PostgreSQL/pgvector/OCR worker container startup과 multi-process readback은 이번 preflight에서 주장하지 않습니다.

## 산출물·경고

- production client 초기 chunk: `504.16KB`
- `MealPlanSheet` lazy chunk: `16.24KB`
- Vite `500KB` advisory warning은 남아 있지만 build 실패는 아닙니다.
- API warning 3개는 FastAPI/Starlette의 `httpx` 및 deprecated HTTP status 관련 경고입니다.

## 다음 확인

1. CI에서도 Playwright에 프로젝트 전용 포트와 API CORS origin을 명시해 다른 로컬 서버 재사용을 방지합니다.
2. Docker daemon이 준비되면 Compose startup, PostgreSQL migration, workspace A/B readback, pgvector extension을 확인합니다.
3. 실제 기기·운영 OCR·Grocy stock readback·OAuth·실제 password-reset email delivery는 별도 acceptance lane으로 닫습니다.
