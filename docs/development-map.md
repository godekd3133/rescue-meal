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
| 데이터·인프라 | recipe/priority fixture, workspace-aware PostgreSQL projection·normalized inventory adapter, Grocy outbox lease/heartbeat, backup/restore runbook과 portable host/Docker client wrapper, concurrent workspace guard, request/worker workspace-store lease·유휴 snapshot LRU lifecycle, operation-scoped workspace connection pool, direct owner reconnect recovery, manual lot/correction race, Docker Compose 실행 기반 | `data/fixtures/`, `infra/` | `evidence/postgres-tenant-contract-2026-09-01.md`, `evidence/inventory-authority-readback-2026-09-02.md`, `evidence/grocy-sync-readback-2026-09-02.md`, `evidence/postgres-backup-restore-readback-2026-09-04.md`, `evidence/postgres-client-wrapper-readback-2026-09-10.md`, `evidence/postgres-concurrency-readback-2026-09-04.md`, `evidence/postgres-connection-lifecycle-readback-2026-09-04.md`, `evidence/postgres-operation-pool-readback-2026-09-04.md`, `evidence/postgres-direct-connection-recovery-readback-2026-09-07.md`, `evidence/manual-food-lot-boundary-readback-2026-09-07.md` |
| API 도메인 | 식품·InventoryRepository lot mutation·normalized inventory adapter·보관 이벤트·영수증 draft/commit·receipt product alias·barcode resolver·auth·notification/delivery·recipe plan·MealPreferences·recipe review·Grocy mapping audit·worker API | `services/api/app/`, `services/api/scripts/`, `services/api/tests/` | API pytest, 각 readback 문서 |
| OCR intake | 이미지 품질 gate, PaddleOCR worker, liveness/readiness·bounded inference, 영수증·라벨 parser, 실패 시 확정 입력 차단 | `services/api/app/pipeline/`, `services/ocr-worker/`, `docs/ocr-pipeline.md` | Vision/PaddleOCR benchmark, [OCR worker readiness readback](../evidence/ocr-worker-readiness-readback-2026-09-05.md), [label safety readback](../evidence/ocr-label-safety-readback-2026-09-05.md) |
| 모바일 앱 | iPhone/Pixel 런타임 안에서 Rescue Queue, 등록·상세·이력·식단·계정 흐름 연결 | `apps/web/src/`, `apps/web/public/`, `apps/web/tests/` | runtime test, build, browser readback |
| 검증·실험 | 독립 parser benchmark, API contract test, runtime E2E, production build evidence | `evidence/`, `work/` | 날짜별 evidence 문서 |
| 저장소 운영 | 비밀·DB·캐시·번들 산출물 경계, readiness·request correlation·structured access log, bounded HTTP/product/notification metrics scrape, auth rate limit, read transaction cleanup, workspace snapshot/operation connection lifecycle, bounded pool, direct owner reconnect, 반복 가능한 설치·검증 경로 | `.gitignore`, `.env.example`, `.github/`, `services/api/app/observability.py` | 이 문서와 [API runtime observability contract](observability.md), [connection lifecycle 설계](postgres-connection-lifecycle.md), CI workflow, `evidence/postgres-auth-live-readback-2026-09-04.md`, `evidence/postgres-connection-lifecycle-readback-2026-09-04.md`, `evidence/postgres-operation-pool-readback-2026-09-04.md`, `evidence/postgres-direct-connection-recovery-readback-2026-09-07.md` |

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
- workspace별 8종 알레르기 회피 조건 저장, curated recipe metadata filter, unknown metadata abstain, export·guest transfer 연결
- recipe allocation lot의 조리 전 날짜 확인 안내와 `date_review_required` provenance
- iPhone/Pixel 모바일 prototype, API 연결 모드, PWA shell과 offline 경계
- 선택적 COOKRCP01 공개 레시피 review draft와 source/license/revision provenance
- `services/api/scripts/import_cookrcp.py` stdout JSON review import와 `rejected_rows` bad-row 격리
- protected `recipe-review` API의 draft 저장·검토·승인과 `recipe_catalog` planner 연결
- `recipe_admin` account role, shared catalog projection, review actor/snapshot audit event
- receipt draft와 분리된 I1250 우선 product enrichment job·review polling·service-token worker·workspace refresh/lease/heartbeat, I1250 miss 뒤 Open Food Facts legacy name-search fallback
- 계정 복구·공개 auth endpoint의 generic response, hash-only reset token, session rotation, persistent SQLite/PostgreSQL rate limit event·Retry-After, Compose readiness gate
- 계정 삭제의 현재 비밀번호·`DELETE` 확인 gate, durable `active → deleting → deleted` fence, workspace write guard, 실패 후 재시도, 일반 요청 `423`, credential/reset token 삭제와 기존 token `401` 경계

## 5. 증거를 해석하는 방법

검증 결과는 서로 다른 claim을 닫습니다. 하나의 통과 결과를 다른 층의 증거로 확장하지 않습니다.

| 검증 층 | 현재 확인하는 것 | 확인하지 않는 것 |
| --- | --- | --- |
| 정적·단위·API test | 계약, parser, 계산, workspace routing, event 상태 | 실제 기기, 운영 인프라 |
| 모바일 runtime/build | protected runtime 무결성, TypeScript/Vite build, PWA 산출물 | App Store/Play 배포 승인 |
| 브라우저 readback | 주요 화면과 연결 모드의 사용자 흐름 | 모든 모바일 OS/브라우저 조합 |
| 실제 이미지 benchmark | 고정 샘플에서 OCR 관찰값과 parser 경계 | 모든 매장·상품의 정확도 |
| Docker/PostgreSQL/Grocy | Compose/migration 구성·disposable PostgreSQL/Grocy live startup/readback·adapter contract | managed 운영 인프라와 외부 시스템 acceptance |
| 제품 안전 | 안전 문구와 금지된 자동 판정 경계 | 식품이 안전하다는 판정, 폐기량 개선 |

