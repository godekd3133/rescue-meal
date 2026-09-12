# Account password recovery readback

기준일: 2026-09-02

## 결론

비밀번호 재설정의 핵심 계약을 local SQLite API·repository·browser UI에 연결했습니다. 등록 여부를 노출하지 않는 request 응답, hash-only reset token 저장, 30분 만료, one-time 사용, 완료 후 `session_version` rotation, reset URL query 제거가 현재 검증 범위입니다.

실제 메일 provider가 없는 local preview에서는 메일을 보내지 않습니다. 따라서 이 readback은 외부 메일이 실제 수신함에 도착했다는 증거가 아니며, provider sandbox·bounce·rate limit·delivery readback은 운영 전 별도 검증이 필요합니다.

## 변경 범위

| 경계 | 변경 |
| --- | --- |
| `services/api/app/auth.py` | `PasswordResetTokenRecord`, SQLite/PostgreSQL token table, token hash 저장, 기존 token 폐기, one-time consume, password/session rotation |
| `services/api/app/main.py` | generic `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/complete`, HTTPS/local provider URL 검증, bounded email provider call |
| `infra/postgres/001_initial_schema.sql` | `rescue_auth_password_reset_tokens`와 account 생성 시각 index |
| `apps/web/src/mealApi.ts` | public reset request/complete client와 완료 session 저장 |
| `apps/web/src/Prototype.tsx` | 앱 초기 reset token 캡처·URL query 제거·lazy account sheet 전달 |
| `apps/web/src/AccountSheet.tsx` | reset request·새 비밀번호 설정·확인·성공 session 연결 UI |
| `apps/web/tests/connected-prototype.spec.ts` | generic request와 link completion, reset token URL 제거 E2E |
| `services/api/tests/test_auth.py`, `test_api.py`, `test_postgres_contract.py` | hash-only·restart persistence·one-time·session rotation·schema regression |
| `docs/account-recovery.md`, `docs/auth-workspace.md`, `README.md`, `.env.example` | 운영 계약·환경변수·미검증 범위 문서화 |

## API·저장소 readback

```text
GET  /health                                         → 200, storage: sqlite-local
POST /api/auth/password-reset/request with {}        → 422, email required
POST /api/auth/password-reset/request with unknown email
                                                      → 200 generic accepted
provider disabled                                     → token/email not created
services/api password-reset focused tests             → request/provider 2 passed; repository 2 passed
services/api full pytest                              → 151 passed, 7 warnings
```

API request 응답은 account 존재 여부·provider 설정·reset token을 반환하지 않습니다. token을 발급하는 경우에도 provider payload에만 transient하게 들어가고, SQLite/PostgreSQL에는 SHA-256 hash와 account/session version·만료/사용 시각을 저장합니다.

## Browser readback

```text
connected-prototype.spec.ts generic request       → 1 passed
connected-prototype.spec.ts link completion        → 1 passed
connected-prototype.spec.ts full file              → 20 passed
auth rate-limit contract test                       → 1 passed, 429·Retry-After·identity 비노출
```

확인한 동작:

- 로그인 화면에서 `비밀번호를 잊으셨나요?`를 열고 이메일을 제출할 수 있습니다.
- 계정 존재를 알리지 않는 generic 안내가 표시됩니다.
- reset link로 들어오면 `새 비밀번호 설정` 화면이 바로 열립니다.
- 앱 초기화 직후 `reset_token` query parameter가 `history.replaceState`로 주소에서 제거됩니다.
- token 원문은 status·화면·일반 알림에 노출되지 않습니다.
- 새 비밀번호와 확인값이 일치할 때만 완료 요청을 보냅니다.
- 완료 응답의 새 account session을 저장하고 계정 workspace로 연결합니다.

## 보안 불변식

- 잘못된 형식·서명·만료·사용 완료·이전 token 발급·session version 불일치 token은 `400`입니다.
- 같은 account에 새 reset token을 발급하면 기존 미사용 token은 폐기됩니다.
- reset 완료는 비밀번호 교체와 account `session_version` 증가를 함께 수행합니다.
- reset 전에 발급된 account access token은 완료 뒤 middleware에서 `401`입니다.
- token 원문은 저장소 restart 후 복원되지 않습니다.
- provider URL과 reset base URL은 운영 HTTPS만 허용하고 local HTTP는 localhost 검증 범위로 제한합니다.
- provider token은 브라우저 env가 아니라 API process 전용 설정입니다.

## 미검증 범위

- 실제 HTTPS 메일 provider sandbox의 send/receive, bounce, retry, provider idempotency, delivery status readback
- reset request IP/email rate limit, credential stuffing 방어, account lockout, abuse monitoring
- 이메일 verification, OAuth/SSO, refresh token rotation, device/session 목록
- 실제 iOS/Android 메일 앱의 universal/app link, referrer·history 정책과 PWA 설치 상태
- live PostgreSQL transaction/readback은 Docker daemon 부재로 실행하지 못했으며, schema와 FakeCursor contract까지만 검증했습니다.

전체 구현 계약은 [account password recovery](../docs/account-recovery.md), 로그인한 상태의 비밀번호 변경은 [account security](../docs/account-security.md)에 기록했습니다.

## 추가 adapter readback — 2026-09-05

비밀번호 재설정 link를 실제 메일 provider에 보내는 경계를 별도
`services/api/app/email_delivery.py`로 분리했습니다. 기존 API의 generic request
응답·token hash 저장·one-time consume·session rotation 계약은 바꾸지 않습니다.

```text
provider URL safety                         → HTTPS only in production; local HTTP loopback only
transient 503 → 202                         → 2 attempts, same Idempotency-Key
permanent 400                                → 1 attempt, no retry
network HTTPError                            → bounded retry budget, generic API response
token in Idempotency-Key                    → absent; SHA-256-derived key only
runtime settings                             → timeout 1..30s, attempts 1..3, backoff 0..2s
total provider call budget                   → hard-capped at 45 seconds
focused email/preflight/API tests            → passed
```

`Idempotency-Key`는 provider가 구현해야 하는 계약이며, 이 readback만으로
외부 provider가 실제 deduplication·수신·bounce status를 수행한다고 볼 수
없습니다. 운영 전 sandbox에서 timeout 뒤 재시도, 동일 key dedupe, 429/5xx
정책, bounce webhook과 provider delivery log를 실제로 확인해야 합니다.
