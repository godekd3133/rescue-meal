import type { ApiMealPlan } from "./mealApi";

export function mealRecoveryMinutes(plan: Pick<ApiMealPlan, "recovery"> | null, current: number, presets: readonly number[]) {
  const minimum = plan?.recovery?.minimum_minutes;
  if (plan?.recovery?.kind !== "time" || typeof minimum !== "number" || !Number.isInteger(minimum)
    || minimum <= current || minimum < 5 || minimum > 180) return null;
  return presets.find((value) => value >= minimum) ?? minimum;
}
