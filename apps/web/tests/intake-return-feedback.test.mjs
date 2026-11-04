import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const a=source.indexOf('    const finishInput = () => {'),b=source.indexOf('    const isLotCorrection',a);assert.ok(a>=0&&b>a);
function run({sheet='add',session=1,returned='detail',returnedId='target',action='correct'}={}){const events=[];const env={sheetRef:{current:sheet},addSheetSessionKeyRef:{current:session},submissionSession:1,food:{lotAction:action,targetFoodId:'target'},addReturnSheetRef:{current:returned},addReturnFoodContextRef:{current:{id:returnedId}},changeSheet:value=>events.push(value)};const fn=new Function('e',`with(e){${source.slice(a,b)};return finishInput;}`)(env);return {returned:fn(),events};}
test('same intake returning to the corrected detail suppresses the redundant follow-up',()=>assert.deepEqual(run(),{returned:true,events:[null]}));
test('a new food still receives its follow-up',()=>assert.equal(run({action:'create'}).returned,false));
test('another detail is not treated as the saved food',()=>assert.equal(run({returnedId:'another'}).returned,false));
test('a background save does not close or suppress another screen',()=>assert.deepEqual(run({sheet:'shopping'}),{returned:false,events:[]}));
test('an old intake does not close a newer intake session',()=>assert.deepEqual(run({session:2}),{returned:false,events:[]}));
