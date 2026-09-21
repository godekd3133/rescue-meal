import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto("http://localhost:5174/", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2200);
// shopping list / more buttons — try common entries
for (const [name, sel] of [["account", ".icon-button"], ["cart", null]]) {
  if (sel) { /* skip */ }
}
// Try opening account via any account-ish button
const accountBtn = page.locator("[aria-label*='계정'], [aria-label*='설정'], [data-testid*='account']").first();
if (await accountBtn.count()) { await accountBtn.click().catch(()=>{}); }
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/r-account.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/r-after-esc.png" });
await browser.close();
console.log("done");
