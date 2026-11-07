/**
 * 장보기 one-tap suggestions and the one-field add row.
 *
 * Suggestions come from data the app already holds, never a new endpoint:
 * - `finished`: foods this workspace used up (다 먹음, 버림 of the whole lot, or a meal that used
 *   all of it). Recorded where those actions happen in `Prototype.tsx` and kept per workspace in
 *   localStorage; the demo preview starts with a few example entries and is never stored.
 * - `meal`: the shortages (`사야 함`) of the recipe currently chosen on the 식단 tab.
 * Names already on the list never appear, and a used-up food that is back in the fridge is dropped.
 */
import { defaultQuickAddUnit } from "./quickAddParse";
import { comparableShoppingName, FINISHED_FOOD_WINDOW_DAYS, type FinishedFoodEntry } from "./finishedFoods";

export { comparableShoppingName, createDemoFinishedFoods, readFinishedFoods, recordFinishedFoods, writeFinishedFoods, type FinishedFoodEntry } from "./finishedFoods";

export type ShoppingShortage = { name: string; quantity: number; unit: string };

export type ShoppingSuggestion = {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  source: "finished" | "meal";
};

const SUGGESTION_LIMIT = 6;
const DAY_MS = 86_400_000;

/**
 * A suggestion is something you can buy: counted units (개, 모, 단, 팩, 봉, 구 …) round up to a whole
 * number (a recipe's 0.5개 애호박 is 1개 at the shop); weights and volumes keep their amount.
 */
export function buyableQuantity(quantity: number, unit: string) {
  if (/^(g|kg|mg|ml|l)$/i.test(unit.trim())) return quantity;
  return Math.max(1, Math.ceil(quantity - 1e-9));
}

export function shoppingSuggestions({
  finished,
  shortages,
  inventoryNames,
  listNames,
  now,
  windowDays = FINISHED_FOOD_WINDOW_DAYS,
  limit = SUGGESTION_LIMIT,
}: {
  finished: readonly FinishedFoodEntry[];
  shortages: readonly ShoppingShortage[];
  inventoryNames: readonly string[];
  listNames: readonly string[];
  now: Date;
  windowDays?: number;
  limit?: number;
}): { meal: ShoppingSuggestion[]; finished: ShoppingSuggestion[] } {
  const onList = new Set(listNames.map(comparableShoppingName));
  const inFridge = new Set(inventoryNames.map(comparableShoppingName));
  const meal: ShoppingSuggestion[] = [];
  for (const shortage of shortages) {
    const key = comparableShoppingName(shortage.name);
    if (!key || onList.has(key) || meal.some((suggestion) => suggestion.key === `meal:${key}`) || !(shortage.quantity > 0)) continue;
    meal.push({ key: `meal:${key}`, name: shortage.name.trim(), quantity: buyableQuantity(shortage.quantity, shortage.unit), unit: shortage.unit, source: "meal" });
  }
  const mealNames = new Set(meal.map((suggestion) => comparableShoppingName(suggestion.name)));
  const since = now.getTime() - windowDays * DAY_MS;
  const recent: ShoppingSuggestion[] = [];
  for (const entry of finished) {
    const key = comparableShoppingName(entry.name);
    const at = Date.parse(entry.at);
    if (!key || !Number.isFinite(at) || at < since || at > now.getTime() + DAY_MS) continue;
    if (onList.has(key) || inFridge.has(key) || mealNames.has(key) || recent.some((suggestion) => suggestion.key === `finished:${key}`)) continue;
    recent.push({ key: `finished:${key}`, name: entry.name, quantity: buyableQuantity(entry.quantity, entry.unit), unit: entry.unit, source: "finished" });
  }
  return { meal: meal.slice(0, limit), finished: recent.slice(0, limit) };
}

const ENTRY_UNITS = ["킬로그램", "그램", "리터", "봉지", "박스", "묶음", "포기", "송이", "마리", "인분", "kg", "ml", "mL", "g", "L", "l", "개", "팩", "모", "봉", "병", "캔", "통", "단", "망", "판", "줄", "근", "컵", "장", "알"];
const ENTRY_UNIT_ALIASES: Record<string, string> = { 킬로그램: "kg", 그램: "g", 리터: "L", l: "L", mL: "ml" };
// `우유2팩` and `우유 2` carry an amount; a bare trailing number (`비타500`) stays part of the name.
const ENTRY_PATTERN = new RegExp(`^(.*?)(?:\\s*(\\d+(?:\\.\\d+)?)\\s*(${ENTRY_UNITS.join("|")})|\\s+(\\d+(?:\\.\\d+)?))$`, "u");

/**
 * The add row is one field: `우유`, `우유 2`, `쌀 1000.5g`. A missing amount is 1 and a missing
 * unit is guessed from the name, the same way quick add guesses it (두부 → 모, 대파 → 단, else 개).
 */
export function parseShoppingEntry(text: string): (ShoppingShortage & { unitGiven: boolean }) | null {
  const value = text.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!value) return null;
  const match = value.match(ENTRY_PATTERN);
  if (match && match[1].trim()) {
    const name = match[1].trim();
    const quantity = Number(match[2] ?? match[4]);
    if (Number.isFinite(quantity) && quantity > 0) {
      const unit = match[3] ? ENTRY_UNIT_ALIASES[match[3]] ?? match[3] : defaultQuickAddUnit(name);
      return { name, quantity, unit, unitGiven: Boolean(match[3]) };
    }
  }
  return { name: value, quantity: 1, unit: defaultQuickAddUnit(value), unitGiven: false };
}

/** The row stepper moves by one counting unit, or by 100 for weights and volumes. */
export function shoppingQuantityStep(unit: string) {
  return /^(g|ml|mg)$/i.test(unit.trim()) ? 100 : 1;
}

