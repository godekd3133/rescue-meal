import { expect, test } from "@playwright/test";
import { chooseAddMethod } from "./add-flow-helpers";

// The other suites run without entrance motion (the app turns it off for automated
// browsers) so they measure settled layout. This file turns motion on and checks the entrance choreography plays, settles, and never
// leaves anything clipped or blocks a tap.
test.use({ reducedMotion: "no-preference" });

const FIXTURE_NOW = new Date("2026-09-03T12:00:00+09:00");

test.beforeEach(async ({ page }) => {
  // The app keeps entrance motion off in automated browsers; opt this file back in.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
  await page.addInitScript((fixedNow) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixedNow);
        else super(...(args as [string]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = FixedDate as DateConstructor;
  }, FIXTURE_NOW.getTime());
});

const runningAnimationNames = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...new Set(document.getAnimations().map((animation) => (animation as CSSAnimation).animationName).filter(Boolean))]);

const settle = (page: import("@playwright/test").Page) =>
  page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running" || (animation.effect?.getTiming().iterations ?? 1) === Infinity), undefined, { timeout: 5_000 });

test("home writes its headline in letter by letter, counts up, and deals the rescue cards", async ({ page }) => {
  await page.goto("/");
  const started = Date.now();
  const heading = page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" });
  await expect(heading).toBeVisible();
  await expect(page.locator("#greeting-title .reveal-char")).toHaveCount(7);
  expect(await runningAnimationNames(page)).toEqual(expect.arrayContaining(["m-char"]));

  await settle(page);
  // The whole entrance settles quickly (budget ~700ms of choreography plus load).
  expect(Date.now() - started).toBeLessThan(2_500);
  await expect(page.locator(".rescue-hero-count")).toHaveText("6");
  await expect(heading).toHaveText("오늘 살펴볼 음식6개");
  const clipped = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => getComputedStyle(button).clipPath !== "none").length);
  expect(clipped).toBe(0);
  const cards = page.locator(".rescue-card");
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toHaveCSS("opacity", "1");
});

test("tab changes and sheets animate without delaying the tap", async ({ page }) => {
  await page.goto("/");
  await settle(page);

  await page.locator(".app-bottom-nav-item").nth(1).click();
  expect(await runningAnimationNames(page)).toEqual(expect.arrayContaining(["m-pill"]));
  await settle(page);

  // Returning to Home does not replay the letter intro.
  await page.locator(".app-bottom-nav-item").first().click();
  expect(await runningAnimationNames(page)).not.toContain("m-char");
  await settle(page);
  await expect(page.locator(".rescue-hero-count")).toHaveText("6");

  await page.getByTestId("nav-add-food").click();
  await chooseAddMethod(page, "영수증");
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet).toBeVisible();
  expect(await runningAnimationNames(page)).toEqual(expect.arrayContaining(["m-rise"]));
  await settle(page);
  await expect(sheet.getByRole("button", { name: "닫기" })).toBeVisible();
});

test("the letter intro plays on the first open of the day only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#greeting-title .reveal-char")).toHaveCount(7);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" })).toBeVisible();
  await expect(page.locator("#greeting-title .reveal-char")).toHaveCount(0);
});

test("reduced motion keeps every surface still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" })).toBeVisible();
  await expect(page.locator(".rescue-hero-count")).toHaveText("6");
  const names = await runningAnimationNames(page);
  expect(names.filter((name) => name.startsWith("m-"))).toEqual([]);
});
