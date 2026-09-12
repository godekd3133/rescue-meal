import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const apiPort = Number(process.env.RESCUE_MEAL_E2E_API_PORT ?? 8001);
const webPort = Number(process.env.RESCUE_MEAL_E2E_WEB_PORT ?? 4178);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const webDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests",
  testMatch: "connected-prototype.spec.ts",
  // The API client itself allows an 8-second request timeout. Keep connected
  // expectations above that budget so a slow disposable worker/fixture does
  // not look like a product failure in a long single-worker suite.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: webUrl,
    viewport: { width: 1100, height: 1100 },
  },
  webServer: [
    {
      command: "node scripts/run-connected-api.mjs",
      cwd: webDirectory,
      url: `${apiUrl}/ready`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        RESCUE_MEAL_E2E_API_PORT: String(apiPort),
        RESCUE_MEAL_E2E_WEB_PORT: String(webPort),
      },
    },
    {
      command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${webPort}`,
      cwd: webDirectory,
      url: webUrl,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_DEPLOYMENT_MODE: "demo",
        VITE_API_BASE_URL: apiUrl,
      },
    },
  ],
});
