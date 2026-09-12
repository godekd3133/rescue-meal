# Security/monitoring baseline readback — 2026-09-13

## 목표

운영 수준의 취약점 스캔과 알림 규칙을 저장소에 추가하고, 실제 metric 이름과
workflow 문법을 검증합니다. 대상은 `.github/workflows/security-scan.yml`과
`infra/monitoring/prometheus-alerts.yml`입니다.

## 변경

- `security-scan.yml`: Trivy로 repository filesystem(uv.lock·package-lock 포함
  의존성)과 API·OCR worker 이미지를 CRITICAL/HIGH·`ignore-unfixed` 기준으로
  스캔합니다. 결과는 SARIF로 GitHub Security 탭에 올리고 `exit-code: 1`로
  fail합니다. push/PR 외에 주간 스케줄(월요일 03:17 UTC)을 두어 신규 공개
  CVE가 push 없이도 표면화되게 했습니다.
- `prometheus-alerts.yml`: 3개 그룹 11개 규칙 — API down, 5xx 비율
  critical(>5%/10m)·warning(>1%/15m), p95 >2s, in-flight >48, product
  provider unavailable 비율·rate-limit·single-flight timeout, notification
  worker 침묵·dead letter·retry storm. 모든 규칙이 `docs/observability.md`에
  문서화된 low-cardinality metric만 사용하므로 alert label에 사용자 데이터가
  붙지 않습니다.

## 검증

- `yaml.safe_load`로 두 파일 파싱 통과 (PyYAML, services/api env).
- alert 규칙의 `rescue_meal_*` 참조를 `observability.py`,
  `product_resolver.py`, `notification_delivery.py`의 실제
  `prometheus_text()` 출력과 대조 — 모두 존재하는 metric/label 조합
  (histogram은 `_bucket` suffix).
- `promtool`은 로컬에 없어 실행하지 않았고, 실제 Prometheus scrape·alert
  발화·notification channel 연결은 운영 환경의 별도 acceptance입니다.
- Trivy workflow는 문법 검증만 완료했고 실제 GitHub Actions 실행 전입니다.
  첫 실행에서 기존 CVE가 보고되면 baseline triage가 필요합니다.
