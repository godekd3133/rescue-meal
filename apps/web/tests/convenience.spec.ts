import { expect, test } from "@playwright/test";
import { chooseAddMethod } from "./add-flow-helpers";
import { gotoTab, mealScreen, openFridgeFood, shoppingScreen } from "./ia-helpers";

test("shopping navigation opens directly from inventory and returns to it", async ({ page }) => {
  await page.goto("/");
  await gotoTab(page, "fridge");
  await page.getByTestId("shopping-nav").click();
  // 장보기 is a screen over the tab bar's content area, not a dialog.
  await expect(shoppingScreen(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("shopping-nav")).toHaveAttribute("aria-current", "page");
  await gotoTab(page, "fridge");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
  await expect(page.locator(".inventory-row").first()).toBeVisible();
  // Four destinations plus the centre add button.
  await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button")).toHaveCount(5);
  await expect(page.getByTestId("nav-add-food")).toHaveAccessibleName("식품 추가하기");
});

test("manual name and unit shortcuts only change the draft and preserve decimals", async ({ page }) => {
  await page.goto("/");
  await gotoTab(page, "fridge");
  await page.getByRole("button", { name: "식품 추가하기", exact: true }).click();
  await chooseAddMethod(page, "영수증");
  await page.getByRole("tab", { name: "직접 입력", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("group", { name: "추천 이름" }).getByRole("button", { name: "시금치", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "식품 이름", exact: true })).toHaveValue("시금치");
  await dialog.getByRole("textbox", { name: "수량", exact: true }).fill("0.50개");
  await dialog.getByRole("button", { name: "수량 단위 팩", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "수량", exact: true })).toHaveValue("0.50팩");
  await expect(page.locator(".inventory-row")).toHaveCount(7);
  await dialog.getByRole("textbox", { name: "수량", exact: true }).fill("");
  await expect(dialog.getByRole("button", { name: "수량 단위 팩", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "식품 추가하기", exact: true })).toBeDisabled();
});

test("one pack can be halved without bypassing the date review confirmation", async ({ page }) => {
  await page.goto("/");
  const detail = await openFridgeFood(page, "시금치");
  await detail.getByRole("button", { name: "절반 0.5팩", exact: true }).click();
  await expect(detail.getByRole("textbox", { name: "기록할 수량", exact: true })).toHaveValue("0.5");
  await expect(detail.locator(".detail-quantity-note")).toContainText("0.5팩 남아요");
  await detail.getByRole("textbox", { name: "기록할 수량", exact: true }).fill("2");
  await expect(detail.locator(".detail-consume-action")).toBeDisabled();
  await detail.getByRole("button", { name: "절반 0.5팩", exact: true }).click();
  await detail.locator(".detail-consume-action").click();
  await expect(detail.getByRole("group", { name: "이번 소비 기록" })).toContainText("0.5팩");
  await expect(detail.locator(".consume-confirm-remaining")).toContainText("0.5팩");
  await expect(page.locator(".inventory-row").filter({ hasText: "시금치" })).toContainText("1팩");
  await detail.getByRole("button", { name: "먹었어요", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(page.locator(".inventory-row").filter({ hasText: "시금치" })).toContainText("0.5팩");
});

test("meal ingredient exclusion restores the edited amount and blocks an empty completion", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "오늘 뭐 먹지", exact: true }).click();
  const meal = mealScreen(page);
  await meal.getByRole("button", { name: "임시 저장", exact: true }).click();
  const spinach = meal.getByRole("textbox", { name: "시금치 사용할 양", exact: true });
  await spinach.fill("0.5");
  await meal.getByRole("button", { name: "시금치 이번엔 안 씀", exact: true }).click();
  await expect(spinach).toHaveValue("0");
  await meal.getByRole("button", { name: "시금치 다시 사용", exact: true }).click();
  await expect(spinach).toHaveValue("0.5");
  for (const name of ["시금치", "국산콩 두부", "닭가슴살"]) {
    await meal.getByRole("button", { name: `${name} 이번엔 안 씀`, exact: true }).click();
  }
  await expect(meal.locator(".recipe-consumption-choice-skipped")).toHaveCount(3);
  await expect(meal.locator(".recipe-complete-button")).toBeDisabled();
});
