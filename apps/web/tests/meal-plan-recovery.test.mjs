import test from 'node:test';import assert from 'node:assert/strict';import {mealRecoveryMinutes} from '../src/mealPlanRecovery.ts';
const presets=[10,20,30,45];
test('unsupported ingredient result cannot promise a longer time will help',()=>assert.equal(mealRecoveryMinutes({recovery:{kind:'ingredients'}},30,presets),null));
test('quantity and allergen blockers do not offer blind time expansion',()=>{for(const kind of ['quantity','allergens','empty'])assert.equal(mealRecoveryMinutes({recovery:{kind,minimum_minutes:40}},30,presets),null);});
test('time recovery chooses a supported preset that actually covers the recipe',()=>assert.equal(mealRecoveryMinutes({recovery:{kind:'time',minimum_minutes:25}},20,presets),30));
test('a longer catalog recipe can use its exact allowed time without claiming45 is enough',()=>assert.equal(mealRecoveryMinutes({recovery:{kind:'time',minimum_minutes:60}},30,presets),60));
test('legacy or invalid recovery metadata remains conservative',()=>{assert.equal(mealRecoveryMinutes(null,30,presets),null);for(const value of [NaN,181,0,2.5,20])assert.equal(mealRecoveryMinutes({recovery:{kind:'time',minimum_minutes:value}},30,presets),null);});
