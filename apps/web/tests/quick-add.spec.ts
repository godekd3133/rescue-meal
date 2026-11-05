import { expect, test, type Page } from "@playwright/test";
import { chooseAddMethod } from "./add-flow-helpers";

const FIXTURE_NOW = new Date("2026-09-03T12:00:00+09:00");

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
});

async function openQuickAdd(page: Page) {
  await page.getByTestId("nav-add-food").click();
  const dialog = page.getByRole("dialog", { name: "식품 추가" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "빠른 추가" })).toBeVisible();
  return dialog;
}

test("the add sheet opens on quick add with photo methods one tap away", async ({ page }) => {
  const dialog = await openQuickAdd(page);
  await expect(dialog.getByRole("tablist")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "한 줄로 여러 개 넣기" })).toBeVisible();
  const chips = dialog.getByRole("group", { name: /넣는 식품/ }).locator(".quick-add-chip");
  await expect(chips.first()).toBeVisible();
  expect(await chips.count()).toBeGreaterThanOrEqual(8);
  // Inventory foods come before the starter set, and every chip is a 44px target.
  await expect(chips.first()).toHaveAttribute("data-source", /recent|frequent/);
  const heights = await chips.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  const methods = dialog.getByRole("group", { name: "사진으로 정확하게" });
  for (const name of ["영수증", "라벨", "바코드", "직접 입력"]) await expect(methods.getByRole("button", { name, exact: true })).toBeVisible();

  await methods.getByRole("button", { name: "라벨", exact: true }).click();
  const label = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(label.getByRole("tab", { name: "라벨" })).toHaveAttribute("aria-selected", "true");
  await label.getByRole("button", { name: "빠른 추가" }).click();
  await expect(page.getByRole("dialog", { name: "식품 추가" }).getByRole("region", { name: "빠른 추가" })).toBeVisible();
});

test("chips stage a food and a second tap bumps its quantity", async ({ page }) => {
  const dialog = await openQuickAdd(page);
  const tofu = dialog.getByRole("button", { name: "두부 담기", exact: true });
  await tofu.click();
  const staged = dialog.getByTestId("quick-add-staged-food");
  await expect(staged).toHaveCount(1);
  await expect(staged.first()).toContainText("두부");
  await expect(staged.first().locator(".quick-add-quantity")).toHaveText("1모");
  await dialog.getByRole("button", { name: /^두부 하나 더/ }).click();
  await expect(staged.first().locator(".quick-add-quantity")).toHaveText("2모");
  await expect(dialog.getByRole("button", { name: "두부 하나 더, 지금 2모" })).toHaveAttribute("aria-pressed", "true");
  // Storage is editable on the pill and the estimate is never shown as a printed date.
  const storage = staged.first().getByRole("button", { name: /두부 보관 위치 냉장/ });
  await storage.click();
  await expect(staged.first().getByRole("button", { name: /두부 보관 위치 냉동/ })).toBeVisible();
  await expect(staged.first().locator(".quick-add-pill-date")).toContainText("날짜 미확인");
  await staged.first().getByRole("button", { name: "두부 수량 줄이기" }).click();
  await staged.first().getByRole("button", { name: "두부 수량 줄이기" }).click();
  await expect(staged).toHaveCount(0);
});