현재 환경의 disposable PostgreSQL normalized readback은 migration 001→025·checksum runner, workspace-scoped 사용자 정의 보관 위치와 normalized lot/event location reference, 장보기 receive operation load/persist/restart, receipt commit key digest·payload fingerprint·process restart replay, manual food command replay·target correction race, 두 API process HTTP receive race·단일 lot·재시작 후 재생성 차단, API readiness/write/search, custom backup/빈 DB restore, two-connection conflict guard, workspace/operation-pool lifecycle와 account auth restart/purge·read transaction cleanup을 대상으로 합니다. receipt commit까지의 기존 001→020 evidence와 account deletion fence/readiness의 021, receipt review metadata의 022, manual food ledger의 023, shared catalog revision의 024는 각 당시 schema 범위의 기록이며, 현재 additive migration은 025까지입니다. 019의 lot 전량 소비 후 API restart 409·export privacy 경계는 [shopping receive idempotency readback](../evidence/shopping-receive-idempotency-readback-2026-09-05.md)와 [multi-process receive readback](../evidence/postgres-multiprocess-receive-readback-2026-09-05.md)에서 별도로 확인했습니다. receipt commit의 normalized 재시작 replay·payload conflict·DB 1 lot/1 transaction readback은 [receipt commit idempotency readback](../evidence/receipt-commit-idempotency-readback-2026-09-06.md)와 [receipt commit concurrency readback](../evidence/receipt-commit-concurrency-readback-2026-09-06.md)에서 확인했습니다. 기존 normalized·backup·concurrency·auth 관련 readback은 [current PostgreSQL live readback](../evidence/postgres-live-readback-2026-09-05.md), [live PostgreSQL opened_at readback](../evidence/live-postgres-opened-at-readback-2026-09-04.md), [backup/restore readback](../evidence/postgres-backup-restore-readback-2026-09-04.md), [concurrency readback](../evidence/postgres-concurrency-readback-2026-09-04.md), [auth readback](../evidence/postgres-auth-live-readback-2026-09-04.md), [account deletion fence readback](../evidence/account-deletion-fence-readback-2026-09-06.md)에서 확인했습니다. 상품명 fallback의 mock API·worker·source provenance·no-date 경계는 [Open Food Facts name fallback readback](../evidence/open-food-facts-name-fallback-readback-2026-09-05.md)에서, 영수증 GTIN의 parser → draft → normalized receipt line/lot 경계는 [receipt GTIN readback](../evidence/receipt-gtin-readback-2026-09-05.md)에서 확인했습니다. 운영 PostgreSQL backup object encryption/retention·Grocy 운영 backup/restore·managed failover·network partition·실제 기기·운영 OCR·OAuth·실제 password-reset email delivery는 아직 미검증입니다. 게시 직전 검증 수치는 [publication preflight](../evidence/repository-publication-preflight-2026-09-02.md)에서 확인합니다.
이 readback의 현재 schema baseline은 `023_manual_food_idempotency.sql`까지
확장되었습니다. normalized receipt review metadata parity와 draft
idempotency cross-process 결과는 [receipt draft idempotency readback](../evidence/receipt-draft-idempotency-readback-2026-09-07.md)에
기록했으며, `merchant_name`·`template_id`·`template_confidence`을
재시작 후에도 보존합니다.

manual food create/correction의 `Idempotency-Key` digest와 request fingerprint
replay ledger는 additive migration 023과 [manual food lot boundary readback](../evidence/manual-food-lot-boundary-readback-2026-09-07.md)에
연결되어 있습니다.

앞 문단의 `001→020`은 receipt commit까지의 기존 live readback 범위를 가리키며,
현재 계정 삭제 schema/readiness와 migration runner의 기준은 additive migration
`021_account_deletion_fence.sql`까지입니다. account row를 먼저 `deleting`으로
고정하고, 실패 후 같은 session의 delete 요청으로 재개하는 로컬/API 계약은
별도 [account deletion fence readback](../evidence/account-deletion-fence-readback-2026-09-06.md)에
기록합니다. 실제 두 API process의 account deletion fence·purge·기존 token 차단은
[PostgreSQL multi-process account deletion readback](../evidence/postgres-account-deletion-multiprocess-readback-2026-09-06.md)에
별도로 기록합니다. 삭제 중 revision lock을 잡은 API process를 SIGKILL한 뒤
transaction rollback·durable fence·재시작 후 같은 session delete 재개와 scoped
rows 0을 확인한 결과는 [PostgreSQL account deletion crash-recovery readback](../evidence/postgres-account-deletion-crash-recovery-readback-2026-09-06.md)에
기록합니다.

이번 readback 범위에는 bounded multi-round receive stress와 revision-lock
crash-before-commit rollback/retry/replay, commit 직후 응답 전 process 종료 후
동일 lot replay도 포함합니다. 상세 결과는
[crash recovery readback](../evidence/postgres-crash-recovery-readback-2026-09-05.md)에
기록했으며, post-commit 결과는 [post-commit crash readback](../evidence/postgres-post-commit-crash-readback-2026-09-05.md)에
기록했습니다. 실제 reverse proxy response reset·managed failover·network partition은
아직 운영 acceptance입니다.

2026-09-07 manual food lot boundary readback에서는 `POST /api/foods`의 create와
correction intent를 분리했습니다. target 없는 직접 입력은 canonical 상품명이
같아도 새 lot을 만들고, 라벨·GS1 보정은 `target_food_id` 또는 정확히 하나인
호환 후보만 갱신합니다. 다중 lot의 임의 덮어쓰기·trusted date overwrite를
`409`로 막고, target의 수량·단위·구매/개봉 provenance와 date history를 보존합니다.
API **393 passed**, runtime/build와 연결 라벨 payload readback 결과는
[manual food lot boundary readback](../evidence/manual-food-lot-boundary-readback-2026-09-07.md)에
있습니다. 이 기능의 disposable PostgreSQL multi-process smoke는 통과했으며,
라벨 picker의 실기기 동작과 managed failover/network partition은 후속
acceptance입니다.

수동 command idempotency는 migration `023_manual_food_idempotency.sql`과
`ManualFoodOperationRecord`를 통해 key digest·request fingerprint·lot/action을
보존합니다. 동일 key replay·payload conflict·소비 후 재생성 차단·frontend 동일-key
retry와 disposable PostgreSQL two-process readback은
[manual food idempotency readback](../evidence/manual-food-idempotency-readback-2026-09-07.md)에
기록되어 있습니다.

PostgreSQL schema gate는 workspace store가 실제로 사용하는 전체 compatibility
projection table·핵심 column/index와 `rescue_schema_migrations` `001→023` baseline을
readiness에서 함께 확인합니다. `migrate.sh --apply`는 하나의 psycopg session-level
advisory lock 아래 migration body와 ledger row를 같은 transaction으로 확정하며,
Compose는 one-shot `migrate` service가 성공한 뒤 API를 시작합니다. readiness contract
25개, fresh/concurrent migration runner, Compose service, runtime DDL 비활성 API
`/ready` readback은 [PostgreSQL schema gate readback](../evidence/postgres-schema-gate-readback-2026-09-07.md)에
기록되어 있습니다. managed failover·network partition·rolling deploy cutover는
운영 acceptance입니다.

2026-09-08 현재 사용자 설정 mutation recovery는 `WorkspaceMutation`의 좁은
snapshot contract로 확장되어 있습니다. meal preferences·notification preferences·
push subscription·notification read-state를 date/provenance/shopping rollback과
같은 outer flush로 저장하고, persistence failure는 typed retryable detail과 기존
상태 유지 안내를 반환합니다. SQLite/PostgreSQL 재구성 readback과 알림 설정/알림
센터 inline retry E2E는
[notification mutation recovery readback](../evidence/notification-mutation-recovery-readback-2026-09-08.md)에
기록되어 있습니다. notification delivery·worker lease/heartbeat·외부 provider와
managed failover는 여전히 별도 운영 gate입니다.

shared recipe catalog는 별도 `RecipeCatalogMutation`으로 import·검토 수정·승인·반려와
review audit를 함께 저장합니다. catalog flush 실패 시 draft status와 audit를 함께
복원하고 관리자 review 화면은 기존 draft를 유지한 채 inline retry를 제공합니다.
사용자 workspace inventory와 source fetch/license 판단은 이 transaction에 포함하지
않습니다
([recipe review recovery readback](../evidence/recipe-review-recovery-readback-2026-09-08.md)).

