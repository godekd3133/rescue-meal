# Recipe planner v2·조리 완료 readback — 2026-09-02

## 결론

planner v2의 curated alias·단위·수량 검증과 저장 식단의 조리 완료 흐름을 현재 날짜 기준으로 재검증했습니다. 사용자가 명시적으로 완료를 누른 경우에만 matched lot에 `consumed` event를 만들고, 재고가 실제로 갱신되는 것을 API와 브라우저에서 확인했습니다.

## 구현 범위

- recipe fixture 5개에 검토된 `aliases` 추가
- 상품명은 exact match 후 curated alias만 보조 사용
- recipe 필요 단위와 lot 단위를 비교
- lot 수량이 필요량보다 작으면 `available=false`로 표시
- `POST /api/meal-plans/preview`는 무상태 계산
- `POST /api/meal-plans`는 workspace 저장
- preview plan ID를 save retry 멱등 키로 사용
- `POST /api/meal-plans/{plan_id}/complete`는 사용자 확인 후 소비 처리
- 같은 complete retry는 `already_completed`로 응답
- 완료 후 `completed_at`·`consumed_food_ids`를 저장
- 완료 시 차감하지 못한 재료명을 `completed_skipped_ingredients`로 저장
- 생성된 `consumed` event에 `meal_plan_id`를 기록
- 같은 재료의 여러 lot를 필요량까지 합산하고 `allocations`로 소비량을 분배
- 저장된 `saved`·`completed` audit event를 프론트 `식단 기록 보기`에서 조회
- 완료 후 현재 재고와 무관하게 `최근 식단 보기`에서 이전 plan을 재조회
- `10·20·30·45분` 조리 시간 선택에 따른 recipe 후보 변경
- recipe fixture source name·license·revision을 response와 화면에 표시
- 저장 시 snapshot hash와 `saved`·`completed` audit event를 기록
- 저장 후 lot별 `사용량 확인` 조절기로 실제 사용량을 줄여 전송
- planner allocation을 초과한 사용량 요청은 `422`로 거부
- 2026-09-02 날짜 formatter에서 당일 날짜를 `오늘`로 표시

## API 검증

실행 조건:

```text
API: http://127.0.0.1:8000
storage: sqlite-local
OCR worker: http://127.0.0.1:8002
Grocy: disabled (외부 URL/key 미설정)
```

동일 guest workspace에서 확인한 결과:

```text
GET /api/dashboard
→ food_count=7, rescue_count=3

POST /api/meal-plans/preview
inventory_ids=[spinach-1,tofu-1,chicken-1]
→ planner_version=recipe-planner-v2
→ recipe_id=spinach-tofu-chicken-bowl
→ matched_ratio=1
→ match_type=[exact,exact,exact]
→ saved_at=null

POST /api/meal-plans with plan_id=<preview id>
→ saved_at 생성

같은 POST 재호출
→ 같은 id, 같은 saved_at

POST /api/meal-plans/<plan id>/complete
→ status=completed
→ consumed_food_ids=[spinach-1,tofu-1,chicken-1]
→ skipped_ingredients=[]
→ consumed event에 meal_plan_id=<same plan id>

사용량 조정:

```text
chicken-1 planner allocation=1팩
→ client consumptions quantity=0.5팩
→ consumed_allocations quantity=0.5
→ chicken-1 remaining quantity=1.5팩
```

GET /api/dashboard
→ food_count=5
→ spinach/tofu 제거
→ chicken quantity 2→1

같은 complete 재호출
→ status=already_completed
→ 추가 consumed event 0개

snapshot/audit readback:

```text
preview snapshot_hash length=64
save → saved event 1개
save retry with same hash → same plan id, no duplicate saved event
same plan_id with different hash → HTTP 409
complete → completed event 1개, same snapshot_hash, consumed_allocations 저장
GET /api/meal-plans/<plan id>/events → [saved, completed]
```

여러 lot readback:

```text
시금치 0.5팩 + 0.5팩으로 split
→ preview allocations=[spinach-1:0.5, child-lot:0.5]
→ complete consumed event 2개
→ 각 event quantity=0.5, 동일 meal_plan_id
```
```

별칭과 수량 단위도 unit test로 확인했습니다.

```text
국내산 시금치 → 시금치 ingredient, match_type=alias, available=true
두부 quantity=0.5모 → 필요량 1모 미달, available=false, missing_ingredients 포함
```

## 브라우저 검증

연결 모드(`VITE_API_BASE_URL=http://127.0.0.1:8000`)에서 다음 흐름을 확인했습니다.

1. 홈 배지 `서버 연결됨`
2. `내 식품 목록 7`, `오늘 먼저 먹기 3`
3. 식단 sheet open 후 API recipe 제목 표시
4. `레시피 보기`에서 조리 순서 3단계·안전 메모 표시
5. `식단 저장` 후 `저장됨`과 toast 표시
6. sheet 재진입 후 `/latest` 비교로 `저장됨` 복원
7. `조리 완료로 기록` 후 sheet 종료 및 dashboard 재동기화
8. API 재시작 후 동일 SQLite guest workspace의 저장 계획 상태 복원
9. 저장 후 `사용량 확인`에서 닭가슴살 1팩을 0.5팩으로 줄이고 완료: pantry에 1.5팩 잔존

현재 날짜가 2026-09-02인 상태에서 표시 날짜가 실제 당일이면 `오늘`로 표시되는 것도 별도 formatter 수정 후 확인했습니다.

## 자동 검증

```text
services/api: uv run pytest                         → 130 passed, 5 warnings
apps/web prototype E2E: 11 tests                    → 11 passed
apps/web connected planner/review E2E                → 5 passed
apps/web mobile runtime: full 8 tests               → 8 passed
apps/web npm run build                              → passed
apps/web npm run test:sites                         → 4 passed
apps/web npm run check:runtime                      → protected files 28개 무결성 통과
infra: docker compose config                        → passed
```

production build는 초기 client chunk `505.96KB`로 Vite `500KB` advisory warning이 남아 있습니다. `MealPlanSheet` lazy chunk는 `16.24KB`, `RecipeReviewPanel` lazy chunk는 `10.22KB`, `AccountSheet` lazy chunk는 `4.83KB`입니다. 이 warning은 build 실패가 아니며, 다음 bundle budget 작업 대상입니다.


## 아직 남은 상용화 작업

- recipe fixture 5개를 원출처·license·수집 revision이 있는 30~50개로 확대
- 상품별 단위 환산과 사용량 수정 audit 이력·recipe snapshot 고도화
- 알레르기·인원수·예산·영양·조리도구 constraint
- 3일 식단 최적화·opt-in 알림
- PostgreSQL/Grocy live container readback
- 실기기 카메라·PWA 설치·offline 재진입 검증

현재 결론은 “재고 기준 레시피를 안전 경계 안에서 저장하고, 사용자 확인 후 소비 event까지 연결하는 로컬 상용앱형 vertical slice”입니다. 식품 안전 판정이나 실제 폐기량 감소 효과를 의미하지 않습니다.
