/**
 * 장보기 suggestion source: foods this workspace used up (다 먹음, 버림 of the whole lot, or a
 * meal that used all of it). Recorded where those actions happen in `Prototype.tsx` and kept per
 * workspace in localStorage; the demo preview starts with example entries and is never stored.
 * Kept apart from `shoppingSuggestions.ts` so the app shell does not carry the 장보기 parser.
 */
export type FinishedFoodEntry = {
  name: string;
  quantity: number;
  unit: string;
  /** ISO datetime the last of it was used. */
  at: string;
};

export const FINISHED_FOOD_WINDOW_DAYS = 14;
const FINISHED_FOOD_LIMIT = 20;
const STORAGE_PREFIX = "rescue-meal.finished-foods.";

export function comparableShoppingName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

/** Newest first, one entry per name (the latest use wins), capped. */
export function recordFinishedFoods(log: readonly FinishedFoodEntry[], entries: ReadonlyArray<Omit<FinishedFoodEntry, "at">>, at: Date): FinishedFoodEntry[] {
  const valid = entries.filter((entry) => entry.name.trim() && entry.unit.trim() && Number.isFinite(entry.quantity) && entry.quantity > 0);
  if (!valid.length) return log as FinishedFoodEntry[];
  const timestamp = at.toISOString();
  const fresh = valid.map((entry) => ({ name: entry.name.trim(), quantity: entry.quantity, unit: entry.unit.trim(), at: timestamp }));
  const names = new Set(fresh.map((entry) => comparableShoppingName(entry.name)));
  return [...fresh, ...log.filter((entry) => !names.has(comparableShoppingName(entry.name)))].slice(0, FINISHED_FOOD_LIMIT);
}

/** The demo preview: a few staples finished earlier this week (none of them in the demo fridge). */
export function createDemoFinishedFoods(referenceDate: Date): FinishedFoodEntry[] {
  const daysAgo = (days: number, hour: number) => new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - days, hour).toISOString();
  return [
    { name: "대파", quantity: 1, unit: "단", at: daysAgo(1, 20) },
    { name: "양파", quantity: 2, unit: "개", at: daysAgo(2, 19) },
    { name: "감자", quantity: 3, unit: "개", at: daysAgo(4, 18) },
  ];
}

export function readFinishedFoods(scope: string, storage: Pick<Storage, "getItem"> | null = safeLocalStorage()): FinishedFoodEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_PREFIX + scope) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is FinishedFoodEntry => Boolean(entry)
      && typeof entry.name === "string" && typeof entry.unit === "string" && typeof entry.at === "string"
      && typeof entry.quantity === "number" && Number.isFinite(entry.quantity) && entry.quantity > 0).slice(0, FINISHED_FOOD_LIMIT);
  } catch {
    return [];
  }
}

export function writeFinishedFoods(scope: string, entries: readonly FinishedFoodEntry[], storage: Pick<Storage, "setItem"> | null = safeLocalStorage()) {
  try {
    storage?.setItem(STORAGE_PREFIX + scope, JSON.stringify(entries.slice(0, FINISHED_FOOD_LIMIT)));
  } catch {
    // Suggestions are a convenience; a blocked store just means none after a reload.
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
