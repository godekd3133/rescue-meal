# API와 데이터 계약

## 명세를 확인하는 방법

실행 중인 API의 `/docs`와 `/openapi.json`이 route·요청·응답 스키마를 확인하는 출발점입니다. 구체적인 모델은 `services/api/app/main.py`와 [데이터 계약](https://github.com/godekd3133/rescue-meal/blob/main/docs/data-contract.md)에서 확인합니다. 이 Wiki는 전체 endpoint를 복제하지 않습니다.

| 영역 | 대표 endpoint / 확인 위치 |
| --- | --- |
| 상태 | `GET /health`, `GET /ready` |
| 홈 | `GET /api/dashboard` |
| 등록 | `POST /api/foods`, `POST /api/receipts/intake` |
| 영수증 | draft 검토·commit 계약: `docs/ocr-pipeline.md` |
| 식단 | preview·save·completion 계약: `docs/recipe-planner.md` |
| 계정 | auth·workspace 계약: `docs/auth-workspace.md` |
| 운영 | `GET /api/internal/metrics` — 운영 token 필요 |

## 데이터 용어

| 용어 | 의미 |
| --- | --- |
| Product | 공통 상품·식재료 정보 |
| lot | 개별 구매·등록 단위의 재고와 수량 |
| DateAssertion | 포장 날짜의 종류·값·출처와 검토 정보 |
| StorageEvent | 보관 이동·개봉·소비 등 재고 이력 |
| workspace | 사용자 데이터의 격리 단위 |
| provenance | 상품·날짜 후보가 어디서 왔는지 설명하는 정보 |
| revision | 다른 요청·기기가 변경한 상태인지 판단하는 버전 |
| outbox | 외부 전달이 필요한 작업의 저장된 처리 상태 |

## 클라이언트가 지켜야 할 규칙

- 보호된 route의 인증·workspace 권한을 따라야 합니다. fixture 모드를 운영 인증 방식으로 사용하지 않습니다.
- idempotency를 지원하는 명령의 재시도는 동일한 작업 identity와 동일 payload를 사용합니다. 변경한 payload를 같은 작업처럼 replay하지 않습니다.
- `409`는 최신 상태와 충돌 원인을 확인합니다. `429`는 rate limit과 `Retry-After`를 따릅니다.
- typed `503`은 응답의 오류 code·retry 가능 여부에 따라 안내합니다. 저장 오류를 사용자에게 성공으로 보여주지 않습니다.
- 공급자 상품 정보를 개별 lot의 날짜로 승격하지 않습니다.

전체 오류 정책과 원자성 범위는 해당 route와 회귀 테스트가 기준입니다.

상세: [날짜 보정](https://github.com/godekd3133/rescue-meal/blob/main/docs/date-assertion-correction.md) · [상품 resolver](https://github.com/godekd3133/rescue-meal/blob/main/docs/product-resolver.md) · [내보내기](https://github.com/godekd3133/rescue-meal/blob/main/docs/data-export.md) · [계정 삭제](https://github.com/godekd3133/rescue-meal/blob/main/docs/account-deletion.md)
