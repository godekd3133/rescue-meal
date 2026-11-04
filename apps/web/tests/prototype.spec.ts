import { expect, test } from "@playwright/test";
import { isStaleLabelLotTarget } from "../src/labelLotSelection.ts";

// Sample dates are relative to today; a fixed clock keeps the dated assertions true.
const FIXTURE_NOW = new Date("2026-09-03T12:00:00+09:00");

test.beforeEach(async ({ page }) => {
  // A plain Date shim: page.clock.setFixedTime freezes sheet exit animations after a same-page navigation.
  await page.addInitScript((fixedNow) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(fixedNow);
        else super(...(args as [string]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = FixedDate as DateConstructor;
  }, FIXTURE_NOW.getTime());
  await page.goto("/");
});

test("Rescue Meal home opens detail and saves a storage change", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  const eyebrowParts = new Intl.DateTimeFormat("ko-KR", { weekday: "long", month: "long", day: "numeric" }).formatToParts(FIXTURE_NOW);
  const expectedEyebrow = `${eyebrowParts.find((part) => part.type === "weekday")?.value ?? "오늘"}, ${eyebrowParts.find((part) => part.type === "month")?.value ?? ""} ${eyebrowParts.find((part) => part.type === "day")?.value ?? ""}`;
  await expect(page.locator(".eyebrow")).toHaveText(expectedEyebrow);
  await expect(page.getByRole("heading", { name: "먼저 살펴볼 식품 3개" })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("체험 중");
  // The fridge door replaces the trust card: the hero counts what to rescue today and the passed
  // printed date is a full red sticker on its shelf.
  await expect(page.locator(".trust-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "오늘 구할 음식 6개" })).toBeVisible();
  const spinachSticker = page.locator(".fridge-sticker").filter({ hasText: "시금치" });
  await expect(spinachSticker).toHaveAttribute("aria-label", "시금치, 표시 날짜에서 1일 지남");
  await expect(spinachSticker).toHaveClass(/freshness-past/);
  await expect(spinachSticker).toHaveAttribute("data-estimated", "false");
  await expect(page.locator(".fridge-sticker").filter({ hasText: "국산콩 두부" })).toHaveAttribute("data-estimated", "true");
  const spinachPriorityCard = page.locator(".priority-card").filter({ hasText: "시금치" });
  const spinachChip = spinachPriorityCard.locator(".freshness-chip");
  await expect(spinachChip).toHaveText("+1일");
  await expect(spinachChip).toHaveAttribute("aria-label", "표시 날짜에서 1일 지남");
  await expect(spinachChip).toHaveAttribute("data-estimated", "false");
  const tofuChip = page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).locator(".freshness-chip");
  await expect(tofuChip).toHaveText("D-1");
  await expect(tofuChip).toHaveAttribute("aria-label", "먼저 살펴볼 시점까지 1일");
  await expect(tofuChip).toHaveAttribute("data-estimated", "true");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" })).toHaveAttribute("data-priority-state", "needs-review");
  await expect(page.locator(".priority-card").filter({ hasText: "국산콩 두부" })).toHaveAttribute("data-priority-state", "use-next");
  await expect(page.locator(".meal-plan-button")).toContainText("날짜나 보관 방법을 살펴볼 식품 1개");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(dialog.locator(".detail-hero-copy p")).toHaveText("국내산 시금치");
  await expect(dialog.locator(".detail-quantity-summary")).toHaveText("남은 1팩");
  await expect(dialog.locator(".date-review-callout")).toContainText("조리 전 확인이 필요해요");
  await expect(dialog.locator(".date-review-callout")).toContainText("표시 날짜가 어제 지났어요. 보관 방법과 개봉 상태도 확인해 주세요.");
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

  await expect(dialog).toHaveCount(0);
  // The saved-change toast now names the food instead of the changed field; the row below proves the storage.
  await expect(page.getByRole("status")).toHaveText("시금치의 변경 내용을 저장했어요.");
  await expect(page.getByRole("button", { name: /시금치 개봉됨 .* 냉동/ })).toBeVisible();
});

test("home theme toggle switches between the selected light and dark surfaces", async ({ page }) => {
  const toggle = page.getByTestId("theme-toggle");

  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", "현재 라이트모드, 다크모드로 전환");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "현재 다크모드, 라이트모드로 전환");
  await expect(page.locator(".meal-plan-button")).toHaveCSS("background-color", "rgb(99, 207, 148)");
  await expect(page.locator(".meal-home")).toHaveCSS("background-color", "rgb(12, 18, 16)");
  await expect(page.locator(".fridge-sticker.freshness-past .fridge-sticker-badge")).toHaveCSS("background-color", "rgb(255, 122, 102)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#10291e");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#10291e");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#15392a");
  await expect(page.locator(".meal-plan-button")).toHaveCSS("background-color", "rgb(27, 108, 66)");
  await expect(page.locator(".meal-home")).toHaveCSS("background-color", "rgb(243, 245, 240)");
  await expect(page.locator(".fridge-sticker.freshness-past .fridge-sticker-badge")).toHaveCSS("background-color", "rgb(236, 90, 67)");
});

test("home status summary opens the food list as the primary next step", async ({ page }) => {
  const statusCard = page.getByRole("button", { name: "식품 찾기" });
  await expect(statusCard).toBeVisible();
  await statusCard.click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".inventory-toolbar")).toBeVisible();
});

test("home fridge door opens a passed food sticker or its shelf list", async ({ page }) => {
  // Sample dates are anchored to load time; the list path needs several passed foods, so the clock moves a week ahead.
  await page.clock.install({ time: FIXTURE_NOW });
  await page.reload();
  const pastSticker = page.getByRole("button", { name: "시금치, 표시 날짜에서 1일 지남" });
  await expect(page.locator(".inventory-review-guide")).toHaveCount(0);
  await expect(page.locator(".trust-card")).toHaveCount(0);
  await expect(page.locator(".freshness-overview")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "오늘 구할 음식 6개" })).toBeVisible();
  await expect(page.locator(".fridge-sticker.freshness-past")).toHaveCount(1);
  await expect(pastSticker.locator(".fridge-sticker-badge")).toHaveText("+1일");
  await expect(page.getByRole("button", { name: "국산콩 두부, 먼저 살펴볼 시점까지 1일" })).toHaveClass(/freshness-today/);

  // A sticker goes straight to that food and closes back to home.
  await pastSticker.click();
  const singleReviewDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(singleReviewDetail).toBeVisible();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await singleReviewDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(singleReviewDetail).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");

  // A week later every food has passed: the hero counts them all and the shelf label opens the shelf's list.
  await page.clock.fastForward(7 * 24 * 60 * 60 * 1000);
  await expect(page.getByRole("heading", { level: 1, name: "오늘 구할 음식 7개" })).toBeVisible();
  await expect(page.locator(".fridge-sticker.freshness-past")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "시금치, 표시 날짜에서 8일 지남" })).toBeVisible();
  await page.getByRole("button", { name: "냉장 보관 식품 5개 보기" }).click();

  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".filter-select-wrap select")).toHaveValue("냉장");
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(5);
  await expect(page.locator(".inventory-list .inventory-row").first()).toContainText("시금치");

  const reviewFilter = page.locator(".inventory-status-filters button").filter({ hasText: "날짜·보관 확인" });
  await expect(reviewFilter).toContainText("2");
  await reviewFilter.click();
  await expect(reviewFilter).toHaveAttribute("aria-pressed", "true");
  const reviewRows = page.locator(".inventory-list .inventory-row");
  await expect(reviewRows).toHaveCount(2);
  await expect(reviewRows.filter({ hasText: "시금치" })).toBeVisible();
  await expect(reviewRows.filter({ hasText: "동물복지 달걀" })).toBeVisible();
  await expect(reviewRows.filter({ hasText: "시금치" }).locator(".inventory-review-detail")).toHaveText("날짜 확인");

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
});

test("review guidance closes back to the filtered food list", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await page.locator(".inventory-status-filters button").filter({ hasText: "날짜·보관 확인" }).click();
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(1);
  await page.getByRole("region", { name: "식품을 살펴볼 때" }).getByRole("button", { name: "날짜와 보관 확인 방법 자세히 보기" }).click();
  const guidance = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidance).toBeVisible();
  await guidance.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(guidance).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".inventory-list .inventory-row")).toHaveCount(1);
});

test("keeps the mobile quick-add action in fixed navigation and the meal CTA above it", async ({ page }) => {
  // The redesign moved quick-add from beside the meal CTA into the centre of the floating bottom bar.
  const actionRow = page.locator(".home-action-row");
  await expect(actionRow).toBeVisible();
  await expect(actionRow.locator(".meal-plan-button")).toBeVisible();
  await expect(actionRow.locator(".add-food-button")).toHaveCount(0);
  const add = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "식품 추가하기", exact: true });
  await expect(add).toBeVisible();
  await expect(add).toHaveAttribute("data-testid", "nav-add-food");

  await page.locator(".meal-plan-button").scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => {
    const read = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return {
      row: read(".home-action-row"),
      meal: read(".home-action-row .meal-plan-button"),
      add: read(".app-bottom-nav .app-bottom-nav-add"),
      nav: read(".app-bottom-nav"),
      screen: read("[data-testid=device-screen]"),
    };
  });

  // The meal CTA owns the full action row and stays clear of the floating bar.
  expect(layout.meal!.width).toBeGreaterThanOrEqual(layout.row!.width - 2);
  expect(layout.meal!.bottom).toBeLessThanOrEqual(layout.nav!.top);
  // The add button is a full touch target centred in the bar and kept on screen.
  expect(layout.add!.width).toBeGreaterThanOrEqual(44);
  expect(layout.add!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs((layout.add!.left + layout.add!.right) / 2 - (layout.nav!.left + layout.nav!.right) / 2)).toBeLessThanOrEqual(2);
  expect(layout.add!.top).toBeGreaterThanOrEqual(layout.screen!.top);
  expect(layout.add!.bottom).toBeLessThanOrEqual(layout.screen!.bottom);
});

test("date guidance returns to the same food detail context", async ({ page }) => {
  await page.locator(".priority-card").first().click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();

  await detail.getByRole("button", { name: "날짜 안내 보기" }).click();
  const guidance = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidance).toBeVisible();
  await expect(guidance.getByRole("list", { name: "식품 날짜와 보관 상태 확인 방법" })).toHaveCount(1);
  await expect(guidance.getByRole("listitem")).toHaveCount(3);
  await expect(guidance.getByRole("note", { name: "식품 상태 안내" })).toContainText("포장이 부풀었거나 냄새·색이 이상하면 맛보지 말고 버리세요.");
  await guidance.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(guidance).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "시금치", level: 2 })).toBeVisible();
});

