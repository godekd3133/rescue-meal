import {WorkspaceSyncCoordinator} from '../src/workspaceSync.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/AccountSheet.tsx',import.meta.url),'utf8');const panel=source.indexOf('function NotificationPreferencesPanel('),a=source.indexOf('  const save = async',panel),b=source.indexOf('  const subscribePush',a);assert.ok(panel>=0&&a>panel&&b>a);
function setup(preferences,loading=false,saving=false,leadDaysText="2",draftChanged=true){const calls=[];const values={current:true,notificationMutationBusyRef:{current:false},notificationMutationVersionRef:{current:0},workspaceSync:{currentWorkspaceKey:"owner",captureScope(){const key=this.currentWorkspaceKey;return()=>this.currentWorkspaceKey===key;}},Number,Error,preferences,loading,saving,leadDaysText,draftChanged,draft:{quiet_hours_start:null,quiet_hours_end:null},mealApi:{captureSession:()=>()=>values.current,updateNotificationPreferences:async input=>{calls.push(['request',input]);return input;}}};const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:k in o?o[k]:(...args)=>calls.push([String(k),...args])});const code=stripTypeScriptTypes(source.slice(a,b));const fn=new Function('e',`with(e){${code};return save;}`)(env);return {calls,values,fn};}
test('unread notification preferences cannot be overwritten with local defaults',async()=>{const c=setup(null);await c.fn();assert.deepEqual(c.calls,[]);});
test('a pending settings read blocks saving a stale draft',async()=>{const c=setup({},true);await c.fn();assert.deepEqual(c.calls,[]);});
test('pending save prevents a second submission',async()=>{const c=setup({},false,true);await c.fn();assert.deepEqual(c.calls,[]);});
test('known settings remain editable and save normally',async()=>{const c=setup({});await c.fn();assert.ok(c.calls.some(([k])=>k==='request'));assert.ok(c.calls.some(([k])=>k==='setNotice'));});

test('empty notification period is rejected rather than silently becoming zero',async()=>{const c=setup({},false,false,'');await c.fn();assert.equal(c.calls.some(([k])=>k==='request'),false);assert.ok(c.calls.some(([k])=>k==='setError'));});

test('a draft restored to saved settings does not issue a redundant request',async()=>{const c=setup({},false,false,'2',false);await c.fn();assert.deepEqual(c.calls,[]);});

const effectStart=source.indexOf('  // Returning to the saved values');
const effectEnd=source.indexOf('  }, [draftChanged, retryAction]);',effectStart)+'  }, [draftChanged, retryAction]);'.length;
assert.ok(effectStart>=0&&effectEnd>effectStart);
function cleanup(changed,kind){const calls=[];const values={draftChanged:changed,retryAction:kind?{kind}:null,useEffect:fn=>fn(),setError:v=>calls.push(['error',v]),setRetryAction:v=>calls.push(['retry',v])};const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]});new Function('env',`with(env){${stripTypeScriptTypes(source.slice(effectStart,effectEnd))}}`)(env);return calls;}
test('restoring saved values removes obsolete save failure and retry',()=>assert.deepEqual(cleanup(false,'save'),[['error',''],['retry',null]]));
test('still changed settings keep the failed-save recovery',()=>assert.deepEqual(cleanup(true,'save'),[]));
test('a failed read or conflict still requires refresh even with no edits',()=>assert.deepEqual(cleanup(false,'refresh'),[]));

test('back-to-back save attempts send only one request before React renders busy state',async()=>{
 const c=setup({});let resolve;let requests=0;
 c.values.mealApi.updateNotificationPreferences=input=>{requests++;return new Promise(r=>{resolve=()=>r(input);});};
 const first=c.fn(),second=c.fn();assert.equal(requests,1);resolve();await Promise.all([first,second]);assert.equal(c.values.notificationMutationBusyRef.current,false);
});
test('a pending push mutation blocks settings save without discarding the draft',async()=>{
 const c=setup({});c.values.notificationMutationBusyRef.current=true;await c.fn();assert.deepEqual(c.calls,[]);
});
test('settings response from a previous workspace cannot overwrite the new settings',async()=>{
 const c=setup({});let resolve;c.values.mealApi.updateNotificationPreferences=()=>new Promise(r=>{resolve=r;});
 const task=c.fn();c.values.workspaceSync.currentWorkspaceKey='new-owner';resolve({lead_days:2});await task;
 assert.equal(c.calls.some(([k])=>['setPreferences','setDraft','setLeadDaysText','setNotice'].includes(k)),false);assert.equal(c.values.notificationMutationBusyRef.current,false);
});
test('failed save from an old session does not show a retry in the new account',async()=>{
 const c=setup({});let reject;c.values.mealApi.updateNotificationPreferences=()=>new Promise((_,r)=>{reject=r;});
 const task=c.fn();c.values.current=false;reject(new Error('old-session-failure'));await task;
 assert.equal(c.calls.some(([k,v])=>k==='setError'&&v),false);assert.equal(c.calls.some(([k,v])=>k==='setRetryAction'&&v),false);assert.equal(c.values.notificationMutationBusyRef.current,false);
});

test('leaving and returning to the same workspace does not revive an old save',async()=>{
 const c=setup({});c.values.workspaceSync=new WorkspaceSyncCoordinator(()=> 'owner','owner');let resolve;
 c.values.mealApi.updateNotificationPreferences=()=>new Promise(r=>{resolve=r;});
 const task=c.fn();c.values.workspaceSync.setWorkspace('other');c.values.workspaceSync.setWorkspace('owner');resolve({lead_days:2});await task;
 assert.equal(c.calls.some(([k])=>['setPreferences','setDraft','setNotice'].includes(k)),false);
});
