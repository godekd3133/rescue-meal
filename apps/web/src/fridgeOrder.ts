import { foodFreshness, type FreshnessFood } from "./freshness.ts";

export type FridgeOrderFood = FreshnessFood & { id: string; name: string };

/**
 * 냉장고 list order: the date a person reads on the badge, soonest first. Passed dates lead
 * (longest passed first), then D-day, D-1, … Printed and estimated dates are mixed by their
 * day; foods without a usable date go last. Ties read alphabetically by name.
 * The order is the client's own: connected inventory arrives in the API's priority order.
 */
export function sortFoodsByDate<T extends FridgeOrderFood>(foods: readonly T[], referenceDate: Date): T[] {
  return foods
    .map((food) => ({ food, daysLeft: foodFreshness(food, referenceDate).daysLeft }))
    .sort((left, right) => {
      if (left.daysLeft !== right.daysLeft) {
        if (left.daysLeft === null) return 1;
        if (right.daysLeft === null) return -1;
        return left.daysLeft - right.daysLeft;
      }
      return left.food.name.localeCompare(right.food.name, "ko") || left.food.id.localeCompare(right.food.id);
    })
    .map(({ food }) => food);
}
