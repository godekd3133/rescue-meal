import { expect, test } from "@playwright/test";

function textPdf(lines: string[]): Buffer {
  const content = ["BT", "/F1 11 Tf", "72 720 Td", ...lines.flatMap((line, index) => {
    const escaped = line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
    return [index ? "0 -18 Td" : "", `(${escaped}) Tj`].filter(Boolean);
  }), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function waitForSheetSettled(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-testid=bottom-sheet]");
    if (!sheet) return false;
    const transform = getComputedStyle(sheet).transform;
    if (transform === "none") return true;
    const matrix = transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number);
    return Boolean(matrix && matrix.length === 6
      && Math.abs(matrix[0] - 1) <= 0.001
      && Math.abs(matrix[1]) <= 0.001
      && Math.abs(matrix[2]) <= 0.001
      && Math.abs(matrix[3] - 1) <= 0.001
      && Math.abs(matrix[4]) <= 0.25
      && Math.abs(matrix[5]) <= 0.25);
  })).toBe(true);
}

test("connected empty workspace gives the user a clear first action", async ({ page }) => {
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-03T00:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }),
    });
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "오늘 먼저 확인할 식품 0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(page.locator(".priority-empty-state")).toContainText("아직 식품을 등록하지 않았어요");
  await expect(page.locator(".inventory-empty-state")).toContainText("아직 등록된 식품이 없어요");
  await expect(page.locator(".rescue-status-legend")).toContainText("첫 식품을 추가하면 우선순위를 만들어요");
  await expect(page.getByRole("button", { name: "첫 식품을 추가하고 시작하기" })).toBeVisible();
  const emptyStatusCard = page.getByRole("button", { name: "아직 식품이 없어요, 식품 추가" });
  await expect(emptyStatusCard).toContainText("식품을 추가해 주세요");
  await expect(emptyStatusCard).toContainText("첫 식품을 추가하면 오늘 먼저 확인할 순서를 만들어요.");
  await emptyStatusCard.click();
  await expect(page.getByRole("dialog", { name: "영수증으로 추가" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "첫 식품을 추가하고 시작하기" }).click();
  await expect(page.getByRole("dialog", { name: "영수증으로 추가" })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "식단", exact: true }).click();
  const emptyMealDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(emptyMealDialog.getByRole("group", { name: "조리 가능 시간" })).toHaveCount(0);
  await expect(emptyMealDialog.getByRole("group", { name: "식사 인원" })).toHaveCount(0);
  await expect(emptyMealDialog.getByRole("button", { name: "식품 추가하기" })).toBeVisible();
  await emptyMealDialog.getByRole("button", { name: "식품 추가하기" }).click();
  await expect(page.getByRole("dialog", { name: "영수증으로 추가" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("홈");
});

test("connected empty workspace promotes the first saved food into the Home queue", async ({ page }) => {
  let inventory: Record<string, unknown>[] = [];
  let notificationCalls = 0;
  let shoppingCalls = 0;
  let receiptCalls = 0;
  const dashboard = () => ({ generated_at: "2026-09-18T09:00:00Z", food_count: inventory.length, rescue_count: inventory.length, rescue_queue: inventory, inventory, storage_locations: [] });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard()) });
  });
  await page.route("**/api/foods", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const food = { id: "empty-first-food", canonical_name: "대파", display_name: "대파", brand: "사용자 입력", quantity: 1, unit: "개", storage_type: "refrigerated", storage_location_id: null, opened: false, opened_at: null, date_assertion: { kind: "unknown", value: null, display_label: "확인 필요", source: "unknown", source_detail: "사용자 입력", confidence: 1, user_confirmed: false, applicable_storage_type: null, storage_condition_text: null }, estimated_use_first_window: null, priority: 1, category: "채소", image_path: "/assets/food/tomato.png", note: "확인 필요" };
    inventory = [food];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(food) });
  });
  await page.route("**/api/notifications*", async (route) => { notificationCalls += 1; await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/shopping-list", async (route) => { shoppingCalls += 1; await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/receipts", async (route) => { receiptCalls += 1; await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "첫 식품을 추가하고 시작하기" })).toBeVisible();
  await page.getByRole("button", { name: "첫 식품을 추가하고 시작하기" }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await manualDialog.getByRole("textbox", { name: "식품 이름" }).fill("대파");
  await manualDialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect(page.getByRole("status")).toContainText("대파를 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 확인");
  await expect(page.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인하고 오늘 식단 만들기" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "대파" })).toBeFocused();
  await expect.poll(() => notificationCalls).toBeGreaterThan(0);
  await expect.poll(() => shoppingCalls).toBeGreaterThan(0);
  await expect.poll(() => receiptCalls).toBeGreaterThan(0);
});

test("connected planner exposes a retry action after preview calculation failure", async ({ page }) => {
  let previewAttempts = 0;
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    previewAttempts += 1;
    if (previewAttempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary planner failure" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  const error = dialog.getByRole("alert");
  await expect(error).toContainText("현재 재료로 식단을 계산하지 못했어요");
  await expect(error.getByRole("button", { name: "다시 계산" })).toBeVisible();
  await expect.poll(() => previewAttempts).toBe(1);

  await error.getByRole("button", { name: "다시 계산" }).click();
  await expect.poll(() => previewAttempts).toBe(2);
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
});

test("connected planner explains the recovery path when no recipe matches", async ({ page }) => {
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    await route.fulfill({
      status: response.status(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, recipe_id: "no-match", title: null, reason: null, ingredients: [], missing_ingredients: [], matched_ratio: 0 }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByText("재료를 더 추가하거나 조리 조건을 바꿔 다시 계산해 보세요.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "식품 더 추가하기" })).toBeVisible();
  await dialog.getByRole("button", { name: "식품 더 추가하기" }).click();
  await expect(page.getByRole("dialog", { name: "영수증으로 추가" })).toBeVisible();
});

test("connected planner retries an alternative-menu lookup without closing the section", async ({ page }) => {
  let optionsAttempts = 0;
  await page.route("**/api/meal-plans/options", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    optionsAttempts += 1;
    if (optionsAttempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary alternatives failure" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await dialog.getByRole("button", { name: "다른 메뉴 찾아보기" }).click();
  const alternatives = dialog.getByRole("region", { name: "다른 메뉴" });
  await expect(alternatives.getByRole("alert")).toContainText("다른 메뉴를 불러오지 못했어요");
  await expect(alternatives.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await alternatives.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => optionsAttempts).toBe(2);
  await expect(alternatives.getByRole("listitem")).toHaveCount(2);
});

test("connected planner retries a multi-day preview without closing the section", async ({ page }) => {
  let previewAttempts = 0;
  await page.route("**/api/meal-plans/multi-day-preview", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    previewAttempts += 1;
    if (previewAttempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary multi-day failure" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await dialog.getByRole("button", { name: "3일 식단 미리보기" }).click();
  const multiDay = dialog.getByRole("region", { name: "3일 식단" });
  await expect(multiDay.getByRole("alert")).toContainText("3일 식단을 계산하지 못했어요");
  await expect(multiDay.getByRole("button", { name: "다시 계산" })).toBeVisible();
  await multiDay.getByRole("button", { name: "다시 계산" }).click();
  await expect.poll(() => previewAttempts).toBe(2);
  await expect(multiDay.getByRole("listitem")).toHaveCount(3);
});

test("connected planner retries multi-day history without closing the section", async ({ page }) => {
  let historyAttempts = 0;
  await page.route("**/api/meal-plans/multi-day/history**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    historyAttempts += 1;
    if (historyAttempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary multi-day history failure" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await dialog.getByRole("button", { name: "저장한 3일 식단 보기", exact: true }).click();
  const history = dialog.getByRole("region", { name: "저장한 3일 식단" });
  await expect(history.getByRole("alert")).toContainText("저장한 3일 식단을 불러오지 못했어요");
  await expect(history.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await history.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => historyAttempts).toBe(2);
  await expect(history).toContainText("저장한 3일 식단이 아직 없어요");
});

test("connected home refreshes after a cross-device dashboard revision", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let dashboardCalls = 0;
  let revisionCalls = 0;
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/dashboard*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/dashboard/revision") {
      revisionCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
      return;
    }
    dashboardCalls += 1;
    const upstream = await route.fetch();
    const payload = await upstream.json() as Record<string, unknown>;
    const rename = (items: unknown) => Array.isArray(items)
      ? items.map((item, index) => index === 0 && item && typeof item === "object"
        ? { ...(item as Record<string, unknown>), display_name: remoteChanged ? "다른 기기 식품" : "현재 기기 식품", canonical_name: remoteChanged ? "다른 기기 식품" : "현재 기기 식품" }
        : item)
      : items;
    payload.inventory = rename(payload.inventory);
    payload.rescue_queue = rename(payload.rescue_queue);
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify(payload) });
  });
  await page.route("**/api/dashboard/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByText("현재 기기 식품", { exact: true }).first()).toBeVisible();
  const baselineDashboardCalls = dashboardCalls;
  const baselineRevisionCalls = revisionCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  await expect.poll(() => dashboardCalls).toBeGreaterThan(baselineDashboardCalls);
  await expect(page.getByText("다른 기기 식품", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".toast").filter({ hasText: "다른 기기에서 재고가 바뀌어 최신 목록을 불러왔어요" })).toBeVisible();
});

test("connected inventory search refreshes after a cross-device dashboard revision", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let searchCalls = 0;
  let revisionCalls = 0;
  const now = "2026-09-09T09:00:00Z";
  const initialFood = {
    id: "cross-device-search-food",
    canonical_name: "검색 현재 식품",
    display_name: "검색 현재 식품",
    brand: "검색 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "검색 revision fixture",
      confidence: 0.5,
      user_confirmed: false,
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "검색 테스트",
    image_path: "/assets/food/tomato.png",
    note: "검색 revision fixture",
  };
  const remoteFood = { ...initialFood, canonical_name: "검색 최신 식품", display_name: "검색 최신 식품" };
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify({ generated_at: now, food_count: 1, rescue_count: 1, rescue_queue: [remoteChanged ? remoteFood : initialFood], inventory: [remoteChanged ? remoteFood : initialFood] }),
    });
  });
  await page.route("**/api/dashboard/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
  });
  await page.route("**/api/inventory/search*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    searchCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify({ items: [remoteChanged ? remoteFood : initialFood], total: 1, offset: 0, limit: 40, has_more: false, query: "검색", storage_type: "refrigerated", storage_location_id: null }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const search = page.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" });
  await search.fill("검색");
  await expect(page.getByText("검색 현재 식품", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(250);
  const baselineSearchCalls = searchCalls;
  const baselineRevisionCalls = revisionCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  await expect.poll(() => searchCalls).toBeGreaterThan(baselineSearchCalls);
  await expect(page.getByText("검색 최신 식품", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("검색 현재 식품", { exact: true }).first()).toHaveCount(0);
});

test("connected home lets the user resume a stored receipt review draft", async ({ page }) => {
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "receipt-resume-e2e",
        status: "review_required",
        purchased_at: "2026-09-05T12:30:00Z",
        merchant_name: "동네마트",
        stock_created: false,
        line_count: 1,
        source_redacted: false,
      }]),
    });
  });
  await page.route("**/api/receipts/receipt-resume-e2e", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "receipt-resume-e2e",
        fingerprint: "receipt-resume-fingerprint",
        status: "review_required",
        source_filename: "receipt-2026-09-05.jpg",
        purchased_at: "2026-09-05T12:30:00Z",
        template_id: "grocery-mart-v1",
        template_confidence: 0.91,
        merchant_name: "동네마트",
        lines: [{
          id: "line-resume-1",
          raw_name: "국산콩 두부",
          barcode: null,
          canonical_name: "국산콩 두부",
          quantity: 1,
          unit: "모",
          storage_suggestion: "refrigerated",
          unit_price: 2980,
          total_price: 2980,
          line_type: "product",
          match_confidence: 0.82,
          review_status: "pending",
          review_reason: "상품명을 확인해 주세요.",
          match_source: "parser",
          source_observation_ids: [],
          match_candidates: [],
        }],
        stock_created: false,
      }),
    });
  });
  await page.goto("/");
  const entry = page.getByTestId("pending-receipt-review");
  await expect(entry).toContainText("동네마트");
  await expect(entry).toContainText("검수할 영수증 1건");
  await entry.click();

  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog.getByText("저장해 둔 검수 초안이에요")).toBeVisible();
  await expect(dialog.getByText("receipt-2026-09-05.jpg")).toBeVisible();
  await expect(dialog.getByText("원본 사진은 저장하지 않아서 미리보기 없이 상품 정보만 다시 확인해요.")).toBeVisible();
  await expect(dialog.locator(".receipt-source-preview")).toHaveCount(0);
  await expect(dialog.locator(".receipt-line-toggle").first()).toBeFocused();
  await expect(dialog.getByRole("button", { name: "1개 항목 반영하기" })).toBeVisible();
});

test("connected receipt review queue refreshes after a cross-device revision", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let summaryCalls = 0;
  let revisionCalls = 0;
  const initialSummaries = [
    { id: "receipt-queue-old", status: "review_required", purchased_at: "2026-09-04T12:30:00Z", merchant_name: "지난 기기 마트", stock_created: false, line_count: 1, source_redacted: false },
    { id: "receipt-queue-new", status: "review_required", purchased_at: "2026-09-06T12:30:00Z", merchant_name: "현재 기기 마트", stock_created: false, line_count: 2, source_redacted: false },
  ];
  let remoteSummaries = [
    { id: "receipt-queue-remote", status: "review_required", purchased_at: "2026-09-07T12:30:00Z", merchant_name: "다른 기기 마트", stock_created: false, line_count: 3, source_redacted: false },
  ];
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/receipts", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    summaryCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify(remoteChanged ? remoteSummaries : initialSummaries) });
  });
  await page.route("**/api/receipts/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const entry = page.getByTestId("pending-receipt-review");
  await expect(entry).toContainText("검수할 영수증 2건");
  await entry.click();
  const dialog = page.getByRole("dialog", { name: "검수할 영수증" });
  await expect(dialog.getByRole("list", { name: "검수 대기 영수증 목록" })).toContainText("현재 기기 마트");
  await expect(dialog.getByRole("list", { name: "검수 대기 영수증 목록" })).toContainText("지난 기기 마트");
  await expect(dialog.locator(".receipt-review-queue-row").first()).toBeFocused();
  const baselineSummaryCalls = summaryCalls;
  const baselineRevisionCalls = revisionCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  await expect.poll(() => summaryCalls).toBeGreaterThan(baselineSummaryCalls);
  await expect(dialog.locator(".receipt-review-queue-refresh-notice")).toContainText("다른 기기에서 검수 대기 영수증이 바뀌어 최신 목록을 불러왔어요");
  await expect(dialog.getByRole("list", { name: "검수 대기 영수증 목록" })).toContainText("다른 기기 마트");
  await expect(dialog.getByRole("list", { name: "검수 대기 영수증 목록" })).not.toContainText("현재 기기 마트");
  remoteSummaries = [];
  revision = 3;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(dialog.locator(".receipt-review-queue-empty")).toContainText("검수할 영수증이 없어요");
  await expect(dialog.getByRole("button", { name: "새 영수증으로 추가" })).toBeVisible();
});

test("connected home lets the user choose which pending receipt to resume", async ({ page }) => {
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "receipt-older-e2e", status: "review_required", purchased_at: "2026-09-04T12:30:00Z", merchant_name: "지난마트", stock_created: false, line_count: 1, source_redacted: false },
        { id: "receipt-newer-e2e", status: "review_required", purchased_at: "2026-09-06T12:30:00Z", merchant_name: "오늘마트", stock_created: false, line_count: 2, source_redacted: false },
      ]),
    });
  });
  await page.route("**/api/receipts/receipt-older-e2e", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "receipt-older-e2e",
        fingerprint: "receipt-older-fingerprint",
        status: "review_required",
        source_filename: "older-receipt.jpg",
        purchased_at: "2026-09-04T12:30:00Z",
        template_id: "grocery-generic-v1",
        template_confidence: 0.74,
        merchant_name: "지난마트",
        lines: [{ id: "line-older-1", raw_name: "두부", barcode: null, canonical_name: "두부", quantity: 1, unit: "모", storage_suggestion: "refrigerated", unit_price: 1980, total_price: 1980, line_type: "product", match_confidence: 0.78, review_status: "pending", review_reason: "상품명을 확인해 주세요.", match_source: "parser", source_observation_ids: [], match_candidates: [] }],
        stock_created: false,
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("pending-receipt-review")).toContainText("검수할 영수증 2건");
  await expect(page.getByTestId("pending-receipt-review")).toContainText("오늘마트");
  await page.getByTestId("pending-receipt-review").click();

  const queue = page.getByRole("dialog", { name: "검수할 영수증" });
  await expect(queue.getByRole("list", { name: "검수 대기 영수증 목록" })).toContainText("오늘마트");
  await expect(queue.getByRole("list", { name: "검수 대기 영수증 목록" })).toContainText("지난마트");
  await queue.getByRole("button", { name: /지난마트.*이어서 확인/ }).click();

  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(dialog.getByText("저장해 둔 검수 초안이에요")).toBeVisible();
  await expect(dialog).toContainText("지난마트");
  await expect(dialog.getByRole("button", { name: "1개 항목 반영하기" })).toBeVisible();
});

test("receipt review summaries cannot leak across an account workspace switch", async ({ page }) => {
  let accountRegistered = false;
  let summaryCalls = 0;
  let releaseOldSummary!: () => void;
  const oldSummary = new Promise<void>((resolve) => {
    releaseOldSummary = resolve;
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(accountRegistered
        ? { mode: "account", user_id: "account-summary-e2e", email: "summary@example.com", workspace_id: "account-summary-e2e", role: "user" }
        : { mode: "guest", workspace_id: "guest-summary-e2e", role: "guest" }),
    });
  });
  await page.route("**/api/auth/register", async (route) => {
    accountRegistered = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-summary-e2e", email: "summary@example.com", workspace_id: "account-summary-e2e", role: "user", access_token: "ra1.summary.account-summary-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }),
    });
  });
  await page.route("**/api/account/guest-transfer**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "empty", food_count: 0, receipt_count: 0, storage_event_count: 0, meal_plan_count: 0, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 0, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: false, message: "가져올 게스트 기록이 없어요." }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if ((route.request().headers().authorization ?? "").includes("account-summary-e2e")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-06T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/receipts", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    summaryCalls += 1;
    if (summaryCalls === 1) {
      await oldSummary;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "old-workspace-receipt", status: "review_required", purchased_at: "2026-09-05T12:30:00Z", merchant_name: "이전 workspace 마트", stock_created: false, line_count: 1, source_redacted: false }]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const accountDialog = page.getByRole("dialog", { name: "내 계정" });
  await accountDialog.getByRole("tab", { name: "회원가입" }).click();
  await accountDialog.locator("#account-email-input").fill("summary@example.com");
  await accountDialog.locator("#account-password-input").fill("correct-horse-battery");
  await accountDialog.getByRole("button", { name: "계정 만들기" }).click();
  await expect(accountDialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("계정에 연결했어요");
  await expect.poll(() => summaryCalls).toBeGreaterThan(1);

  releaseOldSummary();
  await expect(page.getByTestId("pending-receipt-review")).toHaveCount(0);
});

test("connected add sheet exposes camera capture and photo-library fallback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  const receiptInputs = receiptDialog.getByRole("group", { name: "영수증 이미지 입력 방법" });
  await expect(receiptInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(receiptInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();

  await receiptDialog.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  const labelInputs = labelDialog.getByRole("group", { name: "라벨 이미지 입력 방법" });
  await expect(labelInputs.locator('input[type="file"][data-input-source="library"]')).toHaveCount(1);
  await expect(labelInputs.getByRole("button", { name: "카메라로 촬영" })).toBeVisible();
});

test("connected label review keeps an ambiguous date and storage unconfirmed", async ({ page }) => {
  await page.route("**/api/labels/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "produce-label.png",
        file_sha256: "fixture-label-sha256",
        engine: "fixture",
        model_version: "fixture-label-v1",
        observations_count: 3,
        product_name: "채소류",
        barcode: null,
        storage_hint: "unknown",
        storage_condition_text: null,
        date_candidates: [{ kind: "unknown", value: "2017-06-28", raw_text: "2017.06.28", confidence: 0.35, requires_review: true, context: "유효 년.월.일" }],
        consumption_date_candidate: null,
        review_observations: [{ id: "obs-date", text: "2017.06.28", bbox: [10, 10, 180, 40], confidence: 0.95 }],
        warnings: ["날짜 숫자는 보이지만 소비기한 의미가 확인되지 않았습니다."],
        requires_review: true,
        quality: { status: "pass", width: 580, height: 387, format: "png", brightness: 168, contrast: 65, blur_score: 10, edge_energy: 22, orientation_corrected: false, warnings: [] },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles({ name: "produce-label.png", mimeType: "image/png", buffer: Buffer.from("fixture-label") });

  await expect(dialog.getByText("날짜 숫자는 보이지만 소비기한 의미가 확인되지 않았습니다.")).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: "날짜 의미와 보관 위치를 확인하세요" })).toHaveAttribute("aria-live", "polite");
  await expect(dialog.getByText("날짜 의미를 확인해 주세요")).toBeVisible();
  await expect(dialog.getByRole("group", { name: "라벨 날짜 의미 확인" })).toHaveAttribute("aria-describedby", "label-date-meaning-hint");
  await expect(dialog.getByRole("group", { name: "라벨 식품 보관 위치" })).toHaveAttribute("aria-describedby", "label-storage-hint");
  await expect(dialog.getByRole("radio", { name: "포장일", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "날짜·보관 위치를 확인해 주세요", exact: true })).toBeDisabled();
  await expect(dialog.getByText("추가 확인 필요")).toBeVisible();

  await dialog.getByRole("radio", { name: "소비기한", exact: true }).click();
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "확인 후 반영", exact: true })).toBeEnabled();
});

test("connected label review carries a no-date product into editable manual entry", async ({ page }) => {
  await page.route("**/api/labels/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "ingredients-label.png",
        file_sha256: "fixture-no-date-label-sha256",
        engine: "fixture",
        model_version: "fixture-label-v1",
        observations_count: 2,
        product_name: "당근",
        barcode: null,
        storage_hint: "unknown",
        storage_condition_text: null,
        date_candidates: [],
        consumption_date_candidate: null,
        review_observations: [],
        warnings: ["이 면에서 소비기한을 찾지 못했어요."],
        requires_review: true,
        quality: { status: "pass", width: 1000, height: 1000, format: "png", brightness: 200, contrast: 50, blur_score: 8, edge_energy: 20, orientation_corrected: false, warnings: [] },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("tab", { name: "라벨" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await labelDialog.locator('input[type="file"][data-input-source="library"]').setInputFiles({ name: "ingredients-label.png", mimeType: "image/png", buffer: Buffer.from("fixture-no-date-label") });

  await expect(labelDialog.getByText("이 면에서 소비기한을 찾지 못했어요.")).toBeVisible();
  await labelDialog.getByRole("button", { name: "직접 입력으로 계속", exact: true }).click();
  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.getByRole("textbox", { name: "식품 이름", exact: true })).toHaveValue("당근");
});

test("render error recovery reports only redacted client telemetry", async ({ page }) => {
  const reports: Array<Record<string, unknown>> = [];
  await page.route("**/api/client-errors", async (route) => {
    reports.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "accepted", request_id: "telemetry-fixture" }) });
  });

  await page.goto("/tests/runtime-error-fixture.html");
  await expect(page.getByRole("main", { name: "Rescue Meal 화면 오류" })).toBeVisible();
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({ surface: "prototype", error_kind: "error", release: "web-unknown" });
  expect(reports[0]).not.toHaveProperty("message");
  expect(reports[0]).not.toHaveProperty("stack");
  expect(reports[0]).not.toHaveProperty("component_stack");
});

test("connected electronic receipt PDF uses the text layer and stays in review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  const input = dialog.locator('input[type="file"][data-input-source="library"]');

  await input.setInputFiles({
    name: "online-receipt.pdf",
    mimeType: "application/pdf",
    buffer: textPdf(["RECEIPT", "001 SPINACH 1 pack 2,980 1 2,980"]),
  });

  await expect(dialog.locator("object")).toHaveAttribute("type", "application/pdf");
  await expect(dialog).toContainText("전자 영수증 PDF의 텍스트를 읽었어요");
  await expect(dialog).toContainText("일반 영수증 형식");
  await expect(dialog.locator(".receipt-line-card").filter({ hasText: "SPINACH" })).toBeVisible();
  await expect(dialog.getByText("원본 파일 자체는 재고 기록에 저장하지 않아요.")).toBeVisible();
});

test("connected receipt review shows safe merchant and template provenance", async ({ page }) => {
  await page.route("**/api/receipts/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "mart-receipt.jpg",
        file_sha256: "mart-receipt-sha256",
        engine: "fixture",
        model_version: "fixture-v1",
        observations_count: 1,
        message: "검토가 필요합니다.",
        quality: { status: "pass", width: 1200, height: 1600, format: "jpeg", brightness: 0.5, contrast: 0.5, edge_energy: 0.5, warnings: [] },
        receipt_kind: "grocery_receipt",
        review_observations: [],
        draft: {
          id: "receipt-mart-provenance",
          fingerprint: "fingerprint-mart-provenance",
          status: "review_required",
          source_filename: "mart-receipt.jpg",
          purchased_at: "2026-09-03T09:00:00+00:00",
          template_id: "grocery-mart-v1",
          template_confidence: 0.9,
          merchant_name: "동네마트",
          lines: [{ id: "line-mart-provenance", raw_name: "시금치", canonical_name: "시금치", quantity: 1, unit: "팩", storage_suggestion: "refrigerated", unit_price: 2980, total_price: 2980, line_type: "product", match_confidence: 0.9, match_source: "local_rule", match_candidates: [], source_observation_ids: [], review_status: "confirmed", review_reason: null }],
          stock_created: false,
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles({ name: "mart-receipt.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fixture") });

  await expect(dialog.getByText("동네마트", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("마트 영수증 형식");
  await expect(dialog).toContainText("상품 후보 1개");
});

test("connected receipt OCR failure returns to a retryable capture state", async ({ page }) => {
  await page.route("**/api/receipts/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "failed", message: "영수증이 흐려 상품 항목을 읽지 못했어요." }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato.png");

  await expect(dialog.getByRole("heading", { name: "사진을 다시 확인해 주세요" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "다시 촬영하거나 사진 선택" })).toBeVisible();
  await dialog.getByRole("button", { name: "다시 촬영하거나 사진 선택" }).click();
  await expect(dialog.getByRole("group", { name: "영수증 이미지 입력 방법" })).toBeVisible();
});

test("connected receipt draft persistence failure explains the retryable capture state", async ({ page }) => {
  await page.route("**/api/receipts/intake", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: { code: "receipt_draft_persistence_unavailable", detail: "temporary draft persistence outage", retryable: true, action: "retry_later" } }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato.png");

  await expect(dialog.getByRole("heading", { name: "사진을 다시 확인해 주세요" })).toBeVisible();
  await expect(dialog).toContainText("영수증 검수 초안을 저장하지 못했어요");
  await expect(dialog.getByRole("button", { name: "다시 촬영하거나 사진 선택" })).toBeVisible();
});

test("connected receipt intake keeps the newest upload when an older response arrives late", async ({ page }) => {
  let intakeCount = 0;
  let releaseFirstResponse!: () => void;
  const firstResponseReleased = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
  await page.addInitScript(() => {
    const abortedRequests: string[] = [];
    Object.defineProperty(window, "__rescueMealAbortedRequests", { configurable: true, value: abortedRequests });
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      init?.signal?.addEventListener("abort", () => abortedRequests.push(String(input)), { once: true });
      return originalFetch(input, init);
    };
  });
  const intakePayload = (name: string) => ({
    status: "review_required",
    source_filename: `${name}.jpg`,
    file_sha256: `${name}-sha256`,
    engine: "fixture",
    model_version: null,
    observations_count: 1,
    message: "검토가 필요합니다.",
    quality: { status: "pass", width: 1200, height: 1600, format: "jpeg", brightness: 0.5, contrast: 0.5, edge_energy: 0.5, warnings: [] },
    receipt_kind: "grocery_receipt",
    review_observations: [],
    draft: {
      id: `receipt-${name}`,
      fingerprint: `fingerprint-${name}`,
      status: "review_required",
      source_filename: `${name}.jpg`,
      purchased_at: "2026-09-03T09:00:00+00:00",
      lines: [{
        id: `line-${name}`,
        raw_name: name,
        canonical_name: name,
        quantity: 1,
        unit: "개",
        storage_suggestion: "refrigerated",
        unit_price: 1000,
        total_price: 1000,
        line_type: "product",
        match_confidence: 0.9,
        match_source: "parser",
        match_candidates: [],
        source_observation_ids: [],
        review_status: "pending",
        review_reason: "상품명을 확인해 주세요.",
      }],
      stock_created: false,
    },
  });

  await page.route("**/api/receipts/intake", async (route) => {
    intakeCount += 1;
    const name = intakeCount === 1 ? "오래된 응답" : "최신 응답";
    if (intakeCount === 1) await firstResponseReleased;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(intakePayload(name)) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  const input = dialog.locator('input[type="file"][data-input-source="library"]');
  await input.setInputFiles({ name: "first.jpg", mimeType: "image/jpeg", buffer: Buffer.from("first") });
  await expect.poll(() => intakeCount).toBe(1);
  const abortedBeforeSwitch = await page.evaluate(() => ((window as unknown as { __rescueMealAbortedRequests?: string[] }).__rescueMealAbortedRequests ?? []).length);

  await dialog.getByRole("tab", { name: "라벨" }).click();
  await expect.poll(() => page.evaluate(() => ((window as unknown as { __rescueMealAbortedRequests?: string[] }).__rescueMealAbortedRequests ?? []).length)).toBeGreaterThan(abortedBeforeSwitch);
  await page.getByRole("dialog", { name: "라벨로 추가" }).getByRole("tab", { name: "영수증" }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.locator('input[type="file"][data-input-source="library"]').setInputFiles({ name: "second.jpg", mimeType: "image/jpeg", buffer: Buffer.from("second") });
  await expect(receiptDialog.getByRole("button", { name: "최신 응답 1개 · 1,000원 확인 필요" })).toBeVisible();

  releaseFirstResponse();
  await expect.poll(() => intakeCount).toBe(2);
  await expect(receiptDialog.getByRole("button", { name: "최신 응답 1개 · 1,000원 확인 필요" })).toBeVisible();
  await expect(receiptDialog.getByRole("button", { name: "오래된 응답 1개 · 1,000원 확인 필요" })).toHaveCount(0);
});

test("connected inventory search uses the server result and page contract", async ({ page }) => {
  const searchUrls: string[] = [];
  const food = {
    id: "server-search-food",
    canonical_name: "서버 검색 식품",
    display_name: "서버 검색 식품",
    brand: "검색 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "서버 검색 fixture",
      confidence: 0.5,
      user_confirmed: false,
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "검색 테스트",
    image_path: "/assets/food/tomato.png",
    note: "검색 결과 fixture",
  };
  const secondFood = { ...food, id: "server-search-food-2", canonical_name: "서버 검색 두번째 식품", display_name: "서버 검색 두번째 식품", brand: "두번째 검색 브랜드" };
  let datePatchPayload: Record<string, unknown> | null = null;
  await page.route("**/api/inventory/search*", async (route) => {
    const searchUrl = route.request().url();
    searchUrls.push(searchUrl);
    const url = new URL(searchUrl);
    const offset = Number(url.searchParams.get("offset"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: offset === 0 ? [food] : [secondFood], total: 2, offset, limit: Number(url.searchParams.get("limit")), has_more: offset === 0, query: url.searchParams.get("q") ?? "", storage_type: null }),
    });
  });
  await page.route("**/api/foods/server-search-food/date-assertion", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    datePatchPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(food) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" }).fill("서버 검색 식품");
  await expect(page.getByRole("heading", { name: "내 식품 목록 2" })).toBeVisible();
  await expect(page.locator(".inventory-filter-summary")).toContainText("“서버 검색 식품” 검색 결과 · 2개");
  const searchResult = page.getByRole("button", { name: /서버 검색 식품 검색 브랜드/ });
  await expect(searchResult).toBeVisible();
  await searchResult.click();
  const searchDetail = page.getByRole("dialog", { name: "서버 검색 식품" });
  const dateProof = searchDetail.locator(".date-proof-card");
  await expect(dateProof.locator("small")).toHaveText("출처 확인 필요");
  await expect(dateProof).not.toContainText("fixture");
  await searchDetail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const dateEditor = searchDetail.getByRole("group", { name: "확인한 날짜 입력" });
  await dateEditor.getByRole("textbox", { name: "날짜" }).fill("2026-09-10");
  await dateEditor.getByRole("button", { name: "확인 후 저장" }).click();
  await expect.poll(() => datePatchPayload).toMatchObject({ kind: "use_by", date_value: "2026-09-10" });
  await expect(searchDetail).toHaveCount(0);
  await expect(page.getByRole("button", { name: "더 보기 · 1개 남음" })).toBeVisible();
  expect(new URL(searchUrls[0]).searchParams.get("q")).toBe("서버 검색 식품");
  expect(new URL(searchUrls[0]).searchParams.get("offset")).toBe("0");
  expect(new URL(searchUrls[0]).searchParams.get("limit")).toBe("40");
  await page.getByRole("button", { name: "더 보기 · 1개 남음" }).click();
  await expect(page.getByRole("button", { name: /서버 검색 두번째 식품 두번째 검색 브랜드/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0);
  expect(searchUrls.some((url) => new URL(url).searchParams.get("offset") === "1")).toBe(true);
});

test("connected inventory search keeps a contextual loading state during a slow response", async ({ page }) => {
  let requestStarted = false;
  let releaseRequest: (() => void) | null = null;
  const requestReleased = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const food = {
    id: "slow-search-food",
    canonical_name: "느린 검색 식품",
    display_name: "느린 검색 식품",
    brand: "지연 응답 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "느린 검색 fixture",
      confidence: 0.5,
      user_confirmed: false,
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "검색 테스트",
    image_path: "/assets/food/tomato.png",
    note: "느린 검색 fixture",
  };
  await page.route("**/api/inventory/search*", async (route) => {
    requestStarted = true;
    await requestReleased;
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [food], total: 1, offset: 0, limit: Number(url.searchParams.get("limit")), has_more: false, query: url.searchParams.get("q") ?? "", storage_type: null }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" }).fill("느린 검색 식품");
  await expect.poll(() => requestStarted).toBeTruthy();
  await expect(page.locator(".inventory-search-loading")).toContainText("“느린 검색 식품” 검색 결과를 불러오고 있어요");
  await expect(page.locator(".inventory-search-loading-icon")).toBeVisible();
  await expect(page.locator(".inventory-filter-summary")).toHaveCount(0);
  await expect(page.locator(".inventory-section")).toHaveAttribute("aria-busy", "true");

  releaseRequest?.();
  await expect(page.getByRole("button", { name: /느린 검색 식품 지연 응답 브랜드/ })).toBeVisible();
  await expect(page.locator(".inventory-section")).toHaveAttribute("aria-busy", "false");
});

test("connected inventory search offers retry after a server failure", async ({ page }) => {
  let attempts = 0;
  const food = {
    id: "retry-search-food",
    canonical_name: "재시도 검색 식품",
    display_name: "재시도 검색 식품",
    brand: "검색 복구 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "검색 복구 fixture",
      confidence: 0.5,
      user_confirmed: false,
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "검색 테스트",
    image_path: "/assets/food/tomato.png",
    note: "검색 복구 fixture",
  };
  await page.route("**/api/inventory/search*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary search failure" }) });
      return;
    }
    const url = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [food], total: 1, offset: 0, limit: Number(url.searchParams.get("limit")), has_more: false, query: url.searchParams.get("q") ?? "", storage_type: null }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" }).fill("재시도 검색 식품");
  const error = page.locator(".inventory-search-error");
  await expect(error).toContainText("“재시도 검색 식품” 검색 결과를 불러오지 못했어요");
  await expect(page.locator(".inventory-filter-summary")).toHaveCount(0);
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("button", { name: /재시도 검색 식품 검색 복구 브랜드/ })).toBeVisible();
  expect(attempts).toBe(2);
});

test("connected app loads the API-backed planner and saves the selected recipe", async ({ page }) => {
  await page.route("**/api/meal-plans/*/complete", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    await route.fulfill({ response, body: JSON.stringify({ ...payload, grocy_sync_status: "needs_mapping" }) });
  });
  await page.goto("/");

  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();

  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.locator(".recipe-kicker")).toHaveText("RESCUE MEAL");
  await expect(dialog).not.toContainText("RESCUE PLANNER · V2");
  await expect(dialog.getByText(/Rescue Meal 팀 작성 레시피/)).toBeVisible();
  await expect(dialog.getByText("필요한 재료", { exact: true })).toBeVisible();
  await expect(dialog.getByText("부족한 재료")).toHaveCount(0);

  await dialog.getByRole("button", { name: "레시피 보기" }).click();
  await expect(dialog.getByText("조리 순서")).toBeVisible();
  await expect(dialog.getByText("안전 메모")).toBeVisible();

  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("식단 저장 완료 · 사용량을 확인해 주세요");
  const savedActionOrder = await dialog.locator(".meal-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
  const recipeActionsIndex = savedActionOrder.findIndex((className) => className.split(/\s+/).includes("recipe-actions"));
  expect(recipeActionsIndex).toBeGreaterThanOrEqual(0);
  expect(savedActionOrder.indexOf("saved-recipe")).toBeGreaterThan(recipeActionsIndex);
  expect(savedActionOrder.indexOf("recipe-complete-actions")).toBeGreaterThan(savedActionOrder.indexOf("saved-recipe"));
  expect(savedActionOrder.indexOf("recipe-complete-actions")).toBeLessThan(savedActionOrder.indexOf("recipe-multi-day-history-toggle"));
  const completion = dialog.locator(".recipe-complete-actions");
  await expect.poll(() => completion.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const actionBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return actionBox.top >= contentBox.top - 1 && actionBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await dialog.getByRole("button", { name: "식단 기록 보기" }).click();
  await expect(dialog.locator(".recipe-audit")).toContainText("식단 저장");
  await expect(dialog.locator(".recipe-audit")).toContainText("저장·조리 기록");
  await expect(dialog.locator(".recipe-audit")).not.toContainText(/snapshot/i);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(reopenedDialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await reopenedDialog.getByRole("button", { name: "조리 전 확인했어요" }).click();
  const chickenUsage = reopenedDialog.getByRole("spinbutton", { name: "닭가슴살 사용량" });
  await chickenUsage.fill("0.5");
  await expect(chickenUsage).toHaveValue("0.5");
  await reopenedDialog.getByRole("button", { name: "조리 완료로 기록" }).click();
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await expect(inventory.getByRole("heading", { name: "내 식품 목록 5" })).toBeVisible();
  await expect(inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1\.5팩/ })).toBeVisible();
  await expect(page.locator(".toast")).toContainText("조리 완료 · 3개 재료를 차감했어요");
  await expect(page.locator(".toast")).toContainText("외부 상품·보관 위치 연결을 확인해 주세요");
  await page.locator(".toast").getByRole("button", { name: "연동 상태 확인" }).click();
  const accountDialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(accountDialog).toBeVisible();
  await accountDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(accountDialog).toHaveCount(0);
  await inventory.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 1\.5팩/ }).click();
  const remainingDetail = page.getByRole("dialog", { name: "닭가슴살" });
  await expect(remainingDetail.locator(".detail-hero-copy p")).toHaveText("무항생제 닭가슴살 · 남은 1.5팩");
  await remainingDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(remainingDetail).toHaveCount(0);

  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const currentMealDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await currentMealDialog.getByRole("button", { name: "최근 식단 보기" }).click();
  await expect(currentMealDialog.locator(".recipe-history")).toContainText("시금치 두부 닭가슴살 덮밥");
  await expect(currentMealDialog.locator(".recipe-history")).toContainText("조리 완료");
  await currentMealDialog.getByRole("button", { name: "시금치 두부 닭가슴살 덮밥 조리 완료 식단 열기" }).click();
  await expect(currentMealDialog.locator(".recipe-history")).toHaveCount(0);
  await expect(currentMealDialog.getByRole("button", { name: "저장됨", exact: true })).toHaveCount(0);
});

