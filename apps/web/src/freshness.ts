/**
 * Freshness buckets for the home overview and inventory chips.
 *
 * Buckets only order what to look at first. They never say whether food is safe:
 * an estimated date stays "estimated" all the way to the chip style.
 */
export type FreshnessBucket = "past" | "today" | "soon" | "week" | "later" | "unknown";

export type FreshnessFood = {
  dateKind: string;
  dateAssertionKind?: string;
  dateDetail: string;
  priorityDate?: string;
};

export type Freshness = {
  bucket: FreshnessBucket;
  /** Whole days from today to the date; negative once passed; null without a usable date. */
  daysLeft: number | null;
  /** True when the date is an estimate (먼저 살펴볼 시점), not a printed or user-recorded date. */
  estimated: boolean;
};

export const FRESHNESS_BUCKETS: ReadonlyArray<{ bucket: FreshnessBucket; label: string }> = [
  { bucket: "past", label: "지남" },
  { bucket: "today", label: "오늘·내일" },
  { bucket: "soon", label: "3일 안" },
  { bucket: "week", label: "이번 주" },
  { bucket: "later", label: "여유" },
  { bucket: "unknown", label: "날짜 없음" },
];

function calendarDay(value: string | undefined): number | null {
  const match = value?.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? timestamp : null;
}

export function foodFreshness(food: FreshnessFood, referenceDate: Date): Freshness {
  const estimated = food.dateKind === "estimated_use_first";
  // 제조일·포장일은 소비 순서를 정하는 날짜가 아니다.
  if (food.dateKind === "unknown" || food.dateAssertionKind === "production_date" || food.dateAssertionKind === "packaging_date") {
    return { bucket: "unknown", daysLeft: null, estimated };
  }
  const target = estimated
    ? calendarDay(food.priorityDate) ?? calendarDay(food.dateDetail)
    : calendarDay(food.dateDetail) ?? calendarDay(food.priorityDate);
  if (target === null) return { bucket: "unknown", daysLeft: null, estimated };
  const today = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const daysLeft = Math.round((target - today) / 86_400_000);
  const bucket: FreshnessBucket = daysLeft < 0 ? "past" : daysLeft <= 1 ? "today" : daysLeft <= 3 ? "soon" : daysLeft <= 7 ? "week" : "later";
  return { bucket, daysLeft, estimated };
}

/** Short chip text: "D-day", "D-3", "+2일"; far dates cap at "D-99+" / "+99일+" (the spoken label stays exact). */
export function freshnessChipLabel(freshness: Freshness) {
  if (freshness.daysLeft === null) return "날짜 없음";
  if (freshness.daysLeft === 0) return "D-day";
  if (freshness.daysLeft > 99) return "D-99+";
  if (freshness.daysLeft > 0) return `D-${freshness.daysLeft}`;
  if (freshness.daysLeft < -99) return "+99일+";
  return `+${-freshness.daysLeft}일`;
}

/** Which of the three badge shapes a date gets: filled printed date, dashed estimate, neutral unknown. */
export type FreshnessDateKind = "printed" | "estimated" | "unknown";

export function freshnessDateKind(freshness: Freshness): FreshnessDateKind {
  if (freshness.daysLeft === null) return "unknown";
  return freshness.estimated ? "estimated" : "printed";
}

/** Screen-reader text for the chip, in words rather than the D- shorthand. Estimates say 추정 out loud. */
export function freshnessSpokenLabel(freshness: Freshness) {
  const kind = freshness.estimated ? "추정, 먼저 살펴볼 시점" : "표시 날짜";
  if (freshness.daysLeft === null) return "날짜 없음";
  if (freshness.daysLeft === 0) return `${kind} 오늘`;
  if (freshness.daysLeft > 0) return `${kind}까지 ${freshness.daysLeft}일`;
  return `${kind}에서 ${-freshness.daysLeft}일 지남`;
}

export function countFreshness<T extends FreshnessFood>(foods: readonly T[], referenceDate: Date) {
  const groups = new Map<FreshnessBucket, T[]>(FRESHNESS_BUCKETS.map(({ bucket }) => [bucket, []]));
  for (const food of foods) groups.get(foodFreshness(food, referenceDate).bucket)!.push(food);
  return groups;
}
