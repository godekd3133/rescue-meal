# CSS 예산 진단 — 2026-09-29

## 현재 측정

- Production `check:bundle`: **CSS 330.7KB / 예산 260KB**. 기준보다 70.7KB 큽니다.
- 현재 `prototype.css`: 404,072 bytes, 2,653 rules, 8,977 declarations.
- 저장소 HEAD의 `prototype.css`: 407,980 bytes. 현재 작업본은 소스 기준 3,908 bytes 작습니다.
- Vite가 포함한 LightningCSS로 같은 파일만 비교한 결과: HEAD 330,088 bytes → 현재 326,477 bytes (**3,611 bytes 감소**). 이 값은 `prototype.css` 단독 비교이며, 최종 빌드 대신 쓰지 않습니다.
- 앱 CSS와 TS/TSX에서 참조되지 않던 `--meal-cream` 정의 4개(약 120 bytes)를 제거했습니다. 이제 남은 CSS 토큰 정의는 앱 코드에서 참조됩니다. `--meal-cream` 문자열은 이 진단 노트에서만 제거 내역으로 언급합니다.

## 검토한 절감 후보

- 같은 selector·조건의 완전히 중복된 rule: **0개**.
- 같은 선언을 가진 인접 rule 묶음: **24개**, 최대 절감 추정 약 **1.55KB 소스**. 다양한 UI 흐름의 규칙을 합쳐 얻는 크기에 비해 영향 범위가 넓어 이번에는 적용하지 않았습니다.
- 텍스트 기준 미참조 class rule 후보 약 1.6KB는 동적 class 이름과 조건부 렌더링 가능성이 있어 제거하지 않았습니다.

따라서 예산을 맞추려면 반응형·테마·화면별 스타일 중복을 더 큰 단위로 재설계해야 합니다. 현재의 작은 정리는 초과분을 해결하지 못하며, 기준 예산을 올리거나 근거 없이 다른 화면의 스타일을 제거하지 않았습니다.

## 검증

- `npm run build`: 통과, protected runtime 28개 파일, Vite 772 modules.
- 홈 Axe 검사: **1 passed**, 320×740·393×852 및 라이트·다크.
- `git diff --check`: 통과.
- `npm run check:bundle`: **failed**, CSS 330.7KB / 260KB.
