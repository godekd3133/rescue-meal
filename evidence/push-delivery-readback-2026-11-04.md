# Web Push 실제 수신 readback — 2026-11-04

새로 만든 guest workspace의 구독자가 **workspace allowlist 없이** 하루 한 번 요약
푸시를 받는지, 로컬에서 실제 Google Chrome + FCM 경로로 확인한 기록입니다.

## 환경

| 항목 | 값 |
| --- | --- |
| API | `uvicorn app.main:app` on `127.0.0.1:8110`, SQLite(임시 경로), `RESCUE_MEAL_AUTH_REQUIRED=true` |
| Web | `vite` dev on `127.0.0.1:5190` (`VITE_WEB_PUSH_VAPID_PUBLIC_KEY` 설정) |
| VAPID | `py_vapid`로 개발용 키 생성, scratchpad에만 저장(저장소에 커밋하지 않음) |
| Worker | `scripts/run_notification_worker.py --once`, `RESCUE_MEAL_NOTIFICATION_WORKSPACE_IDS` **unset**(자동 탐색) |
| Browser | 로컬 Google Chrome stable, Playwright `channel: "chrome"` headless + persistent profile, notifications 권한 grant |
| 시각 | 2026-11-04 15:57~15:59 KST |

## 절차와 결과

1. `POST /api/auth/guest`로 새 workspace `guest-0t8zOP3Ij3wXWg2Mvy80jw` 생성, 오늘
   날짜 `use_by` 식품 3개(시금치·두부·우유) 추가 → 모두 `201`.
2. Chrome에서 `/sw.js` 등록 후 `pushManager.subscribe` → endpoint host
   `fcm.googleapis.com`, `PUT /api/push/subscriptions` → `200`.
3. `push_enabled: true` 저장. 응답 기본값: `push_mode: "daily_summary"`,
   `daily_summary_time: "18:00"`, `timezone: "Asia/Seoul"`.
4. 탐색 endpoint readback:
   `GET /api/internal/notifications/workspaces` → `{"workspace_ids":["guest-0t8zOP3Ij3wXWg2Mvy80jw"]}`
   (같은 데이터 폴더의 구독 없는 guest workspace와 `rescue-meal.auth.db`는 제외됨).
   토큰 없이 호출 시 `401`.
5. **15:57 KST(발송 시각 전)** worker tick: workspace를 자동으로 찾아 tick, `queued: 0`.
6. 발송 시각을 기다리는 대신 같은 workspace의 `daily_summary_time`을 API로 `15:58`로
   바꿈(사용자가 설정에서 바꾸는 것과 같은 경로). Chrome을 켜 둔 상태에서 tick:

   ```json
   {"workspace_id":"guest-0t8zOP3Ij3wXWg2Mvy80jw","lease_acquired":true,"push_configured":true,
    "queued":1,"processed":1,"succeeded":1,"retried":0,"dead_lettered":0,"cancelled":0,"error":null}
   ```

7. 같은 날 다시 tick → `queued: 0, processed: 0` (하루 한 번 중복 방지).
8. Chrome service worker `registration.getNotifications()` readback — **실제 표시됨**:

   ```json
   {"title":"오늘 먼저 살펴볼 식품 3개",
    "body":"두부, 시금치 외 1개의 표시 날짜와 보관 상태를 확인해 보세요.",
    "tag":"rescue-meal:2f9bfa65b55f0c2ef828f805",
    "url":"/?open=priority"}
   ```

9. 저장소 delivery outbox(SQLite) readback: `notification_id: "daily-summary:2026-11-04"`,
   `status: "succeeded"`, `attempts: 1`, 식품별 delivery row 없음.

## 확인하지 못한 것 (사실대로)

- **기본 18:00 시각에 맞춰 도착하는 것 자체**는 기다리지 않았습니다. 시각 게이팅은 5번
  (전에는 0건)과 자동 테스트(`tests/test_notification_daily_summary.py`)로 확인했고,
  실제 수신은 발송 시각을 현재 분으로 바꿔 확인했습니다.
- **OS 알림 배너를 눌러 앱이 `/?open=priority`로 열리는 것**은 headless라 클릭하지
  못했습니다. 표시된 알림의 `data.url`이 딥링크임은 위 readback으로, notificationclick이
  그 URL로 navigate(실패 시 새 창)하는 것은 `apps/web/tests/service-worker.test.mjs`로
  확인했습니다. 쿼리를 읽어 화면을 여는 처리는 프론트 UX 작업 범위입니다.
- 앱 UI의 "기기 알림 연결" 버튼은 거치지 않았습니다. dev 빌드에서는 앱이 service
  worker를 등록하지 않으므로(`import.meta.env.PROD` 조건) 같은 `public/sw.js`를 스크립트로
  등록하고 앱과 같은 API(`/api/push/subscriptions`, `/api/notification-preferences`)를
  호출했습니다.
- Claude in Chrome 확장은 이 세션에서 응답하지 않아(타임아웃 2회) 사용하지 못했고,
  대신 같은 Chrome 바이너리를 Playwright로 실행했습니다. 브라우저 권한 프롬프트는
  `grantPermissions(["notifications"])`로 대체했습니다.