shared catalog revision은 additive migration `024_recipe_catalog_revision.sql`의
`catalog` row를 사용합니다. 관리자 화면은 GET revision을 다음 mutation에 전달하고,
다중 API process에서 stale draft를 쓰면 winner를 reload한 뒤
`recipe_catalog_revision_conflict` 409로 멈춥니다. 이 경계는 user workspace revision과
분리되어 recipe 관리자 동시성만 보호합니다.

2026-09-08 현재 pending recipe draft에는 explicit review ownership도 있습니다. 관리자
`claim`이 없으면 PATCH·approve·reject를 수행할 수 없고, active claim 중인 다른 actor의
write는 `recipe_review_claim_conflict` 409로 중단됩니다. claim은 bounded TTL과
`release`를 가지며, 만료 후 다른 관리자가 회수할 수 있습니다. ownership field는 기존
shared catalog JSON payload에서 nullable default로 읽히고 `claimed`·`released` audit로
보존됩니다. 실제 팀/프로젝트 RBAC·조직 정책과 legacy token 제거는 운영 acceptance입니다.

추가로 `RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS`가 설정된 환경에서는 `recipe_admin`의
review capability와 approve/reject publisher capability를 분리합니다. reviewer-only
actor는 claim·편집·저장을 할 수 있지만 `recipe_review_publish_forbidden` 403으로 게시
결정을 수행할 수 없고, `/api/recipe-review/capabilities`와 connected UI가 이를 미리
표시합니다. allowlist가 비어 있으면 기존 호환 동작을 유지하며, 실제 조직 hierarchy와
legacy token 제거는 운영 acceptance입니다.

publisher allowlist가 설정된 production은 admin allowlist 동반 여부·email 형식·publisher가
admin의 부분집합인지 preflight에서 확인합니다. `recipe-publisher-without-admin`과
`recipe-publisher-not-admin` 등 configuration error는 readiness 이전에 발견되며, 실제
조직 directory sync와 account role 변경은 운영 acceptance입니다.

`.github/workflows/verify.yml`의 API job도 sanitized valid publisher profile과 admin 밖
publisher를 사용하는 negative preflight를 실행하도록 연결했습니다. workflow는 error code와
non-disclosure를 확인하지만, 실제 GitHub Actions 성공·secret manager 주입·배포 connectivity는
별도 acceptance입니다.

recipe review queue는 `assignment=all|mine|unassigned` actor filter를 제공하며, `mine`은
현재 actor의 active claim만, `unassigned`는 unclaimed와 expired claim을 반환합니다.
frontend의 `전체`·`내 작업`·`미배정` filter navigation은 매번 현재 queue를 다시 읽고,
실시간 multi-admin invalidation은 별도 운영 acceptance입니다.

현재 cross-tab transport에는 shared `recipe-catalog` namespace와 `recipe-review` channel도
있습니다. recipe mutation 성공 후 다른 운영자 panel이 queue를 다시 읽지만 열린 local
editor는 자동 교체하지 않고 최신 상태 확인 안내를 유지합니다. 이는 BroadcastChannel/
localStorage best-effort invalidation이며 server push·event ordering·조직 assignment는
별도 운영 acceptance입니다.

cross-device 보완 경로로 `/api/recipe-review/revision` revision-only probe도 사용합니다.
review panel은 visibility 복귀와 30초 interval에서 probe하고 revision 변화가 있을 때만
queue를 다시 읽으며, probe 실패 시 기존 queue를 보존합니다. 선택 draft 변경은 explicit
reload 전까지 stale editor로 잠그며, server push/실시간 ordering은 여전히 별도 gate입니다.

production 환경에서 shared `RESCUE_MEAL_RECIPE_REVIEW_TOKEN`을 잘못 설정하지 않도록
preflight와 `/ready`가 `recipe-review-legacy-token` error를 내고, runtime legacy review
request도 `recipe_review_legacy_token_disabled` typed 503으로 차단합니다. token 원문은
응답에 포함하지 않으며, 실제 legacy secret 폐기와 secret-manager rotation은 별도
운영 acceptance입니다.

따라서 기존 항목 중 `001→023`을 언급한 것은 당시 readback의 historical scope이며,
현재 schema/readiness baseline은 `001→025`입니다. 최신 schema gate 증거는
[PostgreSQL schema gate current readback](../evidence/postgres-schema-gate-readback-2026-09-08.md)입니다.

2026-09-08 현재 API-backed background worker runner도 공통 loop로 정리했습니다.
notification·Grocy·product-enrichment worker는 HTTP status뿐 아니라 tick response의
body-level `error`를 실패로 판정하고, `--once` 실패를 exit code 1로 반환합니다.
장기 실행은 300초 상한 bounded exponential backoff와 recovery reset을 사용하며,
workspace allowlist·service-token·lease·실제 작업 상태는 기존 API tick이 소유합니다.
공통 runner unit/script contract는
[worker runner recovery readback](../evidence/worker-runner-recovery-readback-2026-09-08.md)에
기록되어 있습니다.

Grocy 사용자/운영 assertion도 2026-09-08부터 별도 recovery slice로 연결했습니다.
product mapping·storage location mapping·reconciliation decision·dead-letter retry는
local mapping/outbox/audit를 한 번에 저장하고, failure 시 기존 상태를 유지한 채
inline retry를 제공합니다. 외부 Grocy 호출 중간 상태와 provider transaction은
worker 경계 밖에 남겨 두었습니다
([Grocy mutation recovery readback](../evidence/grocy-mutation-recovery-readback-2026-09-08.md)).

2026-09-08 durable read snapshot 경쟁도 닫았습니다. 요청 middleware가 SQLite 또는
PostgreSQL workspace projection을 재로드하는 동안 public collection을 빈 상태로
노출하지 않도록 `_AtomicStoreStateMixin`이 private loading state를 완성한 뒤
reference를 교체합니다. reload 실패 시 기존 read snapshot을 유지합니다. blocking
SQLite regression에서 reload 중 저장된 meal plan이 계속 읽히는 것을 확인했고, 전체
API **447 passed**, connected E2E **76 passed**와 planner 저장 후 닫기·재진입 회귀를
통과했습니다. 이 변경은 managed PostgreSQL failover·network partition·rolling deploy를
대신 증명하지 않습니다
([durable read snapshot readback](../evidence/durable-read-snapshot-readback-2026-09-08.md)).

현재 schema baseline override: 이 문서의 historical readback 문단에 남아 있는 `001→023`
표기는 당시 evidence 범위입니다. 2026-09-08 현재 readiness와 migration runner의
authoritative baseline은 `001→025_storage_locations.sql`입니다.

2026-09-08 retryable operation identity도 `OperationLedger` Module로 집중했습니다.
receipt·manual food·shopping receive·storage event의 key normalization, digest, canonical
payload fingerprint, legacy scoped ID 계산은 공통 Interface를 사용하고, 각 domain의
scope·durable record·replay response·conflict detail은 Adapter가 유지합니다. Module
unit **4 passed**, 기존 idempotency/replay targeted **10 passed**, API **451 passed**,
connected **76 passed**를 확인했습니다
([OperationLedger readback](../evidence/operation-ledger-readback-2026-09-08.md)).

