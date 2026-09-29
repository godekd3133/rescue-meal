import assert from "node:assert/strict";
import test from "node:test";
import { getShoppingListProgressCopy } from "../src/shoppingListPresentation.ts";

test("failed empty shopping reads ask the user to follow the actual error guidance", () => {
  const copy = getShoppingListProgressCopy({
    loading: false,
    error: true,
    itemCount: 0,
    completedCount: 0,
    remainingCount: 0,
  });

  assert.deepEqual(copy, {
    tone: "neutral",
    title: "목록을 불러오지 못했어요",
    description: "아래 안내를 확인하고 다시 시도해 주세요.",
    countLabel: null,
  });
  assert.doesNotMatch(copy.description, /인터넷|연결/);
});

test("only a loaded, fully checked list is announced as complete", () => {
  const loading = getShoppingListProgressCopy({ loading: true, error: false, itemCount: 0, completedCount: 0, remainingCount: 0 });
  const active = getShoppingListProgressCopy({ loading: false, error: false, itemCount: 3, completedCount: 1, remainingCount: 2 });
  const complete = getShoppingListProgressCopy({ loading: false, error: false, itemCount: 3, completedCount: 3, remainingCount: 0 });

  assert.equal(loading.tone, "neutral");
  assert.equal(loading.countLabel, "불러오는 중");
  assert.equal(active.tone, "active");
  assert.equal(active.countLabel, "1/3");
  assert.equal(complete.tone, "complete");
  assert.equal(complete.countLabel, "3/3");
});