test("connected planner offers a typed completion retry without changing the consumption draft", async ({ page }) => {
  let completionAttempts = 0;
  const completionPayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/meal-plans/*/complete", async (route) => {
    completionAttempts += 1;
    completionPayloads.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    if (completionAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "meal_plan_completion_persistence_unavailable",
            detail: "식단 완료를 저장하지 못했습니다. 기존 재고와 식단을 유지했어요.",
            retryable: true,
            action: "retry_later",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await dialog.getByRole("button", { name: "식단 저장" }).click();
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await dialog.getByRole("button", { name: "조리 전 확인했어요" }).click();

  const chickenUsage = dialog.getByRole("spinbutton", { name: "닭가슴살 사용량" });
  await chickenUsage.fill("0.5");
  await dialog.getByRole("button", { name: "조리 완료로 기록" }).click();

  const error = dialog.locator(".recipe-error").filter({ hasText: "조리 완료" });
  await expect(error).toBeVisible();
  await expect(error).toContainText("기존 재고와 식단을 유지했어요");
  await expect(error.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(chickenUsage).toHaveValue("0.5");
  await error.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => completionAttempts).toBe(2);
  expect(completionPayloads[1]).toEqual(completionPayloads[0]);
  await expect(page.getByRole("heading", { name: "내 식품 목록 5" })).toBeVisible();
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" })).toBeFocused();
});

test("connected planner offers a typed save retry with the same plan payload", async ({ page }) => {
  let saveAttempts = 0;
  const savePayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/meal-plans", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    saveAttempts += 1;
    savePayloads.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    if (saveAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "meal_plan_persistence_unavailable",
            detail: "식단을 저장하지 못했습니다. 기존 식단과 workspace 상태를 유지했어요.",
            retryable: true,
            action: "retry_later",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await dialog.getByRole("button", { name: "식단 저장" }).click();

  const error = dialog.locator(".recipe-error").filter({ hasText: "식단을 저장" });
  await expect(error).toBeVisible();
  await expect(error).toContainText("기존 식단과 상태를 유지했어요");
  await expect(error.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await error.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => saveAttempts).toBe(2);
  expect(savePayloads[1]).toEqual(savePayloads[0]);
  await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "레시피 보기" })).toBeFocused();
});

test("connected planner offers a typed multi-day save retry with the same bundle payload", async ({ page }) => {
  let saveAttempts = 0;
  const savePayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/meal-plans/multi-day", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    saveAttempts += 1;
    savePayloads.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    if (saveAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "multi_day_plan_persistence_unavailable",
            detail: "3일 식단을 저장하지 못했습니다. 기존 3일 식단과 workspace 상태를 유지했어요.",
            retryable: true,
            action: "retry_later",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await dialog.getByRole("button", { name: "3일 식단 미리보기" }).click();
  const multiDay = dialog.getByRole("region", { name: "3일 식단" });
  await expect(multiDay.getByRole("listitem")).toHaveCount(3);
  await multiDay.getByRole("button", { name: "3일 식단 저장", exact: true }).click();

  const error = multiDay.getByRole("alert");
  await expect(error).toContainText("기존 3일 식단과 상태를 유지했어요");
  await expect(error.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await error.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => saveAttempts).toBe(2);
  expect(savePayloads[1]).toEqual(savePayloads[0]);
  await expect(multiDay.getByRole("button", { name: "3일 식단 저장됨", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "3일 식단 접기", exact: true })).toBeFocused();
});

test("connected planner preview does not invalidate the dashboard", async ({ page }) => {
  let dashboardRequests = 0;
  await page.route("**/api/dashboard*", async (route) => {
    dashboardRequests += 1;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect.poll(() => dashboardRequests).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  const baselineDashboardRequests = dashboardRequests;

  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await page.waitForTimeout(200);

  expect(dashboardRequests).toBe(baselineDashboardRequests);
});

test("connected planner refreshes an open plan after another tab changes the meal plan", async ({ page, context }) => {
  const initialPlan = {
    id: "meal-cross-tab-initial",
    snapshot_hash: "e".repeat(64),
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    recipe_id: "cross-tab-recipe",
    planner_version: "recipe-planner-v2",
    source: "recipe_fixture",
    title: "처음 계산한 식단",
    minutes: 15,
    max_minutes: 30,
    servings: 1,
    inventory_ids: ["spinach-1"],
    ingredients: [{
      canonical_name: "시금치",
      amount: 1,
      unit: "팩",
      available: true,
      available_food_id: "spinach-1",
      available_quantity: 1,
      available_unit: "팩",
      match_type: "exact",
      quantity_match: "exact",
      allocations: [{ food_id: "spinach-1", quantity: 1, unit: "팩" }],
    }],
    missing_ingredients: [],
    matched_ratio: 1,
    score: 100,
    reason: "현재 재료로 계산한 식단이에요.",
    steps: ["재료 상태를 확인합니다."],
    safety_note: "상태가 이상하면 사용하지 마세요.",
    recipe_source_name: "Rescue Meal 팀 작성 레시피",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "recipes-v1",
    allergens: [],
    allergen_metadata_status: "known",
    preference_filtered: false,
    preference_note: null,
    date_review_required: false,
    date_review_foods: [],
    date_review_note: null,
  };
  const remotePlan = {
    ...initialPlan,
    id: "meal-cross-tab-saved",
    title: "다른 탭에서 저장한 식단",
    saved_at: "2026-09-08T03:00:00Z",
  };
  let latestPlan: typeof remotePlan | null = null;

  await page.route("**/api/meal-preferences*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ avoid_allergens: [] }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(latestPlan ?? initialPlan) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/meal-plans/latest", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(latestPlan) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "처음 계산한 식단" })).toBeVisible();

  const workspaceKey = await page.evaluate(() => {
    const token = window.localStorage.getItem("rescue-meal.guest-token") ?? "";
    const parts = token.split(".");
    return parts[0] === "rm1" && parts[1] ? `guest-${parts[1]}` : "anonymous";
  });
  latestPlan = remotePlan;
  const secondPage = await context.newPage();
  try {
    await secondPage.goto(new URL("/", page.url()).toString());
    await expect(secondPage.locator(".connection-pill")).toHaveText("서버 연결됨");
    await secondPage.evaluate(({ key }) => {
      const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
      channel.postMessage({
        type: "mutation",
        id: "remote-meal-plan-mutation",
        sourceId: "remote-meal-plan-tab",
        workspaceKey: key,
        channels: ["meal-plan"],
      });
      window.setTimeout(() => channel.close(), 0);
    }, { key: workspaceKey });

    await expect(dialog.getByRole("heading", { name: "다른 탭에서 저장한 식단" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "저장됨" })).toBeVisible();
  } finally {
    await secondPage.close();
  }
});

test("connected planner keeps local choices until explicit reload after a cross-device revision", async ({ page }) => {
  let revision = 1;
  let revisionCalls = 0;
  let remoteChanged = false;
  let previewPlan: Record<string, unknown> | null = null;
  let previewCalls = 0;
  let latestCalls = 0;

  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    previewCalls += 1;
    const upstream = await route.fetch();
    const payload = await upstream.json() as Record<string, unknown>;
    previewPlan = {
      ...payload,
      id: remoteChanged ? "remote-meal-plan" : "local-meal-plan",
      title: remoteChanged ? "다른 기기에서 저장한 식단" : "처음 계산한 식단",
      saved_at: null,
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(previewPlan) });
  });
  await page.route("**/api/meal-plans/latest", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    latestCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(remoteChanged && previewPlan ? { ...previewPlan, id: "remote-saved-plan", title: "다른 기기에서 저장한 식단", saved_at: "2026-09-09T03:00:00Z" } : null),
    });
  });
  await page.route("**/api/meal-plans/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "처음 계산한 식단" })).toBeVisible();
  await page.waitForTimeout(100);
  const baselineRevisionCalls = revisionCalls;
  const baselinePreviewCalls = previewCalls;
  const baselineLatestCalls = latestCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  await expect(dialog.getByRole("heading", { name: "처음 계산한 식단" })).toBeVisible();
  const remoteRefresh = dialog.getByRole("alert").filter({ hasText: "다른 기기에서 식단이나 재고가 변경됐어요" });
  await expect(remoteRefresh).toBeVisible();
  await remoteRefresh.getByRole("button", { name: "최신 식단 확인" }).click();
  await expect.poll(() => previewCalls).toBeGreaterThan(baselinePreviewCalls);
  await expect.poll(() => latestCalls).toBeGreaterThan(baselineLatestCalls);
  await expect.poll(() => previewPlan?.title).toBe("다른 기기에서 저장한 식단");
  await expect(dialog.getByRole("heading", { name: "다른 기기에서 저장한 식단" })).toBeVisible();
});

test("connected planner explains when a recipe quantity was converted safely", async ({ page }) => {
  const convertedPlan = {
    id: "meal-unit-conversion-ui-1",
    snapshot_hash: "c".repeat(64),
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    recipe_id: "unit-conversion-recipe",
    planner_version: "recipe-planner-v2",
    source: "recipe_fixture",
    title: "리터 재료 환산 요리",
    minutes: 10,
    max_minutes: 30,
    inventory_ids: ["spinach-1"],
    ingredients: [{
      canonical_name: "시금치",
      amount: 500,
      unit: "ml",
      available: true,
      available_food_id: "spinach-1",
      available_quantity: 2000,
      available_unit: "ml",
      match_type: "exact",
      quantity_match: "converted",
      allocations: [{ food_id: "spinach-1", quantity: 0.5, unit: "리터" }],
    }],
    missing_ingredients: [],
    matched_ratio: 1,
    score: 100,
    reason: "같은 물리 단위만 안전하게 환산했어요.",
    steps: ["재료 상태를 확인합니다."],
    safety_note: "상태가 이상하면 사용하지 마세요.",
    recipe_source_name: "Rescue Meal 팀 작성 레시피",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "recipes-v1",
    allergens: [],
    allergen_metadata_status: "known",
    preference_filtered: false,
    preference_note: null,
    date_review_required: false,
    date_review_foods: [],
    date_review_note: null,
  };
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(convertedPlan) });
    else await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "리터 재료 환산 요리" })).toBeVisible();
  await expect(dialog.locator(".recipe-ingredients")).toContainText("시금치 · 단위 환산");
});

test("connected planner asks for confirmation when matching units are incompatible", async ({ page }) => {
  const incompatiblePlan = {
    id: "meal-unit-incompatible-ui-1",
    snapshot_hash: "d".repeat(64),
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    recipe_id: "unit-incompatible-recipe",
    planner_version: "recipe-planner-v2",
    source: "recipe_fixture",
    title: "단위 확인이 필요한 요리",
    minutes: 10,
    max_minutes: 30,
    inventory_ids: ["spinach-1"],
    ingredients: [{
      canonical_name: "시금치",
      amount: 500,
      unit: "g",
      available: false,
      available_food_id: "spinach-1",
      available_quantity: null,
      available_unit: null,
      match_type: "exact",
      quantity_match: "incompatible",
      allocations: [],
    }],
    missing_ingredients: ["시금치"],
    matched_ratio: 0,
    score: 80,
    reason: "포장 단위를 확인해야 해요.",
    steps: ["재료 단위를 확인합니다."],
    safety_note: "단위를 확인하기 전에는 사용하지 마세요.",
    recipe_source_name: "Rescue Meal 팀 작성 레시피",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "recipes-v1",
    allergens: [],
    allergen_metadata_status: "known",
    preference_filtered: false,
    preference_note: null,
    date_review_required: false,
    date_review_foods: [],
    date_review_note: null,
  };
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(incompatiblePlan) });
    else await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "단위 확인이 필요한 요리" })).toBeVisible();
  await expect(dialog.locator(".recipe-ingredients")).toContainText("시금치 · 단위 확인 필요");
});

test("connected planner changes the recipe when the cooking time changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });

  await dialog.getByRole("group", { name: "조리 가능 시간" }).getByRole("button", { name: "10분" }).click();
  await expect(dialog.getByRole("heading", { name: "맛타리버섯 달걀 볶음" })).toBeVisible();
  await expect(dialog.locator(".recipe-time")).toHaveText(/10분/);

  await dialog.getByRole("group", { name: "조리 가능 시간" }).getByRole("button", { name: "20분" }).click();
  await expect(dialog.getByRole("button", { name: "다른 메뉴 찾아보기" })).toBeVisible();
  await dialog.getByRole("button", { name: "다른 메뉴 찾아보기" }).click();
  const alternatives = dialog.getByRole("region", { name: "다른 메뉴" });
  await expect(alternatives).toBeVisible();
  await expect(alternatives.getByRole("listitem")).toHaveCount(2);
  const alternative = alternatives.getByRole("listitem").first();
  const alternativeTitle = await alternative.locator("strong").innerText();
  await alternative.click();
  await expect(alternatives).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: alternativeTitle })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "식단 저장" })).toBeVisible();

  await dialog.getByRole("button", { name: "3일 식단 미리보기" }).click();
  const multiDay = dialog.getByRole("region", { name: "3일 식단" });
  await expect(multiDay).toBeVisible();
  await expect(multiDay.getByRole("listitem")).toHaveCount(3);
  await expect(multiDay).toContainText("1일차");
  await expect(multiDay).toContainText("3일차");
  await expect(multiDay).toContainText("재고·중복 사용을 함께 최적화했어요.");
  await multiDay.getByRole("button", { name: "3일 식단 저장", exact: true }).click();
  await expect(multiDay.getByRole("button", { name: "3일 식단 저장됨", exact: true })).toBeVisible();
  await expect(page.locator(".toast-message")).toHaveText("3일 식단 저장 완료 · 부족 재료를 장보기에 추가해 주세요");
  await expect(multiDay.getByRole("button", { name: "3일 부족 재료 장보기", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await reopenedDialog.getByRole("group", { name: "조리 가능 시간" }).getByRole("button", { name: "20분" }).click();
  await reopenedDialog.getByRole("button", { name: "3일 식단 미리보기" }).click();
  const reopenedMultiDay = reopenedDialog.getByRole("region", { name: "3일 식단" });
  await expect(reopenedMultiDay.getByRole("button", { name: "3일 식단 저장됨", exact: true })).toBeVisible();
  await reopenedDialog.getByRole("button", { name: "저장한 3일 식단 보기", exact: true }).click();
  const multiDayHistory = reopenedDialog.getByRole("region", { name: "저장한 3일 식단" });
  await expect(multiDayHistory.getByRole("listitem")).toHaveCount(1);
  await multiDayHistory.getByRole("listitem").first().click();
  await expect(multiDayHistory).toHaveCount(0);
  const dayTwo = reopenedMultiDay.getByRole("listitem").nth(1);
  const dayTwoTitle = await dayTwo.locator("strong").innerText();
  await dayTwo.click();
  await expect(reopenedMultiDay).toHaveCount(0);
  await expect(reopenedDialog.getByRole("heading", { name: dayTwoTitle })).toBeVisible();
  await reopenedDialog.getByRole("button", { name: "식단 저장", exact: true }).click();
  await expect(reopenedDialog.getByRole("button", { name: "저장됨", exact: true })).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("식단 저장 완료 · 사용량을 확인해 주세요");
  await reopenedDialog.getByRole("button", { name: "저장한 3일 식단 보기", exact: true }).click();
  const linkedBundleHistory = reopenedDialog.getByRole("region", { name: "저장한 3일 식단" });
  await linkedBundleHistory.getByRole("listitem").first().click();
  const linkedBundle = reopenedDialog.getByRole("region", { name: "3일 식단" });
  await expect(linkedBundle.getByRole("listitem").nth(1)).toContainText("저장됨");
});

test("connected planner focuses three-day shopping action after saving missing ingredients", async ({ page }) => {
  await page.route("**/api/meal-plans/multi-day/latest", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
  const patchMissingIngredients = async (route: import("@playwright/test").Route) => {
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    const days = Array.isArray(payload.days) ? payload.days.map((day, index) => {
      if (!day || typeof day !== "object") return day;
      const current = day as Record<string, unknown>;
      if (index !== 0 || !current.plan || typeof current.plan !== "object") return current;
      return { ...current, plan: { ...(current.plan as Record<string, unknown>), missing_ingredients: ["국산콩 두부"] } };
    }) : payload.days;
    await route.fulfill({ response, body: JSON.stringify({ ...payload, days }) });
  };
  await page.route("**/api/meal-plans/multi-day-preview", async (route) => {
    if (route.request().method() === "POST") return patchMissingIngredients(route);
    await route.continue();
  });
  await page.route("**/api/meal-plans/multi-day", async (route) => {
    if (route.request().method() === "POST") return patchMissingIngredients(route);
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await dialog.getByRole("button", { name: "3일 식단 미리보기" }).click();
  const multiDay = dialog.getByRole("region", { name: "3일 식단" });
  await expect(multiDay.getByRole("listitem")).toHaveCount(3);
  await multiDay.getByRole("button", { name: "3일 식단 저장", exact: true }).click();
  await expect(multiDay.getByRole("button", { name: "3일 식단 저장됨", exact: true })).toBeVisible();
  await expect(page.locator(".toast-message")).toHaveText("3일 식단 저장 완료 · 부족 재료를 장보기에 추가해 주세요");
  await expect(multiDay).toContainText("부족 재료를 장보기로 이어갈 수 있어요.");
  await expect(multiDay.getByRole("button", { name: "3일 부족 재료 장보기", exact: true })).toBeFocused();
});

test("connected planner sends the selected serving count to the API", async ({ page }) => {
  const previewServings: number[] = [];
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { servings?: number };
      previewServings.push(body.servings ?? 0);
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("group", { name: "식사 인원" })).toBeVisible();

  await dialog.getByRole("group", { name: "식사 인원" }).getByRole("button", { name: "2인분" }).click();

  await expect(dialog.getByText("2인분 기준으로 필요한 재료량을 계산해요.", { exact: true })).toBeVisible();
  await expect.poll(() => previewServings.at(-1) ?? 0).toBe(2);
});

test("connected planner turns confirmed missing ingredients into a checked shopping list", async ({ page }) => {
  const now = "2026-09-03T09:00:00Z";
  const missingPlan = {
    id: "meal-shopping-ui-1",
    snapshot_hash: "a".repeat(64),
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    recipe_id: "spinach-tofu-chicken-bowl",
    planner_version: "recipe-planner-v2",
    source: "recipe_fixture",
    title: "시금치 두부 닭가슴살 덮밥",
    minutes: 15,
    max_minutes: 30,
    inventory_ids: ["spinach-1", "chicken-1"],
    ingredients: [
      { canonical_name: "시금치", amount: 1, unit: "팩", available: true, available_food_id: "spinach-1", available_quantity: 1, available_unit: "팩", match_type: "exact", allocations: [{ food_id: "spinach-1", quantity: 1, unit: "팩" }] },
      { canonical_name: "국산콩 두부", amount: 1, unit: "모", available: false, available_food_id: null, available_quantity: null, available_unit: null, match_type: "none", allocations: [] },
      { canonical_name: "닭가슴살", amount: 1, unit: "팩", available: true, available_food_id: "chicken-1", available_quantity: 2, available_unit: "팩", match_type: "exact", allocations: [{ food_id: "chicken-1", quantity: 1, unit: "팩" }] },
    ],
    missing_ingredients: ["국산콩 두부"],
    matched_ratio: 0.667,
    score: 85,
    reason: "두부를 추가하면 더 정확히 만들 수 있어요.",
    steps: ["재료 상태를 확인합니다."],
    safety_note: "상태가 이상하면 사용하지 마세요.",
    recipe_source_name: "Rescue Meal 팀 작성 레시피",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "recipes-v1",
  };
  let shoppingItem = {
    id: "shopping-tofu-ui",
    canonical_name: "국산콩 두부",
    quantity: 1,
    unit: "모",
    checked: false,
    sources: [{ source_type: "meal_plan", source_id: "meal-shopping-ui-1", day_index: null, quantity: 1 }],
    created_at: now,
    updated_at: now,
  };
  let shoppingAddAttempts = 0;

  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(missingPlan) });
    else await route.continue();
  });
  await page.route("**/api/meal-plans", async (route) => {
    if (route.request().method() === "POST" && route.request().url().endsWith("/api/meal-plans")) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...missingPlan, saved_at: now }) });
    else await route.continue();
  });
  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() === "POST") {
      shoppingAddAttempts += 1;
      if (shoppingAddAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "shopping_list_persistence_unavailable", detail: "temporary shopping failure", retryable: true, action: "retry_later" }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [shoppingItem], added_count: 1, updated_count: 0, removed_count: 0 }) });
      return;
    }
    else await route.continue();
  });
  await page.route("**/api/shopping-list/*", async (route) => {
    if (route.request().method() === "PATCH") {
      shoppingItem = { ...shoppingItem, checked: true, updated_at: now };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shoppingItem) });
      return;
    }
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ removed: true }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "시금치 두부 닭가슴살 덮밥" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "사용 전 확인 2건 보기" })).toContainText("부족 재료");
  const missingMessageOrder = await dialog.locator(".meal-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
  const missingSafetySummary = dialog.locator("#recipe-safety-summary");
  await expect(missingSafetySummary).toHaveAttribute("aria-label", "사용 전 확인 안내 2건");
  await expect(missingSafetySummary.locator(".recipe-missing-callout")).toBeVisible();
  expect(missingMessageOrder.indexOf("recipe-safety-summary")).toBeGreaterThanOrEqual(0);
  expect(missingMessageOrder.indexOf("recipe-safety-summary")).toBeLessThan(missingMessageOrder.indexOf("recipe-ingredients"));
  await dialog.getByRole("button", { name: "식단 저장", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "저장됨", exact: true })).toBeVisible();
  await expect(page.locator(".toast-message")).toHaveText("식단 저장 완료 · 부족 재료를 장보기에 추가해 주세요");
  await expect(page.locator(".toast-action")).toHaveText("장보기 목록 보기");
  await expect(dialog.getByRole("button", { name: "장보기 목록에 추가", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "장보기 목록에 추가", exact: true }).click();
  const shopping = dialog.getByRole("region", { name: "장보기 목록" });
  await expect(shopping.getByRole("alert")).toContainText("기존 목록을 유지했어요");
  await shopping.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => shoppingAddAttempts).toBe(2);
  await expect(shopping).toContainText("국산콩 두부");
  const item = shopping.getByRole("button", { name: "국산콩 두부 1모 · 식단 1개", exact: true });
  await expect(item).toBeFocused();
  await expect(item).toHaveAttribute("aria-pressed", "false");
  await item.click();
  await expect(item).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "장보기 목록에 추가", exact: true }).click();
  await expect(item).toBeFocused();
  await shopping.getByRole("button", { name: "국산콩 두부 장보기 항목 삭제" }).click();
  await expect(shopping).toContainText("아직 장보기 항목이 없어요");
});

test("connected home exposes the shopping queue and keeps item mutations in sync", async ({ page }) => {
  const now = "2026-09-03T09:00:00Z";
  let shoppingItem = {
    id: "shopping-home-ui",
    canonical_name: "국산콩 두부",
    quantity: 1,
    unit: "모",
    checked: false,
    sources: [{ source_type: "meal_plan", source_id: "meal-home-ui-1", day_index: null, quantity: 1 }],
    created_at: now,
    updated_at: now,
  };
  const manualItem = {
    id: "shopping-manual-home-ui",
    canonical_name: "생수",
    quantity: 2,
    unit: "병",
    checked: false,
    sources: [{ source_type: "manual", source_id: "manual:shopping-manual-home-ui", day_index: null, quantity: 2 }],
    created_at: now,
    updated_at: now,
  };
  let manualRequestCount = 0;

  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([shoppingItem]) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/shopping-list/*", async (route) => {
    if (route.request().method() === "PATCH") {
      shoppingItem = { ...shoppingItem, checked: true, updated_at: now };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shoppingItem) });
      return;
    }
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ removed: true }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/shopping-list/manual", async (route) => {
    if (route.request().method() === "POST") {
      manualRequestCount += 1;
      const body = JSON.parse(route.request().postData() ?? "{}") as { canonical_name?: string; quantity?: number; unit?: string };
      expect(body).toMatchObject({ canonical_name: "생수", quantity: 2, unit: "병" });
      if (manualRequestCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "shopping_list_persistence_unavailable", detail: "temporary shopping failure", retryable: true, action: "retry_later" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [manualItem], added_count: 1, updated_count: 0, removed_count: 0 }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const card = page.getByRole("button", { name: /장보기 1개가 남아 있어요/ });
  await expect(card).toBeVisible();
  await card.click();

  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  const shopping = dialog.getByRole("region", { name: "장보기 항목" });
  const progress = dialog.getByRole("region", { name: "장보기 진행 상황" });
  await expect(progress).toContainText("장보기 진행 상황");
  await expect(progress).toContainText("0/1");
  await expect(progress.getByRole("progressbar", { name: "장보기 완료율" })).toHaveAttribute("aria-valuenow", "0");
  await expect(shopping).toContainText("국산콩 두부");
  const item = shopping.getByRole("button", { name: "국산콩 두부 1모 · 식단 1개", exact: true });
  await expect(item).toBeFocused();
  await expect(item).toHaveAttribute("aria-pressed", "false");
  await item.click();
  const checkedItem = shopping.getByRole("button", { name: "국산콩 두부 1모 · 식단 1개 · 구매 완료 · 재고 반영 전", exact: true });
  await expect(checkedItem).toHaveAttribute("aria-pressed", "true");
  await expect(checkedItem).toContainText("구매 완료 · 재고 반영 전");
  await expect(checkedItem).toBeFocused();
  await expect(progress).toContainText("1/1");
  await expect(dialog.getByRole("heading", { name: "모두 구매했어요" })).toBeVisible();
  await expect(progress).toContainText("구매 완료 · 재고 반영 전");
  await expect(shopping.getByText("구매한 재료", { exact: true })).toBeVisible();
  await shopping.getByRole("button", { name: "국산콩 두부 장보기 항목 삭제" }).click();
  await expect(dialog).toContainText("아직 장보기 항목이 없어요");
  await expect(dialog.getByRole("button", { name: "식단에서 재료 고르기" })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "직접 장보기 추가" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "추가", exact: true })).toBeFocused();

  const manual = dialog.getByRole("region", { name: "직접 장보기 추가" });
  await manual.getByRole("textbox", { name: "직접 추가 상품명" }).fill("생수");
  await manual.getByRole("spinbutton", { name: "직접 추가 수량" }).fill("2");
  await manual.getByRole("textbox", { name: "직접 추가 단위" }).fill("병");
  await manual.getByRole("button", { name: "추가", exact: true }).click();
  await expect.poll(() => manualRequestCount).toBe(1);
  await expect(dialog.getByRole("alert")).toContainText("기존 목록을 유지했어요");
  await dialog.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => manualRequestCount).toBe(2);
  const manualList = dialog.getByRole("region", { name: "장보기 항목" });
  await expect(manualList).toContainText("생수");
  const manualListItem = manualList.getByRole("button", { name: "생수 2병 · 직접 추가", exact: true });
  await expect(manualListItem).toHaveAttribute("aria-pressed", "false");
  await expect(manualListItem).toBeFocused();
  await manualList.getByRole("button", { name: "생수 장보기 항목 삭제" }).click();
  await expect(dialog).toContainText("아직 장보기 항목이 없어요");
  await dialog.getByRole("button", { name: "식단에서 재료 고르기" }).click();
  const mealDialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(mealDialog).toBeVisible();
  await mealDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "장보기 목록" })).toBeVisible();
});

test("connected shopping list refreshes after a cross-device revision", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let listCalls = 0;
  let revisionCalls = 0;
  const now = "2026-09-09T09:00:00Z";
  const initialItem = {
    id: "shopping-cross-device-ui",
    canonical_name: "현재 기기 장보기",
    quantity: 1,
    unit: "개",
    checked: false,
    sources: [{ source_type: "manual", source_id: "manual:shopping-cross-device-ui", day_index: null, quantity: 1 }],
    created_at: now,
    updated_at: now,
  };
  const remoteItem = {
    ...initialItem,
    canonical_name: "다른 기기 장보기",
    updated_at: "2026-09-09T09:05:00Z",
  };
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    listCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify([remoteChanged ? remoteItem : initialItem]),
    });
  });
  await page.route("**/api/shopping-list/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("button", { name: /장보기 1개가 남아 있어요/ })).toBeVisible();
  await page.getByRole("button", { name: /장보기 1개가 남아 있어요/ }).click();
  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  await expect(dialog.getByRole("button", { name: "현재 기기 장보기 1개 · 직접 추가", exact: true })).toBeVisible();
  const baselineListCalls = listCalls;
  const baselineRevisionCalls = revisionCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  await expect.poll(() => listCalls).toBeGreaterThan(baselineListCalls);
  await expect(dialog.locator(".shopping-sheet-refresh-notice")).toContainText("다른 기기에서 장보기 목록이 바뀌어 최신 목록을 불러왔어요");
  const remoteItemButton = dialog.getByRole("button", { name: "다른 기기 장보기 1개 · 직접 추가", exact: true });
  await expect(remoteItemButton).toBeVisible();
  await expect(remoteItemButton).toBeFocused();
  await expect(dialog.getByRole("button", { name: "현재 기기 장보기 1개 · 직접 추가", exact: true })).toHaveCount(0);
});

test("connected shopping list defers a cross-device refresh while an item mutation is in flight", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let listCalls = 0;
  let revisionCalls = 0;
  let releaseToggle!: () => void;
  let toggleStarted!: () => void;
  const toggleGate = new Promise<void>((resolve) => { releaseToggle = resolve; });
  const toggleStartedGate = new Promise<void>((resolve) => { toggleStarted = resolve; });
  const now = "2026-09-09T09:00:00Z";
  const initialItem = {
    id: "shopping-deferred-cross-device-ui",
    canonical_name: "현재 기기 장보기",
    quantity: 1,
    unit: "개",
    checked: false,
    sources: [{ source_type: "manual", source_id: "manual:shopping-deferred-cross-device-ui", day_index: null, quantity: 1 }],
    created_at: now,
    updated_at: now,
  };
  const remoteItem = {
    ...initialItem,
    canonical_name: "다른 기기 장보기",
    checked: true,
    updated_at: "2026-09-09T09:05:00Z",
  };
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    listCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify([remoteChanged ? remoteItem : initialItem]),
    });
  });
  await page.route("**/api/shopping-list/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
  });
  await page.route("**/api/shopping-list/*", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/shopping-list/revision") {
      revisionCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
      return;
    }
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    toggleStarted();
    await toggleGate;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ ...initialItem, checked: true }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("button", { name: /장보기 1개가 남아 있어요/ })).toBeVisible();
  await page.getByRole("button", { name: /장보기 1개가 남아 있어요/ }).click();
  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  const item = dialog.getByRole("button", { name: "현재 기기 장보기 1개 · 직접 추가", exact: true });
  await expect(item).toBeVisible();
  const baselineListCalls = listCalls;
  const baselineRevisionCalls = revisionCalls;

  await item.click();
  await toggleStartedGate;
  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const workspaceKey = await page.evaluate(() => {
    const token = window.localStorage.getItem("rescue-meal.guest-token") ?? "";
    const parts = token.split(".");
    return parts[0] === "rm1" && parts[1] ? `guest-${parts[1]}` : "anonymous";
  });
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-shopping-list-mutation", sourceId: "remote-shopping-list-tab", workspaceKey: key, channels: ["shopping-list"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await page.waitForTimeout(150);
  expect(revisionCalls).toBe(baselineRevisionCalls);
  expect(listCalls).toBe(baselineListCalls);
  await expect(item).toBeVisible();

  releaseToggle();
  await expect.poll(() => listCalls).toBeGreaterThan(baselineListCalls);
  await expect(dialog.getByRole("button", { name: "다른 기기 장보기 1개 · 직접 추가 · 구매 완료 · 재고 반영 전", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "현재 기기 장보기 1개 · 직접 추가", exact: true })).toHaveCount(0);
});

test("connected shopping receive adds a lot with confirmed storage and clears the planned source", async ({ page }) => {
  const now = "2026-09-03T09:00:00Z";
  let shoppingItem: Record<string, unknown> | null = {
    id: "shopping-receive-home-ui",
    canonical_name: "국산콩 두부",
    quantity: 1,
    unit: "모",
    checked: false,
    sources: [{ source_type: "meal_plan", source_id: "meal-receive-home-ui-1", day_index: null, quantity: 1 }],
    created_at: now,
    updated_at: now,
  };
  let receiveRequestCount = 0;
  let receivePayload: Record<string, unknown> | null = null;
  let failNextDashboardRead = false;

  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(shoppingItem ? [shoppingItem] : []) });
  });
  await page.route("**/api/shopping-list/*/receive", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    receiveRequestCount += 1;
    receivePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    if (receiveRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "shopping_receive_persistence_unavailable", detail: "temporary shopping receive failure", retryable: true, action: "retry_later" }),
      });
      return;
    }
    shoppingItem = null;
    failNextDashboardRead = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        status: "received",
        shopping_item_id: "shopping-receive-home-ui",
        received_quantity: 2,
        inventory_lot: { id: "tofu-1" },
        items: [],
        removed_planned_source_count: 1,
        idempotency_replayed: false,
      }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (!failNextDashboardRead) {
      await route.continue();
      return;
    }
    failNextDashboardRead = false;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary dashboard readback failure" }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /장보기 1개가 남아 있어요/ }).click();

  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  const shopping = dialog.getByRole("region", { name: "장보기 항목" });
  await shopping.getByRole("button", { name: "국산콩 두부 재고에 반영" }).click();
  const receivePanel = shopping.getByRole("form", { name: "국산콩 두부 재고 반영" });
  await expect(receivePanel).toContainText("국산콩 두부 구매 내용 확인");
  await expect(receivePanel).toContainText("소비기한은 자동 확정하지 않아요");
  await expect.poll(() => receivePanel.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const panelBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return panelBox.top >= contentBox.top - 1 && panelBox.bottom <= contentBox.bottom + 1;
  })).toBe(true);
  await receivePanel.getByRole("button", { name: "취소", exact: true }).click();
  await expect(shopping.getByRole("button", { name: "국산콩 두부 재고에 반영" })).toBeFocused();
  await shopping.getByRole("button", { name: "국산콩 두부 재고에 반영" }).click();
  const reopenedReceivePanel = shopping.getByRole("form", { name: "국산콩 두부 재고 반영" });
  await expect(reopenedReceivePanel).toBeVisible();
  await reopenedReceivePanel.getByRole("spinbutton", { name: "국산콩 두부 구매 수량" }).fill("2");
  await reopenedReceivePanel.getByRole("group", { name: "국산콩 두부 보관 위치" }).getByRole("button", { name: "냉동", exact: true }).click();
  await reopenedReceivePanel.getByRole("button", { name: "재고에 반영", exact: true }).click();

  await expect.poll(() => receiveRequestCount).toBe(1);
  await expect(dialog.getByRole("alert")).toContainText("기존 장보기 목록과 재고를 유지했어요");
  await dialog.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => receiveRequestCount).toBe(2);
  expect(receivePayload).toMatchObject({ quantity: 2, storage_type: "frozen" });
  await expect(dialog).toContainText("아직 장보기 항목이 없어요");
  await expect(page.locator(".toast")).toContainText("국산콩 두부");
  await expect(page.locator(".toast")).toContainText("반영 수량: 2모");
  await expect(page.locator(".toast")).toContainText("서버 저장은 완료됐지만 최신 목록은 아직 다시 읽지 못했어요");
  await expect(page.locator(".toast-action")).toHaveText("최신 재고 확인");
  await page.locator(".toast-action").click();
  await expect(page.locator(".toast")).toHaveText("최신 재고를 확인했어요");
  const receivedNotice = dialog.locator(".shopping-sheet-received");
  await expect(receivedNotice).toContainText("재고에 반영했어요");
  await expect(receivedNotice).toContainText("국산콩 두부");
  await expect(receivedNotice).toContainText("다음: 포장지 날짜와 보관 상태를 확인해 주세요");
  await expect(dialog.getByRole("button", { name: "추가", exact: true })).toBeVisible();
  const receivedDetailButton = page.getByRole("dialog", { name: "장보기 목록" }).getByRole("button", { name: "식품 상세 확인" });
  await expect(receivedDetailButton).toBeFocused();
  await receivedDetailButton.waitFor({ state: "visible" });
  await receivedDetailButton.click({ force: true });
  const receivedDetail = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(receivedDetail).toBeVisible();
 await expect(receivedDetail.locator(".detail-hero-copy h3")).toHaveText("국산콩 두부");
 await expect(receivedDetail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeFocused();
  await receivedDetail.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const receivedDateEditor = receivedDetail.getByRole("group", { name: "확인한 날짜 입력" });
  await receivedDateEditor.getByRole("button", { name: "소비기한", exact: true }).click();
  await receivedDateEditor.getByRole("textbox", { name: "날짜" }).fill("2026-09-30");
  await receivedDateEditor.getByRole("button", { name: "확인 후 저장" }).click();
  await expect(page.locator(".toast")).toHaveText("국산콩 두부 소비기한을 사용자 확인으로 저장했어요");
  await expect(receivedDetail).toHaveCount(0);
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ })).toBeFocused();
});

