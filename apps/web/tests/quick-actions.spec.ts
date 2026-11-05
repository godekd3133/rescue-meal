import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoTab, mealScreen } from "./ia-helpers";

// Demo (no API) lane for the one-gesture rescue actions: deck 냉동, swipe rows and
// their accessible menu, 되돌리기 on record toasts, and 요리 anchoring the 식단 screen.
const FIXTURE_NOW = new Date("2026-09-03T12:00:00+09:00");
const SHOT_DIR = process.env.QUICK_ACTIONS_SHOT_DIR;

test.beforeEach(async ({ page }) => {
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
  await expect(page.getByRole("main", { name: "Rescue Meal 홈" })).toBeVisible();
});

async function shot(page: Page, name: string) {
  if (!SHOT_DIR) return;
  await page.getByTestId("device-screen").screenshot({ path: `${SHOT_DIR}/${name}.png` }).catch(async () => {
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  });
}

async function swipe(page: Page, row: Locator, dx: number, dy = 0) {
  const box = (await row.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(startX + (dx * step) / 10, startY + (dy * step) / 10);
  await page.mouse.up();
}

function fridgeRow(page: Page, name: string) {
  return page.locator(".swipe-row").filter({ has: page.locator(".inventory-row", { hasText: name }) }).first();
}

test("rescue cards offer 냉동 only without a date question, and freezing leaves the deck with an undo", async ({ page }) => {
  const spinach = page.locator(".rescue-card").filter({ hasText: "시금치" });
  // Printed date passed: date check first, never freeze or eat in one tap.
  await expect(spinach.getByRole("button", { name: /냉동/ })).toHaveCount(0);
  await expect(spinach.getByRole("button", { name: "시금치 날짜 확인" })).toBeVisible();

  const tofu = page.locator(".rescue-card").filter({ hasText: "국산콩 두부" });
  const freeze = tofu.getByRole("button", { name: "국산콩 두부 냉동 보관하기" });
  await expect(freeze).toBeVisible();
  for (const button of await tofu.locator(".rescue-card-action").all()) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const cardBox = (await tofu.boundingBox())!;
  expect(cardBox.width).toBeLessThanOrEqual(168.5);
  await shot(page, "01-deck-freeze");

  await freeze.click();
  const toast = page.locator(".toast");
  await expect(toast).toContainText("국산콩 두부를 냉동 보관으로 옮겼어요");
  await expect(tofu).toHaveCount(0);
  await expect(toast.getByRole("button", { name: "되돌리기" })).toBeVisible();
  await shot(page, "03-undo-toast");
  // Freezing re-estimates the use-first date later (a week out for tofu), never sooner.
  await gotoTab(page, "fridge");
  const frozenChip = page.locator(".inventory-row").filter({ hasText: "국산콩 두부" }).locator(".freshness-chip");
  await expect(frozenChip).toHaveText("D-7");
  await expect(frozenChip).toHaveAttribute("data-estimated", "true");
  await gotoTab(page, "home");

  await toast.getByRole("button", { name: "되돌리기" }).click();
  await expect(toast).toContainText("국산콩 두부 냉동 기록을 되돌렸어요");
  await expect(page.locator(".rescue-card").filter({ hasText: "국산콩 두부" })).toHaveCount(1);
});

test("non-freezable foods never offer 냉동", async ({ page }) => {
  await gotoTab(page, "fridge");
  const row = page.locator(".swipe-row").filter({ hasText: /우유|달걀/ }).first();
  await row.getByRole("button", { name: "기록 메뉴" }).click();
  const menu = row.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "냉동 보관" })).toHaveCount(0);
});

test("swiping a fridge row right records 다 먹음 with undo, and date-check foods open the date check instead", async ({ page }) => {
  await gotoTab(page, "fridge");
  const tofuRow = fridgeRow(page, "국산콩 두부");
  await swipe(page, tofuRow, 140);
  // A swipe never becomes a tap: no detail sheet opened.
  await expect(page.getByRole("dialog", { name: "국산콩 두부" })).toHaveCount(0);
  const toast = page.locator(".toast");
  await expect(toast).toContainText("국산콩 두부를 먹은 기록으로 남겼어요");
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" })).toHaveCount(0);
  await toast.getByRole("button", { name: "되돌리기" }).click();
  await expect(toast).toContainText("국산콩 두부 먹은 기록을 되돌렸어요");
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" })).toHaveCount(1);

  const spinachRow = fridgeRow(page, "시금치");
  await swipe(page, spinachRow, 140);
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
  await expect(page.locator(".inventory-row").filter({ hasText: "시금치" })).toHaveCount(1);
});