test("one line stages several foods, saves them all, and offers the date follow-up", async ({ page }) => {
  const dialog = await openQuickAdd(page);
  const line = dialog.getByRole("textbox", { name: "한 줄로 여러 개 넣기" });
  await line.fill("우유 두부 대파 계란 10개");
  await line.press("Enter");
  const staged = dialog.getByTestId("quick-add-staged-food");
  await expect(staged).toHaveCount(4);
  await expect(line).toHaveValue("");
  await expect(dialog.locator("#quick-add-line-hint")).toHaveText("우유, 두부, 대파, 계란 담았어요.");
  await expect(staged.nth(3).locator(".quick-add-quantity")).toHaveText("10개");
  await expect(staged.nth(2).locator(".quick-add-quantity")).toHaveText("1단");

  // Fix a name before saving.
  await staged.nth(0).getByRole("button", { name: "우유 이름 고치기" }).click();
  await dialog.getByRole("textbox", { name: "넣을 식품 1 이름" }).fill("저지방 우유");
  await dialog.getByRole("textbox", { name: "넣을 식품 1 이름" }).press("Enter");
  await expect(staged.nth(0)).toContainText("저지방 우유");
  await staged.nth(1).getByRole("button", { name: "두부 빼기" }).click();
  await expect(staged).toHaveCount(3);

  const save = dialog.getByRole("button", { name: "3개 넣기" });
  await expect(save).toHaveAttribute("aria-describedby", "quick-add-submit-summary");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".toast-message")).toHaveText("식품 3개를 넣었어요.");
  await expect(page.locator(".toast-action")).toHaveText("날짜 확인할 식품 3개");
  await page.locator(".toast-action").click();
  const firstDetail = page.getByRole("dialog", { name: "저지방 우유" });
  await expect(firstDetail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(firstDetail).toHaveCount(0);
  // Closing one food offers the next one still waiting for a date.
  await expect(page.locator(".toast-message")).toHaveText("다음은 대파 날짜예요. 남은 식품 2개");
  await page.locator(".toast-action").click();
  await expect(page.getByRole("dialog", { name: "대파" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The saved foods become recent chips on this device.
  const reopened = await openQuickAdd(page);
  await expect(reopened.locator('.quick-add-chip[data-source="recent"]').first()).toBeVisible();
  await expect(reopened.getByRole("button", { name: "계란 담기", exact: true })).toHaveAttribute("data-source", "recent");
});

test("manual entry takes an optional date with an explicit meaning", async ({ page }) => {
  await openQuickAdd(page);
  await chooseAddMethod(page, "직접 입력");
  const dialog = page.getByRole("dialog", { name: "직접 추가" });
  await dialog.getByRole("textbox", { name: "식품 이름", exact: true }).fill("요거트");
  await expect(dialog.locator("#manual-date-hint")).toHaveText("비워 두면 날짜 미확인으로 저장돼요.");
  const date = dialog.getByRole("textbox", { name: "날짜", exact: true });
  await date.fill("2026-09-20");
  await expect(dialog.locator(".manual-date-field .korean-date-field-display")).toHaveText("2026년 9월 20일 (일)");
  // A date is never saved without the meaning printed next to it.
  const submit = dialog.locator(".manual-submit");
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText(/날짜 종류를 골라 주세요/);
  await expect(dialog.getByRole("radio", { name: "소비기한" })).toHaveAttribute("aria-checked", "false");
  await dialog.getByRole("radio", { name: "소비기한" }).click();
  await expect(submit).toBeEnabled();
  await expect(dialog.locator("#manual-submit-summary")).toContainText("소비기한");
  await expect(dialog.locator("#manual-submit-summary")).toContainText("2026년 9월 20일");
  await submit.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".toast-message")).toHaveText("요거트를 식품 목록에 추가했어요");
  // A dated food needs no "check the date" follow-up.
  await expect(page.locator(".toast-action")).toHaveCount(0);

  // Clearing the date keeps today's behaviour.
  await openQuickAdd(page);
  await chooseAddMethod(page, "직접 입력");
  const again = page.getByRole("dialog", { name: "직접 추가" });
  await again.getByRole("textbox", { name: "날짜", exact: true }).fill("2026-09-21");
  await again.getByRole("button", { name: "날짜 지우기" }).click();
  await expect(again.getByRole("radiogroup", { name: "날짜 종류" })).toHaveCount(0);
  await again.getByRole("textbox", { name: "식품 이름", exact: true }).fill("버터");
  await expect(again.locator(".manual-submit")).toBeEnabled();
});

test("a blocked receipt save names what to fix and moves there", async ({ page }) => {
  await openQuickAdd(page);
  await chooseAddMethod(page, "영수증");
  await page.getByRole("button", { name: "예시 영수증 보기" }).click();
  const hint = page.locator("#receipt-review-submit-hint > span").first();
  await expect(hint).toContainText("맛타리버섯");
  await expect(hint).toContainText("내용이 맞아요");
  const move = page.getByRole("button", { name: "확인할 항목으로 이동" });
  const box = await move.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await move.click();
  await expect(page.locator('.receipt-line-card[data-line-id="receipt-mushroom"] .receipt-line-confirm-button')).toBeFocused();
  await page.locator('.receipt-line-card[data-line-id="receipt-mushroom"] .receipt-line-confirm-button').click();
  await page.getByRole("button", { name: "3개 식품 저장하기" }).click();
  await expect(page.locator(".toast-message")).toHaveText("영수증에서 식품 3개를 목록에 추가했어요.");
  await expect(page.locator(".toast-action")).toHaveText(/날짜 확인할 식품 \d+개/);
  await page.locator(".toast-action").click();
  const detail = page.getByRole("dialog", { name: "국산콩 두부" });
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("date-confirmation-action")).toBeVisible();
});

test("label results keep the essentials visible and the rest behind a disclosure", async ({ page }) => {
  await openQuickAdd(page);
  await chooseAddMethod(page, "라벨");
  await page.getByRole("button", { name: "예시 라벨 결과 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "라벨로 추가" });
  await expect(dialog.getByTestId("label-result-flow")).toBeVisible();
  await expect(dialog.locator(".label-result-date-field .korean-date-field-display")).toHaveText(/\d{4}년 \d{1,2}월 \d{1,2}일 \([일월화수목금토]\)/);
  const more = dialog.locator(".label-result-more");
  await expect(more).not.toHaveAttribute("open", "");
  await expect(dialog.getByRole("textbox", { name: "라벨 상품명" })).toBeHidden();
  await more.locator("summary").click();
  await expect(dialog.getByRole("textbox", { name: "라벨 상품명" })).toBeVisible();
  await expect(dialog.locator(".label-storage-condition-note")).toBeVisible();
});
