# 재고 기반 Rescue Meal 레시피 플래너

기준일: 2026-09-05

## 결론

현재 레시피 기능은 생성형 AI가 임의로 요리법을 만드는 방식이 아니라, 검토된 JSON fixture에 있는 레시피를 현재 재고와 결정론적으로 매칭하는 1차 구현입니다. 사용자가 sheet를 열면 미리보기만 계산하고, `식단 저장`을 눌렀을 때만 workspace에 저장합니다.

```text
현재 Rescue Queue
→ 재고 식품 ID 선택
→ workspace 알레르기 조건으로 후보 filter
→ recipe fixture 매칭
→ 보유/부족 재료 분리
→ 조리시간·안전 메모 표시
→ 사용자가 레시피를 확인
→ 저장 요청
→ workspace 최신 식단으로 재조회
```

이 기능은 식품 안전 판정이 아니며, 레시피가 추천됐다는 사실이 특정 식품의 섭취 가능성을 보증하지 않습니다.

## 구현 위치

| 영역 | 위치 | 책임 |
|---|---|---|
| 레시피 원본 fixture | `data/fixtures/recipes/recipes-v1.json` | 제목·조리시간·정규 재료명·조리순서·안전 메모 |
| planner | `services/api/app/planner.py` | fixture 로드, exact/curated alias match, 알레르기 metadata filter, 안전한 단위·수량 검증, 환산 근거·점수·부족 재료 계산 |
| API response | `services/api/app/main.py` | preview/save/latest/complete endpoint와 workspace persistence |
| 프론트 API adapter | `apps/web/src/mealApi.ts` | preview/save/latest 요청과 `ApiMealPlan` 타입 |
| 모바일 UI | `apps/web/src/MealPlanSheet.tsx` | 최대 20개 현재 lot preview·조리시간 선택·재료·조리순서·부족 재료·저장·조리 완료 상태 표시 |
| 저장 projection | SQLite `meal_plans`·`meal_plan_events`·`meal_preferences`, PostgreSQL `rescue_api_meal_plans`·`rescue_api_meal_plan_events`·`rescue_api_meal_preferences` | workspace별 계획 snapshot, save/complete audit, 식단 조건 |

## 레시피 fixture 계약

각 레시피는 다음 필드를 가져야 합니다. `aliases`는 검토된 상품명 연결 후보이며, 모델이 임의로 생성한 동의어 목록이 아닙니다. `allergens`를 명시하면 해당 metadata를 사용하고, 생략된 팀 작성 fixture는 canonical ingredient와 검토된 제목·조리 단계에 대한 curated rule로 계산합니다. 외부 승인 recipe가 `allergens`를 생략하면 unknown으로 남습니다.

```json
{
  "id": "spinach-tofu-chicken-bowl",
  "title": "시금치 두부 닭가슴살 덮밥",
  "minutes": 15,
  "ingredients": [
    {"canonical_name": "시금치", "aliases": ["국내산 시금치"], "amount": 1, "unit": "팩"}
  ],
  "allergens": ["soy"],
  "steps": ["재료의 상태와 날짜를 확인합니다."],
  "safety_note": "날짜와 상태가 이상하면 조리하지 마세요."
}
```

현재 starter fixture는 53개입니다. 모든 항목은 팀 작성 provenance와 검토된
ingredient alias·조리 단계·safety note를 갖습니다.

- 시금치 두부 닭가슴살 덮밥 — 15분
- 버섯 달걀 볶음 — 10분
- 토마토 달걀 팬요리 — 12분
- 시금치 버섯 두부 된장국 — 18분
- 닭가슴살 토마토 팬구이 — 20분
- 두부 김치 덮밥 — 15분
- 닭가슴살 양배추 볶음 — 18분
- 시금치 참치 비빔밥 — 12분
- 맛타리버섯 양파 간장볶음 — 12분
- 토마토 애호박 달걀볶음 — 15분
- 두부 참치 김치찌개 — 20분
- 닭가슴살 당근 덮밥 — 20분
- 감자 달걀 팬구이 — 20분
- 우유 옥수수 양파수프 — 18분
- 토마토 두부 오이 샐러드 — 11분
- 버섯 닭가슴살 파프리카볶음 — 20분
- 시금치 감자 양파국 — 22분
- 참치 달걀 볶음밥 — 10분
- 두부 양배추 당근볶음 — 15분
- 닭가슴살 토마토 파스타 — 25분
- 버섯 두부 양파전골 — 22분
- 토마토 달걀 덮밥 — 12분
- 두부 버섯 덮밥 — 16분
- 닭가슴살 시금치 파스타 — 24분
- 토마토 참치 오이무침 — 13분
- 양배추 당근 달걀볶음 — 14분
- 우유 옥수수 감자수프 — 20분
- 버섯 파프리카 양파볶음 — 17분
- 두부 달걀 부침 — 15분
- 닭가슴살 양배추 덮밥 — 19분

