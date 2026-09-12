# Rescue Meal 디자인 QA

기준일: 2026-09-01
최종 readback: 2026-09-12

## 기준 화면

- 기준 콘셉트: 사용자가 선택한 첫 번째 Rescue Meal 모바일 콘셉트
- 기준 기기: 템플릿의 iPhone 프리셋
- 보조 확인 기기: 템플릿의 Pixel 10 프리셋
- 구현 소유 파일: `apps/web/src/Prototype.tsx`, `apps/web/src/prototype.css`
- 보호한 런타임: `apps/web/src/mobile/`, `App.tsx`, `main.tsx`, `styles.css`, 기기 자산과 `vite.config.ts`

## 시각 결과

### 통과한 항목

- warm ivory 배경, muted sage primary, restrained coral safety note의 색 계층이 기준 콘셉트와 일치한다.
- 브랜드 lockup → 인사말 → 냉장고 요약 → Rescue Queue → 식단 CTA → 안전 안내 순서가 한 화면에서 자연스럽다.
- Rescue Queue 카드는 이미지·상품명·수량·보관 위치·날짜 출처·우선순위를 한 덩어리로 읽을 수 있다.
- 실제 날짜와 AI 우선순위를 다른 문구로 보여 주어 안전 관련 의미가 시각적으로 섞이지 않는다.
- 식품 목록은 얇은 divider와 작은 썸네일을 사용해 기준 화면의 낮은 밀도와 정보량을 유지한다.
- 하단 `식품 추가하기`는 점선 테두리와 큰 터치 영역으로 독립적인 다음 행동으로 보인다.
- sheet는 기준 화면의 rounded surface와 같은 색 계열을 사용하며, review·detail·guidance 흐름의 정보 밀도를 분리했다.
- 실제 업로드 영수증 review에는 원본 대조 preview를 제공하고, 원본 파일은 브라우저 임시 URL로만 다룬다.
- 영수증·라벨 intake에는 카메라 촬영과 사진 보관함 선택을 나란히 제공하고, 카메라 surface에서는 문서 전체·날짜 면 프레이밍 가이드와 권한 실패 fallback을 제공해 다음 행동을 한눈에 구분한다.
- 카메라 촬영 시 화면 가이드 안쪽을 실제 crop해 OCR 입력으로 보내며, layout metric을 얻지 못하는 브라우저에서는 전체 frame으로 안전하게 fallback한다. crop은 원근·반사·흐림을 해결하거나 소비기한을 확정하지 않는다.
- Pixel 10에서도 상단 카메라 cutout, Android navigation bar, safe-area와 충돌하지 않고 스크롤된다.

### 의도적으로 남긴 선택

- 신선식품 이미지는 패키지 브랜드 대신 실제 재료 중심으로 통일했다. 생산 서비스에서는 라이선스가 확인된 상품/재료 이미지로 교체해야 한다.
- 한국어 본문은 시스템 글꼴을 사용해 별도 웹폰트 로딩 실패에도 읽을 수 있게 했다.
- 날짜가 없는 식품에도 날짜처럼 보이는 숫자를 만들지 않고 `확인 필요`와 `AI 소비 우선순위`로 구분했다.

## 상호작용 QA

실행 URL: `http://127.0.0.1:4173/`

- 홈에서 식단 sheet 열기 → `식단 저장` → `오늘의 식단에 저장했어요.` 확인
- Rescue Queue 식품 열기 → 보관 위치 변경 → 저장 toast와 카드 상태 갱신 확인
- 식품 상세에서 `먹었어요` → 보관 수와 Rescue Queue 수 감소 확인
- 영수증 sheet → 샘플 영수증 → 후보 선택 해제 → 선택된 항목만 반영 확인
- 영수증 sheet → 파일 선택 → review → 업로드 원본 대조 preview와 저장하지 않는다는 안내 확인
- 연결 모드 영수증 sheet → 파일 선택 → 상품 line 선택 → 원본 preview에서 safe bbox 강조와 개인정보 비노출 안내 확인
- 영수증·라벨 sheet → `카메라로 촬영` surface의 프레이밍 가이드, `사진에서 선택` fallback 및 OCR 실패 후 재촬영 CTA 확인
- 낮은 confidence 영수증 line이 `확인 필요`로 보이는지 확인
- 라벨 sheet → 샘플 라벨 → `유효년월일 2026.09.02`와 `실제 표시` 확인
- 연결 모드 라벨 sheet → 파일 선택 → 날짜 후보 표시 → 라벨 원본 preview에서 safe 날짜 bbox 강조와 포장일/소비기한 의미 확인
- 바코드 sheet → 숫자 입력 → 상품 후보와 “소비기한은 포장지 확인” 안내 확인
- GS1 data carrier 문자열 입력 → 날짜 후보와 `라벨 확인 필요` 안내 확인
- 날짜 없는 상품의 냉장 → 냉동 이동 → AI 우선순위 날짜 범위가 서버 응답으로 갱신되는지 확인
- 직접 입력 → 이름·수량·보관 위치 입력 → 식품 목록과 Rescue Queue 갱신 확인
- 보관 위치 filter → 냉동만 → 해당 식품만 남는지 확인
- 안전 안내 card → `포장지 표시 / 사용자 확인 / AI 소비 우선순위` 세 단계 확인

## 접근성·품질 체크

