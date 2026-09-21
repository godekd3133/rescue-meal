import { expect, test } from "@playwright/test";

test.skip(process.env.VITE_DEPLOYMENT_MODE !== "production", "production runtime contract only");

test("production boot never presents demo inventory when the API is unreachable", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 720 });
  await page.route("**/api/**", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/");

  await expect(page.locator(".connection-pill")).toHaveText("오프라인 · 임시 화면");
  await expect(page.getByRole("heading", { name: "재고 확인이 필요해요" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 식품 목록 확인 필요" })).toBeVisible();
  await expect(page.getByText("재고 확인이 필요해요").first()).toBeVisible();
  await expect(page.locator(".mini-summary")).toContainText("보관 수 확인 필요");
  await expect(page.locator(".mini-summary")).toContainText("우선순위 확인 필요");
  await expect(page.locator(".mini-summary")).not.toContainText("0개");
  await expect(page.getByText("아직 식품을 등록하지 않았어요")).toHaveCount(0);
  await expect(page.getByText("아직 등록된 식품이 없어요")).toHaveCount(0);
  await expect(page.getByText("시금치", { exact: true })).toHaveCount(0);
  await expect(page.getByText("국산콩 두부", { exact: true })).toHaveCount(0);
  await expect(page.getByText("닭가슴살", { exact: true })).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return {
      screen: rect("[data-testid=device-screen]"),
      callout: rect(".connection-retry-callout"),
      cta: rect(".meal-plan-button"),
      navigation: rect(".app-bottom-nav"),
    };
  });
  expect(layout.screen).toBeTruthy();
  expect(layout.callout).toBeTruthy();
  expect(layout.cta).toBeTruthy();
  expect(layout.navigation).toBeTruthy();
  expect(layout.cta!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
  expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
});
