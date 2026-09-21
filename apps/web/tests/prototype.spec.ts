import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Rescue Meal home opens detail and saves a storage change", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  const eyebrowParts = new Intl.DateTimeFormat("ko-KR", { weekday: "long", month: "long", day: "numeric" }).formatToParts(new Date());
  const expectedEyebrow = `${eyebrowParts.find((part) => part.type === "weekday")?.value ?? "오늘"}, ${eyebrowParts.find((part) => part.type === "month")?.value ?? ""} ${eyebrowParts.find((part) => part.type === "day")?.value ?? ""}`;
  await expect(page.locator(".eyebrow")).toHaveText(expectedEyebrow);
  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 3" })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("게스트 기록");
  await expect(page.locator(".trust-card")).toHaveAttribute("data-trust-state", "needs-review");
  await expect(page.locator(".trust-card strong")).toHaveText("확인 필요 1개 · 날짜를 먼저 확인해요");
  await expect(page.locator(".trust-card small")).toContainText("AI는 소비기한을 확정하지 않아요");
  await expect(page.locator(".rescue-status-legend")).toContainText("보관 중");
  await expect(page.locator(".rescue-status-legend")).toContainText("우선 확인 필요");
  await expect(page.locator(".rescue-status-legend")).not.toContainText("기록됨");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" }).locator(".date-source")).toHaveText("조리 전 날짜 확인");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).locator(".date-source")).toHaveText("먼저 사용 권장");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" }).locator(".priority-date small")).toHaveText("확인 필요");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).locator(".priority-date small")).toHaveText("먼저 사용");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" })).toHaveAttribute("data-priority-state", "needs-review");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" })).toHaveAttribute("data-priority-state", "use-next");
  await expect(page.locator(".meal-plan-button")).toContainText("확인이 필요한 식품 1개를 먼저 읽고 오늘 식단을 만들어요.");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".detail-hero-copy p")).toHaveText("국내산 시금치 · 남은 1팩");
  await expect(dialog.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
  await expect(dialog.locator(".date-review-callout")).toContainText("포장지·보관 상태·개봉 여부");
  await expect(dialog.locator(".date-review-callout")).toHaveAttribute("aria-live", "polite");
  await expect(dialog.locator(".detail-note")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "포장지에서 날짜 다시 확인" })).toBeFocused();
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

  await expect(page.getByRole("status")).toHaveText("보관 상태를 저장했어요");
  await expect(page.getByRole("button", { name: /시금치 개봉됨 .* 냉동/ })).toBeVisible();
});

