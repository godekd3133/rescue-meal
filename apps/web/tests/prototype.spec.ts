import { expect, test } from "@playwright/test";
import { isStaleLabelLotTarget } from "../src/labelLotSelection.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Rescue Meal home opens detail and saves a storage change", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  const eyebrowParts = new Intl.DateTimeFormat("ko-KR", { weekday: "long", month: "long", day: "numeric" }).formatToParts(new Date());
  const expectedEyebrow = `${eyebrowParts.find((part) => part.type === "weekday")?.value ?? "오늘"}, ${eyebrowParts.find((part) => part.type === "month")?.value ?? ""} ${eyebrowParts.find((part) => part.type === "day")?.value ?? ""}`;
  await expect(page.locator(".eyebrow")).toHaveText(expectedEyebrow);
  await expect(page.getByRole("heading", { name: "먼저 살펴볼 식품 3개" })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("게스트");
  await expect(page.locator(".trust-card")).toHaveAttribute("data-trust-state", "needs-review");
  await expect(page.locator(".trust-card strong")).toHaveText("포장지 날짜를 살펴볼 식품 2개");
  await expect(page.locator(".trust-card small")).toHaveText("포장지 날짜와 보관 방법을 살펴봐 주세요.");
  const spinachPriorityCard = page.locator(".priority-card").filter({ hasText: "시금치" });
  await expect(spinachPriorityCard.locator(".date-source")).toHaveText("포장 소비기한");
  await expect(spinachPriorityCard.locator(".date-source")).not.toHaveClass(/date-source-warning/);
  await expect(spinachPriorityCard.locator(".priority-date small")).toHaveText("날짜 확인");
  await expect(spinachPriorityCard.locator(".priority-date small")).toHaveAttribute("title", "조리 전 날짜 확인");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).locator(".date-source")).toHaveText("먼저 살펴볼 시점");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).locator(".priority-date small")).toHaveText("먼저 살펴보기");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" })).toHaveAttribute("data-priority-state", "needs-review");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" })).toHaveAttribute("data-priority-state", "use-next");
  await expect(page.locator(".meal-plan-button")).toContainText("날짜나 보관 방법을 살펴볼 식품 1개");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(dialog.locator(".detail-hero-copy p")).toHaveText("국내산 시금치 · 남은 1팩");
  await expect(dialog.locator(".date-review-callout")).toContainText("조리 전 확인이 필요해요");
  await expect(dialog.locator(".date-review-callout")).toContainText("현재 보관·개봉 상태도 함께 확인해 주세요.");
  await expect(dialog.locator(".date-review-callout")).toHaveAttribute("aria-live", "polite");
  await expect(dialog.locator(".detail-note")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await expect(dialog.locator(".date-edit-button-compact")).toHaveText("날짜 다시 확인");
  const dateReviewCopyLayout = await dialog.locator(".date-review-callout > span").nth(1).evaluate((element) => {
    const heading = element.querySelector("strong");
    const description = element.querySelector("small");
    return {
      display: getComputedStyle(element).display,
      headingBottom: heading?.getBoundingClientRect().bottom ?? 0,
      descriptionTop: description?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(dateReviewCopyLayout.display).toBe("grid");
  expect(dateReviewCopyLayout.descriptionTop).toBeGreaterThanOrEqual(dateReviewCopyLayout.headingBottom);
  await dialog.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "냉동", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect(page.getByRole("status")).toHaveText("보관 위치를 저장했어요.");
  await expect(page.getByRole("button", { name: /시금치 개봉됨 .* 냉동/ })).toBeVisible();
});

test("home theme toggle switches between the selected light and dark surfaces", async ({ page }) => {
  const toggle = page.getByTestId("theme-toggle");

  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", "현재 라이트모드, 다크모드로 전환");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "현재 다크모드, 라이트모드로 전환");
  await expect(page.locator(".meal-plan-button")).toHaveCSS("background-color", "rgb(111, 141, 255)");
  await expect(page.locator(".trust-card")).toHaveCSS("background-color", "rgba(27, 34, 43, 0.88)");
  await expect(page.locator(".trust-icon")).toHaveCSS("color", "rgb(255, 128, 111)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#101419");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#101419");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f2f4f6");
});

test("home status summary opens the food list as the primary next step", async ({ page }) => {
  const statusCard = page.getByRole("button", { name: "오늘 먼저 확인할 식품 3개, 식품 목록 열기" });
  await expect(statusCard).toBeVisible();
  await statusCard.click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".inventory-toolbar")).toBeVisible();
});

test("home safety summary counts all review foods and opens their filtered list", async ({ page }) => {
  const safetySummary = page.locator(".trust-card");
  await expect(page.locator(".inventory-review-guide")).toHaveCount(0);
  await expect(safetySummary).toHaveAttribute("data-trust-state", "needs-review");
  await expect(safetySummary).toHaveAttribute("aria-label", /확인할 식품 목록 보기/);
  await expect(safetySummary.locator("strong")).toHaveText("포장지 날짜를 살펴볼 식품 2개");
  await expect(safetySummary).toContainText("포장지 날짜와 보관 방법을 살펴봐 주세요.");

  await safetySummary.click();

  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  const reviewFilter = page.locator(".inventory-status-filters button").filter({ hasText: "날짜·보관 확인" });
  await expect(reviewFilter).toHaveAttribute("aria-pressed", "true");
  await expect(reviewFilter).toBeFocused();
  await expect(reviewFilter).toContainText("2");
  const reviewRows = page.locator(".inventory-list .inventory-row");
  await expect(reviewRows).toHaveCount(2);
  await expect(reviewRows.filter({ hasText: "시금치" })).toBeVisible();
  await expect(reviewRows.filter({ hasText: "동물복지 달걀" })).toBeVisible();

  const reviewGuide = page.getByRole("region", { name: "식품을 살펴볼 때" });
  const reviewChecklist = reviewGuide.getByRole("list", { name: "식품 확인 항목" });
  await expect(reviewChecklist.getByRole("listitem")).toHaveCount(3);
  await expect(reviewChecklist).toContainText("포장지 날짜");
  await expect(reviewChecklist).toContainText("보관·개봉 상태");
  await expect(reviewChecklist).toContainText("냄새·색·포장 상태");
  await expect(reviewGuide).toContainText("앱은 먹어도 되는지 판단하지 않아요.");
  await expect(reviewGuide.locator(".inventory-review-guide-note")).toHaveCSS("font-size", "12px");
  await reviewGuide.getByRole("button", { name: "날짜와 보관 확인 방법 자세히 보기" }).click();
  const guidance = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidance).toBeVisible();
  await expect(guidance.getByRole("list", { name: "식품 날짜와 보관 상태 확인 방법" })).toBeVisible();
  await expect(guidance.getByRole("note", { name: "식품 상태 안내" })).toBeVisible();
  await guidance.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(guidance).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(2);
});

test("keeps the mobile quick-add action beside the meal CTA above fixed navigation", async ({ page }) => {
  const actionRow = page.locator(".home-action-row-with-add");
  await expect(actionRow).toBeVisible();
  await expect(actionRow.locator(".meal-plan-button")).toBeVisible();
  await expect(actionRow.locator(".add-food-button")).toBeVisible();
  await expect(actionRow.locator(".add-food-button")).toContainText("영수증·바코드·라벨·직접 입력");

  const layout = await page.evaluate(() => {
    const read = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return {
      meal: read(".home-action-row .meal-plan-button"),
      add: read(".home-action-row .add-food-button"),
      nav: read(".app-bottom-nav"),
    };
  });

  expect(Math.abs((layout.meal?.top ?? 0) - (layout.add?.top ?? 0))).toBeLessThanOrEqual(4);
  expect(layout.add?.left).toBeGreaterThan(layout.meal?.left ?? Number.POSITIVE_INFINITY);
  expect(layout.meal?.bottom).toBeLessThanOrEqual(layout.nav?.top ?? Number.NEGATIVE_INFINITY);
  expect(layout.add?.bottom).toBeLessThanOrEqual(layout.nav?.top ?? Number.NEGATIVE_INFINITY);
});

test("date guidance returns to the same food detail context", async ({ page }) => {
  await page.locator(".priority-card").first().click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();

  await detail.getByRole("button", { name: "날짜 기준 자세히 보기" }).click();
  const guidance = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidance).toBeVisible();
  await expect(guidance.getByRole("list", { name: "식품 날짜와 보관 상태 확인 방법" })).toHaveCount(1);
  await expect(guidance.getByRole("listitem")).toHaveCount(3);
  await expect(guidance.getByRole("note", { name: "식품 상태 확인 안내" })).toContainText("냄새나 색이 평소와 다르거나 포장이 부풀었다면 먹지 말고 폐기 여부를 확인해 주세요.");
  await guidance.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(guidance).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(detail.locator(".detail-hero-copy h3")).toHaveText("시금치");
});

test("priority detail closes back to the home context while inventory detail restores pantry context", async ({ page }) => {
  await page.locator(".priority-card").first().click();
  const priorityDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(priorityDetail).toBeVisible();
  await priorityDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(priorityDetail).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 3" })).toBeVisible();

  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".inventory-health-summary")).toContainText("확인 필요 2개");
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".inventory-status")).toHaveText("우선 확인 · 9월 4일");
  await page.locator(".inventory-row").first().click();
  const inventoryDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(inventoryDetail).toBeVisible();
  await inventoryDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(inventoryDetail).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
});

