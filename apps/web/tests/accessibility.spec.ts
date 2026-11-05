import { expect, test } from "@playwright/test";
import { chooseAddMethod } from "./add-flow-helpers";
import { gotoTab, setThemeFromMe } from "./ia-helpers";
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
  // Each theme switch now goes through the 나 sheet.
  test.slow();
  await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
  await page.reload();

  for (const theme of ["light", "dark"] as const) {
    await setThemeFromMe(page, theme);
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    // Days-left chips live on the 냉장고 list; the primary action stays on Home.
    await gotoTab(page, "fridge");

    {
      // Days-left chips carry the review urgency now; every chip state must stay readable.
      // Card surfaces transition after a theme change; measure the settled colors.
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]));
      const chipContrasts = await page.evaluate(() => {
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
        const chips = Array.from(document.querySelectorAll<HTMLElement>(".priority-card .freshness-chip, .inventory-row .freshness-chip"));
        chips.forEach((chip, index) => chip.setAttribute("data-contrast-probe", String(index)));
        return chips.map((chip, index) => ({ text: `${chip.className} ${chip.textContent}`, ...measure(`[data-contrast-probe="${index}"]`) }));
      });
      expect(chipContrasts.length, `${theme} days-left chips render`).toBeGreaterThan(0);
      for (const chip of chipContrasts) {
        expect(chip.contrast, `${theme} ${chip.text} chip contrast`).toBeGreaterThanOrEqual(4.5);
      }
    }

    await gotoTab(page, "home");
    // The action's background transitions after a theme change; measure the settled colors.
    await page.locator(".meal-plan-button").evaluate((button) => Promise.all(button.getAnimations().map((animation) => animation.finished)));
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
    const primaryShadow = await page.locator(".meal-plan-button").evaluate((button) => ({
      value: getComputedStyle(button).boxShadow,
      token: getComputedStyle(button.closest(".meal-home")!).getPropertyValue("--atelier-primary-action-shadow"),
    }));
    expect(primaryShadow.value, `${theme} primary action keeps its depth`).not.toBe("none");
    // The kitchen palette tints the action's depth with its own leek green instead of the old blue.
    expect(primaryShadow.token, `${theme} primary shadow token`).toContain(theme === "light" ? "#1b6c42" : "#237a4b");
  }
});

test("food detail sheet passes axe audit", async ({ page }) => {
  await gotoTab(page, "fridge");
      await page.locator(".inventory-row").filter({ hasText: "시금치" }).click();
  await openSheet(page, "시금치");
  await expectNoViolations(page, "food detail");
});

test("printed-date recheck sheet passes axe audit in light and dark themes", async ({ page }) => {
  // Each theme switch now goes through the 나 sheet.
  test.slow();
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await setThemeFromMe(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
      await gotoTab(page, "fridge");
      await page.locator(".inventory-row").filter({ hasText: "시금치" }).click();
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

      await gotoTab(page, "fridge");
      await page.locator(".inventory-row").filter({ hasText: "시금치" }).click();
      const detail = await openSheet(page, "시금치");
      await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
      const dateRecheck = await openSheet(page, "날짜 다시 살펴보기");
      await expect(dateRecheck.getByRole("heading", { name: "날짜 다시 살펴보기" })).toBeInViewport();
      const currentRecord = dateRecheck.getByRole("group", { name: /현재 기록된 날짜 포장 소비기한/ });
      await expect(currentRecord).toBeVisible();
      await expect(currentRecord).toBeInViewport();
      await expect(currentRecord.getByText("현재 기록")).toHaveCSS("font-size", "10px");
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
        const luminance = (color: string) => {
          const probe = document.createElement("canvas").getContext("2d")!;
          probe.fillStyle = color;
          probe.fillRect(0, 0, 1, 1);
          const channels = Array.from(probe.getImageData(0, 0, 1, 1).data).slice(0, 3).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
        };
        const muted = style.getPropertyValue("--atelier-muted").trim();
        const [lighter, darker] = [luminance(muted), luminance(style.backgroundColor)].sort((a, b) => b - a);
        return {
          contrast: window.matchMedia("(prefers-contrast: more)").matches,
          muted,
          border: style.getPropertyValue("--atelier-border-strong").trim(),
          mutedContrast: (lighter! + 0.05) / (darker! + 0.05),
        };
      });
      expect(highContrastTokens.contrast).toBe(true);
      // Kitchen palette high-contrast tokens (no blue tint); the default muted ink is #5d6d64 / #9cb0a4.
      expect(highContrastTokens.muted).toBe(theme === "light" ? "#3f4d45" : "#c4d3ca");
      // --atelier-border-strong follows the semantic --line-strong token (kitchen.css).
      expect(highContrastTokens.border).toBe(theme === "light" ? "rgba(22, 34, 27, 0.6)" : "rgba(233, 240, 235, 0.66)");
      expect(highContrastTokens.mutedContrast, `${theme} high-contrast muted ink on the sheet`).toBeGreaterThanOrEqual(7);
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
  await openSheet(page, "체험 안내");
  await expectNoViolations(page, "account sheet");
  await page.keyboard.press("Escape");
  // The exit animation keeps the closed sheet mounted (and aria-hidden) for
  // ~160ms; scanning inside that window flags a transient focus race.
  await expect(page.getByRole("dialog", { name: "체험 안내" })).toHaveCount(0);

  await page.locator(".notification-button").click();
  await openSheet(page, "알림");
  await expectNoViolations(page, "notification center");
});

test("receipt review sheet passes axe audit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await chooseAddMethod(page, "영수증");
  await openSheet(page, "영수증으로 추가");
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeVisible();
  await page.waitForTimeout(250);
  await expectNoViolations(page, "receipt review");
  // axe usually reports this tinted control as "incomplete" (overlapping sheet layers), so measure it directly.
  const activeStorageContrast = await page.locator(".storage-option-active").first().evaluate((option) => {
    const channels = (color: string) => {
      const values = color.match(/[\d.]+/g)!.map(Number);
      return color.startsWith("color(srgb")
        ? { rgb: values.slice(0, 3).map((value) => value * 255), alpha: values[3] ?? 1 }
        : { rgb: values.slice(0, 3), alpha: values[3] ?? 1 };
    };
    const luminance = (rgb: number[]) => {
      const [red, green, blue] = rgb.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const tint = channels(getComputedStyle(option).backgroundColor);
    const sheet = channels(getComputedStyle(option.closest(".bottom-sheet")!).backgroundColor);
    const background = tint.rgb.map((channel, index) => channel * tint.alpha + sheet.rgb[index] * (1 - tint.alpha));
    const foreground = channels(getComputedStyle(option).color).rgb;
    const [lighter, darker] = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  });
  expect(activeStorageContrast, "active storage option contrast").toBeGreaterThanOrEqual(4.5);
});
