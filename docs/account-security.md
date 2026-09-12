# Account 보안과 session rotation

기준일: 2026-09-03

## 현재 제공하는 기능

로그인한 account 사용자는 현재 비밀번호를 입력해 새 비밀번호로 변경할 수 있습니다. 변경이 성공하면 account의 `session_version`을 1 증가시키고 새 access token을 발급합니다. 기존에 발급된 모든 account token은 version mismatch로 즉시 `401`이 됩니다. 반복 시도는 account ID·client IP 기반 persistent rate limit과 `Retry-After`로 제한합니다.

guest workspace에는 account password 변경 기능을 노출하지 않고 `403`으로 거절합니다.

계정 삭제 lifecycle도 session 검증과 분리된 durable 상태로 관리합니다. 삭제
확인이 끝나면 account row를 먼저 `deleting`으로 바꾸고, 이 상태에서는 login·reset·
password change와 일반 workspace 요청을 허용하지 않습니다. 삭제 endpoint는
같은 session version의 재시도만 받아 workspace purge와 credential 삭제를
재개하며, 완료 시 row가 제거됩니다. 중간 실패는 `503`, 삭제 중인 account의
일반 요청은 `423 account_deletion_in_progress`입니다.

## 처리 순서

```text
현재 account token 검증
→ current_password 확인
→ new_password 길이·동일값 검증
→ password hash 교체
→ session_version 증가
→ 새 account token 발급
→ 이전 version token은 middleware에서 401
```

현재 password hash 알고리즘은 기존 `scrypt$v1`을 유지합니다. password 원문은 저장하지 않습니다.

## Token 계약

새 token:

```text
ra1.<account_id>.<workspace_id>.<role>.<session_version>.<expires_epoch>.<signature>
```

기존 token 호환:

```text
ra1.<account_id>.<workspace_id>.<role>.<expires_epoch>.<signature>
```

legacy 6-part token은 version 0으로 읽고 account row의 `session_version=0`일 때만 통과합니다. password change 뒤에는 row가 version 1 이상이 되므로 legacy token도 차단됩니다.

## API

```text
POST /api/auth/password/change
```

요청:

```json
{
  "current_password": "현재 비밀번호",
  "new_password": "새 비밀번호"
}
```

규칙:

- Bearer account token 필요
- guest token은 `403`
- current/new password는 각각 8~256자
- 새 비밀번호가 현재 비밀번호와 같으면 `422`
- 현재 비밀번호가 틀리면 `401`
- 짧은 시간에 반복하면 `429`와 `Retry-After`를 반환하며 identity 원문은 응답에 포함하지 않음
- 성공 시 기존 session은 더 이상 workspace API에 접근할 수 없음
- 성공 응답은 기존 `AccountSessionResponse` 형태의 새 token을 반환

## 저장소

- SQLite `accounts.session_version` column을 additive migration으로 추가
- PostgreSQL `rescue_auth_accounts.session_version` column을 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 추가
- 기존 account row는 default 0으로 호환
- account lookup은 `id`, `workspace_id`, `role`, `session_version`을 함께 검증

## 현재 검증

- password hash 교체 후 old password login 실패
- new password login 성공
- old `AuthContext` version current check 실패
- new `AuthContext` version current check 성공
- SQLite repository 재시작 후 session version 보존
- API old token dashboard 401·new token dashboard 200
- 연결 화면에서 입력 payload·성공 안내·기존 기기 재인증 안내 확인
- 잘못된 현재 비밀번호 반복 시 `429`·`Retry-After`·identity 비노출 확인

## 아직 구현하지 않은 것

- 이메일 verification
- OAuth/SSO
- refresh token rotation과 device/session 목록
- account lockout·password change audit delivery·운영 deletion audit/보상 작업. 로그인·회원가입·guest·reset·password change·account delete endpoint에는 persistent SQLite/PostgreSQL auth store의 shared atomic rate limit event가 적용되고, DB가 없는 fixture mode만 process-local fallback을 사용합니다. account deletion coordinator·durable fence·workspace write guard와 disposable PostgreSQL 두 process crash-window readback까지 구현했지만, 운영 auth/workspace DB의 distributed transaction이 아닌 보상 workflow·backup/WAL/object storage retention acceptance는 별도입니다.

비밀번호를 잊은 사용자의 reset request·one-time token·session rotation 계약은 [account password recovery](account-recovery.md)로 분리했습니다. 계정 전체 데이터 삭제는 [계정·workspace 삭제 설계](account-deletion.md)에서 별도로 다루며, 이 문서는 로그인한 사용자의 password change 보안만 다룹니다. 실행 결과는 [account security readback](../evidence/account-security-readback-2026-09-02.md)에 기록합니다.
