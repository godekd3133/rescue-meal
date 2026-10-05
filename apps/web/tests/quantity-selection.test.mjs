import assert from "node:assert/strict";
import test from "node:test";
import { halfEventQuantity, isValidEventQuantity, parseDisplayQuantity, quantityStep, reconcileQuantityDraft, stepEventQuantity, validateQuantitySelection } from "../src/quantitySelection.ts";

test("formatted inventory quantities parse thousands without mixing the separator into the unit", () => {
  assert.deepEqual(parseDisplayQuantity("1,000.5g"), { amount: 1000.5, unit: "g" });
  assert.deepEqual(parseDisplayQuantity(" 0.5 kg "), { amount: 0.5, unit: "kg" });
  assert.deepEqual(parseDisplayQuantity("1팩"), { amount: 1, unit: "팩" });
  assert.deepEqual(parseDisplayQuantity(".5팩"), { amount: 0.5, unit: "팩" });
  assert.deepEqual(parseDisplayQuantity("2봉(3개)"), { amount: 2, unit: "봉(3개)" });
  assert.deepEqual(parseDisplayQuantity("1.5팩(500 g)"), { amount: 1.5, unit: "팩(500 g)" });
  assert.deepEqual(parseDisplayQuantity("2"), { amount: 2, unit: "개" });
  for (const input of ["", "g", "0팩", "1,00g", "10,00.5g", "1.2.3g", "1,000.5,g", "1 23", "1 ,00g"]) {
    assert.equal(parseDisplayQuantity(input), null, input);
  }
});

test("whole and half portions retain their recorded unit including one package and fractional kilograms", () => {
  for (const [available, half] of [[500, 250], [1, 0.5], [0.5, 0.25], [0.002, 0.001]]) {
    assert.equal(halfEventQuantity(available), half);
    assert.deepEqual(validateQuantitySelection(String(available), available), { quantity: available, remaining: 0, error: null });
    assert.deepEqual(validateQuantitySelection(String(half), available), { quantity: half, remaining: half, error: null });
  }
});

test("a half preset is unavailable when it would require rounding or fall below the minimum", () => {
  for (const available of [0.001, 0.003, 0, -1, NaN, Infinity]) assert.equal(halfEventQuantity(available), null);
  assert.equal(isValidEventQuantity(0.001, 0.001), true);
  assert.equal(isValidEventQuantity(0.0005, 0.001), false);
});

test("invalid, blank, out-of-range, and overly precise input cannot produce a mutation quantity", () => {
  for (const draft of ["", " ", "0", "-1", "501", "0.0001", "1.2345", "1,5", "NaN", "Infinity", "2e2", "abc"]) {
    const result = validateQuantitySelection(draft, 500);
    assert.equal(result.quantity, null, draft);
    assert.equal(result.remaining, null, draft);
    assert.ok(result.error, draft);
  }
  for (const quantity of [0, -1, 501, 0.0001, 1.2345, NaN, Infinity]) assert.equal(isValidEventQuantity(quantity, 500), false);
});

test("fractional input and subtraction avoid floating point leftovers", () => {
  assert.deepEqual(validateQuantitySelection(" .1 ", 0.3), { quantity: 0.1, remaining: 0.2, error: null });
  assert.deepEqual(validateQuantitySelection("1.", 2), { quantity: 1, remaining: 1, error: null });
  assert.equal(validateQuantitySelection("0.001", 0.001).quantity, 0.001);
});

test("steppers use the existing unit and remain within the lot bounds", () => {
  assert.equal(quantityStep(500, "g"), 10);
  assert.equal(quantityStep(500, "mL"), 10);
  assert.equal(quantityStep(0.5, "kg"), 0.1);
  assert.equal(quantityStep(1, "팩"), 0.1);
  assert.equal(quantityStep(5, "개"), 1);
  assert.equal(quantityStep(0.002, "kg"), 0.001);
  assert.equal(stepEventQuantity(250, 1, 500, "g"), 260);
  assert.equal(stepEventQuantity(0.25, -1, 0.5, "kg"), 0.15);
  assert.equal(stepEventQuantity(0.5, 1, 0.5, "kg"), 0.5);
  assert.equal(stepEventQuantity(0.001, -1, 0.5, "kg"), 0.001);
});

test("refresh preserves custom and incomplete drafts while whole-lot selection follows the current inventory", () => {
  assert.equal(reconcileQuantityDraft("500", 500, 200), "200");
  assert.equal(reconcileQuantityDraft("100", 500, 200), "100");
  assert.equal(reconcileQuantityDraft("250", 500, 200), "250");
  assert.ok(validateQuantitySelection(reconcileQuantityDraft("250", 500, 200), 200).error);
  assert.equal(reconcileQuantityDraft("", 500, 200), "");
  assert.equal(reconcileQuantityDraft("not a quantity", 500, 200), "not a quantity");
});