`planner_version`은 `recipe-planner-v2`, `source`는 `recipe_fixture`로 반환합니다. 나중에 식품안전나라 조리식품 API나 Grocy recipe에서 가져온 레시피도 동일한 canonical ingredient 계약으로 변환한 뒤 source와 수집 revision을 별도로 기록해야 하며, 알레르기 회피를 지원하려면 `allergens` metadata를 검토 후 채워야 합니다.

## 알레르기 회피 조건

사용자는 식단 sheet의 `식단 조건 설정`에서 주요 알레르기 항목을 workspace 조건으로 저장할 수 있습니다. 현재 코드는 `soy`, `egg`, `milk`, `fish`, `shellfish`, `wheat`, `peanut`, `tree_nut`을 지원합니다. 상세한 code·API·저장·안전 경계는 [식단 조건과 알레르기 회피 설계](meal-preferences.md)를 기준으로 합니다.

planner의 `avoid_allergens`가 비어 있으면 기존 recipe 선택 규칙을 그대로 사용합니다. 하나라도 있으면 `recipe.allergens`와 교집합이 있는 recipe를 제외하고, metadata가 `None`인 external recipe도 제외합니다. 팀 작성 recipe는 canonical ingredient·제목·조리 단계 token에서 deterministic curated metadata를 만들기 때문에 두부 recipe는 `soy`, 달걀 recipe는 `egg`, 조리 단계에 간장이 명시된 recipe도 `soy`로 분류됩니다. 후보가 모두 제외되면 `no-match`와 `preference_filtered=true`를 반환해 사용자가 조건 또는 recipe metadata를 확인하게 합니다.

MealPlan에는 `allergens`, `allergen_metadata_status`, `preference_filtered`, `preference_note`를 보존합니다. `known`은 주요 metadata를 확인했다는 뜻일 뿐 `알레르기 없음`·교차 접촉 없음·섭취 가능을 보증하지 않습니다. 이 기능은 식품 안전 판정이나 의료 조언이 아닙니다. 조리 전 날짜 확인 상태의 실제 readback은 [Meal plan date-review readback](../evidence/date-review-readback-2026-09-03.md)을 기준으로 합니다.

## 조리 전 날짜 확인

planner는 recipe에 실제로 allocation된 lot의 날짜 상태와 포장지 보관조건도 함께 점검합니다. 오늘이거나 지난 `use_by`·`sell_by`·`best_before`, `unknown`·`production_date`·`packaging_date`, 또는 `applicable_storage_type`과 현재 위치가 다른 lot는 `date_review_required=true`와 `date_review_foods`로 화면에 표시합니다. 이 경고는 “조리 전에 포장지 날짜·보관 상태를 다시 확인하라”는 확인 gate이며, 보관 위치가 다르다는 이유로 소비기한을 새로 계산하거나 안전·섭취 가능 여부를 자동 판정하지 않습니다. allocation되지 않은 inventory는 경고하지 않습니다.

## 인원수(서빙) 계약

단일 preview·대안 메뉴·다일 preview·저장 요청은 `servings`를 함께 사용합니다. API의
허용 범위는 `1~8`이고 생략하면 기존 사용자와의 호환을 위해 `1`로 처리합니다. 현재
모바일 UI는 자주 쓰는 `1·2·3·4인분` 선택지를 제공하며, 서버 계약은 이후 household
규모 확장을 막지 않습니다.

fixture의 `ingredients[].amount`는 1인분 기준량입니다. planner는
`필요량 = 기준량 × servings`로 계산하고, 그 결과를 `available`,
`available_quantity`, `allocations`, `missing_ingredients`에 동일하게 반영합니다.
따라서 2인분 요청은 재고가 충분하면 allocation도 2인분 기준으로 잡고, 재고가
부족하면 부족한 양을 표시합니다. 부족분을 채우기 위해 서버가 가상의 StockLot이나
재료를 만들지는 않습니다. 다일 planner도 이 값을 모든 날짜의 candidate materialize와
shared lot capacity에 전달하므로 날짜를 늘리거나 solver를 바꿔도 인원수 기준이
달라지지 않습니다.

