import assert from "node:assert/strict";
import test from "node:test";
import { foodFreshness, freshnessChipLabel, freshnessDateKind, freshnessSpokenLabel } from "../src/freshness.ts";

const today = new Date(2026, 8, 3);
const food = (dateDetail, dateKind = "printed_use_by", extra = {}) => ({ dateKind, dateDetail, ...extra });

test("chip text is always D-n / D-day / +n일, capped far away", () => {
  assert.equal(freshnessChipLabel(foodFreshness(food("2026.09.03"), today)), "D-day");
  assert.equal(freshnessChipLabel(foodFreshness(food("2026.09.13"), today)), "D-10");
  assert.equal(freshnessChipLabel(foodFreshness(food("2026.09.01"), today)), "+2일");
  assert.equal(freshnessChipLabel(foodFreshness(food("2099.01.01"), today)), "D-99+");
  assert.equal(freshnessChipLabel(foodFreshness(food("2020.01.01"), today)), "+99일+");
});

test("three badge kinds: printed, estimated (spoken as 추정), unknown", () => {
  const printed = foodFreshness(food("2026.09.05"), today);
  assert.equal(freshnessDateKind(printed), "printed");
  assert.equal(freshnessSpokenLabel(printed), "표시 날짜까지 2일");

  const estimated = foodFreshness(food("", "estimated_use_first", { priorityDate: "2026-09-04" }), today);
  assert.equal(freshnessDateKind(estimated), "estimated");
  assert.equal(freshnessSpokenLabel(estimated), "추정, 먼저 살펴볼 시점까지 1일");

  const unknown = foodFreshness(food("", "unknown"), today);
  assert.equal(freshnessDateKind(unknown), "unknown");
  assert.equal(freshnessChipLabel(unknown), "날짜 없음");
});

test("only past, today·tomorrow and within-three-days buckets carry urgency", () => {
  const bucket = (date) => foodFreshness(food(date), today).bucket;
  assert.equal(bucket("2026.09.02"), "past");
  assert.equal(bucket("2026.09.04"), "today");
  assert.equal(bucket("2026.09.06"), "soon");
  assert.equal(bucket("2026.09.08"), "week");
});