test("shopping queue failure stays local to the sheet and keeps the dashboard connected", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() === "GET") {
      requestCount += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "shopping provider unavailable" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const card = page.getByRole("button", { name: /장보기 목록을 다시 확인해요/ });
  await expect(card).toBeVisible();
  await card.click();

  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  await expect(dialog.getByRole("alert")).toContainText("장보기 목록을 불러오지 못했어요");
  await expect(dialog.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  expect(requestCount).toBeGreaterThanOrEqual(2);
});

test("connected shopping item failure exposes a retry action", async ({ page }) => {
  const now = "2026-09-03T09:00:00Z";
  const item = {
    id: "shopping-mutation-retry-ui",
    canonical_name: "장보기 복구 식품",
    quantity: 1,
    unit: "개",
    checked: false,
    sources: [{ source_type: "manual", source_id: "manual:shopping-mutation-retry-ui", day_index: null, quantity: 1 }],
    created_at: now,
    updated_at: now,
  };
  let patchAttempts = 0;
  await page.route("**/api/shopping-list", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([item]) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/shopping-list/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    patchAttempts += 1;
    if (patchAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "shopping_list_item_persistence_unavailable", detail: "temporary shopping failure", retryable: true, action: "retry_later" } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...item, checked: true, updated_at: now }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /장보기 1개가 남아 있어요/ }).click();
  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  const shopping = dialog.getByRole("region", { name: "장보기 항목" });
  const shoppingItem = shopping.getByRole("button", { name: "장보기 복구 식품 1개 · 직접 추가", exact: true });
  await shoppingItem.click();

  await expect.poll(() => patchAttempts).toBe(1);
  const error = dialog.getByRole("alert");
  await expect(error).toContainText("장보기 항목 상태를 저장하지 못했어요");
  await error.getByRole("button", { name: "다시 시도" }).click();
  const completedShoppingItem = shopping.getByRole("button", { name: "장보기 복구 식품 1개 · 직접 추가 · 구매 완료 · 재고 반영 전", exact: true });
  await expect(completedShoppingItem).toHaveAttribute("aria-pressed", "true");
  expect(patchAttempts).toBe(2);
});

test("connected planner saves allergen preferences before recalculating the recipe", async ({ page }) => {
  let preferencesState = { avoid_allergens: [] as string[] };
  let updateAttempts = 0;
  await page.route("**/api/meal-preferences", async (route) => {
    if (route.request().method() === "PUT") {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "meal_preferences_persistence_unavailable", detail: "식단 조건을 저장하지 못했습니다. 기존 조건을 유지했어요.", retryable: true, action: "retry_later" }),
        });
        return;
      }
      preferencesState = JSON.parse(route.request().postData() ?? "{}");
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preferencesState) });
  });
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await dialog.getByRole("button", { name: "식단 조건 설정", exact: true }).click();
  const preferences = dialog.getByRole("region", { name: "식단 조건" });
  const soy = preferences.getByRole("button", { name: "대두·콩", exact: true });
  await soy.click();
  await expect(soy).toHaveAttribute("aria-pressed", "true");
  await preferences.getByRole("button", { name: "식단 조건 저장", exact: true }).click();
  await expect(preferences.getByRole("alert")).toContainText("기존 조건을 유지했어요");
  await preferences.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog.getByText("식단 조건을 저장했어요. 추천을 다시 계산합니다.", { exact: true })).toBeVisible();
  expect(updateAttempts).toBe(2);
  await expect(dialog.getByRole("button", { name: "피할 알레르기 1개", exact: true })).toBeVisible();
});

test("connected planner calls out date review for allocated lots", async ({ page }) => {
  const dateReviewPlan = {
    id: "meal-date-review-ui-1",
    snapshot_hash: "b".repeat(64),
    saved_at: null,
    completed_at: null,
    consumed_food_ids: [],
    completed_skipped_ingredients: [],
    consumed_allocations: [],
    recipe_id: "date-review-recipe",
    planner_version: "recipe-planner-v2",
    source: "recipe_fixture",
    title: "날짜 확인 레시피",
    minutes: 10,
    max_minutes: 30,
    inventory_ids: ["spinach-1"],
    ingredients: [
      { canonical_name: "시금치", amount: 1, unit: "팩", available: true, available_food_id: "spinach-1", available_quantity: 1, available_unit: "팩", match_type: "exact", allocations: [{ food_id: "spinach-1", quantity: 1, unit: "팩" }] },
      { canonical_name: "국산콩 두부", amount: 1, unit: "모", available: false, available_food_id: null, available_quantity: null, available_unit: null, match_type: "none", allocations: [] },
    ],
    missing_ingredients: ["국산콩 두부"],
    matched_ratio: 0.5,
    score: 100,
    reason: "날짜 확인이 필요한 식품을 먼저 살펴봐요.",
    steps: ["포장지 날짜와 보관 상태를 확인합니다."],
    safety_note: "상태가 이상하면 사용하지 마세요.",
    recipe_source_name: "Rescue Meal 팀 작성 레시피",
    recipe_source_url: null,
    recipe_license: "project-authored",
    recipe_source_revision: "recipes-v1",
    allergens: [],
    allergen_metadata_status: "unknown",
    preference_filtered: false,
    preference_note: null,
    date_review_required: true,
    date_review_foods: ["시금치"],
    date_review_food_ids: ["spinach-1"],
    date_review_note: "시금치의 포장지 보관조건·현재 보관 위치(김치냉장고)·표시 날짜를 다시 확인하세요. 이 안내는 소비기한을 새로 판정하지 않습니다.",
  };
  await page.route("**/api/meal-plans/preview", async (route) => {
    if (route.request().method() === "POST") await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dateReviewPlan) });
    else await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /확인하고 오늘 식단 만들기/ }).click();
  const dialog = page.getByRole("dialog", { name: "오늘의 Rescue Meal" });
  await expect(dialog.getByRole("heading", { name: "날짜 확인 레시피" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "사용 전 확인 3건 보기" })).toContainText("부족 재료");
  await dialog.getByRole("group", { name: "식사 인원" }).getByRole("button", { name: "2인분" }).click();
  await expect(dialog.getByText("2인분 기준으로 필요한 재료량을 계산해요.", { exact: true })).toBeVisible();
  const callout = dialog.locator(".recipe-date-review-callout");
  await expect(callout).toContainText("조리 전 날짜 확인이 필요해요");
  await expect(callout).toContainText("김치냉장고");
  await expect(callout).toContainText("시금치");
  await expect(callout).toContainText("포장지 보관조건");
  await expect(callout.getByRole("button", { name: "식품 확인 · 시금치", exact: true })).toBeVisible();
  await callout.getByRole("button", { name: "식품 확인 · 시금치", exact: true }).click();
  const foodDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(foodDetail).toBeVisible();
  await foodDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(foodDetail).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("2인분 기준으로 필요한 재료량을 계산해요.", { exact: true })).toBeVisible();
  const safetySummary = dialog.locator("#recipe-safety-summary");
  await expect(safetySummary).toHaveAttribute("aria-label", "사용 전 확인 안내 3건");
  await expect(safetySummary).toContainText("확인할 내용");
  await expect(safetySummary).toContainText("포장지·보관 상태·알레르기 정보를 먼저 읽어 주세요.");
  await expect(safetySummary).not.toContainText("저장하거나 조리해 주세요");
  const safetyItems = safetySummary.locator(".recipe-safety-summary-list > .recipe-safety-summary-item");
  await expect(safetyItems).toHaveCount(3);
  await expect(safetyItems.nth(0)).toHaveClass(/recipe-date-review-callout/);
  await expect(safetyItems.nth(1)).toHaveClass(/recipe-missing-callout/);
  await expect(safetyItems.nth(2)).toHaveClass(/recipe-allergen-callout/);
  const dateMessageOrder = await dialog.locator(".meal-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
  expect(dateMessageOrder.indexOf("recipe-safety-summary")).toBeGreaterThanOrEqual(0);
  expect(dateMessageOrder.indexOf("recipe-safety-summary")).toBeLessThan(dateMessageOrder.indexOf("recipe-ingredients"));
  expect(dateMessageOrder.indexOf("recipe-safety-summary")).toBeLessThan(dateMessageOrder.indexOf("recipe-provenance"));
});

test("connected inventory preserves the printed date meaning", async ({ page }) => {
  const printedDateTarget = new Date();
  printedDateTarget.setDate(printedDateTarget.getDate() + 7);
  const printedDate = [
    printedDateTarget.getFullYear(),
    String(printedDateTarget.getMonth() + 1).padStart(2, "0"),
    String(printedDateTarget.getDate()).padStart(2, "0"),
  ].join("-");
  const food = {
    id: "sell-by-food",
    canonical_name: "테스트 우유",
    display_name: "테스트 우유",
    brand: "예시 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    product_provenance: {
      source: "open_food_facts",
      source_url: "https://world.openfoodfacts.org/product/8801045426204",
      confidence: 0.62,
      note: "공개 상품 후보; 개별 라벨 확인 필요",
      storage_hint: "refrigerated",
      source_freshness: "current",
    },
    date_assertion: {
      kind: "sell_by",
      value: printedDate,
      display_label: printedDate,
      source: "label_ocr",
      source_detail: "포장지 유통기한",
      confidence: 0.9,
      user_confirmed: false,
      applicable_storage_type: "refrigerated",
      storage_condition_text: "0~10℃ 냉장보관",
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "유제품",
    image_path: "/assets/food/milk.png",
    note: "포장지 표시 날짜를 확인했어요.",
  };
  let provenanceCleared = false;
  let productInfoUpdated = false;
  await page.route("**/api/foods/sell-by-food/product-provenance/events*", async (route) => {
    const events = [{
      id: "product-provenance-event-1",
      food_id: "sell-by-food",
      action: "applied",
      actor_id: "guest",
      actor_role: "guest",
      occurred_at: "2026-09-03T08:30:00Z",
      before: null,
      after: food.product_provenance,
      reason: "Open Food Facts workspace recipe_admin 상품 후보를 확인해 식품을 추가했습니다.",
    }];
    if (provenanceCleared) events.unshift({
      id: "product-provenance-event-2",
      food_id: "sell-by-food",
      action: "removed",
      actor_id: "guest",
      actor_role: "guest",
      occurred_at: "2026-09-03T08:40:00Z",
      before: food.product_provenance,
      after: null,
      reason: "사용자가 상품 출처를 다시 확인하기 위해 제거했습니다.",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(events),
    });
  });
  await page.route("**/api/foods/sell-by-food/product-provenance", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    provenanceCleared = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...food, product_provenance: null }) });
  });
  await page.route("**/api/foods/sell-by-food/product-info/events*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(productInfoUpdated ? [{
        id: "product-info-event-1",
        food_id: "sell-by-food",
        action: "updated",
        actor_id: "guest",
        actor_role: "guest",
        occurred_at: "2026-09-03T08:50:00Z",
        before: { canonical_name: "테스트 우유", display_name: "테스트 우유", brand: "예시 브랜드", category: "유제품", product_provenance: null },
        after: { canonical_name: "사용자 확인 우유", display_name: "사용자 확인 우유", brand: "확인한 브랜드", category: "가공식품", product_provenance: null },
        reason: "workspace recipe_admin 사용자가 상품명·브랜드·카테고리를 수정했습니다.",
      }] : []),
    });
  });
  await page.route("**/api/foods/sell-by-food/product-info", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    productInfoUpdated = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...food, canonical_name: "사용자 확인 우유", display_name: "사용자 확인 우유", brand: "확인한 브랜드", category: "가공식품", product_provenance: null }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-03T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [productInfoUpdated ? { ...food, canonical_name: "사용자 확인 우유", display_name: "사용자 확인 우유", brand: "확인한 브랜드", category: "가공식품", product_provenance: null } : provenanceCleared ? { ...food, product_provenance: null } : food], inventory: [productInfoUpdated ? { ...food, canonical_name: "사용자 확인 우유", display_name: "사용자 확인 우유", brand: "확인한 브랜드", category: "가공식품", product_provenance: null } : provenanceCleared ? { ...food, product_provenance: null } : food] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByText("표시 유통기한")).toBeVisible();
  await page.locator(".inventory-row").filter({ hasText: "테스트 우유" }).click();
  const dialog = page.getByRole("dialog", { name: "테스트 우유" });
  await expect(dialog.getByText("표시 유통기한")).toBeVisible();
  await dialog.locator("details.detail-history-disclosure").locator("summary").click();
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toContainText("공개 상품 DB");
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toContainText("신뢰도 62%");
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toContainText("상품 기준 보관 정보 냉장");
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toContainText("개별 포장의 소비기한을 확정하지 않아요");
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("상품 출처 적용");
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("공개 상품 DB");
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("게스트 기록");
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).not.toContainText("Open Food Facts");
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).not.toContainText("workspace");
  await dialog.getByRole("button", { name: "상품 출처 다시 확인" }).click();
  await expect(dialog.getByRole("alert")).toContainText("이전 이력은 보존됩니다");
  await dialog.getByRole("alert").getByRole("button", { name: "출처 지우기" }).click();
  await expect.poll(() => provenanceCleared).toBe(true);
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("상품 출처 제거");
  await expect(dialog.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("게스트 기록");
  await dialog.getByRole("button", { name: "상품 정보 수정" }).click();
  const productInfoEditor = dialog.getByRole("group", { name: "상품 정보 수정" });
  await expect(productInfoEditor).toBeVisible();
  await productInfoEditor.getByRole("textbox", { name: "상품명 수정" }).fill("사용자 확인 우유");
  await productInfoEditor.getByRole("textbox", { name: "브랜드 수정" }).fill("확인한 브랜드");
  await productInfoEditor.getByRole("textbox", { name: "분류 수정" }).fill("가공식품");
  const saveProductInfoButton = productInfoEditor.getByRole("button", { name: "상품 정보 저장" });
  await expect(saveProductInfoButton).toBeEnabled();
  await saveProductInfoButton.click();
  await expect.poll(() => productInfoUpdated).toBe(true);
  const updatedDialog = page.getByRole("dialog");
  await expect(updatedDialog.locator(".detail-hero")).toContainText("사용자 확인 우유");
  await expect(updatedDialog.locator(".detail-hero")).toContainText("확인한 브랜드");
  await expect(updatedDialog.locator(".detail-hero")).toContainText("1개");
  await expect(updatedDialog.getByText("냉장 보관 중", { exact: true })).toBeVisible();
  await expect(updatedDialog.getByText("표시 유통기한")).toBeVisible();
  await expect(updatedDialog.getByRole("group", { name: "상품 정보 수정 기록" })).toContainText("상품 정보 수정");
  await expect(updatedDialog.getByRole("group", { name: "상품 정보 수정 기록" })).toContainText("상품명 테스트 우유 → 사용자 확인 우유");
  await expect(updatedDialog.getByRole("group", { name: "상품 정보 수정 기록" })).toContainText("브랜드 예시 브랜드 → 확인한 브랜드");
  await expect(updatedDialog.getByRole("group", { name: "상품 정보 수정 기록" })).toContainText("게스트 기록");
  await expect(updatedDialog.getByRole("group", { name: "상품 정보 수정 기록" })).not.toContainText("workspace");
  await expect(updatedDialog.getByRole("group", { name: "상품 정보 수정 기록" })).not.toContainText("recipe_admin");
  await expect(updatedDialog.getByText("AI 소비 우선순위")).toHaveCount(0);
  await updatedDialog.getByRole("button", { name: "닫기", exact: true }).click();
  const updatedPriority = page.locator(".priority-card").filter({ hasText: "사용자 확인 우유" });
  await expect(updatedPriority).toBeVisible();
  await expect(updatedPriority.locator(".date-source")).toHaveText("표시 유통기한");
});

test("connected packaging date explains the separate expiry review path", async ({ page }) => {
  const food = {
    id: "packaging-date-food",
    canonical_name: "포장일만 확인된 식품",
    display_name: "포장일만 확인된 식품",
    brand: "라벨 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    product_provenance: null,
    date_assertion: {
      kind: "packaging_date",
      value: "2026-09-06",
      display_label: "2026-09-06",
      source: "label_ocr",
      source_detail: "포장지 포장일",
      confidence: 0.84,
      user_confirmed: false,
      applicable_storage_type: "refrigerated",
      storage_condition_text: "0~10℃ 냉장보관",
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "가공식품",
    image_path: "/assets/food/milk.png",
    note: "포장일만 확인된 식품이에요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-03T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".inventory-row").filter({ hasText: "포장일만 확인된 식품" }).click();
  const dialog = page.getByRole("dialog", { name: "포장일만 확인된 식품" });
  await expect(dialog.getByText("표시 포장일")).toBeVisible();
  await expect(dialog.locator(".date-review-callout")).toContainText("포장일·제조일은 소비기한이 아니에요");
  await expect(dialog.locator(".date-review-callout")).toContainText("소비기한이 보이는 면");
  await expect(dialog.locator(".date-edit-button")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "포장지에서 소비기한 다시 확인" })).toBeFocused();
  await dialog.getByRole("button", { name: "포장지에서 소비기한 다시 확인" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toBeVisible();
});

test("connected expired printed date offers a direct label recheck and returns to detail", async ({ page }) => {
  const food = {
    id: "expired-printed-food",
    canonical_name: "기한 지난 표시 식품",
    display_name: "기한 지난 표시 식품",
    brand: "표시 브랜드",
    quantity: 1,
    unit: "팩",
    storage_type: "refrigerated",
    opened: false,
    product_provenance: null,
    date_assertion: {
      kind: "use_by",
      value: "2026-09-02",
      display_label: "2026-09-02",
      source: "label_ocr",
      source_detail: "포장지 소비기한",
      confidence: 0.94,
      user_confirmed: false,
      applicable_storage_type: "refrigerated",
      storage_condition_text: "냉장 보관",
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "채소",
    image_path: "/assets/food/spinach.png",
    note: "표시 소비기한을 기록했어요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-17T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".inventory-row").filter({ hasText: "기한 지난 표시 식품" }).click();
  const detail = page.getByRole("dialog", { name: "기한 지난 표시 식품" });
  await expect(detail.locator(".date-review-callout")).toContainText("표시 날짜가 오늘이거나 지났어요");
  await expect(detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" })).toBeVisible();
  await detail.getByRole("button", { name: "포장지에서 날짜 다시 확인" }).click();
  const labelDialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(labelDialog).toBeVisible();
  await labelDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(detail).toBeVisible();
});

test("connected product info persistence failure restores the detail and exposes retry", async ({ page }) => {
  let attempts = 0;
  let failDashboard = false;
  await page.route("**/api/dashboard", async (route) => {
    if (failDashboard) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.route("**/api/foods/spinach-1/product-info", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "product_info_persistence_unavailable", detail: "temporary product info failure", retryable: true, action: "retry_later" } }),
      });
      return;
    }
    failDashboard = true;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".inventory-row").filter({ hasText: "시금치" }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await dialog.getByRole("button", { name: "상품 정보 수정" }).click();
  const editor = dialog.getByRole("group", { name: "상품 정보 수정" });
  await editor.getByRole("textbox", { name: "상품명 수정" }).fill("사용자 확인 시금치");
  await editor.getByRole("textbox", { name: "브랜드 수정" }).fill("확인 브랜드");
  await editor.getByRole("textbox", { name: "분류 수정" }).fill("확인 분류");
  await editor.getByRole("button", { name: "상품 정보 저장" }).click();

  const retryAlert = dialog.getByRole("alert").filter({ hasText: "상품 정보를 저장하지 못했어요" });
  await expect(retryAlert).toBeVisible();
  await expect(dialog.locator(".detail-hero")).toContainText("시금치");
  await retryAlert.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole("dialog").locator(".detail-hero")).toContainText("사용자 확인 시금치");
  await expect(page.getByRole("dialog").getByRole("group", { name: "상품 정보 수정" })).toBeVisible();
  const productInfoNotice = page.getByRole("dialog").getByRole("status").filter({ hasText: "최신 목록은 아직 다시 읽지 못했어요" });
  await expect(productInfoNotice).toBeVisible();
  await expect(productInfoNotice.getByRole("button", { name: "최신 목록 확인" })).toBeVisible();
});

test("connected product provenance removal keeps a successful write visible when dashboard refresh fails", async ({ page }) => {
  let attempts = 0;
  let failDashboard = false;
  const addProvenance = (items: unknown) => Array.isArray(items)
    ? items.map((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === "spinach-1"
      ? {
          ...(item as Record<string, unknown>),
          product_provenance: {
            source: "open_food_facts",
            source_url: "https://world.openfoodfacts.org/product/8801045426204",
            confidence: 0.62,
            note: "공개 상품 후보; 개별 라벨 확인 필요",
            storage_hint: "refrigerated",
            source_freshness: "current",
          },
        }
      : item)
    : items;
  await page.route("**/api/dashboard", async (route) => {
    if (failDashboard) {
      await route.abort("failed");
      return;
    }
    const upstream = await route.fetch();
    const payload = await upstream.json() as Record<string, unknown>;
    payload.inventory = addProvenance(payload.inventory);
    payload.rescue_queue = addProvenance(payload.rescue_queue);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.route("**/api/foods/spinach-1/product-provenance", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "product_provenance_persistence_unavailable", detail: "temporary provenance persistence failure", retryable: true, action: "retry_later" } }),
      });
      return;
    }
    failDashboard = true;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /시금치 국내산 시금치/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  const referenceGroup = dialog.getByRole("region", { name: "참고 출처" });
  await expect(referenceGroup).toBeVisible();
  await expect(referenceGroup).toContainText("날짜·안전 판정을 대신하지 않는 기록");
  const historyDisclosure = dialog.locator("details.detail-history-disclosure");
  await expect(historyDisclosure).toHaveCount(1);
  await expect(historyDisclosure).not.toHaveAttribute("open", "");
  await expect(historyDisclosure.getByText("기록·출처 이력", { exact: true })).toBeVisible();
  await expect(historyDisclosure.getByText("필요할 때 보기", { exact: true })).toBeVisible();
  await historyDisclosure.locator("summary").click();
  await expect(historyDisclosure).toHaveAttribute("open", "");
  await expect(historyDisclosure.getByText("접기", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toBeVisible();
  await dialog.getByRole("button", { name: "상품 출처 다시 확인" }).click();
  await dialog.getByRole("alert").getByRole("button", { name: "출처 지우기" }).click();
  await expect.poll(() => attempts).toBe(1);
  const retry = dialog.getByRole("alert").filter({ hasText: "상품 출처를 지우지 못했어요" });
  await expect(retry).toBeVisible();
  await retry.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toHaveCount(0);
  const provenanceNotice = dialog.getByRole("status").filter({ hasText: "최신 목록은 아직 다시 읽지 못했어요" });
  await expect(provenanceNotice).toBeVisible();
  await expect(provenanceNotice.getByRole("button", { name: "최신 목록 확인" })).toBeVisible();
});

test("connected food detail keeps local edits until an explicit cross-device refresh", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let revisionCalls = 0;
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const upstream = await route.fetch();
    const payload = await upstream.json() as Record<string, unknown>;
    const replaceSelectedFood = (items: unknown) => Array.isArray(items)
      ? items.map((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === "spinach-1"
        ? { ...(item as Record<string, unknown>), display_name: remoteChanged ? "다른 기기 시금치" : "시금치", canonical_name: remoteChanged ? "다른 기기 시금치" : "시금치", brand: remoteChanged ? "다른 기기 브랜드" : (item as Record<string, unknown>).brand }
        : item)
      : items;
    payload.inventory = replaceSelectedFood(payload.inventory);
    payload.rescue_queue = replaceSelectedFood(payload.rescue_queue);
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify(payload) });
  });
  await page.route("**/api/dashboard/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /시금치 국내산 시금치/ }).click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await dialog.getByRole("button", { name: "상품 정보 수정" }).click();
  const editor = dialog.getByRole("group", { name: "상품 정보 수정" });
  await editor.getByRole("textbox", { name: "상품명 수정" }).fill("로컬 편집 시금치");
  await expect.poll(() => revisionCalls).toBeGreaterThan(0);
  await page.waitForTimeout(250);
  const baselineRevisionCalls = revisionCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  const staleAlert = dialog.getByRole("alert").filter({ hasText: "다른 기기에서 이 식품이나 재고가 변경됐어요" });
  await expect(staleAlert).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "상품명 수정" })).toHaveValue("로컬 편집 시금치");

  await staleAlert.getByRole("button", { name: "최신 상태 확인" }).click();
  await expect(page.getByRole("dialog").locator(".detail-hero").getByRole("heading", { name: "다른 기기 시금치" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "상품명 수정" })).toHaveCount(0);
  await expect(page.getByRole("dialog").locator(".detail-actions .secondary-sheet-button")).toBeFocused();
});

test("connected inventory warns when printed date storage condition differs", async ({ page }) => {
  const food = {
    id: "storage-condition-food",
    canonical_name: "실온 보관 잼",
    display_name: "실온 보관 잼",
    brand: "라벨 브랜드",
    quantity: 1,
    unit: "병",
    storage_type: "refrigerated",
    storage_location_id: "storage-location-kimchi",
    opened: false,
    date_assertion: {
      kind: "use_by",
      value: "2026-09-30",
      display_label: "2026-09-30",
      source: "label_ocr",
      source_detail: "포장지 소비기한",
      confidence: 0.94,
      user_confirmed: true,
      applicable_storage_type: "ambient",
      storage_condition_text: "실온 보관",
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "잼·소스",
    image_path: "/assets/food/tomato.png",
    note: "표시 날짜와 포장지 보관조건을 함께 확인했어요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-04T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food], storage_locations: [
        { id: "ambient", name: "실온", storage_type: "ambient", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
        { id: "refrigerated", name: "냉장", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
        { id: "frozen", name: "냉동", storage_type: "frozen", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
        { id: "storage-location-kimchi", name: "김치냉장고", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "2026-09-04T09:00:00Z" },
      ] }),
    });
  });
  await page.route("**/api/foods/storage-condition-food/storage-events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "storage-condition-event",
        food_id: "storage-condition-food",
        event_type: "moved",
        from_storage_type: "refrigerated",
        to_storage_type: "ambient",
        from_storage_location_id: "storage-location-kimchi",
        to_storage_location_id: null,
        quantity: 1,
        occurred_at: "2026-09-03T08:30:00Z",
        source: "user_input",
        created_child_food_id: null,
        grocy_sync_status: "succeeded",
        grocy_outbox_id: "outbox-storage-condition-event",
        grocy_transaction_id: "grocy-storage-condition-tx",
        grocy_status_history: [
          { status: "blocked", occurred_at: "2026-09-03T08:00:00Z", source: "created", note: null },
          { status: "pending", occurred_at: "2026-09-03T08:10:00Z", source: "mapping", note: null },
          { status: "in_flight", occurred_at: "2026-09-03T08:20:00Z", source: "worker", note: null },
          { status: "succeeded", occurred_at: "2026-09-03T08:30:00Z", source: "worker", note: "외부 작업 #grocy-storage-condition-tx" },
        ],
      }]),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const notification = {
      id: "grocy-outbox:outbox-storage-condition-event:succeeded",
      kind: "grocy_sync",
      sync_state: "applied",
      sync_record_id: "outbox-storage-condition-event",
      severity: "info",
      title: "외부 재고에 반영했어요",
      message: "실온 보관 잼: 외부 재고 반영이 완료됐어요.",
      canonical_name: "실온 보관 잼",
      food_id: "storage-condition-food",
      due_date: null,
      source: "grocy_outbox",
      action: "grocy",
      read_at: null,
      created_at: "2026-09-03T08:30:00Z",
    };
    if (request.method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (request.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-03T08:31:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.locator(".priority-card").filter({ hasText: "실온 보관 잼" }).locator(".date-source")).toHaveText("보관 조건 확인");
  await expect(page.getByRole("region", { name: /내 식품 목록/ }).locator(".inventory-row").filter({ hasText: "실온 보관 잼" }).locator(".inventory-status")).toHaveText("확인 필요");
  await page.locator(".inventory-row").filter({ hasText: "실온 보관 잼" }).click();
  const dialog = page.getByRole("dialog", { name: "실온 보관 잼" });
  const mismatch = dialog.getByRole("alert").filter({ hasText: "포장지 보관조건과 현재 위치가 달라요" });
  await expect(mismatch).toBeVisible();
  await expect(mismatch).toContainText("실온 보관");
  await expect(mismatch).toContainText("김치냉장고");
  await expect(dialog.getByText("표시 소비기한", { exact: true })).toBeVisible();
  await expect(dialog.locator(".storage-picker .storage-option-active")).toBeFocused();
  await dialog.locator("details.detail-history-disclosure").locator("summary").click();
  await expect(dialog.locator(".detail-history")).toContainText("김치냉장고 → 실온");
  await expect(dialog.locator(".detail-history").locator('[data-history-sync-status="succeeded"]')).toHaveText("외부 반영 완료");
  await expect(dialog.locator(".detail-history").locator('[data-history-sync-timeline="storage-condition-event"]')).toContainText("외부 연결 확인 → 외부 반영 대기 → 외부 반영 대기 → 외부 반영 완료");
  await expect(dialog.locator(".detail-history").locator('[data-history-sync-reference="outbox-storage-condition-event"]')).toHaveText("외부 작업 #grocy-storage-condition-tx");
  const historyEvidence = dialog.locator('[data-history-sync-evidence="storage-condition-event"]');
  await historyEvidence.locator("summary").click();
  await expect(historyEvidence.locator('[data-history-sync-evidence-status="succeeded"]')).toContainText("자동 동기화");
  await expect(historyEvidence.locator('[data-history-sync-evidence-status="succeeded"]')).toContainText("외부 작업 #grocy-storage-condition-tx");
  await expect(historyEvidence.getByRole("button", { name: "작업 상세 보기" })).toBeVisible();
  await expect(historyEvidence.getByRole("button", { name: "알림에서 보기" })).toBeVisible();
  await historyEvidence.getByRole("button", { name: "작업 상세 보기" }).click();
  const accountFromDetail = page.getByRole("dialog", { name: "내 계정" });
  await expect(accountFromDetail).toBeVisible();
  await accountFromDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(accountFromDetail).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("details.detail-history-disclosure")).toHaveAttribute("open", "");
  await dialog.getByRole("group", { name: "보관 위치 선택" }).getByRole("button", { name: "실온", exact: true }).click();
  await expect(mismatch).toHaveCount(0);
  await dialog.getByRole("group", { name: "보관 위치 선택" }).getByRole("button", { name: "냉장", exact: true }).click();
  await expect(mismatch).toBeVisible();
  const currentHistoryEvidence = dialog.locator('[data-history-sync-evidence="storage-condition-event"]');
  if (!(await currentHistoryEvidence.getAttribute("open"))) await currentHistoryEvidence.locator("summary").click();
  await currentHistoryEvidence.getByRole("button", { name: "알림에서 보기" }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const returnedNotification = notifications.getByRole("button", { name: "외부 재고에 반영했어요: 실온 보관 잼" });
  await expect(returnedNotification).toBeFocused();
  await expect(returnedNotification).toHaveAttribute("data-notification-returned", "true");
});

test("connected date confirmation exposes a retry action after persistence failure", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/foods/tofu-1/date-assertion", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "food_date_persistence_unavailable", detail: "temporary date persistence failure", retryable: true, action: "retry_later" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await editor.getByRole("button", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill("2026-09-30");
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  const toast = page.getByRole("status").filter({ hasText: "확인한 날짜를 저장하지 못했어요" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator(".toast")).toHaveText("국산콩 두부 소비기한을 사용자 확인으로 저장했어요");
  expect(attempts).toBe(2);
});

test("connected date confirmation keeps a successful write visible when dashboard refresh fails", async ({ page }) => {
  let attempts = 0;
  let failDashboard = false;
  await page.route("**/api/dashboard", async (route) => {
    if (failDashboard) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.route("**/api/foods/tofu-1/date-assertion", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "food_date_persistence_unavailable", detail: "temporary date persistence failure", retryable: true, action: "retry_later" } }),
      });
      return;
    }
    // The PATCH reaches the real API and succeeds, but the subsequent
    // dashboard read is deliberately unavailable to exercise stale-cache
    // preservation.
    failDashboard = true;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  await inventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" }).click();
  const editor = dialog.getByRole("group", { name: "확인한 날짜 입력" });
  await editor.getByRole("button", { name: "소비기한", exact: true }).click();
  await editor.getByRole("textbox", { name: "날짜" }).fill("2026-09-30");
  await editor.getByRole("button", { name: "확인 후 저장" }).click();

  const retry = page.getByRole("status").filter({ hasText: "확인한 날짜를 저장하지 못했어요" });
  await expect(retry).toBeVisible();
  await retry.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.locator(".toast-action")).toHaveText("최신 목록 확인");
  const updatedInventory = page.getByRole("region", { name: /내 식품 목록/ });
  await updatedInventory.getByRole("button", { name: /국산콩 두부 풀무원 · 1모/ }).click();
  const updatedDialog = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(updatedDialog.getByText("2026.09.30")).toBeVisible();
});

