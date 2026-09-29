import { expect, test, type Locator, type Page } from "@playwright/test";
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
    const outOfBounds = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select, [role=button]"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.left < -1 || rect.right > viewportWidth + 1);
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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
});

test("keeps the native home inside a 320px viewport", async ({ page }) => {
  const metrics = await readNarrowViewportMetrics(page);

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.containers.every((container) => container.scrollWidth <= container.clientWidth + 1)).toBeTruthy();
  expect(metrics.outOfBounds).toEqual([]);
  const compactMetadataFontSizes = await page.locator(".food-subline, .food-meta-line, .date-source").evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
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
  const compactAddLabel = await page.locator(".home-action-row-with-add .add-food-button strong").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) };
  });
  expect(compactAddLabel.height).toBeLessThanOrEqual(compactAddLabel.fontSize * 1.5);
  await expect(page.getByRole("button", { name: "식품 추가하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "오늘 식단 만들기" })).toBeVisible();
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
      if (theme === "dark") await page.getByTestId("theme-toggle").click();
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      const priorityActionReadback = await page.locator(".priority-card .priority-state-label").evaluateAll((elements) =>
        elements.map((element) => {
          const label = element as HTMLElement;
          const column = label.parentElement as HTMLElement;
          const bounds = label.getBoundingClientRect();
          const columnBounds = column.getBoundingClientRect();
          return {
            text: label.textContent?.trim() ?? "",
            clipped: label.scrollWidth > label.clientWidth,
            withinColumn: bounds.left >= columnBounds.left - 0.5 && bounds.right <= columnBounds.right + 0.5,
          };
        }),
      );

      expect(priorityActionReadback).toHaveLength(3);
      for (const action of priorityActionReadback) {
        expect(action.text).not.toBe("");
        expect(action.clipped, `${action.text} action label clips at ${viewport.width}px in ${theme} mode`).toBe(false);
        expect(action.withinColumn, `${action.text} action label escapes its date column`).toBe(true);
      }

      const sourceDetails = page.locator(
        ".priority-card .food-subline, .priority-card .date-source:not(.date-source-warning), .priority-card .priority-date strong",
      );
      const readback = await sourceDetails.evaluateAll((elements) => {
        const background = getComputedStyle(document.querySelector<HTMLElement>(".app-screen")!).backgroundColor;
        return elements.map((element) => ({
          text: element.textContent?.trim() ?? "",
          fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
          color: getComputedStyle(element).color,
          background,
        }));
      });

      expect(readback).toHaveLength(9);
      for (const detail of readback) {
        expect(detail.text).not.toBe("");
        expect(detail.fontSize).toBeGreaterThanOrEqual(11);
        expect(contrastRatio(detail.color, detail.background)).toBeGreaterThanOrEqual(theme === "light" ? 5.5 : 4.5);
      }
      await expect(page.getByRole("button", { name: "오늘 식단 만들기" })).toBeVisible();
    }
  }
});

test("keeps the narrow home review summary concise and shopping shortcut tappable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const summary = page.locator(".trust-card");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("포장지 날짜를 살펴볼 식품 2개");
  await expect(summary).toHaveAccessibleName("포장지 날짜를 살펴볼 식품 2개. 포장지 날짜와 보관 방법을 살펴봐 주세요. 확인할 식품 목록 보기");
  expect((await summary.boundingBox())?.height).toBeLessThanOrEqual(60);

  const priorityHeading = page.locator(".priority-section .section-heading h2");
  await expect(priorityHeading).toContainText("먼저 살펴볼 식품");

  const [reviewShortcut, navigation, mealAction, shoppingSummary] = await Promise.all([
    page.locator(".trust-card").boundingBox(),
    page.locator(".app-bottom-nav").boundingBox(),
    page.locator(".meal-plan-button").boundingBox(),
    page.locator(".shopping-summary-card").boundingBox(),
  ]);
  const priorityRowHeights = await page.locator(".priority-card").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(reviewShortcut?.height).toBeGreaterThanOrEqual(44);
  expect((reviewShortcut?.y ?? Number.POSITIVE_INFINITY) + (reviewShortcut?.height ?? 0)).toBeLessThanOrEqual((navigation?.y ?? 0) + 1);
  expect((mealAction?.y ?? Number.POSITIVE_INFINITY) + (mealAction?.height ?? 0)).toBeLessThanOrEqual((navigation?.y ?? 0) + 1);
  expect(priorityRowHeights).toHaveLength(3);
  expect(Math.min(...priorityRowHeights)).toBeGreaterThanOrEqual(44);
  expect(shoppingSummary?.height).toBeGreaterThanOrEqual(44);
  expect((shoppingSummary?.y ?? Number.POSITIVE_INFINITY) + (shoppingSummary?.height ?? 0)).toBeLessThanOrEqual((navigation?.y ?? 0) + 1);
  await expect(page.locator(".shopping-summary-card")).toBeInViewport();
  await expect(page.locator(".shopping-summary-card")).toHaveAccessibleName("장보기 목록 열기. 아직 담은 재료가 없어요");
  await expect(page.locator(".shopping-summary-card")).toHaveAccessibleDescription("식단에서 재료를 담거나 직접 추가해 보세요.");
  await expect(page.locator(".shopping-summary-empty-help")).toBeVisible();
  await expect(page.locator(".shopping-summary-empty-help")).toHaveText("식단에서 재료를 담거나 직접 추가해 보세요.");
  await expect(page.locator(".install-prompt")).not.toBeInViewport();
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
      if (theme === "dark") await page.getByTestId("theme-toggle").click();
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      const card = page.locator(".shopping-summary-card-empty");
      const helper = card.locator(".shopping-summary-empty-help");
      await expect(card).toBeVisible();
      await expect(card.locator("strong")).toHaveText("아직 담은 재료가 없어요");
      await expect(card).toHaveAccessibleName("장보기 목록 열기. 아직 담은 재료가 없어요");
      await expect(card).toHaveAccessibleDescription("식단에서 재료를 담거나 직접 추가해 보세요.");
      await expect(helper).toBeVisible();
      await expect(helper).toHaveText("식단에서 재료를 담거나 직접 추가해 보세요.");
      await expect(helper).toHaveCSS("font-size", "11px");

      const layout = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>(".shopping-summary-card-empty");
        const helper = card?.querySelector<HTMLElement>(".shopping-summary-empty-help");
        const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
        const mealAction = document.querySelector<HTMLElement>(".meal-plan-button");
        if (!card || !helper || !navigation || !mealAction) return null;
        return {
          cardBottom: card.getBoundingClientRect().bottom,
          helperHeight: helper.getBoundingClientRect().height,
          helperWidth: helper.getBoundingClientRect().width,
          helperColor: getComputedStyle(helper).color,
          cardBackground: getComputedStyle(document.querySelector<HTMLElement>(".app-screen")!).backgroundColor,
          navigationTop: navigation.getBoundingClientRect().top,
          mealActionBottom: mealAction.getBoundingClientRect().bottom,
          documentWidth: document.documentElement.scrollWidth,
        };
      });

      expect(layout).toBeTruthy();
      expect(layout!.helperWidth).toBeGreaterThan(1);
      expect(layout!.helperHeight).toBeGreaterThanOrEqual(14);
      expect(layout!.helperHeight).toBeLessThanOrEqual(17);
      expect(layout!.cardBottom).toBeLessThanOrEqual(layout!.navigationTop + 1);
      expect(layout!.mealActionBottom).toBeLessThanOrEqual(layout!.navigationTop + 1);
      expect(layout!.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(contrastRatio(layout!.helperColor, layout!.cardBackground)).toBeGreaterThanOrEqual(theme === "light" ? 5.5 : 4.5);
    }
  }
});

