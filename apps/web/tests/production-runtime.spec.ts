import { expect, test } from "@playwright/test";

test.skip(process.env.VITE_DEPLOYMENT_MODE !== "production", "production runtime contract only");

test("production boot never presents demo inventory when the API is unreachable", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 720 });
  await page.route("**/api/**", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/");

  await expect(page.locator(".connection-pill")).toHaveText("오프라인");
  await expect(page.getByRole("heading", { name: "식품 목록을 불러오지 못했어요", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 식품 목록을 불러오지 못했어요" })).toBeVisible();
  await expect(page.locator(".connection-retry-callout")).toContainText("인터넷에 연결되지 않았어요");
  await expect(page.locator(".connection-retry-callout")).toContainText("식품 목록을 불러오지 못했어요.");
  await expect(page.locator(".trust-card")).toHaveAttribute("data-trust-state", "neutral");
  await expect(page.locator(".trust-card strong")).toHaveText("먼저 살펴볼 날짜는 소비기한이 아니에요");
  await expect(page.locator(".trust-card small")).toHaveText("포장지 날짜와 식품 상태를 보고 직접 판단해 주세요.");
  await expect(page.locator(".priority-empty-copy strong")).toHaveText("식품 목록을 불러오지 못했어요");
  await expect(page.locator(".priority-empty-copy small")).toHaveText("연결되면 먼저 살펴볼 식품을 보여드려요.");
  await expect(page.locator(".inventory-empty-copy strong")).toHaveText("인터넷에 연결되지 않았어요");
  await expect(page.locator(".inventory-empty-copy small")).toHaveText("다시 연결하면 식품 목록을 불러올 수 있어요.");
  await expect(page.locator(".meal-plan-button small")).toHaveText("인터넷에 다시 연결한 뒤 식단을 만들 수 있어요.");
  await expect(page.locator(".mini-summary")).toContainText("식품 목록을 볼 수 없어요");
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

  await page.getByRole("button", { name: "식품 목록에 추가" }).click();
  const intake = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(intake).toBeVisible();
  await expect(intake.getByRole("button", { name: "샘플 영수증으로 시작" })).toHaveCount(0);

  await intake.getByRole("tab", { name: "바코드" }).click();
  const barcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  const barcodeInput = barcodeDialog.getByRole("textbox", { name: "바코드 숫자" });
  await expect(barcodeInput).toHaveAttribute("placeholder", "바코드 숫자를 입력해 주세요");
  await expect(barcodeDialog.getByRole("button", { name: "예시 바코드 입력" })).toHaveCount(0);
  await barcodeInput.press("Enter");
  await expect(barcodeDialog).toContainText("바코드 숫자를 입력해 주세요");

  await barcodeDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" })).toHaveCount(0);
});

test("production label intake never exposes the demo result shortcut", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "식품 목록에 추가" }).click();

  const intake = page.getByRole("dialog", { name: "영수증으로 추가" });
  await intake.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" })).toHaveCount(0);
});
