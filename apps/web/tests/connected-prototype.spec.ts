import { expect, test } from "@playwright/test";

test("connected app loads the API-backed planner and saves the selected recipe", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();

  await page.getByRole("button", { name: /지금 있는 재료로 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.getByText("필요한 재료")).toBeVisible();
  await expect(dialog.getByText("부족한 재료")).toHaveCount(0);

  await dialog.getByRole("button", { name: "레시피 보기" }).click();
  await expect(dialog.getByText("조리 순서")).toBeVisible();
  await expect(dialog.getByText("안전 메모")).toBeVisible();

  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("오늘의 식단을 저장했어요");
  await dialog.getByRole("button", { name: "식단 기록 보기" }).click();
  await expect(dialog.locator(".recipe-audit")).toContainText("식단 저장");
  await expect(dialog.locator(".recipe-audit")).toContainText(/snapshot/i);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /지금 있는 재료로 식단 만들기/ }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(reopenedDialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  const chickenUsage = reopenedDialog.getByRole("spinbutton", { name: "닭가슴살 사용량" });
  await chickenUsage.fill("0.5");
  await expect(chickenUsage).toHaveValue("0.5");
  await reopenedDialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 5" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1\.5팩/ })).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("식단을 완료하고 재고를 갱신했어요");
});
