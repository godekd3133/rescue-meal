import assert from "node:assert/strict";
import test from "node:test";
import { changeManualQuantityUnit, getManualFoodNameSuggestions, parseManualQuantity } from "../src/manualEntryConvenience.ts";

test("unit choices preserve typed amounts including decimal precision", () => {
  assert.equal(changeManualQuantityUnit("2개", "팩"), "2팩");
  assert.equal(changeManualQuantityUnit("0.50모", "g"), "0.50g");
  assert.equal(changeManualQuantityUnit(" 250.125 ml ", "g"), "250.125g");
  assert.equal(changeManualQuantityUnit(".5", "모"), ".5모");
  assert.equal(changeManualQuantityUnit("1000.000", "ml"), "1000.000ml");
  assert.deepEqual(parseManualQuantity("1.25 팩"), { amount: 1.25, amountText: "1.25", unit: "팩" });
  assert.deepEqual(parseManualQuantity("2봉(3개)"), { amount: 2, amountText: "2", unit: "봉(3개)" });
  assert.equal(changeManualQuantityUnit("2봉(3개)", "팩"), "2팩");
});

test("unit choices leave empty and invalid drafts untouched instead of supplying one", () => {
  for (const draft of ["", " ", "팩", "0개", "-1개", "1..5팩", "1/2개", "1,000g", "1e3g", "Infinity", "NaN", "2개 3팩", "1."]) {
    assert.equal(parseManualQuantity(draft), null, draft);
    assert.equal(changeManualQuantityUnit(draft, "개"), draft);
  }
  assert.equal(changeManualQuantityUnit("2팩", "unknown"), "2팩");
});

test("existing-name suggestions deduplicate normalized names and never exceed four", () => {
  const foods = [
    { name: "  두부 " },
    { name: "두부" },
    { name: "" },
    { name: "  " },
    { name: " Greek   Yogurt " },
    { name: "Ｇｒｅｅｋ Ｙｏｇｕｒｔ" },
    { name: "계란" },
    { name: "우유" },
    { name: "토마토" },
  ];
  assert.deepEqual(getManualFoodNameSuggestions(foods, ""), ["두부", "Greek Yogurt", "계란", "우유"]);
  assert.equal(foods[0].name, "  두부 ");
  assert.deepEqual(getManualFoodNameSuggestions([], ""), []);
});

test("existing-name suggestions match the current normalized query as a substring", () => {
  const foods = [
    { name: "두부" },
    { name: "연두부" },
    { name: "두부면" },
    { name: "냉동 두부" },
    { name: "부침 두부" },
    { name: "Greek Yogurt" },
  ];
  assert.deepEqual(getManualFoodNameSuggestions(foods, " 두부 "), ["두부", "연두부", "두부면", "냉동 두부"]);
  assert.deepEqual(getManualFoodNameSuggestions(foods, "ｙｏＧ"), ["Greek Yogurt"]);
  assert.deepEqual(getManualFoodNameSuggestions(foods, "  냉동   두부  "), ["냉동 두부"]);
  assert.deepEqual(getManualFoodNameSuggestions(foods, "새 식품"), []);
});
