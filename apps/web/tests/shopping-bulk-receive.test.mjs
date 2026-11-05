import assert from "node:assert/strict";
import test from "node:test";
import { shoppingBulkReceivePlan, shoppingSourceBadges } from "../src/shoppingListPresentation.ts";

const item = (id, name, checked, extra = {}) => ({ id, canonical_name: name, quantity: 2, unit: "개", checked, sources: [{ source_type: "manual", source_id: id, quantity: 2 }], created_at: "", updated_at: "", ...extra });

test("bulk put-away takes only bought items that are not in the fridge yet, with default storage", () => {
  const plan = shoppingBulkReceivePlan([
    item("milk", "우유", true),
    item("dumpling", "냉동 만두", true),
    item("rice", "쌀", true),
    item("spinach", "시금치", false),
    item("done", "두부", true, { received_food_id: "lot-1" }),
  ], [{ id: "lot-2", name: "우유", quantity: "1개", storage: "실온" }]);
  assert.deepEqual(plan.map((entry) => [entry.item.id, entry.input.storageType, entry.input.quantity]), [
    ["milk", "ambient", 2],
    ["dumpling", "frozen", 2],
    ["rice", "ambient", 2],
  ]);
  assert.ok(plan.every((entry) => entry.input.storageLocationId === null));
});

test("source badges name where an item came from", () => {
  assert.deepEqual(shoppingSourceBadges({ sources: [{ source_type: "meal_plan" }, { source_type: "manual" }] }), ["식단", "직접"]);
  assert.deepEqual(shoppingSourceBadges({ sources: [{ source_type: "manual" }] }), ["직접"]);
});
