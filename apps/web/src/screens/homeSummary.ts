import { foodFreshness, type FreshnessFood } from "../freshness.ts";

export type SummaryStorage = "냉장" | "냉동" | "실온";

type SummaryFood = FreshnessFood & { id: string; storage: SummaryStorage };

export type ShelfSummary<T> = {
  storage: SummaryStorage;
  count: number;
  /** Foods in the past/today/soon buckets: the same set the hero counts. */
  soonCount: number;
  /** Up to three foods, soonest first, for the row's photo stack. */
  previews: T[];
};

const STORAGE_ORDER: readonly SummaryStorage[] = ["냉장", "냉동", "실온"];
const URGENT = new Set(["past", "today", "soon"]);

/** One line per storage place; empty shelves are left out instead of saying "비어 있어요" three times. */
export function summarizeShelves<T extends SummaryFood>(foods: readonly T[], referenceDate: Date, previewLimit = 3): ShelfSummary<T>[] {
  return STORAGE_ORDER.flatMap((storage) => {
    const shelf = foods
      .filter((food) => food.storage === storage)
      .map((food) => ({ food, freshness: foodFreshness(food, referenceDate) }))
      .sort((a, b) => (a.freshness.daysLeft ?? 9_999) - (b.freshness.daysLeft ?? 9_999));
    if (!shelf.length) return [];
    return [{
      storage,
      count: shelf.length,
      soonCount: shelf.filter(({ freshness }) => URGENT.has(freshness.bucket)).length,
      previews: shelf.slice(0, previewLimit).map(({ food }) => food),
    }];
  });
}

export function countUrgentFoods<T extends FreshnessFood>(foods: readonly T[], referenceDate: Date) {
  return foods.filter((food) => URGENT.has(foodFreshness(food, referenceDate).bucket)).length;
}
