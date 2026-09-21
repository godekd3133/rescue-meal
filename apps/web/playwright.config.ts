import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.MOBILE_RUNTIME_TEST_PORT ?? 4174);
const reuseExistingServer = process.env.MOBILE_RUNTIME_REUSE_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  // Connected API tests have their own webServer/API fixture and config.
  // Keeping them out of the fixture-only lane prevents a false failure when
  // this command is run without the disposable API launcher.
  testIgnore: ["**/connected-prototype.spec.ts", "**/native-viewport.spec.ts", "**/web-surface.spec.ts"],
  timeout: 20_000,
  // One CI retry absorbs observed timing flakes (focus/overlay transitions)
  // without hiding real regressions — a deterministic failure fails twice.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 1100, height: 1100 },
  },
  webServer: {
    // Never let Vite silently move to another port and make the fixture lane
    // exercise an unrelated app that already owns the requested port.
    command: `npm run check:runtime && exec ./node_modules/.bin/vite --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: `http://127.0.0.1:${testPort}/tests/runtime-fixture.html`,
    reuseExistingServer,
    env: {
      ...process.env,
      VITE_APP_SHELL: "preview",
    },
  },
});
