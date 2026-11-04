# 로컬 실행

## 준비

저장소를 내려받고 루트 디렉터리에서 시작합니다. CI 기준 런타임은 Node.js 22와 Python 3.12입니다. Python 의존성은 `uv`, 웹 의존성은 `npm ci`로 설치합니다. 컨테이너 실행에는 Docker Compose가 필요합니다.

```bash
git clone git@github.com:godekd3133/rescue-meal.git
cd rescue-meal
```

## 1. API 실행 — 터미널 A

```bash
cd services/api
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

기본 실행은 검증용 메모리 저장소를 사용합니다. 재시작 후에도 로컬 데이터를 유지하려면 아래 명령을 사용합니다. 이 파일을 Git에 커밋하지 않습니다.

```bash
RESCUE_MEAL_SQLITE_PATH=../../data/rescue-meal.local.db uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 2. 웹 실행 — 터미널 B

저장소 루트에서 새 터미널을 엽니다.

```bash
cd apps/web
npm ci --prefer-offline --no-audit --no-fund
VITE_APP_SHELL=web VITE_DEPLOYMENT_MODE=demo VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 4173
```

브라우저에서 `http://127.0.0.1:4173/`을 엽니다. API 없이 화면 fixture만 확인하려면 `VITE_API_BASE_URL`을 생략합니다. 폰 프레임을 포함한 개발 미리보기는 `VITE_APP_SHELL=preview`로 실행합니다. fixture의 화면 성공은 API 저장 성공의 증거가 아닙니다.

## 3. 실제 이미지 OCR — 선택 사항

별도 터미널에서 실행합니다. 최초 모델 준비에는 시간과 메모리가 필요합니다.

```bash
cd services/ocr-worker
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8002
```

API를 아래 설정으로 다시 시작합니다.

```bash
cd services/api
RESCUE_MEAL_OCR_URL=http://127.0.0.1:8002 uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`http://127.0.0.1:8002/ready`에서 준비 상태를 확인합니다. 모델을 사용할 수 없으면 수동 입력이나 재촬영 흐름을 사용합니다.

## 확인 지점

- API 생존: `http://127.0.0.1:8000/health`
- API 준비: `http://127.0.0.1:8000/ready`
- 자동 생성 API 명세: `http://127.0.0.1:8000/docs`
- 웹: `http://127.0.0.1:4173/`

Compose 설정과 선택적 worker는 [인프라 안내](https://github.com/godekd3133/rescue-meal/blob/main/infra/README.md)에서 확인합니다. 인증·외부 provider 설정은 [설정·연동](https://github.com/godekd3133/rescue-meal/wiki/Configuration)을 따릅니다.