test("priority detail closes back to the home context while inventory detail restores pantry context", async ({ page }) => {
  await page.locator(".priority-card").first().click();
  const priorityDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(priorityDetail).toBeVisible();
  await priorityDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(priorityDetail).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "먼저 살펴볼 식품 3개" })).toBeVisible();

  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(page.locator(".inventory-status-filters button").filter({ hasText: "날짜·보관 확인" })).toContainText("1");
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".inventory-status .freshness-chip")).toHaveText("D-1");
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
    const fridgeDoor = document.querySelector(".fridge-door");
    const install = document.querySelector(".install-prompt");
    return Boolean(fridgeDoor && install && (fridgeDoor.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING));
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

  await openAndAudit("[data-testid=nav-add-food]", "receipt", "영수증으로 추가");
  await openAndAudit(".meal-plan-button", "meal", "오늘의 식단");
  await openAndAudit(".priority-card", "food detail", "시금치");
  await openAndAudit(".connection-pill", "account", "체험 안내");
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
  // The bar floats as a pill a few pixels above the reserved Android edge; it must not reserve the system bar twice.
  expect(layout.appNavigationBottom).toBeLessThanOrEqual(layout.viewportBottom);
  expect(layout.viewportBottom - layout.appNavigationBottom).toBeLessThanOrEqual(8);
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

test("demo account sheet explains the sample record lifetime without offering sign-in", async ({ page }) => {
  const trigger = page.locator(".connection-pill");
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "체험 안내" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  const notice = dialog.getByRole("region", { name: "체험 기록 안내" });
  await expect(notice).toContainText("변경 내용은 이 화면에서만 유지돼요. 새로고침하면 사라져요.");
  await expect(notice).toContainText("체험 화면에서는 로그인과 여러 기기 연결을 사용할 수 없어요.");
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "계속 둘러보기" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("demo account sheet offers no password recovery entry", async ({ page }) => {
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "체험 안내" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "비밀번호를 잊으셨나요?" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "비밀번호 재설정" })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "계정 이메일" })).toHaveCount(0);
});

test("notification center surfaces demo rescue items and opens food detail", async ({ page }) => {
  const trigger = page.getByRole("button", { name: /알림 보기/ });
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveText("3");
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveClass(/notification-dot-urgent/);
  await expect(trigger).toHaveAccessibleName("알림 보기, 먼저 볼 알림 1개, 읽지 않은 알림 3개");
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByRole("heading", { name: "새 알림 3개" })).toBeVisible();
  const spinachNotification = dialog.getByRole("button", { name: "시금치 날짜를 살펴봐 주세요." });
  await expect(spinachNotification).toBeFocused();
  await expect(dialog.locator(".notification-row")).toHaveCount(3);
  await expect(dialog.getByRole("button", { name: /국산콩 두부 날짜를 살펴봐 주세요\. 내일은 참고로 표시한 날짜예요\. 소비기한과는 다르니 포장지 날짜를 확인해 주세요\./ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /맛타리버섯 날짜를 살펴봐 주세요\. 모레는 참고로 표시한 날짜예요\. 소비기한과는 다르니 포장지 날짜를 확인해 주세요\./ })).toBeVisible();
  await expect(dialog.locator(".notification-footnote")).toContainText("알림만으로 먹어도 되는지는 알 수 없어요.");
  await expect(dialog.locator(".notification-row").first().locator(".notification-row-copy strong")).toHaveCSS("white-space", "normal");
  await expect(dialog).not.toContainText("을(를)");
  await expect(dialog).not.toContainText("데모 모드에서는 서버 알림을 저장하지 않아요");

  await spinachNotification.click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(page.getByTestId("keyboard-dock")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveClass(/notification-dot-attention/);
  await expect(dialog.getByRole("heading", { name: "새 알림 2개" })).toBeVisible();
  await expect(dialog.locator(".notification-row-read")).toHaveCount(1);
  await expect(dialog.getByText("읽은 알림", { exact: true })).toBeVisible();
  await expect(dialog.locator(".notification-row-read")).toHaveAttribute("data-notification-returned", "true");
  await expect(dialog.getByRole("button", { name: "시금치 날짜를 살펴봐 주세요." })).toBeFocused();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(page.getByTestId("keyboard-dock")).toHaveCSS("visibility", "hidden");
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "알림" }).getByRole("heading", { name: "새 알림 2개" })).toBeVisible();
});

test("notification date review returns to the exact notification row after saving", async ({ page }) => {
  await page.getByRole("button", { name: /알림 보기/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notification = notifications.getByRole("button", { name: "시금치 날짜를 살펴봐 주세요." });
  await notification.click();

  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  const labelDialog = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await expect(labelDialog.getByRole("group", { name: "날짜 확인 2단계" })).toContainText("날짜와 보관 방법을 살펴봐요");
  await expect(labelDialog.getByRole("radio", { name: /기존 식품 1팩/ })).toHaveAttribute("aria-checked", "true");
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
  const resumedLabelDialog = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await expect(resumedLabelDialog).toBeVisible();
  await expect(resumedLabelDialog.getByRole("group", { name: "날짜 확인 2단계" })).toContainText("날짜와 보관 방법을 살펴봐요");
  await expect(resumedLabelDialog.getByRole("radio", { name: /기존 식품 1팩/ })).toHaveAttribute("aria-checked", "true");
  await resumedLabelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await expect(notifications).toBeVisible();
  await expect(notification).toBeFocused();
  await expect(notification).toHaveAttribute("data-notification-returned", "true");
});

test("notification center separates unread count from the retained read history", async ({ page }) => {
  await page.getByRole("button", { name: /알림 보기/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await dialog.getByRole("button", { name: "모두 읽음" }).click();
  await expect(dialog.getByRole("heading", { name: "읽은 알림", level: 3 })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /새 알림/ })).toHaveCount(0);
  await expect(dialog.locator(".notification-row")).toHaveCount(3);
  await expect(dialog.locator(".notification-row-read")).toHaveCount(3);
  await expect(dialog.getByRole("button", { name: "모두 읽음" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "시금치 날짜를 살펴봐 주세요." })).toBeVisible();
  await expect(page.locator(".mobile-hero-notification .notification-dot")).toHaveCount(0);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: /알림 보기/ }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "알림" });
  await expect(reopenedDialog.getByRole("heading", { name: "읽은 알림", level: 3 })).toBeVisible();
  await expect(reopenedDialog.locator(".notification-row-read")).toHaveCount(3);
});

