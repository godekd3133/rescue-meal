# 바코드 상품 resolver 운영 경계

기준일: 2026-09-05

이 문서는 바코드로 “어떤 상품인가”를 보조적으로 찾는 흐름과, 그 결과를 “이 팩의 소비기한”으로 오해하지 않도록 하는 운영 경계를 정의합니다.

## 결론

일반 EAN/UPC/GTIN 바코드에는 보통 상품 식별값만 있습니다. 따라서 MealRescue는 다음을 별도 상태로 취급합니다.

```text
바코드
→ GTIN/GS1 형식 파싱
→ 제품 master 후보 조회
→ 제품 기준 보관·기간 참고값 표시
→ 사용자가 상품을 확인
→ 포장지 날짜 또는 GS1 날짜를 별도 DateAssertion으로 확인
```

제품 resolver가 반환한 `shelf_life_text`는 제조·품목 수준의 참고 문구입니다. `제조일로부터 12개월`, `실온보관 2년`처럼 제조일 또는 보관 조건이 필요한 문구를 개별 팩의 확정 날짜로 계산하지 않습니다.

## Provider 순서와 역할

### local fixture/catalog

개발·데모 환경에서 가장 먼저 확인합니다. 프로젝트가 직접 검토한 데이터이므로 confidence가 가장 높지만, fixture가 실제 최신 상품 catalog라는 뜻은 아닙니다.

### 식품안전나라 C005

외부 lookup이 켜져 있고 `MFDS_API_KEY`가 있을 때 바코드로 조회합니다. 공식 응답은 제품명, 식품 유형, 제조사, 유통바코드, `POG_DAYCNT`(소비기한/유통기한 문구)를 포함할 수 있습니다.

C005는 한국 상품에 직접적인 장점이 있지만, 식품안전나라 안내에 따르면 대한상공회의소 유통물류진흥원 정보가 2018년 이후 최신화 중단된 legacy 데이터입니다. 그래서 결과에는 다음을 함께 남깁니다.

- `source: mfds_c005`
- `source_freshness: legacy`
- `shelf_life_text`
- `storage_hint` — 문구에 냉장·냉동·실온이 명시된 경우에만 보조 힌트
- 최신 라벨과 개별 팩 확인 필요라는 provenance note

### Open Food Facts v3.6 — 바코드 단건 조회

사용자 기여 상품 master를 상품명·브랜드·카테고리·용량 enrichment 후보로 사용합니다. 현재 adapter는 deprecated된 v2가 아닌 Open Food Facts v3.6 product read endpoint를 사용하고, `lc=ko`, `cc=kr`, `product_type=all`을 전달합니다. v3.6의 `status=success`/`success_with_errors` envelope를 읽으며, legacy numeric status는 새 계약으로 취급하지 않습니다. 데이터가 없거나 지역 상품 정보가 부족할 수 있으므로 항상 confidence와 provenance를 보여줍니다. Open Food Facts 공식 API 문서의 권장 User-Agent 형식과 read rate limit을 준수하기 위해 서버 adapter에서 User-Agent를 설정하고, 반복 조회는 bounded cache로 줄입니다. `HTTP 429`와 문서에서 rate limit으로 안내하는 `HTTP 503`은 `rate_limited`로 분리해 짧은 실패 TTL만 적용합니다.

### Open Food Facts 레거시 텍스트 검색 — 상품명 후보 fallback

영수증 한 줄의 축약 상품명이 I1250에서 검색되지 않을 때만, 사용자가 `제품 기준 후보 조회`를 누르거나 비동기 enrichment worker가 해당 line을 처리하는 동안 레거시 `/cgi/search.pl` 텍스트 검색을 한 번 시도합니다. 최신 v3에는 일반 full-text search가 없으므로 이 경로를 autocomplete나 search-as-you-type에 사용하지 않습니다. 요청은 `search_terms`, `search_simple=1`, `action=process`, `json=1`, 제한된 `page_size`, 필요한 `fields`만 전달합니다.

검색 후보에는 상품명·브랜드·카테고리·용량·상품 URL만 저장합니다. 검색 후보의 confidence는 최대 `0.66`으로 제한하고 `Open Food Facts 검색 후보(사용자 기여 데이터)` provenance를 붙입니다. `shelf_life_text`, `storage_hint`, `DateAssertion`, `safe_to_eat`는 만들지 않습니다. 결과를 실제 영수증 line에 적용해도 `requires_review=true`이며, source는 `open_food_facts`로 보존됩니다.

