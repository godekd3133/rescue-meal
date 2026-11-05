import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseAddMethod } from "./add-flow-helpers";
import { getHomeReviewTopicLabel } from "../src/homeReviewSummary";

type NarrowViewportMetrics = {
  viewportWidth: number;
  bodyScrollWidth: number;
  documentScrollWidth: number;
  containers: Array<{ name: string; scrollWidth: number; clientWidth: number }>;
  outOfBounds: Array<{ tag: string; className: string; text: string; left: number; right: number }>;
};

function relativeLuminance(color: string) {
  const matchedChannels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!matchedChannels || matchedChannels.length !== 3) throw new Error(`Unparseable CSS color: ${color}`);
  const channels = color.startsWith("color(srgb") ? matchedChannels.map((channel) => channel * 255) : matchedChannels;
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function readNarrowViewportMetrics(page: Page) {
  return page.evaluate((): NarrowViewportMetrics => {
    const viewportWidth = window.innerWidth;
    const containers = [
      ["body", document.body],
      ["document", document.documentElement],
      ["screen", document.querySelector<HTMLElement>("[data-phone-screen]")],
      ["viewport", document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")],
      ["home", document.querySelector<HTMLElement>(".meal-home")],
    ]
      .filter((entry): entry is [string, HTMLElement] => entry[1] instanceof HTMLElement)
      .map(([name, element]) => ({ name, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    // A deliberate sideways row (the fridge shelf stickers) may hold controls past the edge as long as
    // the row itself stays inside the viewport and scrolls far enough to reach them.
    const reachableInSidewaysRow = (element: HTMLElement) => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX !== "auto" && overflowX !== "scroll") continue;
        const row = node.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return row.left >= -1 && row.right <= viewportWidth + 1
          && rect.right - row.left <= node.scrollWidth + 1;
      }
      return false;
    };
    const outOfBounds = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select, [role=button]"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.left < -1 || rect.right > viewportWidth + 1)
          && !reachableInSidewaysRow(element);
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : "",
          text: (element.textContent ?? "").trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      });
    return {
      viewportWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      containers,
      outOfBounds,
    };
  });
}

async function assertDialogFitsNarrowViewport(page: Page, dialog: Locator) {
  const metrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const interactiveOutOfBounds = Array.from(element.querySelectorAll<HTMLElement>("button, input, textarea, select, [role=button]"))
      .filter((child) => {
        const style = getComputedStyle(child);
        const childRect = child.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && childRect.width > 0 && childRect.height > 0
          && (childRect.left < -1 || childRect.right > viewportWidth + 1);
      })
      .map((child) => (child.textContent ?? "").trim().slice(0, 80));
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      interactiveOutOfBounds,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(321);
  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.interactiveOutOfBounds).toEqual([]);
}

async function waitForSheetSettled(page: Page) {
  await page.waitForFunction(() => {
    const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]");
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    if (!sheet || !screen) return false;
    return Math.abs(sheet.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom) <= 0.25
      && getComputedStyle(sheet).transform === "none";
  });
}

// The narrowest phones show the shopping card past the first fold; prove scrolling clears the bottom navigation.
async function scrollClearOfBottomNavigation(page: Page, selector: string) {
  return page.evaluate((targetSelector) => {
    const scroller = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]")!;
    const target = document.querySelector<HTMLElement>(targetSelector)!;
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    const overflow = target.getBoundingClientRect().bottom - navigation.getBoundingClientRect().top;
    if (overflow > 0) scroller.scrollTop += overflow + 8;
    return { targetBottom: target.getBoundingClientRect().bottom, navigationTop: navigation.getBoundingClientRect().top };
  }, selector);
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "주요 메뉴" });

// Tabs are screens: 홈 · 냉장고 · ( + ) · 식단 · 장보기.
async function openTab(page: Page, name: "홈" | "냉장고" | "식단" | "장보기") {
  await mainNav(page).getByRole("button", name === "장보기" ? { name: /^장보기/ } : { name, exact: true }).click();
}

// The theme switch lives in 나 (the avatar in every tab header).
async function toggleThemeInMe(page: Page) {
  await page.locator(".connection-pill").click();
  const sheet = page.getByTestId("bottom-sheet");
  await waitForSheetSettled(page);
  await sheet.getByTestId("theme-toggle").click();
  await sheet.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

// The full inventory lives on the 냉장고 tab.
async function openFridgeFood(page: Page, name: string) {
  await openTab(page, "냉장고");
  await page.locator(".inventory-row").filter({ hasText: name }).first().click();
}

const FIXED_NOW = "2026-09-03T12:00:00+09:00";

// Sample dates are relative to today; a fixed clock keeps the dated assertions true.
test.beforeEach(async ({ page }) => {
  // A plain Date shim: page.clock.setFixedTime freezes sheet exit animations after a same-page navigation.
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
  }, new Date(FIXED_NOW).getTime());
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
});

test("keeps the native home inside a 320px viewport", async ({ page }) => {
  const metrics = await readNarrowViewportMetrics(page);

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.containers.every((container) => container.scrollWidth <= container.clientWidth + 1)).toBeTruthy();
  expect(metrics.outOfBounds).toEqual([]);
  // Home metadata is the deck quantity and the storage rows now that the full list lives on 냉장고.
  const compactMetadataFontSizes = await page.locator(".rescue-card-qty, .home-shelf-name").evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(compactMetadataFontSizes.length).toBeGreaterThan(0);
  expect(Math.min(...compactMetadataFontSizes)).toBeGreaterThanOrEqual(8);
  const compactBrand = await page.locator(".brand-name").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { height: rect.height, fontSize: Number.parseFloat(style.fontSize), whiteSpace: style.whiteSpace, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(compactBrand.whiteSpace).toBe("nowrap");
  expect(compactBrand.height).toBeLessThanOrEqual(compactBrand.fontSize + 1);
  expect(compactBrand.scrollWidth).toBeLessThanOrEqual(compactBrand.clientWidth + 1);
  // Quick-add moved from beside the meal CTA into the centre of the floating navigation.
  const navAdd = page.getByRole("button", { name: "식품 추가하기" });
  await expect(navAdd).toBeVisible();
  await expect(navAdd).toBeInViewport();
  const navAddBox = await navAdd.boundingBox();
  expect(navAddBox!.width).toBeGreaterThanOrEqual(44);
  expect(navAddBox!.height).toBeGreaterThanOrEqual(44);
  expect(navAddBox!.x).toBeGreaterThanOrEqual(0);
  expect(navAddBox!.x + navAddBox!.width).toBeLessThanOrEqual(metrics.viewportWidth);
  await expect(page.getByRole("button", { name: /오늘 뭐 먹지/ })).toBeVisible();
});

test("updates the Home date after local midnight while the app stays open", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const timezoneOffset = await page.evaluate(() => new Date().getTimezoneOffset());
  const justBeforeLocalMidnight = new Date(Date.UTC(2026, 8, 28, 23, 59, 30) + timezoneOffset * 60_000);
  await page.clock.install({ time: justBeforeLocalMidnight });
  await page.goto("/");

  const todayLabel = page.locator(".greeting-block .eyebrow");
  await expect(todayLabel).toHaveText("월요일, 9월 28");
  await page.clock.fastForward(60_000);
  await expect(todayLabel).toHaveText("화요일, 9월 29");
});

test("keeps home food source details readable across narrow viewport themes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
      await page.reload();
      if (theme === "dark") await toggleThemeInMe(page);
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      // Card surfaces transition after a theme change; read the settled colors.
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]));
      // Home shows urgent foods once, on the rescue deck: each card carries a days-left chip that must
      // stay inside its photo and readable, and its quantity line must meet contrast on the card.
      const cards = page.locator(".rescue-card");
      await expect(cards).toHaveCount(6);
      const chipReadback = await page.locator(".rescue-card .rescue-card-chip").evaluateAll((elements) =>
        elements.map((element) => {
          const chip = element as HTMLElement;
          const photo = chip.closest<HTMLElement>(".rescue-card-photo")!;
          const bounds = chip.getBoundingClientRect();
          const photoBounds = photo.getBoundingClientRect();
          let background = "rgba(0, 0, 0, 0)";
          for (let node: HTMLElement | null = chip; node; node = node.parentElement) {
            const color = getComputedStyle(node).backgroundColor;
            if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = color; break; }
          }
          return {
            text: chip.textContent?.trim() ?? "",
            clipped: chip.scrollWidth > chip.clientWidth + 0.5,
            withinPhoto: bounds.left >= photoBounds.left - 0.5 && bounds.right <= photoBounds.right + 0.5,
            fontSize: Number.parseFloat(getComputedStyle(chip).fontSize),
            color: getComputedStyle(chip).color,
            background,
          };
        }),
      );
      expect(chipReadback).toHaveLength(6);
      for (const chip of chipReadback) {
        expect(chip.text).not.toBe("");
        expect(chip.fontSize).toBeGreaterThanOrEqual(11);
        expect(chip.clipped, `${chip.text} chip clips at ${viewport.width}px in ${theme} mode`).toBe(false);
        expect(chip.withinPhoto, `${chip.text} chip escapes its photo`).toBe(true);
        expect(contrastRatio(chip.color, chip.background), `${chip.text} chip contrast in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
      }

      const readback = await page.locator(".rescue-card .rescue-card-qty").evaluateAll((elements) => elements.map((element) => {
        let background = "rgba(0, 0, 0, 0)";
        for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
          const color = getComputedStyle(node).backgroundColor;
          if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = color; break; }
        }
        return {
          text: element.textContent?.trim() ?? "",
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          color: getComputedStyle(element).color,
          background,
        };
      }));

      expect(readback).toHaveLength(6);
      for (const detail of readback) {
        expect(detail.text).not.toBe("");
        expect(detail.fontSize).toBeGreaterThanOrEqual(11);
        expect(contrastRatio(detail.color, detail.background)).toBeGreaterThanOrEqual(4.5);
      }
      await expect(page.getByRole("button", { name: /오늘 뭐 먹지/ })).toBeVisible();
    }
  }
});

test("places the narrow home review summary before meal actions in both themes and keeps shopping tappable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((nextTheme) => window.localStorage.setItem("rescue-meal.theme", nextTheme), theme);
    await page.reload();

    // The hero counts what to look at today; the safety summary names every review-required food,
    // then one line per storage place and the single meal action follow.
    await expect(page.locator(".freshness-overview")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" })).toBeVisible();
    await expect(page.locator(".rescue-hero-count")).toHaveText("6");
    const reviewSummary = page.locator(".trust-card");
    await expect(reviewSummary).toHaveCount(1);
    await expect(reviewSummary).toHaveAccessibleName(/포장지 날짜를 살펴볼 식품 1개/);
    await expect(page.locator(".rescue-card").filter({ hasText: "시금치" })).toHaveClass(/freshness-past/);
    await expect(page.locator(".rescue-card").filter({ hasText: "시금치" }).locator(".rescue-card-chip")).toHaveText("+1일");
    const summary = page.getByRole("navigation", { name: "보관 장소" });
    await expect(summary).toBeVisible();
    await expect(summary.locator(".home-shelf-row")).toHaveCount(3);
    await expect(summary.getByRole("button", { name: /^냉장 식품 5개 보기/ })).toBeVisible();

    const rowReadback = await summary.locator(".home-shelf-row").evaluateAll((targets) => targets.map((target) => {
      const label = target.querySelector<HTMLElement>(".home-shelf-name")!;
      const box = target.getBoundingClientRect();
      let background = "rgba(0, 0, 0, 0)";
      for (let node: HTMLElement | null = label; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = color; break; }
      }
      const soon = target.querySelector<HTMLElement>(".home-shelf-soon");
      return {
        text: target.getAttribute("aria-label") ?? "",
        width: box.width,
        height: box.height,
        fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
        foreground: getComputedStyle(label).color,
        background,
        labelClipped: label.scrollWidth > label.clientWidth + 0.5,
        soon: soon ? { foreground: getComputedStyle(soon).color, background, fontSize: Number.parseFloat(getComputedStyle(soon).fontSize) } : null,
      };
    }));
    expect(rowReadback).toHaveLength(3);
    for (const row of rowReadback) {
      expect(row.height, `${row.text} target height`).toBeGreaterThanOrEqual(44);
      expect(row.width, `${row.text} target width`).toBeGreaterThanOrEqual(44);
      expect(row.fontSize).toBeGreaterThanOrEqual(11);
      expect(row.labelClipped, `${row.text} label clips`).toBe(false);
      expect(contrastRatio(row.foreground, row.background), `${row.text} label contrast in ${theme}`).toBeGreaterThanOrEqual(4.5);
      if (row.soon) {
        expect(row.soon.fontSize).toBeGreaterThanOrEqual(11);
        expect(contrastRatio(row.soon.foreground, row.soon.background), `${row.text} soon-count contrast in ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    }

    // The full inventory list moved to 냉장고; Home no longer repeats it.
    await expect(page.locator(".inventory-row")).toHaveCount(0);
    const [summaryBox, firstRow, mealAction] = await Promise.all([
      reviewSummary.boundingBox(),
      summary.locator(".home-shelf-row").first().boundingBox(),
      page.locator(".meal-plan-button").boundingBox(),
    ]);
    expect((summaryBox?.y ?? Number.POSITIVE_INFINITY) + (summaryBox?.height ?? 0)).toBeLessThanOrEqual(firstRow?.y ?? 0);
    expect((firstRow?.y ?? Number.POSITIVE_INFINITY) + (firstRow?.height ?? 0)).toBeLessThanOrEqual(mealAction?.y ?? 0);
    // The taller fridge panel moves the meal action below the 320px first fold; one scroll must clear it of the floating nav.
    const mealClear = await scrollClearOfBottomNavigation(page, ".meal-plan-button");
    expect(mealClear.targetBottom).toBeLessThanOrEqual(mealClear.navigationTop + 1);
    await page.getByTestId("mobile-scroll").evaluate((element) => { element.scrollTop = 0; });

    // An empty shopping list has no home card; the bottom navigation keeps it one tap away.
    await expect(page.locator(".shopping-summary-card")).toHaveCount(0);
    const shoppingNav = page.getByTestId("shopping-nav");
    await expect(shoppingNav).toBeInViewport();
    await expect(shoppingNav).toHaveAccessibleName("장보기");
    expect((await shoppingNav.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".install-prompt")).not.toBeInViewport();

    if (theme === "dark") {
      await page.setViewportSize({ width: 393, height: 852 });
      await page.screenshot({ path: "../../evidence/mobile-home-priority-order-dark-2026-09-30.png", scale: "css" });
    }
  }
});

test("home review summary title matches date-only, storage-only, and mixed review reasons", () => {
  expect(getHomeReviewTopicLabel(new Set(["date"]))).toBe("포장지 날짜를");
  expect(getHomeReviewTopicLabel(new Set(["storage"]))).toBe("보관 방법을");
  expect(getHomeReviewTopicLabel(new Set(["date", "storage"]))).toBe("날짜와 보관 방법을");
});

test("shows a visible next step in the empty shopping state across narrow themes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
      await page.reload();
      if (theme === "dark") await toggleThemeInMe(page);
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      // The empty home card is gone; the bottom navigation is the visible next step into the list.
      await expect(page.locator(".shopping-summary-card-empty")).toHaveCount(0);
      const shoppingNav = page.getByTestId("shopping-nav");
      await expect(shoppingNav).toBeVisible();
      await expect(shoppingNav).toHaveAccessibleName("장보기");

      // The meal action sits below the fridge panel; scroll it clear of the floating navigation first.
      await scrollClearOfBottomNavigation(page, ".meal-plan-button");
      const layout = await page.evaluate(() => {
        const shoppingNav = document.querySelector<HTMLElement>("[data-testid=shopping-nav]");
        const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
        const mealAction = document.querySelector<HTMLElement>(".meal-plan-button");
        const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
        if (!shoppingNav || !navigation || !mealAction || !screen) return null;
        return {
          shoppingNavHeight: shoppingNav.getBoundingClientRect().height,
          shoppingNavBottom: shoppingNav.getBoundingClientRect().bottom,
          screenBottom: screen.getBoundingClientRect().bottom,
          navigationTop: navigation.getBoundingClientRect().top,
          mealActionBottom: mealAction.getBoundingClientRect().bottom,
          documentWidth: document.documentElement.scrollWidth,
        };
      });

      expect(layout).toBeTruthy();
      expect(layout!.shoppingNavHeight).toBeGreaterThanOrEqual(44);
      expect(layout!.shoppingNavBottom).toBeLessThanOrEqual(layout!.screenBottom);
      expect(layout!.mealActionBottom).toBeLessThanOrEqual(layout!.navigationTop + 1);
      expect(layout!.documentWidth).toBeLessThanOrEqual(viewport.width);

      // 장보기 is its own screen, not a sheet over the tab bar.
      await shoppingNav.click();
      await expect(shoppingNav).toHaveAttribute("aria-current", "page");
      const shopping = page.getByRole("region", { name: "장보기 목록" });
      await expect(shopping).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "장보기" })).toBeVisible();
      const nextStep = shopping.getByRole("button", { name: /식단에서 재료 고르기/ });
      await expect(nextStep).toBeVisible();
      await expect.poll(async () => (await nextStep.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(nextStep).toBeInViewport();
      await expect(shopping.getByRole("textbox", { name: "직접 추가 상품명" })).toBeVisible();
    }
  }
});

