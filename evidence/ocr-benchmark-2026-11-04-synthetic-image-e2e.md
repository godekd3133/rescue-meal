# OCR 추출 벤치마크 — 2026-11-04 (end-to-end)

> 자동 생성: `services/api/scripts/ocr_benchmark.py`. 이 문서에는 지표와 문서 id만 있습니다.
> 원본 이미지·OCR 원문·상품명은 포함하지 않습니다.

## 실행 조건

- mode: `end-to-end`
- corpus: `e2e-corpus`
- OCR worker: `http://127.0.0.1:8012` / model `PP-OCRv5_mobile_det+korean_PP-OCRv5_mobile_rec`
- 상품명 매칭: NFKC·소문자·앞 품번/공백/괄호·구두점 제거 후 `difflib.SequenceMatcher` 비율(전체명과 용량·입수 표기를 뺀 핵심명 중 큰 값) ≥ 0.8 인 1:1 greedy 매칭. '이름 완전일치'는 정규화한 전체명이 같은 경우만
- '확신한 틀린 소비기한' 기준: 앱이 고르는 소비기한 후보의 confidence ≥ 0.8
- Python 3.14.7 / Darwin arm64
- 채점 13건, 정답 초안 생성 0건, 건너뜀 0건

## 영수증

| 지표 | 값 | 비고 |
|---|---|---|
| 문서 수 | 6 | pipeline 상태 {'complete': 6} |
| 매장명 정확도 | 80.0% | {'correct': 4, 'both_absent': 1, 'missed': 1} |
| 구매일 정확도 | 100.0% | {'correct': 5, 'both_absent': 1} |
| 식료품/식당 구분 | 100.0% | 식당 영수증은 입고 제외가 정답 |
| 라인 precision | 69.0% | 매칭 20 / 추출 29 |
| 라인 recall | 69.0% | 매칭 20 / 정답 29 (이름 완전일치 2) |
| 수량 일치율 | 95.0% | 매칭된 라인 기준 |
| 금액 일치율 | 85.0% | 매칭된 라인의 행 합계 금액 |
| 검토 필요 라인 비율 | 24.1% | parser가 review_reason을 단 상품 라인 / 추출 라인 |
| 검토 필요 영수증 비율 | 80.0% | 식료품 영수증 중 검토 라인·경고·OCR 실패가 하나라도 있는 비율 |
| 검토 표시 없이 틀린 라인 | 2 | 수량/금액이 틀렸는데 review_reason 없음 |
| 검토 표시 없는 가짜 라인 | 6 | 정답에 없는데 review_reason 없이 추출 |
| 맞았는데 검토로 넘긴 라인 | 3 | 사용자 수고만 늘린 경우 |
| 장당 처리 시간 | p50 2145.01 ms / p90 6130.09 ms / max 9164.33 ms (OCR worker 왕복 p50 2131.92 ms) | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |

### 영수증별

| id | 상태 | 매장 | 구매일 | 정답/추출/매칭 | 수량 | 금액 | 검토 라인 | 처리 ms |
|---|---|---|---|---|---|---|---|---|
| `receipts/grocery_mart_sanitized_01` | complete | correct | correct | 10/10/9 | 9/9 | 9/9 | 2 | 6130.1 |
| `receipts/restaurant_sanitized_01` | complete (비식료품) | both_absent | both_absent | 0/0/0 | 0/0 | 0/0 | 0 | 1491.5 |
| `receipts/retail_beverage_sanitized_01` | complete | correct | correct | 10/10/6 | 6/6 | 6/6 | 0 | 9164.3 |
| `receipts/syn_inline_amount_01` | complete | correct | correct | 3/3/2 | 1/2 | 0/2 | 1 | 2111.5 |
| `receipts/syn_no_item_number_01` | complete | missed | correct | 3/3/0 | 0/0 | 0/0 | 3 | 2059.6 |
| `receipts/syn_ocr_noise_01` | complete | correct | correct | 3/3/3 | 3/3 | 2/3 | 1 | 2178.6 |

