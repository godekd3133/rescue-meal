# ghcr.io image publish + CodeQL readback — 2026-09-15

## Scope

Commit `b71b90e` adds two deploy-readiness workflows:

1. `.github/workflows/publish-images.yml` — builds and pushes both
   service images to GitHub Container Registry on main pushes that touch
   `services/api`, `services/ocr-worker`, `infra/docker-compose.yml`, or
   the workflow itself; also supports `workflow_dispatch`.
2. `.github/workflows/codeql.yml` — CodeQL SAST for
   javascript-typescript and python on push/PR/weekly schedule.

## Image publish verification

First run 34920502258 on `b71b90e`: **success** (4m6s).

Published packages (GitHub packages API readback):

- `ghcr.io/godekd3133/rescue-meal-api` — tags `main`,
  `b71b90ee84f50b4ff288f54c6725c026db5bf56a`, visibility public
- `ghcr.io/godekd3133/rescue-meal-ocr-worker` — tags `main`,
  `b71b90ee84f50b4ff288f54c6725c026db5bf56a`, visibility public

Notes:

- API image built with repo-root context (`COPY services/api/*` +
  `data/fixtures/recipes`), same as the security-scan job; OCR worker
  uses its own directory context.
- `provenance: false` keeps the published manifest flat — earlier
  attestations caused trivy to scan referenced base layers.
- Public visibility matches the already-public source repository; the
  images contain no secrets (trivy secret scan was clean).

## CodeQL verification

First run 34920502243 on `b71b90e`: **success** (1m35s) for both
languages. Results appear under the repository's code-scanning alerts.

## Remaining for the deploy gate

Hosting selection and the deploy pipeline itself are still the user's
environment decision. With registry images published, any container
host (VM + compose, Fly.io, Render, ECS, k8s) can now pull
`ghcr.io/godekd3133/rescue-meal-*:main` directly — the remaining work
is target credentials, a pull/deploy step, and the `/ready` readback.
