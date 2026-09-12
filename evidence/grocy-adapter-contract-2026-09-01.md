# Grocy adapter contract — 2026-09-01

## 코드 검증

- `GrocyConfig.from_env()`은 base URL과 API key가 모두 있을 때만 enabled
- mock transport에서 `/api/system/info` version readback
- `/api/stock/products/by-barcode/{barcode}` GET
- `/api/stock/products/{productId}/add` POST
- `/api/stock/products/{productId}/consume` POST
- `/api/stock/products/{productId}/open` POST
- `/api/stock/products/{productId}/transfer` POST
- 모든 호출에 `GROCY-API-KEY` header 전달
- HTTP 503 오류에서 Grocy response body와 API key를 `GrocyError`에 포함하지 않음
- Contract snapshot 당시 API 전체 테스트: `54 passed, 2 warnings`; 이후 레시피 preview/save/latest와 조리 완료·multi-lot·사용량 조정·단위 환산·audit·조리시간·최근 식단·COOKRCP importer/status·recipe review/RBAC/shared catalog·Grocy receipt/storage-event·dead-letter retry·in-flight reconciliation·worker lease/heartbeat·product mapping search/edit workflow·mapping before/after audit·workspace flush·notification·InventoryRepository distinct-lot·normalized mode contract·workspace revision guard·observability/readiness 회귀를 포함한 현재 전체 API suite는 `130 passed, 5 warnings`입니다.

## API 상태

`GET /api/integrations/grocy/status`는 설정이 없을 때 다음 의미를 사용합니다.

```json
{
  "configured": false,
  "status": "disabled"
}
```

## 미검증

Docker daemon이 꺼져 있어 실제 Grocy container, product ID/unit mapping, stock mutation, transaction ID/undo, timeout·retry·reconciliation readback은 아직 실행하지 않았습니다. 현재 UI의 영수증 commit은 local lot를 먼저 저장하고 Grocy outbox만 생성하며, Grocy 외부 write는 명시적 processor에서만 실행합니다.
