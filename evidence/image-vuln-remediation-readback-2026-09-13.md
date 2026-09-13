# Image Vulnerability Remediation Readback — 2026-09-13

로컬 검증 (trivy 0.74.0, DB 최신). Actions runner는 계정 quota 문제로
미실행 — 이 문서는 로컬 재현 결과이며 CI 통과는 별도 확인이 필요하다.

## 발견

`.github/workflows/security-scan.yml`의 image-scan job을 로컬에서 재현:

- `trivy fs --severity CRITICAL,HIGH --ignore-unfixed .` →
  `package-lock.json`·`api/uv.lock`·`ocr-worker/uv.lock` 전부 **0건**
- `trivy image` on `python:3.12-slim` 기반 API 이미지 (최신 pull 후에도
  debian 13.6) → **12건** (CRITICAL 3 + HIGH 9), 전부 fix 버전 존재:
  - perl-base: CVE-2026-13221, CVE-2026-42496, CVE-2026-8376 (CRITICAL)
  - perl-base 추가 HIGH 4건, gzip 1건, libpcre2-8-0 2건, libsqlite3-0 2건
- upstream slim 태그가 아직 패치된 deb을 포함하지 않아 `--pull` 재빌드로는
  해소되지 않음

## 수정

두 Dockerfile의 첫 apt 레이어에 `apt-get upgrade -y --no-install-recommends`를
추가해 빌드 시점에 Debian security repo의 패치를 적용 (주간 스캔이 새 CVE를
표면화하면 같은 레이어가 자동 흡수).

## 재검증 결과

| 이미지 | 수정 전 | 수정 후 |
| --- | --- | --- |
| rescue-meal-api:scan | 12 (3C/9H) | **0** |
| rescue-meal-ocr-worker:scan (linux/amd64) | (미측정, 동일 base) | **0** |

## CI 상태 메모

push(f81b376) 이후 Verify/Security scan run이 전부 runner 미할당으로 즉시
실패 (`runner_name: ""`, step 없음). rerun 동일. 계정 Actions 사용량은
linux 639min + macOS 216min(10배 과금 ≈ 2,160 상당)으로 free 포함
2,000분 초과 추정 — private repo 계정 수준 quota/결제 문제이므로 워크플로우
수정으로 해소되지 않는다. 사장님이 GitHub → Settings → Billing → Actions
에서 확인 필요. 마지막 성공 run은 9/1 (sha 980e187, 소형 verify.yml).
