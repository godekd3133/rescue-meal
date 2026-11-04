import { expect, test } from "@playwright/test";

test("storage shortcuts clear previous review and search filters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const reviewFilter = page.locator(".inventory-status-filters button").filter({ hasText: "날짜·보관 확인" });
  await reviewFilter.click();
  await expect(reviewFilter).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox").fill("시금치");
  await page.getByRole("searchbox").press("Tab");
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await page.getByRole("button", { name: "냉동 보관 식품 1개 보기" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.locator(".filter-select-wrap select")).toHaveValue("냉동");
  await expect(page.locator(".filter-select-wrap select")).toBeFocused();
  await expect(page.locator(".inventory-row")).toHaveCount(1);
  await expect(page.locator(".inventory-row")).toContainText("닭가슴살");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
});

test("demo home makes the lifetime of the sample data explicit", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toContainText("체험 중");
  await expect(page.locator(".home-demo-note")).toContainText("새로고침하면 사라져요");
});

test("shopping shows existing stock and requires an explicit storage choice", async ({ page }) => {
  await page.goto("/");
  // An empty list has no home card; the bottom navigation opens it.
  await page.getByTestId("shopping-nav").click();
  const shopping = page.getByRole("dialog", { name: "장보기 목록" });
  await shopping.getByRole("textbox", { name: "직접 추가 상품명" }).fill("시금치");
  await expect(shopping.locator(".shopping-sheet-manual-stock")).toContainText("1팩 냉장");
  await shopping.getByRole("spinbutton", { name: "직접 추가 수량" }).fill("1000.5");
  await shopping.getByRole("textbox", { name: "직접 추가 단위" }).fill("g");
  await shopping.locator(".shopping-sheet-manual-submit").click();
  await shopping.locator(".shopping-sheet-item").click();
  await shopping.getByRole("button", { name: "시금치 식품 목록에 추가", exact: true }).click();
  const panel = shopping.getByRole("form", { name: "시금치 식품 목록에 추가" });
  await expect(panel.getByRole("spinbutton")).toHaveValue("1000.5");
  await expect(panel.locator(".shopping-sheet-quantity-with-unit")).toContainText("g");
  await expect(panel.locator(".shopping-sheet-receive-submit")).toBeDisabled();
  await panel.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(panel.locator(".shopping-sheet-receive-submit")).toBeEnabled();
  await expect(panel.locator(".shopping-sheet-save-summary")).toContainText("냉동");
  await panel.locator(".shopping-sheet-receive-submit").click();
  await shopping.getByRole("button", { name: "식품 보기", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "시금치", exact: true });
  await expect(detail.locator(".detail-hero-copy")).toContainText("1,000.5g");
  await expect(detail.getByRole("button", { name: "냉동", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("empty filtered search offers query editing and preserves it when filters are cleared", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const query = "닭가슴살";
  const search = page.getByRole("searchbox");
  const storage = page.locator(".filter-select-wrap select");
  await storage.selectOption("냉장");
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
  await expect(storage).toHaveValue("전체");
  await expect(search).toHaveValue(query);
  await expect(page.locator(".inventory-row")).toHaveCount(1);
  await expect(page.locator(".inventory-row")).toContainText(query);
});
