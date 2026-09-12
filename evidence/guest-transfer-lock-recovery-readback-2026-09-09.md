# Guest transfer lock/recovery readback — 2026-09-09

## 확인한 결함

`POST /api/account/guest-transfer`는 guest source를 account target으로 복사할 때 두
workspace의 lock을 사용하고 있었지만, `ready`/`conflict` 상태 판정이 copy lock 밖에서
먼저 실행되었습니다. preview 또는 판정 직후 account workspace에 다른 식품 기록이 저장되면,
transfer가 오래된 guest snapshot을 target에 복사해 새 account 기록을 덮을 수 있었습니다.

또한 target `flush()`가 PostgreSQL revision conflict를 반환한 경우에도 일반 예외 복구가
target backup을 복원할 수 있어, 이미 다른 process가 저장한 winner snapshot을 stale copy로
되돌릴 위험이 있었습니다.

## 설계와 변경

- source workspace ID와 target workspace ID를 정렬한 고정 순서로 두 `_lock`을 획득합니다.
- 두 lock을 보유한 상태에서 `ready`/`conflict`/`already_transferred`/`empty`를 다시
  계산하고 source counts와 설정 변경 여부도 같은 snapshot에서 읽습니다. `ready`가 아니면
  copy를 수행하지 않습니다.
- `ready`일 때만 target backup을 lock 안에서 만들고 guest transfer field,
  `meal_preferences`, `notification_preferences`를 복사한 뒤 target을 flush합니다.
- 일반 persistence failure는 target memory를 기존 backup으로 복원하고
  `guest_transfer_persistence_unavailable` typed `503`, `retryable: true`,
  `action: retry_later`를 반환합니다. source guest workspace는 삭제하지 않습니다.
- `ConcurrentWorkspaceWriteError`는 stale target restore 없이 전파해 전역
  `workspace_revision_conflict` 응답이 winner snapshot을 보존하도록 합니다.
- 기존 fingerprint 기반 `already_transferred`, 다른 account 기록의 `409`, source 변경 후
  재요청 `409`, guest preference/ledger/audit field copy semantics와 AccountSheet의
  명시적 import/retry UI는 유지합니다.

## 회귀 검증

- guest transfer targeted API: **3 passed**
  - target flush failure 뒤 기존 target snapshot 보존 및 retry
  - transfer state recheck와 account write race 중 target 기록 보존
  - 기존 target conflict 회귀
- mirror 전체 API: **482 passed, 8 warnings**
- connected guest transfer UI targeted: **2 passed**
  - typed persistence failure 뒤 같은 import retry
  - target conflict 뒤 fresh preview 복귀
- connected 전체 재회귀: **83 passed (2.9m)**
- frontend build: protected runtime **28**, Vite **757 modules**,
  initial index **310.10 kB**, AddFoodSheet **58.91 kB**, MealPlanSheet **36.91 kB**,
  AccountSheet **64.92 kB**
- fixture/mobile runtime: **35 passed + 2 skipped**; Sites **4 passed**,
  service-worker **5 passed**, workspace-sync **9 passed**
- Python compile, shell syntax, Compose config와 `git diff --check`: **passed**

## 범위와 남은 위험

이 readback은 process-local source/target lock과 durable target flush 전후 recovery를
검증합니다. 두 workspace의 distributed transaction, 실제 multi-process transfer race,
managed PostgreSQL failover·network partition·rolling deploy, backup/WAL/read-replica와
법정 retention, 실제 외부 account/provider/device/CI acceptance는 증명하지 않습니다.
