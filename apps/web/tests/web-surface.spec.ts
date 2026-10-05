import { expect, test } from "@playwright/test";

test("home pantry shortcuts stay on one line and the meal action fits at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.locator(".pantry-shortcuts button")).toHaveCount(3);
  const shortcutSizes = await page.locator(".pantry-shortcuts button").evaluateAll((buttons) => buttons.map((button) => ({
    width: button.clientWidth,
    contentWidth: button.scrollWidth,
    labelWhiteSpace: getComputedStyle(button.querySelector("span:not(.storage-dot)")!).whiteSpace,
    height: button.getBoundingClientRect().height,
  })));
  for (const size of shortcutSizes) {
    expect(size.contentWidth).toBeLessThanOrEqual(size.width);
    expect(size.labelWhiteSpace).toBe("nowrap");
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
  const connectionPill = page.getByRole("button", { name: /연결 상태: .* · 계정 열기/ });
  await expect(connectionPill).toBeVisible();
  await expect(connectionPill).toHaveAttribute("title", /연결 상태:/);

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

  await page.getByRole("button", { name: "오늘 먼저 확인할 식품 3개, 식품 목록 열기" }).click();
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
  await expect(page.getByTestId("web-runtime-surface")).toHaveCSS("background-color", "rgb(16, 20, 25)");
  await expect(page.locator(".app-shell-web")).toHaveCSS("background-color", "rgb(16, 20, 25)");
});

test("web home keeps review guidance before meal actions on mobile and after them on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");

  const summary = page.locator(".trust-card");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAccessibleName("포장지 날짜를 살펴볼 식품 2개. 포장지 날짜와 보관 방법을 살펴봐 주세요. 확인할 식품 목록 보기");
  const actionRow = page.locator(".home-action-row");
  await expect.poll(() => page.evaluate(() => {
    const trust = document.querySelector(".trust-card");
    const action = document.querySelector(".home-action-row");
    return Boolean(trust && action && (trust.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => page.evaluate(() => {
    const trust = document.querySelector(".trust-card");
    const action = document.querySelector(".home-action-row");
    return Boolean(trust && action && (trust.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(false);
  await expect(actionRow).toBeVisible();
  await expect(summary).toBeVisible();
});

test("compact web food detail keeps its safety guidance readable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  const warningCopy = detail.locator(".date-review-callout-compact > span:nth-child(2) > small");
  await expect(warningCopy).toHaveText("표시 날짜가 오늘이거나 지났어요. 보관·개봉 상태도 확인해 주세요.");
  const warningLayout = await warningCopy.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(warningLayout.height).toBeLessThanOrEqual(warningLayout.lineHeight * 2 + 1);

  const productInfoHint = detail.locator(".product-info-edit-button small");
  await expect(productInfoHint).toHaveText("상품명이 다르면 고칠 수 있어요.");
  await expect(productInfoHint).toHaveCSS("font-size", "12px");
  const hintLayout = await productInfoHint.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(hintLayout.height).toBeLessThanOrEqual(hintLayout.lineHeight + 1);
  await expect(detail.locator(".detail-save-hint")).toContainText("보관 위치·개봉 상태를 바꾸면 저장할 수 있어요.");
});
