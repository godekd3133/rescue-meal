import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const start=source.indexOf('  const openDetail =');
const end=source.indexOf('  const openFoodDetailFromMeal =',start);
assert.ok(start>0&&end>start);
function setup() {
 const calls=[];
 const values={captureInventoryReturnContext:id=>calls.push(['inventory',id]),inventoryReturnContextRef:{current:'existing'},detailHistoryDisclosureOpenRef:{current:true},detailRevisionRef:{current:null},dashboardRevisionRef:{current:4},rememberCurrentDetailRevision:()=>{},setDetailRemoteRefreshRequired:()=>{},attentionReviewReason:food=>food.review? 'date':null,currentDate:'2026-10-11',setDetailEntryIntent:intent=>calls.push(['intent',intent]),setSelectedFoodId:id=>calls.push(['food',id]),changeSheet:sheet=>calls.push(['sheet',sheet])};
 const open=new Function(...Object.keys(values),stripTypeScriptTypes(source.slice(start,end))+';return openDetail;')(...Object.values(values));
 return {open,calls};
}
for(const food of [{id:'priority',priority:1},{id:'provenance',priority:1,productProvenance:{source:'barcode'}},{id:'review',priority:1,review:true}]) {
 test(`${food.id}: ordinary home viewing does not focus a record or deletion action`,()=>{
  const c=setup();c.open(food,'home');assert.deepEqual(c.calls.find(x=>x[0]==='intent'),['intent',null]);assert.deepEqual(c.calls.find(x=>x[0]==='food'),['food',food.id]);
 });
}
test('inventory viewing keeps its return context and explicit action routes retain their intent',()=>{
 for(const intent of ['date-review','provenance-review','consume-action','browse']) {
  const c=setup();c.open({id:'specific',priority:1},'inventory',intent);
  assert.deepEqual(c.calls.find(x=>x[0]==='intent'),['intent',intent==='browse'?null:intent]);
  assert.ok(c.calls.some(x=>x[0]==='inventory'&&x[1]==='specific'));
 }
});
