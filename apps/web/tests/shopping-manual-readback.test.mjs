import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/ShoppingListSheet.tsx',import.meta.url),'utf8');const a=source.indexOf('  const submitManualItem = async () => {'),b=source.indexOf('  const beginReceive',a);const c=source.indexOf('  const markManualDraftChanged = () => {');assert.ok(a>=0&&b>a&&c<a);
function setup(){let settle;const calls=[];const values={manualSubmitBusyRef:{current:false},Number,mutating:false,manualName:'저장 대상 2',manualDraft:{name:'저장 대상',quantity:2,unit:'개',unitGiven:false},manualShoppingMatch:undefined,manualQuantityOf:()=>0,showManualValidationError:()=>{},manualNameRef:{current:null},items:[],manualDraftRevisionRef:{current:0},pendingManualFocusRef:{current:null},onAddManual:()=>new Promise(resolve=>{settle=resolve}),keyboard:{hide:()=>calls.push('hide')},setManualError:value=>calls.push(['error',value]),setManualName:value=>calls.push(['name',value]),setManualQuantity:value=>calls.push(['quantity',value]),setManualUnit:value=>calls.push(['unit',value])};const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]});const submit=new Function('env',`with(env){${stripTypeScriptTypes(source.slice(a,b))};return submitManualItem;}`)(env);const edit=new Function('env',`with(env){${source.slice(c,a)};return markManualDraftChanged;}`)(env);return {calls,values,submit,edit,settle:value=>settle(value)};}
test('an unchanged successfully saved draft clears normally',async()=>{const x=setup();const request=x.submit();x.settle(true);await request;assert.ok(x.calls.some(([k,v])=>k==='name'&&v===''));});
test('late successful save preserves edits made while request was pending',async()=>{const x=setup();const request=x.submit();x.edit();x.values.manualName='다음 상품';x.values.manualQuantity='7';x.settle(true);await request;assert.equal(x.calls.some(([k])=>['name','quantity','unit'].includes(k)),false);assert.equal(x.calls.includes('hide'),false);assert.equal(x.values.pendingManualFocusRef.current,null);});
test('late failure does not clear the current input',async()=>{const x=setup();const request=x.submit();x.edit();x.settle(false);await request;assert.equal(x.calls.some(([k])=>['name','quantity','unit'].includes(k)),false);});

test('a name already on the list grows its manual amount instead of replacing it',async()=>{const x=setup();let input;x.values.onAddManual=async(value)=>{input=value;return true;};x.values.manualShoppingMatch={canonical_name:'저장 대상',unit:'팩'};x.values.manualQuantityOf=()=>3;await x.submit();assert.deepEqual(input,{canonicalName:'저장 대상',quantity:5,unit:'팩'});});
test('an empty field asks for a name and sends nothing',async()=>{const x=setup();let asked=0,sent=0;x.values.manualDraft=null;x.values.showManualValidationError=()=>{asked++;};x.values.onAddManual=async()=>{sent++;return true;};await x.submit();assert.equal(asked,1);assert.equal(sent,0);});

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
