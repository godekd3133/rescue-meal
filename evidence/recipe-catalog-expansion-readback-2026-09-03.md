# Recipe starter catalog expansion readback

기준일: 2026-09-03

Rescue Meal의 식단 추천이 적은 fixture에만 의존하지 않도록 팀 작성 starter
catalog를 30개로 확장했습니다. 외부 레시피를 무검토로 planner에 넣지 않는
기존 경계는 유지했습니다.

## Catalog contract

- 모든 recipe는 `id`, title, minutes, ingredients, steps, safety note를 가짐
- 모든 ingredient는 canonical name, 검토된 alias, amount, unit을 가짐
- provenance는 `source_name`, `source_url`, `license`, `revision`을 보존
- 현재 source는 `recipe_fixture`, revision은 `recipes-v1`
- 새 recipe는 seed 7개 식품만으로 기존 full-match를 가로채지 않도록 부족 재료를 포함
- planner는 부족 재료를 재고에 임의로 생성하지 않고 `missing_ingredients`로 표시

## Added coverage

두부·김치·밥·닭가슴살·양배추·양파·참치·당근·감자·우유·옥수수·오이·
파프리카·애호박·파스타면·부침가루 등 일상 재료 조합을 추가했습니다. 10~25분 범위의
볶음·덮밥·국·수프·샐러드·한 팬 요리를 포함합니다.

## Verification

| 검증 | 결과 |
|---|---|
| JSON parse | 30 recipe objects |
| recipe fixture contract | 30개 모두 alias·steps·safety·provenance 통과 |
| existing full-match planner | 기존 시금치·두부·닭가슴살 덮밥 유지 |
| existing 10-minute selection | 기존 맛타리버섯 달걀 볶음 유지 |
| missing ingredient behavior | 임의 재고 생성 없이 missing 표시 |
| API 전체 pytest | 변경 후 209 passed |
| connected planner E2E | 30 passed |

레시피 수가 늘어도 recipe 추천은 식품 안전 판정이 아니며, 각 식품의 표시
날짜·상태를 먼저 확인해야 합니다. COOKRCP01 외부 수집 recipe는 별도
`pending → review → approved` gate를 통과하기 전까지 shared planner에 추가하지
않습니다.
