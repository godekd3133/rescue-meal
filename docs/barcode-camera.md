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
→ 외부 lookup이 켜져 있으면 C005·Open Food Facts v3.6 후보와 provenance 표시
```

영수증 intake도 상품행 뒤의 정상 GTIN continuation을 같은 14자리 식별자 형식으로 보존합니다.
review 화면에서는 line별 `바코드로 상품 후보 조회`를 사용자가 눌렀을 때만 상품 master 후보를
조회하고, 후보 적용 시 상품명·보관 힌트·출처만 갱신합니다. 이 조회는 receipt commit을
자동 확정하지 않으며, GTIN이나 제품 기준 기간만으로 개별 팩의 소비기한을 만들지 않습니다.

GS1 괄호형·`]d2` element string·Digital Link에 날짜가 포함된 경우 상품 후보 조회와 날짜 후보 표시를
동시에 진행합니다. 사용자가 `상품·날짜를 입력에 반영`을 누른 뒤 manual form을
최종 제출해야 `date_source=gs1`과 해당 `date_kind`가 저장됩니다. 일반 GTIN은
날짜 assertion 없이 상품 식별값으로만 처리합니다.

현재 dependency는 Node 22 개발환경과의 호환을 위해 다음처럼 고정했습니다.

```text
@zxing/browser 0.1.5
@zxing/library 0.21.3
```

두 패키지 모두 MIT 라이선스이며, 공식 브라우저 API 사용법은 [ZXing Browser 공식 저장소](https://github.com/zxing-js/browser)를 기준으로 합니다.

영수증·라벨은 바코드 해독처럼 지속적인 scan loop가 필요한 입력은 아니지만, 촬영 결과의 framing을 돕기 위해 `CameraCapture`가 짧은 `getUserMedia` video surface를 제공합니다. `facingMode: { ideal: "environment" }`로 후면 카메라를 우선 요청하고, 촬영 한 프레임을 JPEG `File`로 만들어 사진 선택과 동일한 [OCR intake pipeline](ocr-pipeline.md)에 전달합니다. 권한 거부·브라우저 미지원이면 surface 안에서 사진 보관함 fallback을 제공합니다. 실제 기기 촬영 품질은 바코드 video camera와 별도의 acceptance 대상입니다.

## 안전 경계

- 일반 EAN/UPC/GTIN은 상품 식별값으로만 사용합니다.
- 바코드만으로 개별 팩의 소비기한을 만들지 않습니다.
- GS1 element string에 날짜 AI가 실제로 들어온 경우에도 날짜는 `date_assertion` 후보로 review에 보냅니다.
- 상품 lookup 성공과 날짜 확인 성공은 별도 상태입니다.
- 카메라 권한 거부, `mediaDevices` 미지원, 장치 목록 실패는 `카메라를 사용할 수 없어요`를 보여주고 수동 숫자 입력을 유지합니다.
- 첫 인식 결과가 오면 reader와 media stream을 정리해 중복 입고를 방지합니다.

## 프론트 경로

- `apps/web/src/Prototype.tsx` — `BarcodeScanner`, raw scan 후 lookup 분기
- `apps/web/src/AddFoodSheet.tsx` — receipt review line별 GTIN 후보 조회·사용자 적용
- `apps/web/src/mealApi.ts` — `/api/barcodes/parse`, `/api/products/resolve/{barcode}` adapter
- `services/api/app/barcode.py` — GTIN·GS1·가변중량 분기
- `services/api/app/product_resolver.py` — local fixture 우선 상품 후보 resolver, C005·Open Food Facts v3.6 adapter, bounded cache

## 확인한 것

- `npm run build`에서 TypeScript/Vite build 통과
- ZXing 코드는 동적 chunk로 분리되어 초기 client chunk와 분리됨
- 수동 barcode 입력 → 상품 후보 조회 → “소비기한은 포장지의 날짜를 촬영” 안내 E2E 통과
- `navigator.mediaDevices`가 없는 환경 → 수동 입력 fallback E2E 통과
- 사용자에게 제공된 포장 라벨의 실제 날짜는 barcode parser가 아닌 PaddleOCR/label parser 경로에서 review 후보로 처리
- C005 mock 응답의 제품 기준 `POG_DAYCNT`를 legacy 참고 문구와 `storage_hint`로 보존
- Open Food Facts v3.6·C005 provider 상태와 cache hit 경계를 API 단위 테스트로 고정
- GS1 AI 17 날짜 후보와 상품 후보 동시 확인, 사용자 반영 후 `gs1` provenance 저장 E2E 통과

## 아직 확인하지 않은 것

- 실제 iPhone/Android 카메라 권한 승인과 후면 카메라 선택
- 흔들림·반사·저조도·곡면 포장에서 EAN/GS1 인식률
- 실제 GS1 DataMatrix 샘플의 카메라 인식 및 Syntax Engine 대조
- 기기별 torch 지원과 브라우저별 `getUserMedia` 정책
- 식품안전나라 실 key·실 quota에서 C005 호출과 최신 한국 상품 coverage
- 여러 API worker가 공유하는 Redis/PostgreSQL 상품 cache와 provider별 rate limiter

실기기 검증 전에는 “카메라가 모든 바코드를 읽는다”고 주장하지 않습니다. 현재 상태는 카메라 adapter·권한 실패 경계·수동 fallback이 구현된 단계입니다.
