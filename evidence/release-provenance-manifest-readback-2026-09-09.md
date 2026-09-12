# Release provenance manifest readback — 2026-09-09

## Scope

이번 readback은 같은 release attempt의 source/dependency/migration/build artifact identity를
secret-free JSON으로 묶는 local/CI contract를 확인한다.

## 변경

- `apps/web/scripts/create-release-manifest.mjs`가
  `rescue-meal-release-manifest-v1` JSON을 생성한다.
- manifest는 다음만 포함한다.
  - git `HEAD`, branch, dirty 여부와 변경 path 수
  - Node/deployment mode
  - web/API/OCR dependency lock과 protected mobile runtime lock의 SHA-256
  - PostgreSQL migration 파일 목록과 각 SHA-256, 최신 baseline
  - 존재하는 Sites compiled artifact의 size/SHA-256
  - secret/workspace/OCR 원본 bytes를 포함하지 않는다는 명시적 security field
- git metadata가 없는 disposable mirror에서는 `head=null`로 안전하게 생성되고,
  GitHub Actions에서는 `GITHUB_SHA`·`GITHUB_REF_NAME` fallback을 사용한다.
- Web CI는 manifest contract test 후 `/tmp/rescue-meal-release-manifest.json`을 만들고
  `--require-artifacts`로 compiled output 누락을 fail-closed 차단한 뒤
  `actions/upload-artifact@v4`로 보존하도록 연결했다. 현재 workspace에서 build output 두
  개를 의도적으로 찾지 못한 상태로 `--require-artifacts`가 exit 1과
  `required artifacts are missing`을 반환하는 것도 확인했다.

## 검증

- `npm run test:release-manifest`: **1 passed**, including synthetic `GITHUB_SHA`·
  `GITHUB_REF_NAME` fallback readback
- mirror manifest 생성: migration files **25개**, artifact records **4개**,
  `contains_secrets=false` readback
- API workflow contract: **30 passed**
- workspace-sync: **9 passed**
- service-worker: **5 passed**
- workflow YAML parse, migration shell syntax, `git diff --check`: 통과

## 미검증 경계

실제 GitHub Actions runner artifact upload·retention, signed provenance/attestation,
release promotion과 배포 시스템의 artifact identity 검증은 실행하지 않았다. 현재 GitHub
repository API가 HTTP 404를 반환해 Actions run readback도 확인할 수 없으며, 이는 workflow
코드 실패로 해석하지 않는다.
