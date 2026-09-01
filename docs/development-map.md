# Rescue Meal 개발 진행 맵

이 문서는 Rescue Meal을 처음 읽는 사람이 제품 의도부터 실행 가능한 코드와 검증 결과까지 순서대로 따라갈 수 있도록 만든 안내서입니다. Git 커밋도 이 의존성 흐름에 맞춰 제품 계약, 실행 기반, 기능 구현, 사용자 흐름, 검증 증거 순서로 나뉘어 있습니다.

## 1. 한눈에 보는 개발 흐름

```text
문제 정의·안전 경계
  → 데이터·API 계약
  → fixture·영속성·실행 기반
  → FastAPI 도메인과 외부 adapter
  → OCR intake와 parser
  → 모바일 사용자 흐름
  → 자동·브라우저·실제 이미지 검증
  → 운영 전 남은 위험과 다음 단계
```

각 단계는 앞 단계의 계약을 소비합니다. 예를 들어 모바일 화면은 날짜를 안전 판정으로 표시하지 않고 `표시 날짜`, `date assertion`, `추정 소비 우선일`을 구분해야 하므로, 화면 구현보다 먼저 데이터 계약과 안전 문구를 고정했습니다.

## 2. 작업 분류와 주요 경로

| 개발 영역 | 무엇을 결정·구현했는가 | 주요 경로 | 확인 자료 |
| --- | --- | --- | --- |
| 제품·안전 | 등록 비용을 낮추고, 날짜 provenance와 보관 이력을 분리하는 제품 약속 | `README.md`, `docs/product-brief.md`, `docs/data-contract.md` | `docs/feasibility-validation-plan.md` |
| 아키텍처·OSS | Grocy, Open Food Facts, ZXing, GS1, PaddleOCR, COOKRCP01, OR-Tools 등의 역할과 통합 경계 | `docs/architecture-decisions.md`, `docs/oss-*.md`, `docs/recipe-importer.md` | 각 문서의 라이선스·검증 경계 |
| 데이터·인프라 | recipe/priority fixture, workspace-aware PostgreSQL projection, Docker Compose 실행 기반 | `data/fixtures/`, `infra/` | `evidence/postgres-tenant-contract-2026-09-01.md` |
| API 도메인 | 식품·lot·보관 이벤트·영수증 draft/commit·barcode·auth·recipe plan API | `services/api/app/`, `services/api/tests/` | API pytest, 각 readback 문서 |
| OCR intake | 이미지 품질 gate, PaddleOCR worker, 영수증·라벨 parser, 실패 시 확정 입력 차단 | `services/api/app/pipeline/`, `services/ocr-worker/`, `docs/ocr-pipeline.md` | Vision/PaddleOCR benchmark |
| 모바일 앱 | iPhone/Pixel 런타임 안에서 Rescue Queue, 등록·상세·이력·식단·계정 흐름 연결 | `apps/web/src/`, `apps/web/public/`, `apps/web/tests/` | runtime test, build, browser readback |
| 검증·실험 | 독립 parser benchmark, API contract test, runtime E2E, production build evidence | `evidence/`, `work/` | 날짜별 evidence 문서 |
| 저장소 운영 | 비밀·DB·캐시·번들 산출물 경계, 반복 가능한 설치·검증 경로 | `.gitignore`, `.env.example`, `.github/` | 이 문서와 CI workflow |

## 3. 커밋을 읽는 순서

커밋 제목은 아래 작업 단위를 기준으로 구성되어 있습니다. 각 커밋은 해당 영역의 파일만 담아 변경 목적과 diff를 빠르게 확인할 수 있게 했습니다.

1. `chore(repo): establish safe project boundaries`
   - GitHub에 올릴 수 있는 파일과 로컬 전용 파일의 경계를 정합니다.
   - `.gitignore`, `.env.example`를 먼저 읽으면 DB snapshot, 가상환경, OCR cache가 왜 원격에 포함되지 않는지 알 수 있습니다.

2. `docs(product): define scope and safety-aware contracts`
   - 사용자 문제, MVP 범위, 데이터 provenance, 안전 문구, OSS 후보, 검증 질문을 고정합니다.
   - 구현보다 먼저 “무엇을 자동화하지 않을 것인가”를 명확히 한 단계입니다.

3. `feat(data): add deterministic planning fixtures`
   - 레시피 alias와 우선순위 rule을 코드가 재현 가능하게 소비할 수 있는 JSON fixture로 제공합니다.

4. `feat(infra): add local persistence and service baseline`
   - PostgreSQL/pgvector schema와 API·OCR worker·DB Compose 구성을 추가합니다.
   - 기본 API는 in-memory 또는 SQLite로도 동작하며, PostgreSQL/Grocy 운영 검증은 별도 claim으로 남겨 둡니다.

5. `feat(api): implement inventory, intake, auth, and planner services`
   - 식품 lot, 보관 이벤트, 영수증 검토·commit, 바코드, 날짜 확인, guest/account workspace, recipe plan을 FastAPI와 테스트로 구현합니다.

6. `feat(ocr): add dedicated PaddleOCR worker and parsing boundary`
   - API process와 실제 OCR runtime을 분리하고, 이미지 품질 실패·worker 부재·parser 불확실성을 자동 입고 성공으로 오인하지 않게 합니다.

7. `feat(web): connect the mobile prototype to the product flows`
   - 보호된 모바일 runtime 위에 Rescue Meal 화면과 API 연결 모드를 구현하고, drag/keyboard/safe-area 계약을 지키는 E2E fixture를 포함합니다.

