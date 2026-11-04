# 운영과 배포

이 페이지는 실행 경로를 찾는 안내입니다. 현재 운영 서비스의 정상 상태를 새로 확인한 기록은 아닙니다. 실제 대상과 설정은 [GCP 구성](https://github.com/godekd3133/rescue-meal/blob/main/infra/gcp/README.md)과 [운영 runbook](https://github.com/godekd3133/rescue-meal/blob/main/docs/operations-runbook.md)을 함께 확인합니다. 상세 문서의 과거 환경·검증 날짜도 확인하세요.

## 배포 전

1. 배포할 revision과 환경을 고정하고 해당 CI 결과를 확인합니다.
2. 실제 운영 환경변수를 secret manager에서 공급합니다.
3. API 디렉터리에서 설정 gate를 실행합니다.

```bash
cd services/api
uv run python scripts/preflight_production.py --mode production
```

이 명령은 설정 점검이며 DB·provider 연결 성공을 대신하지 않습니다. 선택 연동의 경고까지 gate로 삼으려면 `--strict`를 사용합니다.

## Migration

저장소 루트에서 계획을 먼저 확인합니다.

```bash
sh infra/postgres/migrate.sh --dry-run
```

실제 적용은 승인된 DB 대상의 `RESCUE_MEAL_DATABASE_URL`과 백업을 준비한 뒤 `sh infra/postgres/migrate.sh --apply`로 실행합니다. 순서와 checksum ledger를 보존하고 이미 적용된 SQL을 임의 수정하지 않습니다. 이번 Wiki 작업은 migration을 적용하지 않습니다.

## 운영 확인

| 확인 | 의미 |
| --- | --- |
| `/health` | 프로세스 생존 |
| `/ready` | 저장소·필수 설정 등의 준비 상태 |
| OCR `/ready` | 모델 초기화·warm-up까지 확인 |
| 내부 metrics | 인증된 collector의 bounded 지표 수집 |
| worker 상태 | heartbeat·outbox·retry·dead-letter·reconciliation |

workspace DB 연결 pool은 프로세스별 cap입니다. rolling deploy 중 겹치는 프로세스와 base/auth 연결·운영 여유를 포함해 DB 전체 연결 수를 계산합니다.

## 백업·복구·롤백

- `infra/postgres/backup.sh --output PATH`: PostgreSQL custom-format 백업. DSN은 환경에서 받으며 기존 파일을 덮어쓰지 않습니다.
- `infra/postgres/restore.sh`: 복구 대상과 승인·절차를 runbook에서 확인한 뒤 사용합니다.
- `infra/dr-drill.sh`: disposable 환경 복구 drill 경로입니다.
- additive schema와 API 호환성을 확인한 뒤 이미지·설정 rollback을 진행합니다. DB schema를 무조건 역변경하지 않습니다.

인증 오류·schema 누락·pool 고갈·worker 준비 실패를 단순 재시작으로 숨기지 않습니다. 식별 가능한 오류 code와 request ID로 원인을 추적합니다. 외부 작업의 처리 여부가 불확실하면 reconciliation 상태를 확인하고 중복 전송을 피합니다.

상세: [관측성](https://github.com/godekd3133/rescue-meal/blob/main/docs/observability.md) · [보안 기준](https://github.com/godekd3133/rescue-meal/blob/main/docs/security-baseline.md) · [개인정보 수명주기](https://github.com/godekd3133/rescue-meal/blob/main/docs/privacy-data-lifecycle.md)
