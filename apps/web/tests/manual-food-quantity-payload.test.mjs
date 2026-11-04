import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { parseDisplayQuantity } from "../src/quantitySelection.ts";

const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const start = source.indexOf("mutate: () => mealApi.createManualFood({");
assert.ok(start > 0);
const payload = source.slice(start, source.indexOf("storage_type:", start));
const quantityExpression = payload.match(/quantity: (.*),\n/)[1];
const unitExpression = payload.match(/unit: (.*),\n/)[1];
const requestQuantity = new Function("food", "submittedQuantity", `return { quantity: ${quantityExpression}, unit: ${unitExpression} };`);

for (const [display, quantity, unit] of [
  ["3팩(200g)", 3, "팩(200g)"],
  ["1.5팩(500 g)", 1.5, "팩(500 g)"],
  ["1,000g", 1000, "g"],
  ["1,000.5ml", 1000.5, "ml"],
  ["0.0001kg", 0.0001, "kg"],
]) test(`manual food request preserves ${display}`, () => {
  assert.deepEqual(requestQuantity({ quantity: display }, parseDisplayQuantity(display)), { quantity, unit });
});

test("unreadable quantities stop before pending-save registration instead of defaulting to one item", async () => {
  const start = source.indexOf("  const addManualFood = async (food:");
  const end = source.indexOf("    const submissionSession =", start);
  assert.ok(start > 0 && end > start);
  const code = stripTypeScriptTypes("function create() {" + source.slice(start, end) + "return { reachedMutationSetup: true }; }; return addManualFood; }");
  const pendingCalls = [];
  const values = {
    captureMutationScope: () => () => true,
    parseDisplayQuantity,
    mealApi: { isConfigured: true, hasSession: true, workspaceKey: "own" },
    workspaceSync: { currentWorkspaceKey: "own" },
    pendingManualFoodMutationKeysRef: { current: { has: (id) => { pendingCalls.push(id); return false; } } },
  };
  const submit = new Function(...Object.keys(values), code + ";return create();")(...Object.values(values));
  for (const quantity of ["", "수량 확인", "0팩", "1,00g", "1.2.3g"]) {
    assert.deepEqual(await submit({ id: "draft", quantity }), { saved: false, message: "수량과 단위를 다시 확인해 주세요." });
  }
  assert.deepEqual(pendingCalls, []);
});
