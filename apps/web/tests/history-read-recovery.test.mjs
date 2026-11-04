import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const cases=[['FoodHistory.tsx','getStorageEvents'],['ProductInfoHistory.tsx','getProductInfoEvents'],['ProductProvenanceHistory.tsx','getProductProvenanceEvents']];
function setup(file,method,owner='food'){
 const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');const a=source.indexOf('  useEffect(() => {'),b=source.indexOf('  }, [foodId',a);assert.ok(a>=0&&b>a);
 let resolve,reject;const pending=new Promise((r,j)=>{resolve=r;reject=j});const calls=[];
 const values={foodId:'food',retryFocusRef:{current:false},historyOwnerRef:{current:owner},historyRootRef:{current:null},historyRefreshKey:0,highlightSyncOutboxId:null,historyScrollRestoreFrameRef:{current:null},mealApi:{[method]:()=>pending},setReadError:x=>calls.push(['error',x]),setHistory:x=>calls.push(['history',x]),setLoading:x=>calls.push(['loading',x])};
 const body=source.slice(a+'  useEffect(() => {'.length,b);const code=stripTypeScriptTypes(`function read(){${body}}`);const cleanup=new Function('e',`with(e){${code};return read();}`)(values);
 return{calls,resolve,reject,cleanup,settle:()=>new Promise(r=>setImmediate(r))};
}
for(const [file,method] of cases){
 test(`${file}: failed refresh reports failure without clearing previous same-food rows`,async()=>{const c=setup(file,method);c.calls.length=0;c.reject(new Error('unavailable'));await c.settle();assert.deepEqual(c.calls,[['error',true],['loading',false]]);});
 test(`${file}: changing food clears the previous owner before reading`,async()=>{const c=setup(file,method,'other-food');assert.deepEqual(c.calls[0],['history',[]]);c.resolve([]);await c.settle();assert.ok(c.calls.some(([k,v])=>k==='history'&&Array.isArray(v)&&v.length===0));});
 test(`${file}: cancelled late failure cannot update another mounted view`,async()=>{const c=setup(file,method);c.cleanup();c.calls.length=0;c.reject(new Error('old failure'));await c.settle();assert.deepEqual(c.calls,[]);});
 test(`${file}: missing response is not converted into confirmed empty history`,async()=>{const c=setup(file,method);c.calls.length=0;c.resolve(null);await c.settle();assert.deepEqual(c.calls,[['error',true],['loading',false]]);});
}

for (const [file] of cases) for (const scenario of ['busy','rows','empty','detached']) {
 test(`${file}: retry focus ${scenario}`, () => {
  const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  const readEnd=source.indexOf('  }, [foodId'),a=source.indexOf('  useEffect(() => {',readEnd),b=source.indexOf('  }, [loading, readError]);',a);assert.ok(a>=0&&b>a);
  const calls=[],node={isConnected:true,focus:options=>calls.push(options)};
  const env={loading:scenario==='busy',retryFocusRef:{current:true},historyRootRef:{current:scenario==='rows'?node:null},retryReturnRef:{current:scenario==='detached'?{isConnected:false}:node}};
  new Function('e',`with(e){${source.slice(a+'  useEffect(() => {'.length,b)}}`)(env);
  assert.equal(calls.length,scenario==='rows'||scenario==='empty'?1:0);
  if(calls.length)assert.deepEqual(calls[0],{preventScroll:true});
  assert.equal(env.retryFocusRef.current,scenario==='busy');
 });
}
