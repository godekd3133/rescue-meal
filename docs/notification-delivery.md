# 알림 선호 설정과 Web Push delivery 경계

기준일: 2026-09-06

## 제품 목표

Rescue Meal 알림은 식품이 안전한지 판정하는 기능이 아니라, 사용자가 포장지와 실제 상태를 확인하도록 다음 행동을 알려주는 기능입니다. 사용자가 너무 이른 알림을 받거나 원하지 않는 시간에 방해받지 않도록 workspace 선호 설정을 별도 데이터로 둡니다.

## 현재 구현

| 영역 | 구현 상태 |
| --- | --- |
| 앱 내 notification | 날짜 assertion·추정 priority·포장지 보관조건 불일치·Grocy outbox를 현재 workspace에서 계산하고 `in_app_enabled`로 표시 여부 제어 |
| 사전 확인 기간 | `lead_days` 0~14일, 기본 2일. 기존 기본 동작을 보존 |
| 알림 시간대 | IANA timezone을 workspace preference로 저장하며, 앱 날짜와 quiet hours를 같은 사용자 시간대에서 계산. 기본 `Asia/Seoul`; 브라우저의 현재 기기 시간대 draft 제안 제공 |
| 조용한 시간 | `HH:MM` 시작·종료를 함께 저장하고 저장된 알림 시간대에서 비교 |
| Web Push subscription | HTTPS endpoint + key를 workspace에 저장하고, API summary에는 endpoint fingerprint만 반환; 브라우저 permission을 먼저 요청 |
| 기기 해지 | fingerprint로 idempotent 삭제하고 일치하는 native `PushSubscription`도 unsubscribe. 원 endpoint를 사용자 화면에 표시하지 않음 |
| service worker | `push` payload를 notification으로 표시하고, 상대 경로 URL 클릭 시 앱 창을 focus/navigate |
| delivery outbox | 알림·기기별 deterministic delivery record를 SQLite/PostgreSQL workspace table에 저장; 읽은 알림은 `cancelled`로 남기고 push하지 않음 |
| delivery worker | 선택적 `notifications` Compose profile, service token, workspace lease, heartbeat, bounded process |
| 실제 발송 | `pywebpush` direct adapter 구현. VAPID 설정이 있을 때만 전송하며, 410/404 subscription 정리·retry·dead-letter를 처리 |

기본 설정:

```json
{
  "in_app_enabled": true,
  "push_enabled": false,
  "lead_days": 2,
  "timezone": "Asia/Seoul",
  "quiet_hours_start": null,
  "quiet_hours_end": null
}
```

## API

```text
GET  /api/notification-preferences
PUT  /api/notification-preferences
GET  /api/push/subscriptions
PUT  /api/push/subscriptions
DELETE /api/push/subscriptions/{endpoint_fingerprint}
GET  /api/integrations/notifications/worker/status
POST /api/internal/notifications/workspaces/{workspace_id}/tick
GET  /api/internal/notifications/metrics
```

`quiet_hours_start`와 `quiet_hours_end`는 둘 다 지정하거나 둘 다 `null`이어야 합니다. `lead_days`는 0~14 정수만 허용합니다. `timezone`은 IANA timezone 이름이어야 하며, 잘못된 이름은 `422`로 거부합니다. 앱 내 알림의 날짜 경계와 Web Push worker의 quiet hours는 이 설정을 동일하게 사용하고, 저장 시각(`created_at`)은 UTC로 보존합니다.

API Docker image는 `tzdata`를 runtime dependency로 설치합니다. 따라서
`python:3.12-slim`의 시스템 timezone database 유무와 관계없이 `Asia/Seoul` 등
IANA timezone을 해석할 수 있어야 합니다.

Push subscription 등록은 다음 입력을 받지만 응답에서는 endpoint 원문을 절대 되돌리지 않습니다.

```json
{
  "endpoint": "https://push.example.test/subscription/…",
  "p256dh": "…",
  "auth": "…"
}
```

운영 endpoint는 HTTPS만 허용하고 `localhost`, `127.0.0.1`, `::1`의 HTTP는 개발 검증용으로만 허용합니다. frontend에는 public VAPID key만 `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`로 주입하며 private key는 API/delivery worker의 secret manager에만 둡니다.

