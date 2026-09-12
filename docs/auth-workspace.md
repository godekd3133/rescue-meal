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

이메일·비밀번호 account는 새 발급 기준 `ra1.<account_id>.<workspace_id>.<role>.<session_version>.<expires_epoch>.<signature>` 형식의 access token을 사용합니다. 기존 6-part `ra1` token은 `session_version=0` legacy token으로 읽습니다. `role=user`는 일반 식품 workspace 사용자이고, `role=recipe_admin`은 shared recipe catalog review 권한을 가집니다. `RESCUE_MEAL_RECIPE_ADMIN_EMAILS` allowlist에 등록된 이메일로 생성한 account만 `recipe_admin`으로 bootstrap됩니다. 기존 `rm1` guest token은 재고 API용으로 유지합니다.

## SQLite workspace routing

- 기본 무인증 요청은 `demo` workspace를 사용해 기존 fixture/test 호환성을 유지합니다.
- 유효한 guest token은 token의 workspace ID로 request context를 설정합니다.
- SQLite에서는 base DB와 별도 sibling DB를 workspace마다 만들어 재시작 후에도 같은 guest 재고를 읽습니다.
- 두 workspace의 식품·영수증·storage event·commit transaction은 서로 보이지 않습니다.
- token이 만료되거나 401을 받으면 프론트가 token을 버리고 새 guest session을 한 번 재발급합니다.
- guest token의 재발급으로도 401이 남으면 `MealApiError(401)`로 보존하고, account token이면 게스트로 조용히 강등하지 않은 채 `로그인 다시 필요` 상태와 재로그인 CTA를 표시합니다.
- CORS middleware는 workspace context보다 바깥에 배치해 invalid-token·auth-required short-circuit 401에도 브라우저의 `Access-Control-Allow-Origin`과 credentials header를 붙입니다. 브라우저가 401을 `fetch failed`로 오인해 오프라인 상태로 바꾸지 않도록 하는 경계입니다.
- 프론트는 401 인증 오류와 409 중복·동시성 충돌을 typed API error로 구분해 사용자에게 재로그인 또는 최신 상태 재확인을 안내합니다. 영수증 fingerprint 중복은 새 lot를 만들지 않고 이미 반영된 기록으로 설명하며, PostgreSQL workspace revision 충돌은 `workspace_revision_conflict` code·현재 revision header와 함께 최신 read model을 다시 읽은 뒤 사용자가 재시도하도록 안내합니다.
- PostgreSQL workspace 응답은 `X-Rescue-Meal-Workspace-Revision`을 반환하고, client가 보낸 `If-Rescue-Meal-Revision`이 최신 값과 다르면 mutation handler 전에 `409`를 반환합니다. response에는 `X-Rescue-Meal-Conflict: workspace_revision`, `retryable: true`, `action: reload_and_retry`를 포함하며 stale payload를 자동 병합·재생하지 않습니다. 브라우저가 header를 읽을 수 있도록 CORS expose 목록에도 revision header를 등록합니다.
- logout 시 server-side token hash를 revoke DB에 기록하고, 이후 같은 token은 workspace routing 전에 401로 차단합니다.
- account 비밀번호 변경 시 account의 `session_version`을 증가시키고 새 token을 발급합니다. workspace middleware는 token의 version과 현재 account row를 비교하므로, 비밀번호 변경 전 모든 token을 401로 차단합니다.
- 비밀번호 재설정은 계정 존재 여부를 노출하지 않는 요청 endpoint와 30분 one-time token 완료 endpoint로 분리합니다. reset token 원문은 설정된 메일 provider에 transient delivery하고 저장소에는 hash만 남기며, 완료 시 password와 `session_version`을 함께 교체합니다.
- secure Compose profile에서는 guest·register·login·password-reset 공개 endpoint에 client/identity별 rate limit과 `Retry-After`를 적용합니다. persistent SQLite/PostgreSQL auth store에서는 opaque event bucket과 atomic transaction/lock으로 여러 API process가 같은 제한을 공유하고, in-memory fixture mode만 process-local fallback을 사용합니다.
- 회원가입 직전의 guest token에 기록이 있으면 프론트가 먼저 transfer preview를 요청하고, 사용자가 확인한 경우에만 account workspace로 복사합니다. 원본 guest workspace는 삭제하지 않으며, account에 이미 다른 기록이 있으면 자동 병합하지 않고 `409`로 멈춥니다. 식단 조건도 업무 데이터의 일부로 preview·명시적 import·fingerprint 경계에 포함합니다.
- guest transfer의 `ready` 판정과 source→target copy는 두 workspace ID의 고정 순서로 source·target lock을 잡은 뒤 다시 수행합니다. preview 직후 account에 다른 기록이 들어오면 guest snapshot으로 덮지 않고 `409`로 멈추며, target flush 일반 실패는 `guest_transfer_persistence_unavailable` typed `503`과 기존 account 상태 복원으로 반환합니다. PostgreSQL revision conflict에서는 target backup을 stale 상태로 복원하지 않습니다 ([guest transfer lock/recovery readback](../evidence/guest-transfer-lock-recovery-readback-2026-09-09.md)).
- 로그인한 account는 계정 설정에서 현재 비밀번호와 `DELETE` 확인 문구를 다시 입력해 `POST /api/account/delete`를 요청할 수 있습니다. 요청이 시작되면 account row가 durable `deleting` fence로 전환되어 일반 account 인증·workspace 쓰기는 `423 account_deletion_in_progress`로 차단되고, 같은 session version의 삭제 요청만 재시도할 수 있습니다. 재시작 뒤 복구 화면을 잃지 않도록 `GET /api/auth/me`는 workspace 데이터를 열지 않고 `account_status=deleting`만 반환합니다. workspace purge와 credential 삭제가 모두 성공하면 account row를 삭제하고 기존 token은 `401`이 되며, guest workspace는 별도 source로 보존됩니다.

