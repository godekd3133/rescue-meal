# 부분 수량 lot 분리 readback — 2026-09-01

## 결론

닭가슴살 2팩 중 1팩만 냉장으로 이동하는 요청이 현재 연결 모드에서 다음처럼 처리되었습니다.

- 원본 lot `chicken-1`: 냉동 1팩 유지
- child lot: 냉장 1팩 생성
- child lot의 `parent_lot_id`: `chicken-1`
- 이동 event의 `quantity`: `1`
- 두 lot의 사용자 확인 날짜 `2026-09-06`·`user_input`·확인 상태 유지
- 분리 전후 총수량: `2팩`

## 실행 조건

- 프론트: `http://127.0.0.1:4173/`
- API: `http://127.0.0.1:8000/`
- 저장소: 새 SQLite preview 파일
- OCR: `http://127.0.0.1:8002/` remote PaddleOCR worker 설정
- 요청: `POST /api/foods/chicken-1/storage-events`

```json
{
  "event_type": "moved",
  "to_storage_type": "refrigerated",
  "quantity": 1
}
```

## HTTP 결과

```json
{
  "event": {
    "quantity": 1.0,
    "from": "frozen",
    "to": "refrigerated",
    "created_child_food_id": "lot-<generated>"
  },
  "lots": [
    {
      "id": "chicken-1",
      "parent_lot_id": null,
      "quantity": 1.0,
      "storage_type": "frozen",
      "date_kind": "user_reminder",
      "date_value": "2026-09-06",
      "date_source": "user_input",
      "user_confirmed": true
    },
    {
      "id": "lot-<generated>",
      "parent_lot_id": "chicken-1",
      "quantity": 1.0,
      "storage_type": "refrigerated",
      "date_kind": "user_reminder",
      "date_value": "2026-09-06",
      "date_source": "user_input",
      "user_confirmed": true
    }
  ],
  "total_quantity": 2.0
}
```

실제 응답의 생성 ID는 매 실행마다 달라지므로 `<generated>`로 표기했습니다. 부모 수량 감소와 child 생성은 같은 API 처리 안에서 일어나며, SQLite 저장소에서는 event와 변경된 재고가 함께 flush됩니다.

연결된 4173 프론트에서도 2팩 중 1팩을 냉장으로 이동하면서 `개봉했어요`를 함께 저장했습니다. API readback에서 원본 `chicken-1`은 `frozen`, `opened: false`, `quantity: 1`로 남고, child는 `refrigerated`, `opened: true`, `quantity: 1`, `parent_lot_id: chicken-1`로 확인되었습니다. 즉, 복합 변경이 원본 lot에 잘못 붙지 않고 child lot에 순서대로 적용됩니다.

## 자동 검증

- `services/api`: `uv run pytest` → `35 passed, 2 warnings`
- `apps/web`: `MOBILE_RUNTIME_TEST_PORT=4175 npm run test:runtime -- --workers=1 tests/prototype.spec.ts` → `6 passed`
- 앱 E2E에서는 `맛타리버섯` 2팩 중 1팩을 선택해 부분 폐기하고, 확인 UI 통과 후 남은 1팩이 목록에 유지되는 것을 확인했습니다.
- 앱 E2E에서는 `수량 줄이기`로 2팩 중 1팩을 선택한 뒤 냉장 이동하고, 식품 목록에서 닭가슴살 1팩이 2개 lot로 보이는 것을 확인했습니다.

## 남은 운영 검증

현재 검증은 SQLite local repository 기준입니다. PostgreSQL transaction/readback, 외부 Grocy 반영, 병합·복수 단위·소수 수량 및 실제 모바일 카메라 입력은 아직 운영 검증 범위가 아닙니다.
