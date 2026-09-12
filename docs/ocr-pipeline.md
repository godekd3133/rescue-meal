# OCR intake pipeline

기준일: 2026-09-05

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

## Worker liveness·readiness·부하 경계

전용 worker는 프로세스 생존과 모델 사용 가능 여부를 분리합니다.

- `GET /health`는 모델을 import·다운로드·초기화하지 않는 liveness endpoint입니다. `worker_state`가 `not_initialized`, `ready`, `unavailable` 중 하나로 표시되고, 기존 호환 필드인 `available`도 함께 반환합니다.
- `GET /ready`는 첫 호출에서 PaddleOCR 초기화를 한 번만 수행한 뒤, 실제 `predict()` generator를 작은 합성 PNG에 실행하는 warm-up까지 통과한 경우에만 `200`과 `status=ready`를 반환합니다. 모델 객체 생성은 성공해도 첫 추론에서 runtime/backend 오류가 날 수 있으므로 이 단계가 필요합니다. 초기화·warm-up에 실패하면 내부 exception을 외부에 노출하지 않고 `503`으로 닫습니다. 따라서 Compose의 worker healthcheck는 `/ready`를 사용하고, API는 실제 추론 가능한 worker 뒤에 시작합니다.
- PaddleOCR는 기본 CPU 경로에서 process당 동시 추론 1건으로 제한합니다. `RESCUE_MEAL_OCR_MAX_CONCURRENCY`는 1~8 범위에서 명시적으로 조정할 수 있고, 대기열은 `RESCUE_MEAL_OCR_QUEUE_TIMEOUT_SECONDS`(기본 2초)를 넘기면 `503`으로 빠르게 종료합니다. scale-out은 이 값을 무작정 높이기보다 worker replica와 실제 latency·메모리 benchmark로 결정합니다.
- 업로드는 계속 파일당 10MB 이하로 제한하며, OCR 결과가 없거나 worker가 unavailable이면 API는 review/수동 입력 경계를 유지하고 상품·소비기한을 자동 확정하지 않습니다.

