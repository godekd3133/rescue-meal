import { expect, test, type Locator, type Page } from "@playwright/test";

type NarrowViewportMetrics = {
  viewportWidth: number;
  bodyScrollWidth: number;
  documentScrollWidth: number;
  containers: Array<{ name: string; scrollWidth: number; clientWidth: number }>;
  outOfBounds: Array<{ tag: string; className: string; text: string; left: number; right: number }>;
};

async function readNarrowViewportMetrics(page: Page) {
  return page.evaluate((): NarrowViewportMetrics => {
    const viewportWidth = window.innerWidth;
    const containers = [
      ["body", document.body],
      ["document", document.documentElement],
      ["screen", document.querySelector<HTMLElement>("[data-phone-screen]")],
      ["viewport", document.querySelector<HTMLElement>("[data-testid=mobile-app-viewport]")],
      ["home", document.querySelector<HTMLElement>(".meal-home")],
    ]
      .filter((entry): entry is [string, HTMLElement] => entry[1] instanceof HTMLElement)
      .map(([name, element]) => ({ name, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    const outOfBounds = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select, [role=button]"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
          && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : "",
          text: (element.textContent ?? "").trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      });
    return {
      viewportWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      containers,
      outOfBounds,
    };
  });
}

async function assertDialogFitsNarrowViewport(page: Page, dialog: Locator) {
  const metrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const interactiveOutOfBounds = Array.from(element.querySelectorAll<HTMLElement>("button, input, textarea, select, [role=button]"))
      .filter((child) => {
        const style = getComputedStyle(child);
        const childRect = child.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && childRect.width > 0 && childRect.height > 0
          && (childRect.left < -1 || childRect.right > viewportWidth + 1);
      })
      .map((child) => (child.textContent ?? "").trim().slice(0, 80));
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      interactiveOutOfBounds,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(321);
  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.interactiveOutOfBounds).toEqual([]);
}

async function waitForSheetSettled(page: Page) {
  await page.waitForFunction(() => {
    const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]");
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    if (!sheet || !screen) return false;
    return Math.abs(sheet.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom) <= 0.25
      && getComputedStyle(sheet).transform === "none";
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
});

test("keeps the native home inside a 320px viewport", async ({ page }) => {
  const metrics = await readNarrowViewportMetrics(page);

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.containers.every((container) => container.scrollWidth <= container.clientWidth + 1)).toBeTruthy();
  expect(metrics.outOfBounds).toEqual([]);
  const compactMetadataFontSizes = await page.locator(".food-subline, .food-meta-line, .date-source").evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(compactMetadataFontSizes.length).toBeGreaterThan(0);
  expect(Math.min(...compactMetadataFontSizes)).toBeGreaterThanOrEqual(8);
  await expect(page.getByRole("button", { name: "식품 추가하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "지금 있는 재료로 식단 만들기" })).toBeVisible();
});

test("keeps a bottom sheet usable at 320px", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();

  await assertDialogFitsNarrowViewport(page, dialog);
  await expect(dialog.getByRole("button", { name: "샘플 영수증으로 시작" })).toBeVisible();
});

test("keeps camera permission recovery inside the 320px safe area", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); } },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "카메라로 촬영" }).click();
  const camera = page.getByRole("region", { name: "영수증 카메라 입력" });
  await expect(camera).toHaveAttribute("aria-live", "polite");
  await expect(camera).toHaveAttribute("aria-atomic", "true");
  await expect(camera.getByRole("button", { name: "사진에서 선택" })).toBeVisible();
  await expect(camera.getByRole("button", { name: "입력 방법 다시 보기" })).toBeVisible();

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const recoveryBox = await camera.boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(recoveryBox, "camera recovery region has no bounding box").toBeTruthy();
  expect(recoveryBox!.y).toBeGreaterThanOrEqual(screenBox!.y - 1);
  expect(recoveryBox!.y + recoveryBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("keeps native bottom-sheet keyboard focus contained", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "식품 추가하기" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

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

test("keeps the major native sheets inside a 320px viewport", async ({ page }) => {
  const openAndCheck = async (trigger: { name: string | RegExp }, dialogName: string | RegExp) => {
    const triggerButton = page.getByRole("button", trigger);
    await triggerButton.scrollIntoViewIfNeeded();
    await triggerButton.click();
    const dialog = page.getByRole("dialog", { name: dialogName });
    await expect(dialog).toBeVisible();
    await assertDialogFitsNarrowViewport(page, dialog);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  };

  await openAndCheck({ name: "지금 있는 재료로 식단 만들기" }, "오늘의 Rescue Meal");
  await openAndCheck({ name: /알림 확인/ }, "알림");
  await openAndCheck({ name: /연결 상태: 데모 모드/ }, "내 계정");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await assertDialogFitsNarrowViewport(page, detail);
});

test("keeps primary actions in bounds after a larger text preference", async ({ page }) => {
  const before = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    return { greeting: read(".greeting-block h1"), priorityHeading: read(".section-heading h2") };
  });
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const after = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
    };
    return { greeting: read(".greeting-block h1"), priorityHeading: read(".section-heading h2") };
  });

  expect(after.greeting).toBeGreaterThan(before.greeting);
  expect(after.priorityHeading).toBeGreaterThan(before.priorityHeading);

  const metrics = await readNarrowViewportMetrics(page);

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.outOfBounds).toEqual([]);
  const vertical = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    return { meal: rect(".meal-plan-button"), add: rect(".add-food-button"), nav: rect(".app-bottom-nav") };
  });
  expect(vertical.meal?.bottom).toBeLessThanOrEqual(vertical.nav?.top ?? Number.POSITIVE_INFINITY);
  expect(vertical.add?.bottom).toBeLessThanOrEqual(vertical.nav?.top ?? Number.POSITIVE_INFINITY);
});

