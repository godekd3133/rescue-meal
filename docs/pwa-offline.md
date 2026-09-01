# PWA 설치·오프라인 경계

## 현재 구현

- `apps/web/public/manifest.webmanifest`에 Rescue Meal 이름·색상·standalone display·한국어 locale을 정의합니다.
- production build에서만 `/sw.js`를 등록합니다. 개발 프리뷰는 Vite HMR과 충돌하지 않도록 service worker를 등록하지 않습니다.
- service worker는 `/`·manifest와 같은 출처의 GET 정적 파일만 cache-first로 제공합니다.
- `/api/` 요청은 GET이어도 service worker가 가로채지 않습니다.
- POST/PATCH 업로드·재고 변경·영수증 commit은 어떤 경우에도 service worker cache에 넣지 않습니다.
- 네트워크가 끊긴 정적 화면은 shell cache로 열 수 있지만, 최신 재고라고 표시하지 않습니다. API 연결 상태는 프론트의 `오프라인 · 임시 화면` 경계를 따릅니다.

## 캐시 정책

```text
GET same-origin static asset
→ cache hit: 즉시 반환
→ miss: network → 성공 응답 cache 저장
→ network failure: `/` shell fallback

GET /api/*, POST, PATCH
→ service worker bypass
→ mealApi timeout / connection state 처리
```

오프라인에서 write를 임의로 재생하지 않는 이유는 영수증 중복 반영, lot 수량 충돌, 실제 날짜 overwrite를 막기 위해서입니다. offline write queue는 사용자·lot·idempotency 정책을 확정한 뒤 별도 구현합니다.

## 검증

- `npm run build` 후 `dist/client/manifest.webmanifest`, `dist/client/sw.js` 생성 확인
- Sites worker packaging test에서 두 정적 파일 존재 확인
- 앱 runtime E2E·API E2E 기존 lane 통과
- 개발 프리뷰에서는 service worker를 등록하지 않는 조건을 코드로 고정

## 남은 운영 검증

- 실제 iPhone Safari·Android Chrome 설치/홈 화면 실행
- service worker 업데이트와 이전 cache purge
- offline shell 이후 online 복귀와 dashboard 재동기화
- 여러 탭에서 service worker와 API 상태 일치
- PWA 아이콘·splash screen·OS별 standalone safe-area 검증
