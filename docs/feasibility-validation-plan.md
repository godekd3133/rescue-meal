# 실현 가능성·검증 계획

## 1. 목적

전체 앱을 만들기 전에 가장 위험한 가정을 실제 샘플로 검증합니다.

1. 국내 영수증에서 식품 라인을 구조화할 수 있는가?
2. 영수증 축약명을 상품 master에 정확히 연결할 수 있는가?
3. 확인 단계를 포함해도 수동 등록보다 빠른가?
4. 보관 위치와 상태 이력을 사용자가 이해할 수 있는가?
5. 실제 표시 날짜와 추정 소비 우선일을 혼동하지 않는가?
6. 현재 재고 기반 식단 최적화가 기준 방식보다 폐기 위험 재료를 더 많이 사용하는가?

## 2. Phase 0 — 환경·OSS 재현

### 산출물

- Grocy 고정 버전 Docker 실행
- Grocy API로 상품·lot·best-before·consume·spoiled 흐름 재현
- ZXing으로 EAN/UPC/QR/DataMatrix fixture 해독
- GS1 Syntax Engine으로 AI 11/13/15/16/17 fixture 파싱
- PaddleOCR 한국어 영수증·라벨 샘플 실행
- invoice2data custom template 한 개 실행
- 식품안전나라 `I1250` 제품명 조회 sample과 `POG_DAYCNT` readback
- 식품안전나라 `C005` legacy barcode lookup 구조 readback 및 freshness 경고 기록
- `COOKRCP01` 한국 레시피 fixture 한 개와 재료 canonicalization 확인
- Docling 전자 영수증 PDF 구조화 sample
- PostgreSQL + pgvector 상품 alias nearest-neighbor sample
- DVC fixture versioning sample
- FoodKeeper 데이터셋 schema 확인
- OR-Tools 고정 식단 fixture 최적화
- ntfy 로컬 알림 전송

각 재현은 버전·명령·입력 fixture·출력 hash·실패 로그를 남깁니다.

## 3. Phase 1 — 영수증 Intake Spike

### 데이터셋

개인정보를 제거하거나 동의를 받은 영수증만 사용합니다.

- 대형마트 형식 A: 10장
- 대형마트 형식 B: 10장
- 편의점 형식: 10장
- 전자 영수증·스크린샷: 10장
- 의도적 중복·잘림·흐림·취소라인 fixture: 10장

최초 spike는 실제 확보 가능 범위에 맞춰 줄일 수 있지만, train/tune fixture와 최종 평가 fixture는 분리합니다.

### 정답 라벨

- 매장
- 영수증 번호
- 구매일시
- 총액
- 라인 순서
- raw 상품명
- 수량·중량
- 단가·합계
- 상품/할인/환불/기타 타입
- 정답 Product ID 또는 신규 상품

### 지표

| 지표 | 정의 |
|---|---|
| Receipt detection success | 영수증 필수 영역을 읽을 수 있는 비율 |
| Header exact match | 매장·구매일시·총액 정확 일치 |
| Line item precision/recall/F1 | 상품 라인 추출 성능 |
| Quantity exact match | 수량·중량 정확 일치 |
| Product match precision | 자동 확정 후보 중 실제 정답 비율 |
| Review rate | 사용자가 확인해야 한 라인의 비율 |
| Commit accuracy | 최종 재고 lot이 정답과 일치한 비율 |
| Duplicate block rate | 같은 영수증 재등록 차단율 |
| Time to commit | 촬영부터 확인 완료까지 걸린 시간 |

자동 확정 threshold는 최초 baseline을 보기 전에 고정하지 않습니다. 다만 낮은 신뢰도 항목을 무음으로 확정하지 않는 계약은 고정합니다.

## 4. Phase 2 — 날짜·보관 Spike

### 샘플

- 일반 1D 포장식품 10개
- GS1 2D fixture 및 실제 확보 상품
- 마트 포장 신선식품 라벨 10개
- 바코드 없는 과일·채소 5개
- 개봉·냉동·해동·분할 시나리오 10개

