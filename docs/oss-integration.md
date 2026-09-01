# OSS 통합 경계

## 1. 원칙

Rescue Meal은 라이브러리 개수로 평가하지 않습니다. 각 OSS의 원본 기능을 재현하고, 팀이 만든 adapter·데이터 계약·검증 로직을 분리합니다.

```text
원본 OSS 재현
→ 고정 버전·입력으로 동작 확인
→ Rescue Meal adapter 작성
→ 팀 고유 데이터 계약 적용
→ 기준 방식과 비교 검증
```

## 2. OSS·공개 데이터 역할표

FoodKeeper는 실행 라이브러리가 아니라 공개 데이터 후보입니다. 코드 dependency와 데이터 source의 라이선스·출처를 별도 표로 관리합니다.

추가 OSS와 공공 데이터의 채택·보류·제외 판단은 [OSS·공공 데이터 카탈로그](oss-catalog.md)에 기록합니다.

| OSS | 원본 재현 목표 | Rescue Meal 확장 | 현재 미확정 |
|---|---|---|---|
| Grocy | 바코드 입고, best-before, 개봉, 냉동·해동, 폐기, recipe API | HTTP adapter·system status·stock operation payload, 후속 commit/reconciliation 연결 | 실제 버전·product ID mapping·외부 readback·보상 동작 |
| ZXing Browser | EAN/UPC/QR/DataMatrix 카메라 해독 | 동적 카메라 scan UX, 첫 결과에서 stream 종료, raw scan·GS1 parser 연결 | 실기기 권한·한국 포장 인식률 |
| GS1 Barcode Syntax Engine | AI element string·Digital Link 파싱 | AI 11/13/15/16/17을 DateAssertion으로 변환 | 실제 식품의 날짜 포함 2D 비율 |
| Open Food Facts | 바코드로 상품 조회 | 한국 상품 후보·카테고리 enrichment | 한국 제품 coverage·정확성·rate limit |
| 식품안전나라 `I1250` | 제품명·품목제조보고 조회 | 한국 제품 기준 소비기한·품목유형 후보 | API 인증키·제품 수준 정보·개별 lot 아님 |
| 식품안전나라 `C005` | 바코드연계제품 조회 | legacy barcode mapping 비교 | 2018년 이후 최신화 중단 안내 |
| Docling | PDF·문서 layout/표/reading order 재현 | 전자 영수증·주문확인서 구조화 | 포장 라벨 실시간 OCR에는 과할 수 있음 |
| pgvector | PostgreSQL vector search 재현 | 상품명·재료명 유사도 검색 | Qdrant와 MVP 동시 사용 금지 |
| Open Food Facts taxonomy | 다국어 category/ingredient taxonomy | 사용자 입력 autocomplete·canonical 후보 | 사용자 기여 정보와 coverage 검증 |
| FoodOn | 식품 ontology 구조 확인 | generic food·ingredient canonical mapping | 1학기 MVP에는 과할 수 있음 |
| Ollama | JSON Schema structured output 재현 | AI normalization·explanation 후보 | 구조 준수는 사실성 증거가 아님 |
| DVC | dataset·pipeline·experiment versioning | receipt/label fixture와 정답 버전 관리 | Git 저장소 초기화 후 채택 |
| MLflow/Ragas | AI trace·RAG metric 재현 | 모델·prompt·retrieval 품질 비교 | 사용자 서비스 runtime에 직접 넣지 않음 |
| 식품안전나라 `COOKRCP01` | 한국 조리 레시피 조회 | recipe fixture·재료 canonicalization | API 인증키·재료 mapping 필요 |
| USDA FoodData Central | 영양 데이터 조회 | 영양정보 enrichment | 한국 소비기한·보관 안전 출처 아님 |
| PaddleOCR | 한국어 OCR·KIE 예제 재현 | 영수증 라인·라벨 날짜·중량 추출 | 곡면·반사·감열지 정확도 |
| invoice2data | 템플릿 기반 invoice line 추출 | 국내 매장 2~3개 영수증 템플릿 | 종이 영수증 다양성, 유지보수 비용 |
| USDA FoodKeeper Data | 공식 데이터셋 구조·냉장/냉동/실온 기간 조회 | StorageRule reference import | 한국 적용 가능성, 번역·분류 mapping |
| OR-Tools | 제약식 기반 scheduling 예제 | 소비 우선 재료·시간·부족 재료를 반영한 3일 식단 | 목적함수·해 없음 처리 |
| ntfy | HTTP 알림 송수신 | Rescue Queue 알림 | 인증·topic privacy 구성 |

