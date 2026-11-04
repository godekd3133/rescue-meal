import { expect, test } from "@playwright/test";

test("home pantry shortcuts stay on one line and the meal action fits at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  // The storage shortcuts are now the fridge door's shelf label buttons (one per storage).
  await expect(page.locator(".pantry-shortcuts .fridge-shelf-label")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "냉장 보관 식품 5개 보기" })).toBeVisible();
  const shortcutSizes = await page.locator(".pantry-shortcuts .fridge-shelf-label").evaluateAll((buttons) => buttons.map((button) => {
    const label = button.querySelector<HTMLElement>("span")!;
    return {
      width: button.clientWidth,
      contentWidth: button.scrollWidth,
      labelHeight: label.getBoundingClientRect().height,
      labelFontSize: Number.parseFloat(getComputedStyle(label).fontSize),
      height: button.getBoundingClientRect().height,
    };
  }));
  for (const size of shortcutSizes) {
    expect(size.contentWidth).toBeLessThanOrEqual(size.width);
    // One line: a wrapped label would be at least twice the font size tall.
    expect(size.labelHeight).toBeLessThan(size.labelFontSize * 2);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  const stickerSizes = await page.locator(".pantry-shortcuts .fridge-sticker").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()));
  expect(stickerSizes.length).toBeGreaterThan(0);
  for (const size of stickerSizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  const mealAction = await page.locator(".meal-plan-button").boundingBox();
  const navigation = await page.locator(".app-bottom-nav").boundingBox();
  expect(mealAction!.y + mealAction!.height).toBeLessThan(navigation!.y);
  const navItems = await page.locator(".app-bottom-nav-item").evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    return { x: rect.x, right: rect.right, width: rect.width, height: rect.height };
  }));
  expect(navItems).toHaveLength(4);
  for (const item of navItems) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.right).toBeLessThanOrEqual(320);
  }
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

  const inventoryToolbar = page.locator(".inventory-toolbar");
  await expect(inventoryToolbar).toBeVisible();
  await expect(inventoryToolbar).toHaveCSS("position", "sticky");

  const navigation = await page.locator(".app-bottom-nav").boundingBox();
  expect(navigation, "web navigation has no bounding box").toBeTruthy();
  expect(navigation!.y).toBeGreaterThan(surface!.y + surface!.height * 0.8);
  expect(Math.abs(navigation!.y + navigation!.height - (surface!.y + surface!.height))).toBeLessThanOrEqual(1);

  // The priority section's food-list action is now labelled "식품 찾기".
  await page.getByRole("button", { name: "식품 찾기", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect.poll(
    () => page.locator(".inventory-section").evaluate((element) => element.getBoundingClientRect().top),
    { timeout: 2_000 },
  ).toBeLessThan(1_000);

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-testid=mobile-scroll]")?.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "auto" });
  });
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");

  const scrollTopBeforeDetail = await page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop);
  await page.locator(".inventory-row").first().click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "시금치" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(scrollTopBeforeDetail - 1);
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(scrollTopBeforeDetail + 1);

  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-testid=mobile-scroll]")?.scrollTo({ top: 0, behavior: "auto" });
  });
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");

  await page.getByRole("button", { name: "오늘 식단 만들기" }).click();
  await expect(page.getByRole("dialog", { name: "오늘의 식단" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식단");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "오늘의 식단" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");

  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await page.getByRole("button", { name: "식단", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "오늘의 식단" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식단");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "오늘의 식단" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
});

test("web surface carries the selected dark theme through the outer runtime shell", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem("rescue-meal.theme"));
  await page.goto("/");
  await page.getByTestId("theme-toggle").click();

  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(page.getByTestId("web-runtime-surface")).toHaveCSS("background-color", "rgb(20, 27, 22)");
  await expect(page.locator(".app-shell-web")).toHaveCSS("background-color", "rgb(20, 27, 22)");
});

test("web home keeps the fridge door before meal actions on mobile and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  // The fridge door replaced the trust card and freshness overview as the review entry point.
  await expect(page.locator(".trust-card")).toHaveCount(0);
  await expect(page.locator(".freshness-overview")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /^오늘 구할 음식 \d+개$/ })).toBeVisible();
  const summary = page.locator(".fridge-door");
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("button", { name: /^시금치, 표시 날짜에서 \d+일 지남$/ })).toHaveClass(/freshness-past/);
  const actionRow = page.locator(".home-action-row");
  const overviewPrecedesActions = () => page.evaluate(() => {
    const overview = document.querySelector(".fridge-door");
    const action = document.querySelector(".home-action-row");
    if (!overview || !action || !(overview.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    // Shelves must not run under the action row.
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
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  const warningCopy = detail.locator(".date-review-callout-compact > span:nth-child(2) > small");
  await expect(warningCopy).toHaveText(/표시 날짜가 (?:오늘이에요|어제 지났어요|\d+일 지났어요|오늘이거나 지났어요)\. 보관 방법과 개봉 상태도 확인해 주세요\./);
  const warningLayout = await warningCopy.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(warningLayout.height).toBeLessThanOrEqual(warningLayout.lineHeight * 2 + 1);

  // The product-info action no longer carries a helper line; its label names the action and must stay on one line.
  await expect(detail.locator(".product-info-edit-button small")).toHaveCount(0);
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
  // The unsaved-storage note appears only once a storable change exists.
  await expect(detail.locator(".detail-save-hint")).toHaveCount(0);
  await detail.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(detail.locator(".detail-save-hint")).toContainText("저장하지 않고 닫으면 보관 상태가 바뀌지 않아요.");
  await expect(detail.locator(".detail-save-hint")).toHaveCSS("font-size", "12px");
});
