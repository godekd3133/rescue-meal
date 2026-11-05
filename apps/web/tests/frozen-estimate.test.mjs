import test from 'node:test';
import assert from 'node:assert/strict';
import { frozenPriorityDate } from '../src/frozenEstimate.ts';

const today = new Date(2026, 8, 3, 12);

test('freezing an estimated tofu moves its use-first date later, never to tomorrow', () => {
  // The demo tofu's refrigerated estimate is tomorrow; frozen it starts a week out like the API rule.
  assert.equal(frozenPriorityDate({ name: '국산콩 두부', priorityDate: '2026-09-04' }, today), '2026-09-10');
});

test('the frozen window starts from the purchase day when it is known', () => {
  assert.equal(frozenPriorityDate({ name: '맛타리버섯', priorityDate: '2026-09-05', purchasedAt: '2026-09-01T13:20:00+09:00' }, today), '2026-09-08');
  assert.equal(frozenPriorityDate({ name: '닭가슴살', purchasedAt: '2026-09-01' }, today), '2026-09-15');
});

test('freezing never shortens an estimate that is already later', () => {
  assert.equal(frozenPriorityDate({ name: '시금치', priorityDate: '2026-09-30' }, today), '2026-09-30');
});

test('foods without a frozen rule keep their date', () => {
  assert.equal(frozenPriorityDate({ name: '저지방 우유', priorityDate: '2026-09-06' }, today), null);
  assert.equal(frozenPriorityDate({ name: '동물복지 달걀' }, today), null);
  assert.equal(frozenPriorityDate({ name: '알 수 없는 식품' }, today), null);
});
