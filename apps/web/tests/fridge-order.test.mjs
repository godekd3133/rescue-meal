import test from 'node:test';
import assert from 'node:assert/strict';
import { sortFoodsByDate } from '../src/fridgeOrder.ts';

const today = new Date(2026, 9, 14);
const food = (id, name, dateKind, dateDetail, extra = {}) => ({ id, name, dateKind, dateDetail, ...extra });

test('the fridge reads by days left: passed first, then D-day, D-1 and later', () => {
  const foods = [
    food('egg', '달걀', 'actual_printed', '2026.10.20'),
    food('tofu', '두부', 'actual_printed', '2026.10.15'),
    food('spinach', '시금치', 'actual_printed', '2026.10.13'),
    food('old', '양배추', 'actual_printed', '2026.10.10'),
    food('milk', '우유', 'actual_printed', '2026.10.14'),
  ];
  assert.deepEqual(sortFoodsByDate(foods, today).map((item) => item.id), ['old', 'spinach', 'milk', 'tofu', 'egg']);
});

test('estimated and printed dates mix by their day; unknown dates go last', () => {
  const foods = [
    food('unknown', '가지', 'unknown', '미확인'),
    food('printed', '닭가슴살', 'actual_printed', '2026.10.17'),
    food('estimate', '버섯', 'estimated_use_first', '미확인', { priorityDate: '2026-10-16' }),
    food('made', '빵', 'actual_printed', '2026.10.01', { dateAssertionKind: 'production_date' }),
  ];
  assert.deepEqual(sortFoodsByDate(foods, today).map((item) => item.id), ['estimate', 'printed', 'unknown', 'made']);
});

test('ties read by name, and the input is not reordered in place', () => {
  const foods = [
    food('milk', '우유', 'actual_printed', '2026.10.17'),
    food('chicken', '닭가슴살', 'estimated_use_first', '미확인', { priorityDate: '2026-10-17' }),
  ];
  assert.deepEqual(sortFoodsByDate(foods, today).map((item) => item.id), ['chicken', 'milk']);
  assert.deepEqual(foods.map((item) => item.id), ['milk', 'chicken']);
});
