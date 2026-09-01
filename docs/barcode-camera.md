# 바코드 카메라 흐름

## 현재 구현

프론트의 바코드 추가 sheet는 `@zxing/browser`의 `BrowserMultiFormatReader`를 카메라 버튼을 누른 뒤 동적으로 로드합니다.

```text
카메라로 스캔
→ 후면 카메라 후보 선택
→ decodeFromVideoDevice
→ 첫 결과 수신 후 controls.stop()
→ raw barcode를 API parser로 전달
→ GTIN이면 상품 후보 조회
→ GS1 날짜가 있으면 날짜 후보로 review
→ 날짜가 없으면 포장지 라벨 촬영 안내
```

현재 dependency는 Node 22 개발환경과의 호환을 위해 다음처럼 고정했습니다.

```text
@zxing/browser 0.1.5
@zxing/library 0.21.3
```

두 패키지 모두 MIT 라이선스이며, 공식 브라우저 API 사용법은 [ZXing Browser 공식 저장소](https://github.com/zxing-js/browser)를 기준으로 합니다.

## 안전 경계

- 일반 EAN/UPC/GTIN은 상품 식별값으로만 사용합니다.
- 바코드만으로 개별 팩의 소비기한을 만들지 않습니다.
- GS1 element string에 날짜 AI가 실제로 들어온 경우에도 날짜는 `date_assertion` 후보로 review에 보냅니다.
- 상품 lookup 성공과 날짜 확인 성공은 별도 상태입니다.
- 카메라 권한 거부, `mediaDevices` 미지원, 장치 목록 실패는 `카메라를 사용할 수 없어요`를 보여주고 수동 숫자 입력을 유지합니다.
- 첫 인식 결과가 오면 reader와 media stream을 정리해 중복 입고를 방지합니다.

## 프론트 경로

- `apps/web/src/Prototype.tsx` — `BarcodeScanner`, raw scan 후 lookup 분기
- `apps/web/src/mealApi.ts` — `/api/barcodes/parse`, `/api/products/resolve/{barcode}` adapter
- `services/api/app/barcode.py` — GTIN·GS1·가변중량 분기
- `services/api/app/product_resolver.py` — local fixture 우선 상품 후보 resolver

## 확인한 것

- `npm run build`에서 TypeScript/Vite build 통과
- ZXing 코드는 동적 chunk로 분리되어 초기 client chunk와 분리됨
- 수동 barcode 입력 → 상품 후보 조회 → “소비기한은 포장지의 날짜를 촬영” 안내 E2E 통과
- `navigator.mediaDevices`가 없는 환경 → 수동 입력 fallback E2E 통과
- 사용자에게 제공된 포장 라벨의 실제 날짜는 barcode parser가 아닌 PaddleOCR/label parser 경로에서 review 후보로 처리

## 아직 확인하지 않은 것

- 실제 iPhone/Android 카메라 권한 승인과 후면 카메라 선택
- 흔들림·반사·저조도·곡면 포장에서 EAN/GS1 인식률
- 실제 GS1 DataMatrix 샘플의 카메라 인식 및 Syntax Engine 대조
- 기기별 torch 지원과 브라우저별 `getUserMedia` 정책

실기기 검증 전에는 “카메라가 모든 바코드를 읽는다”고 주장하지 않습니다. 현재 상태는 카메라 adapter·권한 실패 경계·수동 fallback이 구현된 단계입니다.
