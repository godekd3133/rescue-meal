import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/ShoppingListSheet.tsx',import.meta.url),'utf8');const a=source.indexOf('  const submitManualItem = async () => {'),b=source.indexOf('  const beginReceive',a);const c=source.indexOf('  const markManualDraftChanged = () => {');assert.ok(a>=0&&b>a&&c<a);
function setup(){let settle;const calls=[];const values={manualSubmitBusyRef:{current:false},Number,mutating:false,manualQuantityHasChange:true,manualName:'저장 대상',manualQuantity:'2',manualUnit:'개',items:[],manualDraftRevisionRef:{current:0},manualQuantityAutofillRef:{current:{value:'2',previousValue:'1'}},pendingManualFocusRef:{current:null},onAddManual:()=>new Promise(resolve=>{settle=resolve}),keyboard:{hide:()=>calls.push('hide')},setManualError:value=>calls.push(['error',value]),setManualName:value=>calls.push(['name',value]),setManualQuantity:value=>calls.push(['quantity',value]),setManualUnit:value=>calls.push(['unit',value])};const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]});const submit=new Function('env',`with(env){${source.slice(a,b)};return submitManualItem;}`)(env);const edit=new Function('env',`with(env){${source.slice(c,a)};return markManualDraftChanged;}`)(env);return {calls,values,submit,edit,settle:value=>settle(value)};}
test('an unchanged successfully saved draft clears normally',async()=>{const x=setup();const request=x.submit();x.settle(true);await request;assert.ok(x.calls.some(([k,v])=>k==='name'&&v===''));assert.equal(x.values.manualQuantityAutofillRef.current,null);});
test('late successful save preserves edits made while request was pending',async()=>{const x=setup();const request=x.submit();x.edit();x.values.manualName='다음 상품';x.values.manualQuantity='7';x.settle(true);await request;assert.equal(x.calls.some(([k])=>['name','quantity','unit'].includes(k)),false);assert.equal(x.calls.includes('hide'),false);assert.equal(x.values.pendingManualFocusRef.current,null);});
test('late failure does not clear the current input',async()=>{const x=setup();const request=x.submit();x.edit();x.settle(false);await request;assert.equal(x.calls.some(([k])=>['name','quantity','unit'].includes(k)),false);});

test('unchanged stored quantity does not submit or clear the draft',async()=>{const x=setup();x.values.manualQuantityHasChange=false;await x.submit();assert.deepEqual(x.calls,[]);assert.equal(x.values.manualQuantityAutofillRef.current.value,'2');});

test('consecutive submits invoke the pending callback once and release the local guard',async()=>{
 const x=setup();const original=x.values.onAddManual;let requests=0;x.values.onAddManual=(input)=>{requests++;return original(input);};
 const first=x.submit(),second=x.submit();assert.equal(requests,1);x.settle(true);await Promise.all([first,second]);assert.equal(x.values.manualSubmitBusyRef.current,false);
});
test('unsuccessful unchanged save cancels the pending row-focus intent',async()=>{
 const x=setup();const request=x.submit();x.settle(false);await request;assert.equal(x.values.pendingManualFocusRef.current,null);assert.equal(x.values.manualSubmitBusyRef.current,false);assert.equal(x.calls.some(([k])=>['name','quantity','unit'].includes(k)),false);
});
test('a rejected callback preserves the draft, clears its focus intent and reports recovery',async()=>{
 const x=setup();x.values.onAddManual=async()=>{throw new Error('save-outage');};await x.submit();assert.equal(x.values.pendingManualFocusRef.current,null);assert.equal(x.values.manualSubmitBusyRef.current,false);assert.equal(x.calls.some(([k])=>['name','quantity','unit'].includes(k)),false);assert.ok(x.calls.some(([k,v])=>k==='error'&&v.includes('확인하지 못했어요')));
});
test('an obsolete rejection cannot replace errors or inputs after the user edits',async()=>{
 const x=setup();let reject;x.values.onAddManual=()=>new Promise((_,r)=>{reject=r;});const task=x.submit();x.edit();reject(new Error('obsolete'));await task;
 assert.equal(x.calls.some(([k,v])=>k==='error'&&v),false);assert.equal(x.values.manualSubmitBusyRef.current,false);
});
