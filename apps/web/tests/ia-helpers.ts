import { expect, type Page } from "@playwright/test";

export type AppTab = "home" | "fridge" | "meal" | "shopping";

/** Bottom bar: 홈 · 냉장고 · (+) · 식단 · 장보기. 식단/장보기 are screens, not dialogs. */
export async function gotoTab(page: Page, tab: AppTab) {
  await page.locator(`.app-bottom-nav [data-nav-tab="${tab}"]`).click();
  await expect(page.locator(`.app-bottom-nav [data-nav-tab="${tab}"]`)).toHaveAttribute("aria-current", "page");
}

export function mealScreen(page: Page) {
  return page.getByRole("region", { name: "오늘의 식단" });
}

/** 요리 모드: the near-full-height sheet that holds the steps and the amount check. */
export function cookingSheet(page: Page) {
  return page.getByRole("dialog").filter({ has: page.locator(".cook-mode") });
}

/** The time/serving pickers sit folded behind the 식단 filter chips. */
export async function openMealConditions(page: Page) {
  const meal = mealScreen(page);
  const chip = meal.getByRole("button", { name: /^조리 시간 / });
  if (await chip.getAttribute("aria-expanded") !== "true") await chip.click();
  await expect(meal.getByRole("group", { name: "조리 가능 시간" })).toBeVisible();
}

export function shoppingScreen(page: Page) {
  return page.getByRole("region", { name: "장보기 목록" });
}

/** Opens a food detail from the 냉장고 list (Home no longer repeats the full list). */
export async function openFridgeFood(page: Page, name: string) {
  await gotoTab(page, "fridge");
  await page.locator(".inventory-row").filter({ hasText: name }).first().click();
  const detail = page.getByRole("dialog", { name, exact: true });
  await expect(detail).toBeVisible();
  return detail;
}

/** The theme toggle lives in the 나 sheet; switch only when needed, then close the sheet. */
export async function setThemeFromMe(page: Page, theme: "light" | "dark") {
  if (await page.locator("html").getAttribute("data-rescue-theme") === theme) return;
  await page.locator(".connection-pill").click();
  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
  await page.getByTestId("bottom-sheet").locator(".sheet-close-button").click();
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
}