primary intake의 lazy loading도 보강했습니다. AddFoodSheet는 initial bundle에서 계속
분리하지만 `openAdd()` user intent 시점에 chunk prefetch를 시작하고 resolve 후 dialog를
열어 control 없는 shell을 노출하지 않습니다. load 실패는 retry toast로 복구합니다.
prefetch 후 receipt intake targeted
**5 passed**, full connected **76 passed**, protected runtime **28 passed**, initial
index JS **307.37 kB**, AddFoodSheet chunk **58.56 kB**를 확인했습니다. 실제 mobile
network/CDN/OS picker/camera permission은 별도 acceptance입니다
([intake chunk prefetch readback](../evidence/intake-chunk-prefetch-readback-2026-09-08.md)).

2026-09-08 `WorkspaceMutation` operation lock도 추가했습니다. active store의 process-local
`RLock`이 snapshot·mutation·flush·restore 전체를 감싸므로 적용 caller가 refresh 또는
동일 workspace mutation과 중간에 섞이지 않습니다. lock regression **4 passed**, API
전체 **452 passed**, connected E2E **76 passed**를 확인했습니다. receipt·meal-plan·storage
direct route와 worker 외부 provider transaction까지 전체 atomic하다고 확장하지 않습니다
([WorkspaceMutation lock readback](../evidence/workspace-mutation-lock-readback-2026-09-08.md)).

storage event direct route도 2026-09-08부터 같은 operation seam을 사용합니다. active
workspace lock 안에서 Idempotency-Key precheck와 lot validation을 수행하고,
`WorkspaceMutation.run()`이 InventoryRepository mutation·Grocy outbox·reprioritize·flush와
regular failure restore를 소유합니다. structural seam과 same-key concurrent HTTP test,
API **454 passed**, connected **76 passed**를 확인했으며 receipt·meal-plan direct route와
외부 Grocy transaction은 별도 범위입니다
([storage event mutation readback](../evidence/storage-event-mutation-readback-2026-09-08.md)).

single meal-plan save도 2026-09-08부터 `WorkspaceMutation`으로 편입했습니다. plan별
lock은 유지하며 helper는 candidate/bundle identity와 saved plan·audit staging을 담당하고,
outer Module이 snapshot·flush·regular failure restore를 담당합니다. save seam structural,
preview/latest, phantom failure, concurrent save 회귀와 API **455 passed**, connected
**76 passed**를 확인했습니다. multi-day bundle과 completion은 별도 범위입니다
([meal-plan save mutation readback](../evidence/meal-plan-save-mutation-readback-2026-09-08.md)).

single meal-plan completion도 같은 transaction seam으로 편입했습니다. 기존 plan별 lock은
유지하고, allocation validation·consumed storage event/outbox·plan/bundle progress·completed
audit를 staging한 뒤 `reprioritize(persist=False)`와 outer flush로 한 번 확정합니다.
completion targeted **12 passed**, API **457 passed**, connected **76 passed**를 확인했으며,
multi-day bundle save와 외부 provider transaction은 별도 범위입니다
([meal-plan completion mutation readback](../evidence/meal-plan-completion-mutation-readback-2026-09-08.md)).

multi-day bundle save도 bundle_id별 lock과 `WorkspaceMutation`으로 편입했습니다. preview를
다시 materialize하고 top-level snapshot hash·servings·day identity를 검증한 뒤 bundle/day
state를 한 번 flush하며 failure 시 restore합니다. multi-day targeted **7 passed**, API
**458 passed**, connected **76 passed**를 확인했고 preview는 계속 side-effect-free로
유지합니다. day completion과 외부 provider는 별도 범위입니다
([multi-day bundle save mutation readback](../evidence/multi-day-bundle-save-mutation-readback-2026-09-08.md)).

receipt commit도 2026-09-08부터 두 단계 persistence contract를 명시했습니다. 먼저
`CommitTransactionRecord(status=pending)`를 durable flush해 process crash 뒤 retry/
reconciliation identity를 남기고, receipt별 lock과 active workspace lock 안에서
`WorkspaceMutation` finalization을 수행합니다. finalization은 receipt line 적용·lot 생성·
receipt committed 상태·alias/provenance audit·Grocy outbox·saved transaction을
`persist=False` staging한 뒤 한 번의 outer flush로 확정하며, regular failure는 business
snapshot을 복원하고 transaction만 `needs_reconciliation`으로 보존합니다. structural,
GTIN/replay/conflict, pending retry, concurrent commit, rollback/retry와 final flush failure
회귀를 포함해 targeted **7 passed**, API **460 passed, 8 warnings**, connected E2E
**76 passed**를 확인했습니다. PostgreSQL concurrency winner/replay semantics는 유지하고,
외부 Grocy transaction·managed failover·network partition·reverse-proxy response reset은
별도 운영 acceptance입니다
([receipt commit mutation readback](../evidence/receipt-commit-mutation-readback-2026-09-08.md)).

receipt commit의 pending identity recovery도 2026-09-09에 확장했습니다. 시작 pending
marker flush가 실패하면 memory transaction을 제거하고 `receipt_commit_persistence_unavailable`
typed 503을 반환하며, finalization rollback 뒤 `needs_reconciliation` marker flush가
실패하면 이미 durable한 pending identity를 유지한 채
`receipt_commit_reconciliation_unavailable` typed 503으로 반환합니다. 프론트는 사용자 시도
단위의 commit key와 고정 draft payload·resolved receipt ID를 보존해 global retry에서 같은
commit을 replay하고 fresh draft를 중복 생성하지 않습니다. receipt commit targeted **12 passed**,
API **484 passed**, connected commit retry **1 passed**, connected 전체 **83 passed**,
build protected runtime **28**·Vite **757 modules**·initial index **310.48 kB**를
확인했습니다. 외부 Grocy transaction·response reset·managed failover는 별도 운영 acceptance입니다
([receipt commit retry readback](../evidence/receipt-commit-retry-readback-2026-09-09.md)).

multi-day bundle의 저장된 날짜 completion은 별도 bundle endpoint가 아니라
`bundle_id`·`bundle_day_index`로 연결된 single-plan completion을 사용합니다. 기존
`WorkspaceMutation` snapshot이 plan·bundle day progress·inventory·consumed event를
함께 보존하므로 final flush failure 때 day를 `saved`로 복원하고, 이후 retry 때 한 번만
`completed`로 진행합니다. linked 정상 completion과 failure rollback/retry targeted
**2 passed**, API **461 passed, 8 warnings**를 확인했으며 connected E2E는 app/runtime
source가 변하지 않은 동일 slice의 **76 passed**를 유지합니다. 외부 Grocy transaction·
managed failover·network partition은 별도 운영 acceptance입니다
([multi-day day completion recovery readback](../evidence/multi-day-day-completion-recovery-readback-2026-09-08.md)).

