import { foodFreshness, freshnessChipLabel, freshnessDateKind, freshnessSpokenLabel, type FreshnessFood } from "../freshness";

/**
 * The one date badge: deck cards, Home rows, 냉장고 rows and food detail all render it.
 * Always D-n / D-day / +n일. Three shapes (freshness.css): printed date filled, estimate dashed
 * (spoken as 추정), no usable date neutral. `decorative` hides it when the parent already speaks the date.
 */
export function FreshnessChip({ food, referenceDate, className, decorative = false }: { food: FreshnessFood; referenceDate: Date; className?: string; decorative?: boolean }) {
  const freshness = foodFreshness(food, referenceDate);
  return (
    <strong
      className={`freshness-chip freshness-${freshness.bucket}${className ? ` ${className}` : ""}`}
      data-estimated={freshness.estimated}
      data-date-kind={freshnessDateKind(freshness)}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : freshnessSpokenLabel(freshness)}
    >
      {freshnessChipLabel(freshness)}
    </strong>
  );
}
