# Rescue Meal Wiki

Rescue Meal은 영수증·바코드·식품 라벨로 식료품을 등록하고, 보관 이력과 표시 날짜를 관리하며, 먼저 사용할 재료로 식단을 만드는 서비스입니다.

이 Wiki는 처음 사용하는 사람과 개발자가 제품 흐름부터 실행·운영까지 찾아볼 수 있는 안내입니다. 기준일은 **2026-10-08**입니다. 현재 체크아웃의 코드와 설정을 기준으로 작성했으며, 운영 배포 상태나 실기기 검증 완료를 의미하지 않습니다.

## 어디서 시작하면 되나요?

| 목적 | 읽을 문서 |
| --- | --- |
| 제품과 핵심 원칙 이해 | [제품 개요](https://github.com/godekd3133/rescue-meal/wiki/Product) |
| 로컬에서 실행 | [로컬 실행](https://github.com/godekd3133/rescue-meal/wiki/Getting-Started) |
| 코드 구조와 저장 방식 이해 | [구조와 저장소](https://github.com/godekd3133/rescue-meal/wiki/Architecture) |
| 식품 등록부터 소비까지 이해 | [사용자 흐름](https://github.com/godekd3133/rescue-meal/wiki/User-Flows) |
| API·데이터 계약 확인 | [API와 데이터](https://github.com/godekd3133/rescue-meal/wiki/API-and-Data) |
| 환경 설정·외부 연동 확인 | [설정·연동](https://github.com/godekd3133/rescue-meal/wiki/Configuration) |
| 테스트와 변경 검증 | [테스트](https://github.com/godekd3133/rescue-meal/wiki/Testing) |
| 배포·백업·장애 대응 | [운영·배포](https://github.com/godekd3133/rescue-meal/wiki/Operations) |
| 오류 해결과 문서 관리 | [문제 해결·문서 관리](https://github.com/godekd3133/rescue-meal/wiki/Troubleshooting) |

## 꼭 알아둘 제품 원칙

- 포장에 실제로 표시된 날짜와 보관 상태로 계산한 **추정 소비 우선일**을 구분합니다.
- OCR과 상품 검색 결과는 검토 후보입니다. 사용자가 확인하기 전에는 재고를 확정하지 않습니다.
- 추정 우선일·식단 추천은 식품 안전이나 섭취 가능 여부를 보증하지 않습니다.
- 오프라인에서는 최근 화면을 볼 수 있지만 재고 변경은 연결 복구 후 진행합니다.

상세 설계는 [개발 진행 맵](https://github.com/godekd3133/rescue-meal/blob/main/docs/development-map.md) 및 [데이터 계약](https://github.com/godekd3133/rescue-meal/blob/main/docs/data-contract.md)을 참고하세요. 과거 검증 결과는 `evidence/`에 날짜별로 보관합니다. 문서에 적힌 과거 테스트 수치를 현재 상태의 성공 결과로 해석하지 않습니다.
