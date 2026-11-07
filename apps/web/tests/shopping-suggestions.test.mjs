import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buyableQuantity, shoppingSuggestions, recordFinishedFoods, createDemoFinishedFoods, parseShoppingEntry, shoppingQuantityStep, readFinishedFoods, writeFinishedFoods } = await server.ssrLoadModule('/src/shoppingSuggestions.ts');
test.after(() => server.close());

const now = new Date('2026-09-03T12:00:00+09:00');
const at = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();

test('used-up foods are suggested newest first, without names on the list or back in the fridge', () => {
  const finished = [
    { name: '대파', quantity: 1, unit: '단', at: at(1) },
    { name: '우유', quantity: 1, unit: '팩', at: at(2) },
    { name: '양파', quantity: 2, unit: '개', at: at(3) },
    { name: '감자', quantity: 3, unit: '개', at: at(20) },
  ];
  const result = shoppingSuggestions({ finished, shortages: [], inventoryNames: ['저지방 우유', '우유'], listNames: [' 양파 '], now });
  assert.deepEqual(result.finished.map((item) => item.name), ['대파']);
  assert.deepEqual(result.meal, []);
});

test('meal shortages come first and are not repeated as used-up foods', () => {
  const result = shoppingSuggestions({
    finished: [{ name: '애호박', quantity: 1, unit: '개', at: at(1) }, { name: '대파', quantity: 1, unit: '단', at: at(1) }],
    shortages: [{ name: '애호박', quantity: 0.5, unit: '개' }, { name: '애호박', quantity: 0.5, unit: '개' }, { name: '두부', quantity: 0, unit: '모' }],
    inventoryNames: [],
    listNames: [],
    now,
  });
  assert.deepEqual(result.meal.map((item) => [item.name, item.quantity, item.unit, item.source]), [['애호박', 1, '개', 'meal']]);
  assert.deepEqual(result.finished.map((item) => item.name), ['대파']);
});

test('an added suggestion disappears because its name is on the list', () => {
  const finished = createDemoFinishedFoods(now);
  const before = shoppingSuggestions({ finished, shortages: [], inventoryNames: [], listNames: [], now });
  const after = shoppingSuggestions({ finished, shortages: [], inventoryNames: [], listNames: [before.finished[0].name], now });
  assert.equal(after.finished.length, before.finished.length - 1);
  assert.ok(!after.finished.some((item) => item.name === before.finished[0].name));
});

test('recording keeps one entry per name, newest first', () => {
  const log = recordFinishedFoods([{ name: '대파', quantity: 1, unit: '단', at: at(5) }], [{ name: '두부', quantity: 1, unit: '모' }, { name: '대파', quantity: 2, unit: '단' }], now);
  assert.deepEqual(log.map((entry) => [entry.name, entry.quantity]), [['두부', 1], ['대파', 2]]);
  assert.equal(log[0].at, now.toISOString());
  assert.equal(recordFinishedFoods(log, [{ name: ' ', quantity: 1, unit: '개' }], now), log);
});

test('the one-field add row reads an amount and unit, or guesses them', () => {
  assert.deepEqual(parseShoppingEntry('우유'), { name: '우유', quantity: 1, unit: '개', unitGiven: false });
  assert.deepEqual(parseShoppingEntry('대파'), { name: '대파', quantity: 1, unit: '단', unitGiven: false });
  assert.deepEqual(parseShoppingEntry('우유 2팩'), { name: '우유', quantity: 2, unit: '팩', unitGiven: true });
  assert.deepEqual(parseShoppingEntry('우유2팩'), { name: '우유', quantity: 2, unit: '팩', unitGiven: true });
  assert.deepEqual(parseShoppingEntry('입고 확인 쌀 1000.5g'), { name: '입고 확인 쌀', quantity: 1000.5, unit: 'g', unitGiven: true });
  assert.deepEqual(parseShoppingEntry('두부 3'), { name: '두부', quantity: 3, unit: '모', unitGiven: false });
  assert.deepEqual(parseShoppingEntry('비타500'), { name: '비타500', quantity: 1, unit: '개', unitGiven: false });
  assert.equal(parseShoppingEntry('   '), null);
});

test('the row stepper moves weights and volumes by 100', () => {
  assert.equal(shoppingQuantityStep('개'), 1);
  assert.equal(shoppingQuantityStep('g'), 100);
  assert.equal(shoppingQuantityStep('ml'), 100);
});

test('the stored log is scoped and tolerates junk', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  writeFinishedFoods('workspace-a', [{ name: '대파', quantity: 1, unit: '단', at: at(1) }], storage);
  assert.equal(readFinishedFoods('workspace-a', storage).length, 1);
  assert.deepEqual(readFinishedFoods('workspace-b', storage), []);
  store.set('rescue-meal.finished-foods.workspace-c', '{"oops":1}');
  assert.deepEqual(readFinishedFoods('workspace-c', storage), []);
  store.set('rescue-meal.finished-foods.workspace-d', '[{"name":"x","quantity":-1,"unit":"개","at":"2026"}]');
  assert.deepEqual(readFinishedFoods('workspace-d', storage), []);
});

test('suggestions are buyable: counted units round up, weights and volumes do not', () => {
  for (const unit of ['개', '모', '단', '팩', '봉', '구']) assert.equal(buyableQuantity(0.5, unit), 1, unit);
  assert.equal(buyableQuantity(1.2, '팩'), 2);
  assert.equal(buyableQuantity(2, '개'), 2);
  assert.equal(buyableQuantity(1.0000000001, '개'), 1);
  assert.equal(buyableQuantity(250.5, 'g'), 250.5);
  assert.equal(buyableQuantity(150, 'ml'), 150);
  assert.equal(buyableQuantity(0.5, 'kg'), 0.5);
  assert.equal(buyableQuantity(1.5, 'L'), 1.5);
  const result = shoppingSuggestions({ finished: [], shortages: [{ name: '애호박', quantity: 0.5, unit: '개' }, { name: '다진 마늘', quantity: 15, unit: 'g' }], inventoryNames: [], listNames: [], now });
  assert.deepEqual(result.meal.map((item) => `${item.name} ${item.quantity}${item.unit}`), ['애호박 1개', '다진 마늘 15g']);
});
