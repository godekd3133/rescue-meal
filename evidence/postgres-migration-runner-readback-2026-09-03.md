# PostgreSQL migration runner readback

기준일: 2026-09-03

기존 PostgreSQL volume에서는 Docker init SQL가 다시 실행되지 않으므로,
001→002→003→004→005→006→007→008→009→010 순서와 명시적 apply 경계를 가진
`infra/postgres/migrate.sh`를 추가했습니다.

## 안전 경계

- 기본 모드는 dry-run이며 DB 연결을 열지 않습니다.
- 실제 적용은 `--apply`를 별도로 지정해야 합니다.
- `RESCUE_MEAL_DATABASE_URL`이 PostgreSQL DSN이 아니면 거부합니다.
- `psql`과 `ON_ERROR_STOP`을 요구합니다.
- migration 파일 목록을 glob이 아니라 고정 순서로 실행합니다.
- 각 파일의 SHA-256을 출력합니다.
- DSN·password·API key 값은 출력하지 않습니다.
- migration 적용 후 `/ready`와 실제 read/write smoke test를 별도로 요구합니다.

## 실행 readback

| 검증 | 결과 |
|---|---|
| `sh -n infra/postgres/migrate.sh` | passed |
| dry-run migration plan | passed; 001→002→003→004→005→006→007→008→009→010와 checksum 출력 |
| fresh-volume Compose init mount | passed; `006_multi_day_meal_plans.sql`·`007_shopping_list.sql`·`008_meal_preferences.sql`·`009_inventory_search.sql`·`010_receipt_review_locations.sql`가 `/docker-entrypoint-initdb.d/`에 포함 |
| 009 inventory search contract | passed; `pg_trgm`, `search_text` backfill, trigram index, workspace/storage 보조 index |
| apply without PostgreSQL DSN | 의도된 exit 1; DB 연결 전 중단 |
| Compose/CI wiring | dry-run step 연결 완료 |
| live PostgreSQL migration | Docker daemon unavailable; 미검증 |

실제 apply는 운영 backup과 secret-manager DSN 검토 후에만 수행해야 합니다. 이
runner의 성공은 migration SQL가 실행됐다는 뜻이며, schema readiness·권한·
extension·row-lock·inventory read/write가 정상이라는 뜻은 아닙니다.