test("extends the home navigation surface through the safe-area tail in both themes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"] as const) {
      await page.goto("/");
      if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
        await page.getByTestId("theme-toggle").click();
      }
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      const nav = page.locator(".app-bottom-nav");
      const layout = await nav.evaluate((element) => {
        const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
        if (!screen) throw new Error("Native device screen is unavailable");
        const navBox = element.getBoundingClientRect();
        const screenBox = screen.getBoundingClientRect();
        const fill = getComputedStyle(element, "::after");
        return {
          navBottom: navBox.bottom,
          screenBottom: screenBox.bottom,
          safeAreaHeight: Number.parseFloat(getComputedStyle(screen).getPropertyValue("--device-safe-area-bottom")),
          fillHeight: Number.parseFloat(fill.height),
          fillDisplay: fill.display,
          fillColor: fill.backgroundColor,
          navColor: getComputedStyle(element).backgroundColor,
          itemHeights: Array.from(element.querySelectorAll<HTMLElement>(".app-bottom-nav-item"))
            .map((item) => item.getBoundingClientRect().height),
        };
      });

      expect(layout.fillDisplay).not.toBe("none");
      expect(layout.fillHeight).toBeCloseTo(layout.safeAreaHeight, 0);
      expect(layout.navBottom + layout.fillHeight).toBeGreaterThanOrEqual(layout.screenBottom - 1);
      expect(layout.fillColor).toBe(layout.navColor);
      expect(layout.itemHeights.every((height) => height >= 44)).toBe(true);
    }
  }
});

test("keeps meal time and serving choices readable on narrow phones", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".meal-plan-button").click();

    const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
    const choices = dialog.locator(".recipe-time-picker button, .recipe-serving-picker button");
    await expect(choices).toHaveCount(8);
    for (const choice of await choices.all()) {
      await expect(choice).toHaveCSS("font-size", "11px");
      const box = await choice.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(43.5);
      expect(box?.height).toBeGreaterThanOrEqual(43.5);
    }

    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("keeps cooking steps and safety instructions readable on mobile in both themes", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"] as const) {
      await page.goto("/");
      if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
        await page.getByTestId("theme-toggle").click();
      }
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

      await page.locator(".meal-plan-button").click();
      const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
      const instructionsToggle = dialog.getByRole("button", { name: "조리 방법 보기" });
      await expect(instructionsToggle).toHaveAttribute("aria-expanded", "false");
      await instructionsToggle.click();

      const steps = dialog.locator(".recipe-details li");
      await expect(steps).toHaveCount(3);
      for (const step of await steps.all()) await expect(step).toHaveCSS("font-size", "12px");
      await expect(dialog.locator(".recipe-details-heading span")).toHaveCSS("font-size", "12px");
      await expect(dialog.locator(".recipe-details-heading small")).toHaveCSS("font-size", "11px");
      await expect(dialog.locator(".recipe-safety strong")).toHaveCSS("font-size", "12px");
      await expect(dialog.locator(".recipe-safety small")).toHaveCSS("font-size", "12px");
      const stepColors = await steps.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { foreground: style.color, background: style.backgroundColor };
      });
      expect(contrastRatio(stepColors.foreground, stepColors.background)).toBeGreaterThanOrEqual(4.5);
      const safetyColors = await dialog.locator(".recipe-safety small").evaluate((element) => {
        const parent = element.closest<HTMLElement>(".recipe-safety");
        if (!parent) throw new Error("Recipe safety panel is unavailable");
        return { foreground: getComputedStyle(element).color, background: getComputedStyle(parent).backgroundColor };
      });
      expect(contrastRatio(safetyColors.foreground, safetyColors.background)).toBeGreaterThanOrEqual(4.5);
      await expect(dialog.locator(".recipe-complete-button")).toHaveCount(0);
      const collapseInstructions = dialog.getByRole("button", { name: "조리 방법 접기" });
      await expect(collapseInstructions).toHaveAttribute("aria-expanded", "true");
      await expect(collapseInstructions).toHaveCSS("min-height", "44px");
      await collapseInstructions.click();
      await expect(dialog.locator(".recipe-details")).toHaveCount(0);

      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    }
  }
});

test("offers a direct recipe-step shortcut after the safety review details", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (await page.locator("html").getAttribute("data-rescue-theme") !== "dark") {
      await page.getByTestId("theme-toggle").click();
    }

    await page.locator(".meal-plan-button").click();
    const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);
    await dialog.getByRole("button", { name: "날짜와 알레르기 안내 보기" }).click();

    const safetySummary = dialog.locator(".recipe-safety-summary");
    const shortcut = dialog.getByRole("button", { name: "조리 순서 바로 보기" });
    await expect(safetySummary).toBeVisible();
    await expect(shortcut).toHaveCount(1);
    await expect(dialog.locator(".recipe-safety-summary-heading")).toBeInViewport();
    await expect(shortcut).toBeInViewport();
    await expect(shortcut).toHaveCSS("min-height", "44px");
    const shortcutReachable = await shortcut.evaluate((element) => {
      const content = element.closest<HTMLElement>(".sheet-content");
      if (!content) return false;
      const contentBox = content.getBoundingClientRect();
      const actionBox = element.getBoundingClientRect();
      return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
    });
    expect(shortcutReachable).toBe(true);
    const readingOrder = await dialog.evaluate((element) => {
      const summary = element.querySelector(".recipe-safety-summary");
      const instructionShortcut = element.querySelector(".recipe-instructions-shortcut");
      const ingredients = element.querySelector(".recipe-ingredients");
      return Boolean(summary && instructionShortcut && ingredients
        && (summary.compareDocumentPosition(instructionShortcut) & Node.DOCUMENT_POSITION_FOLLOWING)
        && (instructionShortcut.compareDocumentPosition(ingredients) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(readingOrder).toBe(true);

    await shortcut.click();
    await expect(dialog.locator(".recipe-details")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "조리 방법 접기" })).toBeFocused();
    await expect(dialog.locator(".saved-recipe")).toHaveCount(0);
    await expect(dialog.locator(".recipe-complete-button")).toHaveCount(0);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
});

test("explains empty recent history and exposes it as a disclosure in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    if (await page.locator("html").getAttribute("data-rescue-theme") !== theme) {
      await page.getByTestId("theme-toggle").click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    await page.locator(".meal-plan-button").click();
    const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);

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
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
});

test("returns to the same meal-plan position and open instructions after checking a food", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  if (await page.locator("html").getAttribute("data-rescue-theme") !== "dark") {
    await page.getByTestId("theme-toggle").click();
  }

  await page.locator(".meal-plan-button").click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const instructionsToggle = dialog.getByRole("button", { name: "조리 방법 보기" });
  await instructionsToggle.scrollIntoViewIfNeeded();
  await instructionsToggle.click();
  const returnAction = dialog.getByRole("button", { name: "식품 보기 · 시금치" });
  const before = await dialog.locator(".meal-sheet-content").evaluate((element) => {
    const scroller = element.closest<HTMLElement>(".sheet-content");
    const toggle = element.querySelector<HTMLElement>(".recipe-instructions-toggle");
    if (!scroller || !toggle) return null;
    scroller.scrollTop = Math.min(400, scroller.scrollHeight - scroller.clientHeight);
    const action = element.querySelector<HTMLElement>("button[data-meal-food-id]");
    return {
      scrollTop: scroller.scrollTop,
      instructionsExpanded: toggle.getAttribute("aria-expanded"),
      actionInViewport: action ? action.getBoundingClientRect().top >= 0 && action.getBoundingClientRect().bottom <= window.innerHeight : false,
    };
  });
  expect(before).toBeTruthy();
  expect(before!.scrollTop).toBe(400);
  expect(before!.instructionsExpanded).toBe("true");
  expect(before!.actionInViewport).toBe(true);

  await returnAction.click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(returnAction).toBeFocused();
  await expect(dialog.locator(".recipe-details")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 방법 접기" })).toHaveAttribute("aria-expanded", "true");
  const after = await dialog.locator(".meal-sheet-content").evaluate((element) => {
    const scroller = element.closest<HTMLElement>(".sheet-content");
    const action = element.querySelector<HTMLElement>("button[data-meal-food-id]");
    return {
      scrollTop: scroller?.scrollTop ?? null,
      actionFocused: action === document.activeElement,
      instructionsExpanded: element.querySelector(".recipe-instructions-toggle")?.getAttribute("aria-expanded"),
    };
  });
  expect(after.scrollTop).toBe(before!.scrollTop);
  expect(after.actionFocused).toBe(true);
  expect(after.instructionsExpanded).toBe("true");
  await expect(dialog.locator(".saved-recipe")).toHaveCount(0);
  await expect(dialog.locator(".recipe-complete-button")).toHaveCount(0);
});

