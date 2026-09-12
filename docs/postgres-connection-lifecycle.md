# PostgreSQL connection lifecycle

Rescue Meal의 workspace 저장소는 현재 full-snapshot persistence 모델을 사용합니다. 각 `PostgresStore`는 자신의 workspace snapshot과 revision을 들고 있으며, 한 번의 write 동안 `FOR UPDATE → projection/normalized write → revision update → COMMIT`을 같은 PostgreSQL connection에서 끝내야 합니다. 따라서 workspace connection을 무작정 하나로 공유하거나 cursor 단위로 반납하면 동시성 계약을 깨뜨릴 수 있습니다.

이 문서는 그 제약 안에서 구현한 connection 수명주기와 operation-scoped pool 계약을 기록합니다. 현재 pool의 적용 범위는 workspace 저장소이며, shared product runtime·recipe catalog·auth는 별도 direct connection owner로 남아 있습니다. 이 direct owner들은 `ReconnectablePostgresConnection`으로 감싸져 연결이 끊긴 뒤 다음 요청에서 제한된 시간 안에 연결을 다시 열 수 있습니다.

## 현재 구현

`WorkspaceStoreRouter`는 다음 역할을 갖는 깊은 Module입니다.

- request 또는 worker 작업이 `acquire_workspace(workspace_id)`로 workspace 저장소를 lease합니다.
- lease가 유지되는 동안 같은 workspace의 snapshot과 transaction을 보호합니다.
- 작업이 끝나면 `release_workspace(workspace_id)`가 lease를 반환합니다.
- PostgreSQL/파일 기반 SQLite workspace만 유휴 cache 후보가 됩니다. in-memory workspace는 데이터 유실을 막기 위해 eviction하지 않습니다.
- 유휴 durable workspace가 `RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE`를 초과하면 가장 오래 사용하지 않은 store를 닫고 map에서 제거합니다.
- 다음 요청이 제거된 workspace를 다시 사용하면 저장된 row를 새 store가 다시 읽습니다.
- PostgreSQL workspace store는 physical connection을 직접 오래 보관하지 않고 `PostgresOperationPool`의 operation checkout을 사용하는 `PooledConnectionProxy`를 보관합니다.
- `cursor()`로 시작한 checkout은 기존 `PostgresStore` 계약의 `commit()` 또는 `rollback()`이 끝날 때까지 유지되고, 그 뒤에만 pool로 반환됩니다.

기본 cache 크기는 `16`이고 허용 범위는 `1..256`입니다. 이 값은 **유휴 workspace snapshot/store의 상한**이지 physical connection 수가 아닙니다. physical workspace operation은 기본 `min_size=1`, `max_size=8`인 pool이 제한하며, active workspace 수가 pool max를 넘으면 bounded checkout timeout 뒤 `503`으로 표면화합니다.

## Interface와 invariant

### Workspace lease Interface

```text
with router.workspace_session(workspace_id, seed=...):
    # 이 블록 안에서만 workspace store를 사용한다.
```

이 Interface의 invariant은 다음과 같습니다.

1. acquire가 성공하면 release가 반드시 한 번 실행됩니다.
2. 같은 workspace에 동시에 여러 lease가 있으면 마지막 lease가 끝날 때까지 store를 닫지 않습니다.
3. 유휴 store만 eviction하며, active lease의 store를 닫지 않습니다.
4. eviction/reopen은 PostgreSQL row를 다시 load하므로 workspace 식별자·lot·revision 계약을 바꾸지 않습니다.
5. in-memory store는 close 대상이 아닙니다. 세션 종료가 곧 데이터 삭제가 되기 때문입니다.
6. account delete의 `purge_workspace(..., allow_current_lease=True)`는 row purge와 store 제거를 같은 router lock 안에서 수행합니다. 삭제 endpoint의 현재 lease 하나만 명시적으로 허용하고, worker나 다른 요청의 lease가 있으면 store를 닫지 않고 삭제를 중단합니다. 다른 caller의 기본값은 active lease를 모두 거부합니다.

