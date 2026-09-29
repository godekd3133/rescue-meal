# 모바일 고대비 흐름 readback

## 원인

`prefers-contrast: more`용 색상 토큰이 마지막 라이트·다크 팔레트보다 먼저 선언되어 있었습니다. 선택한 테마의 뒤쪽 팔레트 선언이 같은 토큰을 다시 설정해, 홈의 약한 텍스트와 경계 색상에 고대비 값이 적용되지 않는 순서였습니다.

## 수정

고대비 토큰을 최종 라이트·다크 팔레트 다음으로 옮겼습니다. 두 테마의 포인트 컬러와 제품 배경은 유지하고, `--atelier-muted`, `--atelier-dim`, `--atelier-border`, `--atelier-border-strong`만 시스템 고대비 선호에 맞춰 강화합니다.

날짜 재확인 화면의 현재 기록 행도 좁은 화면에서 읽기 쉽도록 보조 라벨을 10px, 날짜·출처 값을 12px로 올렸습니다. 값이 행 안에서 줄바꿈되더라도 가로로 넘치지 않는 조건을 테스트에 추가했습니다.

## 검증

- 격리된 native 테스트 홈에서 `prefers-contrast: more`를 적용하고 라이트·다크를 각각 확인했습니다.
- 고대비 토큰과 320×740 기기 크기, 44px 이상 빠른 추가 버튼, 문서 가로 넘침 없음을 확인했습니다.
- 기본 CTA 제목 대비가 두 테마 모두 4.5:1 이상인지 검사했습니다.
- [라이트 고대비 홈](17-home-320x740-high-contrast-light.png), [다크 고대비 홈](18-home-320x740-high-contrast-dark.png)은 화면 진입 모션이 끝난 뒤 캡처하고 직접 살펴봤습니다.
- 테스트: `raises contrast tokens without changing native geometry` 통과. 실제 OS 고대비 설정, VoiceOver/TalkBack은 별도 확인 범위입니다.

## 날짜 재확인 흐름

- 허용된 홈 → 시금치 상세 → 날짜 다시 살펴보기 경로만 격리 브라우저에서 열었습니다. 현재 기록 날짜와 설명이 보이는지 320×740·393×852, 라이트·다크 4조합에서 확인했습니다.
- 네 조합 모두 고대비 Axe 검사 통과. 현재 기록 행의 글자 크기와 잘림 없는 너비를 각각 확인했습니다. 카메라·사진·예시 인식·수정·저장은 누르지 않았습니다.
- [320 라이트](19-date-recheck-320x740-high-contrast-light.png), [320 다크](20-date-recheck-320x740-high-contrast-dark.png), [393 라이트](21-date-recheck-393x852-high-contrast-light.png), [393 다크](22-date-recheck-393x852-high-contrast-dark.png) 캡처를 직접 살펴봤습니다.