### 검증

- GS1 AI 날짜 종류와 값 정확성
- 라벨 OCR 날짜 exact match
- 제조일·포장일·Best Before·소비기한 분류 정확성
- 원본 근거 bbox 연결
- lot 분할 전후 수량 보존
- storage event replay 후 현재 상태 일치
- 실제 표시 날짜 불변
- 추정 소비 우선일의 rule/version 추적 가능성

### 사용자 이해 테스트

다음 두 문구를 구분할 수 있는지 확인합니다.

```text
표시 소비기한: 2026-09-12
추정 소비 우선일: 2026-09-08
```

사용자가 추정일을 안전기한으로 해석하면 문구와 정보 구조를 수정합니다.

## 5. Phase 3 — Rescue Planner

### 고정 fixture

- 재고 20개
- 표시 날짜가 있는 lot과 없는 lot 혼합
- 보관 위치·개봉 상태 혼합
- 검증된 레시피 30~50개
- 사용자 조리 가능 시간과 제외 재료

### 비교 방식

1. 무작위 레시피
2. 만들 수 있는 레시피 중 재료 일치율이 가장 높은 방식
3. 표시 날짜가 가장 가까운 재료 하나만 우선하는 방식
4. Rescue Meal OR-Tools 방식

### 지표

- 폐기 위험 재료 사용량
- 추가 구매 재료 수와 비용
- 보유 수량 초과 여부
- 조리시간 제약 위반
- 메뉴 반복 수
- 해 없음 시 이유 설명 가능 여부
- 동일 입력의 결정론적 결과

## 6. Phase 4 — 통합 MVP

### 핵심 시나리오

1. 영수증 촬영
2. 신규·모호 항목만 확인
3. 일괄 재고 반영
4. 일부 식재료 냉동 이동 및 lot 분할
5. 라벨 날짜 촬영·확인
6. Rescue Queue 확인
7. 3일 식단 생성
8. 한 끼 조리 후 재고 차감
9. 남은 재료 폐기 기록

### 통합 검증

- API transaction 중간 실패 시 부분 입고가 남지 않음
- 동일 receipt commit 재시도 안전
- Grocy와 Rescue Meal ID mapping 일치
- 영수증 원본 삭제 후 파생 데이터 정책 확인
- 모바일 카메라 권한 거부·네트워크 실패 복구
- Open Food Facts unavailable 시 로컬 fallback
- 식품안전나라 API key/rate limit/unavailable 시 local product fallback
- OCR service unavailable 시 수동 등록 fallback

## 7. Kill 또는 Pivot 조건

- 영수증 확인 시간이 수동 등록과 비슷하거나 더 긴데 개선 경로가 없음
- 자동 상품 매칭 오탐을 review gate로 안전하게 차단할 수 없음
- 매장별 template 유지비용이 프로젝트 범위를 초과함
- 사용자가 표시 날짜와 추정 소비 우선일을 반복적으로 혼동함
- 보관 event 기록 부담 때문에 핵심 이력이 대부분 누락됨
- 한국 상품 조회율이 낮고 로컬 별칭 학습으로도 개선되지 않음
- 레시피 재료 canonicalization 비용이 식단 기능의 가치를 압도함

이 경우 기능을 제거하지 않고 자동화 수준을 낮춥니다.

- 자동 입고 → 검토 중심 반자동 입고
- 범용 영수증 → 지원 매장 2개
- 자동 저장 기간 → 사용자 알림 중심
- 식단 최적화 → Rescue Queue와 레시피 필터

## 8. 아직 주장할 수 없는 것

- 한국 영수증 OCR 정확도
- 실제 한국 상품 바코드 coverage
- 보관 규칙의 한국 식품 안전 적합성
- 실제 냉장고 온도
- 실제 소비기한 연장
- 실사용 음식물 폐기량 감소
- 사용자 장기 유지율

이 항목들은 각각의 실험이 완료된 뒤에만 갱신합니다.
