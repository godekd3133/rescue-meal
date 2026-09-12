# CI release contract completeness readback — 2026-09-09

## Scope

이번 readback은 변경된 CI workflow가 local web contract lane과 custom storage
normalized PostgreSQL smoke를 실제 실행하도록 명시되어 있는지 확인한다. 이 문서는
GitHub Actions 성공 자체를 주장하지 않는다.

## 변경

- web job에 `npm run test:workspace-sync`와 `npm run test:service-worker`를 명시적인
  release step으로 추가했다. 기존 protected runtime, demo/production build,
  fixture/mobile, Sites worker 검증과 분리된 contract lane이다.
- `postgres-live` smoke에 다음 readback을 추가했다.
  - custom storage location 생성 전후 `GET /api/storage-locations/revision` 증가 확인
  - custom location이 할당된 normalized lot를 canonical `ambient`로 이동
  - 이전 location ID가 storage event history에 남은 상태에서 DELETE 요청
  - HTTP `409`와 `storage_location_in_use` 구조화 code 확인
- `services/api/tests/test_postgres_contract.py`가 workflow에 위 명령·endpoint·
  idempotency key·history delete assertion이 실제로 존재하는지 고정한다.

## 검증

- `services/api/.venv/bin/python -m pytest services/api/tests/test_postgres_contract.py -q`:
  **30 passed**
- `sh -n infra/postgres/migrate.sh`: 통과
- `.github/workflows/verify.yml` Ruby YAML parse: 통과
- 기존 disposable local mirror web contract:
  - `npm run test:workspace-sync`: **9 passed**
  - `npm run test:service-worker`: **5 passed**
  - full connected E2E: **88 passed**
- source workflow와 disposable mirror workflow 비교: 일치

## 미검증 경계

Docker Desktop VM의 ext4 journal/block I/O 오류와 read-only remount 때문에 이 환경에서
`postgres-live` job을 실제로 재실행하지 않았다. 실제 GitHub Actions runner 성공, service
container scheduling, managed PostgreSQL multi-process ordering/failover, 외부 Grocy
compensation은 별도 acceptance다.