test("floats the home navigation clear of the safe area in both themes", async ({ page }) => {
  // The redesign replaced the full-width bar and its safe-area tail with a floating pill that sits above the home indicator.
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"] as const) {
      await page.goto("/");
      if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
        await toggleThemeInMe(page);
      }
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      const nav = page.locator(".app-bottom-nav");
      const layout = await nav.evaluate((element) => {
        const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
        if (!screen) throw new Error("Native device screen is unavailable");
        const navBox = element.getBoundingClientRect();
        const screenBox = screen.getBoundingClientRect();
        const add = element.querySelector<HTMLElement>(".app-bottom-nav-add")!.getBoundingClientRect();
        return {
          navBottom: navBox.bottom,
          navLeft: navBox.left,
          navRight: navBox.right,
          screenTop: screenBox.top,
          screenBottom: screenBox.bottom,
          screenLeft: screenBox.left,
          screenRight: screenBox.right,
          safeAreaHeight: Number.parseFloat(getComputedStyle(screen).getPropertyValue("--device-safe-area-bottom")),
          tailDisplay: getComputedStyle(element, "::after").display,
          navColor: getComputedStyle(element).backgroundColor,
          add: { top: add.top, bottom: add.bottom, width: add.width, height: add.height },
          itemHeights: Array.from(element.querySelectorAll<HTMLElement>(".app-bottom-nav-item"))
            .map((item) => item.getBoundingClientRect().height),
        };
      });

      expect(layout.tailDisplay).toBe("none");
      expect(layout.safeAreaHeight).toBeGreaterThan(0);
      // The pill clears the home indicator by a small, fixed gap and keeps side insets inside the screen.
      expect(layout.navBottom).toBeLessThanOrEqual(layout.screenBottom - layout.safeAreaHeight);
      expect(layout.screenBottom - layout.safeAreaHeight - layout.navBottom).toBeLessThanOrEqual(8);
      expect(layout.navLeft).toBeGreaterThanOrEqual(layout.screenLeft + 8);
      expect(layout.navRight).toBeLessThanOrEqual(layout.screenRight - 8);
      // An opaque surface, so labels never sit on the scrolled pantry.
      expect(layout.navColor).toMatch(/^rgb\(/);
      expect(layout.itemHeights).toHaveLength(4);
      expect(layout.itemHeights.every((height) => height >= 44)).toBe(true);
      expect(layout.add.width).toBeGreaterThanOrEqual(44);
      expect(layout.add.height).toBeGreaterThanOrEqual(44);
      expect(layout.add.top).toBeGreaterThanOrEqual(layout.screenTop);
      expect(layout.add.bottom).toBeLessThanOrEqual(layout.navBottom);
    }
  }
});

test("keeps meal time and serving choices readable on narrow phones", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".meal-plan-button").click();

    const dialog = page.getByRole("region", { name: "오늘의 식단" });
    const choices = dialog.locator(".recipe-time-picker button, .recipe-serving-picker button");
    await expect(choices).toHaveCount(8);
    for (const choice of await choices.all()) {
      expect(await choice.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
      const box = await choice.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(43.5);
      expect(box?.height).toBeGreaterThanOrEqual(43.5);
    }

    await openTab(page, "홈");
    await expect(dialog).toBeHidden();
  }
});

test("keeps cooking steps and safety instructions readable on mobile in both themes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"] as const) {
      await page.goto("/");
      if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
        await toggleThemeInMe(page);
      }
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      await page.locator(".meal-plan-button").click();
      const dialog = page.getByRole("region", { name: "오늘의 식단" });
      const instructionsToggle = dialog.getByRole("button", { name: "조리 방법 보기" });
      await expect(instructionsToggle).toHaveAttribute("aria-expanded", "false");
      await instructionsToggle.click();

      const steps = dialog.locator(".recipe-details li");
      await expect(steps).toHaveCount(3);
      for (const step of await steps.all()) await expect(step).toHaveCSS("font-size", "12px");
      await expect(dialog.locator(".recipe-details-heading span")).toHaveCSS("font-size", "12px");
      await expect(dialog.locator(".recipe-details-heading small")).toHaveCSS("font-size", "12px");
      // The separate recipe-details safety box is gone; the date-review callout carries the pre-cooking check.
      await expect(dialog.locator(".recipe-details .recipe-safety")).toHaveCount(0);
      const stepColors = await steps.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { foreground: style.color, background: style.backgroundColor };
      });
      expect(contrastRatio(stepColors.foreground, stepColors.background)).toBeGreaterThanOrEqual(4.5);
      const safetyHeading = dialog.locator(".recipe-date-review-callout strong").first();
      await expect(safetyHeading).toContainText("조리 전에 포장지 날짜를 살펴봐 주세요");
      const safetyColors = await safetyHeading.evaluate((element) => {
        let background = "rgba(0, 0, 0, 0)";
        for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
          const color = getComputedStyle(node).backgroundColor;
          if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = color; break; }
        }
        return { foreground: getComputedStyle(element).color, background, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) };
      });
      expect(safetyColors.fontSize).toBeGreaterThanOrEqual(12);
      expect(contrastRatio(safetyColors.foreground, safetyColors.background)).toBeGreaterThanOrEqual(4.5);
      await expect(dialog.locator(".recipe-complete-button")).toHaveCount(0);
      const collapseInstructions = dialog.getByRole("button", { name: "조리 방법 접기" });
      await expect(collapseInstructions).toHaveAttribute("aria-expanded", "true");
      await expect(collapseInstructions).toHaveCSS("min-height", "44px");
      await collapseInstructions.click();
      await expect(dialog.locator(".recipe-details")).toHaveCount(0);

      await openTab(page, "홈");
    }
  }
});

test("offers one recipe-step action while keeping safety details reachable", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (await page.locator("html").getAttribute("data-rescue-theme") !== "dark") {
      await toggleThemeInMe(page);
    }

    await page.locator(".meal-plan-button").click();
    const dialog = page.getByRole("region", { name: "오늘의 식단" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".recipe-title-row")).toBeVisible();
    await dialog.getByRole("button", { name: /조리 전에 확인할 내용 .* 보기/ }).click();

    const safetySummary = dialog.locator(".recipe-safety-summary");
    const shortcut = dialog.getByRole("button", { name: "조리 방법 보기", exact: true });
    await expect(safetySummary).toBeVisible();
    await expect(shortcut).toHaveCount(1);
    await expect(dialog.locator(".recipe-safety-summary-heading")).toBeInViewport();
    await shortcut.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(shortcut).toBeInViewport();
    await expect(shortcut).toHaveCSS("min-height", "44px");
    // Reachable means scrolled inside the screen and clear of the floating bottom bar.
    const shortcutReachable = await shortcut.evaluate((element) => {
      const content = element.closest<HTMLElement>("[data-testid=mobile-scroll]");
      const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
      if (!content || !navigation) return false;
      const contentBox = content.getBoundingClientRect();
      const actionBox = element.getBoundingClientRect();
      return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= navigation.getBoundingClientRect().top + 1;
    });
    expect(shortcutReachable).toBe(true);
    await expect(dialog.locator(".recipe-instructions-shortcut")).toHaveCount(0);

    await shortcut.click();
    await expect(dialog.locator(".recipe-details")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "조리 방법 접기" })).toBeFocused();
    await expect(dialog.locator(".saved-recipe")).toHaveCount(0);
    await expect(dialog.locator(".recipe-complete-button")).toHaveCount(0);
    await openTab(page, "홈");
  }
});

test("explains empty recent history and exposes it as a disclosure in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
      await toggleThemeInMe(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    await page.locator(".meal-plan-button").click();
    const dialog = page.getByRole("region", { name: "오늘의 식단" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".recipe-title-row")).toBeVisible();

    const toggle = dialog.locator(".recipe-history-toggle");
    const history = dialog.getByRole("region", { name: "최근 식단" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "recipe-history-panel");
    await expect(history).toBeHidden();
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(history).toBeVisible();
    await expect(history.getByRole("status")).toContainText("임시 저장한 식단이 아직 없어요");
    await expect(history.getByRole("status")).toContainText("임시 저장하면 여기서 볼 수 있어요. 화면을 벗어나면 사라져요.");
    await expect(history.locator(".recipe-history-empty strong")).toHaveCSS("font-size", "12px");
    await expect(history.locator(".recipe-history-empty small")).toHaveCSS("font-size", "12px");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(history).toBeHidden();
    await openTab(page, "홈");
  }
});

test("returns to the same meal-plan position and open instructions after checking a food", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  if (await page.locator("html").getAttribute("data-rescue-theme") !== "dark") {
    await toggleThemeInMe(page);
  }

  await page.locator(".meal-plan-button").click();
  const dialog = page.getByRole("region", { name: "오늘의 식단" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".recipe-title-row")).toBeVisible();

  const instructionsToggle = dialog.getByRole("button", { name: "조리 방법 보기" });
  await instructionsToggle.scrollIntoViewIfNeeded();
  await instructionsToggle.click();
  await expect(dialog.locator(".recipe-details")).toBeVisible();
  await page.waitForTimeout(400);
  const returnAction = dialog.getByRole("button", { name: "시금치 보기" });
  const before = await dialog.locator(".meal-sheet-content").evaluate((element) => {
    const scroller = element.closest<HTMLElement>("[data-testid=mobile-scroll]");
    const toggle = element.querySelector<HTMLElement>(".recipe-instructions-toggle");
    if (!scroller || !toggle) return null;
    const action = element.querySelector<HTMLElement>("button[data-meal-food-id]");
    // Scroll past the top but keep the action fully inside the sheet so the tap itself moves nothing.
    scroller.scrollTop = 0;
    if (action) scroller.scrollTop = action.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
    const actionBox = action?.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    return {
      scrollTop: scroller.scrollTop,
      instructionsExpanded: toggle.getAttribute("aria-expanded"),
      actionInViewport: actionBox ? actionBox.top >= scrollerBox.top && actionBox.bottom <= scrollerBox.bottom : false,
    };
  });
  expect(before).toBeTruthy();
  expect(before!.scrollTop).toBeGreaterThan(0);
  expect(before!.instructionsExpanded).toBe("true");
  expect(before!.actionInViewport).toBe(true);

  await returnAction.click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".date-review-callout")).toContainText("조리 전 확인이 필요해요");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(returnAction).toBeFocused();
  await expect(dialog.locator(".recipe-details")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 방법 접기" })).toHaveAttribute("aria-expanded", "true");
  const after = await dialog.locator(".meal-sheet-content").evaluate((element) => {
    const scroller = element.closest<HTMLElement>("[data-testid=mobile-scroll]");
    const action = element.querySelector<HTMLElement>("button[data-meal-food-id]");
    return {
      scrollTop: scroller?.scrollTop ?? null,
      actionFocused: action === document.activeElement,
      instructionsExpanded: element.querySelector(".recipe-instructions-toggle")?.getAttribute("aria-expanded"),
    };
  });
  expect(Math.abs((after.scrollTop ?? 0) - before!.scrollTop)).toBeLessThanOrEqual(1);
  expect(after.actionFocused).toBe(true);
  expect(after.instructionsExpanded).toBe("true");
  await expect(dialog.locator(".saved-recipe")).toHaveCount(0);
  await expect(dialog.locator(".recipe-complete-button")).toHaveCount(0);
});

test("keeps the primary home CTA and review notice above navigation on short native screens", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    // The fridge panel now owns the first fold: its rescue cards and the 식단 tab are the first-fold meal entries.
    const firstFold = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        navigation: rect(".app-bottom-nav"),
        firstCardActions: rect(".rescue-card .rescue-card-actions"),
      };
    });
    expect(firstFold.firstCardActions!.top).toBeGreaterThanOrEqual(firstFold.screen!.top);
    expect(firstFold.firstCardActions!.bottom).toBeLessThanOrEqual(firstFold.navigation!.top + 1);
    expect(firstFold.navigation!.bottom).toBeLessThanOrEqual(firstFold.screen!.bottom + 1);
    await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "식단", exact: true })).toBeInViewport();

    // The review summary, the storage rows and the full-width meal CTA are one scroll away and never left under the floating nav.
    for (const selector of [".trust-card", ".home-shelves", ".meal-plan-button"]) {
      const clear = await scrollClearOfBottomNavigation(page, selector);
      expect(clear.targetBottom, `${selector} clears the navigation at ${viewport.height}px`).toBeLessThanOrEqual(clear.navigationTop + 1);
    }
    const cta = await page.locator(".meal-plan-button").boundingBox();
    expect(cta!.y).toBeGreaterThanOrEqual(0);
    expect(cta!.height).toBeGreaterThanOrEqual(49);
  }
});

test("keeps the storage rows before the single meal action on mobile", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        review: rect(".home-body > .trust-card"),
        shelves: rect(".home-shelves"),
        cta: rect(".home-action-row"),
        priority: rect(".priority-section"),
        actions: document.querySelectorAll(".home-action-row button").length,
      };
    });

    expect(layout.review).toBeTruthy();
    expect(layout.shelves).toBeTruthy();
    expect(layout.cta).toBeTruthy();
    // Something is urgent in the demo record, so the deck carries it and there is no separate priority list.
    expect(layout.priority).toBeNull();
    // Home answers "what can I do now?" with one action, after the safety summary and the storage rows.
    expect(layout.actions).toBe(1);
    expect(layout.review!.bottom).toBeLessThanOrEqual(layout.shelves!.top + 1);
    expect(layout.shelves!.bottom).toBeLessThanOrEqual(layout.cta!.top + 1);
  }
});

test("keeps the primary meal CTA discoverable in the 390px first viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // The meal plan stays one tap away in the first viewport via the 식단 tab and each rescue card's 요리 action.
  const mealTab = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "식단", exact: true });
  await expect(mealTab).toBeInViewport();
  expect((await mealTab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const cookAction = page.locator(".rescue-card").first().getByRole("button", { name: /요리하기$/ });
  await expect(cookAction).toBeInViewport();

  // The full-width CTA sits right below the fridge panel and scrolls clear of the floating nav.
  const clear = await scrollClearOfBottomNavigation(page, ".meal-plan-button");
  expect(clear.targetBottom).toBeLessThanOrEqual(clear.navigationTop - 1);
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return { screen: rect("[data-testid=device-screen]"), cta: rect(".meal-plan-button") };
  });
  expect(layout.cta!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
  expect(layout.cta!.height).toBeGreaterThanOrEqual(49);
});

test("uses tall-phone fold space for the storage rows and keeps the full list on 냉장고", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 393, height: 844 },
    { width: 393, height: 852 },
    { width: 427, height: 952 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        navigation: rect(".app-bottom-nav"),
        hero: rect(".kitchen-hero"),
        shelves: rect(".home-shelves"),
        action: rect(".home-action-row"),
        inventory: rect(".inventory-section"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.shelves).toBeTruthy();
    expect(layout.action).toBeTruthy();
    // The pantry list is the 냉장고 tab's job: Home only links into it.
    expect(layout.inventory).toBeNull();
    // The fridge panel spends the fold space; the storage rows follow it directly and come before the meal action.
    expect(layout.shelves!.top).toBeGreaterThanOrEqual(layout.hero!.bottom - 1);
    expect(layout.shelves!.top - layout.hero!.bottom).toBeLessThan(160);
    expect(layout.shelves!.bottom).toBeLessThanOrEqual(layout.action!.top);
    if (viewport.height >= 900) expect(layout.shelves!.top).toBeLessThan(layout.navigation!.top);
  }

  // A storage row opens 냉장고 already filtered to that storage place.
  await page.getByRole("navigation", { name: "보관 장소" }).getByRole("button", { name: /^냉동 식품/ }).click();
  await expect(mainNav(page).getByRole("button", { name: "냉장고", exact: true })).toHaveAttribute("aria-current", "page");
  const storageChips = page.getByRole("group", { name: "보관 위치 필터" });
  await expect(storageChips.getByRole("button", { name: "냉동", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(storageChips.getByRole("button", { name: "냉동", exact: true })).toBeFocused();
  await expect(page.locator(".inventory-row")).toHaveCount(1);
});

test("keeps the bell and 나 in every tab header at narrow and wide phone widths", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    for (const tab of ["홈", "냉장고", "식단", "장보기"] as const) {
      if (tab !== "홈") await openTab(page, tab);
      // Exactly one bell and one 나 exist: the visible tab's header owns them.
      await expect(page.locator(".notification-button")).toHaveCount(1);
      await expect(page.locator(".connection-pill")).toHaveCount(1);
      await expect(page.locator(".connection-pill")).toHaveAccessibleName(/^나\. /);
      await page.getByTestId("mobile-scroll").evaluate((element) => { element.scrollTop = 0; });
      const layout = await page.evaluate(() => {
        const visible = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => element.getClientRects().length > 0);
        const rect = (selector: string) => visible(selector)?.getBoundingClientRect().toJSON() ?? null;
        return {
          screen: rect("[data-testid=device-screen]"),
          header: rect(".app-header"),
          title: rect(".app-header .screen-title, .app-header .brand-lockup"),
          bell: rect(".notification-button"),
          me: rect(".connection-pill"),
        };
      });
      expect(layout.header, `${tab} header`).toBeTruthy();
      for (const [name, box] of [["bell", layout.bell], ["나", layout.me]] as const) {
        expect(box, `${tab} ${name}`).toBeTruthy();
        expect(box!.width, `${tab} ${name} width at ${viewport.width}px`).toBeGreaterThanOrEqual(43.5);
        expect(box!.height, `${tab} ${name} height at ${viewport.width}px`).toBeGreaterThanOrEqual(43.5);
        expect(box!.right).toBeLessThanOrEqual(layout.screen!.right + 1);
        expect(box!.left).toBeGreaterThanOrEqual(layout.screen!.left - 1);
        // Same row as the tab title; the hit box may extend a little below the compact header.
        expect(box!.top).toBeGreaterThanOrEqual(layout.header!.top - 1);
        expect(box!.bottom).toBeLessThanOrEqual(layout.header!.bottom + 12);
        expect(box!.left, `${tab} ${name} clears the title`).toBeGreaterThanOrEqual(layout.title!.right);
      }
      expect(layout.bell!.right).toBeLessThanOrEqual(layout.me!.left + 1);
    }
  }
});