저장된 식단에서 장보기 목록을 만들거나 다시 동기화할 때도 저장된 `plan.servings`를
동일하게 적용해 현재 재고 기준 부족량을 재계산합니다. 따라서 2인분 식단에 재료가
1인분만 남아 있으면 장보기에는 남은 1인분 부족량만 표시되고, 완전히 없는 재료는
2인분 기준 부족량이 표시됩니다.

`servings`는 수량 계산 조건이지 영양 섭취량, 알레르기 안전성, 소비기한, 섭취 가능
여부를 판정하는 값이 아닙니다. recipe의 실제 포장 단위가 사람 수에 선형으로
늘어나지 않는 상품(예: 소스 한 병, 조미료)은 향후 recipe별 package rule과 사람이
확인하는 보정 UI가 필요합니다.

## 3일 식단 preview와 bundle 저장

`POST /api/meal-plans/multi-day-preview`는 현재 재고와 조리 가능 시간을 기준으로
최대 3일의 날짜별 recipe를 계산합니다. 첫 날짜에서 recipe allocation에 사용한
수량은 다음 날짜의 shared lot budget에서 차감하고, 같은 recipe는 반복하지
않습니다. 서버는 먼저 fixture와 승인된 shared catalog의 각 recipe를 원본
재고에 대해 독립적으로 materialize한 뒤, OR-Tools CP-SAT가 이 후보들의
조합을 고릅니다. 따라서 solver는 재고·재료·날짜를 새로 만들지 않고 기존
결정론적 `plan_recipe` 결과만 선택합니다. 각 날짜의 allocation 합계는 lot의
원래 단위 수량을 넘지 않으며, 선택된 날짜는 중간에 비는 날 없이 앞에서부터
이어집니다. 응답의 `optimization_engine`은 `or-tools-cp-sat` 또는
`deterministic-greedy`이고, solver가 사용할 수 없거나 해를 반환하지 못하면
후자의 결정론적 fallback으로 복구합니다.

응답은 기존 `MealPlanResponse`를 날짜별로 감싸며 preview 단계의 `saved_at`은
`null`입니다. 프론트에서 날짜를 선택하면 현재 단일 preview를 바꾸고, 실제
단일 plan 저장은 기존 `POST /api/meal-plans`를 사용자가 눌렀을 때만 수행합니다.

여러 날을 한 번에 보관하고 싶은 경우에는 사용자가 3일 식단 영역의 저장 버튼을
눌러 `POST /api/meal-plans/multi-day`를 호출합니다. 서버는 bundle 자체의
`saved_at`만 채우고, 날짜별 하위 `MealPlanResponse`를 단일 plan으로 자동
저장하거나 재고를 차감하지 않습니다. 프론트는 preview의 생성 id를
`bundle_id`로 재사용하고 `snapshot_hash`를 함께 보내므로 네트워크 재시도는
같은 저장 결과를 돌려받고, 다른 snapshot을 같은 bundle id로 덮어쓰려는 요청은
`409`로 거절됩니다.

`GET /api/meal-plans/multi-day/latest`는 현재 재고·조리 시간·snapshot이 같은
최신 bundle을 재진입 화면에서 복원할 때 사용합니다. `GET
/api/meal-plans/multi-day/history`는 workspace에 저장된 bundle을 최근순으로
반환합니다. 저장된 bundle은 SQLite와 PostgreSQL compatibility projection에
workspace별로 보존되며 workspace export와 명시적 guest→account transfer에도
포함됩니다.

bundle의 각 날짜에는 `status`와 `meal_plan_id`가 있습니다. 처음 저장할 때는
`planned`이고, 사용자가 그 날짜를 단일 식단으로 저장하면 `saved`, 조리 완료와
소비 event가 성공하면 `completed`가 됩니다. 완료 시각은 `completed_at`에
기록하며, 완료된 날짜는 화면에서 다시 저장할 수 없도록 막습니다. 단일 식단
completion과 bundle progress update는 같은 저장 경계 안에서 처리하고, 이미
완료된 단일 plan을 재시도해도 추가 소비 event나 progress 변경을 만들지 않습니다.

대안 메뉴나 3일 preview의 특정 날짜를 선택한 뒤 단일 식단으로 저장할 때는
`POST /api/meal-plans`에 선택한 `recipe_id`도 함께 보냅니다. 서버는 현재 승인된
recipe catalog에서 해당 후보를 다시 검증하므로 화면에 보인 메뉴와 저장되는
메뉴가 달라지지 않습니다. 현재 재고에서 선택 후보를 재현할 수 없으면 `409`로
멈추며, preview의 표시용 `available_quantity`가 달라진 정도는 snapshot 충돌로
보지 않되 실제 allocation은 조리 완료 시점의 live lot 수량으로 다시 검증합니다.