planner client transport도 2026-09-08부터 Coordinator 경계를 사용합니다. `MealPlanSheet`의
preview/latest/preferences/alternatives/multi-day history/audit와 nested shopping read는
`meal-plan` 또는 `shopping-list` channel의 `WorkspaceSyncCoordinator.run()`으로 실행하며,
각 `mealApi` read에 `AbortSignal`을 전달합니다. HTTP method가 POST여도 planner preview/
options/multi-day-preview, barcode parse, label parse/intake, inference, guest-transfer
preview처럼 workspace를 변경하지 않는 요청은 mutation broadcast를 발행하지 않습니다.
meal-plan save/complete와 preference mutation만 `meal-plan` invalidation을 발행하고, 같은
origin의 다른 탭 변경은 열린 planner를 다시 읽습니다. preview non-invalidation과 cross-tab
refresh targeted **2 passed**, workspace-sync **9 passed**, fixture/mobile **35 passed +
2 skipped**, build protected runtime **28개**·Vite **757 modules**·initial index **307.71
kB**·MealPlanSheet chunk **36.38 kB**, connected E2E **78 passed**를 확인했습니다.
일반 planner의 cross-device revision probe와 managed/provider/device 운영은 별도 acceptance입니다
([meal-plan client transport readback](../evidence/meal-plan-client-transport-readback-2026-09-08.md)).

manual food create/correction도 2026-09-08부터 공통 recovery seam으로 편입했습니다.
`manual_food_lock`과 active mutation lock 안에서 idempotency replay와 lot selection을
확인하고, 실제 lot·priority·product/date audit·manual operation ledger 변경은
`WorkspaceMutation` outer flush로 확정합니다. `reprioritize(persist=False)`로 중간
persistence를 제거하며 regular failure는 `manual_food_persistence_unavailable` typed
503과 기존 상태 유지로 반환합니다. create의 새 lot semantics와 target correction의
quantity/unit/provenance 보존, same-key replay/conflict, PostgreSQL winner/replay semantics를
유지했습니다. refactor 전 seam regression에서 호출 0회가 관찰됐고, 수정 후 manual-food
API targeted **16 passed**, connected targeted **3 passed**, disposable PostgreSQL
two-process smoke와 API **463 passed, 8 warnings**, connected **78 passed**,
typed retry/readiness wiring build protected runtime **28개**·Vite **757 modules**·initial index
**307.81 kB**·AddFoodSheet chunk **58.67 kB**, fixture/mobile **35 passed + 2 skipped**를 확인했습니다.
외부 Grocy/provider transaction·managed failover·network partition·legal retention은 별도
운영 acceptance입니다
([manual food mutation recovery readback](../evidence/manual-food-mutation-recovery-readback-2026-09-08.md)).

receipt draft persistence와 intake control readiness도 2026-09-08에 닫았습니다.
`POST /api/receipts/drafts`는 fingerprint lock·active mutation lock 안에서 pending
replay/committed conflict를 먼저 확인하고, 새 draft를 `WorkspaceMutation` outer flush로
저장합니다. regular failure는 `receipt_draft_persistence_unavailable` typed 503으로
phantom 없이 반환하며 PostgreSQL winner draft replay semantics를 유지합니다. 또한
`openAdd()`가 AddFoodSheet와 LazyBottomSheet를 모두 resolve한 뒤 sheet를 열고 inner
Suspense를 제거해 PDF/file input/직접 입력 tab이 준비되기 전 dialog shell을 노출하지
않습니다. refactor 전 seam 호출 0회가 관찰됐고, draft targeted **6 passed**, PDF/typed
draft UI **2 passed**, API **464 passed, 8 warnings**, connected **79 passed**, build
protected runtime **28개**·Vite **757 modules**·initial index **307.81 kB**·AddFoodSheet
chunk **58.67 kB**, fixture/mobile **35 passed + 2 skipped**를 확인했습니다. OCR/device/CDN,
managed failover와 외부 provider는 별도 운영 acceptance입니다
([receipt draft mutation and intake readiness readback](../evidence/receipt-draft-mutation-readiness-readback-2026-09-08.md)).

product-info correction도 2026-09-08부터 공통 recovery seam으로 편입했습니다.
`PATCH /api/foods/{food_id}/product-info`는 active mutation lock 안에서 target/no-op을
확인하고 profile 변경·provenance removal audit·product-info audit·priority를
`WorkspaceMutation` outer flush로 확정합니다. regular failure는
`product_info_persistence_unavailable` typed 503으로 기존 quantity·unit·purchase/opened
provenance·DateAssertion을 보존하며, frontend는 optimistic profile을 원복하고 열린 detail
sheet inline retry를 제공합니다. product-info targeted API **3 passed**, final-flush
rollback/typed retry, connected inline retry **1 passed**, API **466 passed, 8 warnings**,
connected **80 passed**, build protected runtime **28개**·Vite **757 modules**·initial index
**308.25 kB**·FoodDetailSheet chunk **16.62 kB**, fixture/mobile **35 passed + 2 skipped**를
확인했습니다. 최신 route revision의 multi-process PostgreSQL HTTP smoke와 managed/provider/
device/legal 운영은 별도 acceptance입니다
([product-info mutation recovery readback](../evidence/product-info-mutation-recovery-readback-2026-09-08.md)).

receipt privacy erase도 2026-09-08부터 공통 recovery Seam으로 편입했습니다.
`POST /api/receipts/{receipt_id}/privacy-erase`는 `confirm: true`를 검증한 뒤 draft 삭제 또는
committed/pending source metadata redaction을 `WorkspaceMutation` outer flush로 확정합니다.
`persist=False` staging과 snapshot restore를 사용하므로 regular failure는
`receipt_privacy_persistence_unavailable` typed 503으로 기존 receipt·inventory provenance·
commit transaction을 유지하고, PostgreSQL revision conflict는 winner snapshot을 보존합니다.
Account sheet는 열린 overlay 위에서도 동작하는 inline `다시 시도`를 제공합니다. privacy API
targeted **5 passed**, SQLite persistence **1 passed**, draft/committed/pending rollback·retry와
seam 호출 regression, API **468 passed, 8 warnings**, connected **80 passed**, build protected
runtime **28개**·Vite **757 modules**·initial index **308.33 kB**·AccountSheet chunk
**64.17 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**, service-worker **5**,
workspace-sync **9**를 확인했습니다. backup/WAL/read replica/object storage/legal retention,
managed failover과 외부 provider/device 운영은 별도 acceptance입니다
([receipt privacy mutation recovery readback](../evidence/receipt-privacy-mutation-recovery-readback-2026-09-08.md)).

shopping list source write도 2026-09-09부터 공통 recovery Seam으로 편입했습니다.
`POST /api/shopping-list`의 meal-plan/multi-day source 동기화와 `/manual` 직접 추가는
`persist=False` staging 후 `WorkspaceMutation` outer flush로 확정하고, regular failure는
`shopping_list_persistence_unavailable` typed 503으로 기존 source·quantity·checked 상태를
보존합니다. MealPlanSheet의 계획 추가와 홈 ShoppingListSheet의 manual add 모두 열린 sheet
alert 안에서 retry action을 제공합니다. shopping API targeted **7 passed**, source/manual
seam·flush rollback/retry, connected plan/manual retry **2 passed**, API **470 passed**,
connected **80 passed**, build protected runtime **28개**·Vite **757 modules**·initial index
**308.54 kB**·MealPlanSheet chunk **36.91 kB**, fixture/mobile **35 passed + 2 skipped**,
Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다. GET reconciliation,
receive lot/operation transaction, managed failover/network partition·외부 provider/device 운영은
별도 acceptance입니다
([shopping list mutation recovery readback](../evidence/shopping-list-mutation-recovery-readback-2026-09-09.md)).

