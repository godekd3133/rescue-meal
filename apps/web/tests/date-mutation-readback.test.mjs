import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {confirmedDateReadbackMatches} from '../src/dateMutationReadback.ts';
const food={id:'food',date_assertion:{kind:'user_reminder',value:'2026-10-20',source:'user_input',source_detail:'사용자 알림 설정',user_confirmed:true}};
const matches=f=>confirmedDateReadbackMatches(f,'food','2026-10-20','user_reminder','사용자 알림 설정');
test('exact confirmed readback identifies the requested persisted date',()=>assert.equal(matches(food),true));
test('missing, different and unconfirmed dates cannot claim saved confirmation',()=>{
 for(const f of [null,{...food,id:'other'},...['kind','value','source','source_detail','user_confirmed'].map(key=>({...food,date_assertion:{...food.date_assertion,[key]:key==='user_confirmed'?false:'different'}}))])assert.equal(matches(f),false);
});
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');const start=source.indexOf('  const confirmFoodDate ='),a=source.indexOf('.catch(async (reason) => {',start)+'.catch(async (reason) => {'.length,b=source.indexOf('\n      })',a);assert.ok(a>start&&b>a);
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
function setup(snapshot,synced=true,reason='unknown'){
 const calls=[],values={current:true,foodId:'food',dateValue:'2026-10-20',kind:'user_reminder',sourceDetail:'사용자 알림 설정',confirmedDateReadbackMatches,isCurrentWorkspace:()=>values.current,syncDashboard:async(_home,_deps,observe)=>{if(snapshot)observe({inventory:[snapshot]});return synced;},isMealApiWorkspaceConflictError:()=>reason==='conflict',isMealApiFoodDatePersistenceError:()=>reason==='persistence',withServerReadbackNotice:m=>m,MEAL_API_WORKSPACE_CONFLICT_MESSAGE:'conflict',setToast:v=>calls.push(['toast',v]),setToastAction:v=>calls.push(['action',v]),showRetryToast:v=>calls.push(['retry',v]),confirmFoodDate:()=>{}};
 const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]});return {calls,values,run:()=>new AsyncFunction('env','reason',`with(env){${stripTypeScriptTypes('const operation = async (reason) => {'+source.slice(a,b)+'};')};return operation(reason);}`)(env,new Error(reason))};
}
test('lost write response followed by exact fresh data reports verified save',async()=>{const x=setup(food);await x.run();assert.ok(x.calls.some(([k,v])=>k==='toast'&&v.includes('확인했어요')));assert.equal(x.calls.some(([k])=>k==='retry'),false);});
test('unavailable readback offers list verification instead of falsely stating rollback',async()=>{const x=setup(null,false);await x.run();assert.ok(x.calls.some(([k,v])=>k==='action'&&v?.label==='목록 확인'));assert.ok(x.calls.some(([k,v])=>k==='toast'&&v.includes('여부를 확인하지 못')));});
test('explicit persistence failure still offers its safe retry when no saved date is found',async()=>{const x=setup(null,true,'persistence');await x.run();assert.ok(x.calls.some(([k])=>k==='retry'));});
test('an obsolete date operation cannot report its old confirmation after a newer intent',async()=>{const x=setup(food);x.values.syncDashboard=async(_h,_d,observe)=>{observe({inventory:[food]});x.values.current=false;return true;};await x.run();assert.deepEqual(x.calls,[]);});