HTTP middleware는 인증된 workspace를 acquire하고 refresh한 뒤 handler를 실행하고, response 또는 exception 뒤에 release합니다. Grocy, notification, I1250 product enrichment worker도 같은 lease를 사용합니다. guest/account 생성은 새 workspace를 준비하는 동안 명시적인 `workspace_session`을 사용합니다.

### Process lifecycle

FastAPI `application_lifespan`은 process shutdown 때 다음 순서로 resource owner를 닫습니다.

1. `WorkspaceStoreRouter.close()` — cached workspace와 base store
2. `PostgresAccountRepository.close()` — auth와 persistent auth rate limiter가 공유하는 connection
3. `GrocyClient.close()` — 설정된 외부 HTTP client

`PostgresStore.close()`, auth close, operation pool close는 idempotent입니다. startup pool open이 실패해도 lifespan의 `finally`가 직접 owner를 정리합니다. cleanup 실패가 이미 처리된 response를 500으로 바꾸지 않도록 router/lifespan cleanup은 예외를 삼키고, 다음 readiness 또는 재연결 시 실패를 표면화합니다.

## Topology

현재 process 하나의 steady-state connection 구성은 다음과 같습니다.

```text
base PostgresStore connection
  ├─ shared product lookup cache
  ├─ shared product-name cache
  ├─ provider rate limiter
  └─ shared recipe catalog

PostgresAccountRepository connection
  └─ account / revocation / reset / auth rate limiter

workspace snapshot/store cache
  └─ 최대 16개의 유휴 durable workspace store (기본값, physical connection 상한 아님)

workspace operation pool
  └─ min 1 / max 8 physical connection (기본값)
```

base와 auth의 direct owner는 모두 reconnectable wrapper를 사용하지만 하나의 pool로 합쳐지지는 않습니다. 여러 worker process를 사용하는 배포에서는 process마다 base/auth connection과 operation pool이 존재합니다. 현재 구현 범위의 보수적인 workspace DB connection 상한은 다음처럼 계산합니다.

```text
대략적인 API process connection 상한
≈ process 수 × (1 base + 1 auth + postgres_pool_max_size)
```

`cache_size`는 pool의 `max_size` 대체값으로 해석하지 않습니다. PostgreSQL max_connections에는 migration/readiness, admin, monitoring, 다른 서비스의 여유를 별도로 남겨야 하며, 실제 multi-process 배포에서는 process 수와 각 worker의 별도 DB client도 함께 계산해야 합니다.

## Adapter와 Seam

현재 `PostgresStore.__init__(connection=...)`와 `PostgresAccountRepository.__init__(connection=...)`는 fake/live connection을 주입할 수 있는 Adapter seam입니다. `PostgresStore.__init__(operation_pool=...)`는 이 경계에 operation pool Implementation을 추가합니다. `PooledConnectionProxy`는 기존 `cursor()`/`commit()`/`rollback()` Interface를 유지하면서 실제 pool lease의 lifetime을 숨깁니다.

`_persist_all()`은 `FOR UPDATE → compatibility projection → normalized write → revision update → COMMIT/ROLLBACK`을 한 proxy lease에서 실행합니다. 따라서 normalized adapter에 넘기는 cursor와 revision lock, 최종 commit은 같은 physical connection을 사용합니다. read path도 cursor가 끝난 뒤 rollback하고 lease를 반환합니다.

이 선택의 Leverage는 request·worker·account creation·shutdown이 같은 lease 규칙을 사용한다는 점입니다. Locality는 connection을 언제 만들고, 언제 보호하고, 언제 닫는지에 대한 지식이 `WorkspaceStoreRouter`와 application lifespan에 집중된다는 점입니다. caller는 revision SQL과 connection 내부 상태를 알 필요가 없습니다.

