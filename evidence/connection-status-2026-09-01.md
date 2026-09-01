# 연결 상태와 timeout 경계 — 2026-09-01

## 구현

- API가 설정되지 않은 프론트는 `데모 모드`로 표시합니다.
- API가 설정된 프론트는 최초 dashboard readback 전 `서버 확인 중`, 성공 후 `서버 연결됨`을 표시합니다.
- 초기 dashboard 요청 또는 이후 write/readback이 실패하면 `오프라인 · 임시 화면`으로 전환합니다.
- JSON 요청과 multipart OCR 업로드 모두 8초 `AbortController` timeout을 공유합니다.
- 실패한 write 뒤에는 dashboard 재조회로 서버 상태를 다시 읽고, 화면의 optimistic 변경을 서버 readback으로 수렴시킵니다.

## 실행 확인

- 실제 API가 연결된 `http://127.0.0.1:4173/`: `서버 연결됨`, `내 식품 목록 7`
- 존재하지 않는 API 포트로 띄운 별도 프리뷰: `오프라인 · 임시 화면`, `오늘 먼저 먹기 3`
- 두 프리뷰 모두 초기 화면 콘솔 `error`·`warn`: 없음

## 관련 코드

- `apps/web/src/Prototype.tsx` — connection state와 dashboard sync
- `apps/web/src/ConnectionStatus.tsx` — lazy 상태 배지
- `apps/web/src/mealApi.ts` — 공통 request/upload timeout

## 남은 운영 검증

현재는 브라우저 local preview에서 네트워크 실패 경계를 확인했습니다. 실제 모바일 background resume, captive portal, 재시도 backoff, 인증 만료, 오프라인 write queue는 아직 구현·검증하지 않았습니다.