test("PWA install prompt can hand the browser install decision to the user", async ({ page }) => {
  await page.addInitScript(() => {
    let promptCalls = 0;
    Object.defineProperty(window, "__fireInstallPrompt", {
      configurable: true,
      value: () => {
        const event = new Event("beforeinstallprompt");
        Object.defineProperty(event, "prompt", { value: async () => { promptCalls += 1; } });
        Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted", platform: "web" }) });
        window.dispatchEvent(event);
      },
    });
    Object.defineProperty(window, "__installPromptCalls", {
      configurable: true,
      get: () => promptCalls,
    });
  });
  await page.reload();
  await page.evaluate(() => (window as unknown as { __fireInstallPrompt: () => void }).__fireInstallPrompt());

  const prompt = page.getByTestId("install-prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("앱처럼 더 편하게 써요");
  await expect.poll(() => page.evaluate(() => {
    const priority = document.querySelector(".priority-section");
    const install = document.querySelector(".install-prompt");
    return Boolean(priority && install && (priority.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const safetySummary = document.querySelector(".trust-card");
    const install = document.querySelector(".install-prompt");
    return Boolean(safetySummary && install && (safetySummary.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const inventory = document.querySelector(".inventory-section");
    const install = document.querySelector(".install-prompt");
    return Boolean(inventory && install && (inventory.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await prompt.getByRole("button", { name: "설치하기" }).click();
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __installPromptCalls: number }).__installPromptCalls)).toBe(1);
});

test("PWA manifest exposes standalone install metadata and reachable icons", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json() as {
    display: string;
    orientation: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  expect(manifest.display).toBe("standalone");
  expect(manifest.orientation).toBe("portrait-primary");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/rescue-meal-192.png", sizes: "192x192", purpose: "any" }),
    expect.objectContaining({ src: "/icons/rescue-meal-512.png", sizes: "512x512", purpose: "maskable" }),
  ]));
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBeTruthy();
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
  const indexResponse = await request.get("/");
  expect(indexResponse.ok()).toBeTruthy();
  const indexHtml = await indexResponse.text();
  expect(indexHtml).toContain('<meta name="mobile-web-app-capable" content="yes" />');
  expect(indexHtml).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icons/rescue-meal-192.png" />');
  expect(indexHtml).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/rescue-meal-180.png" />');
  const faviconResponse = await request.get("/icons/rescue-meal-192.png");
  expect(faviconResponse.ok()).toBeTruthy();
  expect(faviconResponse.headers()["content-type"]).toContain("image/png");
  const appleIconResponse = await request.get("/icons/rescue-meal-180.png");
  expect(appleIconResponse.ok()).toBeTruthy();
  expect(appleIconResponse.headers()["content-type"]).toContain("image/png");
});

test.describe("iOS install guidance", () => {
  test.use({
    viewport: { width: 393, height: 852 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  test("exposes the expandable Add to Home Screen guidance", async ({ page }) => {
    await page.goto("/");
    const prompt = page.getByTestId("install-prompt");
    await expect(prompt).toBeVisible();
    const action = prompt.locator(".install-prompt-action");
    await expect(action).toHaveText("설치 방법");
    await expect(action).toHaveAttribute("aria-expanded", "false");
    await expect(action).toHaveAttribute("aria-controls", "install-prompt-steps");

    await action.click();
    await expect(action).toHaveAttribute("aria-expanded", "true");
    const steps = prompt.locator("#install-prompt-steps");
    await expect(steps).toBeVisible();
    await expect(steps).toHaveAttribute("role", "note");

    await action.click();
    await expect(action).toHaveAttribute("aria-expanded", "false");
    await expect(steps).toHaveCount(0);
  });
});

test("keeps visible primary controls named across the major mobile surfaces", async ({ page }) => {
  const assertVisibleControlsNamed = async (surface: string) => {
    const controls = page.getByTestId("device-screen").locator("button:visible, a:visible, input:visible, select:visible, textarea:visible, [role=button]:visible, [role=tab]:visible, [role=switch]:visible");
    const names = await controls.evaluateAll((elements) => elements.map((element) => {
        const labelledBy = element.getAttribute("aria-labelledby")
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
        return (element.getAttribute("aria-label")
          ?? labelledBy
          ?? element.textContent
          ?? element.getAttribute("placeholder")
          ?? element.getAttribute("title")
          ?? "").replace(/\s+/g, " ").trim();
      }));
    for (const [index, name] of names.entries()) {
      expect(name, `${surface} control ${index + 1}`).toMatch(/\S/);
    }
  };

  await assertVisibleControlsNamed("home");

  const openAndAudit = async (trigger: string, surface: string, dialogName: string | RegExp) => {
    await page.locator(trigger).first().click();
    const dialog = page.getByRole("dialog", { name: dialogName });
    await expect(dialog).toBeVisible();
    await assertVisibleControlsNamed(surface);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  };

  await openAndAudit(".add-food-button", "receipt", "영수증으로 추가");
  await openAndAudit(".meal-plan-button", "meal", "오늘의 식단");
  await openAndAudit(".priority-card", "food detail", "시금치");
  await openAndAudit(".connection-pill", "account", "내 계정");
  await openAndAudit(".mobile-hero-notification", "notifications", "알림");
});

test("Pixel preview anchors app navigation to the reserved Android viewport edge", async ({ page }) => {
  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();
  await expect(page.getByTestId("android-navigation-bar")).toBeVisible();
  await page.waitForTimeout(250);

  const layout = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")!;
    const navigation = document.querySelector<HTMLElement>("[data-testid=android-navigation-bar]")!;
    const appNavigation = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    return {
      viewportBottom: viewport.getBoundingClientRect().bottom,
      navigationTop: navigation.getBoundingClientRect().top,
      appNavigationBottom: appNavigation.getBoundingClientRect().bottom,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });

  expect(Math.abs(layout.viewportBottom - layout.navigationTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.appNavigationBottom - layout.viewportBottom)).toBeLessThanOrEqual(1);
  expect(layout.documentWidth).toBeLessThanOrEqual(1100);
  expect(layout.bodyWidth).toBeLessThanOrEqual(1100);

  await page.getByRole("button", { name: "오늘 식단 만들기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(mealDialog).toBeVisible();
  await page.waitForTimeout(650);
  const sheetLayout = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]")!;
    const viewport = document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")!;
    const content = document.querySelector<HTMLElement>(".sheet-content")!;
    return {
      sheetBottom: sheet.getBoundingClientRect().bottom,
      viewportBottom: viewport.getBoundingClientRect().bottom,
      contentPaddingBottom: Number.parseFloat(getComputedStyle(content).paddingBottom),
    };
  });
  expect(Math.abs(sheetLayout.sheetBottom - sheetLayout.viewportBottom)).toBeLessThanOrEqual(1);
  expect(sheetLayout.contentPaddingBottom).toBeGreaterThanOrEqual(67);
});

test("account sheet explains guest workspace separation", async ({ page }) => {
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog).toBeVisible();
  const loginTab = dialog.getByRole("tab", { name: "로그인" });
  await expect(loginTab).toBeVisible();
  await expect(loginTab).toBeFocused();
  await expect(loginTab).toHaveAttribute("aria-controls", "account-panel-login");
  await expect(dialog.locator("#account-panel-login")).toHaveAttribute("aria-labelledby", "account-tab-login");
  const accountActionOrder = await dialog.locator(".account-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
  expect(accountActionOrder.indexOf("account-tabs")).toBeLessThan(accountActionOrder.indexOf("password-recovery-panel"));
  await loginTab.focus();
  await page.keyboard.press("ArrowRight");
  const registerTab = dialog.getByRole("tab", { name: "회원가입" });
  await expect(registerTab).toBeFocused();
  await expect(registerTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(loginTab).toBeFocused();
  await expect(dialog.getByText(/계정에 로그인하면 다른 기기에서도 이어가요/)).toBeVisible();
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await expect(dialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
  await expect(dialog.getByText(/계정을 만들면 다른 기기에서도 이어가요/)).toBeVisible();
  await expect(dialog.getByRole("region", { name: "비밀번호 재설정" })).toHaveCount(0);
  await expect(dialog.getByText(/게스트 기록은 지금 그대로 남아요/)).toBeVisible();
});

test("password recovery entry focuses the account email field", async ({ page }) => {
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("button", { name: "비밀번호를 잊으셨나요?" }).click();
  await expect(dialog.getByRole("heading", { name: "비밀번호 재설정 요청" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "계정 이메일" })).toBeFocused();
});

test("notification center surfaces demo rescue items and opens food detail", async ({ page }) => {
  const trigger = page.getByRole("button", { name: /알림 확인/ });
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveText("3");
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveClass(/notification-dot-urgent/);
  await expect(trigger).toHaveAccessibleName("알림 확인, 먼저 확인할 알림 1개, 읽지 않은 알림 3개");
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByRole("heading", { name: /확인이 필요한 알림 3/ })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "알림 요약" })).toContainText("먼저 확인할 알림 1개");
  await expect(dialog.getByRole("region", { name: "알림 요약" })).toContainText("전체 3개");
  await expect(dialog.getByRole("button", { name: "첫 번째 읽지 않은 알림으로 이동" })).toBeVisible();
  await expect(dialog.getByText("오늘 먼저 확인할 식품이에요")).toBeVisible();
  await expect(dialog.getByText("시금치 먼저 확인해 보세요.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("닭가슴살 확인이 필요해요", { exact: true })).toBeVisible();
  await expect(dialog.getByText("국산콩 두부: 9월 4일은 먼저 살펴볼 참고 날짜예요. 소비기한이나 안전 판정이 아니니 포장지 날짜와 식품 상태를 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("닭가슴살: 직접 확인해 기록한 날짜는 9월 6일이에요. 포장지에 표시된 소비기한과는 별개이니, 포장지 날짜와 보관 상태도 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(dialog.locator(".notification-row").first().locator(".notification-row-copy em")).toContainText("날짜 확인 ·");
  await expect(dialog.locator(".notification-row").first().locator(".notification-row-copy strong")).toHaveCSS("white-space", "normal");
  await dialog.getByRole("button", { name: "첫 번째 읽지 않은 알림으로 이동" }).click();
  await expect(dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" })).toBeFocused();
  await expect(dialog).not.toContainText("을(를)");
  await expect(dialog).not.toContainText("데모 모드에서는 서버 알림을 저장하지 않아요");

  await dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" }).click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(page.getByTestId("keyboard-dock")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveClass(/notification-dot-attention/);
  await expect(dialog.getByRole("heading", { name: /확인이 필요한 알림 2/ })).toBeVisible();
  await expect(dialog.getByText("확인할 알림", { exact: true })).toBeVisible();
  await expect(dialog.getByText("확인한 알림", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "알림 요약" })).toContainText("읽지 않음 2개 · 전체 3개");
  await expect(dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" })).toBeFocused();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(page.getByTestId("keyboard-dock")).toHaveCSS("visibility", "hidden");
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "알림" }).getByRole("heading", { name: /확인이 필요한 알림 2/ })).toBeVisible();
});

test("notification date review returns to the exact notification row after saving", async ({ page }) => {
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notification = notifications.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" });
  await notification.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  const labelDialog = page.getByRole("dialog", { name: "날짜 다시 확인" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(labelDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("날짜와 보관 위치를 확인해요");
  await expect(labelDialog.getByRole("radio", { name: /기존 식품 · 1팩/ })).toHaveAttribute("aria-checked", "true");
  const recaptureOptions = labelDialog.locator(".label-recapture-details");
  await expect(labelDialog.getByRole("heading", { name: "포장지 날짜를 읽어볼게요" })).toHaveCount(0);
  await expect(recaptureOptions).toContainText("현재 결과는 이 시트 안에서만 유지돼요.");
  const recaptureSummary = recaptureOptions.locator("summary");
  const recaptureSummaryBox = await recaptureSummary.boundingBox();
  expect(recaptureSummaryBox?.height).toBeGreaterThanOrEqual(44);
  await expect(recaptureOptions.getByRole("button", { name: "카메라로 촬영" })).toBeHidden();
  await recaptureSummary.click();
  await expect(recaptureOptions.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
  await expect(recaptureOptions.getByRole("button", { name: "예시 라벨 결과 보기" })).toBeVisible();
  await recaptureSummary.click();
  await labelDialog.getByRole("tab", { name: "직접 입력" }).click();
  const alternateEntryDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(alternateEntryDialog.locator(".date-recheck-context")).toContainText("기존 시금치 날짜는 그대로예요");
  await expect(alternateEntryDialog.locator(".date-recheck-context")).toContainText("다른 입력 방식은 새 식품을 추가해요");
  await alternateEntryDialog.getByRole("button", { name: "라벨 날짜 확인으로 돌아가기" }).click();
  const resumedLabelDialog = page.getByRole("dialog", { name: "날짜 다시 확인" });
  await expect(resumedLabelDialog).toBeVisible();
  await expect(resumedLabelDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("날짜와 보관 위치를 확인해요");
  await expect(resumedLabelDialog.getByRole("radio", { name: /기존 식품 · 1팩/ })).toHaveAttribute("aria-checked", "true");
  await resumedLabelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(notifications).toBeVisible();
  await expect(notification).toBeFocused();
  await expect(notification).toHaveAttribute("data-notification-returned", "true");
});

test("notification center separates unread count from the retained read history", async ({ page }) => {
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await dialog.getByRole("button", { name: "모두 읽음" }).click();
  await expect(dialog.getByRole("heading", { name: "알림 기록" })).toBeVisible();
  await expect(dialog.locator(".notification-summary")).toBeFocused();
  await expect(dialog.getByRole("heading", { name: /확인이 필요한 알림 0/ })).toHaveCount(0);
  await expect(dialog.locator(".notification-summary")).toContainText("모든 알림을 확인했어요");
  await expect(dialog.locator(".notification-summary")).toHaveAttribute("aria-live", "polite");
  await expect(dialog.locator(".notification-summary")).toHaveAttribute("aria-atomic", "true");
  await expect(dialog.getByText("확인할 알림", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("확인한 알림", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "모두 읽음" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" })).toBeVisible();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "알림" });
  await expect(reopenedDialog.locator(".notification-summary")).toBeFocused();
});

test("long sheet navigation keeps the latest return context and focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  const notificationTrigger = page.getByRole("button", { name: /알림 확인/ });
  const accountTrigger = page.locator(".connection-pill");

  await notificationTrigger.click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const foodNotification = notifications.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" });
  await foodNotification.click();
  const foodDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(foodDetail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notifications).toBeVisible();
  await expect(foodNotification).toBeFocused();
  await notifications.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notificationTrigger).toBeFocused();

  await accountTrigger.click();
  const account = page.getByRole("dialog", { name: "내 계정" });
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(account).toHaveCount(0);
  await expect(accountTrigger).toBeFocused();

  const mealTrigger = page.getByRole("button", { name: "식단", exact: true });
  await mealTrigger.click();
  const meal = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(meal).toBeVisible();
  await meal.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(meal).toHaveCount(0);
  await expect(mealTrigger).toBeFocused();

});

test("bottom sheets expose modal semantics and restore focus after closing", async ({ page }) => {
  const trigger = page.locator(".add-food-button");
  await expect(trigger).toHaveAccessibleName(/식품 추가하기/);

  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "영수증" })).toBeFocused();
  await expect(dialog.getByRole("tab", { name: "영수증" }).locator("span[aria-hidden='true']")).toHaveText("추천");
  await expect(dialog.getByRole("tab", { name: "영수증" })).toHaveAccessibleName("영수증, 추천");
  const intakeFlow = dialog.locator(".intake-flow-rail");
  const intakeMethodTitle = intakeFlow.locator(".intake-flow-rail-heading strong");
  const intakeMethodDetail = intakeFlow.locator(".intake-flow-rail-heading small");
  await expect(intakeFlow).toHaveAttribute("aria-label", "식품 추가 1단계");
  await expect(intakeFlow.locator(".intake-flow-rail-heading")).toHaveAttribute("aria-live", "polite");
  await expect(intakeFlow.locator(".intake-flow-rail-heading")).toHaveAttribute("aria-atomic", "true");
  await expect(intakeMethodTitle).toHaveText("영수증 사진을 선택해요");
  await expect(intakeMethodDetail).toHaveText("사진은 저장하지 않아요. 목록에 담을 식품만 골라요.");
  await dialog.getByRole("tab", { name: "바코드" }).click();
  await expect(intakeMethodTitle).toHaveText("바코드를 입력하거나 스캔해요");
  await expect(intakeMethodDetail).toHaveText("찾은 상품명과 보관 방법을 확인해 식품 목록에 담아요.");
  await dialog.getByRole("tab", { name: "라벨" }).click();
  await expect(intakeMethodTitle).toHaveText("날짜가 보이는 면을 선택해요");
  await expect(intakeMethodDetail).toHaveText("날짜 종류와 보관 방법을 포장지에서 확인해요.");
  await dialog.getByRole("tab", { name: "직접 입력" }).click();
  await expect(intakeFlow).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "식품 이름", exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "영수증" }).click();
  await expect(dialog.getByRole("tab", { name: "바코드" }).locator("span[aria-hidden='true']")).toHaveCount(0);
  await expect(dialog).toHaveAttribute("aria-labelledby");
  await expect(dialog).toHaveAttribute("aria-describedby");
  await expect(dialog.getByRole("heading", { name: "영수증으로 추가" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("keeps keyboard focus inside an open bottom sheet", async ({ page }) => {
  const trigger = page.locator(".add-food-button");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();

  const assertFocusInside = async () => {
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  };
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    await assertFocusInside();
  }
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Shift+Tab");
    await assertFocusInside();
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("receipt review only commits selected candidates", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await expect(page.getByRole("group", { name: "식품 추가 1단계" })).toContainText("영수증 사진을 선택해요");
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("영수증에서 읽은 내용을 확인해요");
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("빠진 식품은 직접 입력 탭에서 추가할 수 있어요.");
  await expect(page.locator(".receipt-result-provenance")).toContainText("읽은 내용 확인");
  await expect(page.locator(".receipt-result-provenance")).toContainText("상품명과 수량을 먼저 확인해 주세요");
  const receiptCommitContract = page.locator(".receipt-review-contract").filter({ hasText: "선택한 항목만 식품 목록에 추가돼요." });
  await expect(receiptCommitContract).toContainText("저장 전 확인");
  await expect(receiptCommitContract).toHaveAttribute("role", "note");
  await expect(page.locator(".sheet-footnote")).toHaveText("영수증에는 보통 소비기한이 없어요. 수정한 상품명·수량·단위는 직접 확인한 내용으로 기록돼요.");
  await expect.poll(() => page.locator(".receipt-review").evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const reviewBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return reviewBox.top >= contentBox.top - 1 && reviewBox.top <= contentBox.bottom;
  })).toBe(true);
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toHaveAttribute("aria-describedby", "receipt-review-submit-hint");
  await expect(page.locator(".review-summary")).toContainText("샘플 영수증");
  await expect(page.locator(".review-summary")).toContainText("식품 후보 3개 · 선택 3개");
  await expect(page.locator(".review-summary")).not.toContainText("10개 품목");
  await expect(page.locator(".receipt-review-submit-bar")).toHaveAttribute("data-review-state", "needs-confirmation");
  await expect(page.locator("#receipt-review-submit-hint > span").first()).toHaveText("상품 확인 필요 1개 · 내용을 확인하거나 항목 선택을 해제해 주세요.");
  await expect(page.locator("#receipt-review-submit-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  const firstReviewTarget = page.getByRole("button", { name: "맛타리버섯 2팩 · 3,980원 확인 필요" });
  await expect(firstReviewTarget).toBeFocused();
  await expect.poll(() => firstReviewTarget.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const contentBox = content.getBoundingClientRect();
    const targetBox = element.getBoundingClientRect();
    return targetBox.top >= contentBox.top - 1 && targetBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);

  await firstReviewTarget.click();
  await expect(page.locator(".review-summary")).toContainText("식품 후보 3개 · 선택 2개");
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();
  await page.getByRole("button", { name: "2개 식품 저장하기" }).click();

  await expect(page.locator(".toast")).toHaveText("2개 항목을 검토 후 반영했어요");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row").filter({ hasText: "시금치" })).toContainText("확인 필요");
  await expect(page.locator(".priority-card").filter({ hasText: "국내산 시금치" })).toBeFocused();
});

test("manual food intake returns focus to the newly added priority food", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(dialog.locator(".intake-flow-rail")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "식품 이름", exact: true })).toBeVisible();
  await expect(dialog).toContainText("날짜는 포장지를 확인한 뒤 추가해요");
  await expect(dialog.getByRole("button", { name: "연결 후 확인 가능" })).toHaveCount(0);
  await expect(dialog.locator(".manual-priority-note")).toContainText("우선순위 참고는 연결 후 이용할 수 있어요.");
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("대파");
  const quantity = dialog.getByRole("textbox", { name: "수량" });
  const submit = dialog.getByRole("button", { name: "식품 추가하기" });
  await quantity.fill("0팩");
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(quantity).toHaveAttribute("aria-describedby", "manual-quantity-submit-error");
  await expect(dialog.locator("#manual-quantity-submit-error")).toHaveText("수량은 0보다 큰 숫자로 입력해 주세요.");
  await expect(submit).toHaveAttribute("aria-describedby", "manual-quantity-submit-error");
  await expect.poll(() => dialog.locator("#manual-quantity-submit-error").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  await expect(submit).toBeDisabled();
  await quantity.fill("2팩");
  await expect(submit).toBeEnabled();
  await expect(dialog.locator("#manual-submit-summary")).toHaveText("추가할 내용 · 대파 · 2팩 · 냉장 보관");
  await expect(submit).toHaveAttribute("aria-describedby", "manual-submit-summary");
  await dialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect(page.locator(".toast")).toContainText("대파를 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 상태 확인");
  await expect(page.locator(".priority-card").filter({ hasText: "대파" })).toBeFocused();
  await page.locator(".toast-action").click();
  const addedDetail = page.getByRole("dialog", { name: "대파" });
  await expect(addedDetail).toBeVisible();
  await expect(page.locator(".toast-action")).toHaveCount(0);
  await expect(addedDetail.getByTestId("date-confirmation-action")).toBeFocused();
  await addedDetail.getByTestId("date-confirmation-action").click();
  const dateEditor = addedDetail.getByRole("group", { name: "확인한 날짜 입력" });
  await dateEditor.getByRole("radio", { name: "소비기한", exact: true }).click();
  await dateEditor.getByRole("textbox", { name: "날짜" }).fill("2099-01-01");
  await dateEditor.getByRole("button", { name: "확인 후 저장" }).click();
  await expect(addedDetail).toHaveCount(0);
  const addedPriorityCard = page.locator(".priority-card").filter({ hasText: "대파" });
  await expect(addedPriorityCard.locator(".date-source")).toHaveText("표시 소비기한");
  await expect(addedPriorityCard.locator(".priority-date strong")).toHaveText("1월 1일");
  await expect(addedPriorityCard).toBeFocused();
});

test("food-tab intake returns focus to the newly added inventory row", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: "식품 목록에 추가" }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("쪽파");
  await dialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect(page.locator(".toast")).toContainText("쪽파를 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 상태 확인");
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row").filter({ hasText: "쪽파" })).toBeFocused();
});

test("switching intake methods restores the sheet to its top before the next step", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(receiptDialog.getByRole("group", { name: "식품 추가 2단계" })).toBeVisible();

  await receiptDialog.getByRole("tab", { name: "바코드" }).click();
  const barcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  await expect(barcodeDialog.getByRole("tab", { name: "바코드" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => barcodeDialog.locator(".sheet-content").evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(barcodeDialog.getByRole("group", { name: "식품 추가 1단계" })).toContainText("바코드를 입력하거나 스캔해요");

  await barcodeDialog.getByRole("button", { name: "예시 바코드 입력" }).click();
  await expect(barcodeDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("찾은 상품 정보를 확인해요");
  await barcodeDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect.poll(() => labelDialog.locator(".sheet-content").evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(labelDialog.getByRole("group", { name: "식품 추가 1단계" })).toContainText("날짜가 보이는 면을 선택해요");

  await labelDialog.getByRole("tab", { name: "바코드" }).click();
  await expect(barcodeDialog.getByRole("textbox", { name: "바코드 숫자" })).toHaveValue("8801114167523");
  await expect(barcodeDialog.getByRole("button", { name: "상품 정보 적용" })).toBeVisible();
});

test("switching intake tabs preserves an in-progress receipt review in the same sheet", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await mushroomCard.getByRole("button", { name: "이 항목 확인했어요" }).click();
  const mushroomName = mushroomCard.getByRole("textbox", { name: "재고에 저장할 상품명" });
  await mushroomName.fill("직접 확인한 맛타리버섯");
  await page.locator('.receipt-line-card[data-line-id="receipt-spinach"] .receipt-line-toggle').click();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-confirmed/);
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();

  const barcodeTab = sheet.getByRole("tab", { name: "바코드" });
  await barcodeTab.click();
  await expect(barcodeTab).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByRole("textbox", { name: "바코드 숫자" })).toBeVisible();

  const receiptTab = sheet.getByRole("tab", { name: "영수증" });
  await receiptTab.click();
  await expect(receiptTab).toHaveAttribute("aria-selected", "true");
  await expect(mushroomName).toHaveValue("직접 확인한 맛타리버섯");
  await expect(mushroomCard).toHaveClass(/receipt-line-card-confirmed/);
  await expect(mushroomCard.locator(".receipt-line-confirmed-badge")).toContainText("확인 완료");
  await expect(page.getByRole("img", { name: "업로드한 영수증 원본 미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();
});

test("receipt review lets the user correct an OCR candidate before commit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" })).toBeVisible();
  const rawReceiptName = mushroomCard.getByText("영수증에서 읽은 이름: 맛타리버섯", { exact: true });
  const savedProductName = mushroomCard.getByRole("textbox", { name: "재고에 저장할 상품명" });
  await expect(rawReceiptName).toBeVisible();
  await expect(savedProductName).toHaveValue("맛타리버섯");

  await mushroomCard.getByRole("button", { name: "실온", exact: true }).click();
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("0");
  await expect(mushroomCard.getByRole("alert")).toContainText("0보다 큰 숫자");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "오류 항목 열기" })).toBeVisible();
  await page.getByRole("button", { name: "오류 항목 열기" }).click();
  await expect(mushroomCard.getByRole("spinbutton", { name: "수량" })).toBeFocused();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);

  await savedProductName.fill("새송이버섯");
  await expect(savedProductName).toHaveValue("새송이버섯");
  await expect(rawReceiptName).toBeVisible();
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("1");
  await mushroomCard.getByRole("textbox", { name: "단위" }).fill("봉");
  await expect(page.locator("#receipt-review-ready-hint > span").first()).toHaveText("선택한 항목을 확인했어요. 저장할 수 있어요.");
  await expect(page.locator("#receipt-review-ready-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeEnabled();
  await page.getByRole("button", { name: "3개 식품 저장하기" }).click();

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const savedMushroom = inventory.getByRole("button", { name: /새송이버섯 .* · 1봉/ });
  await expect(savedMushroom).toBeVisible();
  await expect(savedMushroom).toContainText("영수증 · 1봉");
  await expect(savedMushroom).not.toContainText("맛타리버섯");
  await expect(page.locator(".priority-card").filter({ hasText: "새송이버섯" }).getByText("실온", { exact: true })).toBeVisible();
  await savedMushroom.click();
  const savedDetail = page.getByRole("dialog", { name: "새송이버섯" });
  await expect(savedDetail.locator(".detail-hero h3")).toHaveText("새송이버섯");
  await expect(savedDetail.locator(".detail-hero-copy p")).toHaveText("남은 1봉");
  const receiptSource = savedDetail.getByRole("group", { name: "구매 출처" });
  await expect(receiptSource).toContainText("영수증에서 추가");
  await expect(receiptSource).toContainText("영수증 검토에서 추가");
  await expect(savedDetail).not.toContainText("맛타리버섯");
  await expect(savedDetail.locator(".date-proof-card")).toContainText("날짜 확인 필요");
});

test("receipt review can explicitly confirm unchanged OCR candidates", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  const confirmButtons = page.getByRole("button", { name: "이 항목 확인했어요" });
  await expect(confirmButtons).toHaveCount(1);
  const confirmButtonBox = await confirmButtons.first().boundingBox();
  expect(confirmButtonBox?.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".receipt-line-card-needs-confirmation")).toHaveCount(1);
  await expect(page.locator(".receipt-line-card-needs-confirmation")).toHaveAttribute("data-receipt-review-state", "needs_confirmation");
  await expect(confirmButtons).toHaveAttribute("aria-describedby", /receipt-line-status-/);
  while (await confirmButtons.count()) {
    await confirmButtons.first().click();
  }
  await expect(page.locator(".receipt-line-confirmed-badge")).toHaveCount(1);
  await expect(page.locator(".receipt-line-card-confirmed")).toHaveCount(1);
  await expect(page.locator(".receipt-line-card-confirmed")).toHaveAttribute("data-receipt-review-state", "user_confirmed");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeEnabled();
  await expect(page.locator(".receipt-line-confirmed-badge")).toContainText("확인 완료");
  await expect(page.locator(".receipt-line-confirmed-badge")).toHaveAttribute("aria-label", "사용자 확인 완료");
  await expect(page.locator(".receipt-line-confirmed-badge")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator(".receipt-line-confirmed-badge")).toHaveAttribute("aria-atomic", "true");
  const confirmedCard = page.locator(".receipt-line-card-confirmed");
  await expect(confirmedCard.locator("[id^='receipt-line-status-']")).toHaveText("사용자 확인 완료");
  await expect(confirmedCard.locator(".receipt-line-toggle")).toHaveAttribute("aria-label", /확인 완료$/);
  await expect(confirmedCard.locator(".ocr-confidence")).toHaveText("읽음");
  await expect(confirmedCard.locator(".ocr-confidence")).not.toHaveClass(/ocr-review/);
  const confirmedLineId = await confirmedCard.getAttribute("data-line-id");
  const stableConfirmedCard = page.locator(`.receipt-line-card[data-line-id="${confirmedLineId}"]`);
  await stableConfirmedCard.locator(".receipt-line-toggle").click();
  await expect(page.locator(".receipt-line-card-confirmed")).toHaveCount(0);
  await stableConfirmedCard.locator(".receipt-line-toggle").click();
  await expect(page.locator(".receipt-line-card-confirmed")).toHaveCount(1);
  await expect(page.locator(".receipt-line-card-needs-confirmation")).toHaveCount(0);
  await expect(page.locator("#receipt-review-ready-hint > span").first()).toHaveText("선택한 항목을 확인했어요. 저장할 수 있어요.");
  await expect(page.locator("#receipt-review-ready-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toHaveAttribute("aria-describedby", "receipt-review-ready-hint");
});

test("receipt product lookup stays secondary and full-size in dark mode", async ({ page }) => {
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const lookup = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]').getByRole("button", { name: "상품 정보 찾기" });
  const style = await lookup.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, background: computed.backgroundColor, color: computed.color };
  });

  expect(style.height).toBeGreaterThanOrEqual(44);
  expect(style.background).not.toBe("rgb(255, 255, 255)");
  expect(style.color).toBe("rgb(182, 192, 204)");
});

test("receipt validation explains and focuses invalid quantity and unit fields", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  const mushroomCard = dialog.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await mushroomCard.getByRole("button", { name: "이 항목 확인했어요" }).click();

  const quantity = mushroomCard.getByRole("spinbutton", { name: "수량" });
  const unit = mushroomCard.getByRole("textbox", { name: "단위" });
  const save = dialog.getByRole("button", { name: "3개 식품 저장하기" });
  await quantity.fill("0");
  await expect(mushroomCard.locator(".receipt-line-error")).toHaveText("수량은 0보다 큰 숫자로 입력해 주세요.");
  await expect(dialog.locator(".receipt-review-submit-bar")).toHaveAttribute("data-review-state", "invalid");
  await expect(dialog.locator("#receipt-review-invalid-hint > span").first()).toHaveText("오류 항목 1개 · 수정 후 저장할 수 있어요.");
  await expect(dialog.locator("#receipt-review-invalid-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(save).toBeDisabled();
  const errorAction = dialog.getByRole("button", { name: "오류 항목 열기" });
  const errorActionBox = await errorAction.boundingBox();
  expect(errorActionBox?.height).toBeGreaterThanOrEqual(44);
  await errorAction.click();
  await expect(quantity).toBeFocused();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect.poll(() => quantity.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    const saveBar = document.querySelector<HTMLElement>(".receipt-review-submit-bar");
    if (!content || !saveBar) return false;
    const fieldBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const saveBarBox = saveBar.getBoundingClientRect();
    return fieldBox.top >= contentBox.top - 1 && fieldBox.bottom <= Math.min(contentBox.bottom, saveBarBox.top) + 1;
  })).toBe(true);

  await quantity.fill("2");
  await unit.fill("");
  await expect(mushroomCard.locator(".receipt-line-error")).toHaveText("단위를 입력해 주세요.");
  await expect(save).toBeDisabled();
  await dialog.getByRole("button", { name: "오류 항목 열기" }).click();
  await expect(unit).toBeFocused();

  await unit.fill("팩");
  await expect(mushroomCard.locator(".receipt-line-error")).toHaveCount(0);
  await expect(dialog.locator("#receipt-review-ready-hint > span").first()).toHaveText("선택한 항목을 확인했어요. 저장할 수 있어요.");
  await expect(dialog.locator("#receipt-review-ready-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(save).toBeEnabled();
});

test("receipt line editing reveals the active line and keeps commit reachable", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const spinachCard = page.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await spinachCard.getByRole("button", { name: "시금치 항목 수정" }).click();
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByText("현재 항목")).toBeVisible();
  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => spinachCard.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const cardBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return cardBox.top >= contentBox.top - 1 && cardBox.top <= contentBox.bottom;
  })).toBe(true);
  await expect(page.locator(".receipt-review-submit-bar")).toHaveCSS("position", "sticky");
});

