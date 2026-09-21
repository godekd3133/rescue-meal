import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto("http://localhost:5174/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2200);
// inventory tab
await page.getByRole("button", { name: "식품" }).last().click().catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/r-inventory.png" });
// back home, open notifications
await page.getByRole("button", { name: "홈" }).last().click().catch(() => {});
await page.waitForTimeout(800);
await page.locator(".notification-button").first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/r-notif.png" });
// meal plan
await page.keyboard.press("Escape");
await page.locator(".sheet-close, [aria-label*='닫기']").first().click().catch(() => {});
await page.waitForTimeout(600);
await page.getByText("식단 만들기").first().click().catch(() => {});
await page.waitForTimeout(1400);
await page.screenshot({ path: "/tmp/r-mealplan.png" });
await browser.close();
console.log("done");
