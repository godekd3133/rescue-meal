# Account password recovery

기준일: 2026-09-02

이 문서는 Rescue Meal의 이메일·비밀번호 account에서 비밀번호를 잊었을 때 사용하는 reset request·token·완료 흐름을 정의합니다. 로그인한 사용자의 일반적인 비밀번호 변경은 [account security](account-security.md)에서 별도로 다룹니다.

## 제품·보안 약속

- 이메일이 가입되어 있는지 여부를 API 응답으로 구분하지 않습니다.
- reset token 원문은 저장하지 않습니다. 저장소에는 token hash와 account/session version·만료 시각·사용 시각만 남깁니다.
- reset token은 발급 후 30분 동안 한 번만 사용할 수 있습니다.
- reset 완료 시 비밀번호를 바꾸고 `session_version`을 증가시켜 기존 account token을 모두 무효화합니다.
- reset 요청이 accepted라는 사실은 메일 발송 성공이나 계정 존재를 의미하지 않습니다.
- 이 기능은 식품 workspace 데이터나 guest workspace를 자동으로 병합하지 않습니다.

## 사용자 흐름

```text
로그인 화면
  → 비밀번호를 잊으셨나요?
  → 이메일 입력
  → generic accepted 안내
  → configured email provider가 reset link 전달
  → 링크의 reset_token을 일회성으로 읽고 URL에서 제거
  → 새 비밀번호와 확인값 입력
  → API가 token·만료·session version 검증
  → 비밀번호 교체 + 기존 session 무효화 + 새 account session 발급
```

브라우저는 링크를 읽은 뒤 `history.replaceState`로 `reset_token` query parameter를 제거합니다. token은 React state에만 전달되고 화면·알림·일반 API 응답에 렌더링하지 않습니다. 새로고침·뒤로가기·재사용을 보안 경계로 의존하지 않으며, 최종 판정은 서버의 one-time record가 담당합니다.

## API 계약

### Reset request

```text
POST /api/auth/password-reset/request
```

요청:

```json
{
  "email": "person@example.com"
}
```

형식이 올바른 이메일이면 계정 존재 여부·provider 설정 여부와 관계없이 다음 형태를 반환합니다.

```json
{
  "accepted": true,
  "delivery_status": "accepted",
  "message": "입력한 이메일이 등록되어 있고 발송 채널이 설정되어 있다면 비밀번호 재설정 안내를 보내요. 메일이 오지 않으면 주소와 스팸함을 확인해 주세요."
}
```

가입되지 않은 이메일에는 token을 만들지 않습니다. provider 설정이 없는 local preview에서도 같은 generic 응답을 반환하지만 메일과 token을 만들지 않습니다. 이메일 형식이 잘못된 경우에만 `422`를 반환합니다.

### Reset complete

```text
POST /api/auth/password-reset/complete
```

요청:

```json
{
  "token": "메일 링크의 reset_token",
  "new_password": "새 비밀번호"
}
```

`token`은 40~512자, `new_password`는 8~256자입니다. 유효한 token이면 `AccountSessionResponse`를 반환합니다.

```json
{
  "mode": "account",
  "user_id": "account-id",
  "email": "person@example.com",
  "workspace_id": "account-workspace-id",
  "role": "user",
  "access_token": "ra1.…",
  "token_type": "bearer",
  "expires_at": "2030-01-01T00:00:00Z"
}
```

다음 경우에는 `400`으로 처리합니다.

- token 형식·서명이 틀림
- token이 만료됨
- 이미 사용됨
- 다른 reset token 발급으로 폐기됨
- token에 기록된 account/session version과 현재 account row가 다름

완료 성공 후에는 같은 token을 다시 사용할 수 없고, 완료 전에 발급된 account access token도 `session_version` 불일치로 `401`이 됩니다.

## Email provider 경계

API는 특정 상용 메일 서비스 SDK에 직접 묶이지 않고, 서버 전용 HTTP provider 계약으로 분리합니다. 다음 환경변수가 모두 필요합니다.

```text
RESCUE_MEAL_PASSWORD_RESET_BASE_URL=https://app.example.com/account
RESCUE_MEAL_EMAIL_PROVIDER_URL=https://mail.example.com/send
RESCUE_MEAL_EMAIL_PROVIDER_TOKEN=server-only-secret
RESCUE_MEAL_EMAIL_TIMEOUT_SECONDS=8
RESCUE_MEAL_EMAIL_MAX_ATTEMPTS=2
RESCUE_MEAL_EMAIL_RETRY_BACKOFF_SECONDS=0.15
```

