import assert from "node:assert/strict";
import test from "node:test";
import { groupNotificationsByDay, notificationUrgency } from "../src/notificationPresentation.ts";

const today = new Date(2026, 10, 5);
const note = (id, kind, due_date, extra = {}) => ({ id, kind, due_date, sync_state: null, ...extra });

test("food reminders group by the day they are about, then undated, then inventory-app sync", () => {
  const groups = groupNotificationsByDay([
    note("sync", "grocy_sync", null),
    note("later", "date_due", "2026-11-07"),
    note("past", "date_check", "2026-11-04"),
    note("undated", "storage_mismatch", null),
    note("today", "date_due", "2026-11-05"),
    note("tomorrow", "date_due", "2026-11-06"),
  ], today);
  assert.deepEqual(groups.map((group) => group.label), ["날짜 지남", "오늘", "내일", "11월 7일 토요일", "날짜 없는 알림", "재고 앱 연동"]);
  assert.deepEqual(groups.flatMap((group) => group.items.map((item) => item.id)), ["past", "today", "tomorrow", "later", "undated", "sync"]);
});

test("the colour bar only says how soon; sync rows that need a decision use caution", () => {
  assert.equal(notificationUrgency(note("a", "date_due", "2026-11-04"), today), "past");
  assert.equal(notificationUrgency(note("b", "date_due", "2026-11-05"), today), "today");
  assert.equal(notificationUrgency(note("c", "date_due", "2026-11-08"), today), "soon");
  assert.equal(notificationUrgency(note("d", "date_due", "2026-11-20"), today), "neutral");
  assert.equal(notificationUrgency(note("e", "date_check", null), today), "neutral");
  assert.equal(notificationUrgency(note("f", "grocy_sync", null, { sync_state: "action_required" }), today), "caution");
  assert.equal(notificationUrgency(note("g", "grocy_sync", null, { sync_state: "applied" }), today), "neutral");
});
