import { expect, test, type Page } from "@playwright/test";

const DEMO_PATH = "/demos/rescue-meal/index.html";
const shotDirectory = process.env.RESCUE_MEAL_DEMO_SHOT_DIR;

function watchRuntime(page: Page) {
  const problems: string[] = [];
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (!url.startsWith(`${origin}/demos/rescue-meal/`)) problems.push(`request outside demo: ${url}`);
  });
  page.on("response", (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });
  return problems;
}

async function shot(page: Page, name: string) {
  if (!shotDirectory) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${shotDirectory}/${test.info().project.name}-${name}.png` });
}

test("receipt to pantry, first-use list, meal, cooking, and shopping work with sample data only", async ({ page }) => {
  const problems = watchRuntime(page);
  await page.goto(DEMO_PATH);
  const sheet = page.getByRole("dialog").last();

  await expect(page.getByTestId("demo-badge")).toContainText("예시 데이터로 체험 중");
  await expect(page.locator(".inventory-section .inventory-row, .inventory-list .inventory-row").first()).toBeAttached();
  await expect(page.locator(".priority-card").first()).toContainText("시금치");
  await shot(page, "01-home");

  // Register by sample receipt: no camera or upload control is offered.
  await page.locator(".add-food-button").first().click();
  await expect(sheet.locator(".capture-actions")).toBeHidden();
  await sheet.getByRole("button", { name: "예시 영수증 보기" }).click();
  await expect(sheet).toContainText("맛김치 500g");
  await expect(sheet).toContainText("소비기한은 미확인으로 저장돼요.");
  await expect(sheet.getByRole("button", { name: /식품 저장하기/ })).toBeDisabled();
  await shot(page, "02-receipt-review");
  await sheet.getByRole("button", { name: "내용이 맞아요" }).click();
  await sheet.getByRole("button", { name: /식품 저장하기/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "영수증에서 식품 3개를 목록에 추가했어요." })).toBeVisible();
  const rows = page.locator(".inventory-list .inventory-row");
  await expect(rows).toHaveCount(10);
  await expect(rows.filter({ hasText: "감자" })).toContainText("날짜 미확인");
  await shot(page, "03-after-receipt");

  // First-use list separates a printed date from an estimated reminder.
  const printedCard = page.locator(".priority-card").filter({ hasText: "시금치" });
  await expect(printedCard).toContainText("포장 소비기한");
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  await expect(sheet).toContainText("먹어도 되는지는");
  await shot(page, "04-priority-detail");
  await sheet.getByRole("button", { name: "닫기", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const estimated = page.locator(".inventory-list .inventory-row").filter({ hasText: "국산콩 두부" });
  await expect(estimated).toContainText("먼저 살펴볼 시점");
  await estimated.click();
  await expect(sheet).toContainText("이 날짜는 소비기한이 아니에요.");
  await sheet.getByRole("button", { name: "닫기", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Meal suggestion and cooking deducts stock.
  await page.getByRole("button", { name: "식단", exact: true }).click();
  await expect(sheet).toContainText("시금치 두부 닭가슴살 덮밥");
  await expect(sheet).toContainText("재료 3가지는 있고 1가지는 더 필요해요");
  await sheet.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(sheet.locator(".recipe-complete-button")).toBeDisabled();
  await shot(page, "05-meal-saved");
  await sheet.getByRole("button", { name: "포장지와 재료를 살펴봤어요" }).click();
  await sheet.locator(".recipe-complete-button").click();
  await expect(page.getByRole("status").filter({ hasText: "사용한 양만큼 보관 수량을 줄였어요." })).toBeVisible();
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: "닭가슴살" })).toContainText("1팩");
  await expect(rows.filter({ hasText: "시금치" })).toHaveCount(0);
  await shot(page, "06-after-cooking");

  // The next suggestion still lacks one ingredient: carry it to shopping, buy it, and stock it.
  await page.getByRole("button", { name: "식단", exact: true }).click();
  await sheet.getByRole("button", { name: "임시 저장", exact: true }).click();
  await sheet.getByRole("button", { name: "장보기 목록에 담기" }).click();
  const shopping = page.getByRole("dialog", { name: "장보기 목록" });
  await expect(shopping.locator(".shopping-sheet-item")).toContainText("대파");
  await shot(page, "07-shopping");
  await shopping.locator(".shopping-sheet-item").click();
  await shopping.getByRole("button", { name: "대파 식품 목록에 추가", exact: true }).click();
  await shopping.getByRole("button", { name: "냉장", exact: true }).click();
  await shopping.locator(".shopping-sheet-receive-submit").click();
  await expect(shopping).toContainText("식품 목록에 추가했어요");
  await shot(page, "08-shopping-received");
  await shopping.getByRole("button", { name: "닫기", exact: true }).first().click();
  // Closing shopping returns to the meal it was opened from.
  await expect(page.getByRole("dialog", { name: "오늘의 식단" })).toBeVisible();
  await page.getByRole("dialog", { name: "오늘의 식단" }).getByRole("button", { name: "닫기", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rows.filter({ hasText: "대파" })).toContainText("1단");

  // Food-safety boundary: the app never decides for the reader.
  const fullText = await page.locator("body").innerText();
  expect(fullText).not.toMatch(/safe_to_eat|먹어도 안전|안전하게 먹을 수 있/);

  // Restart returns the sample pantry and leaves no service worker behind.
  await page.getByRole("button", { name: "처음부터 다시 하기" }).click();
  await expect(page.locator(".priority-card").first()).toContainText("시금치");
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(7);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("every sample input path completes without a camera or upload", async ({ page }) => {
  const problems = watchRuntime(page);
  await page.goto(`${DEMO_PATH}?from=deep-link#inventory`);
  const sheet = page.getByRole("dialog").last();
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(7);

  await page.locator(".add-food-button").first().click();
  await sheet.locator("button,[role=tab]").filter({ hasText: /바코드/ }).first().click();
  await expect(sheet.getByRole("button", { name: "카메라로 스캔" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "예시 바코드 입력" }).click();
  await expect(sheet.locator(".barcode-candidate-list")).toBeVisible();
  await shot(page, "09-barcode-sample");

  await sheet.locator("button,[role=tab]").filter({ hasText: /라벨/ }).first().click();
  await sheet.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(sheet.locator(".label-result-provenance")).toBeVisible();
  await shot(page, "10-label-sample");

  await sheet.locator("button,[role=tab]").filter({ hasText: /직접 입력/ }).first().click();
  await shot(page, "11-manual");
  await sheet.getByRole("button", { name: "닫기", exact: true }).first().click();

  await page.locator(".connection-pill").click();
  await expect(sheet).toContainText("체험 화면에서는 로그인과 여러 기기 연결을 사용할 수 없어요.");
  await sheet.getByRole("button", { name: "계속 둘러보기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.locator(".notification-button").click();
  await expect(sheet).toContainText("알림만으로 먹어도 되는지는 알 수 없어요.");
  await shot(page, "12-notifications");
  await page.reload();
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(7);
  expect(problems).toEqual([]);
});