test("keeps the primary home CTA and review notice above navigation on short native screens", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        navigation: rect(".app-bottom-nav"),
        reviewNotice: rect(".trust-card"),
        cta: rect(".meal-plan-button"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.reviewNotice).toBeTruthy();
    expect(layout.cta).toBeTruthy();
    expect(layout.cta!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.reviewNotice!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.cta!.height).toBeGreaterThanOrEqual(49);
  }
});

test("keeps priority foods before their meal action on mobile", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        cta: rect(".home-action-row"),
        heading: rect(".priority-section > .section-heading"),
        queue: rect(".priority-section > .priority-list"),
      };
    });

    expect(layout.cta).toBeTruthy();
    expect(layout.heading).toBeTruthy();
    expect(layout.queue).toBeTruthy();
    expect(layout.heading!.bottom).toBeLessThanOrEqual(layout.queue!.top + 1);
    expect(layout.queue!.bottom).toBeLessThanOrEqual(layout.cta!.top + 1);
  }
});

test("keeps the primary meal CTA discoverable in the 390px first viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return {
      screen: rect("[data-testid=device-screen]"),
      cta: rect(".meal-plan-button"),
      navigation: rect(".app-bottom-nav"),
    };
  });

  expect(layout.screen).toBeTruthy();
  expect(layout.cta).toBeTruthy();
  expect(layout.navigation).toBeTruthy();
  expect(layout.cta!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
  expect(layout.cta!.bottom).toBeLessThanOrEqual(layout.navigation!.top - 1);
  expect(layout.cta!.height).toBeGreaterThanOrEqual(49);
});

test("uses tall-phone fold space for pantry entry while keeping food rows below the fold", async ({ page }) => {
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
        shoppingSummary: rect(".shopping-summary-card"),
        inventory: rect(".inventory-section"),
        heading: rect(".inventory-heading"),
        search: rect(".inventory-search"),
        firstFoodImage: rect(".inventory-row .inventory-image-wrap"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.shoppingSummary).toBeTruthy();
    expect(layout.inventory).toBeTruthy();
    expect(layout.heading).toBeTruthy();
    expect(layout.search).toBeTruthy();
    expect(layout.firstFoodImage).toBeTruthy();
    expect(layout.shoppingSummary!.bottom).toBeLessThan(layout.navigation!.top);
    expect(layout.inventory!.top - layout.shoppingSummary!.bottom).toBeLessThan(190);

    if (viewport.width <= 360) {
      expect(layout.inventory!.top).toBeGreaterThanOrEqual(layout.screen!.bottom - 1);
    } else {
      expect(layout.heading!.top).toBeGreaterThan(layout.shoppingSummary!.bottom);
      expect(layout.heading!.bottom).toBeLessThanOrEqual(layout.navigation!.top);
      expect(layout.search!.bottom).toBeLessThanOrEqual(layout.navigation!.top);
      expect(layout.firstFoodImage!.top).toBeGreaterThanOrEqual(layout.screen!.bottom - 1);
    }
  }
});

test("keeps notification in the header on regular phones and reachable below it on narrow phones", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        header: rect(".app-header"),
        notification: rect(".mobile-hero-notification"),
        heroHeading: rect(".greeting-block h1"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.header).toBeTruthy();
    expect(layout.notification).toBeTruthy();
    expect(layout.heroHeading).toBeTruthy();
    expect(layout.notification!.width).toBeGreaterThanOrEqual(43.5);
    expect(layout.notification!.height).toBeGreaterThanOrEqual(43.5);
    expect(layout.notification!.right).toBeLessThanOrEqual(layout.screen!.right + 1);
    expect(layout.notification!.left).toBeGreaterThanOrEqual(layout.screen!.left - 1);

    if (viewport.width >= 393) {
      expect(layout.notification!.top).toBeGreaterThanOrEqual(layout.header!.top - 1);
      // The visual header is compact, while the 44px hit box may extend a
      // small amount below it to preserve the touch-target baseline.
      expect(layout.notification!.bottom).toBeLessThanOrEqual(layout.header!.bottom + 12);
    } else {
      expect(layout.notification!.top).toBeGreaterThanOrEqual(layout.header!.bottom - 1);
      expect(layout.notification!.left).toBeGreaterThanOrEqual(layout.heroHeading!.right + 8);
    }
  }
});

test("shows the meal result inside the first native sheet viewport", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "오늘 식단 만들기" }).click();
    const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);
    await expect(dialog.locator(".recipe-art")).toBeVisible();
    await expect(dialog.locator(".recipe-title-row")).toBeVisible();
    // Planner actions stay in document flow so they cannot cover the safety
    // summary on short mobile screens. Food detail actions remain sticky.
    await expect(dialog.locator(".recipe-actions")).toHaveCSS("position", "static");
    const safetyEntry = dialog.getByRole("button", { name: "사용 전 확인 2건 보기" });
    const dateReviewAction = dialog.getByRole("button", { name: "식품 확인 · 시금치" });
    await expect(safetyEntry).toBeFocused();
    await safetyEntry.click();
    await expect(dateReviewAction).toBeFocused();

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        sheet: rect("[data-testid=bottom-sheet]"),
        art: rect(".recipe-art"),
        title: rect(".recipe-title-row"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.sheet).toBeTruthy();
    expect(layout.art).toBeTruthy();
    expect(layout.title).toBeTruthy();
    expect(layout.sheet!.height / layout.screen!.height).toBeGreaterThanOrEqual(0.85);
    expect(layout.art!.top).toBeGreaterThanOrEqual(layout.sheet!.top - 1);
    expect(layout.title!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.title!.top).toBeLessThanOrEqual(layout.art!.top + 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("keeps the account login action in the first native sheet viewport", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /계정 열기/ }).click();
    const dialog = page.getByRole("dialog", { name: "내 계정" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const content = document.querySelector<HTMLElement>(".sheet-content");
      return {
        screen: rect("[data-testid=device-screen]"),
        sheet: rect("[data-testid=bottom-sheet]"),
        action: rect("#account-panel-login .primary-sheet-button"),
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
  await page.getByRole("button", { name: "오늘 식단 만들기" }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();

  await dialog.getByRole("button", { name: "미리보기 저장" }).click();
  await expect(dialog.getByRole("button", { name: "미리보기 저장됨" })).toBeVisible();
  await expect(dialog.locator(".saved-recipe")).toHaveAttribute("data-readback-state", "confirmed");
  await expect(dialog.locator(".saved-recipe")).toHaveAttribute("role", "status");
  await expect(dialog.locator(".saved-recipe")).toHaveAttribute("aria-live", "polite");
  const completion = dialog.locator(".recipe-complete-actions");
  await expect(completion).toBeVisible();
  const saveFeedbackLayout = await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".toast")?.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>(".recipe-complete-actions")?.getBoundingClientRect();
    return {
      overlap: toast && actions ? Math.max(0, Math.min(toast.bottom, actions.bottom) - Math.max(toast.top, actions.top)) : null,
    };
  });
  expect(saveFeedbackLayout.overlap).toBe(0);
  await expect(dialog.getByRole("button", { name: "조리 전 확인했어요" })).toBeFocused();
  await expect.poll(() => completion.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const actionBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await expect(dialog.getByRole("button", { name: /조리 전 확인 후 기록|조리 완료로 기록/ })).toBeVisible();
  await dialog.getByRole("button", { name: "조리 전 확인했어요" }).click();
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".toast-action")).toHaveText("다음 식품 살펴보기");
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
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
  await page.locator(".toast-action").click();
  await expect(page.locator(".priority-card").first()).toBeFocused();
});