test("connected inventory shows the persisted first-opened timestamp", async ({ page }) => {
  const food = {
    id: "opened-at-food",
    canonical_name: "테스트 우유",
    display_name: "테스트 우유",
    brand: "예시 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: true,
    opened_at: "2026-09-03T12:30:00Z",
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "상품 유형 + 개봉일",
      confidence: 0.62,
      user_confirmed: false,
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "유제품",
    image_path: "/assets/food/milk.png",
    note: "개봉일을 기준으로 먼저 먹을 순서를 계산했어요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-03T12:30:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".inventory-row").filter({ hasText: "테스트 우유" }).click();
  const dialog = page.getByRole("dialog", { name: "테스트 우유" });
  await expect(dialog.locator(".opened-row")).toContainText("2026년 9월 3일");
  await expect(dialog.locator(".opened-row")).toContainText("개봉 기록했어요.");
});

test("connected inventory explains the inference basis without exposing technical fields", async ({ page }) => {
  const food = {
    id: "inference-trace-food",
    canonical_name: "국산콩 두부",
    display_name: "국산콩 두부",
    brand: "예시 브랜드",
    quantity: 1,
    unit: "모",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "상품 유형 + 보관 방식",
      confidence: 1,
      user_confirmed: false,
    },
    estimated_use_first_window: {
      start_date: "2026-09-03",
      end_date: "2026-09-05",
      basis: "상품 유형 + 보관 방식",
      confidence: 0.7,
      safety_disclaimer: "안전 판정이 아닌 먼저 확인할 순서입니다.",
      inference_trace: {
        provider: "rule-assisted-backend-inference",
        provider_version: "priority-rules-v1",
        rule_id: "priority.tofu.v1",
        evidence_refs: ["rule-snapshot:local-reference/tofu/v1"],
        reasoning: ["상품명에서 두부·콩 후보를 찾았습니다."],
        input_sha256: "a".repeat(64),
      },
    },
    priority: 1,
    category: "두부·콩",
    image_path: "/assets/food/tofu.png",
    note: "실제 소비기한이 아니라 먼저 먹기 위한 추정 순서예요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-03T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).click();
  const dialog = page.getByRole("dialog", { name: "국산콩 두부" });
  const trace = dialog.getByRole("group", { name: "AI 소비 우선순위 근거" });
  await expect(trace).toContainText("상품 유형 + 보관 방식 기준으로 계산했어요.");
  await expect(trace).toContainText("냉장 보관 · 미개봉 상태를 반영했어요.");
  await expect(trace).toContainText("소비기한이나 안전 판정이 아니라");
  await expect(trace).not.toContainText("input_sha256");
  await expect(trace).not.toContainText("safe_to_eat");
});

test("connected home routes a provenance-backed food to the source review action", async ({ page }) => {
  const food = {
    id: "provenance-focus-food",
    canonical_name: "상품 출처 식품",
    display_name: "상품 출처 식품",
    brand: "출처 브랜드",
    quantity: 1,
    unit: "팩",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "use_by",
      value: "2099-09-30",
      display_label: "2099-09-30",
      source: "label_ocr",
      source_detail: "포장지 소비기한",
      confidence: 0.96,
      user_confirmed: true,
      applicable_storage_type: "refrigerated",
      storage_condition_text: "냉장 보관",
    },
    estimated_use_first_window: null,
    product_provenance: {
      source: "open_food_facts",
      source_url: "https://example.test/product/provenance-focus-food",
      confidence: 0.88,
      note: "공개 상품 후보; 개별 라벨 확인 필요",
      storage_hint: "refrigerated",
      source_freshness: "current",
    },
    priority: 1,
    category: "채소",
    image_path: "/assets/food/tomato.png",
    note: "상품 후보와 포장지 날짜를 함께 확인해 주세요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-19T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".priority-card").filter({ hasText: "상품 출처 식품" }).click();
  const dialog = page.getByRole("dialog", { name: "상품 출처 식품" });
  await expect(dialog.getByRole("group", { name: "상품 정보 출처" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "상품 출처 다시 확인" })).toBeFocused();
});

test("connected inventory keeps an abstained inference in the explicit review state", async ({ page }) => {
  const food = {
    id: "abstained-inference-food",
    canonical_name: "정체불명 식품",
    display_name: "정체불명 식품",
    brand: "예시 브랜드",
    quantity: 1,
    unit: "개",
    storage_type: "refrigerated",
    opened: false,
    date_assertion: {
      kind: "unknown",
      value: null,
      display_label: "확인 필요",
      source: "unknown",
      source_detail: "추론 규칙 없음",
      confidence: 0.25,
      user_confirmed: false,
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "기타",
    image_path: "/assets/food/tomato.png",
    note: "정보가 부족해 우선순위를 계산하지 않았어요. 포장지 표시를 확인해 주세요.",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generated_at: "2026-09-03T09:00:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.locator(".inventory-row").filter({ hasText: "정체불명 식품" }).locator(".inventory-status")).toHaveText(/확인 필요/);
  await page.locator(".inventory-row").filter({ hasText: "정체불명 식품" }).click();
  const dialog = page.getByRole("dialog", { name: "정체불명 식품" });
  await expect(dialog.getByText("확인 필요", { exact: true })).toBeVisible();
  await expect(dialog.locator(".date-review-callout")).toContainText("조리 전 날짜 확인이 필요해요");
  await expect(dialog.locator(".date-review-callout")).toContainText("표시 날짜를 확인하지 못했어요");
  await expect(dialog.getByText("AI 소비 우선순위")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "포장지에서 확인한 날짜 입력" })).toBeVisible();
  const dateReviewOrder = await dialog.locator(".detail-sheet-content").evaluate((element) => Array.from(element.children).map((child) => child.className));
  expect(dateReviewOrder.indexOf("date-review-callout")).toBeGreaterThanOrEqual(0);
  expect(dateReviewOrder.indexOf("date-edit-button")).toBeGreaterThan(dateReviewOrder.indexOf("date-review-callout"));
  await expect(dialog.getByRole("group", { name: "AI 소비 우선순위 근거" })).toHaveCount(0);
});

test("connected label correction readback preserves identity while updating date and storage", async ({ page }) => {
  let createPayload: Record<string, unknown> | null = null;
  let createResponse: Record<string, unknown> | null = null;
  let dashboardAfter: Record<string, unknown> | null = null;
  let notificationCalls = 0;
  const candidate = {
    kind: "sell_by",
    value: "2026-09-12",
    raw_text: "유통기한 2026.09.12",
    confidence: 0.92,
    requires_review: true,
    context: "유통기한 2026.09.12",
    source_observation_ids: ["obs-1"],
  };
  await page.route("**/api/labels/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "label-e2e.jpg",
        file_sha256: "label-e2e-sha256",
        engine: "fixture",
        model_version: null,
        observations_count: 2,
        product_name: "시금치",
        barcode: null,
        storage_hint: "ambient",
        storage_condition_text: "직사광선을 피해 실온보관",
        date_candidates: [candidate],
        consumption_date_candidate: candidate,
        review_observations: [{ id: "obs-1", bbox: [0.2, 0.4, 0.6, 0.15], confidence: 0.92 }],
        warnings: [],
        requires_review: true,
        quality: { status: "pass", width: 800, height: 600, format: "jpeg", brightness: 0.5, contrast: 0.5, edge_energy: 0.5, warnings: [] },
      }),
    });
  });
  await page.route("**/api/foods", async (route) => {
    createPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    const response = await route.fetch();
    createResponse = await response.json() as Record<string, unknown>;
    await route.fulfill({ response, body: JSON.stringify(createResponse) });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    if (createResponse) dashboardAfter = payload;
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.route("**/api/notifications**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/revision") && route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: createResponse ? 2 : 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      notificationCalls += 1;
      const notification = {
        id: "label-correction-storage-mismatch",
        kind: "storage_mismatch",
        severity: "attention",
        title: "포장지 보관조건을 확인해 주세요",
        message: "시금치는 라벨 보관 조건을 다시 확인해야 해요.",
        canonical_name: "시금치",
        food_id: "spinach-1",
        due_date: null,
        source: "storage_condition",
        action: "food",
        read_at: null,
        created_at: "2026-09-17T00:00:00Z",
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(createResponse ? [] : [notification]) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("dialog", { name: "영수증으로 추가" }).getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato.png");
  await expect(dialog.getByText("유통기한 2026.09.12")).toBeVisible();
  await expect(dialog.getByText("포장지 보관 조건: 직사광선을 피해 실온보관")).toBeVisible();
  await dialog.getByLabel("라벨 표시 날짜").fill("2026-09-13");
  await expect(dialog.getByText("유통기한 2026.09.13")).toBeVisible();
  const sourcePreview = dialog.getByRole("region", { name: "라벨 원본 미리보기" });
  await expect(sourcePreview).toBeVisible();
  await expect(sourcePreview.locator(".label-source-preview-frame")).toHaveAttribute("data-preview-ready", "true");
  await expect(sourcePreview.locator(".label-source-box-active")).toHaveCount(1);
  await expect(sourcePreview.getByText(/날짜 후보가 읽힌 위치를 강조했어요/)).toBeVisible();
  await dialog.getByRole("radio", { name: /기존 lot · 1팩/ }).click();
  await dialog.getByRole("button", { name: "확인 후 반영" }).click();

  await expect.poll(() => createPayload).not.toBeNull();
  await expect.poll(() => createResponse).not.toBeNull();
  expect(createPayload).toMatchObject({
    canonical_name: "시금치",
    lot_action: "correct",
    target_food_id: "spinach-1",
    date_kind: "sell_by",
    date_value: "2026-09-13",
    date_source: "label_ocr",
    applicable_storage_type: "ambient",
    storage_condition_text: "직사광선을 피해 실온보관",
  });
  expect(createResponse).toMatchObject({
    id: "spinach-1",
    date_assertion: expect.objectContaining({ kind: "sell_by", value: "2026-09-13", source: "label_ocr" }),
  });
  await expect.poll(() => dashboardAfter).not.toBeNull();
  const dashboardInventory = (dashboardAfter?.inventory as Array<Record<string, unknown>> | undefined) ?? [];
  const dashboardSpinach = dashboardInventory.find((item) => item.id === "spinach-1");
  expect(dashboardSpinach?.date_assertion).toEqual(expect.objectContaining({ kind: "sell_by", value: "2026-09-13" }));
  await expect(page.getByRole("status")).toHaveText("시금치를 식품 목록에 추가했어요");
  const inventory = page.getByRole("region", { name: /내 식품 목록/ });
  const correctedRow = inventory.getByRole("button", { name: /시금치/ }).first();
  await expect(correctedRow).toContainText("확인 필요");
  await expect(correctedRow).toContainText("국내산 시금치");
  await correctedRow.click();
  const correctedDialog = page.getByRole("dialog", { name: "시금치" });
  await expect(correctedDialog.getByText("표시 유통기한")).toBeVisible();
  await expect(correctedDialog.locator(".date-proof-card strong")).toHaveText("2026.09.13");
  await expect(correctedDialog.locator(".detail-hero")).toContainText("국내산 시금치");
  await expect(correctedDialog.getByText("실온에 보관 중", { exact: true })).toBeVisible();
  await expect.poll(() => notificationCalls).toBeGreaterThan(1);
  await correctedDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: /알림 확인/ }).click();
  await expect(page.getByRole("dialog", { name: "알림" }).getByText("지금 확인할 알림이 없어요")).toBeVisible();
});

test("connected label review exposes a packaging date without treating it as an expiry", async ({ page }) => {
  let createPayload: Record<string, unknown> | null = null;
  const candidate = {
    kind: "packaging_date",
    value: "2017-06-28",
    raw_text: "2017.06.28",
    confidence: 0.84,
    requires_review: true,
    context: "(포장)년.월.일 2017.06.28",
  };
  await page.route("**/api/labels/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "produce-label-e2e.jpg",
        file_sha256: "produce-label-e2e-sha256",
        engine: "fixture",
        model_version: null,
        observations_count: 1,
        product_name: "채소류",
        barcode: null,
        storage_hint: "refrigerated",
        date_candidates: [candidate],
        consumption_date_candidate: null,
        warnings: ["날짜 숫자는 보이지만 소비기한 의미가 확인되지 않았습니다."],
        requires_review: true,
        quality: { status: "pass", width: 800, height: 600, format: "jpeg", brightness: 0.5, contrast: 0.5, edge_energy: 0.5, warnings: [] },
      }),
    });
  });
  await page.route("**/api/foods", async (route) => {
    createPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("dialog", { name: "영수증으로 추가" }).getByRole("tab", { name: "라벨" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles({ name: "produce-label-e2e.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fixture") });
  await expect(dialog.getByText("포장일 2017.06.28")).toBeVisible();
  await expect(dialog.getByText("소비기한이 아닌 날짜 후보예요.")).toBeVisible();
  await dialog.getByRole("button", { name: "확인 후 반영" }).click();

  await expect.poll(() => createPayload).not.toBeNull();
  expect(createPayload).toMatchObject({
    canonical_name: "채소류",
    lot_action: "create",
    date_kind: "packaging_date",
    date_value: "2017-06-28",
    date_source: "label_ocr",
  });
});

test("connected storage mutation retries once with the same idempotency key", async ({ page }) => {
  const idempotencyKeys: string[] = [];
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (idempotencyKeys.length === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "event-idem-e2e", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 2, occurred_at: "2026-09-02T10:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "not_configured" }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect.poll(() => idempotencyKeys.length).toBe(2);
  expect(idempotencyKeys[0]).toMatch(/^storage-event-/);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
});

test("connected storage mutation readback updates dashboard and notifications together", async ({ page }) => {
  let storageMoved = false;
  let dashboardCalls = 0;
  let notificationCalls = 0;
  const mismatchNotification = {
    id: "storage-readback-mismatch",
    kind: "storage_mismatch",
    severity: "attention",
    title: "포장지 보관조건을 확인해 주세요",
    message: "닭가슴살은 실온 보관 기준인데 현재 냉동에 보관 중이에요.",
    canonical_name: "닭가슴살",
    food_id: "chicken-1",
    due_date: null,
    source: "storage_condition",
    action: "food",
    read_at: null,
    created_at: "2026-09-17T00:00:00Z",
  };
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    storageMoved = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "storage-readback-event", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 2, occurred_at: "2026-09-17T00:05:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "queued" }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    dashboardCalls += 1;
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    if (storageMoved) {
      const update = (items: unknown) => Array.isArray(items)
        ? items.map((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === "chicken-1"
          ? { ...(item as Record<string, unknown>), storage_type: "refrigerated", storage_location_id: null }
          : item)
        : items;
      payload.inventory = update(payload.inventory);
      payload.rescue_queue = update(payload.rescue_queue);
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.route("**/api/notifications*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/revision") && route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: storageMoved ? 2 : 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      notificationCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(storageMoved ? [] : [mismatchNotification]) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect.poll(() => storageMoved).toBe(true);
  await expect.poll(() => dashboardCalls).toBeGreaterThan(1);
  await expect.poll(() => notificationCalls).toBeGreaterThan(1);
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" }).locator(".storage-pill")).toHaveText("냉장");
  await expect(page.locator(".toast")).toContainText("변경 범위: 보관 위치");
  await expect(page.locator(".toast")).toContainText("외부 재고 반영을 대기 중이에요");
  await expect(page.locator(".toast")).not.toContainText("Grocy");

  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  await expect(notifications.getByText("지금 확인할 알림이 없어요")).toBeVisible();
});

test("connected detail mutation carries the external sync lifecycle into notifications", async ({ page }) => {
  let storageMoved = false;
  let workerFinished = false;
  const queuedNotification = {
    id: "grocy-lifecycle-storage-event:pending",
    kind: "grocy_sync",
    sync_state: "queued",
    severity: "info",
    title: "외부 재고 반영을 기다리는 중이에요",
    message: "닭가슴살: 서버에 저장한 작업이 외부 재고 반영 대기열에 있어요.",
    canonical_name: "닭가슴살",
    food_id: null,
    due_date: null,
    source: "grocy_outbox",
    action: "grocy",
    read_at: null,
    created_at: "2026-09-19T11:00:00Z",
  };
  const appliedNotification = {
    ...queuedNotification,
    id: "grocy-lifecycle-storage-event:succeeded",
    sync_state: "applied",
    title: "외부 재고에 반영했어요",
    message: "닭가슴살: 외부 재고 반영이 완료됐어요.",
    created_at: "2026-09-19T11:02:00Z",
  };
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    storageMoved = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "storage-sync-lifecycle-event", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 2, occurred_at: "2026-09-19T11:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "queued" }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    if (storageMoved) {
      const update = (items: unknown) => Array.isArray(items)
        ? items.map((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === "chicken-1"
          ? { ...(item as Record<string, unknown>), storage_type: "refrigerated", storage_location_id: null }
          : item)
        : items;
      payload.inventory = update(payload.inventory);
      payload.rescue_queue = update(payload.rescue_queue);
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: workerFinished ? 3 : storageMoved ? 2 : 1 }) });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workerFinished ? [appliedNotification] : storageMoved ? [queuedNotification] : []) });
      return;
    }
    if (request.method() === "POST") {
      const current = workerFinished ? appliedNotification : queuedNotification;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...current, read_at: "2026-09-19T11:03:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const detail = page.getByRole("dialog", { name: "닭가슴살" });
  await detail.getByRole("button", { name: "냉장", exact: true }).click();
  await detail.locator(".detail-actions .primary-sheet-button").click();
  await expect(page.locator(".toast")).toContainText("외부 재고 반영을 대기 중이에요");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  await expect(notifications.locator('[data-notification-sync-state="queued"]')).toHaveText("처리 대기");

  workerFinished = true;
  const workspaceKey = await page.evaluate(() => {
    const token = window.localStorage.getItem("rescue-meal.guest-token") ?? "";
    const parts = token.split(".");
    return parts[0] === "rm1" && parts[1] ? `guest-${parts[1]}` : "anonymous";
  });
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "grocy-sync-lifecycle-finished", sourceId: "grocy-worker-tab", workspaceKey: key, channels: ["notifications"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await expect(notifications.locator('[data-notification-sync-state="applied"]')).toHaveText("반영 완료");
  await expect(notifications.getByText("외부 재고에 반영했어요", { exact: true })).toBeVisible();
});

test("connected storage sync attention offers a direct external-inventory settings action", async ({ page }) => {
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "storage-attention-event", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 2, occurred_at: "2026-09-17T00:05:00Z", source: "user_input", created_child_food_id: null, grocy_sync_status: "needs_mapping" }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect(page.locator(".toast")).toContainText("변경 범위: 보관 위치");
  await expect(page.locator(".toast").getByRole("button", { name: "연동 상태 확인" })).toBeVisible();
  await page.locator(".toast").getByRole("button", { name: "연동 상태 확인" }).click();
  const accountDialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(accountDialog).toBeVisible();
  await expect(accountDialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
});

test("connected storage persistence failure exposes a retry with the same idempotency key", async ({ page }) => {
  const idempotencyKeys: string[] = [];
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (idempotencyKeys.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "storage_event_persistence_unavailable", detail: "temporary storage failure", retryable: true, action: "retry_later" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "event-persistence-e2e", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 2, occurred_at: "2026-09-02T10:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "not_configured" }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect.poll(() => idempotencyKeys.length).toBe(1);
  await expect(page.getByRole("status")).toContainText("보관 상태를 저장하지 못했어요. 기존 상태를 유지했어요.");
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" }).locator(".storage-pill")).toHaveText("냉동");
  await page.waitForTimeout(3000);
  await expect(page.locator(".toast").getByRole("button", { name: "다시 시도" })).toBeVisible();
  await page.locator(".toast").getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator(".priority-card").first()).toBeFocused();
  await expect.poll(() => idempotencyKeys.length).toBe(2);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  await expect(page.getByRole("status")).toContainText("보관 상태를 저장했어요");
});

test("connected move and open use one atomic storage event sequence", async ({ page }) => {
  const sequenceKeys: string[] = [];
  let sequencePayload: Record<string, unknown> | null = null;
  let sequenceAttempts = 0;
  await page.route("**/api/foods/chicken-1/storage-event-sequence", async (route) => {
    sequenceAttempts += 1;
    sequenceKeys.push(route.request().headers()["idempotency-key"] ?? "");
    sequencePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    if (sequenceAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "storage_event_sequence_persistence_unavailable", detail: "temporary storage sequence failure", retryable: true, action: "retry_later" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [
          { id: "event-sequence-move", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 1, occurred_at: "2026-09-02T10:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "queued" },
          { id: "event-sequence-open", food_id: "chicken-1", event_type: "opened", from_storage_type: "refrigerated", to_storage_type: null, quantity: 1, occurred_at: "2026-09-02T10:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "queued" },
        ],
        final_food_id: "chicken-1",
        idempotency_replayed: false,
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "수량 줄이기" }).click();
  await dialog.getByRole("button", { name: "냉장", exact: true }).click();
  await dialog.locator(".opened-row .toggle").click();
  await dialog.locator(".detail-actions .primary-sheet-button").click();

  await expect.poll(() => sequenceAttempts).toBe(1);
  await expect(page.getByRole("status")).toContainText("보관 상태를 저장하지 못했어요. 보관 위치·개봉 상태·수량 변경 전 상태를 유지했어요.");
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" }).locator(".storage-pill")).toHaveText("냉동");
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" }).locator(".opened-dot")).toHaveCount(0);
  await page.locator(".toast").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => sequenceAttempts).toBe(2);
  expect(sequenceKeys[1]).toBe(sequenceKeys[0]);
  expect(sequencePayload).toMatchObject({
    events: [
      { event_type: "moved", to_storage_type: "refrigerated", quantity: 1 },
      { event_type: "opened" },
    ],
  });
  await expect(page.getByRole("status")).toContainText("변경 범위: 보관 위치·개봉 상태·수량");
  await expect(page.getByRole("status")).toContainText("외부 재고 반영을 대기 중이에요");
});

test("connected consume mutation recovers through the storage recovery module", async ({ page }) => {
  const idempotencyKeys: string[] = [];
  let attempts = 0;
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    attempts += 1;
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "storage_event_persistence_unavailable", detail: "temporary consume persistence failure", retryable: true, action: "retry_later" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "event-consume-recovery-e2e", food_id: "chicken-1", event_type: "consumed", from_storage_type: "frozen", to_storage_type: null, quantity: 2, occurred_at: "2026-09-02T10:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "queued", inventory: [] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "먹었어요" }).click();

  await expect.poll(() => attempts).toBe(1);
  await expect(page.locator(".toast")).toContainText("먹은 기록을 저장하지 못했어요. 기존 목록을 유지했어요.");
  await page.locator(".toast").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => attempts).toBe(2);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  await expect(page.locator(".toast")).toContainText("닭가슴살을 먹은 기록으로 남겼어요");
  await expect(page.locator(".toast")).toContainText("기록 범위: 전체 2팩");
  await expect(page.locator(".toast")).toContainText("외부 재고 반영을 대기 중이에요");
});

test("connected discard mutation recovers through the storage recovery module", async ({ page }) => {
  const idempotencyKeys: string[] = [];
  let attempts = 0;
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    attempts += 1;
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "storage_event_persistence_unavailable", detail: "temporary discard persistence failure", retryable: true, action: "retry_later" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "event-discard-recovery-e2e", food_id: "chicken-1", event_type: "discarded", from_storage_type: "frozen", to_storage_type: null, quantity: 2, occurred_at: "2026-09-02T10:00:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "queued", inventory: [] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /닭가슴살 무항생제 닭가슴살 · 2팩/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "닭가슴살" });
  await dialog.getByRole("button", { name: "상태가 이상해 폐기하기" }).click();
  await dialog.getByRole("alert").getByRole("button", { name: "폐기 기록" }).click();

  await expect.poll(() => attempts).toBe(1);
  await expect(page.locator(".toast")).toContainText("폐기 기록을 저장하지 못했어요. 기존 목록을 유지했어요.");
  await page.locator(".toast").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => attempts).toBe(2);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  await expect(page.locator(".toast")).toContainText("닭가슴살 폐기 기록을 남겼어요");
  await expect(page.locator(".toast")).toContainText("기록 범위: 전체 2팩");
  await expect(page.locator(".toast")).toContainText("외부 재고 반영을 대기 중이에요");
});

test("connected receipt review sends user corrections to the commit API", async ({ page }) => {
  let commitPayload: Record<string, unknown> | null = null;
  const commitIdempotencyKeys: string[] = [];
  let commitAttempts = 0;
  let enrichmentPostAttempts = 0;
  await page.setViewportSize({ width: 393, height: 720 });
  await page.route("**/api/receipts/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "receipt-e2e.jpg",
        file_sha256: "receipt-e2e-sha256",
        engine: "fixture",
        model_version: null,
        observations_count: 1,
        message: "검토가 필요합니다.",
        quality: { status: "pass", width: 1200, height: 1600, format: "jpeg", brightness: 0.5, contrast: 0.5, edge_energy: 0.5, warnings: [] },
        receipt_kind: "grocery_receipt",
        review_observations: [
          { id: "obs-1", bbox: [0.05, 0.8, 0.3, 0.03], confidence: 0.96 },
          { id: "obs-2", bbox: [0.44, 0.76, 0.36, 0.03], confidence: 0.94 },
        ],
        draft: {
          id: "receipt-e2e",
          fingerprint: "receipt-e2e-fingerprint",
          status: "review_required",
          source_filename: "receipt-e2e.jpg",
          purchased_at: "2026-09-02T09:00:00+00:00",
          lines: [{
            id: "line-e2e-1",
            raw_name: "맛타리버섯",
            canonical_name: "맛타리버섯",
            quantity: 2,
            unit: "팩",
            storage_suggestion: "refrigerated",
            unit_price: null,
            total_price: 3980,
            line_type: "product",
            match_confidence: 0.63,
            match_source: "local_rule",
            match_candidates: [{ source: "local_rule", canonical_name: "맛타리버섯", confidence: 0.92, provenance_note: "프로젝트에서 검토한 영수증 상품명 별칭 규칙" }],
            source_observation_ids: ["obs-1", "obs-2"],
            review_status: "pending",
            review_reason: "상품명을 확인해 주세요.",
          }],
          stock_created: false,
        },
      }),
    });
  });
  await page.route("**/api/products/resolve-name/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: "맛타리버섯",
        provider: "open_food_facts",
        status: "matched",
        candidates: [{
          source: "open_food_facts",
          source_url: "https://example.test/product/8800000000004",
          canonical_name: "매일맛있는맛타리버섯",
          brand: "공개 상품 DB 브랜드",
          category: "버섯류",
          quantity_text: "300 g",
          confidence: 0.66,
          provenance_note: "Open Food Facts 검색 후보(사용자 기여 데이터); 실제 상품명·포장지 날짜 확인 필요",
          shelf_life_text: null,
          storage_hint: null,
          source_freshness: "current",
        }],
        warnings: ["식품안전나라 I1250에서 상품명 후보를 찾지 못했습니다. 공개 상품 DB 후보를 추가로 확인했습니다."],
        requires_review: true,
      }),
    });
  });
  await page.route("**/api/receipts/receipt-e2e/product-enrichment", async (route) => {
    const completed = route.request().method() === "GET";
    if (!completed) {
      enrichmentPostAttempts += 1;
      if (enrichmentPostAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "product_enrichment_persistence_unavailable", detail: "temporary enrichment failure", retryable: true, action: "retry_later" }),
        });
        return;
      }
    }
    await route.fulfill({
      status: completed ? 200 : 202,
      contentType: "application/json",
      body: JSON.stringify({
        id: "product-enrichment-receipt-e2e",
        receipt_id: "receipt-e2e",
        line_ids: ["line-e2e-1"],
        status: completed ? "succeeded" : "queued",
        attempts: completed ? 1 : 0,
        processed_lines: completed ? 1 : 0,
        enriched_candidates: completed ? 1 : 0,
        last_error: null,
        next_attempt_at: "2026-09-03T09:00:00Z",
        in_flight_started_at: null,
        last_attempt_at: null,
        created_at: "2026-09-03T09:00:00Z",
        updated_at: "2026-09-03T09:00:00Z",
      }),
    });
  });
  await page.route("**/api/receipts/receipt-e2e", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "receipt-e2e",
        fingerprint: "receipt-e2e-fingerprint",
        status: "review_required",
        source_filename: "receipt-e2e.jpg",
        purchased_at: "2026-09-02T09:00:00+00:00",
        lines: [{
          id: "line-e2e-1",
          raw_name: "맛타리버섯",
          canonical_name: "맛타리버섯",
          quantity: 2,
          unit: "팩",
          storage_suggestion: "refrigerated",
          unit_price: null,
          total_price: 3980,
          line_type: "product",
          match_confidence: 0.63,
          match_source: "local_rule",
            match_candidates: [
            { source: "local_rule", canonical_name: "맛타리버섯", confidence: 0.92, provenance_note: "프로젝트에서 검토한 영수증 상품명 별칭 규칙", shelf_life_text: null, storage_hint: null, source_freshness: "current" },
            { source: "mfds_i1250", canonical_name: "제품기준맛타리버섯", confidence: 0.76, provenance_note: "I1250 제품 기준 후보; 개별 팩 라벨 확인 필요", shelf_life_text: "냉장보관 3일", storage_hint: "refrigerated", source_freshness: "unknown" },
            ],
            source_observation_ids: ["obs-1", "obs-2"],
            review_status: "pending",
          review_reason: "상품명을 확인해 주세요.",
        }],
        stock_created: false,
      }),
    });
  });
  await page.route("**/api/receipts/receipt-e2e/commit", async (route) => {
    commitAttempts += 1;
    commitIdempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    commitPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    if (commitAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "receipt_commit_persistence_unavailable", detail: "temporary receipt commit persistence failure", retryable: true, action: "retry_later" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ receipt_id: "receipt-e2e", status: "committed", commit_transaction_id: "commit-e2e", created_lot_ids: ["lot-e2e"], skipped_line_ids: [], inventory: [], grocy_sync_status: "needs_mapping" }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles("public/assets/food/tomato.png");
  await expect(dialog.getByRole("button", { name: "맛타리버섯 2팩 · 3,980원 확인 필요" })).toBeVisible();
  const sourcePreview = dialog.getByRole("region", { name: "영수증 원본 미리보기" });
  await expect(sourcePreview).toBeVisible();
  await expect(sourcePreview.getByText("상품 항목을 누르면 원본 위치를, 원본 영역을 누르면 해당 상품 수정을 열어요. 필요한 항목만 체크해 주세요.")).toBeVisible();
  await expect(sourcePreview.locator(".receipt-source-box")).toHaveCount(2);
  await expect(sourcePreview.locator(".receipt-source-box-active")).toHaveCount(2);
  await expect(sourcePreview).toContainText("현재 항목 · 맛타리버섯");
  const mushroomCard = dialog.locator('.receipt-line-card[data-line-id="api-line-e2e-1"]');
  const sourceButton = dialog.getByRole("button", { name: "맛타리버섯 원본 위치 보기" });
  await expect(sourceButton).toBeVisible();
  await sourceButton.click();
  await expect.poll(() => sourcePreview.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const previewBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return previewBox.top >= contentBox.top - 1 && previewBox.top <= contentBox.bottom;
  })).toBe(true);
  const sourceLayout = await sourcePreview.evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content")?.getBoundingClientRect();
    const frame = element.querySelector<HTMLElement>(".receipt-source-preview-frame")?.getBoundingClientRect();
    const boxes = Array.from(element.querySelectorAll<HTMLElement>(".receipt-source-box")).map((box) => box.getBoundingClientRect());
    return { content, frame, boxes };
  });
  expect(sourceLayout.content).toBeTruthy();
  expect(sourceLayout.frame).toBeTruthy();
  expect(sourceLayout.frame!.left).toBeGreaterThanOrEqual(sourceLayout.content!.left - 1);
  expect(sourceLayout.frame!.right).toBeLessThanOrEqual(sourceLayout.content!.right + 1);
  expect(sourceLayout.boxes.every((box) => box.left >= sourceLayout.frame!.left - 1 && box.right <= sourceLayout.frame!.right + 1 && box.top >= sourceLayout.frame!.top - 1 && box.bottom <= sourceLayout.frame!.bottom + 1)).toBe(true);
  const sourceHitTargets = await sourcePreview.locator(".receipt-source-hit-target").evaluateAll((elements) => elements.map((element) => {
    return { width: element.offsetWidth, height: element.offsetHeight };
  }));
  expect(sourceHitTargets).toHaveLength(2);
  expect(sourceHitTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  await mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" }).click();
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정" })).toBeVisible();
  const sourceObservationButtons = sourcePreview.getByRole("button", { name: "맛타리버섯 원본 위치 선택" });
  await expect(sourceObservationButtons).toHaveCount(2);
  await sourceObservationButtons.first().press("Enter");
  await expect(mushroomCard).toHaveClass(/receipt-line-card-editing/);
  await expect(mushroomCard.getByRole("button", { name: "맛타리버섯 항목 수정 닫기" })).toBeVisible();
  await expect.poll(() => dialog.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".receipt-review-submit-bar")?.getBoundingClientRect();
    const content = document.querySelector<HTMLElement>(".sheet-content");
    const criticalControls = [
      '.receipt-line-card-editing input[aria-label="상품명"]',
      '.receipt-line-card-editing input[aria-label="수량"]',
      '.receipt-line-card-editing input[aria-label="단위"]',
      ".receipt-line-card-editing .receipt-line-storage-field",
    ]
      .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => Boolean(rect));
    if (!bar || !content || criticalControls.length !== 4) return Number.POSITIVE_INFINITY;
    const contentTop = content.getBoundingClientRect().top;
    return criticalControls.reduce((total, rect) => total + Math.max(0, Math.min(bar.bottom, rect.bottom) - Math.max(bar.top, Math.max(contentTop, rect.top))), 0);
  }), { timeout: 2_500 }).toBe(0);
  await expect(dialog.getByText("검토된 상품명 규칙")).toBeVisible();
  await dialog.getByRole("button", { name: "상품 정보 확인" }).click();
  await expect(dialog.getByRole("alert")).toContainText("상품 정보 확인 작업을 저장하지 못했어요. 검수 상태를 유지했어요.");
  await dialog.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => enrichmentPostAttempts).toBe(2);
  await expect(dialog.getByText("상품 정보 확인을 기다리는 중이에요. 영수증 반영은 지금도 진행할 수 있어요.")).toBeVisible();
  const receiptName = dialog.getByRole("textbox", { name: "상품명" });
  await receiptName.fill("사용자 확인 맛타리버섯");
  await expect(dialog.getByText("상품 정보 후보 1개를 확인했어요.")).toBeVisible({ timeout: 8_000 });
  await expect(receiptName).toHaveValue("사용자 확인 맛타리버섯");
  await receiptName.fill("맛타리버섯");
  await expect(dialog.getByRole("button", { name: "상품 정보 후보 적용" })).toBeVisible();
  await dialog.getByRole("button", { name: "상품 정보 후보 찾기" }).click();
  await expect(dialog.locator(".receipt-product-lookup").getByText("공개 상품 DB 후보").first()).toBeVisible();
  await expect(dialog.locator(".receipt-product-lookup").filter({ hasText: "공개 상품 DB 후보" }).first()).toHaveAttribute("aria-live", "polite");
  await expect(dialog.getByText("실제 상품명·포장지 날짜 확인 필요")).toBeVisible();
  await dialog.getByRole("button", { name: "이 후보 적용" }).click();
  await expect(dialog.getByRole("textbox", { name: "상품명" })).toHaveValue("매일맛있는맛타리버섯");

  await mushroomCard.getByRole("button", { name: "실온", exact: true }).click();
  await mushroomCard.getByRole("textbox", { name: "상품명" }).fill("새송이버섯");
  await mushroomCard.getByRole("spinbutton", { name: "수량" }).fill("1");
  await mushroomCard.getByRole("textbox", { name: "단위" }).fill("봉");
  await dialog.getByRole("button", { name: "1개 항목 반영하기" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("영수증 반영을 저장하지 못했어요. 기존 목록을 유지했어요");
  await page.locator(".toast").getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches(".priority-card, .connection-pill") ?? false)).toBe(true);
  await expect.poll(() => commitAttempts).toBe(2);
  expect(commitIdempotencyKeys[1]).toBe(commitIdempotencyKeys[0]);
  expect(commitPayload).toMatchObject({
    confirmed_line_ids: ["line-e2e-1"],
    overrides: { "line-e2e-1": { canonical_name: "새송이버섯", quantity: 1, unit: "봉", storage_type: "ambient", match_source: "open_food_facts" } },
  });
  const staleCandidates = (commitPayload?.overrides as Record<string, { match_candidates?: Array<{ canonical_name: string }> }>)?.["line-e2e-1"]?.match_candidates;
  expect(staleCandidates?.[0]?.canonical_name).toBe("매일맛있는맛타리버섯");
  await expect(page.locator(".toast")).toContainText("외부 상품·보관 위치 연결을 확인해 주세요");
  await page.locator(".toast").getByRole("button", { name: "연동 상태 확인" }).click();
  const accountDialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(accountDialog).toBeVisible();
  await accountDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(accountDialog).toHaveCount(0);
});

test("connected receipt review can look up a line GTIN before committing the lot", async ({ page }) => {
  let commitPayload: Record<string, unknown> | null = null;
  let commitIdempotencyKey = "";
  await page.route("**/api/receipts/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "review_required",
        source_filename: "receipt-barcode-e2e.jpg",
        file_sha256: "receipt-barcode-e2e-sha256",
        engine: "fixture",
        model_version: null,
        observations_count: 0,
        message: "검토가 필요합니다.",
        quality: { status: "pass", width: 1200, height: 1600, format: "jpeg", brightness: 0.5, contrast: 0.5, edge_energy: 0.5, warnings: [] },
        receipt_kind: "grocery_receipt",
        review_observations: [],
        draft: {
          id: "receipt-barcode-e2e",
          fingerprint: "receipt-barcode-e2e-fingerprint",
          status: "review_required",
          source_filename: "receipt-barcode-e2e.jpg",
          purchased_at: "2026-09-05T09:00:00+00:00",
          lines: [{
            id: "line-barcode-e2e-1",
            raw_name: "두부",
            barcode: "08801114167523",
            canonical_name: "두부",
            quantity: 1,
            unit: "모",
            storage_suggestion: "refrigerated",
            unit_price: null,
            total_price: 2980,
            line_type: "product",
            match_confidence: 0.61,
            match_source: "parser",
            match_candidates: [],
            source_observation_ids: [],
            review_status: "pending",
            review_reason: "상품명을 확인해 주세요.",
          }],
          stock_created: false,
        },
      }),
    });
  });
  await page.route("**/api/products/resolve/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        barcode: "08801114167523",
        status: "matched",
        candidates: [{
          source: "mfds_c005",
          source_url: "https://foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C005",
          canonical_name: "풀무원 국산콩 두부",
          brand: "풀무원",
          category: "두부·콩",
          quantity_text: "1모",
          confidence: 0.82,
          provenance_note: "식품안전나라 C005 상품 후보; 개별 포장지와 날짜 확인 필요",
          shelf_life_text: "냉장보관 기준 참고",
          storage_hint: "refrigerated",
          source_freshness: "legacy",
        }],
        warnings: ["상품 후보는 식별 보조용이며 소비기한을 확정하지 않습니다."],
        requires_review: true,
        provider_statuses: { mfds_c005: "matched", open_food_facts: "not_found" },
      }),
    });
  });
  await page.route("**/api/receipts/receipt-barcode-e2e/commit", async (route) => {
    commitPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    commitIdempotencyKey = route.request().headers()["idempotency-key"] ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ receipt_id: "receipt-barcode-e2e", status: "committed", commit_transaction_id: "commit-barcode-e2e", created_lot_ids: ["lot-barcode-e2e"], skipped_line_ids: [], inventory: [], grocy_sync_status: "not_configured", idempotency_replayed: false }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.locator('input[type="file"][data-input-source="library"]').setInputFiles({ name: "receipt-barcode-e2e.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fixture") });
  await expect(dialog.getByRole("button", { name: "두부 1모 · 2,980원 확인 필요" })).toBeVisible();
  await expect(dialog.getByText("영수증 바코드", { exact: true })).toBeVisible();
  await expect(dialog.getByText("08801114167523", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "바코드로 상품 후보 조회" }).click();
  await expect(dialog.getByText("풀무원 국산콩 두부")).toBeVisible();
  await expect(dialog.getByText("식품안전나라 상품 기준")).toBeVisible();
  await expect(dialog.getByText("과거 기준 데이터 후보")).toBeVisible();
  await dialog.getByRole("button", { name: "이 후보 적용" }).click();
  await expect(dialog.getByRole("textbox", { name: "상품명" })).toHaveValue("풀무원 국산콩 두부");
  await dialog.getByRole("button", { name: "1개 항목 반영하기" }).click();

  await expect(dialog).toHaveCount(0);
  expect(commitPayload).toMatchObject({
    confirmed_line_ids: ["line-barcode-e2e-1"],
    overrides: { "line-barcode-e2e-1": { canonical_name: "풀무원 국산콩 두부", storage_type: "refrigerated", match_source: "mfds_c005", barcode: "08801114167523" } },
  });
  expect(commitIdempotencyKey).toMatch(/^receipt-commit:/);
});

