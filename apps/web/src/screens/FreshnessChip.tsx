import { foodFreshness, freshnessChipLabel, freshnessSpokenLabel, type FreshnessFood } from "../freshness";

/** Date chip shared by Home rows and the fridge inventory: D-day shorthand near, the stored label far away. */
export function FreshnessChip({ food, referenceDate }: { food: FreshnessFood & { dateLabel: string }; referenceDate: Date }) {
  const freshness = foodFreshness(food, referenceDate);
  const text = freshness.daysLeft !== null && (freshness.daysLeft > 7 || freshness.daysLeft < -30) ? food.dateLabel : freshnessChipLabel(freshness);
  return <strong className={`freshness-chip freshness-${freshness.bucket}`} data-estimated={freshness.estimated} aria-label={freshnessSpokenLabel(freshness)}>{text}</strong>;
}
