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

    if (theme === "dark") {
      const priorityStateColors = await page.evaluate(() => {
        const context = document.createElement("canvas").getContext("2d")!;
        context.canvas.width = 1;
        context.canvas.height = 1;
        const paint = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
        };
        const sample = () => Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        const luminance = (rgb: number[]) => {
          const channels = rgb.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
        };
        const measure = (selector: string) => {
          const label = document.querySelector<HTMLElement>(selector)!;
          const ancestors: HTMLElement[] = [];
          for (let element: HTMLElement | null = label; element; element = element.parentElement) ancestors.push(element);
          context.clearRect(0, 0, 1, 1);
          for (const element of ancestors.reverse()) paint(getComputedStyle(element).backgroundColor);
          const backgroundLuminance = luminance(sample());
          context.clearRect(0, 0, 1, 1);
          paint(getComputedStyle(label).color);
          const foregroundLuminance = luminance(sample());
          return {
            color: getComputedStyle(label).color,
            contrast: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
              / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
          };
        };
        return {
          review: measure(".priority-state-review"),
          action: measure(".priority-state-action"),
        };
      });
      expect(priorityStateColors.review.color).toBe("rgb(255, 184, 166)");
      expect(priorityStateColors.action.color).toBe("rgb(255, 211, 138)");
      expect(priorityStateColors.review.contrast).toBeGreaterThanOrEqual(4.5);
      expect(priorityStateColors.action.contrast).toBeGreaterThanOrEqual(4.5);
    }

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

test("printed-date recheck keeps its current record clear with system high contrast", async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-contrast", value: "more" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ] });
  let screenshotIndex = 19;

  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate((nextTheme) => window.localStorage.setItem("rescue-meal.theme", nextTheme), theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
      await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();

      await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
      const detail = await openSheet(page, "시금치");
      await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
      const dateRecheck = await openSheet(page, "날짜 다시 살펴보기");
      await expect(dateRecheck.getByRole("heading", { name: "날짜 다시 살펴보기" })).toBeInViewport();
      const currentRecord = dateRecheck.getByRole("group", { name: /현재 기록된 날짜 포장 소비기한/ });
      await expect(currentRecord).toBeVisible();
      await expect(currentRecord).toBeInViewport();
      await expect(currentRecord.locator("span")).toHaveCSS("font-size", "10px");
      await expect(currentRecord.locator("strong")).toHaveCSS("font-size", "12px");
      await expect.poll(() => currentRecord.evaluate((group) => {
        const value = group.querySelector<HTMLElement>("strong");
        if (!value) return false;
        const groupBox = group.getBoundingClientRect();
        const valueBox = value.getBoundingClientRect();
        return valueBox.left >= groupBox.left - 1 && valueBox.right <= groupBox.right + 1;
      })).toBe(true);

      const highContrastTokens = await dateRecheck.evaluate((dialog) => {
        const style = getComputedStyle(dialog);
        return {
          contrast: window.matchMedia("(prefers-contrast: more)").matches,
          muted: style.getPropertyValue("--atelier-muted").trim(),
          border: style.getPropertyValue("--atelier-border-strong").trim(),
        };
      });
      expect(highContrastTokens.contrast).toBe(true);
      expect(highContrastTokens.muted).toBe(theme === "light" ? "#4e5968" : "#b7c8bf");
      expect(highContrastTokens.border).toBe(theme === "light" ? "rgba(2, 32, 71, 0.38)" : "rgba(235, 246, 238, 0.58)");
      await expectNoViolations(page, `printed-date recheck high contrast ${viewport.width}px ${theme}`);
      await page.screenshot({
        path: `../../evidence/mobile-flow-review-2026-09-29/${String(screenshotIndex++).padStart(2, "0")}-date-recheck-${viewport.width}x${viewport.height}-high-contrast-${theme}.png`,
        scale: "css",
      });
    }
  }

  await client.detach();
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