`plan_date`와 planner의 조리 전 날짜 확인 기준은 현재 workspace의 알림 timezone
설정을 사용하고, 설정이 없는 legacy workspace는 `RESCUE_MEAL_TIMEZONE` 환경변수와
기본값 `Asia/Seoul`을 사용합니다. 따라서 API process가 UTC로 실행돼도 한국
사용자에게 전날 날짜가 표시되지 않습니다. 다일 preview와 저장 bundle은 식품 안전 판정·소비기한 확정을 의미하지
않습니다. servings는 이미 명시적 수량 조건으로 반영하지만, 영양·예산·검토된
포장 단위 최적화와 저장 bundle 하위 plan의 일괄 조리 완료는 후속 범위입니다.
현재 solver의 목적함수는 가능한 날짜 수를 먼저 최대화하고,
같은 날짜 수에서는 기존 Rescue score·matched ratio·결정론적 tie-break를
사용합니다.

## 부족 재료 장보기 목록

저장된 단일 식단이나 저장된 3일 bundle에서 사용자가 `장보기 목록에 추가`를
눌렀을 때만 부족 재료를 workspace shopping list에 반영합니다. preview만으로는
장보기 목록을 만들지 않습니다.

`POST /api/shopping-list`는 `canonical_name + unit`별로 항목을 합산하고, 어느
단일 plan 또는 bundle의 몇 일차에서 나온 부족분인지 `sources`에 보존합니다.
같은 source를 다시 동기화해도 기여량을 중복 합산하지 않습니다. 3일 bundle은
날짜별 working inventory를 다시 계산해 이전 날짜 allocation을 반영하므로,
재료 하나가 여러 날짜에 부족하면 날짜별 기여량을 각각 유지합니다.

`GET /api/shopping-list`는 목록을 반환하기 전에 연결된 recipe source를 현재
inventory로 재검증합니다. 재료가 새로 입고돼 더 이상 부족하지 않으면 해당
source 기여분을 제거하고, 다른 source의 부족분이 남아 있으면 그 양만
유지합니다. 사용자가 체크한 상태는 수량이 바뀌지 않는 한 보존합니다.

식단에 없는 생활용품이나 별도로 필요한 식재료는 `POST /api/shopping-list/manual`로
같은 목록에 직접 추가할 수 있습니다. 직접 추가 항목은 `manual` source로 표시되고
상품명·단위가 같은 식단 부족 재료와 하나의 item으로 합쳐집니다. 직접 추가 수량을
다시 보내면 기존 manual 기여만 교체하며, recipe source 기여는 유지합니다. 이후
식단을 재동기화하거나 재고를 보충해도 manual source는 보존합니다.

장보기 목록은 소비기한이나 구매 확정 목록이 아닙니다. 사용자가 직접 체크하고
삭제할 수 있으며, 실제 입고는 기존 영수증 review → commit 또는 직접 입력
흐름으로 별도 확인해야 합니다.

## COOKRCP01 가져오기 경계

`services/api/app/recipe_importer.py`는 선택적인 `FOODSAFETY_COOKRCP_API_KEY`가 있을 때 식품안전나라 `COOKRCP01` 레시피를 조회합니다. `GET /api/integrations/recipes/cookrcp/status`는 key의 존재 여부와 source URL만 반환하고 외부 요청을 하지 않습니다. 운영 수집은 [공개 레시피 importer 운영 경계](recipe-importer.md)의 CLI를 사용합니다. 원문 재료·조리순서는 `CookRcpRecipeDraft`로 보존하고, 파싱되지 않은 재료도 `requires_review` 상태로 남깁니다. 공개 API 이용조건은 `public-api-terms-review-required`로 표시하며, 이 importer는 raw row를 현재 deterministic planner fixture로 자동 승격하지 않습니다. 사람이 재료 canonicalization·단위·출처·license를 확인한 뒤 별도 fixture revision으로 반영해야 합니다.

## 조리 가능 시간

프론트는 `10·20·30·45분` 중 하나를 선택하고 `max_minutes`로 API에 전달합니다. planner는 해당 시간 이하의 recipe 후보를 먼저 사용하며, 후보가 하나도 없을 때만 전체 fixture에서 가장 적합한 후보를 선택합니다. 저장된 계획 response에도 `max_minutes`를 보존하고 snapshot hash 계산에 포함하므로, 30분 plan을 10분 화면에 잘못 복원하지 않습니다.

