import { expect, test } from "@playwright/test";

test("home storage rows stay on one line and the meal action fits at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  // One line per storage place; empty storages collapse instead of saying "비어 있어요".
  const rows = page.locator(".home-shelves .home-shelf-row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^냉장 식품 5개 보기/ })).toBeVisible();
  const rowSizes = await rows.evaluateAll((buttons) => buttons.map((button) => {
    const label = button.querySelector<HTMLElement>(".home-shelf-name")!;
    const rect = button.getBoundingClientRect();
    return {
      width: button.clientWidth,
      contentWidth: button.scrollWidth,
      labelHeight: label.getBoundingClientRect().height,
      labelFontSize: Number.parseFloat(getComputedStyle(label).fontSize),
      height: rect.height,
      right: rect.right,
    };
  }));
  for (const size of rowSizes) {
    expect(size.contentWidth).toBeLessThanOrEqual(size.width);
    // One line: a wrapped label would be at least twice the font size tall.
    expect(size.labelHeight).toBeLessThan(size.labelFontSize * 2);
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.right).toBeLessThanOrEqual(320);
  }
  // The taller fridge panel moves the meal CTA below the 320px first fold. A meal-plan entry must still be
  // fully visible above the nav in the first viewport: the first rescue card's 요리 action (or the CTA without a deck).
  const navigation = await page.locator(".app-bottom-nav").boundingBox();
  const hasDeck = await page.locator(".rescue-card").count() > 0;
  const firstFoldMealEntry = hasDeck
    ? page.locator(".rescue-card").first().getByRole("button", { name: /요리하기$/ })
    : page.locator(".meal-plan-button");
  const entryBox = await firstFoldMealEntry.boundingBox();
  expect(entryBox!.y).toBeGreaterThanOrEqual(0);
  expect(entryBox!.y + entryBox!.height).toBeLessThanOrEqual(navigation!.y);
  expect(entryBox!.height).toBeGreaterThanOrEqual(44);
  // The full-width CTA itself is reachable by scrolling and is not left under the floating nav.
  await page.locator(".meal-plan-button").evaluate((element) => element.scrollIntoView({ block: "center" }));
  const mealAction = await page.locator(".meal-plan-button").boundingBox();
  const navigationAfterScroll = await page.locator(".app-bottom-nav").boundingBox();
  expect(mealAction!.y).toBeGreaterThanOrEqual(0);
  expect(mealAction!.y + mealAction!.height).toBeLessThan(navigationAfterScroll!.y);
  const navItems = await page.locator(".app-bottom-nav-item").evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const label = item.querySelector("span:last-child")!;
    return { x: rect.x, right: rect.right, width: rect.width, height: rect.height, labelWidth: label.scrollWidth, labelBox: label.clientWidth };
  }));
  // Four destinations share the five-column bar with the centre add button.
  expect(navItems).toHaveLength(4);
  const addButton = await page.locator(".app-bottom-nav-add").boundingBox();
  for (const item of [...navItems, { x: addButton!.x, right: addButton!.x + addButton!.width, width: addButton!.width, height: addButton!.height }]) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.right).toBeLessThanOrEqual(320);
  }
  // "냉장고" is the longest label and must not be clipped.
  for (const item of navItems) expect(item.labelWidth).toBeLessThanOrEqual(item.labelBox + 1);
  const sorted = [...navItems].sort((a, b) => a.x - b.x);
  for (let index = 1; index < sorted.length; index += 1) expect(sorted[index]!.x).toBeGreaterThanOrEqual(sorted[index - 1]!.right - 0.5);
});

