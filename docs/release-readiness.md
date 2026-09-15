# Rescue Meal 릴리스 readiness 체크리스트

기준일: 2026-09-13
현재 자가평가: 88/100 — 상용앱 수준의 검증 가능한 vertical slice.
이 문서는 남은 **외부 운영 acceptance gate**를 실제 런칭 액션으로 변환한다.
각 항목은 로컬에서 이미 준비된 자산과, 실제 운영 환경에서 완료해야 할
acceptance를 구분한다. scorecard.md의 자가평가 로그와 달리 이 문서는
"누가 무엇을 해야 gate가 닫히는가"만 다룬다.

## A. 데이터베이스·백업 (Production readiness)

로컬 준비 완료: ordered migration runner(`001→026`), ledger/checksum drift
guard, `backup.sh`/`restore.sh`(custom format, mode 600, host/Docker client),
`dr-drill.sh` end-to-end 복구 증명, 주간 DR drill CI.

| Gate | 남은 acceptance | 완료 증거 |
| --- | --- | --- |
| Managed PostgreSQL failover | 배포 대상 managed PG 선택, failover 리허설로 API `/ready`·pool 재연결 확인 | failover readback + RPO/RTO 측정 |
| 백업 주기·보관 | 스케줄러(cron/관리형 스냅샷)로 `backup.sh` 주기 실행, object storage 업로드·암호화·retention 정책 | 스케줄 구성 + 저장된 객체 확인 |
| WAL/PITR | WAL archiving 또는 managed PITR 활성화, 특정 시점 복구 리허설 | PITR 복구 readback |
| 복구 cutover 리허설 | 운영 DB 대상 `dr-drill.sh` 상당 절차 + traffic cutover owner 지정 | 리허설 기록 |

## B. 배포·네트워크 (Production readiness)

로컬 준비 완료: non-root 컨테이너, resource/logging 한도, `/health`·`/ready`,
`container-smoke.sh`, `perf-smoke.sh` baseline, production preflight,
**ghcr.io 이미지 publish**(`rescue-meal-api`·`rescue-meal-ocr-worker`,
`main`+sha 태그, public pull 가능 — 2026-09-15 CI 검증).

| Gate | 남은 acceptance | 완료 증거 |
| --- | --- | --- |
| 실제 배포 타겟 | 호스팅 선택(VM/K8s/managed compose)과 배포 파이프라인 — 레지스트리는 준비됨 | 배포된 스택의 `/ready` readback |
| TLS·도메인 | 인증서 발급·갱신, HTTPS 강제, 도메인 연결 | TLS 점검 결과 |
| Reverse proxy | idle timeout·request size·response reset 동작이 503 envelope 계약과 양립하는지 확인 | proxy 통과 장애주입 readback |
| CORS·Sites CDN | `RESCUE_MEAL_CORS_ORIGINS` 운영 도메인으로 고정, Sites worker 배포·cache invalidation | 실 도메인 연결 확인 |

## C. 외부 provider (Production readiness)

로컬 준비 완료: provider 상태/한도 사용자 안내, bounded retry/idempotency
adapter, privacy-safe metric, production preflight가 키 없이 시작을 거부.

| Gate | 남은 acceptance | 완료 증거 |
| --- | --- | --- |
| Browser push | 실 VAPID 키 발급·보관, 실 브라우저 구독→delivery 수신, 해지 정리 | 실기기 수신 readback |
| Email (password reset) | provider 선택·키, 발송→수신→링크 완료, dedup/bounce 처리 | 실 발송 readback |
| MFDS/OFF/상품 provider | 운영 키·rate limit 계약, 장애 시 사용자 안내 재확인 | live readback + 한도 시나리오 |
| Grocy 연동 | 운영 Grocy 인스턴스 URL·토큰, outbox→동기화 live 확인 | reconciliation readback |

## D. 관측·알림 (Production readiness + Reliability)

로컬 준비 완료: token-protected Prometheus scrape, low-cardinality metric
계약, `prometheus-alerts.yml` 11 rules, Trivy CI scan.

| Gate | 남은 acceptance | 완료 증거 |
| --- | --- | --- |
| 외부 collector | Prometheus/Grafana·Sentry·OTel 중 선택, scrape 연결, replica label 집계 | 수집 대시보드 스크린샷 |
| Alert 발화 | alertmanager/notification channel 연결, 규칙 실제 발화 리허설 | 테스트 알림 수신 |
| Crash/error 수집 | 클라이언트 error boundary→외부 수집, redaction 유지 확인 | 수집된 이벤트에서 secret 부재 확인 |

## E. 실기기·사용자 (Product UX + Accuracy)

| Gate | 남은 acceptance | 완료 증거 |
| --- | --- | --- |
| 실기기 카메라 | iOS/Android 실기기 카메라 업로드·guide crop·EXIF 동작 | 기기별 readback |
| Screen reader | VoiceOver/TalkBack으로 핵심 흐름(등록→확인→재고) | 녹화 또는 체크리스트 |
| 실제 매장 데이터 | 실 영수증/라벨 corpus로 OCR·bbox 정확도 측정 | corpus benchmark |
| 설치형 PWA | 홈화면 추가 후 offline/update/crash 경로 | 기기 readback |

## F. 안전·법규 (Accuracy and safety)

| Gate | 남은 acceptance | 완료 증거 |
| --- | --- | --- |
| 알레르기·교차 접촉 | recipe별 외부 metadata 출처 확정, cross-contact 표기 정책, 면책 문구 검토 | 정책 문서 + 적용 readback |
| 관할 rule | 대상 국가의 소비기한 표기 rule을 DateAssertion 계약에 승격 | rule mapping 문서 |

## 진행 순서 제안

1. **B(배포 타겟·TLS) 먼저** — 배포 타겟이 정해져야 A/C/D의 "운영" 의미가
   확정되고, 동일 스크립트로 target별 재측정이 가능하다.
2. **A 백업 정책** — 배포 직후 데이터가 생기기 전에 주기·retention을 고정.
3. **C push/email 키** — 사용자-facing 가치가 큰 provider부터.
4. **D collector** — 운영 시작과 동시에 관측이 붙어야 사고 대응이 된다.
5. **E·F** — 베타 사용자 전 마지막 게이트.

각 gate가 닫힐 때마다 `evidence/`에 readback을 추가하고 scorecard.md를
갱신한다. 이 문서는 자가평가가 아니라 체크리스트이므로 점수를 바꾸지
않는다.