I1250과의 순서는 다음과 같습니다.

```text
사용자 확인 요청 또는 enrichment worker
→ MFDS I1250 제품명 검색
→ matched면 I1250 후보 반환
→ not_found/unavailable/rate_limited면 Open Food Facts 검색 fallback
→ 후보가 있어도 사용자가 선택·확인하기 전에는 재고 lot를 확정하지 않음
```

Open Food Facts의 검색 rate limit은 상품 단건 조회와 분리된 `open_food_facts_search` bucket으로 관리하고, 동일 query·limit는 `open_food_facts:` cache-key prefix와 shared SQL single-flight로 중복 호출을 억제합니다. 공식 문서가 안내하는 검색 호출 제한을 넘기지 않도록 UI에는 자동 완성 요청을 연결하지 않습니다.

### 식품안전나라 I1250

I1250은 품목제조보고의 제품명·제조사·품목 유형·`POG_DAYCNT` 같은 제품/보고서 수준 정보를 제공합니다. 현재 barcode endpoint에서 직접 호출하지 않습니다. 공식 요청 인자에 바코드 필터가 없기 때문에, 바코드에서 I1250을 직접 찾는다고 가정하면 잘못된 mapping을 만들 수 있습니다. 현재는 별도 제품명 review endpoint와 receipt review의 사용자가 누르는 enrichment 버튼, receipt draft와 분리된 비동기 enrichment worker로 연결되어 있습니다. 실제 MFDS key 호출·quota·coverage와 다중 process readback은 운영 gate로 남아 있습니다.

## API 계약

```http
GET /api/products/resolve/{barcode}
```

예시 응답의 핵심은 다음과 같습니다.

```json
{
  "barcode": "8801791000055",
  "status": "matched",
  "candidates": [
    {
      "source": "mfds_c005",
      "canonical_name": "매일맛있는진간장골드",
      "brand": "매일식품주식회사",
      "category": "혼합간장",
      "shelf_life_text": "실온보관 2년",
      "storage_hint": "ambient",
      "source_freshness": "legacy",
      "confidence": 0.8,
      "provenance_note": "식품안전나라 C005 제품 기준 후보 ..."
    }
  ],
  "provider_statuses": {
    "mfds_c005": "matched",
    "open_food_facts": "not_found"
  },
  "requires_review": true
}
```

`status`의 의미는 다음과 같습니다.

| status | 의미 |
|---|---|
| `matched` | 하나의 provider 후보가 확인됨. 그래도 사용자의 상품 확인은 필요함 |
| `partial` | 둘 이상의 후보가 반환됨. 동일 상품인지 사용자가 비교해야 함 |
| `not_found` | provider는 응답했지만 후보가 없음 |
| `provider_unavailable` | 외부 조회가 꺼져 있거나 provider 장애·한도 초과로 후보를 확정하지 못함 |

Provider별 `provider_statuses`는 전체 결과 status보다 자세한 운영 원인을 제공합니다. 외부 provider가 하나 실패해도 다른 provider의 후보는 보존합니다.

I1250 제품명 조회는 barcode endpoint와 분리하고, MFDS miss 뒤 Open Food Facts fallback을 선택적으로 연결합니다.

```http
GET /api/products/resolve-name/{product_name}
```

이 endpoint는 `RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS=true`일 때 동작합니다. `MFDS_API_KEY`가 있으면 I1250을 먼저 호출하고, key가 없거나 I1250에서 후보를 찾지 못하면 공개 Open Food Facts fallback만으로도 review 후보를 확인할 수 있습니다. 결과 후보는 제품명·제조사·품목유형·`POG_DAYCNT` 참고값을 가지며 `requires_review=true`입니다. I1250에 후보가 없으면 Open Food Facts 검색 후보로 fallback할 수 있고, 이때 응답 `provider`와 후보 `source`는 `open_food_facts`가 됩니다. `POG_DAYCNT`가 있어도 제조일과 개별 포장 상태가 없으므로 날짜 assertion을 만들지 않습니다. Open Food Facts fallback에는 제품 기준 기간을 채우지 않고 실제 상품명·포장지 날짜 확인만 요구합니다.

