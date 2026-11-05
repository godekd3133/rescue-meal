import { expect, type Page } from "@playwright/test";

export type AddMethodName = "영수증" | "바코드" | "라벨" | "직접 입력";

/**
 * The add sheet opens on quick add; the photo/manual methods are one tap away.
 * Picks a method from quick add, or from the method tabs when the sheet already
 * opened on a method (explicit receipt resume, label recheck, ...).
 */
export async function chooseAddMethod(page: Page, name: AddMethodName) {
  const dialog = page.getByRole("dialog").last();
  const quick = dialog.locator(".quick-add-methods").getByRole("button", { name, exact: true });
  const tab = dialog.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(quick.or(tab).first()).toBeVisible();
  if (await quick.isVisible()) {
    await quick.click();
    await expect(dialog.getByRole("tab", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-selected", "true");
  } else if ((await tab.getAttribute("aria-selected")) !== "true") {
    await tab.click();
  }
}