test("keeps the expanded receipt editor readable inside narrow phone sheets", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 371, height: 780 },
    { width: 374, height: 812 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 420, height: 896 },
    { width: 421, height: 896 },
    { width: 427, height: 952 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?review=1&receipt_source_review=1");

    const dialog = page.getByRole("dialog", { name: "영수증 확인" });
    const editingCard = dialog.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
    await expect(editingCard).toHaveClass(/receipt-line-card-editing/);

    const layout = await dialog.evaluate((element) => {
      const sheet = element.querySelector<HTMLElement>(".sheet-content");
      const review = element.querySelector<HTMLElement>(".receipt-review");
      const lines = element.querySelector<HTMLElement>(".receipt-lines");
      const card = element.querySelector<HTMLElement>(".receipt-line-card-editing");
      const itemName = card?.querySelector<HTMLElement>(".receipt-line-copy strong");
      const editButton = card?.querySelector<HTMLElement>(".receipt-line-edit-button");
      if (!sheet || !review || !lines || !card || !itemName || !editButton) return null;
      const sheetBounds = sheet.getBoundingClientRect();
      const linesBounds = lines.getBoundingClientRect();
      const editBounds = editButton.getBoundingClientRect();
      const interactiveControls = Array.from(card.querySelectorAll<HTMLElement>("button, input"));
      return {
        sheetHasNoHorizontalOverflow: sheet.scrollWidth <= sheet.clientWidth + 1,
        reviewHasNoHorizontalOverflow: review.scrollWidth <= review.clientWidth + 1,
        linesFitReview: linesBounds.right <= review.getBoundingClientRect().right + 1,
        itemNameFits: itemName.scrollWidth <= itemName.clientWidth,
        editTargetIs44px: editBounds.width >= 44 && editBounds.height >= 44,
        controlsStayInsideSheet: interactiveControls.every((control) => {
          const bounds = control.getBoundingClientRect();
          return bounds.left >= sheetBounds.left - 1 && bounds.right <= sheetBounds.right + 1;
        }),
      };
    });

    expect(layout, `receipt editor fits ${viewport.width}px`).toEqual({
      sheetHasNoHorizontalOverflow: true,
      reviewHasNoHorizontalOverflow: true,
      linesFitReview: true,
      itemNameFits: true,
      editTargetIs44px: true,
      controlsStayInsideSheet: true,
    });
  }
});

