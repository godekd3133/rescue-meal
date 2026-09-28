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
  await expect(page.locator(".connection-retry-callout")).toContainText("임시 화면은 읽기 전용이에요.");
  await expect(page.locator(".connection-retry-callout")).toContainText("오프라인 변경은 저장하거나 전송하지 않아요.");
  await expect(page.locator(".rescue-status-description")).toHaveText("최신 재고를 불러오지 못했어요.");
  await expect(page.locator(".rescue-status-card")).toHaveAttribute("aria-label", "재고를 확인할 수 없어요, 식품 목록 열기");
  await expect(page.locator(".priority-empty-copy strong")).toHaveText("오늘의 순서를 불러오지 못했어요");
  await expect(page.locator(".priority-empty-copy small")).toHaveText("연결되면 먼저 살펴볼 식품을 보여드려요.");
  await expect(page.locator(".inventory-empty-copy strong")).toHaveText("식품 목록을 불러오지 못했어요");
  await expect(page.locator(".inventory-empty-copy small")).toHaveText("연결되면 보관 중인 식품과 날짜를 확인할 수 있어요.");
  await expect(page.locator(".meal-plan-button small")).toHaveText("최신 재고를 확인한 뒤 오늘 식단을 준비해요.");
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

  await page.getByRole("button", { name: "식품 스캔·추가 열기" }).click();
  const intake = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(intake).toBeVisible();
  await expect(intake.getByRole("button", { name: "샘플 영수증으로 시작" })).toHaveCount(0);

  await intake.getByRole("tab", { name: "바코드" }).click();
  const barcodeInput = intake.getByRole("textbox", { name: "바코드 숫자" });
  await expect(barcodeInput).toHaveAttribute("placeholder", "바코드 숫자를 입력해 주세요");
  await expect(intake.getByRole("button", { name: "예시 바코드 입력" })).toHaveCount(0);
  await barcodeInput.press("Enter");
  await expect(intake).toContainText("바코드 숫자를 입력해 주세요");

  await intake.getByRole("tab", { name: "라벨" }).click();
  await expect(intake.getByRole("button", { name: "샘플 라벨 인식" })).toHaveCount(0);
});
