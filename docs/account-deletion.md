# 계정·workspace 삭제 설계

기준일: 2026-09-06

## 목적

상용 서비스에서는 영수증 원문만 지우는 것과 계정 전체를 삭제하는 것이 다른
요구사항입니다. Rescue Meal은 계정 사용자가 본인임을 다시 확인한 뒤 account
workspace의 업무 데이터를 비우고 account credential을 삭제하는 별도 흐름을
제공합니다.

## 사용자 흐름

```text
계정 설정
→ 계정 삭제 펼치기
→ 현재 비밀번호 입력
→ DELETE 확인 문구 입력
→ 계정·workspace 삭제 요청
→ account 상태를 deleting으로 고정
→ workspace purge와 credential 삭제 재시도 가능
→ 기존 account token 무효화
→ 새 guest workspace로 전환
```

삭제 패널은 기본적으로 접혀 있습니다. 현재 비밀번호와 정확한 대문자
`DELETE`가 모두 맞아야 제출 버튼이 활성화됩니다. 잘못된 비밀번호는 `401`,
잘못된 확인 문구나 형식은 `422`로 처리하며, 그 경우 workspace를 변경하지
않습니다. 반복적인 삭제 시도는 account ID·client IP 기반 auth rate limit과
`Retry-After`를 사용합니다.

## API 계약

```http
POST /api/account/delete
Authorization: Bearer <account-token>
Content-Type: application/json
```

```json
{
  "current_password": "correct-horse-battery",
  "confirmation": "DELETE"
}
```

성공 응답은 개인 식별 정보를 다시 반환하지 않습니다.

```json
{
  "status": "deleted",
  "message": "계정과 해당 workspace의 기록을 삭제했습니다."
}
```

workspace purge 또는 credential 삭제 단계에서 일시적인 persistence failure가 발생하면
account row를 `deleting` fence로 유지한 채 다음 typed envelope을 반환합니다.

```json
{
  "detail": {
    "code": "account_deletion_persistence_unavailable",
    "detail": "계정 삭제를 완료하지 못했습니다. 삭제 상태를 유지했어요. 같은 화면에서 다시 시도해 주세요.",
    "retryable": true,
    "action": "retry_later"
  }
}
```

이 응답에는 password·token·email·예외 원문이 포함되지 않습니다. `AccountSheet`는 해당
code일 때만 현재 password와 `DELETE` 확인 문구를 유지한 inline `다시 시도`를 보여주며,
인증 실패·rate limit·형식 오류와 typed code가 없는 503에는 같은 retry action을 자동으로
붙이지 않습니다.

guest token으로는 `403`이며, 계정 token이 아니면 삭제 경로를 실행하지
않습니다. account repository는 password reset token도 함께 삭제하고,
`session_version` 조건을 확인해 오래된 account 상태가 현재 계정을 덮어쓰지
않게 합니다. 삭제를 시작하면 account row는 바로 지우지 않고 `deleting`
상태로 남깁니다. 이 상태에서는 기존 token으로 일반 API를 호출할 수 없고
`423 Locked`와 `account_deletion_in_progress`가 반환되지만, 같은 session
version의 `/api/account/delete` 재요청은 허용됩니다. 단, 재시작 뒤 복구 UI를
구성할 수 있도록 `GET /api/auth/me`는 workspace 데이터를 반환하지 않고 현재
account 상태만 `account_status=deleting`으로 알려줍니다. workspace purge 또는
credential 삭제가 중간에 실패하거나 process가 그 사이 종료되어도 다음
재요청이 같은 durable fence를 이어받습니다. workspace와 credential 삭제가
모두 끝난 뒤 account row가 삭제되며, 그때 기존 stateless token은 account
lookup에 실패해 middleware에서 `401`이 됩니다.

## 삭제 범위

현재 account workspace에 속한 다음 데이터는 workspace 범위로 비워집니다.

- 식품 lot·영수증·commit transaction·보관 event
- 단일 식단·3일 식단·식단 audit·장보기 목록
- 식단 조건·알림 설정·읽음 상태·push subscription·delivery 상태
- receipt product alias·product enrichment job/worker 상태
- 상품 provenance current snapshot·before/after audit event
- 사용자가 수정한 상품명·브랜드·분류의 product-info before/after audit event
- workspace Grocy mapping·mapping audit·outbox/worker 상태
- SQLite/PostgreSQL compatibility projection과 normalized inventory projection

