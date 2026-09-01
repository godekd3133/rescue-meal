# Guest workspace 인증·데이터 격리

## 현재 구현

Rescue Meal은 API가 연결된 첫 실행에서 `/api/auth/guest`를 호출해 30일짜리 서명 token을 발급합니다. 프론트는 token을 localStorage에 저장하고 dashboard·OCR·receipt commit·storage event·date correction 요청에 Bearer header를 붙입니다.

```text
프론트 첫 API 요청
→ POST /api/auth/guest
→ signed guest workspace token
→ localStorage 저장
→ 이후 모든 API 요청에 Authorization: Bearer
```

token payload는 `rm1.<workspace_id>.<expires_epoch>.<signature>` 형식이며 HMAC-SHA256 서명을 검증합니다. secret이 없을 때는 개발 모드에서만 고정 dev secret을 사용하고, `RESCUE_MEAL_AUTH_REQUIRED=true`이면 `RESCUE_MEAL_AUTH_SECRET`이 없을 때 안전하게 실패합니다.

## SQLite workspace routing

- 기본 무인증 요청은 `demo` workspace를 사용해 기존 fixture/test 호환성을 유지합니다.
- 유효한 guest token은 token의 workspace ID로 request context를 설정합니다.
- SQLite에서는 base DB와 별도 sibling DB를 workspace마다 만들어 재시작 후에도 같은 guest 재고를 읽습니다.
- 두 workspace의 식품·영수증·storage event·commit transaction은 서로 보이지 않습니다.
- token이 만료되거나 401을 받으면 프론트가 token을 버리고 새 guest session을 한 번 재발급합니다.
- logout 시 server-side token hash를 revoke DB에 기록하고, 이후 같은 token은 workspace routing 전에 401로 차단합니다.

## 운영 경계

현재 guest workspace는 account login이 아닙니다.

- 이메일·비밀번호 account register/login은 구현되어 있고 OAuth 계정은 아직 없습니다.
- 계정 복구·이메일 verification·다중 기기 계정 merge는 아직 없습니다.
- PostgreSQL API projection에는 `workspace_id` 복합키와 조건이 구현되어 있고, account/revoked token table adapter도 있습니다. 다만 normalized domain table의 tenant mapping과 live Postgres readback은 아직 검증 전입니다.
- 운영 auth 도입 전에는 `RESCUE_MEAL_AUTH_SECRET`을 secret manager에서 주입하고 `RESCUE_MEAL_AUTH_REQUIRED=true`로 실행해야 합니다.

현재는 이메일·비밀번호 account의 register/login/profile API와 account/logout UI가 연결되어 있습니다. register는 빈 account workspace를 만들고, login은 기존 workspace ID에 다시 token을 발급하며, logout은 현재 token을 제거한 뒤 새 guest workspace로 전환합니다. guest 재고를 account workspace로 자동 병합하지 않습니다.

## API

```text
POST /api/auth/guest
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /health
GET  /api/dashboard              Authorization 필요(운영 모드)
POST /api/receipts/intake        Authorization 필요(운영 모드)
```

`/health`, guest session 발급, register, login은 public입니다. `/me`와 logout은 Bearer token을 요구합니다. optional mode에서는 기존 demo 요청을 허용하지만, client가 invalid Bearer를 보내면 demo로 조용히 전환하지 않고 401을 반환합니다.

## 검증

- token round-trip·만료·변조·production secret 누락 테스트
- 두 guest workspace에 각각 발급한 token의 inventory isolation
- 한 workspace에만 식품 추가 후 count `[8, 7]` readback
- 같은 SQLite base path와 secret으로 API 재시작 후 기존 브라우저 token의 inventory 7개 readback
- API 401 auth-required test
- account register/login/me/logout 브라우저 flow
- server-side logout 후 동일 token 401 readback
