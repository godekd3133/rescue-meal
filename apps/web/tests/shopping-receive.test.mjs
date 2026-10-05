import assert from "node:assert/strict";
import test from "node:test";
import { matchingShoppingInventoryFoods, shoppingQuantityInputValue, validateShoppingReceive } from "../src/shoppingListPresentation.ts";

test("large fractional purchase quantities round-trip through a number input without locale separators", () => {
  for (const quantity of [1, 0.125, 1000.5, 1234567.125]) {
    const rawQuantity = shoppingQuantityInputValue(quantity);
    assert.doesNotMatch(rawQuantity, /,/);
    assert.equal(Number(rawQuantity), quantity);
    assert.deepEqual(validateShoppingReceive({ rawQuantity, storageType: "ambient", purchased: true }), {
      quantity,
      storageType: "ambient",
      error: null,
    });
  }
});

test("receiving requires an explicit storage choice and a completed purchase", () => {
  const withoutStorage = validateShoppingReceive({ rawQuantity: "2", storageType: null, purchased: true });
  assert.match(withoutStorage.error, /보관 방법.*선택/);
  assert.equal("quantity" in withoutStorage, false);

  const notPurchased = validateShoppingReceive({ rawQuantity: "2", storageType: "frozen", purchased: false });
  assert.match(notPurchased.error, /구매를 마치면/);
  assert.equal("quantity" in notPurchased, false);

  for (const storageType of ["ambient", "refrigerated", "frozen"]) {
    assert.deepEqual(validateShoppingReceive({ rawQuantity: "2", storageType, purchased: true }), {
      quantity: 2,
      storageType,
      error: null,
    });
  }
});

test("invalid purchase quantities never produce a receive payload", () => {
  for (const rawQuantity of ["", " ", "0", "-1", "1000,5", "1,000.5", "NaN", "Infinity"]) {
    const result = validateShoppingReceive({ rawQuantity, storageType: "refrigerated", purchased: true });
    assert.match(result.error, /수량/);
    assert.equal("quantity" in result, false);
  }
});

test("stock reminders retain separate quantities and only match exact normalized names", () => {
  const foods = [
    { id: "milk-fridge", name: "우유", quantity: "500ml", storage: "냉장" },
    { id: "milk-pantry", name: " 우유 ", quantity: "1팩", storage: "실온", storageLocationName: "찬장" },
    { id: "soy-milk", name: "두유", quantity: "2팩", storage: "실온" },
    { id: "strawberry-milk", name: "딸기우유", quantity: "1팩", storage: "냉장" },
  ];
  assert.deepEqual(matchingShoppingInventoryFoods("우유", foods), foods.slice(0, 2));
  assert.deepEqual(matchingShoppingInventoryFoods("", foods), []);
  assert.deepEqual(matchingShoppingInventoryFoods("  ", foods), []);
  assert.deepEqual(matchingShoppingInventoryFoods("없는 재료", foods), []);
  assert.equal(foods[0].quantity, "500ml");
  assert.equal(foods[1].quantity, "1팩");
});
