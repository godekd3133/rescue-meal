# Receipt draft idempotency readback

검증일: 2026-09-07  
대상: `POST /api/receipts/drafts`,
`services/api/app/main.py`,
`services/api/scripts/postgres_receipt_draft_idempotency_smoke.py`

## 발견한 문제

receipt commit에는 durable `Idempotency-Key` ledger가 있었지만, OCR
결과를 review draft로 만드는 endpoint는 같은 요청을 다시 받으면 새 receipt
ID를 만들었습니다. 모바일 network retry·중복 탭·앱 재진입이 pending review
목록에 같은 영수증을 여러 번 남길 수 있는 상태였습니다.

기존 draft fingerprint도 source filename·raw line·quantity·total만 사용해
매번 `image.jpg`로 저장되는 다른 구매를 같은 fingerprint로 볼 가능성이
있었습니다.

## 구현

- fingerprint를 validated `ReceiptDraftRequest` 전체의 canonical JSON으로
  계산하도록 확장했습니다. 구매일·매장명·template metadata·line unit/type/
  canonical name/barcode/provenance까지 포함합니다.
- fingerprint별 process-local `RLock`으로 같은 process의 중복 생성
  window를 직렬화합니다. lock registry는 `WeakValueDictionary`를 사용해
  완료된 fingerprint가 프로세스 수명 동안 누적되지 않습니다.
- 같은 workspace에 동일한 미완료 draft가 있으면 새 ID 대신 기존 draft를 반환하고
  `X-Idempotency-Replayed: true`를 설정합니다.
- 이미 commit된 현재 fingerprint는 `409`로 차단합니다.
- 과거 fingerprint와의 호환은 legacy hash뿐 아니라 persisted draft의 실제
  안전 metadata·line field까지 대조합니다. 현재 full fingerprint는 hash 자체를
  동일성 증거로 사용해 normalized loader에 없는 과거 review metadata 때문에
  정상 replay가 실패하지 않도록 했습니다.
- PostgreSQL process 간 동시 요청에서 revision 패배 process가 최신 snapshot을
  reload한 뒤 승자의 draft를 반환합니다.
- flush가 일반 실패하면 snapshot을 복원해 DB에 없는 process-local phantom
  draft가 다음 요청에서 반환되지 않게 합니다.
- 이 기능은 draft를 재사용할 뿐이며 review·보관 위치 확인·commit 전에는
  StockLot이나 소비기한을 만들지 않습니다.

## API 회귀

- 동일 pending payload 2회 요청: 같은 draft ID, 두 번째 응답 replay header,
  in-memory record 1개
- 구매일이 다른 동일 filename/line 요청: 서로 다른 draft ID 2개
- flush failure: 예외 전달과 phantom receipt 미잔류
- receipt commit 기존 idempotency 회귀 유지
- API 전체: **382 passed**, 7 warnings

## PostgreSQL live smoke

환경:

- disposable `pgvector/pgvector:pg16`
- fresh ordered migration `001→022` with checksum ledger count 22
- 두 개의 단일 worker Uvicorn process
- 하나의 guest token/workspace
- normalized compatibility/domain projection
- API process의 `--lifespan off`; solver cold-start가 동시성 결과를
  가리지 않도록 제한

실행 결과:

```text
PostgreSQL receipt draft idempotency smoke passed:
initial=201 replay=201 unique_draft_ids=1
compatibility_receipts=1 normalized_receipts=1 metadata_preserved=true.
```

같은 payload의 두 HTTP 요청은 서로 다른 API process로 동시에 전송했습니다.
한 요청은 최초 draft를 만들고, 다른 요청은 revision 경합 이후에도 동일 draft를
replay했습니다. DB readback에서 compatibility·normalized receipt 모두 1개였고,
smoke가 생성한 guest workspace는 purge 후 disposable PostgreSQL volume을
종료했습니다.

## 남은 범위

- fingerprint는 요청 dedupe이며, 내용이 실제로 동일한 영수증인지 의미적으로
  판정하지 않습니다. 같은 입력을 다른 receipt로 기록해야 하는 사용 사례는
  새 filename·구매일·매장 정보 등 구분되는 입력이 필요합니다.
- OCR이 다른 결과를 반환한 재촬영은 다른 fingerprint가 될 수 있습니다.
- external object storage, managed PostgreSQL failover, reverse proxy response
  reset, 장기 draft retention policy는 별도 운영 acceptance입니다.