test("keeps detail review and storage cues across light and dark themes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    if (theme === "dark") await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    await expect(page.locator(".priority-card").filter({ hasText: "시금치" }).locator(".priority-state-review")).toHaveText("확인 필요");
    await expect(page.locator(".inventory-row").filter({ hasText: "시금치" }).locator(".status-dot-warning")).toHaveCount(1);

    await page.getByRole("button", { name: /국산콩 두부 풀무원/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
    await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
    await expect(dialog.locator(".detail-actions .primary-sheet-button")).toHaveCount(0);
    await expect(dialog.locator(".detail-actions .detail-consume-action")).toBeVisible();
    const detailOrder = await dialog.locator(".detail-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
    expect(detailOrder.indexOf("date-edit-button")).toBeGreaterThan(detailOrder.indexOf("date-proof-card"));
    const provenanceIndex = detailOrder.indexOf("detail-source-group");
    const inferenceIndex = detailOrder.indexOf("inference-trace-card");
    if (provenanceIndex >= 0 && inferenceIndex >= 0) expect(provenanceIndex).toBeLessThan(inferenceIndex);
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

    const shortcut = page.getByRole("button", { name: "식품 찾기", exact: true });
    await expect(shortcut).toBeVisible();
    await shortcut.click();

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
    await page.getByRole("button", { name: "식품", exact: true }).click();
    await expect.poll(() => inventory.evaluate((element) => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      if (!screen) return Number.POSITIVE_INFINITY;
      return Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top);
    })).toBeLessThanOrEqual(5);

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
    expect(layout.scrollTop).toBeGreaterThan(0);
  }
});

test("filters the pantry by status and restores the full inventory", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();

  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /확인 필요/ });
  await expect(needsReview).toHaveAttribute("aria-controls", "inventory-list");
  await expect(needsReview).toHaveCSS("min-height", "44px");
  await expect(needsReview).toHaveAttribute("aria-pressed", "false");
  await needsReview.click();
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(needsReview).toBeFocused();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect(inventory.locator('.inventory-filter-summary[role="status"]')).toContainText("확인 필요 상태");
  await expect.poll(() => inventory.locator(".inventory-row").count()).toBe(2);
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(2);

  const reset = inventory.getByRole("button", { name: "검색·필터 초기화" });
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
  await page.getByRole("button", { name: "식품", exact: true }).click();
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
  await expect(page.getByRole("dialog", { name: "영수증으로 추가" })).toBeVisible();
});

test("restores the home first fold after moving between bottom navigation destinations", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const screen = page.locator("[data-testid=device-screen]");
  const scroll = page.getByTestId("mobile-scroll");
  const homeNav = page.getByRole("button", { name: "홈", exact: true });
  const foodNav = page.getByRole("button", { name: "식품", exact: true });

  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await expect(homeNav).not.toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.locator(".inventory-section").evaluate((element) => {
    const target = element.getBoundingClientRect();
    const viewport = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    return viewport ? Math.abs(target.top - viewport.top) : Number.POSITIVE_INFINITY;
  })).toBeLessThanOrEqual(5);

  await homeNav.click();
  await expect(homeNav).toHaveAttribute("aria-current", "page");
  await expect(foodNav).not.toHaveAttribute("aria-current", "page");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByRole("heading", { name: "오늘도, 남은 재료부터" })).toBeVisible();
  await expect.poll(() => page.getByRole("button", { name: "오늘 식단 만들기" }).evaluate((element) => {
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
  const foodNav = page.getByRole("button", { name: "식품", exact: true });
  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".inventory-review-guide")).toHaveCount(0);

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const reviewFilter = inventory.getByRole("group", { name: "식품 상태 필터" }).getByRole("button", { name: /확인 필요/ });
  await reviewFilter.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect(inventory.locator(".inventory-row")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "확인 순서" })).toBeVisible();

  const filteredLayout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    const appViewport = document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")!;
    const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]")!;
    const inventory = document.querySelector<HTMLElement>(".inventory-section")!;
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    const homeIndicator = document.querySelector<HTMLElement>("[data-testid=home-indicator]")!;
    return {
      screenScrollTop: screen.scrollTop,
      appViewportTopOffset: appViewport.getBoundingClientRect().top - screen.getBoundingClientRect().top,
      inventoryTopOffset: inventory.getBoundingClientRect().top - scroll.getBoundingClientRect().top,
      navigationBottom: navigation.getBoundingClientRect().bottom,
      homeIndicatorTop: homeIndicator.getBoundingClientRect().top,
    };
  });
  expect(filteredLayout.screenScrollTop).toBe(0);
  expect(Math.abs(filteredLayout.appViewportTopOffset)).toBeLessThanOrEqual(1);
  expect(Math.abs(filteredLayout.inventoryTopOffset)).toBeLessThanOrEqual(5);
  expect(filteredLayout.navigationBottom).toBeLessThanOrEqual(filteredLayout.homeIndicatorTop + 1);

  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.getByRole("heading", { name: /냉장고에 뭐가 남았지/ })).toBeVisible();
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect.poll(() => screen.evaluate((element) => element.scrollTop)).toBe(0);
  await expect.poll(() => appViewport.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    return screen ? Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top) : Number.POSITIVE_INFINITY;
  })).toBeLessThanOrEqual(1);

  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();
  await expect(page.getByTestId("android-navigation-bar")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]");
    const inventory = document.querySelector<HTMLElement>(".inventory-section");
    return screen && scroll && inventory
      ? Math.abs(inventory.getBoundingClientRect().top - scroll.getBoundingClientRect().top)
      : Number.POSITIVE_INFINITY;
  })).toBeLessThanOrEqual(5);

  const pixelLayout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    const viewport = document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")!;
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    const systemNavigation = document.querySelector<HTMLElement>("[data-testid=android-navigation-bar]")!;
    return {
      device: screen.dataset.device,
      screenScrollTop: screen.scrollTop,
      viewportTopOffset: viewport.getBoundingClientRect().top - screen.getBoundingClientRect().top,
      appNavigationBottom: navigation.getBoundingClientRect().bottom,
      systemNavigationTop: systemNavigation.getBoundingClientRect().top,
    };
  });
  expect(pixelLayout.device).toBe("pixel-10");
  expect(pixelLayout.screenScrollTop).toBe(0);
  expect(Math.abs(pixelLayout.viewportTopOffset)).toBeLessThanOrEqual(1);
  expect(pixelLayout.appNavigationBottom).toBeLessThanOrEqual(pixelLayout.systemNavigationTop + 1);
});

