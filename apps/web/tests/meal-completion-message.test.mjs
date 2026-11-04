import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const start=source.indexOf('function mealCompletionMessage('),end=source.indexOf('\nfunction ',start+1);
const message=new Function(stripTypeScriptTypes(source.slice(start,end))+';return mealCompletionMessage;')();
test('missing ingredients excluded from completion are not claimed to remain in inventory',()=>{
 const result=message(['potato'],2,[{food_id:'potato',quantity:0.5}]);
 assert.match(result,/사용한 양만큼 보관 수량/);assert.match(result,/2가지는 이번 기록에서 제외/);assert.doesNotMatch(result,/목록에 남|목록에서 뺐|모두 사용/);
});
test('zero quantities are not counted as used ingredients',()=>{
 assert.doesNotMatch(message([],1,[{food_id:'potato',quantity:0}]),/재료 \d+가지|가지를 사용/);
});

test('two lots of the same ingredient are not reported as two ingredient types',()=>{
 const result=message(['potato-old','potato-new'],0,[{food_id:'potato-old',quantity:0.5},{food_id:'potato-new',quantity:1.5}]);
 assert.doesNotMatch(result,/재료 2가지/);assert.match(result,/사용한 양만큼/);
});
