import assert from "node:assert/strict";
import test from "node:test";
import { formatHistoryTime, groupHistoryByDay, historyDayLabel, sortHistoryNewest } from "../src/historyDates.ts";

const now = new Date(2026, 8, 18, 12, 0, 0);

function localIso(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0).toISOString();
}

test("labels today, yesterday, and older records by calendar day", () => {
  assert.equal(historyDayLabel(localIso(2026, 9, 18, 8), now), "오늘");
  assert.equal(historyDayLabel(localIso(2026, 9, 17, 23), now), "어제");
  assert.equal(historyDayLabel(localIso(2026, 9, 15, 9), now), "9월 15일");
});

test("sorts and groups history without changing records within a day", () => {
  const events = [
    { id: "old", occurred_at: localIso(2026, 9, 15, 9) },
    { id: "today-late", occurred_at: localIso(2026, 9, 18, 18) },
    { id: "today-early", occurred_at: localIso(2026, 9, 18, 8) },
    { id: "yesterday", occurred_at: localIso(2026, 9, 17, 20) },
  ];
  const sorted = sortHistoryNewest(events);
  assert.deepEqual(sorted.map((event) => event.id), ["today-late", "today-early", "yesterday", "old"]);
  const groups = groupHistoryByDay(sorted);
  assert.deepEqual(groups.map((group) => [group.label, group.items.map((event) => event.id)]), [
    ["오늘", ["today-late", "today-early"]],
    ["어제", ["yesterday"]],
    ["9월 15일", ["old"]],
  ]);
});

test("formats only the local time for grouped history rows", () => {
  assert.equal(formatHistoryTime(localIso(2026, 9, 18, 8, 5)), "08:05");
  assert.equal(formatHistoryTime("not-a-date"), "시간 확인 필요");
});
