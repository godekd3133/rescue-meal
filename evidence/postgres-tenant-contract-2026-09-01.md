# PostgreSQL tenant-aware contract — 2026-09-01

## 구현된 경계

- API projection tables에 `workspace_id`를 추가했습니다.
- `rescue_api_foods`, `rescue_api_receipts`, `rescue_api_storage_events`, `rescue_api_commit_transactions`는 `(workspace_id, id)` 복합키를 사용합니다.
- fingerprint projection은 `(workspace_id, fingerprint)` 복합키를 사용합니다.
- 기존 single-workspace projection row는 migration에서 `demo` workspace로 승격됩니다.
- PostgresStore의 count/load/delete/insert query는 모두 현재 `workspace_id`를 조건으로 사용합니다.
- accounts와 revoked tokens는 `rescue_auth_accounts`, `rescue_auth_revoked_tokens`에 저장하는 adapter를 사용합니다.
- `rescue_api_recipe_drafts`도 `(workspace_id, id)` 복합키와 workspace filter를 사용해 review draft가 다른 workspace로 새지 않도록 합니다.
- 실제 review route는 별도의 shared `rescue_recipe_catalog_drafts`·`rescue_recipe_catalog_review_events`를 사용하므로 승인 recipe가 user workspace 사이에 공유되고, user inventory는 계속 tenant-scoped로 유지됩니다.

## 코드 수준 검증

- fake psycopg connection으로 migration DDL, workspace filter, composite-key insert, account/revoke SQL을 실행 경로에 통과시켰습니다.
- Contract snapshot 당시 API: `54 passed, 2 warnings`; 이후 레시피 preview/save/latest와 조리 완료·multi-lot·사용량 조정·단위 환산·audit·조리시간·최근 식단·COOKRCP importer/status·recipe review/RBAC/shared catalog·Grocy receipt/storage-event·dead-letter retry·in-flight reconciliation·worker lease/heartbeat·product mapping search/edit workflow·mapping before/after audit·workspace flush·notification·InventoryRepository distinct-lot·normalized mode contract·workspace revision guard·observability/readiness 회귀를 포함한 현재 전체 API suite는 `130 passed, 5 warnings`입니다.
- schema static contract assertion: 통과
- Compose config expansion: baseline 통과

## 아직 검증하지 못한 것

현재 환경에는 `postgres`, `psql`, `initdb`, `pg_ctl`이 없고 Docker daemon도 실행 중이지 않습니다. 따라서 실제 PostgreSQL startup, migration 적용, 두 workspace 동시 readback, pgvector extension, multi-process connection pool은 아직 증명하지 않았습니다.

실제 DB를 사용할 때는 `infra/postgres/001_initial_schema.sql`을 적용하고 `RESCUE_MEAL_DATABASE_URL`을 설정한 뒤, workspace A/B의 동일 logical food ID·receipt fingerprint·event ID가 서로 충돌하지 않는지 확인해야 합니다.
