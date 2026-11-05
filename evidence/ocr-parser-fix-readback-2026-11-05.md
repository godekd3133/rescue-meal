# OCR parser 약점 수정 전후 — 2026-11-05

`services/api/scripts/ocr_benchmark.py`가 2026-11-04에 찾은 parser 약점을 고쳤습니다.
수정한 파일은 `services/api/app/pipeline/label_parser.py`, `services/api/app/pipeline/receipt_parser.py`,
`services/api/tests/test_pipeline.py` 세 개입니다. 원칙은 **틀린 날짜를 확신하지 않는 것(오탐 줄이기)이 재현율보다 먼저**입니다.

- 수정 전 리포트: `ocr-benchmark-2026-11-04-{text-only,synthetic-probe,synthetic-image-e2e}.md`
  (오늘 같은 명령으로 다시 돌린 결과도 지표가 같았습니다. 처리 시간만 다릅니다.)
- 수정 후 리포트: `ocr-benchmark-2026-11-05-{text-only,synthetic-probe,synthetic-image-e2e}-after-parser-fix.md`
- e2e는 어제와 같은 합성 JPG 13장을 포트 8012의 임시 OCR worker(PP-OCRv5 mobile)로 다시 처리했습니다. 실제 사진 정확도가 아닙니다.
- `services/api` 전체 테스트: 665 passed. `ruff check app/pipeline tests/test_pipeline.py` 통과.

## 지표 변화

### 라벨

| 지표 | probe 전 → 후 | e2e 전 → 후 | fixture text-only 전 → 후 |
|---|---|---|---|
| **확신한 틀린 소비기한** | **1 → 0** | **1 → 0** | 0 → 0 |
| 소비기한 선택 | wrong 1, missed 4 → correct 3, missed 1, both_absent 1 | wrong 1, missed 4, both_absent 2 → correct 2, missed 2, both_absent 3 | both_absent 2 → 같음 |
| 날짜 값 recall | 83.3% → 100% | 85.7% → 85.7% | 100% → 100% |
| 날짜 값 precision | 83.3% → 100% | 85.7% → 100% | 100% → 100% |
| 날짜 종류 정분류율 | 0% → 83.3% | 16.7% → 83.3% | 100% → 100% |
| 날짜 종류 오분류율 | 0% → 0% | 0% → 0% | 0% → 0% |
| 날짜 종류 보류율 | 100% → 16.7% | 83.3% → 16.7% | 0% → 0% |

### 영수증

| 지표 | probe 전 → 후 | e2e 전 → 후 | fixture text-only 전 → 후 |
|---|---|---|---|
| 매장명 정확도 | 66.7% → 100% | 80% → 100% | 100% → 100% |
| 라인 precision | 50% → 100% | 69% → 100% | 100% → 100% |
| 라인 recall | 33.3% → 100% | 69% → 100% | 100% → 100% |
| 금액 일치율 | 100% (3건) → 100% (9건) | 85% → 100% | 100% → 100% |
| **검토 표시 없이 틀린 라인** | 0 → 0 | **2 → 0** | 0 → 0 |
| **검토 표시 없는 가짜 라인** | **3 → 0** | **6 → 0** | 0 → 0 |
| 맞았는데 검토로 넘긴 라인 | 0 → 3 | 3 → 1 | 0 → 0 |
| 검토 필요 라인 비율 | 0% → 33.3% | 24.1% → 3.5% | 0% → 0% |

probe의 "맞았는데 검토로 넘긴 라인 3"은 `ocr_noise_01`에서 나왔고, 의도한 결과입니다. 이 영수증의 금액은
`2.500`, `l`, `8,9OO`처럼 OCR 오인식을 보정해서 맞힌 값이라 사용자 확인으로 보냅니다.

## 항목별 수정

1. **LOT/제조번호(안전)**: 같은 줄 바로 앞, 또는 OCR이 나눈 바로 윗줄에 `LOT`, `Lot No.`, `L/N`, `batch`, `로트`, `제조번호`,
   `생산번호`, `일련번호`, `배치번호`, `제품번호`가 있으면 그 숫자를 날짜 후보에서 빼고 경고를 답니다. 이와 별도로
   구분자 없는 8자리(`20261015`)는 키워드가 붙어 있어도 confidence를 0.6 이하로 묶어, 확신 기준(0.8)을 넘지 못하게 했습니다.
2. **제조일·소비기한 인접 표기, 연도 두 자리**: 128자 창 안의 키워드를 모두 모으던 분류를 단계별로 바꿨습니다.
   (1) 같은 줄에서 값 바로 앞에 있는 키워드(앞 날짜 뒤부터)를 쓰고, (2) 그 줄에 다른 날짜가 없을 때만 값 뒤의 키워드를 씁니다(≤0.7).
   (3) 같은 줄에 다른 날짜가 있으면 보류(unknown)합니다. (4) 다른 줄의 키워드는 종류가 하나일 때만 쓰고 ≤0.7로 둡니다.
   `YY.MM.DD`(같은 구분자 반복, 20~39년)도 인식합니다. 다만 `DD.MM.YY`로도 읽힐 수 있어 ≤0.6으로 두고 확인 경고를 답니다.
   `2.500`, `1.5kg`, 전화번호, 13월 같은 값은 날짜가 되지 않습니다.
