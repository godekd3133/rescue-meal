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

test("home surface passes axe audit at narrow and standard mobile widths", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate((nextTheme) => window.localStorage.setItem("rescue-meal.theme", nextTheme), theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
      await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
      await expect(page.locator(".brand-lockup")).toHaveAttribute("aria-label", "Rescue Meal");
      await expect(page.locator(".brand-mark")).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".brand-name")).toHaveAttribute("aria-hidden", "true");
      await expectNoViolations(page, `home ${viewport.width}px ${theme}`);
    }
  }
});

test("primary home action text meets contrast in light and dark themes", async ({ page }) => {
  await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
  await page.reload();

  for (const theme of ["light", "dark"] as const) {
    if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
      await page.getByTestId("theme-toggle").click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    const ratios = await page.locator(".meal-plan-button").evaluate((button) => {
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        if (!channels || channels.length !== 3) throw new Error(`Unparseable CSS color: ${color}`);
        const [red, green, blue] = channels.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const background = getComputedStyle(button).backgroundColor;
      const contrast = (foreground: string) => {
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = luminance(background);
        return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      };
      return {
        label: contrast(getComputedStyle(button.querySelector("strong")!).color),
        supportingCopy: contrast(getComputedStyle(button.querySelector("small")!).color),
      };
    });

    expect(ratios.label, `${theme} primary label contrast`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.supportingCopy, `${theme} primary supporting-copy contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test("food detail sheet passes axe audit", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  await openSheet(page, "시금치");
  await expectNoViolations(page, "food detail");
});

test("printed-date recheck sheet passes axe audit in light and dark themes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
        await page.getByTestId("theme-toggle").click();
      }
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
      await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
      const detail = await openSheet(page, "시금치");
      await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();

      const dateRecheck = await openSheet(page, "날짜 다시 살펴보기");
      await expect(dateRecheck.getByRole("group", { name: /현재 기록된 날짜 포장 소비기한/ })).toBeVisible();
      await expectNoViolations(page, `printed-date recheck ${viewport.width}px ${theme}`);
    }
  }
});

test("account and notification surfaces pass axe audit", async ({ page }) => {
  await page.locator(".connection-pill").click();
  await openSheet(page, "내 계정");
  await expectNoViolations(page, "account sheet");
  await page.keyboard.press("Escape");
  // The exit animation keeps the closed sheet mounted (and aria-hidden) for
  // ~160ms; scanning inside that window flags a transient focus race.
  await expect(page.getByRole("dialog", { name: "내 계정" })).toHaveCount(0);

  await page.locator(".mobile-hero-notification").click();
  await openSheet(page, "알림");
  await expectNoViolations(page, "notification center");
});

test("receipt review sheet passes axe audit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await openSheet(page, "영수증으로 추가");
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeVisible();
  await expectNoViolations(page, "receipt review");
});
