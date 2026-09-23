import { expect, type Locator } from "@playwright/test";

export type ReadbackState = "stale" | "confirmed" | "notice";

export async function expectReadbackState(locator: Locator, state: ReadbackState) {
  await expect(locator).toHaveAttribute("data-readback-state", state);
}

export type InventoryScopeState = "current" | "loading" | "stale";

export async function expectInventoryScopeState(locator: Locator, state: InventoryScopeState) {
  await expect(locator).toHaveAttribute("data-scope-state", state);
}

export async function expectInventoryRowState(locator: Locator, state: "needs-review" | "priority" | "stored") {
  await expect(locator).toHaveAttribute("data-inventory-status", state);
}

export type ExternalSyncState = "action_required" | "queued" | "processing" | "applied";

export async function expectExternalSyncState(locator: Locator, state: ExternalSyncState) {
  await expect(locator).toHaveAttribute("data-sync-state", state);
}

export async function expectOutboxStatus(locator: Locator, status: string) {
  await expect(locator).toHaveAttribute("data-outbox-status", status);
}

export type MealShoppingLiveState = "error" | "loading" | "mutating" | "queued" | "current";

export async function expectMealShoppingLiveState(locator: Locator, state: MealShoppingLiveState) {
  await expect(locator).toHaveAttribute("data-shopping-live-state", state);
}