## 운영 경계

현재 guest workspace는 account login이 아닙니다.

- 이메일·비밀번호 account register/login/password change와 `user`·`recipe_admin` role check는 구현되어 있고 OAuth 계정은 아직 없습니다.
- 외부 메일 provider를 통한 실제 계정 복구 메일 전달·이메일 verification·다중 기기 계정 merge는 아직 운영 검증 전입니다. provider 설정이 없으면 reset 요청은 generic accepted 응답만 반환하고 메일을 보내지 않습니다.
- PostgreSQL API projection에는 `workspace_id` 복합키와 조건이 구현되어 있고, account/revoked token table adapter도 있습니다. normalized domain table의 tenant mapping, API restart 뒤 account persistence, session rotation, workspace purge는 disposable PostgreSQL에서 확인했습니다. workspace operation은 process별 bounded pool을 사용하지만 shared owner 통합, 운영 DB aggregate sizing/failover/분산 삭제 정책은 아직 별도 acceptance입니다.
- 운영 auth 도입 전에는 `RESCUE_MEAL_AUTH_SECRET`을 secret manager에서 주입하고 `RESCUE_MEAL_AUTH_REQUIRED=true`로 실행해야 합니다.

현재는 이메일·비밀번호 account의 register/login/profile/password-change/password-reset API와 account/logout/password-change/password-recovery UI가 연결되어 있습니다. register는 빈 account workspace를 만들고, login은 기존 workspace ID에 role과 session version이 포함된 `ra1` token을 발급하며, password change/reset은 현재 token version을 폐기하고 새 token을 발급합니다. logout은 현재 token을 제거한 뒤 새 guest workspace로 전환합니다. register 직후에는 guest 기록의 수량을 preview로 보여주고, 사용자가 선택한 경우에만 account workspace로 명시적으로 복사합니다. 가져오기는 원본을 삭제하지 않고, 계정별 보류 transfer token을 workspace ID에 묶어 같은 계정으로 다시 들어왔을 때만 재확인합니다. source·target의 transfer snapshot fingerprint가 이미 동일할 때만 재요청을 `already_transferred`로 끝내며, import 뒤 source 내용이 바뀌었거나 다른 account 기록과 충돌하면 자동 merge를 하지 않습니다. recipe catalog는 user workspace와 분리되어 `recipe_admin` 승인 결과를 모든 사용자 planner가 읽을 수 있습니다.