test("keeps the compact safety guidance reachable after larger text scrolls", async ({ page }) => {
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const scroll = page.getByTestId("mobile-scroll");
  await scroll.evaluate((element) => { element.scrollTop = 20; });
  const layout = await page.evaluate(() => {
    const trust = document.querySelector<HTMLElement>(".trust-card")!;
    const nav = document.querySelector<HTMLElement>(".app-bottom-nav")!;
    return { trust: trust.getBoundingClientRect().toJSON(), nav: nav.getBoundingClientRect().toJSON() };
  });
  expect(layout.trust.top).toBeGreaterThanOrEqual(0);
  expect(layout.trust.bottom).toBeLessThanOrEqual(layout.nav.top);
});

test("settles sheet motion immediately when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(50);
  const layout = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]")!;
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    return { sheetBottom: sheet.getBoundingClientRect().bottom, screenBottom: screen.getBoundingClientRect().bottom };
  });
  expect(Math.abs(layout.sheetBottom - layout.screenBottom)).toBeLessThanOrEqual(1);
});

test("raises contrast tokens without changing native geometry", async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
  await page.reload();
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();

  const readback = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
    const home = document.querySelector<HTMLElement>(".meal-home")!;
    const add = document.querySelector<HTMLElement>(".add-food-button")!;
    return {
      contrast: window.matchMedia("(prefers-contrast: more)").matches,
      mutedColor: getComputedStyle(home).getPropertyValue("--atelier-muted").trim(),
      borderColor: getComputedStyle(home).getPropertyValue("--atelier-border-strong").trim(),
      screen: screen.getBoundingClientRect().toJSON(),
      add: add.getBoundingClientRect().toJSON(),
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    };
  });

  expect(readback.contrast).toBeTruthy();
  expect(readback.mutedColor).toBe("#b7c8bf");
  expect(readback.borderColor).toBe("rgba(235, 246, 238, 0.58)");
  expect(readback.screen.width).toBeCloseTo(320, 0);
  expect(readback.screen.height).toBeCloseTo(740, 0);
  expect(readback.add.height).toBeGreaterThanOrEqual(43.5);
  expect(readback.documentWidth).toBeLessThanOrEqual(320);
  expect(readback.bodyWidth).toBeLessThanOrEqual(320);
});

