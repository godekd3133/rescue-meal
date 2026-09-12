# 공개 레시피 importer 운영 경계

기준일: 2026-09-02

## 결론

Rescue Meal은 식품안전나라 `COOKRCP01`을 한국 레시피 후보를 확보하는 source adapter로 사용합니다. 외부 응답은 바로 사용자에게 추천하지 않고 다음 흐름으로 처리합니다.

```text
COOKRCP01 API
  ↓
source-grounded review draft
  ↓ protected operator review API
canonical ingredient + unit + time + safety/license 검토
  ↓ approved 상태
workspace recipe catalog
  ↓ planner가 approved만 읽음
Rescue Meal 추천
```

이 경계가 필요한 이유는 공개 레시피의 재료 표현과 사용자의 상품 lot 표현이 다르고, `1모`, `1팩`, `약간`, `적당량`을 일반적인 무게 단위로 안전하게 환산할 수 없기 때문입니다. importer가 레시피를 가져왔다는 사실은 해당 식품을 먹어도 된다는 뜻도 아닙니다.

## 공식 source

현재 adapter는 식품안전나라의 `COOKRCP01` JSON 계약을 대상으로 합니다. 공식 문서와 이용조건은 [식품안전나라 COOKRCP01 Open API 문서](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=COOKRCP01)를 기준으로 확인합니다.

adapter가 보존하는 source metadata는 다음과 같습니다.

| 필드 | 값/의미 |
|---|---|
| `source_name` | 식품안전나라 조리식품 레시피 DB |
| `source_url` | 공식 API 문서 URL |
| `source_revision` | `COOKRCP01` |
| `retrieved_at` | API 응답을 받은 UTC 시각 |
| `license` | `public-api-terms-review-required` |

API key는 환경변수로만 주입하고 response·예외 메시지·문서 출력에 포함하지 않습니다. 키가 없으면 importer는 비활성 상태이며, 상태 endpoint는 외부 네트워크 요청을 하지 않습니다.

## 구현

| 위치 | 책임 |
|---|---|
| `services/api/app/recipe_importer.py` | config, HTTP adapter, 공식 response parser, 재료·조리 단계 draft 변환 |
| `services/api/scripts/import_cookrcp.py` | 운영자가 실행하는 stdout JSON 수집 명령 |
| `services/api/app/recipe_catalog.py` | draft model, shared catalog repository, approval gate, approved `RecipeSpec` 변환 |
| `services/api/app/auth.py` | account `ra1` access token과 `user`·`recipe_admin` role 검증 |
| `services/api/app/main.py` | status endpoint, protected import/list/review/approve/reject/events API, SQLite/PostgreSQL projection |
| `apps/web/src/RecipeReviewPanel.tsx` | `?review=1`에서 token을 메모리에만 두고 source 상태·bounded filter·draft import·operator review를 제공하는 UI |
| `services/api/tests/test_recipe_importer.py` | 공식 response shape, 필터, timeout, 오류 비노출, bad row 격리 |
| `services/api/tests/test_recipe_review.py` | operator token·account RBAC, import idempotency, review/approval gate, planner/audit readback |

`CookRcpRecipeDraft`는 다음 정보를 갖습니다.

- `source_id`, 제목, 카테고리, 조리 방법, 이미지 후보
- 원문 재료 문자열 `raw_text`
- 파싱에 성공한 경우의 `parsed_name`, `amount`, `unit`
- 파싱에 실패했거나 의미가 모호한 재료의 `requires_review=true`
- `MANUAL01`~`MANUAL20`에서 정리한 조리 단계
- source/license/revision/retrieved timestamp

review 저장 모델은 추가로 다음을 갖습니다.

- 원문 파싱 후보와 사람이 입력한 `canonical_name`, `canonical_amount`, `canonical_unit`
- draft 상태 `pending`·`approved`·`rejected`
- 운영자가 입력한 안전 메모와 예상 조리시간(5~180분)
- `created_at`, `updated_at`, `approved_at`, reviewer note

수량 parser는 명확한 숫자와 단위의 후보만 추출합니다. `약간`, 분수, 묶음 상품의 의미가 불분명한 표현은 `parsed_name=null` 또는 검토 상태로 남기며, AI나 정규식으로 임의의 수량을 확정하지 않습니다.

응답의 한 row가 깨져도 전체 batch를 폐기하지 않습니다. `rejected_rows`에 row index와 안전한 사유를 남기고 정상 row만 draft로 반환합니다. 다만 서비스 payload 자체가 없거나 JSON 형식이 아니면 batch 요청을 실패시킵니다.

## 실행

