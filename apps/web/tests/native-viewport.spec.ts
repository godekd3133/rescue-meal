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
  await expect(page.getByRole("button", { name: "확인하고 오늘 식단 만들기" })).toBeVisible();
});

test("keeps the primary home CTA above navigation on short native screens", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        navigation: rect(".app-bottom-nav"),
        status: rect(".rescue-status-card"),
        cta: rect(".meal-plan-button"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.status).toBeTruthy();
    expect(layout.cta).toBeTruthy();
    expect(layout.cta!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.cta!.height).toBeGreaterThanOrEqual(49);

    if (viewport.height <= 720) {
      expect(layout.status!.height).toBeLessThan(180);
    } else {
      expect(layout.status!.height).toBeGreaterThanOrEqual(180);
    }
  }
});

test("keeps the pantry below the initial mobile fold after the core home loop", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        navigation: rect(".app-bottom-nav"),
        trust: rect(".trust-card"),
        inventory: rect(".inventory-section"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.trust).toBeTruthy();
    expect(layout.inventory).toBeTruthy();
    expect(layout.inventory!.top).toBeGreaterThanOrEqual(layout.screen!.bottom - 1);
    expect(layout.inventory!.top).toBeGreaterThan(layout.navigation!.bottom - 1);
    expect(layout.inventory!.top - layout.trust!.bottom).toBeLessThan(190);
  }
});

test("keeps notification in the header on regular phones and reachable below it on narrow phones", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        header: rect(".app-header"),
        notification: rect(".mobile-hero-notification"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.header).toBeTruthy();
    expect(layout.notification).toBeTruthy();
    expect(layout.notification!.width).toBeGreaterThanOrEqual(43.5);
    expect(layout.notification!.height).toBeGreaterThanOrEqual(43.5);
    expect(layout.notification!.right).toBeLessThanOrEqual(layout.screen!.right + 1);
    expect(layout.notification!.left).toBeGreaterThanOrEqual(layout.screen!.left - 1);

    if (viewport.width >= 393) {
      expect(layout.notification!.top).toBeGreaterThanOrEqual(layout.header!.top - 1);
      // The visual header is compact, while the 44px hit box may extend a
      // small amount below it to preserve the touch-target baseline.
      expect(layout.notification!.bottom).toBeLessThanOrEqual(layout.header!.bottom + 12);
    } else {
      expect(layout.notification!.top).toBeGreaterThanOrEqual(layout.header!.bottom - 1);
    }
  }
});

test("shows the meal result inside the first native sheet viewport", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "확인하고 오늘 식단 만들기" }).click();
    const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);
    await expect(dialog.locator(".recipe-art")).toBeVisible();
    await expect(dialog.locator(".recipe-title-row")).toBeVisible();
    await expect(dialog.locator(".recipe-actions")).toHaveCSS("position", "sticky");
    const safetyEntry = dialog.getByRole("button", { name: "사용 전 확인 2건 보기" });
    const dateReviewAction = dialog.getByRole("button", { name: "식품 확인 · 시금치" });
    await expect(safetyEntry).toBeFocused();
    await safetyEntry.click();
    await expect(dateReviewAction).toBeFocused();

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      return {
        screen: rect("[data-testid=device-screen]"),
        sheet: rect("[data-testid=bottom-sheet]"),
        art: rect(".recipe-art"),
        title: rect(".recipe-title-row"),
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.sheet).toBeTruthy();
    expect(layout.art).toBeTruthy();
    expect(layout.title).toBeTruthy();
    expect(layout.sheet!.height / layout.screen!.height).toBeGreaterThanOrEqual(0.85);
    expect(layout.art!.top).toBeGreaterThanOrEqual(layout.sheet!.top - 1);
    expect(layout.title!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.title!.top).toBeLessThanOrEqual(layout.art!.top + 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("keeps the account login action in the first native sheet viewport", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /계정 열기/ }).click();
    const dialog = page.getByRole("dialog", { name: "내 계정" });
    await expect(dialog).toBeVisible();
    await waitForSheetSettled(page);

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const content = document.querySelector<HTMLElement>(".sheet-content");
      return {
        screen: rect("[data-testid=device-screen]"),
        sheet: rect("[data-testid=bottom-sheet]"),
        action: rect("#account-panel-login .primary-sheet-button"),
        contentScrollTop: content?.scrollTop ?? null,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.sheet).toBeTruthy();
    expect(layout.action).toBeTruthy();
    expect(layout.contentScrollTop).toBe(0);
    expect(layout.action!.top).toBeGreaterThanOrEqual(layout.sheet!.top - 1);
    expect(layout.action!.bottom).toBeLessThanOrEqual(layout.screen!.bottom - 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("reveals the completion action after saving a meal plan", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "확인하고 오늘 식단 만들기" }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog).toBeVisible();
  await waitForSheetSettled(page);
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();

  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  const completion = dialog.locator(".recipe-complete-actions");
  await expect(completion).toBeVisible();
  await expect(dialog.getByRole("button", { name: "조리 전 확인했어요" })).toBeFocused();
  await expect.poll(() => completion.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const actionBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await expect(dialog.getByRole("button", { name: /조리 전 확인 후 기록|조리 완료로 기록/ })).toBeVisible();
  await dialog.getByRole("button", { name: "조리 전 확인했어요" }).click();
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
});

