import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// Scans are scoped to the device screen so the audit covers app content plus
// sheets rendered through the phone portal, not surrounding preview chrome.

async function expectNoViolations(page: import("@playwright/test").Page, surface: string) {
  const results = await new AxeBuilder({ page }).include(".device-screen").analyze();
  const violations = results.violations.map(
    (violation) => `${surface}: ${violation.impact} ${violation.id} (${violation.nodes.length} nodes) ${violation.nodes.map((node) => node.target.join(" ")).join(" | ")}`,
  );
  expect(violations).toEqual([]);
}

async function openSheet(page: import("@playwright/test").Page, name: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  // Radix moves focus into the sheet a frame after the trigger click; scanning
  // in that gap flags a transient aria-hidden-focus race, not a real defect.
  // Waiting here also asserts the focus-management contract.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const sheet = document.querySelector('[data-testid="bottom-sheet"]');
        return sheet ? sheet.contains(document.activeElement) : false;
      }),
    )
    .toBe(true);
  // Let the open transition fully settle: under parallel load, scanning before
  // the post-focus frame can still catch aria-hidden's transient application.
  await page.waitForTimeout(250);
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("home surface passes axe audit", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await expectNoViolations(page, "home");
});

test("food detail sheet passes axe audit", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  await openSheet(page, "시금치");
  await expectNoViolations(page, "food detail");
});

test("account and notification surfaces pass axe audit", async ({ page }) => {
  await page.locator(".connection-pill").click();
  await openSheet(page, "내 계정");
  await expectNoViolations(page, "account sheet");
  await page.keyboard.press("Escape");
  // The exit animation keeps the closed sheet mounted (and aria-hidden) for
  // ~160ms; scanning inside that window flags a transient focus race.
  await expect(page.getByRole("dialog", { name: "내 계정" })).toHaveCount(0);

  await page.locator(".notification-button").click();
  await openSheet(page, "알림");
  await expectNoViolations(page, "notification center");
});

test("receipt review sheet passes axe audit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await openSheet(page, "영수증으로 추가");
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await expect(page.getByRole("button", { name: "3개 항목 반영하기" })).toBeVisible();
  await expectNoViolations(page, "receipt review");
});
