import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = process.env.DESIGN_QA_OUTPUT_DIR
  ? path.resolve(process.env.DESIGN_QA_OUTPUT_DIR)
  : path.resolve(process.cwd(), "../../evidence/design-qa-2026-09-11");
const baseUrl = process.env.DESIGN_QA_BASE_URL ?? "http://127.0.0.1:4173/";

fs.mkdirSync(outputDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  // 1399 keeps the 393px device screen on integer x coordinates when the
  // calibrated phone stage is centered, so the screenshot is exactly 393px
  // wide instead of being rounded to 394px by the rasterizer.
  viewport: { width: 1399, height: 1200 },
  deviceScaleFactor: 1,
});

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));

const screen = page.getByTestId("device-screen");
const sheet = page.getByTestId("bottom-sheet");

async function waitForApp() {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await screen.waitFor({ state: "visible" });
  const box = await screen.boundingBox();
  assert.ok(box, "device screen has no bounding box");
  assert.ok(Math.abs(box.width - 393) <= 1, `expected 393px screen, received ${box.width}`);
  assert.ok(Math.abs(box.height - 852) <= 1, `expected 852px screen, received ${box.height}`);
  await page.waitForTimeout(500);
}

async function captureScreen(name) {
  // Move outside the calibrated phone stage so the template-owned custom
  // cursor is not mistaken for app-owned UI in the evidence image.
  await page.mouse.move(1200, 1100);
  await page.waitForTimeout(60);
  await screen.screenshot({ path: path.join(outputDir, `${name}-screen.png`) });
}

async function captureSheet(name) {
  await expectVisible(sheet, `${name} sheet`);
  await page.mouse.move(1200, 1100);
  await page.waitForTimeout(60);
  await sheet.screenshot({ path: path.join(outputDir, `${name}-sheet.png`) });
  await captureScreen(name);
}

async function createHomeComparison() {
  const sourcePath = path.join(outputDir, "source-emerald-atelier-normalized.png");
  const implementationPath = path.join(outputDir, "01-home-screen.png");
  assert.ok(fs.existsSync(sourcePath), `missing normalized source image: ${sourcePath}`);
  assert.ok(fs.existsSync(implementationPath), `missing implementation image: ${implementationPath}`);
  const sourceData = fs.readFileSync(sourcePath).toString("base64");
  const implementationData = fs.readFileSync(implementationPath).toString("base64");
  const comparisonPage = await browser.newPage({
    viewport: { width: 840, height: 910 },
    deviceScaleFactor: 1,
  });
  await comparisonPage.setContent(`<!doctype html>
    <html><head><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 18px; background: #dfe4df; color: #162a23; font: 700 13px/1.2 -apple-system, BlinkMacSystemFont, sans-serif; }
      main { display: grid; grid-template-columns: 393px 393px; gap: 18px; align-items: start; }
      figure { margin: 0; display: grid; gap: 8px; }
      img { display: block; width: 393px; height: auto; border-radius: 16px; box-shadow: 0 10px 24px rgba(4, 17, 13, 0.22); }
      figcaption { padding: 0 3px; }
    </style></head><body><main>
      <figure><img alt="Source visual truth" src="data:image/png;base64,${sourceData}"><figcaption>Source visual truth · 393×852 normalized</figcaption></figure>
      <figure><img alt="Rendered implementation" src="data:image/png;base64,${implementationData}"><figcaption>Rendered implementation · 393×852 CSS, 1×</figcaption></figure>
    </main></body></html>`);
  await comparisonPage.screenshot({ path: path.join(outputDir, "comparison-home-source-vs-implementation.png") });
  await comparisonPage.close();
}

async function expectVisible(locator, label) {
  await locator.waitFor({ state: "visible" });
  assert.equal(await locator.count(), 1, `${label} should have one visible instance`);
}

async function closeSheet() {
  if (await sheet.count()) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="bottom-sheet"]'),
      undefined,
      { timeout: 2_000 },
    );
    assert.equal(await sheet.count(), 0, "sheet should close after Escape");
  }
}

await waitForApp();
await captureScreen("01-home");
await createHomeComparison();

await page.locator(".add-food-button").click();
await captureSheet("02-receipt-intake");
await closeSheet();

await page.locator(".meal-plan-button").click();
await captureSheet("03-meal-plan");
await closeSheet();

await page.locator(".priority-card").first().click();
await captureSheet("04-food-detail");
await closeSheet();

await page.locator(".connection-pill").click();
await captureSheet("05-account");
await closeSheet();

await page.locator(".notification-button").click();
await captureSheet("06-notifications");
await closeSheet();

const summary = {
  baseUrl,
  viewport: { width: 393, height: 852 },
  browserViewport: { width: 1399, height: 1200 },
  deviceScaleFactor: 1,
  sourceState: "demo fixture home with seven foods",
  capturedStates: [
    "01-home",
    "02-receipt-intake",
    "03-meal-plan",
    "04-food-detail",
    "05-account",
    "06-notifications",
  ],
  primaryInteractions: [
    "open receipt intake",
    "open meal plan",
    "open food detail",
    "open account",
    "open notifications",
    "dismiss each sheet with Escape",
  ],
  consoleErrors,
  pageErrors,
  comparisonImage: "comparison-home-source-vs-implementation.png",
};
fs.writeFileSync(path.join(outputDir, "capture-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();

assert.deepEqual(consoleErrors, [], "browser console errors were reported");
assert.deepEqual(pageErrors, [], "page errors were reported");
console.log(JSON.stringify(summary, null, 2));