test("keeps detail review and storage cues across light and dark themes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.removeItem("rescue-meal.theme"));

  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    if (theme === "dark") await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);

    await page.getByRole("button", { name: /국산콩 두부 풀무원/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
    await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
    await expect(dialog.locator(".detail-actions .primary-sheet-button")).toBeDisabled();
    const detailOrder = await dialog.locator(".detail-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
    expect(detailOrder.indexOf("date-edit-button")).toBeGreaterThan(detailOrder.indexOf("date-proof-card"));
    await dialog.getByRole("button", { name: "냉동", exact: true }).click();
    await expect(dialog.locator(".detail-section")).toHaveClass(/detail-section-pending/);
    await expect(dialog.locator(".detail-save-pending")).toBeVisible();
    await dialog.getByRole("button", { name: "닫기" }).click();
  }
});

test("keeps the pantry search surface stable across 320px and 393px native viewports", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const inventory = page.getByRole("region", { name: /내 식품 목록/ });
    await page.getByRole("button", { name: "식품", exact: true }).click();
    await expect.poll(() => inventory.evaluate((element) => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      if (!screen) return Number.POSITIVE_INFINITY;
      return Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top);
    })).toBeLessThanOrEqual(5);

    const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
    await search.fill("두부");
    await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
      const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]");
      const toolbar = document.querySelector<HTMLElement>(".inventory-toolbar");
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      const resultRows = Array.from(document.querySelectorAll<HTMLElement>(".inventory-row"));
      return {
        toolbar: rect(".inventory-toolbar"),
        navigation: navigation ? { ...navigation.getBoundingClientRect().toJSON(), visibility: getComputedStyle(navigation).visibility } : null,
        screen: rect("[data-testid=device-screen]"),
        scroll: rect("[data-testid=mobile-scroll]"),
        lastResultRow: resultRows.at(-1)?.getBoundingClientRect().toJSON() ?? null,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        keyboardVisible: document.querySelector<HTMLElement>(".mobile-page")?.dataset.keyboardVisible ?? "missing",
        toolbarPosition: toolbar ? getComputedStyle(toolbar).position : "missing",
        scrollTop: scroll?.scrollTop ?? -1,
      };
    });

    expect(layout.toolbarPosition).toBe("sticky");
    expect(layout.keyboardVisible).toBe("false");
    expect(layout.toolbar).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.screen).toBeTruthy();
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.visibility).toBe("visible");
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.lastResultRow).toBeTruthy();
    expect(layout.lastResultRow!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.bodyWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.scrollTop).toBeGreaterThan(0);
  }
});

test("keeps a direct add action available from the food tab", async ({ page }) => {
  await page.getByRole("button", { name: "식품", exact: true }).click();
  const addButton = page.locator(".inventory-add-button");
  await expect.poll(() => addButton.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")?.getBoundingClientRect();
    const navigation = document.querySelector<HTMLElement>(".app-bottom-nav")?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return Boolean(screen && navigation && rect.top >= screen.top - 1 && rect.bottom <= navigation.top + 1);
  }), { timeout: 2_000 }).toBe(true);

  const target = await addButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await addButton.click();
  await expect(page.getByRole("dialog", { name: "영수증으로 추가" })).toBeVisible();
});

