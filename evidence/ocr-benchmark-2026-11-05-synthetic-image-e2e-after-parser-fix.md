# OCR 추출 벤치마크 — 2026-11-05 (end-to-end)

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
| 매장명 정확도 | 100.0% | {'correct': 5, 'both_absent': 1} |
| 구매일 정확도 | 100.0% | {'correct': 5, 'both_absent': 1} |
| 식료품/식당 구분 | 100.0% | 식당 영수증은 입고 제외가 정답 |
| 라인 precision | 100.0% | 매칭 29 / 추출 29 |
| 라인 recall | 100.0% | 매칭 29 / 정답 29 (이름 완전일치 21) |
| 수량 일치율 | 100.0% | 매칭된 라인 기준 |
| 금액 일치율 | 100.0% | 매칭된 라인의 행 합계 금액 |
| 검토 필요 라인 비율 | 3.5% | parser가 review_reason을 단 상품 라인 / 추출 라인 |
| 검토 필요 영수증 비율 | 20.0% | 식료품 영수증 중 검토 라인·경고·OCR 실패가 하나라도 있는 비율 |
| 검토 표시 없이 틀린 라인 | 0 | 수량/금액이 틀렸는데 review_reason 없음 |
| 검토 표시 없는 가짜 라인 | 0 | 정답에 없는데 review_reason 없이 추출 |
| 맞았는데 검토로 넘긴 라인 | 1 | 사용자 수고만 늘린 경우 |
| 장당 처리 시간 | p50 2140.77 ms / p90 5978.11 ms / max 8869.14 ms (OCR worker 왕복 p50 2127.4 ms) | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |

### 영수증별

| id | 상태 | 매장 | 구매일 | 정답/추출/매칭 | 수량 | 금액 | 검토 라인 | 처리 ms |
|---|---|---|---|---|---|---|---|---|
| `receipts/grocery_mart_sanitized_01` | complete | correct | correct | 10/10/10 | 10/10 | 10/10 | 0 | 5978.1 |
| `receipts/restaurant_sanitized_01` | complete (비식료품) | both_absent | both_absent | 0/0/0 | 0/0 | 0/0 | 0 | 1469.5 |
| `receipts/retail_beverage_sanitized_01` | complete | correct | correct | 10/10/10 | 10/10 | 10/10 | 0 | 8869.1 |
| `receipts/syn_inline_amount_01` | complete | correct | correct | 3/3/3 | 3/3 | 3/3 | 0 | 2058.3 |
| `receipts/syn_no_item_number_01` | complete | correct | correct | 3/3/3 | 3/3 | 3/3 | 0 | 2028.3 |
| `receipts/syn_ocr_noise_01` | complete | correct | correct | 3/3/3 | 3/3 | 3/3 | 1 | 2223.2 |

## 라벨

| 지표 | 값 | 비고 |
|---|---|---|
| 문서 수 | 7 | pipeline 상태 {'complete': 7} |
| **확신한 틀린 소비기한** | **0** | 안전상 가장 위험한 오류. id: 없음 |
| 소비기한 선택 결과 | {'both_absent': 3, 'correct': 2, 'missed': 2} | correct / wrong / missed / both_absent(정답·추출 모두 없음) |
| 날짜 값 recall | 85.7% | 찾은 정답 날짜 6 / 정답 날짜 7 |
| 날짜 값 precision | 100.0% | 맞은 후보 6 / 후보 6 |
| 날짜 종류 정분류율 | 83.3% | 값이 맞은 날짜 기준 |
| 날짜 종류 오분류율 | 0.0% | 다른 구체적 종류로 판단 (예: 제조일→소비기한) |
| 날짜 종류 보류율 | 16.7% | unknown으로 남겨 사용자에게 넘김 (안전한 실패) |
| 보관조건 정확도 | 85.7% | 냉장/냉동/실온/unknown |
| 검토 필요 라벨 비율 | 100.0% | parser requires_review |
| 장당 처리 시간 | p50 805.95 ms / p90 1211.39 ms / max 1372.14 ms (OCR worker 왕복 p50 793.23 ms) | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |

### 라벨별

| id | 상태 | 정답/후보/찾음 | 종류 정/보류/오 | 소비기한 | 확신 오류 | 보관 | 처리 ms |
|---|---|---|---|---|---|---|---|
| `labels/packaged_no_date_sanitized_01` | complete | 0/0/0 | 0/0/0 | both_absent | 아니오 | True | 1372.1 |
| `labels/produce_ambiguous_sanitized_01` | complete | 1/1/1 | 1/0/0 | both_absent | 아니오 | True | 1211.4 |
| `labels/syn_lot_number_near_keyword_01` | complete | 0/0/0 | 0/0/0 | both_absent | 아니오 | True | 806.0 |
| `labels/syn_mfg_and_use_by_01` | complete | 2/2/2 | 2/0/0 | correct | 아니오 | True | 829.6 |
| `labels/syn_sell_by_single_line_01` | complete | 2/2/2 | 2/0/0 | correct | 아니오 | True | 755.5 |
| `labels/syn_two_digit_year_01` | complete | 1/0/0 | 0/0/0 | missed | 아니오 | False | 495.3 |
| `labels/syn_until_only_01` | complete | 1/1/1 | 0/1/0 | missed | 아니오 | True | 410.5 |

## 관찰된 약점

- `receipts/syn_ocr_noise_01`: 값이 맞는 라인 1개를 검토로 넘김.
- `labels/syn_two_digit_year_01`: 소비기한 missed.
- `labels/syn_two_digit_year_01`: 정답 날짜 1개를 찾지 못함.
- `labels/syn_two_digit_year_01`: 보관조건 불일치.
- `labels/syn_until_only_01`: 소비기한 missed.

## 지표 해석

- 매장·구매일 정확도의 분모는 정답 파일에 값이 있는 문서입니다. `spurious`는 정답이 null인데 값을 만든 경우입니다.
- 라인 precision이 낮으면 할인·합계·바코드 행이 상품으로 들어오고, recall이 낮으면 상품을 놓친 것입니다.
- '검토 표시 없이 틀린 라인'은 사용자가 그대로 저장할 위험이 있는 오류이므로 0이 목표입니다.
- 라벨의 '확신한 틀린 소비기한'은 앱이 고르는 소비기한 후보가 정답 소비기한과 다르면서 confidence가 기준 이상인 경우입니다. 0이 아니면 해당 id를 먼저 보세요.
- 이 표본은 소수 문서 기준이므로 비율보다 개별 실패 id를 우선 확인하세요.