test("receipt review keeps the uploaded original available for OCR comparison", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato-photo.jpg");

  await expect(dialog.locator(".receipt-lines")).toBeVisible();
  const preview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(preview).toBeVisible();
  await expect.poll(() => dialog.locator(".receipt-review").evaluate((review) => {
    const lines = review.querySelector(".receipt-lines");
    const sourcePreview = review.querySelector(".receipt-source-preview");
    if (!lines || !sourcePreview) return false;
    return Boolean(lines.compareDocumentPosition(sourcePreview) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(preview.getByText("영수증 확인")).toBeVisible();
  await expect(preview.getByText("사진 파일은 식품 기록에 저장하지 않아요.")).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("alt", "업로드한 영수증 원본 미리보기");
  await expect(preview.locator("img")).toHaveAttribute("src", /^blob:/);
});

test("intake methods explain what will be checked and offer the matching capture option", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(receiptDialog.getByText("영수증에서 읽은 상품과 수량을 확인한 뒤 재고에 반영해요.", { exact: true })).toBeVisible();
  const receiptTab = receiptDialog.getByRole("tab", { name: "영수증" });
  await expect(receiptTab).toHaveAttribute("aria-controls", "add-mode-panel-receipt");
  await expect(receiptDialog.locator("#add-mode-panel-receipt")).toHaveAttribute("aria-labelledby", "add-mode-tab-receipt");
  await receiptTab.focus();
  await page.keyboard.press("ArrowRight");
  const barcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  await expect(barcodeDialog.getByText("바코드로 상품 정보를 찾아보고, 맞는 정보인지 확인해요.", { exact: true })).toBeVisible();
  await expect(barcodeDialog.getByRole("tab", { name: "바코드" })).toBeFocused();
  await expect(barcodeDialog.getByRole("tab", { name: "바코드" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(receiptTab).toBeFocused();
  await expect(receiptTab).toHaveAttribute("aria-selected", "true");
  const receiptInputs = receiptDialog.getByRole("group", { name: "영수증 이미지 입력 방법" });
  await expect(receiptInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(receiptInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
  await expect(receiptInputs.getByText("사진·PDF 선택")).toBeVisible();

  await receiptDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(labelDialog.getByText("날짜가 보이는 포장 면을 읽어요. 날짜 의미와 보관 위치를 확인하기 전에는 재고에 반영하지 않아요.", { exact: true })).toBeVisible();
  const labelInputs = labelDialog.getByRole("group", { name: "라벨 이미지 입력 방법" });
  await expect(labelInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(labelInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
  await expect(labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" })).toBeVisible();
  await expect(labelDialog.getByText("날짜가 무엇을 뜻하는지 확인하기 전에는 소비기한으로 저장하지 않아요.")).toBeVisible();

  await labelDialog.getByRole("tab", { name: "직접 입력" }).click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.getByText("식품 이름·수량·보관 위치를 직접 입력해요.", { exact: true })).toBeVisible();
});

test("receipt intake accepts an electronic PDF and keeps its original available for review", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  const input = dialog.locator('input[type="file"][data-input-source="library"]');

  await expect(input).toHaveAttribute("accept", "image/*,.pdf,application/pdf");
  await input.setInputFiles({
    name: "online-receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  });

  const preview = dialog.getByRole("region", { name: "영수증 PDF 원본 미리보기" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("object")).toHaveAttribute("type", "application/pdf");
  await expect(preview).toHaveAttribute("data-source-preview-mode", "pdf");
  await expect(preview.locator("#receipt-source-preview-hint")).toHaveAttribute("aria-live", "polite");
  await expect(preview.locator("#receipt-source-preview-hint")).toHaveAttribute("aria-atomic", "true");
  await expect(preview).toHaveAttribute("data-active-source-count", "0");
  await expect(preview).toHaveAttribute("data-active-source-line", "");
  await expect(preview).toContainText("PDF에서는 상품 위치를 표시하지 않아요");
  await expect(preview).toContainText("사진 파일은 식품 기록에 저장하지 않아요.");
});

test("receipt line source action reveals its matched original above the sticky save bar", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 확인" });
  const preview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });

  await dialog.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" }).click();

  await expect(preview).toHaveAttribute("data-active-source-line", "시금치");
  await expect(preview).toHaveAttribute("data-active-source-count", "1");
  await expect(preview.getByRole("button", { name: "국내산 시금치 영수증에서 확인하기" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(".receipt-source-preview");
    const frame = preview?.querySelector<HTMLElement>(".receipt-source-preview-frame");
    const content = preview?.closest<HTMLElement>(".sheet-content");
    const saveBar = document.querySelector<HTMLElement>(".receipt-review-submit-bar");
    if (!preview || !frame || !content || !saveBar) return false;
    const frameBounds = frame.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const saveBounds = saveBar.getBoundingClientRect();
    return frameBounds.top >= contentBounds.top - 1 && frameBounds.bottom <= saveBounds.top + 1;
  })).toBe(true);
});

test("receipt source review explains when image observations are not mapped to lines", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_unmapped=1");
  const dialog = page.getByRole("dialog", { name: "영수증 확인" });
  const preview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(dialog).toContainText("읽은 위치를 특정 상품과 연결하지 못했어요. 상품명·수량과 영수증 원본을 직접 대조해 주세요.");
  await expect(preview).toHaveAttribute("data-source-preview-mode", "image");
  await expect(preview).toHaveAttribute("data-source-mapping-state", "unmapped");
  await expect(preview).toHaveAttribute("data-active-source-count", "0");
  await expect(preview).toHaveAttribute("data-active-source-line", "");
  await expect(preview.locator(".receipt-source-hit-target")).toHaveCount(0);
  await expect(preview.locator(".receipt-source-box-unmapped")).toHaveCount(3);
  await expect(preview.locator(".receipt-source-box-unmapped").first()).toHaveCSS("border-style", "dashed");
  await expect(preview.locator(".receipt-source-box-active")).toHaveCount(0);
  await expect(preview.locator(".receipt-source-preview-heading small")).toHaveText("읽은 위치 후보 · 상품 미연결");
  await expect(preview).toContainText("테두리는 OCR이 읽은 위치 후보예요. 특정 상품과 연결되지 않았어요.");
  await expect(spinachCard).not.toHaveClass(/receipt-line-card-source-active/);
  await expect(spinachCard.locator(".sr-only")).toHaveText("영수증에서 읽음");
  const mushroomCard = dialog.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  if (await mushroomCard.locator(".receipt-line-editor").count() === 0) {
    await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" }).press("Enter");
  }
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);
  const mushroomName = mushroomCard.getByRole("textbox", { name: "재고에 저장할 상품명" });
  await expect(mushroomName).toBeVisible();
  await mushroomName.fill("새송이버섯");
  await expect(page.locator("#receipt-review-ready-hint")).toContainText("선택한 항목을 확인했어요");
  const stableMushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await stableMushroomCard.locator(".receipt-line-toggle").click();
  await stableMushroomCard.locator(".receipt-line-toggle").click();
  await expect(page.locator("#receipt-review-ready-hint")).toContainText("선택한 항목을 확인했어요");
  await expect(preview).toHaveAttribute("data-active-source-count", "0");
  await expect(preview).toHaveAttribute("data-active-source-line", "");
  const commitButton = dialog.getByRole("button", { name: "3개 식품 저장하기" });
  await expect(commitButton).toBeEnabled();
  await commitButton.click();
  await expect(page.locator(".toast")).toContainText("3개 항목을 검토 후 반영했어요");
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /새송이버섯/ })).toBeVisible();
});

test("camera surface falls back to photo selection when permission is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new Error("permission-denied"); } },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "카메라로 촬영" }).click();

  const camera = dialog.getByRole("region", { name: "영수증 카메라 입력" });
  await expect(camera.getByRole("heading", { name: "카메라를 사용할 수 없어요" })).toBeVisible();
  await expect(camera.locator(".camera-library-fallback")).toBeFocused();
  await expect(camera).toHaveAttribute("aria-live", "polite");
  await expect(camera).toHaveAttribute("aria-atomic", "true");
  await expect(camera.getByText("카메라 권한이 없거나 다른 앱에서 사용 중이에요.")).toBeVisible();
  await expect(camera.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);

  await camera.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato-photo.jpg");
  await expect(dialog.getByRole("button", { name: /\d+개 식품 저장하기/ })).toBeVisible();
});

test("camera surface turns a captured frame into the existing receipt intake file", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => HTMLMediaElement.HAVE_CURRENT_DATA });
    HTMLVideoElement.prototype.play = async () => undefined;
    HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => undefined }) as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob(["camera-frame"], { type: "image/jpeg" }));
  });
  await page.reload();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "카메라로 촬영" }).click();

  const camera = dialog.getByRole("region", { name: "영수증 카메라 입력" });
  await expect(camera.getByRole("button", { name: "촬영하기" })).toBeEnabled();
  await camera.getByRole("button", { name: "촬영하기" }).click();
  await expect(dialog.getByRole("button", { name: /\d+개 식품 저장하기/ })).toBeVisible();
  await expect(dialog.locator(".review-summary")).toContainText(/rescue-meal-\d+\.jpg/);
});

test("camera capture sends the visible guide crop instead of the surrounding frame", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => HTMLMediaElement.HAVE_CURRENT_DATA });
    HTMLVideoElement.prototype.play = async () => undefined;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this instanceof HTMLVideoElement) return { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 } as DOMRect;
      if (this.classList.contains("camera-capture-frame")) return { left: 40, top: 24, width: 320, height: 252, right: 360, bottom: 276 } as DOMRect;
      return originalGetBoundingClientRect.call(this);
    };
    HTMLCanvasElement.prototype.getContext = () => ({
      drawImage: (...args: unknown[]) => {
        (window as unknown as { __captureSource?: number[] }).__captureSource = args.slice(1, 5).map(Number);
      },
    }) as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob(["camera-frame"], { type: "image/jpeg" }));
  });
  await page.reload();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "카메라로 촬영" }).click();

  const camera = dialog.getByRole("region", { name: "영수증 카메라 입력" });
  await expect(camera.getByRole("button", { name: "촬영하기" })).toBeEnabled();
  await expect(camera.getByText("테두리 안에 맞춰 촬영해 주세요")).toBeVisible();
  await camera.getByRole("button", { name: "촬영하기" }).click();

  const source = await page.evaluate(() => (window as unknown as { __captureSource?: number[] }).__captureSource);
  expect(source?.[0]).toBeCloseTo(64, 5);
  expect(source?.[1]).toBeCloseTo(38.4, 5);
  expect(source?.[2]).toBeCloseTo(512, 5);
  expect(source?.[3]).toBeCloseTo(403.2, 5);
  await expect(dialog.getByRole("button", { name: /\d+개 식품 저장하기/ })).toBeVisible();
});

