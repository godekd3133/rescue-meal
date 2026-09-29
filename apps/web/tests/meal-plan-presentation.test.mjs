import assert from "node:assert/strict";
import test from "node:test";
import { getMealPlanErrorPresentation, mealPlanDisplayCopy } from "../src/mealPlanPresentation.ts";

test("meal plan authentication errors ask for account recovery rather than retrying the recipe", () => {
  assert.deepEqual(getMealPlanErrorPresentation("authentication", "fallback", "conflict"), {
    message: "로그인 정보가 만료됐어요. 계정에 다시 연결해 주세요.",
    recovery: "account",
  });
});

test("meal plan conflict and transient errors keep their appropriate recovery copy", () => {
  assert.deepEqual(getMealPlanErrorPresentation("workspace-conflict", "fallback", "다른 기기에서 바뀌었어요. 다시 불러와 주세요."), {
    message: "다른 기기에서 바뀌었어요. 다시 불러와 주세요.",
    recovery: "refresh",
  });
  assert.deepEqual(getMealPlanErrorPresentation("other", "메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "conflict"), {
    message: "메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    recovery: "retry",
  });
});

test("older planner safety copy still hides internal recipe wording", () => {
  assert.equal(mealPlanDisplayCopy("레시피 후보를 만들려면 식품을 먼저 추가해 주세요."), "메뉴를 찾으려면 식품을 먼저 추가해 주세요.");
  assert.equal(mealPlanDisplayCopy("이 안내는 소비기한을 새로 판정하지 않습니다."), "소비기한이나 먹어도 되는지를 뜻하지 않아요. 포장지 날짜와 식품 상태를 살펴봐 주세요.");
});
