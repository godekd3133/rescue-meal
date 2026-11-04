import test from 'node:test';
import assert from 'node:assert/strict';
import {shoppingAdjustmentNote} from '../src/shoppingListPresentation.ts';
const item=(...types)=>({sources:types.map(source_type=>({source_type}))});
test('empty shopping does not expose adjustment explanation',()=>assert.equal(shoppingAdjustmentNote([]),null));
test('recipe-only shopping describes automatic shortage adjustment',()=>assert.equal(shoppingAdjustmentNote([item('meal_plan','multi_day')]),'보관 수량이 늘면 식단에서 담은 부족량이 줄어요.'));
test('manual-only shopping does not expose an unrelated automatic adjustment explanation',()=>assert.equal(shoppingAdjustmentNote([item('manual')]),null));
test('mixed sources identify which quantity can change',()=>assert.equal(shoppingAdjustmentNote([item('manual','meal_plan')]),'식단에서 담은 수량만 보관 수량에 맞춰 줄어들어요.'));
