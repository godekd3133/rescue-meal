# Perf baseline readback — 2026-09-13

## 목표

`infra/perf-smoke.sh`로 production-shaped disposable Compose 스택을 띄워
dashboard read model과 normalized inventory write 경로의 첫 측정 가능한
performance baseline을 기록합니다. 기존 `postgres_pool_smoke`가 pool 고갈
semantics를 검증했다면, 이 smoke는 지연 분포와 동시성 수렴을 증명합니다.

## 구성

- `infra/perf-smoke.sh`: disposable Compose 스택 부팅(동일 container smoke
  형태), guest token 발급, `services/api/scripts/perf_smoke.py` 실행,
  프로젝트 리소스만 정리.
- `services/api/scripts/perf_smoke.py`: stdlib 전용 측정기. 순차 read
  120회, 동시 read 100회(4 workers), 동시 write 24회(4 workers, 개별
  Idempotency-Key), 같은 key 동시 replay 8회, 마지막으로 dashboard
  `food_count` 정합성 확인. 비정상 status 또는 `food_count` 부족,
  p95 > `RESCUE_MEAL_PERF_SMOKE_MAX_P95_MS`(기본 15000ms)면 fail-closed.
- 지연은 published host port 경로를 통해 측정해 Docker forwarding까지
  포함한 로컬 client 관점 숫자입니다.

## 측정 결과 (Apple Silicon, Docker Desktop, PostgreSQL normalized)

| 구간 | count | errors | min | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- |
| sequential read `/api/dashboard` | 120 | 0 | 9.9ms | 15.3ms | 28.0ms | 42.2ms |
| concurrent read 4w | 100 | 0 | 19.8ms | 60.5ms | 204.0ms | 236.6ms |
| concurrent write 4w `POST /api/foods` | 24 | 0 | 95.8ms | 138.1ms | 209.1ms | 223.1ms |
| same-key 동시 replay 8회 | 8 | 0 | 45.5ms | 109.3ms | 176.5ms | 176.5ms |

- dashboard `food_count`는 32로 수렴해 고유 mutation 25건 이상을 반영했고,
  같은 key 동시 요청은 모두 `201`로 수렴해 중복 lot을 만들지 않았습니다.
- project `rescue-meal-perf-smoke-20955`에서 `Rescue Meal perf smoke passed`.

## 해석과 남은 범위

- 이 baseline은 단일 호스트 Docker의 첫 참조 수치이며 운영 SLO가 아닙니다.
  실제 배포 대상의 CPU·네트워크·DB 공존 상태에서 동일 스크립트로 재측정해
  임계값을 조정해야 합니다.
- 지속 부하·long-tail p99·pool 고갈 도달·OCR 동시 추론 지연·reverse proxy
  추가 오버헤드는 이번 bounded smoke 범위 밖입니다.