## API

```text
POST /api/auth/guest
POST /api/auth/register
POST /api/auth/login
POST /api/auth/password/change
POST /api/auth/password-reset/request
POST /api/auth/password-reset/complete
GET  /api/auth/me
POST /api/auth/logout
POST /api/account/guest-transfer/preview
POST /api/account/guest-transfer
POST /api/account/delete
GET  /health
GET  /api/dashboard              Authorization 필요(운영 모드)
POST /api/receipts/intake        Authorization 필요(운영 모드)
GET  /api/recipe-review/drafts/{draft_id}/events   recipe_admin 필요
```

`/health`, guest session 발급, register, login은 public입니다. `/me`와 logout은 Bearer token을 요구합니다. optional mode에서는 기존 demo 요청을 허용하지만, client가 invalid Bearer를 보내면 demo로 조용히 전환하지 않고 401을 반환합니다.

transfer preview는 food·receipt·storage event·meal plan·multi-day plan·shopping list·push 개수와 함께
`meal_preferences_changed`, `notification_preferences_changed`를 반환합니다. transfer 응답은 각 imported
개수와 `imported_shopping_list_count`, `imported_meal_preferences`, `imported_notification_preferences`를 반환합니다. 이 값들은 UI 표시와
readback을 위한 상태이며, raw token이나 영수증 원문을 응답에 포함하지 않습니다.

## 검증

- token round-trip·만료·변조·production secret 누락 테스트
- 두 guest workspace에 각각 발급한 token의 inventory isolation
- 한 workspace에만 식품 추가 후 count `[8, 7]` readback
- 같은 SQLite base path와 secret으로 API 재시작 후 기존 브라우저 token의 inventory 7개 readback
- API 401 auth-required test
- invalid-token 401 CORS header readback
- account register/login/me/logout 브라우저 flow
- account register 직후 guest transfer preview·명시적 import·원본 보존·동일 요청 idempotent replay
- guest transfer에서 workspace별 식단 조건 `meal_preferences_changed` preview·`imported_meal_preferences` import·account readback
- account delete의 비밀번호·확인 문구 gate, durable `active → deleting → deleted` fence, 실패 후 같은 요청 재시도, 일반 workspace `423` 차단, credential 삭제와 기존 token 401 readback
- guest transfer를 건너뛴 뒤 같은 account workspace로 다시 들어왔을 때 보류 import를 재확인하고, 다른 account에는 노출하지 않는 경계
- guest transfer ready 판정과 target copy 사이의 account write race가 source snapshot을 덮지 않는지, target flush failure 뒤 기존 상태가 보존되고 같은 요청이 재시도되는지 검증
- 만료된 account token → `로그인 다시 필요` → 재인증 화면 이동 E2E
- server-side logout 후 동일 token 401 readback
- 비밀번호 변경 후 기존 token 401·새 token 200 readback
- disposable normalized PostgreSQL에서 register → inventory write/read → API restart/login → password rotation → old token 401 → account purge와 credential/projection 0건 readback
- PostgreSQL read cursor가 `idle in transaction` snapshot을 남기지 않는 `/ready`·auth/workspace `pg_stat_activity` readback

상세 결과는 [PostgreSQL account authentication readback](../evidence/postgres-auth-live-readback-2026-09-04.md)에 기록했습니다.
