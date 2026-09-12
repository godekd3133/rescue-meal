# Container hardening readback — 2026-09-12

## 목표

운영 컨테이너의 최소 권한·리소스·로그 경계를 실제 부팅 검증으로 확인합니다.
대상은 `services/api/Dockerfile`, `services/ocr-worker/Dockerfile`,
`infra/docker-compose.yml`, `infra/container-smoke.sh`입니다.

## 변경

- API·OCR worker 이미지가 uid `10001(rescue)` 비root 사용자로 실행됩니다.
  `uv sync --frozen --no-dev`가 build 시점에 venv를 완성하므로 entrypoint는
  `/app/.venv/bin/uvicorn`·`/app/.venv/bin/python`을 직접 사용해 시작 시마다
  `uv run`이 환경을 재검증하지 않습니다.
- PaddleX 모델 캐시는 `PADDLE_PDX_CACHE_HOME=/home/rescue/.paddlex`로 옮기고
  named volume `rescue_meal_paddlex_cache`가 그 경로에 붙습니다.
- 모든 서비스에 `no-new-privileges:true`, json-file 로그 `10m×3` non-blocking
  rotation, `deploy.resources.limits.memory`를 적용했습니다
  (`RESCUE_MEAL_DB_MEMORY_LIMIT=2g`, `RESCUE_MEAL_API_MEMORY_LIMIT=1g`,
  `RESCUE_MEAL_OCR_MEMORY_LIMIT=4g`, `RESCUE_MEAL_WORKER_MEMORY_LIMIT=512m`
  기본값, `.env.example`에 문서화).
- `container-smoke.sh`의 migration ledger 검증을 고정값 `25`에서
  `infra/postgres/NNN_*.sql` 파일 수 기반으로 변경했습니다. additive migration이
  추가돼도 smoke가 깨지지 않습니다.

## 검증

- `docker compose -f infra/docker-compose.yml config --quiet`와
  `--profile grocy --profile notifications --profile product-enrichment` 동일
  검증 모두 통과.
- `sh infra/container-smoke.sh` 통과 (project `rescue-meal-container-smoke-65361`):
  - `migration_rows: 26` — 신규 `026_export_audit.sql`까지 ledger 일치
  - `api_health: ready`, `ocr_health: ready` (모델 warm-up 포함)
  - `guest_dashboard_foods: 7 -> 8` (normalized PostgreSQL write)
  - `idempotency_replay: 201 + X-Idempotency-Replayed=true`
- 실행 중 `docker exec <api|ocr-worker> id` → `uid=10001(rescue)`.
- `docker inspect` → `security=["no-new-privileges:true"]`,
  `mem=1073741824`, `log=json-file/10m` 확인.

## 남은 범위

- read-only rootfs, seccomp/AppArmor profile, image digest pinning, private
  registry scan과 signed deployment는 별도 운영 gate입니다.
- `docker compose`의 `deploy.resources.limits`는 single-host Compose에만
  적용되며, orchestrator(Kubernetes 등) 배포 시 각자의 limit 필드로
  옮겨야 합니다.