## 데이터 경계

- preferences와 subscription은 현재 workspace store에 저장하므로 guest/account workspace가 서로 섞이지 않습니다.
- SQLite는 `notification_preferences`, `push_subscriptions` 테이블에 저장합니다.
- PostgreSQL projection은 `rescue_api_notification_preferences`, `rescue_api_push_subscriptions`의 `(workspace_id, ...)` 복합키로 저장합니다.
- subscription endpoint는 delivery provider 호출에 필요하므로 서버 내부에는 원문이 남습니다. API read model·UI·로그에는 fingerprint만 노출합니다.
- endpoint provider가 `410 Gone` 또는 invalid subscription을 반환하면 delivery worker가 해당 fingerprint를 정리해야 합니다.
- `push_enabled=true`는 사용자 의향을 저장하는 값이며, subscription·VAPID·worker가 없으면 실제 발송을 주장하지 않습니다.

## service worker payload

현재 service worker가 허용하는 payload 형태는 다음과 같습니다. `storage_condition` source의 알림도 같은 상대 경로·safe body 계약을 사용합니다.

```json
{
  "title": "오늘 확인할 날짜예요",
  "body": "포장 상태와 보관 방법을 확인하세요.",
  "tag": "food-date:lot-1",
  "url": "/"
}
```

외부 payload의 URL은 `/`로 시작하는 상대 경로만 사용하고, 그 외 값은 홈으로 fallback합니다. 이는 push provider가 임의의 외부 사이트로 사용자를 보내지 못하게 하는 최소 경계입니다.

## Delivery worker

실제 전송은 API process에서 직접 임의로 반복하지 않고, `notification-worker`가 service-token으로 workspace별 tick을 호출하는 구조입니다.

```text
notification worker
  → 명시된 workspace lease 획득
  → 현재 읽지 않은 notification × push subscription delivery outbox 생성
  → 현재 읽지 않은 notification·연결된 push device snapshot과 기존 pending delivery 대조
  → 이미 읽었거나 대상/기기에서 사라진 pending delivery는 cancelled 처리
  → quiet hours면 pending으로 보류
  → pending delivery를 bounded process
  → pywebpush(VAPID) 호출
  → succeeded 또는 retry/dead_letter/cancelled
  → 404/410이면 subscription 제거
  → heartbeat readback
```

### Read-before-send 취소 경계

worker는 한 tick의 시작 시점에 현재 알림 목록과 연결된 push device 목록을 한 번
계산하고, `read_at`이 없는 알림과 현재 연결된 endpoint만 push 대상(active set)으로
취급합니다. 그 뒤 기존 `pending` delivery의 `notification_id` 또는
`endpoint_fingerprint`가 active set에 없으면 외부 provider를 호출하지 않고
`status=cancelled`로 보존합니다. 사용자가 알림을 읽은 직후 다음 worker tick이
실행되거나, 알림 조건·기기 연결이 사라져 더 이상 현재 대상이 아닌 경우에도 같은
경계를 적용합니다.

`cancelled`는 발송 실패를 뜻하는 `dead_letter`와 다릅니다. 실제 provider 호출을
시도한 건수는 `processed`·`succeeded`·`retried`·`dead_lettered`로, 읽음/대상 변경으로
취소한 건수는 `cancelled`로 별도 관측합니다. pending row를 삭제하지 않으므로
SQLite 재시작과 normalized projection readback 뒤에도 취소 이유와 상태를 확인할 수
있습니다. 이미 `in_flight`인 요청은 provider 호출과 충돌하지 않도록 즉시 취소하지
않고, stale recovery로 pending이 된 뒤 같은 tick의 active-set 대조에서 취소할 수
있습니다.

### Worker runtime metrics

운영자는 notification worker token으로 다음 Prometheus text endpoint를 scrape할 수
있습니다.

```http
GET /api/internal/notifications/metrics
X-Rescue-Meal-Notification-Worker-Token: <service-token>
```

