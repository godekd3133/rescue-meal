import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/AddFoodSheet.tsx',import.meta.url),'utf8');
const start=source.indexOf('  const lookupBarcode = async (input: string) => {');
const end=source.indexOf('  const applyBarcodeCandidate',start);
assert.ok(start>=0&&end>start);
function run(parsed){
  const calls=[];
  const values={barcodeLookupGeneration:{current:0},keyboard:{hide(){}},demoInputsAvailable:false,normalizeKnownProductWarning:v=>v,mealApi:{isConfigured:true,parseBarcode:async()=>parsed,resolveProduct:async code=>{calls.push(['resolve',code]);return {candidates:[],warnings:[]};}}};
  const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:k in o?o[k]:(...args)=>calls.push([String(k),...args])});
  const lookup=new Function('env',`with(env){${stripTypeScriptTypes(source.slice(start,end))};return lookupBarcode;}`)(env);
  const editStart=source.indexOf('  const updateBarcodeInput = (value: string) => {');
  const update=new Function('env',`with(env){${stripTypeScriptTypes(source.slice(editStart,start))};return updateBarcodeInput;}`)(env);
  return {calls,values,lookup,update};
}
const parsed=(barcode_type,gtin=null,date_assertions=[])=>({barcode_type,gtin,date_assertions,warnings:[]});
test('unsupported input never reaches product providers',async()=>{const x=run(parsed('unknown'));await x.lookup('123');assert.equal(x.calls.some(([k])=>k==='resolve'),false);assert.ok(x.calls.some(([k,v])=>k==='setBarcodeResult'&&v.includes('형식')));});
test('restricted store barcode keeps its local-store warning without external lookup',async()=>{const x=run(parsed('restricted_circulation'));await x.lookup('2000000000000');assert.equal(x.calls.some(([k])=>k==='resolve'),false);assert.ok(x.calls.some(([k,v])=>k==='setBarcodeResult'&&v.includes('매장용')));});
test('GS1 date without product identity keeps its date review without a provider call',async()=>{const x=run(parsed('gs1_data_carrier',null,[{kind:'use_by',value:'2026-10-15'}]));await x.lookup('(17)261015');assert.equal(x.calls.some(([k])=>k==='resolve'),false);assert.ok(x.calls.some(([k,v])=>k==='setBarcodeParse'&&v?.date_assertions.length===1));});
test('malformed GS1 identity does not become a product lookup',async()=>{const x=run(parsed('gs1_data_carrier','123'));await x.lookup('(01)123');assert.equal(x.calls.some(([k])=>k==='resolve'),false);});
test('normalized GTIN is passed to the provider instead of the raw scan',async()=>{const x=run(parsed('gtin','08801114167523'));await x.lookup('880-1114167523');assert.deepEqual(x.calls.find(([k])=>k==='resolve'),['resolve','08801114167523']);});

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('editing during parse discards late date and never queries an old product',async()=>{const x=run(null),pending=deferred();x.values.mealApi.parseBarcode=()=>pending.promise;const request=x.lookup('old');x.update('new');x.calls.length=0;pending.resolve(parsed('gtin','08801114167523',[{kind:'use_by',value:'2026-10-15'}]));await request;assert.deepEqual(x.calls,[]);});
test('editing during provider lookup rejects late candidates and loading updates',async()=>{const x=run(parsed('gtin','08801114167523')),pending=deferred();x.values.mealApi.resolveProduct=()=>pending.promise;const request=x.lookup('old');await new Promise(resolve=>setImmediate(resolve));x.update('new');x.calls.length=0;pending.resolve({candidates:[{canonical_name:'old product'}]});await request;assert.deepEqual(x.calls,[]);});
test('late provider rejection after edit does not replace the new input with an error',async()=>{const x=run(parsed('gtin','08801114167523')),pending=deferred();x.values.mealApi.resolveProduct=()=>pending.promise;const request=x.lookup('old');await new Promise(resolve=>setImmediate(resolve));x.update('new');x.calls.length=0;pending.reject(new Error('old provider failure'));await request;assert.deepEqual(x.calls,[]);});
