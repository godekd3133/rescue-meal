import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../src/AddFoodSheet.tsx',import.meta.url),'utf8');
const start=source.indexOf('  const restoreReceiptProductEnrichment =');
const end=source.indexOf('\n  useEffect(',start);
assert.ok(start>=0&&end>start);
class MealApiError extends Error { constructor(status){super('API failure');this.status=status;} }
function setup(){
 let resolve,reject;
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const state={job:null,restore:null};
 const values={receiptDraftId:'receipt',receiptDraftIdRef:{current:'receipt'},receiptIdentityGeneration:{current:1},receiptEnrichmentRequest:{current:0},mealApi:{isConfigured:true,getProductEnrichmentJob:()=>pending},MealApiError,setProductEnrichmentJob:job=>{state.job=job;},setProductEnrichmentRestoreState:value=>{state.restore=value;}};
 const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]});
 const restore=new Function('env',`with(env){${stripTypeScriptTypes(source.slice(start,end))};return restoreReceiptProductEnrichment;}`)(env);
 return {state,values,resolve,reject,restore};
}
test('reopening a receipt restores its existing queued job',async()=>{const x=setup(),p=x.restore();assert.equal(x.state.restore,'loading');x.resolve({status:'queued'});await p;assert.equal(x.state.job.status,'queued');assert.equal(x.state.restore,null);});
test('no existing job restores the optional lookup action',async()=>{const x=setup(),p=x.restore();x.reject(new MealApiError(404));await p;assert.equal(x.state.job,null);assert.equal(x.state.restore,null);});
test('unavailable status remains an explicit read recovery state',async()=>{const x=setup(),p=x.restore();x.reject(new MealApiError(503));await p;assert.equal(x.state.restore,'error');assert.equal(x.state.job,null);});
test('late status cannot attach to another receipt',async()=>{const x=setup(),p=x.restore();x.values.receiptDraftIdRef.current='next';x.resolve({status:'succeeded'});await p;assert.equal(x.state.job,null);});
test('closed receipt ignores late recovery errors',async()=>{const x=setup(),p=x.restore();x.values.receiptIdentityGeneration.current++;x.state.restore=null;x.reject(new Error('late'));await p;assert.equal(x.state.restore,null);});
test('an older status read cannot replace a newer mutation',async()=>{const x=setup(),p=x.restore();x.values.receiptEnrichmentRequest.current++;x.state.job={status:'in_flight'};x.resolve({status:'queued'});await p;assert.equal(x.state.job.status,'in_flight');});
