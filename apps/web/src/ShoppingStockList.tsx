import type { ShoppingInventoryFood } from "./shoppingListPresentation";
import { storageLocationSummary } from "./storageLocationPresentation";

export function ShoppingStockList({ foods }: { foods: readonly ShoppingInventoryFood[] }) {
  return <ul className="shopping-stock-list" aria-label="보관 중인 식품 수량">{foods.map((food) => {
    const method = food.storage;
    const location = method === "냉장" || method === "냉동" || method === "실온"
      ? storageLocationSummary(food.storageLocationName, method)
      : food.storageLocationName ?? method;
    return <li key={food.id}><span>{food.quantity}</span>{" "}<span>{location}</span></li>;
  })}</ul>;
}