8. `docs(runtime): document API, OCR, and mobile contracts`
   - auth workspace, barcode, date assertion, Grocy adapter, OCR intake, recipe planner, PWA, 디자인 QA의 코드 계약과 사용 방법을 연결합니다.

9. `feat(planner): let users choose cooking time limits`
   - 10·20·30·45분 선택을 planner preview/save 계약과 연결하고, 저장 계획을 복원할 때도 `max_minutes`를 비교합니다.

10. `feat(planner): show recent meal plan history`
   - 현재 재고가 바뀐 뒤에도 저장·완료된 최근 식단을 workspace history endpoint와 모바일 UI에서 다시 확인합니다.

11. `feat(api): add COOKRCP01 review-draft importer`
   - 선택적 API key로 공개 레시피를 조회하되 raw ingredient를 자동 확정하지 않고 review draft와 출처·이용조건·revision을 보존합니다.

12. `test(evidence): record implementation and validation readbacks`
   - 코드 테스트만으로 대체할 수 없는 이미지 OCR, 브라우저 readback, build 결과, 인증 격리, lot event, planner complete 결과를 날짜별 evidence로 보존합니다.

13. `docs(repo): make the development and verification map discoverable`
   - 이 문서와 자동 검증 workflow로 새 개발자가 제품 의도, 코드 위치, 검증 claim, 남은 위험을 한 경로로 읽을 수 있게 합니다.

14. `test(repo): record publication preflight`
   - 게시 직전의 runtime/build/API/OCR/E2E/Compose 결과와 환경 함정을 한 문서로 고정합니다.

## 4. 현재 구현 claim

현재 코드는 다음 vertical slice를 로컬에서 제공하는 상태입니다.

- 영수증·라벨 이미지 intake와 OCR worker 상태 확인
- OCR text를 review draft로 변환하고, 검토된 항목만 재고 lot 후보로 commit
- 바코드 후보, 직접 입력, 날짜 후보와 사용자 date assertion 수정
- 보관 위치 이동, 개봉, 소비, 폐기 및 부분 lot 이력
- guest workspace와 email/password account workspace, token revoke 경계
- 재고 기반 recipe preview, 조리 가능 시간 선택, 저장, latest/history 조회, lot allocation, 사용량 조정, 조리 완료 소비 event
- iPhone/Pixel 모바일 prototype, API 연결 모드, PWA shell과 offline 경계
- 선택적 COOKRCP01 공개 레시피 review draft와 source/license/revision provenance
- `services/api/scripts/import_cookrcp.py` stdout JSON review import와 `rejected_rows` bad-row 격리

## 5. 증거를 해석하는 방법

검증 결과는 서로 다른 claim을 닫습니다. 하나의 통과 결과를 다른 층의 증거로 확장하지 않습니다.

| 검증 층 | 현재 확인하는 것 | 확인하지 않는 것 |
| --- | --- | --- |
| 정적·단위·API test | 계약, parser, 계산, workspace routing, event 상태 | 실제 기기, 운영 인프라 |
| 모바일 runtime/build | protected runtime 무결성, TypeScript/Vite build, PWA 산출물 | App Store/Play 배포 승인 |
| 브라우저 readback | 주요 화면과 연결 모드의 사용자 흐름 | 모든 모바일 OS/브라우저 조합 |
| 실제 이미지 benchmark | 고정 샘플에서 OCR 관찰값과 parser 경계 | 모든 매장·상품의 정확도 |
| Docker/PostgreSQL/Grocy | 구성 파일과 adapter contract | 현재 환경에서의 live startup/readback |
| 제품 안전 | 안전 문구와 금지된 자동 판정 경계 | 식품이 안전하다는 판정, 폐기량 개선 |

현재 evidence에 기록된 Docker daemon 부재, 운영 PostgreSQL/Grocy readback 미실행, 실제 기기·운영 OCR·OAuth/계정 복구 미검증은 다음 개발 작업의 입력입니다. 게시 직전 검증 수치는 [publication preflight](../evidence/repository-publication-preflight-2026-09-02.md)에서 확인합니다.

## 6. 저장소에 포함하지 않는 로컬 산출물

다음 파일은 개발 환경에서 유용하지만 원격 소스가 아닙니다.

- `data/*.db`, SQLite readback snapshot 및 guest/account runtime state
- `.env`와 실제 API key, auth secret, local database password
- `apps/web/node_modules/`, `apps/web/dist/`, Playwright report/result
- Python virtualenv, `__pycache__`, pytest cache
- `work/macos_vision_ocr` macOS arm64 실행 파일

대신 재현에 필요한 schema, fixture, lock file, benchmark source script, 실행 명령과 결과 문서를 커밋합니다. 로컬 DB 자체는 삭제하지 않았으므로 현재 작업 환경의 상태를 계속 확인할 수 있습니다.

## 7. 다음 개발자가 시작할 위치

1. [제품 흐름](product-brief.md)과 [데이터 계약](data-contract.md)으로 안전 경계를 읽습니다.
2. [구현 상태](build-status-2026-09-01.md)에서 현재 연결된 기능과 남은 위험을 확인합니다.
3. [OCR pipeline](ocr-pipeline.md), [recipe planner](recipe-planner.md), [auth workspace](auth-workspace.md) 중 변경할 vertical slice의 계약을 먼저 읽습니다.
4. 루트 README의 API·worker·web 실행 순서로 로컬 환경을 올립니다.
5. 변경 전후에 해당 영역의 pytest, runtime/build, browser 또는 evidence 검증을 같은 revision에 남깁니다.