shopping list의 read-time reconciliation도 2026-09-09부터 공통 recovery Seam으로 편입했습니다.
`GET /api/shopping-list`는 derived source를 삭제·갱신하지만 read처럼 호출되므로, 모든
`_reconcile_shopping_list_sources(persist=False)` 결과를 `WorkspaceMutation` snapshot과
단일 outer flush로 확정합니다. partial reconciliation flush failure에서는
`shopping_list_persistence_unavailable` typed 503과 이전 목록을 유지하고, 기존
MealPlanSheet/ShoppingListSheet read retry가 최신 목록으로 복구합니다. shopping API targeted
**9 passed**, read seam·partial rollback/retry, API **472 passed**, connected **80 passed**,
build protected runtime **28개**·Vite **757 modules**·initial index **308.54 kB**·MealPlanSheet
chunk **36.91 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**, service-worker **5**,
workspace-sync **9**를 확인했습니다. receive lot/operation transaction·external provider,
managed failover/network partition·read replica/legal 운영은 별도 acceptance입니다
([shopping list read reconciliation recovery readback](../evidence/shopping-list-read-reconciliation-recovery-readback-2026-09-09.md)).

product-enrichment queue persistence도 2026-09-09부터 공통 recovery Seam으로 편입했습니다.
`POST /api/receipts/{receipt_id}/product-enrichment`와 dead-letter `/retry`는
`product_enrichment_jobs`를 `WorkspaceMutation` snapshot에 포함하고, job 변경을
`persist=False`로 staging한 뒤 outer flush로 확정합니다. regular failure는
`product_enrichment_persistence_unavailable` typed 503으로 검수 draft/job 상태를 보존하고,
PostgreSQL revision conflict에서는 winner job을 사용합니다. AddFoodSheet는 typed failure에서
검수 화면을 유지한 채 inline `다시 시도`를 제공합니다. product-enrichment API/worker targeted
**10 passed**, connected receipt review retry **1 passed**, API **474 passed**, connected
**80 passed**, build protected runtime **28개**·Vite **757 modules**·initial index **308.65 kB**·
AddFoodSheet chunk **58.91 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**,
service-worker **5**, workspace-sync **9**를 확인했습니다. 외부 provider 호출·cache/rate-limit·
worker lease/heartbeat·managed failover/device/legal/CI 운영은 별도 acceptance입니다
([product-enrichment mutation recovery readback](../evidence/product-enrichment-mutation-recovery-readback-2026-09-09.md)).

shopping receive transaction도 2026-09-09부터 공통 recovery Seam으로 편입했습니다.
`POST /api/shopping-list/{item_id}/receive`는 active workspace lock 안에서 idempotency
precheck를 수행하고, 새 inventory lot·planned source reconciliation·checked 상태·receive
operation ledger·priority를 `persist=False`로 staging한 뒤 `WorkspaceMutation` outer flush로
확정합니다. regular failure는 `shopping_receive_persistence_unavailable` typed 503으로
lot/list/ledger를 함께 복원하며, same-key replay/conflict와 consumed lot 재생성 차단을 유지합니다.
ShoppingListSheet는 열린 receive form의 alert에서 동일 key로 retry합니다. receive API targeted
**4 passed**, final-flush rollback/replay·same-key concurrency, connected receive retry **1 passed**,
API **476 passed**, connected **80 passed**, build protected runtime **28개**·Vite **757 modules**·
initial index **309.02 kB**, fixture/mobile **35 passed + 2 skipped**, Sites **4**,
service-worker **5**, workspace-sync **9**를 확인했습니다. Docker daemon unresponsive로
disposable PostgreSQL smoke는 이번 revision에서 실행하지 않았으며, 외부 Grocy compensation·
managed failover/network partition·backup/WAL/read replica·device/legal/CI는 별도 acceptance입니다
([shopping receive mutation recovery readback](../evidence/shopping-receive-mutation-recovery-readback-2026-09-09.md)).

storage event 예외 처리도 2026-09-09부터 `WorkspaceMutation` recovery contract에 맞췄습니다.
정상적인 `POST /api/foods/{food_id}/storage-events`는 이미 active lock과 snapshot/outer flush를
사용하고 있었지만, `InventoryInvariantError`·not-found·일반 예외 catch에서 직접 flush해
복원된 state를 다시 저장하려는 우회가 남아 있었습니다. 이제 validation/not-found는 기존
422/404로, 일반 failure는 `storage_event_persistence_unavailable` typed 503으로 반환하며
이중 flush를 하지 않습니다. storage API targeted **8 passed**, typed failure rollback/retry와
flush call 단일성, connected storage retry **1 passed**, API **477 passed**, connected **81 passed**,
build protected runtime **28개**·Vite **757 modules**·initial index **309.43 kB**, fixture/mobile
**35 passed + 2 skipped**, Sites **4**, service-worker **5**, workspace-sync **9**를 확인했습니다.
여러 event batch, 외부 Grocy compensation, managed failover/network partition·device/legal/CI는
별도 acceptance입니다
([storage event error recovery readback](../evidence/storage-event-error-recovery-readback-2026-09-09.md)).

이동과 최초 개봉을 한 번에 선택한 상세 화면의 사용자 의도는 2026-09-09부터
`POST /api/foods/{food_id}/storage-event-sequence`로 전달합니다. sequence는 최대 2개의
event를 workspace/key/index 기반 deterministic ID로 묶고, 앞 event가 만든 child lot을 다음
event target으로 연결합니다. 모든 local inventory·storage event·Grocy outbox projection과
priority는 `WorkspaceMutation` 단일 outer flush에서 확정하며, 일반 실패는
`storage_event_sequence_persistence_unavailable` typed 503과 전체 snapshot rollback으로
돌려보냅니다. 동일 key의 완성된 sequence는 replay하고, partial sequence·payload 충돌은
`409`로 중단합니다. 단일 event route와 외부 Grocy provider transaction은 기존 경계를
유지합니다. sequence API targeted **3 passed**, connected retry **1 passed**, API **480 passed**,
connected **82 passed**, fixture/mobile **35 passed + 2 skipped**, Sites **4**,
service-worker **5**, workspace-sync **9**를 확인했습니다 ([storage event sequence readback](../evidence/storage-event-sequence-readback-2026-09-09.md)).

guest-to-account transfer도 2026-09-09부터 cross-workspace race recovery를 강화했습니다.
`ready`/`conflict` 판정·source counts·설정 변경 여부와 target copy를 source/target workspace
ID의 고정 순서 lock 안에서 함께 실행하므로, preview 이후 account write가 guest snapshot으로
덮이지 않습니다. target flush 일반 실패는 target backup restore와
`guest_transfer_persistence_unavailable` typed 503으로 반환하고, PostgreSQL
`ConcurrentWorkspaceWriteError`는 stale restore 없이 전역 revision conflict로 전파합니다.
source는 삭제하지 않으며 fingerprint replay·기존 target conflict semantics는 유지합니다.
flush rollback/retry 및 target write race API regression을 추가했고, targeted API **3 passed**,
full API **482 passed**, connected transfer UI **2 passed**, connected 전체 **83 passed**,
frontend build protected runtime **28**·Vite **757 modules**를 확인했습니다. 상세 결과는
[guest transfer lock/recovery readback](../evidence/guest-transfer-lock-recovery-readback-2026-09-09.md)에
기록합니다.