test("camera surface keeps capture disabled until the video is ready", async ({ page }) => {
  await page.addInitScript(() => {
    let readyState = HTMLMediaElement.HAVE_NOTHING;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => readyState });
    HTMLVideoElement.prototype.play = async () => undefined;
    Object.defineProperty(window, "__markCameraReady", {
      configurable: true,
      value: () => {
        readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
        document.querySelector("video")?.dispatchEvent(new Event("loadedmetadata"));
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "카메라로 촬영" }).click();

  const camera = dialog.getByRole("region", { name: "영수증 카메라 입력" });
  const captureButton = camera.getByRole("button", { name: "촬영하기" });
  await expect(captureButton).toBeDisabled();
  await page.evaluate(() => (window as unknown as { __markCameraReady?: () => void }).__markCameraReady?.());
  await expect(captureButton).toBeEnabled();
});

test("label date remains a candidate until the user confirms it", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  await page.getByRole("button", { name: "예시 라벨 결과 보기" }).click();

  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("날짜와 보관 방법을 살펴봐요");
  await expect(page.locator(".label-result-provenance")).toHaveAttribute("data-label-source", "example");
  await expect(page.locator(".label-result-provenance strong")).toHaveText("예시 라벨 결과");
  await expect(page.locator(".label-result-provenance span")).toHaveText("예시예요. 날짜 이름과 숫자를 포장지와 비교해 주세요.");
  await expect(page.locator(".label-result-provenance strong")).toHaveCSS("font-size", "12px");
  await expect(page.locator(".label-result-action-summary")).toContainText("예시 결과 · 저장 전 확인");
  await expect(page.locator(".label-result-card")).toHaveAttribute("data-label-source", "example");
  await expect(page.locator(".label-result-card")).toHaveAttribute("data-date-state", "actual_printed");
  await expect(page.locator(".label-result-card")).toHaveAttribute("data-date-confirmation", "candidate");
  await expect(page.getByRole("textbox", { name: "포장지 날짜" })).toHaveAttribute("aria-describedby", "label-result-date-readable label-date-review-guidance");
  await expect.poll(() => page.locator(".label-result-fields").evaluate((fields) => {
    const dateEvidence = fields.querySelector(".label-date-kind-summary, .label-date-meaning-review");
    const lotTargets = fields.querySelector(".label-lot-target");
    if (!dateEvidence || !lotTargets) return false;
    return Boolean(dateEvidence.compareDocumentPosition(lotTargets) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(page.locator(".label-date-kind-edit")).toHaveCSS("min-height", "44px");
  await expect(page.locator(".label-result-action-summary")).toBeInViewport();
  await expect(page.locator(".label-result-action-summary")).toContainText("예시 결과 · 저장 전 확인");
  await page.locator("[data-label-date-candidate]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-label-date-candidate]")).toBeInViewport();
  await page.getByRole("button", { name: "날짜 의미 변경" }).click();
  await expect(page.getByText("날짜 옆에 적힌 이름을 그대로 선택해 주세요. 확실하지 않으면 소비기한으로 짐작하지 않아도 돼요.", { exact: true })).toBeVisible();
  const sellByChoice = page.getByRole("radio", { name: "유통기한", exact: true });
  await sellByChoice.click();
  await expect(page.getByText("숫자가 다르면 아래 날짜를 바꿔 주세요.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "날짜 의미 변경" }).click();
  const useByChoice = page.getByRole("radio", { name: "소비기한", exact: true });
  await expect(useByChoice).toHaveCSS("min-height", "44px");
  await useByChoice.click();
  await expect(page.getByText("소비기한 2026.09.02")).toBeVisible();
  await expect(page.getByText("숫자가 다르면 아래 날짜를 바꿔 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByText("선택한 날짜 · 2026.09.02", { exact: true })).toBeVisible();
  await expect(page.getByText("예시 정보 · 확인 필요")).toBeVisible();
  await expect(page.getByRole("button", { name: "날짜 의미 변경" })).toBeFocused();
  await expect(page.getByRole("button", { name: "새 식품 추가하기" })).toBeVisible();
  await page.getByRole("button", { name: "새 식품 추가하기" }).click();
  await expect(page.locator(".toast")).toHaveText(/시금치/);

  const savedPriorityCard = page.locator(".priority-card").first();
  await expect(savedPriorityCard.locator(".date-source")).toHaveText("포장 소비기한");
  await expect(savedPriorityCard.locator(".priority-state-label")).toHaveText("날짜 확인");
  await savedPriorityCard.click();
  const savedDateProof = page.getByRole("group", { name: "날짜 정보: 포장 소비기한" });
  await expect(savedDateProof).toContainText("2026.09.02");
  await expect(savedDateProof.locator("small")).toHaveText("포장지 표시");
  await expect(page.locator(".date-review-callout")).toContainText("조리 전 확인이 필요해요");

  await page.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  await page.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await page.getByRole("button", { name: "날짜 의미 변경" }).click();
  await page.getByRole("radio", { name: "제조일", exact: true }).click();
  await expect(page.getByRole("button", { name: "기존 식품 날짜 바꾸기" })).toBeEnabled();
  await page.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();

  const manufacturingDateProof = page.getByRole("group", { name: "날짜 정보: 포장 제조일" });
  await expect(manufacturingDateProof).toContainText("2026.09.02");
  await expect(manufacturingDateProof.locator("small")).toHaveText("포장지 표시");
  const dateKindReview = page.locator(".date-review-callout");
  await expect(dateKindReview).toContainText("포장지 날짜 종류를 골라 주세요");
  await expect(dateKindReview).toContainText("포장일·제조일은 소비기한이 아니에요.");
  await expect(dateKindReview).not.toContainText("표시 날짜가 오늘이거나 지났어요");
  await expect(dateKindReview.locator(".date-edit-button")).toBeFocused();
});

test("focuses the updated date proof when a label recheck clears the review warning", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();

  const labelReview = page.getByRole("dialog", { name: "날짜 다시 확인" });
  await labelReview.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await labelReview.getByLabel("포장지 날짜").fill("2026-10-01");
  await labelReview.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();

  const returnedDetail = page.getByRole("dialog", { name: "시금치" });
  const updatedDateProof = returnedDetail.getByRole("group", { name: "날짜 근거: 표시 소비기한" });
  await expect(returnedDetail.locator(".date-review-callout")).toHaveCount(0);
  await expect(updatedDateProof).toContainText("2026.10.01");
  await expect(updatedDateProof).toBeFocused();
});

test("label review lets the user choose a new lot or an existing matching lot", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(dialog.locator(".input-flow > p")).toHaveText("사진에서 포장지 날짜를 읽어드려요. 사진은 식품 기록에 저장하지 않아요.");
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();

  const saveSummary = dialog.locator("#label-result-action-summary");
  const saveAction = dialog.getByRole("button", { name: "새 식품 추가하기" });
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(saveSummary).toHaveText("예시 결과 · 저장 전 확인 · 소비기한 · 2026.09.02 · 새 식품 1개 · 냉장");
  await expect(saveAction).toHaveAttribute("aria-describedby", "label-result-action-summary");
  await expect.poll(() => saveSummary.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);

  const newLot = dialog.getByRole("radio", { name: /새로 산 식품으로 추가/ });
  const existingLot = dialog.getByRole("radio", { name: /기존 식품 · 1팩/ });
  const quantity = dialog.getByRole("textbox", { name: "새 식품 수량" });
  await expect(newLot).toHaveCSS("min-height", "44px");
  await expect(existingLot).toHaveCSS("min-height", "44px");
  await expect(newLot).toHaveAttribute("aria-checked", "true");
  await expect(existingLot).toBeVisible();
  await expect(quantity).toHaveValue("1개");
  await expect(dialog.locator("#label-new-food-quantity-hint")).toHaveText("기본값 1개예요. 실제 보유 수량을 확인해 주세요.");

  await quantity.fill("0팩");
  await expect(dialog.getByRole("button", { name: "수량을 입력해 주세요" })).toBeDisabled();
  await expect(dialog.locator(".label-result-action-summary")).toContainText("새 식품 수량을 입력해 주세요");
  await quantity.fill("2팩");
  await expect(dialog.locator("#label-new-food-quantity-hint")).toHaveText("입력한 수량 2팩을 새 기록에 저장해요.");
  await expect(dialog.getByRole("button", { name: "새 식품 추가하기" })).toBeEnabled();
  await expect(dialog.locator(".label-result-action-summary")).toContainText("소비기한 · 2026.09.02 · 새 식품 2팩 · 냉장");

  await existingLot.click();
  await expect(existingLot).toHaveAttribute("aria-checked", "true");
  await expect(newLot).toHaveAttribute("aria-checked", "false");
  await expect(quantity).toHaveCount(0);
  await expect(dialog.locator(".label-lot-quantity-preserved")).toContainText("기존 수량 1팩은 그대로 두고");
  await expect(dialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" })).toBeEnabled();
  await expect(saveSummary).toHaveText("예시 결과 · 저장 전 확인 · 소비기한 · 2026.09.02 · 기존 식품 1팩 · 냉장");
  await expect(dialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" })).toHaveAttribute("aria-describedby", "label-result-action-summary");

  await newLot.click();
  await expect(newLot).toHaveAttribute("aria-checked", "true");
  await expect(quantity).toHaveValue("2팩");
  await expect(dialog.getByRole("button", { name: "새 식품 추가하기" })).toBeEnabled();
  await expect(saveSummary).toHaveText("예시 결과 · 저장 전 확인 · 소비기한 · 2026.09.02 · 새 식품 2팩 · 냉장");
});

test("label read failure reveals a reachable recovery action without changing the existing date", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();

  const labelReview = page.getByRole("dialog", { name: "날짜 다시 확인" });
  await labelReview.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/spinach-photo.jpg");
  const error = labelReview.locator(".label-result-error-callout");
  const manualFallback = error.getByRole("button", { name: "직접 입력으로 계속" });
  const labelInstruction = labelReview.getByRole("heading", { name: "포장지 날짜를 읽어볼게요" });
  await expect(error).toContainText("포장지 사진을 읽지 못했어요");
  await expect(labelInstruction).toBeInViewport();
  const [instructionBox, sheetHeaderBox] = await Promise.all([
    labelInstruction.boundingBox(),
    labelReview.locator(".sheet-header").boundingBox(),
  ]);
  expect(instructionBox?.y).toBeGreaterThanOrEqual((sheetHeaderBox?.y ?? 0) + (sheetHeaderBox?.height ?? 0));
  await expect(manualFallback).toBeFocused();
  await expect(manualFallback).toHaveCSS("min-height", "44px");
  await expect(manualFallback).toBeInViewport();

  await manualFallback.click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.locator(".date-recheck-context")).toContainText("기존 시금치 날짜는 그대로예요");
  await expect(manualDialog.getByRole("button", { name: "라벨 날짜 확인으로 돌아가기" })).toBeVisible();
  await manualDialog.getByRole("button", { name: "닫기", exact: true }).click();

  const returnedDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(returnedDetail.getByRole("group", { name: "날짜 근거: 표시 소비기한" })).toContainText("2026.09.02");
});

test("label correction blocks a target id that disappeared from the refreshed inventory", async () => {
  const currentFoods = [{ id: "spinach-lot-a" }, { id: "spinach-lot-b" }];
  expect(isStaleLabelLotTarget("correct", "spinach-lot-a", currentFoods)).toBe(false);
  expect(isStaleLabelLotTarget("correct", "spinach-lot-deleted", currentFoods)).toBe(true);
  expect(isStaleLabelLotTarget("create", "spinach-lot-deleted", currentFoods)).toBe(false);
  expect(isStaleLabelLotTarget("correct", null, currentFoods)).toBe(false);
});

test("barcode flow exposes camera scanning and keeps manual lookup fallback", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "바코드" }).click();
  const cameraButton = page.getByRole("button", { name: "카메라로 스캔" });
  await expect(cameraButton).toHaveClass(/primary-sheet-button/);

  const barcodeInput = page.getByRole("textbox", { name: "바코드 숫자" });
  const lookupButton = page.getByRole("button", { name: /상품 정보 찾기|다시 찾기/ });
  await expect(barcodeInput).toHaveAttribute("enterkeyhint", "search");
  await expect(lookupButton).toHaveClass(/secondary-sheet-button/);
  await barcodeInput.fill("8801114167523");
  await expect(lookupButton).toHaveClass(/primary-sheet-button/);
  await expect(cameraButton).toHaveClass(/secondary-sheet-button/);
  await lookupButton.click();
  await expect(page.getByText("상품 정보 1개를 찾았어요.")).toBeVisible();
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("찾은 상품명과 보관 위치가 맞는지 확인해 주세요.");
  await expect(page.locator(".barcode-candidate-heading")).toContainText("찾은 상품 정보");
  await expect(page.locator(".barcode-candidate-heading")).toContainText("확인한 뒤 적용해 주세요");
  await expect(page.getByText("소비기한은 포장지에서 확인해 주세요.", { exact: true })).toBeVisible();
  await expect(page.getByText("소비기한은 포장지의 날짜를 촬영해 확인해 주세요.", { exact: true })).toHaveCount(0);
  const barcodeCandidateAction = page.getByRole("button", { name: "상품 정보 적용" });
  await expect(barcodeCandidateAction).toHaveClass(/barcode-candidate-apply-primary/);
  await expect(lookupButton).toHaveClass(/secondary-sheet-button/);
  await expect(lookupButton).toHaveText("다시 찾기");
  await expect(barcodeCandidateAction).toBeFocused();
  await expect.poll(() => barcodeCandidateAction.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const contentBox = content.getBoundingClientRect();
    const actionBox = element.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);

  await page.getByRole("tab", { name: "라벨" }).click();
  await expect(page.getByRole("heading", { name: "포장지 날짜를 읽어볼게요" })).toBeVisible();
  await page.getByRole("tab", { name: "바코드" }).click();
  await expect(barcodeInput).toHaveValue("8801114167523");
  await expect(barcodeCandidateAction).toBeVisible();

  await barcodeInput.fill("1234567890123");
  await expect(lookupButton).toHaveClass(/primary-sheet-button/);
  await expect(page.getByText("상품 정보 1개를 찾았어요.")).toHaveCount(0);
  await expect(page.locator(".barcode-candidate-list")).toHaveCount(0);
  await lookupButton.click();
  await expect(page.locator(".result-callout")).toContainText("이 데모에서는 예시 바코드만 조회할 수 있어요.");
  await expect(page.locator(".result-callout")).toHaveClass(/result-callout-warning/);
  const barcodeNotFoundStep = page.getByRole("group", { name: "식품 추가 1단계" });
  await expect(barcodeNotFoundStep).toContainText("상품을 찾지 못했어요");
  await expect(barcodeNotFoundStep).toContainText("바코드 숫자를 확인하거나 다른 방법으로 추가해요.");
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toHaveCount(0);
  const manualFallbackCallout = page.locator(".result-callout-manual-fallback");
  const manualFallback = page.locator(".result-callout-action");
  await expect(manualFallbackCallout).toBeVisible();
  await expect(manualFallback).toHaveText("직접 입력으로 계속");
  await expect(manualFallback).toHaveCSS("min-height", "44px");
  await expect(manualFallback).toBeInViewport();
  await expect(manualFallback).toBeFocused();
  await expect.poll(() => manualFallback.evaluate((element) => {
    const callout = element.closest(".result-callout-manual-fallback");
    const scanButton = document.querySelector(".input-flow > .secondary-sheet-button");
    if (!callout || !scanButton) return false;
    return Boolean(callout.compareDocumentPosition(scanButton) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect.poll(() => manualFallback.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const contentBox = content.getBoundingClientRect();
    const actionBox = element.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await expect(page.locator(".barcode-candidate-list")).toHaveCount(0);

  await barcodeInput.fill("8801114167523");
  await expect(page.locator(".result-callout")).toHaveCount(0);
  await barcodeInput.press("Enter");
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(page.getByText("상품 정보 1개를 찾았어요.")).toBeVisible();
  await expect(barcodeCandidateAction).toBeFocused();
  await barcodeCandidateAction.click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.getByRole("textbox", { name: "식품 이름" })).toHaveValue("국산콩 두부");
  await expect(manualDialog.locator(".storage-option-active")).toContainText("냉장");
  const productSourceCard = manualDialog.getByRole("status");
  await expect(productSourceCard).toContainText("상품 정보 출처");
  await expect(productSourceCard).toContainText("보관 제안 냉장");
  await expect(productSourceCard).toContainText("개별 포장지와 날짜를 확인해 주세요");
  await expect(productSourceCard).not.toContainText("상품명·수량·보관 위치를 확인한 뒤 추가해 주세요.");

  await manualDialog.getByRole("tab", { name: "바코드" }).click();
  const returnedBarcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  await expect(returnedBarcodeDialog.getByRole("textbox", { name: "바코드 숫자" })).toHaveValue("8801114167523");
  await expect(returnedBarcodeDialog.locator(".barcode-candidate-list")).toHaveCount(0);
  await returnedBarcodeDialog.getByRole("tab", { name: "직접 입력" }).click();

  const returnedManualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(returnedManualDialog.getByRole("textbox", { name: "식품 이름" })).toHaveValue("국산콩 두부");
  await expect(returnedManualDialog.locator(".storage-option-active")).toContainText("냉장");
  const returnedSourceCard = returnedManualDialog.locator(".manual-product-provenance");
  await expect(returnedSourceCard).toContainText("상품 정보 출처");
  await expect(returnedSourceCard).toContainText("보관 제안 냉장");
  await expect(returnedManualDialog.locator(".intake-flow-rail")).toHaveCount(0);
  await expect(returnedManualDialog.locator("#manual-submit-summary")).toHaveText("추가할 내용 · 국산콩 두부 · 브랜드 후보: 풀무원 · 1개 · 냉장 보관");
  await expect(returnedManualDialog.getByRole("button", { name: "식품 추가하기" })).toHaveAttribute("aria-describedby", "manual-submit-summary");

  await returnedManualDialog.getByRole("textbox", { name: "식품 이름" }).click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect.poll(() => page.evaluate(() => {
    const field = document.querySelector<HTMLElement>("#food-name-input");
    const source = document.querySelector<HTMLElement>(".manual-source-confirmation");
    const summary = document.querySelector<HTMLElement>("#manual-submit-summary");
    const action = document.querySelector<HTMLElement>(".manual-submit-bar .manual-submit");
    const content = field?.closest<HTMLElement>(".sheet-content");
    if (!field || !source || !summary || !action || !content) return false;
    const bounds = (element: HTMLElement) => element.getBoundingClientRect();
    const visibleAboveKeyboard = (element: HTMLElement) => {
      const box = bounds(element);
      const clip = bounds(content);
      return box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1;
    };
    return visibleAboveKeyboard(field) && visibleAboveKeyboard(source) && visibleAboveKeyboard(summary) && visibleAboveKeyboard(action);
  })).toBe(true);
});

test("keeps the Pixel 10 manual draft and add action above the Android keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();
  await expect(page.getByTestId("phone-frame")).toHaveAttribute("data-device", "pixel-10");

  await page.getByRole("button", { name: "식품 추가하기", exact: true }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "바코드" }).click();
  await page.getByRole("button", { name: "예시 바코드 입력" }).click();
  await page.getByRole("button", { name: "상품 정보 적용" }).click();

  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.locator("#manual-submit-summary")).toHaveText("추가할 내용 · 국산콩 두부 · 브랜드 후보: 풀무원 · 1개 · 냉장 보관");
  await expect(manualDialog.getByRole("button", { name: "식품 추가하기" })).toHaveAttribute("aria-describedby", "manual-submit-summary");
  await manualDialog.getByRole("textbox", { name: "식품 이름" }).click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect.poll(() => page.evaluate(() => {
    const field = document.querySelector<HTMLElement>("#food-name-input");
    const source = document.querySelector<HTMLElement>(".manual-source-confirmation");
    const summary = document.querySelector<HTMLElement>("#manual-submit-summary");
    const action = document.querySelector<HTMLElement>(".manual-submit-bar .manual-submit");
    const content = field?.closest<HTMLElement>(".sheet-content");
    if (!field || !source || !summary || !action || !content) return false;
    const bounds = (element: HTMLElement) => element.getBoundingClientRect();
    const clip = bounds(content);
    return [field, source, summary, action].every((element) => {
      const box = bounds(element);
      return box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1;
    });
  })).toBe(true);

  await manualDialog.getByRole("tab", { name: "영수증" }).click();
  const switchedReceiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(switchedReceiptDialog).toBeVisible();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "false");
  await switchedReceiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const returnedManualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(returnedManualDialog.getByRole("textbox", { name: "식품 이름" })).toHaveValue("국산콩 두부");
  await expect(returnedManualDialog.getByRole("status")).toContainText("상품 정보 출처");
});

test("preserves Pixel 10 label-date review across input tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();
  await expect(page.getByTestId("phone-frame")).toHaveAttribute("data-device", "pixel-10");

  await page.getByRole("button", { name: "식품 추가하기", exact: true }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(labelDialog.locator(".label-result-provenance")).toHaveAttribute("data-label-source", "example");
  await expect(labelDialog.getByLabel("포장지 날짜")).toHaveValue("2026-09-02");

  await labelDialog.getByRole("tab", { name: "영수증" }).click();
  const switchedReceiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(switchedReceiptDialog).toBeVisible();
  await switchedReceiptDialog.getByRole("tab", { name: "라벨" }).click();

  const returnedLabelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(returnedLabelDialog.locator(".label-result-provenance")).toHaveAttribute("data-label-source", "example");
  await expect(returnedLabelDialog.getByLabel("포장지 날짜")).toHaveValue("2026-09-02");
  await returnedLabelDialog.getByRole("button", { name: "날짜 의미 변경" }).click();
  await returnedLabelDialog.getByRole("radio", { name: "포장일" }).click();
  await expect(returnedLabelDialog.getByText("포장일 2026.09.02", { exact: true })).toBeVisible();
  await expect(returnedLabelDialog.getByRole("button", { name: "새 식품 추가하기" })).toBeEnabled();
  const labelQuantity = returnedLabelDialog.getByRole("textbox", { name: "새 식품 수량" });
  await labelQuantity.scrollIntoViewIfNeeded();
  await labelQuantity.click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toContainText("예시 결과 · 저장 전 확인 · 포장일 · 2026.09.02 · 새 식품 1개 · 냉장");
  await expect.poll(() => page.evaluate(() => {
    const field = document.querySelector<HTMLElement>("#label-new-food-quantity");
    const storage = document.querySelector<HTMLElement>(".label-result-card .storage-picker");
    const summary = document.querySelector<HTMLElement>(".label-result-action-summary");
    const action = document.querySelector<HTMLElement>(".label-result-action-bar .label-result-action");
    const content = field?.closest<HTMLElement>(".sheet-content");
    if (!field || !storage || !summary || !action || !content) return false;
    const fieldBox = field.getBoundingClientRect();
    const storageBox = storage.getBoundingClientRect();
    const summaryBox = summary.getBoundingClientRect();
    const actionBox = action.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return fieldBox.top >= contentBox.top - 1
      && fieldBox.bottom <= summaryBox.top + 1
      && storageBox.bottom <= summaryBox.top + 1
      && summaryBox.bottom <= actionBox.top + 1
      && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);

  await returnedLabelDialog.getByRole("tab", { name: "라벨" }).click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "false");
  const existingLot = returnedLabelDialog.getByRole("radio", { name: /기존 식품 · 1팩/ });
  await existingLot.click();
  await expect(returnedLabelDialog.locator(".label-lot-quantity-preserved")).toContainText("기존 수량 1팩은 그대로 두고");

  await returnedLabelDialog.getByRole("button", { name: "날짜 의미 변경" }).click();
  const missingMeaningAction = returnedLabelDialog.getByRole("button", { name: "날짜·보관 위치를 선택해 주세요" });
  await expect(missingMeaningAction).toBeDisabled();
  await returnedLabelDialog.getByLabel("라벨 상품명").click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toHaveText("예시 결과 · 저장 전 확인 · 날짜 종류를 골라 주세요 · 2026.09.02 · 기존 식품 1팩 · 냉장");
  await expect(missingMeaningAction).toBeDisabled();

  const manufacturingDateChoice = returnedLabelDialog.getByRole("radio", { name: "제조일", exact: true });
  await manufacturingDateChoice.click();
  await expect(returnedLabelDialog.getByText("제조일 2026.09.02", { exact: true })).toBeVisible();
  await expect(returnedLabelDialog.getByText("숫자가 다르면 아래 날짜를 바꿔 주세요. 이 날짜는 소비기한이 아닐 수 있어요. 보관 방법도 살펴봐 주세요.", { exact: true })).toBeVisible();
  const correctExistingLot = returnedLabelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" });
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(correctExistingLot).toBeEnabled();
  await expect(returnedLabelDialog.getByRole("button", { name: "날짜 의미 변경" })).toBeFocused();
  await expect(correctExistingLot).toBeVisible();
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toHaveText("예시 결과 · 저장 전 확인 · 제조일 · 2026.09.02 · 기존 식품 1팩 · 냉장");
  await expect(correctExistingLot).toHaveAttribute("aria-describedby", "label-result-action-summary");

  await returnedLabelDialog.getByLabel("라벨 상품명").click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toContainText("예시 결과 · 저장 전 확인 · 제조일 · 2026.09.02 · 기존 식품 1팩 · 냉장");
});

test("barcode camera shows a manual fallback when media devices are unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });
  await page.reload();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "바코드" }).click();
  await page.getByRole("button", { name: "카메라로 스캔" }).click();

  await expect(page.getByText("카메라를 사용할 수 없어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "수동 입력으로 계속" })).toBeFocused();
  await page.getByRole("button", { name: "수동 입력으로 계속" }).click();
  await expect(page.getByRole("textbox", { name: "바코드 숫자" })).toBeVisible();
});

test("estimated date can be confirmed with an explicit date meaning", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const confirmedDate = new Date();
  confirmedDate.setHours(12, 0, 0, 0);
  confirmedDate.setDate(confirmedDate.getDate() + 10);
  const confirmedDateValue = [confirmedDate.getFullYear(), confirmedDate.getMonth() + 1, confirmedDate.getDate()]
    .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
    .join("-");
  const confirmedDateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(confirmedDate);
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();

  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("radio")).toHaveCount(4);
  await expect(editor.locator(".date-kind-picker [aria-checked='true']")).toHaveCount(0);
  const dateKindColumnCount = await editor.locator(".date-kind-picker").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(dateKindColumnCount).toBe(2);
  await expect(editor.getByRole("radio", { name: "유통기한", exact: true })).toBeFocused();
  await expect(editor.getByRole("radio", { name: "유통기한", exact: true })).toHaveCSS("outline-style", "solid");
  await expect(editor.getByRole("radio", { name: "유통기한", exact: true })).toHaveCSS("min-height", "44px");
  await expect(editor.locator(".date-editor-heading small")).toHaveCSS("font-size", "12px");
  await expect(editor.locator("#date-kind-selection-hint")).toHaveText("포장지에 적힌 날짜 이름을 그대로 골라 주세요. 확실하지 않으면 소비기한으로 짐작하지 않아도 돼요.");
  await expect(editor.locator("#date-kind-selection-hint")).toHaveCSS("font-size", "12px");
  await expect(editor.locator(".date-editor-footnote")).toHaveText("날짜 종류를 먼저 선택해 주세요.");
  await expect(editor.locator(".date-editor-footnote")).toHaveCSS("font-size", "12px");
  await expect(editor.getByRole("button", { name: "날짜 종류 선택" })).toHaveCSS("min-height", "44px");
  await expect(editor.getByRole("button", { name: "날짜 종류 선택" })).toBeDisabled();
  await editor.getByRole("radio", { name: "유통기한", exact: true }).press("ArrowRight");
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toBeFocused();
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toHaveAttribute("aria-checked", "true");
  await editor.getByRole("radio", { name: "소비기한", exact: true }).press("ArrowDown");
  await expect(editor.getByRole("radio", { name: "내 알림일", exact: true })).toBeFocused();
  await editor.getByRole("radio", { name: "내 알림일", exact: true }).press("ArrowUp");
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toBeFocused();
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(editor.getByRole("button", { name: "날짜 입력" })).toBeDisabled();
  await editor.getByRole("textbox", { name: "날짜" }).fill(confirmedDateValue);
  await expect(editor.getByText(`선택한 날짜 · ${confirmedDateValue.replaceAll("-", ".")}`, { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(page.getByRole("status")).toContainText("국산콩 두부 소비기한을 사용자 확인으로 저장했어요");
  await expect(page.locator(".toast")).not.toContainText("알림으로 돌아왔어요");
  await expect(page.locator(".toast-action")).toHaveText("다음 식품 살펴보기");
  const updatedFoodRow = inventory.getByRole("button", { name: new RegExp(`국산콩 두부 풀무원 · 1모 .*먼저 먹기.*${confirmedDateLabel}`) });
  await expect(updatedFoodRow).toBeVisible();
  await expect(updatedFoodRow.locator(".inventory-storage-meta")).toContainText("포장지 표시");
  await expect(updatedFoodRow).toBeFocused();
  await updatedFoodRow.click();
  const confirmedDetail = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(confirmedDetail.locator(".date-proof-card small")).toHaveText("포장지에서 사용자 확인");
  await expect(confirmedDetail.locator(".detail-note")).toHaveCount(0);
  await confirmedDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await page.locator(".toast-action").click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
});

test("receipt-backed food detail explains purchase provenance without exposing internal ids", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 · 2팩/ }).click();
  const dialog = page.getByRole("dialog", { name: "맛타리버섯" });

  await expect(dialog.getByRole("group", { name: "구매 출처" })).toContainText("영수증에서 추가");
  await expect(dialog.getByRole("group", { name: "구매 출처" })).toContainText("2026년 9월 1일 구매");
  await expect(dialog.getByRole("group", { name: "구매 출처" })).toContainText("영수증 상품 항목 연결됨");
  await expect(dialog.getByRole("group", { name: "구매 출처" })).toContainText("구매 기록은 소비기한을 확정하지 않아요.");
  await expect(dialog.getByRole("group", { name: "구매 출처" })).not.toContainText("demo-receipt");
});

