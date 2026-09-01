# 공개 레시피 importer 운영 경계

기준일: 2026-09-02

## 결론

Rescue Meal은 식품안전나라 `COOKRCP01`을 한국 레시피 후보를 확보하는 source adapter로 사용합니다. 외부 응답은 바로 사용자에게 추천하지 않고 다음 세 단계로 처리합니다.

```text
COOKRCP01 API
  ↓
source-grounded review draft
  ↓ 사람이 확인
canonical ingredient + license/source 검토
  ↓ 별도 revision으로 승격
deterministic planner fixture
```

이 경계가 필요한 이유는 공개 레시피의 재료 표현과 사용자의 상품 lot 표현이 다르고, `1모`, `1팩`, `약간`, `적당량`을 일반적인 무게 단위로 안전하게 환산할 수 없기 때문입니다. importer가 레시피를 가져왔다는 사실은 해당 식품을 먹어도 된다는 뜻도 아닙니다.

## 공식 source

현재 adapter는 식품안전나라의 `COOKRCP01` JSON 계약을 대상으로 합니다. 공식 문서와 이용조건은 [식품안전나라 COOKRCP01 Open API 문서](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=COOKRCP01)를 기준으로 확인합니다.

adapter가 보존하는 source metadata는 다음과 같습니다.

| 필드 | 값/의미 |
|---|---|
| `source_name` | 식품안전나라 조리식품 레시피 DB |
| `source_url` | 공식 API 문서 URL |
| `source_revision` | `COOKRCP01` |
| `retrieved_at` | API 응답을 받은 UTC 시각 |
| `license` | `public-api-terms-review-required` |

API key는 환경변수로만 주입하고 response·예외 메시지·문서 출력에 포함하지 않습니다. 키가 없으면 importer는 비활성 상태이며, 상태 endpoint는 외부 네트워크 요청을 하지 않습니다.

## 구현

| 위치 | 책임 |
|---|---|
| `services/api/app/recipe_importer.py` | config, HTTP adapter, 공식 response parser, 재료·조리 단계 draft 변환 |
| `services/api/scripts/import_cookrcp.py` | 운영자가 실행하는 stdout JSON 수집 명령 |
| `services/api/app/main.py` | `GET /api/integrations/recipes/cookrcp/status` 설정 상태 readback |
| `services/api/tests/test_recipe_importer.py` | 공식 response shape, 필터, timeout, 오류 비노출, bad row 격리 |

`CookRcpRecipeDraft`는 다음 정보를 갖습니다.

- `source_id`, 제목, 카테고리, 조리 방법, 이미지 후보
- 원문 재료 문자열 `raw_text`
- 파싱에 성공한 경우의 `parsed_name`, `amount`, `unit`
- 파싱에 실패했거나 의미가 모호한 재료의 `requires_review=true`
- `MANUAL01`~`MANUAL20`에서 정리한 조리 단계
- source/license/revision/retrieved timestamp

수량 parser는 명확한 숫자와 단위의 후보만 추출합니다. `약간`, 분수, 묶음 상품의 의미가 불분명한 표현은 `parsed_name=null` 또는 검토 상태로 남기며, AI나 정규식으로 임의의 수량을 확정하지 않습니다.

응답의 한 row가 깨져도 전체 batch를 폐기하지 않습니다. `rejected_rows`에 row index와 안전한 사유를 남기고 정상 row만 draft로 반환합니다. 다만 서비스 payload 자체가 없거나 JSON 형식이 아니면 batch 요청을 실패시킵니다.

## 실행

먼저 `.env` 또는 실행 환경에 key를 주입합니다. 실제 key는 저장소·Git·브라우저 변수에 넣지 않습니다.

```bash
cd services/api
export FOODSAFETY_COOKRCP_API_KEY='발급받은-키'
uv run python scripts/import_cookrcp.py --start 1 --end 20 --category 반찬 > /tmp/cookrcp-review.json
```

메뉴명·재료명·변경일 필터를 사용할 수 있습니다.

```bash
uv run python scripts/import_cookrcp.py --menu-name 두부 --ingredient 시금치 --changed-after 20260901
```

명령은 stdout에만 JSON을 출력하며 planner fixture·재고·Grocy를 변경하지 않습니다. 출력 파일에는 원문 재료가 포함될 수 있으므로 공개 저장소에 그대로 커밋하지 말고, 검토가 끝난 canonical fixture와 source hash/metadata만 별도 관리합니다.

설정 상태만 확인하려면 API를 사용합니다.

```http
GET /api/integrations/recipes/cookrcp/status
```

`disabled`는 key가 없는 상태이고, `ready`는 key가 설정되어 importer 실행 준비가 된 상태입니다. `ready`는 API 연결 성공, 데이터 품질, 이용조건 승인, planner 승격 완료를 의미하지 않습니다.

## 검토 후 planner 승격 기준

외부 draft를 `data/fixtures/recipes/recipes-vN.json`으로 옮길 때 다음을 모두 확인합니다.

1. 제목·조리 단계·이미지의 source와 수집 revision을 기록합니다.
2. 각 재료를 Rescue canonical ingredient와 연결하거나 `missing_ingredients` 후보로 남깁니다.
3. `약간`, `적당량`, `1/2개`, `1단`처럼 상품별 의미가 달라지는 표현은 단위 환산 없이 사람이 결정합니다.
4. 현재 inventory 단위와 recipe 필요 단위의 변환 계수가 명확할 때만 planner unit 계약에 넣습니다.
5. 이용조건·이미지 재사용·attribution을 확인하고 `license`를 `project-authored`로 바꾸지 않습니다.
6. 알레르기·식품안전·섭취 가능 여부를 레시피 source가 보증한다고 표시하지 않습니다.
7. fixture revision과 planner version을 바꾸고 exact/alias/shortage/multi-lot 테스트를 추가합니다.

승격은 코드 review와 테스트가 포함된 별도 변경으로만 수행합니다. importer 결과를 cron이나 사용자 요청마다 fixture에 덮어쓰는 자동 sync는 지원하지 않습니다.

## 운영 미검증 항목

- API key 발급·호출량·상세 이용조건은 운영 계정으로 별도 확인해야 합니다.
- 공식 레시피의 모든 재료 표현이 현재 parser로 정규화되는 것은 아닙니다.
- 이미지 URL의 장기 보존·재배포 권한은 아직 승인하지 않았습니다.
- `COOKRCP01`의 공개 레시피는 제품별 소비기한·lot 상태·보관 이력을 제공하지 않습니다.
- 실시간 외부 API 장애·rate limit·재시도 정책은 운영 gateway에서 추가해야 합니다.