사용자 정의 보관 위치의 후속 경계는 2026-09-09부터 이력과 cross-device read lifecycle까지
포함합니다. 현재 lot뿐 아니라 storage event의 이전·이후 위치와 장보기 입고 operation이
참조하는 위치는 `storage_location_in_use` `409`로 삭제를 막아 audit 이름을 보존하고,
`FoodHistory`는 location ID를 현재 이름으로 해석합니다. AccountSheet는
`GET /api/storage-locations/revision`을 tab 복귀·30초 bounded probe로 확인해 revision이
바뀐 경우 편집·삭제 확인 상태를 닫고 최신 목록을 다시 읽습니다. in-memory marker와
SQLite `workspace_metadata` revision은 local adapter에서 재구성되며, PostgreSQL은 기존
workspace revision을 사용합니다. API **492 passed**, connected **88 passed**, fixture/mobile
**35 passed + 2 skipped**, workspace-sync **9**, Sites **4**, service-worker **5**, protected
runtime **28**, Vite **757 modules** build를 확인했습니다. 운영 PostgreSQL race·실기기
background scheduling·screen reader는 별도 acceptance입니다 ([custom storage history readback](../evidence/custom-storage-history-readback-2026-09-09.md)).

CI release gate도 이 범위를 명시적으로 실행하도록 2026-09-09에 보강했습니다. web job은
workspace-sync와 service-worker contract를 별도 step으로 실행하고, `postgres-live`는
custom location revision 증가와 history reference 이후 DELETE `409 storage_location_in_use`
readback을 수행합니다. workflow contract **30 passed**와 YAML/shell 검증을 확인했지만
실제 GitHub Actions 성공·artifact promotion·managed PostgreSQL 운영은 별도 acceptance입니다
([CI release contract readback](../evidence/ci-release-contract-readback-2026-09-09.md)).

release provenance도 2026-09-09부터 하나의 manifest로 묶습니다. web script가 source
revision/dirty state, lock·runtime·migration hash와 compiled Sites artifact hash를
secret/workspace data 없이 기록하고, CI가 이를 artifact로 보존합니다. manifest test와
workflow contract는 local mirror에서 확인하지만 signed provenance·artifact retention과
release promotion은 운영 acceptance입니다 ([release provenance manifest readback](../evidence/release-provenance-manifest-readback-2026-09-09.md)).

planner도 2026-09-09부터 다른 기기 변경을 revision-only read로 감지합니다. 열린
`MealPlanSheet`는 current preview·alternative·servings·consumption draft를 유지한 채
명시적 `최신 식단 확인`을 요구하고, 사용자가 선택한 뒤에만 최신 preferences/preview/latest를
재조회합니다. API **493 passed**, connected **89 passed**, fixture planner **1 passed**와
build를 확인했으며 실제 device visibility·server push ordering은 별도 acceptance입니다
([meal-plan cross-device readback](../evidence/meal-plan-cross-device-readback-2026-09-09.md)).

알림 센터도 2026-09-09부터 cross-device freshness 경계를 갖습니다. 목록 read 직후
`GET /api/notifications/revision`으로 payload 없는 baseline을 확보하고, 열린 화면의 tab
복귀·30초 bounded probe에서 revision이 증가하면 최신 알림을 자동으로 다시 읽습니다. 읽음·
전체 읽음 mutation 중에는 현재 목록을 보호하고 완료 후 queued refresh를 수행하며, probe 실패와
workspace 전환에서는 기존 목록을 유지합니다. API 전체 **494 passed, 8 warnings**, connected
전체 **91 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite
**757 modules** build를 확인했습니다. 실제 Web Push ordering·multi-device scheduling·managed
PostgreSQL failover·background tab/device accessibility는 별도 acceptance입니다
([notification cross-device readback](../evidence/notification-cross-device-readback-2026-09-09.md)).

홈 dashboard도 2026-09-09부터 cross-device freshness 경계를 갖습니다. `GET /api/dashboard/revision`을
dashboard payload와 함께 읽어 baseline을 만들고, 홈 화면의 tab 복귀·30초 bounded probe에서
revision이 증가하면 inventory와 Rescue Queue를 자동 재조회합니다. sheet가 열려 있거나 일반
dashboard sync가 진행 중이면 probe를 시작하지 않으며, probe 응답 적용 직전에도 sheet 상태와
사용자 toast를 확인해 현재 작업 결과를 보존합니다. API 전체 **495 passed, 8 warnings**,
connected 전체 **92 passed**, PostgreSQL contract **30 passed**, fixture/mobile **35 passed + 2 skipped**,
protected runtime **28**, Vite **757 modules** build를 확인했습니다. 실제 device background
scheduling·server push ordering·managed PostgreSQL failover는 별도 acceptance입니다
([dashboard cross-device readback](../evidence/dashboard-cross-device-readback-2026-09-09.md)).

ShoppingListSheet도 2026-09-09부터 cross-device freshness 경계를 갖습니다. 목록 read 직후
`GET /api/shopping-list/revision`으로 payload 없는 baseline을 확보하고, 열린 sheet의 tab 복귀·
30초 bounded probe에서 revision 증가 시 최신 항목을 자동 재조회합니다. 체크·삭제·입고·직접
추가 mutation 중에는 현재 목록을 교체하지 않으며, 다른 탭 invalidation이 도착하면 queued refresh로
mutation 완료 뒤 수렴합니다. API 전체 **496 passed, 8 warnings**, connected 전체 **94 passed**,
PostgreSQL contract **30 passed**, fixture/mobile **35 passed + 2 skipped**, protected runtime
**28**, Vite **757 modules** build를 확인했습니다. 실제 multi-device scheduling·server push
ordering·managed PostgreSQL failover는 별도 acceptance입니다
([shopping list cross-device readback](../evidence/shopping-list-cross-device-readback-2026-09-09.md)).

dashboard active inventory search의 후속 경계도 2026-09-09에 추가했습니다. 홈 dashboard revision
refresh가 성공하면 현재 query/filter의 `inventory-search` retry channel을 다시 실행해 기본 inventory와
검색 결과가 서로 다른 revision으로 남지 않게 합니다. Coordinator는 기존 request key와 stale response
폐기 규칙을 유지합니다. API 전체 **496 passed, 8 warnings**, connected 전체 **95 passed**,
fixture/mobile **35 passed + 2 skipped**, protected runtime **28**, Vite **757 modules** build를
확인했으며 실제 multi-device scheduling·server push ordering·managed PostgreSQL failover는 별도
acceptance입니다 ([dashboard search cross-device readback](../evidence/dashboard-search-cross-device-readback-2026-09-09.md)).

