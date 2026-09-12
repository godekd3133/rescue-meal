# 식단 조건과 알레르기 회피 설계

기준일: 2026-09-03

## 결론

Rescue Meal은 사용자가 피하고 싶은 주요 알레르기 항목을 workspace 조건으로 저장하고, 이후 단일 식단·대안 메뉴·3일 식단을 계산할 때 해당 조건을 서버에서 적용합니다. 이 기능은 식품 안전 또는 의료 판단이 아니라 **레시피 후보를 보수적으로 줄이는 선호 조건**입니다.

```text
식단 조건 설정
→ workspace preferences 저장
→ planner가 승인된 recipe metadata 확인
→ 회피 항목과 겹치는 recipe 제외
→ metadata가 없는 외부 recipe도 회피 조건이 있는 동안 제외
→ 남은 후보 중 재고·우선순위·조리시간으로 결정론적 선택
→ 화면에 알레르기 metadata 상태와 안전 경계 표시
```

## 현재 지원 항목

| 코드 | 화면 이름 | 현재 metadata source |
|---|---|---|
| `soy` | 대두·콩 | canonical ingredient의 콩·두부·간장·된장 등 curated rule 또는 명시 metadata |
| `egg` | 달걀 | 달걀·계란 등 curated rule 또는 명시 metadata |
| `milk` | 우유 | 우유·치즈·버터·생크림 등 curated rule 또는 명시 metadata |
| `fish` | 생선 | 참치·고등어·연어·생선 등 curated rule 또는 명시 metadata |
| `shellfish` | 갑각류·조개 | 새우·게·조개·굴 등 curated rule 또는 명시 metadata |
| `wheat` | 밀 | 밀가루·빵가루·파스타·국수·면 등 curated rule 또는 명시 metadata |
| `peanut` | 땅콩 | 땅콩 등 curated rule 또는 명시 metadata |
| `tree_nut` | 견과류 | 호두·아몬드·잣·캐슈 등 curated rule 또는 명시 metadata |

현재 팀 작성 starter recipe는 canonical ingredient와 검토된 제목·조리 단계에서 위 metadata를 결정론적으로 계산합니다. 재료 배열에 빠진 소스가 조리 단계에 명시된 경우까지 놓치지 않기 위한 보강입니다. 외부 recipe는 review를 통과해 planner에 들어오더라도 `allergens` metadata를 명시적으로 갖지 않으면 `unknown`으로 남습니다.

## 안전 모델

### `known`은 “알레르기 없음”이 아니다

`allergen_metadata_status=known`은 현재 recipe metadata와 curated rule이 확인되었다는 뜻입니다. `allergens=[]`는 현재 데이터에서 알려진 주요 항목이 없다는 뜻이지 다음을 보증하지 않습니다.

- 제조시설의 교차 접촉이 없다는 뜻이 아닙니다.
- 원재료 표시가 최신이라는 뜻이 아닙니다.
- 미량 성분·복합 조미료·소스의 모든 성분을 판독했다는 뜻이 아닙니다.
- 사용자의 개인적인 알레르기·질환에 안전하다는 뜻이 아닙니다.

따라서 화면에는 “확인된 주요 항목 없음” 또는 “확인 필요”를 구분해 보여주고, `safe_to_eat`·의료적 허용 여부·소비기한 확정값을 만들지 않습니다.

### metadata가 없으면 abstain

사용자가 하나라도 회피 항목을 저장한 경우 planner는 `recipe.allergens is None`인 후보를 제외합니다. 이 보수적 규칙으로 외부 recipe가 알레르기 metadata를 제공하지 않는 동안 추천하지 않게 합니다. 모든 후보가 제외되면 다음 응답을 반환합니다.

- `recipe_id: "no-match"`
- `preference_filtered: true`
- `preference_note`: metadata가 불명확한 recipe는 회피 조건이 설정된 동안 추천하지 않는다는 안내

현재 팀 작성 recipe처럼 metadata가 알려진 후보가 있으면, 회피 항목과 겹치지 않는 후보만 선택합니다. 재고가 충분해도 회피 조건을 만족하는 recipe가 없으면 임의의 recipe나 재료를 만들어내지 않습니다.

## API 계약

### 식단 조건

```http
GET /api/meal-preferences
```

```json
{
  "avoid_allergens": ["soy", "egg"]
}
```

```http
PUT /api/meal-preferences
Content-Type: application/json
```

```json
{
  "avoid_allergens": ["egg", "soy", "soy"]
}
```

서버는 허용된 8개 코드만 받고, 중복을 제거한 뒤 고정 순서(`soy → egg → milk → fish → shellfish → wheat → peanut → tree_nut`)로 저장·반환합니다. 알 수 없는 코드는 `422`로 거절합니다. 조건 변경은 현재 식단을 자동 저장하거나 재고를 차감하지 않으며, 프론트는 저장 성공 뒤 preview를 다시 계산합니다.

### MealPlan 확장 필드

단일 preview, options, multi-day preview와 저장 plan은 다음 필드를 함께 가집니다.

```json
{
  "allergens": ["soy"],
  "allergen_metadata_status": "known",
  "preference_filtered": false,
  "preference_note": null
}
```

`allergens`가 `null`이고 `allergen_metadata_status=unknown`이면 metadata가 없는 상태입니다. `preference_filtered=true`이면 회피 조건 때문에 일반 후보가 제외되어 추천이 보류된 상태입니다.