먼저 `.env` 또는 실행 환경에 key를 주입합니다. 실제 key는 저장소·Git·브라우저 변수에 넣지 않습니다.

```bash
cd services/api
export FOODSAFETY_COOKRCP_API_KEY='발급받은-키'
uv run python scripts/import_cookrcp.py --start 1 --end 20 --category 반찬 > /tmp/cookrcp-review.json
```

메뉴명·재료명·변경일 필터를 사용할 수 있습니다.

```bash
uv run python scripts/import_cookrcp.py --menu-name 두부 --ingredient 시금치 --changed-after 20260901
```

명령은 stdout에만 JSON을 출력하며 planner fixture·재고·Grocy를 변경하지 않습니다. 출력 파일에는 원문 재료가 포함될 수 있으므로 공개 저장소에 그대로 커밋하지 말고, 검토가 끝난 canonical fixture와 source hash/metadata만 별도 관리합니다.

설정 상태만 확인하려면 API를 사용합니다.

```http
GET /api/integrations/recipes/cookrcp/status
```

`disabled`는 key가 없는 상태이고, `ready`는 key가 설정되어 importer 실행 준비가 된 상태입니다. `ready`는 API 연결 성공, 데이터 품질, 이용조건 승인, planner 승격 완료를 의미하지 않습니다.

## Protected review API

외부 수집과 승인은 일반 사용자 endpoint로 열지 않습니다. 운영에서는 allowlist에 등록된 account의 `recipe_admin` role을 사용합니다.

```text
RESCUE_MEAL_RECIPE_ADMIN_EMAILS=admin@example.com
```

allowlist에 포함된 이메일로 새 account를 등록하면 `recipe_admin` role이 저장되고 `ra1` account access token이 발급됩니다. 일반 `user` account는 식품 재고 API를 사용할 수 있지만 recipe review API에서는 `403`을 받습니다. `RESCUE_MEAL_AUTH_REQUIRED=true`인 운영환경에서는 Bearer 인증이 항상 필요합니다.

기존 local migration을 위한 `RESCUE_MEAL_RECIPE_REVIEW_TOKEN`과 `X-Rescue-Meal-Recipe-Review-Token` header는 설정된 경우에만 legacy fallback으로 동작합니다. 새 운영환경에서는 이 값을 비워 두고 account RBAC만 사용해야 하며, production preflight·`/ready`·runtime review guard가 non-empty 값을 fail-closed로 거부합니다. token은 response·화면·audit에 기록하지 않습니다.

현재 API 계약은 다음과 같습니다.

| Method | Endpoint | 동작 |
|---|---|---|
| `POST` | `/api/recipe-review/drafts/import` | COOKRCP01을 가져와 pending draft로 저장 |
| `GET` | `/api/recipe-review/drafts?status=pending&assignment=all\|mine\|unassigned` | 공용 catalog의 검토 대기 목록과 현재 actor 담당 필터 |
| `GET` | `/api/recipe-review/revision` | draft payload 없이 shared catalog revision만 확인 |
| `POST` | `/api/recipe-review/drafts/{draft_id}/claim` | pending draft의 review 담당자를 현재 관리자 계정으로 명시적으로 지정 |
| `POST` | `/api/recipe-review/drafts/{draft_id}/release` | 현재 담당자가 review claim을 해제 |
| `GET` | `/api/recipe-review/capabilities` | 현재 actor의 review/publish capability와 policy 종류 확인 |
| `PATCH` | `/api/recipe-review/drafts/{draft_id}` | 제목·안전 메모·예상 시간·재료 canonical 값 수정 |
| `POST` | `/api/recipe-review/drafts/{draft_id}/approve` | license 확인과 모든 approval gate 통과 후 승인 |
| `POST` | `/api/recipe-review/drafts/{draft_id}/reject` | 사유와 함께 draft 반려 |
| `GET` | `/api/recipe-review/drafts/{draft_id}/events` | actor·상태 변화·snapshot hash audit 조회 |

## 운영자 import UI 흐름

`?review=1` 화면은 먼저 기존 review token 또는 현재 `recipe_admin` 계정으로 대기 draft를 불러옵니다. 성공하면 공개 source의 설정 상태만 별도로 조회해 source 이름·서비스 revision·공식 문서 링크를 보여줍니다. API key 값 자체와 import response의 민감한 원문은 브라우저 저장소에 보관하지 않습니다.

운영자는 다음 bounded filter를 입력해 화면에서 import를 실행할 수 있습니다.

- row 범위: 1~100, 시작 row ≤ 끝 row
- 메뉴명, 재료명, 분류
- 변경일 이후 `YYYYMMDD`

