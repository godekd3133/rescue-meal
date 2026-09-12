# Rescue Meal OSS·공공 데이터 카탈로그

기준일: 2026-09-03

이 문서는 MealRescue에 도움이 될 수 있는 오픈소스와 공개 데이터 후보를 분류합니다. 이름이 목록에 있다는 것은 채택·설치·성능 검증이 끝났다는 뜻이 아닙니다.

## 1. 이번 프로젝트에 가장 가치 있는 추가 후보

### 식품안전나라 식품(첨가물)품목제조보고 — `I1250`

오픈소스 코드는 아니지만 한국 제품 정보에 가장 직접적으로 도움이 되는 공공 Open API 후보입니다.

- 제품명 `PRDLST_NM`
- 품목유형명
- 품목보고번호
- 소비기한 관련 `POG_DAYCNT`
- 허가일·생산종료 여부·업종·제품형태
- 제품명·제조사명 등 검색 파라미터

사용 방법:

```text
OCR 상품명
→ /api/products/resolve-name/{product_name}
→ 제품명·품목유형·제조사 후보 확인
→ 사용자가 제품 확인
→ 제품 기준 보관·기간 참고값을 review 문맥으로 저장
```

주의:

- 이 데이터는 제품 또는 품목제조보고 수준입니다.
- 개별 팩의 로트·제조일·포장에 실제로 찍힌 소비기한을 대체하지 않습니다.
- `제조일로부터 12개월` 같은 기간 표현은 제조일이 없으면 날짜로 계산할 수 없습니다.
- API 인증키와 이용신청이 필요합니다.
- 실제 API 호출 제한과 현재 데이터 범위는 사용신청 후 다시 확인해야 합니다.
- 현재 구현은 제품명 review endpoint와 receipt draft용 비동기 enrichment job·worker contract·review polling까지 연결되어 있습니다. 실제 MFDS key 호출과 최신 coverage benchmark는 운영 gate로 남아 있습니다.

출처: [식품(첨가물)품목제조보고 Open API](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=656&show_cnt=10&start_idx=1&svc_no=I1250&svc_type_cd=API_TYPE06)

### 식품안전나라 바코드연계제품정보 — `C005`

바코드, 제품명, 식품유형, 제조사명, 소비기한 필드를 함께 제공하는 한국 공공 API입니다. MealRescue에는 opt-in `MfdsC005Resolver`로 연결해 제품 후보와 `POG_DAYCNT` 참고 문구를 반환합니다.

하지만 공식 안내에 따르면 대한상공회의소 유통물류진흥원 정보가 2018년 이후 최신화 중단된 상태입니다. 따라서 최신 상품의 primary source로 사용하지 않고, 다음 용도로만 둡니다.

- 오래된 상품 fixture 확인
- 바코드·제품명 mapping 후보
- 제품 기준 소비기한·보관 문구의 참고값
- I1250 또는 라벨 OCR 결과와의 비교

구현 경계:

- `source_freshness=legacy`를 붙이고 최신 상품의 primary source로 승격하지 않습니다.
- `POG_DAYCNT`는 개별 팩에 인쇄된 날짜가 아니므로 `DateAssertion`으로 만들지 않습니다.
- 응답은 바코드·제품명·제조사·식품유형·제품 기준 기간 문구·명시적 보관 힌트만 후보로 보존합니다.