test("duplicate receipt commit explains the idempotent conflict", async ({ page }) => {
  await page.route("**/api/receipts/drafts", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "receipt-duplicate",
        fingerprint: "receipt-duplicate-fingerprint",
        status: "review_required",
        source_filename: "sample-receipt.jpg",
        purchased_at: "2026-09-02T09:00:00+00:00",
        lines: [
          { id: "line-1", raw_name: "국내산 시금치", canonical_name: "국내산 시금치", quantity: 1, unit: "팩", unit_price: null, total_price: 2980, line_type: "product", match_confidence: 0.96, review_status: "confirmed", review_reason: null },
          { id: "line-2", raw_name: "국산콩 두부", canonical_name: "국산콩 두부", quantity: 1, unit: "모", unit_price: null, total_price: 2490, line_type: "product", match_confidence: 0.91, review_status: "confirmed", review_reason: null },
          { id: "line-3", raw_name: "맛타리버섯", canonical_name: "맛타리버섯", quantity: 2, unit: "팩", unit_price: null, total_price: 3980, line_type: "product", match_confidence: 0.63, review_status: "pending", review_reason: "상품명을 확인해 주세요." },
        ],
        stock_created: false,
      }),
    });
  });
  await page.route("**/api/receipts/receipt-duplicate/commit", async (route) => {
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "동일 fingerprint의 영수증이 이미 반영되었습니다." }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await dialog.getByRole("button", { name: "3개 항목 반영하기" }).click();

  await expect(page.getByRole("status")).toHaveText("이미 반영된 영수증이에요. 기존 목록을 유지했어요");
  await expect(dialog).toHaveCount(0);
});

test("receipt commit replay explains that the existing inventory was recovered", async ({ page }) => {
  await page.route("**/api/receipts/drafts", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "receipt-replay",
        fingerprint: "receipt-replay-fingerprint",
        status: "review_required",
        source_filename: "sample-receipt.jpg",
        purchased_at: "2026-09-02T09:00:00+00:00",
        lines: [
          { id: "line-replay-1", raw_name: "국산콩 두부", canonical_name: "국산콩 두부", quantity: 1, unit: "모", unit_price: null, total_price: 2490, line_type: "product", match_confidence: 0.91, review_status: "confirmed", review_reason: null, match_source: "local_rule", match_candidates: [], source_observation_ids: [], barcode: null, storage_suggestion: "refrigerated" },
        ],
        stock_created: false,
      }),
    });
  });
  await page.route("**/api/receipts/receipt-replay/commit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        receipt_id: "receipt-replay",
        status: "committed",
        commit_transaction_id: "commit-replay",
        created_lot_ids: ["lot-replay"],
        skipped_line_ids: [],
        inventory: [],
        grocy_sync_status: "not_configured",
        idempotency_replayed: true,
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await dialog.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  await dialog.getByRole("button", { name: "3개 항목 반영하기" }).click();

  await expect(page.getByRole("status")).toHaveText("3개 항목은 이미 반영되어 최신 목록을 확인했어요");
  await expect(dialog).toHaveCount(0);
});

test("expired account sessions ask for re-authentication without switching workspaces silently", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("rescue-meal.guest-token", "ra1.expired-account.expired-workspace.user.1.invalid");
    window.localStorage.setItem("rescue-meal.auth-mode", "account");
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("로그인 다시 필요");
  await expect(page.locator(".connection-pill")).toHaveAccessibleName(/로그인 화면 열기/);
  await expect(page.getByRole("alert")).toContainText("계정 연결이 만료됐어요");
  await expect(page.getByRole("alert")).toContainText("다른 기록 공간으로 자동 전환하지 않았어요");

  await page.getByRole("button", { name: "다시 로그인" }).click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다시 로그인" })).toBeVisible();

  await page.getByRole("button", { name: "식품", exact: true }).click();
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
  await page.locator(".connection-pill").click({ force: true });
  const pantryDialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(pantryDialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
  await pantryDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(pantryDialog).toHaveCount(0);
  await expect(page.locator(".app-bottom-nav-item-active")).toHaveText("식품");
});

test("offline dashboard exposes a manual reconnect action", async ({ page }) => {
  let failDashboard = true;
  let searchCalled = false;
  await page.route("**/api/dashboard", async (route) => {
    if (failDashboard) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.route("**/api/inventory/search*", async (route) => {
    searchCalled = true;
    await route.abort("failed");
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("오프라인 · 임시 화면");
  await expect(page.locator(".connection-pill")).toHaveAccessibleName(/최신 기록을 사용할 수 없음/);
  await page.getByRole("searchbox", { name: "식품·브랜드·카테고리 검색" }).fill("두부");
  await expect(page.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" })).toBeVisible();
  expect(searchCalled).toBe(false);
  await page.getByRole("button", { name: "식품 검색어 지우기" }).click();
  const retry = page.getByRole("button", { name: "다시 연결", exact: true });
  await expect(retry).toBeVisible();

  failDashboard = false;
  await retry.click();
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("status")).toHaveText("서버에 다시 연결했어요");
});

test("offline reload uses the last successful dashboard snapshot and labels it stale", async ({ page }) => {
  let failDashboard = false;
  await page.route("**/api/dashboard", async (route) => {
    if (failDashboard) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();

  failDashboard = true;
  await page.reload();

  await expect(page.locator(".connection-pill")).toHaveText(/오프라인 · (방금 전|[0-9]+분 전|[0-9]+시간 전|어제|[0-9]+일 전)/);
  await expect(page.locator(".connection-pill")).toHaveClass(/connection-offline-(recent|stale|old)/);
  await expect(page.locator(".connection-pill")).toHaveAccessibleName(/읽기 전용/);
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await expect(page.getByRole("button", { name: /최근 동기화한 오늘 먼저 확인할 식품/ })).toBeVisible();
  await expect(page.locator(".rescue-status-legend")).toHaveAttribute("aria-label", "최근 동기화한 재고 상태와 전체 보관 수");
  await expect(page.locator(".rescue-status-card")).toContainText("최근 동기화 재고");
  await expect(page.getByRole("alert")).toContainText("마지막으로 동기화한 재고");
  await expect(page.getByRole("alert")).toContainText(/마지막으로 동기화한 재고\((방금 전|[0-9]+분 전|[0-9]+시간 전|어제|[0-9]+일 전) · /);
  await expect(page.getByRole("button", { name: "다시 연결", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /다시 연결하고 오늘 식단 만들기/ })).toContainText("최신 상태를 확인한 뒤 오늘 식단을 계산해요.");

  await page.locator(".inventory-row").first().click();
  const detail = page.getByRole("dialog", { name: "시금치" });
  await expect(detail.locator(".detail-read-only-callout")).toBeVisible();
  await expect(detail.locator(".detail-read-only-callout")).toContainText("오프라인 상태라 변경할 수 없어요");
  await expect(detail.locator(".detail-actions-read-only")).toContainText("기록 기능은 잠시 쉬고 있어요");
  await expect(detail.locator(".detail-actions-read-only button")).toHaveCount(0);
  await expect(detail.locator(".storage-option").first()).toBeDisabled();
  await expect(detail.locator(".product-info-edit-button")).toBeDisabled();
  await expect(detail.locator(".detail-read-only-danger")).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(detail).toHaveCount(0);

  failDashboard = false;
  await page.getByRole("button", { name: "다시 연결", exact: true }).click();
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".inventory-row").first().click();
  const liveDetail = page.getByRole("dialog", { name: "시금치" });
  await expect(liveDetail.locator(".detail-read-only-callout")).toHaveCount(0);
  await expect(liveDetail.locator(".detail-actions-read-only")).toHaveCount(0);
  await expect(liveDetail.locator(".detail-actions button")).toHaveCount(2);
  await expect(liveDetail.locator(".storage-option").first()).toBeEnabled();
  await liveDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(liveDetail).toHaveCount(0);
});

test("account settings keeps local drafts until an explicit cross-device refresh", async ({ page }) => {
  let remoteChanged = false;
  let revisionCalls = 0;
  let preferenceCalls = 0;
  const currentRevision = () => remoteChanged ? 2 : 1;
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(currentRevision()),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...revisionHeaders() } });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-settings-refresh-e2e", email: "refresh@example.com", workspace_id: "account-settings-refresh-e2e", role: "user" }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify({ generated_at: "2026-09-09T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }),
    });
  });
  await page.route("**/api/dashboard/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision: currentRevision() }) });
  });
  await page.route("**/api/notification-preferences", async (route) => {
    if (route.request().method() === "GET") {
      preferenceCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ in_app_enabled: true, push_enabled: false, lead_days: 2, timezone: "Asia/Seoul", quiet_hours_start: null, quiet_hours_end: null }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/push/subscriptions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/integrations/notifications/worker/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-notification-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "알림 설정" });
  await expect(panel.getByRole("heading", { name: "알림 설정" })).toBeVisible();
  await expect(panel.getByLabel("알림 미리 확인 기간")).toHaveValue("2");
  await panel.getByLabel("알림 미리 확인 기간").fill("5");
  await panel.getByLabel("알림 미리 확인 기간").press("Tab");
  await expect.poll(() => preferenceCalls).toBeGreaterThan(0);
  const baselinePreferenceCalls = preferenceCalls;
  const baselineRevisionCalls = revisionCalls;

  await page.waitForTimeout(1000);
  remoteChanged = true;
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  const remoteRefresh = dialog.getByRole("alert").filter({ hasText: "다른 기기에서 계정 설정이 변경됐어요" });
  await expect(remoteRefresh).toBeVisible();
  await expect(remoteRefresh).toContainText("현재 입력 중인 설정은 유지하고 있어요");
  await expect(remoteRefresh.getByRole("button", { name: "최신 계정 설정 확인" })).toBeVisible();
  await expect(panel.getByLabel("알림 미리 확인 기간")).toHaveValue("5");
  expect(preferenceCalls).toBe(baselinePreferenceCalls);

  await remoteRefresh.getByRole("button", { name: "최신 계정 설정 확인" }).click();
  await expect.poll(() => preferenceCalls).toBeGreaterThan(baselinePreferenceCalls);
  await expect(panel.getByLabel("알림 미리 확인 기간")).toHaveValue("2");
  await expect(dialog.getByRole("alert").filter({ hasText: "다른 기기에서 계정 설정이 변경됐어요" })).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText("계정 설정을 최신 상태로 확인했어요");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("guest account settings also exposes the cross-device stale boundary", async ({ page }) => {
  let remoteChanged = false;
  let revisionCalls = 0;
  const currentRevision = () => remoteChanged ? 2 : 1;
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(currentRevision()),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...revisionHeaders() } });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "guest", workspace_id: "guest-settings-refresh-e2e", role: "guest" }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify({ generated_at: "2026-09-09T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }),
    });
  });
  await page.route("**/api/dashboard/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision: currentRevision() }) });
  });
  await page.route("**/api/notification-preferences", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ in_app_enabled: true, push_enabled: false, lead_days: 2, timezone: "Asia/Seoul", quiet_hours_start: null, quiet_hours_end: null }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/push/subscriptions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/integrations/notifications/worker/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog.getByRole("heading", { name: "내 식품을 안전하게 이어가기" })).toBeVisible();
  await dialog.locator(".account-notification-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "알림 설정" });
  await expect(panel.getByLabel("알림 미리 확인 기간")).toHaveValue("2");
  const baselineRevisionCalls = revisionCalls;

  await page.waitForTimeout(1000);
  remoteChanged = true;
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  const remoteRefresh = dialog.getByRole("alert").filter({ hasText: "다른 기기에서 계정 설정이 변경됐어요" });
  await expect(remoteRefresh).toBeVisible();
  await expect(remoteRefresh).toContainText("현재 입력 중인 설정은 유지하고 있어요");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("account settings exposes the receipt privacy erasure boundary", async ({ page }) => {
  let sourceRedacted = false;
  let eraseAttempts = 0;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-privacy-e2e", email: "privacy@example.com", workspace_id: "account-privacy-e2e", role: "user" }),
    });
  });
  await page.route("**/api/privacy/receipt-policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        raw_upload_retention: "transient",
        raw_upload_retention_days: 0,
        draft_metadata: "user_deletable",
        committed_receipt_behavior: "redact_source_preserve_inventory",
        message: "업로드한 원본 bytes는 처리 중에만 사용하고 저장하지 않습니다.",
      }),
    });
  });
  await page.route("**/api/receipts", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "receipt-privacy-e2e",
        status: "committed",
        purchased_at: "2026-09-01T13:20:00Z",
        merchant_name: "동네마트",
        stock_created: true,
        line_count: 2,
        source_redacted: sourceRedacted,
      }]),
    });
  });
  await page.route("**/api/receipts/receipt-privacy-e2e/privacy-erase", async (route) => {
    expect(JSON.parse(route.request().postData() ?? "{}")).toEqual({ confirm: true });
    eraseAttempts += 1;
    if (eraseAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "receipt_privacy_persistence_unavailable", detail: "영수증 원본 정보를 저장하지 못했습니다.", retryable: true, action: "retry_later" }),
      });
      return;
    }
    sourceRedacted = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ receipt_id: "receipt-privacy-e2e", status: "redacted_committed", inventory_preserved: true, raw_upload_retained: false, redacted_fields: ["source_filename", "raw_name"] }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-archive-disclosure > summary").click();
  const privacyPanel = dialog.getByRole("region", { name: "영수증 원본 관리" });
  await expect(privacyPanel.getByRole("heading", { name: "영수증 원본 관리" })).toBeVisible();
  const receiptRow = privacyPanel.locator(".receipt-privacy-row");
  await expect(receiptRow).toContainText("동네마트 · 2026년 9월 1일 영수증");
  await expect(receiptRow).toContainText("2026년 9월 1일 영수증");
  await expect(receiptRow).toContainText("원본 정보 보관 중");

  await receiptRow.getByRole("button", { name: "영수증 원본 정보 삭제" }).click();
  await expect(receiptRow.getByRole("alert")).toContainText("재고·거래 기록은 유지하고 파일 이름과 읽어낸 문자 내용만 삭제해요.");
  await receiptRow.getByRole("button", { name: "삭제 확인" }).click();

  await expect(privacyPanel.getByRole("alert").filter({ hasText: "기존 영수증 상태를 유지했어요" })).toBeVisible();
  await privacyPanel.getByRole("button", { name: "다시 시도" }).click();
  await expect(privacyPanel.getByRole("status")).toHaveText("영수증 원본 정보를 삭제했고 재고 기록은 유지했어요");
  await expect(receiptRow).toContainText("원본 정보 삭제됨");
  await expect(receiptRow.getByRole("button", { name: "영수증 원본 정보 삭제" })).toHaveCount(0);
});

test("account settings saves notification preferences and keeps push delivery explicit", async ({ page }) => {
  let preferences = { in_app_enabled: true, push_enabled: false, lead_days: 2, timezone: "Asia/Seoul", quiet_hours_start: null as string | null, quiet_hours_end: null as string | null };
  let updatePayload: Record<string, unknown> | null = null;
  let updateAttempts = 0;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-notification-e2e", email: "notification@example.com", workspace_id: "account-notification-e2e", role: "user" }) });
  });
  await page.route("**/api/notification-preferences", async (route) => {
    if (route.request().method() === "PUT") {
      updateAttempts += 1;
      updatePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      if (updateAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "notification_preferences_persistence_unavailable", detail: "알림 설정을 저장하지 못했습니다. 기존 설정을 유지했어요.", retryable: true, action: "retry_later" }),
        });
        return;
      }
      preferences = updatePayload as typeof preferences;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preferences) });
  });
  await page.route("**/api/push/subscriptions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/integrations/notifications/worker/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        workspace_id: "account-notification-e2e",
        worker_id: "notification-worker-e2e",
        last_tick_at: "2026-09-06T01:00:00Z",
        last_success_at: "2026-09-06T01:00:00Z",
        lease_acquired: true,
        push_configured: true,
        queued: 3,
        processed: 12,
        succeeded: 12,
        retried: 0,
        dead_lettered: 0,
        cancelled: 3,
        removed_subscriptions: 0,
        recovered_in_flight: 0,
        last_error: null,
      }]),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-notification-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "알림 설정" });
  await expect(panel.getByRole("heading", { name: "알림 설정" })).toBeVisible();
  await expect(panel.getByText("12건 전달 · 3건 읽음 후 취소")).toBeVisible();
  await expect(panel.getByLabel("알림 미리 확인 기간")).toHaveValue("2");
  const detectedTimezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (detectedTimezone && detectedTimezone !== "Asia/Seoul") {
    await expect(panel.getByRole("button", { name: "현재 기기 시간 사용" })).toBeVisible();
    await panel.getByRole("button", { name: "현재 기기 시간 사용" }).click();
    await expect(panel.getByLabel("알림 시간대")).toHaveValue(detectedTimezone);
  }
  await panel.getByLabel("알림 미리 확인 기간").fill("5");
  await panel.getByLabel("알림 시간대").selectOption("UTC");
  await panel.getByLabel("조용한 시간 시작").fill("22:00");
  await panel.getByLabel("조용한 시간 종료").fill("07:00");
  await panel.getByRole("button", { name: "알림 설정 저장" }).click();

  await expect(panel.getByRole("alert")).toContainText("기존 설정을 유지했어요");
  await panel.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect(panel.getByRole("status")).toHaveText("알림 설정을 저장했어요");
  expect(updateAttempts).toBe(2);
  expect(updatePayload).toEqual({ in_app_enabled: true, push_enabled: false, lead_days: 5, timezone: "UTC", quiet_hours_start: "22:00", quiet_hours_end: "07:00" });
  await expect(panel.getByRole("button", { name: "서버 설정 후 연결 가능" })).toBeDisabled();
  await expect(panel.getByText("푸시 발송은 사용자가 명시적으로 켜고")).toBeVisible();
  await expect(panel).not.toContainText("전달 worker");
  await expect(panel).not.toContainText("VAPID");
  await expect(panel).toContainText("푸시 전달 상태");
});

test("connected notification center keeps an unread item and offers retry after read persistence failure", async ({ page }) => {
  const notification = {
    id: "notification-read-retry",
    kind: "date_due",
    severity: "attention",
    title: "다시 확인할 날짜예요",
    message: "읽음 상태 저장이 실패해도 이 알림은 사라지지 않아야 해요.",
    canonical_name: "재시도 식품",
    food_id: null,
    due_date: "2026-09-08",
    source: "printed_date",
    action: "none",
    read_at: null,
    created_at: "2026-09-08T00:00:00Z",
  };
  let readAttempts = 0;
  await page.route("**/api/notifications**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ...notification, read_at: readAttempts > 1 ? "2026-09-08T00:05:00Z" : null }]) });
      return;
    }
    if (route.request().method() === "POST") {
      readAttempts += 1;
      if (readAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "notification_read_persistence_unavailable", detail: "알림 읽음 상태를 저장하지 못했습니다. 읽지 않은 상태를 유지했어요.", retryable: true, action: "retry_later" }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-08T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  const summary = dialog.getByRole("region", { name: "알림 요약" });
  await expect(summary).toContainText("확인할 알림 1개");
  await expect(summary).toContainText("전체 1개");
  await expect(dialog.getByRole("button", { name: `${notification.title}: ${notification.canonical_name}` })).toHaveAttribute("aria-describedby", "notification-status-notification-read-retry");
  await dialog.getByRole("button", { name: `${notification.title}: ${notification.canonical_name}` }).click();

  await expect(dialog.getByRole("alert")).toContainText("기존 읽지 않음 상태를 유지했어요");
  await expect(dialog.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => readAttempts).toBe(2);
  await expect(dialog.getByRole("heading", { name: "알림 기록" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
});

test("account settings downloads a redacted workspace export", async ({ page }) => {
  await page.route("**/api/account/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema_version: "rescue-meal-export-v1",
        exported_at: "2026-09-02T09:30:00Z",
        workspace_id: "account-export-e2e",
        inventory: [],
        receipt_summaries: [],
        storage_events: [],
        commit_transactions: [],
        meal_plans: [],
        multi_day_meal_plans: [],
        shopping_list: [],
        shopping_receive_operations: [],
        manual_food_operations: [],
        meal_preferences: { avoid_allergens: [] },
        notification_preferences: { in_app_enabled: true, push_enabled: false, lead_days: 2, timezone: "Asia/Seoul", quiet_hours_start: null, quiet_hours_end: null },
        push_subscriptions: [],
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-archive-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "내 데이터 내보내기" });
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "내 데이터 파일 다운로드" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("rescue-meal-export-2026-09-02.json");
  await expect(panel.getByRole("status")).toHaveText("내 식품 기록을 내보냈어요");
});

test("account settings explains an export rate limit without creating a download", async ({ page }) => {
  await page.route("**/api/account/export", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "60" },
      body: JSON.stringify({
        detail: {
          code: "account_export_rate_limited",
          detail: "데이터 내보내기 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          retryable: true,
          action: "retry_later",
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-archive-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "내 데이터 내보내기" });
  await panel.getByRole("button", { name: "내 데이터 파일 다운로드" }).click();

  await expect(panel.getByRole("alert")).toContainText("데이터 내보내기 요청이 많아요");
  await expect(panel.getByRole("status")).toHaveCount(0);
});

test("account settings explains export audit persistence failure without creating a download", async ({ page }) => {
  await page.route("**/api/account/export", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Retry-After": "1" },
      body: JSON.stringify({
        detail: {
          code: "account_export_audit_persistence_unavailable",
          detail: "데이터 내보내기 감사 기록을 저장하지 못했습니다.",
          retryable: true,
          action: "retry_later",
        },
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-archive-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "내 데이터 내보내기" });
  await panel.getByRole("button", { name: "내 데이터 파일 다운로드" }).click();

  await expect(panel.getByRole("alert")).toContainText("감사 기록을 저장하지 못했어요");
  await expect(panel.getByRole("alert")).toContainText("파일을 만들지 않고");
  await expect(panel.getByRole("status")).toHaveCount(0);
});

test("account settings changes the password and explains session rotation", async ({ page }) => {
  let changePayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-password-e2e", email: "password@example.com", workspace_id: "account-password-e2e", role: "user" }) });
  });
  await page.route("**/api/auth/password/change", async (route) => {
    changePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-password-e2e", email: "password@example.com", workspace_id: "account-password-e2e", role: "user", access_token: "ra1.rotated.account-password-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("button", { name: /비밀번호 변경/ }).first().click();
  const panel = dialog.getByRole("region", { name: "비밀번호 변경" });
  await panel.getByLabel("현재 비밀번호").fill("correct-horse-battery");
  await panel.getByRole("textbox", { name: "새 비밀번호", exact: true }).fill("new-correct-password");
  await panel.getByRole("textbox", { name: "새 비밀번호 확인", exact: true }).fill("new-correct-password");
  await panel.getByRole("button", { name: "비밀번호 변경 저장" }).click();

  await expect.poll(() => changePayload).toEqual({ current_password: "correct-horse-battery", new_password: "new-correct-password" });
  await expect(panel.getByRole("status")).toContainText("비밀번호를 변경했어요");
  await expect(panel.getByText("다른 기기의 기존 로그인은 다시 인증이 필요해요.")).toBeVisible();
});

test("account password change explains an auth rate limit response", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-password-rate-limit-e2e", email: "password-rate-limit@example.com", workspace_id: "account-password-rate-limit-e2e", role: "user" }) });
  });
  await page.route("**/api/auth/password/change", async (route) => {
    await route.fulfill({ status: 429, headers: { "Retry-After": "60", "Content-Type": "application/json" }, body: JSON.stringify({ detail: "요청이 너무 많습니다." }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("button", { name: /비밀번호 변경/ }).first().click();
  const panel = dialog.getByRole("region", { name: "비밀번호 변경" });
  await panel.getByLabel("현재 비밀번호").fill("correct-horse-battery");
  await panel.getByRole("textbox", { name: "새 비밀번호", exact: true }).fill("new-correct-password");
  await panel.getByRole("textbox", { name: "새 비밀번호 확인", exact: true }).fill("new-correct-password");
  await panel.getByRole("button", { name: "비밀번호 변경 저장" }).click();

  await expect(panel.getByRole("alert")).toContainText("시도 횟수가 많아요. 잠시 후 다시 비밀번호를 변경해 주세요.");
});

test("account settings requires an explicit confirmation before account deletion", async ({ page }) => {
  let deletePayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-delete-e2e", email: "delete@example.com", workspace_id: "account-delete-e2e", role: "user" }) });
  });
  await page.route("**/api/account/delete", async (route) => {
    deletePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "deleted", message: "계정과 해당 workspace의 기록을 삭제했습니다." }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("button", { name: /계정 삭제/ }).click();
  const panel = dialog.getByRole("region", { name: "계정 삭제" });
  const submit = panel.getByRole("button", { name: "계정과 데이터 영구 삭제", exact: true });
  await expect(submit).toBeDisabled();
  await panel.getByLabel("현재 비밀번호").fill("correct-horse-battery");
  await panel.getByRole("textbox", { name: "계정 삭제 확인 문구", exact: true }).fill("delete");
  await expect(submit).toBeDisabled();
  await panel.getByRole("textbox", { name: "계정 삭제 확인 문구", exact: true }).fill("DELETE");
  await expect(submit).toBeEnabled();
  await submit.click();

  expect(deletePayload).toEqual({ current_password: "correct-horse-battery", confirmation: "DELETE" });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText("계정과 기록을 삭제하고 새 게스트 기록 공간으로 전환했어요");
});

test("account deletion persistence failure exposes a typed retry with the same explicit payload", async ({ page }) => {
  let deleteAttempts = 0;
  const deletePayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-delete-retry-e2e", email: "delete-retry@example.com", workspace_id: "account-delete-retry-e2e", role: "user" }) });
  });
  await page.route("**/api/account/delete", async (route) => {
    deleteAttempts += 1;
    deletePayloads.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    if (deleteAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            code: "account_deletion_persistence_unavailable",
            detail: "계정 삭제를 완료하지 못했습니다. 삭제 상태를 유지했어요. 같은 화면에서 다시 시도해 주세요.",
            retryable: true,
            action: "retry_later",
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "deleted", message: "계정과 해당 workspace의 기록을 삭제했습니다." }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("button", { name: /계정 삭제/ }).click();
  const panel = dialog.getByRole("region", { name: "계정 삭제" });
  await panel.getByLabel("현재 비밀번호").fill("correct-horse-battery");
  await panel.getByRole("textbox", { name: "계정 삭제 확인 문구", exact: true }).fill("DELETE");
  await panel.getByRole("button", { name: "계정과 데이터 영구 삭제", exact: true }).click();

  const error = panel.getByRole("alert");
  await expect(error).toContainText("삭제 작업이 아직 끝나지 않았어요");
  await expect(error.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await error.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => deleteAttempts).toBe(2);
  expect(deletePayloads[1]).toEqual(deletePayloads[0]);
  await expect(dialog).toHaveCount(0);
});

test("interrupted account deletion stays discoverable for a retry after reload", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-delete-recovery-e2e", email: "recovery-delete@example.com", workspace_id: "account-delete-recovery-e2e", role: "user", account_status: "deleting" }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog.getByRole("alert")).toContainText("삭제 작업이 아직 끝나지 않았어요");
  await expect(dialog.getByRole("alert")).toContainText("다시 시도해 주세요");
  await expect(dialog.getByRole("button", { name: /계정 삭제/ })).toBeVisible();
});

test("account deletion explains an auth rate limit response", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-delete-rate-limit-e2e", email: "delete-rate-limit@example.com", workspace_id: "account-delete-rate-limit-e2e", role: "user" }) });
  });
  await page.route("**/api/account/delete", async (route) => {
    await route.fulfill({ status: 429, headers: { "Retry-After": "60", "Content-Type": "application/json" }, body: JSON.stringify({ detail: "요청이 너무 많습니다." }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("button", { name: /계정 삭제/ }).click();
  const panel = dialog.getByRole("region", { name: "계정 삭제" });
  await panel.getByLabel("현재 비밀번호").fill("correct-horse-battery");
  await panel.getByRole("textbox", { name: "계정 삭제 확인 문구", exact: true }).fill("DELETE");
  await panel.getByRole("button", { name: "계정과 데이터 영구 삭제", exact: true }).click();

  await expect(panel.getByRole("alert")).toHaveText("시도 횟수가 많아요. 잠시 후 계정 삭제를 다시 시도해 주세요.");
  await expect(panel.getByRole("alert").getByRole("button", { name: "다시 시도" })).toHaveCount(0);
});

test("login screen accepts a generic password reset request without exposing account existence", async ({ page }) => {
  let requestPayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "guest", workspace_id: "guest-recovery-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/password-reset/request", async (route) => {
    requestPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true, delivery_status: "accepted", message: "입력한 이메일이 등록되어 있고 발송 채널이 설정되어 있다면 비밀번호 재설정 안내를 보내요." }) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  const recovery = dialog.getByRole("region", { name: "비밀번호 재설정" });
  await recovery.getByRole("button", { name: /비밀번호를 잊으셨나요/ }).click();
  await recovery.getByRole("textbox", { name: "계정 이메일" }).fill("recover@example.com");
  await recovery.getByRole("button", { name: "재설정 안내 요청" }).click();

  expect(requestPayload).toEqual({ email: "recover@example.com" });
  await expect(recovery.getByRole("status")).toContainText("입력한 이메일이 등록되어 있고 발송 채널이 설정되어 있다면");
  await expect(recovery.getByRole("status")).not.toContainText("reset_token");
});

test("password reset request failure preserves the email and returns focus at a short viewport", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "guest", workspace_id: "guest-recovery-error-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/password-reset/request", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "temporary password reset failure" }) });
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  const recovery = dialog.getByRole("region", { name: "비밀번호 재설정" });
  await recovery.getByRole("button", { name: /비밀번호를 잊으셨나요/ }).click();
  const email = recovery.getByRole("textbox", { name: "계정 이메일" });
  await email.fill("recover-error@example.com");
  await recovery.getByRole("button", { name: "재설정 안내 요청" }).click();

  await expect(recovery.getByRole("alert")).toContainText("비밀번호 재설정 요청을 처리하지 못했어요");
  await expect(email).toHaveValue("recover-error@example.com");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "password-recovery-error");
  await expect(email).toBeFocused();
  const screenBox = await page.getByTestId("mobile-app-viewport").boundingBox();
  const requestBox = await recovery.getByRole("button", { name: "재설정 안내 요청" }).boundingBox();
  expect(screenBox, "mobile viewport has no bounding box").toBeTruthy();
  expect(requestBox, "password reset request action has no bounding box").toBeTruthy();
  expect(requestBox!.y + requestBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 12);
});

test("expired password reset link returns focus to the new password field at a short viewport", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "guest", workspace_id: "guest-reset-expired-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/password-reset/complete", async (route) => {
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "expired reset token" }) });
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?reset_token=expired-reset-token");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  const recovery = dialog.getByRole("region", { name: "비밀번호 재설정" });
  const password = recovery.getByRole("textbox", { name: "새 비밀번호", exact: true });
  await password.fill("expired-link-password");
  await recovery.getByRole("textbox", { name: "새 비밀번호 확인", exact: true }).fill("expired-link-password");
  await recovery.getByRole("button", { name: "새 비밀번호 저장" }).click();

  await expect(recovery.getByRole("alert")).toContainText("재설정 링크가 만료되었거나 이미 사용되었어요");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-describedby", "password-recovery-error");
  await expect(password).toBeFocused();
  const screenBox = await page.getByTestId("mobile-app-viewport").boundingBox();
  const saveBox = await recovery.getByRole("button", { name: "새 비밀번호 저장" }).boundingBox();
  expect(screenBox, "mobile viewport has no bounding box").toBeTruthy();
  expect(saveBox, "password reset save action has no bounding box").toBeTruthy();
  expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 12);
});

test("connected login failure preserves credentials and returns focus to the password field", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "guest", workspace_id: "guest-login-error-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "이메일 또는 비밀번호를 확인해 주세요." }) });
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  const email = dialog.getByRole("textbox", { name: "이메일" });
  const password = dialog.getByRole("textbox", { name: "비밀번호" });
  await email.fill("wrong@example.com");
  await password.fill("wrong-password");
  await dialog.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("이메일 또는 비밀번호를 확인해 주세요.");
  await expect(email).toHaveValue("wrong@example.com");
  await expect(password).toHaveValue("wrong-password");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-describedby", "account-auth-error");
  await expect(password).toBeFocused();
  const screenBox = await page.getByTestId("mobile-app-viewport").boundingBox();
  const loginBox = await dialog.getByRole("button", { name: "로그인", exact: true }).boundingBox();
  expect(screenBox, "mobile viewport has no bounding box").toBeTruthy();
  expect(loginBox, "login action has no bounding box").toBeTruthy();
  expect(loginBox!.y + loginBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 12);
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
});

test("registration conflict preserves credentials and returns focus to the email field at a short viewport", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "guest", workspace_id: "guest-register-error-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/register", async (route) => {
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "이미 가입된 이메일이에요." }) });
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  const email = dialog.getByRole("textbox", { name: "이메일" });
  const password = dialog.getByRole("textbox", { name: "비밀번호" });
  await email.fill("already@example.com");
  await password.fill("wrong-password");
  await dialog.getByRole("button", { name: "계정 만들기", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("이미 가입된 이메일이에요");
  await expect(email).toHaveValue("already@example.com");
  await expect(password).toHaveValue("wrong-password");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();
  const screenBox = await page.getByTestId("mobile-app-viewport").boundingBox();
  const registerBox = await dialog.getByRole("button", { name: "계정 만들기", exact: true }).boundingBox();
  expect(screenBox, "mobile viewport has no bounding box").toBeTruthy();
  expect(registerBox, "registration action has no bounding box").toBeTruthy();
  expect(registerBox!.y + registerBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 12);
});

test("account login screen does not mount workspace settings before a session is confirmed", async ({ page }) => {
  let settingsRequestCount = 0;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "로그인이 필요합니다." }) });
  });
  for (const pattern of ["**/api/storage-locations*", "**/api/notification-preferences*", "**/api/privacy/receipt-policy", "**/api/integrations/grocy/**"]) {
    await page.route(pattern, async (route) => {
      settingsRequestCount += 1;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "로그인이 필요합니다." }) });
    });
  }

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog.getByRole("tab", { name: "로그인" })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "알림 설정" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "내 데이터 내보내기" })).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "영수증 원본 관리" })).toHaveCount(0);
  expect(settingsRequestCount).toBe(0);
});

test("password reset link lets a user set a new password and receive a fresh account session", async ({ page }) => {
  let completePayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "guest", workspace_id: "guest-reset-link-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/password-reset/complete", async (route) => {
    completePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-reset-link-e2e", email: "recover@example.com", workspace_id: "account-reset-link-e2e", role: "user", access_token: "ra1.reset-link.account-reset-link-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-02T10:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }) });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/?reset_token=rt1.reset-token-value-abcdefghijklmnopqrstuvwxyz-0123456789");
  await expect.poll(() => page.url()).not.toContain("reset_token=");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  const recovery = dialog.getByRole("region", { name: "비밀번호 재설정" });
  await expect(recovery.getByRole("heading", { name: "새 비밀번호 설정" })).toBeVisible();
  await recovery.getByRole("textbox", { name: "새 비밀번호", exact: true }).fill("reset-correct-password");
  await recovery.getByRole("textbox", { name: "새 비밀번호 확인", exact: true }).fill("reset-correct-password");
  await recovery.getByRole("button", { name: "새 비밀번호 저장" }).click();

  expect(completePayload).toEqual({ token: "rt1.reset-token-value-abcdefghijklmnopqrstuvwxyz-0123456789", new_password: "reset-correct-password" });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("계정에 연결했어요");
});

test("connected notification center marks a date reminder and opens its food", async ({ page }) => {
  const notification = {
    id: "food-date:chicken-1:use_by:2026-09-02",
    kind: "date_due",
    severity: "urgent",
    title: "오늘 확인할 날짜예요",
    message: "닭가슴살의 포장에 표시된 소비기한이 오늘(9월 2일)이에요. 포장 상태와 보관 방법을 확인하세요.",
    canonical_name: "닭가슴살",
    food_id: "chicken-1",
    due_date: "2026-09-02",
    source: "printed_date",
    action: "food",
    read_at: null,
    created_at: "2026-09-02T00:00:00Z",
  };
  await page.route("**/api/notifications**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-02T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByText("오늘 확인할 날짜예요")).toBeVisible();
  await dialog.getByRole("button", { name: "오늘 확인할 날짜예요: 닭가슴살" }).click();
  const detail = page.getByRole("dialog", { name: "닭가슴살" });
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "알림 기록" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "오늘 확인할 날짜예요: 닭가슴살" })).toBeFocused();
});