Import 버튼은 `/api/recipe-review/drafts/import`를 호출하지만 결과를 planner나 canonical fixture에 직접 넣지 않습니다. 응답의 `accepted_count`, `persisted_count`, `rejected_count`를 보여주고, 다시 pending 목록을 읽어 새 draft를 검토 대상으로 선택합니다. 동일 source revision·source ID는 서버의 deterministic draft ID로 deduplicate되어, 화면에서 재시도해도 기존 검토 중인 draft를 덮어쓰지 않습니다.

서버도 같은 범위를 검증합니다. UI validation은 사용성용이고, 역순 범위나 허용 범위를 우회한 직접 API 요청은 Pydantic request model에서 422로 거절됩니다.

`POST /api/recipe-review/drafts/import`는 같은 source revision·source ID를 deterministic draft ID로 변환합니다. 이미 존재하는 draft는 덮어쓰지 않으므로 진행 중인 review가 재수집으로 사라지지 않습니다. `approved` draft도 재수집으로 변경되지 않으며, source가 바뀌면 새로운 source revision으로 가져와 별도 review를 진행해야 합니다.

승인에는 다음 조건이 모두 필요합니다.

1. `license_confirmed=true`
2. 제목과 조리 단계 존재
3. 사람이 입력한 안전 메모 존재
4. 운영자가 예상 조리시간을 입력
5. 모든 재료의 `review_status=approved`
6. 모든 재료의 canonical name·양수 수량·단위 존재

승인된 draft는 `recipe_catalog` source의 `RecipeSpec`으로 변환되어 모든 user workspace의 planner에 추가됩니다. `pending`·`rejected` draft는 planner 후보에 절대 포함되지 않습니다. recipe draft와 review event는 사용자 재고 workspace와 분리된 shared catalog projection에 저장되며, review action에는 actor account id/email, 변경 필드, draft snapshot hash가 기록됩니다. 현재 allowlist bootstrap과 draft 단위 review ownership/recovery는 구현했지만 OAuth·조직별 RBAC·팀/프로젝트 단위 권한 정책은 운영 단계에서 추가해야 합니다.

review mutation은 `RecipeCatalogMutation`의 draft+audit snapshot/flush 경계를 사용합니다. import·검토 수정·승인·반려 중 catalog persistence가 실패하면 `recipe_review_persistence_unavailable`과 `retryable=true`를 반환하고 기존 draft status와 audit를 유지합니다. 관리자 화면은 이 오류를 기존 draft 보존 안내와 inline `다시 시도`로 표시합니다. 이 recovery contract는 shared catalog의 local transaction만 보장하며, 외부 COOKRCP fetch·license 확인·planner materialization을 같은 transaction으로 주장하지 않습니다.

shared catalog에는 user workspace revision과 분리된 `rescue_recipe_catalog_revisions`
row가 있습니다. draft 목록 GET의 `X-Rescue-Meal-Recipe-Catalog-Revision`을 frontend가
다음 mutation의 `If-Rescue-Meal-Recipe-Catalog-Revision`으로 전달하며, 다른
관리자가 먼저 저장한 경우 `recipe_catalog_revision_conflict` 409로 stale write를
차단합니다. 이 경우 자동으로 오래된 편집 내용을 덮어쓰지 않고 최신 draft를 다시
불러와 운영자가 확인합니다.

다중 관리자 review는 revision fence만으로 끝내지 않습니다. pending draft는 운영자가
`claim`을 명시적으로 획득해야 수정·승인·반려할 수 있으며, claim 중인 동안 다른 운영자의
write는 `recipe_review_claim_conflict` 409로 차단합니다. claim에는 현재 담당자 email
(legacy token이면 비어 있음), 획득 시각, 만료 시각이 저장되고 기본 TTL은
`RESCUE_MEAL_RECIPE_REVIEW_CLAIM_TTL_SECONDS=3600`입니다. 만료된 claim은 다음 관리자가
다시 `claim`하여 회수할 수 있고, 현재 담당자는 `release`로 자발적으로 해제할 수 있습니다.
승인·반려가 완료되면 active claim은 자동 해제되며 `claimed`·`released`를 포함한 audit
event가 남습니다. 기존 payload에 ownership field가 없어도 nullable default로 읽히므로
별도 destructive migration 없이 기존 draft를 호환합니다. 공유 legacy token은 모든
사용자가 같은 actor로 보이므로 실제 조직 운영에서는 개별 `recipe_admin` account를
사용해야 합니다.

