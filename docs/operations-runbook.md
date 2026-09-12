# Rescue Meal 운영 runbook

기준일: 2026-09-12

이 문서는 배포·롤백·백업/복구·스케일링·장애 대응의 실행 절차를 한 곳에 묶습니다.
개별 계약의 상세 근거는 각 도메인 문서(`observability.md`, `security-baseline.md`,
`postgres-connection-lifecycle.md`, `privacy-data-lifecycle.md`)를 따릅니다.

## 구성 요소

| 구성 요소 | 이미지/실행 | 역할 | 헬스체크 |
| --- | --- | --- | --- |
| `db` | `pgvector/pgvector:pg16` | PostgreSQL + pgvector, `rescue_meal_pgdata` 볼륨 | `pg_isready` |
| `migrate` | `services/api/Dockerfile` | `infra/postgres/NNN_*.sql` ordered apply, ledger 기록 | one-shot (`restart: "no"`) |
| `api` | `services/api/Dockerfile` | FastAPI, uid `10001(rescue)` 비root | `GET /ready` |
| `ocr-worker` | `services/ocr-worker/Dockerfile` | PaddleOCR 추론, uid `10001(rescue)`, `linux/amd64` | `GET /ready` |
| `grocy-worker` | api 이미지, `grocy` profile | Grocy outbox 동기화 | api healthy 종속 |
| `notification-worker` | api 이미지, `notifications` profile | Web Push delivery outbox | api healthy 종속 |
| `product-enrichment-worker` | api 이미지, `product-enrichment` profile | 상품 보강 outbox | api healthy 종속 |

공통 컨테이너 정책: `no-new-privileges`, json-file 로그 10MB×3 non-blocking,
서비스별 memory limit(`RESCUE_MEAL_*_MEMORY_LIMIT`).

## 배포 절차

1. **사전 검증** — release candidate 커밋에서 CI `verify.yml` 전 job 통과를
   확인합니다. 로컬에서는 `sh infra/container-smoke.sh`가 disposable 스택으로
   동일 부트·읽기/쓰기 경로를 재현합니다.
2. **Secret 준비** — `.env.example`의 필수값을 secret manager에 준비합니다.
   최소: `POSTGRES_PASSWORD`, `RESCUE_MEAL_AUTH_SECRET`,
   `RESCUE_MEAL_CORS_ORIGINS`, `RESCUE_MEAL_OBSERVABILITY_TOKEN`.
   선택(provider 없으면 기능이 비활성): `MFDS_API_KEY`, `GROCY_*`,
   `FOODSAFETY_COOKRCP_API_KEY`, `RESCUE_MEAL_VAPID_*`, email provider.
3. **DB 백업** — migration 전에 반드시 백업합니다(아래 백업 절차).
4. **Migration** — ledger 계획을 먼저 검토한 뒤 적용합니다.

   ```bash
   sh infra/postgres/migrate.sh --dry-run   # 이름·checksum 계획만 출력
   RESCUE_MEAL_DATABASE_URL=postgresql://... sh infra/postgres/migrate.sh --apply
   ```

   checksum이 기록과 다른 파일은 drift로 중단되므로, 기존 migration을 수정하지
   말고 새 `NNN_*.sql`을 추가합니다.
5. **Preflight** — production 모드 컨테이너는 부팅 시
   `scripts/preflight_production.py --mode production`을 자동 실행해 설정 누락과
   `PROCESS_COUNT * (2 + pool max) + reserved <= max_connections` 연결 예산을
   검사하고, 실패 시 시작을 거부합니다.
6. **Rollout** — `docker compose up -d`로 `db → migrate → ocr-worker → api`
   순서가 healthy 조건으로 보장됩니다. rolling deploy 중에는
   `RESCUE_MEAL_POSTGRES_PROCESS_COUNT`에 구·신 process 합계를 반영합니다.
7. **배포 후 확인** — `/health`, `/ready`, 게스트 발급→대시보드 읽기,
   `container-smoke`의 idempotency replay 경로를 같은 순서로 점검합니다.

## 롤백

- **애플리케이션 롤백**: 이전 이미지 태그로 `docker compose up -d api` 재기동.
  additive-only migration 정책 덕분에 구 버전이 새 schema에서도 동작하는 것이
  목표 계약입니다. 동작 변경이 schema에 강하게 붙은 경우에도 destructive
  rollback migration을 만들지 않고 보정 migration을 추가합니다.
