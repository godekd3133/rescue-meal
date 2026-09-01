# Recipe planner readback — 2026-09-01

## 판정

재고 기반 레시피 미리보기·조리순서·저장·조리 완료·소비 이벤트·최신 계획 조회의 1차 vertical slice는 로컬 SQLite API와 모바일 프론트 연결 모드에서 동작을 확인했습니다. 레시피 데이터는 현재 5개 fixture이며, 이 결과는 30~50개 레시피·3일 식단·실제 폐기량 감소를 증명하지 않습니다.

## 검증한 소스

- `data/fixtures/recipes/recipes-v1.json` — 5개 recipe fixture
- `services/api/app/planner.py` — `recipe-planner-v2` exact/curated alias/단위·수량 검증 매칭
- `services/api/app/main.py` — preview/save/latest API와 workspace 저장
- `apps/web/src/MealPlanSheet.tsx` — 로딩·부족 재료·조리순서·저장·조리 완료 UI
- `apps/web/src/mealApi.ts` — API preview/save/latest adapter
- SQLite `meal_plans` table, PostgreSQL `rescue_api_meal_plans` projection

## API readback

실행 조건:

```text
API: http://127.0.0.1:8000
storage: sqlite-local
auth: signed guest token
GROCY: disabled (외부 URL/key 미설정)
```

확인 결과:

| 호출 | 결과 |
|---|---|
| `GET /health` | `status=ok`, `storage=sqlite-local` |
| `GET /api/integrations/grocy/status` | `configured=false`, `status=disabled` |
| guest `GET /api/dashboard` | `food_count=7`, `rescue_count=3` |
| `POST /api/meal-plans/preview` with spinach/tofu/chicken | `recipe_id=spinach-tofu-chicken-bowl`, `planner_version=recipe-planner-v2`, `matched_ratio=1`, `saved_at=null` |
| guest `GET /api/meal-plans/latest` before save | JSON `null` |
| `POST /api/meal-plans` with same IDs | `saved_at`이 채워진 저장 응답 |
| guest `GET /api/meal-plans/latest` after save | 저장 응답과 같은 `id`, `recipe_id=spinach-tofu-chicken-bowl` |
| `POST /api/meal-plans/{plan_id}/complete` | `status=completed`, spinach/tofu/chicken 소비 event 3개, `skipped_ingredients=[]` |
| 완료 후 guest `GET /api/dashboard` | 식품 목록 7개 → 5개, 닭가슴살은 2팩 → 1팩 |
| 같은 complete 재호출 | `status=already_completed`, 추가 event 0개 |

저장 요청에 preview `plan_id`를 재사용해 같은 요청을 한 번 더 전송했을 때, 같은 `id`와 `saved_at`을 반환해 중복 계획이 생기지 않는 것도 API 테스트로 확인했습니다. 저장된 계획의 `complete` 요청도 다시 호출했을 때 `already_completed`를 반환해 소비 event가 중복되지 않았습니다.

추가 deterministic assertion:

```text
시금치 + 닭가슴살만 선택
→ spinach-tofu-chicken-bowl
→ matched_ratio=0.667
→ missing_ingredients=[국산콩 두부]
```

서버는 부족한 두부를 재고에 생성하지 않았습니다.

## 브라우저 readback

`VITE_API_BASE_URL=http://127.0.0.1:8000`으로 실행한 연결 모드에서 확인했습니다.

1. 홈 배지: `서버 연결됨`
2. dashboard: `내 식품 목록 7`, `오늘 먼저 먹기 3`
3. 식단 CTA: sheet open
4. preview 응답 후 제목: `시금치 두부 닭가슴살 덮밥`
5. 필요한 재료: 시금치·국산콩 두부·닭가슴살
6. `레시피 보기`: 3단계 조리 순서와 `안전 메모` 노출
7. `식단 저장`: 버튼 `저장됨`, toast `오늘의 식단을 저장했어요`
8. sheet를 닫았다 다시 열기: `GET /api/meal-plans/latest` 비교 후 `저장됨` 상태 복원
9. `조리 완료로 기록`: matched lot 소비 후 sheet가 닫히고 dashboard 재고가 갱신됨

같은 `RESCUE_MEAL_SQLITE_PATH`로 API를 재시작한 뒤에도 동일 guest token으로 `서버 연결됨`, `내 식품 목록 7`, 식단 sheet의 `저장됨`을 다시 확인했습니다. 저장 계획 projection이 프로세스 재시작 뒤에도 workspace별로 복원된 결과입니다.

카메라·영수증 원본 업로드나 외부 서비스 전송은 이 readback에서 수행하지 않았습니다.

## 자동 검증

```text
services/api: uv run pytest                         → 71 passed, 3 warnings
apps/web prototype E2E: 11 tests                    → 11 passed
apps/web connected planner E2E                      → 1 passed
apps/web npm run build                              → passed
apps/web npm run test:sites                         → 4 passed
apps/web npm run check:runtime                      → protected files 28개 무결성 통과
```

추가한 회귀 범위:

- preview는 `saved_at=null`이고 latest를 만들지 않는지
- save 후 latest가 같은 계획을 반환하는지
- SQLite repository 재구성 후 saved meal plan이 복원되는지
- demo mode에서 레시피 sheet가 조리순서·저장 상태까지 이어지는지
- connected mode에서 CORS·guest token·API preview/save가 실제 브라우저에서 이어지는지
- connected mode에서 sheet 재진입 시 latest saved plan 상태가 복원되는지
- demo/connected mode에서 조리 완료 확인 후 matched lot 소비와 재고 readback이 이어지는지

## 현재 미검증 또는 미구현

- 실제 PostgreSQL container에서 `rescue_api_meal_plans` migration/readback
- Grocy recipe와의 external import 및 transaction 연결
- 레시피 30~50개와 한국어 synonym/단위 환산의 실제 품질
- 대체 단위 환산·recipe snapshot·사용량 수정 이력을 포함한 완전한 recipe-linked consume contract
- 알레르기·인원수·식단 선호·영양 제약
- 3일 식단 최적화와 알림
- preview plan ID를 이용한 save retry 멱등성은 구현했지만, 클라이언트 요청 fingerprint·recipe version 충돌 검증은 다음 단계입니다.
- 실제 iPhone/Android에서 camera·PWA install·offline 재진입

따라서 현재 표현은 “재고를 근거로 한 결정론적 레시피 제안과 workspace 저장이 가능한 로컬 vertical slice”가 정확합니다. 식품 안전이나 장기적인 음식물 쓰레기 감소 효과로 확대해석하지 않습니다.