## 3. 권장 통합 구조

### Companion service 우선

Grocy를 직접 대규모 수정하기보다 초기에는 다음 구조를 권장합니다.

```text
Rescue Meal PWA
→ FastAPI adapter
   ├ receipt OCR pipeline
   ├ barcode and GS1 parser
   ├ product resolver
   ├ date provenance service
   ├ storage rule service
   ├ rescue planner
   └ Grocy REST API
```

장점:

- Grocy 원본 재현과 팀 고유 변경을 분리해 설명할 수 있음
- upstream 업데이트와 팀 코드를 분리할 수 있음
- OCR·최적화에 Python 생태계를 사용하기 쉬움
- 실패 시 Grocy stock을 직접 오염시키기 전에 review gate를 둘 수 있음

단점:

- Grocy와 Rescue Meal 사이 ID·transaction consistency가 필요함
- 두 서비스의 인증·오류·버전 호환을 관리해야 함
- 일부 기능은 Grocy 내부 수정이 더 자연스러울 수 있음

## 4. 영수증 파이프라인

```text
image/PDF
→ image quality gate
→ PaddleOCR text boxes
→ store/template classifier
→ invoice2data or custom line parser
→ product alias matcher
→ review queue
→ atomic Grocy stock commit
```

매장별 template adapter는 프로젝트의 명확한 팀 고유 변경점이 될 수 있습니다. 처음부터 모든 영수증을 지원하지 않고 2~3개 형식으로 제한합니다.

## 5. 저장 기간 데이터

식품의약품안전처의 보관 온도·표시 제도 안내를 한국 사용자 문구의 우선 근거로 사용합니다. USDA FoodKeeper는 공개 데이터 구조와 식품별 냉장·냉동·pantry 기간을 제공하지만, 한국의 제품 라벨과 보관환경을 대체하지 않습니다.

사용 원칙:

- 포장 표시 날짜와 제조사 보관방법 우선
- 한국 공식 안내 우선
- 해외 공개 데이터는 `reference_only`
- rule source·jurisdiction·version 필수
- 규칙이 없으면 날짜를 만들지 않고 사용자 알림만 제공

## 6. 라이선스·출처 체크리스트

구현 전에 각 dependency와 데이터셋에 대해 다음을 기록합니다.

- 정확한 repository URL
- pinned version 또는 commit
- 코드 라이선스
- 데이터 라이선스
- attribution 의무
- 수정·재배포 의무
- API 이용약관과 rate limit
- 사용자 업로드 이미지의 저장·삭제 정책
- upstream issue/PR 가능성

현재 문서의 OSS 명칭은 기술 후보이며 라이선스 검토 완료를 뜻하지 않습니다.

### 공식 출처 후보

- Grocy: https://github.com/grocy/grocy
- ZXing Browser: https://github.com/zxing-js/browser
- GS1 Barcode Syntax Engine: https://github.com/gs1/gs1-syntax-engine
- Open Food Facts API: https://openfoodfacts.github.io/openfoodfacts-server/api/
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR
- invoice2data: https://github.com/invoice-x/invoice2data
- USDA FoodKeeper Data: https://catalog.data.gov/dataset/fsis-foodkeeper-data
- OR-Tools: https://developers.google.com/optimization
- ntfy: https://docs.ntfy.sh/
- 식품의약품안전처 소비기한 안내: https://www.mfds.go.kr/brd/m_580/view.do?seq=81

## 7. 원본 재현과 검증 층

| 층 | 증거 |
|---|---|
| OSS reproduce | 각 프로젝트 공식 예제의 고정 입력·출력 |
| Source | adapter와 데이터 mapping test |
| Simulation | receipt fixture·storage event·planner 고정 결과 |
| Build | Docker Compose 및 서비스 healthcheck |
| Runtime | 실제 카메라·영수증·라벨 사용자 흐름 |
| Human | 등록 시간·수정 부담·표시 문구 이해 |
| Outcome | 실제 소비·폐기 기록 변화, 별도 장기 관찰 |

한 층의 PASS를 다른 층의 증거로 승격하지 않습니다.
