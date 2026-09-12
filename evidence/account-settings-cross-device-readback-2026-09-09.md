# Account settings cross-device stale boundary readback

Date: 2026-09-09

## Scope

W9.83 adds the account-settings read boundary after the dashboard, planner,
notification, shopping-list, receipt-queue, and food-detail surfaces. The
account sheet contains several local drafts: notification preferences, custom
storage-location edits, receipt-privacy actions, and Grocy mapping/retry state.
Refreshing those panels as soon as another device changes the workspace could
replace a value that the user is currently editing.

The change is frontend-only. It reuses the existing payload-free
`GET /api/dashboard/revision` marker; no new persistence or API schema is
introduced in this slice.

## Implemented contract

- `Prototype.tsx` starts a bounded dashboard-revision probe only while the
  account sheet is open. It probes on visible-tab return and every 30 seconds.
- A higher revision shows an account-level alert in both the authenticated and
  guest account branches. The alert says that the current setting draft is
  still being kept and offers `최신 계정 설정 확인`.
- The alert does not increment any child refresh nonce and does not replace a
  local draft. Probe failure, hidden tabs, workspace reset, and an in-flight
  explicit refresh preserve the current account sheet state.
- The explicit action runs the existing dashboard sync first. Only after a
  successful sync does the parent increment the account refresh nonce, causing
  notification preferences, storage locations, receipt privacy, and Grocy
  panels to read their current workspace state again.
- The parent remembers the revision observed by its own dashboard sync so that
  the refresh it explicitly requested is not reported as a new remote change.
- Existing same-tab `WorkspaceSyncTransport` invalidation remains additive:
  its `externalRefreshNonce` is combined with the parent nonce rather than
  replaced.

## Evidence

| Lane | Result | Meaning |
| --- | --- | --- |
| TypeScript | `./apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json` passed in disposable local mirror | Account props, nonce wiring, and callback types compile against the complete source mirror |
| Protected runtime | `npm run check:runtime` passed; 28 protected files | The mobile device runtime and lock boundary remain intact |
| Production build | `npm run build` passed; 757 Vite modules | Compiled app includes `AccountSheet` 74.79 kB and initial client JS 323.11 kB; the pre-existing ineffective `BottomSheet` dynamic-import warning remains |
| Focused browser contract | authenticated account scenario: `1 passed`; guest scenario added but not rerun | The authenticated local notification lead-days draft of `5` stays `5` when revision changes; the child read count stays unchanged until the action, then the explicit refresh re-reads server value `2`. A matching guest-branch scenario is checked in and awaits OneDrive hydration for execution |
| Desktop preview | local Vite preview opened in the Codex in-app browser | Protected iPhone shell, live status bar, demo home, and guest account sheet rendered; no shell/runtime replacement was made |

The focused browser scenario used deterministic page-routed dashboard,
revision, auth, and notification-preference responses so the initial revision
stays at `1` until the test deliberately changes it to `2`. This proves the
frontend state contract without relying on an external provider or a real
multi-device scheduler.

## Blocked or separate gates

- Direct workspace TypeScript was not a reliable lane during this readback:
  OneDrive returned `TS6053` for the dataless `ConnectionStatus.tsx` and
  `GuidanceSheet.tsx` files. The complete disposable mirror typecheck passed.
- A connected-API variant was attempted, but the source OneDrive API import
  remained in Uvicorn startup and never bound `/ready` before the 120-second
  web-server gate. This is an environment hydration failure, not evidence of
  a connected API pass.
- The focused contract does not prove OS background-tab scheduling, actual
  cross-device transport, Web Push ordering, managed PostgreSQL failover, or
  VoiceOver/TalkBack behavior. Those remain explicit acceptance gates.
- The prior W9.82 API baseline remains **497 passed, 8 warnings**, and the
  prior connected baseline remains **97 passed**; they are not relabeled as a
  new full-suite result by this frontend-only change.

## Reproduction boundary

The browser fixture asserts the important sequence:

```text
account sheet open
→ child panel read establishes baseline
→ dashboard revision 1 → 2
→ account alert appears; child draft/read state is unchanged
→ user selects 최신 계정 설정 확인
→ dashboard sync succeeds
→ account child refresh nonce increments
→ child panel reads current state
```
