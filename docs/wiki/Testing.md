# 테스트와 변경 검증

아래 명령은 프로젝트에 존재하는 실행 경로입니다. 이 문서 작성 작업에서 앱 테스트를 새로 실행했다는 뜻은 아닙니다. 현재 성공 여부는 해당 커밋의 CI와 직접 실행 결과로 확인합니다.

## 빠른 검증

API 디렉터리에서:

```bash
cd services/api
uv sync
uv run pytest
```

웹 디렉터리에서:

```bash
cd apps/web
npm ci --prefer-offline --no-audit --no-fund
npm run build
npm run check:bundle
```

OCR 변경 시 `services/ocr-worker`에서도 `uv sync`와 `uv run pytest`를 실행합니다.

## 브라우저 검증

`apps/web`에서 실행합니다. 최초 환경은 `npx playwright install chromium`으로 브라우저를 준비합니다.

| 명령 | 목적 |
| --- | --- |
| `npm run test:runtime` | 기본 runtime lane |
| `npm run test:web` | 웹 surface |
| `npm run test:native` | 모바일 viewport·focus 등 |
| `npm run test:connected` | 실제 API 연결 사용자 흐름 |
| `npm run test:smoke:all` | 정의된 smoke runner |
| `npm run test:service-worker` | 캐시·오프라인·업데이트 경계 |
| `npm run test:workspace-sync` | workspace 요청·동기화 계약 |

연결 테스트의 API 실행·환경은 Playwright config와 CI workflow를 따릅니다. 다른 작업이 사용 중인 개발 서버를 테스트 서버로 재사용하지 않도록 포트와 대상 프로세스를 확인합니다.

## 변경별 확인 범위

- 날짜·등록: 원본 provenance, 검토 필요 상태, 실제 날짜와 추정 우선일 구분.
- 재고 mutation: 부분 수량, 저장 실패 후 복구, 동일 요청 replay, 다른 기기 충돌.
- 식단: preview의 부작용 없음, 저장·완료 구분, 재고 차감과 linked plan 진행 상태.
- 화면: 좁은 viewport, 큰 글씨, keyboard focus, 실패 후 복구, 정상 동작 화면 캡처.
- DB: migration dry-run과 disposable PostgreSQL 계약 검증. 운영 DB를 테스트 대상으로 쓰지 않습니다.

CI 기준은 [verify workflow](https://github.com/godekd3133/rescue-meal/blob/main/.github/workflows/verify.yml)입니다. 보안·이미지 게시·성능·복구 drill은 별도 workflow에 있습니다. 실기기 촬영, OS 설치, 배터리·성능, 운영 provider 연결은 로컬 fixture 테스트와 별도로 기록합니다.

검증 결과에는 날짜·커밋·환경·명령·결과·미검증 범위를 남깁니다. 상세: [출시 준비 기준](https://github.com/godekd3133/rescue-meal/blob/main/docs/release-readiness.md)
