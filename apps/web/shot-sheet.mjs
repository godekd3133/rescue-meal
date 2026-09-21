import { chromium } from "playwright";
const theme = process.argv[2] || "light";
const action = process.argv[3] || "detail";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.addInitScript((t) => { window.localStorage.setItem("rescue-meal.theme", t); }, theme);
await page.goto("http://localhost:5174/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
if (action === "detail") {
  await page.locator(".priority-card, .queue-card, [class*='food']").first().click().catch(() => {});
} else if (action === "add") {
  await page.getByText("식품 추가하기").first().click().catch(() => {});
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `/tmp/rescue-${theme}-${action}.png` });
await browser.close();
console.log("done", theme, action);