공용 recipe catalog와 recipe review source는 사용자 workspace 데이터가 아니므로
계정 삭제에서 지우지 않습니다. guest workspace는 별도 token으로 관리되는
독립 공간이므로 계정 삭제가 guest source를 자동 삭제하지 않습니다.

## 저장소별 처리

| 저장소 | 처리 |
|---|---|
| in-memory | 현재 workspace 객체를 fixture 없이 purge하고 router registry에서 제거 |
| SQLite | workspace store의 `reset`을 fixture 없이 수행하고 persistence projection을 비움; 이후 connection을 닫고 router에서 제거 |
| PostgreSQL | `workspace_id` 조건으로 compatibility/normalized projection을 purge하고, auth row를 `active → deleting`으로 먼저 전환한 뒤 workspace purge 완료 후 별도 auth transaction에서 삭제 |

계정 삭제는 auth database와 workspace database가 서로 다른 transaction이므로
distributed transaction을 주장하지 않습니다. 대신 auth row의 `deleting`
상태를 durable fence로 사용합니다. fence 획득 후 workspace purge가 실패하면
`503`을 반환하지만 account row는 `deleting`으로 남습니다. 이후 일반
workspace 요청은 `423`으로 차단되고, 사용자가 같은 비밀번호·확인 문구로
삭제 endpoint를 재시도하면 purge부터 다시 수행합니다. purge가 성공한 뒤
credential 삭제가 실패해도 같은 `deleting` 상태에서 재시도할 수 있습니다. 이 regular
persistence failure는 `account_deletion_persistence_unavailable` typed `503`으로 구분합니다.
이 경계는 분산 원자성을 대신하지 않으며, 운영에서는 삭제 시도·실패·완료와
backup/WAL/object storage/Grocy 보존 상태를 별도 audit·보상 작업으로
관찰해야 합니다.

## 개인정보·운영 경계

- API 응답·로그에 password, token, email을 넣지 않습니다.
- 브라우저는 성공 후 기존 session과 pending guest-transfer local state를
  제거하고 guest workspace로 이동합니다.
- 백업, WAL, object storage, 외부 Grocy, 메일 provider가 이미 보존한 데이터는
  애플리케이션 transaction만으로 즉시 삭제되지 않습니다.
- 법정 보존 의무, backup retention, 삭제 요청 처리 기한은 운영자·법무 정책으로
  별도 결정해야 합니다.
- 삭제는 식품 안전·소비기한·Grocy 외부 계정의 삭제를 의미하지 않습니다.

## 구현 위치와 검증

- account delete repository/fence: `services/api/app/auth.py`
- workspace purge/router: `services/api/app/main.py`
- API adapter: `apps/web/src/mealApi.ts`
- account settings UI: `apps/web/src/AccountSheet.tsx`
- backend password·confirmation·purge test: `services/api/tests/`
- browser confirmation flow: `apps/web/tests/connected-prototype.spec.ts`

구체적인 실행 결과는 [account deletion readback](../evidence/account-deletion-readback-2026-09-03.md),
[account deletion fence readback](../evidence/account-deletion-fence-readback-2026-09-06.md),
[PostgreSQL multi-process account deletion readback](../evidence/postgres-account-deletion-multiprocess-readback-2026-09-06.md),
[PostgreSQL account deletion crash-recovery readback](../evidence/postgres-account-deletion-crash-recovery-readback-2026-09-06.md)에
기록합니다. 현재 local/in-memory/SQLite 회귀와 PostgreSQL schema/adapter 계약,
실제 disposable PostgreSQL 두 process의 fence·purge·기존 token 차단, 삭제 중
API process SIGKILL 뒤 재시작·동일 session 재개·scoped rows 0까지 확인했습니다.
managed PostgreSQL failover·backup/WAL/object storage 삭제, 외부 Grocy 삭제와
운영 audit/보상 작업은 별도 운영 gate입니다. 최신 envelope 회귀는
[account deletion envelope readback](../evidence/account-deletion-envelope-readback-2026-09-11.md)에
기록합니다.
