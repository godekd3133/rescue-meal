# Custom storage history safety readback — 2026-09-09

## Scope

이번 readback은 사용자 정의 `StorageLocation`의 삭제·표시·다른 기기 변경 감지 경계를
확인한다. canonical `ambient`·`refrigerated`·`frozen` 분류, 날짜 assertion, 소비 우선순위
계산은 변경 대상이 아니다.

## 원인과 변경

기존 삭제 guard는 현재 `FoodResponse.storage_location_id`만 검사했다. 식품을 다른 위치로
옮기거나 소비한 뒤에도 `StorageEventResponse.from_storage_location_id`·
`to_storage_location_id`와 `ShoppingListReceiveOperation.storage_location_id`에는 과거
위치가 남기 때문에, 현재 lot가 없다는 이유로 위치를 삭제하면 audit 기록의 실제 이름을
복원할 수 없는 상태가 된다.

다음 경계를 추가했다.

- 현재 lot, storage event, 장보기 입고 operation 중 하나라도 custom location을 참조하면
  `storage_location_in_use` `409`로 삭제를 막는다. 이름 변경은 허용해 과거 기록의
  read-model 이름을 보존한다.
- `FoodHistory`는 event의 location ID를 현재 `StorageLocation` 목록으로 해석해
  `김치냉장고 → 실온`처럼 표시한다. 위치를 찾지 못한 경우에는 canonical storage class를
  fallback으로 사용한다.
- `GET /api/storage-locations/revision`은 location 목록이나 raw 데이터를 포함하지 않는
  revision-only marker다. AccountSheet는 초기 목록의 revision을 기억하고 tab 복귀·30초
  bounded probe에서 revision이 바뀌면 편집·삭제 확인 상태를 닫고 최신 목록을 재조회한다.
  probe 실패는 기존 목록을 비우지 않는다.
- in-memory adapter는 process-local marker를, SQLite adapter는 `workspace_metadata`의
  durable revision을 사용한다. PostgreSQL은 기존 workspace revision과 response header를
  사용하며, conflict response의 최신 revision header는 middleware가 덮어쓰지 않는다.

## 검증 결과

검증은 사용자 workspace와 분리된 disposable local mirror에서 실행했다.

- `services/api/.venv/bin/python -m pytest services/api/tests -q`: **492 passed**, 8 warnings
  (PostgreSQL contract **30 passed** 포함)
- `npm run test:connected` — **88 passed**. 기존 storage-condition 흐름에서 custom
  history 표시, AccountSheet의 cross-device revision probe, custom location CRUD 및
  manual/receipt/shopping 전달을 포함한다.
- `npm run build` — TypeScript와 Vite **757 modules** 통과, protected mobile runtime
  integrity **28 files** 통과, initial client JS **312.96 kB**, AccountSheet **74.08 kB**,
  FoodHistory **2.21 kB**, FoodDetailSheet **17.64 kB**. 기존 protected
  `BottomSheet.tsx` ineffective dynamic-import warning은 남아 있다.
- `npm run test:runtime` — **35 passed + 2 skipped**.
- `npm run test:workspace-sync` — **9 passed**; `npm run test:sites` — **4 passed**;
  `npm run test:service-worker` — **5 passed**.

## 미검증 경계

이번 결과는 local/in-memory·SQLite·browser contract를 증명한다. 운영 PostgreSQL에서의
위치 삭제 race와 다중 process ordering, managed failover/network partition, 실제 background
tab scheduling, iOS VoiceOver/Android TalkBack, 외부 Grocy 위치 mapping과 온도 센서는
검증하지 않았다. 현재 Docker Desktop VM은 ext4 journal/block I/O 오류와 read-only remount
상태여서 운영 PostgreSQL/Compose live smoke는 별도 host recovery 이후의 gate다.
