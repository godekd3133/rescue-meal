# OCR intake pipeline

기준일: 2026-09-01

## 처리 원칙

Rescue Meal의 OCR은 사진을 읽었다는 사실과 식품 재고로 확정할 수 있다는 사실을 분리합니다.

```text
파일 검증
→ OCR engine 실행
→ text + confidence + bbox 보존
→ 문서 유형 판별
→ 영수증 line / 라벨 date candidate 구조화
→ review draft
→ 사용자 확인
→ stock commit
```

현재 환경에는 Python 3.12 PaddleOCR worker가 준비되어 있으며 API는 `RESCUE_MEAL_OCR_URL`로 이를 선택할 수 있습니다. worker가 없거나 연결되지 않으면 파일을 임의의 sample OCR 결과로 바꾸지 않고 `needs_ocr_engine` 또는 명시적인 연결 실패 상태를 반환합니다. OCR text를 이미 가진 경우에는 `parse-text` endpoint로 parser만 독립적으로 검증할 수 있습니다.

## 이미지 품질 gate

API는 OCR 전에 Pillow 기반 gate를 실행합니다. 현재 검사값은 해상도, 밝기 평균, grayscale 대비, FIND_EDGES 윤곽 에너지, 극단적인 종횡비입니다.

- 짧은 변이 320px보다 작거나 이미지 decode가 실패하면 `failed + quality.reject`로 종료
- 어둡거나 과노출·저대비·윤곽 약함은 `quality.review_required` warning을 붙이고 review를 유지
- 품질 gate가 `pass`여도 OCR 결과와 상품 매칭은 별도로 review할 수 있음
- 품질 점수는 안전 판정이 아니며 재촬영 안내를 위한 입력 품질 신호임

## API

### 영수증 이미지 intake

```text
POST /api/receipts/intake
Content-Type: multipart/form-data
field: file
```

응답 상태:

- `review_required`: OCR과 parser가 draft를 만들었지만 아직 재고로 반영하지 않음
- `needs_ocr_engine`: PaddleOCR runtime/model이 없어 처리하지 않음
- `failed`: OCR 실행 또는 결과 구조화 실패

원본 파일 자체는 현재 MVP에서 저장하지 않고 SHA-256만 응답합니다. 운영판에서는 retention·삭제·개인정보 마스킹 정책을 먼저 확정해야 합니다.

### 영수증 parser 독립 검증

```text
POST /api/receipts/parse-text
{
  "source_filename": "receipt-from-ocr.txt",
  "ocr_text": "..."
}
```

`ReceiptDraftResponse`를 반환하며 다음을 포함합니다.

- `grocery_receipt`, `retail_beverage_receipt`, `restaurant_receipt`, `unknown`
- 상품·할인·환불·소계·결제·unknown line type
- raw name, canonical candidate, quantity, price, match confidence
- review status와 review reason
- purchased-at 후보

식당 영수증은 문서 유형을 별도로 유지하고 product line을 자동 재고 입고 가능한 상태로 만들지 않습니다.

### 라벨 parser 독립 검증

```text
POST /api/labels/parse-text
{
  "source_filename": "label-from-ocr.txt",
  "ocr_text": "제품명: 두부\\n소비기한 2026.09.02"
}
```

날짜 candidate의 `kind`는 `use_by`, `sell_by`, `best_before`, `production_date`, `packaging_date`, `unknown` 중 하나이며, API 필드명은 `consumption_date_candidate`입니다.

- `소비기한`, `유효년월일`, `유효기간`이 명시된 경우에만 소비 날짜 후보로 승격
- 의미가 명확해도 OCR 결과는 `review_required`로 남기며, 사용자가 값·crop을 확인해야 확정 가능
- `포장일`, `제조일`, `생산일`은 소비기한으로 바꾸지 않음
- `(포장)년·월·일`과 `유효년·월·일`이 인접해 좌표 없이 의미를 고를 수 없으면 `unknown` + review
- 날짜가 전혀 없으면 추가 면 촬영 경고
- 첫 숫자가 2인 가변중량/매장용 바코드는 글로벌 GTIN으로 확정하지 않음