test("scales the major sheet reading hierarchy with a larger text preference", async ({ page }) => {
  await page.getByRole("button", { name: "지금 있는 재료로 식단 만들기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(mealDialog).toBeVisible();
  const mealBefore = await mealDialog.locator(".recipe-title-row h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const mealAfter = await mealDialog.locator(".recipe-title-row h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(mealAfter).toBeGreaterThan(mealBefore);
  await page.keyboard.press("Escape");
  await expect(mealDialog).toHaveCount(0);

  await page.addStyleTag({ content: "html { font-size: 100%; }" });
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detailDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(detailDialog).toBeVisible();
  const detailBefore = await detailDialog.locator(".detail-hero-copy h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  const detailAfter = await detailDialog.locator(".detail-hero-copy h3").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(detailAfter).toBeGreaterThan(detailBefore);

  await detailDialog.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);
  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const actionBox = await detailDialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(actionBox, "large-text detail actions have no bounding box").toBeTruthy();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("keeps primary controls at a 44px touch target", async ({ page }) => {
  const assertTarget = async (locator: Locator, label: string) => {
    await expect(locator, label).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${label} has no bounding box`).toBeTruthy();
    expect(box?.width, `${label} width`).toBeGreaterThanOrEqual(43.5);
    expect(box?.height, `${label} height`).toBeGreaterThanOrEqual(43.5);
  };

  await assertTarget(page.locator(".connection-pill"), "connection button");
  await assertTarget(page.locator(".scan-button"), "scan button");
  await assertTarget(page.locator(".notification-button"), "notification button");
  await assertTarget(page.getByRole("button", { name: "식품 추가하기" }), "add food button");

  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(intakeDialog).toBeVisible();
  await assertTarget(intakeDialog.locator(".mode-tab").first(), "intake mode tab");
  await page.keyboard.press("Escape");
  await expect(intakeDialog).toHaveCount(0);

  await page.getByRole("button", { name: "지금 있는 재료로 식단 만들기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(mealDialog).toBeVisible();
  await assertTarget(mealDialog.locator(".recipe-time-picker button").first(), "recipe time choice");
  await assertTarget(mealDialog.locator(".recipe-serving-picker button").first(), "recipe serving choice");
  await assertTarget(mealDialog.locator(".recipe-actions button").first(), "recipe action");
  await assertTarget(mealDialog.locator(".recipe-history-toggle"), "recipe history toggle");
  await page.keyboard.press("Escape");
  await expect(mealDialog).toHaveCount(0);

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detailDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(detailDialog).toBeVisible();
  await assertTarget(detailDialog.locator(".date-proof-card > button"), "date guidance button");
  await assertTarget(detailDialog.locator(".storage-option").first(), "storage choice");
  await assertTarget(detailDialog.locator(".toggle"), "opened state toggle");
  await assertTarget(detailDialog.locator(".danger-text-button"), "discard action");
  await page.keyboard.press("Escape");
  await expect(detailDialog).toHaveCount(0);

  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notificationDialog = page.getByRole("dialog", { name: "알림" });
  await expect(notificationDialog).toBeVisible();
  await assertTarget(notificationDialog.locator(".notification-read-all"), "mark all read button");
});

test("keeps the guest account primary action above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await page.getByRole("button", { name: /연결 상태: 데모 모드/ }).click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const loginBox = await dialog.locator('form.account-form button[type="submit"]').boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(loginBox, "guest account login action has no bounding box").toBeTruthy();
  expect(loginBox!.y + loginBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(loginBox!.height).toBeGreaterThanOrEqual(43.5);
});

test("keeps food detail actions above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const toggleBox = await dialog.locator(".toggle").boundingBox();
  const actionBox = await dialog.locator(".detail-actions").boundingBox();
  const discardBox = await dialog.locator(".danger-text-button").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(toggleBox, "food detail state control has no bounding box").toBeTruthy();
  expect(actionBox, "food detail primary actions have no bounding box").toBeTruthy();
  expect(discardBox, "food detail discard action has no bounding box").toBeTruthy();
  expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(43.5);
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
  expect(discardBox!.y + discardBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
});

test("keeps food detail primary actions above the safe area at 320px", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);

  const screenBox = await page.getByTestId("device-screen").boundingBox();
  const initialActionBox = await dialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(initialActionBox, "initial food detail primary actions have no bounding box").toBeTruthy();
  expect(initialActionBox!.y + initialActionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);

  const content = dialog.locator(".sheet-content");
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(80);

  const actionBox = await dialog.locator(".detail-actions").boundingBox();
  expect(screenBox, "native screen has no bounding box").toBeTruthy();
  expect(actionBox, "food detail primary actions have no bounding box").toBeTruthy();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 34);
});
