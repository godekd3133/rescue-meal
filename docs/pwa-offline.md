# PWA 설치·오프라인 경계

## 현재 구현

- `apps/web/public/manifest.webmanifest`에 Rescue Meal 이름·색상·standalone display·한국어 locale을 정의합니다.
- production build에서만 `/sw.js`를 등록합니다. 개발 프리뷰는 Vite HMR과 충돌하지 않도록 service worker를 등록하지 않습니다.
- service worker는 navigation HTML을 network-first로 확인하고, 네트워크가 실패할 때만 캐시된 shell로 복귀합니다. 그 외 같은 출처의 GET 정적 파일은 stale-while-revalidate로 즉시 캐시 응답을 주면서 백그라운드에서 최신 파일을 갱신합니다.
- `/api/` 요청은 GET이어도 service worker가 가로채지 않습니다.
- POST/PATCH 업로드·재고 변경·영수증 commit은 어떤 경우에도 service worker cache에 넣지 않습니다.
- 네트워크가 끊긴 정적 화면은 shell cache로 열고, 마지막 성공 dashboard도 workspace namespace별 local cache에서 읽을 수 있습니다. 이 경우 API 연결 상태는 `오프라인 · 최근 화면`으로 표시하고 마지막 동기화 시각을 함께 알립니다. cache가 없으면 `오프라인 · 임시 화면`으로 표시합니다.
- dashboard 요청이 네트워크 오류로 끝나면 홈에 `다시 연결` CTA를 표시합니다. 사용자가 명시적으로 retry할 때만 최신 dashboard를 다시 읽으며, account 401은 오프라인 retry와 섞지 않고 `로그인 다시 필요`로 분리합니다.
- account logout/명시적 session clear에서는 현재 workspace dashboard cache를 지웁니다. guest token 일시 재발급 시에는 같은 workspace의 읽기 cache를 보존합니다.
- manifest에는 192/512 SVG 앱 아이콘, portrait standalone 설정을 포함하며, 브라우저가 `beforeinstallprompt`를 제공하면 홈 화면 설치 CTA를 표시합니다. iOS 계열에서는 브라우저 API로 설치를 강제하지 않고 Safari 공유 버튼 → 홈 화면에 추가 안내를 보여줍니다. 사용자가 닫은 설치 안내는 30일 동안 다시 띄우지 않습니다.
- service worker 등록은 `updateViaCache: "none"`으로 최신 worker script를 확인합니다. 새 worker가 waiting 상태가 되면 앱이 `새 버전이 준비됐어요` 안내를 보여주고, 사용자가 `새로고침`을 눌렀을 때만 `SKIP_WAITING` 메시지를 보내 적용합니다. 저장하지 않은 검수 내용을 자동으로 끊지 않도록 업데이트를 자동 적용하지 않습니다.

## 캐시 정책

```text
navigation HTML
→ network 성공: 최신 응답 반환 + `/` shell 갱신
→ network failure: 캐시된 `/` shell 반환

GET same-origin static asset
→ cache hit: 즉시 반환 + network 응답으로 백그라운드 갱신
→ miss: network → 성공 응답 cache 저장
→ network failure: 캐시 miss면 503 반환

GET /api/*, POST, PATCH
→ service worker bypass
→ mealApi timeout / connection state 처리

GET /api/dashboard 성공
→ workspace-scoped localStorage cache 저장
→ 네트워크 오류 시 cache read-only fallback
→ inventory write는 재연결 전까지 차단
```

오프라인에서 write를 임의로 재생하지 않는 이유는 영수증 중복 반영, lot 수량 충돌, 실제 날짜 overwrite를 막기 위해서입니다. offline write queue는 사용자·lot·idempotency 정책을 확정한 뒤 별도 구현합니다.

## 검증

- `npm run build` 후 `dist/client/manifest.webmanifest`, `dist/client/sw.js` 생성 확인
- Sites worker packaging test에서 두 정적 파일 존재 확인
- `npm run test:service-worker`에서 install takeover 보류, navigation network-first, offline shell fallback, static stale-while-revalidate, API/write bypass, waiting update message, old cache purge를 검증
- 앱 runtime E2E·API E2E 기존 lane 통과
- 개발 프리뷰에서는 service worker를 등록하지 않는 조건을 코드로 고정
- 성공 dashboard → reload network failure → `오프라인 · 최근 화면`과 stale inventory 표시 E2E

## 남은 운영 검증

- 실제 iPhone Safari·Android Chrome 설치/홈 화면 실행
- 실제 배포 전후 service worker waiting → 사용자 새로고침 → controllerchange 적용
- 여러 workspace의 dashboard cache 격리와 logout 후 cache 삭제
- offline shell 이후 online 복귀와 dashboard 재동기화
- 네트워크 오류 → `다시 연결` → dashboard 성공 복귀 E2E
- 여러 탭에서 service worker와 API 상태 일치
- PWA 아이콘·splash screen·OS별 standalone safe-area 검증

설치 CTA의 `beforeinstallprompt → prompt() → userChoice` handoff와 manifest icon 응답은 브라우저 테스트에서 검증하지만, 실제 OS 설치 결과·splash screen·standalone safe-area는 실기기 acceptance에서 확인해야 합니다.
