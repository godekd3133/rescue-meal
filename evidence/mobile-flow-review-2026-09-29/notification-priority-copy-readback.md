# 알림의 소비 우선순위 문구 readback — 2026-09-29

## 확인한 문제

`services/api/app/notifications.py`는 예상 소비 우선순위 기간을 참고 정보로 알립니다. 기존 화면 문구 변환은 메시지 안의 `먼저 확인해 보세요`를 `날짜를 확인해 주세요`로 바꿔, 참고 기간 확인을 포장지 날짜 재확인 요청처럼 보이게 했습니다.

## 반영

- 제목·본문 표기 변환을 `notificationPresentation.ts`로 분리해 순수 검증이 가능하도록 했습니다.
- 기간 안내를 `먼저 살펴볼 시점`으로 표현하고, 소비기한이나 먹어도 되는지를 판단하는 기준이 아님을 같은 문장 안에 남겼습니다.
- 문장형 상태로 바뀐 재고 앱 알림에 맞춰 connected 테스트가 행의 상태 문구와 중요도 클래스를 검사하도록 갱신했습니다.
- 기존 색상·레이아웃은 변경하지 않았습니다.

## 검증과 경계

- `node --experimental-strip-types --test tests/notification-presentation.test.mjs`: 3 passed.
- 승인된 홈 → 시금치 상세 → 날짜 재확인 진입의 Playwright/Axe 검사: 1 passed. 320×740 및 393×852, 라이트·다크 조합을 확인했고 소비·저장 동작은 누르지 않았습니다.
- `npm run build`: 통과, 보호 런타임 28개 파일, Vite 772개 모듈.
- `git diff --check`: 통과.
- `npm run check:bundle`: 실패 — CSS 330.8KB, 예산 260KB. 별도 성능/스타일 정리 과제로 남깁니다.
- connected 알림 화면 E2E는 이번 브라우저 허용 범위 밖이라 `not-run`입니다. 테스트 기대값은 새 문구에 맞췄지만 해당 흐름의 런타임 readback은 아직 없습니다.