test("long sheet navigation keeps the latest return context and focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  const notificationTrigger = page.getByRole("button", { name: /알림 보기/ });
  const accountTrigger = page.locator(".connection-pill");

  await notificationTrigger.click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const foodNotification = notifications.getByRole("button", { name: "시금치 날짜를 살펴봐 주세요." });
  await foodNotification.click();
  const foodDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(foodDetail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notifications).toBeVisible();
  await expect(foodNotification).toBeFocused();
  await notifications.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notificationTrigger).toBeFocused();

  await accountTrigger.click();
  const account = page.getByRole("dialog", { name: "체험 안내" });
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
  const trigger = page.getByTestId("nav-add-food");
  await expect(trigger).toHaveAccessibleName(/식품 추가하기/);

  await trigger.focus();
  await trigger.click();

  // The sheet title follows the selected intake method, so keep one handle on the single open sheet.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("영수증으로 추가");
  await expect(dialog.getByRole("tab", { name: "영수증" })).toBeFocused();
  await expect(dialog.getByRole("tab", { name: "영수증" }).locator("span[aria-hidden='true']")).toHaveText("추천");
  await expect(dialog.getByRole("tab", { name: "영수증" })).toHaveAccessibleName("영수증, 추천");
  const intakeFlow = dialog.locator(".intake-flow-rail");
  const intakeMethodDetail = intakeFlow.locator(".intake-flow-rail-heading small");
  await expect(intakeFlow).toHaveAttribute("aria-label", "식품 추가 1단계");
  await expect(intakeFlow.locator(".intake-flow-rail-heading")).toHaveAttribute("aria-live", "polite");
  await expect(intakeFlow.locator(".intake-flow-rail-heading")).toHaveAttribute("aria-atomic", "true");
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "영수증 사진을 선택해 주세요" })).toBeVisible();
  await expect(intakeMethodDetail).toHaveText("원본 파일은 식품 기록에 저장하지 않아요.");
  await dialog.getByRole("tab", { name: "바코드" }).click();
  await expect(dialog).toHaveAccessibleName("바코드로 추가");
  await expect(page.getByRole("tabpanel")).toContainText("바코드로 상품 찾기");
  await expect(page.getByRole("tabpanel")).toContainText("바코드만으로는 소비기한을 알 수 없어요.");
  await dialog.getByRole("tab", { name: "라벨" }).click();
  await expect(dialog).toHaveAccessibleName("라벨로 추가");
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("사진은 식품 기록에 저장하지 않아요.");
  await dialog.getByRole("tab", { name: "직접 입력" }).click();
  await expect(dialog).toHaveAccessibleName("직접 추가");
  await expect(intakeFlow).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "식품 이름", exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "영수증" }).click();
  await expect(dialog).toHaveAccessibleName("영수증으로 추가");
  await expect(dialog.getByRole("tab", { name: "바코드" }).locator("span[aria-hidden='true']")).toHaveCount(0);
  await expect(dialog).toHaveAttribute("aria-labelledby");
  // Receipt guidance now lives in the live step heading; a header description is wired only where one is shown.
  await expect(intakeFlow.locator(".intake-flow-rail-heading")).toContainText("원본 파일은 식품 기록에 저장하지 않아요.");
  await dialog.getByRole("tab", { name: "바코드" }).click();
  await expect(dialog).toHaveAccessibleDescription("바코드로 상품을 찾고, 맞는 상품인지 살펴봐요.");
  await dialog.getByRole("tab", { name: "영수증" }).click();
  await expect(dialog.getByRole("heading", { name: "영수증으로 추가" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("keeps keyboard focus inside an open bottom sheet", async ({ page }) => {
  const trigger = page.getByTestId("nav-add-food");
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
  await expect(page.getByRole("group", { name: "식품 추가 1단계" })).toContainText("원본 파일은 식품 기록에 저장하지 않아요.");
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("영수증 항목을 살펴봐요");
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("필요한 항목만 골라 식품 목록에 추가해요.");
  // The provenance block and footnote were folded into one date note; the selected-only contract is carried by the
  // step heading above and by the save button's count, which follows the selection below.
  const receiptCommitContract = page.locator(".receipt-review-contract");
  await expect(receiptCommitContract).toHaveText("날짜는 포장지에서 따로 입력해요.");
  await expect(receiptCommitContract).toHaveAttribute("role", "note");
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
  await expect(page.locator(".review-summary")).toContainText("식품 3개");
  await expect(page.locator(".review-summary")).not.toContainText("10개 품목");
  await expect(page.locator(".receipt-review-submit-bar")).toHaveAttribute("data-review-state", "needs-confirmation");
  await expect(page.locator("#receipt-review-submit-hint > span").first()).toHaveText("확인이 필요한 항목 1개를 살펴보거나 선택을 해제해 주세요.");
  await expect(page.locator("#receipt-review-submit-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  const firstReviewTarget = page.getByRole("button", { name: "맛타리버섯 2팩, 3,980원 내용을 살펴봐 주세요" });
  await expect(firstReviewTarget).toBeFocused();
  await expect.poll(() => firstReviewTarget.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const contentBox = content.getBoundingClientRect();
    const targetBox = element.getBoundingClientRect();
    return targetBox.top >= contentBox.top - 1 && targetBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);

  await firstReviewTarget.click();
  await expect(firstReviewTarget).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();
  await page.getByRole("button", { name: "2개 식품 저장하기" }).click();

  await expect(page.locator(".toast")).toHaveText("영수증에서 식품 2개를 목록에 추가했어요.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const inventoryRows = page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row");
  await expect(inventoryRows.filter({ hasText: "시금치" })).toContainText("날짜 확인");
  // The deselected candidate was not committed: 맛타리버섯 keeps its original record only.
  await expect(inventoryRows.filter({ hasText: "맛타리버섯" })).toHaveCount(1);
  await expect(inventoryRows.filter({ hasText: "맛타리버섯" })).toContainText("국내산 맛타리 2팩");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" })).toBeFocused();
});

test("manual food intake returns focus to the newly added priority food", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(dialog.locator(".intake-flow-rail")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "식품 이름", exact: true })).toBeVisible();
  await expect(dialog).toContainText("날짜는 포장지를 확인한 뒤 추가할 수 있어요.");
  await expect(dialog.getByRole("button", { name: "연결 후 확인 가능" })).toHaveCount(0);
  await expect(dialog.getByText("날짜는 포장지를 확인한 뒤 추가할 수 있어요.", { exact: true })).toBeVisible();
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
  // The pre-save summary lists name, quantity, and storage as separate fields (no dot separators).
  await expect(dialog.locator("#manual-submit-summary")).toContainText(/대파\s*2팩\s*냉장 보관/);
  await expect(submit).toHaveAttribute("aria-describedby", "manual-submit-summary");
  await dialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect(page.locator(".toast")).toContainText("대파를 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜와 보관 방법 살펴보기");
  // A food without a date is not in the three-food home priority set, so focus lands on its food-list row.
  await expect(page.locator(".inventory-row").filter({ hasText: "대파" })).toBeFocused();
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
  const addedRow = page.locator(".inventory-row").filter({ hasText: "대파" });
  // The confirmed printed date reads as a solid chip, spoken as a printed date rather than an estimate.
  const addedChip = addedRow.locator(".freshness-chip");
  await expect(addedChip).toHaveText("1월 1일");
  await expect(addedChip).toHaveAttribute("data-estimated", "false");
  await expect(addedChip).toHaveAttribute("aria-label", /^표시 날짜까지 \d+일$/);
  await expect(addedRow).toBeFocused();
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
  await expect(page.locator(".toast-action")).toHaveText("날짜와 보관 방법 살펴보기");
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row").filter({ hasText: "쪽파" })).toBeFocused();
});

test("switching intake methods restores the sheet to its top before the next step", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(receiptDialog.getByRole("group", { name: "식품 추가 2단계" })).toBeVisible();

  await receiptDialog.getByRole("tab", { name: "바코드" }).click();
  const barcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  await expect(barcodeDialog.getByRole("tab", { name: "바코드" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => barcodeDialog.locator(".sheet-content").evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(barcodeDialog.getByRole("group", { name: "식품 추가 1단계" })).toContainText("입력");
  await expect(barcodeDialog.getByRole("tabpanel")).toContainText("바코드로 상품 찾기");

  await barcodeDialog.getByRole("button", { name: "예시 바코드 입력" }).click();
  await expect(barcodeDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("찾은 상품 정보를 살펴봐요");
  await barcodeDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect.poll(() => labelDialog.locator(".sheet-content").evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
  await expect(labelDialog.getByRole("group", { name: "식품 추가 1단계" })).toBeVisible();
  await expect(labelDialog.getByRole("tabpanel").getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();

  await labelDialog.getByRole("tab", { name: "바코드" }).click();
  await expect(barcodeDialog.getByRole("textbox", { name: "바코드 숫자" })).toHaveValue("8801114167523");
  await expect(barcodeDialog.getByRole("button", { name: "상품 정보 적용" })).toBeVisible();
});

test("switching intake tabs preserves an in-progress receipt review in the same sheet", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const sheet = page.getByRole("dialog");
  // The sample receipt has no original image; upload one so the ephemeral preview is part of the preserved review.
  await sheet.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato-photo.jpg");
  await expect(page.getByRole("img", { name: "업로드한 영수증 원본 미리보기" })).toBeVisible();

  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  const mushroomName = mushroomCard.getByRole("textbox", { name: "식품 이름" });
  // Editing a confirmed name requires another review, so the name is corrected before confirming.
  await mushroomName.fill("직접 확인한 맛타리버섯");
  await mushroomCard.getByRole("button", { name: "내용이 맞아요", exact: true }).click();
  await page.locator('.receipt-line-card[data-line-id="receipt-spinach"] .receipt-line-toggle').click();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-checked/);
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();

  const barcodeTab = sheet.getByRole("tab", { name: "바코드" });
  await barcodeTab.click();
  await expect(barcodeTab).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByRole("textbox", { name: "바코드 숫자" })).toBeVisible();

  const receiptTab = sheet.getByRole("tab", { name: "영수증" });
  await receiptTab.click();
  await expect(receiptTab).toHaveAttribute("aria-selected", "true");
  await expect(mushroomName).toHaveValue("직접 확인한 맛타리버섯");
  await expect(mushroomCard).toHaveClass(/receipt-line-card-checked/);
  await expect(mushroomCard.locator("[id^='receipt-line-status-']")).toContainText("항목 내용이 맞아요");
  await expect(page.getByRole("img", { name: "업로드한 영수증 원본 미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2개 식품 저장하기" })).toBeEnabled();
});

test("receipt review lets the user correct an OCR candidate before commit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();

  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" })).toBeVisible();
  const rawReceiptName = mushroomCard.getByText("영수증 이름: 맛타리버섯", { exact: true });
  const savedProductName = mushroomCard.getByRole("textbox", { name: "식품 이름" });
  await expect(rawReceiptName).toBeVisible();
  await expect(savedProductName).toHaveValue("맛타리버섯");

  await mushroomCard.getByRole("button", { name: "실온", exact: true }).click();
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("0");
  await expect(mushroomCard.getByRole("alert")).toContainText("0보다 큰 숫자");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  const correctionAlert = page.getByRole("alert").filter({ hasText: "입력할 내용이 남은 항목 1개" });
  await expect(correctionAlert.getByRole("button", { name: "수정하기" })).toBeVisible();
  await correctionAlert.getByRole("button", { name: "수정하기" }).click();
  await expect(mushroomCard.getByRole("spinbutton", { name: "수량" })).toBeFocused();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);

  await savedProductName.fill("새송이버섯");
  await expect(savedProductName).toHaveValue("새송이버섯");
  await expect(rawReceiptName).toBeVisible();
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("1");
  await mushroomCard.getByRole("textbox", { name: "단위" }).fill("봉");
  // An OCR line that needed review still has to be confirmed after the user's correction.
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeDisabled();
  await mushroomCard.getByRole("button", { name: "내용이 맞아요", exact: true }).click();
  await expect(page.locator("#receipt-review-ready-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeEnabled();
  await page.getByRole("button", { name: "3개 식품 저장하기" }).click();

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const savedMushroom = inventory.getByRole("button", { name: /새송이버섯 영수증 1봉/ });
  await expect(savedMushroom).toBeVisible();
  await expect(savedMushroom).toContainText("1봉");
  await expect(savedMushroom).not.toContainText("맛타리버섯");
  // Without a date the corrected food is outside the home priority set; its row carries the corrected storage.
  await expect(savedMushroom.getByText("실온", { exact: true })).toBeVisible();
  await savedMushroom.click();
  const savedDetail = page.getByRole("dialog", { name: "새송이버섯" });
  await expect(savedDetail.getByRole("heading", { name: "새송이버섯" })).toBeVisible();
  await expect(savedDetail.locator(".detail-quantity-summary")).toHaveText("남은 1봉");
  const receiptSource = savedDetail.getByRole("region", { name: "구매와 상품 정보" }).getByRole("group", { name: "구매 기록" });
  await expect(receiptSource).toContainText("영수증에서 추가");
  await expect(receiptSource).toContainText("구매일만으로 소비기한을 알 수는 없어요.");
  await expect(savedDetail).not.toContainText("맛타리버섯");
  await expect(savedDetail.locator(".date-proof-card")).toContainText("포장지 날짜 미확인");
});

test("receipt review can explicitly confirm unchanged OCR candidates", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();
  // Exact name: once confirmed, the line toggle's own label also ends with "내용이 맞아요".
  const confirmButtons = page.getByRole("button", { name: "내용이 맞아요", exact: true });
  await expect(confirmButtons).toHaveCount(1);
  const confirmButtonBox = await confirmButtons.first().boundingBox();
  expect(confirmButtonBox?.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".receipt-line-card-needs-confirmation")).toHaveCount(1);
  await expect(confirmButtons).toHaveAttribute("aria-describedby", /receipt-line-status-/);
  while (await confirmButtons.count()) {
    await confirmButtons.first().click();
  }
  await expect(page.locator(".receipt-line-card-confirmed")).toHaveCount(1);
  await expect(page.locator(".receipt-line-card-needs-confirmation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toBeEnabled();
  const confirmedCard = page.locator(".receipt-line-card-confirmed");
  await expect(confirmedCard.locator("[id^='receipt-line-status-']")).toHaveAttribute("role", "status");
  await expect(confirmedCard.locator("[id^='receipt-line-status-']")).toHaveAttribute("aria-live", "polite");
  await expect(confirmedCard.locator("[id^='receipt-line-status-']")).toHaveAttribute("aria-atomic", "true");
  await expect(confirmedCard.locator("[id^='receipt-line-status-']")).toHaveText("항목 내용이 맞아요");
  await expect(confirmedCard.locator(".receipt-line-toggle")).toHaveAttribute("aria-label", /내용이 맞아요$/);
  await expect(confirmedCard.locator(".ocr-confidence")).toHaveText("확인했어요");
  await expect(confirmedCard.locator(".ocr-confidence")).not.toHaveClass(/ocr-review/);
  const confirmedLineId = await confirmedCard.getAttribute("data-line-id");
  const stableConfirmedCard = page.locator(`.receipt-line-card[data-line-id="${confirmedLineId}"]`);
  await stableConfirmedCard.locator(".receipt-line-toggle").click();
  await expect(page.locator(".receipt-line-card-checked")).toHaveCount(2);
  await stableConfirmedCard.locator(".receipt-line-toggle").click();
  await expect(page.locator(".receipt-line-card-checked")).toHaveCount(3);
  await expect(page.locator(".receipt-line-card-confirmed")).toHaveCount(1);
  await expect(page.locator(".receipt-line-card-needs-confirmation")).toHaveCount(0);
    await expect(page.locator("#receipt-review-ready-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(page.getByRole("button", { name: "3개 식품 저장하기" })).toHaveAttribute("aria-describedby", "receipt-review-ready-hint");
});

test("receipt product lookup stays secondary and full-size in dark mode", async ({ page }) => {
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();

  const lookup = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]').getByRole("button", { name: "상품 정보 찾기" });
  const style = await lookup.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, background: computed.backgroundColor, color: computed.color };
  });

  expect(style.height).toBeGreaterThanOrEqual(44);
  expect(style.background).not.toBe("rgb(255, 255, 255)");
  // Neutral kitchen muted ink (not the leek-green accent) keeps the lookup secondary.
  expect(style.color).toBe("rgb(156, 176, 164)");
  expect(style.color).not.toBe("rgb(99, 207, 148)");
});

test("receipt validation explains and focuses invalid quantity and unit fields", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "예시 영수증 보기" }).click();
  const mushroomCard = dialog.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await mushroomCard.getByRole("button", { name: "내용이 맞아요" }).click();

  const quantity = mushroomCard.getByRole("spinbutton", { name: "수량" });
  const unit = mushroomCard.getByRole("textbox", { name: "단위" });
  const save = dialog.getByRole("button", { name: "3개 식품 저장하기" });
  await quantity.fill("0");
  await expect(mushroomCard.locator(".receipt-line-error")).toHaveText("수량은 0보다 큰 숫자로 입력해 주세요.");
  await expect(dialog.locator(".receipt-review-submit-bar")).toHaveAttribute("data-review-state", "invalid");
  await expect(dialog.locator("#receipt-review-invalid-hint > span").first()).toHaveText("입력 내용 1개를 확인해 주세요.");
  await expect(dialog.locator("#receipt-review-invalid-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(save).toBeDisabled();
  // The correction shortcut now sits in the alert that counts the items still needing input.
  const errorAlert = dialog.getByRole("alert").filter({ hasText: "입력할 내용이 남은 항목 1개" });
  await expect(errorAlert).toBeVisible();
  const errorAction = errorAlert.getByRole("button", { name: "수정하기" });
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
  await errorAlert.getByRole("button", { name: "수정하기" }).click();
  await expect(unit).toBeFocused();

  await unit.fill("팩");
  await expect(mushroomCard.locator(".receipt-line-error")).toHaveCount(0);
    await expect(dialog.locator("#receipt-review-ready-hint > .receipt-review-submit-date-hint")).toHaveText("소비기한은 미확인으로 저장돼요.");
  await expect(save).toBeEnabled();
});

test("receipt line editing reveals the active line and keeps commit reachable", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();

  const spinachCard = page.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await spinachCard.getByRole("button", { name: "시금치 항목 수정" }).click();
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "시금치 항목 수정 닫기" })).toHaveAttribute("aria-expanded", "true");
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

    const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
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
      const interactiveControls = Array.from(card.querySelectorAll<HTMLElement>("button, input"));
      return {
        sheetHasNoHorizontalOverflow: sheet.scrollWidth <= sheet.clientWidth + 1,
        reviewHasNoHorizontalOverflow: review.scrollWidth <= review.clientWidth + 1,
        linesFitReview: linesBounds.right <= review.getBoundingClientRect().right + 1,
        itemNameFits: itemName.scrollWidth <= itemName.clientWidth,
        // The preview phone frame is scaled to fit the browser viewport; measure the target in CSS pixels.
        editTargetIs44px: editButton.offsetWidth >= 44 && editButton.offsetHeight >= 44,
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
  await expect(preview.getByText("영수증 내용")).toBeVisible();
  await expect(preview.getByText("원본 파일은 식품 기록에 저장하지 않아요.")).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("alt", "업로드한 영수증 원본 미리보기");
  await expect(preview.locator("img")).toHaveAttribute("src", /^blob:/);
});

