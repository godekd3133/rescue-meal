# 추정 날짜 사용자 확정 readback — 2026-09-01

## API 결과

연결된 최신 API에서 `tofu-1`의 추정 날짜를 사용자가 확인한 소비기한으로 바꾸었습니다.

```http
PATCH /api/foods/tofu-1/date-assertion
```

```json
{
  "kind": "use_by",
  "date_value": "2026-09-12",
  "source_detail": "포장지에서 사용자 확인"
}
```

dashboard readback:

```json
{
  "kind": "use_by",
  "value": "2026-09-12",
  "source": "user_input",
  "user_confirmed": true,
  "estimated_window": null,
  "history_kinds": ["unknown"]
}
```

## 프론트 검증

- fixture 앱 E2E에서 `소비기한` 선택·날짜 입력·저장 후 `9월 12일` 목록 표시: 통과
- 연결 프리뷰에서 API status `서버 연결됨` 확인
- 실제 API의 기존 표시 날짜(시금치 `2026-09-02`) overwrite 시도: `409`, 기존 날짜 유지

## 안전 경계

이 결과는 사용자가 확인한 기록이지 식품 안전 판정이 아닙니다. `use_by`로 저장된 뒤에도 앱은 `safe_to_eat` 또는 섭취 가능 여부를 생성하지 않습니다.
