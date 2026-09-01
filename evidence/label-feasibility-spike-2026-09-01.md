# 식품 라벨 가능성 Spike — 2026-09-01

## 결론

두 라벨 모두 Rescue Meal이 다뤄야 할 입력 유형입니다. 상품 종류·원산지·중량 후보·바코드·원재료·내용량은 읽을 수 있지만, 실제 소비기한은 다음처럼 다뤄야 합니다.

- 1번: `2017.06.28`은 왼쪽 `(포장)년·월·일` 계열 칸에 보이며, 인접한 `유효 년·월·일` 칸은 비어 있는 것으로 보입니다. 이 날짜를 소비기한으로 확정하면 안 됩니다.
- 2번: 제품명·내용량·고형량·원재료·바코드는 보이지만 사진에 소비기한 숫자가 보이지 않습니다. 다른 면·뚜껑·용기 끝부분 촬영을 요청해야 합니다.
- 소비기한과 보관방법은 OCR 문자열만으로 확정하지 않고, 라벨의 항목명과 값의 위치를 함께 해석한 후 사용자가 확인해야 합니다.

## 실행 환경과 경계

- 실행일: 2026-09-01
- OCR: macOS Vision `VNRecognizeTextRequest`, accurate, `ko-KR` + `en-US`
- 이미지 전처리: 1번 원본 OCR, 2번 원본 및 라벨 crop/upscale OCR
- PaddleOCR: 설치되지 않아 `not_run`
- GS1 parser: `not_run`
- Open Food Facts: 2번 바코드 `8801075011678` product not found
- 원본 이미지: 프로젝트에 복사하지 않음

이 문서는 사진의 구조·실패 형태를 확인한 가능성 spike입니다. 소비기한 판정, 식품 안전 판정, 최종 OCR 성능, 실제 사용자 입력 성공률을 증명하지 않습니다.

## 샘플 식별자

| 샘플 | 해상도 | SHA-256 |
|---|---:|---|
| produce-label-1 | 580×387 | `d480dbe08ae4b1adc514842ca1db9d55f557a85db27dbc376970d9828dc14477` |
| packaged-label-2 | 1000×1000 | `c328413d6f4ddeb170c9022603b3e4c666b67f96440b6a9b6109b732b4557ce0` |

## 샘플 1 — 농산물 가변중량 라벨

### 시각적으로 확인한 정보

- 품목군: `채소류`
- 원산지: `국내산`
- 날짜 후보: `2017.06.28`
- 바코드 숫자열: `2 308490 023003` 형태
- 품번 후보: `101`
- `2300` 숫자값이 보임
- 라벨에는 `100g당(원)`, `중량(g)`, `(포장)년·월·일`, `유효 년·월·일` 계열의 열 제목이 있음

왼쪽 날짜는 포장 또는 가공 날짜 칸에 있고, 인접한 유효 날짜 칸에는 값이 보이지 않습니다. 현재 이미지로는 `2017.06.28`을 `use_by`로 분류할 근거가 없습니다.

### OCR 결과

- OCR text observation: 12개
- `채소류 [국내산]` 인식
- `2017.06.28` 인식
- `2300` 인식
- 바코드 숫자열을 여러 조각으로 인식
- 작은 녹색 열 제목은 일부만 인식

### 바코드 해석