3. **영수증 OCR 경로**:
   - observation을 bbox 높이 기준으로 **시각적 행**으로 묶은 뒤 위→아래, 왼→오른쪽으로 읽습니다. 수량 상자가 이름 상자보다
     조금 높아서 앞 상품 구간에 들어가던 문제(다른 행 금액이 연결되던 원인)가 사라졌습니다.
   - 표 머리말(`상품명/품명/단가/수량/금액` 중 둘 이상, 금액 숫자 없음)은 이름 당겨오기와 상품 구간에서 뺍니다.
   - 이름 정리에서 숫자, `캔`, 용량을 지우지 않습니다. 앞 품번만 지우고, raw_name은 text 경로처럼 `삿포로/캔500m`를 그대로 둡니다.
     canonical_name은 이전처럼 끝의 용량을 뺍니다.
   - 같은 행에 할인·합계 키워드가 있으면 그 행의 숫자는 할인·합계 라인에 붙입니다. 합계·결제 행 뒤에 나오는 꼬리말은 마지막 상품에 붙이지 않습니다.
   - 금액 토큰: `.` 천 단위(`2.500`→2500), `O→0`, `l/I/|→1`을 보정하고, 보정하면 **반드시 review_reason**을 답니다.
     금액 후보가 서로 다르게 여러 개 읽히거나 단가×수량≠금액이면 review_reason을 답니다. 수량 상자를 놓쳤을 때는
     금액÷단가가 1~99 정수로 떨어지는 경우만 수량을 채우고(confidence 0.88), 그 밖에는 검토로 보냅니다.
   - text 경로의 품번 있는 행도 같은 금액 토큰 규칙과 단가×수량 검사를 따르고, 검토 라인이 있으면 영수증 경고를 답니다.
4. **품번 없는 영수증, 지점명 매장명**: `이름 단가 수량 금액` 행은 이름이 있고 단가×수량=금액이 맞을 때만 상품으로 받습니다.
   그래서 전화번호나 과세물품 행이 상품이 되지 않습니다. 식당 영수증에는 적용하지 않습니다. 품번이 없는 OCR 결과는 시각적 행을 한 줄로 합친 뒤
   이 규칙을 적용합니다. 매장명 접미사 뒤에 `…점` 지점명이 오는 경우(`행복마트 성수점`)도 받습니다.

## 회귀 테스트 (`services/api/tests/test_pipeline.py`)

- 1번: `test_label_parser_never_offers_a_lot_number_near_a_use_by_keyword_as_a_date` (4개 변형),
  `..._keeps_a_real_use_by_date_next_to_a_lot_number`, `..._never_trusts_an_unlabelled_compact_date_shape`
- 2번: `..._classifies_adjacent_production_and_use_by_lines`, `..._classifies_two_labelled_dates_on_one_line`,
  `..._abstains_when_a_keyword_could_belong_to_another_value`, `..._reads_two_digit_years_without_trusting_them`,
  `..._two_digit_year_does_not_match_prices_or_codes`
- 3번 (e2e에서 얻은 합성 observation 좌표 사용): `test_receipt_observations_keep_the_table_header_out_of_the_first_product_name`,
  `..._keep_can_and_volume_in_the_name`, `..._attach_amounts_from_the_same_visual_row`,
  `..._repair_period_thousands_separator_but_require_review`, `..._flag_amounts_that_do_not_multiply`,
  `..._flag_conflicting_amount_candidates`, `..._infer_a_missing_quantity_only_from_consistent_amounts`,
  `test_receipt_text_repairs_ocr_lookalike_amounts_with_review`, `..._flags_a_numbered_row_whose_amounts_do_not_multiply`
- 4번: `test_receipt_text_reads_rows_without_item_numbers_and_branch_merchant_names`, `..._does_not_invent_unnumbered_products`,
  `test_receipt_observations_without_item_numbers_rebuild_rows`
- 기존 `test_receipt_observations_group_by_item_anchor_and_bbox_columns`의 기대값을 바꿨습니다.
  raw_name이 `시금치`에서 `시금치 1팩`이 되고, canonical_name `시금치`를 새로 검사합니다. 이름에서 용량을 지우지 않게 한 의도된 변경입니다.

## 남은 약점

- `until_only_01`(`2026.11.20 까지`만 보이는 면)은 의도적으로 보류합니다. `까지`만으로는 소비기한·유통기한·품질유지기한을 구분할 수 없습니다.
- e2e `syn_two_digit_year_01`: OCR이 이미지 전체를 `소비기한261120` 한 덩어리로 읽었고, `냉장보관`도 놓쳤습니다. 구분자 없는
  6자리는 코드일 수 있어 날짜로 읽지 않습니다(보류). OCR 단계의 문제입니다.
- e2e 이름 완전일치는 29건 중 21건입니다. OCR이 공백을 빼거나 `ml`을 `m`으로 읽은 경우가 대부분이며, 퍼지 매칭으로는 모두 맞았습니다.
- 표본은 합성 텍스트 8건, fixture 5건, 합성 JPG 13장뿐입니다. 실제 감열지 사진 corpus로 다시 재야 합니다.
