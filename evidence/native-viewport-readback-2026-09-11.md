# Native 320px viewport readback — 2026-09-11

## Scope

The preview simulator scales a phone frame inside a desktop viewport, so its
outer viewport does not by itself prove that the app-owned native shell behaves
at a narrow device width. This lane runs `VITE_APP_SHELL=native` at 320×740 and
keeps the existing Emerald Atelier layout and interaction semantics unchanged.

## Automated contract

`apps/web/tests/native-viewport.spec.ts` checks:

- document, body, device screen, mobile app viewport, and home content do not
  introduce horizontal overflow;
- visible buttons, inputs, selects, textareas, and role buttons remain inside
  the 320px viewport;
- the primary add-food, meal, notification, account, and food-detail sheets
  stay inside the viewport and have no horizontal scroll width beyond their
  client width;
- the same bounds remain valid after a browser-level 125% text preference
  simulation.

## Readback

Command:

```sh
NATIVE_RUNTIME_TEST_PORT=4487 npm run test:native
```

Result:

```text
4 passed (28.5s)
```

The default fixture lane explicitly ignores this native spec. Its separate
readback on `MOBILE_RUNTIME_TEST_PORT=4482 npm run test:runtime` remained
**35 passed + 3 skipped**, confirming that preview and native viewport contracts
are not mixed.

The direct native measurement also observed `bodyScrollWidth=320`,
`bodyClientWidth=320`, `device-screen.scrollWidth=320`, `home.scrollWidth=320`,
and no visible interactive element outside the viewport. Primary actions were
inside 20px left/right margins, and the 320px bottom sheet remained within the
screen bounds.

## Boundary

This proves a browser-level native-shell narrow-width contract. It does not
prove platform-specific OS font scaling, camera permissions/lens behavior,
VoiceOver/TalkBack semantics on physical devices, or visual acceptance on every
320px Android/iOS device.
