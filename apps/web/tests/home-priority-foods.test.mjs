import test from 'node:test';
import assert from 'node:assert/strict';
import { homePriorityDate, selectHomePriorityFoods } from '../src/homePriorityFoods.ts';
const food = (id, priority, dateKind, dateDetail, extra = {}) => ({ id, priority, dateKind, dateDetail, ...extra });
test('an earlier personal reminder precedes a later estimated review hint', () => {
  const recent = food('new-milk',1,'estimated_use_first','미확인',{priorityDate:'2026-10-16'});
  const reminder = food('cabbage',2,'user_confirmed','2026.10.13',{dateAssertionKind:'user_reminder'});
  const milk = food('milk',3,'estimated_use_first','미확인',{priorityDate:'2026-10-15'});
  assert.deepEqual(selectHomePriorityFoods([recent,reminder,milk]).map(f=>f.id),['cabbage','milk','new-milk']);
});
test('an earlier date can enter the home set despite a later stored rank', () => {
  const foods = [1,2,3].map(n=>food(`later-${n}`,n,'actual_printed','2026.12.31'));
  foods.push(food('earlier',9,'actual_printed','2026.10.12'));
  assert.equal(selectHomePriorityFoods(foods)[0].id,'earlier');
  assert.equal(selectHomePriorityFoods(foods).length,3);
});
test('manufacturing and packaging dates do not act as review deadlines', () => {
  for (const dateAssertionKind of ['production_date','packaging_date']) {
    assert.equal(homePriorityDate(food('made',1,'actual_printed','2026.01.01',{dateAssertionKind})),null);
  }
});
test('unknown and invalid dates do not become manufactured urgency', () => {
  assert.equal(homePriorityDate(food('unknown',1,'unknown','2026.01.01')),null);
  assert.equal(homePriorityDate(food('invalid',1,'actual_printed','2026.02.31')),null);
});
test('a corrected personal date takes precedence over a previous priorityDate', () => {
  const updated = food('updated',1,'user_confirmed','2026.11.01',{priorityDate:'2026-10-01'});
  assert.equal(homePriorityDate(updated),Date.UTC(2026,10,1));
});
test('equal and missing dates keep the existing rank, without mutating records', () => {
  const foods=[food('b',2,'unknown','미확인'),food('a',1,'unknown','미확인')];
  assert.deepEqual(selectHomePriorityFoods(foods).map(f=>f.id),['a','b']);
  assert.deepEqual(foods.map(f=>f.id),['b','a']);
});

test('demo estimated hints use the same dated ordering as connected records', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripTypeScriptTypes } = await import('node:module');
  const { demoCalendarDate } = await import('../src/demoCalendarDate.ts');
  const source = readFileSync(new URL('../src/Prototype.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('function createDemoFoods(');
  const end = source.indexOf('function withGrocySyncNotice(', start);
  const createDemoFoods = new Function('demoCalendarDate','formatApiDate','FOOD_IMAGES', `${stripTypeScriptTypes(source.slice(start,end))}; return createDemoFoods;`)(demoCalendarDate, value=>value, new Proxy({}, {get:(_,key)=>String(key)}));
  const foods = createDemoFoods(new Date(2026,9,11,12));
  assert.deepEqual(foods.filter(f=>f.dateKind==='estimated_use_first').map(f=>[f.id,f.priorityDate]), [
    ['tofu-1','2026-10-12'], ['mushroom-1','2026-10-13'], ['milk-1','2026-10-14'], ['tomato-1','2026-10-14'],
  ]);
  assert.deepEqual(selectHomePriorityFoods(foods).map(f=>f.id), ['spinach-1','tofu-1','mushroom-1']);
});
