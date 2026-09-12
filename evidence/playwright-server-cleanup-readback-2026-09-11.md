# Playwright webServer cleanup readback — 2026-09-11

## Defect

The fixture and native Playwright configs used `npm run dev` as the webServer
command. In the local runner, the npm wrapper could outlive the test process and
leave its Vite child listening on the dedicated test port. The test could still
pass while the next lane or a developer server encountered a stale port.

## Change

Both configs now run:

```sh
npm run check:runtime && exec ./node_modules/.bin/vite --host 127.0.0.1 --port "$PORT" --strictPort
```

The protected runtime check remains a precondition, while `exec` replaces the
shell with Vite so the test runner owns the actual server process.

## Focused readback

| Lane | Command | Result | Cleanup |
|---|---|---:|---|
| Fixture | `MOBILE_RUNTIME_TEST_PORT=4488 npm run test:runtime -- --grep "Rescue Meal home opens detail"` | **1 passed** | port `4488` free |
| Native | `NATIVE_RUNTIME_TEST_PORT=4489 npm run test:native -- --grep "keeps the native home inside a 320px viewport"` | **1 passed** | port `4489` free |

The full lanes were then rerun with the same process ownership:

| Lane | Command / port | Result | Cleanup |
|---|---|---:|---|
| Fixture full lane | `MOBILE_RUNTIME_TEST_PORT=4490 npm run test:runtime` | **35 passed + 3 skipped** | port `4490` free |
| Native full lane | `NATIVE_RUNTIME_TEST_PORT=4491 npm run test:native` | **4 passed** | port `4491` free |

After both runs, `lsof -nP -iTCP:<port> -sTCP:LISTEN` returned no listener for
the respective port. Unrelated port `4173` was not touched.

## Boundary

This proves local Playwright webServer process ownership and cleanup. It does not
prove production supervisor, container orchestration, or managed hosting
shutdown behavior.
