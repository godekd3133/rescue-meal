# 문제 해결과 문서 관리

## 자주 마주치는 상태

| 증상 | 확인·해결 |
| --- | --- |
| API를 켰는데 화면이 샘플처럼 보임 | `VITE_API_BASE_URL`과 실행 모드 확인. Vite 환경변수를 바꿨다면 dev server 재시작 |
| 운영 설정 차단 화면 | production의 HTTPS API 주소와 빌드 환경 확인 |
| 카메라가 열리지 않음 | 브라우저 권한·지원·secure context 확인 후 사진 선택 사용 |
| OCR engine 필요 / 연결 실패 | worker 주소와 `/ready` 확인. 모델 준비 전 결과를 확정하지 않기 |
| 재시작 후 재고가 사라짐 | 메모리 모드 여부 확인. 로컬 유지가 필요하면 SQLite 설정 |
| 저장 시 `409` | 최신 상태를 확인하고 편집값 검토 후 재시도 |
| `429` | rate limit과 `Retry-After` 확인 |
| `/ready`가 `503` | 저장소 연결·schema ledger·인증 필수 설정 확인 |
| 외부 연동만 반영되지 않음 | worker allowlist·token·heartbeat·outbox 상태 확인 |
| 새 앱 버전이 바로 적용되지 않음 | waiting service worker의 사용자 새로고침 안내 확인 |

사용자 token·DSN·provider key·원본 영수증을 이슈나 로그에 붙이지 않습니다. 보고할 때는 실행 모드, 재현 순서, 오류 code, 안전한 request ID와 해당 revision을 남깁니다.

## 문서의 기준

- Wiki는 읽는 순서와 핵심 동작을 설명합니다.
- `docs/`는 도메인별 상세 계약을 보관합니다.
- `evidence/`는 특정 날짜·환경에서 실행한 검증 결과를 보관합니다.
- route·schema·기본값·실행 script는 실제 소스가 기준입니다.

상세 문서 간 오래된 수치나 schema 설명이 다르면 migration 파일·현재 코드·해당 revision의 evidence를 확인합니다. 과거 성공 결과를 현재 운영 검증으로 옮겨 적지 않습니다.

## Wiki 수정

Wiki는 GitHub가 관리하는 별도 Git 저장소입니다.

```bash
git clone git@github.com:godekd3133/rescue-meal.wiki.git
cd rescue-meal.wiki
```

페이지는 Markdown 파일이며 `Home.md`가 시작 페이지, `_Sidebar.md`가 메뉴입니다. 이 작업의 작성 원본은 앱 저장소의 `docs/wiki/`에도 저장합니다. 두 위치는 자동 동기화되지 않으므로 이후 수정 시 원본과 게시본을 함께 맞춰야 합니다. 로컬 초안을 검토한 뒤 Wiki checkout에 복사하고 커밋·push합니다.

문서 변경 시 메뉴·내부 링크·코드 경로·환경변수 이름·실행 명령을 확인합니다. 기능이 바뀌면 해당 Wiki 안내와 상세 계약을 함께 수정하고, 새 검증 결과는 날짜를 붙여 기록합니다.