test("preserves the pantry status filter across home navigation", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const homeNav = page.getByRole("button", { name: "홈", exact: true });
  const foodNav = page.getByRole("button", { name: "식품", exact: true });
  await foodNav.click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /확인 필요/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();

  await homeNav.click();
  await expect(homeNav).toHaveAttribute("aria-current", "page");
  await foodNav.click();
  await expect(foodNav).toHaveAttribute("aria-current", "page");
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(2);
});

test("preserves the pantry status filter across the meal sheet round trip", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /확인 필요/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();

  await page.getByRole("button", { name: "식단", exact: true }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mealDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "식품", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect(inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]')).toHaveCount(2);
});

test("restores the pantry context after closing an inventory detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");

  const row = inventory.locator(".inventory-row").first();
  await expect(row).toBeVisible();
  await row.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
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
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /확인 필요/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();

  const row = inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').first().locator(".." );
  await row.click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(2);
  await expect(row).toBeFocused();
});

test("preserves the active status filter through label review readback", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const statusFilters = inventory.getByRole("group", { name: "식품 상태 필터" });
  const needsReview = statusFilters.getByRole("button", { name: /확인 필요/ });
  await needsReview.click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();

  await inventory.getByRole("button", { name: /시금치 국내산 시금치 · 1팩/ }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: /포장지에서.*날짜.*다시 확인/ }).click();
  const labelDialog = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await labelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(detail).toHaveCount(0);
  await expect(needsReview).toHaveAttribute("aria-pressed", "true");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect.poll(() => inventory.locator('.inventory-row .inventory-status[data-inventory-status="needs-review"]').count()).toBe(2);
  await expect(inventory.locator(".inventory-row").first()).toBeFocused();
});

test("does not leak an unsaved storage edit after closing the detail sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();
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
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const row = inventory.locator(".inventory-row").filter({ hasText: "시금치" }).first();
  await row.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(detail.getByRole("button", { name: "냉동", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.locator(".storage-pill")).toHaveText("냉동 보관 중");
  await expect(detail.locator(".detail-save-hint")).toHaveText("저장하지 않고 닫으면 변경한 보관 상태는 반영되지 않아요.");
  await detail.locator(".detail-actions .primary-sheet-button").click();

  await expect(page.getByRole("status")).toHaveText("보관 상태를 저장했어요");
  await expect(detail).toHaveCount(0);
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 · 1팩.*확인 필요/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 · 1팩.*확인 필요/ })).toBeFocused();
  await expect.poll(() => inventory.getByRole("button", { name: /시금치 국내산 시금치 · 1팩.*확인 필요/ }).evaluate((element) => {
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
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const row = inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ });
  await row.click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  await detail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const editor = detail.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor).toBeVisible();

  const confirmedDate = new Date();
  confirmedDate.setHours(12, 0, 0, 0);
  confirmedDate.setDate(confirmedDate.getDate() + 10);
  const confirmedDateValue = [confirmedDate.getFullYear(), confirmedDate.getMonth() + 1, confirmedDate.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
    .join("-");
  const confirmedDateLabel = `${confirmedDate.getMonth() + 1}월 ${confirmedDate.getDate()}일`;

  await editor.getByRole("button", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill(confirmedDateValue);
  await expect(editor.getByText(`선택한 날짜 · ${confirmedDateValue.replaceAll("-", ".")}`, { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(page.getByRole("status")).toContainText("국산콩 두부 소비기한을 사용자 확인으로 저장했어요");
  await expect(detail).toHaveCount(0);
  const updatedRow = inventory.getByRole("button", { name: new RegExp(`국산콩 두부 풀무원 · 1모 .*먼저 먹기.*${confirmedDateLabel}`) });
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow).toBeFocused();
  await expect.poll(() => updatedRow.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    return Boolean(screen && navigation && target.top >= screen.top - 1 && target.bottom <= navigation.top + 1);
  })).toBe(true);

  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 3" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" })).toContainText(confirmedDateLabel);
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
});

test("returns focus to the date action after cancelling date review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();

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
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

  let detail = page.getByRole("dialog", { name: "시금치" });
  const dateRecheckAction = detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  await dateRecheckAction.click();
  await waitForSheetSettled(page);

  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  const currentDate = labelReview.getByRole("group", { name: "현재 기록된 날짜 포장 소비기한 · 2026.09.02 · 포장지 표시" });
  await expect(currentDate).toBeVisible();
  await expect(currentDate).toBeInViewport();
  await expect(currentDate).toHaveText(/현재 기록.*포장 소비기한 · 2026\.09\.02 · 포장지 표시/);
  await expect(labelReview.locator(".sheet-description")).toContainText("저장 전까지 기록은 그대로예요");
  await expect(labelReview.locator(".intake-method-hint")).toContainText("포장지 날짜를 다시 읽어 확인해요.");
  await expect(labelReview.locator(".sheet-description")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note strong")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".intake-method-hint")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".intake-flow-rail-heading strong")).toHaveCSS("font-size", "12px");
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
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

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
  const [screenBox, actionBox] = await Promise.all([
    page.getByTestId("device-screen").boundingBox(),
    trigger.boundingBox(),
  ]);
  expect(screenBox).toBeTruthy();
  expect(actionBox).toBeTruthy();
  expect(actionBox!.y).toBeGreaterThanOrEqual(screenBox!.y - 1);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height + 1);
});

test("echoes the existing printed date before starting a label recheck", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

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
  await expect(currentDate).toHaveText(/현재 기록.*포장 소비기한 · 2026\.09\.02 · 포장지 표시/);
  const dateContextPrecedesMethodChoices = await currentDate.evaluate((element) => {
    const methodChoices = element.parentElement?.querySelector(".mode-tabs");
    return Boolean(methodChoices && (element.compareDocumentPosition(methodChoices) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(dateContextPrecedesMethodChoices).toBe(true);
  const dateReviewProgress = labelReview.getByRole("group", { name: "날짜 확인 1단계" });
  await expect(dateReviewProgress).toBeVisible();
  await expect(dateReviewProgress).toContainText("날짜가 보이는 면을 선택해요");
  await expect(labelReview.locator(".sheet-description")).toContainText("저장 전까지 기록은 그대로예요");
  await expect(labelReview.locator(".intake-method-hint")).toContainText("포장지 날짜를 다시 읽어 확인해요.");
  await expect(labelReview.locator(".sheet-description")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".capture-date-meaning-note strong")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".intake-method-hint")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".intake-flow-rail-heading strong")).toHaveCSS("font-size", "12px");
  await expect(labelReview.locator(".input-flow > p").first()).toHaveCSS("font-size", "12px");
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
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

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
      await page.getByTestId("theme-toggle").click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
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
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

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
      await page.getByTestId("theme-toggle").click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

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
      await page.getByTestId("theme-toggle").click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    const firstPriority = page.locator(".priority-card").first();
    for (let index = 0; index < 16; index += 1) {
      await page.keyboard.press("Tab");
      if (await firstPriority.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(firstPriority).toBeFocused();
    await expectFocusRing(firstPriority, ".meal-home");
    await firstPriority.click();

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
    await page.keyboard.press("Tab");
    await expect(productInfo).toBeFocused();
    await expectFocusRing(productInfo, ".bottom-sheet");
    await page.keyboard.press("Tab");
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

      const homeTargets = [
        page.locator(".connection-pill"),
        page.locator(".theme-toggle-button"),
        page.locator(".notification-button"),
        page.getByRole("button", { name: "식품 찾기" }),
        page.locator(".priority-card").nth(0),
        page.locator(".priority-card").nth(1),
        page.locator(".priority-card").nth(2),
        page.locator(".meal-plan-button"),
        page.locator(".add-food-button"),
        page.locator(".trust-card"),
        page.locator(".shopping-summary-card"),
      ];

      for (const target of homeTargets) {
        for (let index = 0; index < 32; index += 1) {
          await page.keyboard.press("Tab");
          if (await target.evaluate((element) => element === document.activeElement)) break;
        }
        await expect(target).toBeFocused();
        await expectHomeRing(target, ".meal-home");
      }

      const homeTab = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "홈", exact: true });
      await homeTab.evaluate((element) => element.focus({ preventScroll: true }));
      for (const label of ["식품", "식단"]) {
        const navTarget = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: label, exact: true });
        await page.keyboard.press("Tab");
        await expect(navTarget).toBeFocused();
        await expectHomeRing(navTarget, ".app-bottom-nav", "::before");
      }
    }
  }
});