PaddleX 모델 cache는 Compose volume에 유지되므로 최초 `/ready`가 모델을 준비하는 시간과 이후 warm readiness 시간을 별도로 측정해야 합니다. 현재 pinned `paddlepaddle==3.3.1`의 PyPI Linux CPU wheel은 `x86_64` 대상이므로 Docker worker는 `linux/amd64`를 명시하고, PaddleOCR 3.x의 CPU 실행은 `enable_mkldnn=False`로 고정해 실제 warm-up 경로를 검증합니다. Apple Silicon Docker Desktop에서는 emulation으로 실행할 수 있지만, production은 amd64 node 또는 별도 검증된 ARM runtime을 선택해야 합니다 ([PaddlePaddle 3.3.1 package files](https://pypi.org/project/paddlepaddle/3.3.1/)). 이 경계는 모델의 한국어·매장별 정확도를 증명하는 것이 아니며, 실제 receipt/label annotation benchmark와 실기기 촬영 acceptance가 별도입니다.

CI의 `ocr-worker` job은 동일한 lockfile로 worker unit을 실행하고 `linux/amd64` Docker image build를 수행합니다. 이는 image가 만들어지는지 확인하는 계약이며, GitHub Actions 성공 전에는 CI 통과를 현재 환경의 live readiness 증거로 승격하지 않습니다.

## 모바일 촬영·사진 선택 입력

영수증과 라벨 intake는 같은 파일 처리 handler에 두 가지 입력 경로를 제공합니다.

- `카메라로 촬영`: `getUserMedia`에 `facingMode: { ideal: "environment" }`와 문서 촬영에 적합한 해상도 힌트를 전달하고, 화면 안에 영수증 전체·날짜 면 프레이밍 가이드를 보여줍니다. 촬영 시 video frame을 JPEG `File`로 만들어 같은 handler에 전달합니다.
- `사진에서 선택`: 카메라 권한을 거부했거나 데스크톱·갤러리에서 이미지를 고른 경우의 fallback입니다. 카메라 surface가 열리지 않아도 같은 화면에서 선택할 수 있습니다.
- 두 경로 모두 동일한 EXIF 정규화·품질 gate·OCR·review 흐름을 통과하며, 사용자가 확인하기 전에는 재고에 반영하지 않습니다.
- 권한 거부·브라우저 미지원·장치 사용 중 상태는 `카메라를 사용할 수 없어요`와 사진 선택 fallback으로 복구합니다. receipt OCR 실패는 idle 입력 화면으로 돌아가 재촬영·재선택할 수 있고, label OCR 실패는 같은 화면에서 다시 입력할 수 있습니다. label sample은 개발·데모 확인용 보조 경로로만 제공합니다.

`getUserMedia`의 `facingMode`와 해상도는 카메라 선택·품질을 위한 요청값이지 카메라 권한 승인이나 사진 품질 보증이 아닙니다. 실제 iOS/Android에서 후면 렌즈 선택, 권한 거부, 회전·반사·저조도 촬영을 확인하기 전에는 카메라 입력이 운영 검증을 통과했다고 말하지 않습니다.

## 이미지 품질 gate

API는 OCR 전에 Pillow 기반 gate를 실행합니다. 현재 검사값은 EXIF 방향 보정 여부, 해상도, 밝기 평균, grayscale 대비, FIND_EDGES 윤곽 에너지, GaussianBlur 대비 focus(`blur_score`), 극단적인 종횡비입니다.

- 짧은 변이 320px보다 작거나 이미지 decode가 실패하면 `failed + quality.reject`로 종료
- 어둡거나 과노출·저대비·윤곽 약함은 `quality.review_required` warning을 붙이고 review를 유지
- 초점이 지나치게 약하면 `blur_score` warning을 붙여 휴대폰 고정·재촬영을 안내하고, 이미지 자체를 임의 OCR 결과로 대체하지 않음
- 스마트폰 EXIF orientation이 있으면 품질 측정과 OCR worker 입력만 표준 방향으로 정규화하고, 업로드 원본의 SHA-256은 변경하지 않음
- 품질 gate가 `pass`여도 OCR 결과와 상품 매칭은 별도로 review할 수 있음
- 품질 점수는 안전 판정이 아니며 재촬영 안내를 위한 입력 품질 신호임
- PaddleOCR local adapter와 remote worker의 bbox는 API 경계에서 bottom-left normalized 좌표로 검증·clip합니다. 이미지 가장자리를 일부 벗어난 box는 보이는 영역만 review overlay에 전달하고, 폭·높이가 없거나 비유한 값인 box는 버립니다. 이는 상품·날짜 위치를 그릴 수 있는 범위의 계약이지 OCR 정확도나 식품 안전을 보증하는 값이 아닙니다.

## OCR 입력 보정 profile

이미지 품질 gate가 `review_required`를 반환하면서 grayscale 대비가 12
미만이거나 밝기 평균이 25 미만이면, API는 방향을 먼저 정규화한 OCR 입력에
Pillow `autocontrast`와 제한된 contrast enhancement를 적용합니다. 응답의
`ocr_input_profile`은 `low_contrast_enhanced`가 되고, 조건에 맞지 않거나
보정할 수 없는 입력은 `source`로 남습니다.

- 파일 SHA-256과 브라우저의 원본 `blob:` preview는 보정하지 않습니다.
- 출력 PNG는 원본의 가로·세로를 유지하므로 기존 observation bbox 좌표 계약을
  바꾸지 않습니다.
- 흐림·반사·원근 왜곡·잘림은 대비 조정으로 복구됐다고 가정하지 않습니다.
  해당 warning은 그대로 두고 사용자가 다시 촬영해야 합니다.
- PaddleOCR의 `UVDoc` 문서 펴기는 변환 전후 homography와 원본 overlay 좌표를
  함께 보존하는 adapter가 준비되기 전까지 자동 경로에 넣지 않습니다. 출력
  이미지만 바뀐 상태에서 원본 preview에 bbox를 그리면 날짜·상품 위치가
  어긋날 수 있기 때문입니다.

이 profile은 인식률 향상을 시도했다는 provenance이며, OCR 정확도·소비기한·
식품 안전을 보증하는 결과가 아닙니다. 실제 accuracy uplift는 매장별 receipt/
label annotation benchmark에서 source 대비를 별도로 측정해야 합니다.

## API

### 영수증 이미지·PDF intake

```text
POST /api/receipts/intake
Content-Type: multipart/form-data
field: file
```

입력 파일이 텍스트 레이어를 가진 PDF이면 API는 이미지 품질 gate나
PaddleOCR를 호출하지 않고 `pypdf` text-layer adapter를 사용합니다. 각 페이지의
추출 line을 기존 receipt parser observation으로 바꾸고, 상품명·수량·금액 후보를
동일한 review draft 계약으로 전달합니다. PDF 원본은 서버에 저장하지 않고 기존과
같이 SHA-256과 source metadata만 유지합니다.

PDF text extraction은 line parsing에는 사용할 수 있지만 안전한 source-location
bbox 계약을 제공하지 않으므로 `review_observations`는 비워 둡니다. 웹은 PDF 원본을
임시 `blob:` URL로 preview하고, line 위치 강조 대신 “PDF 원본과 추출 결과를 함께
확인”하도록 안내합니다. pypdf의 `PdfReader`는 file-like stream을 받고 page별
`extract_text()`를 제공하지만, 이미지로만 된 스캔 PDF에는 유효한 text layer가
없을 수 있으므로 그런 파일을 상품 line으로 추정하지 않습니다.

암호화·손상은 `needs_ocr_engine` 또는 `failed`로 명시합니다. 텍스트 레이어가
없는 scan PDF는 최대 3쪽을 `pypdfium2`로 scale 2 PNG로 렌더링한 뒤 기존
PaddleOCR adapter에 전달합니다. renderer 또는 OCR engine이 없으면 상품 line을
만들지 않고 재입력/OCR 필요 상태로 남깁니다. page-local OCR bbox는 원본
multi-page PDF의 safe overlay로 사용하지 않습니다. 3쪽을 초과하는 scan PDF는
앞부분만 잘라 성공시키지 않고 page quota 오류로 중단합니다. Docling은
layout/table과 다중 페이지 의미 보존을 위한 별도 후속 후보입니다.

응답 상태:

- `review_required`: OCR과 parser가 draft를 만들었지만 아직 재고로 반영하지 않음
- `needs_ocr_engine`: PaddleOCR runtime/model이 없어 처리하지 않음
- `failed`: OCR 실행 또는 결과 구조화 실패

원본 파일 자체는 현재 MVP에서 저장하지 않고 SHA-256만 응답합니다. 운영판에서는 retention·삭제·개인정보 마스킹 정책을 먼저 확정해야 합니다.

이미지 intake가 `review_required`가 되면 `review_observations`에는 상품 line에
연결된 observation만 포함합니다. 각 observation은 `obs-N` ID, 0~1 정규화
`[x, y, width, height]` bbox, confidence를 가지며 OCR `text`는 포함하지 않습니다.
`draft.lines[].source_observation_ids`가 이 ID를 line과 연결하므로 웹 review는
사용자가 상품 항목을 선택했을 때 업로드 원본 위에서 해당 위치를 강조할 수 있습니다.
전화번호·주소·결제 정보가 상품 line이 아닌 경우 이 payload에 포함되지 않으며,
원본 이미지 bytes도 저장하지 않습니다. normalized PostgreSQL 모드에서는 migration
`010_receipt_review_locations.sql`이 line 연결 ID를 보존하지만, 저장된 draft만으로
원본 preview를 다시 만들 수 있다는 뜻은 아닙니다.

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

### 영수증 review 보정과 commit

웹 review 화면은 OCR line의 표시 문자열을 다시 해석하지 않고, 다음 값을 별도 필드로 유지합니다.

| 필드 | 의미 | commit 시 처리 |
| --- | --- | --- |
| `raw_name` | OCR이 읽은 원문 | 원문으로 보존 |
| `canonical_name` | 화면에서 확인·수정한 상품명 | 사용자 확인값으로 lot에 기록 |
| `quantity` | 사용자가 확인한 수량 | `0` 이하·숫자 아님은 commit 차단 |
| `unit` | 사용자가 확인한 단위 | 빈 단위는 commit 차단 |
| `total_price` | 영수증 금액 | 재고 수량 계산과 분리 |
| `storage_type` | 상품명 기반 추천을 사용자가 확인·수정한 보관 위치 | `ambient`·`refrigerated`·`frozen` 중 하나로 lot와 추정 우선순위에 반영 |

`review_status=pending`인 line은 상품명 보정값이 없는 상태로 commit하지 않습니다. 프론트는 `확인 필요` line의 편집창을 자동으로 열고, 선택된 line에 대해서만 `canonical_name`, `quantity`, `unit`, `storage_type` override를 `POST /api/receipts/{receipt_id}/commit`에 보냅니다. 서버는 override의 상품명 길이·수량·단위·보관 코드를 다시 검증하므로 UI 검증을 우회한 요청도 빈 canonical 상품명이나 유효하지 않은 수량으로 lot를 만들 수 없습니다.

보관 위치는 상품명 기반의 초기 추천일 뿐이며 안전 판정이 아닙니다. 사용자가 line별 보관 위치를 확인하면 서버는 해당 값을 lot에 저장하고, 날짜가 없는 상품의 `estimated_use_first_window`를 같은 보관 기준으로 계산합니다. 예를 들어 같은 버섯이라도 `ambient`와 `refrigerated`는 서로 다른 참고 범위를 가질 수 있습니다. 기존 표시 날짜가 있는 lot를 보관 위치 변경으로 소비기한으로 바꾸거나 덮어쓰지는 않습니다.

영수증에 `purchased_at`이 있으면 해당 구매일을 우선순위 inference의 `reference_date`로 사용합니다. 이후 날짜가 없는 lot를 개봉하면 최초 `opened` event의 `occurred_at`에서 파생한 `opened_at` 날짜를 개봉 후 우선순위의 기준으로 우선 사용합니다. 따라서 며칠 전 구매한 receipt를 오늘 구매한 것처럼 다시 계산하지 않고, 구매 후 한참 지나 개봉한 식품도 개봉 시점을 잃지 않습니다. 구매일·개봉일이 모두 없을 때만 서버의 현재 기준일을 사용하며, 이 결과도 소비기한 확정이 아닌 참고용 우선순위입니다.

이 보정은 소비기한 확인이 아닙니다. 영수증에서 소비기한을 읽을 수 없는 경우에는 구매일과 상품명만 기록하고 날짜 assertion은 `unknown`/`estimated_use_first` 경계를 유지합니다. 소비기한은 포장지 라벨 intake 또는 사용자의 명시적 날짜 확인으로 별도 확정해야 합니다.

원본 대조 preview와 line 선택 상태는 안전한 위치 metadata만 사용합니다. 실제
매장별 annotation과 비교한 bbox 정확도, 라벨의 소비기한/포장일 영역 overlay는
receipt 상품 line overlay와 별도의 acceptance 대상입니다. 현재 구현과 브라우저
readback은 [receipt bbox overlay readback](../evidence/receipt-bbox-overlay-readback-2026-09-03.md)을 따릅니다.

### 라벨 parser 독립 검증

```text
POST /api/labels/parse-text
{
  "source_filename": "label-from-ocr.txt",
  "ocr_text": "제품명: 두부\\n소비기한 2026.09.02"
}
```

날짜 candidate의 `kind`는 `use_by`, `sell_by`, `best_before`, `production_date`, `packaging_date`, `unknown` 중 하나이며, API 필드명은 `consumption_date_candidate`입니다. 라벨에서 `냉장·냉동·실온` 보관조건을 읽으면 `storage_hint`와 `storage_condition_text`로 함께 반환해 review 화면에서 사용자가 실제 보관 위치를 확인할 수 있게 합니다.

- `소비기한`, `유효년월일`, `유효기간`이 명시된 경우에만 소비 날짜 후보로 승격
- 의미가 명확해도 OCR 결과는 `review_required`로 남기며, 사용자가 값·crop을 확인해야 확정 가능
- `포장일`, `제조일`, `생산일`은 소비기한으로 바꾸지 않음
- `(포장)년·월·일`과 `유효년·월·일`이 인접해 좌표 없이 의미를 고를 수 없으면 `unknown` + review. OCR이 heading·값을 서로 다른 observation/줄로 반환해도 날짜 주변의 넓은 내부 문맥에서 두 의미를 함께 검사하며, 응답 context 노출 범위는 별도로 제한함
- 날짜가 전혀 없으면 추가 면 촬영 경고
- 첫 숫자가 2인 가변중량/매장용 바코드는 글로벌 GTIN으로 확정하지 않음. `2`와 뒤 payload가 서로 다른 OCR 줄로 분리된 경우도 보류함
- 라벨 보관조건은 날짜 assertion의 `applicable_storage_type`·`storage_condition_text`로 저장하며, 실제 위치가 달라도 날짜를 자동 변경하지 않고 상세에서 불일치만 경고

실제 첨부 농산물·가공식품 라벨을 `worker → API → parser`로 다시 넣은 결과와
초기 오판 원인·회귀 테스트는 [OCR label safety readback](../evidence/ocr-label-safety-readback-2026-09-05.md)에
기록했다.

이미지 라벨 intake에서 날짜 후보를 구성한 observation은 receipt와 같은 safe
source-location contract로 연결할 수 있습니다. API는 날짜 candidate에
`source_observation_ids`를 붙이고 `review_observations`에 해당 observation의
정규화 bbox·confidence만 반환합니다. 날짜 숫자가 한 observation에 그대로
포함되거나 보수적인 split year/month/day 매칭에 성공한 경우에만 link를 만들며,
매칭할 수 없으면 빈 배열을 유지합니다. `text`는 overlay payload에 포함하지
않으므로 사용자는 원본 라벨 preview를 보면서 날짜 의미를 직접 확인합니다.

웹 라벨 review는 업로드한 파일의 transient `blob:` preview를 실제 aspect ratio로
렌더링하고 날짜 후보 위치를 강조합니다. 이 위치 강조는 후보 확인을 돕는 UX이지,
OCR 날짜의 정확도나 소비기한의 법적·식품안전상 확정을 의미하지 않습니다.

날짜 의미가 `unknown`이거나 라벨에서 보관조건을 읽지 못한 경우에도 후보 숫자를
버리지 않고 review card로 유지합니다. 사용자는 원본 preview를 보면서 `제조일`,
`포장일`, `소비기한`, `유통기한`, `품질유지기한` 중 하나와 실제 보관 위치를
명시적으로 선택해야 `확인 후 반영`을 누를 수 있습니다. 날짜 종류 또는 보관 위치가
비어 있으면 저장 버튼은 비활성화되며, 시스템이 `냉장`을 기본값으로 채우지 않습니다.
따라서 `unknown`은 재촬영만 강제하는 막다른 오류가 아니라 사용자가 의미를 보완할
수 있는 검수 상태이고, 최종 commit 전에는 여전히 사용자 확인 gate가 남습니다.
웹 상태 전환과 연결형 browser readback은 [label review UI readback](../evidence/label-review-ui-readback-2026-09-06.md)에
분리해 기록합니다.

모바일 카메라·사진 보관함 입력과 OCR 실패 후 재촬영 경로의 브라우저 readback은
[capture input readback](../evidence/capture-input-readback-2026-09-03.md)을 따릅니다.

### 이미지 intake의 안전한 실패

현재 `PaddleOcrEngine`은 지연 초기화합니다. 서버 부팅 때 모델을 다운로드하지 않으며, 첫 intake 요청에서만 optional dependency를 확인합니다.

실제 worker 응답에는 `model_version: PP-OCRv5_mobile_det+korean_PP-OCRv5_mobile_rec`가 포함되어 API draft와 함께 어느 모델이 읽었는지 추적할 수 있습니다. worker는 source pixel budget과 2,048px max-side preprocessing을 적용해 실제 사진의 메모리 사용을 제한합니다.

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

- 상품명·보관 위치·개봉 여부·첫 개봉일을 입력으로 받음
- 검토된 rule snapshot의 ID와 reasoning을 함께 반환
- `estimated_use_first_window`만 생성
- 추정 window가 생성되면 provider/version/rule/evidence/reasoning과 비민감 input hash를 trace로 보존
- `requires_confirmation: true`를 항상 유지
- 모르는 상품·보관 위치 누락·지원하지 않는 조합은 abstain
- 소비기한·안전 판정·`safe_to_eat` 필드를 만들지 않음

기본 provider는 `rule-assisted-backend-inference`이며 내부 재고 mutation도 이
결정적 경로를 사용합니다. `RESCUE_MEAL_INFERENCE_PROVIDER=ollama`를 명시한
경우에만 `/api/inference/priority`의 규칙 미매칭 요청이 private network의
Ollama `/api/chat`으로 fallback됩니다. Ollama structured output JSON Schema를
Pydantic으로 다시 검증하고, 모델에는 기준일이 아닌 개봉 전 일수 범위만
요청합니다. 서버가 기준일·개봉일을 적용해 날짜 범위를 계산하므로 모델 응답이
표시 날짜를 직접 만들 수 없습니다.

Ollama 경로도 다음을 보장합니다.

- 모델 출력은 `canonical_name`, category, 보관 후보, 개봉 전 일수 범위, confidence, abstain만 허용하며 extra field는 거부
- 모델 confidence는 0.75 이하로 cap하고 `requires_confirmation=true`를 유지
- 보관 위치가 없거나 범위·JSON Schema·HTTP 응답이 잘못되면 추정하지 않고 `abstained=true`로 반환
- 모델 장애는 5xx가 아니라 review용 보류 응답으로 degrade하며, 내부 lot 생성·보관 이동은 모델 호출과 분리
- 모델 설명은 안전 판정 근거로 승격하지 않고, `model:ollama/{model}`·`model-output:unverified` provenance만 남김
- product name은 untrusted data로 prompt에 넣으며 receipt 원문·이미지·개인정보를 모델로 보내지 않음

Ollama 연동은 모델이 실제 식품 보관 기간을 안다는 증거가 아닙니다. 모델을 켜기
전에는 한국 식품 category·포장 상태·개봉 상태를 포함한 별도 annotation benchmark와
관할 출처 검토가 필요하며, 운영 기본값 `rules`를 유지합니다. Ollama의 `/api/chat`
structured output과 JSON Schema 지원은 [공식 문서](https://docs.ollama.com/capabilities/structured-outputs)에
맞춘 adapter입니다.

이미지 intake의 quality response에는 `orientation_corrected`가 포함됩니다. 이 값은
OCR 입력 전 방향을 보정했다는 처리 기록이며, OCR 정확도나 식품 안전을 보증하는
점수가 아닙니다. EXIF 보정에 실패하거나 이미지가 해석되지 않으면 원본 bytes를
사용하되 기존 quality reject/engine 상태를 유지합니다.

현재 rule snapshot은 제품 안전 데이터베이스로 승인된 상태가 아니라 개발용 reference priority입니다. 운영판에서는 MFDS 등 관할 출처, 제품 category, 포장 상태, 실제 표시 날짜를 함께 검증한 뒤 rule version을 승격해야 합니다.

## 현재 테스트 fixture

- `services/api/tests/test_pipeline.py`
  - 금액 행 결합
  - 할인/합계 line 분리
  - 식당 영수증 분리
  - 인접 날짜 열의 의미 불명확 처리
  - 명시적 소비기한과 상품 코드 분리
  - 사장님 제공 라벨 구조를 비식별화한 신선식품 ambiguous-date fixture
  - 날짜 없는 가공식품의 일반 EAN과 냉동 보관 hint fixture
- `services/api/tests/test_api.py`
  - text parser → draft 생성
  - image upload → optional OCR 부재 상태
  - EXIF orientation image intake → quality provenance·OCR input normalization
  - review 전 재고 side effect 없음
  - 실제 표시 날짜 보존

라벨 fixture의 원본 이미지·OCR 원문 전체는 저장하지 않으며, 구조 검증 결과는
[sanitized label fixture readback](../evidence/label-fixture-readback-2026-09-05.md)에
기록합니다.

## 운영판으로 가기 위한 남은 작업

1. PaddleOCR worker의 모델·CPU runtime·`linux/amd64` target·`enable_mkldnn=False`·실제 predict warm-up gate는 고정했다. 다음은 실제 receipt/label annotation benchmark와 cold/warm latency·memory 기준선을 만든다.
2. Pillow/OpenCV 품질 gate를 추가해 잘림·흐림·반사·기울기를 OCR 전에 분류한다.
3. OCR observation의 bbox와 review UI의 필드를 직접 연결한다. 현재 receipt image intake에서 상품 line별 safe observation ID/bbox를 반환하고, 원본 preview 위에서 선택 line을 강조하는 단계까지 구현했다. 실제 매장 annotation을 이용한 위치 정확도 검증과 label/date 필드 overlay는 별도 acceptance다.
4. 매장별 영수증 layout fixture와 정답 annotation을 만든다.
5. 원본 이미지 저장 암호화·보존 기간·삭제 API·개인정보 마스킹을 구현한다.
6. 실제 날짜는 `DateAssertion`으로, 규칙 기반 소비 우선순위는 `estimated_use_first_window`로 저장한다.