출처: [바코드연계제품정보 C005](https://foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C005)

### 식품안전나라 조리식품 레시피 — `COOKRCP01`

한국식 레시피, 조리 방법, 이미지, 열량·영양성분을 제공하는 공공 API 후보입니다.

MealRescue의 1차 식단 fixture를 직접 수집하는 부담을 줄일 수 있지만, 레시피 재료명과 재고 상품명을 연결하는 canonicalization은 팀이 별도로 해야 합니다.

사용 방법:

```text
COOKRCP01 레시피
→ 재료·단위·수량 정규화
→ FoodOn 또는 local canonical food id 연결
→ Grocy recipe fixture 생성
→ Rescue Planner 평가셋으로 고정
```

출처: [식품안전나라 조리식품 레시피 Open API](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=COOKRCP01)

## 2. 문서·영수증·라벨 처리

### pypdf — 전자 영수증 text-layer 경로에 채택

pypdf는 Python file-like stream에서 PDF를 읽고 페이지별 텍스트를 추출할 수 있는
오픈소스 라이브러리입니다. [pypdf PdfReader API](https://pypdf.readthedocs.io/en/stable/modules/PdfReader.html)

MealRescue에서는 먼저 전자 영수증처럼 PDF 안에 텍스트가 포함된 입력에만 사용합니다.
추출 text는 기존 receipt parser의 review draft로 연결하지만, pypdf text position을
이미지 bbox처럼 취급하지 않습니다. 이미지로만 된 PDF는 pypdfium2 bounded render
경로로 넘기고, 암호화 PDF나 renderer quota 초과는 자동 상품 추정 없이 명시적으로
중단합니다.

### pypdfium2 — scan PDF bounded render 경로에 채택

pypdfium2는 PDFium 기반으로 bytes/stream에서 PDF를 열고 페이지를
`render(scale=...)`한 뒤 PIL 이미지로 변환할 수 있는 렌더링 adapter입니다.
[pypdfium2 공식 저장소](https://github.com/pypdfium2-team/pypdfium2)

MealRescue에서는 최대 3쪽·scale 2로만 렌더링해 이미지 전용 PDF를 기존
PaddleOCR adapter에 전달합니다. pypdfium2 자체와 PDFium의 배포 라이선스 및
번들 dependency license는 실제 배포 artifact에서 다시 확인해야 합니다.
렌더링된 page-local bbox는 원본 multi-page PDF overlay로 승격하지 않습니다.

### Docling — PDF layout 고도화 후보

Docling은 PDF·Office·이미지 등을 구조화된 Markdown·JSON으로 변환하고, PDF layout·table·reading order·OCR을 다루는 오픈소스 문서 처리 도구입니다. [Docling 공식 사이트](https://docling.org/)

MealRescue에서는 다음 입력에 적합합니다.

- 전자 영수증 PDF
- 온라인 주문확인서
- 보증서·제품 설명서
- 여러 열이 있는 PDF 영수증

현재 사진처럼 작은 포장 라벨의 실시간 OCR은 PaddleOCR를 우선하고, Docling은 PDF·복잡한 문서의 구조화 경로로 분리합니다.

팀 고유 확장:

- 문서 영역을 `receipt_header`, `line_items`, `payment`, `label_date`, `ingredients`로 mapping
- bbox와 추출 필드 연결
- 문서 유형별 review queue 생성

### Paperless-ngx — 이번 MVP 제외, 아키텍처 참고

Paperless-ngx는 OCR·검색·태그·문서 유형·REST API를 제공하는 self-hosted 문서 관리 시스템입니다. [Paperless-ngx 공식 문서](https://docs.paperless-ngx.com/), [REST API](https://docs.paperless-ngx.com/api/)

영수증 원본 보관에는 매력적이지만, Grocy와 MealRescue의 receipt·stock 흐름까지 함께 넣으면 문서 보관·권한·동기화·삭제 정책이 중복됩니다.

- MVP: 사용하지 않음
- 후속 옵션: 영수증 원본 보관 consumer로 연결
- 채택 조건: 원본 PDF/A 보관과 검색이 핵심 사용자 문제로 확정될 때

### invoice2data — 매장별 템플릿 실험 후보

PDF·텍스트·OCR 결과를 YAML/JSON template과 line parser로 구조화할 수 있습니다. [invoice2data 공식 저장소](https://github.com/invoice-x/invoice2data)

국내 영수증의 범용 해결책으로 가정하지 않고, 2~3개 매장 형식의 adapter·baseline으로만 사용합니다.

## 3. 상품명·재료명 정규화

### Open Food Facts Taxonomy — 채택 후보

Open Food Facts는 카테고리·라벨·재료·포장 형태 등을 다국어 taxonomy로 정규화하고 suggestions API를 제공합니다. [Open Food Facts Taxonomy Suggestions](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/taxonomy/get-api-v3-taxonomy-suggestions-taxonomy/)

용도:

- OCR 상품명의 카테고리 후보
- ingredient synonym 후보
- 사용자 입력 autocomplete

주의:

- 한국 제품 coverage와 번역 품질은 별도 측정
- taxonomy suggestion은 상품 확인이 아님
- Open Food Facts의 사용자 기여 정보는 출처와 confidence를 보존

### FoodOn — 연구·정규화 실험 후보

FoodOn은 원재료·식품 형태·가공·포장·영양 관련 용어를 연결하는 open ontology입니다. [FoodOn 공식 사이트](https://foodon.org/), [FoodOn 저장소](https://github.com/foodontology/foodon)

장점:

- `버섯`, `맛타리버섯`, `생버섯` 같은 generic food와 product-level item을 분리할 수 있음
- 원재료·가공·보관 관련 semantic category를 확장할 수 있음
- 레시피 ingredient와 재고 product 사이의 중간 canonical id를 만들 수 있음

단점:

- ontology 도입 자체가 1학기 MVP보다 큼
- 한국어 alias·현실적인 장보기 표현은 별도 mapping 필요

권장 순서:

```text
MVP: local canonical_food_id + 수동 alias
→ pilot: FoodOn term mapping
→ 필요 시 ontology-backed recipe matcher
```

## 4. 벡터 검색과 상품 유사도

### pgvector — Qdrant 대안, 추천

PostgreSQL 안에 embedding을 저장하고 exact·approximate nearest-neighbor 검색을 제공하는 오픈소스 확장입니다. [pgvector 공식 저장소](https://github.com/pgvector/pgvector)

MealRescue가 이미 PostgreSQL을 사용한다면 다음을 한 DB에서 처리할 수 있습니다.

- 영수증 raw name embedding
- canonical product embedding
- 레시피 ingredient embedding
- user-confirmed alias embedding
- metadata와 vector JOIN

장점:

- 별도 vector DB service가 필요 없음
- 상품·lot·alias와 embedding을 같은 transaction 범위에서 관리 가능
- SQL filter와 vector search를 함께 사용하기 쉬움

단점:

- embedding 규모가 커지면 별도 vector engine보다 운영 선택지가 줄 수 있음
- PostgreSQL extension 설치가 필요함

결정:

- MVP는 pgvector와 Qdrant를 동시에 사용하지 않음
- PostgreSQL 중심으로 간단히 시작하면 pgvector 우선
- 벡터 검색이 독립 서비스의 핵심이 되면 Qdrant를 별도 비교

## 5. 로컬 AI와 구조화된 출력

### Ollama Structured Outputs — optional provider contract 구현

Ollama는 JSON Schema를 이용해 모델 응답 구조를 제한하는 기능을 제공합니다. [Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)

MealRescue에서의 용도:

- 상품명 정규화 후보
- OCR text block의 의미 분류
- 날짜 필드명 분류
- recipe ingredient canonicalization 후보
- `requires_user_confirmation` 생성

현재 구현은 이 후보를 무조건적인 자동 판정기로 사용하지 않습니다. `rules`가
기본 provider이고, `RESCUE_MEAL_INFERENCE_PROVIDER=ollama`일 때만 규칙 미매칭
priority 요청을 Ollama `/api/chat`으로 보냅니다. Pydantic schema 재검증·bounded
timeout·response size 제한·abstain·review-only response를 적용하며, printed
date/consumption date/safe-to-eat는 모델 schema에 넣지 않습니다. 실제 모델을
운영에 켜기 전에는 식품 category별 annotation benchmark와 source review가
필요합니다.

필수 경계:

- JSON 형식이 맞는 것과 사실이 맞는 것은 별개
- 검색된 공식 source를 응답에 연결
- source 없는 날짜는 `null`
- `safe_to_eat`는 생성하지 않음
- 모델 출력은 Pydantic/JSON Schema 검증 후 review queue로 보냄

### MLflow — AI 실험·추적 후보

MLflow는 LLM 호출 trace, latency, token usage, 품질 평가와 custom scorer를 기록하는 오픈소스 플랫폼입니다. [MLflow GenAI Evaluation](https://mlflow.org/docs/latest/genai/eval-monitor/)

용도:

- prompt/model version 비교
- 상품명 매칭 후보 정확도
- 날짜 의미 분류 오류
- retrieval latency
- 사용자 수정률과 model output 연결

MVP에서 사용자 서비스에 직접 넣지 않고, 개발·검증용 Docker profile로 두는 것이 좋습니다.

### Ragas — RAG 평가 후보

Ragas는 context precision·context recall·faithfulness·response relevancy 같은 RAG 평가 지표와 custom metric을 제공합니다. [Ragas Metrics](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/)

StorageRule·상품 정보·레시피 설명을 검색해 AI 설명을 만들 때 사용할 수 있습니다.

주의:

- Ragas 점수만으로 식품 안전성을 증명하지 않음
- 공식 source assertion exact match를 별도 평가
- 사람이 만든 정답 fixture와 함께 사용

## 6. 데이터·실험 재현

### DVC — 채택 후보

DVC는 Git과 별도로 dataset, pipeline, experiment output을 버전 관리하고 재현할 수 있게 합니다. [DVC Command Reference](https://dvc.org/doc/command-reference/)

MealRescue에서 관리할 것:

- 개인정보 제거 영수증 fixture
- 라벨 날짜 fixture
- OCR 정답 bbox·text
- 매장별 parser fixture
- 상품 alias mapping
- recipe canonicalization mapping
- storage rule snapshot
- planner 입력·출력

특히 이미지 원본을 Git에 넣지 않고, 승인된 fixture와 hash·annotation만 관리하는 데 유용합니다.

## 7. 영양·레시피 공개 데이터

### USDA FoodData Central — 선택적 enrichment

FoodData Central API는 식품·브랜드 식품의 영양 데이터를 애플리케이션에서 사용할 수 있게 제공합니다. [FoodData Central API Guide](https://fdc.nal.usda.gov/api-guide/)

용도:

- 열량·탄수화물·단백질 등 영양정보 보조
- recipe nutrition 계산 비교

제외 경계:

- 소비기한·보관 안전 정보로 사용하지 않음
- 한국 제품 coverage를 가정하지 않음
- 1차 MVP의 핵심 경로가 아님

## 8. 최종 채택 후보와 보류 후보

### MVP 우선

```text
Grocy
PaddleOCR
pypdf (text-layer electronic receipt)
pypdfium2 (bounded scan-PDF render)
ZXing Browser
GS1 Barcode Syntax Engine
식품안전나라 I1250 공공 API
FastAPI
PostgreSQL + pgvector
OR-Tools
ntfy
Docker Compose
```

### Feasibility spike 후 채택 판단

```text
Docling
invoice2data
Open Food Facts Taxonomy
FoodOn
Ollama Structured Outputs
DVC
MLflow
Ragas
식품안전나라 COOKRCP01
USDA FoodData Central
```

### 이번 학기 MVP에서 같이 넣지 않음

```text
Paperless-ngx
Mealie
Tandoor
Qdrant와 pgvector의 동시 사용
대규모 ontology reasoning
카드·마트 계정 자동연동
```

## 9. 라이선스와 데이터 출처 확인

각 후보의 현재 라이선스와 사용조건을 구현 전에 다시 고정합니다.

- 코드 dependency license
- 모델 weight license
- 공개 데이터 license
- API 이용신청·인증키
- rate limit
- attribution
- 업로드 이미지의 저장·삭제
- 학습·평가 데이터 재배포 가능 여부

공공 API가 공개되어 있다는 사실과 개별 제품의 소비기한을 보장한다는 사실은 다릅니다. 외부 데이터가 반환한 제품 기준 기간도 `source_reference`와 `retrieved_at`을 보존하고, 실제 포장 날짜와 분리합니다.
