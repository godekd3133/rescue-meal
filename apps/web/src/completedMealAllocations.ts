import type { ApiMealPlan } from "./mealApi";
import { sumQuantities } from "./quantityArithmetic.ts";

export function completedMealAllocations(plan: ApiMealPlan | null, foods: Array<{ id: string; name: string }>) {
  const groups = new Map<string, { key: string; name: string; quantity: number; unit: string }>();
  for (const allocation of plan?.consumed_allocations ?? []) {
    const ingredient = plan?.ingredients.find((item) => item.available_food_id === allocation.food_id || item.allocations?.some((part) => part.food_id === allocation.food_id));
    const knownName = ingredient?.canonical_name ?? foods.find((food) => food.id === allocation.food_id)?.name;
    const name = knownName ?? "재료";
    const unit = allocation.unit ?? ingredient?.unit ?? "";
    // Unknown names keep their separate records; units are never implicitly converted.
    const key = JSON.stringify([knownName ?? allocation.food_id, unit]);
    const group = groups.get(key);
    if (group) group.quantity = sumQuantities([group.quantity, allocation.quantity]);
    else groups.set(key, { key, name, quantity: allocation.quantity, unit });
  }
  return [...groups.values()];
}