삭제 테스트를 적용하면, router를 제거할 경우 각 caller가 workspace cache, refcount, LRU eviction, close 순서를 직접 구현해야 합니다. 따라서 현재 router는 pass-through가 아니라 snapshot lifetime과 pool owner lifecycle을 조율하는 Module입니다.

## Pool의 적용 범위와 남은 경계

현재 단계에서 operation-scoped pool이 실제로 동작합니다.

- `PostgresOperationPool`은 psycopg `ConnectionPool`의 `min_size`, `max_size`, checkout timeout, `max_waiting`, idle/lifetime, reconnect timeout, connection check를 설정합니다.
- `PooledConnectionProxy`는 full-snapshot write와 read cursor가 operation 종료 전에는 connection을 반환하지 않도록 합니다.
- pool exhaustion은 `PostgresPoolUnavailable`로 변환되어 workspace middleware와 FastAPI exception handler에서 `503`으로 처리합니다.
- router의 LRU는 이제 snapshot/store object cache를 줄이는 역할이고, physical connection cap은 operation pool이 담당합니다.

아직 production 전체 완료로 보지 않는 경계도 명확합니다.

- 현재 pool은 workspace operation에만 적용됩니다. shared product cache·recipe catalog·auth/rate-limit·readiness의 raw connection owner를 하나의 pool로 통합하지 않았습니다.
- pool max는 API **process별** 상한입니다. 여러 uvicorn worker/process의 합계 상한이 아니므로 배포 계산이 필요합니다.
- disposable PostgreSQL에서 exhaustion, same-connection persistence/reopen, idle transaction cleanup, shutdown close는 확인했지만 운영 failover, network partition, crash recovery, multi-process capacity는 별도 acceptance입니다.
- 실제 pool health를 외부 managed PostgreSQL에서 장시간 관찰하거나 connection failure 뒤 reconnect latency SLO를 검증하지 않았습니다.

따라서 production preflight는 pool 설정을 별도로 검증하고, 운영 배포 전에 `process 수 × (base + auth + pool max)`와 PostgreSQL reserved connection 여유를 검토해야 합니다.

## Direct owner connection recovery

base snapshot, shared product lookup/name cache, provider rate limiter, recipe catalog,
auth repository는 process 수명 동안 direct connection owner로 동작합니다. 이
connection은 다음 경계를 갖습니다.

- 첫 연결은 startup에서 eager하게 열어 기존 fail-fast 동작을 유지합니다.
- psycopg의 transport/lifecycle 오류가 관찰되면 현재 connection을 invalidate합니다.
- 다음 cursor/execute 요청에서만 `RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS` 안에 새 connection을 엽니다.
- 실패한 query와 `COMMIT`은 절대로 자동 replay하지 않습니다. write가 서버에 도달했을 수 있기 때문입니다.
- 현재 요청은 `503`으로 끝나고, retry 가능한 read 또는 사용자가 다시 누른 write가 새 connection을 사용합니다.
- `rollback()`은 연결이 이미 끊긴 경우 새 connection을 만들어 cleanup transaction을 오염시키지 않도록 no-op입니다.

이 경계는 server-side `pg_terminate_backend`로 API process의
application-name 세션만 종료하는 disposable PostgreSQL smoke로 확인합니다.
smoke는 readiness, 기존 inventory/auth read, recovery 이후 단일 write, account
cleanup을 확인하며, 실패한 write를 반복하지 않습니다.

## Configuration

Compose API process는 다음 환경변수를 전달합니다.