## Cache·provider rate limit 정책

`ProductLookupCache`는 메모리 모드의 process-local fallback이고, 파일 기반
SQLite 또는 PostgreSQL API에서는 `SharedProductLookupCache`가 공용 SQL
projection을 사용합니다. 공용 cache에는 product master 후보만 저장하며
개별 팩의 날짜·lot·사용자 재고는 저장하지 않습니다.

- 성공·부분 성공: 기본 7일
- 상품 없음: 기본 15분
- provider 장애·한도 초과: 기본 60초
- 최대 2,000개 key의 bounded touch-based eviction
- namespace를 cache key에 포함해 provider/schema 변경 시 구 세대와 분리
- 개별 팩 날짜는 cache하지 않음. cache되는 것은 제품 master 후보뿐임

cache miss는 `product_lookup_leases` single-flight projection으로 짧게
소유권을 예약합니다. 첫 worker가 provider를 조회하는 동안 다른 worker는
최대 wait window만큼 공용 cache를 polling하고, 결과가 저장되면 그 값을
반환합니다. 첫 worker가 crash하면 lease 만료 뒤 다른 worker가 소유권을
회수합니다. lease에는 owner와 시각만 저장하고 상품 데이터는 저장하지
않습니다.

PostgreSQL projection은 `rescue_product_lookup_cache`와
`rescue_product_provider_rate_limit_events`를 migration
`012_product_provider_runtime.sql`로 만들고, 각 API worker가 자기
connection으로 같은 결과와 호출 window를 읽고 씁니다. SQLite 파일 모드도
동일한 테이블 계약과 `BEGIN IMMEDIATE`를 사용해 개발 환경에서 두
connection의 공유 readback을 검증합니다.

외부 provider 호출 전에는 `ProductProviderRateLimiter`가 provider별
window를 확인합니다. durable 모드에서는 PostgreSQL advisory transaction
lock 또는 SQLite immediate transaction으로 한 번만 event를 기록합니다.
한도를 넘으면 provider 호출 자체를 생략하고 `rate_limited` 후보 상태를
반환합니다. 성공 cache hit는 rate-limit event를 추가하지 않습니다.

I1250·Open Food Facts 제품명 조회도 별도 bounded cache를 사용합니다. 파일 SQLite/PostgreSQL
모드에서는 `SharedProductNameLookupCache`가 query·limit별 결과와
single-flight lease를 공용 projection에 저장하고, 메모리 모드만
`ProductNameLookupCache` fallback을 사용합니다.

- 성공: 기본 1일
- 상품 없음: 기본 10분
- provider 장애·한도 초과: 기본 60초
- 최대 1,000개 정규화 상품명 key
- namespace로 barcode product cache와 분리
- Open Food Facts 검색 key는 `open_food_facts:` prefix를 붙여 I1250 query와 충돌하지 않음
- Open Food Facts 검색 rate-limit은 `open_food_facts_search` provider bucket으로 분리

메모리 모드는 여전히 단일 process 개발용입니다. PostgreSQL production에서는
012·013·014·015·016·017 migration과 `/ready` schema gate가 barcode/name 공용 cache·rate-limit
table/index, normalized lot의 상품 후보 provenance 컬럼, provenance audit event,
상품 프로필 correction audit event 및 DateAssertion 보관조건 컬럼을
확인합니다. 다만 provider별 실제 quota·backup/restore·장애 시나리오는
외부 운영 acceptance에서 별도로 확인해야 합니다.

바코드 또는 영수증 상품 후보를 실제 식품 lot에 적용할 때는 `FoodResponse.product_provenance`에
source·원본 URL·confidence·source freshness·상품 기준 보관 힌트·검토 메모를
저장합니다. 이 provenance는 후보를 선택한 이유를 재현하기 위한 값이며,
개별 포장에 인쇄된 소비기한을 대신하지 않습니다. 바코드 manual 입력에서
상품명 후보를 사용자가 수정하면 프론트는 provenance를 제거하고 직접 입력으로
전환하며, 영수증 commit에서는 최종 canonical 이름과 일치하지 않는 후보를
backend가 stale evidence로 판단해 provenance와 함께 제거합니다.

