import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/MealPlanSheet.tsx',import.meta.url),'utf8');
const a=source.indexOf('  const recheckSavedStock = async () => {'),b=source.indexOf('  const updateConsumption =',a);assert.ok(a>=0&&b>a);
function setup(){
 let resolve,reject;const calls=[];const values={plan:{id:'original',recipe_id:'chosen',servings:2,max_minutes:30,minutes:10},saved:true,completed:false,stockChecking:false,completionRetry:false,authenticationExpired:false,isMealApiAuthError:error=>Boolean(error?.authentication),keyboard:{hide(){}},stockCheckTicketRef:{current:0},stockRefreshInputSignatureRef:{current:null},current:true,capturePlannerReadScope:()=>()=>values.current,capturePlannerMutationScope:()=>()=>true,ingredients:[{id:'new-stock',name:'우유',quantity:'250ml'}],dateReviewFoods:[],plannerContextKey:'context',servings:1,maxMinutes:30,workspaceSync:{currentWorkspaceKey:'owner',run:async(_,request)=>({current:true,value:await request('signal')})},mealApi:{isConfigured:true,previewMealPlan:(...args)=>{calls.push(['request',...args]);return new Promise((r,j)=>{resolve=r;reject=j})}},setStockChecking:v=>calls.push(['busy',v]),setStockCheckRecoveryPlanId:v=>calls.push(['recovery',v]),setError:v=>calls.push(['error',v]),updateMaxMinutes:v=>calls.push(['minutes',v]),updateServings:v=>calls.push(['servings',v]),selectAlternative:v=>calls.push(['select',v]),rememberCurrentWorkspaceRevision(){},presentMealPlanError:(_,fallback)=>fallback,Math,JSON,Error,undefined};
 const run=new Function('env',`with(env){${source.slice(a,b)};return recheckSavedStock;}`)(values);
 return {run,values,calls,resolve:v=>resolve(v),reject:error=>reject(error)};
}
test('recheck uses current lot IDs, selected recipe and stored servings as an unsaved preview',async()=>{
 const x=setup(),pending=x.run();x.resolve({id:'fresh',recipe_id:'chosen',servings:2,saved_at:null});await pending;
 assert.deepEqual(x.calls.find(c=>c[0]==='request').slice(1),[['new-stock'],30,'/api/meal-plans/preview',2,'signal','chosen']);
 assert.equal(x.calls.find(c=>c[0]==='select')[1].saved_at,null);
 assert.equal(JSON.parse(x.values.stockRefreshInputSignatureRef.current).servings,2);
 assert.equal(x.values.plan.id,'original');
});
test('a late stock response cannot replace a different view',async()=>{
 const x=setup(),pending=x.run();x.values.current=false;x.resolve({id:'late',recipe_id:'chosen'});await pending;
 assert.equal(x.calls.some(c=>c[0]==='select'),false);
});
test('a different or unavailable recipe keeps the saved record rather than silently changing menu',async()=>{
 const x=setup(),pending=x.run();x.resolve({id:'other',recipe_id:'different'});await pending;
 assert.equal(x.calls.some(c=>c[0]==='select'),false);assert.equal(x.values.plan.id,'original');
 assert.ok(x.calls.some(c=>c[0]==='error'&&c[1].includes('저장한 기록은 유지')));
});

test('failed stock recheck binds retry to the original record and repeats the same recipe and servings',async()=>{
 const x=setup(),first=x.run();x.resolve({id:'unavailable',recipe_id:'no-match'});await first;
 assert.ok(x.calls.some(c=>c[0]==='recovery'&&c[1]==='original'));
 assert.equal(x.values.plan.id,'original');
 const second=x.run();x.resolve({id:'rechecked',recipe_id:'chosen',servings:2,saved_at:null});await second;
 const requests=x.calls.filter(c=>c[0]==='request');assert.equal(requests.length,2);
 assert.deepEqual(requests[0].slice(1),requests[1].slice(1));
});

test('unresolved completion retry is not replaced by a stock preview',async()=>{
 const x=setup();x.values.completionRetry=true;await x.run();assert.equal(x.calls.some(c=>c[0]==='request'),false);
});

test('network failure preserves original plan and enables same-record retry',async()=>{
 const x=setup(),pending=x.run();x.reject(new TypeError('network unavailable'));await pending;
 assert.equal(x.values.plan.id,'original');assert.ok(x.calls.some(c=>c[0]==='recovery'&&c[1]==='original'));
 const retry=x.run();x.resolve({id:'fresh',recipe_id:'chosen',servings:2,saved_at:null});await retry;
 assert.equal(x.calls.filter(c=>c[0]==='request').length,2);
 assert.equal(x.calls.find(c=>c[0]==='select')[1].servings,2);
});
test('expired authentication requests account recovery rather than stock retry',async()=>{
 const x=setup(),pending=x.run();x.reject({authentication:true});await pending;
 assert.equal(x.calls.some(c=>c[0]==='recovery'&&c[1]==='original'),false);
 assert.equal(x.values.plan.id,'original');
 x.values.authenticationExpired=true;await x.run();assert.equal(x.calls.filter(c=>c[0]==='request').length,1);
});