test("detail save stays quiet until a storable food state changes", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  const saveButton = dialog.locator(".detail-actions .primary-sheet-button");

  await expect(saveButton).toHaveCount(0);
  await expect(dialog.locator(".detail-actions")).toHaveClass(/detail-actions-no-save/);
  await expect(dialog.locator(".detail-actions .detail-consume-action")).toBeVisible();
  await expect(dialog.locator(".detail-save-hint")).toContainText("보관 위치·개봉 상태를 바꾸면 저장할 수 있어요.");

  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await expect(saveButton).toHaveCount(0);
  await expect(dialog.locator(".detail-actions")).toHaveClass(/detail-actions-no-save/);
  await expect(dialog.locator(".detail-save-hint")).toContainText("수량만 바꿨다면 먹었어요·폐기 기록에 적용돼요.");
  await expect(dialog.getByRole("button", { name: "1팩 먹었어요" })).toBeVisible();

  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(dialog.locator(".detail-actions")).not.toHaveClass(/detail-actions-no-save/);
  await expect(saveButton).toBeEnabled();
  await expect(saveButton).toHaveText(/변경 저장/);
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("저장 필요 · 보관 위치 · 수량");
});

test("date-warning food separates safety review from the consume record", async ({ page }) => {
  await expect(page.locator(".inventory-row").filter({ hasText: "시금치" }).first()).toHaveAttribute("data-date-state", "actual_printed");
  await page.locator(".priority-card").first().click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog.locator(".date-proof-card")).toHaveClass(/date-proof-printed/);
  await expect(dialog.locator(".date-proof-card")).toHaveAttribute("data-date-state", "actual_printed");

  await dialog.locator(".detail-consume-action-review").click();
  const confirmation = dialog.getByRole("group", { name: "이 수량을 먹은 기록으로 남길까요?" });
  await expect(confirmation).toHaveAttribute("aria-live", "polite");
  await expect(confirmation).toHaveAttribute("aria-describedby", "consume-confirm-description");
  await expect(confirmation).toContainText("이 수량을 먹은 기록으로 남길까요?");
  await expect(confirmation.getByRole("group", { name: "이번 소비 기록" })).toContainText("시금치");
  await expect(confirmation.getByRole("group", { name: "이번 소비 기록" })).toContainText("1팩");
  await expect(confirmation).toContainText("이미 먹은 경우에만 기록해 주세요");
  await expect(confirmation).toContainText("안전 여부를 판정하지 않아요");
  await expect(confirmation.locator(".consume-confirm-safety-copy")).toHaveCSS("font-size", "12px");
  await expect(confirmation.getByRole("button", { name: "돌아가기" })).toBeFocused();
  await confirmation.getByRole("button", { name: "돌아가기" }).click();
  await expect(dialog.locator(".detail-consume-action-review")).toBeFocused();
  await dialog.locator(".detail-consume-action-review").click();
  const resumedConfirmation = dialog.locator(".consume-confirm");
  await expect(resumedConfirmation).toBeVisible();
  await resumedConfirmation.getByRole("button", { name: "먹었어요", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("시금치를 먹은 기록으로 남겼어요");
  await expect(page.getByRole("status")).toContainText("이어서 국산콩 두부도 확인해 보세요");
  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 2" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.locator(".priority-card").first()).toBeFocused();
});

test("consume confirmation explains that pending storage changes are not part of the record", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  const stateSummary = dialog.getByRole("group", { name: "보관 및 개봉 상태" });

  await expect(stateSummary).toContainText("냉장 보관 중");
  await expect(stateSummary).toContainText("개봉 상태 · 개봉됨");

  await dialog.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(stateSummary.locator(".detail-hero-storage-pending")).toHaveText("저장 전 · 냉동");
  await expect(stateSummary).not.toContainText("냉동 보관 중");
  await expect(dialog.locator(".detail-section-heading small").first()).toHaveText("저장 필요 · 보관 위치");
  await dialog.locator(".detail-consume-action-review").click();

  const confirmation = dialog.getByRole("group", { name: "이 수량을 먹은 기록으로 남길까요?" });
  await expect(confirmation.locator(".consume-confirm-unsaved-copy")).toContainText("저장되지 않은 보관 위치 변경은 먹은 기록에 반영되지 않아요");
  const returnToSave = confirmation.getByRole("button", { name: "돌아가서 변경 저장" });
  await expect(returnToSave).toBeFocused();
  await returnToSave.click();
  await expect(dialog.locator(".detail-save-action")).toBeVisible();
  await expect(dialog.locator(".detail-section-heading small").first()).toHaveText("저장 필요 · 보관 위치");
});