test("returns focus to product info action after cancelling product edit", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  const productInfoAction = detail.getByRole("button", { name: "상품 정보 수정" });
  await productInfoAction.click();
  const editor = detail.getByRole("group", { name: "상품 정보 수정" });
  await editor.getByRole("textbox", { name: "상품명 수정" }).fill("임시 상품명");
  await editor.getByRole("button", { name: "취소" }).click();

  await expect(editor).toHaveCount(0);
  await expect(productInfoAction).toBeFocused();
  await expect(detail.locator(".detail-hero")).toContainText("국산콩 두부");
});

test("returns to the same notification row after mobile date review", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");

  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notification = notifications.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" });
  await notification.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  const labelDialog = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(labelDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("날짜와 보관 위치를 확인해요");
  await labelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(notifications).toBeVisible();
  await expect(notification).toBeFocused();
  await expect(notification).toHaveAttribute("data-notification-returned", "true");
  await notifications.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 3" })).toBeVisible();
  await expect(page.locator(".trust-card")).toHaveAttribute("data-trust-state", "needs-review");
  await expect(page.locator(".trust-card")).toContainText("포장지 날짜와 실제 상태를 확인한 뒤 식단을 준비해 주세요.");
  await expect(page.getByRole("button", { name: /알림 확인/ })).toHaveAccessibleName(/읽지 않은 알림 2개/);
});

test("keeps the pantry anchor at the top when a search has no results", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const inventory = page.getByRole("region", { name: /내 식품 목록/ });
    await page.getByRole("button", { name: "식품", exact: true }).click();
    await expect.poll(() => inventory.evaluate((element) => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      if (!screen) return Number.POSITIVE_INFINITY;
      return Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top);
    })).toBeLessThanOrEqual(5);

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
    expect(layout.inventory!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.inventory!.top).toBeLessThanOrEqual(layout.screen!.top + 5);
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.empty!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.scrollTop).toBeGreaterThan(0);
  }
});

test("survives native viewport height changes while the pantry and detail are active", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect.poll(() => inventory.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    if (!screen) return Number.POSITIVE_INFINITY;
    return Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(5);

  const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
  await search.fill("두부");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  for (const height of [740, 600, 852]) {
    await page.setViewportSize({ width: 393, height });
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      return screen?.getBoundingClientRect().height ?? 0;
    })).toBeCloseTo(height, 0);

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
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
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
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();

  await assertDialogFitsNarrowViewport(page, dialog);
  await expect(dialog.getByRole("button", { name: "샘플 영수증으로 시작" })).toBeVisible();
});

test("keeps the barcode candidate card and apply CTA inside a 320px sheet", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
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
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  const confirm = receiptDialog.getByRole("button", { name: "이 항목 확인했어요" });
  await confirm.click();
  const badge = receiptDialog.locator(".receipt-line-confirmed-badge");
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
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
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
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await intakeDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(dialog.locator(".intake-flow-rail")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "연결 후 확인 가능" })).toHaveCount(0);
  await expect(dialog.locator(".manual-priority-note")).toContainText("우선순위 참고는 연결 후 이용할 수 있어요.");
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("김치");

  const submit = dialog.getByRole("button", { name: "식품 추가하기", exact: true });
  await expect(submit).toHaveCount(1);
  await expect(dialog.locator("#manual-submit-summary")).toHaveText("추가할 내용 · 김치 · 1개 · 냉장 보관");
  await expect(submit).toHaveAttribute("aria-describedby", "manual-submit-summary");
  await expect.poll(() => dialog.locator("#manual-submit-summary").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
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
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const mushroomCard = dialog.locator(".receipt-line-card").filter({ hasText: "맛타리버섯" });
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" }).click();
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" }).click();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);

  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const criticalControls = [
      '.receipt-line-card-editing input[aria-label="재고에 저장할 상품명"]',
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

  await mushroomCard.getByRole("textbox", { name: "재고에 저장할 상품명" }).focus();
  await expect.poll(() => page.evaluate(() => {
    const field = document.querySelector<HTMLElement>('.receipt-line-card-editing input[aria-label="재고에 저장할 상품명"]')?.getBoundingClientRect();
    const bar = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const keyboard = document.querySelector<HTMLElement>('.keyboard-dock[data-visible="true"]')?.getBoundingClientRect();
    const content = document.querySelector<HTMLElement>(".sheet-content")?.getBoundingClientRect();
    if (!field || !bar || !keyboard || !content) return false;
    const overlapsCommitAction = field.top < bar.bottom && field.bottom > bar.top;
    return field.top >= content.top && field.bottom <= keyboard.top - 4 && !overlapsCommitAction;
  }), { timeout: 2_500 }).toBe(true);
});

test("focuses the label source first and keeps confirmation reachable after recognition", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
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
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();

  const source = dialog.locator(".label-result-provenance");
  const actionSummary = dialog.locator(".label-result-action-summary");
  await expect(source).toHaveAttribute("data-label-source", "example");
  await expect(source.locator("strong")).toHaveText("예시 라벨 결과");
  await expect(dialog.locator(".label-review-contract-example small")).toHaveText("날짜 종류와 숫자를 실제 포장지와 대조해 주세요.");
  await expect(dialog.locator(".label-review-contract-example small")).toHaveCSS("font-size", "12px");
  await expect(actionSummary).toContainText("예시 결과 · 저장 전 확인");
  await expect(dialog.locator(".label-storage-condition-note")).toHaveText("예시 보관 정보 · 냉장 보관");
  await expect(dialog.locator(".confirmed-badge")).toContainText("예시 정보 · 확인 필요");
  await expect(dialog.getByLabel("포장지 날짜")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "새 식품 추가하기" })).toBeVisible();

  await page.screenshot({ path: "../../evidence/mobile-flow-review-2026-09-29/08-example-label-result-320x740-dark-readable.png", scale: "css" });
  await dialog.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.locator(".label-storage-condition-note")).toHaveText("예시 보관 정보 · 냉장 보관");
  await expect(dialog.locator(".confirmed-badge")).toContainText("예시 정보 · 확인 필요");
  await page.screenshot({ path: "../../evidence/mobile-flow-review-2026-09-29/09-example-label-result-review-320x740-dark-readable.png", scale: "css" });
});

