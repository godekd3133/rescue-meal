# PaddleOCR 실제 worker benchmark — 2026-09-01

## 결론

PaddleOCR를 별도 Python 3.12 worker로 설치하고, 사용자가 제공한 영수증 3장·라벨 2장을 실제 multipart upload로 처리했습니다. API 8000의 remote adapter도 같은 worker를 호출하도록 연결했습니다.

```text
PaddleOCR worker health
→ available: true
→ receipt/label 5개 실제 upload
→ observation + normalized bbox 반환
→ Rescue Meal parser
→ review_required draft 또는 날짜 후보
```

이 결과는 현재 Mac arm64 환경에서의 기준선입니다. 모든 한국 마트 영수증에 대한 정확도나 자동 입고 안전성을 증명하지 않습니다.

> 이 문서는 2026-09-01의 historical baseline이며 당시 detection model은
> `PP-OCRv5_server_det`였습니다. 2026-09-05 현재 worker는 실제 사진 처리 시 메모리
> 경계를 확인한 뒤 `PP-OCRv5_mobile_det`으로 변경되었습니다. 최신 runtime/readback은
> [OCR worker readiness readback](ocr-worker-readiness-readback-2026-09-05.md)을
> 기준으로 합니다.

## 실행 환경

- Python: 3.12.2 arm64
- PaddlePaddle: 3.3.1
- PaddleOCR: 3.7.0
- detection model: `PP-OCRv5_server_det`
- recognition model: `korean_PP-OCRv5_mobile_rec`
- worker: `services/ocr-worker`
- worker URL: `http://127.0.0.1:8002`
- API URL: `http://127.0.0.1:8000`
- 원본 이미지: 임시 첨부 경로에서 읽고 프로젝트에 복사하지 않음

모델은 worker 첫 초기화 때 다운로드했고, 이후 cache를 사용했습니다. API와 worker의 blocking inference는 FastAPI threadpool에서 실행합니다.

## 입력 식별자

| 입력 | SHA-256 |
|---|---|
| receipt-1 | `1a4927df5991fb91c43b266b9efb7936525760197e12b50d75f879c2b6189284` |
| receipt-2 | `a3c321bc54ff315974f90c2d4734046eb4d4fdb57e6cdd2ac5d9f89a2bf1dd35` |
| receipt-3 | `dc4af40876432bf4a1fd3af709d8bf3f87412ec5d614cab18715a76bbdd0da7f` |
| produce-label-1 | `d480dbe08ae4b1adc514842ca1db9d55f557a85db27dbc376970d9828dc14477` |
| packaged-label-2 | `c328413d6f4ddeb170c9022603b3e4c666b67f96440b6a9b6109b732b4557ce0` |

## Worker health

```json
{
  "status": "ok",
  "service": "rescue-meal-ocr-worker",
  "engine": "paddleocr",
  "available": true
}
```

## 실제 PaddleOCR 결과

### receipt-1 — 식자재마트

- PaddleOCR observations: 64개
- 문서 유형: `grocery_receipt`
- 구매일 후보: `2018-01-30`
- 상품 anchor grouping: 10개
- 대표 상품 후보: 한라봉, 풀무원찰떡국떡, 한돈등심, 오뚜기 빵가루, 농심 신라면멀티, 흙당근, 안동꿀부사, 하림 IFF 냉동가슴살
- bbox column 기반 수량·단가·금액 분리 실행

### receipt-2 — 음료·주류 판매 영수증

- PaddleOCR observations: 79개
- 문서 유형: `retail_beverage_receipt`
- 구매일 후보: `2025-10-24`
- 상품 candidate: 10개
- 할인 candidate: 6개
- 일부 상품명에 `m|`, 인접 상품명 결합 등 OCR noise가 남아 review/template 보강이 필요

### receipt-3 — 식당 영수증 + 카드전표

- PaddleOCR observations: 60개
- 문서 유형: `restaurant_receipt`
- 구매일 후보: `2018-01-21`
- 식품 재고 자동 입고 차단 경고
- 메뉴·결제·주소가 섞여 있어 leftover quick add 외에는 inventory commit 대상이 아님

### produce-label-1 — 농산물 가변중량 라벨

- PaddleOCR observations: 19개
- 날짜 후보: `2017-06-28`
- 날짜 의미: `packaging_date`
- 확정 소비기한 후보: 없음
- barcode: `null`
- 제한유통/가변중량 barcode 경고

PaddleOCR가 barcode 영역에서 `23084901023003`처럼 보이는 값을 만들 수 있었지만, 품번·중량·barcode 조각이 섞일 수 있어 parser가 글로벌 GTIN으로 반환하지 않습니다.

### packaged-label-2 — 가공식품 라벨

- PaddleOCR observations: 12개
- 제품명 일부 후보 확인
- 소비기한·유통기한 숫자: 없음
- 확정 소비기한 후보: 없음
- barcode: `null` (인식 문자열이 14자리 이상으로 불확실)
- 다른 면·뚜껑 추가 촬영 필요

## API end-to-end 확인

### 영수증 이미지 upload

```text
POST /api/receipts/intake
→ status: review_required
→ engine: paddleocr-remote
→ receipt_kind: grocery_receipt
→ observations_count: 64
→ draft.lines: 10
→ stock_created: false
```

### 농산물 라벨 upload

```text
POST /api/labels/intake
→ status: review_required
→ engine: paddleocr-remote
→ date candidate: packaging_date / 2017-06-28
→ consumption_date_candidate: null
→ barcode: null
→ requires_review: true
```

이미지 upload는 draft만 만들며, review/commit 전에는 재고를 생성하지 않습니다.

프론트 실제 파일 선택 흐름도 확인했습니다.

```text
모바일 프론트에서 receipt-1 선택
→ 영수증을 읽고 있어요
→ API /api/receipts/intake
→ PaddleOCR remote / review_required / 10 lines
→ 화면에서 10개 항목 반영
→ intake가 만든 동일 draft id로 commit
→ dashboard 재조회
→ inventory 7개 → 16개
```

샘플 반영은 실제 첨부 원본을 프로젝트에 저장하지 않고 SQLite preview DB에만 기록했습니다. 운영판에서는 원본 retention·삭제 정책과 OCR review를 함께 적용해야 합니다.

## 현재 claim과 남은 위험

- PaddleOCR worker 설치·health: 완료
- 실제 5개 원본 upload: 완료
- API remote adapter: 완료
- bbox 좌표 표준화: 완료
- 영수증 상품 grouping: 기준선 확인
- 라벨 소비기한 의미 분리: 확인
- 모든 line의 상품명·수량 정확도: 미증명
- OCR confidence와 상품 매칭 confidence 분리: 다음 보강 필요
- 이미지 품질 gate: 미구현
- 실제 운영용 모델 benchmark dataset/annotation: 미구축
- 생산 환경 모델 cache/health/retry: Docker 단계에서 검증 필요
- 소비기한·섭취 가능 판정: 생성하지 않음
