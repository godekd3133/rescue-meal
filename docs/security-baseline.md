# API security baseline and frontend deployment requirements

기준일: 2026-09-02

Rescue Meal은 영수증 이미지·식품 라벨·카메라 권한·account token을 다루므로 API의 최소 보안 헤더를 애플리케이션 경계에서 고정하고, frontend는 배포 플랫폼에서 같은 정책을 적용하도록 요구사항을 문서화합니다. `apps/web/worker/index.js`는 보호된 모바일 runtime이므로 수정하지 않습니다. 이 문서는 인증·개인정보 lifecycle 자체를 대체하지 않으며, 실제 HTTPS reverse proxy와 secret manager 설정은 운영 배포에서 함께 검증해야 합니다.

## API response headers

FastAPI는 모든 정상·검증오류·auth short-circuit response에 다음 헤더를 적용합니다.

| 헤더 | 값 | 목적 |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` | API response를 문서·frame·script 실행 대상으로 사용하지 않도록 제한 |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=()` | API origin이 불필요한 브라우저 권한을 요청하지 않도록 제한 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 외부 이동 시 전체 path/query 전달 최소화 |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing 방지 |
| `X-Frame-Options` | `DENY` | API를 frame에 삽입하는 clickjacking 방지 |
| `X-Permitted-Cross-Domain-Policies` | `none` | legacy cross-domain policy 파일 사용 차단 |

`X-Request-ID`와 CORS response header는 기존 observability/CORS middleware가 계속 관리합니다. invalid token이나 auth-required `401`도 동일한 보안 header와 correlation ID를 유지해야 합니다.

## Client error telemetry

렌더링 오류 복구 후의 `POST /api/client-errors`는 운영 장애 grouping을 위한
제한된 public endpoint입니다. request schema는 `surface`, 제한된 `error_kind`,
pattern-validated `release` 외의 field를 거부합니다. message·stack·component
stack·query·Authorization·workspace·receipt/food data는 client payload와
structured log에 포함하지 않습니다. secure mode에서는 opaque IP bucket rate
limit을 적용하며, 실제 collector 전송·retention·source map symbolication은
배포 환경에서 별도 검증해야 합니다.

## Sites frontend deployment headers

frontend에는 다음 정책을 Sites hosting 또는 HTTPS reverse proxy에서 적용해야 합니다. 현재 protected `apps/web/worker/index.js` 자체에는 header mutation을 넣지 않았으므로, 아래는 운영 배포 요구사항이며 local worker readback으로 검증된 구현 claim이 아닙니다.

```text
Content-Security-Policy:
  default-src 'self'; base-uri 'self'; frame-ancestors 'none';
  object-src 'none'; form-action 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https: http://127.0.0.1:8000 http://localhost:8000;
  worker-src 'self'; manifest-src 'self'
Permissions-Policy: camera=(self), microphone=(), geolocation=()
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
```

카메라 scanner는 동일 origin의 사용자 동작에서만 사용할 수 있고 microphone·geolocation은 허용하지 않아야 합니다. `style-src 'unsafe-inline'`은 현재 React/mobile UI가 사용하는 inline style 경계를 위한 값이며, 이후 스타일을 모두 정적 CSS로 옮기면 제거할 수 있습니다. 운영 frontend의 API origin은 실제 배포 도메인만 `connect-src`에 넣어야 합니다. 현재 worker가 이 header를 직접 적용한다고 주장하지 않습니다.

## TLS·인증과의 경계

- HSTS는 현재 worker/API가 TLS를 종료하는지 알 수 없으므로 애플리케이션에서 무조건 설정하지 않습니다. HTTPS reverse proxy에서 `Strict-Transport-Security`와 TLS redirect를 설정하고 preload 여부를 별도로 결정합니다.
- account 인증은 bearer token 기반이며 browser cookie session을 사용하지 않습니다. 따라서 cookie CSRF 방어를 구현했다고 주장하지 않으며, token 보관·XSS 방어·CSP 운영 설정을 함께 관리해야 합니다.
- CORS credentials를 사용하는 secure mode에서는 local development origin을 자동 허용하지 않습니다. `RESCUE_MEAL_CORS_ORIGINS`에 실제 frontend HTTPS origin을 명시하고 wildcard를 사용하지 않아야 합니다.
- provider token, auth secret, VAPID private key, Grocy API key는 보안 header나 frontend build에 들어가면 안 됩니다.
- `/api/internal/product-runtime/status`는 product-enrichment worker token이 필요한 내부 endpoint이며 barcode·상품명·source URL·API key를 runtime aggregate에 포함하지 않습니다.
- `/api/internal/product-runtime/metrics`도 같은 worker token을 요구하며 Prometheus label에 lookup identity와 secret을 넣지 않습니다.
- `/api/internal/notifications/metrics`는 notification worker token을 요구하며 workspace ID·notification ID·push endpoint·payload·provider error 원문을 metric에 넣지 않습니다. replica 합계와 장기 보존은 외부 collector 경계입니다.
- CSP는 frame 삽입·외부 script·임의 form action을 차단하지만, XSS·공급망 dependency·브라우저 취약점을 완전히 해결하지 않습니다.

## Recipe review legacy-token gate

`RESCUE_MEAL_RECIPE_REVIEW_TOKEN`은 local migration용 shared fallback일 뿐입니다.
`RESCUE_MEAL_ENVIRONMENT=production`에서 이 값이 비어 있지 않으면
`services/api/scripts/preflight_production.py`가 `recipe-review-legacy-token` error를
내고, API `/ready`와 legacy token review request도 `recipe_review_legacy_token_disabled`
typed `503`으로 fail-closed 처리합니다. token 원문은 error response·log·metrics에 넣지
않습니다. production review는 개별 `recipe_admin` account와 optional publisher allowlist를
사용해야 합니다. publisher allowlist가 설정된 경우 production preflight는 admin allowlist
동반 설정·email 형식·publisher가 admin의 부분집합인지까지 확인합니다. 이 guard는 legacy
token을 실제로 폐기했다는 증명이 아니라 잘못된 설정의 배포를 차단하는 경계입니다.

## 검증

- API `/health` security header test
- API `/ready`와 auth-required `503` response header test
- API/Sites의 `git diff --check`, TypeScript build, Sites packaging test

검증 결과는 [security headers readback](../evidence/security-headers-readback-2026-09-02.md)에 기록합니다. 실서비스 frontend hosting/reverse proxy의 header 적용, TLS/HSTS, CSP violation report 수집, 실제 iOS/Android 권한 동작은 아직 운영 acceptance 범위입니다.
