# 영수증 개인정보와 데이터 수명주기

기준일: 2026-09-08

## 목표

영수증 사진은 식품 등록을 빠르게 만드는 입력 수단이지만, 파일명·OCR 원문·매장 정보에는 사용자를 식별할 수 있는 정보가 섞일 수 있습니다. Rescue Meal은 원본 입력과 재고/거래 기록을 같은 수명주기로 취급하지 않습니다.

## 현재 구현 정책

| 데이터 | 현재 처리 | 사용자 동작 |
| --- | --- | --- |
| 업로드 image/PDF bytes | `_read_upload()` 이후 OCR/품질 분석 중 메모리에서만 사용하며 API가 blob으로 저장하지 않음 | 별도 파일 삭제 작업 없음. 외부 reverse proxy/object storage를 붙일 때는 별도 lifecycle 필요 |
| receipt review browser preview | 업로드 직후 브라우저 `File`에서 `blob:` object URL을 만들어 review 중에만 표시 | 재선택·mode 전환·실패 재시작·unmount에서 URL 폐기. 서버 저장본을 다시 여는 기능이 아님 |
| 미반영 `review_required` draft 재개 | receipt summary·line·template·merchant·구매일 같은 안전한 metadata만 workspace에 유지하고 원본 image/PDF bytes는 저장하지 않음 | connected 홈에서 같은 workspace의 검수 카드를 다시 열 수 있음. 재개 화면은 원본 preview 없이 metadata-only review를 표시하며, commit 전까지 lot를 만들지 않음 |
| receipt `source_filename` | draft/commit metadata에 저장될 수 있음 | 계정 화면에서 `원본 정보 삭제` 실행 시 generic marker로 치환 |
| receipt line `raw_name` | OCR 원문으로 저장 | commit receipt privacy erase에서 `삭제된 OCR 원문`으로 치환 |
| receipt line `canonical_name` | review에서 사용자 확인한 재고 identity | 이미 생성된 lot·레시피·검색을 보존하기 위해 유지 |
| `source_receipt_id`, `source_receipt_line_id` | lot provenance·중복/감사 연결 | 내부 참조로 유지. 사용자 상세에는 “영수증 상품 항목 연결됨”만 표시 |
| 구매일·수량·storage·date assertion | 재고 계산과 사용자 기록에 필요한 업무 데이터 | 상품 프로필 correction에서도 보존하며 소비기한 확정값과 분리 |
| 상품 프로필·provenance audit | 상품명·브랜드·분류 수정과 source 제거의 before/after 설명 record | workspace export·guest transfer에 포함하고 account purge에서 함께 삭제 |
| password reset token·revoked account-token hash | token 원문이 아닌 hash만 저장하며 TTL과 grace가 지나면 helper cleanup 대상 | 유효 token과 grace 안의 revoke row는 보존. 업무 audit·재고·receipt·idempotency는 대상 아님 |

## API 계약

```text
GET  /api/privacy/receipt-policy
GET  /api/receipts
POST /api/receipts/{receipt_id}/privacy-erase
POST /api/account/delete
```

삭제 요청은 실수 방지를 위해 JSON body에 `{"confirm": true}`를 요구합니다.

### 삭제 요청의 저장 복구

receipt privacy erase는 `WorkspaceMutation` recovery Seam을 사용합니다. draft 삭제 또는
committed/pending source metadata redaction을 `persist=False`로 먼저 staging하고 하나의
outer `flush()`에서 확정하므로, 일반 persistence failure에서는 삭제/redaction 전 snapshot으로
되돌아갑니다. 이때 API는 `receipt_privacy_persistence_unavailable` typed `503`과
`retry_later` action을 반환하며, account sheet는 원래 대상 receipt를 유지한 inline `다시 시도`
action을 제공합니다. PostgreSQL revision conflict는 이미 reload된 승자 snapshot을 덮지
않도록 `409` 흐름으로 남깁니다.

이 recovery는 local SQLite/PostgreSQL compatibility projection의 정합성만 보장합니다.
backup/WAL/read replica, reverse proxy/OCR log, object storage, Grocy 외부 시스템의 삭제·보존은
여전히 별도 운영 작업과 법무 정책의 대상입니다.

### 미반영 draft

아직 재고 lot를 만들지 않은 draft는 receipt metadata 전체를 삭제합니다. 삭제 후에도 inventory 수량은 변하지 않고, 해당 receipt ID로 commit을 다시 시도하면 `404`가 됩니다.

### 이미 commit된 receipt

이미 lot를 만든 receipt는 row 자체를 지우지 않습니다. 다음 정보를 유지해야 재고 provenance, commit transaction, Grocy outbox, 중복 fingerprint가 끊어지지 않습니다.

```text
lot source_receipt_id / source_receipt_line_id
purchase date / quantity / storage / date assertion
commit transaction / idempotency fingerprint
```

대신 사용자 입력 파일명과 OCR 원문을 generic marker로 치환합니다. 따라서 사용자는 “원본 정보 삭제됨” 상태를 확인할 수 있고, 이미 기록된 식품 재고는 계속 사용할 수 있습니다.

commit 실패로 reconciliation transaction이 존재하는 미반영 draft도 같은 비식별화 경계를 사용합니다. transaction이 receipt를 참조할 수 있으므로 row를 삭제하지 않습니다.