식품 상세의 `상품 정보 수정`은 상품명·브랜드·분류를 사용자가 확인한 값으로 직접 저장합니다.
현재 product provenance가 있으면 해당 후보는 제거되지만, 수량·단위·구매일·보관 상태·개봉 상태와
포장지 날짜의 `DateAssertion`은 건드리지 않습니다. 수정 전후 상품 프로필은
`FoodProductInfoAuditEvent`로 보존하고, provenance 제거는 별도의 removed event로 남겨 나중에
왜 source가 사라졌는지 설명할 수 있습니다. 이 기능도 product master의 최신성이나 개별 포장의
소비기한을 자동 확정하는 기능은 아닙니다.

## Provider runtime status

운영자는 product-enrichment worker token으로 다음 endpoint를 조회할 수
있습니다.

```http
GET /api/internal/product-runtime/status
X-Rescue-Meal-Product-Enrichment-Worker-Token: <service-token>
```

응답에는 외부 lookup 활성화 여부, product/name cache backend가
`shared_sql`인지 `process_local`인지, provider rate limiter backend, 그리고
현재 API worker의 aggregate metrics만 포함됩니다. barcode·상품명·source URL·
API key·응답 원문은 포함하지 않습니다.

metrics는 worker-local snapshot입니다. `cache_hits`, `cache_misses`,
`single_flight_waits`, `single_flight_hits`, `single_flight_timeouts`,
`provider_calls`, `rate_limited`, 결과 status별 count, 마지막 latency/status를
확인할 수 있습니다. 여러 worker의 합계나 장기 추세를 상용 운영에서
보려면 이 safe snapshot을 OpenTelemetry/Prometheus 같은 외부 collector로
전달하는 별도 adapter가 필요합니다.

표준 scrape가 필요하면 같은 token으로 다음 endpoint를 사용합니다.

```http
GET /api/internal/product-runtime/metrics
X-Rescue-Meal-Product-Enrichment-Worker-Token: <service-token>
```

응답은 Prometheus text format이며 cache hit/miss, single-flight outcome,
provider call/result/rate-limit/last latency를 고정된 safe label과 함께
반환합니다. barcode·상품명·source URL·secret은 label이나 sample value에
넣지 않습니다. Prometheus가 replica별로 scrape하면 worker-local metric을
replica label 기준으로 집계할 수 있습니다.

barcode 화면에서는 provider `unavailable`·`rate_limited` 상태를 기술적인
provider 이름 대신 “일부 상품 source 확인 필요”로 표시합니다. 후보가
있더라도 일부 source가 실패했다는 사실을 숨기지 않으며, 포장지 상품명과
날짜를 직접 확인하도록 안내합니다.

## 설정

`.env` 또는 secret manager에서 서버에만 주입합니다.

```dotenv
RESCUE_MEAL_ENABLE_EXTERNAL_LOOKUPS=false
RESCUE_MEAL_PRODUCT_LOOKUP_TIMEOUT_SECONDS=4
RESCUE_MEAL_PRODUCT_CACHE_TTL_SECONDS=604800
RESCUE_MEAL_PRODUCT_NEGATIVE_CACHE_TTL_SECONDS=900
RESCUE_MEAL_PRODUCT_FAILURE_CACHE_TTL_SECONDS=60
RESCUE_MEAL_PRODUCT_CACHE_MAX_ENTRIES=2000
RESCUE_MEAL_PRODUCT_CACHE_NAMESPACE=product-master-v3
RESCUE_MEAL_PROVIDER_RATE_LIMIT_MAX_REQUESTS=10
RESCUE_MEAL_PROVIDER_RATE_LIMIT_WINDOW_SECONDS=60
RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_LEASE_SECONDS=45
RESCUE_MEAL_PRODUCT_SINGLE_FLIGHT_WAIT_SECONDS=5
RESCUE_MEAL_PRODUCT_NAME_CACHE_TTL_SECONDS=86400
RESCUE_MEAL_PRODUCT_NAME_CACHE_NAMESPACE=product-name-v1
RESCUE_MEAL_PRODUCT_NAME_NEGATIVE_CACHE_TTL_SECONDS=600
RESCUE_MEAL_PRODUCT_NAME_FAILURE_CACHE_TTL_SECONDS=60
RESCUE_MEAL_PRODUCT_NAME_CACHE_MAX_ENTRIES=1000
RESCUE_MEAL_OPEN_FOOD_FACTS_BASE_URL=https://world.openfoodfacts.org
RESCUE_MEAL_OPEN_FOOD_FACTS_API_VERSION=v3.6
RESCUE_MEAL_OPEN_FOOD_FACTS_USER_AGENT=RescueMeal/0.1 (contact@example.com)
RESCUE_MEAL_MFDS_BASE_URL=https://openapi.foodsafetykorea.go.kr
MFDS_API_KEY=
```

