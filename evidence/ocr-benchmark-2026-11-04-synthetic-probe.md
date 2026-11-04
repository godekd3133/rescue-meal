# OCR 추출 벤치마크 — 2026-11-04 (text-only)

> 자동 생성: `services/api/scripts/ocr_benchmark.py`. 이 문서에는 지표와 문서 id만 있습니다.
> 원본 이미지·OCR 원문·상품명은 포함하지 않습니다.

## 실행 조건

- mode: `text-only` (OCR 생략, 텍스트를 parser에 직접 입력)
- corpus: `data/fixtures/ocr-truth/synthetic`
- OCR worker: `-`
- 상품명 매칭: NFKC·소문자·앞 품번/공백/괄호·구두점 제거 후 `difflib.SequenceMatcher` 비율(전체명과 용량·입수 표기를 뺀 핵심명 중 큰 값) ≥ 0.8 인 1:1 greedy 매칭. '이름 완전일치'는 정규화한 전체명이 같은 경우만
- '확신한 틀린 소비기한' 기준: 앱이 고르는 소비기한 후보의 confidence ≥ 0.8
- Python 3.14.7 / Darwin arm64
- 채점 8건, 정답 초안 생성 0건, 건너뜀 0건

## 영수증

| 지표 | 값 | 비고 |
|---|---|---|
| 문서 수 | 3 | pipeline 상태 {'complete': 3} |
| 매장명 정확도 | 66.7% | {'correct': 2, 'missed': 1} |
| 구매일 정확도 | 100.0% | {'correct': 3} |
| 식료품/식당 구분 | 100.0% | 식당 영수증은 입고 제외가 정답 |
| 라인 precision | 50.0% | 매칭 3 / 추출 6 |
| 라인 recall | 33.3% | 매칭 3 / 정답 9 (이름 완전일치 3) |
| 수량 일치율 | 100.0% | 매칭된 라인 기준 |
| 금액 일치율 | 100.0% | 매칭된 라인의 행 합계 금액 |
| 검토 필요 라인 비율 | 0.0% | parser가 review_reason을 단 상품 라인 / 추출 라인 |
| 검토 필요 영수증 비율 | 0.0% | 식료품 영수증 중 검토 라인·경고·OCR 실패가 하나라도 있는 비율 |
| 검토 표시 없이 틀린 라인 | 0 | 수량/금액이 틀렸는데 review_reason 없음 |
| 검토 표시 없는 가짜 라인 | 3 | 정답에 없는데 review_reason 없이 추출 |
| 맞았는데 검토로 넘긴 라인 | 0 | 사용자 수고만 늘린 경우 |
| 장당 처리 시간 | p50 0.17 ms / p90 1.52 ms / max 1.52 ms | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |

### 영수증별

| id | 상태 | 매장 | 구매일 | 정답/추출/매칭 | 수량 | 금액 | 검토 라인 | 처리 ms |
|---|---|---|---|---|---|---|---|---|
| `receipts/inline_amount_01` | complete | correct | correct | 3/3/3 | 3/3 | 3/3 | 0 | 1.5 |
| `receipts/no_item_number_01` | complete | missed | correct | 3/0/0 | 0/0 | 0/0 | 0 | 0.1 |
| `receipts/ocr_noise_01` | complete | correct | correct | 3/3/0 | 0/0 | 0/0 | 0 | 0.2 |

## 라벨

| 지표 | 값 | 비고 |
|---|---|---|
| 문서 수 | 5 | pipeline 상태 {'complete': 5} |
| **확신한 틀린 소비기한** | **1** | 안전상 가장 위험한 오류. id: `labels/lot_number_near_keyword_01` |
| 소비기한 선택 결과 | {'wrong': 1, 'missed': 4} | correct / wrong / missed / both_absent(정답·추출 모두 없음) |
| 날짜 값 recall | 83.3% | 찾은 정답 날짜 5 / 정답 날짜 6 |
| 날짜 값 precision | 83.3% | 맞은 후보 5 / 후보 6 |
| 날짜 종류 정분류율 | 0.0% | 값이 맞은 날짜 기준 |
| 날짜 종류 오분류율 | 0.0% | 다른 구체적 종류로 판단 (예: 제조일→소비기한) |
| 날짜 종류 보류율 | 100.0% | unknown으로 남겨 사용자에게 넘김 (안전한 실패) |
| 보관조건 정확도 | 100.0% | 냉장/냉동/실온/unknown |
| 검토 필요 라벨 비율 | 100.0% | parser requires_review |
| 장당 처리 시간 | p50 0.03 ms / p90 0.11 ms / max 0.11 ms | end-to-end는 품질 gate~parser 합계, text-only는 parser만 |