test("connected external source notification opens provenance history and returns to the exact row", async ({ page }) => {
  const food = {
    id: "source-notification-food",
    canonical_name: "출처 확인 식품",
    display_name: "출처 확인 식품",
    brand: "출처 브랜드",
    quantity: 1,
    unit: "팩",
    storage_type: "refrigerated",
    opened: false,
    product_provenance: {
      source: "open_food_facts",
      source_url: "https://example.test/source-notification-food",
      confidence: 0.82,
      note: "공개 상품 후보; 개별 라벨 확인 필요",
      storage_hint: "refrigerated",
      source_freshness: "current",
    },
    date_assertion: {
      kind: "use_by",
      value: "2099-09-30",
      display_label: "2099-09-30",
      source: "label_ocr",
      source_detail: "포장지 소비기한",
      confidence: 0.95,
      user_confirmed: true,
      applicable_storage_type: "refrigerated",
      storage_condition_text: "냉장 보관",
    },
    estimated_use_first_window: null,
    priority: 1,
    category: "채소",
    image_path: "/assets/food/tomato.png",
    note: "상품 출처와 포장지 날짜를 함께 확인해 주세요.",
  };
  const notification = {
    id: "source-notification-change",
    kind: "grocy_sync",
    severity: "attention",
    title: "상품 연결을 확인해 주세요",
    message: "출처 확인 식품의 외부 상품 연결 상태가 바뀌었어요. 상품 후보와 포장지를 다시 확인해 주세요.",
    canonical_name: "출처 확인 식품",
    food_id: food.id,
    due_date: null,
    source: "grocy_outbox",
    action: "food",
    read_at: null,
    created_at: "2026-09-19T10:15:00Z",
  };
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-19T10:15:00Z", food_count: 1, rescue_count: 1, rescue_queue: [food], inventory: [food] }) });
  });
  await page.route("**/api/notifications*", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-19T10:16:00Z" }) });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/foods/${food.id}/product-provenance/events*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      id: "source-notification-history-1",
      food_id: food.id,
      action: "applied",
      actor_id: "guest",
      actor_role: "guest",
      occurred_at: "2026-09-19T10:10:00Z",
      before: null,
      after: food.product_provenance,
      reason: "외부 상품 연결 상태가 변경되어 출처 후보를 다시 확인했습니다.",
    }]) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  const notificationRow = notifications.getByRole("button", { name: "상품 연결을 확인해 주세요: 출처 확인 식품" });
  await expect(notificationRow).toContainText("외부 상품 연결 상태가 바뀌었어요");
  await expect(notificationRow).toContainText("연동 상태");
  await notificationRow.click();

  const detail = page.getByRole("dialog", { name: "출처 확인 식품" });
  await expect(detail.getByRole("group", { name: "상품 정보 출처" })).toContainText("공개 상품 DB");
  await detail.locator("details.detail-history-disclosure").locator("summary").click();
  await expect(detail.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("상품 출처 적용");
  await expect(detail.getByRole("group", { name: "상품 정보 변경 기록" })).toContainText("게스트 기록");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notifications).toBeVisible();
  await expect(notificationRow).toBeFocused();
  await expect(notificationRow).toHaveAttribute("data-notification-returned", "true");
});

test("connected notification center exposes the external sync lifecycle at a glance", async ({ page }) => {
  const syncNotifications = [
    {
      id: "sync-notification-attention",
      kind: "grocy_sync",
      sync_state: "action_required",
      severity: "attention",
      title: "외부 상품 연결이 필요해요",
      message: "두부의 외부 상품 연결을 확인해 주세요.",
      canonical_name: "두부",
      food_id: null,
      due_date: null,
      source: "grocy_outbox",
      action: "grocy",
      read_at: null,
      created_at: "2026-09-19T10:20:00Z",
    },
    {
      id: "sync-notification-queued",
      kind: "grocy_sync",
      sync_state: "queued",
      severity: "info",
      title: "외부 재고 반영을 기다리는 중이에요",
      message: "시금치: 서버에 저장한 작업이 외부 재고 반영 대기열에 있어요.",
      canonical_name: "시금치",
      food_id: null,
      due_date: null,
      source: "grocy_outbox",
      action: "grocy",
      read_at: null,
      created_at: "2026-09-19T10:21:00Z",
    },
    {
      id: "sync-notification-applied",
      kind: "grocy_sync",
      sync_state: "applied",
      severity: "info",
      title: "외부 재고에 반영했어요",
      message: "닭가슴살: 외부 재고 반영이 완료됐어요.",
      canonical_name: "닭가슴살",
      food_id: null,
      due_date: null,
      source: "grocy_outbox",
      action: "grocy",
      read_at: "2026-09-19T10:22:00Z",
      created_at: "2026-09-19T10:22:00Z",
    },
  ];
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(syncNotifications) });
      return;
    }
    if (request.method() === "POST") {
      const id = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
      const item = syncNotifications.find((notification) => notification.id === id) ?? syncNotifications[0];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...item, read_at: "2026-09-19T10:23:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  const homeSyncSummary = page.getByRole("button", { name: /외부 상품·보관 위치 연결을 확인해 주세요/ });
  await expect(homeSyncSummary).toBeVisible();
  await homeSyncSummary.click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.locator(".notification-sync-summary")).toBeVisible();
  await expect(dialog.getByRole("region", { name: "알림 요약" })).toContainText("외부 연동의 다음 행동");
  const attentionRow = dialog.locator('[data-notification-id="sync-notification-attention"]');
  await expect(attentionRow).toBeFocused();
  await attentionRow.click();
  const returnedAccount = page.getByRole("dialog", { name: "내 계정" });
  await expect(returnedAccount).toBeVisible();
  await expect(returnedAccount.getByText("알림에서 이어서 확인 중이에요", { exact: true })).toBeVisible();
  await returnedAccount.getByRole("button", { name: "알림으로 돌아가기", exact: true }).click();
  await expect(returnedAccount).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(attentionRow).toBeFocused();
  await expect(dialog.locator('[data-notification-sync-summary="action_required"]')).toContainText("확인 필요1");
  await expect(dialog.locator('[data-notification-sync-summary="waiting"]')).toContainText("처리 대기1");
  await expect(dialog.locator('[data-notification-sync-summary="applied"]')).toContainText("반영 완료1");
  await expect(dialog.locator('[data-notification-sync-state="action_required"]')).toHaveText("확인 필요");
  await expect(dialog.locator('[data-notification-sync-state="queued"]')).toHaveText("처리 대기");
  await expect(dialog.locator('[data-notification-sync-state="applied"]')).toHaveText("반영 완료");
  await expect(dialog.getByText("외부 재고 반영을 기다리는 중이에요", { exact: true })).toBeVisible();
  const attentionSummary = dialog.locator('[data-notification-sync-summary="action_required"]');
  await expect(attentionSummary).toHaveAccessibleName("확인 필요 1건 · 해당 알림으로 이동");
  await attentionSummary.click();
  await expect(attentionRow).toBeFocused();
  await dialog.locator('[data-notification-sync-summary="waiting"]').click();
  await expect(dialog.locator('[data-notification-id="sync-notification-queued"]')).toBeFocused();
  await dialog.locator('[data-notification-sync-summary="applied"]').click();
  await expect(dialog.locator('[data-notification-id="sync-notification-applied"]')).toBeFocused();
});

test("connected external-sync notification opens the external inventory settings panel", async ({ page }) => {
  const notification = {
    id: "grocy-mapping-notification",
    kind: "grocy_sync",
    severity: "attention",
    title: "외부 상품 연결이 필요해요",
    message: "출처 확인 식품을 외부 재고에 반영하려면 상품 연결을 확인해 주세요.",
    canonical_name: "출처 확인 식품",
    food_id: null,
    due_date: null,
    source: "grocy_outbox",
    action: "grocy",
    read_at: null,
    created_at: "2026-09-19T10:20:00Z",
    sync_record_id: "outbox-notification-dead-letter",
  };
  const deadLetter = {
    id: "outbox-notification-dead-letter",
    operation: "consume",
    aggregate_id: "source-notification-food",
    idempotency_key: "storage-event:source-notification-food",
    canonical_name: "출처 확인 식품",
    grocy_product_id: 88,
    quantity: 1,
    unit: "팩",
    spoiled: false,
    from_grocy_location_id: 10,
    to_grocy_location_id: null,
    payload: { storage_event_id: "event-source-notification-food" },
    status: "dead_letter",
    attempts: 3,
    last_error: "외부 상품 연결 확인이 필요합니다.",
    last_dead_letter_error: null,
    manual_retry_count: 0,
    last_retry_note: null,
    last_retry_at: null,
    grocy_transaction_id: null,
    created_at: "2026-09-19T10:18:00Z",
    updated_at: "2026-09-19T10:19:00Z",
  };
  let grocyOutbox: Array<Record<string, unknown>> = [deadLetter];
  let workerProcessed = 1;
  let notificationRead = false;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-grocy-notification", email: "grocy-notification@example.com", workspace_id: "account-grocy-notification", role: "user" }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-19T10:20:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: [] }) });
  });
  await page.route("**/api/notifications**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (route.request().method() === "POST") {
      notificationRead = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-19T10:21:00Z" }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/integrations/grocy/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, status: "ok", version: "4.0.0", detail: "외부 재고 서비스 연결 상태를 확인했어요." }) });
  });
  await page.route("**/api/integrations/grocy/location-mappings", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/integrations/grocy/mappings", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/integrations/grocy/outbox", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grocyOutbox) });
  });
  await page.route("**/api/integrations/grocy/outbox/*/retry", async (route) => {
    grocyOutbox = [{ ...deadLetter, status: "pending", attempts: 0, last_error: null, manual_retry_count: 1, last_retry_note: "사용자가 설정 화면에서 재시도" }];
    workerProcessed = 2;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(grocyOutbox[0]) });
  });
  await page.route("**/api/integrations/grocy/worker/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ workspace_id: "account-grocy-notification", worker_id: "worker-notification", last_tick_at: "2026-09-19T10:19:00Z", last_success_at: "2026-09-19T10:19:00Z", lease_acquired: true, grocy_configured: true, scanned: 1, reconciliation_marked: 0, processed: workerProcessed, succeeded: workerProcessed, retried: workerProcessed > 1 ? 1 : 0, dead_lettered: workerProcessed > 1 ? 0 : 1, blocked: 0, last_error: null }]) });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  await notifications.getByRole("button", { name: "외부 상품 연결이 필요해요: 출처 확인 식품" }).click();
  const account = page.getByRole("dialog", { name: "내 계정" });
  await expect.poll(() => notificationRead).toBe(true);
  await expect(account.getByRole("heading", { name: "외부 재고 연동" })).toBeVisible();
  await expect(account.getByText("외부 재고 서비스 연결 상태를 확인했어요.", { exact: true })).toBeVisible();
  await expect(account.getByText("상세 연결 설정", { exact: true })).toBeVisible();
  await expect(account.locator('[data-grocy-outbox-details="outbox-notification-dead-letter"]')).toHaveAttribute("open", "");
  await expect(account.locator('[data-outbox-detail-id="outbox-notification-dead-letter"]')).toContainText("Rescue Meal 작업 ID");
  await expect(account.getByText("재확인이 필요한 실패 작업", { exact: true })).toBeVisible();
  await expect(account.locator(".grocy-dead-letter-row")).toContainText("출처 확인 식품");
  await account.getByRole("button", { name: "재시도" }).click();
  await expect(account.getByRole("status")).toContainText("출처 확인 식품 소비 작업을 재시도 대기로 돌렸어요");
  await expect(account.getByText("재확인이 필요한 실패 작업", { exact: true })).toHaveCount(0);
  await expect(account.getByText("막힌 작업 없음 · 1건 처리 대기", { exact: true })).toBeVisible();
  await expect(account.getByText(/마지막 확인 .*2건 처리/)).toBeVisible();
  await account.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notifications).toBeVisible();
  const readRow = notifications.getByRole("button", { name: "외부 상품 연결이 필요해요: 출처 확인 식품" });
  await expect(readRow).toHaveClass(/notification-row-read/);
  await expect(readRow).toBeFocused();
  await expect(readRow).toHaveAttribute("data-notification-returned", "true");
});

test("connected applied notification focuses its completed outbox detail", async ({ page }) => {
  const appliedFood = {
    id: "chicken-1",
    canonical_name: "닭가슴살",
    display_name: "닭가슴살",
    brand: "무항생제 닭가슴살",
    quantity: 2,
    unit: "팩",
    storage_type: "frozen",
    storage_location_id: null,
    opened: false,
    opened_at: null,
    date_assertion: { kind: "use_by", value: "2099-09-30", display_label: "2099-09-30", source: "user_input", source_detail: "사용자 확인 소비기한", confidence: 1, user_confirmed: true, applicable_storage_type: "frozen", storage_condition_text: "냉동 보관" },
    estimated_use_first_window: null,
    priority: 1,
    category: "육류·수산",
    image_path: "/assets/food/chicken.png",
    note: "외부 재고 반영 작업과 연결된 식품 기록",
  };
  const notification = {
    id: "grocy-applied-notification",
    kind: "grocy_sync",
    sync_state: "applied",
    sync_record_id: "outbox-applied-notification",
    severity: "info",
    title: "외부 재고에 반영했어요",
    message: "닭가슴살: 외부 재고 반영이 완료됐어요.",
    canonical_name: "닭가슴살",
    food_id: null,
    due_date: null,
    source: "grocy_outbox",
    action: "grocy",
    read_at: null,
    created_at: "2026-09-19T11:02:00Z",
  };
  const succeeded = {
    id: "outbox-applied-notification",
    operation: "consume",
    aggregate_id: "chicken-1",
    idempotency_key: "storage-event:applied-notification",
    canonical_name: "닭가슴살",
    grocy_product_id: 88,
    quantity: 1,
    unit: "팩",
    spoiled: false,
    from_grocy_location_id: 10,
    to_grocy_location_id: null,
    payload: { storage_event_id: "event-applied-notification", food_id: "chicken-1" },
    status: "succeeded",
    status_history: [
      { status: "blocked", occurred_at: "2026-09-19T11:00:00Z", source: "created", note: "상품 연결 확인이 필요했어요." },
      { status: "pending", occurred_at: "2026-09-19T11:00:30Z", source: "mapping", note: null },
      { status: "in_flight", occurred_at: "2026-09-19T11:01:00Z", source: "worker", note: null },
      { status: "succeeded", occurred_at: "2026-09-19T11:02:00Z", source: "worker", note: "외부 작업 #grocy-applied-notification-tx" },
    ],
    attempts: 1,
    last_error: null,
    last_dead_letter_error: null,
    manual_retry_count: 0,
    last_retry_note: null,
    last_retry_at: null,
    in_flight_started_at: null,
    last_in_flight_started_at: null,
    reconciliation_count: 0,
    last_reconciliation_decision: null,
    last_reconciliation_note: null,
    last_reconciled_at: null,
    grocy_transaction_id: "grocy-applied-notification-tx",
    created_at: "2026-09-19T11:00:00Z",
    updated_at: "2026-09-19T11:02:00Z",
  };
  let notificationRead = false;
  let historyRemote = false;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-applied-notification", email: "applied-notification@example.com", workspace_id: "account-applied-notification", role: "user" }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-19T11:02:00Z", food_count: 1, rescue_count: 1, rescue_queue: [appliedFood], inventory: [appliedFood], storage_locations: [] }) });
  });
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      id: "applied-notification-storage-event",
      food_id: "chicken-1",
      event_type: "consumed",
      from_storage_type: "frozen",
      to_storage_type: null,
      quantity: 1,
      occurred_at: "2026-09-19T11:02:00Z",
      source: "user_input",
      created_child_food_id: null,
      grocy_sync_status: historyRemote ? "succeeded" : "queued",
      grocy_outbox_id: "outbox-applied-notification",
      grocy_transaction_id: historyRemote ? "grocy-applied-notification-tx" : null,
      grocy_status_history: historyRemote
        ? [{ status: "pending", occurred_at: "2026-09-19T11:01:00Z", source: "created", note: null }, { status: "succeeded", occurred_at: "2026-09-19T11:02:00Z", source: "worker", note: "외부 작업 #grocy-applied-notification-tx" }]
        : [{ status: "pending", occurred_at: "2026-09-19T11:01:00Z", source: "created", note: null }],
    }]) });
  });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (request.method() === "POST") {
      notificationRead = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-19T11:03:00Z" }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/shopping-list", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/receipts", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/integrations/grocy/status", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, status: "ok", version: "4.0.0", detail: "외부 재고 서비스 연결 상태를 확인했어요." }) }); });
  await page.route("**/api/integrations/grocy/location-mappings", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/integrations/grocy/mappings", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/integrations/grocy/outbox", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([succeeded]) }); });
  await page.route("**/api/integrations/grocy/worker/status", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }); });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  await notifications.getByRole("button", { name: "외부 재고에 반영했어요: 닭가슴살" }).click();
  const account = page.getByRole("dialog", { name: "내 계정" });
  await expect.poll(() => notificationRead).toBe(true);
  const detail = account.locator('[data-grocy-outbox-details="outbox-applied-notification"]');
  await expect(detail).toHaveAttribute("open", "");
  await expect(detail.locator('[data-outbox-detail-id="outbox-applied-notification"]')).toContainText("외부 작업 #grocy-applied-notification-tx");
  await expect(detail.locator('[data-outbox-timeline-step="food-record"]')).toContainText("식품 상세 최근 기록과 연결돼요");
  await expect(detail.locator('[data-outbox-timeline-step="external-inventory"]')).toContainText("반영 완료");
  await detail.locator('[data-outbox-timeline-step="external-inventory"]').locator("summary").click();
  await expect(detail.locator('[data-outbox-evidence-step="external-inventory"]')).toContainText("변경 주체 · 자동 동기화");
  await expect(detail.locator('[data-outbox-evidence-step="external-inventory"]')).toContainText("외부 작업 #grocy-applied-notification-tx");
  await expect(detail.locator('[data-outbox-status-history="outbox-applied-notification"]')).toContainText("작업 타임라인");
  await expect(detail.locator('[data-outbox-status-history-entry="blocked"]')).toContainText("상품 연결 확인이 필요했어요.");
  await detail.getByRole("button", { name: "닭가슴살 작업 타임라인의 식품 기록 보기" }).click();
  const foodDetail = page.getByRole("dialog", { name: "닭가슴살" });
  await expect(foodDetail).toBeVisible();
  const linkedHistoryRow = foodDetail.locator('[data-history-sync-highlighted="true"]');
  await expect(linkedHistoryRow).toHaveCount(1);
  const linkedEvidence = foodDetail.locator('[data-history-sync-evidence="applied-notification-storage-event"]');
  await expect(linkedEvidence).toHaveAttribute("open", "");
  await expect(linkedEvidence.locator("summary")).toBeFocused();
  await linkedEvidence.locator("summary").click();
  await expect(linkedEvidence).not.toHaveAttribute("open", "");
  await expect(linkedHistoryRow.locator('[data-history-sync-status="queued"]')).toHaveText("외부 반영 대기");
  historyRemote = true;
  const workspaceKey = await page.evaluate(() => {
    const token = window.localStorage.getItem("rescue-meal.guest-token") ?? "";
    const parts = token.split(".");
    return parts[0] === "rm1" && parts[1] ? `guest-${parts[1]}` : "anonymous";
  });
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-applied-storage-history", sourceId: "worker-tab", workspaceKey: key, channels: ["dashboard"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await expect(linkedHistoryRow.locator('[data-history-sync-status="succeeded"]')).toHaveText("외부 반영 완료");
  await expect(linkedHistoryRow.locator('[data-history-sync-reference="outbox-applied-notification"]')).toHaveText("외부 작업 #grocy-applied-notification-tx");
  await expect(linkedEvidence).not.toHaveAttribute("open", "");
  await expect(linkedEvidence.locator("summary")).toBeFocused();
  await linkedEvidence.locator("summary").click();
  await expect(linkedEvidence).toHaveAttribute("open", "");
  const focusedStatusEvidence = linkedEvidence.locator('[data-history-sync-evidence-status="succeeded"]');
  await focusedStatusEvidence.focus();
  await expect(focusedStatusEvidence).toBeFocused();
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-applied-status-evidence", sourceId: "worker-tab", workspaceKey: key, channels: ["dashboard"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await expect(focusedStatusEvidence).toBeFocused();
  const parentHistoryDisclosure = foodDetail.locator("details.detail-history-disclosure");
  await expect(parentHistoryDisclosure).toHaveAttribute("open", "");
  await parentHistoryDisclosure.locator(":scope > summary").click();
  await expect(parentHistoryDisclosure).not.toHaveAttribute("open", "");
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-after-manual-history-close", sourceId: "worker-tab", workspaceKey: key, channels: ["dashboard"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await expect(parentHistoryDisclosure).not.toHaveAttribute("open", "");
  await parentHistoryDisclosure.locator(":scope > summary").click();
  await expect(parentHistoryDisclosure).toHaveAttribute("open", "");
  await foodDetail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notifications.getByRole("button", { name: "외부 재고에 반영했어요: 닭가슴살" })).toBeFocused();
});

test("connected notification center offers a latest-inventory recovery when its food is stale", async ({ page }) => {
  const notification = {
    id: "stale-food-notification",
    kind: "storage_mismatch",
    severity: "attention",
    title: "확인할 식품이 있어요",
    message: "다른 기기에서 식품 상태가 바뀌었어요.",
    canonical_name: "이미 사라진 식품",
    food_id: "missing-food-from-dashboard",
    due_date: null,
    source: "storage_condition",
    action: "food",
    read_at: null,
    created_at: "2026-09-17T00:00:00Z",
  };
  await page.route("**/api/notifications*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-17T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await dialog.getByRole("button", { name: "이미 사라진 식품 확인이 필요해요: 이미 사라진 식품" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("알림에 연결된 식품을 최신 목록에서 찾지 못했어요.");
  await expect(page.getByRole("status").getByRole("button", { name: "최신 재고 확인" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "이미 사라진 식품" })).toHaveCount(0);
});

test("queued notification refresh survives navigation into a food detail", async ({ page }) => {
  let remoteChanged = false;
  let listCalls = 0;
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
  const initialNotification = {
    id: "notification-read-navigation",
    kind: "storage_mismatch",
    severity: "attention",
    title: "보관 조건을 확인해 주세요",
    message: "닭가슴살의 보관 조건을 확인하세요.",
    canonical_name: "닭가슴살",
    food_id: "chicken-1",
    due_date: null,
    source: "storage_condition",
    action: "food",
    read_at: null,
    created_at: "2026-09-17T00:00:00Z",
  };
  const remoteNotification = {
    ...initialNotification,
    title: "최신 보관 조건 알림",
    message: "읽음 처리 중 다른 기기 변경을 반영했어요.",
  };
  await page.route("**/api/notifications*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/revision") && route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: remoteChanged ? 2 : 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      listCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([remoteChanged ? remoteNotification : initialNotification]) });
      return;
    }
    if (route.request().method() === "POST") {
      markReadStarted();
      await readGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...initialNotification, read_at: "2026-09-17T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notificationDialog = page.getByRole("dialog", { name: "알림" });
  await notificationDialog.getByRole("button", { name: `${initialNotification.title}: ${initialNotification.canonical_name}` }).click();
  await markReadStarted;
  await expect(page.getByRole("dialog", { name: "닭가슴살" })).toBeVisible();

  remoteChanged = true;
  const workspaceKey = await page.evaluate(() => {
    const token = window.localStorage.getItem("rescue-meal.guest-token") ?? "";
    const parts = token.split(".");
    return parts[0] === "rm1" && parts[1] ? `guest-${parts[1]}` : "anonymous";
  });
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-notification-readback", sourceId: "remote-notification-tab", workspaceKey: key, channels: ["notifications"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await page.waitForTimeout(100);
  releaseRead();
  await expect.poll(() => listCalls).toBeGreaterThan(1);

  await page.getByRole("dialog", { name: "닭가슴살" }).getByRole("button", { name: "닫기", exact: true }).click();
  const refreshedDialog = page.getByRole("dialog", { name: "알림" });
  await expect(refreshedDialog.getByRole("button", { name: `${remoteNotification.title}: ${remoteNotification.canonical_name}` })).toBeVisible();
  await expect(refreshedDialog.getByRole("button", { name: `${remoteNotification.title}: ${remoteNotification.canonical_name}` })).toBeFocused();
  await expect(refreshedDialog.getByRole("button", { name: `${remoteNotification.title}: ${remoteNotification.canonical_name}` })).toHaveAttribute("data-notification-returned", "true");
});

test("storage mutation and notification readback converge while a food detail is open", async ({ page }) => {
  let storageMoved = false;
  let notificationCalls = 0;
  let dashboardCalls = 0;
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
  const mismatchNotification = {
    id: "storage-read-converge-mismatch",
    kind: "storage_mismatch",
    severity: "attention",
    title: "보관 조건을 확인해 주세요",
    message: "닭가슴살은 냉장으로 옮긴 뒤 다시 확인해야 해요.",
    canonical_name: "닭가슴살",
    food_id: "chicken-1",
    due_date: null,
    source: "storage_condition",
    action: "food",
    read_at: null,
    created_at: "2026-09-17T00:00:00Z",
  };
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    storageMoved = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "storage-read-converge-event", food_id: "chicken-1", event_type: "moved", from_storage_type: "frozen", to_storage_type: "refrigerated", quantity: 2, occurred_at: "2026-09-17T00:05:00Z", source: "user_input", created_child_food_id: null, meal_plan_id: null, grocy_sync_status: "not_configured" }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    dashboardCalls += 1;
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    if (storageMoved) {
      const update = (items: unknown) => Array.isArray(items)
        ? items.map((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === "chicken-1"
          ? { ...(item as Record<string, unknown>), storage_type: "refrigerated", storage_location_id: null }
          : item)
        : items;
      payload.inventory = update(payload.inventory);
      payload.rescue_queue = update(payload.rescue_queue);
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.route("**/api/notifications*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/revision") && route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: storageMoved ? 2 : 1 }) });
      return;
    }
    if (route.request().method() === "GET") {
      notificationCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(storageMoved ? [] : [mismatchNotification]) });
      return;
    }
    if (route.request().method() === "POST") {
      markReadStarted();
      await readGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...mismatchNotification, read_at: "2026-09-17T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  await notifications.getByRole("button", { name: `${mismatchNotification.title}: ${mismatchNotification.canonical_name}` }).click();
  await markReadStarted;

  const detail = page.getByRole("dialog", { name: "닭가슴살" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "냉장", exact: true }).click();
  await detail.locator(".detail-actions .primary-sheet-button").click();
  await expect.poll(() => storageMoved).toBe(true);
  await expect.poll(() => dashboardCalls).toBeGreaterThan(1);

  releaseRead();
  await expect.poll(() => notificationCalls).toBeGreaterThan(1);
  await expect(page.locator(".priority-card").filter({ hasText: "닭가슴살" }).locator(".storage-pill")).toHaveText("냉장");
  const refreshedNotifications = page.getByRole("dialog", { name: "알림" });
  await expect(refreshedNotifications).toBeVisible();
  await expect(refreshedNotifications.getByText("지금 확인할 알림이 없어요")).toBeVisible();
  await expect(refreshedNotifications.locator(".notification-summary")).toBeFocused();
});

test("connected open food detail refreshes the linked sync history after a remote worker mutation", async ({ page }) => {
  let workerFinished = false;
  await page.route("**/api/foods/chicken-1/storage-events", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "remote-worker-storage-event",
        food_id: "chicken-1",
        event_type: "moved",
        from_storage_type: "frozen",
        to_storage_type: "refrigerated",
        quantity: 2,
        occurred_at: "2026-09-19T12:00:00Z",
        source: "user_input",
        created_child_food_id: null,
        grocy_sync_status: workerFinished ? "succeeded" : "queued",
        grocy_outbox_id: "outbox-remote-worker-storage-event",
        grocy_transaction_id: workerFinished ? "grocy-remote-worker-tx" : null,
        grocy_status_history: workerFinished
          ? [{ status: "pending", occurred_at: "2026-09-19T12:00:00Z", source: "created", note: null }, { status: "succeeded", occurred_at: "2026-09-19T12:02:00Z", source: "worker", note: "외부 작업 #grocy-remote-worker-tx" }]
          : [{ status: "pending", occurred_at: "2026-09-19T12:00:00Z", source: "created", note: null }],
      }]),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".priority-card").filter({ hasText: "닭가슴살" }).click();
  const detail = page.getByRole("dialog", { name: "닭가슴살" });
  await detail.locator("details.detail-history-disclosure").locator("summary").click();
  await expect(detail.locator('[data-history-sync-status="queued"]')).toHaveText("외부 반영 대기");
  const detailSheetContent = detail.locator(".sheet-content");
  const preservedHistoryScrollTop = await detailSheetContent.evaluate((element) => {
    const target = Math.min(80, Math.max(0, element.scrollHeight - element.clientHeight));
    element.scrollTop = target;
    return element.scrollTop;
  });

  workerFinished = true;
  const workspaceKey = await page.evaluate(() => {
    const token = window.localStorage.getItem("rescue-meal.guest-token") ?? "";
    const parts = token.split(".");
    return parts[0] === "rm1" && parts[1] ? `guest-${parts[1]}` : "anonymous";
  });
  await page.evaluate((key) => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-worker-storage-history", sourceId: "worker-tab", workspaceKey: key, channels: ["dashboard"] });
    window.setTimeout(() => channel.close(), 0);
  }, workspaceKey);
  await expect.poll(async () => detail.locator('[data-history-sync-status="succeeded"]').count()).toBe(1);
  await expect(detail.locator('[data-history-sync-reference="outbox-remote-worker-storage-event"]')).toHaveText("외부 작업 #grocy-remote-worker-tx");
  await expect(detail.getByRole("status")).toContainText("외부 반영 완료 상태로 업데이트됐어요.");
  await expect.poll(() => detailSheetContent.evaluate((element) => element.scrollTop)).toBe(preservedHistoryScrollTop);
});

test("connected workspace mutation refreshes an open notification center in another tab", async ({ page, context }) => {
  const notification = {
    id: "cross-tab-notification",
    kind: "date_due",
    severity: "urgent",
    title: "다른 탭에서 확인할 날짜예요",
    message: "다른 탭에서 읽으면 이 화면도 바로 갱신돼요.",
    canonical_name: "교차 탭 식품",
    food_id: null,
    due_date: "2026-09-06",
    source: "printed_date",
    action: "none",
    read_at: null,
    created_at: "2026-09-06T00:00:00Z",
  };
  let readAt: string | null = null;
  let readRequestCount = 0;
  await context.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-06T00:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }) });
  });
  await context.route("**/api/notifications**", async (route) => {
    if (route.request().method() === "POST") readRequestCount += 1;
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ ...notification, read_at: readAt }]) });
      return;
    }
    if (route.request().method() === "POST") {
      readAt = "2026-09-06T00:05:00Z";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: readAt }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const firstDialog = page.getByRole("dialog", { name: "알림" });
  await expect(firstDialog.getByRole("button", { name: "모두 읽음" })).toBeVisible();

  const secondPage = await context.newPage();
  try {
    await secondPage.goto("/");
    await expect(secondPage.locator(".connection-pill")).toHaveText("서버 연결됨");
    await secondPage.getByRole("button", { name: /알림 확인/ }).click();
    const secondDialog = secondPage.getByRole("dialog", { name: "알림" });
    await expect(secondDialog.getByRole("button", { name: `${notification.title}: ${notification.canonical_name}` })).toBeVisible();
    await secondDialog.getByRole("button", { name: `${notification.title}: ${notification.canonical_name}` }).click();

    await expect.poll(() => readRequestCount).toBe(1);
    await expect.poll(() => readAt).toBe("2026-09-06T00:05:00Z");
    await expect(firstDialog.getByRole("button", { name: "모두 읽음" })).toHaveCount(0);
    await expect(firstDialog.getByRole("heading", { name: "알림 기록" })).toBeVisible();
  } finally {
    await secondPage.close();
  }
});

test("connected notification center refreshes after a cross-device revision", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let listCalls = 0;
  let revisionCalls = 0;
  const initialNotification = {
    id: "cross-device-notification",
    kind: "date_due",
    severity: "urgent",
    title: "오늘 확인할 알림이에요",
    message: "현재 기기에서 먼저 확인해 주세요.",
    canonical_name: "교차 기기 식품",
    food_id: null,
    due_date: "2026-09-09",
    source: "printed_date",
    action: "none",
    read_at: null,
    created_at: "2026-09-09T00:00:00Z",
  };
  const remoteNotification = {
    ...initialNotification,
    title: "다른 기기에서 갱신된 알림이에요",
    message: "다른 기기에서 바뀐 최신 알림을 확인해 주세요.",
  };
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/dashboard*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify({ generated_at: "2026-09-09T00:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/notifications/revision") {
      revisionCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
      return;
    }
    listCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify([remoteChanged ? remoteNotification : initialNotification]),
    });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByRole("button", { name: `${initialNotification.title}: ${initialNotification.canonical_name}` })).toBeVisible();
  const baselineListCalls = listCalls;
  const baselineRevisionCalls = revisionCalls;

  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => revisionCalls).toBeGreaterThan(baselineRevisionCalls);
  await expect.poll(() => listCalls).toBeGreaterThan(baselineListCalls);
  await expect(dialog.getByRole("status").filter({ hasText: "다른 기기에서 알림 상태가 바뀌어" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: `${remoteNotification.title}: ${remoteNotification.canonical_name}` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: `${initialNotification.title}: ${initialNotification.canonical_name}` })).toHaveCount(0);
});

test("connected notification center defers a cross-device refresh while mark-all is in flight", async ({ page }) => {
  let revision = 1;
  let remoteChanged = false;
  let listCalls = 0;
  let revisionCalls = 0;
  let releaseRead!: () => void;
  let markAllStarted!: () => void;
  const markAllGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  const markAllStartedGate = new Promise<void>((resolve) => { markAllStarted = resolve; });
  const initialNotification = {
    id: "deferred-cross-device-notification",
    kind: "date_due",
    severity: "urgent",
    title: "전체 읽음 전 알림",
    message: "읽음 요청이 끝날 때까지 현재 목록을 보존해요.",
    canonical_name: "보류 식품",
    food_id: null,
    due_date: "2026-09-09",
    source: "printed_date",
    action: "none",
    read_at: null,
    created_at: "2026-09-09T00:00:00Z",
  };
  const remoteNotification = {
    ...initialNotification,
    title: "전체 읽음 뒤 최신 알림",
    message: "읽음 저장이 끝난 뒤 다른 기기 변경을 반영했어요.",
    read_at: "2026-09-09T00:05:00Z",
  };
  const revisionHeaders = () => ({
    "X-Rescue-Meal-Workspace-Revision": String(revision),
    "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
  });

  await page.route("**/api/dashboard*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: revisionHeaders(),
      body: JSON.stringify({ generated_at: "2026-09-09T00:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/notifications/revision") {
      revisionCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ revision }) });
      return;
    }
    if (request.method() === "GET") {
      listCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: revisionHeaders(),
        body: JSON.stringify([remoteChanged ? remoteNotification : initialNotification]),
      });
      return;
    }
    if (request.method() === "POST" && pathname === "/api/notifications/read-all") {
      markAllStarted();
      await markAllGate;
      await route.fulfill({ status: 200, contentType: "application/json", headers: revisionHeaders(), body: JSON.stringify({ marked: 1 }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByRole("button", { name: `${initialNotification.title}: ${initialNotification.canonical_name}` })).toBeVisible();
  const baselineListCalls = listCalls;
  const baselineRevisionCalls = revisionCalls;

  await dialog.getByRole("button", { name: "모두 읽음" }).click();
  await markAllStartedGate;
  remoteChanged = true;
  revision = 2;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(150);
  expect(revisionCalls).toBe(baselineRevisionCalls);
  expect(listCalls).toBe(baselineListCalls);
  await expect(dialog.getByRole("button", { name: `${initialNotification.title}: ${initialNotification.canonical_name}` })).toBeVisible();

  releaseRead();
  await expect.poll(() => listCalls).toBeGreaterThan(baselineListCalls);
  await expect(dialog.getByRole("button", { name: `${remoteNotification.title}: ${remoteNotification.canonical_name}` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: `${initialNotification.title}: ${initialNotification.canonical_name}` })).toHaveCount(0);
});

test("connected client carries the latest workspace revision on mutations", async ({ page }) => {
  const notification = {
    id: "workspace-revision-notification",
    kind: "date_due",
    severity: "urgent",
    title: "revision을 확인할 날짜예요",
    message: "서버 revision을 변경 요청에 함께 보내는지 확인해요.",
    canonical_name: "revision 식품",
    food_id: null,
    due_date: "2026-09-06",
    source: "printed_date",
    action: "none",
    read_at: null,
    created_at: "2026-09-06T00:00:00Z",
  };

  await page.route("**/api/dashboard*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "X-Rescue-Meal-Workspace-Revision": "17",
        "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
      },
      body: JSON.stringify({ generated_at: "2026-09-06T00:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Rescue-Meal-Workspace-Revision": "17",
          "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision",
        },
        body: JSON.stringify([notification]),
      });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-06T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  const dashboardResponsePromise = page.waitForResponse((response) => response.url().includes("/api/dashboard"));
  await page.goto("/");
  const dashboardResponse = await dashboardResponsePromise;
  expect(dashboardResponse.headers()["x-rescue-meal-workspace-revision"]).toBe("17");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  const mutationRequestPromise = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/api/notifications/"));
  await dialog.getByRole("button", { name: `${notification.title}: ${notification.canonical_name}` }).click();
  const mutationRequest = await mutationRequestPromise;
  expect(mutationRequest.headers()["if-rescue-meal-revision"]).toBe("17");
});