## 라벨

| 지표 | 값 | 비고 |
|---|---|---|
| 문서 수 | 7 | pipeline 상태 {'complete': 7} |
| **확신한 틀린 소비기한** | **1** | 안전상 가장 위험한 오류. id: `labels/syn_lot_number_near_keyword_01` |
| 소비기한 선택 결과 | {'both_absent': 2, 'wrong': 1, 'missed': 4} | correct / wrong / missed / both_absent(정답·추출 모두 없음) |
| 날짜 값 recall | 85.7% | 찾은 정답 날짜 6 / 정답 날짜 7 |
| 날짜 값 precision | 85.7% | 맞은 후보 6 / 후보 7 |
| 날짜 종류 정분류율 | 16.7% | 값이 맞은 날짜 기준 |
| 날짜 종류 오분류율 | 0.0% | 다른 구체적 종류로 판단 (예: 제조일→소비기한) |
| 날짜 종류 보류율 | 83.3% | unknown으로 남겨 사용자에게 넘김 (안전한 실패) |
| 보관조건 정확도 | 85.7% | 냉장/냉동/실온/unknown |
| 검토 필요 라벨 비율 | 100.0% | parser requires_review |
| 장당 처리 시간 | p50 852.23 ms / p90 1235.18 ms / max 1398.2 ms (OCR worker 왕복 p50 839.35 ms) | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |

### 라벨별

| id | 상태 | 정답/후보/찾음 | 종류 정/보류/오 | 소비기한 | 확신 오류 | 보관 | 처리 ms |
|---|---|---|---|---|---|---|---|
| `labels/packaged_no_date_sanitized_01` | complete | 0/0/0 | 0/0/0 | both_absent | 아니오 | True | 1398.2 |
| `labels/produce_ambiguous_sanitized_01` | complete | 1/1/1 | 1/0/0 | both_absent | 아니오 | True | 1235.2 |
| `labels/syn_lot_number_near_keyword_01` | complete | 0/1/0 | 0/0/0 | wrong | **예** | True | 852.2 |
| `labels/syn_mfg_and_use_by_01` | complete | 2/2/2 | 0/2/0 | missed | 아니오 | True | 859.6 |
| `labels/syn_sell_by_single_line_01` | complete | 2/2/2 | 0/2/0 | missed | 아니오 | True | 757.8 |
| `labels/syn_two_digit_year_01` | complete | 1/0/0 | 0/0/0 | missed | 아니오 | False | 515.2 |
| `labels/syn_until_only_01` | complete | 1/1/1 | 0/1/0 | missed | 아니오 | True | 432.5 |

## 관찰된 약점

