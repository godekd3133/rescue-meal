import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source = readFileSync(new URL('../src/Prototype.tsx', import.meta.url), 'utf8');
const callback = source.match(/onViewInventory=\{\(\) => \{([\s\S]*?)\}\} initialLabelTargetFoodId=/);
assert.ok(callback, 'receipt recovery must have an inventory destination');

test('saved receipt recovery leaves intake and opens all foods even with a retained return target', () => {
  const returnSheet = { current: 'receipt-queue' };
  const returnFood = { current: { id: 'old-food' } };
  const calls = [];
  const restoredFocus={current:null}; const destination={id:'inventory-filter'};
  const navigate = new Function('setResumeReceiptId', 'addReturnSheetRef', 'addReturnFoodContextRef', 'openInventory', 'sheetRestoreFocusRef', 'document', stripTypeScriptTypes('function action(){'+callback[1]+'}')+'; return action();'); 
  navigate(value => calls.push(['resume', value]), returnSheet, returnFood, (...args) => calls.push(['inventory', ...args]), restoredFocus, {querySelector:()=>destination});
  assert.equal(restoredFocus.current,destination);
  assert.equal(returnSheet.current, null);
  assert.equal(returnFood.current, null);
  assert.deepEqual(calls, [['resume', null], ['inventory', '', true]]);
});
