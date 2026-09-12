# Operational 503 envelope readback — 2026-09-11

## Scope

This readback covers the operational failure boundary around API readiness, workspace acquisition,
OCR worker readiness/capacity, and API internal worker/configuration guards. It does not replace the
domain-specific mutation envelopes or claim that every existing `503` in the repository has the same
retry semantics.

## Root cause and red loop

The product mutation routes had already converged on structured `code`, `retryable`, and `action`
metadata. The operational paths were inconsistent: API workspace middleware returned plain storage
strings, `/ready` returned a plain readiness string for storage/auth failures, OCR worker `/ready`
returned a plain model string, and capacity/configuration failures had no machine-readable reason.
The new API regressions first failed against those plain responses; the worker regressions failed when
they tried to read `detail.code`.

## Contract change

The public HTTP status remains `503`. The response now communicates whether a bounded retry is safe:

| Boundary | Code | Retry policy |
| --- | --- | --- |
| API `/ready` storage check | `readiness_storage_unavailable` | `retryable=true`, `retry_later`, `Retry-After: 1` |
| API `/ready` required auth secret | `auth_configuration_missing` | `retryable=false`, `configure_server` |
| API workspace pool | `postgres_pool_unavailable` | `retryable=true`, `retry_later`, `Retry-After: 1` |
| API workspace isolation | `workspace_storage_unavailable` | `retryable=false`, `configure_storage` |
| OCR worker `/ready` | `ocr_model_unavailable` | `retryable=true`, `retry_later`, `Retry-After: 1` |
| OCR worker `/ocr` capacity timeout | `ocr_worker_busy` | `retryable=true`, `retry_later`, `Retry-After: 1` |
| API internal worker/config guards | `*_configuration_missing` | `retryable=false`, `configure_server` |
| API disabled Grocy outbox | `grocy_integration_not_configured` | `retryable=false`, `configure_integration` |
| API recipe review disabled | `recipe_review_configuration_missing` | `retryable=false`, `configure_server` |
| API recipe import key missing | `recipe_import_configuration_missing` | `retryable=false`, `configure_integration` |
| API guest workspace provisioning | `workspace_provisioning_unavailable` | `retryable=true`, `retry_later`, `Retry-After: 1` |

The exception message, token, and workspace identity are not copied into these envelopes. Existing
success response models and the `503` status are unchanged. The API middleware keeps the established
top-level JSON shape for PostgreSQL pool errors; `HTTPException` routes keep FastAPI's nested
`detail` shape, which the frontend parser already accepts.

## Implementation

- API introduced one safe `HTTPException` constructor for operational unavailable states.
- The workspace middleware now reuses the existing typed PostgreSQL pool response and returns a typed
  workspace-storage configuration response instead of a plain string.
- API `/ready` distinguishes transient storage read failure from missing required auth configuration.
- Internal Grocy, notification, product-enrichment, and observability worker-token guards now expose
  configuration codes without enabling a retry loop; a disabled Grocy outbox integration is also
  classified as a server configuration error.
- OCR worker `/ready` and capacity timeout responses include typed detail and bounded retry metadata;
  worker liveness remains cheap and does not initialize the model.
- The remaining auth/recipe configuration paths now use the same safe constructor: generic auth secret
  failures, account token issuance, guest workspace provisioning, recipe review disablement, and
  COOKRCP import key absence no longer return plain configuration strings.

## Verification

| Lane | Result |
| --- | ---: |
| Red API regression before implementation | 4 failed |
| API full suite after initial operational slice | **504 passed** |
| API full suite after auth/recipe configuration closure | **507 passed** |
| OCR worker full suite after implementation | **10 passed** |
| API targeted file | **185 passed** |
| Python 3.14 API environment | `services/api/.venv/bin/python` |
| Python 3.12 OCR environment | `services/ocr-worker/.venv/bin/python` |
| Exception/detail non-disclosure | passed |

An initial accidental system-Python run stopped during collection because `python-multipart` was not
installed; no dependency was installed or changed. The final runs used the repository's existing
service virtual environments. Existing FastAPI/Starlette deprecation warnings remain non-blocking.

## Remaining acceptance boundary

These tests prove local response classification and safe non-disclosure. They do not prove an external
load balancer's retry policy, Kubernetes/Compose restart behavior, model download/cold-start latency,
managed PostgreSQL failover, provider delivery, or signed production deployment health checks.
