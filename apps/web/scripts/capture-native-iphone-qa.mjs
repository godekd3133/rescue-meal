import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = process.env.NATIVE_QA_OUTPUT_DIR
  ? path.resolve(process.env.NATIVE_QA_OUTPUT_DIR)
  : path.resolve(process.cwd(), "../../evidence/design-qa-2026-09-11/native");
const baseUrl = process.env.NATIVE_QA_BASE_URL ?? "http://127.0.0.1:4482/";
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByTestId("native-app-shell").waitFor({ state: "visible" });
const screen = page.getByTestId("device-screen");
const box = await screen.boundingBox();
assert.ok(box, "native device screen has no bounding box");
assert.ok(Math.abs(box.width - 393) <= 1, `expected native width 393, received ${box.width}`);
assert.ok(Math.abs(box.height - 852) <= 1, `expected native height 852, received ${box.height}`);

async function waitForSheetClose() {
  await page.waitForFunction(() => !document.querySelector('[data-testid="bottom-sheet"]'), undefined, { timeout: 2_000 });
}

await screen.screenshot({ path: path.join(outputDir, "native-home-393x852.png") });

async function readSheetLayout() {
  return page.evaluate(() => {
    const sheetElement = document.querySelector('[data-testid="bottom-sheet"]');
    const sheetContentElement = document.querySelector('.sheet-content');
    const sheetStyle = sheetElement ? getComputedStyle(sheetElement) : null;
    const sheetContentStyle = sheetContentElement ? getComputedStyle(sheetContentElement) : null;
    const sheetRect = sheetElement?.getBoundingClientRect();
    return {
      sheet: sheetRect?.toJSON() ?? null,
      sheetBottomStyle: sheetStyle?.bottom ?? null,
      sheetContentPaddingBottom: sheetContentStyle?.paddingBottom ?? null,
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
}

await page.locator(".add-food-button").click();
await page.getByTestId("bottom-sheet").waitFor({ state: "visible" });
await page.waitForTimeout(650);
const receiptSheetLayout = await readSheetLayout();
assert.ok(receiptSheetLayout.sheet, "receipt sheet has no layout");
assert.ok(receiptSheetLayout.sheet.width <= 393 + 1, `receipt sheet overflows width: ${receiptSheetLayout.sheet.width}`);
assert.ok(receiptSheetLayout.sheet.bottom <= 852 + 1, `receipt sheet exceeds the native screen: ${receiptSheetLayout.sheet.bottom}`);
assert.ok(Number.parseFloat(receiptSheetLayout.sheetContentPaddingBottom ?? "0") >= 34, `receipt sheet content does not reserve the safe area: ${receiptSheetLayout.sheetContentPaddingBottom}`);
assert.ok(receiptSheetLayout.documentScrollWidth <= 393, `receipt sheet creates horizontal document overflow: ${receiptSheetLayout.documentScrollWidth}`);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-receipt-sheet.png") });
await screen.screenshot({ path: path.join(outputDir, "native-receipt-screen-393x852.png") });
await page.keyboard.press("Escape");
await waitForSheetClose();

await page.locator(".meal-plan-button").click();
await page.getByTestId("bottom-sheet").waitFor({ state: "visible" });
await page.waitForTimeout(650);
const mealSheetLayout = await readSheetLayout();
assert.ok(mealSheetLayout.sheet, "meal sheet has no layout");
assert.ok(mealSheetLayout.sheet.width <= 393 + 1, `meal sheet overflows width: ${mealSheetLayout.sheet.width}`);
assert.ok(mealSheetLayout.sheet.bottom <= 852 + 1, `meal sheet exceeds the native screen: ${mealSheetLayout.sheet.bottom}`);
assert.ok(Number.parseFloat(mealSheetLayout.sheetContentPaddingBottom ?? "0") >= 34, `meal sheet content does not reserve the safe area: ${mealSheetLayout.sheetContentPaddingBottom}`);
assert.ok(mealSheetLayout.documentScrollWidth <= 393, `meal sheet creates horizontal document overflow: ${mealSheetLayout.documentScrollWidth}`);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-meal-sheet.png") });
const mealSheetContent = page.locator(".sheet-content");
await mealSheetContent.evaluate((element) => { element.scrollTop = element.scrollHeight; });
await page.waitForTimeout(80);
const mealSheetActionLayout = await page.evaluate(() => {
  const action = document.querySelector(".recipe-actions");
  const rect = action?.getBoundingClientRect();
  return rect?.toJSON() ?? null;
});
assert.ok(mealSheetActionLayout, "meal sheet actions have no layout after scrolling");
assert.ok(mealSheetActionLayout.bottom <= 852 - 33, `meal sheet actions enter the safe area: ${mealSheetActionLayout.bottom}`);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-meal-sheet-scrolled.png") });
await page.keyboard.press("Escape");
await waitForSheetClose();

await page.locator(".priority-card").first().click();
await page.getByTestId("bottom-sheet").waitFor({ state: "visible" });
await page.waitForTimeout(650);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-food-detail-sheet.png") });
const detailSheetLayout = await readSheetLayout();
assert.ok(detailSheetLayout.sheet, "detail sheet has no layout");
assert.ok(detailSheetLayout.sheet.width <= 393 + 1, `detail sheet overflows width: ${detailSheetLayout.sheet.width}`);
assert.ok(Number.parseFloat(detailSheetLayout.sheetContentPaddingBottom ?? "0") >= 34, `detail sheet content does not reserve the safe area: ${detailSheetLayout.sheetContentPaddingBottom}`);
assert.ok(detailSheetLayout.documentScrollWidth <= 393, `detail sheet creates horizontal document overflow: ${detailSheetLayout.documentScrollWidth}`);
await page.keyboard.press("Escape");
await waitForSheetClose();

await page.locator(".connection-pill").click();
await page.getByTestId("bottom-sheet").waitFor({ state: "visible" });
await page.waitForTimeout(650);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-account-sheet.png") });
const accountSheetLayout = await readSheetLayout();
assert.ok(accountSheetLayout.sheet, "account sheet has no layout");
assert.ok(accountSheetLayout.sheet.width <= 393 + 1, `account sheet overflows width: ${accountSheetLayout.sheet.width}`);
assert.ok(Number.parseFloat(accountSheetLayout.sheetContentPaddingBottom ?? "0") >= 34, `account sheet content does not reserve the safe area: ${accountSheetLayout.sheetContentPaddingBottom}`);
assert.ok(accountSheetLayout.documentScrollWidth <= 393, `account sheet creates horizontal document overflow: ${accountSheetLayout.documentScrollWidth}`);
await page.keyboard.press("Escape");
await waitForSheetClose();

await page.locator(".notification-button").click();
await page.getByTestId("bottom-sheet").waitFor({ state: "visible" });
await page.waitForTimeout(650);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-notifications-sheet.png") });
const notificationSheetLayout = await readSheetLayout();
assert.ok(notificationSheetLayout.sheet, "notification sheet has no layout");
assert.ok(notificationSheetLayout.sheet.width <= 393 + 1, `notification sheet overflows width: ${notificationSheetLayout.sheet.width}`);
assert.ok(Number.parseFloat(notificationSheetLayout.sheetContentPaddingBottom ?? "0") >= 34, `notification sheet content does not reserve the safe area: ${notificationSheetLayout.sheetContentPaddingBottom}`);
assert.ok(notificationSheetLayout.documentScrollWidth <= 393, `notification sheet creates horizontal document overflow: ${notificationSheetLayout.documentScrollWidth}`);
await page.keyboard.press("Escape");
await waitForSheetClose();

await page.locator(".trust-card").click();
await page.getByTestId("bottom-sheet").waitFor({ state: "visible" });
await page.waitForTimeout(650);
await page.getByTestId("bottom-sheet").screenshot({ path: path.join(outputDir, "native-guidance-sheet.png") });
const guidanceSheetLayout = await readSheetLayout();
assert.ok(guidanceSheetLayout.sheet, "guidance sheet has no layout");
assert.ok(guidanceSheetLayout.sheet.width <= 393 + 1, `guidance sheet overflows width: ${guidanceSheetLayout.sheet.width}`);
assert.ok(Number.parseFloat(guidanceSheetLayout.sheetContentPaddingBottom ?? "0") >= 34, `guidance sheet content does not reserve the safe area: ${guidanceSheetLayout.sheetContentPaddingBottom}`);
assert.ok(guidanceSheetLayout.documentScrollWidth <= 393, `guidance sheet creates horizontal document overflow: ${guidanceSheetLayout.documentScrollWidth}`);
await page.keyboard.press("Escape");
await waitForSheetClose();

const layout = await page.evaluate(() => {
  const screenElement = document.querySelector('[data-testid="device-screen"]');
  const home = document.querySelector('.meal-home');
  const nav = document.querySelector('.app-bottom-nav');
  const viewport = document.querySelector('[data-testid="mobile-app-viewport"]');
  const css = (element) => element ? getComputedStyle(element) : null;
  return {
    screen: screenElement?.getBoundingClientRect().toJSON(),
    viewport: viewport?.getBoundingClientRect().toJSON(),
    home: home ? { paddingTop: css(home).paddingTop, paddingBottom: css(home).paddingBottom, minHeight: css(home).minHeight } : null,
    nav: nav ? { top: nav.getBoundingClientRect().top, bottom: nav.getBoundingClientRect().bottom, height: nav.getBoundingClientRect().height, position: css(nav).position } : null,
    safeAreaTop: css(screenElement)?.getPropertyValue("--device-safe-area-top") ?? "",
    safeAreaBottom: css(screenElement)?.getPropertyValue("--device-safe-area-bottom") ?? "",
  };
});

const summary = {
  baseUrl,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 1,
  appShell: "native",
  capturedStates: ["home", "receipt sheet", "meal sheet", "food detail sheet", "account sheet", "notifications sheet", "guidance sheet"],
  primaryInteractions: [
    "open receipt sheet",
    "dismiss receipt with Escape",
    "open meal sheet",
    "dismiss meal with Escape",
    "open food detail sheet",
    "dismiss detail with Escape",
    "open account sheet",
    "dismiss account with Escape",
    "open notifications sheet",
    "dismiss notifications with Escape",
    "open guidance sheet",
    "dismiss guidance with Escape",
  ],
  consoleErrors,
  pageErrors,
  receiptSheetLayout,
  mealSheetLayout,
  mealSheetActionLayout,
  detailSheetLayout,
  accountSheetLayout,
  notificationSheetLayout,
  guidanceSheetLayout,
  layout,
};
fs.writeFileSync(path.join(outputDir, "native-capture-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();
assert.deepEqual(consoleErrors, [], "native browser console errors were reported");
assert.deepEqual(pageErrors, [], "native page errors were reported");
console.log(JSON.stringify(summary, null, 2));