test("keeps the pantry anchor at the top when a search has no results", async ({ page }) => {
  for (const viewport of [{ width: 393, height: 720 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const inventory = page.getByRole("region", { name: /내 식품 목록/ });
    await page.getByRole("button", { name: "식품", exact: true }).click();
    await expect.poll(() => inventory.evaluate((element) => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      if (!screen) return Number.POSITIVE_INFINITY;
      return Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top);
    })).toBeLessThanOrEqual(5);

    await inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" }).fill("없는 식품");
    await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const scroll = document.querySelector<HTMLElement>("[data-testid=mobile-scroll]");
      return {
        screen: rect("[data-testid=device-screen]"),
        inventory: rect(".inventory-section"),
        toolbar: rect(".inventory-toolbar"),
        empty: rect(".inventory-empty-state"),
        navigation: rect(".app-bottom-nav"),
        scrollTop: scroll?.scrollTop ?? -1,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.inventory).toBeTruthy();
    expect(layout.toolbar).toBeTruthy();
    expect(layout.empty).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.inventory!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.inventory!.top).toBeLessThanOrEqual(layout.screen!.top + 5);
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.empty!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.scrollTop).toBeGreaterThan(0);
  }
});

test("survives native viewport height changes while the pantry and detail are active", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect.poll(() => inventory.evaluate((element) => {
    const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
    if (!screen) return Number.POSITIVE_INFINITY;
    return Math.abs(element.getBoundingClientRect().top - screen.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(5);

  const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
  await search.fill("두부");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();

  for (const height of [740, 600, 852]) {
    await page.setViewportSize({ width: 393, height });
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      return screen?.getBoundingClientRect().height ?? 0;
    })).toBeCloseTo(height, 0);

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
      const navigation = document.querySelector<HTMLElement>(".app-bottom-nav");
      const resultRows = Array.from(document.querySelectorAll<HTMLElement>(".inventory-row"));
      return {
        screen: rect("[data-testid=device-screen]"),
        toolbar: rect(".inventory-toolbar"),
        search: rect(".inventory-search-input"),
        navigation: navigation ? { ...navigation.getBoundingClientRect().toJSON(), visibility: getComputedStyle(navigation).visibility } : null,
        lastResultRow: resultRows.at(-1)?.getBoundingClientRect().toJSON() ?? null,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      };
    });

    expect(layout.screen).toBeTruthy();
    expect(layout.toolbar).toBeTruthy();
    expect(layout.search).toBeTruthy();
    expect(layout.navigation).toBeTruthy();
    expect(layout.lastResultRow).toBeTruthy();
    expect(layout.toolbar!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.toolbar!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.search!.top).toBeGreaterThanOrEqual(layout.screen!.top - 1);
    expect(layout.search!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.lastResultRow!.bottom).toBeLessThanOrEqual(layout.navigation!.top + 1);
    expect(layout.navigation!.visibility).toBe("visible");
    expect(layout.navigation!.bottom).toBeLessThanOrEqual(layout.screen!.bottom + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(393);
    expect(layout.bodyWidth).toBeLessThanOrEqual(393);
  }

  await page.setViewportSize({ width: 393, height: 600 });
  await inventory.getByRole("button", { name: /국산콩 두부/ }).click();
  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".detail-actions")).not.toHaveClass(/detail-actions-stuck/);

  for (const height of [600, 852]) {
    await page.setViewportSize({ width: 393, height });
    await expect.poll(() => page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]");
      const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]");
      if (!screen || !sheet) return Number.POSITIVE_INFINITY;
      return Math.abs(sheet.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom);
    })).toBeLessThanOrEqual(1);

    const sheetLayout = await page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>("[data-testid=device-screen]")!;
      const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]")!;
      const content = document.querySelector<HTMLElement>(".sheet-content");
      return {
        screen: screen.getBoundingClientRect().toJSON(),
        sheet: sheet.getBoundingClientRect().toJSON(),
        sheetScrollWidth: content?.scrollWidth ?? 0,
        sheetClientWidth: content?.clientWidth ?? 0,
        detailActionPosition: document.querySelector<HTMLElement>(".detail-actions") ? getComputedStyle(document.querySelector<HTMLElement>(".detail-actions")!).position : "missing",
      };
    });
    expect(sheetLayout.sheet.top).toBeGreaterThanOrEqual(sheetLayout.screen.top - 1);
    expect(sheetLayout.sheet.bottom).toBeLessThanOrEqual(sheetLayout.screen.bottom + 1);
    expect(sheetLayout.sheetScrollWidth).toBeLessThanOrEqual(sheetLayout.sheetClientWidth + 1);
    expect(sheetLayout.detailActionPosition).toBe("sticky");

    await detail.locator(".sheet-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(40);
    const detailActionBox = await detail.locator(".detail-actions").boundingBox();
    expect(detailActionBox, `detail actions have no bounding box at ${height}px`).toBeTruthy();
    expect(detailActionBox!.y + detailActionBox!.height).toBeLessThanOrEqual(sheetLayout.screen.bottom - 34);
  }
});

