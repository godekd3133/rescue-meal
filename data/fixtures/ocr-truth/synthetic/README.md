# 합성 probe 세트

실제 영수증·라벨이 아닌, 사람이 지어낸 텍스트입니다. 매장명·상품명·바코드는 모두 가상입니다.
sanitized fixture(`data/fixtures/{receipts,labels}`)가 다루지 않는 흔한 인쇄 형식을 parser에 넣어
약점을 수치로 드러내기 위한 용도입니다. 실제 사진 corpus의 정확도를 대신하지 않습니다.

```bash
cd services/api
uv run python scripts/ocr_benchmark.py --text-only --corpus ../../data/fixtures/ocr-truth/synthetic --out ../../evidence/ocr-benchmark-YYYY-MM-DD-synthetic-probe
```
