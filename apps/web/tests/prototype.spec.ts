import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Rescue Meal home opens detail and saves a storage change", async ({ page }) => {
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
  const eyebrowParts = new Intl.DateTimeFormat("ko-KR", { weekday: "long", month: "long", day: "numeric" }).formatToParts(new Date());
  const expectedEyebrow = `${eyebrowParts.find((part) => part.type === "weekday")?.value ?? "오늘"}, ${eyebrowParts.find((part) => part.type === "month")?.value ?? ""} ${eyebrowParts.find((part) => part.type === "day")?.value ?? ""}`;
  await expect(page.locator(".eyebrow")).toHaveText(expectedEyebrow);
  await expect(page.getByRole("heading", { name: "오늘 먼저 먹기 3" })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("데모 모드");
  await expect(page.locator(".priority-card").filter({ hasText: "시금치" }).locator(".date-source")).toHaveText("조리 전 날짜 확인");

  await page.getByRole("button", { name: /시금치 개봉됨/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
  await expect(dialog.locator(".date-review-callout")).toContainText("포장지·보관 상태·개봉 여부");
  await dialog.getByRole("button", { name: "냉동", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect(page.getByRole("status")).toHaveText("보관 상태를 저장했어요");
  await expect(page.getByRole("button", { name: /시금치 개봉됨 .* 냉동/ })).toBeVisible();
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
  await openAndAudit(".notification-button", "notifications", "알림");
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

  await page.getByRole("button", { name: "지금 있는 재료로 식단 만들기" }).click();
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
  await expect(loginTab).toHaveAttribute("aria-controls", "account-panel-login");
  await expect(dialog.locator("#account-panel-login")).toHaveAttribute("aria-labelledby", "account-tab-login");
  await loginTab.focus();
  await page.keyboard.press("ArrowRight");
  const registerTab = dialog.getByRole("tab", { name: "회원가입" });
  await expect(registerTab).toBeFocused();
  await expect(registerTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(loginTab).toBeFocused();
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await expect(dialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
  await expect(dialog.getByText(/게스트 기록은 계정에 자동 병합하지 않아요/)).toBeVisible();
});

test("notification center surfaces demo rescue items and opens food detail", async ({ page }) => {
  const trigger = page.getByRole("button", { name: /알림 확인/ });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByRole("heading", { name: /확인이 필요한 알림 3/ })).toBeVisible();
  await expect(dialog.getByText("오늘 먼저 확인할 식품이에요")).toBeVisible();

  await dialog.getByRole("button", { name: "오늘 먼저 확인할 식품이에요: 시금치" }).click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "알림" }).getByRole("heading", { name: /확인이 필요한 알림 2/ })).toBeVisible();
});

test("bottom sheets expose modal semantics and restore focus after closing", async ({ page }) => {
  const trigger = page.locator(".add-food-button");
  await expect(trigger).toHaveAccessibleName(/식품 추가하기/);

  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-labelledby");
  await expect(dialog).toHaveAttribute("aria-describedby");
  await expect(dialog.getByRole("heading", { name: "영수증으로 추가" })).toBeVisible();

  await page.keyboard.press("Escape");
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
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await expect(page.getByRole("button", { name: "3개 항목 반영하기" })).toBeVisible();

  await page.getByRole("button", { name: "맛타리버섯 2팩 · 3,980원 확인 필요" }).click();
  await expect(page.getByRole("button", { name: "2개 항목 반영하기" })).toBeVisible();
  await page.getByRole("button", { name: "2개 항목 반영하기" }).click();

  await expect(page.getByRole("status")).toHaveText("2개 항목을 검토 후 반영했어요");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row").filter({ hasText: "시금치" })).toContainText("확인 필요");
});

test("receipt review lets the user correct an OCR candidate before commit", async ({ page }) => {
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();

  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" })).toBeVisible();
  await expect(mushroomCard.getByText("OCR 원문: 맛타리버섯")).toBeVisible();

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
  await expect(preview).toContainText("PDF는 상품 line 위치를 자동으로 강조하지 않아요");
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

  await expect(page.getByText("유효년월일 2026.09.02")).toBeVisible();
  await expect(page.getByText("표시 후보")).toBeVisible();
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
  await editor.getByRole("button", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill(confirmedDateValue);
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  await expect(page.getByRole("status")).toHaveText("국산콩 두부 날짜를 사용자 확인으로 저장했어요");
  await expect(inventory.getByRole("button", { name: new RegExp(`국산콩 두부 풀무원 · 1모 ${confirmedDateLabel}`) })).toBeVisible();
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

test("inventory search finds food by name and recovers from no results", async ({ page }) => {
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const search = inventory.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });

  await search.fill("두부");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /국산콩 두부 풀무원/ })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /시금치 국내산/ })).toHaveCount(0);

  await search.fill("없는 식품");
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(inventory.locator(".inventory-empty-state")).toContainText("검색 결과가 없어요");
  await inventory.getByRole("button", { name: "검색 조건 초기화" }).click();
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
});

test("recipe sheet previews the pantry, saves a recipe, and records completion", async ({ page }) => {
  await page.getByRole("button", { name: /지금 있는 재료로 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });

  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.getByText("필요한 재료", { exact: true })).toBeVisible();
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

test("render failures show a recovery screen without exposing exception details", async ({ page }) => {
  await page.goto("/tests/runtime-error-fixture.html");

  await expect(page.getByRole("main", { name: "Rescue Meal 화면 오류" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "잠시 문제가 생겼어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시작하기" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("fixture-only render failure");
});
