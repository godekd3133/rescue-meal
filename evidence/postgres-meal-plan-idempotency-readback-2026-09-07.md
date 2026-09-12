# PostgreSQL meal-plan idempotency readback

검증일: 2026-09-07  
대상: POST /api/meal-plans,
POST /api/meal-plans/{plan_id}/complete,
services/api/app/main.py

## 목적

식단 저장은 preview에서 받은 plan_id를 재사용하고, 조리 완료는 저장된 plan
ID를 command identity로 사용합니다. 단일 process의 순차 재시도뿐 아니라 두
API process가 같은 PostgreSQL workspace에서 동시에 저장·완료할 때 plan 중복
저장이나 소비 event 이중 차감이 없는지 확인했습니다.

## 구현 경계

- plan_id가 있는 단일 식단 저장은 plan별 lock으로 같은 process의 중복 계산과
  saved audit 생성을 직렬화합니다.
- bundle_id가 있는 다일 식단 저장은 bundle별 lock으로 동일 bundle의 중복
  저장을 직렬화합니다.
- PostgreSQL revision conflict가 발생하면 store가 승자 snapshot을 reload하고,
  동일 snapshot·recipe인 저장 요청은 이미 저장된 plan/bundle을 반환합니다.
- 조리 완료는 plan별 lock으로 한 process의 이중 차감을 막습니다.
- 다른 process가 먼저 완료한 경우 패배 process는 최신 completed_at을 읽어
  already_completed 결과를 반환합니다.
- 완료 처리는 planner allocation과 현재 lot 수량·단위를 다시 검증하며,
  어떤 경우에도 계획 추천만으로 재고를 차감하지 않습니다.
- 공통 workspace `snapshot()/restore()` contract에 saved meal plans와
  shopping list를 포함해 save/completion rollback 시 process-local phantom
  state가 남지 않도록 했습니다.

## 실행 환경

- disposable Compose pgvector/pgvector:pg16
- normalized inventory mode
- 두 개의 단일 worker Uvicorn process
- 하나의 guest token/workspace
- --lifespan off; solver cold-start를 live race 결과와 분리
- process별 HTTP save race와 completion race

## 결과

실행 결과:

```text
PostgreSQL meal-plan idempotency smoke passed:
save=200 initial+replay completion=completed+already_completed
plans=1 saved_events=1 completed_events=1
compatibility_consumed_events=3 normalized_consumed_events=3.
```

세부 readback:

| 항목 | 결과 |
| --- | --- |
| 단일 plan 저장 응답 | 두 process 모두 200, 동일 preview plan_id·snapshot_hash |
| 저장된 plan | 1개 |
| saved audit event | 1개 |
| completion 응답 | completed 1개 + already_completed 1개 |
| completed audit event | 1개 |
| compatibility consumed event | 3개 |
| normalized consumed event | 3개 |
| 소비 식품 | spinach-1, tofu-1, chicken-1 각 1회 |
| guest workspace cleanup | purge 후 관련 plan/storage rows 0개 |

## 회귀

- process-local 같은 plan_id 동시 저장은 API fixture에서 동일 plan ID와 saved
  audit 1개로 확인했습니다.
- meal-plan flush failure API fixture에서 실패한 plan과 saved audit가 모두
  snapshot으로 복원되어 이후 retry가 phantom plan을 반환하지 않는 것을
  확인했습니다.
- 기존 다일 bundle bundle_id + snapshot_hash 재시도와 bundle day progress
  회귀는 유지됩니다.
- 기존 단일 plan 순차 save retry는 같은 plan ID와 snapshot conflict 409로
  확인됩니다.
- 기존 completion retry는 already_completed이고 추가 consumed event를
  만들지 않습니다.
- API 전체: 382 passed, 7 warnings

## 범위와 남은 운영 게이트

이 readback은 같은 workspace를 공유하는 두 API process의 revision conflict와
재고 소비 event 중복 방지를 증명합니다. 실제 managed PostgreSQL failover,
reverse proxy response reset, 장시간 rolling deploy churn, 외부 Grocy
transaction 보상과 실제 모바일 사용자 네트워크 환경은 별도 운영
acceptance입니다.