test("intake methods explain what will be checked and offer the matching capture option", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(receiptDialog.getByText("원본 파일은 식품 기록에 저장하지 않아요.", { exact: true })).toBeVisible();
  const receiptTab = receiptDialog.getByRole("tab", { name: "영수증" });
  await expect(receiptTab).toHaveAttribute("aria-controls", "add-mode-panel-receipt");
  await expect(receiptDialog.locator("#add-mode-panel-receipt")).toHaveAttribute("aria-labelledby", "add-mode-tab-receipt");
  await receiptTab.focus();
  await page.keyboard.press("ArrowRight");
  const barcodeDialog = page.getByRole("dialog", { name: "바코드로 추가" });
  await expect(barcodeDialog.getByText("바코드로 상품을 찾고, 맞는 상품인지 살펴봐요.", { exact: true })).toBeVisible();
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
  // The panel heading names the capture step; the commit boundary moved into the note checked below.
  await expect(labelDialog.getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();
  await expect(labelDialog.getByText("사진은 식품 기록에 저장하지 않아요.", { exact: true })).toBeVisible();
  const labelInputs = labelDialog.getByRole("group", { name: "라벨 이미지 입력 방법" });
  await expect(labelInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(labelInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
  await expect(labelDialog.getByRole("button", { name: "예시 라벨 결과 보기" })).toBeVisible();
  await expect(labelDialog.getByText("날짜가 무엇을 뜻하는지 확인하기 전에는 소비기한으로 저장하지 않아요.")).toBeVisible();

  await labelDialog.getByRole("tab", { name: "직접 입력" }).click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.getByRole("textbox", { name: "식품 이름", exact: true })).toBeVisible();
  await expect(manualDialog).toContainText("날짜는 포장지를 확인한 뒤 추가할 수 있어요.");
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
  await expect(preview).toContainText("원본 파일은 식품 기록에 저장하지 않아요.");
});

test("receipt line source action reveals its matched original above the sticky save bar", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  const preview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });

  // The line-level action is now "영수증에서 위치 보기"; the preview's own hit target keeps "영수증에서 확인하기".
  await dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]').getByRole("button", { name: "시금치 영수증에서 위치 보기" }).click();

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
  const dialog = page.getByRole("dialog", { name: "영수증 살펴보기" });
  const preview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(dialog).toContainText("사진에서 표시한 부분과 상품을 연결하지 못했어요. 영수증을 보며 상품명과 수량을 살펴봐 주세요.");
  await expect(preview).toHaveAttribute("data-source-preview-mode", "image");
  await expect(preview).toHaveAttribute("data-source-mapping-state", "unmapped");
  await expect(preview).toHaveAttribute("data-active-source-count", "0");
  await expect(preview).toHaveAttribute("data-active-source-line", "");
  await expect(preview.locator(".receipt-source-hit-target")).toHaveCount(0);
  await expect(preview.locator(".receipt-source-box-unmapped")).toHaveCount(3);
  await expect(preview.locator(".receipt-source-box-unmapped").first()).toHaveCSS("border-style", "dashed");
  await expect(preview.locator(".receipt-source-box-active")).toHaveCount(0);
  await expect(preview.locator(".receipt-source-preview-heading small")).toHaveText("상품과 연결되지 않은 위치예요");
  await expect(preview).toContainText("테두리는 영수증에서 읽은 부분이에요. 특정 상품과 연결된 표시는 아니에요.");
  await expect(spinachCard).not.toHaveClass(/receipt-line-card-source-active/);
  await expect(spinachCard.locator(".sr-only")).toHaveText("영수증에서 읽었어요");
  const mushroomCard = dialog.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  if (await mushroomCard.locator(".receipt-line-editor").count() === 0) {
    await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" }).press("Enter");
  }
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);
  const mushroomName = mushroomCard.getByRole("textbox", { name: "식품 이름" });
  await expect(mushroomName).toBeVisible();
  await mushroomName.fill("새송이버섯");
  // A renamed OCR line needs an explicit confirmation before the review is ready.
  await mushroomCard.getByRole("button", { name: "내용이 맞아요", exact: true }).click();
  await expect(page.locator("#receipt-review-ready-hint")).toContainText("소비기한은 미확인으로 저장돼요.");
  const stableMushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await stableMushroomCard.locator(".receipt-line-toggle").click();
  await stableMushroomCard.locator(".receipt-line-toggle").click();
  await expect(page.locator("#receipt-review-ready-hint")).toContainText("소비기한은 미확인으로 저장돼요.");
  await expect(preview).toHaveAttribute("data-active-source-count", "0");
  await expect(preview).toHaveAttribute("data-active-source-line", "");
  const commitButton = dialog.getByRole("button", { name: "3개 식품 저장하기" });
  await expect(commitButton).toBeEnabled();
  await commitButton.click();
  await expect(page.locator(".toast")).toContainText("영수증에서 식품 3개를 목록에 추가했어요.");
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
  await expect(page.locator(".label-result-provenance span")).toHaveText("예시 결과예요. 실제 식품을 등록할 때 포장지 날짜를 선택해 주세요.");
  await expect(page.locator(".label-result-provenance strong")).toHaveCSS("font-size", "12px");
  await expect(page.locator(".label-result-action-summary")).toContainText("예시 결과 저장 전 확인");
  await expect(page.locator(".label-result-card")).toHaveAttribute("data-label-source", "example");
  await expect(page.locator(".label-result-card")).toHaveAttribute("data-date-state", "actual_printed");
  await expect(page.locator(".label-result-card")).toHaveAttribute("data-date-confirmation", "candidate");
  // Extra review guidance is linked only for dates that may not be expiry dates (production/packaging).
  await expect(page.getByRole("textbox", { name: "포장지 날짜" })).toHaveAttribute("aria-describedby", "label-result-date-readable");
  await expect.poll(() => page.locator(".label-result-fields").evaluate((fields) => {
    const dateEvidence = fields.querySelector(".label-date-kind-summary, .label-date-meaning-review");
    const lotTargets = fields.querySelector(".label-lot-target");
    if (!dateEvidence || !lotTargets) return false;
    return Boolean(dateEvidence.compareDocumentPosition(lotTargets) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(page.locator(".label-date-kind-edit")).toHaveCSS("min-height", "44px");
  await expect(page.locator(".label-result-action-summary")).toBeInViewport();
  await expect(page.locator(".label-result-action-summary")).toContainText("예시 결과 저장 전 확인");
  await page.locator("[data-label-date-candidate]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-label-date-candidate]")).toBeInViewport();
  await page.getByRole("button", { name: "날짜 의미 변경" }).click();
  await expect(page.getByText("날짜 옆에 적힌 이름을 그대로 선택해 주세요. 확실하지 않으면 소비기한으로 짐작하지 않아도 돼요.", { exact: true })).toBeVisible();
  const sellByChoice = page.getByRole("radio", { name: "유통기한", exact: true });
  await sellByChoice.click();
  await expect(page.getByText(/^유통기한 \d{4}\.\d{2}\.\d{2}$/)).toBeVisible();
  await page.getByRole("button", { name: "날짜 의미 변경" }).click();
  const useByChoice = page.getByRole("radio", { name: "소비기한", exact: true });
  await expect(useByChoice).toHaveCSS("min-height", "44px");
  await useByChoice.click();
  await expect(page.getByRole("button", { name: "날짜 의미 변경" })).toBeFocused();
  // The sample date is now in the future; enter the printed date that is already due so the saved food needs review.
  await page.getByRole("textbox", { name: "포장지 날짜" }).fill("2026-09-02");
  await expect(page.locator("[data-label-date-candidate]")).toHaveText("소비기한 2026.09.02");
  await expect(page.locator("#label-result-date-readable")).toHaveText(/선택한 날짜\s*2026\.09\.02/);
  await expect(page.getByText("예시 정보", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "새 식품 추가하기" })).toBeVisible();
  await page.getByRole("button", { name: "새 식품 추가하기" }).click();
  await expect(page.locator(".toast")).toHaveText(/시금치/);

  const savedPriorityCard = page.locator(".priority-card").first();
  await expect(savedPriorityCard).toHaveAttribute("data-priority-state", "needs-review");
  await expect(savedPriorityCard.locator(".freshness-chip")).toHaveText("+1일");
  await expect(savedPriorityCard.locator(".freshness-chip")).toHaveAttribute("aria-label", "표시 날짜에서 1일 지남");
  await expect(savedPriorityCard.locator(".freshness-chip")).toHaveAttribute("data-estimated", "false");
  await savedPriorityCard.click();
  const savedDateProof = page.getByRole("group", { name: "날짜 정보: 포장 소비기한" });
  await expect(savedDateProof).toContainText("2026.09.02");
  await expect(savedDateProof.locator("small")).toHaveText("포장지 표시");
  await expect(page.locator(".date-review-callout")).toContainText("조리 전 확인이 필요해요");

  await page.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  await page.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await page.getByRole("button", { name: "날짜 의미 변경" }).click();
  await page.getByRole("radio", { name: "제조일", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "포장지 날짜" })).toHaveAttribute("aria-describedby", "label-result-date-readable label-date-review-guidance");
  await expect(page.locator("#label-date-review-guidance")).toHaveText("이 날짜는 소비기한이 아닐 수 있어요. 보관 방법도 살펴봐 주세요.");
  await page.getByRole("textbox", { name: "포장지 날짜" }).fill("2026-09-02");
  await expect(page.getByRole("button", { name: "기존 식품 날짜 바꾸기" })).toBeEnabled();
  await page.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();

  const manufacturingDateProof = page.getByRole("group", { name: "날짜 정보: 포장 제조일" });
  await expect(manufacturingDateProof).toContainText("2026.09.02");
  await expect(manufacturingDateProof.locator("small")).toHaveText("포장지 표시");
  const dateKindReview = page.locator(".date-review-callout");
  await expect(dateKindReview).toContainText("포장지 날짜 종류를 골라 주세요");
  await expect(dateKindReview).toContainText("포장일과 제조일은 소비기한이 아니에요.");
  await expect(dateKindReview).not.toContainText(/표시 날짜가 (오늘이에요|어제 지났어요|\d+일 지났어요|오늘이거나 지났어요)/);
  await expect(dateKindReview.locator(".date-edit-button")).toBeFocused();
});