test("keeps the 냉장고, 식단 and 장보기 screens inside 320px and 430px phones and clear of the floating bar", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    for (const [tab, region] of [["냉장고", null], ["식단", "오늘의 식단"], ["장보기", "장보기 목록"]] as const) {
      await openTab(page, tab);
      await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible();
      if (region) await expect(page.getByRole("region", { name: region })).toBeVisible();
      // Tabs are screens, not sheets over the tab bar.
      await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);

      const metrics = await readNarrowViewportMetrics(page);
      expect(metrics.bodyScrollWidth, `${tab} body at ${viewport.width}px`).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.documentScrollWidth, `${tab} document at ${viewport.width}px`).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.outOfBounds, `${tab} controls at ${viewport.width}px`).toEqual([]);
      const panelOverflow = await page.evaluate(() => {
        const panel = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]")).find((element) => !element.hidden);
        return panel ? panel.scrollWidth - panel.clientWidth : Number.POSITIVE_INFINITY;
      });
      expect(panelOverflow, `${tab} panel scrolls sideways at ${viewport.width}px`).toBeLessThanOrEqual(1);

      // The last piece of content scrolls clear of the floating bar.
      const clearance = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]")!;
        scroller.scrollTop = scroller.scrollHeight;
        const panel = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]")).find((element) => !element.hidden)!;
        const leaves = Array.from(panel.querySelectorAll<HTMLElement>("button, input, a, p, small, strong, li"))
          .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        const lastBottom = Math.max(...leaves.map((element) => element.getBoundingClientRect().bottom));
        return { lastBottom, navigationTop: document.querySelector<HTMLElement>(".app-bottom-nav")!.getBoundingClientRect().top };
      });
      expect(clearance.lastBottom, `${tab} last content at ${viewport.width}px`).toBeLessThanOrEqual(clearance.navigationTop + 1);
      await page.getByTestId("mobile-scroll").evaluate((element) => { element.scrollTop = 0; });
    }
  }
});

test("shows the meal result inside the first 식단 screen viewport", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /오늘 뭐 먹지/ }).click();
    const dialog = page.getByRole("region", { name: "오늘의 식단" });
    await expect(dialog).toBeVisible();
    // 식단 is a tab screen, not a sheet over the tab bar.
    await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
    await expect(mainNav(page).getByRole("button", { name: "식단", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(dialog.locator(".recipe-art")).toHaveCount(0);
    await expect(dialog.locator(".recipe-title-row")).toBeVisible();
    // Planner actions stay in document flow so they cannot cover the safety
    // summary on short mobile screens. Food detail actions remain sticky.
    await expect(dialog.locator(".recipe-actions")).toHaveCSS("position", "static");
    const safetyEntry = dialog.getByRole("button", { name: "조리 전에 확인할 내용 2개 보기" });
    const dateReviewAction = dialog.getByRole("button", { name: "시금치 보기", exact: true });
    await expect(safetyEntry).toBeFocused();
    await safetyEntry.click();
    await expect(dateReviewAction).toBeFocused();
    await page.getByTestId("mobile-scroll").evaluate((element) => { element.scrollTop = 0; });

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        navigation: rect(".app-bottom-nav"),
        heading: rect(".meal-screen-page .screen-title"),
        title: rect(".recipe-title-row"),
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.heading).toBeTruthy();
    expect(layout.title).toBeTruthy();
    expect(layout.heading!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.title!.top).toBeGreaterThanOrEqual(layout.heading!.bottom - 1);
    expect(layout.title!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
    await openTab(page, "홈");
    await expect(dialog).toBeHidden();
  }
});

test("keeps the demo guidance action in the first native sheet viewport", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /체험 안내 열기/ }).click();
    const dialog = page.getByRole("dialog", { name: "체험 안내" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);
    await expect(dialog.locator(".account-demo-explainer .primary-sheet-button")).toHaveText("계속 둘러보기");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const content = document.querySelector<HTMLElement>(".sheet-content");
      return {
        screen: rect("[data-testid=device-screen]"),
        sheet: rect("[data-testid=bottom-sheet]"),
        action: rect(".account-demo-explainer .primary-sheet-button"),
        contentScrollTop: content?.scrollTop ?? null,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.sheet).toBeTruthy();
    expect(layout.action).toBeTruthy();
    expect(layout.contentScrollTop).toBe(0);
    expect(layout.action!.top).toBeGreaterThanOrEqual(layout.sheet!.top - 1);
    expect(layout.action!.bottom).toBeLessThanOrEqual(layout.screen!.bottom - 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("reveals the completion action after saving a meal plan", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: /오늘 뭐 먹지/ }).click();
  const dialog = page.getByRole("region", { name: "오늘의 식단" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".recipe-title-row")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();

  await dialog.getByRole("button", { name: "임시 저장" }).click();
  await expect(dialog.getByRole("button", { name: "임시 저장됨" })).toBeVisible();
  await expect(dialog.locator(".saved-recipe")).toHaveAttribute("data-readback-state", "confirmed");
  await expect(dialog.locator(".saved-recipe")).toHaveAttribute("role", "status");
  await expect(dialog.locator(".saved-recipe")).toHaveAttribute("aria-live", "polite");
  const completion = dialog.locator(".recipe-complete-actions");
  await expect(completion).toBeVisible();
  const saveFeedbackLayout = await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".toast")?.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>(".recipe-complete-actions")?.getBoundingClientRect();
    return {
      // The demo save reports through the inline status, so no toast is an acceptable (non-overlapping) result.
      overlap: toast && actions ? Math.max(0, Math.min(toast.bottom, actions.bottom) - Math.max(toast.top, actions.top)) : toast ? null : 0,
    };
  });
  expect(saveFeedbackLayout.overlap).toBe(0);
  await expect(dialog.getByRole("button", { name: "포장지와 재료를 살펴봤어요" })).toBeFocused();
  // The completion block is taller than a short sheet; the focused acknowledgement itself must be visible.
  await expect.poll(() => dialog.getByRole("button", { name: "포장지와 재료를 살펴봤어요" }).evaluate((element) => {
    const content = element.closest<HTMLElement>("[data-testid=mobile-scroll]");
    if (!content) return false;
    const actionBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await expect(dialog.getByRole("button", { name: "조리 완료 기록" })).toBeDisabled();
  await dialog.getByRole("button", { name: "포장지와 재료를 살펴봤어요" }).click();
  await dialog.getByRole("button", { name: "조리 완료 기록" }).click();
  // A finished meal returns to the tab it started from (Home), where the changed foods are.
  await expect(dialog).toBeHidden();
  await expect(page.locator(".toast")).toHaveText("조리 완료로 기록했어요. 사용한 양만큼 보관 수량을 줄였어요.");
  const homeFeedbackLayout = await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".toast")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    return {
      overlap: toast && navigation ? Math.max(0, Math.min(toast.bottom, navigation.bottom) - Math.max(toast.top, navigation.top)) : null,
    };
  });
  expect(homeFeedbackLayout.overlap).toBe(0);
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  // Focus lands on the changed food on Home: its rescue card, now showing the remaining amount.
  const chickenCard = page.locator(".rescue-card").filter({ hasText: "닭가슴살" });
  await expect(chickenCard.locator(".rescue-card-qty")).toHaveText("1팩");
  await expect(chickenCard.getByRole("button", { name: "닭가슴살 자세히 보기" })).toBeFocused();
  // The used quantity is deducted: 시금치(1팩)·두부(1모) leave the pantry, 닭가슴살 drops from 2팩 to 1팩.
  await openTab(page, "냉장고");
  await expect(page.locator(".inventory-row").filter({ hasText: "닭가슴살" })).toContainText("1팩");
  await expect(page.locator(".inventory-row").filter({ hasText: "시금치" })).toHaveCount(0);
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" })).toHaveCount(0);
});

test("keeps detail review and storage cues across light and dark themes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    if (theme === "dark") await toggleThemeInMe(page);
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    // Home's deck only offers the date check for a passed printed date.
    const spinachCard = page.locator(".rescue-card").filter({ hasText: "시금치" });
    await expect(spinachCard).toHaveClass(/freshness-past/);
    await expect(spinachCard.locator(".rescue-card-chip")).toHaveText("+1일");
    await expect(spinachCard.getByRole("button", { name: "시금치 날짜 확인" })).toBeVisible();
    await expect(spinachCard.getByRole("button", { name: /시금치 먹었어요/ })).toHaveCount(0);
    await openTab(page, "냉장고");
    await expect(page.locator(".inventory-row").filter({ hasText: "시금치" }).locator(".inventory-status-warning")).toHaveCount(1);
    await expect(page.locator(".inventory-row").filter({ hasText: "시금치" }).locator(".inventory-review-detail")).toHaveText("날짜 확인");

    await page.getByRole("button", { name: /국산콩 두부 풀무원/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
    await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
    await expect(dialog.locator(".detail-actions .primary-sheet-button")).toHaveCount(0);
    await expect(dialog.locator(".detail-actions .detail-consume-action")).toBeVisible();
    const detailOrder = await dialog.locator(".detail-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
    expect(detailOrder.indexOf("date-edit-button")).toBeGreaterThan(detailOrder.indexOf("date-proof-card"));
    const provenanceIndex = detailOrder.indexOf("detail-source-group");
    const priorityNoteIndex = detailOrder.indexOf("detail-note");
    if (provenanceIndex >= 0 && priorityNoteIndex >= 0) expect(provenanceIndex).toBeLessThan(priorityNoteIndex);
    await dialog.getByRole("button", { name: "냉동", exact: true }).click();
    await expect(dialog.locator(".detail-section")).toHaveClass(/detail-section-pending/);
    await expect(dialog.locator(".detail-save-pending")).toBeVisible();
    await dialog.getByRole("button", { name: "닫기" }).click();
  }
});

test("home food finder opens the visible inventory search at narrow mobile widths", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    // The storage rows are Home's food finder now: each opens the 냉장고 list for that storage place.
    const shortcut = page.getByRole("navigation", { name: "보관 장소" }).getByRole("button", { name: /^냉장 식품/ });
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    await expect(mainNav(page).getByRole("button", { name: "냉장고", exact: true })).toHaveAttribute("aria-current", "page");

    const inventory = page.getByRole("region", { name: /내 식품 목록/ });
    const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
    await expect(search).toBeVisible();
    await expect(search).toBeInViewport();
    await expect(search).not.toBeFocused();
    await expect(page.locator(".mobile-page")).toHaveAttribute("data-keyboard-visible", "false");
  }
});

test("keeps the pantry search surface stable across 320px and 393px native viewports", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const inventory = page.getByRole("region", { name: /내 식품 목록/ });
    await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
    // 냉장고 opens at its own top: the screen title, then the list right under it.
    await expect.poll(() => inventory.evaluate((element) => {
      const header = Array.from(document.querySelectorAll<HTMLElement>(".fridge-screen .screen-header")).find((item) => item.getClientRects().length > 0);
      if (!header) return Number.POSITIVE_INFINITY;
      return Math.abs(element.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    })).toBeLessThanOrEqual(8);

    const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
    await search.fill("두부");
    await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
      const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]");
      const toolbar = document.querySelector<HTMLElement>(".inventory-toolbar");
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      const resultRows = Array.from(document.querySelectorAll<HTMLElement>(".inventory-row"));
      return {
        toolbar: rect(".inventory-toolbar"),
        navigation: navigation ? { ...navigation.getBoundingClientRect().toJSON(), visibility: getComputedStyle(navigation).visibility } : null,
        screen: rect("[data-testid=device-screen]"),
        scroll: rect("[data-testid=mobile-scroll]"),
        lastResultRow: resultRows.at(-1)?.getBoundingClientRect().toJSON() ?? null,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        keyboardVisible: document.querySelector<HTMLElement>(".mobile-page")?.dataset.keyboardVisible ?? "missing",
        toolbarPosition: toolbar ? getComputedStyle(toolbar).position : "missing",
        scrollTop: scroll?.scrollTop ?? -1,
      };
    });

    expect(layout.toolbarPosition).toBe("sticky");
    expect(layout.keyboardVisible).toBe("false");
    expect(layout.toolbar).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.screen).toBeTruthy();
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.visibility).toBe("visible");
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.lastResultRow).toBeTruthy();
    expect(layout.lastResultRow!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.bodyWidth).toBeLessThanOrEqual(viewport.width);
    // The short result list fits under the 냉장고 header, so nothing had to scroll and the search stays in view.
    expect(layout.scrollTop).toBeGreaterThanOrEqual(0);
    await expect(search).toBeInViewport();
  }
});

test("filters the pantry by status and restores the full inventory", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();

  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /날짜·보관 확인/ });
  await expect(needsReview).toHaveAttribute("aria-controls", "inventory-list");
  await expect(needsReview).toHaveCSS("min-height", "44px");
  await expect(needsReview).toHaveAttribute("aria-pressed", "false");
  await needsReview.click();
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(needsReview).toBeFocused();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator('.inventory-filter-summary[role="status"]')).toContainText("날짜·보관 확인");
  await expect.poll(() => inventory.locator(".inventory-row").count()).toBe(1);
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(1);

  const reset = inventory.getByRole("button", { name: "전체 목록 보기" });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveCSS("min-height", "44px");
  await expect(reset).toBeInViewport();
  await reset.click();
  const allFilter = statusFilters.getByRole("button", { name: /전체/ });
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  await expect(allFilter).toBeFocused();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
});

test("keeps a direct add action available from the food tab", async ({ page }) => {
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const addButton = page.locator(".inventory-add-button");
  await expect.poll(() => addButton.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return Boolean(screen && navigation && rect.top >= screen.top - 1 && rect.bottom <= navigation.top + 1);
  }), { timeout: 2_000 }).toBe(true);

  const target = await addButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await addButton.click();
  // The add sheet's first view belongs to the add flow; the 냉장고 add action only has to open it.
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();
});

test("restores the home first fold after moving between bottom navigation destinations", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const screen = page.locator("[data-testid=device-screen]");
  const scroll = page.getByTestId("mobile-scroll");
  const homeNav = page.getByRole("button", { name: "홈", exact: true });
  const foodNav = mainNav(page).getByRole("button", { name: "냉장고", exact: true });

  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await expect(homeNav).not.toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.locator(".inventory-section").evaluate((element) => {
    const target = element.getBoundingClientRect();
    const header = Array.from(document.querySelectorAll<HTMLElement>(".fridge-screen .screen-header")).find((item) => item.getClientRects().length > 0)?.getBoundingClientRect();
    return header ? Math.abs(target.top - header.bottom) : Number.POSITIVE_INFINITY;
  })).toBeLessThanOrEqual(8);

  await homeNav.click();
  await expect(homeNav).toHaveAttribute("aria-current", "page");
  await expect(foodNav).not.toHaveAttribute("aria-current", "page");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" })).toBeVisible();
  // The first fold is the fridge panel: its first rescue card is fully visible above the floating nav again.
  await expect.poll(() => page.locator(".rescue-card").first().evaluate((element) => {
    const action = element.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    return nav ? action.bottom <= nav.top + 1 : false;
  })).toBe(true);
  await expect(screen).toBeVisible();
});

test("keeps the device frame fixed when the pantry is reduced to a short review list", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const screen = page.locator("[data-testid=device-screen]");
  const appViewport = page.locator("[data-testid=mobile-app-viewport]");
  const foodNav = mainNav(page).getByRole("button", { name: "냉장고", exact: true });
  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".inventory-review-guide")).toHaveCount(0);

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const reviewFilter = inventory.getByRole("group", { name: "식품 상태 필터" }).getByRole("button", { name: /날짜·보관 확인/ });
  await reviewFilter.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator(".inventory-row")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "식품을 살펴볼 때" })).toBeVisible();

  const filteredLayout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    const appViewport = document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")!;
    const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]")!;
    const inventory = document.querySelector<HTMLElement>(".inventory-section")!;
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    return {
      screenScrollTop: screen.scrollTop,
      appViewportTopOffset: appViewport.getBoundingClientRect().top - screen.getBoundingClientRect().top,
      // 냉장고 starts with its screen title; the list sits right under that header at the scroll top.
      inventoryTopOffset: inventory.getBoundingClientRect().top - document.querySelector<HTMLElement>(".fridge-screen .screen-header")!.getBoundingClientRect().bottom,
      scrollTop: scroll.scrollTop,
      navigationBottom: navigation.getBoundingClientRect().bottom,
      screenBottom: screen.getBoundingClientRect().bottom,
    };
  });
  expect(filteredLayout.screenScrollTop).toBe(0);
  expect(Math.abs(filteredLayout.appViewportTopOffset)).toBeLessThanOrEqual(1);
  expect(Math.abs(filteredLayout.inventoryTopOffset)).toBeLessThanOrEqual(8);
  expect(filteredLayout.scrollTop).toBe(0);
  // The native shell hides the simulated home indicator (display: none); the navigation must stay on screen instead.
  expect(filteredLayout.navigationBottom).toBeLessThanOrEqual(filteredLayout.screenBottom + 1);

  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 6개" })).toBeVisible();
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect.poll(() => screen.evaluate((element) => element.scrollTop)).toBe(0);
  await expect.poll(() => appViewport.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    return screen ? Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top) : Number.POSITIVE_INFINITY;
  })).toBeLessThanOrEqual(1);

  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  // The native shell has no device picker or simulated Android bar; check the Pixel-sized viewport directly.
  await page.setViewportSize({ width: 427, height: 952 });
  await expect(page.getByTestId("device-picker")).toBeHidden();
  await expect(page.getByTestId("android-navigation-bar")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]");
    const inventory = document.querySelector<HTMLElement>(".inventory-section");
    return scroll && inventory
      ? Math.abs(inventory.getBoundingClientRect().top - document.querySelector<HTMLElement>(".fridge-screen .screen-header")!.getBoundingClientRect().bottom)
      : Number.POSITIVE_INFINITY;
  })).toBeLessThanOrEqual(8);

  const pixelLayout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    const viewport = document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")!;
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    return {
      screenScrollTop: screen.scrollTop,
      viewportTopOffset: viewport.getBoundingClientRect().top - screen.getBoundingClientRect().top,
      appNavigationBottom: navigation.getBoundingClientRect().bottom,
      screenBottom: screen.getBoundingClientRect().bottom,
    };
  });
  expect(pixelLayout.screenScrollTop).toBe(0);
  expect(Math.abs(pixelLayout.viewportTopOffset)).toBeLessThanOrEqual(1);
  expect(pixelLayout.appNavigationBottom).toBeLessThanOrEqual(pixelLayout.screenBottom + 1);
});

