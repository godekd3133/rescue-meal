# 식단 알레르기 제외 문구 readback — 2026-09-30

## 확인한 의미 오류

`preference_filtered`는 회피 조건 적용 전 메뉴가 있고, 적용 후에는 선택할 메뉴가 없을 때 켜집니다. `plan_recipe`는 회피 알레르기가 확인된 메뉴뿐 아니라 알레르기 정보가 `None`인 메뉴도 제외합니다. 따라서 이 상태를 모두 `알레르기 정보를 확인할 수 없어`라고만 설명하던 문구는 알려진 달걀 알레르기 충돌 사례에서 사실과 달랐습니다. 또한 이 경우에도 API 제목은 `재료를 조금 더 추가해 주세요`여서 원인을 잘못 안내했습니다.

## 반영

- API는 `preference_filtered`일 때 `식단 조건에 맞는 메뉴가 없어요`로 제목을 구분하고, known-allergen conflict와 unknown metadata를 모두 포괄하는 이유를 반환합니다.
- 식단 안전 요약은 `알레르기 조건을 확인해 주세요`와 같은 설명을 보여주고, 연결 모드에서는 `피할 알레르기 설정 열기`를 제공합니다. 버튼은 설정 화면만 열며 조건 저장은 사용자가 `식단 조건 저장`을 누를 때만 일어납니다. 미리보기 모드에는 동작하지 않는 설정 버튼을 표시하지 않습니다.
- 기존 알레르기 미확인 메뉴 안내와 자동 저장 금지 원칙은 유지했습니다.

## 검증 및 한계

- API 회귀: known egg recipe를 정상 미리보기한 뒤 `egg` 회피 조건을 적용해 `preference_filtered` 응답 제목·reason·preference note를 검증: **1 passed**.
- planner known-allergen filtering 및 unknown-allergen abstain: **2 passed**.
- ShoppingList 순수 presentation unit tests: **2 passed**.
- TypeScript/Vite build: 통과, protected runtime 28개 파일, Vite 773 modules. `git diff --check`: 통과.
- 연결된 식단 화면 회귀는 추가했지만 `--list`로 등록만 확인했고, Playwright 상호작용과 화면 캡처는 현재 허용된 홈 → 식품 상세 → 날짜 확인 범위 밖이라 `not-run`입니다. 구매/소비 기록은 실행하지 않았습니다.
