# storage event history readback — 2026-09-01

## 확인 결과

연결된 프론트에서 닭가슴살의 냉동→냉장 보관 변경을 저장한 뒤 상세 sheet를 다시 열었습니다.

- 화면 상태: `서버 연결됨`
- `최근 기록`: `1건`
- event label: `보관 위치 변경`
- event detail: `냉동 → 냉장`
- API: `POST /api/foods/chicken-1/storage-events` → `200`
- API: `GET /api/foods/chicken-1/storage-events` → `200`

## 구현 경계

- 최근 기록은 lot별로 API에서 readback합니다.
- 화면에는 최근 4건을 최신순으로 표시합니다.
- event의 source, 수량, 이전·이후 보관 위치, 생성 child ID는 API 계약에서 보존합니다.
- 상세 화면을 닫았다 다시 열어도 서버 응답을 기준으로 history를 재구성합니다.

## 남은 운영 검증

현재는 SQLite local repository와 로컬 브라우저 기준입니다. PostgreSQL read replica, 장기 event pagination, 계정별 접근 제어, 외부 Grocy event와의 reconciliation은 아직 운영 검증 전입니다.