### 이미지 intake의 안전한 실패

현재 `PaddleOcrEngine`은 지연 초기화합니다. 서버 부팅 때 모델을 다운로드하지 않으며, 첫 intake 요청에서만 optional dependency를 확인합니다.

실제 worker 응답에는 `model_version: PP-OCRv5_server_det+korean_PP-OCRv5_mobile_rec`가 포함되어 API draft와 함께 어느 모델이 읽었는지 추적할 수 있습니다.

```json
{
  "status": "needs_ocr_engine",
  "engine": "paddleocr",
  "observations_count": 0,
  "draft": null
}
```

이 응답은 성공적인 OCR 또는 소비기한 판정을 의미하지 않습니다.

macOS Vision 기준선에서는 observation의 y축 원점과 상품 번호 anchor를 사용해 한 상품 구간을 합칩니다. 단, bbox가 없는 text만으로는 인접한 barcode 조각과 중량 숫자를 안전하게 결합할 수 없으므로 보수적으로 `null + review`를 유지합니다. 실제 첨부 이미지 결과는 [Vision OCR parser benchmark](../evidence/vision-ocr-parser-benchmark-2026-09-01.md)를 확인합니다.

## 바코드와 날짜 없는 상품의 backend inference

바코드는 두 경로로 나눕니다.

- 일반 EAN/GTIN: 상품 식별값만 반환하고 소비기한은 만들지 않음
- GS1 data carrier: AI 11/13/15/16/17을 `DateAssertion` 후보로 변환하되 review를 유지
- 첫 숫자가 2인 코드: 가변중량·매장용 후보로 분리하고 GTIN으로 확정하지 않음

상품명으로 날짜가 없을 때는 `/api/inference/priority`가 `rule-assisted-backend-inference` provider를 사용합니다. 이 provider의 결과는 다음 조건을 가집니다.

- 상품명·보관 위치·개봉 여부를 입력으로 받음
- 검토된 rule snapshot의 ID와 reasoning을 함께 반환
- `estimated_use_first_window`만 생성
- `requires_confirmation: true`를 항상 유지
- 모르는 상품·보관 위치 누락·지원하지 않는 조합은 abstain
- 소비기한·안전 판정·`safe_to_eat` 필드를 만들지 않음

현재 rule snapshot은 제품 안전 데이터베이스로 승인된 상태가 아니라 개발용 reference priority입니다. 운영판에서는 MFDS 등 관할 출처, 제품 category, 포장 상태, 실제 표시 날짜를 함께 검증한 뒤 rule version을 승격해야 합니다.

## 현재 테스트 fixture

- `services/api/tests/test_pipeline.py`
  - 금액 행 결합
  - 할인/합계 line 분리
  - 식당 영수증 분리
  - 인접 날짜 열의 의미 불명확 처리
  - 명시적 소비기한과 상품 코드 분리
- `services/api/tests/test_api.py`
  - text parser → draft 생성
  - image upload → optional OCR 부재 상태
  - review 전 재고 side effect 없음
  - 실제 표시 날짜 보존

## 운영판으로 가기 위한 남은 작업

1. 현재 PaddleOCR worker의 모델·CPU runtime을 운영 이미지에 고정하고 실제 receipt/label annotation benchmark를 만든다.
2. Pillow/OpenCV 품질 gate를 추가해 잘림·흐림·반사·기울기를 OCR 전에 분류한다.
3. OCR observation의 bbox와 review UI의 필드를 직접 연결한다.
4. 매장별 영수증 layout fixture와 정답 annotation을 만든다.
5. 원본 이미지 저장 암호화·보존 기간·삭제 API·개인정보 마스킹을 구현한다.
6. 실제 날짜는 `DateAssertion`으로, 규칙 기반 소비 우선순위는 `estimated_use_first_window`로 저장한다.