test("swiping left reveals 버림 / 냉동; vertical drags still scroll without opening a row", async ({ page }) => {
  await gotoTab(page, "fridge");
  const tofuRow = fridgeRow(page, "국산콩 두부");
  await swipe(page, tofuRow, -150);
  await expect(tofuRow).toHaveAttribute("data-swipe-state", "open");
  await expect(tofuRow.getByRole("button", { name: "국산콩 두부 버린 기록 남기기" })).toBeVisible();
  await expect(tofuRow.getByRole("button", { name: "국산콩 두부 냉동 보관하기" })).toBeVisible();
  await shot(page, "02-swiped-row");
  await tofuRow.getByRole("button", { name: "국산콩 두부 버린 기록 남기기" }).click();
  await expect(page.locator(".toast")).toContainText("국산콩 두부 버림 기록을 남겼어요");
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" })).toHaveCount(0);

  const scrollTop = () => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop);
  const before = await scrollTop();
  const firstRow = page.locator(".swipe-row").first();
  await swipe(page, firstRow, 2, -220);
  await expect.poll(scrollTop).toBeGreaterThan(before);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the row menu gives keyboard and screen reader users every swipe action", async ({ page }) => {
  await gotoTab(page, "fridge");
  const tofuRow = fridgeRow(page, "국산콩 두부");
  const more = tofuRow.getByRole("button", { name: "기록 메뉴" });
  await expect(more).toHaveAccessibleDescription("국산콩 두부");
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const menu = tofuRow.getByRole("menu", { name: "국산콩 두부 기록" });
  await expect(menu.getByRole("menuitem")).toHaveText(["다 먹음", "먹은 양 기록", "냉동 보관", "버림"]);
  await expect(menu.getByRole("menuitem", { name: "다 먹음" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(tofuRow.getByRole("menuitem", { name: "냉동 보관" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("국산콩 두부를 냉동 보관으로 옮겼어요");

  // Date-check foods: the menu offers the date check instead of an "ate" record, and no freeze.
  const spinachRow = fridgeRow(page, "시금치");
  await spinachRow.getByRole("button", { name: "기록 메뉴" }).click();
  await expect(spinachRow.getByRole("menuitem")).toHaveText(["날짜 확인", "먹은 양 기록", "버림"]);
  await spinachRow.getByRole("menuitem", { name: "먹은 양 기록" }).click();
  await expect(page.getByRole("dialog", { name: "시금치" })).toBeVisible();
});

test("undo is idempotent: repeated taps restore the food once", async ({ page }) => {
  await gotoTab(page, "fridge");
  await expect(page.locator(".swipe-row").first()).toBeVisible();
  const before = await page.locator(".inventory-row").count();
  await swipe(page, fridgeRow(page, "국산콩 두부"), 140);
  await expect(page.locator(".inventory-row")).toHaveCount(before - 1);
  const undo = page.locator(".toast").getByRole("button", { name: "되돌리기" });
  await undo.click();
  await expect(undo).toHaveCount(0);
  await expect(page.locator(".inventory-row")).toHaveCount(before);
  await expect(page.locator(".inventory-row").filter({ hasText: "국산콩 두부" })).toHaveCount(1);
});

test("요리 on a rescue card anchors the demo 식단 on that food until cleared", async ({ page }) => {
  await page.locator(".rescue-card").filter({ hasText: "국산콩 두부" }).getByRole("button", { name: "국산콩 두부 넣어 요리하기" }).click();
  const screen = mealScreen(page);
  await expect(screen).toBeVisible();
  const anchor = page.locator(".meal-anchor");
  await expect(anchor).toContainText("국산콩 두부로 만들 수 있는 메뉴");
  await expect(anchor).toHaveAttribute("data-anchor-match", "true");
  await expect(page.locator(".meal-sheet-content")).toContainText("국산콩 두부");
  await shot(page, "04-anchored-meal");
  await anchor.getByRole("button", { name: "국산콩 두부 기준 해제하고 전체 메뉴 보기" }).click();
  await expect(page.locator(".meal-anchor")).toHaveCount(0);
});

test("a quick-add save offers 되돌리기 beside its date follow-up for about five seconds", async ({ page }) => {
  await gotoTab(page, "fridge");
  await expect(page.locator(".swipe-row").first()).toBeVisible();
  const before = await page.locator(".inventory-row").count();
  await page.getByTestId("nav-add-food").click();
  const dialog = page.getByRole("dialog", { name: "식품 추가" });
  const line = dialog.getByRole("textbox", { name: "한 줄로 여러 개 넣기" });
  await line.fill("양배추");
  await line.press("Enter");
  await dialog.getByRole("button", { name: "1개 넣기" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".inventory-row")).toHaveCount(before + 1);
  const toast = page.locator(".toast");
  await expect(toast.locator(".toast-action")).toHaveText(/날짜 확인할 식품/);
  await toast.getByRole("button", { name: "되돌리기" }).click();
  await expect(toast).toContainText("양배추를 목록에서 뺐어요");
  await expect(page.locator(".inventory-row")).toHaveCount(before);
});

test("the undo offer expires while a primary follow-up stays", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByTestId("nav-add-food").click();
  const dialog = page.getByRole("dialog", { name: "식품 추가" });
  const line = dialog.getByRole("textbox", { name: "한 줄로 여러 개 넣기" });
  await line.fill("양배추");
  await line.press("Enter");
  await dialog.getByRole("button", { name: "1개 넣기" }).click();
  const toast = page.locator(".toast");
  await expect(toast.getByRole("button", { name: "되돌리기" })).toBeVisible();
  await page.clock.runFor(5_500);
  await expect(toast.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
  await expect(toast.locator(".toast-action")).toHaveText(/날짜 확인할 식품/);
});

test("a toast raised while a sheet is open stays reachable by assistive tech and its 되돌리기 works", async ({ page }) => {
  await gotoTab(page, "fridge");
  await page.locator(".inventory-row").filter({ hasText: "시금치" }).first().click();
  const dialog = page.getByRole("dialog", { name: "시금치" });
  await expect(dialog).toBeVisible();
  // The toast appears after the modal sheet hid the rest of the app; it must not be swept into that.
  await dialog.getByRole("radio", { name: "냉동" }).click();
  const status = page.getByRole("status").filter({ hasText: "시금치를 냉동으로 옮겼어요." });
  await expect(status).toBeVisible();
  expect(await status.evaluate((element) => Boolean(element.closest('[aria-hidden="true"]')))).toBe(false);
  const undo = page.getByRole("button", { name: "되돌리기" });
  await expect(undo).toHaveCount(1);
  await undo.click();
  // Undo keeps the food page open and puts the lot back where it was.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "냉장" })).toHaveAttribute("aria-checked", "true");
});
