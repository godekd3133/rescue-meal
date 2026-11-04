import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../src/historyWindow.ts',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('export function','function');
function setup(){let state;const hook=new Function('useState',stripTypeScriptTypes(source)+';return useHistoryWindow;')((initial)=>{state??=initial;return [state,next=>{state=next;}];});return hook;}
test('history initially shows four exact events and can reveal all received events',()=>{
 const run=setup(),events=Array.from({length:9},(_,id)=>({id,quantity:id/10}));let view=run(events,'food-a');assert.deepEqual(view.events,events.slice(0,4));assert.equal(view.remaining,5);view.toggle();view=run(events,'food-a');assert.equal(view.events,events);assert.equal(view.expanded,true);view.toggle();assert.deepEqual(run(events,'food-a').events,events.slice(0,4));
});
test('history for another food starts collapsed instead of inheriting an expanded list',()=>{
 const run=setup(),events=Array.from({length:7},(_,id)=>({id}));run(events,'food-a').toggle();assert.equal(run(events,'food-a').events.length,7);assert.equal(run(events,'food-b').events.length,4);assert.equal(run(events,'food-b').expanded,false);
});
test('short and empty histories never offer nonexistent hidden records',()=>{
 for(const size of [0,1,4]){const view=setup()(Array.from({length:size},(_,id)=>id),'food');assert.equal(view.remaining,0);assert.equal(view.events.length,size);}
});