## 매칭 규칙

v2는 recipe ingredient의 `canonical_name`을 먼저 비교하고, fixture에 명시된 `aliases`만 보조 후보로 사용합니다. 예를 들어 `국내산 시금치`는 `시금치` recipe ingredient의 curated alias로 연결될 수 있습니다. 임의의 생성형 동의어를 자동 승인하지 않습니다.

재료명만 맞는 것으로 끝내지 않고 레시피 필요 단위와 현재 lot 단위를 비교합니다. 단위가 다르거나 현재 수량이 필요량보다 작으면 `available: false`와 `missing_ingredients`로 남깁니다. 같은 식품의 여러 lot은 필요량까지 합산하고, 어떤 lot에서 얼마를 사용할지 `allocations`로 고정합니다. `mg↔g↔kg`, `L↔ml`, `ml↔cc`처럼 같은 물리 차원이고 계수가 명확한 metric 단위만 변환하며, `팩↔개`·`모↔개`처럼 상품별 의미가 다른 포장 단위는 변환하지 않습니다. `그램`·`킬로그램`·`밀리리터`·`리터` 같은 표시 변형은 canonical unit으로 정규화하지만, 정규화할 수 없는 단위는 재고를 임의로 환산하지 않습니다.

각 후보의 점수는 다음과 같습니다.

```text
score
= 일치율 × 100
+ 매칭된 식품별 max(0, 12 - Rescue priority)
- 부족 재료 수 × 8
- 조리시간(분) × 0.6
```

동점일 때는 일치율, 짧은 조리시간, recipe ID 순서로 정렬해 같은 입력이 항상 같은 결과를 내게 합니다. 요청한 `max_minutes` 이하의 후보를 먼저 사용하고, 해당 후보가 없을 때만 전체 fixture에서 후보를 선택합니다. `match_type`은 `exact`·`alias`·`none`으로 상품명 연결 근거를 반환하고, `quantity_match`는 수량 판정 근거를 반환합니다. `quantity_match`는 다음 네 값만 사용합니다.

| 값 | 의미 | planner 동작 |
|---|---|---|
| `exact` | 상품명 후보와 단위가 정규화 후 동일함 | 같은 단위로 수량·allocation 계산 |
| `converted` | 같은 물리 차원의 metric 단위를 환산함 | 환산 후 recipe 단위로 보유량을 표시하고, 차감 allocation은 원래 lot 단위로 보존 |
| `incompatible` | 상품명은 맞지만 단위 차원을 안전하게 비교할 수 없음 | 재고를 보유로 계산하지 않고 `available: false`·`단위 확인 필요`로 표시 |
| `missing` | 상품명 후보 자체가 없음 | 부족 재료로 표시 |

`available_quantity`와 `available_unit`은 완료 시점 차감 전에 사용자와 서버가 확인할 수 있는 현재 lot 기준 값이며, `converted`일 때는 recipe 단위로 환산된 합계입니다. `quantity_match`는 설명용 metadata이므로 snapshot hash에는 포함하지 않고, 실제 recipe·allocation·수량 계약이 바뀔 때만 저장 충돌을 일으킵니다.

다일 preview에서는 각 날짜의 plan을 앞 날짜 allocation을 차감한 working inventory로
다시 materialize합니다. 따라서 1일차에 버섯 1팩을 사용했다면 2일차의
`available_quantity`와 allocation은 남은 lot 기준으로 표시됩니다. 이 재물질화는
solver가 고른 recipe ID와 전체 lot capacity를 바꾸지 않으며, 실제 조리 완료 시에는
항상 live lot 수량을 다시 검증합니다.

예시:

| 입력 재고 | 결과 |
|---|---|
| 시금치·두부·닭가슴살 | 3/3 일치, 시금치 두부 닭가슴살 덮밥 |
| 시금치·닭가슴살 | 2/3 일치, 두부를 `부족한 재료`로 표시 |
| 시금치 0.5팩·두부·닭가슴살 | 시금치는 필요량 미달로 `available: false` |
| 재고 없음 | `no-match`, 요리법을 만들지 않고 추가 입력 요청 |

부족한 재료는 서버가 임의로 재고에 추가하지 않습니다. 프론트는 부족한 재료를 별도 callout으로 보여주고, 보유 재료와 구분된 색·문구를 사용합니다.

## API 계약

### 미리보기

```http
POST /api/meal-plans/preview
Content-Type: application/json
Authorization: Bearer <workspace-token>
```

```json
{
  "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
  "max_minutes": 30
}
```

