# Guest account settings cross-device readback — 2026-09-10

## Result

Passed on the canonical target. The guest branch now has executed browser
evidence for the same stale-settings boundary previously verified for an
authenticated account.

## Executed command

```bash
RESCUE_MEAL_E2E_API_PORT=8042 \
RESCUE_MEAL_E2E_WEB_PORT=4442 \
  npm run test:connected -- \
  --grep "guest account settings also exposes"
```

The connected config started a disposable SQLite API and Vite frontend on the
dedicated ports. Result: **1 passed**.

## Contract verified

- The deterministic guest `/api/auth/me` response uses guest mode and a
  workspace-scoped guest ID.
- The account sheet reads the initial dashboard revision and notification
  preference without silently switching workspace.
- A simulated dashboard revision change from `1` to `2` is observed after a
  visible-tab probe.
- The account sheet shows `다른 기기에서 계정 설정이 변경됐어요` and explains that
  the current settings draft is being preserved.
- This guest scenario does not auto-refresh child account panels or replace
  local draft state.
- The route cleanup completes after the assertion; no connected server remains
  on ports `8042` or `4442`.

## Boundary

This proves the guest frontend stale-state contract using deterministic routed
responses. It does not prove real multi-device scheduling, Web Push ordering,
background tab visibility, VoiceOver/TalkBack, or managed PostgreSQL failover.