계정 전체 삭제는 receipt 단위 privacy erase와 별도입니다. [계정·workspace 삭제
설계](account-deletion.md)의 재인증과 `DELETE` 확인 문구를 통과하면 현재 account
workspace의 업무 데이터를 purge하고 account credential/reset token을 삭제합니다.
다만 backup/WAL/object storage/Grocy 외부 시스템의 보존은 이 API transaction의
범위가 아닙니다.

### 인증 helper retention

인증 helper row는 업무 데이터와 다른 수명주기를 사용합니다. password reset token은
30분 TTL 뒤 1시간 grace가 지나야 정리하고, revoked account-token hash는 account
token 30일 TTL 뒤 1시간 grace가 지나야 정리합니다. 이 기간은 법정 보존기간이 아니라
유효한 서명 token이 남아 있을 수 있는 최대 시간과 clock skew를 고려한 기술적
안전 invariant입니다.

API startup은 persistent auth repository에서 이 cleanup을 한 번 수행하고, 운영
maintenance plane에서는 `services/api/scripts/cleanup_auth_records.py`를 schedule할
수 있습니다. 이 작업은 token hash와 시각만 비교하며 email·workspace·raw token을
출력하지 않습니다. inventory, receipt, business audit, receipt/receive/manual-food
idempotency ledger는 정리하지 않습니다.

## 프론트 사용 흐름

1. 계정 화면의 `영수증 원본 관리`에서 workspace receipt summary를 읽습니다.
2. 사용자는 원본 bytes가 저장되지 않는다는 정책과 현재 receipt 상태를 확인합니다.
3. `영수증 원본 정보 삭제`를 누르면 대상별 영향 범위를 inline confirmation으로 확인합니다.
4. `삭제 확인` 후 미반영 draft는 목록에서 제거되고, commit receipt는 `원본 정보 삭제됨` 배지가 유지됩니다.
5. commit receipt의 경우 “재고 기록은 유지” 메시지를 보여 업무 기록과 개인정보 metadata의 차이를 설명합니다.

저장 실패가 발생하면 삭제 확인 상태와 receipt summary를 잃지 않고 계정 sheet의 inline alert에서
같은 대상의 `다시 시도`를 누를 수 있습니다. 이미 다른 process가 workspace를 먼저 갱신한 경우에는
최신 상태 확인을 요구해 stale redaction을 덮어쓰지 않습니다.

### 중단된 review 재개

미반영 `review_required` draft는 사용자가 sheet를 닫거나 앱을 다시 열어도 connected
홈의 `검수할 영수증` 카드에서 다시 시작할 수 있습니다. 이 경로는 receipt detail의
상품 line·merchant·template·구매일만 읽습니다. 업로드했던 image/PDF bytes가 서버에
없으므로 원본 미리보기는 복원하지 않으며, 화면에 이를 명시합니다. 사용자가 선택한
line을 확인해 commit하기 전에는 이 재개 조회만으로 inventory lot가 생기지 않습니다.

workspace를 바꾸는 동안 이전 summary 응답이 늦게 도착해도 generation guard가 이를
폐기합니다. 이미 commit됐거나 privacy erase된 draft, 상품 line이 없는 draft는 재개
카드에 노출하지 않고 다시 촬영/선택 안내로 처리합니다.

같은 receipt를 여러 기기나 중복 탭에서 반영하는 경우에도 receipt ID별 commit lock이
프로세스 내부 요청을 직렬화하고, PostgreSQL workspace revision이 프로세스 간 stale
write를 차단합니다. 네트워크 timeout 뒤 동일 key·payload가 재시도되면 저장된
transaction 결과를 replay하고, 다른 payload나 일반 중복 요청은 `409`를 받아 최신
목록을 다시 읽도록 안내합니다. transaction에는 원본 key가 아니라 digest와 payload
fingerprint만 보존합니다. 이는 receipt metadata를 더 오래 보존하는 정책이 아니라,
이미 저장된 draft를 중복 반영하지 않기 위한 write 경계입니다. 실제 normalized
PostgreSQL 재시작 readback은 [receipt commit idempotency readback](../evidence/receipt-commit-idempotency-readback-2026-09-06.md)에
기록했습니다.

## 운영 전 추가해야 할 것

- 실제 배포에서 reverse proxy, object storage, OCR worker 로그, backup, crash dump에 bytes가 남지 않는지 확인
- 계정 전체 삭제와 법정 보존/세금·분쟁 증적 보존의 우선순위를 법무/운영 정책으로 확정
- 개인정보 삭제 요청의 actor·시각·대상·결과를 별도 감사 log에 남기되 원문을 다시 기록하지 않기
- 계정 삭제 요청의 actor·시각·workspace·결과를 별도 audit으로 남길지 법무·운영 정책으로 확정
- PostgreSQL normalized table, read replica, backup/WAL, Grocy 외부 시스템의 retention/삭제 범위 합의
- 실제 운영 환경에서 삭제 후 재시작·replica·backup 복구 시나리오 검증

현재 구현은 로컬 SQLite/PostgreSQL compatibility state의 receipt metadata 비식별화와
account workspace purge 계약을 증명하며, 법적·운영적 완전 삭제 인증을 의미하지
않습니다. 실행 결과는 [privacy lifecycle readback](../evidence/privacy-lifecycle-readback-2026-09-02.md)와
[account deletion readback](../evidence/account-deletion-readback-2026-09-03.md)에 기록합니다.
