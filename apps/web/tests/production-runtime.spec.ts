import { expect, test } from "@playwright/test";

test.skip(process.env.VITE_DEPLOYMENT_MODE !== "production", "production runtime contract only");

test("production boot never presents demo inventory when the API is unreachable", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/");

  await expect(page.locator(".connection-pill")).toHaveText("오프라인 · 임시 화면");
  await expect(page.getByRole("heading", { name: "오늘 먼저 먹기 0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(page.getByText("아직 식품을 등록하지 않았어요").first()).toBeVisible();
  await expect(page.getByText("시금치", { exact: true })).toHaveCount(0);
  await expect(page.getByText("국산콩 두부", { exact: true })).toHaveCount(0);
  await expect(page.getByText("닭가슴살", { exact: true })).toHaveCount(0);
});
