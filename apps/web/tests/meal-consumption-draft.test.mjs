import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {validateMealConsumptionDraft} from '../src/mealConsumptionDraft.ts';

test('blank and unfinished decimals do not become a skipped ingredient',()=>{
 for(const raw of ['', ' ', '.', '0.', '1.']) assert.equal(validateMealConsumptionDraft(raw,1).quantity,null);
 assert.deepEqual(validateMealConsumptionDraft('0',1),{quantity:0,error:null});
 assert.deepEqual(validateMealConsumptionDraft('0.1234',1),{quantity:0.1234,error:null});
});
test('invalid and out-of-allocation quantities remain visibly invalid instead of silently clamping',()=>{
 for(const raw of ['-1','2','NaN','Infinity','1팩','1,2']) assert.equal(validateMealConsumptionDraft(raw,1).quantity,null);
});
const source=readFileSync(new URL('../src/MealPlanSheet.tsx',import.meta.url),'utf8');
const start=source.indexOf('  const setConsumptionValue =');
const end=source.indexOf('  const completePlan =',start);
function setup() {
 let raw={},quantity=0.5;const calls=[];
 const values={saved:true,completing:false,completed:false,validateMealConsumptionDraft,setConsumptionInputDraft:update=>{raw=update(raw);},updateConsumption:(row,value,keep)=>{quantity=value;calls.push([value,keep]);}};
 const input=new Function(...Object.keys(values),stripTypeScriptTypes(source.slice(start,end))+';return setConsumptionValue;')(...Object.values(values));
 return {input,raw:()=>raw,quantity:()=>quantity,calls};
}
test('typing keeps the literal draft while incomplete edits retain the last numeric portion',()=>{
 const c=setup(),row={foodId:'chicken',maxQuantity:1};
 c.input(row,'');assert.equal(c.raw().chicken,'');assert.equal(c.quantity(),0.5);assert.equal(c.calls.length,0);
 c.input(row,'0.');assert.equal(c.raw().chicken,'0.');assert.equal(c.quantity(),0.5);
 c.input(row,'0.1234');assert.equal(c.raw().chicken,'0.1234');assert.equal(c.quantity(),0.1234);assert.deepEqual(c.calls,[[0.1234,true]]);
});
test('an oversized edit preserves the exact input and existing value for correction',()=>{
 const c=setup();c.input({foodId:'chicken',maxQuantity:1},'2.5');
 assert.equal(c.raw().chicken,'2.5');assert.equal(c.quantity(),0.5);assert.equal(c.calls.length,0);
});