미리보기는 저장소를 변경하지 않고 `saved_at: null`인 `MealPlanResponse`를 반환합니다.

### 대안 메뉴

```http
POST /api/meal-plans/options
Content-Type: application/json
Authorization: Bearer <workspace-token>
```

같은 `inventory_ids`와 `max_minutes`로 최대 3개의 서로 다른 recipe preview를
반환합니다. 현재 1순위 후보도 응답에는 포함되지만, 프론트는 현재 선택된 후보를
제외한 나머지를 `다른 메뉴` 목록으로 보여줍니다. 각 후보는 `saved_at: null`이며,
사용자가 선택한 뒤 기존 `POST /api/meal-plans`로 저장할 때만 workspace에 남습니다.
따라서 대안 조회는 재고·식단 이력을 변경하지 않습니다.

### 저장

```http
POST /api/meal-plans
Content-Type: application/json
Authorization: Bearer <workspace-token>
```

저장 endpoint는 같은 planner로 결과를 다시 계산하고, `recipe_id != no-match`인 경우 `saved_at`을 채워 현재 workspace에 저장합니다. preview의 `id`를 `plan_id`로 함께 보내면 저장 retry에도 같은 계획 ID와 `saved_at`을 반환하는 멱등 동작을 사용합니다. 이미 저장된 plan을 3일 bundle의 특정 날짜로 재시도할 때 `bundle_id`와 `bundle_day_index`를 함께 보내면 snapshot·recipe·기존 연결을 검증한 뒤 같은 plan ID로 bundle 날짜를 `saved` 상태에 보정하며, 다른 bundle/date 연결은 `409`로 거절합니다. 저장이 성공하면 반환된 동일 payload를 프론트 상태에 반영합니다.

### 최신 저장 계획

```http
GET /api/meal-plans/latest
Authorization: Bearer <workspace-token>
```

저장된 계획이 없으면 `200`과 JSON `null`을 반환하고, 있으면 가장 최근 `saved_at`의 계획을 반환합니다. 프론트는 재진입 시 현재 preview와 `recipe_id`·planner version·inventory ID 순서를 비교해 같은 기준이면 “저장됨” 상태와 저장 payload를 복원합니다.

`GET /api/meal-plans/revision`은 plan payload 없이 현재 workspace revision만 반환합니다.
열린 planner는 tab 복귀와 30초 주기로 이 값을 확인합니다. 다른 기기에서 식단이나
재고가 바뀌면 현재 alternative·인분·lot 사용량 draft를 자동으로 교체하지 않고
`최신 식단 확인` action을 보여줍니다. 사용자가 action을 선택한 경우에만
preferences·preview·latest를 다시 읽습니다. probe 실패·hidden tab·진행 중인 mutation은
현재 화면을 유지합니다.

### 최근 식단

`GET /api/meal-plans/history?limit=10`은 현재 workspace의 저장된 계획을 최근 저장순으로 반환합니다. 현재 재고가 바뀌어 최신 preview와 일치하지 않는 완료 식단도 이 목록에서 확인할 수 있습니다. 프론트의 `최근 식단 보기`는 이 endpoint를 사용하며, 각 항목의 저장/완료 상태·조리시간·실제 사용량을 보여줍니다.

### 응답 핵심 필드

```json
{
  "id": "meal-...",
  "snapshot_hash": "64-character-sha256",
  "saved_at": null,
  "completed_at": null,
  "consumed_food_ids": [],
  "completed_skipped_ingredients": [],
  "consumed_allocations": [],
  "recipe_id": "spinach-tofu-chicken-bowl",
  "planner_version": "recipe-planner-v2",
  "source": "recipe_fixture",
  "recipe_source_name": "Rescue Meal 팀 작성 레시피",
  "recipe_source_url": null,
  "recipe_license": "project-authored",
  "recipe_source_revision": "recipes-v1",
  "max_minutes": 30,
  "inventory_ids": ["spinach-1", "tofu-1", "chicken-1"],
  "ingredients": [
    {
      "canonical_name": "국산콩 두부",
      "amount": 1,
      "unit": "모",
      "available": true,
      "available_food_id": "tofu-1",
      "available_quantity": 1,
      "available_unit": "모",
      "match_type": "exact",
      "quantity_match": "exact",
      "allocations": [{"food_id": "tofu-1", "quantity": 1, "unit": "모"}]
    }
  ],
  "missing_ingredients": [],
  "matched_ratio": 1,
  "reason": "현재 식품만으로 만들 수 있고, 먼저 먹기 순서가 높은 재료를 우선했어요.",
  "steps": ["..."],
  "safety_note": "날짜와 상태가 이상하면 조리하지 마세요."
}
```