```text
RESCUE_MEAL_WORKSPACE_STORE_CACHE_SIZE=16
RESCUE_MEAL_POSTGRES_PROCESS_COUNT=1
RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS=10
RESCUE_MEAL_POSTGRES_MAX_CONNECTIONS=100
RESCUE_MEAL_POSTGRES_POOL_MIN_SIZE=1
RESCUE_MEAL_POSTGRES_POOL_MAX_SIZE=8
RESCUE_MEAL_POSTGRES_POOL_TIMEOUT_SECONDS=5
RESCUE_MEAL_POSTGRES_POOL_MAX_WAITING=64
RESCUE_MEAL_POSTGRES_POOL_MAX_IDLE_SECONDS=300
RESCUE_MEAL_POSTGRES_POOL_MAX_LIFETIME_SECONDS=1800
RESCUE_MEAL_POSTGRES_POOL_RECONNECT_TIMEOUT_SECONDS=30
RESCUE_MEAL_POSTGRES_POOL_CLOSE_TIMEOUT_SECONDS=5
RESCUE_MEAL_POSTGRES_DIRECT_RECONNECT_TIMEOUT_SECONDS=5
```

운영에서 process 수 `P`, operation pool max `M`, PostgreSQL `max_connections`를 다음처럼 여유 있게 검토합니다.

```text
P × (2 + M) + R <= PostgreSQL max_connections
```

여기서 `P`는 rolling deploy 중 동시에 살아 있을 수 있는 전체 API process 수,
`M`은 process 하나의 workspace operation pool max, `R`은
`RESCUE_MEAL_POSTGRES_RESERVED_CONNECTIONS`입니다. 현재 API가 직접 소유한
base/auth/workspace pool만 포함한 보수적 계산이며 보장식이 아닙니다. 다른
worker와 provider client의 DB connection, PostgreSQL의
`superuser_reserved_connections`, failover 여유는 `R`에 포함해 더 크게
잡아야 합니다. production preflight는 `P`, `R`, 실제 서버
`max_connections`를 명시하지 않으면 통과시키지 않습니다.

## Verification

- `services/api/tests/test_postgres_contract.py`는 idle LRU eviction, reopen 후 data readback, router shutdown close, auth close idempotency, cache size validation을 확인합니다.
- `services/api/tests/test_postgres_pool.py`는 settings bound, one-checkout-until-commit, cursor failure rollback, exhaustion conversion, pool close idempotency를 확인합니다.
- `services/api/tests` 전체 API contract test는 변경 후 모두 통과했습니다.
- `services/api/tests/test_postgres_connection.py`는 direct owner의 closed connection 교체, query/fetch/commit transport failure invalidate, SQL error 보존, 명시적 close 이후 재연결 금지를 확인합니다.
- `services/api/scripts/postgres_connection_lifecycle_smoke.py`는 disposable PostgreSQL에서 base+auth+2-cache bound, eviction/reopen data persistence, shutdown connection 회수를 확인합니다.
- `services/api/scripts/postgres_pool_smoke.py`는 disposable PostgreSQL에서 `max_size=2` 두 lease 점유, 세 번째 checkout timeout, pooled workspace persistence/reopen/purge, `pg_stat_activity` idle transaction 0, pool shutdown connection 0을 확인합니다.
- `services/api/scripts/postgres_connection_recovery_smoke.py`는 고유 `application_name` 세션을 실제로 종료한 뒤 direct owner와 workspace operation pool의 readiness/auth/read/write 복구 및 scoped cleanup을 확인합니다.
- lifecycle 결과는 [PostgreSQL connection lifecycle readback](../evidence/postgres-connection-lifecycle-readback-2026-09-04.md)에, operation pool 결과는 [PostgreSQL operation pool readback](../evidence/postgres-operation-pool-readback-2026-09-04.md)에 기록합니다.

direct owner recovery 결과는 [PostgreSQL direct connection recovery readback](../evidence/postgres-direct-connection-recovery-readback-2026-09-07.md)에 기록합니다. 이 증거는 disposable PostgreSQL에서 의도적인 backend termination을 입증하지만, 운영 PostgreSQL의 network partition, managed failover, multi-process aggregate cap, backup object encryption/retention까지 입증하지 않습니다.
