# 실제 첨부 이미지 OCR·parser benchmark — 2026-09-01

## 결론

사용자가 제공한 영수증 3장과 식품 라벨 2장을 macOS Vision 기준선으로 읽고, Rescue Meal의 bbox-aware receipt parser와 label parser에 통과시켰습니다.

확인된 결과:

- 영수증 1: 65개 OCR observation → 10개 상품 번호 anchor line
- 영수증 2: 83개 OCR observation → 상품 후보와 할인 line 분리
- 영수증 3: 53개 OCR observation → `restaurant_receipt` + 자동 식품 재고 입고 차단 경고
- 농산물 라벨: 12개 OCR observation → `2017.06.28`은 의미 불명확, 확정 소비기한 없음
- 가공식품 라벨: 5개 OCR observation → `8801075011678` barcode 후보, 소비기한 숫자 없음

이 결과는 OCR 가능성과 parser 실패 경계를 확인하는 기준선입니다. PaddleOCR 성능, 최종 자동 입고 정확도, 식품 안전을 증명하지 않습니다.

## 개인정보·원본 취급

원본 이미지는 프로젝트에 복사하지 않았습니다. 임시 첨부 경로에서 로컬로 읽고, 이 문서에는 파일명·해시·집계 결과만 남깁니다.

| 입력 | SHA-256 |
|---|---|
| receipt-1 | `1a4927df5991fb91c43b266b9efb7936525760197e12b50d75f879c2b6189284` |
| receipt-2 | `a3c321bc54ff315974f90c2d4734046eb4d4fdb57e6cdd2ac5d9f89a2bf1dd35` |
| receipt-3 | `dc4af40876432bf4a1fd3af709d8bf3f87412ec5d614cab18715a76bbdd0da7f` |
| produce-label-1 | `d480dbe08ae4b1adc514842ca1db9d55f557a85db27dbc376970d9828dc14477` |
| packaged-label-2 | `c328413d6f4ddeb170c9022603b3e4c666b67f96440b6a9b6109b732b4557ce0` |

## 실행 기준

- OCR engine: macOS Vision `VNRecognizeTextRequest`
- recognition level: accurate
- languages: `ko-KR`, `en-US`
- Swift: Apple Swift 6.3.3, arm64 macOS
- image preprocessing: 별도 전처리 없이 기준선 실행
- production OCR claim: `not_run` — PaddleOCR는 현재 환경에 설치되지 않음

재현용 intermediate script:

- `work/macos_vision_ocr.swift`
- `work/run_vision_benchmark.py`
- `work/print_vision_obs.py`

실행 예:

```bash
swiftc work/macos_vision_ocr.swift -o work/macos_vision_ocr -framework Vision -framework ImageIO
cd services/api
uv run python ../../work/run_vision_benchmark.py
```

## 영수증 결과

### receipt-1 — 식자재마트

- Vision observation: 65개
- 문서 유형: `grocery_receipt`
- 구매일 후보: `2018-01-30`
- 상품 anchor: 10개
- 내부 상품코드와 일반 barcode 후보가 섞여 있음
- `하림IFF 냉동가습살`처럼 OCR 상품명 오인식이 남음
- 수량 또는 금액이 완전히 연결되지 않은 line은 review 경고로 남음

핵심 parser 수정:

- Vision의 bottom-left y좌표를 위→아래 순서로 정렬
- `001`~`010` 상품 번호를 segment anchor로 사용
- bbox x좌표로 수량·단가·합계를 분리
- 8자리 이상 숫자는 내부 barcode 후보로 보고 가격 계산에서 제외
- 6자리 무구분 숫자는 매장 내부 코드 후보로 제외

### receipt-2 — 음료·주류 판매 영수증

- Vision observation: 83개
- 문서 유형: `retail_beverage_receipt`
- 구매일 후보: `2025-10-24`
- 상품 후보와 `$특매할인`·`$특매합인` line 분리
- 일부 수량이 없어 해당 line은 review 경고
- OCR이 인접 상품명과 용량을 섞는 경우가 있어 매장 template이 필요

할인 line은 `StockLot`으로 만들지 않는 현재 API 계약과 일치합니다.

### receipt-3 — 식당 영수증 + 카드전표

- Vision observation: 53개
- 문서 유형: `restaurant_receipt`
- 구매일 후보: `2018-01-21`
- 주소·테이블·결제·메뉴 영역이 섞임
- parser 경고: 식당 영수증은 식료품 재고로 자동 입고하지 않음

이 문서에서 보이는 숫자와 메뉴를 grocery inventory로 매칭하지 않고, 이후 `leftover quick add`가 필요할 때만 별도 흐름으로 보냅니다.

## 라벨 결과

### produce-label-1 — 농산물 가변중량 라벨

- Vision observation: 12개
- 제품명 후보: 채소류 [국내산]
- 날짜 후보: `2017.06.28`
- 날짜 의미: `unknown`
- 확정 소비기한: 없음
- barcode: 자동 생성하지 않음

OCR이 `2`, `308490`, `023003`을 서로 다른 위치로 분리했고, `2300` 중량도 별도 숫자로 읽었습니다. 줄바꿈 문자열만 합쳐 `2300023003` 같은 barcode를 만들면 오인식이므로 현재 parser는 보수적으로 `null + review`를 반환합니다.

### packaged-label-2 — 가공식품 라벨

- Vision observation: 5개
- 제품명 일부 후보는 읽었지만 정확한 canonical product 확정은 하지 않음
- barcode 후보: `8801075011678`
- 소비기한·유통기한 숫자: 없음
- 확정 소비기한: 없음
- 추가 촬영: 다른 면·뚜껑·용기 끝부분

상품 barcode가 있어도 소비기한을 자동 생성하지 않는 현재 계약과 일치합니다.

## 현재 validation claim

- 실제 사용자 첨부 원본 로컬 OCR 기준선: 완료
- bbox-aware 영수증 상품 anchor grouping: 완료
- 할인·식당 문서 분리 경계: 확인
- 라벨 날짜 의미 불명확 처리: 확인
- barcode 오인식 방지 보수적 abstain: 확인
- PaddleOCR 실제 모델 benchmark: `not_run`
- OpenCV/Pillow 품질 gate: `not_run`
- 실제 camera/ZXing/GS1 runtime: `not_run`
- 자동 소비기한·섭취 가능 판정: 금지·미구현

다음 단계는 실제 PaddleOCR runtime을 고정한 뒤 동일한 해시 fixture에 대해 Vision 기준선과 observation·bbox·parser 결과를 비교하는 것입니다.
