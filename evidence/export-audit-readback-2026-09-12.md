# Workspace export actor/time audit readback — 2026-09-12

## Scope

This readback covers the follow-up to the workspace export rate-limit slice. A successful
`GET /api/account/export` now records a server-side `WorkspaceExportAuditEvent` without changing
the existing `rescue-meal-export-v1` download schema. The audit metadata is intentionally separate
from the downloaded workspace snapshot.

## Contract

Each generated export records only:

- the verified account subject ID or `guest` actor;
- the auth role (`guest`, `user`, or `recipe_admin`);
- the validated request correlation ID;
- the export schema version; and
- the UTC export timestamp.

The Authorization header, access token, client IP, raw request body, and export payload are not
stored. The audit event is not included in `WorkspaceExportResponse`, so actor metadata does not
cross into the user's downloaded file. The insert is separate from workspace revision writes and
therefore does not invalidate another device's unsaved mutation. Reset/purge removes the audit
rows for that workspace. Rate-limited `429` requests do not generate a snapshot or an audit row.

If audit persistence fails, the API returns only the typed
`account_export_audit_persistence_unavailable` `503` envelope with `Retry-After: 1`; the export
response is not returned and the frontend does not create a Blob or download.

SQLite stores the event in `export_audit_events`. PostgreSQL stores it in
`rescue_api_export_audit_events`, introduced by the additive `026_export_audit.sql` migration with
workspace/time indexing. The current environment verified the migration dry-run and adapter SQL
contract; a live PostgreSQL apply of migration 026 remains a separate gate because the disposable
Docker live environment is not being treated as available evidence here.

## Red → green and verification

| Lane | Result |
| --- | ---: |
| New API actor/time success + audit-failure regressions | **2 passed** |
| SQLite persist → reconstruct → reset | **1 passed** |
| PostgreSQL workspace-scoped INSERT contract | **1 passed** |
| AccountSheet typed audit failure, no download | **1 passed** |
| Full API suite | **512 passed / 8 warnings** |
| Full connected lane after adjacent guest-preview fix | **109/109 passed (4.8m)** |
| Fixture/mobile runtime | **39 passed + 3 skipped** |
| Native viewport runtime | **14 passed** |
| TypeScript/Vite build | **760 modules** |
| Protected mobile runtime | **28 passed** |
| Sites / service worker / workspace sync / release manifest | **4 / 5 / 9 / 2 passed** |
| PostgreSQL migration dry-run | **001→026, no connection opened** |

The initial red run failed collection because the new audit model did not yet exist. After the
model, route, adapter, migration, UI guard, and tests were added, all focused lanes and the full
API/connected lanes passed. The existing full connected run's guest-transfer failure was diagnosed
and fixed separately in [guest transfer preview single-flight readback](guest-transfer-preview-single-flight-readback-2026-09-12.md).

## Remaining acceptance boundary

This slice does not establish audit operational query authorization, retention/alert policy,
large-workspace streaming or compression, external gateway abuse control, live migration 026 on a
managed PostgreSQL instance, replica/WAL/backup deletion alignment, or production rate-limit tuning.
