import { expect, test } from "@playwright/test";
import { chooseAddMethod } from "./add-flow-helpers";

// The other suites run without motion (the app turns it off for automated browsers) so they
// measure settled layout. This file turns motion on and checks that only motion answering an
// action plays: a short tab entrance, press/confirm feedback; no decorative entrances.
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

test("home opens settled: no letter reveal, count-up, dealt cards or wipe-ins", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" });
  await expect(heading).toBeVisible();
  // The count is part of the sentence from the first frame.
  await expect(page.locator(".rescue-hero-count")).toHaveText("6");
  await expect(page.locator(".reveal-char")).toHaveCount(0);
  const names = await runningAnimationNames(page);
  for (const decorative of ["m-char", "m-wipe", "m-deal", "m-pop", "m-curtain", "m-fab", "m-dock", "m-nudge", "m-pill"]) expect(names).not.toContain(decorative);
  await settle(page);
  const clipped = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => getComputedStyle(button).clipPath !== "none").length);
  expect(clipped).toBe(0);
  await expect(page.locator(".rescue-card").first()).toHaveCSS("opacity", "1");
});

test("a tab change plays one short screen entrance and never delays the tap", async ({ page }) => {
  await page.goto("/");
  await settle(page);

  await page.locator(".app-bottom-nav-item").nth(1).click();
  await expect(page.locator(".app-bottom-nav-item").nth(1)).toHaveAttribute("aria-current", "page");
  const entrance = await page.evaluate(() => document.getAnimations().map((animation) => animation.effect?.getTiming().duration).filter((duration) => typeof duration === "number"));
  // Web Animations entrance: at most 200ms.
  for (const duration of entrance) expect(duration as number).toBeLessThanOrEqual(200);
  await settle(page);

  await page.getByTestId("nav-add-food").click();
  await chooseAddMethod(page, "영수증");
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet).toBeVisible();
  // Sheet content does not stagger in; only the sheet's own spring moves.
  expect(await runningAnimationNames(page)).not.toContain("m-rise");
  await settle(page);
  await expect(sheet.getByRole("button", { name: "닫기" })).toBeVisible();
});

test("the second tap on 먹었어요 confirms with one short pulse", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const tofu = page.locator(".rescue-card").filter({ hasText: "국산콩 두부" });
  await tofu.getByRole("button", { name: "국산콩 두부 먹었어요" }).click();
  await expect(tofu.locator(".rescue-card-action-ate")).toHaveCSS("animation-name", "m-confirm");
});

test("reduced motion keeps every surface still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" })).toBeVisible();
  await expect(page.locator(".rescue-hero-count")).toHaveText("6");
  const names = await runningAnimationNames(page);
  expect(names.filter((name) => name.startsWith("m-"))).toEqual([]);
});
