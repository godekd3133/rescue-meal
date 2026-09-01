# Guest workspace isolation readback — 2026-09-01

## 실제 SQLite 실행

같은 API process와 SQLite base path에서 guest token 두 개를 발급했습니다.

```text
guest session 1 → 200
guest session 2 → 200
workspace 1 식품 추가 → 201
workspace 1 dashboard food_count → 8
workspace 2 dashboard food_count → 7
isolation → true
```

한 workspace에만 `workspace-one-product`를 추가했으며, 다른 workspace와 무인증 `demo` workspace에서는 보이지 않았습니다.

같은 SQLite base path와 auth secret으로 API를 재시작한 뒤, 브라우저에 남아 있는 기존 Bearer token으로 다시 dashboard를 읽었습니다.

- `/api/dashboard` → `200`
- 연결 상태 → `서버 연결됨`
- inventory → `7개`
- 재시작 시 새 guest session 발급 요청 없음

## 테스트

- auth token round-trip·만료·변조·workspace ID 검증
- auth-required secret 누락 시 development secret fallback 차단
- auth-required 무인증 API → `401`
- API 전체: `45 passed, 2 warnings`
- 별도 `RESCUE_MEAL_AUTH_REQUIRED=true` process: 무인증 `401`, guest 발급 `200`, 유효 token `200`, 변조 token `401`
- 실제 연결 프론트에서 account register → 빈 workspace 0개 → API 재시작 후 account workspace 0개 복구 → login profile readback → logout → 새 guest workspace 7개 전환

## 현재 범위

이것은 이메일/OAuth 계정이 아니라 30일 guest workspace입니다. PostgreSQL API projection의 tenant key·account/revoke adapter 코드는 추가했지만 live migration/readback과 normalized domain tenant mapping은 다음 production 단계입니다.
