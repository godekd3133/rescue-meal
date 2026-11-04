import test from 'node:test';
import assert from 'node:assert/strict';
import {completedMealAllocations} from '../src/completedMealAllocations.ts';
const ingredient={canonical_name:'감자',unit:'개',available_food_id:'old',allocations:[{food_id:'old',quantity:0.5},{food_id:'new',quantity:1.5}]};
const plan=allocations=>({ingredients:[ingredient],consumed_allocations:allocations});
test('small consumed portions and decimal totals retain their recorded amount',()=>{
 assert.equal(completedMealAllocations(plan([{food_id:'old',quantity:0.0004,unit:'kg'}]),[])[0].quantity,0.0004);
 assert.equal(completedMealAllocations(plan([{food_id:'old',quantity:0.1,unit:'개'},{food_id:'new',quantity:0.2,unit:'개'}]),[])[0].quantity,0.3);
});
test('same ingredient consumed from two lots is presented once with the true total',()=>{
 const result=completedMealAllocations(plan([{food_id:'old',quantity:0.5,unit:'개'},{food_id:'new',quantity:1.5,unit:'개'}]),[]);
 assert.equal(result.length,1);assert.deepEqual({...result[0],key:undefined},{key:undefined,name:'감자',quantity:2,unit:'개'});
});
test('different units remain separate instead of fabricating a conversion',()=>{
 const result=completedMealAllocations(plan([{food_id:'old',quantity:1,unit:'개'},{food_id:'new',quantity:200,unit:'g'}]),[]);assert.deepEqual(result.map(x=>[x.quantity,x.unit]),[[1,'개'],[200,'g']]);
});
test('unknown food records do not merge under the generic fallback name',()=>{
 assert.equal(completedMealAllocations({ingredients:[],consumed_allocations:[{food_id:'a',quantity:1},{food_id:'b',quantity:2}]},[]).length,2);
});
test('saved recipe name survives consumed food removal',()=>{
 assert.equal(completedMealAllocations(plan([{food_id:'old',quantity:0.5,unit:'개'}]),[])[0].name,'감자');
});
test('decimal sums are displayed without binary floating point residue',()=>{
 assert.equal(completedMealAllocations(plan([{food_id:'old',quantity:0.1,unit:'개'},{food_id:'new',quantity:0.2,unit:'개'}]),[])[0].quantity,0.3);
});