### 라벨별

| id | 상태 | 정답/후보/찾음 | 종류 정/보류/오 | 소비기한 | 확신 오류 | 보관 | 처리 ms |
|---|---|---|---|---|---|---|---|
| `labels/lot_number_near_keyword_01` | complete | 0/1/0 | 0/0/0 | wrong | **예** | True | 0.1 |
| `labels/mfg_and_use_by_01` | complete | 2/2/2 | 0/2/0 | missed | 아니오 | True | 0.1 |
| `labels/sell_by_single_line_01` | complete | 2/2/2 | 0/2/0 | missed | 아니오 | True | 0.0 |
| `labels/two_digit_year_01` | complete | 1/0/0 | 0/0/0 | missed | 아니오 | True | 0.0 |
| `labels/until_only_01` | complete | 1/1/1 | 0/1/0 | missed | 아니오 | True | 0.0 |

## 관찰된 약점

- `receipts/no_item_number_01`: 매장명 missed.
- `receipts/no_item_number_01`: 상품 라인 3개를 찾지 못함.
- `receipts/ocr_noise_01`: 상품 라인 3개를 찾지 못함.
- `receipts/ocr_noise_01`: 정답에 없는 상품 라인 3개 추출.
- `labels/lot_number_near_keyword_01`: **틀린 날짜를 소비기한으로 확신함**.
- `labels/mfg_and_use_by_01`: 소비기한 missed.
- `labels/sell_by_single_line_01`: 소비기한 missed.
- `labels/two_digit_year_01`: 소비기한 missed.
- `labels/two_digit_year_01`: 정답 날짜 1개를 찾지 못함.
- `labels/until_only_01`: 소비기한 missed.
- [라벨·parser] 제조일과 소비기한이 인접한 가장 흔한 표기에서 두 날짜 모두 kind=unknown(0.35)이 된다. 128자 문맥 창 안에 서로 다른 날짜 키워드가 둘 이상이면 보류하는 규칙 때문이며, 안전하지만 소비기한 자동 제안이 사라진다(synthetic `mfg_and_use_by_01`, `sell_by_single_line_01`).
- [라벨·parser] 연도 두 자리 표기(`26.11.20`)를 날짜 후보로 인식하지 못한다(`two_digit_year_01`).
- [라벨·parser, 안전] `소비기한` 문구 근처의 8자리 LOT/제조번호(`20261015`)를 날짜로 읽어 use_by confidence 0.94로 고른다. 이 리포트에서 유일한 '확신한 틀린 소비기한'이다(`lot_number_near_keyword_01`).
- [영수증·parser] 품번(001…) 없는 영수증은 상품 라인을 하나도 만들지 못하고, 지점명이 붙은 매장명(`○○마트 성수점`)도 접미사 목록에 걸리지 않아 놓친다(`no_item_number_01`).
- [영수증·parser] OCR 오인식(쉼표→마침표, 1→l, 0→O)이 들어간 텍스트 경로에서는 금액 토큰이 상품명에 붙고 금액이 틀린 채 review_reason 없이 통과한다(`ocr_noise_01`). 이름이 달라져 '검토 표시 없는 가짜 라인'으로 집계된다.
- 이 세트는 사람이 지어낸 텍스트 8건(`data/fixtures/ocr-truth/synthetic`)이다. 실제 사진 정확도를 대신하지 않는다.

## 지표 해석

- 매장·구매일 정확도의 분모는 정답 파일에 값이 있는 문서입니다. `spurious`는 정답이 null인데 값을 만든 경우입니다.
- 라인 precision이 낮으면 할인·합계·바코드 행이 상품으로 들어오고, recall이 낮으면 상품을 놓친 것입니다.
- '검토 표시 없이 틀린 라인'은 사용자가 그대로 저장할 위험이 있는 오류이므로 0이 목표입니다.
- 라벨의 '확신한 틀린 소비기한'은 앱이 고르는 소비기한 후보가 정답 소비기한과 다르면서 confidence가 기준 이상인 경우입니다. 0이 아니면 해당 id를 먼저 보세요.
- 이 표본은 소수 문서 기준이므로 비율보다 개별 실패 id를 우선 확인하세요.