test("preserves the pantry status filter across home navigation", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const homeNav = page.getByRole("button", { name: "홈", exact: true });
  const foodNav = mainNav(page).getByRole("button", { name: "냉장고", exact: true });
  await foodNav.click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /날짜·보관 확인/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  await homeNav.click();
  await expect(homeNav).toHaveAttribute("aria-current", "page");
  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(1);
});

test("preserves the pantry status filter across the 식단 tab round trip", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /날짜·보관 확인/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  await openTab(page, "식단");
  const mealDialog = page.getByRole("region", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  // Leaving 식단 is a tab change back to 냉장고, which kept its own filter.
  await openTab(page, "냉장고");
  await expect(mealDialog).toBeHidden();
  await expect(mainNav(page).getByRole("button", { name: "냉장고", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]')).toHaveCount(1);
});

test("restores the pantry context after closing an inventory detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");

  const row = inventory.locator(".inventory-row").first();
  await expect(row).toBeVisible();
  await row.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect.poll(() => row.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    return Boolean(screen && navigation && target.top >= screen.top - 1 && target.bottom <= navigation.top + 1);
  })).toBe(true);
  await expect(row).toBeFocused();
});

test("preserves the active status filter after opening and closing inventory detail", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /날짜·보관 확인/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  const row = inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').first().locator(".." );
  await row.click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(1);
  await expect(row).toBeFocused();
});

test("preserves the active status filter through label review readback", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /날짜·보관 확인/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  await inventory.getByRole("button", { name: /시금치 국내산 시금치 1팩/ }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: /포장지에서.*날짜.*다시 확인/ }).click();
  const labelDialog = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await labelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  // The readback cleared the sample's only review food: the filter stays on and shows its empty state.
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(inventory.locator(".inventory-row")).toHaveCount(0);
  await expect(inventory.locator(".inventory-empty-state")).toContainText("날짜나 보관 방법을 살펴볼 식품이 없어요");
  await expect(page.locator("[data-testid=bottom-sheet]")).toHaveCount(0);
  await expect(inventory.locator(":focus")).toHaveCount(1);
});

test("does not leak an unsaved storage edit after closing the detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const row = inventory.locator(".inventory-row").filter({ hasText: "시금치" }).first();
  const originalRowText = await row.textContent();
  await row.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(detail.locator(".detail-save-hint")).toContainText("저장하지 않고 닫으면");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  await expect.poll(() => row.textContent()).toBe(originalRowText);
  await expect(row).toBeFocused();
});

test("keeps the updated storage state readable after a 320px detail save", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const row = inventory.locator(".inventory-row").filter({ hasText: "시금치" }).first();
  await row.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(detail.getByRole("button", { name: "냉동", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.locator(".storage-pill")).toHaveText("저장 전 냉동");
  await expect(detail.locator(".detail-save-hint")).toHaveText("저장하지 않고 닫으면 보관 상태가 바뀌지 않아요.");
  await detail.locator(".detail-actions .primary-sheet-button").click();

  await expect(page.locator(".toast")).toHaveText("시금치의 변경 내용을 저장했어요.");
  await expect(detail).toHaveCount(0);
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 1팩.*날짜 확인/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 1팩.*날짜 확인/ })).toBeFocused();
  await expect.poll(() => inventory.getByRole("button", { name: /시금치 국내산 시금치 1팩.*날짜 확인/ }).evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    return Boolean(screen && navigation && target.top >= screen.top - 1 && target.bottom <= navigation.top + 1);
  })).toBe(true);
});

test("keeps a confirmed date readable after saving from a 320px detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  const row = inventory.getByRole("button", { name: /국산콩 두부 풀무원 1모/ });
  await row.click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  await detail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const editor = detail.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor).toBeVisible();

  const confirmedDate = new Date(FIXED_NOW);
  confirmedDate.setHours(12, 0, 0, 0);
  confirmedDate.setDate(confirmedDate.getDate() + 10);
  const confirmedDateValue = [confirmedDate.getFullYear(), confirmedDate.getMonth() + 1, confirmedDate.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
    .join("-");

  await editor.getByRole("radio", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill(confirmedDateValue);
  await expect(editor.locator("#confirmed-date-readable")).toContainText(confirmedDateValue.replaceAll("-", "."));
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(page.locator(".toast")).toHaveText("국산콩 두부 소비기한을 포장지에서 확인해 기록했어요.");
  await expect(detail).toHaveCount(0);
  const updatedRow = inventory.locator(".inventory-row").filter({ hasText: "국산콩 두부" });
  await expect(updatedRow).toBeVisible();
  // The confirmed printed date turns the chip solid; it keeps the D-n notation past a week out.
  const updatedChip = updatedRow.locator(".freshness-chip");
  await expect(updatedChip).toHaveText("D-10");
  await expect(updatedChip).toHaveAttribute("data-date-kind", "printed");
  await expect(updatedChip).toHaveAttribute("data-estimated", "false");
  await expect(updatedChip).toHaveAttribute("aria-label", "표시 날짜까지 10일");
  expect(await updatedChip.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(updatedRow).toBeFocused();
  await expect.poll(() => updatedRow.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    return Boolean(screen && navigation && target.top >= screen.top - 1 && target.bottom <= navigation.top + 1);
  })).toBe(true);

  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  // A confirmed date ten days out takes the food off today's deck and count.
  await expect(page.getByRole("heading", { level: 1, name: "오늘 살펴볼 음식 5개" })).toBeVisible();
  await expect(page.locator(".rescue-card").filter({ hasText: "국산콩 두부" })).toHaveCount(0);
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
});

test("returns focus to the date action after cancelling date review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  await page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /국산콩 두부 풀무원 1모/ }).click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  const dateAction = detail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" });
  await dateAction.click();
  const editor = detail.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "취소" }).click();
  await expect(editor).toHaveCount(0);
  await expect(dateAction).toBeFocused();
  await expect.poll(() => dateAction.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    return Boolean(screen && target.top >= screen.top - 1 && target.bottom <= screen.bottom + 1);
  })).toBe(true);
});

test("returns focus to the printed-date recheck action after closing label review", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "light"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await openFridgeFood(page, "시금치");

  let detail = page.getByRole("dialog", { name: "시금치" });
  const dateRecheckAction = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  await dateRecheckAction.click();
  await waitForSheetSettled(page);

  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  const currentDate = labelReview.getByRole("group", { name: "현재 기록된 날짜 포장 소비기한 · 2026.09.02 · 포장지 표시" });
  await expect(currentDate).toBeVisible();
  await expect(currentDate).toBeInViewport();
  await expect(currentDate).toHaveText(/현재 기록.*포장 소비기한 2026\.09\.02 포장지 표시/);
  await expect(labelReview.locator(".sheet-description")).toContainText("저장 전까지 기록은 그대로예요");
  const dateStep = labelReview.locator(".intake-flow-rail");
  await expect(dateStep).toHaveAttribute("aria-label", "날짜 확인 1단계");
  // The first label step shows only the rail; the panel heading names what to do.
  await expect(dateStep.locator(".intake-flow-rail-heading")).toHaveCount(0);
  await expect(labelReview.getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();
  await expect(dateStep.locator('li[aria-current="step"]')).toContainText("1입력");
  await expect(labelReview.locator(".sheet-description")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note strong")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".input-flow > p").first()).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note small")).toHaveCSS("font-size", "12px");
  const sheetBackground = await labelReview.evaluate((element) => getComputedStyle(element).backgroundColor);
  for (const control of [labelReview.locator(".file-button"), labelReview.locator(".capture-sample-button")]) {
    const textColor = await control.evaluate((element) => getComputedStyle(element).color);
    expect(contrastRatio(textColor, sheetBackground)).toBeGreaterThanOrEqual(4.5);
  }
  const cameraAction = labelReview.getByRole("button", { name: "카메라로 촬영" });
  await expect(cameraAction).toBeInViewport();
  const viewportSize = page.viewportSize();
  expect(viewportSize).toBeTruthy();
  await expect.poll(async () => {
    const bounds = await cameraAction.boundingBox();
    return Boolean(bounds && viewportSize && bounds.y + bounds.height <= viewportSize.height);
  }).toBe(true);
  const cameraActionBox = await cameraAction.boundingBox();
  expect(cameraActionBox).toBeTruthy();
  expect(cameraActionBox!.y + cameraActionBox!.height, "capture action fits inside the native viewport").toBeLessThanOrEqual(viewportSize!.height);
  await expect(labelReview).toBeVisible();
  await labelReview.getByRole("button", { name: "닫기", exact: true }).click();

  detail = page.getByRole("dialog", { name: "시금치" });
  const returnedDateRecheckAction = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  await expect(returnedDateRecheckAction).toBeFocused();
  await expect(detail.getByRole("group", { name: "날짜 정보: 포장 소비기한" })).toContainText("2026.09.02");
});

test("returns focus to the printed-date recheck action after closing label review on 320px light", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "light"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await openFridgeFood(page, "시금치");

  const detail = page.getByRole("dialog", { name: "시금치" });
  const trigger = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  await trigger.click();
  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelReview).toBeVisible();
  await waitForSheetSettled(page);
  await expect(labelReview.getByRole("group", { name: "현재 기록된 날짜 포장 소비기한 · 2026.09.02 · 포장지 표시" })).toBeInViewport();
  await labelReview.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(labelReview).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(detail.getByRole("group", { name: "날짜 정보: 포장 소비기한" })).toContainText("2026.09.02");
  await expect.poll(async () => {
    const [screenBox, actionBox] = await Promise.all([
      page.getByTestId("device-screen").boundingBox(),
      trigger.boundingBox(),
    ]);
    return Boolean(screenBox && actionBox
      && actionBox.y >= screenBox.y - 1
      && actionBox.y + actionBox.height <= screenBox.y + screenBox.height + 1);
  }, { timeout: 2_500 }).toBe(true);
  const [screenBox, actionBox] = await Promise.all([
    page.getByTestId("device-screen").boundingBox(), trigger.boundingBox(),
  ]);
  expect(screenBox).toBeTruthy();
  expect(actionBox).toBeTruthy();
  expect(actionBox!.y).toBeGreaterThanOrEqual(screenBox!.y - 1);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height + 1);
});

test("echoes the existing printed date before starting a label recheck", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await openFridgeFood(page, "시금치");

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  await waitForSheetSettled(page);
  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  const methodTabs = labelReview.getByRole("tablist", { name: "식품 추가 방법" });
  await expect(methodTabs.getByRole("tab", { name: "영수증" }).locator("span[aria-hidden='true']")).toHaveCount(0);
  const recommendedTab = methodTabs.getByRole("tab", { name: "라벨" });
  const recommendationBadge = recommendedTab.locator("span[aria-hidden='true']");
  await expect(recommendedTab).toHaveAccessibleName("라벨, 추천");
  await expect(recommendationBadge).toHaveText("추천");
  await expect(recommendationBadge).toHaveCSS("font-size", "10px");
  const recommendationColors = await recommendationBadge.evaluate((element) => {
    const sheet = element.closest<HTMLElement>("[data-testid=bottom-sheet]");
    if (!sheet) throw new Error("Date-recheck sheet was not found for the recommendation badge.");
    return {
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(sheet).backgroundColor,
    };
  });
  expect(contrastRatio(recommendationColors.foreground, recommendationColors.background)).toBeGreaterThanOrEqual(4.5);
  const currentDate = labelReview.getByRole("group", { name: "현재 기록된 날짜 포장 소비기한 · 2026.09.02 · 포장지 표시" });
  await expect(currentDate).toBeVisible();
  await expect(currentDate).toBeInViewport();
  await expect(currentDate).toHaveText(/현재 기록.*포장 소비기한 2026\.09\.02 포장지 표시/);
  const dateContextPrecedesMethodChoices = await currentDate.evaluate((element) => {
    const methodChoices = element.parentElement?.querySelector(".mode-tabs");
    return Boolean(methodChoices && (element.compareDocumentPosition(methodChoices) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(dateContextPrecedesMethodChoices).toBe(true);
  const dateReviewProgress = labelReview.getByRole("group", { name: "날짜 확인 1단계" });
  await expect(dateReviewProgress).toBeVisible();
  await expect(labelReview.getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();
  await expect(labelReview.locator(".sheet-description")).toContainText("저장 전까지 기록은 그대로예요");
  await expect(dateReviewProgress.locator(".intake-flow-rail-heading")).toHaveCount(0);
  await expect(labelReview.locator(".sheet-description")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note strong")).toHaveCSS("font-size", "12px");
  const labelImageGuidance = labelReview.locator(".input-flow > p").first();
  await expect(labelImageGuidance).toHaveText("사진은 식품 기록에 저장하지 않아요.");
  await expect(labelImageGuidance).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note small")).toHaveCSS("font-size", "12px");
  const cameraAction = labelReview.getByRole("button", { name: "카메라로 촬영" });
  await expect(cameraAction).toBeInViewport();
  const viewportSize = page.viewportSize();
  expect(viewportSize).toBeTruthy();
  await expect.poll(async () => {
    const bounds = await cameraAction.boundingBox();
    return Boolean(bounds && viewportSize && bounds.y + bounds.height <= viewportSize.height);
  }).toBe(true);
  const cameraActionBox = await cameraAction.boundingBox();
  expect(cameraActionBox).toBeTruthy();
  expect(cameraActionBox!.y + cameraActionBox!.height, "capture action fits inside the native viewport").toBeLessThanOrEqual(viewportSize!.height);
  const headerBox = await labelReview.locator(".sheet-header").boundingBox();
  expect(headerBox?.height).toBeLessThanOrEqual(112);

  await labelReview.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(detail.getByRole("group", { name: "날짜 정보: 포장 소비기한" })).toContainText("2026.09.02");
  await expect(detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" })).toBeFocused();
});

test("keeps dark native date recheck readable and inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await openFridgeFood(page, "시금치");

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  await waitForSheetSettled(page);
  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  const recommendedTab = labelReview.getByRole("tab", { name: "라벨" });
  const recommendationBadge = recommendedTab.locator("span[aria-hidden='true']");
  await expect(recommendedTab).toHaveAccessibleName("라벨, 추천");
  await expect(recommendationBadge).toHaveCSS("font-size", "10px");
  const recommendationColors = await recommendationBadge.evaluate((element) => {
    const sheet = element.closest<HTMLElement>("[data-testid=bottom-sheet]");
    if (!sheet) throw new Error("Date-recheck sheet was not found for the recommendation badge.");
    return {
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(sheet).backgroundColor,
    };
  });
  expect(contrastRatio(recommendationColors.foreground, recommendationColors.background)).toBeGreaterThanOrEqual(4.5);
  await expect(labelReview.getByRole("group", { name: "현재 기록된 날짜 포장 소비기한 · 2026.09.02 · 포장지 표시" })).toBeInViewport();
  await expect(labelReview.locator(".sheet-description")).toContainText("저장 전까지 기록은 그대로예요");
  await expect(labelReview.locator(".sheet-description")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note strong")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note small")).toHaveCSS("font-size", "12px");
  const sheetBackground = await labelReview.evaluate((element) => getComputedStyle(element).backgroundColor);
  for (const control of [labelReview.locator(".file-button"), labelReview.locator(".capture-sample-button")]) {
    const textColor = await control.evaluate((element) => getComputedStyle(element).color);
    expect(contrastRatio(textColor, sheetBackground)).toBeGreaterThanOrEqual(4.5);
  }

  const cameraAction = labelReview.getByRole("button", { name: "카메라로 촬영" });
  await expect(cameraAction).toBeInViewport();
  const actionBox = await cameraAction.boundingBox();
  const viewportSize = page.viewportSize();
  expect(actionBox).toBeTruthy();
  expect(viewportSize).toBeTruthy();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewportSize!.height);
});

test("keeps every label intake choice fully visible on the 320px date recheck sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
    await page.reload();
    if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
      await toggleThemeInMe(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    await openFridgeFood(page, "시금치");
    const detail = page.getByRole("dialog", { name: "시금치" });
    await expect(detail).toBeVisible();
    await waitForSheetSettled(page);
    await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();

    const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
    await expect(labelReview).toBeVisible();
    await waitForSheetSettled(page);
    for (const action of [
      labelReview.getByRole("button", { name: "카메라로 촬영" }),
      labelReview.locator(".file-button"),
      labelReview.getByRole("button", { name: "예시 라벨 결과 보기" }),
    ]) {
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box, `${theme} label intake action has no box`).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(740);
    }
  }
});

test("contains keyboard focus in printed-date recheck and returns it to the trigger", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await openFridgeFood(page, "시금치");

  const detail = page.getByRole("dialog", { name: "시금치" });
  const trigger = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  await trigger.click();
  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelReview).toBeVisible();
  await waitForSheetSettled(page);

  const assertFocusInside = async () => {
    await expect.poll(() => labelReview.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  };
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    await assertFocusInside();
  }
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await assertFocusInside();
  }

  await page.keyboard.press("Escape");
  await expect(labelReview).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(detail.getByRole("group", { name: "날짜 정보: 포장 소비기한" })).toContainText("2026.09.02");
});