test("keeps the label date field clear of the sticky action at 320px", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(dialog.locator(".label-result-provenance")).toHaveAttribute("data-label-source", "example");
  await expect(dialog.locator(".label-result-provenance strong")).toHaveCSS("font-size", "12px");
  await expect(dialog.locator(".label-review-contract-example small")).toHaveText("날짜 종류와 숫자를 실제 포장지와 대조해 주세요.");
  await expect(dialog.locator(".label-result-action-summary")).toContainText("예시 결과 · 저장 전 확인");
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
  const dialog = page.getByRole("dialog", { name: "영수증 확인" });
  await expect(dialog).toBeVisible();
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(sourcePreview).toBeVisible();
  await expect(sourcePreview).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const readingOrder = await dialog.evaluate((element) => {
    const source = element.querySelector<HTMLElement>(".receipt-source-preview");
    const lines = Array.from(element.querySelectorAll<HTMLElement>(".receipt-line-card"));
    const submit = element.querySelector<HTMLElement>(".receipt-review-submit-bar");
    const footnote = element.querySelector<HTMLElement>(".sheet-footnote");
    if (!source || !lines.length || !submit || !footnote) return null;
    const follows = (before: Node, after: Node) => Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      sourceBeforeLines: lines.every((line) => follows(source, line)),
      linesBeforeSubmit: lines.every((line) => follows(line, submit)),
      submitBeforeFootnote: follows(submit, footnote),
    };
  });
  expect(readingOrder).toEqual({ sourceBeforeLines: true, linesBeforeSubmit: true, submitBeforeFootnote: true });
  const spinachCardForOrder = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  const spinachActions = await spinachCardForOrder.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(spinachActions).toEqual([
    "시금치 1팩 · 2,980원",
    "시금치 항목 수정",
    "시금치 영수증에서 확인하기",
  ]);
  await expect(spinachCardForOrder.locator(".receipt-line-source-action-row .receipt-line-source-button")).toHaveAttribute("aria-pressed", "false");
  const spinachSourceActionBox = await spinachCardForOrder.locator(".receipt-line-source-action-row .receipt-line-source-button").boundingBox();
  expect(spinachSourceActionBox?.height).toBeGreaterThanOrEqual(44);
  await expect(spinachCardForOrder.locator(".receipt-line-toggle")).toHaveAttribute("aria-describedby", "receipt-line-status-receipt-spinach");
  await expect(spinachCardForOrder).toHaveAttribute("data-receipt-review-state", "auto_read");
  await expect(spinachCardForOrder).toContainText("영수증에서 읽음");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "국산콩 두부 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "맛타리버섯 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview).toContainText("현재 항목 · 맛타리버섯");
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toContainText("영수증에서 확인 중");
  await expect(sourcePreview).toHaveAttribute("data-active-source-count", "1");
  await expect(sourcePreview).toHaveAttribute("data-active-source-included", "true");
  await expect(sourcePreview.locator("#receipt-source-preview-hint")).toContainText("체크된 품목만 저장돼요.");
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
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toHaveText("저장 제외 · 맛타리버섯");
  await expect(dialog.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();
  await mushroomToggle.click();
  await expect(mushroomToggle).toHaveAttribute("aria-pressed", "true");
  await expect(sourcePreview).toHaveAttribute("data-active-source-included", "true");
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toContainText("영수증에서 확인 중");
  await expect(dialog.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  await spinachSource.press("Enter");
  await expect(spinachSource).toHaveAttribute("aria-pressed", "true");
  await expect(mushroomSource).toHaveAttribute("aria-pressed", "false");
  await expect(sourcePreview).toContainText("현재 항목 · 시금치");
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
  await expect(sourcePreview).toContainText("현재 항목 · 국산콩 두부");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "국산콩 두부");
  const activeTofuBoxes = await sourcePreview.locator(".receipt-source-box-active").count();
  expect(activeTofuBoxes).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const submit = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const activeBoxes = Array.from(document.querySelectorAll<HTMLElement>(".receipt-source-box-active"), (element) => element.getBoundingClientRect());
    return Boolean(submit && activeBoxes.length && activeBoxes.every((box) => box.bottom <= submit.top + 1));
  })).toBe(true);

  await sourcePreview.locator(".receipt-source-preview-overlay").click({ position: { x: zoomedFrame!.width * 0.505, y: zoomedFrame!.height * 0.254 } });
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" })).toBeVisible();
  await expect(spinachCard.getByRole("group", { name: "시금치 보관 위치" })).toHaveAttribute("aria-describedby", "receipt-storage-hint-receipt-spinach");
  await spinachCard.getByRole("textbox", { name: "재고에 저장할 상품명" }).fill("시금치");
  await expect(spinachCard.locator(".receipt-line-source-action-row .receipt-line-source-button")).toHaveAccessibleName("시금치 영수증에서 확인하기");
  await expect(sourcePreview).toContainText("현재 항목 · 시금치");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "시금치 영수증에서 확인하기" })).toHaveCount(0);
  await expect(sourcePreview.getByRole("button", { name: "원본 축소" })).toBeVisible();
  await sourcePreview.getByRole("button", { name: "원본 축소" }).click();
  await expect(sourcePreview.getByRole("button", { name: "원본 확대" })).toHaveAttribute("aria-pressed", "false");
  await expect(sourcePreview).toContainText("현재 항목 · 시금치");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "시금치");
  await expect(sourcePreview.getByRole("button", { name: "국산콩 두부 영수증에서 확인하기" })).toHaveAttribute("aria-pressed", "false");
  await spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" }).click();
  await expect(sourcePreview).toContainText("현재 항목 · 시금치");
  await expect(sourcePreview).toHaveAttribute("data-active-source-line", "시금치");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "영수증 원본 대조 다시 열기" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "영수증 확인" });
  await expect(reopenedDialog).toBeVisible();
  const reopenedPreview = reopenedDialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(reopenedPreview).toBeVisible();
  await expect(reopenedPreview).toHaveAttribute("data-active-source-line", "맛타리버섯");
  await expect(reopenedPreview.getByRole("button", { name: "원본 확대" })).toHaveAttribute("aria-pressed", "false");
});

test("keeps the source review fixture legible in dark mode", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 확인" });
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
    const dialog = page.getByRole("dialog", { name: "영수증 확인" });
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
  const dialog = page.getByRole("dialog", { name: "영수증 확인" });
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
  await expect(sourcePreview).toContainText("현재 항목 · 시금치");
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" })).toBeVisible();
});

test("zooms around the active receipt line and keeps taps mapped to its OCR source", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 확인" });
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
  const spinachBounds = await spinachSourceBox.boundingBox();
  expect(spinachBounds).toBeTruthy();
  await page.mouse.click(spinachBounds!.x + spinachBounds!.width / 2, spinachBounds!.y + spinachBounds!.height / 2);
  await expect(sourcePreview).toContainText("현재 항목 · 시금치");
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

  await openAndCheck({ name: "오늘 식단 만들기" }, "오늘의 식단");
  await openAndCheck({ name: /알림 확인/ }, "알림");
  await openAndCheck({ name: /연결 상태: 게스트 기록/ }, "내 계정");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await assertDialogFitsNarrowViewport(page, detail);
});

test("backdrop dismissal returns focus to the sheet trigger", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /알림 확인/ });
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
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notification = notifications.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" });
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
  const dialog = page.getByRole("dialog", { name: "내 계정" });
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
    return { greeting: read(".greeting-block h1"), priorityHeading: read(".section-heading h2") };
  });
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const after = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    return { greeting: read(".greeting-block h1"), priorityHeading: read(".section-heading h2") };
  });

  expect(after.greeting).toBeGreaterThan(before.greeting);
  expect(after.priorityHeading).toBeGreaterThan(before.priorityHeading);

  const metrics = await readNarrowViewportMetrics(page);

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.outOfBounds).toEqual([]);
  const vertical = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return { meal: rect(".meal-plan-button"), add: rect(".add-food-button"), nav: rect(".app-bottom-nav") };
  });
  expect(vertical.meal?.bottom).toBeLessThanOrEqual(vertical.nav?.top ?? Number.POSITIVE_INFINITY);
  expect(vertical.add?.bottom).toBeLessThanOrEqual(vertical.nav?.top ?? Number.POSITIVE_INFINITY);
});