검토와 게시 결정을 더 분리해야 하는 환경에서는
`RESCUE_MEAL_RECIPE_PUBLISHER_EMAILS`에 publisher account email을 comma-separated로
설정합니다. 이 값이 비어 있으면 기존 호환 동작대로 모든 `recipe_admin`이 승인·반려할 수
있고, 값이 하나라도 있으면 allowlist에 포함된 account만 publish decision을 수행합니다.
production preflight는 publisher allowlist가 비어 있지 않을 때 admin allowlist도 함께
설정되어 있는지, 모든 publisher email이 admin email의 부분집합인지, 두 allowlist의
email 형식이 유효한지를 확인합니다. 잘못된 설정은 `recipe-publisher-without-admin`,
`recipe-publisher-not-admin`, `recipe-admin-email-allowlist`, 또는
`recipe-publisher-email-allowlist` error로 fail-closed 처리됩니다.
reviewer-only account는 claim·canonicalization·저장은 계속할 수 있지만 approve/reject는
`recipe_review_publish_forbidden` 403으로 중단됩니다. `GET /api/recipe-review/capabilities`는
allowlist 원문을 노출하지 않고 현재 actor의 `can_review`, `can_publish`, policy kind만
반환하며, frontend는 이 값을 사용해 게시 버튼을 미리 비활성화합니다. API가 최종 권한
경계이므로 오래된 client도 정책을 우회할 수 없습니다.

다른 기기나 API process가 변경을 만들고 browser transport 메시지를 받지 못한 경우를
위해 review panel은 tab으로 돌아왔을 때와 30초마다 `/api/recipe-review/revision`을
확인합니다. revision이 바뀐 경우에만 현재 queue를 다시 읽으며, 선택 draft가 달라지거나
사라지면 local editor를 stale로 잠그고 운영자가 명시적으로 최신 draft를 불러오게 합니다.
probe 실패는 기존 queue를 지우지 않습니다. 이는 server push나 실시간 event ordering을
보장하는 기능이 아니라 best-effort 보완 경로입니다.

## 검토 후 planner 승격 기준

외부 draft를 승인하거나 `data/fixtures/recipes/recipes-vN.json`으로 옮길 때 다음을 모두 확인합니다.

1. 제목·조리 단계·이미지의 source와 수집 revision을 기록합니다.
2. 각 재료를 Rescue canonical ingredient와 연결하거나 `missing_ingredients` 후보로 남깁니다.
3. `약간`, `적당량`, `1/2개`, `1단`처럼 상품별 의미가 달라지는 표현은 단위 환산 없이 사람이 결정합니다.
4. 현재 inventory 단위와 recipe 필요 단위의 변환 계수가 명확할 때만 planner unit 계약에 넣습니다.
5. 이용조건·이미지 재사용·attribution을 확인하고 `license`를 `project-authored`로 바꾸지 않습니다.
6. 알레르기·식품안전·섭취 가능 여부를 레시피 source가 보증한다고 표시하지 않습니다.
7. 알레르기 회피를 지원할 recipe는 검토된 `allergens` metadata를 명시하고, metadata가 없으면 `unknown`으로 남겨 회피 조건이 있는 planner에서 보류합니다.
8. 승인된 recipe가 planner에 보이는지, pending/rejected가 보이지 않는지 exact/alias/shortage/multi-lot/allergen 테스트를 추가합니다.

승격은 protected review API에서 operator 확인을 거친 뒤 이루어집니다. canonical fixture로 복사하는 경우에는 코드 review와 테스트가 포함된 별도 변경으로 수행합니다. importer 결과를 cron이나 사용자 요청마다 fixture에 덮어쓰는 자동 sync는 지원하지 않습니다.

## 운영 미검증 항목

- API key 발급·호출량·상세 이용조건은 운영 계정으로 별도 확인해야 합니다.
- 공식 레시피의 모든 재료 표현이 현재 parser로 정규화되는 것은 아닙니다.
- 이미지 URL의 장기 보존·재배포 권한은 아직 승인하지 않았습니다.
- `COOKRCP01`의 공개 레시피는 제품별 소비기한·lot 상태·보관 이력을 제공하지 않습니다.
- 실시간 외부 API 장애·rate limit·재시도 정책은 운영 gateway에서 추가해야 합니다.
- operator review/import 화면은 `?review=1` opt-in 경로로 구현되어 있으며, source status·bounded filter·shared catalog·recipe_admin role·review actor audit·draft claim/release·production legacy-token fail-closed guard까지 구현되어 있습니다. 별도 admin 배포·조직별 RBAC·OAuth·audit 보존정책은 아직 없습니다.
- shared recipe catalog projection은 구현했지만, 팀/프로젝트 단위 권한·review actor audit 보존기간·legacy token을 제거하는 운영 정책은 아직 운영 기준으로 확정하지 않았습니다.