test("elevates food detail actions only after scrolling past their normal position", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail).toBeVisible();
  await waitForSheetSettled(page);

  const actions = detail.locator(".detail-actions");
  const content = detail.locator(".sheet-content");
  await expect(actions).not.toHaveClass(/detail-actions-stuck/);
  await page.addStyleTag({ content: ".detail-sheet-content::after { content: \"\"; display: block; min-height: 900px; }" });
  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);
  await expect(actions).toHaveClass(/detail-actions-stuck/);
  await expect(actions).toHaveClass(/detail-actions-scroll-down/);

  await content.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 120);
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(50);
  await expect(actions).toHaveClass(/detail-actions-stuck/);
  await expect(actions).toHaveClass(/detail-actions-scroll-up/);
  await expect(actions).not.toHaveClass(/detail-actions-scroll-down/);

  await content.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(actions).not.toHaveClass(/detail-actions-stuck/);
  await expect(actions).not.toHaveClass(/detail-actions-scroll-up/);
});

test("keeps a bottom sheet usable at 320px", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();

  await assertDialogFitsNarrowViewport(page, dialog);
  await expect(dialog.getByRole("button", { name: "샘플 영수증으로 시작" })).toBeVisible();
});

test("keeps the manual-food action reachable after entering a name", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await intakeDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("김치");

  const submit = dialog.getByRole("button", { name: "식품 추가하기", exact: true });
  await expect(submit).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.manual-submit-bar .manual-submit');
    const sheet = document.querySelector<HTMLElement>('.bottom-sheet');
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]');
    if (!action || !sheet || !screen) return false;
    const actionBox = action.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    const screenBox = screen.getBoundingClientRect();
    return actionBox.top >= sheetBox.top && actionBox.bottom <= screenBox.bottom + 1;
  })).toBe(true);

  await dialog.locator(".sheet-content").evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.manual-submit-bar .manual-submit');
    const sheet = document.querySelector<HTMLElement>('.bottom-sheet');
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]');
    if (!action || !sheet || !screen) return false;
    const actionBox = action.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    const screenBox = screen.getBoundingClientRect();
    return actionBox.top >= sheetBox.top && actionBox.bottom <= screenBox.bottom + 1;
  })).toBe(true);
});

test("keeps the active receipt editor clear of the sticky commit action", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const mushroomCard = dialog.locator(".receipt-line-card").filter({ hasText: "맛타리버섯" });
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" }).click();
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" }).click();
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);

  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const criticalControls = [
      '.receipt-line-card-editing input[aria-label="상품명"]',
      '.receipt-line-card-editing input[aria-label="수량"]',
      '.receipt-line-card-editing input[aria-label="단위"]',
      ".receipt-line-card-editing .receipt-line-storage-field",
    ]
      .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect));
    const content = document.querySelector<HTMLElement>(".sheet-content");
    if (!bar || !content || criticalControls.length !== 4) return Number.POSITIVE_INFINITY;
    const contentTop = content.getBoundingClientRect().top;
    return criticalControls.reduce((total, rect) => total + Math.max(0, Math.min(bar.bottom, rect.bottom) - Math.max(bar.top, Math.max(contentTop, rect.top))), 0);
  }), { timeout: 2_500 }).toBe(0);
});

