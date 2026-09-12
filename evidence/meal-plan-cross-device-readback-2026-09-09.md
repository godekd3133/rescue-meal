# Meal-plan cross-device revision readback — 2026-09-09

## Scope

이번 readback은 열린 planner가 다른 기기의 식단·재고 변경을 감지하면서도 사용자가
아직 저장하지 않은 메뉴 선택과 lot 사용량을 자동으로 잃지 않는 경계를 확인한다.

## 원인과 변경

기존 `MealPlanSheet`는 같은 workspace의 cross-tab invalidation과 workspace switch
generation guard는 가지고 있었지만, 다른 기기에서 저장·완료된 식단 또는 재고 변경을
알 수 있는 payload-free probe가 없었다. 단순히 latest 응답으로 교체하면 사용자가
선택한 alternative, servings, consumption draft가 조용히 사라질 수 있다.

다음 경계를 추가했다.

- API에 `GET /api/meal-plans/revision`을 추가해 workspace revision만 반환한다.
- planner 초기 read가 preferences·preview·latest와 revision을 함께 확보해 baseline을
  기억한다.
- planner가 visible tab으로 돌아오거나 30초 주기에 도달하면 revision을 확인한다.
- revision이 바뀌면 현재 plan과 사용량 draft를 유지하고, 사용자에게
  `다른 기기에서 식단이나 재고가 변경됐어요`와 `최신 식단 확인` action을 보여준다.
- 사용자가 action을 선택한 경우에만 preview/latest/preferences를 다시 읽는다.
- planner 자신이 성공시킨 preference/save/complete/shopping mutation은 response에서
  관찰한 workspace revision을 baseline으로 반영해 자기 변경을 remote change로
  오인하지 않는다.
- hidden tab·진행 중인 mutation·probe 실패에서는 화면을 교체하지 않는다.

## 검증 결과

- API `test_meal_plan_revision_probe_is_payload_free_and_advances_after_save`:
  **1 passed**
- API 전체 mirror 회귀: **493 passed**, 8 warnings
- connected E2E 전체: **89 passed**
- 신규 connected scenario:
  - local planner 선택 유지
  - revision 변경 감지
  - alert 표시
  - 명시적 최신 확인
  - 원격 latest plan materialization
- fixture planner scenario: **1 passed**
- production build: protected runtime **28**, Vite **757 modules**
  - MealPlanSheet **38.52 kB**
  - initial client JS **313.09 kB**
- `git diff --check`, workflow YAML, migration shell syntax: 통과

## 미검증 경계

실제 iOS/Android background visibility scheduling, server push ordering, 여러 기기의
동시 planner save/complete, managed PostgreSQL failover/network partition, 외부 provider
transaction은 별도 acceptance다. connected/API는 disposable local mirror 기반이며
운영 PostgreSQL live smoke는 Docker VM 장애로 실행하지 않았다.