test("food detail state summary marks an unsaved opened event as pending", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  const stateSummary = dialog.getByRole("group", { name: "보관 및 개봉 상태" });

  await expect(stateSummary).toContainText("냉장 보관 중");
  await expect(stateSummary).toContainText("개봉 상태 · 미개봉");
  await dialog.getByRole("switch", { name: "국산콩 두부 개봉 상태" }).click();
  await expect(stateSummary.locator(".detail-hero-open-state-pending")).toHaveText("개봉 상태 저장 전");
  await expect(dialog.locator(".detail-save-action")).toBeVisible();

  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
});

test("user-confirmed date detail exposes the date without repeating the source label", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  const dateProof = dialog.locator(".date-proof-card");

  await expect(dateProof).toHaveClass(/date-proof-user-confirmed/);
  await expect(dateProof).toHaveAttribute("data-date-state", "user_confirmed");
  await expect(dateProof.locator("span").first()).toHaveText("사용자 확인");
  await expect(dateProof.locator("strong")).toHaveText("9월 6일");
  await expect(dateProof.locator("small")).toHaveText("사용자 입력");
});

test("estimated use-first dates read as priority references, not expiry deadlines", async ({ page }) => {
  const homeCard = page.locator(".priority-card").filter({ hasText: "국산콩 두부" });
  await expect(homeCard.locator(".date-source")).toHaveText("우선순위 참고");
  await expect(homeCard.locator(".priority-date small")).toHaveText("우선 확인");
  await homeCard.click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  const dateProof = detail.locator(".date-proof-card");
  await expect(dateProof).toHaveAttribute("aria-label", "날짜 근거: 우선순위 참고");
  await expect(dateProof.locator("strong")).toHaveText("먼저 살펴볼 시점 · 9월 4일");
  await expect(dateProof).not.toContainText("까지 먼저 먹기");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".inventory-status")).toHaveText("우선 확인 · 9월 4일");
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".inventory-storage-meta")).toContainText("우선순위 참고");
});

test("user-confirmed reminder can reopen its existing date and meaning for editing", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });

  await dialog.getByRole("button", { name: "확인한 알림 날짜 수정" }).click();
  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor.getByRole("textbox", { name: "날짜" })).toHaveValue("2026-09-06");
  await expect(editor.getByRole("radio", { name: "내 알림일", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("partial storage move splits a multi-quantity food into two lots", async ({ page }) => {
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("냉동에 보관 중");
  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("저장 필요 · 보관 위치 · 수량");
  await expect(dialog.locator(".detail-section")).toHaveClass(/detail-section-pending/);
  await expect(dialog.locator(".detail-actions .detail-save-pending")).toBeVisible();
  await dialog.locator(".detail-actions .primary-sheet-button").click();
  await expect(page.getByRole("status")).toHaveText("보관 상태를 저장하고 남은 수량을 나눴어요");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 8" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1팩/ })).toHaveCount(2);
  await expect(page.locator(".priority-card").filter({ hasText: /닭가슴살.*1팩/ }).first()).toBeFocused();
});

test("partial discard requires confirmation and preserves the remaining quantity", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 · 2팩/ }).click();
  const dialog = page.getByRole("dialog", { name: "맛타리버섯" });
  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await dialog.getByRole("button", { name: "상태가 이상해 폐기하기" }).click();
  const discardConfirmation = dialog.getByRole("alert");
  await expect(discardConfirmation.locator(".discard-confirm-quantity")).toContainText("맛타리버섯");
  await expect(discardConfirmation.locator(".discard-confirm-quantity")).toContainText("1팩");
  await expect(discardConfirmation).toContainText("폐기 후 남는 수량: 1팩.");
  await expect(discardConfirmation).toContainText("날짜만으로 안전 여부를 판단하지 않아요");
  const cancelDiscard = discardConfirmation.getByRole("button", { name: "취소" });
  await expect(cancelDiscard).toBeFocused();
  await cancelDiscard.click();
  const discardAction = dialog.getByRole("button", { name: "상태가 이상해 폐기하기" });
  await expect(discardAction).toBeFocused();
  await discardAction.click();
  const resumedDiscardConfirmation = dialog.locator(".discard-confirm");
  await expect(resumedDiscardConfirmation).toBeVisible();
  await resumedDiscardConfirmation.getByRole("button", { name: "폐기 기록" }).click();

  await expect(page.getByRole("status")).toHaveText("맛타리버섯 1팩을 폐기 기록으로 남겼어요");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 · 1팩/ })).toBeFocused();
});

test("inventory consume returns focus to the next pantry row", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "먹었어요", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부를 먹은 기록으로 남겼어요");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 · 1팩/ })).toBeFocused();
});

test("inventory discard returns focus to the next pantry row", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "상태가 이상해 폐기하기" }).click();
  const discardConfirmation = dialog.getByRole("alert");
  await expect(discardConfirmation.locator(".discard-confirm-quantity")).toContainText("국산콩 두부");
  await expect(discardConfirmation.locator(".discard-confirm-quantity")).toContainText("1모");
  await expect(discardConfirmation).toContainText("폐기 기록 후 이 식품은 목록에서 사라져요.");
  await dialog.getByRole("button", { name: "폐기 기록" }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부 폐기 기록을 남겼어요");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 · 1팩/ })).toBeFocused();
});

test("inventory filter narrows the list by storage location", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("combobox", { name: "보관 위치 필터" }).selectOption({ label: "냉동만" });

  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("냉동 보관 식품 · 1개");
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산/ })).toHaveCount(0);
});