metrics는 API process별 bounded counter이며 workspace ID·notification ID·endpoint
fingerprint·payload·provider error 원문을 포함하지 않습니다. tick·lease·queue·실제
provider 시도·성공·재시도·dead-letter·stale recovery를 집계하고, 취소는
`notification_inactive`와 `subscription_inactive` reason label로 나눕니다. 여러 API
replica의 합계와 장기 추세·alert는 Prometheus/OpenTelemetry collector에서 replica
label을 기준으로 집계해야 하며, 이 endpoint 자체가 durable global metric store라고
주장하지 않습니다.

API container에는 다음 server-only 설정이 필요합니다.

```text
RESCUE_MEAL_VAPID_PRIVATE_KEY=<PEM path 또는 DER 문자열>
RESCUE_MEAL_VAPID_SUBJECT=mailto:ops@example.com
RESCUE_MEAL_PUSH_TIMEOUT_SECONDS=8
RESCUE_MEAL_PUSH_TTL_SECONDS=600
RESCUE_MEAL_PUSH_MAX_ATTEMPTS=3
RESCUE_MEAL_NOTIFICATION_WORKER_TOKEN=<server-only secret>
```

worker container에는 다음 workspace/scheduling 설정이 필요합니다.

```text
RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS=account-workspace-id
RESCUE_MEAL_NOTIFICATION_WORKER_ID=notification-worker-1
RESCUE_MEAL_NOTIFICATION_WORKER_INTERVAL_SECONDS=30
RESCUE_MEAL_NOTIFICATION_WORKER_LEASE_SECONDS=120
RESCUE_MEAL_NOTIFICATION_STALE_AFTER_SECONDS=900
RESCUE_MEAL_NOTIFICATION_PROCESS_LIMIT=20
```

runner는 각 workspace의 API tick 결과가 HTTP 200이어도 response body의
`error`가 비어 있지 않으면 실패 cycle로 판정합니다. `--once`에서는 하나라도
실패하면 exit code `1`을 반환해 scheduler/health check가 성공으로 오인하지 않게
하고, 장기 실행에서는 기본 interval을 기준으로 `30→60→120→240→300초`까지
bounded exponential backoff를 적용합니다. 전체 cycle이 정상화되면 failure streak와
delay를 기본 interval로 되돌리고 `recovered` 구조화 로그를 남깁니다. workspace
allowlist·service token·lease semantics·delivery 상태는 이 loop의 대상이 아니며,
backoff는 API tick 재호출 빈도만 제어합니다.

`push_enabled=false`, subscription 없음, VAPID 설정 없음 중 하나라도 해당하면 push를 전송하지 않습니다. 사용자 설정 화면에는 worker heartbeat·VAPID 준비 상태·최근 전달·읽음 후 취소 건수를 표시하지만 endpoint 원문은 표시하지 않습니다. delivery payload에는 알림 제목·확인 문구·stable tag·상대 경로만 넣고 OCR 원문·access token·push endpoint를 넣지 않습니다.

## 운영 전 남은 작업

1. VAPID keypair를 secret manager에 생성하고 public key만 web build에 주입합니다.
2. 실제 browser push service에서 delivery success·retry·backoff·worker crash recovery를 검증합니다.
3. provider 응답별 `410` cleanup, rate limit, duplicate delivery, expired subscription의 운영 readback을 확인합니다.
4. 현재 기기 timezone 제안의 최초 저장 UX, device별 timezone, 서머타임 전환을 실기기에서 검증합니다.
5. Web Push permission denial, iOS/Android PWA 설치 상태, 브라우저별 제한을 실기기에서 검증합니다.
6. push body에 상품명·구매정보·민감한 OCR 원문을 과도하게 넣지 않는 개인정보 정책을 고정합니다.

이미 읽었거나 현재 알림 대상·연결된 기기에서 사라진 pending delivery는 `cancelled`로
보존하고 외부 push를 호출하지 않습니다. 이 record는 전송 실패를 뜻하는
`dead_letter`와 구분되며, worker heartbeat의 `cancelled` 카운트로 관측합니다.

현재 구현·테스트·실제 미검증 범위는 [notification delivery readback](../evidence/notification-delivery-readback-2026-09-02.md)와 [notification timezone readback](../evidence/notification-timezone-readback-2026-09-04.md)에 기록합니다.
브라우저 permission·subscription·native unsubscribe 통합 검증은 [Web Push browser readback](../evidence/web-push-browser-readback-2026-09-03.md)에 기록합니다.