검수 대기 영수증 queue의 후속 경계도 2026-09-09에 추가했습니다. `GET /api/receipts/revision`을
summary list read와 함께 확보하고, `receipt-queue` sheet가 열린 동안 tab 복귀·30초 bounded
probe에서 revision 증가 시 최신 summary만 다시 읽습니다. AddFoodSheet가 열리는 순간에는
probe를 중단해 실제 검토 중인 OCR/draft를 자동 교체하지 않습니다. API 전체 **497 passed,
8 warnings**, connected 전체 **96 passed**, fixture/mobile **35 passed + 2 skipped**, protected
runtime **28**, Vite **757 modules** build를 확인했으며 실제 multi-device scheduling·server push
ordering·managed PostgreSQL failover는 별도 acceptance입니다
([receipt queue cross-device readback](../evidence/receipt-queue-cross-device-readback-2026-09-09.md)).

FoodDetailSheet의 cross-device stale 보호도 2026-09-09에 추가했습니다. dashboard revision이
증가해도 현재 상품 정보·보관·날짜 입력을 자동으로 바꾸지 않고 alert만 표시하며, 사용자가
`최신 상태 확인`을 선택했을 때만 최신 food payload를 적용해 local draft를 교체합니다. API 전체
**497 passed, 8 warnings**, connected 전체 **97 passed**, fixture/mobile **35 passed + 2 skipped**,
protected runtime **28**, Vite **757 modules**, FoodDetailSheet **18.24 kB** build를 확인했습니다.
실제 device background scheduling·server push ordering·managed PostgreSQL failover는 별도
acceptance입니다 ([food detail cross-device readback](../evidence/food-detail-cross-device-readback-2026-09-09.md)).

AccountSheet의 cross-device stale boundary도 2026-09-09에 추가했습니다. account sheet가 열린
동안 기존 dashboard revision을 visible-tab·30초 bounded probe로 확인하고, 더 높은 revision이
오면 인증 account와 guest account 모두에 alert를 표시합니다. notification preferences·custom
storage locations·receipt privacy·Grocy panel의 local draft와 확인 상태는 자동 교체하지 않고,
사용자가 `최신 계정 설정 확인`을 선택해 dashboard sync가 성공한 뒤에만 parent refresh nonce로
하위 panel을 다시 읽습니다. deterministic browser fixture의 authenticated account scenario **1 passed**;
guest branch scenario는 추가했으나 OneDrive hydration 후 실행이 필요합니다. mirror TypeScript/build
**passed**, protected runtime **28**, Vite **757 modules**, initial client JS **323.11 kB**,
AccountSheet **74.79 kB**를 확인했습니다. OneDrive source API `/ready` hydration timeout으로
full connected rerun은 승격하지 않았고, 실제 multi-device scheduling·server push ordering·
managed PostgreSQL failover·device accessibility는 별도 acceptance입니다
([account settings cross-device readback](../evidence/account-settings-cross-device-readback-2026-09-09.md)).

## 2026-09-11 current-source continuation

canonical target에서 dashboard revision baseline lifecycle을 보완하고 native shell 좁은 폭 회귀를
자동화했습니다. 초기 `GET /api/dashboard` 성공 response의 revision을 polling baseline에
seed해 연결 직후 visibility probe가 remote 변경을 초기화로 소비하지 않도록 했으며, dashboard
focused **1 passed**, full connected **101 passed**, API **499 passed / 8 warnings**를 확인했습니다.
`VITE_APP_SHELL=native` 320×740 lane은 body/document/device screen/home overflow, visible action
bounds, 식품 추가·식단·알림·계정·상세 sheet bounds, 125% text preference를 **4 passed**로 검증하고
web CI step에 연결했습니다.
fixture/mobile **35 passed + 3 skipped**, production fail-closed **1 passed**, Vite **759 modules**,
Sites **4 passed**도 current source에서 확인했습니다. 상세 evidence는 [final current-source
readback](../evidence/final-current-source-readback-2026-09-11.md)과 [native viewport
readback](../evidence/native-viewport-readback-2026-09-11.md)입니다. 실제 OS font scaling·실기기
카메라/접근성·외부 provider·managed failover·production cutover는 별도 acceptance입니다.

## 2026-09-11 test execution hygiene

preview fixture와 native narrow-viewport Playwright lane은 각각 exact config와 전용 webServer
command를 사용합니다. `npm run check:runtime && exec ./node_modules/.bin/vite`로 Vite process를
직접 소유해 test 종료 후 stale port를 남기지 않으며, fixture/native focused cleanup readback과
전체 lane 회귀 결과는 [Playwright webServer cleanup readback](../evidence/playwright-server-cleanup-readback-2026-09-11.md)에 기록합니다.

식품·날짜·상품 출처·manual food·receipt commit mutation의 read-after-write ordering은
[authoritative mutation readback Module](../evidence/mutation-readback-module-readback-2026-09-11.md)에서
확인합니다. caller는 domain-specific rollback/conflict/retry policy를 유지하고 공통 Module은
authoritative response와 stale read 보호만 소유합니다.

Storage move/open, consume, discard의 optimistic lifecycle은
[optimistic mutation readback](../evidence/optimistic-mutation-readback-2026-09-11.md)에서 확인합니다.
이 Module은 mutation failure snapshot restore와 성공 write/readback failure 재적용을 소유하고,
event idempotency·workspace conflict·Grocy status는 caller에 남깁니다.

## 2026-09-11 current-source UI and platform continuation

현재 source의 UI/platform evidence는 다음 경계로 해석합니다.

- native accessibility·large-text·touch target: fixture/mobile **38 passed + 3 skipped**, native **6 passed**
- Pixel preview navigation/sheet safe-area: focused Pixel **1 passed**, app viewport·sheet bottom `1028px`, Android navigation top `1029px`
- PWA install/manifest and storage recovery build contract: PWA focused **3 passed**, storage recovery pure contract **3 passed**, build **760 modules**
- current fixture 전체 test count는 **40**이며 production-only/push 조건 skip은 production/device acceptance로 분리합니다.

세부 근거는 [large-text](../evidence/large-text-readback-2026-09-11.md),
[touch target](../evidence/touch-target-readback-2026-09-11.md),
[Android Pixel](../evidence/android-pixel-preview-readback-2026-09-11.md),
[storage build contract](../evidence/storage-mutation-recovery-build-readback-2026-09-11.md)입니다.

## 2026-09-12 food detail responsive first-fold continuation

Fresh native `393×852` and `320×740` captures showed the food-detail action
hierarchy touching the iPhone safe area. The app-owned detail snap now follows
the live viewport with an upper bound of `0.993`; the `max-width:360px` rule
tightens only repeated supporting-card rhythm, so the primary 44px controls stay
intact. Current 393px destructive action bottom is `817.484px` against an
`818px` safe boundary, and the 320px primary row bottom is `690.641px` against
`706px`. Focused detail regressions **2 passed**, full native **14 passed**, and
the accepted screenshots/readback are in [food detail compact first-fold](../evidence/food-detail-first-fold-compact-readback-2026-09-12.md).

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
3. [OCR pipeline](ocr-pipeline.md), [recipe planner](recipe-planner.md), [식단 조건과 알레르기 회피 설계](meal-preferences.md), [auth workspace](auth-workspace.md), [계정·workspace 삭제 설계](account-deletion.md) 중 변경할 vertical slice의 계약을 먼저 읽습니다.
4. 루트 README의 API·worker·web 실행 순서로 로컬 환경을 올립니다.
5. 변경 전후에 해당 영역의 pytest, runtime/build, browser 또는 evidence 검증을 같은 revision에 남깁니다.
