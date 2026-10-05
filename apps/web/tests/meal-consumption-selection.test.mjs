import assert from "node:assert/strict";
import test from "node:test";
import { toggleMealConsumptionSelection, updateMealConsumptionSelection } from "../src/mealConsumptionSelection.ts";

const selection = {
  contextKey: "workspace-a/recipe-a",
  foodId: "tofu",
  currentQuantity: 0.5,
  maxQuantity: 2,
  memory: null,
};

test("skipping a cooking ingredient restores the edited amount instead of all inventory", () => {
  const skipped = toggleMealConsumptionSelection(selection, 1);
  assert.equal(skipped.quantity, 0);
  const restored = toggleMealConsumptionSelection({ ...selection, currentQuantity: 0, memory: skipped.memory }, 1);
  assert.equal(restored.quantity, 0.5);
});

test("zero entered manually still restores the last positive cooking quantity", () => {
  const zeroed = updateMealConsumptionSelection(selection, 0);
  assert.equal(zeroed.quantity, 0);
  const restored = toggleMealConsumptionSelection({ ...selection, currentQuantity: 0, memory: zeroed.memory }, 1);
  assert.equal(restored.quantity, 0.5);
});

test("restoring a quantity uses the recipe default when no previous amount exists", () => {
  const restored = toggleMealConsumptionSelection({ ...selection, currentQuantity: 0 }, 0.75);
  assert.equal(restored.quantity, 0.75);
  assert.notEqual(restored.quantity, selection.maxQuantity);
});

test("restored quantities never exceed the currently available allocation", () => {
  const skipped = toggleMealConsumptionSelection(selection, 1);
  const restored = toggleMealConsumptionSelection({ ...selection, currentQuantity: 0, maxQuantity: 0.25, memory: skipped.memory }, 1);
  assert.equal(restored.quantity, 0.25);
  assert.equal(toggleMealConsumptionSelection({ ...selection, currentQuantity: 0, maxQuantity: 0 }, 1).quantity, 0);
});

test("different recipes and workspaces do not restore the previous recipe quantity", () => {
  const skipped = toggleMealConsumptionSelection(selection, 1);
  for (const contextKey of ["workspace-a/recipe-b", "workspace-b/recipe-a"]) {
    const restored = toggleMealConsumptionSelection({ ...selection, contextKey, currentQuantity: 0, memory: skipped.memory }, 0.75);
    assert.equal(restored.quantity, 0.75);
    assert.equal(restored.memory.contextKey, contextKey);
  }
});

test("each ingredient keeps its own previous amount and invalid quantities remain bounded", () => {
  const skipped = toggleMealConsumptionSelection(selection, 1);
  const otherIngredient = toggleMealConsumptionSelection({ ...selection, foodId: "milk", currentQuantity: 0, memory: skipped.memory }, 1.5);
  assert.equal(otherIngredient.quantity, 1.5);
  assert.equal(otherIngredient.memory.quantities.tofu, 0.5);
  assert.equal(updateMealConsumptionSelection(selection, -2).quantity, 0);
  assert.equal(updateMealConsumptionSelection(selection, Number.NaN).quantity, 0);
  assert.ok(updateMealConsumptionSelection({ ...selection, maxQuantity: 0.1236 }, 10).quantity <= 0.1236);
});
