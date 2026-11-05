/**
 * "이번 주 구한 음식": distinct foods eaten (consumed) within the last few days.
 *
 * Only eating counts. Discards never enter this log, so Home can celebrate what was
 * rescued without keeping score of what was thrown away.
 */
export type RescueLogEntry = { foodId: string; at: string };

export const RESCUE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export function countRescuedFoods(log: readonly RescueLogEntry[], now: Date, days = RESCUE_WINDOW_DAYS) {
  const end = now.getTime();
  const start = end - days * DAY_MS;
  const rescued = new Set<string>();
  for (const entry of log) {
    const at = Date.parse(entry.at);
    if (Number.isFinite(at) && at > start && at <= end) rescued.add(entry.foodId);
  }
  return rescued.size;
}

export function appendRescueEntries(log: readonly RescueLogEntry[], foodIds: readonly string[], at: Date) {
  if (!foodIds.length) return log as RescueLogEntry[];
  const timestamp = at.toISOString();
  return [...log, ...foodIds.map((foodId) => ({ foodId, at: timestamp }))];
}

/** The demo preview starts with a few foods already eaten this week (none of them still in the fridge). */
export function createDemoRescueLog(referenceDate: Date): RescueLogEntry[] {
  const daysAgo = (days: number, hour: number) => {
    const value = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - days, hour);
    return value.toISOString();
  };
  return [
    { foodId: "demo-rescued-spinach", at: daysAgo(1, 19) },
    { foodId: "demo-rescued-tofu", at: daysAgo(3, 12) },
    { foodId: "demo-rescued-bread", at: daysAgo(5, 8) },
  ];
}