test("inventory search finds food by name and recovers from no results", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect.poll(() => inventory.evaluate((element) => {
    const screenElement = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    if (!screenElement) return Number.POSITIVE_INFINITY;
    return Math.abs(element.getBoundingClientRect().top - screenElement.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(1);

  await search.fill("두부");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("“두부” 검색 결과 · 1개");
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect.poll(() => page.getByTestId("keyboard-dock").evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    if (!screen) return Number.POSITIVE_INFINITY;
    return Math.abs(element.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom);
  })).toBeLessThanOrEqual(1);
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => {
    const keyboard = document.querySelector<HTMLElement>("[data-testid=keyboard-dock]");
    if (!keyboard) return Number.POSITIVE_INFINITY;
    return Math.abs(element.getBoundingClientRect().bottom - keyboard.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(1);
  const keyboardLayout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    const screen = rect("[data-testid=device-screen]");
    const keyboard = rect("[data-testid=keyboard-dock]");
    const scroll = rect("[data-testid=mobile-scroll]");
    const toolbar = rect(".inventory-toolbar");
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
    return {
      screen,
      keyboard,
      scroll,
      toolbar,
      navigationVisibility: navigation ? getComputedStyle(navigation).visibility : "missing",
    };
  });
  expect(keyboardLayout.screen).toBeTruthy();
  expect(keyboardLayout.keyboard).toBeTruthy();
  expect(keyboardLayout.scroll).toBeTruthy();
  expect(keyboardLayout.toolbar).toBeTruthy();
  expect(Math.abs((keyboardLayout.keyboard?.bottom ?? 0) - (keyboardLayout.screen?.bottom ?? 0))).toBeLessThanOrEqual(1);
  // The simulated keyboard and mobile scroll root can land on fractional CSS
  // pixels after the visual viewport resize; keep the safety boundary tight
  // while allowing the subpixel compositor rounding that does not expose the
  // toolbar or input behind the keyboard.
  expect(Math.abs((keyboardLayout.scroll?.bottom ?? 0) - (keyboardLayout.keyboard?.top ?? 0))).toBeLessThanOrEqual(2);
  expect((keyboardLayout.toolbar?.bottom ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual((keyboardLayout.keyboard?.top ?? 0) + 1);
  expect(keyboardLayout.navigationVisibility).toBe("hidden");
  await expect(inventory.getByRole("button", { name: /국산콩 두부 풀무원/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산/ })).toHaveCount(0);

  await inventory.getByRole("button", { name: "검색·필터 초기화" }).first().click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");

  await search.fill("없는 식품");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("“없는 식품” 검색 결과 · 0개");
  await expect(inventory.locator(".inventory-empty-state")).toContainText("검색 결과가 없어요");
  await inventory.locator(".inventory-empty-state").getByRole("button", { name: "검색·필터 초기화" }).click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
});

test("recipe sheet previews the pantry, saves a recipe, and records completion", async ({ page }) => {
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });

  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.locator(".recipe-kicker")).toHaveText("RESCUE MEAL");
  await expect(dialog.locator(".recipe-provenance")).toHaveText("출처 · Rescue Meal에서 작성 · 필요한 재료를 모두 갖고 있어요");
  await expect(dialog.locator(".recipe-preview-save-note")).toHaveText("미리보기 식단 저장은 화면을 벗어나면 초기화돼요. 재고는 조리 완료를 기록하기 전까지 바뀌지 않아요.");
  await expect(dialog).not.toContainText("DEMO FIXTURE");
  await expect(dialog).not.toContainText("project-authored");
  await expect(dialog).not.toContainText("demo-v1");

  await dialog.getByRole("button", { name: "4인분", exact: true }).click();
  await expect(dialog.locator(".recipe-availability-summary strong")).toHaveText("필요량 충족 0/3종");
  await expect(dialog.locator(".recipe-ingredient-row").filter({ hasText: "시금치" })).toContainText("필요 4팩 · 보유 1팩 · 3팩 부족");
  await expect(dialog.locator(".recipe-plan-save-serving")).toHaveText("4인분");
  await dialog.getByRole("button", { name: "1인분", exact: true }).click();
  await expect(dialog.locator(".recipe-availability-summary strong")).toHaveText("필요한 재료를 모두 갖고 있어요");
  const saveMealButton = dialog.getByRole("button", { name: "미리보기 저장" });
  await expect(saveMealButton.locator(".recipe-plan-save-serving")).toHaveText("1인분");
  await expect(saveMealButton).toHaveAttribute("aria-describedby", "recipe-serving-note recipe-preview-save-note");

  const safetyEntry = dialog.getByRole("button", { name: "사용 전 확인 2건 보기" });
  await expect(safetyEntry).toBeVisible();
  await expect(safetyEntry).toBeFocused();
  const dateReviewCallout = dialog.locator(".recipe-safety-summary-list .recipe-date-review-callout");
  await expect(dateReviewCallout).toHaveCount(1);
  await expect(dateReviewCallout).toContainText("조리 전 날짜 확인이 필요해요");
  const dateReviewAction = dateReviewCallout.getByRole("button", { name: "식품 확인 · 시금치" });
  await expect(dateReviewAction).toBeVisible();
  await safetyEntry.click();
  await expect(dateReviewAction).toBeFocused();
  await dateReviewAction.click();
  const mealLinkedDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(mealLinkedDetail).toBeVisible();
  await expect(mealLinkedDetail.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
  await mealLinkedDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "식품 확인 · 시금치" })).toBeFocused();
  await expect(dialog.getByText("필요한 재료", { exact: true })).toBeVisible();
  const ingredientDetailsBeforeActions = await dialog.evaluate((element) => {
    const ingredientDetails = element.querySelector(".recipe-ingredients");
    const planActions = element.querySelector(".recipe-actions");
    return Boolean(ingredientDetails && planActions && (ingredientDetails.compareDocumentPosition(planActions) & 4));
  });
  expect(ingredientDetailsBeforeActions).toBe(true);
  await dialog.getByRole("button", { name: "조리 방법 보기" }).click();
  await expect(dialog.getByText("조리 순서")).toBeVisible();
  await expect(dialog.getByText("조리 전 확인", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "미리보기 저장" }).click();
  await expect(dialog.getByRole("button", { name: "미리보기 저장됨" })).toBeVisible();
  await expect(dialog.locator(".saved-recipe strong")).toHaveText("미리보기 식단을 저장했어요 · 1인분");
  await expect(dialog.locator(".saved-recipe")).toContainText("사용할 재료와 양을 확인한 뒤 조리를 마치면 완료를 기록해 주세요.");
  await expect(page.locator(".toast")).toHaveText("미리보기 식단을 저장했어요 · 화면을 벗어나면 초기화돼요");
  await expect(dialog.locator(".recipe-consumption-heading")).toHaveCSS("display", "grid");
  await expect(dialog.locator(".recipe-consumption-heading > span")).toHaveCSS("white-space", "nowrap");
  await expect(dialog.locator(".recipe-consumption-heading small")).toContainText("기본값은 재료 3개 전부 사용");
  const spinachUsage = dialog.getByRole("spinbutton", { name: "시금치 사용량" });
  await spinachUsage.fill("0");
  await expect(dialog.locator(".recipe-consumption-heading small")).toContainText("현재 2개 사용 · 1개는 재고에 남겨요.");
  await spinachUsage.fill("1");
  await expect(spinachUsage).toHaveValue("1");
  await expect(dialog.locator(".recipe-consumption-heading small")).toContainText("기본값은 재료 3개 전부 사용");
  await spinachUsage.fill("0");
  await dialog.getByRole("spinbutton", { name: "두부 사용량" }).fill("0");
  await dialog.getByRole("spinbutton", { name: "닭가슴살 사용량" }).fill("0");
  await expect(dialog.locator(".recipe-consumption-heading small")).toHaveText("사용량을 하나 이상 선택해야 조리 완료를 기록할 수 있어요. 재고는 그대로 남아요.");
  await expect(dialog.getByRole("button", { name: "사용량을 하나 이상 선택해 주세요" })).toBeDisabled();
  await spinachUsage.fill("1");
  const safetyAcknowledgement = dialog.locator(".recipe-complete-actions").getByRole("button", { name: "조리 전 확인했어요" });
  await expect(safetyAcknowledgement).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 전 확인 후 기록" })).toBeDisabled();
  await safetyAcknowledgement.click();
  await expect(dialog.locator(".recipe-complete-actions").getByRole("button", { name: "확인 완료" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 완료로 기록" })).toBeVisible();
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "내 식품 목록 5" })).toBeVisible();
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1팩/ })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
  await expect(page.locator(".toast")).toContainText("조리 완료 · 3개 재료를 차감했어요");
  await expect(page.locator(".toast-action")).toHaveText("다음 식품 살펴보기");
});

test("meal completion reports a skipped ingredient that remains in inventory", async ({ page }) => {
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();

  await dialog.getByRole("button", { name: "미리보기 저장" }).click();
  await expect(dialog.getByRole("button", { name: "미리보기 저장됨" })).toBeVisible();
  await dialog.getByRole("spinbutton", { name: "시금치 사용량" }).fill("0");
  await dialog.getByRole("button", { name: "조리 전 확인했어요" }).click();
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();

  await expect(page.locator(".toast")).toContainText("조리 완료 · 2개 재료를 사용했어요 · 1개는 재고에 남겼어요");
  await expect(page.locator(".toast-action")).toHaveText("다음 식품 살펴보기");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "내 식품 목록 6" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
});

test("meal consumption controls reflow and retain 44px targets on narrow phones", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await dialog.getByRole("button", { name: "미리보기 저장", exact: true }).click();

  const firstUsageRow = dialog.locator(".recipe-consumption-row").first();
  await expect(firstUsageRow).toHaveCSS("display", "grid");
  await expect(firstUsageRow.locator(".recipe-consumption-stepper button").first()).toHaveCSS("width", "44px");
  await expect(firstUsageRow.locator(".recipe-consumption-stepper button").first()).toHaveCSS("height", "44px");
  const usageNameWidth = await firstUsageRow.locator(":scope > span").evaluate((element) => element.clientWidth);
  expect(usageNameWidth).toBeGreaterThan(40);
});

test("fixture meal shortages can be added, received, and sent to date review", async ({ page }) => {
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const meal = page.getByRole("dialog", { name: "오늘의 식단" });
  await meal.getByRole("button", { name: "4인분", exact: true }).click();
  await expect(meal.locator(".recipe-availability-summary strong")).toHaveText("필요량 충족 0/3종");
  await meal.getByRole("button", { name: "미리보기 저장", exact: true }).click();
  await expect(meal.getByRole("button", { name: "장보기 목록에 담기", exact: true })).toBeVisible();
  await expect(page.locator(".toast-action")).toHaveText("부족 재료 담기");

  await page.locator(".toast-action").click();
  const shopping = page.getByRole("dialog", { name: "장보기 목록" });
  const spinachPlanItem = shopping.getByRole("button", { name: "시금치 3팩 · 식단 1개", exact: true });
  await expect(spinachPlanItem).toBeVisible();
  await shopping.getByRole("textbox", { name: "직접 추가 상품명" }).fill("시금치");
  await shopping.getByRole("spinbutton", { name: "직접 추가 수량" }).fill("1");
  await shopping.getByRole("textbox", { name: "직접 추가 단위" }).fill("팩");
  await shopping.getByRole("button", { name: "추가", exact: true }).click();
  const spinachItem = shopping.getByRole("button", { name: "시금치 4팩 · 직접 추가 · 식단 1개", exact: true });
  await expect(spinachItem).toBeVisible();
  await expect(shopping.locator(".shopping-sheet-item").filter({ hasText: "시금치" })).toHaveCount(1);

  await shopping.getByRole("textbox", { name: "직접 추가 상품명" }).fill("대파");
  await shopping.getByRole("button", { name: "추가", exact: true }).click();
  await expect(shopping.getByRole("button", { name: "대파 1개 · 직접 추가", exact: true })).toBeVisible();

  await spinachItem.click();
  await expect(spinachItem).toHaveAttribute("aria-pressed", "true");
  await shopping.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(shopping).toHaveCount(0);
  await expect(meal).toBeVisible();
  await meal.getByRole("button", { name: "미리보기 저장", exact: true }).click();
  const addPlanShortagesAgain = meal.getByRole("button", { name: "장보기 목록에 담기", exact: true });
  await expect(addPlanShortagesAgain).toBeVisible();
  await addPlanShortagesAgain.click();
  const reloadedSpinachItem = shopping.getByRole("button", { name: "시금치 4팩 · 직접 추가 · 식단 1개", exact: true });
  await expect(reloadedSpinachItem).toHaveAttribute("aria-pressed", "true");
  await expect(shopping.locator(".shopping-sheet-item").filter({ hasText: "시금치" })).toHaveCount(1);
  await reloadedSpinachItem.click();
  await expect(reloadedSpinachItem).toHaveAttribute("aria-pressed", "false");

  await shopping.getByRole("button", { name: "시금치 재고에 반영", exact: true }).click();

  const receivePanel = shopping.getByRole("form", { name: "시금치 재고 반영" });
  await expect(receivePanel.getByRole("spinbutton", { name: "시금치 구매 수량" })).toHaveValue("4");
  await expect(receivePanel.locator(".shopping-sheet-receive-step-active").first()).toContainText("구매 확인");
  await expect(receivePanel.getByRole("button", { name: "재고에 반영", exact: true })).toBeDisabled();
  await receivePanel.getByRole("button", { name: "구매 완료로 표시", exact: true }).click();
  await expect(receivePanel.getByRole("button", { name: "재고에 반영", exact: true })).toBeEnabled();
  await receivePanel.getByRole("button", { name: "재고에 반영", exact: true }).click();
  await expect(shopping.locator(".shopping-sheet-received")).toContainText("재고에 반영했어요");
  await expect(shopping.locator(".shopping-sheet-received")).toContainText("포장지 날짜와 보관 상태를 확인해 주세요");

  await shopping.getByRole("button", { name: "식품 상세 확인", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail.locator(".detail-hero-copy p")).toHaveText("장보기 · 4팩");
  await expect(detail.locator(".date-proof-card")).toHaveAttribute("data-date-state", "unknown");
  await expect(detail.locator(".date-proof-card")).toContainText("표시 날짜 미확인");
  await expect(detail.locator(".food-provenance-card")).toContainText("장보기 목록에서 구매");
  await expect(detail.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
});

test("render failures show a recovery screen without exposing exception details", async ({ page }) => {
  await page.goto("/tests/runtime-error-fixture.html");

  await expect(page.getByRole("main", { name: "Rescue Meal 화면 오류" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "잠시 문제가 생겼어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시작하기" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("fixture-only render failure");
});

test("guest home can reopen the temporary shopping list and explains its lifetime", async ({ page }) => {
  const shoppingSummary = page.locator(".shopping-summary-card").filter({ hasText: "미리보기" });
  await expect(shoppingSummary).toBeVisible();
  await expect(shoppingSummary).toContainText("아직 담은 재료가 없어요");
  const homeActionOrder = await page.evaluate(() => {
    const safetySummary = document.querySelector(".trust-card");
    const mealAction = document.querySelector(".meal-plan-button");
    const shoppingAction = [...document.querySelectorAll<HTMLElement>(".shopping-summary-card")]
      .find((element) => element.querySelector(".shopping-summary-kicker")?.textContent?.trim() === "장보기");
    return Boolean(safetySummary && mealAction && shoppingAction
      && (safetySummary.compareDocumentPosition(mealAction) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (mealAction.compareDocumentPosition(shoppingAction) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(homeActionOrder).toBe(true);

  await shoppingSummary.click();
  const shopping = page.getByRole("dialog", { name: "장보기 목록" });
  await expect(shopping.locator(".shopping-sheet-preview-note")).toHaveText("미리보기에서 추가한 목록은 서버에 저장되지 않으며, 새로고침하면 초기화돼요.");
  await expect(shopping.locator(".shopping-sheet-progress")).toHaveCount(0);
  await expect(shopping.getByRole("button", { name: /식단에서 재료 고르기/ })).toBeVisible();
  await expect(shopping.getByRole("button", { name: "직접 추가", exact: true })).toBeVisible();
  await expect(shopping.getByRole("button", { name: "새로 고침", exact: true })).toHaveCount(0);
  await expect(shopping.getByRole("textbox", { name: "직접 추가 상품명" })).toBeVisible();
  await shopping.getByRole("button", { name: "직접 추가", exact: true }).click();
  await expect(shopping.getByRole("textbox", { name: "직접 추가 상품명" })).toBeFocused();
});