`id`는 현재 저장 계획의 식별자이고, `snapshot_hash`는 recipe·planner version·ingredient·allocation을 canonical JSON으로 만든 SHA-256 값입니다. `inventory_ids`는 추천에 실제로 배정된 식품 lot ID이고, 각 ingredient의 `allocations`는 여러 lot에서 사용할 수량을 기록합니다. `saved_at`이 없는 응답은 preview, 값이 있는 응답은 저장된 계획입니다. `completed_at`과 `consumed_food_ids`가 채워지면 사용자가 조리 완료를 확인했고 실제 소비 event가 생성된 계획입니다. `completed_skipped_ingredients`가 비어 있지 않으면 저장 시점과 완료 시점의 재고 차이로 일부 재료를 차감하지 않았다는 뜻이며, 프론트도 전체 차감과 구분된 문구로 표시합니다.

저장·완료의 audit event는 `GET /api/meal-plans/{plan_id}/events`로 조회합니다. preview는 event를 만들지 않고, save는 `saved` event를, complete는 `completed` event를 추가합니다. 두 event 모두 같은 `snapshot_hash`를 가져야 하며, snapshot이 달라진 retry는 `409`로 거부합니다. audit event의 완료 payload에는 실제 사용량과 제외 재료가 들어갑니다.

### 조리 완료와 소비 차감

```http
POST /api/meal-plans/{plan_id}/complete
Content-Type: application/json
Authorization: Bearer <workspace-token>
```

기본 요청 `{}`은 planner가 계산한 allocation을 그대로 사용합니다. 실제 사용량을 조정할 때는 다음처럼 lot별 양을 보내며, 목록을 보낸 경우 명시된 수량만 차감합니다. `quantity: 0`은 해당 lot를 사용하지 않는다는 뜻입니다. 모바일에서는 이 payload를 숫자 입력과 `−/+` 조절기로 만들며, 입력값은 client와 server 양쪽에서 상한을 검증합니다.

```json
{
  "consumptions": [
    {"food_id": "spinach-1", "quantity": 1},
    {"food_id": "tofu-1", "quantity": 1},
    {"food_id": "chicken-1", "quantity": 0.5}
  ]
}
```

저장된 계획에 대해서만 호출할 수 있습니다. 서버는 계획의 각 `available_food_id`를 현재 workspace에서 다시 조회하고, 레시피 필요 단위·수량이 여전히 유효할 때만 `consumed` StorageEvent를 생성합니다. 생성된 event에는 `meal_plan_id`를 함께 기록해 어떤 식단 완료에서 차감됐는지 추적합니다. 필요량이 부족하거나 lot가 사라졌거나 단위가 다르면 해당 재료를 `skipped_ingredients`로 남기고 자동으로 차감하지 않습니다. 한 건도 소비하지 못하면 `409`로 반환하고 계획을 완료 상태로 바꾸지 않습니다.

이미 완료된 계획을 다시 호출하면 새로운 event를 만들지 않고 `already_completed`를 반환합니다. 이로써 앱 재시도나 사용자의 중복 탭이 이중 차감으로 이어지지 않습니다.

## 프론트 상태와 사용자 경험

1. 홈의 `지금 있는 재료로 식단 만들기`를 누르면 sheet가 열립니다.
2. `조리 가능 시간`에서 10·20·30·45분 중 하나를 선택하면 선택값을 `max_minutes`로 전달해 API preview를 다시 요청합니다.
3. 응답을 기다리는 동안 “현재 재료를 살펴보고 있어요”를 보여주며 빈 레시피를 확정하지 않습니다.
4. 결과에는 레시피 제목·실제 조리시간·필요한 재료·보유/부족 상태가 표시됩니다.
5. `레시피 보기`는 저장하지 않고 조리 순서와 안전 메모를 펼칩니다.
6. `식단 저장`은 선택한 시간 제한과 preview 식별자를 함께 save endpoint에 전달하고 성공할 때만 `저장됨`·toast를 표시합니다.
7. 재진입 시 현재 preview와 저장 계획의 recipe·planner version·inventory ID·`max_minutes`를 모두 비교해 같은 조건일 때만 저장 상태를 복원합니다.
8. 저장 후 `사용량 확인`에서 allocation별 `− / 현재량 / +`를 조정할 수 있습니다. 기본값은 현재 재고와 planner 배정량 중 더 작은 값입니다.
9. `조리 완료로 기록`을 누르면 사용자 확인 뒤 입력한 matched lot만 소비 처리하고, API 연결 모드에서는 dashboard를 다시 읽어 재고를 갱신합니다.
10. API를 연결하지 않은 demo mode에서는 local fixture를 사용해 동일한 시각 흐름을 재현하고, 완료 시 입력한 수량만 화면 fixture 재고에서 차감합니다.
11. 다른 기기에서 workspace revision이 바뀌면 현재 선택과 사용량을 보존한 alert를 보여주고, 사용자가 `최신 식단 확인`을 눌렀을 때만 최신 preview/latest를 다시 materialize합니다.