test("keeps the 320px date recheck trigger visibly focused after keyboard dismissal in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
    await page.reload();
    if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
      await toggleThemeInMe(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    await openFridgeFood(page, "시금치");

    const detail = page.getByRole("dialog", { name: "시금치" });
    const trigger = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
    await trigger.click();
    const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
    await expect(labelReview).toBeVisible();
    await waitForSheetSettled(page);

    for (let index = 0; index < 16; index += 1) {
      await page.keyboard.press("Tab");
      await expect.poll(() => labelReview.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");

    await expect(labelReview).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const focusStyle = await trigger.evaluate((element) => ({
      visible: element.matches(":focus-visible"),
      ring: getComputedStyle(element, "::after"),
      surface: getComputedStyle(element.closest(".bottom-sheet")!).backgroundColor,
    }));
    expect(focusStyle.visible).toBe(true);
    expect(focusStyle.ring.content).not.toBe("none");
    expect(focusStyle.ring.borderTopStyle).toBe("solid");
    expect(focusStyle.ring.borderTopWidth).toBe("2px");
    expect(contrastRatio(focusStyle.ring.borderTopColor, focusStyle.surface)).toBeGreaterThanOrEqual(3);
    await expect(detail.getByRole("group", { name: "날짜 정보: 포장 소비기한" })).toContainText("2026.09.02");
  }
});

test("keeps the mobile date-recheck keyboard path visibly focused without an extra panel stop", async ({ page }) => {
  const expectFocusRing = async (target: Locator, surfaceSelector: string) => {
    const style = await target.evaluate((element, selector) => {
      const ring = getComputedStyle(element, "::after");
      const surface = element.closest(selector);
      return {
        focused: element.matches(":focus-visible"),
        content: ring.content,
        borderStyle: ring.borderTopStyle,
        borderWidth: ring.borderTopWidth,
        borderColor: ring.borderTopColor,
        surface: surface ? getComputedStyle(surface).backgroundColor : "transparent",
      };
    }, surfaceSelector);
    expect(style.focused).toBe(true);
    expect(style.content).not.toBe("none");
    expect(style.borderStyle).toBe("solid");
    expect(style.borderWidth).toBe("2px");
    expect(contrastRatio(style.borderColor, style.surface)).toBeGreaterThanOrEqual(3);
  };

  for (const theme of ["light", "dark"] as const) {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));
    await page.reload();
    if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
      await toggleThemeInMe(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    // 시금치 opens from its rescue card photo, the first food entry after the header's bell and 나.
    const firstPriority = page.getByRole("button", { name: "시금치 자세히 보기" });
    for (let index = 0; index < 64; index += 1) {
      await page.keyboard.press("Tab");
      if (await firstPriority.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(firstPriority).toBeFocused();
    await expectFocusRing(firstPriority, ".rescue-card");
    await firstPriority.press("Enter");

    const detail = page.getByRole("dialog", { name: "시금치" });
    const dateInfo = detail.getByRole("button", { name: "날짜 안내 보기" });
    for (let index = 0; index < 6; index += 1) {
      if (await dateInfo.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(dateInfo).toBeFocused();
    await expectFocusRing(dateInfo, ".bottom-sheet");

    const trigger = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expectFocusRing(trigger, ".bottom-sheet");

    const productInfo = detail.getByRole("button", { name: "상품 정보 수정" });
    const consume = detail.getByRole("button", { name: "날짜와 보관 방법을 살펴본 뒤 먹은 기록 남기기" });
    const discard = detail.getByRole("button", { name: "상태가 이상해 폐기하기" });
    const storage = detail.getByRole("group", { name: "보관 위치 선택" });
    const quantityAmount = detail.getByRole("button", { name: "1팩의 양 입력" });
    await page.keyboard.press("Tab");
    await expect(quantityAmount).toBeFocused();
    await expectFocusRing(quantityAmount, ".bottom-sheet");
    await page.keyboard.press("Tab");
    await expect(productInfo).toBeFocused();
    await expectFocusRing(productInfo, ".bottom-sheet");
    // Quantity controls sit between product info and the record actions.
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      if (await consume.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(consume).toBeFocused();
    await expectFocusRing(consume, ".bottom-sheet");
    await expect(consume).toHaveAttribute("aria-describedby", "consume-safety-hint");
    await expect(detail.locator("#consume-safety-hint")).toContainText("이미 먹은 경우에만 기록해 주세요");
    await page.keyboard.press("Tab");
    await expect(discard).toBeFocused();
    await expectFocusRing(discard, ".bottom-sheet");
    for (const [label, pressed] of [["냉장", true], ["냉동", false], ["실온", false]] as const) {
      const option = storage.getByRole("button", { name: label, exact: true });
      await page.keyboard.press("Tab");
      await expect(option).toBeFocused();
      await expect(option).toHaveAttribute("aria-pressed", String(pressed));
      await expectFocusRing(option, ".bottom-sheet");
    }
    await trigger.click();

    const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
    await expect(labelReview).toBeVisible();
    await waitForSheetSettled(page);
    const labelTab = labelReview.getByRole("tab", { name: "라벨" });
    const panel = labelReview.getByRole("tabpanel", { name: "라벨" });
    const camera = labelReview.getByRole("button", { name: "카메라로 촬영" });
    await expect(labelTab).toBeFocused();
    await expect(panel).toHaveAttribute("tabindex", "-1");
    await page.keyboard.press("Tab");
    await expect(camera).toBeFocused();
    await expectFocusRing(camera, ".bottom-sheet");

    const fileInput = labelReview.locator(".file-button input[type=file]");
    await page.keyboard.press("Tab");
    await expect(fileInput).toBeFocused();
    const fileFocus = await fileInput.evaluate((element) => {
      const host = element.closest<HTMLElement>(".file-button")!;
      const ring = getComputedStyle(host);
      return {
        focused: element.matches(":focus-visible"),
        borderStyle: ring.outlineStyle,
        borderWidth: ring.outlineWidth,
        borderColor: ring.outlineColor,
        surface: getComputedStyle(host.closest(".bottom-sheet")!).backgroundColor,
      };
    });
    expect(fileFocus.focused).toBe(true);
    expect(fileFocus.borderStyle).toBe("solid");
    expect(fileFocus.borderWidth).toBe("2px");
    expect(contrastRatio(fileFocus.borderColor, fileFocus.surface)).toBeGreaterThanOrEqual(3);

    const sample = labelReview.getByRole("button", { name: "예시 라벨 결과 보기" });
    await page.keyboard.press("Tab");
    await expect(sample).toBeFocused();
    await expectFocusRing(sample, ".bottom-sheet");

    const close = labelReview.getByRole("button", { name: "닫기", exact: true });
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await expectFocusRing(close, ".bottom-sheet");
    await page.keyboard.press("Escape");

    await expect(labelReview).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectFocusRing(trigger, ".bottom-sheet");
    await expect(detail.getByRole("group", { name: "날짜 정보: 포장 소비기한" })).toContainText("2026.09.02");
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await expect(firstPriority).toBeFocused();
    await expectFocusRing(firstPriority, ".meal-home");
  }
});

test("shows visible keyboard focus across Home entry points and bottom navigation in both themes", async ({ page }) => {
  const expectHomeRing = async (target: Locator, surfaceSelector: string, pseudo = "::after") => {
    const style = await target.evaluate((element, options) => {
      const ring = getComputedStyle(element, options.pseudo);
      const surface = element.closest(options.surfaceSelector);
      return {
        focused: element.matches(":focus-visible"),
        content: ring.content,
        borderStyle: ring.borderTopStyle,
        borderWidth: ring.borderTopWidth,
        borderColor: ring.borderTopColor,
        surface: surface ? getComputedStyle(surface).backgroundColor : "transparent",
      };
    }, { surfaceSelector, pseudo });
    expect(style.focused).toBe(true);
    expect(style.content).not.toBe("none");
    expect(style.borderStyle).toBe("solid");
    expect(style.borderWidth).toBe("2px");
    expect(contrastRatio(style.borderColor, style.surface)).toBeGreaterThanOrEqual(3);
  };

  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate((selectedTheme) => window.localStorage.setItem("rescue-meal.theme", selectedTheme), theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      // Header controls (bell, then 나) sit on the deep green fridge panel; rescue card actions sit on their card.
      const panelTargets = new Set([".connection-pill", ".notification-button"]);
      const homeTargets = [
        page.locator(".notification-button"),
        page.locator(".connection-pill"),
        // The rescue deck opens the panel: each card's photo and actions are Home entry points.
        page.locator(".rescue-card-photo").first(),
        page.locator(".rescue-card-action").first(),
        // Below the panel: the safety summary, one row per storage place, then the single meal action.
        page.locator(".trust-card"),
        page.locator(".home-shelf-row").first(),
        page.locator(".home-shelf-row").last(),
        // Quick-add moved into the bottom navigation (checked with the nav below).
        page.locator(".meal-plan-button"),
      ];

      for (const target of homeTargets) {
        for (let index = 0; index < 64; index += 1) {
          await page.keyboard.press("Tab");
          if (await target.evaluate((element) => element === document.activeElement)) break;
        }
        await expect(target).toBeFocused();
        if (await target.evaluate((element) => element.classList.contains("fridge-sticker"))) {
          // Stickers draw a round ring on the photo instead of the square home ring; the sideways
          // sticker row must not clip it.
          const ring = await target.evaluate((element) => {
            const photoRing = element.querySelector<HTMLElement>(".fridge-sticker-ring")!;
            const style = getComputedStyle(photoRing);
            const width = Number.parseFloat(style.outlineWidth);
            const extent = width + Number.parseFloat(style.outlineOffset);
            const box = photoRing.getBoundingClientRect();
            const row = element.closest<HTMLElement>(".fridge-stickers")!.getBoundingClientRect();
            let surface = "rgba(0, 0, 0, 0)";
            for (let node: HTMLElement | null = element; node; node = node.parentElement) {
              const color = getComputedStyle(node).backgroundColor;
              if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { surface = color; break; }
            }
            return {
              focused: element.matches(":focus-visible"),
              squareRing: getComputedStyle(element, "::after").content,
              style: style.outlineStyle,
              width,
              color: style.outlineColor,
              surface,
              inside: box.top - extent >= row.top - 0.5 && box.bottom + extent <= row.bottom + 0.5,
            };
          });
          expect(ring.focused).toBe(true);
          expect(ring.squareRing).toBe("none");
          expect(ring.style).toBe("solid");
          expect(ring.width).toBeGreaterThanOrEqual(2);
          expect(contrastRatio(ring.color, ring.surface)).toBeGreaterThanOrEqual(3);
          expect(ring.inside, "sticker focus ring is clipped by the shelf row").toBe(true);
        } else if (await target.evaluate((element) => element.matches(".rescue-card-photo, .rescue-card-action"))) {
          await expectHomeRing(target, ".rescue-card");
        } else {
          const className = await target.evaluate((element) => element.className);
          const onPanel = [...panelTargets].some((selector) => className.includes(selector.slice(1)));
          await expectHomeRing(target, onPanel ? ".kitchen-hero" : ".meal-home");
        }
      }

      const homeTab = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "홈", exact: true });
      await homeTab.evaluate((element) => element.focus({ preventScroll: true }));
      for (const label of ["냉장고", "식품 추가하기", "식단"]) {
        const navTarget = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: label, exact: true });
        await page.keyboard.press("Tab");
        await expect(navTarget).toBeFocused();
        if (label === "식품 추가하기") {
          // The centre add button straddles the pill and the page: its yolk ring must read on the pill
          // and its ink band on the page behind it.
          const ring = await navTarget.evaluate((element) => {
            const style = getComputedStyle(element, "::after");
            return {
              focused: element.matches(":focus-visible"),
              content: style.content,
              style: style.borderTopStyle,
              width: Number.parseFloat(style.borderTopWidth),
              color: style.borderTopColor,
              band: style.boxShadow.match(/rgba?\([^)]*\)/)?.[0] ?? "",
              pill: getComputedStyle(element.closest(".app-bottom-nav")!).backgroundColor,
              page: getComputedStyle(document.querySelector(".meal-home")!).backgroundColor,
            };
          });
          expect(ring.focused).toBe(true);
          expect(ring.content).not.toBe("none");
          expect(ring.style).toBe("solid");
          expect(ring.width).toBeGreaterThanOrEqual(2);
          expect(contrastRatio(ring.color, ring.pill)).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(ring.band, ring.page)).toBeGreaterThanOrEqual(3);
        } else {
          await expectHomeRing(navTarget, ".app-bottom-nav", "::before");
        }
      }
    }
  }
});

test("returns focus to product info action after cancelling product edit", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  await page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /국산콩 두부 풀무원 1모/ }).click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  const productInfoAction = detail.getByRole("button", { name: "상품 정보 수정" });
  await productInfoAction.click();
  const editor = detail.getByRole("group", { name: "상품 정보 수정" });
  await editor.getByRole("textbox", { name: "상품명 수정" }).fill("임시 상품명");
  await editor.getByRole("button", { name: "취소" }).click();

  await expect(editor).toHaveCount(0);
  await expect(productInfoAction).toBeFocused();
  // The food name sits in the sheet title; the hero keeps the unchanged brand after cancelling.
  await expect(detail.getByRole("heading", { name: "국산콩 두부" })).toBeVisible();
  await expect(detail.locator(".detail-hero")).toContainText("풀무원");
  await expect(detail).not.toContainText("임시 상품명");
});

test("returns to the same notification row after mobile date review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  await page.getByRole("button", { name: /알림 보기/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notification = notifications.getByRole("button", { name: /시금치 날짜를 살펴봐 주세요/ });
  await notification.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  const labelDialog = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(labelDialog.getByRole("group", { name: "날짜 확인 2단계" })).toContainText("날짜와 보관 방법을 살펴봐요");
  await labelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  // The confirmed date resolves this food's notification, so focus lands on the list's first action.
  await expect(notifications).toBeVisible();
  await expect(notification).toHaveCount(0);
  await expect(notifications.locator(".notification-read-all")).toBeFocused();
  await notifications.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  // The confirmed date moves 시금치 out of the passed bucket: no review summary and no passed card remain.
  await expect(page.locator(".trust-card")).toHaveCount(0);
  await expect(page.locator(".rescue-card.freshness-past")).toHaveCount(0);
});

test("keeps the pantry anchor at the top when a search has no results", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const inventory = page.getByRole("region", { name: /내 식품 목록/ });
    await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
    // 냉장고 opens at its own top: the screen title, then the list right under it.
    await expect.poll(() => inventory.evaluate((element) => {
      const header = Array.from(document.querySelectorAll<HTMLElement>(".fridge-screen .screen-header")).find((item) => item.getClientRects().length > 0);
      if (!header) return Number.POSITIVE_INFINITY;
      return Math.abs(element.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    })).toBeLessThanOrEqual(8);

    await inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" }).fill("없는 식품");
    await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]");
      return {
        screen: rect("[data-testid=device-screen]"),
        inventory: rect(".inventory-section"),
        toolbar: rect(".inventory-toolbar"),
        empty: rect(".inventory-empty-state"),
        navigation: rect(".app-bottom-nav"),
        scrollTop: scroll?.scrollTop ?? -1,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.inventory).toBeTruthy();
    expect(layout.toolbar).toBeTruthy();
    expect(layout.empty).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    // The search toolbar stays anchored near the top of 냉장고 (under its title) instead of jumping away.
    expect(layout.inventory!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.top).toBeLessThanOrEqual(layout.screen!.top + 120);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.empty!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.scrollTop).toBeGreaterThanOrEqual(0);
  }
});

