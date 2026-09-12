# PWA install icon readback — 2026-09-11

## Scope

Close the native-install icon gap for Rescue Meal without changing the protected mobile runtime or app interaction flow.

## Change

- Added an iOS `apple-touch-icon` link in `apps/web/index.html` pointing to a 180 x 180 PNG.
- Added 180 x 180, 192 x 192, and 512 x 512 PNGs derived from the existing Rescue Meal SVG source artwork.
- Switched manifest install icons to `image/png`; the 512 x 512 icon remains the `maskable` icon.
- Added the HTML/manifest/icon files to the release provenance input allowlist.
- Added release-manifest assertions for the apple-touch link, PNG MIME contract, PNG signature, and exact dimensions.

## Readback

- `npm run test:release-manifest`: **2 passed**.
- Isolated fixture PWA tests with `MOBILE_RUNTIME_TEST_PORT=4194 npm run test:runtime -- --grep "PWA" --workers=1 --reporter=line`: **2 passed**.
- Full isolated fixture/mobile lane with `MOBILE_RUNTIME_TEST_PORT=4195 npm run test:runtime -- --workers=1 --reporter=line`: **35 passed, 3 skipped**.
- `npm run build`: **passed**, protected mobile runtime **28 files**, Vite **759 modules**.
- Built outputs contain all three PNGs with the expected dimensions; Sites and service-worker tests passed.
- Canonical preview readback on `127.0.0.1:4173`: manifest and all three PNGs returned **HTTP 200**; PNG responses were served as `image/png`.
- iPhone Safari user-agent simulation at `393 x 852` rendered the install prompt, opened the `홈 화면에 추가` instructions, collapsed them, and dismissed the prompt with **0 console/page errors**. The accepted prompt capture is `evidence/design-qa-2026-09-11/native/native-ios-install-prompt.png`.
- `git diff --check`: **passed**.

## Limits

This proves the source/build/HTTP install metadata and icon asset contract. It does not prove an actual Safari `Add to Home Screen` result, iOS icon rendering on a physical device, Android launcher masking, or App Store/native shell behavior.