test("focuses the updated date proof when a label recheck clears the review warning", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();

  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await labelReview.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  await labelReview.getByLabel("포장지 날짜").fill("2026-10-01");
  await labelReview.getByRole("button", { name: "기존 식품 날짜 바꾸기" }).click();

  const returnedDetail = page.getByRole("dialog", { name: "시금치" });
  const updatedDateProof = returnedDetail.getByRole("group", { name: "날짜 정보: 포장 소비기한" });
  await expect(returnedDetail.locator(".date-review-callout")).toHaveCount(0);
  await expect(updatedDateProof).toContainText("2026.10.01");
  await expect(updatedDateProof).toBeFocused();
});

test("label review lets the user choose a new lot or an existing matching lot", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(dialog.locator(".input-flow > p")).toHaveText("사진은 식품 기록에 저장하지 않아요.");
  await dialog.getByRole("button", { name: "예시 라벨 결과 보기" }).click();

  const labelSampleDate = (await dialog.getByRole("textbox", { name: "포장지 날짜" }).inputValue()).replaceAll("-", ".");
  const saveSummary = dialog.locator("#label-result-action-summary");
  const saveAction = dialog.getByRole("button", { name: "새 식품 추가하기" });
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(saveSummary).toHaveText(`예시 결과 저장 전 확인 소비기한 ${labelSampleDate} 새 식품 1개 냉장`);
  await expect(saveAction).toHaveAttribute("aria-describedby", "label-result-action-summary");
  await expect.poll(() => saveSummary.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);

  const newLot = dialog.getByRole("radio", { name: /새로 산 식품으로 추가/ });
  const existingLot = dialog.getByRole("radio", { name: /기존 식품 1팩/ });
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
  await expect(dialog.locator("#label-new-food-quantity-hint")).toHaveCount(0);
  await expect(dialog.locator("#label-result-action-summary")).toContainText("새 식품 2팩");
  await expect(dialog.getByRole("button", { name: "새 식품 추가하기" })).toBeEnabled();
  await expect(dialog.locator(".label-result-action-summary")).toContainText(`소비기한 ${labelSampleDate} 새 식품 2팩 냉장`);

  await existingLot.click();
  await expect(existingLot).toHaveAttribute("aria-checked", "true");
  await expect(newLot).toHaveAttribute("aria-checked", "false");
  await expect(quantity).toHaveCount(0);
  await expect(dialog.locator(".label-lot-quantity-preserved")).toContainText("기존 수량 1팩은 그대로 두고");
  await expect(dialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" })).toBeEnabled();
  await expect(saveSummary).toHaveText(`예시 결과 저장 전 확인 소비기한 ${labelSampleDate} 기존 식품 1팩 냉장`);
  await expect(dialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" })).toHaveAttribute("aria-describedby", "label-result-action-summary");

  await newLot.click();
  await expect(newLot).toHaveAttribute("aria-checked", "true");
  await expect(quantity).toHaveValue("2팩");
  await expect(dialog.getByRole("button", { name: "새 식품 추가하기" })).toBeEnabled();
  await expect(saveSummary).toHaveText(`예시 결과 저장 전 확인 소비기한 ${labelSampleDate} 새 식품 2팩 냉장`);
});

test("label read failure reveals a reachable recovery action without changing the existing date", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  // textContent matches toHaveText's normalization; innerText adds layout line breaks between the proof fields.
  const originalDateProof = (await detail.locator(".date-proof-card").textContent()) ?? "";
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();

  const labelReview = page.getByRole("dialog", { name: "날짜 다시 살펴보기" });
  await labelReview.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/spinach-photo.jpg");
  const error = labelReview.locator(".label-result-error-callout");
  const manualFallback = error.getByRole("button", { name: "직접 날짜 입력" });
  const labelInstruction = labelReview.getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" });
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
  await expect(labelReview.getByRole("group", { name: "포장지 날짜 직접 입력" })).toBeVisible();
  await expect(labelReview.getByRole("textbox", { name: "라벨 상품명" })).toHaveValue("시금치");
  await expect(labelReview.getByRole("textbox", { name: "포장지 날짜" })).toHaveValue("");
  await expect(labelReview.locator('.label-lot-target-option[aria-checked="true"]')).toContainText("기존 식품");
  await expect(labelReview.locator(".label-result-action")).toBeDisabled();
  await labelReview.getByRole("button", { name: "닫기", exact: true }).click();
  const returnedDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(returnedDetail.locator(".date-proof-card")).toHaveText(originalDateProof);

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
  await expect(page.getByRole("group", { name: "식품 추가 2단계" })).toContainText("찾은 상품명과 보관 위치를 살펴봐 주세요.");
  await expect(page.locator(".barcode-candidate-heading")).toContainText("찾은 상품 정보");
  await expect(page.locator(".barcode-candidate-heading")).toContainText("살펴본 뒤 적용해 주세요");
  await expect(page.getByText("소비기한은 포장지에서 살펴봐 주세요.", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "날짜가 보이는 면을 선택해 주세요" })).toBeVisible();
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
  await expect(barcodeNotFoundStep).toContainText("바코드 숫자를 다시 살펴보거나 다른 방법으로 추가해요.");
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
  await expect(productSourceCard).toContainText("서비스 상품 정보");
  await expect(productSourceCard).toContainText("상품 정보에 나온 보관 방법: 냉장");
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
  await expect(returnedSourceCard).toContainText("서비스 상품 정보");
  await expect(returnedSourceCard).toContainText("상품 정보에 나온 보관 방법: 냉장");
  await expect(returnedManualDialog.locator(".intake-flow-rail")).toHaveCount(0);
  await expect(returnedManualDialog.locator("#manual-submit-summary")).toHaveText("국산콩 두부 · 브랜드 풀무원1개 냉장 보관체험 기록이에요. 새로고침하면 사라져요.");
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
  await expect(manualDialog.locator("#manual-submit-summary")).toHaveText("국산콩 두부 · 브랜드 풀무원1개 냉장 보관체험 기록이에요. 새로고침하면 사라져요.");
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
  await expect(labelDialog.getByLabel("포장지 날짜")).toHaveValue("2026-09-07");

  await labelDialog.getByRole("tab", { name: "영수증" }).click();
  const switchedReceiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(switchedReceiptDialog).toBeVisible();
  await switchedReceiptDialog.getByRole("tab", { name: "라벨" }).click();

  const returnedLabelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(returnedLabelDialog.locator(".label-result-provenance")).toHaveAttribute("data-label-source", "example");
  await expect(returnedLabelDialog.getByLabel("포장지 날짜")).toHaveValue("2026-09-07");
  await returnedLabelDialog.getByRole("button", { name: "날짜 의미 변경" }).click();
  await returnedLabelDialog.getByRole("radio", { name: "포장일" }).click();
  await expect(returnedLabelDialog.getByText("포장일 2026.09.07", { exact: true })).toBeVisible();
  await expect(returnedLabelDialog.getByRole("button", { name: "새 식품 추가하기" })).toBeEnabled();
  const labelQuantity = returnedLabelDialog.getByRole("textbox", { name: "새 식품 수량" });
  await labelQuantity.scrollIntoViewIfNeeded();
  await labelQuantity.click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toContainText("예시 결과 저장 전 확인 포장일 2026.09.07 새 식품 1개 냉장");
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
  const existingLot = returnedLabelDialog.getByRole("radio", { name: /기존 식품 1팩/ });
  await existingLot.click();
  await expect(returnedLabelDialog.locator(".label-lot-quantity-preserved")).toContainText("기존 수량 1팩은 그대로 두고");

  await returnedLabelDialog.getByRole("button", { name: "날짜 의미 변경" }).click();
  const missingMeaningAction = returnedLabelDialog.getByRole("button", { name: "날짜·보관 위치를 선택해 주세요" });
  await expect(missingMeaningAction).toBeDisabled();
  await returnedLabelDialog.getByLabel("라벨 상품명").click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toHaveText("예시 결과 저장 전 확인 날짜 종류를 골라 주세요 2026.09.07 기존 식품 1팩 냉장");
  await expect(missingMeaningAction).toBeDisabled();

  const manufacturingDateChoice = returnedLabelDialog.getByRole("radio", { name: "제조일", exact: true });
  await manufacturingDateChoice.click();
  await expect(returnedLabelDialog.getByText("제조일 2026.09.07", { exact: true })).toBeVisible();
  await expect(returnedLabelDialog.getByText("이 날짜는 소비기한이 아닐 수 있어요. 보관 방법도 살펴봐 주세요.", { exact: true })).toBeVisible();
  const correctExistingLot = returnedLabelDialog.getByRole("button", { name: "기존 식품 날짜 바꾸기" });
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(correctExistingLot).toBeEnabled();
  await expect(returnedLabelDialog.getByRole("button", { name: "날짜 의미 변경" })).toBeFocused();
  await expect(correctExistingLot).toBeVisible();
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toHaveText("예시 결과 저장 전 확인 제조일 2026.09.07 기존 식품 1팩 냉장");
  await expect(correctExistingLot).toHaveAttribute("aria-describedby", "label-result-action-summary");

  await returnedLabelDialog.getByLabel("라벨 상품명").click();
  await expect(page.locator(".keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(returnedLabelDialog.locator(".label-result-action-summary")).toContainText("예시 결과 저장 전 확인 제조일 2026.09.07 기존 식품 1팩 냉장");
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
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 1모/ }).click();
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
  // The heading no longer has a sub-line and the "choose a kind first" footnote is gone; the 12px selection hint
  // linked to the radiogroup carries that instruction, and the save action stays disabled until kind and date exist.
  await expect(editor.locator(".date-editor-heading")).toHaveText("포장지에서 확인한 날짜");
  await expect(editor.locator("#date-kind-selection-hint")).toHaveText("포장지에 적힌 날짜 이름을 그대로 골라 주세요. 확실하지 않으면 소비기한으로 짐작하지 않아도 돼요.");
  await expect(editor.locator("#date-kind-selection-hint")).toHaveCSS("font-size", "12px");
  await expect(editor.getByRole("radiogroup", { name: "날짜 종류" })).toHaveAttribute("aria-describedby", "date-kind-selection-hint");
  expect((await editor.getByRole("button", { name: "날짜 저장" }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(editor.getByRole("button", { name: "날짜 저장" })).toBeDisabled();
  await editor.getByRole("radio", { name: "유통기한", exact: true }).press("ArrowRight");
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toBeFocused();
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toHaveAttribute("aria-checked", "true");
  await editor.getByRole("radio", { name: "소비기한", exact: true }).press("ArrowDown");
  await expect(editor.getByRole("radio", { name: "내 알림일", exact: true })).toBeFocused();
  await editor.getByRole("radio", { name: "내 알림일", exact: true }).press("ArrowUp");
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toBeFocused();
  await expect(editor.getByRole("radio", { name: "소비기한", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(editor.getByRole("button", { name: "날짜 저장" })).toBeDisabled();
  await editor.getByRole("textbox", { name: "날짜" }).fill(confirmedDateValue);
  await expect(editor).toContainText(new RegExp(`선택한 날짜\\s*${confirmedDateValue.replaceAll("-", "\\.")}`));
  await expect(editor).toContainText("날짜는 직접 확인한 내용으로 저장돼요.");
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("국산콩 두부 소비기한을 포장지에서 확인해 기록했어요.");
  await expect(page.locator(".toast")).not.toContainText("알림으로 돌아왔어요");
  // The fixture product has no "next food" toast action after a date save.
  await expect(page.locator(".toast-action")).toHaveCount(0);
  const updatedFoodRow = inventory.locator(".inventory-row").filter({ hasText: "국산콩 두부" });
  await expect(updatedFoodRow).toBeVisible();
  // The confirmed printed date is no longer an estimate: the chip turns solid and shows the date itself.
  await expect(updatedFoodRow.locator(".freshness-chip")).toHaveText(confirmedDateLabel);
  await expect(updatedFoodRow.locator(".freshness-chip")).toHaveAttribute("data-estimated", "false");
  await expect(updatedFoodRow.locator(".freshness-chip")).toHaveAttribute("aria-label", /^표시 날짜까지 \d+일$/);
  await expect(updatedFoodRow).toBeFocused();
  await updatedFoodRow.click();
  const confirmedDetail = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(confirmedDetail.locator(".date-proof-card small")).toHaveText("포장지에서 사용자 확인");
  await expect(confirmedDetail.locator(".detail-note")).toHaveCount(0);
});

test("receipt-backed food detail explains purchase provenance without exposing internal ids", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 2팩/ }).click();
  const dialog = page.getByRole("dialog", { name: "맛타리버섯" });

  const purchaseRecord = dialog.getByRole("region", { name: "구매와 상품 정보" }).getByRole("group", { name: "구매 기록" });
  await expect(purchaseRecord).toContainText("영수증에서 추가");
  await expect(purchaseRecord).toContainText("2026년 9월 1일 구매");
  await expect(purchaseRecord).toContainText("영수증 상품 항목");
  await expect(purchaseRecord).not.toContainText("demo-receipt");
  // The purchase card no longer repeats the expiry boundary; the date note beside the estimated date carries it.
  await expect(dialog.locator(".date-proof-card")).toHaveAttribute("data-date-state", "estimated_use_first");
  await expect(dialog.locator(".detail-note")).toHaveText("소비기한이 아닌 참고 날짜예요.");
});

test("detail save stays quiet until a storable food state changes", async ({ page }) => {
  // 닭가슴살 is no longer in the three-food home priority set; open it from the food list.
  await page.locator(".inventory-row").filter({ hasText: "닭가슴살" }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  const saveButton = dialog.locator(".detail-actions .primary-sheet-button");

  await expect(saveButton).toHaveCount(0);
  await expect(dialog.locator(".detail-actions")).toHaveClass(/detail-actions-no-save/);
  await expect(dialog.locator(".detail-actions .detail-consume-action")).toBeVisible();
  // No save hint is reserved before a storable change; the quantity note stays empty until a partial amount remains.
  await expect(dialog.locator(".detail-save-hint")).toHaveCount(0);
  await expect(dialog.locator("#food-event-quantity-note")).toHaveText("");

  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await expect(saveButton).toHaveCount(0);
  await expect(dialog.locator(".detail-actions")).toHaveClass(/detail-actions-no-save/);
  await expect(dialog.locator(".detail-save-hint")).toHaveCount(0);
  // A quantity-only change applies to the consume/discard record, not to a saved state.
  await expect(dialog.locator("#food-event-quantity-note")).toHaveText("먹거나 폐기한 뒤 1팩 남아요.");
  await expect(dialog.getByRole("button", { name: "1팩 먹었어요" })).toBeVisible();

  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(dialog.locator(".detail-actions")).not.toHaveClass(/detail-actions-no-save/);
  await expect(saveButton).toBeEnabled();
  await expect(saveButton).toHaveText(/변경 저장/);
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("저장 필요 보관 위치 수량");
  await expect(dialog.locator(".detail-save-hint")).toHaveText("저장하지 않고 닫으면 보관 상태가 바뀌지 않아요.");
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
  await expect(confirmation).toContainText("이미 먹은 수량만 기록해요.");
  await expect(confirmation).toContainText("먹어도 되는지는 앱에서 판단할 수 없어요.");
  await expect(confirmation.locator(".consume-confirm-safety-copy")).toHaveCSS("font-size", "12px");
  await expect(confirmation.getByRole("button", { name: "돌아가기" })).toBeFocused();
  await confirmation.getByRole("button", { name: "돌아가기" }).click();
  await expect(dialog.locator(".detail-consume-action-review")).toBeFocused();
  await dialog.locator(".detail-consume-action-review").click();
  const resumedConfirmation = dialog.locator(".consume-confirm");
  await expect(resumedConfirmation).toBeVisible();
  await resumedConfirmation.getByRole("button", { name: "먹었어요", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("시금치를 먹은 기록으로 남겼어요");
  // The next food is no longer named in the toast; focus moves to it on the refreshed priority list instead.
  await expect(page.getByRole("heading", { name: "먼저 살펴볼 식품 3개" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" })).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.locator(".priority-card").first()).toBeFocused();
});

test("consume confirmation explains that pending storage changes are not part of the record", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "시금치" }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  const stateSummary = dialog.getByRole("group", { name: "보관 및 개봉 상태" });

  await expect(stateSummary).toContainText("냉장 보관 중");
  await expect(stateSummary).toContainText("개봉 상태 개봉됨");

  await dialog.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(stateSummary.locator(".detail-hero-storage-pending")).toHaveText("저장 전 냉동");
  await expect(stateSummary).not.toContainText("냉동 보관 중");
  await expect(dialog.locator(".detail-section-heading small").first()).toHaveText("저장 필요 보관 위치");
  await dialog.locator(".detail-consume-action-review").click();

  const confirmation = dialog.getByRole("group", { name: "이 수량을 먹은 기록으로 남길까요?" });
  await expect(confirmation.locator(".consume-confirm-unsaved-copy")).toContainText("저장하지 않은 보관 위치 변경은 먹은 기록에 포함되지 않아요");
  const returnToSave = confirmation.getByRole("button", { name: "돌아가서 변경 저장" });
  await expect(returnToSave).toBeFocused();
  await returnToSave.click();
  await expect(dialog.locator(".detail-save-action")).toBeVisible();
  await expect(dialog.locator(".detail-section-heading small").first()).toHaveText("저장 필요 보관 위치");
});

test("food detail state summary marks an unsaved opened event as pending", async ({ page }) => {
  await page.locator(".priority-card").filter({ hasText: "국산콩 두부" }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  const stateSummary = dialog.getByRole("group", { name: "보관 및 개봉 상태" });

  await expect(stateSummary).toContainText("냉장 보관 중");
  await expect(stateSummary).toContainText("개봉 상태 미개봉");
  await dialog.getByRole("switch", { name: "국산콩 두부 개봉 상태" }).click();
  await expect(stateSummary.locator(".detail-hero-open-state-pending")).toHaveText("개봉 상태 저장 전");
  await expect(dialog.locator(".detail-save-action")).toBeVisible();

  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
});

test("user-confirmed date detail exposes the date without repeating the source label", async ({ page }) => {
  // 닭가슴살 is no longer in the three-food home priority set; open it from the food list.
  await page.locator(".inventory-row").filter({ hasText: "닭가슴살" }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  const dateProof = dialog.locator(".date-proof-card");

  await expect(dateProof).toHaveClass(/date-proof-user-confirmed/);
  await expect(dateProof).toHaveAttribute("data-date-state", "user_confirmed");
  await expect(dateProof.locator("span").first()).toHaveText("내 알림일");
  await expect(dateProof.locator("strong:not(.freshness-chip)")).toHaveText("2026.09.06");
  await expect(dateProof.locator(".detail-freshness-chip")).toHaveText("D-3");
  await expect(dateProof.locator("small")).toHaveText("내가 정한 날짜");
});

test("estimated use-first dates read as priority references, not expiry deadlines", async ({ page }) => {
  const homeCard = page.locator(".priority-card").filter({ hasText: "국산콩 두부" });
  // The dashed estimate chip and its spoken label carry the reference meaning; no expiry wording.
  const homeChip = homeCard.locator(".freshness-chip");
  await expect(homeChip).toHaveText("D-1");
  await expect(homeChip).toHaveAttribute("data-estimated", "true");
  await expect(homeChip).toHaveAttribute("aria-label", "먼저 살펴볼 시점까지 1일");
  await expect(homeChip).toHaveCSS("border-top-style", "dashed");
  await expect(homeCard).toHaveAttribute("data-priority-state", "use-next");
  await homeCard.click();

  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  const dateProof = detail.locator(".date-proof-card");
  await expect(dateProof).toHaveAttribute("aria-label", "날짜 정보: 먼저 살펴볼 시점");
  await expect(dateProof.locator("span").first()).toHaveText("먼저 살펴볼 시점");
  await expect(dateProof.locator("strong:not(.freshness-chip)")).toHaveText("내일");
  await expect(dateProof.locator(".detail-freshness-chip")).toHaveAttribute("data-estimated", "true");
  await expect(dateProof).not.toContainText("까지 먼저 먹기");
  await expect(dateProof).not.toContainText("소비기한");
  await expect(detail.locator(".detail-note")).toHaveText("소비기한이 아닌 참고 날짜예요.");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();

  await page.getByRole("button", { name: "식품", exact: true }).click();
  const inventoryChip = page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".inventory-status .freshness-chip");
  await expect(inventoryChip).toHaveText("D-1");
  await expect(inventoryChip).toHaveAttribute("data-estimated", "true");
  await expect(inventoryChip).toHaveAttribute("aria-label", "먼저 살펴볼 시점까지 1일");
});

test("user-confirmed reminder can reopen its existing date and meaning for editing", async ({ page }) => {
  // 닭가슴살 is no longer in the three-food home priority set; open it from the food list.
  await page.locator(".inventory-row").filter({ hasText: "닭가슴살" }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });

  await dialog.getByRole("button", { name: "내 알림일 수정" }).click();
  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await expect(editor.getByRole("textbox", { name: "날짜" })).toHaveValue("2026-09-06");
  await expect(editor.getByRole("radio", { name: "내 알림일", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("partial storage move splits a multi-quantity food into two lots", async ({ page }) => {
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("냉동에 보관 중");
  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(dialog.locator(".detail-section-heading small")).toHaveText("저장 필요 보관 위치 수량");
  await expect(dialog.locator(".detail-section")).toHaveClass(/detail-section-pending/);
  await expect(dialog.locator(".detail-actions .detail-save-pending")).toBeVisible();
  await dialog.locator(".detail-actions .primary-sheet-button").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("닭가슴살 수량을 나눠 변경 내용을 저장했어요.");

  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 8" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 1팩/ })).toHaveCount(2);
  // 닭가슴살 is outside the home priority set, so focus returns to its original lot in the food list.
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 1팩 냉동/ })).toBeFocused();
});

test("partial discard requires confirmation and preserves the remaining quantity", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 2팩/ }).click();
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
  await expect(inventory.getByRole("button", { name: /맛타리버섯 국내산 맛타리 1팩/ })).toBeFocused();
});

test("inventory consume returns focus to the next pantry row", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "먹었어요", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부를 먹은 기록으로 남겼어요");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 1팩/ })).toBeFocused();
});

test("inventory discard returns focus to the next pantry row", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "상태가 이상해 폐기하기" }).click();
  const discardConfirmation = dialog.getByRole("alert");
  await expect(discardConfirmation.locator(".discard-confirm-quantity")).toContainText("국산콩 두부");
  await expect(discardConfirmation.locator(".discard-confirm-quantity")).toContainText("1모");
  await expect(discardConfirmation).toContainText("폐기 기록 후 이 식품은 목록에서 사라져요.");
  await dialog.getByRole("button", { name: "폐기 기록" }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부 폐기 기록을 남겼어요");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await expect(inventory.getByRole("button", { name: /시금치 국내산 시금치 1팩/ })).toBeFocused();
});

test("inventory filter narrows the list by storage location", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("combobox", { name: "보관 위치 필터" }).selectOption({ label: "냉동만" });

  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("냉동 보관 식품 1개");
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산/ })).toHaveCount(0);
});