test("survives native viewport height changes while the pantry and detail are active", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await mainNav(page).getByRole("button", { name: "냉장고", exact: true }).click();
  // 냉장고 opens at its own top: the screen title, then the list right under it.
  await expect.poll(() => inventory.evaluate((element) => {
    const header = Array.from(document.querySelectorAll<HTMLElement>(".fridge-screen .screen-header")).find((item) => item.getClientRects().length > 0);
    if (!header) return Number.POSITIVE_INFINITY;
    return Math.abs(element.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
  })).toBeLessThanOrEqual(8);

  const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
  await search.fill("두부");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  for (const height of [740, 600, 852]) {
    await page.setViewportSize({ width: 393, height });
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      return screen?.getBoundingClientRect().height ?? 0;
    })).toBeCloseTo(height, 0);
    // The scroll re-anchors one frame after the resize settles.
    await expect.poll(() => page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".inventory-toolbar")?.getBoundingClientRect();
      const row = Array.from(document.querySelectorAll<HTMLElement>(".inventory-row")).at(-1)?.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
      return Boolean(toolbar && row && nav && toolbar.bottom <= nav.top + 1 && row.bottom <= nav.top + 1);
    })).toBe(true);

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
      const resultRows = Array.from(document.querySelectorAll<HTMLElement>(".inventory-row"));
      return {
        screen: rect("[data-testid=device-screen]"),
        toolbar: rect(".inventory-toolbar"),
        search: rect(".inventory-search-input"),
        navigation: navigation ? { ...navigation.getBoundingClientRect().toJSON(), visibility: getComputedStyle(navigation).visibility } : null,
        lastResultRow: resultRows.at(-1)?.getBoundingClientRect().toJSON() ?? null,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.toolbar).toBeTruthy();
    expect(layout.search).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.lastResultRow).toBeTruthy();
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.search!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.search!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.lastResultRow!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.visibility).toBe("visible");
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(393);
    expect(layout.bodyWidth).toBeLessThanOrEqual(393);
  }

  await page.setViewportSize({ width: 393, height: 600 });
  await inventory.getByRole("button", { name: /국산콩 두부/ }).click();
  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".detail-actions")).not.toHaveClass(/detail-actions-stuck/);

  for (const height of [600, 852]) {
    await page.setViewportSize({ width: 393, height });
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]");
      if (!screen || !sheet) return Number.POSITIVE_INFINITY;
      return Math.abs(sheet.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom);
    })).toBeLessThanOrEqual(1);

    const sheetLayout = await page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
      const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]")!;
      const content = document.querySelector<HTMLElement>(".sheet-content");
      return {
        screen: screen.getBoundingClientRect().toJSON(),
        sheet: sheet.getBoundingClientRect().toJSON(),
        sheetScrollWidth: content?.scrollWidth ?? 0,
        sheetClientWidth: content?.clientWidth ?? 0,
        detailActionPosition: document.querySelector<HTMLElement>(".detail-actions") ? getComputedStyle(document.querySelector<HTMLElement>(".detail-actions")!).position : "missing",
      };
    });
    expect(sheetLayout.sheet.top).toBeGreaterThanOrEqual(sheetLayout.screen.top - 1);
    expect(sheetLayout.sheet.bottom).toBeLessThanOrEqual(sheetLayout.screen.bottom + 1);
    expect(sheetLayout.sheetScrollWidth).toBeLessThanOrEqual(sheetLayout.sheetClientWidth + 1);
    expect(sheetLayout.detailActionPosition).toBe("sticky");

    await detail.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(40);
    const detailActionBox = await detail.locator(".detail-actions").boundingBox();
    expect(detailActionBox, `detail actions have no bounding box at ${height}px`).toBeTruthy();
    expect(detailActionBox!.y + detailActionBox!.height).toBeLessThanOrEqual(sheetLayout.screen.bottom - 34);
  }
});

test("elevates food detail actions only after scrolling past their normal position", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await openFridgeFood(page, "시금치");
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await waitForSheetSettled(page);

  const actions = detail.locator(".detail-actions");
  const content = detail.locator(".sheet-content");
  await expect(actions).not.toHaveClass(/detail-actions-stuck/);
  await page.addStyleTag({ content: ".detail-sheet-content::after { content: \"\"; display: block; min-height: 900px; }" });
  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);
  await expect(actions).toHaveClass(/detail-actions-stuck/);
  await expect(actions).toHaveClass(/detail-actions-scroll-down/);

  await content.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 120);
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);
  await expect(actions).toHaveClass(/detail-actions-stuck/);
  await expect(actions).toHaveClass(/detail-actions-scroll-up/);
  await expect(actions).not.toHaveClass(/detail-actions-scroll-down/);

  await content.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(actions).not.toHaveClass(/detail-actions-stuck/);
  await expect(actions).not.toHaveClass(/detail-actions-scroll-up/);
});

test("keeps a bottom sheet usable at 320px", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();

  await assertDialogFitsNarrowViewport(page, dialog);
  await expect(dialog.getByRole("button", { name: "예시 영수증 보기" })).toBeVisible();
});

test("keeps the barcode candidate card and apply CTA inside a 320px sheet", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "바코드" }).click();
  const dialog = page.getByRole("dialog", { name: "바코드로 추가" });
  const exampleBarcode = dialog.getByRole("button", { name: "예시 바코드 입력" });
  await exampleBarcode.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await exampleBarcode.click();

  const candidateCard = dialog.locator(".barcode-candidate-card");
  const apply = dialog.getByRole("button", { name: "상품 정보 적용" });
  await expect(candidateCard).toBeVisible();
  await expect(apply).toBeFocused();

  await expect.poll(() => page.evaluate(() => {
    const read = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
    const card = read(".barcode-candidate-card");
    const action = read(".barcode-candidate-card .candidate-apply-button");
    const sheet = read(".bottom-sheet");
    const screen = read("[data-testid=device-screen]");
    const content = document.querySelector<HTMLElement>(".sheet-content");
    if (!card || !action || !sheet || !screen || !content) return false;
    return card.left >= sheet.left - 1
      && card.right <= sheet.right + 1
      && action.left >= sheet.left - 1
      && action.right <= sheet.right + 1
      && action.bottom <= screen.bottom + 1
      && action.height >= 44
      && Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".barcode-candidate-card .candidate-apply-button")!).fontSize) >= 12
      && content.scrollWidth <= content.clientWidth + 1;
  }), { timeout: 2_500 }).toBe(true);
});

test("keeps the receipt confirmation badge inside a 320px sheet", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("button", { name: "예시 영수증 보기" }).click();
  const confirm = receiptDialog.getByRole("button", { name: "내용이 맞아요" });
  await confirm.click();
  const badge = receiptDialog.locator(".receipt-line-card-confirmed .ocr-confidence");
  await expect(badge).toBeVisible();
  const metrics = await badge.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const sheet = element.closest<HTMLElement>(".bottom-sheet")?.getBoundingClientRect();
    return { left: box.left, right: box.right, sheetLeft: sheet?.left ?? 0, sheetRight: sheet?.right ?? 0, width: box.width };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(metrics.sheetLeft - 1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.sheetRight + 1);
  expect(metrics.width).toBeLessThanOrEqual(120);
});

test("keeps receipt review states legible in dark mode", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "예시 영수증 보기" }).click();
  const pendingCard = dialog.locator(".receipt-line-card-needs-confirmation");
  const pendingColors = await pendingCard.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopColor };
  });
  expect(pendingColors.background).not.toBe("rgb(244, 247, 240)");
  expect(pendingColors.border).not.toBe("rgba(0, 0, 0, 0)");
});

test("keeps the manual-food action reachable after entering a name", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await intakeDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(dialog.locator(".intake-flow-rail")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "연결 후 확인 가능" })).toHaveCount(0);
  await expect(dialog.locator(".manual-priority-note")).toHaveCount(0);
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("김치");

  const submit = dialog.getByRole("button", { name: "식품 추가하기", exact: true });
  await expect(submit).toHaveCount(1);
  await expect(dialog.locator("#manual-submit-summary")).toContainText(/김치.*1개.*냉장 보관/);
  await expect(submit).toHaveAttribute("aria-describedby", "manual-submit-summary");
  await expect.poll(() => dialog.locator("#manual-submit-summary").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  // The submit bar scrolls with the form (position: static), so it is checked after scrolling to the end.
  await dialog.locator(".sheet-content").evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.manual-submit-bar .manual-submit');
    const sheet = document.querySelector<HTMLElement>('.bottom-sheet');
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]');
    if (!action || !sheet || !screen) return false;
    const actionBox = action.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    const screenBox = screen.getBoundingClientRect();
    return actionBox.top >= sheetBox.top && actionBox.bottom <= screenBox.bottom + 1;
  })).toBe(true);
});

test("keeps the active receipt editor clear of the sticky commit action", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "예시 영수증 보기" }).click();

  const mushroomCard = dialog.locator(".receipt-line-card").filter({ hasText: "맛타리버섯" });
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" }).click();
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" }).click();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);

  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const criticalControls = [
      '.receipt-line-card-editing input[aria-label="식품 이름"]',
      '.receipt-line-card-editing input[aria-label="수량"]',
      '.receipt-line-card-editing input[aria-label="단위"]',
      ".receipt-line-card-editing .receipt-line-storage-field",
    ]
      .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect));
    const content = document.querySelector<HTMLElement>(".sheet-content");
    if (!bar || !content || criticalControls.length !== 4) return Number.POSITIVE_INFINITY;
    const contentTop = content.getBoundingClientRect().top;
    return criticalControls.reduce((total, rect) => total + Math.max(0, Math.min(bar.bottom, rect.bottom) - Math.max(bar.top, Math.max(contentTop, rect.top))), 0);
  }), { timeout: 2_500 }).toBe(0);

  await mushroomCard.getByRole("textbox", { name: "식품 이름" }).focus();
  await expect.poll(() => page.evaluate(() => {
    const field = document.querySelector<HTMLElement>('.receipt-line-card-editing input[aria-label="식품 이름"]')?.getBoundingClientRect();
    const bar = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const content = document.querySelector<HTMLElement>(".sheet-content")?.getBoundingClientRect();
    // The native shell uses the OS keyboard, so no simulated keyboard dock is shown here.
    if (!field || !bar || !content) return false;
    const overlapsCommitAction = field.top < bar.bottom && field.bottom > bar.top;
    return field.top >= content.top && field.bottom <= content.bottom && !overlapsCommitAction;
  }), { timeout: 2_500 }).toBe(true);
});

test("focuses the label source first and keeps confirmation reachable after recognition", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();

  const action = dialog.getByRole("button", { name: "새 식품 추가하기" });
  const labelSource = dialog.getByRole("group", { name: "예시 라벨 결과" });
  await expect(action).toBeVisible();
  await expect(labelSource).toBeFocused();
  await expect.poll(async () => {
    const screenBox = await page.getByTestId("device-screen").boundingBox();
    const actionBox = await action.boundingBox();
    return Boolean(screenBox && actionBox && actionBox.y >= screenBox.y && actionBox.y + actionBox.height <= screenBox.y + screenBox.height - 34 && actionBox.height >= 43.5);
  }, { timeout: 2_500 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".label-result-card");
    const sheet = document.querySelector<HTMLElement>(".bottom-sheet");
    const content = document.querySelector<HTMLElement>(".sheet-content");
    if (!card || !sheet || !content) return false;
    const cardBox = card.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    return cardBox.left >= sheetBox.left - 1
      && cardBox.right <= sheetBox.right + 1
      && card.scrollWidth <= card.clientWidth + 1
      && content.scrollWidth <= content.clientWidth + 1;
  }), { timeout: 2_500 }).toBe(true);
  const order = await dialog.locator(".label-result-card").evaluate((card) => {
    const actionBar = card.parentElement?.querySelector(".label-result-action-bar");
    return Boolean(actionBar && (card.compareDocumentPosition(actionBar) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toBe(true);
});

test("shows the example source beside the label confirmation at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.reload();

  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();

  const source = dialog.locator(".label-result-provenance");
  const actionSummary = dialog.locator(".label-result-action-summary");
  await expect(source).toHaveAttribute("data-label-source", "example");
  await expect(source.locator("strong")).toHaveText("예시 라벨 결과");
  await expect(source.locator("span")).toHaveCSS("font-size", "12px");
  await expect(source.locator("span")).toHaveCSS("text-align", "left");
  await expect(source.locator("span")).toHaveText("예시 결과예요. 실제 식품을 등록할 때 포장지 날짜를 선택해 주세요.");
  await expect(actionSummary).toContainText("예시 결과 저장 전 확인");
  await expect(dialog.locator(".label-storage-condition-note")).toHaveText("예시 보관 정보 냉장 보관");
  await expect(dialog.locator(".confirmed-badge")).toContainText("예시 정보");
  await expect(dialog.getByLabel("포장지 날짜")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "새 식품 추가하기" })).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".sheet-content");
    const date = element.querySelector<HTMLElement>(".label-result-date-field");
    const action = element.querySelector<HTMLElement>(".label-result-action-bar");
    return Boolean(content && date && action
      && date.getBoundingClientRect().bottom <= action.getBoundingClientRect().top + 1
      && action.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 1);
  }), { timeout: 2_500 }).toBe(true);

  await page.screenshot({ path: "../../evidence/mobile-flow-review-2026-09-29/12-example-label-result-320x740-dark-current-copy.png", scale: "css" });
  await dialog.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.locator(".label-storage-condition-note")).toHaveText("예시 보관 정보 냉장 보관");
  await expect(dialog.locator(".confirmed-badge")).toContainText("예시 정보");
  await page.screenshot({ path: "../../evidence/mobile-flow-review-2026-09-29/13-example-label-result-review-320x740-dark-current-copy.png", scale: "css" });
});

test("keeps the label date field clear of the sticky action at 320px", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(dialog.locator(".label-result-provenance")).toHaveAttribute("data-label-source", "example");
  await expect(dialog.locator(".label-result-provenance span")).toHaveText("예시 결과예요. 실제 식품을 등록할 때 포장지 날짜를 선택해 주세요.");
  await expect(dialog.locator(".label-result-provenance strong")).toHaveCSS("font-size", "12px");
  await expect(dialog.locator(".label-result-action-summary")).toContainText("예시 결과 저장 전 확인");
  await expect.poll(() => dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".sheet-content");
    const date = element.querySelector<HTMLElement>(".label-result-date-field");
    const action = element.querySelector<HTMLElement>(".label-result-action-bar");
    if (!content || !date || !action) return null;
    const contentBox = content.getBoundingClientRect();
    const dateBox = date.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return dateBox.top >= contentBox.top - 1
      && dateBox.bottom <= actionBox.top + 1
      && actionBox.bottom <= contentBox.bottom + 1;
  }), { timeout: 2_500 }).toBe(true);

  await dialog.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => dialog.evaluate((element) => {
    const storage = element.querySelector<HTMLElement>(".label-result-card .storage-picker");
    const action = element.querySelector<HTMLElement>(".label-result-action-bar");
    return Boolean(storage && action && storage.getBoundingClientRect().bottom <= action.getBoundingClientRect().top + 1);
  })).toBe(true);
});

test("opens the explicit receipt source review fixture and follows a source box to its line", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  await expect(dialog).toBeVisible();
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(sourcePreview).toBeVisible();
  await expect(sourcePreview).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const readingOrder = await dialog.evaluate((element) => {
    const source = element.querySelector<HTMLElement>(".receipt-source-preview");
    const lines = Array.from(element.querySelectorAll<HTMLElement>(".receipt-line-card"));
    const submit = element.querySelector<HTMLElement>(".receipt-review-submit-bar");
    if (!source || !lines.length || !submit) return null;
    const follows = (before: Node, after: Node) => Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      // Product lines lead; the source preview follows them, directly above the save bar.
      linesBeforeSource: lines.every((line) => follows(line, source)),
      sourceBeforeSubmit: follows(source, submit),
    };
  });
  expect(readingOrder).toEqual({ linesBeforeSource: true, sourceBeforeSubmit: true });
  const spinachCardForOrder = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  const spinachActions = await spinachCardForOrder.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(spinachActions).toEqual([
    "시금치 1팩, 2,980원",
    "시금치 항목 수정",
    "시금치 영수증에서 위치 보기",
  ]);
  await expect(spinachCardForOrder.locator(".receipt-line-source-action-row .receipt-line-source-button")).toHaveAttribute("aria-pressed", "false");
  const spinachSourceActionBox = await spinachCardForOrder.locator(".receipt-line-source-action-row .receipt-line-source-button").boundingBox();
  expect(spinachSourceActionBox?.height).toBeGreaterThanOrEqual(44);
  await expect(spinachCardForOrder.locator(".receipt-line-toggle")).toHaveAttribute("aria-describedby", "receipt-line-status-receipt-spinach");
  await expect(spinachCardForOrder).toHaveAttribute("data-receipt-review-state", "auto_read");
  await expect(spinachCardForOrder).toContainText("영수증에서 읽었어요");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "국산콩 두부 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "맛타리버섯 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview).toContainText("현재 항목 맛타리버섯");
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toContainText("현재 항목");
  await expect(sourcePreview).toHaveAttribute("data-active-source-count", "1");
  await expect(sourcePreview).toHaveAttribute("data-active-source-included", "true");
  await expect(sourcePreview.locator("#receipt-source-preview-hint")).toContainText("표시된 상품을 누르면 내용을 수정할 수 있어요.");
  const mushroomSource = sourcePreview.getByRole("button", { name: "맛타리버섯 영수증에서 확인하기" });
  const spinachSource = sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" });
  await expect(mushroomSource).toHaveAttribute("aria-pressed", "true");
  await expect(spinachSource).toHaveAttribute("aria-pressed", "false");
  const mushroomCard = dialog.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  const mushroomToggle = mushroomCard.locator(".receipt-line-toggle");
  await mushroomToggle.click();
  await expect(mushroomToggle).toHaveAttribute("aria-pressed", "false");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "맛타리버섯");
  await expect(sourcePreview).toHaveAttribute("data-active-source-included", "false");
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toHaveText("저장 제외 맛타리버섯");
  await expect(dialog.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();
  await mushroomToggle.click();
  await expect(mushroomToggle).toHaveAttribute("aria-pressed", "true");
  await expect(sourcePreview).toHaveAttribute("data-active-source-included", "true");
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toContainText("현재 항목");
  await expect(dialog.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  await spinachSource.press("Enter");
  await expect(spinachSource).toHaveAttribute("aria-pressed", "true");
  await expect(mushroomSource).toHaveAttribute("aria-pressed", "false");
  await expect(sourcePreview).toContainText("현재 항목 시금치");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "시금치");
  await expect(sourcePreview.locator(".receipt-source-hit-target").first()).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const lineSourceButtons = sourcePreview.getByRole("button", { name: /영수증에서 확인하기$/ });
  await expect(lineSourceButtons).toHaveCount(3);
  await expect(lineSourceButtons.first()).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const hitTargets = await sourcePreview.locator(".receipt-source-hit-target").evaluateAll((elements) => elements.map((element) => {
    return { width: element.offsetWidth, height: element.offsetHeight };
  }));
  expect(hitTargets).toHaveLength(3);
  expect(hitTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  const sourceFrame = await sourcePreview.locator(".receipt-source-preview-frame").boundingBox();
  expect(sourceFrame).toBeTruthy();
  expect(sourceFrame!.x).toBeGreaterThanOrEqual(0);
  expect(sourceFrame!.x + sourceFrame!.width).toBeLessThanOrEqual(321);
  await expect.poll(() => sourcePreview.locator(".receipt-source-preview-frame").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(18, 26, 34)");
  await sourcePreview.getByRole("button", { name: "원본 확대" }).click();
  await expect(sourcePreview.getByRole("button", { name: "원본 축소" })).toHaveAttribute("aria-pressed", "true");
  const zoomedFrame = await sourcePreview.locator(".receipt-source-preview-frame").boundingBox();
  expect(zoomedFrame).toBeTruthy();
  expect(zoomedFrame!.height).toBeGreaterThan(sourceFrame!.height);
  const tofuSource = sourcePreview.getByRole("button", { name: "국산콩 두부 영수증에서 확인하기" });
  await tofuSource.press("Enter");
  await expect(tofuSource).toHaveAttribute("aria-pressed", "true");
  await expect(sourcePreview).toContainText("현재 항목 국산콩 두부");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "국산콩 두부");
  const activeTofuBoxes = await sourcePreview.locator(".receipt-source-box-active").count();
  expect(activeTofuBoxes).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const submit = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const activeBoxes = Array.from(document.querySelectorAll<HTMLElement>(".receipt-source-box-active"), (element) => element.getBoundingClientRect());
    return Boolean(submit && activeBoxes.length && activeBoxes.every((box) => box.bottom <= submit.top + 1));
  })).toBe(true);

  // Choosing a source line scrolls to its card; bring the preview back and tap the spinach box on the zoomed receipt.
  const spinachTapBox = sourcePreview.locator('.receipt-source-box[data-observation-id="fixture-observation-spinach"]');
  await spinachTapBox.scrollIntoViewIfNeeded();
  let settledTapTop: number | null = null;
  await expect.poll(async () => {
    const top = (await spinachTapBox.boundingBox())?.y ?? null;
    const settled = top !== null && top === settledTapTop;
    settledTapTop = top;
    return settled;
  }).toBe(true);
  const spinachTapBounds = await spinachTapBox.boundingBox();
  await page.mouse.click(spinachTapBounds!.x + spinachTapBounds!.width / 2, spinachTapBounds!.y + spinachTapBounds!.height / 2);
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" })).toBeVisible();
  await expect(spinachCard.getByRole("group", { name: "시금치 보관 위치" })).not.toHaveAttribute("aria-describedby", "receipt-storage-hint-receipt-spinach");
  await spinachCard.getByRole("textbox", { name: "식품 이름" }).fill("시금치");
  await expect(spinachCard.locator(".receipt-line-source-action-row .receipt-line-source-button")).toHaveAccessibleName("시금치 영수증에서 위치 보기");
  await expect(sourcePreview).toContainText("현재 항목 시금치");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "시금치 영수증에서 확인하기", exact: true })).toHaveCount(0);
  await expect(sourcePreview.getByRole("button", { name: "원본 축소" })).toBeVisible();
  await sourcePreview.getByRole("button", { name: "원본 축소" }).click();
  await expect(sourcePreview.getByRole("button", { name: "원본 확대" })).toHaveAttribute("aria-pressed", "false");
  await expect(sourcePreview).toContainText("현재 항목 시금치");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "시금치");
  await expect(sourcePreview.getByRole("button", { name: "국산콩 두부 영수증에서 확인하기" })).toHaveAttribute("aria-pressed", "false");
  await spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" }).click();
  await expect(sourcePreview).toContainText("현재 항목 시금치");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "시금치");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "영수증 내용 다시 보기" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  await expect(reopenedDialog).toBeVisible();
  const reopenedPreview = reopenedDialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(reopenedPreview).toBeVisible();
  await expect(reopenedPreview).toHaveAttribute("data-active-source-line", "맛타리버섯");
  await expect(reopenedPreview.getByRole("button", { name: "원본 확대" })).toHaveAttribute("aria-pressed", "false");
});