- 주요 행동은 `button`, `tab`, `switch`, `combobox`, `dialog` 의미를 가진다.
- 식품 이미지는 장식으로 처리해 반복적인 alt 텍스트를 제거했다.
- 키보드 입력은 템플릿 `KeyboardInput`을 사용한다.
- sheet를 열기 전 템플릿 키보드가 닫히는 경로를 유지했다.
- 드래그 가능한 이미지의 native drag를 막는 템플릿 계약을 유지했다.
- 업로드 원본 preview에는 설명 가능한 alt를 제공하고, `blob:` 임시 URL은 재선택·sheet mode 전환·unmount 시 폐기한다.
- bbox overlay는 `aria-hidden` 위치 장식으로만 제공하고, 의미 있는 선택·수정 동작은 상품 line·날짜 후보 확인 흐름에 남긴다. 서버의 receipt/label overlay payload에는 OCR text를 넣지 않는다.
- 텍스트 대비와 버튼 터치 면적은 모바일 화면에서 확인했다.

## 남은 디자인 리스크

- 실제 업로드 원본을 review에서 대조하고, 연결 모드의 safe observation bbox를 상품 line·라벨 날짜 후보와 연결하는 overlay까지 구현했다. 실제 매장 annotation 기반 위치 정확도와 label/date field별 pixel acceptance는 아직 후속 검증이다.
- 브라우저 camera surface·사진 input·실패 복구와 mock video의 가이드 crop은 [capture input readback](../evidence/capture-input-readback-2026-09-03.md) 및 [camera guide crop readback](../evidence/camera-guide-crop-readback-2026-09-05.md)으로 확인했다. 실제 카메라 권한·렌즈, 원근·반사·흐림·역광·기울기 오류 상태와 실기기 crop 정확도는 아직 디자인 QA 범위에 들어오지 않았다.
- 긴 상품명·다국어 상품명·수량 단위가 들어오면 카드 truncation과 접근성 이름을 추가 확인해야 한다.
- 작은 320px 폭과 시스템 글꼴 확대 설정에서 추가 visual regression이 필요하다.
- 운영판에서는 영수증 개인 정보 마스킹·삭제·보존 상태를 별도 UI로 설계해야 한다.

## 2026-09-11 current-source readback

- 현재 Emerald Atelier compact visual direction과 visible semantic label을 변경하지 않은 채,
  초기 dashboard revision baseline lifecycle 결함을 수정했다. 초기 `/api/dashboard` 성공 응답의
  revision을 polling baseline에 seed해 첫 visible-tab probe가 remote 변경을 놓치지 않도록 했다.
- 수정 후 dashboard focused **1 passed**, full connected **101 passed**, fixture/mobile **35 passed +
  3 skipped**, production fail-closed **1 passed**, Vite **759 modules**, Sites **4 passed**를
  확인했다. 이 변경은 색·레이아웃·sheet hierarchy를 바꾸지 않는 안정성 보정이다.
- native shell `320×740` narrow-viewport lane도 **4 passed**로 확인했다. body/document/device
  screen/home 수평 overflow, visible action bounds, 식품 추가·식단·알림·계정·상세 bottom sheet
  width, 125% text preference를 검사해 preview phone frame의 scaling과 분리된 CSS 회귀 기준을
  만들었다.
- current source 재검증에서 fixture/mobile **36 passed + 3 skipped**, iOS install guidance focused
  **10 passed**, native **4 passed**, build **759 modules**, Sites **4 passed**를 확인했다. 병렬
  fixture에서 관찰된 일회성 locator 실패는 stale/different Playwright process가 존재한 호스트에서
  발생했고 worker-1 full lane과 focused 반복에서 재현되지 않았다.
- guest transfer transport와 sequence replay guard를 추가한 뒤 fixture/mobile **36 passed + 3 skipped**,
  native **6 passed**, connected **101 passed**, API **500 passed / 8 warnings**를 재확인했다. 이
  수치는 source/contract 회귀이며 실제 iOS/Android 화면·카메라·screen reader acceptance를 대체하지 않는다.
- 시각적 비교·실기기 카메라/렌즈·VoiceOver/TalkBack·320px 및 OS font-scale 실기기 검증은 여전히
  별도 design acceptance로 남긴다.

## 2026-09-12 food detail responsive first-fold readback

- Native `393×852`에서 `snap=0.93` 상세의 위험 동작이 `y=825.296..869.296px`로
  `818px` safe boundary를 넘고, `320×740`에서 primary row가
  `y=712.953..756.953px`로 `706px` 경계를 넘는 것을 확인했다.
- Detail snap을 live viewport 기반 `max 0.993`으로 조정하고, `max-width:360px`에서
  supporting card gap/padding만 줄였다. 44px 터치 면적·안전 copy·보호 런타임은 유지했다.
- 최신 geometry는 393px sheet `y=6..852`, primary `y=717.484..761.484`,
  destructive `y=773.484..817.484`; 320px primary `y=646.641..690.641`이다.
- Focused detail **2 passed**, full native **14 passed**, fixture/mobile **39 passed + 3 skipped**,
  build **760 modules**, protected runtime **28**, `git diff --check` passed.
- Accepted screenshots and full geometry are in [food detail compact first-fold readback](../evidence/food-detail-first-fold-compact-readback-2026-09-12.md). Physical iOS compositor, VoiceOver, Dynamic Type, and OEM inset acceptance remain separate.