## 저장과 workspace 경계

- in-memory mode에서는 프로세스 수명 동안만 저장됩니다.
- `RESCUE_MEAL_SQLITE_PATH` mode에서는 `meal_plans` table에 JSON payload를 저장하며 repository 재구성 후 복원합니다.
- workspace router를 사용하는 SQLite mode에서는 guest/account workspace별 sibling DB가 분리됩니다.
- PostgreSQL mode에서는 `rescue_api_meal_plans(workspace_id, id, payload)`와 `rescue_api_meal_plan_events(workspace_id, id, payload)` projection에 저장합니다.
- 기존 receipt commit rollback snapshot은 식품·receipt·storage event transaction의 원자성을 담당하며, meal plan 저장과 섞지 않습니다.

## 안전·정확성 경계

레시피 planner는 다음을 하지 않습니다.

- 식품의 소비기한·유통기한을 추론하거나 확정하지 않습니다.
- 날짜 없는 식품을 안전하다고 표시하지 않습니다.
- 상품명만으로 부패·섭취 가능 여부를 판정하지 않습니다.
- 없는 재료를 보유 재료라고 속이거나 자동 구매하지 않습니다.
- 사용자의 조리 완료 확인 없이 재고를 자동 차감하지 않습니다.

현재 `safety_note`는 recipe-level 안내입니다. 실제 사용 후에는 어떤 lot를 얼마나 소비했는지 사용자가 확인하는 `consumed` event가 별도로 생성되어야 합니다.

## 상용화 다음 단계

1. 현재 starter fixture 53개를 source-backed 운영 catalog로 승격할 때, 외부 수집 recipe는 원출처 URL·수집일·license·revision과 review audit을 함께 저장합니다.
2. 현재 metric 단위 환산 정책을 유지하면서 상품명 alias와 recipe ingredient를 canonical product ID·검토된 포장 단위로 연결합니다. `팩/모/개`처럼 상품별 의미가 다른 단위는 상품 catalog가 확인되기 전까지 계속 `단위 확인 필요`로 보류합니다.
3. 알레르기·식단 선호·예산·조리도구를 constraint로 추가하되 사용자 입력을 명시적으로 받습니다. 인원수는 현재 `servings` 수량 조건으로 연결되어 있으며, 이후 household별 package rule을 보강합니다.
4. recipe snapshot·사용량 수정 이력까지 고정하고, 조리 완료 시 partial consume event와 recipe ID를 더 강하게 연결합니다. 단위 환산은 recipe preview와 조리 완료에서 같은 canonical 정책을 사용해야 합니다.
5. 현재 OR-Tools CP-SAT를 3일 식단 preview에 연결했고 `servings` 수량 조건도 candidate·capacity·snapshot에 전달합니다. 다음 단계에서는 영양·예산·포장 단위 catalog를 constraint로 확장하되, 검토되지 않은 단위 환산은 계속 보류합니다.
6. 현재 저장소 기반 in-app notification center는 구현했습니다. 다음에는 저장 계획·사용자 알림일에 대한 lead time 설정과 만료 정책을 붙이고, Web Push/ntfy는 사용자의 opt-in 이후에만 전송합니다.
7. 같은 입력·fixture·planner version의 결과 hash를 기록해 deterministic replay를 유지합니다.

## 검증 명령

```bash
cd services/api
uv run pytest tests/test_planner.py tests/test_api.py tests/test_sqlite_store.py

cd ../../apps/web
MOBILE_RUNTIME_TEST_PORT=4175 npm run test:runtime -- --workers=1 tests/prototype.spec.ts
npm run test:connected -- --workers=1 tests/connected-prototype.spec.ts
```

초기 계약 결과는 [레시피 플래너 readback](../evidence/recipe-planner-readback-2026-09-01.md)에, 현재 planner v2·조리 완료 결과는 [planner v2·조리 완료 readback](../evidence/recipe-planner-completion-readback-2026-09-02.md)에 기록합니다.