test("keeps the source review fixture legible in dark mode", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  await expect(dialog).toBeVisible();
  const colors = await dialog.evaluate((element) => {
    const frame = element.querySelector<HTMLElement>(".receipt-source-preview-frame");
    const activeBox = element.querySelector<HTMLElement>(".receipt-source-box-active");
    const submit = element.querySelector<HTMLElement>(".receipt-review-submit-bar .primary-sheet-button");
    return {
      theme: document.documentElement.dataset.rescueTheme,
      frameBackground: frame ? getComputedStyle(frame).backgroundColor : "",
      activeBorder: activeBox ? getComputedStyle(activeBox).borderTopColor : "",
      submitBackground: submit ? getComputedStyle(submit).backgroundColor : "",
    };
  });
  expect(colors.theme).toBe("dark");
  expect(colors.frameBackground).toBe("rgb(18, 26, 34)");
  expect(colors.activeBorder).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.submitBackground).not.toBe("rgba(0, 0, 0, 0)");
  await expect(dialog.getByRole("button", { name: "3개 식품 저장하기" })).toBeVisible();
});

test("keeps the receipt source frame contained across narrow native widths", async ({ page }) => {
  const measurements = [] as Array<{ width: number; height: number; sheetWidth: number; previewWidth: number; itemNamesFit: boolean; sourceActionHeights: number[] }>;
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/?review=1&receipt_source_review=1&viewport=${viewport.width}`);
    const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
    await expect(dialog).toBeVisible();
    const metrics = await dialog.evaluate((element) => {
      const sheet = element.querySelector<HTMLElement>(".sheet-content")?.getBoundingClientRect();
      const preview = element.querySelector<HTMLElement>(".receipt-source-preview")?.getBoundingClientRect();
      const frame = element.querySelector<HTMLElement>(".receipt-source-preview-frame")?.getBoundingClientRect();
      if (!sheet || !preview || !frame) return null;
      const itemNames = Array.from(element.querySelectorAll<HTMLElement>(".receipt-line-copy strong"));
      const sourceActions = Array.from(element.querySelectorAll<HTMLElement>(".receipt-line-source-action-row .receipt-line-source-button"));
      return {
        width: frame.width,
        height: frame.height,
        sheetWidth: sheet.width,
        previewWidth: preview.width,
        itemNamesFit: itemNames.every((name) => name.scrollWidth <= name.clientWidth + 1),
        sourceActionHeights: sourceActions.map((action) => action.getBoundingClientRect().height),
      };
    });
    expect(metrics).toBeTruthy();
    measurements.push(metrics!);
    expect(metrics!.width).toBeGreaterThan(150);
    expect(metrics!.height).toBeLessThanOrEqual(243);
    expect(metrics!.width).toBeLessThanOrEqual(metrics!.sheetWidth - 20);
    expect(metrics!.previewWidth).toBeLessThanOrEqual(metrics!.sheetWidth + 1);
    expect(metrics!.itemNamesFit).toBe(true);
    expect(metrics!.sourceActionHeights).toHaveLength(3);
    expect(metrics!.sourceActionHeights.every((height) => height >= 44)).toBe(true);
  }
  expect(measurements[1].width).toBe(measurements[0].width);
  expect(measurements[1].height).toBeCloseTo(measurements[0].height, 1);
});

test("keeps source review keyboard focus ordered through zoom and line correction", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toHaveAttribute("aria-live", "polite");
  const zoomButton = sourcePreview.getByRole("button", { name: "원본 확대" });
  const spinachSourceButton = sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" });

  const focusByTab = async (locator: Locator) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await locator.evaluate((element) => document.activeElement === element)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error("keyboard focus target was not reached");
  };

  await dialog.getByRole("button", { name: "닫기", exact: true }).focus();
  await focusByTab(zoomButton);
  await expect(zoomButton).toBeFocused();
  await expect.poll(() => zoomButton.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(sourcePreview.getByRole("button", { name: "원본 축소" })).toBeFocused();

  await focusByTab(spinachSourceButton);
  await expect(spinachSourceButton).toBeFocused();
  await expect.poll(() => spinachSourceButton.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(sourcePreview).toContainText("현재 항목 시금치");
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" })).toBeVisible();
});

test("zooms around the active receipt line and keeps taps mapped to its OCR source", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  const frame = sourcePreview.locator(".receipt-source-preview-frame");
  await expect(frame).toHaveAttribute("data-preview-ready", "true");
  const activeMushroom = sourcePreview.locator('.receipt-source-box[data-observation-id="fixture-observation-mushroom"]');
  const mushroomBefore = await activeMushroom.boundingBox();
  expect(mushroomBefore).toBeTruthy();

  await sourcePreview.getByRole("button", { name: "원본 확대" }).click();
  await expect(frame).toHaveAttribute("data-preview-zoomed", "true");
  const zoomed = await sourcePreview.evaluate((element) => {
    const frameBox = element.querySelector<HTMLElement>(".receipt-source-preview-frame")?.getBoundingClientRect();
    const activeBox = element.querySelector<HTMLElement>('.receipt-source-box[data-observation-id="fixture-observation-mushroom"]')?.getBoundingClientRect();
    if (!frameBox || !activeBox) return null;
    return {
      frameBox,
      activeBox,
      centerX: (activeBox.left + activeBox.right) / 2,
      centerY: (activeBox.top + activeBox.bottom) / 2,
    };
  });
  expect(zoomed).toBeTruthy();
  expect(zoomed!.activeBox.width).toBeGreaterThan(mushroomBefore!.width * 2);
  expect(Math.abs(zoomed!.centerX - (zoomed!.frameBox.left + zoomed!.frameBox.width / 2))).toBeLessThan(3);
  expect(Math.abs(zoomed!.centerY - (zoomed!.frameBox.top + zoomed!.frameBox.height / 2))).toBeLessThan(3);

  const spinachSourceBox = sourcePreview.locator('.receipt-source-box[data-observation-id="fixture-observation-spinach"]');
  // Wait out the zoom transition so the tap lands on the settled box.
  let settledTop: number | null = null;
  await expect.poll(async () => {
    const top = (await spinachSourceBox.boundingBox())?.y ?? null;
    const settled = top !== null && top === settledTop;
    settledTop = top;
    return settled;
  }).toBe(true);
  const spinachBounds = await spinachSourceBox.boundingBox();
  expect(spinachBounds).toBeTruthy();
  await page.mouse.click(spinachBounds!.x + spinachBounds!.width / 2, spinachBounds!.y + spinachBounds!.height / 2);
  await expect(sourcePreview).toContainText("현재 항목 시금치");
  await expect(dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]')).toHaveClass(/receipt-line-card-editing/);
});

test("keeps camera permission recovery inside the 320px safe area", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); } },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "카메라로 촬영" }).click();
  const camera = page.getByRole("region", { name: "영수증 카메라 입력" });
  await expect(camera).toHaveAttribute("aria-live", "polite");
  await expect(camera).toHaveAttribute("aria-atomic", "true");
  await expect(camera.getByRole("button", { name: "사진에서 선택" })).toBeVisible();
  await expect(camera.getByRole("button", { name: "입력 방법 다시 보기" })).toBeVisible();

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const recoveryBox = await camera.boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(recoveryBox, "camera recovery region has no bounding box").toBeTruthy();
  expect(recoveryBox!.y).toBeGreaterThanOrEqual(screenBox!.y - 1);
  expect(recoveryBox!.y + recoveryBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("keeps native bottom-sheet keyboard focus contained", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "식품 추가하기" });
  await trigger.click();
  await chooseAddMethod(page, "영수증");
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const assertFocusInside = async () => {
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  };
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    await assertFocusInside();
  }
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await assertFocusInside();
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("keeps the major native sheets inside a 320px viewport", async ({ page }) => {
  const openAndCheck = async (trigger: { name: string | RegExp }, dialogName: string | RegExp) => {
    const triggerButton = page.getByRole("button", trigger);
    await triggerButton.scrollIntoViewIfNeeded();
    await triggerButton.click();
    const dialog = page.getByRole("dialog", { name: dialogName });
    await expect(dialog).toBeVisible();
    await assertDialogFitsNarrowViewport(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  };

  await openAndCheck({ name: /알림 보기/ }, "알림");
  await openAndCheck({ name: /체험 안내 열기/ }, "체험 안내");

  await openFridgeFood(page, "시금치");
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await assertDialogFitsNarrowViewport(page, detail);
});

test("backdrop dismissal returns focus to the sheet trigger", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /알림 보기/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog).toBeVisible();
  await page.getByTestId("sheet-overlay").last().click({ position: { x: 12, y: 12 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("backdrop dismissal from food detail returns to the originating notification row", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: /알림 보기/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notification = notifications.getByRole("button", { name: /시금치 날짜를 살펴봐 주세요/ });
  await notification.click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await page.getByTestId("sheet-overlay").last().click({ position: { x: 12, y: 12 } });
  await expect(detail).toHaveCount(0);
  await expect(notifications).toBeVisible();
  await expect(notification).toBeFocused();
  await expect(notification).toHaveAttribute("data-notification-returned", "true");
});

test("backdrop dismissal from account returns focus to the connection trigger", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const trigger = page.locator(".connection-pill");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "체험 안내" });
  await expect(dialog).toBeVisible();
  await page.getByTestId("sheet-overlay").last().click({ position: { x: 12, y: 12 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("keeps primary actions in bounds after a larger text preference", async ({ page }) => {
  const before = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    return { greeting: read(".greeting-block h1"), priorityHeading: read(".home-section-title") };
  });
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  // Measure with the display font loaded: the fallback face is wider and wraps the hero.
  await page.evaluate(() => document.fonts.ready);
  const after = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    return { greeting: read(".greeting-block h1"), priorityHeading: read(".home-section-title") };
  });

  expect(after.greeting).toBeGreaterThan(before.greeting);
  expect(after.priorityHeading).toBeGreaterThan(before.priorityHeading);

  const metrics = await readNarrowViewportMetrics(page);

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.outOfBounds).toEqual([]);
  // Larger text pushes the meal action further below the fridge panel; it must still scroll fully clear of the nav.
  const mealClear = await scrollClearOfBottomNavigation(page, ".meal-plan-button");
  expect(mealClear.targetBottom).toBeLessThanOrEqual(mealClear.navigationTop);
  const vertical = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return { meal: rect(".meal-plan-button"), add: rect(".app-bottom-nav-add"), nav: rect(".app-bottom-nav"), screen: rect("[data-testid=device-screen]") };
  });
  expect(vertical.meal!.top).toBeGreaterThanOrEqual(vertical.screen!.top);
  // Quick-add lives in the floating nav; larger text must not push it out of the bar or the screen.
  expect(vertical.add!.top).toBeGreaterThanOrEqual(vertical.screen!.top);
  expect(vertical.add!.bottom).toBeLessThanOrEqual(vertical.nav!.bottom);
  expect(vertical.add!.left).toBeGreaterThanOrEqual(vertical.nav!.left);
  expect(vertical.add!.right).toBeLessThanOrEqual(vertical.nav!.right);
});

test("keeps the compact safety guidance reachable after larger text scrolls", async ({ page }) => {
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  // The safety summary sits below the taller fridge panel; scroll it clear of the floating nav.
  await scrollClearOfBottomNavigation(page, ".trust-card");
  const layout = await page.evaluate(() => {
    const trust = document.querySelector<HTMLElement>(".trust-card")!;
    const nav = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    return { trust: trust.getBoundingClientRect().toJSON(), nav: nav.getBoundingClientRect().toJSON() };
  });
  expect(layout.trust.top).toBeGreaterThanOrEqual(0);
  expect(layout.trust.bottom).toBeLessThanOrEqual(layout.nav.top);
});

test("settles sheet motion immediately when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(50);
  const layout = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]")!;
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    return { sheetBottom: sheet.getBoundingClientRect().bottom, screenBottom: screen.getBoundingClientRect().bottom };
  });
  expect(Math.abs(layout.sheetBottom - layout.screenBottom)).toBeLessThanOrEqual(1);
});

test("raises contrast tokens without changing native geometry", async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => window.localStorage.setItem("rescue-meal.theme", nextTheme), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
    // Let the home surface finish its entrance motion before saving the
    // high-contrast screenshots used for visual review.
    await page.waitForTimeout(450);

    const readback = await page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
      const home = document.querySelector<HTMLElement>(".meal-home")!;
      // Quick-add moved into the floating navigation.
      const add = document.querySelector<HTMLElement>(".app-bottom-nav-add")!;
      const mealAction = document.querySelector<HTMLElement>(".meal-plan-button")!;
      const mealActionLabel = mealAction.querySelector<HTMLElement>("strong")!;
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        if (!channels || channels.length !== 3) throw new Error(`Unparseable CSS color: ${color}`);
        const [red, green, blue] = channels.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const foregroundLuminance = luminance(getComputedStyle(mealActionLabel).color);
      const backgroundLuminance = luminance(getComputedStyle(mealAction).backgroundColor);
      return {
        contrast: window.matchMedia("(prefers-contrast: more)").matches,
        mutedColor: getComputedStyle(home).getPropertyValue("--atelier-muted").trim(),
        borderColor: getComputedStyle(home).getPropertyValue("--atelier-border-strong").trim(),
        mealActionContrast: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
        screen: screen.getBoundingClientRect().toJSON(),
        add: add.getBoundingClientRect().toJSON(),
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      };
    });

    expect(readback.contrast).toBeTruthy();
    // Kitchen palette high-contrast tokens (no blue tint); the default muted ink is #5d6d64 / #9cb0a4.
    expect(readback.mutedColor).toBe(theme === "light" ? "#3f4d45" : "#c4d3ca");
    // The legacy border token follows the semantic --line-strong (kitchen.css).
    expect(readback.borderColor).toBe(theme === "light" ? "rgba(22, 34, 27, 0.6)" : "rgba(233, 240, 235, 0.66)");
    expect(readback.mealActionContrast).toBeGreaterThanOrEqual(4.5);
    expect(readback.screen.width).toBeCloseTo(320, 0);
    expect(readback.screen.height).toBeCloseTo(740, 0);
    expect(readback.add.height).toBeGreaterThanOrEqual(43.5);
    expect(readback.documentWidth).toBeLessThanOrEqual(320);
    expect(readback.bodyWidth).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: `../../evidence/mobile-flow-review-2026-09-29/${theme === "light" ? "17" : "18"}-home-320x740-high-contrast-${theme}.png`,
      scale: "css",
    });
  }
  await client.detach();
});

test("scales the major sheet reading hierarchy with a larger text preference", async ({ page }) => {
  await page.getByRole("button", { name: /오늘 뭐 먹지/ }).click();
  const mealDialog = page.getByRole("region", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  const mealBefore = await mealDialog.locator(".recipe-title-row h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const mealAfter = await mealDialog.locator(".recipe-title-row h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(mealAfter).toBeGreaterThan(mealBefore);
  // 식단 is a tab screen, not a dialog: leaving it means choosing another tab.
  await openTab(page, "홈");
  await expect(mealDialog).toBeHidden();

  await page.addStyleTag({ content: "html { font-size: 100%; }" });
  await openFridgeFood(page, "시금치");
  const detailDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(detailDialog).toBeVisible();
  const detailBefore = await detailDialog.locator(".sheet-title").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const detailAfter = await detailDialog.locator(".sheet-title").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(detailAfter).toBeGreaterThan(detailBefore);

  await detailDialog.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);
  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const actionBox = await detailDialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(actionBox, "large-text detail actions have no bounding box").toBeTruthy();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("keeps primary controls at a 44px touch target", async ({ page }) => {
  const assertTarget = async (locator: Locator, label: string) => {
    await expect(locator, label).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${label} has no bounding box`).toBeTruthy();
    expect(box?.width, `${label} width`).toBeGreaterThanOrEqual(43.5);
    expect(box?.height, `${label} height`).toBeGreaterThanOrEqual(43.5);
  };

  await assertTarget(page.locator(".connection-pill"), "connection button");
  await assertTarget(page.getByRole("button", { name: /알림 보기/ }), "notification button");
  await page.locator(".connection-pill").click();
  await waitForSheetSettled(page);
  await assertTarget(page.getByTestId("theme-toggle"), "theme button");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
  await assertTarget(page.getByRole("button", { name: "식품 추가하기" }), "add food button");

  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await chooseAddMethod(page, "영수증");
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(intakeDialog).toBeVisible();
  await assertTarget(intakeDialog.locator(".mode-tab").first(), "intake mode tab");
  await assertTarget(intakeDialog.getByRole("button", { name: "닫기", exact: true }), "sheet close button");
  await page.keyboard.press("Escape");
  await expect(intakeDialog).toHaveCount(0);

  await page.getByRole("button", { name: /오늘 뭐 먹지/ }).click();
  const mealDialog = page.getByRole("region", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  await assertTarget(mealDialog.locator(".recipe-time-picker button").first(), "recipe time choice");
  await assertTarget(mealDialog.locator(".recipe-serving-picker button").first(), "recipe serving choice");
  await expect(mealDialog.locator(".recipe-time-picker button").first()).toHaveCSS("font-size", "12px");
  await expect(mealDialog.locator(".recipe-serving-picker button").first()).toHaveCSS("font-size", "12px");
  await assertTarget(mealDialog.locator(".recipe-actions button").first(), "recipe action");
  await assertTarget(mealDialog.locator(".recipe-history-toggle"), "recipe history toggle");
  await openTab(page, "홈");
  await expect(mealDialog).toBeHidden();

  await openFridgeFood(page, "시금치");
  const detailDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(detailDialog).toBeVisible();
  await assertTarget(detailDialog.locator(".date-proof-card > button"), "date guidance button");
  await detailDialog.getByRole("button", { name: "날짜 안내 보기" }).click();
  const guidanceDialog = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidanceDialog).toBeVisible();
  await guidanceDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(guidanceDialog).toHaveCount(0);
  await expect(detailDialog).toBeVisible();
  await assertTarget(detailDialog.locator(".storage-option").first(), "storage choice");
  await assertTarget(detailDialog.getByRole("button", { name: "상품 정보 수정" }), "product info action");
  await assertTarget(detailDialog.getByRole("button", { name: "1팩의 양 입력" }), "quantity reference action");
  await assertTarget(detailDialog.locator(".toggle"), "opened state toggle");
  await assertTarget(detailDialog.locator(".danger-text-button"), "discard action");
  await page.keyboard.press("Escape");
  await expect(detailDialog).toHaveCount(0);

  await page.getByRole("button", { name: /알림 보기/ }).click();
  const notificationDialog = page.getByRole("dialog", { name: "알림" });
  await expect(notificationDialog).toBeVisible();
  await assertTarget(notificationDialog.locator(".notification-read-all"), "mark all read button");
});