test("keeps the label confirmation action reachable after recognition", async ({ page }) => {
  await page.getByRole("button", { name: "식품 추가하기" }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.getByRole("button", { name: "샘플 라벨 인식" }).click();

  const action = dialog.getByRole("button", { name: "확인 후 반영" });
  await expect(action).toBeVisible();
  await expect(action).toBeFocused();
  await expect.poll(async () => {
    const screenBox = await page.getByTestId("device-screen").boundingBox();
    const actionBox = await action.boundingBox();
    return Boolean(screenBox && actionBox && actionBox.y >= screenBox.y && actionBox.y + actionBox.height <= screenBox.y + screenBox.height - 34 && actionBox.height >= 43.5);
  }, { timeout: 2_500 }).toBe(true);
  const order = await dialog.locator(".label-result-card").evaluate((card) => {
    const actionBar = card.parentElement?.querySelector(".label-result-action-bar");
    return Boolean(actionBar && (card.compareDocumentPosition(actionBar) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toBe(true);
});

test("opens the explicit receipt source review fixture and follows a source box to its line", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 원본 대조" });
  await expect(dialog).toBeVisible();
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(sourcePreview).toBeVisible();
  await expect(sourcePreview).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const readingOrder = await dialog.evaluate((element) => {
    const source = element.querySelector<HTMLElement>(".receipt-source-preview");
    const lines = Array.from(element.querySelectorAll<HTMLElement>(".receipt-line-card"));
    const submit = element.querySelector<HTMLElement>(".receipt-review-submit-bar");
    const footnote = element.querySelector<HTMLElement>(".sheet-footnote");
    if (!source || !lines.length || !submit || !footnote) return null;
    const follows = (before: Node, after: Node) => Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      sourceBeforeLines: lines.every((line) => follows(source, line)),
      linesBeforeSubmit: lines.every((line) => follows(line, submit)),
      submitBeforeFootnote: follows(submit, footnote),
    };
  });
  expect(readingOrder).toEqual({ sourceBeforeLines: true, linesBeforeSubmit: true, submitBeforeFootnote: true });
  const spinachCardForOrder = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  const spinachActions = await spinachCardForOrder.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(spinachActions).toEqual([
    "국내산 시금치 1팩 · 2,980원",
    "국내산 시금치 원본 위치 보기",
    "국내산 시금치 항목 수정",
  ]);
  await expect(spinachCardForOrder.locator(".receipt-line-toggle")).toHaveAttribute("aria-describedby", "receipt-line-status-receipt-spinach");
  await expect(spinachCardForOrder).toContainText("자동 인식 신뢰도 96%");
  await expect(sourcePreview.getByRole("button", { name: "국내산 시금치 원본 위치 선택" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "국산콩 두부 원본 위치 선택" })).toBeVisible();
  await expect(sourcePreview.getByRole("button", { name: "맛타리버섯 원본 위치 선택" })).toBeVisible();
  await expect(sourcePreview).toContainText("현재 항목 · 맛타리버섯");
  await expect(sourcePreview.locator(".receipt-source-hit-target").first()).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const lineSourceButtons = dialog.getByRole("button", { name: /원본 위치 보기$/ });
  await expect(lineSourceButtons).toHaveCount(3);
  await expect(lineSourceButtons.first()).toHaveAttribute("aria-describedby", "receipt-source-preview-hint");
  const hitTargets = await sourcePreview.locator(".receipt-source-hit-target").evaluateAll((elements) => elements.map((element) => {
    return { width: element.offsetWidth, height: element.offsetHeight };
  }));
  expect(hitTargets).toHaveLength(3);
  expect(hitTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  const sourceFrame = await sourcePreview.locator(".receipt-source-preview-frame").boundingBox();
  expect(sourceFrame).toBeTruthy();
  expect(sourceFrame!.x).toBeGreaterThanOrEqual(0);
  expect(sourceFrame!.x + sourceFrame!.width).toBeLessThanOrEqual(321);
  await expect.poll(() => sourcePreview.locator(".receipt-source-preview-frame").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(238, 241, 235)");
  await sourcePreview.getByRole("button", { name: "원본 확대" }).click();
  await expect(sourcePreview.getByRole("button", { name: "원본 축소" })).toHaveAttribute("aria-pressed", "true");
  const zoomedFrame = await sourcePreview.locator(".receipt-source-preview-frame").boundingBox();
  expect(zoomedFrame).toBeTruthy();
  expect(zoomedFrame!.height).toBeGreaterThan(sourceFrame!.height);
  await expect.poll(() => page.evaluate(() => {
    const submit = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const activeBoxes = Array.from(document.querySelectorAll<HTMLElement>(".receipt-source-box-active"), (element) => element.getBoundingClientRect());
    return Boolean(submit && activeBoxes.length && activeBoxes.every((box) => box.bottom <= submit.top + 1));
  })).toBe(true);

  await sourcePreview.locator(".receipt-source-preview-overlay").click({ position: { x: zoomedFrame!.width * 0.505, y: zoomedFrame!.height * 0.254 } });
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "국내산 시금치 항목 수정 닫기" })).toBeVisible();
  await expect(spinachCard.getByRole("group", { name: "국내산 시금치 보관 위치" })).toHaveAttribute("aria-describedby", "receipt-storage-hint-receipt-spinach");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "영수증 원본 대조 다시 열기" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "영수증 원본 대조" });
  await expect(reopenedDialog).toBeVisible();
  await expect(reopenedDialog.getByRole("region", { name: "영수증 원본 미리보기" })).toBeVisible();
});

