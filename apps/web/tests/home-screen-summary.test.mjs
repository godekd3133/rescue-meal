import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeShelves, countUrgentFoods } from '../src/screens/homeSummary.ts';
import { countRescuedFoods, appendRescueEntries, createDemoRescueLog } from '../src/rescueSummary.ts';

const today = new Date(2026, 10, 5, 9);
const food = (id, storage, dateDetail, extra = {}) => ({ id, storage, dateKind: 'actual_printed', dateDetail, ...extra });

test('shelf summary keeps one line per storage that has food, soonest previews first', () => {
  const rows = summarizeShelves([
    food('milk', '냉장', '2026.11.12'),
    food('tofu', '냉장', '2026.11.06'),
    food('kimchi', '냉장', '2026.12.30'),
    food('egg', '냉장', '2026.11.20'),
    food('rice', '실온', '2027.03.01'),
  ], today);
  assert.deepEqual(rows.map((row) => row.storage), ['냉장', '실온']);
  assert.equal(rows[0].count, 4);
  assert.equal(rows[0].soonCount, 1);
  assert.deepEqual(rows[0].previews.map((item) => item.id), ['tofu', 'milk', 'egg']);
  assert.equal(rows[1].soonCount, 0);
});

test('an empty workspace has no shelf rows at all', () => {
  assert.deepEqual(summarizeShelves([], today), []);
});

test('urgent count covers passed, today/tomorrow and within-three-days foods only', () => {
  const foods = [
    food('past', '냉장', '2026.11.03'),
    food('tomorrow', '냉장', '2026.11.06'),
    food('three', '냉장', '2026.11.08'),
    food('week', '냉장', '2026.11.11'),
    food('unknown', '냉장', '미확인', { dateKind: 'unknown' }),
  ];
  assert.equal(countUrgentFoods(foods, today), 3);
});

test('rescued count is distinct eaten foods inside the window', () => {
  const now = new Date('2026-11-05T09:00:00Z');
  const log = [
    { foodId: 'a', at: '2026-11-04T09:00:00Z' },
    { foodId: 'a', at: '2026-11-05T08:00:00Z' },
    { foodId: 'b', at: '2026-10-30T10:00:00Z' },
    { foodId: 'old', at: '2026-10-28T09:00:00Z' },
    { foodId: 'future', at: '2026-11-06T09:00:00Z' },
    { foodId: 'bad', at: 'not-a-date' },
  ];
  assert.equal(countRescuedFoods(log, now), 2);
  assert.equal(countRescuedFoods(log, now, 10), 3);
});

test('appending eaten foods adds entries without mutating the previous log', () => {
  const log = [{ foodId: 'a', at: '2026-11-04T09:00:00Z' }];
  const next = appendRescueEntries(log, ['b', 'c'], new Date('2026-11-05T09:00:00Z'));
  assert.equal(log.length, 1);
  assert.equal(next.length, 3);
  assert.equal(countRescuedFoods(next, new Date('2026-11-05T10:00:00Z')), 3);
  assert.equal(appendRescueEntries(log, [], new Date()), log);
});

test('the demo preview starts with this week rescues that are no longer in the fridge', () => {
  const log = createDemoRescueLog(today);
  assert.equal(countRescuedFoods(log, today), 3);
  assert.ok(log.every((entry) => entry.foodId.startsWith('demo-rescued-')));
});