test("keeps the compact safety guidance reachable after larger text scrolls", async ({ page }) => {
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const scroll = page.getByTestId("mobile-scroll");
  await scroll.evaluate((element) => { element.scrollTop = 20; });
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
  await page.reload();
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();

  const readback = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    const home = document.querySelector<HTMLElement>(".meal-home")!;
    const add = document.querySelector<HTMLElement>(".add-food-button")!;
    return {
      contrast: window.matchMedia("(prefers-contrast: more)").matches,
      mutedColor: getComputedStyle(home).getPropertyValue("--atelier-muted").trim(),
      borderColor: getComputedStyle(home).getPropertyValue("--atelier-border-strong").trim(),
      screen: screen.getBoundingClientRect().toJSON(),
      add: add.getBoundingClientRect().toJSON(),
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });

  expect(readback.contrast).toBeTruthy();
  expect(readback.mutedColor).toBe("#4e5968");
  expect(readback.borderColor).toBe("rgba(2, 32, 71, 0.38)");
  expect(readback.screen.width).toBeCloseTo(320, 0);
  expect(readback.screen.height).toBeCloseTo(740, 0);
  expect(readback.add.height).toBeGreaterThanOrEqual(43.5);
  expect(readback.documentWidth).toBeLessThanOrEqual(320);
  expect(readback.bodyWidth).toBeLessThanOrEqual(320);
});

test("scales the major sheet reading hierarchy with a larger text preference", async ({ page }) => {
  await page.getByRole("button", { name: "오늘 식단 만들기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  const mealBefore = await mealDialog.locator(".recipe-title-row h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const mealAfter = await mealDialog.locator(".recipe-title-row h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(mealAfter).toBeGreaterThan(mealBefore);
  await page.keyboard.press("Escape");
  await expect(mealDialog).toHaveCount(0);

  await page.addStyleTag({ content: "html { font-size: 100%; }" });
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detailDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(detailDialog).toBeVisible();
  const detailBefore = await detailDialog.locator(".detail-hero-copy h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const detailAfter = await detailDialog.locator(".detail-hero-copy h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
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
  await assertTarget(page.locator(".scan-button"), "scan button");
  await assertTarget(page.locator(".mobile-hero-notification"), "notification button");
  await assertTarget(page.getByRole("button", { name: "식품 추가하기" }), "add food button");

  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(intakeDialog).toBeVisible();
  await assertTarget(intakeDialog.locator(".mode-tab").first(), "intake mode tab");
  await assertTarget(intakeDialog.getByRole("button", { name: "닫기", exact: true }), "sheet close button");
  await page.keyboard.press("Escape");
  await expect(intakeDialog).toHaveCount(0);

  await page.getByRole("button", { name: "오늘 식단 만들기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  await assertTarget(mealDialog.locator(".recipe-time-picker button").first(), "recipe time choice");
  await assertTarget(mealDialog.locator(".recipe-serving-picker button").first(), "recipe serving choice");
  await expect(mealDialog.locator(".recipe-time-picker button").first()).toHaveCSS("font-size", "11px");
  await expect(mealDialog.locator(".recipe-serving-picker button").first()).toHaveCSS("font-size", "11px");
  await assertTarget(mealDialog.locator(".recipe-actions button").first(), "recipe action");
  await assertTarget(mealDialog.locator(".recipe-history-toggle"), "recipe history toggle");
  await page.keyboard.press("Escape");
  await expect(mealDialog).toHaveCount(0);

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detailDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(detailDialog).toBeVisible();
  await assertTarget(detailDialog.locator(".date-proof-card > button"), "date guidance button");
  await detailDialog.getByRole("button", { name: "날짜 기준 자세히 보기" }).click();
  const guidanceDialog = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidanceDialog).toBeVisible();
  await guidanceDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(guidanceDialog).toHaveCount(0);
  await expect(detailDialog).toBeVisible();
  await assertTarget(detailDialog.locator(".storage-option").first(), "storage choice");
  await assertTarget(detailDialog.locator(".toggle"), "opened state toggle");
  await assertTarget(detailDialog.locator(".danger-text-button"), "discard action");
  await page.keyboard.press("Escape");
  await expect(detailDialog).toHaveCount(0);

  await page.locator(".mobile-hero-notification").click();
  const notificationDialog = page.getByRole("dialog", { name: "알림" });
  await expect(notificationDialog).toBeVisible();
  await assertTarget(notificationDialog.locator(".notification-read-all"), "mark all read button");
});

test("keeps the guest account primary action above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await page.getByRole("button", { name: /연결 상태: 게스트 기록/ }).click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const loginBox = await dialog.locator('form.account-form button[type="submit"]').boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(loginBox, "guest account login action has no bounding box").toBeTruthy();
  expect(loginBox!.y + loginBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(loginBox!.height).toBeGreaterThanOrEqual(43.5);
});

test("places detail primary actions directly after safety guidance", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".detail-actions")).toBeVisible();
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toContainText("먹은 기록 남기기");
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toHaveAttribute("aria-label", "날짜와 보관 방법을 살펴본 뒤 먹은 기록 남기기");
  const reviewActionLayout = await dialog.locator(".detail-actions .secondary-sheet-button").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { height: rect.height, lineHeight: Number.parseFloat(style.lineHeight) };
  });
  expect(reviewActionLayout.height).toBeLessThanOrEqual(Math.ceil(reviewActionLayout.lineHeight * 2 + 18));
  const safetyHintFontSize = await dialog.locator(".detail-actions-review-copy small").evaluate((element) => getComputedStyle(element).fontSize);
  expect(safetyHintFontSize).toBe("12px");
  const followsSafetyGuidance = await dialog.locator(".date-review-callout").evaluate((node) => {
    const actions = node.parentElement?.querySelector(".detail-actions");
    return Boolean(actions && (node.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(followsSafetyGuidance).toBe(true);
});

test("keeps date guidance in context when opening a review-required priority card", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  const dateReviewAction = dialog.getByRole("button", { name: "포장지에서 날짜 다시 확인" });
  const dateReviewHeading = dialog.locator(".date-review-callout > span:nth-child(2) > strong");
  const dateReviewCopy = dialog.locator(".date-review-callout > span:nth-child(2) > small");

  await expect(dateReviewHeading).toHaveText("조리 전에 포장지 날짜를 살펴봐 주세요");
  await expect(dateReviewCopy).toContainText("포장지 날짜와 보관·개봉 상태를 다시 살펴봐 주세요.");
  await expect(dateReviewHeading).toHaveCSS("font-size", "12px");
  await expect(dateReviewCopy).toHaveCSS("font-size", "12px");
  await expect(dialog.locator(".date-edit-button-compact > span")).toHaveCSS("font-size", "11px");
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

test("routes a use-next priority card to the consume action", async ({ page }) => {
  await page.getByRole("button", { name: /국산콩 두부 풀무원/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });

  await expect(dialog.getByRole("button", { name: "먹었어요", exact: true })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
});

test("keeps primary and destructive detail actions above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
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
  expect(discardBox!.y + discardBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);

  const content = dialog.locator(".sheet-content");
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const openedToggle = dialog.locator(".opened-row .toggle");
  await expect.poll(async () => {
    const bounds = await openedToggle.boundingBox();
    return Boolean(bounds && screenBox && bounds.y >= screenBox.y - 1
      && bounds.y + bounds.height <= screenBox.y + screenBox.height - 34);
  }).toBe(true);
});

test("keeps food detail primary actions above the safe area at 320px", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
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
  expect(initialActionBox!.y + initialActionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);

  const content = dialog.locator(".sheet-content");
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);

  const actionBox = await dialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(actionBox, "food detail primary actions have no bounding box").toBeTruthy();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
});