- **실패한 migration**: `--apply`는 파일 단위로 body+ledger를 함께 commit하고
  실패한 migration 이후는 진행하지 않습니다. 원인을 수정한 새 migration을
  추가해 정합성을 회복하고, 이전 checksum 파일을 편집해 재적용하지 않습니다.
- **데이터 롤백**: 복구 절차(아래)의 빈 DB restore 경로만 사용합니다.

## 백업과 복구

```bash
# 백업: custom-format archive, 파일 권한 600, DSN은 출력하지 않음
RESCUE_MEAL_DATABASE_URL=postgresql://... sh infra/postgres/backup.sh --output PATH

# 복구: 비어 있는 새 DB에만 허용. 기존 schema를 절대 drop하지 않음
RESCUE_MEAL_DATABASE_URL=postgresql://... sh infra/postgres/restore.sh \
  --input PATH --confirm-restore [--confirm-production-restore]
```

호스트에 psql/pg_dump가 없으면 `RESCUE_MEAL_POSTGRES_CLIENT_MODE=docker`로
버전이 맞는 client 이미지를 사용합니다(`infra/postgres/client-contract.sh`).
백업 주기·offsite 보관·WAL archiving·retention 정책은 managed DB 선택과 함께
정하는 별도 운영 acceptance입니다.

## 스케일링 한도

- API process 수는 `RESCUE_MEAL_POSTGRES_PROCESS_COUNT`로 선언해 연결 예산을
  preflight가 강제합니다. process당 `(2 base/auth + pool max)`를 점유하고,
  `reserved`는 migration·backup·운영자 접속용으로 남깁니다.
- OCR worker는 CPU-bound이므로 process당 동시 추론 1
  (`RESCUE_MEAL_OCR_MAX_CONCURRENCY=1`)이 기본이며, 수평 확장은 replica를
  늘리는 방향입니다. `linux/amd64` 전용 wheel이므로 ARM 노드는 별도 검증이
  필요합니다.
- worker(grocy/notification/product-enrichment)는 workspace ID 목록과
  lease/heartbeat로 분할 실행되며, workspace 단위 동시 처리 상한은
  `*_PROCESS_LIMIT` env로 조정합니다.

## 관측과 장애 대응

- Metrics: `GET /api/internal/metrics` (Bearer `RESCUE_MEAL_OBSERVABILITY_TOKEN`).
  low-cardinality counter/histogram만 노출되고 workspace·token·OCR 원문은
  label에 들어가지 않습니다. 자세한 scrape 계약은 `observability.md`.
- Client error telemetry: `POST /api/client-errors`는 제한된 field만 받고
  secure mode에서 IP bucket rate limit을 적용합니다. 외부 collector 연결은
  `security-baseline.md`의 운영 요구사항을 따릅니다.
- readiness 의미: `/ready`는 DB 연결·auth 설정·inventory mode를 포함한 typed
  envelope를 반환하므로, 503 본문의 `code`/`action`으로 장애 원인을 먼저
  분류합니다. 일시 장애(`retryable=true`)만 재시도하고 설정 누락
  (`configure_server`/`configure_storage`)은 배포 설정을 수정합니다.
- OCR worker가 unavailable이면 intake는 영수증/라벨 OCR 경로만 degraded로
  동작하고 수동 입력은 계속됩니다. worker `/ready`의 `worker_state`와
  모델 warm-up 상태를 먼저 확인합니다.

## 검증 근거

- `infra/container-smoke.sh`: disposable Compose 스택으로 migration ledger·
  `/ready`·게스트 인증·normalized inventory write·idempotency replay를 검증.
- `infra/perf-smoke.sh`: 같은 스택에서 dashboard read·normalized write의
  지연 분포와 동시성 수렴을 측정합니다. 배포 대상이 바뀌면 같은 스크립트로
  baseline을 재측정해 `RESCUE_MEAL_PERF_SMOKE_MAX_P95_MS`를 조정합니다.
- `evidence/container-smoke-readback-2026-09-11.md` 및 최신 readback 문서에
  실행 결과를 남깁니다.
