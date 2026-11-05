import { demoCalendarDate } from "./demoCalendarDate.ts";

/**
 * Frozen-storage start days of the API's reviewed priority rules
 * (`services/api/app/inference.py`, matched by an alias in the food name).
 * `null` means the rule has no frozen window (dairy, eggs).
 */
const FROZEN_RULES: ReadonlyArray<{ aliases: readonly string[]; startDays: number | null }> = [
  { aliases: ["시금치", "상추", "깻잎", "샐러드", "채소"], startDays: 7 },
  { aliases: ["두부", "콩"], startDays: 7 },
  { aliases: ["닭가슴살", "생닭", "닭고기", "돼지고기", "소고기"], startDays: 14 },
  { aliases: ["버섯"], startDays: 7 },
  { aliases: ["우유", "요거트", "치즈"], startDays: null },
  { aliases: ["달걀", "계란"], startDays: null },
  { aliases: ["토마토", "파프리카", "오이", "대파", "양파", "과일"], startDays: 7 },
];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function calendarDay(value: string | undefined): Date | null {
  const match = value ? ISO_DAY.exec(value) : null;
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/**
 * The demo's stand-in for the server re-estimate after a food is frozen: the
 * frozen window starts from the purchase day (or today when it is unknown),
 * like the API. Freezing only ever moves an estimated use-first date later,
 * never earlier, and a food without a frozen rule keeps its date (`null`).
 */
export function frozenPriorityDate(food: { name: string; priorityDate?: string; purchasedAt?: string }, today: Date): string | null {
  const rule = FROZEN_RULES.find((candidate) => candidate.aliases.some((alias) => food.name.includes(alias)));
  if (!rule || rule.startDays === null) return null;
  const reference = calendarDay(food.purchasedAt) ?? today;
  const estimated = demoCalendarDate(reference, rule.startDays);
  const current = food.priorityDate && ISO_DAY.test(food.priorityDate) ? food.priorityDate.slice(0, 10) : null;
  return current && current > estimated ? current : estimated;
}