첫 숫자가 `2`인 13자리 형태는 일반 글로벌 GTIN으로 단정하지 않습니다. GS1은 `20`~`29` 등의 Restricted Circulation Number를 지역·회사·가변중량 상품 같은 제한된 환경에 사용할 수 있다고 설명합니다. 가변중량 상품 바코드는 상품 식별자와 가격 또는 중량 같은 변동 데이터를 포함할 수 있지만, 실제 구조는 지역·매장 규칙에 따라 달라집니다. [GS1 General Specifications](https://ref.gs1.org/standards/genspecs/), [GS1 Variable Measure Trade Item](https://support.gs1.org/support/solutions/articles/43000734396-what-is-a-variable-measure-trade-item-)

따라서 이 바코드는 다음처럼 저장합니다.

```text
barcode_type: restricted_circulation_or_store_variable_measure
raw_scan: preserved
gtin: null
store_item_code: unresolved
weight_or_price: review_required
```

Open Food Facts에 글로벌 GTIN으로 조회하지 않고, 매장별 구조를 알 때만 품번·중량·가격으로 분해합니다.

### MealRescue 처리

```text
가변중량 라벨 감지
→ 품목·원산지·날짜 후보·중량/가격 후보 표시
→ 날짜 필드명을 사용자가 확인
→ 소비기한 값이 없으면 date assertion 생성 안 함
→ 구매일과 보관 위치만으로 estimated_use_first 생성 가능
→ 추정값은 실제 소비기한으로 표시하지 않음
```

사용자 확인 화면 예시:

```text
2017.06.28은 어떤 날짜인가요?

( ) 포장일
( ) 가공일
( ) 소비기한
( ) 잘못 읽음
( ) 모르겠음
```

## 샘플 2 — 가공식품 포장 라벨

### 시각적으로 확인한 정보

- 2D 또는 1D 상품 바코드: `8801075011678`
- 제품명 영역
- 내용량 후보: `100g`
- 고형량 후보: `70g`
- 원재료명과 함량 비율
- 알레르기·고객상담·제조원 관련 텍스트 후보
- 재활용 표기
- 사진에는 소비기한 숫자 영역이 보이지 않음

### OCR 결과

원본 전체 사진의 실제 라벨 영역이 작고 주변 여백이 넓어 OCR은 5개 text block만 반환했습니다. 라벨 영역을 crop하고 2배 이상 확대해도 다음 정도만 안정적으로 남았습니다.

- `리드: OTHER`
- 제품 설명 일부
- `100g`, `70g` 계열 내용량 후보
- `8 801075 011678` 바코드
- 제조원·고객상담 문장 일부

원재료 전체를 정확히 구조화하거나 소비기한을 찾았다고 주장할 수 없습니다. 작은 글씨가 많은 포장 라벨은 전체 촬영보다 라벨 면을 화면 가이드로 맞추게 해야 합니다.

### Open Food Facts 조회

```text
barcode: 8801075011678
API: Open Food Facts v3.6
result: product_not_found
```

이 상품은 외부 상품 DB 조회에 의존할 수 없습니다. 라벨 OCR과 사용자 확인을 primary path로 둡니다.

### MealRescue 처리

```text
바코드 읽기
→ product lookup 시도
→ 실패하면 라벨 OCR
→ 제품명·내용량·고형량·원재료 후보 표시
→ 소비기한이 없으면 "다른 면 촬영" 안내
→ 소비기한 확인 후에만 DateAssertion 생성
```

제품 포장 앞면과 뒷면을 따로 촬영해도 두 이미지를 하나의 `label_session`으로 묶을 수 있게 설계합니다.

## 설계 변경

1. 일반 영수증과 별도로 `produce_label`·`packaged_label`·`restaurant_receipt`·`retail_receipt` 문서 유형을 둡니다.
2. 첫 숫자가 `2`인 가변중량 후보 바코드는 글로벌 product lookup 전에 매장 라벨 parser로 보냅니다.
3. 라벨 촬영은 전체 사진이 아니라 날짜·바코드·원재료 영역별 guided capture로 나눕니다.
4. 날짜 후보와 날짜 의미를 함께 추출하되, 의미가 불확실하면 `unknown`으로 둡니다.
5. 소비기한이 보이지 않으면 빈 날짜를 자동 생성하지 않고 추가 촬영 task를 만듭니다.
6. 바코드 조회 실패는 정상적인 fallback 경로이며 제품 신규 생성으로 바로 확정하지 않습니다.
7. 100g당 가격·중량·총가격처럼 열 제목이 섞일 수 있는 라벨은 숫자만 읽지 않고 열 좌표와 제목을 함께 검토합니다.
8. 원재료·알레르기 정보는 1차 MVP의 재고 날짜 판정과 분리하고, 이후 검색·주의 표시 기능으로 확장합니다.

## 현재 validation claim

- 이미지 육안 확인: 완료
- 원본 OCR: 완료
- 라벨 crop/upscale OCR: 완료
- 농산물 라벨의 포장일·유효일 열 분리 필요성: 확인
- 가변중량·매장용 바코드 가능성: 확인
- 가공식품 바코드 readback: 완료
- Open Food Facts `8801075011678`: product not found 확인
- PaddleOCR: `not_run`
- GS1 Syntax Engine: `not_run`
- 소비기한 자동 판정: `not_run`
- 실제 신선식품 보관·폐기 결과: `not_run`