- `receipts/grocery_mart_sanitized_01`: 상품 라인 1개를 찾지 못함.
- `receipts/grocery_mart_sanitized_01`: 정답에 없는 상품 라인 1개 추출.
- `receipts/grocery_mart_sanitized_01`: 값이 맞는 라인 2개를 검토로 넘김.
- `receipts/retail_beverage_sanitized_01`: 상품 라인 4개를 찾지 못함.
- `receipts/retail_beverage_sanitized_01`: 정답에 없는 상품 라인 4개 추출.
- `receipts/syn_inline_amount_01`: 상품 라인 1개를 찾지 못함.
- `receipts/syn_inline_amount_01`: 정답에 없는 상품 라인 1개 추출.
- `receipts/syn_inline_amount_01`: 수량 1건 / 금액 2건 불일치 (검토 표시 없이 틀린 라인 1).
- `receipts/syn_no_item_number_01`: 매장명 missed.
- `receipts/syn_no_item_number_01`: 상품 라인 3개를 찾지 못함.
- `receipts/syn_no_item_number_01`: 정답에 없는 상품 라인 3개 추출.
- `receipts/syn_ocr_noise_01`: 수량 0건 / 금액 1건 불일치 (검토 표시 없이 틀린 라인 1).
- `receipts/syn_ocr_noise_01`: 값이 맞는 라인 1개를 검토로 넘김.
- `labels/syn_lot_number_near_keyword_01`: **틀린 날짜를 소비기한으로 확신함**.
- `labels/syn_mfg_and_use_by_01`: 소비기한 missed.
- `labels/syn_sell_by_single_line_01`: 소비기한 missed.
- `labels/syn_two_digit_year_01`: 소비기한 missed.
- `labels/syn_two_digit_year_01`: 정답 날짜 1개를 찾지 못함.
- `labels/syn_two_digit_year_01`: 보관조건 불일치.
- `labels/syn_until_only_01`: 소비기한 missed.
- [라벨·parser] 제조일과 소비기한이 인접한 가장 흔한 표기에서 두 날짜 모두 kind=unknown(0.35)이 된다. 128자 문맥 창 안에 서로 다른 날짜 키워드가 둘 이상이면 보류하는 규칙 때문이며, 안전하지만 소비기한 자동 제안이 사라진다(synthetic `mfg_and_use_by_01`, `sell_by_single_line_01`).
- [라벨·parser] 연도 두 자리 표기(`26.11.20`)를 날짜 후보로 인식하지 못한다(`two_digit_year_01`).
- [라벨·parser, 안전] `소비기한` 문구 근처의 8자리 LOT/제조번호(`20261015`)를 날짜로 읽어 use_by confidence 0.94로 고른다. 이 리포트에서 유일한 '확신한 틀린 소비기한'이다(`lot_number_near_keyword_01`).
- 입력은 fixture·synthetic 텍스트 13건을 Apple SD Gothic Neo로 렌더링한 합성 JPG(±1.2° 회전, 약한 blur, 금액 열 우측 정렬)다. 실제 감열지 사진보다 쉬운 조건이며 사진은 저장소에 두지 않았다. 처리 시간은 Mac arm64, worker 1개(동시성 1), `/ready` warm-up 이후 값이다.
- [영수증·OCR 경로] 표 머리말(`상품명 단가 수량 금액`) observation이 첫 상품명 앞에 붙어 첫 라인이 매번 정답과 매칭되지 않는다(`grocery_mart_sanitized_01`, `retail_beverage_sanitized_01`). review_reason도 붙지 않는다.
- [영수증·OCR 경로] 상품명 정리 정규식이 `캔`·용량 숫자를 지워 `○○/캔 500ml`이 `○○/ m`처럼 깨진다. 검토 표시 없이 저장될 수 있다(`retail_beverage_sanitized_01`).
- [영수증·OCR 경로] 금액이 다음 행 값으로 연결되거나(`syn_inline_amount_01`) `2.500`이 500원으로 읽히는데(`syn_ocr_noise_01`) review_reason이 없다. '검토 표시 없이 틀린 라인' 2건이 여기서 나온다.
- [영수증·OCR 경로] 품번 없는 영수증은 이름이 빈 상품 라인 3개를 만든다(검토 표시는 있음, `syn_no_item_number_01`).
- [영수증·OCR 경로] 용량·입수 표기(`5입`, `2팩`)가 이름에서 빠지고 수량 후보로 쓰일 수 있어, 매칭은 용량 표기를 뺀 핵심명 기준을 함께 쓴다(실행 조건 참고).

## 지표 해석

- 매장·구매일 정확도의 분모는 정답 파일에 값이 있는 문서입니다. `spurious`는 정답이 null인데 값을 만든 경우입니다.
- 라인 precision이 낮으면 할인·합계·바코드 행이 상품으로 들어오고, recall이 낮으면 상품을 놓친 것입니다.
- '검토 표시 없이 틀린 라인'은 사용자가 그대로 저장할 위험이 있는 오류이므로 0이 목표입니다.
- 라벨의 '확신한 틀린 소비기한'은 앱이 고르는 소비기한 후보가 정답 소비기한과 다르면서 confidence가 기준 이상인 경우입니다. 0이 아니면 해당 id를 먼저 보세요.
- 이 표본은 소수 문서 기준이므로 비율보다 개별 실패 id를 우선 확인하세요.
