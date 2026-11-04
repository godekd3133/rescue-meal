import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mergeNotificationSettingsDraft,notificationSettingsRemoteFields} from '../src/notificationSettingsDraft.ts';
const source=readFileSync(new URL('../src/AccountSheet.tsx',import.meta.url),'utf8'),panel=source.indexOf('function NotificationPreferencesPanel('),a=source.indexOf('  const refresh = async',panel),b=source.indexOf('  useEffect(',a);assert.ok(a>panel&&b>a);
const saved={in_app_enabled:true,push_enabled:false,lead_days:2,timezone:'Asia/Seoul',quiet_hours_start:null,quiet_hours_end:null};
function setup(dirty,initialDraft=null){
 const incoming={...saved,lead_days:8,timezone:'Asia/Tokyo'},state={draft:initialDraft?.preferences??{...saved,in_app_enabled:dirty?false:true},text:initialDraft?.leadDaysText??(dirty?'3':'2'),remote:[],notice:'saved'};
 const values={notificationMutationVersionRef:{current:0},notificationMutationBusyRef:{current:false},Boolean,String,Set,HTMLElement:class {},document:{activeElement:null},refreshFocusRef:{current:null},initialDraft,preferences:dirty?saved:null,draftChanged:dirty,draft:state.draft,leadDaysText:state.text,mergeNotificationSettingsDraft,notificationSettingsRemoteFields,workspaceSync:{run:async()=>({current:true,value:{preferences:incoming,subscriptions:[],workerHeartbeats:[]}})},setDraft:v=>{state.draft=typeof v==='function'?v(state.draft):v;},setLeadDaysText:v=>{state.text=typeof v==='function'?v(state.text):v;},setRemoteChangedFields:v=>{state.remote=typeof v==='function'?v(state.remote):v;},setNotice:v=>{state.notice=v;}};
 const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:k in o?o[k]:()=>{}});
 return {state,values,run:new Function('e',`with(e){${stripTypeScriptTypes(source.slice(a,b))};return refresh;}`)(env)};
}
test('auxiliary retry preserves edits and updates untouched preferences',async()=>{const c=setup(true);await c.run();assert.equal(c.state.draft.in_app_enabled,false);assert.equal(c.state.text,'3');assert.equal(c.state.draft.timezone,'Asia/Tokyo');assert.deepEqual(c.state.remote,['lead_days','timezone']);});
test('first confirmed read initializes the actual draft',async()=>{const c=setup(false);await c.run();assert.equal(c.state.text,'8');assert.equal(c.state.draft.timezone,'Asia/Tokyo');});
test('reopened draft uses its saved baseline to preserve edited fields',async()=>{const c=setup(false,{preferences:{...saved,in_app_enabled:false},leadDaysText:'3',savedPreferences:saved});await c.run();assert.equal(c.state.text,'3');assert.equal(c.state.draft.in_app_enabled,false);assert.equal(c.state.draft.timezone,'Asia/Tokyo');});
test('an incomplete reopened input is preserved until fixed or cancelled',async()=>{const c=setup(false,{preferences:saved,leadDaysText:'',savedPreferences:saved});await c.run();assert.equal(c.state.text,'');});

test('changed saved values clear an old success message',async()=>{const c=setup(true);await c.run();assert.equal(c.state.notice,'');});

test('a draft changed after refresh starts is merged at response time',async()=>{
 const c=setup(false);c.values.preferences=saved;let release;
 c.values.workspaceSync.run=()=>new Promise(r=>{release=r;});const task=c.run();
 c.state.draft={...saved,push_enabled:true};c.state.text='4';
 release({current:true,value:{preferences:{...saved,timezone:'Asia/Tokyo'},subscriptions:[],workerHeartbeats:[]}});await task;
 assert.equal(c.state.draft.push_enabled,true);assert.equal(c.state.text,'4');assert.equal(c.state.draft.timezone,'Asia/Tokyo');
});
test('a newer mutation makes an earlier refresh response obsolete',async()=>{
 const c=setup(true);let release;c.values.workspaceSync.run=()=>new Promise(r=>{release=r;});
 const task=c.run();c.values.notificationMutationVersionRef.current++;const latest={...saved,push_enabled:true};c.state.draft=latest;
 release({current:true,value:{preferences:{...saved,lead_days:8},subscriptions:[],workerHeartbeats:[]}});await task;
 assert.deepEqual(c.state.draft,latest);assert.equal(c.state.text,'3');assert.deepEqual(c.state.remote,[]);
});
test('refresh begun during mutation cannot replace the completed mutation',async()=>{
 const c=setup(true);c.values.notificationMutationBusyRef.current=true;let release;c.values.workspaceSync.run=()=>new Promise(r=>{release=r;});
 const task=c.run();c.values.notificationMutationBusyRef.current=false;const latest={...saved,push_enabled:true};c.state.draft=latest;
 release({current:true,value:{preferences:saved,subscriptions:[],workerHeartbeats:[]}});await task;
 assert.deepEqual(c.state.draft,latest);assert.equal(c.state.text,'3');
});
