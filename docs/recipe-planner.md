# 재고 기반 Rescue Meal 레시피 플래너

기준일: 2026-09-01

## 결론

현재 레시피 기능은 생성형 AI가 임의로 요리법을 만드는 방식이 아니라, 검토된 JSON fixture에 있는 레시피를 현재 재고와 결정론적으로 매칭하는 1차 구현입니다. 사용자가 sheet를 열면 미리보기만 계산하고, `식단 저장`을 눌렀을 때만 workspace에 저장합니다.

```text
현재 Rescue Queue
→ 재고 식품 ID 선택
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
| planner | `services/api/app/planner.py` | fixture 로드, exact/curated alias match, 단위·수량 검증, 점수·부족 재료 계산 |
| API response | `services/api/app/main.py` | preview/save/latest/complete endpoint와 workspace persistence |
| 프론트 API adapter | `apps/web/src/mealApi.ts` | preview/save/latest 요청과 `ApiMealPlan` 타입 |
| 모바일 UI | `apps/web/src/MealPlanSheet.tsx` | 최대 20개 현재 lot preview·재료·조리순서·부족 재료·저장·조리 완료 상태 표시 |
| 저장 projection | SQLite `meal_plans`·`meal_plan_events`, PostgreSQL `rescue_api_meal_plans`·`rescue_api_meal_plan_events` | workspace별 계획 snapshot과 save/complete audit |

## 레시피 fixture 계약

각 레시피는 다음 필드를 가져야 합니다. `aliases`는 검토된 상품명 연결 후보이며, 모델이 임의로 생성한 동의어 목록이 아닙니다.

```json
{
  "id": "spinach-tofu-chicken-bowl",
  "title": "시금치 두부 닭가슴살 덮밥",
  "minutes": 15,
  "ingredients": [
    {"canonical_name": "시금치", "aliases": ["국내산 시금치"], "amount": 1, "unit": "팩"}
  ],
  "steps": ["재료의 상태와 날짜를 확인합니다."],
  "safety_note": "날짜와 상태가 이상하면 조리하지 마세요."
}
```

현재 fixture는 다음 5개입니다.

- 시금치 두부 닭가슴살 덮밥 — 15분
- 버섯 달걀 볶음 — 10분
- 토마토 달걀 팬요리 — 12분
- 시금치 버섯 두부 된장국 — 18분
- 닭가슴살 토마토 팬구이 — 20분

`planner_version`은 `recipe-planner-v2`, `source`는 `recipe_fixture`로 반환합니다. 나중에 식품안전나라 조리식품 API나 Grocy recipe에서 가져온 레시피도 동일한 canonical ingredient 계약으로 변환한 뒤 source와 수집 revision을 별도로 기록해야 합니다.

## 매칭 규칙

v2는 recipe ingredient의 `canonical_name`을 먼저 비교하고, fixture에 명시된 `aliases`만 보조 후보로 사용합니다. 예를 들어 `국내산 시금치`는 `시금치` recipe ingredient의 curated alias로 연결될 수 있습니다. 임의의 생성형 동의어를 자동 승인하지 않습니다.

재료명만 맞는 것으로 끝내지 않고 레시피 필요 단위와 현재 lot 단위를 비교합니다. 단위가 다르거나 현재 수량이 필요량보다 작으면 `available: false`와 `missing_ingredients`로 남깁니다. 같은 식품의 여러 lot은 필요량까지 합산하고, 어떤 lot에서 얼마를 사용할지 `allocations`로 고정합니다. `kg↔g`, `L↔ml`, `ml↔cc`처럼 계수가 명확한 metric 단위만 변환하며, `팩↔개`·`모↔개`처럼 상품별 의미가 다른 단위는 변환하지 않습니다.

각 후보의 점수는 다음과 같습니다.

```text
score
= 일치율 × 100
+ 매칭된 식품별 max(0, 12 - Rescue priority)
- 부족 재료 수 × 8
- 조리시간(분) × 0.6
```

동점일 때는 일치율, 짧은 조리시간, recipe ID 순서로 정렬해 같은 입력이 항상 같은 결과를 내게 합니다. 요청한 `max_minutes` 이하의 후보를 먼저 사용하고, 해당 후보가 없을 때만 전체 fixture에서 후보를 선택합니다. `match_type`은 `exact`·`alias`·`none`으로 반환해 연결 근거를 확인할 수 있게 합니다. `available_quantity`와 `available_unit`은 완료 시점 차감 전에 사용자와 서버가 확인할 수 있는 현재 lot 기준 값입니다.

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

### 저장

```http
POST /api/meal-plans
Content-Type: application/json
Authorization: Bearer <workspace-token>
```

저장 endpoint는 같은 planner로 결과를 다시 계산하고, `recipe_id != no-match`인 경우 `saved_at`을 채워 현재 workspace에 저장합니다. preview의 `id`를 `plan_id`로 함께 보내면 저장 retry에도 같은 계획 ID와 `saved_at`을 반환하는 멱등 동작을 사용합니다. 저장이 성공하면 반환된 동일 payload를 프론트 상태에 반영합니다.

### 최신 저장 계획

```http
GET /api/meal-plans/latest
Authorization: Bearer <workspace-token>
```

저장된 계획이 없으면 `200`과 JSON `null`을 반환하고, 있으면 가장 최근 `saved_at`의 계획을 반환합니다. 프론트는 재진입 시 현재 preview와 `recipe_id`·planner version·inventory ID 순서를 비교해 같은 기준이면 “저장됨” 상태와 저장 payload를 복원합니다.

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

1. 홈의 `지금 있는 재료로 식단 만들기`를 누르면 sheet가 열리고 API preview를 요청합니다.
2. 응답을 기다리는 동안 “현재 재료를 살펴보고 있어요”를 보여주며 빈 레시피를 확정하지 않습니다.
3. 결과에는 레시피 제목·시간·필요한 재료·보유/부족 상태가 표시됩니다.
4. `레시피 보기`는 저장하지 않고 조리 순서와 안전 메모를 펼칩니다.
5. `식단 저장`은 실제 save endpoint를 호출하고 성공할 때만 `저장됨`·toast를 표시합니다.
6. 저장 후 `사용량 확인`에서 allocation별 `− / 현재량 / +`를 조정할 수 있습니다. 기본값은 현재 재고와 planner 배정량 중 더 작은 값입니다.
7. `조리 완료로 기록`을 누르면 사용자 확인 뒤 입력한 matched lot만 소비 처리하고, API 연결 모드에서는 dashboard를 다시 읽어 재고를 갱신합니다.
8. API를 연결하지 않은 demo mode에서는 local fixture를 사용해 동일한 시각 흐름을 재현하고, 완료 시 입력한 수량만 화면 fixture 재고에서 차감합니다.

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

1. fixture 5개를 30~50개로 늘리고 각 recipe의 원출처 URL·수집일·license·revision을 저장합니다.
2. 상품명 alias와 recipe ingredient를 canonical product ID로 연결하고, 단위·수량 환산을 추가합니다.
3. 알레르기·식단 선호·인원수·예산·조리도구를 constraint로 추가하되 사용자 입력을 명시적으로 받습니다.
4. 단위 환산·recipe snapshot·사용량 수정 이력까지 고정하고, 조리 완료 시 partial consume event와 recipe ID를 더 강하게 연결합니다.
5. OR-Tools는 recipe 후보의 데이터 품질과 수량 계약이 충분해진 뒤 3일 식단 최적화에 도입합니다.
6. 저장 계획에 알림 task와 만료 정책을 붙이고, push/ntfy는 사용자의 opt-in 이후에만 전송합니다.
7. 같은 입력·fixture·planner version의 결과 hash를 기록해 deterministic replay를 유지합니다.

## 검증 명령

```bash
cd services/api
uv run pytest tests/test_planner.py tests/test_api.py tests/test_sqlite_store.py

cd ../../apps/web
MOBILE_RUNTIME_TEST_PORT=4175 npm run test:runtime -- --workers=1 tests/prototype.spec.ts
VITE_API_BASE_URL=http://127.0.0.1:8000 \
  MOBILE_RUNTIME_TEST_PORT=4176 \
  npm run test:runtime -- --workers=1 tests/connected-prototype.spec.ts
```

초기 계약 결과는 [레시피 플래너 readback](../evidence/recipe-planner-readback-2026-09-01.md)에, 현재 planner v2·조리 완료 결과는 [planner v2·조리 완료 readback](../evidence/recipe-planner-completion-readback-2026-09-02.md)에 기록합니다.
