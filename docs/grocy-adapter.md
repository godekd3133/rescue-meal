# Grocy REST adapter

## 현재 구현

`services/api/app/grocy.py`에 Grocy HTTP client를 추가했습니다. `GROCY_BASE_URL`과 `GROCY_API_KEY`가 모두 설정된 경우에만 client를 만들고, 그렇지 않으면 외부 요청을 하지 않습니다.

현재 지원하는 adapter operation:

- `GET /api/system/info` — Grocy version/status readback
- `GET /api/stock/products/by-barcode/{barcode}` — barcode를 Grocy internal product ID 후보로 조회
- `POST /api/stock/products/{productId}/add` — 구매 stock 추가 payload 생성
- `POST /api/stock/products/{productId}/consume` — 소비/폐기 payload 생성
- `POST /api/stock/products/{productId}/open` — 개봉 처리 payload 생성
- `POST /api/stock/products/{productId}/transfer` — 위치 이동 payload 생성

Grocy API key는 `GROCY-API-KEY` header로 전달합니다. endpoint와 payload 필드는 [Grocy 공식 OpenAPI](https://github.com/grocy/grocy/blob/master/grocy.openapi.json)의 현재 stock API 계약을 기준으로 합니다.

## Rescue Meal과의 연결 경계

```text
Rescue Meal review/commit
→ user-confirmed ProductAlias + Grocy product ID mapping
→ Grocy add stock
→ response transaction ID/readback
→ Rescue Meal commit transaction committed
```

```text
Rescue Meal consumed/discarded event
→ Grocy consume(spoiled=true/false)
→ transaction ID 저장
→ 실패 시 reconciliation queue
```

현재는 ID mapping·outbox·보상/undo readback이 확정되지 않았기 때문에 receipt commit이나 UI storage event에 Grocy write를 자동 연결하지 않습니다. `GET /api/integrations/grocy/status`는 read-only 상태 확인만 제공합니다.

## 설정

```text
GROCY_BASE_URL=http://grocy:9283
GROCY_API_KEY=secret-manager-value
GROCY_TIMEOUT_SECONDS=5
```

API key와 response body는 error message나 로그에 넣지 않습니다. timeout은 1~30초로 제한합니다.

## 검증

- 설정이 불완전하면 `disabled`
- mock `system/info` readback과 version 추출
- barcode lookup URL
- add/consume/open/transfer method와 JSON payload
- API key header 전달
- HTTP failure 시 status만 포함하고 response body/API key는 노출하지 않음
- 실제 Grocy container·stock mutation·transaction undo는 Docker daemon 부재로 미검증