외부 lookup은 기본값이 `false`입니다. Open Food Facts 이용정책·호출량, 식품안전나라 API key·이용신청·제공 범위·데이터 최신성·저장 정책을 확인한 뒤 명시적으로 켭니다.

production preflight에서는 외부 lookup을 켠 경우 실제 contact가 포함된
Open Food Facts User-Agent, 안전한 API version·HTTPS provider URL, provider
rate-limit 범위, cache namespace, single-flight lease가 wait보다 긴지까지
검사합니다. 잘못된 값은 서버 기동 전 error로 차단하며, secret 값 자체는
오류 메시지에 출력하지 않습니다.

## 사용자 흐름

바코드 후보를 받으면 바코드 sheet에서 상품명·브랜드·용량·제품 기준 기간 문구·보관 힌트·출처를 보여줍니다. `이름 채우기`는 manual 입력 화면에 상품명을 채우고 보관 힌트가 명시된 경우에만 냉장·냉동·실온 선택을 보조합니다. 사용자는 실제 보관 위치와 포장지 날짜를 다시 확인해야 합니다.

상품명만으로는 다음 값을 자동으로 만들지 않습니다.

- `actual_printed` 소비기한
- 개별 lot의 제조일·포장일
- `safe_to_eat` 판정
- 부패 여부

영수증 review에서 사용자가 OCR 이름을 canonical 상품명으로 확인하면 workspace별 별칭으로 저장할 수 있습니다. 다음 영수증 draft부터는 `사용자가 확인한 별칭 → 검토된 local rule → parser 후보` 순서로 매칭 후보를 만들고, 후보의 source와 provenance를 review line에 표시합니다. 별칭은 상품 master 보정값이지 소비기한·보관 상태의 확정값이 아닙니다.

```http
GET /api/product-aliases?q=우유
```

별칭 readback에는 정규화 key, 원문 이름, canonical 이름, 확인 횟수와 마지막 갱신 시각이 포함됩니다. raw receipt OCR 전체를 별칭으로 저장하지 않고 상품명 field만 제한적으로 보존합니다.

## 후속 운영 gate

상용 배포 전에 다음을 별도로 검증합니다.

1. 한국 마트 상품 barcode benchmark에서 C005·Open Food Facts coverage와 top-1 정확도를 측정합니다.
2. C005 legacy 결과와 최신 라벨 OCR 결과가 충돌할 때 label OCR/user confirmation이 우선인지 fixture로 고정합니다.
3. C005의 실제 API key, 호출 quota, provider 장애·rate-limit 응답을 sandbox에서 readback합니다.
4. 다중 API worker에서 Redis/PostgreSQL shared cache와 provider별 rate limiter를 검증합니다.
5. 사용자에게 노출되는 source URL·provenance·legacy 경고가 후보 카드와 review audit에 함께 남는지 확인합니다.

2026-09-05 read-only probe에서는 Open Food Facts v3.6 barcode product read가 성공했지만 legacy `/cgi/search.pl` 상품명 검색은 HTTP 503을 반환했고, adapter는 이를 `rate_limited`로 변환해 후보 없이 review 상태를 유지했습니다. 이 결과는 장애 처리 확인이지 검색 coverage·성공률 증거가 아니므로, 운영에서는 barcode·수동 입력·workspace alias를 검색 실패 recovery path로 함께 제공합니다 ([Open Food Facts name fallback readback](../evidence/open-food-facts-name-fallback-readback-2026-09-05.md)).

## 공식 출처

- [식품안전나라 바코드연계제품정보 C005](https://foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C005)
- [식품안전나라 식품(첨가물)품목제조보고 I1250](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=656&show_cnt=10&start_idx=1&svc_no=I1250&svc_type_cd=API_TYPE06)
- [Open Food Facts v3 product API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/)
- [Open Food Facts API usage and rate limits](https://openfoodfacts.github.io/openfoodfacts-server/api/)
