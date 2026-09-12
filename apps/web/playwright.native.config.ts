import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.NATIVE_RUNTIME_TEST_PORT ?? 4481);
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "native-viewport.spec.ts",
  timeout: 20_000,
  use: {
    baseURL,
    viewport: { width: 320, height: 740 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npm run check:runtime && exec ./node_modules/.bin/vite --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_APP_SHELL: "native",
      VITE_DEPLOYMENT_MODE: "demo",
    },
  },
});
