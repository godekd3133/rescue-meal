# 실제 영수증·라벨 OCR corpus

이 폴더에 실제 사진을 넣고 `services/api/scripts/ocr_benchmark.py`를 실행하면
OCR·추출 정확도가 측정됩니다. 사용 방법 전체는
[docs/ocr-pipeline.md의 "실제 사진 정확도 벤치마크"](../../docs/ocr-pipeline.md#실제-사진-정확도-벤치마크)를 보세요.

```text
data/ocr-corpus/
  receipts/r001.jpg            ← 영수증 사진 (jpg/jpeg/png/webp)
  receipts/r001.truth.json     ← 사람이 확인한 정답
  labels/l001.jpg              ← 날짜·보관조건이 보이는 라벨 면 사진
  labels/l001.truth.json
  templates/*.truth.template.json  ← 정답 형식 예시 (커밋됨)
  _results/                    ← 상품명 대조 등 상세 결과 (개인정보, 커밋 안 됨)
```

**개인정보**: 이 폴더의 `.gitignore`가 README·템플릿·빈 폴더 표시 파일을 뺀 모든 것
(사진, `*.truth.json`, `*.truth.draft.json`, `*.txt`, `_results/`)을 커밋에서 제외합니다.
파일 이름(id)은 `r001`, `l001`처럼 매장명·날짜가 드러나지 않게 지어 주세요. id는
`evidence/` 리포트에 그대로 남습니다.

## 정답 작성 순서

1. 사진만 넣고 한 번 실행합니다. 정답이 없는 사진마다 `<id>.truth.draft.json`이 생깁니다.
2. 사진을 보며 초안을 고칩니다.
   - 영수증: 매장명·구매일, 상품 행마다 이름·수량·행 합계 금액. 할인·합계·결제 행은 지웁니다.
     식당·카페 영수증이면 `"grocery": false`(라인은 채점하지 않음).
   - 라벨: 사진에 보이는 날짜마다 종류와 값, 보관조건.
     라벨만 보고 어느 날짜인지 알 수 없으면 `"kind": "unknown"`.
3. 파일 이름을 `<id>.truth.json`으로 바꾸고 다시 실행합니다.

형식은 `templates/receipt.truth.template.json`, `templates/label.truth.template.json`을 보세요.