test("inventory search finds food by name and recovers from no results", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  // The list lands directly below the sticky toolbar inset (iPhone safe area), so no row starts hidden under it.
  await expect.poll(() => inventory.evaluate((element) => {
    const screenElement = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    const toolbar = element.querySelector<HTMLElement>(".inventory-toolbar");
    if (!screenElement || !toolbar) return Number.POSITIVE_INFINITY;
    const stickyTop = Number.parseFloat(getComputedStyle(toolbar).top) || 0;
    return Math.abs(element.getBoundingClientRect().top - screenElement.getBoundingClientRect().top - stickyTop);
  })).toBeLessThanOrEqual(1);
  await expect.poll(() => inventory.evaluate((element) => {
    const screenElement = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    const toolbar = element.querySelector<HTMLElement>(".inventory-toolbar");
    if (!screenElement || !toolbar) return Number.POSITIVE_INFINITY;
    return Math.abs(toolbar.getBoundingClientRect().top - element.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(1);

  await search.fill("두부");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("“두부” 검색 결과 1개");
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

  // The result summary's reset action is now "전체 목록 보기".
  await inventory.locator(".inventory-filter-summary").getByRole("button", { name: "전체 목록 보기" }).click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");

  await search.fill("없는 식품");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(inventory.locator(".inventory-filter-summary")).toContainText("“없는 식품” 검색 결과 0개");
  await expect(inventory.locator(".inventory-empty-state")).toContainText("검색 결과가 없어요");
  // No-result recovery now hands the query back for editing instead of clearing it.
  await inventory.locator(".inventory-empty-state").getByRole("button", { name: "검색어 수정" }).click();
  await expect(search).toBeFocused();
  await expect.poll(() => search.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0))).toBe("없는 식품");
  await search.fill("");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
});

test("recipe sheet previews the pantry, saves a recipe, and records completion", async ({ page }) => {
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });

  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.locator(".recipe-provenance")).toHaveText("레시피 출처 Rescue Meal에서 작성");
  await expect(dialog.locator(".recipe-preview-save-note")).toHaveText("화면을 나가면 임시 식단이 사라져요. 조리 완료 전에는 재료 수량이 바뀌지 않아요.");
  await expect(dialog).not.toContainText("DEMO FIXTURE");
  await expect(dialog).not.toContainText("project-authored");
  await expect(dialog).not.toContainText("demo-v1");

  await dialog.getByRole("button", { name: "4인분", exact: true }).click();
  await expect(dialog.locator(".recipe-availability-summary strong")).toHaveText("재료 3가지를 준비해 주세요");
  await expect(dialog.locator(".recipe-ingredient-row").filter({ hasText: "시금치" })).toContainText("필요 4팩 보유 1팩 부족 3팩");
  await expect(dialog.locator(".recipe-plan-save-serving")).toHaveText("4인분");
  await dialog.getByRole("button", { name: "1인분", exact: true }).click();
  await expect(dialog.locator(".recipe-availability-summary strong")).toHaveText("필요한 재료를 모두 갖고 있어요");
  const saveMealButton = dialog.getByRole("button", { name: "임시 저장" });
  await expect(saveMealButton.locator(".recipe-plan-save-serving")).toHaveText("1인분");
  await expect(saveMealButton).toHaveAttribute("aria-describedby", "recipe-serving-note recipe-preview-save-note");
  // Changing the serving keeps focus on the chosen serving instead of jumping to the safety summary.
  await expect(dialog.getByRole("button", { name: "1인분", exact: true })).toBeFocused();

  const safetyEntry = dialog.getByRole("button", { name: "조리 전에 확인할 내용 2개 보기" });
  await expect(safetyEntry).toBeVisible();
  const dateReviewCallout = dialog.locator(".recipe-date-review-callout");
  await expect(dateReviewCallout).toHaveCount(1);
  await expect(dateReviewCallout).toContainText("조리 전에 포장지 날짜를 살펴봐 주세요");
  // The callout is now just the heading and food shortcuts; it still never calls the food safe.
  await expect(dateReviewCallout.locator("small")).toHaveCount(0);
  await expect(dateReviewCallout).not.toContainText("안전");
  const dateReviewAction = dateReviewCallout.getByRole("button", { name: "시금치 보기" });
  await expect(dateReviewAction).toBeVisible();
  await safetyEntry.click();
  await expect(dateReviewAction).toBeFocused();
  await dateReviewAction.click();
  const mealLinkedDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(mealLinkedDetail).toBeVisible();
  await expect(mealLinkedDetail.locator(".date-review-callout")).toContainText("조리 전 확인이 필요해요");
  await mealLinkedDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "시금치 보기" })).toBeFocused();
  await expect(dialog.getByText("필요한 재료", { exact: true })).toBeVisible();
  // The plan actions now sit above the full ingredient list; the availability summary still precedes them.
  const availabilityBeforeActions = await dialog.evaluate((element) => {
    const availability = element.querySelector(".recipe-availability-summary");
    const planActions = element.querySelector(".recipe-actions");
    return Boolean(availability && planActions && (availability.compareDocumentPosition(planActions) & 4));
  });
  expect(availabilityBeforeActions).toBe(true);
  await dialog.getByRole("button", { name: "조리 방법 보기" }).click();
  await expect(dialog.getByText("조리 순서")).toBeVisible();
  // The recipe-details safety box is gone; the pre-cooking check lives in the date callout and completion acknowledgement.
  await expect(dialog.locator(".recipe-details .recipe-safety")).toHaveCount(0);

  await dialog.getByRole("button", { name: "임시 저장" }).click();
  await expect(dialog.getByRole("button", { name: "임시 저장됨" })).toBeVisible();
  await expect(dialog.locator(".saved-recipe")).toHaveText("임시 식단을 저장했어요. 1인분.");
  await expect(dialog.locator(".recipe-preview-save-note")).toHaveText("화면을 나가면 임시 식단이 사라져요. 조리 완료 전에는 재료 수량이 바뀌지 않아요.");
  await expect(dialog.locator(".recipe-consumption-heading")).toHaveCSS("display", "grid");
  await expect(dialog.locator(".recipe-consumption-heading > span")).toHaveCSS("white-space", "nowrap");
  // With every ingredient at its default amount the heading carries no extra note.
  await expect(dialog.locator(".recipe-consumption-heading small")).toHaveCount(0);
  const spinachUsage = dialog.getByRole("textbox", { name: "시금치 사용할 양" });
  await spinachUsage.fill("0");
  await expect(dialog.locator(".recipe-consumption-heading small")).toHaveText("기록할 재료 2가지 기록 제외 1가지");
  await spinachUsage.fill("1");
  await expect(spinachUsage).toHaveValue("1");
  await expect(dialog.locator(".recipe-consumption-heading small")).toHaveCount(0);
  await spinachUsage.fill("0");
  await dialog.getByRole("textbox", { name: "국산콩 두부 사용할 양" }).fill("0");
  await dialog.getByRole("textbox", { name: "닭가슴살 사용할 양" }).fill("0");
  await expect(dialog.locator(".recipe-consumption-heading small")).toHaveText("사용할 재료를 하나 이상 골라 주세요. 선택하지 않은 재료는 그대로 남아요.");
  await expect(dialog.getByRole("button", { name: "사용할 재료를 골라 주세요" })).toBeDisabled();
  await spinachUsage.fill("1");
  const safetyAcknowledgement = dialog.getByRole("button", { name: "포장지와 재료를 살펴봤어요" });
  await expect(safetyAcknowledgement).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 완료 기록" })).toBeDisabled();
  await safetyAcknowledgement.click();
  await expect(dialog.getByRole("button", { name: "살펴봤어요", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 완료 기록" })).toBeEnabled();
  await dialog.getByRole("button", { name: "조리 완료 기록" }).click();
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  // Only 시금치 was used; the two excluded ingredients stay in the food list.
  await expect(page.getByRole("heading", { name: "내 식품 목록 6" })).toBeVisible();
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 2팩/ })).toBeVisible();
  await expect(page.locator(".priority-card").first()).toBeFocused();
  await expect(page.locator(".toast")).toHaveText("조리 완료로 기록했어요. 사용한 양만큼 보관 수량을 줄였어요. 2가지는 이번 기록에서 제외했어요.");
});

