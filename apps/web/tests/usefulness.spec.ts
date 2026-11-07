import { expect, test } from "@playwright/test";
import { gotoTab, shoppingScreen } from "./ia-helpers";

test("storage shortcuts clear previous review and search filters", async ({ page }) => {
  await page.goto("/");
  await gotoTab(page, "fridge");
  const reviewFilter = page.locator(".inventory-status-filters button").filter({ hasText: "확인 필요" });
  await reviewFilter.click();
  await expect(reviewFilter).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox").fill("시금치");
  await page.getByRole("searchbox").press("Tab");
  await gotoTab(page, "home");
  // One line per storage place on Home; the row opens 냉장고 filtered to that place.
  await page.getByRole("button", { name: /^냉동 식품 1개 보기/ }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  const frozenChip = page.getByRole("group", { name: "보관 위치 필터" }).getByRole("button", { name: "냉동", exact: true });
  await expect(frozenChip).toHaveAttribute("aria-pressed", "true");
  await expect(frozenChip).toBeFocused();
  await expect(page.locator(".inventory-row")).toHaveCount(1);
  await expect(page.locator(".inventory-row")).toContainText("닭가슴살");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("냉장고");
});

test("demo home makes the lifetime of the sample data explicit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toContainText("체험 중");
  await expect(page.locator(".home-demo-note")).toContainText("새로고침하면 사라져요");
});

test("shopping shows existing stock and preselects where that food is already stored", async ({ page }) => {
  await page.goto("/");
  // An empty list has no home card; the bottom navigation opens it.
  await page.getByTestId("shopping-nav").click();
  const shopping = shoppingScreen(page);
  await shopping.getByRole("textbox", { name: "살 것 이름" }).fill("시금치");
  await expect(shopping.locator(".shop-add-stock")).toContainText("1팩 냉장");
  await shopping.getByRole("textbox", { name: "살 것 이름" }).fill("시금치 1000.5g");
  await shopping.locator(".shop-add-submit").click();
  await shopping.locator(".shop-toggle").click();
  await shopping.getByRole("button", { name: "시금치 냉장고에 넣기", exact: true }).click();
  const panel = shopping.getByRole("form", { name: "시금치 냉장고에 넣기" });
  await expect(panel.getByRole("spinbutton")).toHaveValue("1000.5");
  await expect(panel.locator(".shop-qty-unit")).toContainText("g");
  // Storage starts where the same food already lives (시금치 is kept 냉장) and stays editable.
  await expect(panel.getByRole("button", { name: "냉장", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".shop-receive-summary")).toContainText("냉장");
  await panel.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(panel.locator(".shop-receive-submit")).toBeEnabled();
  await expect(panel.locator(".shop-receive-summary")).toContainText("냉동");
  await panel.locator(".shop-receive-submit").click();
  await shopping.getByRole("button", { name: "식품 보기", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "시금치", exact: true });
  await expect(detail.locator(".food-top-copy")).toContainText("1,000.5g");
  await expect(detail.getByRole("radio", { name: "냉동", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("empty filtered search offers query editing and preserves it when filters are cleared", async ({ page }) => {
  await page.goto("/");
  await gotoTab(page, "fridge");
  const query = "닭가슴살";
  const search = page.getByRole("searchbox");
  const storage = page.getByRole("group", { name: "보관 위치 필터" });
  await storage.getByRole("button", { name: "냉장", exact: true }).click();
  await search.fill(query);
  await search.press("Tab");
  const empty = page.locator(".inventory-empty-state");
  await expect(empty).toContainText("검색 결과가 없어요");
  await expect(empty.getByRole("button", { name: "검색어 수정", exact: true })).toBeVisible();
  await empty.getByRole("button", { name: "검색어 수정", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue(query);
  expect(await search.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, query.length]);
  await empty.getByRole("button", { name: "필터 해제", exact: true }).click();
  // Places are one-or-none: clearing the filter leaves no place chip selected.
  await expect(storage.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(search).toHaveValue(query);
  await expect(page.locator(".inventory-row")).toHaveCount(1);
  await expect(page.locator(".inventory-row")).toContainText(query);
});