test("connected notification center exposes the custom storage location in a mismatch advisory", async ({ page }) => {
  const notification = {
    id: "food-storage-mismatch:chicken-1:ambient:refrigerated",
    kind: "storage_mismatch",
    severity: "attention",
    title: "포장지 보관조건을 확인해 주세요",
    message: "닭가슴살은 실온 보관 기준인데 현재 김치냉장고에 보관 중이에요. 포장지와 실제 상태를 다시 확인하세요.",
    canonical_name: "닭가슴살",
    food_id: "chicken-1",
    due_date: null,
    source: "storage_condition",
    action: "food",
    read_at: null,
    created_at: "2026-09-04T00:00:00Z",
  };
  await page.route("**/api/notifications*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-04T00:05:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const dialog = page.getByRole("dialog", { name: "알림" });
  await expect(dialog.getByText("포장지 보관조건을 확인해 주세요")).toBeVisible();
  await expect(dialog.getByText(/실온 보관 기준인데 현재 김치냉장고/)).toBeVisible();
  await dialog.getByRole("button", { name: "포장지 보관조건을 확인해 주세요: 닭가슴살" }).click();
  await expect(page.getByRole("dialog", { name: "닭가슴살" })).toBeVisible();
});

test("connected mapping notification focuses its blocked product task", async ({ page }) => {
  const notification = {
    id: "grocy-mapping-focus-notification",
    kind: "grocy_sync",
    sync_state: "action_required",
    severity: "attention",
    title: "외부 상품 연결이 필요해요",
    message: "두부의 외부 상품 연결을 확인해 주세요.",
    canonical_name: "두부",
    food_id: null,
    due_date: null,
    source: "grocy_outbox",
    action: "grocy",
    read_at: null,
    created_at: "2026-09-19T12:00:00Z",
    sync_record_id: "outbox-mapping-focus",
  };
  const blocked = {
    id: "outbox-mapping-focus",
    operation: "consume",
    aggregate_id: "tofu-1",
    idempotency_key: "storage-event:mapping-focus",
    canonical_name: "두부",
    grocy_product_id: null,
    quantity: 1,
    unit: "모",
    spoiled: false,
    from_grocy_location_id: 20,
    to_grocy_location_id: null,
    payload: { storage_event_id: "event-mapping-focus", food_id: "tofu-1" },
    status: "blocked",
    attempts: 0,
    last_error: "외부 상품 연결 확인이 필요합니다.",
    last_dead_letter_error: null,
    manual_retry_count: 0,
    last_retry_note: null,
    last_retry_at: null,
    grocy_transaction_id: null,
    created_at: "2026-09-19T12:00:00Z",
    updated_at: "2026-09-19T12:00:00Z",
  };
  let outbox: Array<Record<string, unknown>> = [blocked];
  let processCalls = 0;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-mapping-focus", email: "mapping-focus@example.com", workspace_id: "account-mapping-focus", role: "user" }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-19T12:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: [] }) });
  });
  await page.route("**/api/notifications**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/revision")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 1 }) });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([notification]) });
      return;
    }
    if (request.method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...notification, read_at: "2026-09-19T12:01:00Z" }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/shopping-list", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/receipts", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/integrations/grocy/status", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, status: "ok", version: "4.0.0", detail: "외부 재고 서비스 연결 상태를 확인했어요." }) }); });
  await page.route("**/api/integrations/grocy/location-mappings", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/integrations/grocy/mappings", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
  await page.route("**/api/integrations/grocy/mappings/*", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    outbox = [{ ...blocked, status: "pending", last_error: null, updated_at: "2026-09-19T12:02:00Z" }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ canonical_name: "두부", grocy_product_id: 88, grocy_unit: "모", barcode: null, source: "user_confirmed", updated_at: "2026-09-19T12:02:00Z" }) });
  });
  await page.route("**/api/integrations/grocy/outbox/process", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    processCalls += 1;
    outbox = [{ ...blocked, status: "succeeded", last_error: null, grocy_transaction_id: "grocy-mapping-focus-tx", updated_at: "2026-09-19T12:03:00Z", status_history: [{ status: "blocked", occurred_at: "2026-09-19T12:00:00Z", source: "created", note: "외부 상품 연결 확인이 필요합니다." }, { status: "pending", occurred_at: "2026-09-19T12:02:00Z", source: "mapping", note: null }, { status: "succeeded", occurred_at: "2026-09-19T12:03:00Z", source: "worker", note: "외부 작업 #grocy-mapping-focus-tx" }] }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ processed: 1, succeeded: 1, retried: 0, dead_lettered: 0, blocked: 0, records: outbox }) });
  });
  await page.route("**/api/integrations/grocy/outbox", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outbox) }); });
  await page.route("**/api/integrations/grocy/worker/status", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /알림 확인/ }).click();
  const notifications = page.getByRole("dialog", { name: "알림" });
  await notifications.getByRole("button", { name: "외부 상품 연결이 필요해요: 두부" }).click();
  const account = page.getByRole("dialog", { name: "내 계정" });
  await expect(account).toBeVisible();
  const productTask = account.locator('[data-grocy-outbox-task="outbox-mapping-focus"]');
  await expect(productTask).toBeVisible();
  await expect(account.locator("details.grocy-settings-block").filter({ hasText: "상세 연결 설정" })).toHaveAttribute("open", "");
  await expect(account.getByLabel("두부 외부 상품 번호")).toBeFocused();
  await account.getByLabel("두부 외부 상품 번호").fill("88");
  await account.getByRole("button", { name: "연결", exact: true }).click();
  await expect(account.getByRole("status")).toContainText("두부 상품 매핑을 저장했어요. 외부 재고 1건이 처리 대기 중이에요.");
  await expect(account.getByRole("button", { name: "지금 동기화" })).toBeFocused();
  await account.getByRole("button", { name: "지금 동기화" }).click();
  await expect.poll(() => processCalls).toBe(1);
  await expect(account.getByRole("status")).toContainText("외부 재고 동기화 1건을 완료하고 0건을 재시도 대기했어요.");
  await expect(account.getByTestId("grocy-sync-history")).toContainText("최근 반영 완료");
  await expect(account.getByText("최근 1건 반영 완료 · 추가 처리 대기 없음", { exact: true })).toBeVisible();
  await expect(account.getByTestId("grocy-sync-history")).toContainText("외부 작업 #grocy-mapping-focus-tx");
  const completedOutboxDetails = account.locator('[data-grocy-outbox-details="outbox-mapping-focus"]');
  await expect(completedOutboxDetails).toHaveAttribute("open", "");
  await expect(completedOutboxDetails.locator(":scope > summary")).toBeFocused();
});

test("account settings connects Grocy locations and a blocked product mapping", async ({ page }) => {
  let productMappings: Array<Record<string, unknown>> = [];
  let locationMappings: Array<Record<string, unknown>> = [];
  let outbox: Array<Record<string, unknown>> = [{
    id: "outbox-blocked-chicken",
    operation: "consume",
    aggregate_id: "chicken-1",
    idempotency_key: "storage-event:event-chicken-1",
    canonical_name: "닭가슴살",
    grocy_product_id: null,
    quantity: 1,
    unit: "팩",
    spoiled: false,
    from_grocy_location_id: null,
    to_grocy_location_id: null,
    payload: { storage_event_id: "event-chicken-1" },
    status: "blocked",
    attempts: 0,
    last_error: "Grocy product mapping과 단위 확인이 필요합니다.",
    grocy_transaction_id: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
  }];
  let productPut: Record<string, unknown> | null = null;
  let productPutAttempts = 0;
  let locationPut: Record<string, unknown> | null = null;
  let productMappingEvents: Array<Record<string, unknown>> = [];

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-grocy-e2e", email: "grocy@example.com", workspace_id: "account-grocy-e2e", role: "user" }),
    });
  });
  await page.route("**/api/integrations/grocy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/status") && !url.pathname.endsWith("/worker/status")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, status: "ok", version: "4.0.0", detail: "Grocy system info readback이 성공했습니다." }) });
      return;
    }
    if (url.pathname.endsWith("/worker/status") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ workspace_id: "account-grocy-e2e", worker_id: "worker-e2e", last_tick_at: "2026-09-02T04:00:00Z", last_success_at: "2026-09-02T04:00:00Z", lease_acquired: true, grocy_configured: true, scanned: 0, reconciliation_marked: 0, processed: 2, succeeded: 2, retried: 0, dead_lettered: 0, blocked: 0, last_error: null }]) });
      return;
    }
    if (url.pathname.endsWith("/location-mappings") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(locationMappings) });
      return;
    }
    if (url.pathname.includes("/location-mappings/") && request.method() === "PUT") {
      locationPut = JSON.parse(request.postData() ?? "{}");
      const storageType = url.pathname.split("/").pop() ?? "refrigerated";
      locationMappings = [{ storage_type: storageType, grocy_location_id: locationPut.grocy_location_id, source: "user_confirmed", updated_at: "2026-09-02T00:10:00Z" }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(locationMappings[0]) });
      return;
    }
    if (url.pathname.endsWith("/mappings") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(productMappings) });
      return;
    }
    if (url.pathname.endsWith("/events") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(productMappingEvents) });
      return;
    }
    if (url.pathname.includes("/mappings/") && request.method() === "PUT") {
      productPutAttempts += 1;
      productPut = JSON.parse(request.postData() ?? "{}");
      if (productPutAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "grocy_mapping_persistence_unavailable", detail: "Grocy 상품 매핑을 저장하지 못했습니다. 기존 매핑과 outbox 상태를 유지했어요.", retryable: true, action: "retry_later" }),
        });
        return;
      }
      const canonicalName = decodeURIComponent(url.pathname.split("/").pop() ?? "닭가슴살");
      const previousMapping = productMappings[0] ?? null;
      const mapping = { canonical_name: canonicalName, grocy_product_id: productPut.grocy_product_id, grocy_unit: productPut.grocy_unit, barcode: null, source: "user_confirmed", updated_by: "account-grocy-e2e", updated_by_email: "grocy@example.com", updated_at: "2026-09-02T00:10:00Z" };
      productMappings = [mapping];
      productMappingEvents = [{ id: `mapping-event-${mapping.grocy_product_id}`, canonical_name: canonicalName, action: previousMapping ? "updated" : "created", actor_id: "account-grocy-e2e", actor_email: "grocy@example.com", occurred_at: "2026-09-02T00:10:00Z", before: previousMapping, after: mapping }, ...productMappingEvents];
      outbox = [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mapping) });
      return;
    }
    if (url.pathname.endsWith("/outbox") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outbox) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  const grocyPanel = dialog.locator(".grocy-integration");
  await expect(grocyPanel.getByRole("heading", { name: "외부 재고 연동" })).toBeVisible();
  await expect(dialog.getByText("연결됨 · v4.0.0")).toBeVisible();
  await expect(dialog.getByText("외부 재고 서비스 연결 상태를 확인했어요.", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText("system info readback");
  await expect(dialog.getByText(/마지막 확인 .*2건 처리/)).toBeVisible();
  const grocySettings = grocyPanel.locator("details.grocy-settings-block").first();
  await expect(grocySettings).toHaveAttribute("open", "");
  await expect(dialog.getByText("매핑 필요 1건 · 0건 처리 대기")).toBeVisible();
  await expect(dialog.getByText("확인할 동기화 작업", { exact: true })).toBeVisible();
  const blockedProductTask = dialog.locator('[data-grocy-outbox-task="outbox-blocked-chicken"]');
  await expect(blockedProductTask).toHaveRole("group");
  await expect(blockedProductTask).toHaveAccessibleName("닭가슴살 외부 상품 연결 작업");

  const refrigerated = dialog.getByLabel("냉장 외부 재고 위치 번호");
  await refrigerated.fill("20");
  await grocyPanel.getByRole("button", { name: "저장", exact: true }).nth(1).click();
  await expect(dialog.getByRole("status")).toContainText("냉장 보관 위치를 저장했어요");
  expect(locationPut).toMatchObject({ grocy_location_id: 20, source: "user_confirmed" });

  await dialog.getByLabel("닭가슴살 외부 상품 번호").fill("88");
  await grocyPanel.getByRole("button", { name: "연결", exact: true }).click();
  await expect(grocyPanel.getByRole("alert")).toContainText("기존 매핑과 동기화 대기 상태를 유지했어요");
  await grocyPanel.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog.getByRole("status")).toContainText("닭가슴살 상품 매핑을 저장했어요");
  expect(productPutAttempts).toBe(2);
  expect(productPut).toMatchObject({ grocy_product_id: 88, grocy_unit: "팩", source: "user_confirmed" });
  const catalogRow = dialog.locator(".grocy-product-catalog-row").filter({ hasText: "닭가슴살" });
  await expect(catalogRow).toContainText("외부 상품 #88 · 팩 · grocy@example.com");
  const mappingSearch = dialog.getByLabel("등록된 외부 상품 매핑 검색");
  await mappingSearch.fill("닭");
  await expect(dialog.locator(".grocy-product-catalog-row")).toHaveCount(1);
  await mappingSearch.fill("없는 상품");
  await expect(dialog.locator(".grocy-product-catalog-row")).toHaveCount(0);
  await mappingSearch.fill("");
  await catalogRow.getByRole("button", { name: "닭가슴살 매핑 수정" }).click();
  await dialog.getByLabel("닭가슴살 기존 외부 상품 번호").fill("89");
  await dialog.locator(".grocy-product-catalog-row .grocy-save-button").click();
  await expect(dialog.getByRole("status")).toContainText("닭가슴살 상품 매핑을 저장했어요");
  expect(productPut).toMatchObject({ grocy_product_id: 89, grocy_unit: "팩", source: "user_confirmed" });
  await catalogRow.getByRole("button", { name: "닭가슴살 매핑 이력 보기" }).click();
  const mappingHistory = dialog.getByRole("region", { name: "닭가슴살 매핑 변경 이력" });
  await expect(mappingHistory).toContainText("매핑 수정");
  await expect(mappingHistory).toContainText("외부 상품 #88 · 팩 → 외부 상품 #89 · 팩");
  await expect(dialog.getByText("막힌 작업 없음 · 0건 처리 대기")).toBeVisible();
});

test("account settings requeues a dead-letter Grocy operation", async ({ page }) => {
  let retryPayload: Record<string, unknown> | null = null;
  let outbox: Array<Record<string, unknown>> = [{
    id: "outbox-dead-chicken",
    operation: "consume",
    aggregate_id: "chicken-1",
    idempotency_key: "storage-event:event-dead-chicken",
    canonical_name: "닭가슴살",
    grocy_product_id: 88,
    quantity: 1,
    unit: "팩",
    spoiled: false,
    from_grocy_location_id: 10,
    to_grocy_location_id: null,
    payload: { storage_event_id: "event-dead-chicken" },
    status: "dead_letter",
    attempts: 3,
    last_error: "Grocy stock sync 실패; reconciliation 확인이 필요합니다.",
    last_dead_letter_error: null,
    manual_retry_count: 0,
    last_retry_note: null,
    last_retry_at: null,
    grocy_transaction_id: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
  }];
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-grocy-retry-e2e", email: "retry@example.com", workspace_id: "account-grocy-retry-e2e", role: "user" }) });
  });
  await page.route("**/api/integrations/grocy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/status") && !url.pathname.endsWith("/worker/status")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, status: "ok", version: "4.0.0", detail: "Grocy system info readback이 성공했습니다." }) });
      return;
    }
    if (url.pathname.endsWith("/worker/status") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname.endsWith("/location-mappings") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname.endsWith("/mappings") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ canonical_name: "닭가슴살", grocy_product_id: 88, grocy_unit: "팩", barcode: null, source: "user_confirmed", updated_at: "2026-09-02T00:00:00Z" }]) });
      return;
    }
    if (url.pathname.endsWith("/outbox") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outbox) });
      return;
    }
    if (url.pathname.includes("/outbox/") && url.pathname.endsWith("/retry") && request.method() === "POST") {
      retryPayload = JSON.parse(request.postData() ?? "{}");
      outbox = [{ ...outbox[0], status: "pending", attempts: 0, last_error: null, manual_retry_count: 1, last_retry_note: retryPayload.operator_note, last_retry_at: "2026-09-02T00:10:00Z" }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outbox[0]) });
      return;
    }
    await route.continue();
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("details.grocy-settings-block").filter({ hasText: "상세 연결 설정" })).toHaveAttribute("open", "");
  const deadLetterHeading = dialog.getByText("재확인이 필요한 실패 작업", { exact: true });
  await expect(deadLetterHeading).toHaveCount(1);
  await expect(dialog.locator(".grocy-dead-letter-row")).toContainText("외부 재고 서비스 재고 동기화 실패; 외부 반영 여부 확인이 필요합니다.");
  await expect(dialog.getByText("막힌 작업 없음 · 0건 처리 대기 · 실패 1건")).toHaveCount(1);
  const retryButton = dialog.getByRole("button", { name: "재시도" });
  await waitForSheetSettled(page);
  const screenBox = await page.getByTestId("mobile-app-viewport").boundingBox();
  const retryBox = await retryButton.boundingBox();
  expect(screenBox, "mobile viewport has no bounding box").toBeTruthy();
  expect(retryBox, "Grocy retry action has no bounding box").toBeTruthy();
  expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(screenBox!.y + screenBox!.height - 12);
  await retryButton.click();
  const grocyPanel = dialog.getByRole("region", { name: "외부 재고 연동" });
  await expect(grocyPanel.getByRole("status")).toContainText("닭가슴살 소비 작업을 재시도 대기로 돌렸어요");
  expect(retryPayload).toEqual({ operator_note: "사용자가 설정 화면에서 재시도" });
  await expect(dialog.getByText("막힌 작업 없음 · 1건 처리 대기")).toHaveCount(1);
});

test("account settings requires an explicit decision for a stale in-flight operation", async ({ page }) => {
  let outbox: Array<Record<string, unknown>> = [{
    id: "outbox-inflight-e2e",
    operation: "consume",
    aggregate_id: "chicken-1",
    idempotency_key: "storage-event:event-inflight-e2e",
    canonical_name: "닭가슴살",
    grocy_product_id: 88,
    quantity: 1,
    unit: "팩",
    spoiled: false,
    from_grocy_location_id: 10,
    to_grocy_location_id: null,
    payload: { storage_event_id: "event-inflight-e2e" },
    status: "in_flight",
    attempts: 1,
    last_error: null,
    last_dead_letter_error: null,
    manual_retry_count: 0,
    last_retry_note: null,
    last_retry_at: null,
    in_flight_started_at: "2026-09-02T00:00:00Z",
    last_in_flight_started_at: "2026-09-02T00:00:00Z",
    reconciliation_count: 0,
    last_reconciliation_decision: null,
    last_reconciliation_note: null,
    last_reconciled_at: null,
    grocy_transaction_id: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
  }];
  let reconcilePayload: Record<string, unknown> | null = null;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-grocy-reconcile-e2e", email: "reconcile@example.com", workspace_id: "account-grocy-reconcile-e2e", role: "user" }) });
  });
  await page.route("**/api/integrations/grocy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/status") && !url.pathname.endsWith("/worker/status")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, status: "ok", version: "4.0.0", detail: "Grocy system info readback이 성공했습니다." }) });
      return;
    }
    if (url.pathname.endsWith("/worker/status") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname.endsWith("/location-mappings") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (url.pathname.endsWith("/mappings") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ canonical_name: "닭가슴살", grocy_product_id: 88, grocy_unit: "팩", barcode: null, source: "user_confirmed", updated_at: "2026-09-02T00:00:00Z" }]) });
      return;
    }
    if (url.pathname.endsWith("/outbox") && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outbox) });
      return;
    }
    if (url.pathname.endsWith("/reconciliation-scan") && request.method() === "POST") {
      outbox = [{ ...outbox[0], status: "reconciliation_required", last_error: "Grocy 외부 반영 여부 확인이 필요합니다.", in_flight_started_at: null }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scanned: 1, marked: 1, records: outbox }) });
      return;
    }
    if (url.pathname.includes("/outbox/") && url.pathname.endsWith("/reconcile") && request.method() === "POST") {
      reconcilePayload = JSON.parse(request.postData() ?? "{}");
      outbox = [{ ...outbox[0], status: "succeeded", last_error: null, reconciliation_count: 1, last_reconciliation_decision: reconcilePayload.decision, last_reconciliation_note: reconcilePayload.operator_note, grocy_transaction_id: reconcilePayload.grocy_transaction_id ?? null }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outbox[0]) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog.getByText("처리 중 1건")).toHaveCount(1);
  await dialog.locator(".grocy-integration").getByText("상세 연결 설정", { exact: true }).click();
  await dialog.getByRole("button", { name: "오래된 작업 확인" }).click();
  await expect(dialog.getByText("외부 반영 여부 확인", { exact: true })).toHaveCount(1);
  await dialog.getByText("외부 작업 상세", { exact: true }).click();
  await expect(dialog.locator('[data-outbox-detail-id="outbox-inflight-e2e"]')).toContainText("소비 · 1팩 · 반영 여부 확인 필요");
  await expect(dialog.locator('[data-outbox-detail-id="outbox-inflight-e2e"]')).toContainText("Rescue Meal 작업 ID · outbox-inflight-e2e");
  await dialog.getByLabel("닭가슴살 외부 작업 번호").fill("grocy-inflight-e2e-tx");
  await dialog.getByRole("button", { name: "반영됨" }).click({ force: true });
  await expect(dialog.getByRole("status")).toContainText("닭가슴살 작업을 반영 완료로 확인했어요");
  expect(reconcilePayload).toMatchObject({ decision: "already_applied", grocy_transaction_id: "grocy-inflight-e2e-tx" });
  const syncHistory = dialog.getByTestId("grocy-sync-history");
  await expect(syncHistory).toContainText("최근 반영 완료");
  await expect(syncHistory).toContainText("닭가슴살");
  await expect(syncHistory).toContainText("외부 작업 #grocy-inflight-e2e-tx");
  await syncHistory.getByRole("button", { name: "닭가슴살 반영 작업의 식품 기록 보기" }).click();
  await expect(page.getByRole("dialog", { name: "닭가슴살" })).toBeVisible();
  await page.getByRole("dialog", { name: "닭가슴살" }).getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("확인 필요 0건")).toHaveCount(0);
});

test("recipe review surface is opt-in and explains a disabled operator endpoint", async ({ page }) => {
  await page.goto("/?review=1");
  const entry = page.getByRole("button", { name: "운영자 레시피 검토 열기" });
  await expect(entry).toBeVisible();
  await entry.click();

  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await expect(dialog.getByRole("heading", { name: "공개 레시피 검토", level: 3 })).toBeVisible();
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("not-configured");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.getByRole("alert")).toContainText("레시피 검토 서버가 비활성화되어 있어요.");
});

test("recipe review surface can fetch source drafts with bounded filters", async ({ page }) => {
  let importPayload: Record<string, unknown> | null = null;
  const importedDraft = {
    id: "recipe-draft-import-e2e",
    source_id: "cookrcp-import-e2e",
    title: "소스에서 가져온 두부 요리",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/cookrcp",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-04T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-04T00:00:00Z",
    updated_at: "2026-09-04T00:00:00Z",
    approved_at: null,
  };
  await page.route("**/api/integrations/recipes/cookrcp/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "cookrcp01",
        service_id: "COOKRCP01",
        configured: true,
        status: "ready",
        source_name: "식품안전나라 조리식품 레시피 DB",
        source_url: "https://example.test/cookrcp-docs",
        detail: "API key가 설정되었습니다. 외부 레시피는 검토 draft로만 수집됩니다.",
      }),
    });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/import")) {
      importPayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total_count: 1,
          accepted_count: 1,
          persisted_count: 1,
          rejected_count: 0,
          draft_ids: [importedDraft.id],
          rejected_rows: [],
          source_name: importedDraft.source_name,
          source_url: importedDraft.source_url,
          source_revision: importedDraft.source_revision,
          retrieved_at: importedDraft.retrieved_at,
        }),
      });
      return;
    }
    if (request.method() === "GET") {
      if (url.pathname.endsWith("/events")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(importPayload ? [importedDraft] : []) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.getByText("원본 연결됨")).toBeVisible();
  await expect(dialog.getByText("API key는 서버 환경변수에만 있고 이 화면에는 표시하지 않아요.")).toBeVisible();
  await dialog.getByLabel("메뉴명으로 좁히기").fill("두부");
  await dialog.getByRole("button", { name: "원본에서 검토 초안 가져오기" }).click();
  await expect(dialog.locator(".recipe-review-notice")).toContainText("새 검토 초안 1개를 추가했어요");
  await expect(dialog.getByRole("button", { name: /소스에서 가져온 두부 요리/ })).toBeVisible();
  expect(importPayload).toMatchObject({ start_idx: 1, end_idx: 20, menu_name: "두부" });
  await expect(page.locator("body")).not.toContainText("source-key");
});

test("recipe review surface can approve a source-grounded draft without exposing the source key", async ({ page }) => {
  const draft = {
    id: "recipe-draft-e2e",
    source_id: "cookrcp-e2e",
    title: "검토된 두부 볶음",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [
      { raw_text: "두부 1모", parsed_name: "두부", parsed_amount: 1, parsed_unit: "모", canonical_name: "국산콩 두부", canonical_amount: 1, canonical_unit: "모", review_status: "approved" },
    ],
    steps: ["상태를 확인합니다.", "충분히 가열합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "source terms checked",
    safety_note: "상태를 확인하고 충분히 가열하세요.",
    estimated_minutes: 12,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: null,
    claimed_by_email: null,
    claimed_at: null,
    claim_expires_at: null,
  };
  let reviewPatchAttempts = 0;
  const catalogRevisionHeaders: string[] = [];
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url().endsWith("/events")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "review-event-e2e",
          draft_id: draft.id,
          action: "updated",
          actor_id: "recipe-admin-e2e",
          actor_email: "admin@example.com",
          occurred_at: "2026-09-02T00:05:00Z",
          before_status: "pending",
          after_status: "pending",
          changed_fields: ["ingredients"],
          draft_snapshot_hash: "c".repeat(64),
        }]),
      });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Rescue-Meal-Recipe-Catalog-Revision": "5", "Access-Control-Expose-Headers": "X-Rescue-Meal-Recipe-Catalog-Revision" }, body: JSON.stringify([draft]) });
      return;
    }
    if (request.method() === "POST" && request.url().endsWith("/claim")) {
      catalogRevisionHeaders.push(request.headers()["if-rescue-meal-recipe-catalog-revision"] ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Rescue-Meal-Recipe-Catalog-Revision": "6", "Access-Control-Expose-Headers": "X-Rescue-Meal-Recipe-Catalog-Revision" }, body: JSON.stringify({ ...draft, claimed_by: "legacy-review-token", claimed_by_email: null, claimed_at: "2026-09-02T00:06:00Z", claim_expires_at: "2099-09-02T00:06:00Z" }) });
      return;
    }
    if (request.method() === "POST" && request.url().endsWith("/approve")) {
      catalogRevisionHeaders.push(request.headers()["if-rescue-meal-recipe-catalog-revision"] ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Rescue-Meal-Recipe-Catalog-Revision": "8", "Access-Control-Expose-Headers": "X-Rescue-Meal-Recipe-Catalog-Revision" }, body: JSON.stringify({ ...draft, status: "approved", approved_at: "2026-09-02T00:10:00Z" }) });
      return;
    }
    if (request.method() === "PATCH") {
      reviewPatchAttempts += 1;
      if (reviewPatchAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "recipe_review_persistence_unavailable", detail: "recipe 검토 내용을 저장하지 못했습니다. 기존 draft를 유지했어요.", retryable: true, action: "retry_later" }),
        });
        return;
      }
      catalogRevisionHeaders.push(request.headers()["if-rescue-meal-recipe-catalog-revision"] ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Rescue-Meal-Recipe-Catalog-Revision": "7", "Access-Control-Expose-Headers": "X-Rescue-Meal-Recipe-Catalog-Revision" }, body: JSON.stringify({ ...draft, claimed_by: "legacy-review-token", claimed_by_email: null, claimed_at: "2026-09-02T00:06:00Z", claim_expires_at: "2099-09-02T00:06:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.getByRole("button", { name: /검토된 두부 볶음/ })).toBeVisible();
  await expect(dialog.getByText("식품안전나라 조리식품 레시피 DB · COOKRCP01 · public-api-terms-review-required")).toBeVisible();
  await expect(dialog.locator(".recipe-review-audit")).toContainText("검토 수정");
  await expect(dialog.locator(".recipe-review-audit")).toContainText("admin@example.com");
  await dialog.getByRole("button", { name: "검토 담당 맡기" }).click();
  await expect(dialog.locator(".recipe-review-claim-bar")).toContainText("내가 검토 중");
  await dialog.getByRole("checkbox", { name: "원본 이용조건·이미지 재사용 권한을 확인했습니다." }).check();
  await dialog.getByRole("button", { name: "planner에 승인" }).click();
  await expect(dialog.getByRole("alert")).toContainText("기존 초안을 유지했어요");
  await dialog.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog.getByRole("status")).toContainText("planner 후보에 포함됩니다");
  expect(reviewPatchAttempts).toBe(2);
  expect(catalogRevisionHeaders).toEqual(["5", "6", "7"]);
  await expect(page.locator("body")).not.toContainText("runtime-only-token");
});

test("recipe review surface blocks a draft claimed by another operator", async ({ page }) => {
  const draft = {
    id: "recipe-draft-owned-by-other",
    source_id: "cookrcp-owned-by-other",
    title: "다른 운영자가 검토 중인 레시피",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: "account-other-admin",
    claimed_by_email: "other-admin@example.com",
    claimed_at: "2026-09-02T00:00:00Z",
    claim_expires_at: "2099-09-02T00:00:00Z",
  };
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    if (route.request().method() === "GET" && route.request().url().endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([draft]) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.locator(".recipe-review-claim-bar")).toContainText("다른 운영자가 검토 중");
  await expect(dialog.locator(".recipe-review-claim-bar")).toContainText("other-admin@example.com");
  await expect(dialog.getByRole("button", { name: "검토 담당 맡기" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "planner에 승인" })).toBeDisabled();
});

test("recipe review surface keeps reviewer edits but hides publisher actions", async ({ page }) => {
  const draft = {
    id: "recipe-draft-reviewer-only",
    source_id: "cookrcp-reviewer-only",
    title: "검토자 전용 레시피",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: null,
    claimed_by_email: null,
    claimed_at: null,
    claim_expires_at: null,
  };
  await page.route("**/api/recipe-review/capabilities", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ can_review: true, can_publish: false, publisher_policy: "publisher_allowlist", ownership_enabled: true, actor_type: "legacy_token" }),
    });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url().endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([draft]) });
      return;
    }
    if (request.method() === "POST" && request.url().endsWith("/claim")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...draft, claimed_by: "legacy-review-token", claimed_at: "2026-09-02T00:00:00Z", claim_expires_at: "2099-09-02T00:00:00Z" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await dialog.getByRole("button", { name: "검토 담당 맡기" }).click();
  await expect(dialog.locator(".recipe-review-claim-bar")).toContainText("승인·반려 권한은 없어요");
  await expect(dialog.getByRole("button", { name: "검토 저장" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "planner에 승인" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "반려" })).toBeDisabled();
});

test("recipe review queue filters all, mine, and unassigned drafts", async ({ page }) => {
  const mineDraft = {
    id: "recipe-draft-filter-mine",
    source_id: "cookrcp-filter-mine",
    title: "내가 맡은 레시피",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: "legacy-review-token",
    claimed_by_email: null,
    claimed_at: "2026-09-02T00:00:00Z",
    claim_expires_at: "2099-09-02T00:00:00Z",
  };
  const unassignedDraft = { ...mineDraft, id: "recipe-draft-filter-unassigned", source_id: "cookrcp-filter-unassigned", title: "미배정 레시피", claimed_by: null, claimed_at: null, claim_expires_at: null };
  const assignments: string[] = [];
  await page.route("**/api/recipe-review/capabilities", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ can_review: true, can_publish: true, publisher_policy: "all_recipe_admins", ownership_enabled: true, actor_type: "legacy_token" }) });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (request.method() === "GET") {
      assignments.push(url.searchParams.get("assignment") ?? "all");
      const assignment = url.searchParams.get("assignment") ?? "all";
      const drafts = assignment === "mine" ? [mineDraft] : assignment === "unassigned" ? [unassignedDraft] : [mineDraft, unassignedDraft];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(drafts) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.getByRole("button", { name: /내가 맡은 레시피/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /미배정 레시피/ })).toBeVisible();
  await dialog.getByRole("button", { name: "내 작업" }).click();
  await expect(dialog.getByRole("button", { name: /내가 맡은 레시피/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /미배정 레시피/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "미배정" }).click();
  await expect(dialog.getByRole("button", { name: /미배정 레시피/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /내가 맡은 레시피/ })).toHaveCount(0);
  expect(assignments).toEqual(["all", "mine", "unassigned"]);
});

test("recipe review queue refreshes after a remote catalog mutation without clobbering local edits", async ({ page }) => {
  const draft = {
    id: "recipe-draft-remote-refresh",
    source_id: "cookrcp-remote-refresh",
    title: "로컬에서 검토 중인 레시피",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: "legacy-review-token",
    claimed_by_email: null,
    claimed_at: "2026-09-02T00:00:00Z",
    claim_expires_at: "2099-09-02T00:00:00Z",
  };
  const remoteDraft = { ...draft, id: "recipe-draft-remote-added", source_id: "cookrcp-remote-added", title: "다른 운영자가 추가한 레시피", claimed_by: null, claimed_at: null, claim_expires_at: null };
  let drafts = [draft];
  await page.route("**/api/recipe-review/capabilities", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ can_review: true, can_publish: true, publisher_policy: "all_recipe_admins", ownership_enabled: true, actor_type: "legacy_token" }) });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url().endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(drafts) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await dialog.getByLabel("제목").fill("내 로컬 편집");
  drafts = [draft, remoteDraft];
  await page.evaluate(() => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-recipe-review-mutation", sourceId: "remote-operator", workspaceKey: "recipe-catalog", channels: ["recipe-review"] });
    channel.close();
  });
  await expect(dialog.getByRole("button", { name: /다른 운영자가 추가한 레시피/ })).toBeVisible();
  await expect(dialog.locator(".recipe-review-notice")).toContainText("현재 편집 내용은 유지");
  await expect(dialog.getByLabel("제목")).toHaveValue("내 로컬 편집");
});

test("recipe review queue requires explicit editor refresh after the selected draft changes remotely", async ({ page }) => {
  const draft = {
    id: "recipe-draft-selected-remote-change",
    source_id: "cookrcp-selected-remote-change",
    title: "처음 불러온 레시피",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: "legacy-review-token",
    claimed_by_email: null,
    claimed_at: "2026-09-02T00:00:00Z",
    claim_expires_at: "2099-09-02T00:00:00Z",
  };
  const remotelyChanged = { ...draft, title: "원격에서 바뀐 레시피", updated_at: "2026-09-02T00:10:00Z" };
  let drafts = [draft];
  await page.route("**/api/recipe-review/capabilities", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ can_review: true, can_publish: true, publisher_policy: "all_recipe_admins", ownership_enabled: true, actor_type: "legacy_token" }) });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url().endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(drafts) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await dialog.getByLabel("제목").fill("내 편집을 버리지 마세요");
  drafts = [remotelyChanged];
  await page.evaluate(() => {
    const channel = new BroadcastChannel("rescue-meal.workspace-sync.v1");
    channel.postMessage({ type: "mutation", id: "remote-selected-recipe-change", sourceId: "remote-operator", workspaceKey: "recipe-catalog", channels: ["recipe-review"] });
    channel.close();
  });
  await expect(dialog.locator(".recipe-review-editor-stale")).toContainText("최신 검토 초안 확인 필요");
  await expect(dialog.getByLabel("제목")).toHaveValue("내 편집을 버리지 마세요");
  await expect(dialog.getByRole("button", { name: "검토 저장" })).toBeDisabled();
  await dialog.getByRole("button", { name: "최신 초안 불러오기" }).click();
  await expect(dialog.getByLabel("제목")).toHaveValue("원격에서 바뀐 레시피");
  await expect(dialog.locator(".recipe-review-claim-bar")).toContainText("내가 검토 중");
  await expect(dialog.getByRole("button", { name: "검토 저장" })).toBeEnabled();
});

test("recipe review queue probes catalog revision when the operator returns to the tab", async ({ page }) => {
  const draft = {
    id: "recipe-draft-revision-poll",
    source_id: "cookrcp-revision-poll",
    title: "탭 복귀 전 레시피",
    category: "반찬",
    cooking_method: "볶음",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
    claimed_by: "legacy-review-token",
    claimed_by_email: null,
    claimed_at: "2026-09-02T00:00:00Z",
    claim_expires_at: "2099-09-02T00:00:00Z",
  };
  const remoteDraft = { ...draft, id: "recipe-draft-revision-poll-remote", source_id: "cookrcp-revision-poll-remote", title: "탭 복귀 후 확인할 레시피", claimed_by: null, claimed_at: null, claim_expires_at: null };
  let revision = 5;
  let drafts = [draft];
  await page.route("**/api/recipe-review/capabilities", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ can_review: true, can_publish: true, publisher_policy: "all_recipe_admins", ownership_enabled: true, actor_type: "legacy_token" }) });
  });
  await page.route("**/api/recipe-review/revision", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Rescue-Meal-Recipe-Catalog-Revision": String(revision), "Access-Control-Expose-Headers": "X-Rescue-Meal-Recipe-Catalog-Revision" }, body: JSON.stringify({ revision }) });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && request.url().endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Rescue-Meal-Recipe-Catalog-Revision": String(revision), "Access-Control-Expose-Headers": "X-Rescue-Meal-Recipe-Catalog-Revision" }, body: JSON.stringify(drafts) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByLabel("운영자 검토 토큰 (이전 방식)").fill("runtime-only-token");
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.getByRole("button", { name: /탭 복귀 전 레시피/ })).toBeVisible();
  revision = 6;
  drafts = [draft, remoteDraft];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(dialog.getByRole("button", { name: /탭 복귀 후 확인할 레시피/ })).toBeVisible();
  await expect(dialog.locator(".recipe-review-sync-hint")).toContainText("30초마다 revision");
});

