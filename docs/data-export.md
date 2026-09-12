# Workspace 데이터 export 계약

기준일: 2026-09-12

## 목표

사용자가 Rescue Meal에 기록한 업무 데이터를 다른 곳에 보관하거나 검토할 수 있도록 workspace export를 제공합니다. export는 비밀번호·access token·push endpoint·OCR 원문 같은 secret/raw 입력을 포함하지 않고, 재고와 사용 기록을 재현하는 데 필요한 read model만 제공합니다.

## API

```text
GET /api/account/export
```

현재 workspace의 Bearer context로만 조회하며, 응답은 `rescue-meal-export-v1` schema version을 가집니다.

```json
{
  "schema_version": "rescue-meal-export-v1",
  "exported_at": "2026-09-02T09:30:00Z",
  "workspace_id": "account-example",
  "inventory": [],
  "product_provenance_events": [],
  "product_info_events": [],
  "receipt_summaries": [],
  "storage_events": [],
  "commit_transactions": [],
  "meal_plans": [],
  "multi_day_meal_plans": [],
  "shopping_list": [],
  "shopping_receive_operations": [],
  "meal_preferences": {
    "avoid_allergens": []
  },
  "notification_preferences": {
    "in_app_enabled": true,
    "push_enabled": false,
    "lead_days": 2,
    "quiet_hours_start": null,
    "quiet_hours_end": null
  },
  "push_subscriptions": []
}
```

## 포함 데이터

- 현재 재고 `FoodResponse`와 표시 날짜·추정 window·구매일·lot provenance
- 상품 후보 provenance의 applied/replaced/removed before/after audit event; provider key·receipt OCR 원문은 포함하지 않음
- 사용자가 수정한 상품명·브랜드·분류의 `FoodProductInfoAuditEvent` before/after 이력; 수량·보관 상태·표시 날짜 변경 기록이 아니라 상품 프로필 변경 기록임
- receipt 상태·구매일·line 수·원본 metadata 비식별화 상태 summary
- 보관 이동·개봉·소비·폐기 event
- 저장/완료 meal plan과 commit transaction 상태
- 저장된 multi-day meal plan bundle과 날짜별 progress
- 사용자가 명시적으로 추가한 shopping list item과 source contribution
- 장보기 입고 확인 명령의 durable 멱등성 기록. 원본 `Idempotency-Key`는 저장하지 않고 workspace·항목·수량·보관조건으로 계산한 fingerprint만 보존하며, lot이 이후 소비/폐기되어도 중복 입고를 막는 데 사용함
- workspace별 식단 조건과 알레르기 회피 항목; 의료 프로필이나 안전 판정 결과가 아님
- workspace 알림 선호 설정과 push endpoint fingerprint summary

## 제외 데이터

- `password_hash`, access token, revoked token 원문
- 업로드 image/PDF bytes
- receipt `source_filename`, OCR `raw_name` 원문
- push subscription endpoint와 `p256dh`/`auth` key 원문
- 원본 `Idempotency-Key` 문자열. export에는 재현에 필요한 fingerprint만 포함함
- 서버 secret, API key, Grocy credential, recipe review token

receipt 원문이 필요한 경우에도 먼저 privacy erase 경계를 확인해야 하며, 현재 export에는 원문을 넣지 않습니다. 이미 비식별화한 receipt는 summary와 commit/lot provenance만 export됩니다.

## 프론트 흐름

계정 또는 guest workspace의 `내 데이터 내보내기`에서 API 응답을 JSON Blob으로 만들고, `rescue-meal-export-YYYY-MM-DD.json` 파일로 다운로드합니다. API 응답이 실패하면 파일을 생성하지 않고 오류 상태를 보여줍니다.

export는 서버 데이터를 삭제하지 않으며, 다운로드 파일은 사용자의 기기에 생성됩니다. 브라우저 download 폴더·OS backup·공유 서비스의 보존은 앱이 통제하지 않으므로 사용자가 별도로 관리해야 합니다.

## Export rate limit

전체 workspace snapshot은 민감한 데이터 묶음이므로 `/api/account/export`에 별도 bounded
rate limit을 적용합니다. 기본값은 1시간에 6회이며 다음 환경변수로 명시 조정할 수 있습니다.

```text
RESCUE_MEAL_EXPORT_RATE_LIMIT_ENABLED=true
RESCUE_MEAL_EXPORT_RATE_LIMIT_MAX_REQUESTS=6
RESCUE_MEAL_EXPORT_RATE_LIMIT_WINDOW_SECONDS=3600
```

각 요청은 client IP와 현재 workspace를 각각 opaque SHA-256 bucket key로 계산합니다. 두 bucket
중 하나라도 한도에 도달하면 export body를 만들지 않고 `429`를 반환합니다.

```json
{
  "detail": {
    "code": "account_export_rate_limited",
    "detail": "데이터 내보내기 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

응답에는 `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`이 포함되며, workspace ID·
원본 IP·export payload는 오류 응답에 넣지 않습니다. persistent auth repository를 사용하는
SQLite/PostgreSQL 환경에서는 기존 database-backed rate limiter가 bucket을 공유하고, local
in-memory fixture에서는 process-local limiter를 사용합니다. AccountSheet는 이 typed error를
다운로드 성공으로 처리하지 않고 “잠시 후 다시 시도” 오류로 표시합니다.

## Export 요청 감사

성공적으로 생성된 export마다 서버 측 `WorkspaceExportAuditEvent`를 별도 append-only 저장소에
기록합니다. 이벤트에는 `actor_id`(account subject 또는 `guest`), `actor_role`, 검증된
`X-Request-ID` 값, `rescue-meal-export-v1` schema version, export 시각만 들어갑니다. 원본
Authorization header·access token·client IP·export payload는 저장하지 않습니다.

이 감사 metadata는 다운로드 JSON에 포함하지 않습니다. 따라서 사용자가 받은 파일에 다른
사용자의 actor 정보가 섞이지 않으며, 직접 JSON 응답 정책도 유지됩니다. 감사 저장 실패 시
snapshot을 반환하거나 Blob/download를 만들지 않고 `account_export_audit_persistence_unavailable`
typed `503`(`retryable=true`, `action=retry_later`, `Retry-After: 1`)로 종료합니다.

InMemory/SQLite/PostgreSQL adapter가 같은 모델을 사용하고, PostgreSQL은 migration
`026_export_audit.sql`의 `rescue_api_export_audit_events` workspace key와 시간 index를
사용합니다. 감사 insert는 workspace revision을 증가시키지 않으므로 export가 다른 기기의
미완료 mutation을 stale 상태로 만들지 않습니다. workspace reset/purge에서는 감사 행도
함께 삭제됩니다. rate-limited `429`는 export body를 생성하지 않으며 감사 event도 만들지
않습니다.

## 운영 전 남은 작업

- 큰 workspace의 streaming/압축
- export actor/time 감사의 운영 조회·보존기간·알림 정책
- export 파일의 브라우저/OS backup 개인정보 안내
- PostgreSQL replica/WAL/backup에서 export와 deletion 정책을 일치시키는 운영 검증
- 스키마 version migration과 향후 import 기능의 명시적 분리

검증 결과는 [data export readback](../evidence/data-export-readback-2026-09-02.md)에 기록합니다.
