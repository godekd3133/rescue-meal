import assert from "node:assert/strict";
import test from "node:test";
import { dateSourceLabel, getDateBadge, getInventoryDateOriginLabel } from "../src/datePresentation.ts";

test("estimated food stays an ordering hint and not an expiry date", () => {
  const food = { dateKind: "estimated_use_first", dateAssertionKind: "unknown", dateSource: "상품 유형 + 보관 방식" };

  assert.equal(getDateBadge(food), "먼저 살펴볼 시점");
  assert.equal(getInventoryDateOriginLabel(food), "먼저 살펴볼 시점");
  assert.equal(dateSourceLabel(food.dateSource, food.dateKind), "식품 종류와 보관 방법");
});

test("receipt and storage evidence is shown with consumer-friendly labels", () => {
  assert.equal(
    dateSourceLabel("영수증 + 상품 유형 · refrigerated 보관 기준", "estimated_use_first"),
    "구매 기록과 식품 종류 · 냉장 보관 기준",
  );
});

test("internal inference provenance is replaced with neutral copy", () => {
  assert.equal(
    dateSourceLabel("rule-assisted-backend-inference provider priority-rules-v1 input_sha256", "estimated_use_first"),
    "날짜 정보를 확인할 수 없어요",
  );
});