test("web surface renders the real app without phone simulator chrome", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("web-app-shell")).toBeVisible();
  await expect(page.getByTestId("web-runtime-surface")).toBeVisible();
  await expect(page.getByTestId("phone-frame")).toHaveCount(0);
  await expect(page.getByTestId("device-screen")).toHaveCount(0);
  await expect(page.getByTestId("device-picker")).toHaveCount(0);
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Rescue Meal" })).toBeVisible();
  const connectionPill = page.getByRole("button", { name: /예시 식품으로 체험 중.* 체험 안내 열기/ });
  await expect(connectionPill).toBeVisible();
  await expect(connectionPill).toHaveAttribute("title", /체험 안내 열기/);

  const surface = await page.getByTestId("web-runtime-surface").boundingBox();
  expect(surface?.width).toBeGreaterThanOrEqual(1439);
  expect(surface?.height).toBeGreaterThanOrEqual(999);

  const navigation = await page.locator(".app-bottom-nav").boundingBox();
  expect(navigation, "web navigation has no bounding box").toBeTruthy();
  expect(navigation!.y).toBeGreaterThan(surface!.y + surface!.height * 0.8);
  // The bar floats as a pill: it ends inside the bottom ~56px of the surface instead of touching the edge.
  const navigationBottomGap = surface!.y + surface!.height - (navigation!.y + navigation!.height);
  expect(navigationBottomGap).toBeGreaterThanOrEqual(0);
  expect(navigationBottomGap).toBeLessThanOrEqual(56);
  expect(navigation!.x).toBeGreaterThanOrEqual(surface!.x);
  expect(navigation!.x + navigation!.width).toBeLessThanOrEqual(surface!.x + surface!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);

  const navigationBar = page.getByRole("navigation", { name: "주요 메뉴" });
  const scroll = page.getByTestId("mobile-scroll");
  // 냉장고 is its own screen: the inventory toolbar lives there, not on Home.
  await expect(page.locator(".inventory-toolbar")).toHaveCount(0);
  await navigationBar.getByRole("button", { name: "냉장고", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
  await expect(page.getByRole("heading", { level: 1, name: "냉장고" })).toBeVisible();
  const inventoryToolbar = page.locator(".inventory-toolbar");
  await expect(inventoryToolbar).toBeVisible();
  await expect(inventoryToolbar).toHaveCSS("position", "sticky");

  await scroll.evaluate((element) => element.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "auto" }));
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");

  const scrollTopBeforeDetail = await scroll.evaluate((element) => element.scrollTop);
  await page.locator(".inventory-row").first().click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "시금치" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(scrollTopBeforeDetail - 1);
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(scrollTopBeforeDetail + 1);
  const fridgeScrollTop = await scroll.evaluate((element) => element.scrollTop);

  // Each tab keeps its own scroll position: Home opens at its own (top) position.
  await navigationBar.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);

  await page.getByRole("button", { name: /오늘 뭐 먹지/ }).click();
  const meal = page.getByRole("region", { name: "오늘의 식단" });
  await expect(meal).toBeVisible();
  await expect(page.getByRole("dialog", { name: "오늘의 식단" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식단");
  await expect(page.getByRole("heading", { level: 1, name: "식단" })).toBeVisible();
  await navigationBar.getByRole("button", { name: "홈", exact: true }).click();
  await expect(meal).toBeHidden();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");

  await navigationBar.getByRole("button", { name: "냉장고", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(fridgeScrollTop - 1);
  await navigationBar.getByRole("button", { name: "식단", exact: true }).click();
  await expect(meal).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식단");
  await navigationBar.getByRole("button", { name: /^장보기/ }).click();
  await expect(page.getByRole("region", { name: "장보기 목록" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("장보기");
  await expect(meal).toBeHidden();
  // The bell and 나 exist once, on the visible tab's header.
  await expect(page.locator(".connection-pill")).toHaveCount(1);
  await expect(page.locator(".notification-button")).toHaveCount(1);
});

test("web surface carries the selected dark theme through the outer runtime shell", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem("rescue-meal.theme"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  // The theme switch lives in 나.
  await page.locator(".connection-pill").click();
  await page.getByTestId("theme-toggle").click();

  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(page.getByTestId("web-runtime-surface")).toHaveCSS("background-color", "rgb(12, 18, 16)");
  await expect(page.locator(".app-shell-web")).toHaveCSS("background-color", "rgb(12, 18, 16)");
});

test("web home keeps the storage rows before the meal action on mobile and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  // The full inventory moved to 냉장고; Home shows each food at most in the deck and the storage rows.
  await expect(page.locator(".inventory-row")).toHaveCount(0);
  await expect(page.locator(".freshness-overview")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /^오늘 살펴볼 음식 \d+개$/ })).toBeVisible();
  // The demo record has one passed printed date: the safety summary opens its review.
  await expect(page.locator(".trust-card")).toHaveCount(1);
  await expect(page.locator(".rescue-card").filter({ hasText: "시금치" })).toHaveClass(/freshness-past/);
  const summary = page.locator(".home-shelves");
  await expect(summary).toBeVisible();
  const actionRow = page.locator(".home-action-row");
  const overviewPrecedesActions = () => page.evaluate(() => {
    const overview = document.querySelector(".home-shelves");
    const action = document.querySelector(".home-action-row");
    if (!overview || !action || !(overview.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    // Rows must not run under the action row.
    const overviewBox = overview.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    return overviewBox.bottom <= actionBox.top || overviewBox.right <= actionBox.left || actionBox.right <= overviewBox.left;
  });
  await expect.poll(overviewPrecedesActions).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(overviewPrecedesActions).toBe(true);
  await expect(actionRow).toBeVisible();
  await expect(summary).toBeVisible();
});

test("compact web food detail keeps its safety guidance readable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "냉장고", exact: true }).click();
  await page.locator(".inventory-row").filter({ hasText: "시금치" }).click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  const warningCopy = detail.locator(".date-review-callout > span > small");
  await expect(warningCopy).toHaveText(/표시 날짜가 (?:오늘이에요|어제 지났어요|\d+일 지났어요|오늘이거나 지났어요)\. 보관 방법과 개봉 상태도 확인해 주세요\./);
  const warningLayout = await warningCopy.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(warningLayout.height).toBeLessThanOrEqual(warningLayout.lineHeight * 2 + 1);

  // The product row shows the food name on one line and keeps a 44px target.
  const productInfoAction = detail.getByRole("button", { name: "상품 정보 수정" });
  await expect(productInfoAction).toBeVisible();
  const productInfoLabelLayout = await productInfoAction.locator("strong").evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
  }));
  // line-height is "normal" here; two lines would be at least twice the font size.
  expect(productInfoLabelLayout.height).toBeLessThan(productInfoLabelLayout.fontSize * 2);
  // Read the settled sheet: the entry spring can leave a sub-pixel scale for a frame.
  await expect.poll(async () => (await productInfoAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // Storage saves on tap; there is never an unsaved-storage state to warn about.
  await expect(detail.getByRole("button", { name: /변경 저장/ })).toHaveCount(0);
  await detail.getByRole("radio", { name: "냉동" }).click();
  await expect(detail.getByRole("radio", { name: "냉동" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".toast")).toContainText("시금치를 냉동으로 옮겼어요.");
});
