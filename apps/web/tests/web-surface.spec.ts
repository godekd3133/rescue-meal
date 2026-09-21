import { expect, test } from "@playwright/test";

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

  await page.getByRole("button", { name: "확인하고 오늘 식단 만들기" }).click();
  await expect(page.getByRole("dialog", { name: "오늘의 Rescue Meal" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식단");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "오늘의 Rescue Meal" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");

  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await page.getByRole("button", { name: "식단", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "오늘의 Rescue Meal" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식단");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "오늘의 Rescue Meal" })).toHaveCount(0);
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
