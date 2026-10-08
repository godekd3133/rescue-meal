import assert from "node:assert/strict";
import test from "node:test";
import { demoCalendarDate } from "../src/demoCalendarDate.ts";

test("demo dates use the viewer's calendar date, including near midnight", () => {
  assert.equal(demoCalendarDate(new Date(2026, 9, 8, 0, 1), -1), "2026-10-07");
  assert.equal(demoCalendarDate(new Date(2026, 9, 8, 23, 59), 6), "2026-10-14");
});

test("demo dates roll across months, years and leap days without changing the reference", () => {
  const reference = new Date(2026, 11, 31, 23, 59);
  const before = reference.getTime();
  assert.equal(demoCalendarDate(reference, 1), "2027-01-01");
  assert.equal(demoCalendarDate(new Date(2026, 0, 1), -2), "2025-12-30");
  assert.equal(demoCalendarDate(new Date(2028, 1, 28), 1), "2028-02-29");
  assert.equal(demoCalendarDate(new Date(2026, 1, 28), 1), "2026-03-01");
  assert.equal(reference.getTime(), before);
});
