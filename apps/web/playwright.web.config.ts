import { defineConfig } from "@playwright/test";

const testPort = Number(process.env.WEB_SURFACE_TEST_PORT ?? 4491);
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "web-surface.spec.ts",
  timeout: 20_000,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `npm run check:runtime && exec ./node_modules/.bin/vite --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_APP_SHELL: "web",
      VITE_DEPLOYMENT_MODE: "demo",
    },
  },
});
