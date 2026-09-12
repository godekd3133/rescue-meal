# Rescue Meal 운영 관측성 계약

Rescue Meal의 사용자 데이터와 운영 신호를 분리하기 위한 관측성 문서입니다.
API는 request body, query string, access token, workspace ID, OCR 원문을 access log나
Prometheus label로 내보내지 않습니다. 현재 구현은 각 API process가 자체 counter를
가지며, 외부 collector가 replica별 scrape 결과를 합산하는 구조입니다.

## Scrape surface

운영 collector는 다음 endpoint 하나를 주기적으로 읽습니다.

```http
GET /api/internal/metrics
Authorization: Bearer <RESCUE_MEAL_OBSERVABILITY_TOKEN>
```

Bearer secret이 없으면 endpoint는 `503`, header가 없거나 형식이 틀리면 `401`, 값이
다르면 `403`을 반환합니다. 사용자 access token과 같은 workspace 인증 경로로 해석하지
않도록 이 internal 경로는 사용자 인증 middleware에서 분리하고, endpoint 자체가 별도
secret을 검증합니다.

현재 응답은 다음 low-cardinality 신호를 합쳐 제공합니다.

- `rescue_meal_http_requests_total{method,route,status}`
- `rescue_meal_http_request_duration_seconds{method,route}` histogram
- `rescue_meal_http_requests_in_flight` gauge
- 기존 product provider cache/single-flight/rate-limit/result metrics
- 기존 notification worker queue/provider/retry/dead-letter/cancellation metrics

`route`는 FastAPI route template를 사용합니다. route를 해석할 수 없는 요청은
`__unmatched__`, 허용된 template 수를 넘은 요청은 `__other__`로 합쳐집니다. 따라서
`/api/foods/{food_id}`의 실제 ID나 query parameter가 label에 들어가지 않습니다.
latency histogram은 50ms, 100ms, 250ms, 500ms, 1s, 2s, 5s, 10s bucket과 `+Inf`를
사용합니다.

기존의 다음 endpoint는 worker별 최소 권한 readback을 위해 유지합니다.

- `/api/internal/product-runtime/metrics`
- `/api/internal/notifications/metrics`

## Deployment example

API와 collector에 같은 observability secret을 주입하되, 브라우저 번들·worker
container log·일반 application response에는 넣지 않습니다. Prometheus는 표준 bearer
token file을 사용하도록 구성할 수 있습니다.

```yaml
scrape_configs:
  - job_name: rescue-meal-api
    metrics_path: /api/internal/metrics
    static_configs:
      - targets: ["api:8000"]
    authorization:
      credentials_file: /run/secrets/rescue-meal-observability-token
```

replica가 여러 개면 각 target이 서로 다른 `instance` label을 갖도록 service discovery
또는 target 목록을 구성합니다. 집계·recording rule·alert·retention은 Prometheus/
OpenTelemetry collector가 소유합니다. API의 `RequestRuntimeMetrics`와 worker
metrics object는 durable global metric store가 아닙니다.

## 개인정보·운영 경계

- request metric에는 method·route template·status·duration만 포함합니다.
- product metric에는 고정 scope/provider/status와 bounded count만 포함하며 barcode,
  상품명, URL, provider response body를 포함하지 않습니다.
- notification metric에는 queue 상태와 고정 cancellation reason만 포함하며 workspace,
  notification, endpoint fingerprint, payload, provider error 원문을 포함하지 않습니다.
- scrape endpoint 자체도 request metric에 기록되지만, scrape secret은 기록하지 않습니다.
- access log의 `path` field도 raw URL path가 아니라 FastAPI route template를 사용합니다.
  예를 들어 `/api/foods/secret-user-id`는 `/api/foods/{food_id}`로만 남고, route를
  해석할 수 없으면 `__unmatched__`가 됩니다. query string·request body·token·workspace
  ID·OCR 원문은 기록하지 않습니다. client-error log는 별도의 JSON log 계약을 유지하며
  metric endpoint가 해당 원문을 재방출하지 않습니다.

## Release checklist

1. secret manager에서 `RESCUE_MEAL_OBSERVABILITY_TOKEN`을 생성하고 production
   preflight를 통과시킵니다.
2. collector가 `/api/internal/metrics`를 scrape하는지, `401/403/503`이 alert나
   일반 사용자 화면으로 노출되지 않는지 확인합니다.
3. API replica별 target, scrape interval, retention, route/status cardinality 상한과
   alert threshold를 운영 설정으로 고정합니다.
4. `5xx`, latency, in-flight saturation, notification dead-letter/retry,
   product provider unavailable을 실제 staging traffic에서 readback합니다.
5. managed PostgreSQL failover, network partition, 외부 Push/email provider 장애와
   collector 자체 장애를 별도 game-day 또는 staging acceptance로 기록합니다.

현재 repository에서 확인한 것은 process-local scrape 계약·token 보호·secret/query
비노출과 unit/API 회귀입니다. 실제 collector의 장기 retention·다중 replica 합계·alert
발화·외부 운영 장애 대응은 아직 배포 acceptance입니다.