test("recipe_admin account can load review drafts without the legacy token", async ({ page }) => {
  const draft = {
    id: "recipe-draft-admin-e2e",
    source_id: "cookrcp-admin-e2e",
    title: "관리자 계정으로 보는 레시피",
    category: "반찬",
    cooking_method: "끓이기",
    ingredients: [],
    steps: ["상태를 확인합니다."],
    image_url: null,
    source_name: "식품안전나라 조리식품 레시피 DB",
    source_url: "https://example.test/source",
    license: "public-api-terms-review-required",
    source_revision: "COOKRCP01",
    retrieved_at: "2026-09-02T00:00:00Z",
    status: "pending",
    reviewer_note: "",
    safety_note: null,
    estimated_minutes: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    approved_at: null,
  };
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-admin-e2e", email: "admin@example.com", workspace_id: "account-admin-e2e", role: "recipe_admin" }),
    });
  });
  await page.route("**/api/recipe-review/drafts**", async (route) => {
    if (route.request().method() === "GET" && route.request().url().endsWith("/events")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([draft]) });
      return;
    }
    await route.continue();
  });

  await page.goto("/?review=1");
  await page.getByRole("button", { name: "운영자 레시피 검토 열기" }).click();
  const dialog = page.getByRole("dialog", { name: "공개 레시피 검토" });
  await dialog.getByRole("button", { name: "검토 대기 불러오기" }).click();
  await expect(dialog.getByRole("button", { name: /관리자 계정으로 보는 레시피/ })).toBeVisible();
  await expect(dialog.getByText("레시피 운영자 계정으로 로그인했다면 토큰 없이도 사용할 수 있어요.")).toBeVisible();
});

test("barcode product candidates expose product shelf life and fill the manual form", async ({ page }) => {
  let createPayload: Record<string, unknown> | null = null;
  let idempotencyKey = "";
  await page.route("**/api/barcodes/parse", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        raw_scan: "8801791000055",
        barcode_type: "gtin",
        gtin: "08801791000055",
        lot: null,
        date_assertions: [],
        warnings: ["일반 GTIN은 상품 식별값으로만 사용합니다."],
        requires_review: true,
      }),
    });
  });
  await page.route("**/api/products/resolve/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        barcode: "08801791000055",
        status: "matched",
        candidates: [{
          source: "mfds_c005",
          source_url: "https://foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=C005",
          canonical_name: "매일맛있는진간장골드",
          brand: "매일식품주식회사",
          category: "혼합간장",
          quantity_text: null,
          confidence: 0.8,
          provenance_note: "식품안전나라 C005 제품 기준 후보; 개별 라벨 확인 필요",
          shelf_life_text: "실온보관 2년",
          storage_hint: "ambient",
          source_freshness: "legacy",
        }],
        warnings: [],
        requires_review: true,
        provider_statuses: { mfds_c005: "matched", open_food_facts: "unavailable" },
      }),
    });
  });
  await page.route("**/api/foods", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    createPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    idempotencyKey = route.request().headers()["idempotency-key"] ?? "";
    await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "바코드" }).click();
  await dialog.getByRole("textbox", { name: "바코드 숫자" }).fill("8801791000055");
  await dialog.getByRole("button", { name: "상품 후보 조회" }).click();

  await expect(dialog.getByText("상품 정보 기준 기간 참고: 실온보관 2년")).toBeVisible();
  await expect(dialog.getByText(/2018년 이후 최신화 중단|개별 라벨 확인 필요/)).toBeVisible();
  await expect(dialog.getByText("일부 상품 정보 확인 필요")).toBeVisible();
  await expect(dialog.locator(".barcode-candidate-list")).toHaveAttribute("aria-live", "polite");
  await expect(dialog).toContainText("공개 상품 DB를 확인하지 못했어요");
  const barcodeCandidateAction = dialog.getByRole("button", { name: "이름 채우기" });
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
  await expect(manualDialog).toBeVisible();
  await expect(manualDialog.getByRole("textbox", { name: "식품 이름" })).toHaveValue("매일맛있는진간장골드");
  await expect(manualDialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("상품 후보와 입력값을 확인해요");
  await expect(manualDialog.getByRole("button", { name: "실온", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(manualDialog.locator(".manual-source-confirmation")).toContainText("바코드 상품 후보를 적용했어요");
  await manualDialog.getByRole("button", { name: "식품 추가하기" }).click();
  await expect.poll(() => createPayload).not.toBeNull();
  expect(createPayload).toMatchObject({
    canonical_name: "매일맛있는진간장골드",
    brand: "매일식품주식회사",
    category: "혼합간장",
    product_provenance: {
      source: "mfds_c005",
      confidence: 0.8,
      source_freshness: "legacy",
      storage_hint: "ambient",
    },
  });
  expect(idempotencyKey).toMatch(/^manual-food:food-/);
});

test("connected manual food create retries with the same idempotency key", async ({ page }) => {
  const idempotencyKeys: string[] = [];
  await page.route("**/api/foods", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (idempotencyKeys.length === 1) {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("네트워크 재시도 식품");
  await dialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect.poll(() => idempotencyKeys.length).toBe(2);
  expect(idempotencyKeys[0]).toMatch(/^manual-food:food-/);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  await expect(page.locator(".toast")).toContainText("네트워크 재시도 식품을 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 확인");
  await expect(page.locator(".inventory-row").filter({ hasText: "네트워크 재시도 식품" })).toBeFocused();
});

test("connected manual food failure exposes an explicit retry action", async ({ page }) => {
  const idempotencyKeys: string[] = [];
  await page.route("**/api/foods", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (idempotencyKeys.length === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: { code: "manual_food_persistence_unavailable", detail: "temporary manual food failure", retryable: true, action: "retry_later" } }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("실패 후 재시도 식품");
  await dialog.getByRole("button", { name: "식품 추가하기" }).click();

  const toast = page.getByRole("status").filter({ hasText: "식품을 저장하지 못했어요" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator(".toast")).toContainText("실패 후 재시도 식품을 식품 목록에 추가했어요");
  await expect(page.locator(".toast-action")).toHaveText("날짜·보관 확인");
  expect(idempotencyKeys).toHaveLength(2);
  expect(idempotencyKeys[0]).toMatch(/^manual-food:food-/);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  await expect(page.locator(".inventory-row").filter({ hasText: "실패 후 재시도 식품" })).toBeFocused();
});

test("manual food can request a review-only priority window from the backend", async ({ page }) => {
  let inferencePayload: Record<string, unknown> | null = null;
  await page.route("**/api/inference/priority", async (route) => {
    inferencePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "ollama-structured-output",
        provider_version: "ollama:test-model",
        input_sha256: "a".repeat(64),
        canonical_name: "수제 소스",
        category: "가공 소스",
        storage_type: "refrigerated",
        storage_confidence: 0.6,
        estimated_use_first_window: { start_date: "2026-09-06", end_date: "2026-09-09", range_days: "2~5일", rule_id: "priority.ollama-unverified.v1" },
        reasoning: ["로컬 모델이 가공 소스 후보로 분류했습니다."],
        evidence_refs: ["model-output:unverified"],
        requires_confirmation: true,
        abstained: false,
        abstain_reason: null,
        safety_disclaimer: "AI가 소비기한이나 안전 여부를 판정한 결과가 아닙니다.",
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const receiptDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await expect(receiptDialog).toBeVisible();
  await receiptDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "식품 이름" }).fill("정체불명 수제 소스");
  await expect(dialog.getByRole("group", { name: "식품 추가 1단계" })).toContainText("이름과 보관 위치를 확인해요");
  await dialog.getByRole("button", { name: "먼저 먹을 순서 확인" }).click();

  await expect(dialog.getByText("먼저 확인할 기간")).toBeVisible();
  await expect(dialog.getByRole("group", { name: "식품 추가 2단계" })).toContainText("먼저 먹을 순서를 확인해요");
  await expect(dialog).toContainText("로컬 모델이 가공 소스 후보로 분류했습니다.");
  await expect(dialog).toContainText("AI가 소비기한이나 안전 여부를 판정한 결과가 아닙니다.");
  await expect.poll(() => dialog.locator(".result-callout").last().evaluate((element) => {
    const content = element.closest<HTMLElement>(".sheet-content");
    if (!content) return false;
    const resultBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return resultBox.top >= contentBox.top - 1 && resultBox.top <= contentBox.bottom;
  })).toBe(true);
  await expect.poll(() => inferencePayload).toMatchObject({ product_name: "정체불명 수제 소스", storage_type: "refrigerated" });
});

test("GS1 barcode keeps a date candidate separate until the user confirms it", async ({ page }) => {
  let createPayload: Record<string, unknown> | null = null;
  await page.route("**/api/barcodes/parse", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        raw_scan: "(01)08801114167523(17)260902(10)LOT-7",
        barcode_type: "gs1_data_carrier",
        gtin: "08801114167523",
        lot: "LOT-7",
        date_assertions: [{ kind: "use_by", value: "2026-09-02", ai: "gs1_ai_17", confidence: 1 }],
        warnings: [],
        requires_review: true,
      }),
    });
  });
  await page.route("**/api/products/resolve/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        barcode: "08801114167523",
        status: "matched",
        candidates: [{
          source: "local_fixture",
          source_url: null,
          canonical_name: "국산콩 두부",
          brand: "풀무원",
          category: "두부·콩",
          quantity_text: "1모",
          confidence: 0.95,
          provenance_note: "상품 후보와 GS1 날짜 후보를 함께 확인해 주세요.",
          shelf_life_text: null,
          storage_hint: "refrigerated",
          source_freshness: "current",
        }],
        warnings: [],
        requires_review: true,
        provider_statuses: { local_fixture: "matched" },
      }),
    });
  });
  await page.route("**/api/foods", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    createPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("tab", { name: "바코드" }).click();
  await addDialog.getByRole("textbox", { name: "바코드 숫자" }).fill("(01)08801114167523(17)260902(10)LOT-7");
  await addDialog.getByRole("button", { name: "상품 후보 조회" }).click();

  const dateCandidate = addDialog.getByRole("group", { name: "바코드 날짜 후보" });
  await expect(dateCandidate).toContainText("소비기한 2026.09.02");
  await expect(dateCandidate).toContainText("바코드에서 읽은 날짜 후보");
  await expect(dateCandidate).not.toContainText("gs1_ai_17");
  await expect(addDialog.getByText("풀무원 국산콩 두부 · 상품 후보 1개")).toBeVisible();
  await dateCandidate.getByRole("button", { name: "상품·날짜를 입력에 반영" }).click();

  const manualDialog = page.getByRole("dialog", { name: "직접 추가" });
  await expect(manualDialog.getByRole("textbox", { name: "식품 이름" })).toHaveValue("국산콩 두부");
  const manualDateCandidate = manualDialog.getByRole("status").filter({ hasText: "바코드 소비기한 후보" });
  await expect(manualDateCandidate).toContainText("바코드 소비기한 후보");
  await expect(manualDateCandidate).toContainText("2026.09.02");
  await manualDialog.getByRole("button", { name: "식품 추가하기" }).click();

  await expect.poll(() => createPayload).not.toBeNull();
  expect(createPayload).toMatchObject({
    canonical_name: "국산콩 두부",
    date_kind: "use_by",
    date_value: "2026-09-02",
    date_source: "gs1",
    date_source_detail: "gs1:LOT-7",
    user_confirmed: true,
  });
});

test("account registration offers an explicit guest workspace transfer", async ({ page }) => {
  let guestToken = "";
  let accountRegistered = false;
  let previewCalls = 0;
  let transferAttempts = 0;
  let registrationPayload: Record<string, unknown> | null = null;
  let transferPayload: Record<string, unknown> | null = null;
  let transferRevisionHeader = "";

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(accountRegistered ? { mode: "account", user_id: "account-transfer-e2e", email: "transfer@example.com", workspace_id: "account-transfer-e2e", role: "user" } : { mode: "guest", workspace_id: "guest-transfer-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/register", async (route) => {
    registrationPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    accountRegistered = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-transfer-e2e", email: "transfer@example.com", workspace_id: "account-transfer-e2e", role: "user", access_token: "ra1.transfer.account-transfer-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }),
    });
  });
  await page.route("**/api/account/guest-transfer**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const corsHeaders = { "Access-Control-Allow-Origin": request.headers().origin ?? "http://127.0.0.1:4176", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "content-type, authorization, if-rescue-meal-revision", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
    guestToken = String(body.guest_access_token ?? "");
    if (url.pathname.endsWith("/preview")) {
      previewCalls += 1;
      if (previewCalls === 1) {
        await route.fulfill({ status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ detail: "preview temporarily unavailable" }) });
        return;
      }
        await route.fulfill({ status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Rescue-Meal-Workspace-Revision": "11", "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision" }, body: JSON.stringify({ status: "ready", food_count: 8, receipt_count: 2, storage_event_count: 3, storage_location_count: 2, meal_plan_count: 1, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 1, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: true, message: "게스트 workspace의 기록을 account workspace로 가져올 수 있어요." }) });
      return;
    }
    transferAttempts += 1;
    if (transferAttempts === 1) {
      await route.fulfill({ status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ code: "guest_transfer_persistence_unavailable", detail: "temporary transfer persistence failure", retryable: true, action: "retry_later" }) });
      return;
    }
    transferPayload = body;
    transferRevisionHeader = request.headers()["if-rescue-meal-revision"] ?? "";
      await route.fulfill({ status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Rescue-Meal-Workspace-Revision": "12", "Access-Control-Expose-Headers": "X-Rescue-Meal-Workspace-Revision" }, body: JSON.stringify({ status: "completed", imported_food_count: 8, imported_receipt_count: 2, imported_storage_event_count: 3, imported_meal_plan_count: 1, imported_multi_day_plan_count: 0, imported_shopping_list_count: 0, imported_shopping_receive_operation_count: 1, imported_meal_preferences: false, imported_push_subscription_count: 0, imported_notification_preferences: true, message: "게스트 기록을 account workspace로 가져왔어요." }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    if ((route.request().headers().authorization ?? "").includes("account-transfer-e2e")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-03T09:00:00Z", food_count: 8, rescue_count: 0, rescue_queue: [], inventory: [] }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await dialog.locator("#account-email-input").fill("transfer@example.com");
  await dialog.locator("#account-password-input").fill("correct-horse-battery");
  await dialog.getByRole("button", { name: "계정 만들기" }).click();

  const retryPanel = dialog.getByRole("region", { name: "게스트 기록을 아직 확인하지 못했어요" });
  await expect(retryPanel).toBeVisible();
  await expect(retryPanel.getByRole("button", { name: "다시 확인" })).toBeFocused();
  await retryPanel.getByRole("button", { name: "다시 확인" }).click();
  await expect(dialog.getByRole("region", { name: "게스트 기록을 가져올까요?" })).toBeVisible();
  const transferSummary = dialog.getByRole("status").filter({ hasText: "가져올 기록" });
  await expect(transferSummary).toContainText("식품 8개");
  await expect(transferSummary).toContainText("보관 위치 2개");
  await expect(transferSummary).toContainText("입고 확인 1개");
  await expect(transferSummary).toContainText("알림 설정");
  expect(registrationPayload).toEqual({ email: "transfer@example.com", password: "correct-horse-battery" });

  await dialog.getByRole("button", { name: "계정만 사용" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const restoredDialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(restoredDialog.getByRole("region", { name: "게스트 기록을 가져올까요?" })).toBeVisible();
  const restoredTransferSummary = restoredDialog.getByRole("status").filter({ hasText: "가져올 기록" });
  await expect(restoredTransferSummary).toContainText("식품 8개");
  await expect(restoredTransferSummary).toContainText("보관 위치 2개");
  await expect(restoredTransferSummary).toContainText("입고 확인 1개");
  await expect(restoredTransferSummary).toContainText("알림 설정");
  await expect(restoredDialog.getByRole("button", { name: "게스트 기록 가져오기" })).toBeFocused();

  await restoredDialog.getByRole("button", { name: "게스트 기록 가져오기" }).click();
  await expect(restoredDialog.getByRole("alert")).toContainText("기존 계정 기록은 유지됐어요");
  await expect(restoredDialog.getByRole("button", { name: "게스트 기록 가져오기" })).toBeVisible();
  await restoredDialog.getByRole("button", { name: "게스트 기록 가져오기" }).click();
  await expect.poll(() => transferPayload).not.toBeNull();
  expect(transferAttempts).toBe(2);
  expect(guestToken).toMatch(/^rm1\./);
  expect(transferPayload).toMatchObject({ guest_access_token: guestToken, confirm: true });
  expect(transferRevisionHeader).toBe("11");
  await expect(restoredDialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("게스트 기록을 계정으로 옮겼어요 · 식품 8개 · 영수증 2개 외 4개 기록");
  await expect(page.locator(".connection-pill")).toBeFocused();
});

test("account connection clears the previous workspace while dashboard sync is pending", async ({ page }) => {
  let accountRegistered = false;
  let releaseDashboard!: () => void;
  const dashboardGate = new Promise<void>((resolve) => { releaseDashboard = resolve; });
  const emptyDashboard = { generated_at: "2026-09-18T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: [] };

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(accountRegistered ? { mode: "account", user_id: "account-boundary-e2e", email: "boundary@example.com", workspace_id: "account-boundary-e2e", role: "user" } : { mode: "guest", workspace_id: "guest-boundary-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/register", async (route) => {
    accountRegistered = true;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-boundary-e2e", email: "boundary@example.com", workspace_id: "account-boundary-e2e", role: "user", access_token: "ra1.boundary.account-boundary-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }) });
  });
  await page.route("**/api/account/guest-transfer/preview", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "empty", food_count: 0, receipt_count: 0, storage_event_count: 0, storage_location_count: 0, meal_plan_count: 0, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 0, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: false, message: "가져올 게스트 기록이 없어요." }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    if ((route.request().headers().authorization ?? "").includes("account-boundary-e2e")) {
      await dashboardGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyDashboard) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await dialog.locator("#account-email-input").fill("boundary@example.com");
  await dialog.locator("#account-password-input").fill("correct-horse-battery");
  await dialog.getByRole("button", { name: "계정 만들기" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".connection-pill")).toHaveText("서버 확인 중");
  await expect(page.getByRole("button", { name: "재고 확인 중" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 식품 목록 확인 필요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "시금치 국내산 시금치 · 1팩 확인 필요" })).toHaveCount(0);

  releaseDashboard();
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
});

test("account connection failure keeps the old workspace hidden and exposes reconnect recovery", async ({ page }) => {
  let accountRegistered = false;
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(accountRegistered ? { mode: "account", user_id: "account-boundary-failure-e2e", email: "boundary-failure@example.com", workspace_id: "account-boundary-failure-e2e", role: "user" } : { mode: "guest", workspace_id: "guest-boundary-failure-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/register", async (route) => {
    accountRegistered = true;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-boundary-failure-e2e", email: "boundary-failure@example.com", workspace_id: "account-boundary-failure-e2e", role: "user", access_token: "ra1.boundary-failure.account-boundary-failure-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }) });
  });
  await page.route("**/api/account/guest-transfer/preview", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "empty", food_count: 0, receipt_count: 0, storage_event_count: 0, storage_location_count: 0, meal_plan_count: 0, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 0, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: false, message: "가져올 게스트 기록이 없어요." }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    if ((route.request().headers().authorization ?? "").includes("account-boundary-failure-e2e")) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "account dashboard temporarily unavailable" }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await dialog.locator("#account-email-input").fill("boundary-failure@example.com");
  await dialog.locator("#account-password-input").fill("correct-horse-battery");
  await dialog.getByRole("button", { name: "계정 만들기" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".connection-pill")).toHaveText("오프라인 · 임시 화면");
  await expect(page.getByRole("button", { name: "다시 연결하고 재고 확인하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "재고를 확인할 수 없어요, 다시 연결" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 식품 목록 확인 필요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "시금치 국내산 시금치 · 1팩 확인 필요" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("계정은 연결했지만 식품 목록을 읽지 못했어요");
});

test("account dashboard reconnect recovers the cleared workspace presentation", async ({ page }) => {
  let accountRegistered = false;
  let dashboardAttempts = 0;
  const emptyDashboard = { generated_at: "2026-09-18T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: [] };

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(accountRegistered ? { mode: "account", user_id: "account-reconnect-e2e", email: "reconnect@example.com", workspace_id: "account-reconnect-e2e", role: "user" } : { mode: "guest", workspace_id: "guest-reconnect-e2e", role: "guest" }) });
  });
  await page.route("**/api/auth/register", async (route) => {
    accountRegistered = true;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "account-reconnect-e2e", email: "reconnect@example.com", workspace_id: "account-reconnect-e2e", role: "user", access_token: "ra1.reconnect.account-reconnect-e2e.user.1.9999999999.signature", token_type: "bearer", expires_at: "2030-01-01T00:00:00Z" }) });
  });
  await page.route("**/api/account/guest-transfer/preview", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "empty", food_count: 0, receipt_count: 0, storage_event_count: 0, storage_location_count: 0, meal_plan_count: 0, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 0, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: false, message: "가져올 게스트 기록이 없어요." }) });
  });
  await page.route("**/api/dashboard", async (route) => {
    if ((route.request().headers().authorization ?? "").includes("account-reconnect-e2e")) {
      dashboardAttempts += 1;
      if (dashboardAttempts === 1) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "account dashboard temporarily unavailable" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyDashboard) });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "내 식품 목록 7" })).toBeVisible();
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.getByRole("tab", { name: "회원가입" }).click();
  await dialog.locator("#account-email-input").fill("reconnect@example.com");
  await dialog.locator("#account-password-input").fill("correct-horse-battery");
  await dialog.getByRole("button", { name: "계정 만들기" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".connection-pill")).toHaveText("오프라인 · 임시 화면");
  const reconnect = page.getByRole("button", { name: "다시 연결하고 재고 확인하기" });
  await expect(reconnect).toBeVisible();
  await reconnect.click();
  await expect.poll(() => dashboardAttempts).toBe(2);
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await expect(page.getByRole("heading", { name: "내 식품 목록 0" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("서버에 다시 연결했어요");
});

test("guest transfer conflict sends the user back to a fresh preview", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("rescue-meal.guest-token", "ra1.guest-conflict-account.account-conflict-e2e.user.1.9999999999.signature");
    window.localStorage.setItem("rescue-meal.auth-mode", "account");
    window.localStorage.setItem("rescue-meal.pending-guest-transfer", JSON.stringify({
      guest_access_token: "rm1.guest-conflict-source.9999999999.signature",
      target_workspace_id: "account-conflict-e2e",
    }));
  });

  let previewCalls = 0;
  let importCalls = 0;
  const corsHeaders = (origin: string | undefined) => ({
    "Access-Control-Allow-Origin": origin ?? "http://127.0.0.1:4176",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "account", user_id: "account-conflict-e2e", email: "conflict@example.com", workspace_id: "account-conflict-e2e", role: "user", account_status: "active" }),
    });
  });
  await page.route("**/api/account/guest-transfer**", async (route) => {
    const request = route.request();
    const headers = corsHeaders(request.headers().origin);
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const url = new URL(request.url());
    if (url.pathname.endsWith("/preview")) {
      previewCalls += 1;
      if (previewCalls === 1) {
        await route.fulfill({
          status: 200,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ready", food_count: 1, receipt_count: 0, storage_event_count: 0, meal_plan_count: 0, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 0, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: false, message: "게스트 workspace의 기록을 account workspace로 가져올 수 있어요." }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "conflict", food_count: 1, receipt_count: 0, storage_event_count: 0, meal_plan_count: 0, multi_day_plan_count: 0, shopping_list_count: 0, shopping_receive_operation_count: 0, meal_preferences_changed: false, push_subscription_count: 0, notification_preferences_changed: false, message: "account workspace에 다른 기록이 있어 자동으로 합치지 않아요." }),
      });
      return;
    }
    importCalls += 1;
    await route.fulfill({
      status: 409,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ detail: "account workspace에 다른 기록이 있어 자동으로 합치지 않았습니다." }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-09T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [] }) });
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await expect(dialog.getByRole("region", { name: "게스트 기록을 가져올까요?" })).toBeVisible();
  await dialog.getByRole("button", { name: "게스트 기록 가져오기" }).click();

  await expect.poll(() => importCalls).toBe(1);
  const retryPanel = dialog.getByRole("region", { name: "게스트 기록을 아직 확인하지 못했어요" });
  await expect(retryPanel).toBeVisible();
  await expect(retryPanel).toContainText("자동으로 합치지 않아요");
  await expect(retryPanel).not.toContainText("workspace");
  expect(previewCalls).toBe(2);
});

test("connected custom storage locations can be managed from the account sheet", async ({ page }) => {
  let locations = [
    { id: "ambient", name: "실온", storage_type: "ambient", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "refrigerated", name: "냉장", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "frozen", name: "냉동", storage_type: "frozen", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
  ];
  let updateCalls = 0;
  let revision = 1;
  const dashboard = () => ({ generated_at: "2026-09-10T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: locations });

  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard()) });
  });
  await page.route("**/api/storage-locations", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(locations) });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}") as { name?: string; storage_type?: string };
    const created = { id: "storage-location-kimchi", name: body.name ?? "김치냉장고", storage_type: body.storage_type ?? "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "2026-09-10T09:01:00Z" };
    locations = [...locations, created];
    revision += 1;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
  });
  await page.route("**/api/storage-locations/*", async (route) => {
    const locationId = route.request().url().split("/").pop();
    if (route.request().method() === "PATCH") {
      updateCalls += 1;
      const body = JSON.parse(route.request().postData() ?? "{}") as { name?: string };
      locations = locations.map((location) => location.id === locationId ? { ...location, name: body.name ?? location.name } : location);
      revision += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(locations.find((location) => location.id === locationId)) });
      return;
    }
    locations = locations.filter((location) => location.id !== locationId);
    revision += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ deleted: true }) });
  });
  await page.route("**/api/storage-locations/revision", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision }) });
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-storage-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "내 보관 위치" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("추가한 위치가 아직 없어요");

  await panel.getByRole("textbox", { name: "새 보관 위치 이름" }).fill("김치냉장고");
  await panel.getByRole("button", { name: "보관 위치 추가" }).click();
  await expect(panel).toContainText("김치냉장고");

  await panel.getByRole("button", { name: "이름 수정" }).click();
  await panel.getByRole("textbox", { name: "김치냉장고 보관 위치 이름 수정" }).fill("김치냉장고 1단");
  await panel.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(() => updateCalls).toBe(1);
  await expect(panel).toContainText("김치냉장고 1단");

  await panel.getByRole("button", { name: "삭제", exact: true }).click();
  await panel.getByRole("button", { name: "한 번 더 삭제", exact: true }).click();
  await expect(panel).toContainText("추가한 위치가 아직 없어요");
});

test("connected storage location manager refreshes after a cross-device revision probe", async ({ page }) => {
  const baseLocations = [
    { id: "ambient", name: "실온", storage_type: "ambient", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "refrigerated", name: "냉장", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "frozen", name: "냉동", storage_type: "frozen", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
  ];
  const customLocation = { id: "storage-location-kimchi", name: "김치냉장고", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "2026-09-10T09:00:00Z" };
  let revision = 1;
  let revisionCalls = 0;
  let listCalls = 0;
  let locations = [...baseLocations, customLocation];
  const dashboard = () => ({ generated_at: "2026-09-10T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: locations });

  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard()) });
  });
  await page.route("**/api/storage-locations", async (route) => {
    listCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(locations) });
  });
  await page.route("**/api/storage-locations/revision", async (route) => {
    revisionCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision }) });
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const dialog = page.getByRole("dialog", { name: "내 계정" });
  await dialog.locator(".account-storage-disclosure > summary").click();
  const panel = dialog.getByRole("region", { name: "내 보관 위치" });
  await expect(panel).toContainText("김치냉장고");
  await page.waitForTimeout(100);
  const initialRevisionCalls = revisionCalls;
  const initialListCalls = listCalls;

  locations = [...baseLocations, { ...customLocation, name: "김치냉장고 1단" }];
  revision = 2;
  const visibilityState = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  });
  expect(visibilityState).toBe("visible");

  await expect.poll(() => revisionCalls).toBeGreaterThan(initialRevisionCalls);
  await expect.poll(() => listCalls).toBeGreaterThan(initialListCalls);
  await expect(panel).toContainText("김치냉장고 1단");
  await expect(panel).toContainText("다른 기기에서 보관 위치가 바뀌어 최신 목록을 불러왔어요.");
});

test("connected manual food intake posts the selected custom storage location", async ({ page }) => {
  const customLocation = { id: "storage-location-kimchi", name: "김치냉장고", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "2026-09-10T09:00:00Z" };
  let inventory: Record<string, unknown>[] = [];
  let manualPayload: Record<string, unknown> | null = null;
  let locationSearchUrl = "";
  const dashboard = () => ({ generated_at: "2026-09-10T09:00:00Z", food_count: inventory.length, rescue_count: inventory.length, rescue_queue: inventory, inventory, storage_locations: [
    { id: "ambient", name: "실온", storage_type: "ambient", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "refrigerated", name: "냉장", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "frozen", name: "냉동", storage_type: "frozen", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    customLocation,
  ] });

  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard()) });
  });
  await page.route("**/api/foods", async (route) => {
    manualPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    const food = { id: "manual-custom-location-food", canonical_name: "김치", display_name: "김치", brand: "사용자 입력", quantity: 1, unit: "통", storage_type: "refrigerated", storage_location_id: customLocation.id, opened: false, opened_at: null, date_assertion: { kind: "unknown", value: null, display_label: "확인 필요", source: "unknown", source_detail: "사용자 입력", confidence: 1, user_confirmed: false, applicable_storage_type: null, storage_condition_text: null }, estimated_use_first_window: null, priority: 1, category: "기타", image_path: "/assets/food/tomato.png", note: "확인 필요" };
    inventory = [food];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(food) });
  });
  await page.route("**/api/inventory/search*", async (route) => {
    locationSearchUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: inventory, total: inventory.length, offset: 0, limit: 40, has_more: false, query: "", storage_type: null, storage_location_id: customLocation.id }) });
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  const intakeDialog = page.getByRole("dialog", { name: "영수증으로 추가" });
  await intakeDialog.getByRole("tab", { name: "직접 입력" }).click();
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  const picker = dialog.getByRole("group", { name: "보관 위치 선택" });
  const customLocationOption = picker.getByRole("button", { name: "김치냉장고", exact: true });
  await customLocationOption.scrollIntoViewIfNeeded();
  await customLocationOption.click();
  await dialog.locator("#food-name-input").fill("김치");
  await dialog.locator("#food-quantity-input").fill("1통");
  await dialog.getByRole("button", { name: "식품 추가하기", exact: true }).click();

  await expect.poll(() => manualPayload).toMatchObject({ storage_type: "refrigerated", storage_location_id: customLocation.id });
  await expect(page.locator(".inventory-row").filter({ hasText: "김치" })).toBeVisible();
  await expect(page.locator(".inventory-row").filter({ hasText: "김치" })).toContainText("김치냉장고");
  await expect(page.locator(".priority-card").filter({ hasText: "김치" })).toContainText("김치냉장고");

  await page.getByRole("combobox", { name: "보관 위치 필터" }).selectOption(`location:${customLocation.id}`);
  await expect.poll(() => locationSearchUrl).toContain(`storage_location_id=${customLocation.id}`);
  await expect(page.getByRole("heading", { name: "내 식품 목록 1" })).toBeVisible();
});

test("connected receipt review posts a custom storage location override", async ({ page }) => {
  const customLocation = { id: "storage-location-kimchi", name: "김치냉장고", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "2026-09-10T09:00:00Z" };
  let commitPayload: Record<string, unknown> | null = null;
  const locations = [
    { id: "ambient", name: "실온", storage_type: "ambient", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "refrigerated", name: "냉장", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "frozen", name: "냉동", storage_type: "frozen", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    customLocation,
  ];
  let draft = {
    id: "receipt-custom-location-e2e",
    fingerprint: "receipt-custom-location-fingerprint",
    status: "review_required",
    source_filename: "sample-receipt.jpg",
    purchased_at: "2026-09-10T09:00:00Z",
    lines: [
      { id: "line-spinach-custom", raw_name: "시금치", barcode: null, canonical_name: "시금치", quantity: 1, unit: "팩", storage_suggestion: "refrigerated", unit_price: 2980, total_price: 2980, line_type: "product", match_confidence: 0.9, review_status: "confirmed", review_reason: null, match_source: "local_fixture", source_observation_ids: [], match_candidates: [] },
      { id: "line-tofu-custom", raw_name: "국산콩 두부", barcode: null, canonical_name: "국산콩 두부", quantity: 1, unit: "모", storage_suggestion: "refrigerated", unit_price: 1980, total_price: 1980, line_type: "product", match_confidence: 0.86, review_status: "confirmed", review_reason: null, match_source: "local_fixture", source_observation_ids: [], match_candidates: [] },
      { id: "line-mushroom-custom", raw_name: "맛타리버섯", barcode: null, canonical_name: "맛타리버섯", quantity: 2, unit: "팩", storage_suggestion: "refrigerated", unit_price: 1990, total_price: 3980, line_type: "product", match_confidence: 0.7, review_status: "pending", review_reason: "상품명을 확인해 주세요.", match_source: "parser", source_observation_ids: [], match_candidates: [] },
    ],
    stock_created: false,
  };
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: "2026-09-10T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: locations }) });
  });
  await page.route("**/api/receipts", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(draft) });
  });
  await page.route("**/api/receipts/drafts", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(draft) });
  });
  await page.route("**/api/receipts/*/commit", async (route) => {
    commitPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    draft = { ...draft, status: "committed", stock_created: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ receipt_id: draft.id, status: "committed", commit_transaction_id: "commit-custom-location-e2e", created_lot_ids: ["lot-custom-location-e2e"], skipped_line_ids: [], inventory: [], grocy_sync_status: "not_configured", idempotency_replayed: false }) });
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /식품 추가하기/ }).click();
  await page.getByRole("button", { name: "샘플 영수증으로 시작" }).click();
  const mushroomCard = page.locator('.receipt-line-card[data-line-id="receipt-mushroom"]');
  await mushroomCard.getByRole("group", { name: "맛타리버섯 보관 위치" }).getByRole("button", { name: "김치냉장고", exact: true }).click();
  await page.getByRole("button", { name: "3개 항목 반영하기" }).click();

  await expect.poll(() => commitPayload).not.toBeNull();
  expect((commitPayload?.overrides as Record<string, Record<string, unknown>>)["line-mushroom-custom"]).toMatchObject({ storage_type: "refrigerated", storage_location_id: customLocation.id });
});

test("connected shopping receive posts the selected custom storage location", async ({ page }) => {
  const customLocation = { id: "storage-location-kimchi", name: "김치냉장고", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "2026-09-10T09:00:00Z" };
  const item = { id: "shopping-custom-location-e2e", canonical_name: "김치", quantity: 1, unit: "통", checked: false, sources: [{ source_type: "manual", source_id: "manual-shopping-custom-location-e2e", day_index: null, quantity: 1 }], created_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z" };
  let receivePayload: Record<string, unknown> | null = null;
  let currentItems: unknown[] = [item];
  const dashboard = () => ({ generated_at: "2026-09-10T09:00:00Z", food_count: 0, rescue_count: 0, rescue_queue: [], inventory: [], storage_locations: [
    { id: "ambient", name: "실온", storage_type: "ambient", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "refrigerated", name: "냉장", storage_type: "refrigerated", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    { id: "frozen", name: "냉동", storage_type: "frozen", temperature_celsius: null, temperature_source: "not_measured", created_at: "1970-01-01T00:00:00Z" },
    customLocation,
  ] });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard()) });
  });
  await page.route("**/api/shopping-list", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentItems) });
  });
  await page.route("**/api/shopping-list/*/receive", async (route) => {
    receivePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    currentItems = [];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "received", shopping_item_id: item.id, received_quantity: 1, inventory_lot: { id: "lot-shopping-custom-location-e2e" }, items: [], removed_planned_source_count: 0, idempotency_replayed: false }) });
  });
  await page.route("**/api/receipts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/notifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /장보기 1개가 남아 있어요/ })).toBeVisible();
  await page.getByRole("button", { name: /장보기 1개가 남아 있어요/ }).click();
  const dialog = page.getByRole("dialog", { name: "장보기 목록" });
  const shopping = dialog.getByRole("region", { name: "장보기 항목" });
  await shopping.getByRole("button", { name: "김치 재고에 반영" }).click();
  const receivePanel = shopping.getByRole("form", { name: "김치 재고 반영" });
  await receivePanel.getByRole("group", { name: "김치 보관 위치" }).getByRole("button", { name: "김치냉장고", exact: true }).click();
  await receivePanel.getByRole("button", { name: "재고에 반영", exact: true }).click();

  await expect.poll(() => receivePayload).toMatchObject({ storage_type: "refrigerated", storage_location_id: customLocation.id });
});