## 저장·workspace 경계

알레르기 조건은 전역 설정이 아니라 현재 workspace의 사용자 데이터입니다.

| 저장소/흐름 | 계약 |
|---|---|
| SQLite | `meal_preferences`의 `workspace` row에 JSON payload 저장 |
| PostgreSQL | migration `008_meal_preferences.sql`, `rescue_api_meal_preferences`, `(workspace_id, id)` 복합키 |
| export | `WorkspaceExportResponse.meal_preferences`로 포함; token·password·OCR 원문은 포함하지 않음 |
| guest → account | preview에서 `meal_preferences_changed`를 보여주고, 명시적 import 때만 복사; 결과는 `imported_meal_preferences`로 표시 |
| snapshot | 회피 조건과 recipe metadata가 MealPlan snapshot hash에 반영되어 다른 조건의 저장 plan을 조용히 재사용하지 않음 |

PostgreSQL readiness는 신규 테이블과 `workspace_id`, `id`, `payload`, `search_text` 컬럼을 모두 요구합니다. Compose fresh volume은 migration 001부터 026까지 순서대로 mount하며, 기존 volume은 `infra/postgres/migrate.sh`를 명시적으로 실행해야 합니다. 012는 workspace와 분리된 product-master cache·provider rate-limit window를 추가하고, 014는 normalized lot의 상품 후보 provenance, 015는 상품 provenance 변경 audit, 016은 사용자가 수정한 상품명·브랜드·분류의 product-info audit, 017은 표시 날짜가 전제하는 보관조건, 018은 영수증 GTIN과 Open Food Facts match source, 019는 장보기 입고 durable idempotency operation ledger, 020은 receipt commit의 key digest·payload fingerprint·결과 lot 목록과 실패 후 retry history, 021은 `active → deleting` durable account-deletion fence와 readiness 계약, 022는 normalized receipt의 `template_id`·`template_confidence`·`merchant_name` review metadata 보존, 023은 수동 식품 create/correction의 key digest·request fingerprint replay ledger, 024는 shared recipe catalog optimistic revision, 025는 workspace-scoped 사용자 정의 보관 위치와 normalized lot/event location reference, 026은 workspace export actor/time audit를 추가합니다. 상품 프로필 수정은 수량·보관 상태·표시 날짜를 변경하지 않으며, 보관조건 불일치는 날짜를 자동 변경하지 않고 확인 경고로만 표시합니다. GTIN은 상품 식별자일 뿐 개별 포장의 소비기한을 확정하지 않습니다.

## 프론트 사용자 흐름

1. 식단 sheet 상단의 `식단 조건 설정`을 엽니다.
2. 회피할 항목을 chip으로 선택합니다.
3. `식단 조건 저장`을 누릅니다.
4. 저장 성공 안내와 함께 planner가 현재 재고로 다시 계산됩니다.
5. recipe 상세에는 `알레르기 정보 · ...`를 표시합니다.
6. metadata가 불명확해 후보가 보류되면 이유를 별도 callout으로 표시합니다.

설정이 켜진 동안 외부 recipe의 unknown metadata를 자동으로 “안전”으로 간주하지 않습니다. 설정 화면의 안내에도 의료적 안전 판정이 아니라는 경계를 명시합니다.

## 구현 위치

| 영역 | 위치 |
|---|---|
| preference model | `services/api/app/meal_preferences.py` |
| curated allergen inference와 filter | `services/api/app/planner.py` |
| endpoint·workspace persistence·export·guest transfer | `services/api/app/main.py` |
| API type/adapter | `apps/web/src/mealApi.ts` |
| 설정 UI와 recipe metadata 표시 | `apps/web/src/MealPlanSheet.tsx` |
| migration | `infra/postgres/008_meal_preferences.sql` |

## 검증 결과

- planner unit: curated `soy` filter 및 unknown metadata abstain 통과
- API: GET/PUT round-trip, 중복 제거, recipe 후보 변경 통과
- SQLite: 재시작 후 preferences persistence 통과
- PostgreSQL FakeCursor: workspace filter·load/persist·readiness·migration 008·009 계약 통과
- 연결형 브라우저: 설정 chip 선택 → 저장 → 재계산 안내 통과
- 현재 전체 readback: API 231개, 연결형 E2E 38개, demo/prototype·mobile runtime 23개, Sites 4개 통과

이 결과는 로컬 SQLite와 계약 테스트의 증거입니다. live PostgreSQL migration/apply, 실제 외부 recipe metadata coverage, 실기기 화면, 교차 접촉·알레르기 사고 감소는 별도 검증 범위입니다.

## 상용화 전 승격 조건

1. 외부 recipe source별 allergen metadata schema와 license를 확인하고, unknown recipe의 비율을 측정합니다.
2. 복합 가공식품·소스·라벨의 `may contain`·교차 접촉 표현을 별도 metadata로 모델링합니다.
3. 사용자 locale와 관할 지역의 법정 알레르기 표시 목록을 product decision으로 확정합니다.
4. 알레르기 전문 검토를 거친 문구와 신고/피드백 처리 절차를 마련합니다.
5. live PostgreSQL, account transfer, export, 실제 browser/device에서 조건 누출이 없는지 workspace isolation acceptance를 수행합니다.
6. 의료·안전 보증처럼 오해될 수 있는 카피를 법무/도메인 검토 후 고정합니다.