`RESCUE_MEAL_PASSWORD_RESET_BASE_URL`과 provider URL은 운영에서 HTTPS만 허용합니다. `http://localhost`, `127.0.0.1`, `::1`은 local stub 검증용으로만 허용합니다. provider token은 브라우저 build나 API response·access log에 들어가면 안 됩니다.

API가 provider에 보내는 최소 payload는 다음과 같습니다.

```json
{
  "to": "person@example.com",
  "template": "rescue-meal-password-reset",
  "reset_url": "https://app.example.com/account?reset_token=…",
  "expires_at": "2026-09-02T12:30:00+00:00"
}
```

provider 호출은 bounded timeout을 사용하며 실패해도 사용자에게 account 존재 여부나 provider 내부 오류를 노출하지 않습니다. `408`, `425`, `5xx`와 네트워크 예외만 최대 시도 횟수 안에서 재시도하고, 주소·계약 오류 같은 영구 `4xx`는 즉시 중단합니다. 각 시도와 backoff를 합친 provider 호출 전체도 45초 hard cap을 넘지 않습니다. 모든 시도에는 reset token 원문이 아닌 SHA-256 기반 `Idempotency-Key`를 동일하게 보내므로 provider는 timeout 뒤 재시도를 같은 메시지로 deduplicate해야 합니다. provider가 실제로 메일을 전달했다는 보장은 provider의 delivery/readback·bounce·rate-limit 연동을 별도로 검증해야 합니다.

## 저장소·동시성

SQLite는 `password_reset_tokens` 테이블에 다음 의미의 값을 저장합니다.

| 필드 | 의미 | 원문/민감도 |
| --- | --- | --- |
| `token_hash` | reset token lookup hash | token 원문 아님 |
| `account_id` | 대상 account | 내부 식별자 |
| `session_version` | 발급 당시 account version | version gate |
| `expires_at` | 30분 만료 시각 | lifecycle |
| `created_at` | 발급 시각 | lifecycle |
| `used_at` | 사용 또는 폐기 시각 | `NULL`이면 미사용 |

PostgreSQL에도 `rescue_auth_password_reset_tokens`와 account별 생성 시각 index를 추가합니다. 완료 시 row lock과 account version 조건을 사용해 비밀번호·session version·token 사용 처리가 한 transaction 안에서 일어나도록 구성했습니다. 기존 활성 token은 같은 account에 새 token을 발급할 때 폐기합니다.

현재 구현은 만료 token 정리 job과 메일 provider bounce 처리를 별도로 제공하지 않습니다. 보안 Compose profile은 persistent SQLite/PostgreSQL auth store에서 다중 API process가 공유하는 atomic IP/identity rate-limit event와 `Retry-After`를 적용하며, in-memory fixture mode는 process-local fallback을 사용합니다. 운영에서는 retention job, provider의 idempotency 동작·delivery status readback, 메일 bounce 처리, 보안 audit event를 추가로 연결해야 합니다.

## 운영 전 확인 목록

1. 실제 HTTPS frontend origin과 메일 provider sandbox에서 link 생성·전달·만료를 검증합니다.
2. provider token을 secret manager에서 API process에만 주입하고 로그 수집기에서 query string·Authorization을 마스킹합니다.
3. 동일 이메일 반복 요청 rate limit과 계정 탈취 방지 정책을 정합니다.
4. 이메일 verification, OAuth/SSO, refresh token/device session 정책을 account recovery와 별도 범위로 결정합니다.
5. reset 성공·실패·provider bounce를 개인정보 최소화 audit event로 보존하고 삭제 정책과 연결합니다.
6. 실제 iOS/Android 메일 앱에서 link가 앱 또는 브라우저로 열리고, token이 history/referrer에 남지 않는지 확인합니다.

현재 local API·SQLite repository·browser E2E는 generic request, token one-time 완료, session rotation, URL query 제거 경계를 검증했습니다. provider adapter의 URL 안전성, transient retry, permanent 4xx 중단, 동일 idempotency key 재사용은 API unit/readback에서 검증했지만, 외부 메일 provider의 실제 전송·deduplication·bounce와 운영 abuse 방어는 아직 검증하지 않았으며, 상세 결과는 [account recovery readback](../evidence/account-recovery-readback-2026-09-02.md)에 기록합니다.
