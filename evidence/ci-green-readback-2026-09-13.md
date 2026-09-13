# CI green readback — 2026-09-13

Scope: first fully-green GitHub Actions run on `main` after repository public
conversion (`403ac71`).

## Timeline

- Repository private → every workflow failed at runner provisioning
  (`runner_name` empty, zero steps). Public conversion restored runner
  allocation and exposed real failures.
- `d0e144e` — Verify Rescue Meal: success (512 tests, live PostgreSQL smoke,
  container smoke).
- `403ac71` — Verify Rescue Meal: success. Security scan: success
  (filesystem + both image scans, SARIF uploaded to code scanning).

## Failures fixed in this readback

1. `test_cp_sat_selects_distinct_plans_without_exceeding_lot_capacity`
   `StopIteration`. CP-SAT returns the same optimal recipe set on arm64 and
   x86_64 but assigns recipes to different days. Reproduced inside
   `python:3.12-slim --platform linux/amd64`; fixed by asserting the mushroom
   lot depletion sequence `[2.0, 1.0]` across all plans instead of
   `result.plans[1]`.
2. Postgres live smoke searched inventory by the pre-rename name after
   `PATCH /api/foods/{id}/product-info`. The endpoint rewrites both
   `canonical_name` and `display_name`, and the normalized `search_text` is
   recomputed on flush, so the old query legitimately returns `total == 0`.
   Reproduced locally against `pgvector/pgvector:pg16` + normalized mode;
   fixed the smoke to search `q=사용자` and assert the post-rename state.
3. `codeql-action/upload-sarif` aborts when two uploads share
   tool+category in one job. Added `category: api-image` /
   `category: ocr-worker-image`.

## Evidence

- `gh run view 34758344834` (Verify, success)
- `gh run view 34758344881` (Security scan, success)
- amd64 reproduction: optimizer test `5 passed`; old-name search `total=0`,
  new-name search + dashboard assertions `true`.

## Notes

- Dependabot PRs #3/#4 (python 3.14-slim) closed: violates
  `requires-python <3.14` (ocr-worker) / `<3.15` (api). semver-major docker and
  github-actions bumps are ignored in `.github/dependabot.yml`.
- Remaining open dependabot PRs are legitimate semver-compatible updates.
- DR drill workflow dispatched manually (run 34758743419) — first CI
  execution of `infra/dr-drill.sh`.
