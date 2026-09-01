import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Rescue Meal home opens detail and saves a storage change", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "오늘 먼저 먹기 3" })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("데모 모드");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "냉동", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect(page.getByRole("status")).toHaveText("보관 상태를 저장했어요");
  await expect(page.getByRole("button", { name: /시금치 개봉됨 .* 냉동/ })).toBeVisible();
});

test("account sheet explains guest workspace separation", async ({ page }) => {
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "로그인" })).toBeVisible();
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await expect(dialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
  await expect(dialog.getByText(/게스트 기록은 계정에 자동 병합하지 않아요/)).toBeVisible();
});

test("receipt review only commits selected candidates", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기 영수증/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await expect(page.getByRole("button", { name: "3개 항목 반영하기" })).toBeVisible();

  await page.getByRole("button", { name: "맛타리버섯 2팩 · 3,980원 확인 필요" }).click();
  await expect(page.getByRole("button", { name: "2개 항목 반영하기" })).toBeVisible();
  await page.getByRole("button", { name: "2개 항목 반영하기" }).click();

  await expect(page.getByRole("status")).toHaveText("2개 항목을 검토 후 반영했어요");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("label date remains a candidate until the user confirms it", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기 영수증/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  await page.getByRole("button", { name: "샘플 라벨 인식" }).click();

  await expect(page.getByText("유효년월일 2026.09.02")).toBeVisible();
  await expect(page.getByText("표시 후보")).toBeVisible();
  await page.getByRole("button", { name: "확인 후 반영" }).click();
  await expect(page.getByRole("status")).toHaveText(/시금치/);
});

test("barcode flow exposes camera scanning and keeps manual lookup fallback", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기 영수증/ }).click();
  await page.getByRole("tab", { name: "바코드" }).click();
  await expect(page.getByRole("button", { name: "카메라로 스캔" })).toBeVisible();

  await page.getByRole("textbox", { name: "바코드 숫자" }).fill("8801114167523");
  await page.getByRole("button", { name: "상품 후보 조회" }).click();
  await expect(page.getByText("풀무원 국산콩 두부 · 상품 후보 1개")).toBeVisible();
  await expect(page.getByText("소비기한은 포장지의 날짜를 촬영해 확인해 주세요.")).toBeVisible();
});

test("barcode camera shows a manual fallback when media devices are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });
  await page.reload();
  await page.getByRole("button", { name: /식품 추가하기 영수증/ }).click();
  await page.getByRole("tab", { name: "바코드" }).click();
  await page.getByRole("button", { name: "카메라로 스캔" }).click();

  await expect(page.getByText("카메라를 사용할 수 없어요")).toBeVisible();
  await page.getByRole("button", { name: "수동 입력으로 계속" }).click();
  await expect(page.getByRole("textbox", { name: "바코드 숫자" })).toBeVisible();
});

test("estimated date can be confirmed with an explicit date meaning", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();

  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill("2026-09-12");
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부 날짜를 사용자 확인으로 저장했어요");
  await expect(inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모 9월 12일/ })).toBeVisible();
});

test("partial storage move splits a multi-quantity food into two lots", async ({ page }) => {
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 8" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1팩/ })).toHaveCount(2);
});

test("partial discard requires confirmation and preserves the remaining quantity", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 · 2팩/ }).click();
  const dialog = page.getByRole("dialog", { name: "맛타리버섯" });
  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await dialog.getByRole("button", { name: "상태가 이상해 폐기하기" }).click();
  await expect(dialog.getByRole("alert")).toContainText("1팩을 폐기할까요?");
  await dialog.getByRole("button", { name: "폐기 기록" }).click();

  await expect(page.getByRole("status")).toHaveText("맛타리버섯 폐기 기록을 남겼어요");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 · 1팩/ })).toBeVisible();
});

test("inventory filter narrows the list by storage location", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("combobox", { name: "보관 위치 필터" }).selectOption({ label: "냉동만" });

  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산/ })).toHaveCount(0);
});

test("recipe sheet previews the pantry, saves a recipe, and records completion", async ({ page }) => {
  await page.getByRole("button", { name: /지금 있는 재료로 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });

  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.getByText("필요한 재료")).toBeVisible();
  await dialog.getByRole("button", { name: "레시피 보기" }).click();
  await expect(dialog.getByText("조리 순서")).toBeVisible();
  await expect(dialog.getByText("안전 메모")).toBeVisible();

  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("오늘의 식단을 저장했어요");
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  await expect(page.getByRole("heading", { name: "내 식품 목록 5" })).toBeVisible();
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1팩/ })).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("식단을 완료하고 재고를 갱신했어요");
});