test("home theme toggle switches between the selected light and dark surfaces", async ({ page }) => {
  const toggle = page.getByTestId("theme-toggle");

  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", "다크모드로 전환");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "라이트모드로 전환");
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

  expect(layout.meal?.top).toBe(layout.add?.top);
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
  await expect(guidance.getByRole("list", { name: "안전한 기록의 순서" })).toHaveCount(1);
  await expect(guidance.getByRole("listitem")).toHaveCount(3);
  await expect(guidance.getByRole("note", { name: "식품 상태 확인 안내" })).toContainText("상태가 이상하면 날짜보다 먼저 확인해요");
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
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".inventory-status")).toHaveText("우선 · 9월 4일");
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
  expect(await indexResponse.text()).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/rescue-meal-180.png" />');
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
    const count = await controls.count();
    for (let index = 0; index < count; index += 1) {
      const name = await controls.nth(index).evaluate((element) => {
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
      });
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
  await openAndAudit(".meal-plan-button", "meal", "오늘의 Rescue Meal");
  await openAndAudit(".priority-card", "food detail", "시금치");
  await openAndAudit(".connection-pill", "account", "내 계정");
  await openAndAudit(".mobile-hero-notification", "notifications", "알림");
  await openAndAudit(".trust-card", "guidance", "날짜를 읽는 방법");
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

  await page.getByRole("button", { name: "확인하고 오늘 식단 만들기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
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
  await expect(dialog.getByText("오늘 먼저 확인할 식품이에요")).toBeVisible();
  await expect(dialog.getByText("시금치 먼저 확인해 보세요.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("닭가슴살 확인이 필요해요", { exact: true })).toBeVisible();
  await expect(dialog.getByText("표시 날짜와 보관 상태를 확인해 주세요.", { exact: true })).toHaveCount(2);
  await expect(dialog.locator(".notification-row").first().locator(".notification-row-copy em")).toContainText("날짜 확인 ·");
  await expect(dialog.locator(".notification-row").first().locator(".notification-row-copy strong")).toHaveCSS("white-space", "normal");
  await expect(dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" })).toBeFocused();
  await expect(dialog).not.toContainText("을(를)");
  await expect(dialog).not.toContainText("데모 모드에서는 서버 알림을 저장하지 않아요");

  await dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" }).click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveClass(/notification-dot-attention/);
  await expect(dialog.getByRole("heading", { name: /확인이 필요한 알림 2/ })).toBeVisible();
  await expect(dialog.getByText("확인할 알림", { exact: true })).toBeVisible();
  await expect(dialog.getByText("확인한 알림", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "알림 요약" })).toContainText("읽지 않음 2개 · 전체 3개");
  await expect(dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" })).toBeFocused();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "알림" }).getByRole("heading", { name: /확인이 필요한 알림 2/ })).toBeVisible();
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

test("bottom sheets expose modal semantics and restore focus after closing", async ({ page }) => {
  const trigger = page.locator(".add-food-button");
  await expect(trigger).toHaveAccessibleName(/식품 추가하기/);

  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "영수증" })).toBeFocused();
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
  await expect(page.getByRole("group", { name: "식품 추가 1단계" })).toContainText("사진을 고르면 상품 후보를 만들어요");
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("선택한 항목을 확인해요");
  await expect(page.locator(".receipt-review-contract")).toContainText("반영 전 확인");
  await expect.poll(() => page.locator(".receipt-review").evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const reviewBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return reviewBox.top >= contentBox.top - 1 && reviewBox.top <= contentBox.bottom;
  })).toBe(true);
  await expect(page.getByRole("button", { name: "3개 항목 반영하기" })).toBeVisible();
  await expect(page.locator(".review-summary")).toContainText("확인 필요 1개");
  await expect(page.getByRole("note")).toContainText("확인 필요 1개가 포함돼요");

  await page.getByRole("button", { name: "맛타리버섯 2팩 · 3,980원 확인 필요" }).click();
  await expect(page.getByRole("button", { name: "2개 항목 반영하기" })).toBeVisible();
  await page.getByRole("button", { name: "2개 항목 반영하기" }).click();

  await expect(page.getByRole("status")).toHaveText("2개 항목을 검토 후 반영했어요");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row").filter({ hasText: "시금치" })).toContainText("확인 필요");
  await expect(page.locator(".priority-card").filter({ hasText: "국내산 시금치" })).toBeFocused();
});

test("manual food intake returns focus to the newly added priority food", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("대파");
  await expect(dialog.getByRole("note")).toContainText("기본값 1개 · 냉장 보관으로 바로 기록해요");
  await dialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect(page.locator(".toast")).toContainText("대파를 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 확인");
  await expect(page.locator(".priority-card").filter({ hasText: "대파" })).toBeFocused();
  await page.locator(".toast-action").click();
  const addedDetail = page.getByRole("dialog", { name: "대파" });
  await expect(addedDetail).toBeVisible();
  await expect(addedDetail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeFocused();
  await addedDetail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const dateEditor = addedDetail.getByRole("group", { name: "확인한 날짜 입력" });
  await dateEditor.getByRole("button", { name: "소비기한", exact: true }).click();
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
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 확인");
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
  await expect(barcodeDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("상품 후보와 날짜 후보를 확인해요");
  await barcodeDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect.poll(() => labelDialog.locator(".sheet-content").evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(labelDialog.getByRole("group", { name: "식품 추가 1단계" })).toContainText("날짜가 보이는 면을 입력해요");
});

test("receipt review lets the user correct an OCR candidate before commit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" })).toBeVisible();
  await expect(mushroomCard.getByText("처음 읽어낸 내용: 맛타리버섯")).toBeVisible();

  await mushroomCard.getByRole("button", { name: "실온", exact: true }).click();
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("0");
  await expect(mushroomCard.getByRole("alert")).toContainText("0보다 큰 숫자");
  await expect(page.getByRole("button", { name: "3개 항목 반영하기" })).toBeDisabled();

  await mushroomCard.getByRole("textbox", { name: "상품명" }).fill("새송이버섯");
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("1");
  await mushroomCard.getByRole("textbox", { name: "단위" }).fill("봉");
  await expect(page.getByRole("button", { name: "3개 항목 반영하기" })).toBeEnabled();
  await page.getByRole("button", { name: "3개 항목 반영하기" }).click();

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await expect(inventory.getByRole("button", { name: /새송이버섯 .* · 1봉/ })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "새송이버섯" }).getByText("실온", { exact: true })).toBeVisible();
});

