import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const a=source.indexOf('  useEffect(() => {\n    const requestKey = `${normalizedInventoryQuery}|${storageFilter}`;'),b=source.indexOf('  }, [connectionState, inventorySearchCanUseServer',a);assert.ok(a>=0&&b>a);
const body=source.slice(a+'  useEffect(() => {'.length,b);
function setup(){
 const timers=[],requests=[],invalidated=[];
 const values={normalizedInventoryQuery:'ㅇ',storageFilter:'전체',inventorySearchComposing:true,inventorySearchCanUseServer:true,storageLocationsRef:{current:[]},window:{setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){}},workspaceSync:{invalidate:c=>invalidated.push(c),run:async(_,request)=>({current:true,value:await request('signal')})},mealApi:{searchInventory:async(...args)=>{requests.push(args);return {items:[],total:0,has_more:false};}},storageTypeFromFilter:()=>undefined,storageLocationIdFromFilter:()=>undefined,mapApiFood:x=>x,isMealApiAuthError:()=>false};
 for(const n of ['setInventorySearchKey','setInventorySearchResults','setInventorySearchTotal','setInventorySearchHasMore','setInventorySearchError','setInventorySearchStatus','resetWorkspaceReads','setDashboardStaleAt','setConnectionState'])values[n]=()=>{};
 const run=new Function('env',`with(env){${body}}`);
 return {values,timers,requests,invalidated,run:()=>run(values)};
}
test('unfinished composition cancels the previous search without scheduling a new request',()=>{
 const x=setup();x.run();assert.deepEqual(x.invalidated,['inventory-search']);assert.equal(x.timers.length,0);assert.equal(x.requests.length,0);
});
test('composition completion searches the final Korean text using the existing debounce',async()=>{
 const x=setup();x.run();x.values.inventorySearchComposing=false;x.values.normalizedInventoryQuery='우유';x.run();
 assert.equal(x.timers.length,1);assert.equal(x.timers[0].delay,180);x.timers[0].fn();await new Promise(setImmediate);
 assert.equal(x.requests.length,1);assert.equal(x.requests[0][0],'우유');
});
