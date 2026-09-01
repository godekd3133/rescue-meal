# 추정 날짜 확정 흐름

## 사용자 흐름

날짜가 없는 식품의 상세 화면에서만 다음 버튼이 노출됩니다.

```text
포장지에서 확인한 날짜 입력
→ 날짜 의미 선택
   ├ 소비기한
   ├ 품질유지기한
   └ 내 알림일
→ 날짜 입력
→ 확인 후 저장
```

저장된 날짜는 상품명 기반 AI 추정값이 아니라 사용자가 확인한 값으로 표시됩니다.

## API 계약

```http
PATCH /api/foods/{food_id}/date-assertion
Content-Type: application/json

{
  "kind": "use_by",
  "date_value": "2026-09-12",
  "source_detail": "포장지에서 사용자 확인"
}
```

성공 시 현재 `date_assertion`은 다음처럼 저장됩니다.

```text
kind: use_by
source: user_input
user_confirmed: true
estimated_use_first_window: null
```

기존 `unknown` 또는 `estimated_use_first` assertion은 `date_assertion_history`에 남깁니다. 이미 `use_by`·`best_before`인 assertion은 자동 또는 일반 correction 화면에서 덮어쓰지 않고 `409 Conflict`를 반환합니다.

## 안전 경계

- 사용자가 날짜의 의미를 직접 선택해야 합니다.
- `user_reminder`는 실제 소비기한이 아니라 사용자 알림일입니다.
- 날짜를 확정해도 시스템이 `safe_to_eat` 또는 섭취 가능 여부를 판정하지 않습니다.
- 기존 OCR/GS1 표시 날짜를 보존하는 label review 경로와, 추정값을 사용자가 보강하는 correction 경로를 분리합니다.

## 검증

- API: 추정 두부 `unknown` → `use_by 2026-09-12`, history 보존, 추정 window 제거
- API: 실제 표시 날짜 시금치의 correction 시도 → `409`, 기존 `2026-09-02` 유지
- 앱 E2E: 날짜 종류 선택·날짜 입력·저장 후 목록의 `9월 12일` 표시
- 실제 연결 API readback: `use_by`, `user_input`, `user_confirmed: true`, `history_kinds: [unknown]`
