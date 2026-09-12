# DR Drill Readback — 2026-09-13

Disposable 컨테이너 검증. 외부 운영 환경 acceptance 아님.

## 무엇을 증명했는가

`infra/dr-drill.sh`가 백업→복구→애플리케이션 계층 복구 가능성을 end-to-end로
증명한다. 기존 CI의 backup/empty-DB restore 체크가 pg_dump/pg_restore 동작만
보는 것과 달리, 복구된 DB 위에서 **실제 API 프로세스가 원래 게스트 토큰으로
동일 데이터를 읽어내는지**까지 확인한다.

## 절차와 결과

1. PID-scoped disposable Compose 스택 (`rescue-meal-dr-drill-39824`) 기동:
   db → migrate(001→026) → ocr-worker → api, 전부 `/ready` 확인
2. 실제 API write path로 인벤토리 시드: 게스트 인증 + `POST /api/foods` ×2
   → `GET /api/dashboard` `food_count` 기록 (9)
3. `infra/postgres/backup.sh` → pg_dump custom-format archive 생성
   - 129,779 bytes, sha256 기록, mode 600, client: docker
4. 같은 postgres 인스턴스에 `rescue_meal_restored` 빈 DB 생성 후
   `infra/postgres/restore.sh --confirm-restore` 적용 → `rescue-meal-ready`
5. 복구 DB를 가리키는 두 번째 API 컨테이너를 같은 Compose network에 기동:
   - `/ready` → `status=ready`, `database=ok`,
     `storage=postgresql-normalized-inventory`
   - 원본 게스트 access token으로 `GET /api/dashboard`
   - **`food_count`: 9 → 9 일치** (워크스페이스·인증·인벤토리 전부 복구됨)
6. 정리: restored API 컨테이너 제거 + 프로젝트 containers/volumes/network/
   로컬 이미지만 삭제

## 의미

- 백업이 "존재"하는 것과 "시스템을 되살릴 수 있는" 것은 다르다. 이 드릴은
  후자를 재현 가능하게 만든다.
- 인증 레코드(`rescue_auth_*`)가 같은 덤프에 포함되므로 복구 후 기존 토큰이
  그대로 유효한 점, migration ledger가 덤프에 포함되어 복구 DB가
  `rescue-meal-ready`로 승인되는 점도 함께 검증됐다.

## 남은 외부 acceptance

- 실제 운영 DB의 백업 주기·offsite/object storage 업로드·WAL archiving·
  retention/암호화 정책
- managed failover 환경에서의 RPO/RTO 측정
- 복구 후 traffic cutover 운영 절차의 실제 리허설
