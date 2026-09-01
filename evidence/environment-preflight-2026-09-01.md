# 환경 Preflight — 2026-09-01

## 대상

- 프로젝트: `rescue-meal`
- 경로: 로컬 수업 작업 폴더 아래의 `rescue-meal`
- Git: 아직 저장소 아님
- 현재 소스: 구현 코드 없음
- 현재 프로젝트 변경: 제품·데이터·OSS·검증 문서만 존재

## 확인 결과

| 항목 | 결과 | 의미 |
|---|---|---|
| Python 기본 실행파일 | 3.14.7 | 기본 환경으로 사용하지 않음 |
| Python 대안 | 3.12.2, 3.11.13 | 3.12 가상환경 우선 후보 |
| uv | 0.12.5 | Python 환경·dependency lock 후보 |
| Node.js | v26.8.1 | PWA tooling 후보 |
| npm | 11.19.0 | frontend dependency 후보 |
| Git | 2.50.1 | 저장소 초기화 후 사용 가능 |
| Docker CLI | 28.5.1 | 설치됨 |
| Docker Compose | v2.40.3-desktop.1 | 설치됨 |
| Docker daemon | 연결 실패 | Docker Desktop 기동 필요 |
| Docker Desktop process | 확인되지 않음 | 현재 container 실행 불가 |
| curl/jq | 설치됨 | API readback 가능 |
| Tesseract | 없음 | 최종 OCR로 사용하지 않음 |
| Python OCR/AI packages | 미설치 | dependency 설치 전 상태 |
| 공식 문서 network read | HTTP 200 | 공식 source read 가능 |

확인한 공식 URL:

- 식품안전나라 I1250 페이지
- Docling 공식 페이지
- Grocy 공식 저장소

## Python 환경 결정

현재 기본 Python 3.14.7을 그대로 사용하지 않습니다. PaddleOCR·Docling·OR-Tools 및 주변 패키지의 실제 지원 범위를 설치 전에 확인하고, 우선 Python 3.12 가상환경을 사용합니다.

```text
python: 3.12.2
environment: project-local .venv
manager: uv
```

Python 3.12에서 dependency resolution 또는 특정 OCR package가 막히면 Python 3.11을 보조 환경으로 비교합니다. 시스템 Python과 전역 pip에는 설치하지 않습니다.

## Docker 실행 조건

Grocy·PostgreSQL·pgvector를 실행하려면 Docker daemon이 필요합니다. 현재 daemon이 꺼져 있으므로 Docker Desktop이 실행되기 전에는 다음을 주장할 수 없습니다.

- Grocy baseline 실행
- Docker Compose healthcheck
- PostgreSQL/pgvector readback
- containerized PaddleOCR/Docling

Docker Desktop을 켠 뒤 `docker info`와 각 서비스 healthcheck를 다시 확인합니다. daemon을 자동으로 기동하거나 시스템 설정을 바꾸지는 않습니다.

## Phase 0 실행 순서

```text
1. Python 3.12 project environment 생성
2. 최소 FastAPI/pytest/psycopg/OR-Tools 설치
3. Grocy pinned image 실행
4. Grocy 공식 barcode·stock·best-before·consume sample
5. PostgreSQL + pgvector sample
6. PaddleOCR Korean label/receipt sample
7. GS1 Syntax Engine AI fixture
8. Docling e-receipt PDF sample
9. 식품안전나라 I1250 API key와 sample readback
10. DVC fixture versioning
```

순서를 바꾸지 않습니다. OCR과 AI를 설치하기 전에 inventory source·data contract·fixture 경계를 먼저 확인합니다.

## 설치 후 필수 검증

- `python --version`이 3.12.x인지 확인
- lockfile이 생성되고 dependency 버전이 고정됐는지 확인
- Grocy API version과 endpoint readback
- PostgreSQL extension `vector` 활성화 확인
- OCR output에 text·bbox·confidence·model version이 있는지 확인
- GS1 fixture의 AI 15/17이 DateAssertion으로 정확히 변환되는지 확인
- I1250 product-level `POG_DAYCNT`와 개별 lot 날짜가 분리되는지 확인
- 어떤 API 실패도 재고 자동 확정으로 이어지지 않는지 확인

## 현재 validation claim

- 파일·경로 확인: 완료
- runtime version 확인: 완료
- Docker daemon 상태 확인: 완료
- 공식 URL read check: 완료
- dependency 설치: `not_run`
- Docker/Grocy: `not_run`
- PostgreSQL/pgvector: `not_run`
- PaddleOCR/Docling: `not_run`
- I1250 인증 API: `not_run`
- 실제 project build/runtime: `not_run`