test("meal completion reports a skipped ingredient that remains in inventory", async ({ page }) => {
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();

  await dialog.getByRole("button", { name: "임시 저장" }).click();
  await expect(dialog.getByRole("button", { name: "임시 저장됨" })).toBeVisible();
  await dialog.getByRole("button", { name: "시금치 이번엔 안 씀" }).click();
  await expect(dialog.getByRole("textbox", { name: "시금치 사용할 양" })).toHaveValue("0");
  await dialog.getByRole("button", { name: "포장지와 재료를 살펴봤어요" }).click();
  await dialog.getByRole("button", { name: "조리 완료 기록" }).click();

  await expect(page.locator(".toast")).toContainText("조리 완료로 기록했어요. 사용한 양만큼 보관 수량을 줄였어요. 1가지는 이번 기록에서 제외했어요.");
  await expect(dialog).toHaveCount(0);
  // The skipped ingredient stays in the food list.
  await expect(page.locator(".inventory-row").filter({ hasText: "시금치" })).toContainText("1팩");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.getByRole("heading", { name: "내 식품 목록 6" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
});

test("meal consumption controls reflow and retain 44px targets on narrow phones", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: /오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 식단" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();

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
  await expect(meal.locator(".recipe-availability-summary strong")).toHaveText("재료 3가지를 준비해 주세요");
  await meal.getByRole("button", { name: "임시 저장", exact: true }).click();
  // The shortage shortcut now lives in the sheet instead of a toast action.
  await expect(meal.getByRole("button", { name: "장보기 목록에 담기", exact: true })).toBeVisible();
  await meal.getByRole("button", { name: "장보기 목록에 담기", exact: true }).click();
  const shopping = page.getByRole("dialog", { name: "장보기 목록" });
  const spinachPlanItem = shopping.getByRole("button", { name: "시금치 3팩, 식단 1개", exact: true });
  await expect(spinachPlanItem).toBeVisible();
  await shopping.getByRole("textbox", { name: "직접 추가 상품명" }).fill("시금치");
  await shopping.getByRole("spinbutton", { name: "직접 추가 수량" }).fill("1");
  await shopping.getByRole("textbox", { name: "직접 추가 단위" }).fill("팩");
  await shopping.getByRole("button", { name: "추가", exact: true }).click();
  const spinachItem = shopping.getByRole("button", { name: "시금치 4팩, 직접 추가, 식단 1개", exact: true });
  await expect(spinachItem).toBeVisible();
  await expect(shopping.locator(".shopping-sheet-item").filter({ hasText: "시금치" })).toHaveCount(1);

  await shopping.getByRole("textbox", { name: "직접 추가 상품명" }).fill("대파");
  await shopping.getByRole("button", { name: "추가", exact: true }).click();
  await expect(shopping.getByRole("button", { name: "대파 1개, 직접 추가", exact: true })).toBeVisible();

  // The toggle's accessible name adds the purchase state, so follow the same row by its item button.
  const spinachToggle = shopping.locator("button.shopping-sheet-item").filter({ hasText: "시금치" });
  await spinachToggle.click();
  await expect(spinachToggle).toHaveAttribute("aria-pressed", "true");
  await expect(spinachToggle).toHaveAccessibleName("시금치 계획 4팩, 직접 추가, 식단 1개, 구매 완료");
  await shopping.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(shopping).toHaveCount(0);
  await expect(meal).toBeVisible();
  await meal.getByRole("button", { name: "임시 저장", exact: true }).click();
  const addPlanShortagesAgain = meal.getByRole("button", { name: "장보기 목록에 담기", exact: true });
  await expect(addPlanShortagesAgain).toBeVisible();
  await addPlanShortagesAgain.click();
  const reloadedSpinachItem = shopping.locator("button.shopping-sheet-item").filter({ hasText: "시금치" });
  await expect(reloadedSpinachItem).toHaveAttribute("aria-pressed", "true");
  await expect(shopping.locator(".shopping-sheet-item").filter({ hasText: "시금치" })).toHaveCount(1);
  await reloadedSpinachItem.click();
  await expect(reloadedSpinachItem).toHaveAttribute("aria-pressed", "false");

  await shopping.getByRole("button", { name: "시금치 식품 목록에 추가", exact: true }).click();

  const receivePanel = shopping.getByRole("form", { name: "시금치 식품 목록에 추가" });
  await expect(receivePanel.getByRole("spinbutton", { name: "시금치 구매 수량" })).toHaveValue("4");
  await expect(receivePanel.getByRole("group", { name: "시금치 구매 완료 확인" })).toContainText("구매가 끝났나요?");
  await expect(receivePanel).toContainText("소비기한은 자동으로 정하지 않아요.");
  // Storage now has no default, and the commit stays disabled until both storage and purchase are confirmed.
  await expect(receivePanel.getByRole("button", { name: "보관 위치를 골라 주세요", exact: true })).toBeDisabled();
  await receivePanel.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(receivePanel.getByRole("button", { name: "식품 목록에 추가", exact: true })).toBeDisabled();
  await receivePanel.getByRole("button", { name: "구매 완료로 표시", exact: true }).click();
  await expect(receivePanel.getByRole("button", { name: "식품 목록에 추가", exact: true })).toBeEnabled();
  await receivePanel.getByRole("button", { name: "식품 목록에 추가", exact: true }).click();
  await expect(shopping.locator(".shopping-sheet-received")).toContainText("시금치 4팩 식품 목록에 추가했어요");
  await expect(shopping.locator(".shopping-sheet-received")).toContainText("포장지 날짜와 보관 방법을 살펴봐 주세요.");

  await shopping.getByRole("button", { name: "식품 보기", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail.locator(".detail-hero-copy p")).toHaveText("장보기");
  await expect(detail.locator(".detail-quantity-summary")).toHaveText("남은 4팩");
  await expect(detail.locator(".date-proof-card")).toHaveAttribute("data-date-state", "unknown");
  await expect(detail.locator(".date-proof-card")).toContainText("포장지 날짜 미확인");
  await expect(detail.locator(".food-provenance-card")).toContainText("장보기 목록에서 구매");
  // The separate review callout is gone for an undated food; the date card itself now carries the pre-cooking check.
  await expect(detail.locator(".date-review-callout")).toHaveCount(0);
  await expect(detail.locator(".date-proof-card small")).toHaveText("포장지 날짜를 아직 기록하지 않았어요.");
  await expect(detail.locator(".date-proof-card .detail-freshness-chip")).toHaveCount(0);
});

test("render failures show a recovery screen without exposing exception details", async ({ page }) => {
  await page.goto("/tests/runtime-error-fixture.html");

  await expect(page.getByRole("main", { name: "Rescue Meal 화면 오류" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "화면을 다시 열어 주세요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "화면 다시 열기" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("fixture-only render failure");
});

test("guest home can reopen the temporary shopping list and explains its lifetime", async ({ page }) => {
  // An empty shopping list no longer takes a home card; the bottom navigation reopens it.
  await expect(page.locator(".shopping-summary-card").filter({ hasText: "장보기" })).toHaveCount(0);
  const homeActionOrder = await page.evaluate(() => {
    const fridgeDoor = document.querySelector(".fridge-door");
    const mealAction = document.querySelector(".meal-plan-button");
    return Boolean(fridgeDoor && mealAction
      && (fridgeDoor.compareDocumentPosition(mealAction) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(homeActionOrder).toBe(true);
  const shoppingSummary = page.getByTestId("shopping-nav");
  await expect(shoppingSummary).toHaveAccessibleName("장보기");

  await shoppingSummary.click();
  const shopping = page.getByRole("dialog", { name: "장보기 목록" });
  await expect(shopping.locator(".shopping-sheet-preview-note")).toHaveText("미리보기 내용은 저장되지 않아요.");
  await expect(shopping.locator(".shopping-sheet-progress")).toHaveCount(0);
  await expect(shopping.getByRole("button", { name: /식단에서 재료 고르기/ })).toBeVisible();
  await expect(shopping.getByRole("button", { name: "직접 추가", exact: true })).toBeVisible();
  await expect(shopping.getByRole("button", { name: "새로 고침", exact: true })).toHaveCount(0);
  await expect(shopping.getByRole("textbox", { name: "직접 추가 상품명" })).toBeVisible();
  await shopping.getByRole("button", { name: "직접 추가", exact: true }).click();
  await expect(shopping.getByRole("textbox", { name: "직접 추가 상품명" })).toBeFocused();
});

test("past printed dates read as relative days and notification links open the food", async ({ page }) => {
  const spinachPriorityCard = page.locator(".priority-card").filter({ hasText: "시금치" });
  // The home chip shortens the passed day; its spoken label and the detail copy keep the relative wording.
  await expect(spinachPriorityCard.locator(".freshness-chip")).toHaveText("+1일");
  await expect(spinachPriorityCard.locator(".freshness-chip")).toHaveAttribute("aria-label", "표시 날짜에서 1일 지남");

  await page.goto("/?food=spinach-1");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("시금치");
  await expect(dialog).toContainText("표시 날짜가 어제 지났어요.");
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");

  await page.goto("/?open=priority");
  await expect(page.locator("#priority-title")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");

  await page.goto("/?food=missing-food");
  await expect(page.getByText("알림의 식품을 목록에서 찾지 못했어요. 이미 먹거나 정리했을 수 있어요.")).toBeVisible();

  // An external inventory sync push opens the notification center, where the sync record lives.
  await page.goto("/?open=grocy");
  await expect(page.getByRole("dialog", { name: "알림" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("");
});
