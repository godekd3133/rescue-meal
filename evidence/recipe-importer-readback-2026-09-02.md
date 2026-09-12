# COOKRCP01 recipe importer readback — 2026-09-02

## 결론

선택적 식품안전나라 `COOKRCP01` importer의 source adapter, review draft 변환, bad row 격리, API key 비노출, 운영 CLI를 코드 수준에서 검증했습니다. 현재 실행환경에는 `FOODSAFETY_COOKRCP_API_KEY`가 없으므로 실제 공공 API에 요청을 보내거나 운영 이용조건을 승인한 결과는 아닙니다. review persistence/RBAC/audit은 별도 [recipe review readback](recipe-review-readback-2026-09-02.md)에서 검증했습니다.

공식 계약 기준은 [식품안전나라 COOKRCP01 Open API 문서](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=COOKRCP01)입니다.

## 구현 readback

- `CookRcpConfig.from_env()`는 API key가 없으면 `None`을 반환하고, timeout을 1~30초로 제한합니다.
- `CookRcpClient`는 공식 keyed path와 `RCP_NM`, `RCP_PARTS_DTLS`, `CHNG_DT`, `RCP_PAT2` 필터를 사용합니다.
- 응답은 `CookRcpRecipeDraft`로 변환하며 raw ingredient text, 파싱 후보, 조리 단계, source name/url, license review marker, revision, UTC 수집 시각을 보존합니다.
- `약간`, 분수, 묶음 상품처럼 의미가 불명확한 수량은 자동 확정하지 않고 `requires_review=true`로 남깁니다.
- 정상 row와 잘못된 row를 분리하고, 누락된 `RCP_SEQ`나 객체가 아닌 row는 `rejected_rows`에 row index와 안전한 사유로 격리합니다.
- HTTP status·JSON 오류에서 upstream response body와 API key를 예외 메시지에 포함하지 않습니다.
- `GET /api/integrations/recipes/cookrcp/status`는 외부 network call 없이 key 설정 상태만 반환합니다.
- `services/api/scripts/import_cookrcp.py`는 stdout JSON만 출력하고 planner fixture·재고·Grocy를 변경하지 않습니다.

## 실행한 검증

```text
services/api: uv run pytest                         → 130 passed, 5 warnings
services/api: uv run pytest tests/test_recipe_importer.py → 6 passed
services/api: uv run python -m compileall -q app scripts → passed
services/api: uv run python scripts/import_cookrcp.py --help → passed
API: GET /health                                   → status=ok, storage=sqlite-local
API: GET /api/integrations/recipes/cookrcp/status   → configured=false, status=disabled
apps/web: npm run check:runtime                     → protected files 28개 통과
apps/web: npm run build                             → passed
apps/web: demo E2E                                  → 11 passed
apps/web: connected E2E                             → 8 passed
apps/web: mobile runtime                            → 8 passed
apps/web: Sites worker                              → 4 passed
```

## 실제 호출·운영 미검증

- API key가 없어서 식품안전나라 실제 응답·rate limit·장애 재시도는 실행하지 않았습니다.
- 현재 importer는 외부 draft를 deterministic planner fixture로 자동 승격하지 않으며, protected review API의 승인 gate를 거쳐야 합니다.
- recipe source 이용조건·이미지 재사용·attribution 승인은 별도 운영 검토가 필요합니다.
- COOKRCP01은 제품 lot의 소비기한, 보관상태, 섭취 가능 여부를 제공하는 source가 아닙니다.
- 외부 호출을 cron으로 자동화하거나 사용자 요청마다 fixture를 덮어쓰는 동작은 구현하지 않았습니다.