test("keeps the source review fixture legible in dark mode", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("rescue-meal.theme", "dark"));
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 원본 대조" });
  await expect(dialog).toBeVisible();
  const colors = await dialog.evaluate((element) => {
    const frame = element.querySelector<HTMLElement>(".receipt-source-preview-frame");
    const activeBox = element.querySelector<HTMLElement>(".receipt-source-box-active");
    const submit = element.querySelector<HTMLElement>(".receipt-review-submit-bar .primary-sheet-button");
    return {
      theme: document.documentElement.dataset.rescueTheme,
      frameBackground: frame ? getComputedStyle(frame).backgroundColor : "",
      activeBorder: activeBox ? getComputedStyle(activeBox).borderTopColor : "",
      submitBackground: submit ? getComputedStyle(submit).backgroundColor : "",
    };
  });
  expect(colors.theme).toBe("dark");
  expect(colors.frameBackground).toBe("rgb(18, 26, 34)");
  expect(colors.activeBorder).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.submitBackground).not.toBe("rgba(0, 0, 0, 0)");
  await expect(dialog.getByRole("button", { name: "3개 항목 반영하기" })).toBeVisible();
});

test("keeps the receipt source frame contained across narrow native widths", async ({ page }) => {
  const measurements = [] as Array<{ width: number; height: number; sheetWidth: number; previewWidth: number }>;
  for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/?review=1&receipt_source_review=1&viewport=${viewport.width}`);
    const dialog = page.getByRole("dialog", { name: "영수증 원본 대조" });
    await expect(dialog).toBeVisible();
    const metrics = await dialog.evaluate((element) => {
      const sheet = element.querySelector<HTMLElement>(".sheet-content")?.getBoundingClientRect();
      const preview = element.querySelector<HTMLElement>(".receipt-source-preview")?.getBoundingClientRect();
      const frame = element.querySelector<HTMLElement>(".receipt-source-preview-frame")?.getBoundingClientRect();
      if (!sheet || !preview || !frame) return null;
      return { width: frame.width, height: frame.height, sheetWidth: sheet.width, previewWidth: preview.width };
    });
    expect(metrics).toBeTruthy();
    measurements.push(metrics!);
    expect(metrics!.width).toBeGreaterThan(150);
    expect(metrics!.height).toBeLessThanOrEqual(243);
    expect(metrics!.width).toBeLessThanOrEqual(metrics!.sheetWidth - 20);
    expect(metrics!.previewWidth).toBeLessThanOrEqual(metrics!.sheetWidth + 1);
  }
  expect(measurements[1].width).toBe(measurements[0].width);
  expect(measurements[1].height).toBeCloseTo(measurements[0].height, 1);
});

test("keeps source review keyboard focus ordered through zoom and line correction", async ({ page }) => {
  await page.goto("/?review=1&receipt_source_review=1");
  const dialog = page.getByRole("dialog", { name: "영수증 원본 대조" });
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(sourcePreview.locator(".receipt-source-preview-heading small")).toHaveAttribute("aria-live", "polite");
  const zoomButton = sourcePreview.getByRole("button", { name: "원본 확대" });
  const spinachSourceButton = sourcePreview.getByRole("button", { name: "국내산 시금치 원본 위치 선택" });

  const focusByTab = async (locator: Locator) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await locator.evaluate((element) => document.activeElement === element)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error("keyboard focus target was not reached");
  };

  await dialog.getByRole("button", { name: "닫기", exact: true }).focus();
  await focusByTab(zoomButton);
  await expect(zoomButton).toBeFocused();
  await expect.poll(() => zoomButton.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(sourcePreview.getByRole("button", { name: "원본 축소" })).toBeFocused();

  await focusByTab(spinachSourceButton);
  await expect(spinachSourceButton).toBeFocused();
  await expect.poll(() => spinachSourceButton.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(sourcePreview).toContainText("현재 항목 · 국내산 시금치");
  const spinachCard = dialog.locator('.receipt-line-card[data-line-id="receipt-spinach"]');
  await expect(spinachCard).toHaveClass(/receipt-line-card-editing/);
  await expect(spinachCard.getByRole("button", { name: "국내산 시금치 항목 수정 닫기" })).toBeVisible();
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

  await openAndCheck({ name: "확인하고 오늘 식단 만들기" }, "오늘의 Rescue Meal");
  await openAndCheck({ name: /알림 확인/ }, "알림");
  await openAndCheck({ name: /연결 상태: 게스트 기록/ }, "내 계정");

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
  expect(readback.mutedColor).toBe("#4e5968");
  expect(readback.borderColor).toBe("rgba(2, 32, 71, 0.38)");
  expect(readback.screen.width).toBeCloseTo(320, 0);
  expect(readback.screen.height).toBeCloseTo(740, 0);
  expect(readback.add.height).toBeGreaterThanOrEqual(43.5);
  expect(readback.documentWidth).toBeLessThanOrEqual(320);
  expect(readback.bodyWidth).toBeLessThanOrEqual(320);
});

test("scales the major sheet reading hierarchy with a larger text preference", async ({ page }) => {
  await page.getByRole("button", { name: "확인하고 오늘 식단 만들기" }).click();
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
  await assertTarget(page.locator(".mobile-hero-notification"), "notification button");
  await assertTarget(page.getByRole("button", { name: "식품 추가하기" }), "add food button");

  await page.getByRole("button", { name: "식품 추가하기" }).click();
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(intakeDialog).toBeVisible();
  await assertTarget(intakeDialog.locator(".mode-tab").first(), "intake mode tab");
  await assertTarget(intakeDialog.getByRole("button", { name: "닫기", exact: true }), "sheet close button");
  await page.keyboard.press("Escape");
  await expect(intakeDialog).toHaveCount(0);

  await page.getByRole("button", { name: "확인하고 오늘 식단 만들기" }).click();
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
  await detailDialog.getByRole("button", { name: "날짜 기준 자세히 보기" }).click();
  const guidanceDialog = page.getByRole("dialog", { name: "날짜를 읽는 방법" });
  await expect(guidanceDialog).toBeVisible();
  await guidanceDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(guidanceDialog).toHaveCount(0);
  await expect(detailDialog).toBeVisible();
  await assertTarget(detailDialog.locator(".storage-option").first(), "storage choice");
  await assertTarget(detailDialog.locator(".toggle"), "opened state toggle");
  await assertTarget(detailDialog.locator(".danger-text-button"), "discard action");
  await page.keyboard.press("Escape");
  await expect(detailDialog).toHaveCount(0);

  await page.locator(".mobile-hero-notification").click();
  const notificationDialog = page.getByRole("dialog", { name: "알림" });
  await expect(notificationDialog).toBeVisible();
  await assertTarget(notificationDialog.locator(".notification-read-all"), "mark all read button");
});

test("keeps the guest account primary action above the iPhone home indicator", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  await page.getByRole("button", { name: /연결 상태: 게스트 기록/ }).click();
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

test("places detail primary actions directly after safety guidance", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".detail-actions")).toBeVisible();
  await expect(dialog.locator(".detail-actions .secondary-sheet-button")).toContainText("먹었어요");
  const followsSafetyGuidance = await dialog.locator(".date-review-callout").evaluate((node) => {
    const actions = node.parentElement?.querySelector(".detail-actions");
    return Boolean(actions && (node.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(followsSafetyGuidance).toBe(true);
});

test("routes a review-required priority card to the date recheck action", async ({ page }) => {
  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  const dateReviewAction = dialog.getByRole("button", { name: "포장지에서 날짜 다시 확인" });

  await expect(dialog.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
  await expect(dateReviewAction).toHaveText("날짜 다시 확인");
  await expect(dateReviewAction).toBeFocused();
});

test("routes a use-next priority card to the consume action", async ({ page }) => {
  await page.getByRole("button", { name: /국산콩 두부 풀무원/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });

  await expect(dialog.getByRole("button", { name: "먹었어요", exact: true })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
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