test("receipt line editing reveals the active line and keeps commit reachable", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const spinachCard = page.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await spinachCard.getByRole("button", { name: "국내산 시금치 항목 수정" }).click();
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

test("receipt review keeps the uploaded original available for OCR comparison", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato.png");

  const preview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("영수증 원본 대조")).toBeVisible();
  await expect(preview.getByText("원본 파일 자체는 재고 기록에 저장하지 않아요.")).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("alt", "업로드한 영수증 원본 미리보기");
  await expect(preview.locator("img")).toHaveAttribute("src", /^blob:/);
});

test("receipt and label intake offer camera capture with a photo-library fallback", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  const receiptTab = receiptDialog.getByRole("tab", { name: "영수증" });
  await expect(receiptTab).toHaveAttribute("aria-controls", "add-mode-panel-receipt");
  await expect(receiptDialog.locator("#add-mode-panel-receipt")).toHaveAttribute("aria-labelledby", "add-mode-tab-receipt");
  await receiptTab.focus();
  await page.keyboard.press("ArrowRight");
  const barcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  await expect(barcodeDialog.getByRole("tab", { name: "바코드" })).toBeFocused();
  await expect(barcodeDialog.getByRole("tab", { name: "바코드" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(receiptTab).toBeFocused();
  await expect(receiptTab).toHaveAttribute("aria-selected", "true");
  const receiptInputs = receiptDialog.getByRole("group", { name: "영수증 이미지 입력 방법" });
  await expect(receiptInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(receiptInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
  await expect(receiptInputs.getByText("사진에서 선택")).toBeVisible();

  await receiptDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  const labelInputs = labelDialog.getByRole("group", { name: "라벨 이미지 입력 방법" });
  await expect(labelInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(labelInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
  await expect(labelDialog.getByRole("button", { name: "샘플 라벨 인식" })).toBeVisible();
  await expect(labelDialog.getByText("날짜 의미는 사용자가 확인하기 전까지 소비기한으로 확정하지 않아요.")).toBeVisible();
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
  await expect(preview).toContainText("PDF는 상품 항목 위치를 자동으로 강조하지 않아요");
  await expect(preview).toContainText("원본 파일 자체는 재고 기록에 저장하지 않아요.");
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

  await camera.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato.png");
  await expect(dialog.getByRole("button", { name: /항목 반영하기/ })).toBeVisible();
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
  await expect(dialog.getByRole("button", { name: /항목 반영하기/ })).toBeVisible();
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
  await expect(camera.getByText("안쪽만 분석해요")).toBeVisible();
  await camera.getByRole("button", { name: "촬영하기" }).click();

  const source = await page.evaluate(() => (window as unknown as { __captureSource?: number[] }).__captureSource);
  expect(source?.[0]).toBeCloseTo(64, 5);
  expect(source?.[1]).toBeCloseTo(38.4, 5);
  expect(source?.[2]).toBeCloseTo(512, 5);
  expect(source?.[3]).toBeCloseTo(403.2, 5);
  await expect(dialog.getByRole("button", { name: /항목 반영하기/ })).toBeVisible();
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
  await page.getByRole("button", { name: "샘플 라벨 인식" }).click();

  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("날짜 의미와 보관 위치를 확인해요");
  await expect(page.locator(".label-review-contract")).toContainText("날짜 의미와 보관 위치를 확인하세요");
  await expect.poll(() => page.locator(".label-result-card").evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const resultBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return resultBox.top >= contentBox.top - 1 && resultBox.top <= contentBox.bottom;
  })).toBe(true);
  await expect(page.getByText("유효년월일 2026.09.02")).toBeVisible();
  await expect(page.getByText("선택한 날짜 · 2026.09.02", { exact: true })).toBeVisible();
  await expect(page.getByText("표시 후보")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인 후 반영" })).toBeFocused();
  await page.getByRole("button", { name: "확인 후 반영" }).click();
  await expect(page.getByRole("status")).toHaveText(/시금치/);
});

test("label review lets the user choose a new lot or an existing matching lot", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "샘플 라벨 인식" }).click();

  const newLot = dialog.getByRole("radio", { name: /새 구매 lot으로 추가/ });
  const existingLot = dialog.getByRole("radio", { name: /기존 lot · 1팩/ });
  await expect(newLot).toHaveAttribute("aria-checked", "true");
  await expect(existingLot).toBeVisible();

  await existingLot.click();
  await expect(existingLot).toHaveAttribute("aria-checked", "true");
  await expect(newLot).toHaveAttribute("aria-checked", "false");

  await newLot.click();
  await expect(newLot).toHaveAttribute("aria-checked", "true");
});

test("barcode flow exposes camera scanning and keeps manual lookup fallback", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "바코드" }).click();
  await expect(page.getByRole("button", { name: "카메라로 스캔" })).toBeVisible();

  await page.getByRole("textbox", { name: "바코드 숫자" }).fill("8801114167523");
  await page.getByRole("button", { name: "상품 후보 조회" }).click();
  await expect(page.getByText("풀무원 국산콩 두부 · 상품 후보 1개")).toBeVisible();
  await expect(page.getByText("소비기한은 포장지의 날짜를 촬영해 확인해 주세요.")).toBeVisible();
  const barcodeCandidateAction = page.getByRole("button", { name: "이름·보관 기준 적용" });
  await expect(barcodeCandidateAction).toBeFocused();
  await expect.poll(() => barcodeCandidateAction.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const contentBox = content.getBoundingClientRect();
    const actionBox = element.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await barcodeCandidateAction.click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.getByRole("textbox", { name: "식품 이름" })).toHaveValue("국산콩 두부");
  await expect(manualDialog.locator(".storage-option-active")).toContainText("냉장");
  await expect(manualDialog.getByRole("status")).toContainText("바코드 상품 후보를 적용했어요");
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
  const confirmedDateLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(confirmedDate);
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();

  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("button", { name: "소비기한", exact: true })).toBeFocused();
  await editor.getByRole("button", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill(confirmedDateValue);
  await expect(editor.getByText(`선택한 날짜 · ${confirmedDateValue.replaceAll("-", ".")}`, { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부 소비기한을 사용자 확인으로 저장했어요");
 await expect(inventory.getByRole("button", { name: new RegExp(`국산콩 두부 풀무원 · 1모 우선 · ${confirmedDateLabel}`) })).toBeVisible();
  await expect(inventory.getByRole("button", { name: new RegExp(`국산콩 두부 풀무원 · 1모 우선 · ${confirmedDateLabel}`) })).toBeFocused();
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

  await expect(saveButton).toBeDisabled();
  await expect(saveButton).toHaveText("변경 없음");
  await expect(dialog.locator(".detail-save-hint")).toContainText("보관 위치·개봉 상태를 바꾸면 저장할 수 있어요.");

  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await expect(saveButton).toBeDisabled();
  await expect(saveButton).toHaveText("변경 없음");
  await expect(dialog.locator(".detail-save-hint")).toContainText("수량만 바꿨다면 먹었어요·폐기 기록에 적용돼요.");
  await expect(dialog.getByRole("button", { name: "1팩 먹었어요" })).toBeVisible();

  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(saveButton).toBeEnabled();
  await expect(saveButton).toHaveText(/변경 저장/);
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("저장 필요 · 보관 위치 · 수량");
});

test("date-warning food separates safety review from the consume record", async ({ page }) => {
  await page.locator(".priority-card").first().click();
  const dialog = page.getByRole("dialog", { name: "시금치" });

  await dialog.getByRole("button", { name: "먹었어요", exact: true }).click();
  const confirmation = dialog.getByRole("alert");
  await expect(confirmation).toContainText("조리 전 확인이 필요해요");
  await expect(confirmation).toContainText("안전 여부를 판정하지 않아요");
  await expect(confirmation.getByRole("button", { name: "돌아가기" })).toBeFocused();
  await confirmation.getByRole("button", { name: "확인했어요 · 먹었어요 기록" }).click();
  await expect(page.getByRole("status")).toContainText("시금치를 먹은 기록으로 남겼어요");
  await expect(page.getByRole("status")).toContainText("다음: 국산콩 두부");
  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 2" })).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.locator(".priority-card").first()).toBeFocused();
});

test("user-confirmed date detail exposes the date without repeating the source label", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  const dateProof = dialog.locator(".date-proof-card");

  await expect(dateProof.locator("span").first()).toHaveText("사용자 확인");
  await expect(dateProof.locator("strong")).toHaveText("9월 6일");
  await expect(dateProof.locator("small")).toHaveText("사용자 입력");
});

test("user-confirmed reminder can reopen its existing date and meaning for editing", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });

  await dialog.getByRole("button", { name: "확인한 알림 날짜 수정" }).click();
  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor.getByRole("textbox", { name: "날짜" })).toHaveValue("2026-09-06");
  await expect(editor.getByRole("button", { name: "내 알림일", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  await expect(dialog.getByRole("alert")).toContainText("1팩을 폐기할까요?");
  await dialog.getByRole("button", { name: "폐기 기록" }).click();

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
  await expect(dialog.getByRole("alert")).toContainText("이 식품을 폐기할까요?");
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

  await inventory.getByRole("button", { name: "검색·필터 초기화" }).click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");

  await search.fill("없는 식품");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("“없는 식품” 검색 결과 · 0개");
  await expect(inventory.locator(".inventory-empty-state")).toContainText("검색 결과가 없어요");
  await inventory.getByRole("button", { name: "검색 조건 초기화" }).click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
});

test("recipe sheet previews the pantry, saves a recipe, and records completion", async ({ page }) => {
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });

  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.locator(".recipe-kicker")).toHaveText("RESCUE MEAL");
  await expect(dialog.locator(".recipe-provenance")).toHaveText("출처 · Rescue Meal 팀 작성 레시피");
  await expect(dialog).not.toContainText("DEMO FIXTURE");
  await expect(dialog).not.toContainText("project-authored");
  await expect(dialog).not.toContainText("demo-v1");
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
  await dialog.getByRole("button", { name: "레시피 보기" }).click();
  await expect(dialog.getByText("조리 순서")).toBeVisible();
  await expect(dialog.getByText("안전 메모")).toBeVisible();

  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await expect(dialog.locator(".saved-recipe")).toContainText("오늘의 식단에 저장했어요");
  await expect(dialog.locator(".saved-recipe")).toContainText("다음: 사용량을 확인하고 조리 완료를 기록해 주세요.");
  await expect(page.locator(".toast")).toHaveText("식단 저장 완료 · 사용량을 확인해 주세요");
  await expect(dialog.locator(".recipe-consumption-heading small")).toContainText("기본값은 재료 3개 전부 사용");
  const spinachUsage = dialog.getByRole("spinbutton", { name: "시금치 사용량" });
  await spinachUsage.fill("0");
  await expect(dialog.locator(".recipe-consumption-heading small")).toContainText("현재 2개 사용 · 1개는 재고에 남겨요.");
  await spinachUsage.fill("1");
  await expect(spinachUsage).toHaveValue("1");
  await expect(dialog.locator(".recipe-consumption-heading small")).toContainText("기본값은 재료 3개 전부 사용");
  const safetyAcknowledgement = dialog.locator(".recipe-complete-actions").getByRole("button", { name: "조리 전 확인했어요" });
  await expect(safetyAcknowledgement).toBeVisible();
  await safetyAcknowledgement.click();
  await expect(dialog.locator(".recipe-complete-actions").getByRole("button", { name: "확인 완료" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 완료로 기록" })).toBeVisible();
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "내 식품 목록 5" })).toBeVisible();
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1팩/ })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
  await expect(page.locator(".toast")).toHaveText("조리 완료 · 3개 재료를 차감했어요");
});

test("meal completion reports a skipped ingredient that remains in inventory", async ({ page }) => {
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();

  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await dialog.getByRole("spinbutton", { name: "시금치 사용량" }).fill("0");
  await dialog.getByRole("button", { name: "조리 전 확인했어요" }).click();
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();

  await expect(page.locator(".toast")).toHaveText("조리 완료 · 2개 재료를 사용했어요 · 1개는 재고에 남겼어요");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "내 식품 목록 6" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
});

test("render failures show a recovery screen without exposing exception details", async ({ page }) => {
  await page.goto("/tests/runtime-error-fixture.html");

  await expect(page.getByRole("main", { name: "Rescue Meal 화면 오류" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "잠시 문제가 생겼어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시작하기" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("fixture-only render failure");
});