test("keeps the demo guidance primary action above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await page.getByRole("button", { name: /체험 안내 열기/ }).click();
  const dialog = page.getByRole("dialog", { name: "체험 안내" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const loginBox = await dialog.locator(".account-demo-explainer .primary-sheet-button").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(loginBox, "demo guidance action has no bounding box").toBeTruthy();
  expect(loginBox!.y + loginBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(loginBox!.height).toBeGreaterThanOrEqual(43.5);
});

test("places detail primary actions directly after safety guidance", async ({ page }) => {
  await openFridgeFood(page, "시금치");
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".detail-actions")).toBeVisible();
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toContainText("먹은 기록 남기기");
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toHaveAttribute("aria-label", "날짜와 보관 방법을 살펴본 뒤 먹은 기록 남기기");
  const dateWarningCopy = dialog.locator(".date-review-callout-compact > span:nth-child(2) > small");
  await expect(dateWarningCopy).toHaveText(/표시 날짜가 (?:오늘이에요|어제 지났어요|\d+일 지났어요|오늘이거나 지났어요)\. 보관 방법과 개봉 상태도 확인해 주세요\./);
  const dateWarningCopyLayout = await dateWarningCopy.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(dateWarningCopyLayout.height).toBeLessThanOrEqual(dateWarningCopyLayout.lineHeight * 2 + 1);
  await expect(dialog.locator(".product-info-edit-button small")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "상품 정보 수정" })).toBeVisible();
  await expect(dialog.locator(".detail-save-hint")).toHaveCount(0);
  const reviewActionLayout = await dialog.locator(".detail-actions .secondary-sheet-button").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { height: rect.height, lineHeight: Number.parseFloat(style.lineHeight) };
  });
  expect(reviewActionLayout.height).toBeLessThanOrEqual(Math.ceil(reviewActionLayout.lineHeight * 2 + 18));
  // The visible "먹은 기록 안내" block is now a screen-reader description tied to the consume action.
  await expect(dialog.locator(".detail-actions-review-copy")).toHaveCount(0);
  const safetyHint = dialog.locator("#consume-safety-hint");
  await expect(safetyHint).toHaveText("이미 먹은 경우에만 기록해 주세요.");
  await expect(safetyHint).toHaveClass(/sr-only/);
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toHaveAttribute("aria-describedby", "consume-safety-hint");
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toHaveAccessibleDescription("이미 먹은 경우에만 기록해 주세요.");
  const followsSafetyGuidance = await dialog.locator(".date-review-callout").evaluate((node) => {
    const actions = node.parentElement?.querySelector(".detail-actions");
    return Boolean(actions && (node.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(followsSafetyGuidance).toBe(true);
});

test("keeps date guidance in context when opening a review-required priority card", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await openFridgeFood(page, "시금치");
  const dialog = page.getByRole("dialog", { name: "시금치" });
  const dateReviewAction = dialog.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  const dateReviewHeading = dialog.locator(".date-review-callout > span:nth-child(2) > strong");
  const dateReviewCopy = dialog.locator(".date-review-callout > span:nth-child(2) > small");

  await expect(dateReviewHeading).toHaveText("조리 전 확인이 필요해요");
  await expect(dateReviewCopy).toHaveText(/표시 날짜가 (?:오늘이에요|어제 지났어요|\d+일 지났어요|오늘이거나 지났어요)\. 보관 방법과 개봉 상태도 확인해 주세요\./);
  await expect(dateReviewHeading).toHaveCSS("font-size", "12px");
  await expect(dateReviewCopy).toHaveCSS("font-size", "12px");
  await expect(dialog.locator(".date-edit-button-compact > span")).toHaveCSS("font-size", "12px");
  const dateReviewLayout = await dialog.locator(".date-review-callout").evaluate((element) => {
    const copy = element.querySelector<HTMLElement>(":scope > span:nth-child(2) > small");
    const action = element.querySelector<HTMLElement>(".date-edit-button-compact");
    if (!copy || !action) return null;
    const copyBox = copy.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return { copyBottom: copyBox.bottom, actionTop: actionBox.top, actionWidth: actionBox.width, actionHeight: actionBox.height };
  });
  expect(dateReviewLayout).toBeTruthy();
  expect(dateReviewLayout!.actionTop).toBeGreaterThanOrEqual(dateReviewLayout!.copyBottom);
  expect(dateReviewLayout!.actionWidth).toBeGreaterThan(180);
  expect(dateReviewLayout!.actionHeight).toBeGreaterThanOrEqual(44);
  await expect(dateReviewAction).toHaveText("날짜 다시 확인");
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
});

test("date warning and recheck action keep readable contrast in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((nextTheme) => window.localStorage.setItem("rescue-meal.theme", nextTheme), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    await openFridgeFood(page, "시금치");

    const dialog = page.getByRole("dialog", { name: "시금치" });
    const callout = dialog.locator(".date-review-callout-compact");
    await expect(callout).toBeVisible();
    const contrast = await callout.evaluate((element) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Canvas context is unavailable");
      context.canvas.width = 1;
      context.canvas.height = 1;
      const paint = (color: string) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
      };
      const samplePixel = () => Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
      const luminance = (channels: number[]) => {
        const normalized = channels.map((channel) => channel / 255);
        const linear = normalized.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
      };
      const measure = (target: Element | null) => {
        if (!(target instanceof HTMLElement)) throw new Error("Date review text is unavailable");
        const ancestors: HTMLElement[] = [];
        for (let current: HTMLElement | null = target; current; current = current.parentElement) ancestors.push(current);
        context.clearRect(0, 0, 1, 1);
        for (const ancestor of ancestors.reverse()) paint(getComputedStyle(ancestor).backgroundColor);
        const background = samplePixel();
        context.clearRect(0, 0, 1, 1);
        paint(getComputedStyle(target).color);
        const foreground = samplePixel();
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = luminance(background);
        return {
          foreground: getComputedStyle(target).color,
          foregroundPixel: foreground,
          background,
          ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
            / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
        };
      };
      return {
        heading: measure(element.querySelector(":scope > span:nth-child(2) > strong")),
        copy: measure(element.querySelector(":scope > span:nth-child(2) > small")),
        action: measure(element.querySelector(".date-edit-button-compact > span")),
      };
    });

    expect(contrast.heading.ratio, theme + " warning heading " + JSON.stringify(contrast.heading)).toBeGreaterThanOrEqual(4.5);
    expect(contrast.copy.ratio, theme + " warning copy " + JSON.stringify(contrast.copy)).toBeGreaterThanOrEqual(4.5);
    expect(contrast.action.ratio, theme + " recheck action " + JSON.stringify(contrast.action)).toBeGreaterThanOrEqual(4.5);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
});

test("date recheck active tab uses the selected theme ink and a full touch target", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((nextTheme) => window.localStorage.setItem("rescue-meal.theme", nextTheme), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    await openFridgeFood(page, "시금치");

    const detail = page.getByRole("dialog", { name: "시금치" });
    await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
    const dateReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
    await expect(dateReview).toBeVisible();
    await waitForSheetSettled(page);
    const activeLabelTab = dateReview.getByRole("tab", { name: "라벨" });

    await expect(activeLabelTab).toHaveAttribute("aria-selected", "true");
    await expect(activeLabelTab).toHaveCSS("color", theme === "light" ? "rgb(22, 34, 27)" : "rgb(233, 240, 235)"); // kitchen --fresh-ink
    expect((await activeLabelTab.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(activeLabelTab).toHaveAccessibleName("라벨, 추천");
    await expect(activeLabelTab.locator("span[aria-hidden='true']")).toHaveText("추천");
    await expect(activeLabelTab.locator("span[aria-hidden='true']")).toHaveCSS("font-size", "10px");
    await expect(dateReview.getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();
    const imageGuidance = dateReview.locator(".input-flow > p").first();
    await expect(imageGuidance).toHaveText("사진은 식품 기록에 저장하지 않아요.");
    await expect(imageGuidance).toHaveCSS("font-size", "12px");
    const imageGuidanceColors = await imageGuidance.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest<HTMLElement>(".bottom-sheet")!).backgroundColor,
    }));
    expect(contrastRatio(imageGuidanceColors.foreground, imageGuidanceColors.background)).toBeGreaterThanOrEqual(4.5);
    await expect(dateReview.locator(".intake-flow-rail")).toHaveAttribute("aria-label", "날짜 확인 1단계");
    await expect(dateReview.locator(".intake-flow-rail-heading")).toHaveCount(0);
    await expect(dateReview.locator('.intake-flow-rail li[aria-current="step"]')).toContainText("1입력");

    if (theme === "dark") {
      await page.screenshot({ path: "../../evidence/mobile-date-recheck-stepper-dark-2026-09-30.png", scale: "css" });
    }

    await dateReview.getByRole("button", { name: "닫기", exact: true }).click();
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
  }
});

test("opens a use-next priority card on the detail summary without moving focus to a record action", async ({ page }) => {
  await openTab(page, "냉장고");
  await page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).first().click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });

  // Only an explicit action route moves focus away from the summary (Prototype.openDetail).
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "먹었어요", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
});

test("keeps primary and destructive detail actions above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await openFridgeFood(page, "시금치");
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const stateSummaryBox = await dialog.getByRole("group", { name: "보관 및 개봉 상태" }).boundingBox();
  const toggleBox = await dialog.locator(".toggle").boundingBox();
  const actionBox = await dialog.locator(".detail-actions").boundingBox();
  const discardBox = await dialog.locator(".danger-text-button").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(stateSummaryBox, "food detail state summary has no bounding box").toBeTruthy();
  expect(toggleBox, "food detail state control has no bounding box").toBeTruthy();
  expect(actionBox, "food detail primary actions have no bounding box").toBeTruthy();
  expect(discardBox, "food detail discard action has no bounding box").toBeTruthy();
  expect(stateSummaryBox!.y + stateSummaryBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(43.5);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(discardBox!.height).toBeGreaterThanOrEqual(43.5);

  // Quantity controls now sit above the discard action: it must clear the indicator after a scroll.
  const content = dialog.locator(".sheet-content");
  // The shorter detail copy can leave the discard action resting inside the indicator zone before any scroll,
  // where scrollIntoViewIfNeeded is a no-op; scrolling the sheet to its end must lift it clear.
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => {
    const scrolledDiscardBox = await dialog.locator(".danger-text-button").boundingBox();
    return scrolledDiscardBox!.y + scrolledDiscardBox!.height;
  }).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const openedToggle = dialog.locator(".opened-row .toggle");
  await expect.poll(async () => {
    const bounds = await openedToggle.boundingBox();
    return Boolean(bounds && screenBox && bounds.y >= screenBox.y - 1
      && bounds.y + bounds.height <= screenBox.y + screenBox.height - 34);
  }).toBe(true);
});

test("keeps food detail primary actions above the safe area at 320px", async ({ page }) => {
  await openFridgeFood(page, "시금치");
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const stateSummaryBox = await dialog.getByRole("group", { name: "보관 및 개봉 상태" }).boundingBox();
  const initialActionBox = await dialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(stateSummaryBox, "food detail state summary has no bounding box").toBeTruthy();
  expect(initialActionBox, "initial food detail primary actions have no bounding box").toBeTruthy();
  expect(stateSummaryBox!.y).toBeGreaterThanOrEqual(screenBox!.y);
  expect(stateSummaryBox!.y + stateSummaryBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height);
  // At 320px the first viewport fits the primary action on screen; the safe-area margin is reached by scrolling below.
  expect(initialActionBox!.y + initialActionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height);

  const content = dialog.locator(".sheet-content");
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);

  const actionBox = await dialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(actionBox, "food detail primary actions have no bounding box").toBeTruthy();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
});

test("phone-shell width keeps the date recheck action below its copy in a wide simulator window", async ({ page }) => {
  await page.setViewportSize({ width: 639, height: 858 });
  await page.goto("/");

  const viewportMetrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    phoneWidth: document.querySelector<HTMLElement>(".app-screen")?.getBoundingClientRect().width ?? 0,
  }));
  expect(viewportMetrics.viewportWidth).toBe(639);
  expect(viewportMetrics.phoneWidth).toBeLessThanOrEqual(420);

  await openFridgeFood(page, "시금치");
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await waitForSheetSettled(page);
  const callout = dialog.locator(".date-review-callout-compact");
  await expect(callout).toBeVisible();

  const layout = await callout.evaluate((element) => {
    const copy = element.querySelector<HTMLElement>(":scope > span:nth-child(2) > small");
    const action = element.querySelector<HTMLElement>(":scope > .date-edit-button-compact");
    if (!copy || !action) return null;
    const copyBox = copy.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return { copyBottom: copyBox.bottom, actionTop: actionBox.top, actionWidth: actionBox.width, actionHeight: actionBox.height };
  });
  expect(layout).toBeTruthy();
  expect(layout!.actionTop).toBeGreaterThanOrEqual(layout!.copyBottom);
  expect(layout!.actionWidth).toBeGreaterThan(180);
  expect(layout!.actionHeight).toBeGreaterThanOrEqual(44);
});
