import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// Drives the built demo where the portfolio serves it, not a dev server. Build first:
// npm run build:portfolio-demo && npm run test:portfolio-demo
const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.RESCUE_MEAL_DEMO_PORT ?? 4598);
const publicRoot = process.env.RESCUE_MEAL_DEMO_PUBLIC_ROOT ?? path.join(webDirectory, "../../../../linked-me/public");

export default defineConfig({
  testDir: "./tests/portfolio-demo",
  testMatch: "*.pw.ts",
  timeout: 90_000,
  expect: { timeout: 8_000 },
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory "${publicRoot}"`,
    url: `http://127.0.0.1:${port}/demos/rescue-meal/index.html`,
    reuseExistingServer: false,
  },
});
