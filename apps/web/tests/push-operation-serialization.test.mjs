import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../src/AccountSheet.tsx',import.meta.url),'utf8');
const a=source.indexOf('  const subscribePush = async'),b=source.indexOf('  const pushSupported =',a);
assert.ok(a>=0&&b>a);
function setup(pushEnabled=false){
  let resolveRegister,rejectRegister,resolveRemove;
  const registrationPromise=new Promise((resolve,reject)=>{resolveRegister=resolve;rejectRegister=reject;});
  const removalPromise=new Promise(resolve=>{resolveRemove=resolve;});
  const state={calls:[],draft:{push_enabled:false,lead_days:5},notice:'',subscriptions:[{endpoint_fingerprint:'a'},{endpoint_fingerprint:'b'}]};
  const local={toJSON:()=>({endpoint:'https://push.example.test/one',keys:{p256dh:'p'.repeat(32),auth:'a'.repeat(16)}})};
  const values={current:true,workspaceSync:{currentWorkspaceKey:'owner',captureScope(){const key=this.currentWorkspaceKey;return()=>this.currentWorkspaceKey===key;}},Error,Boolean,configuredVapidPublicKey:'test-key',notificationMutationBusyRef:{current:false},notificationMutationVersionRef:{current:0},preferences:{push_enabled:pushEnabled},navigator:{serviceWorker:{getRegistration:async()=>({active:{state:'activated'},pushManager:{getSubscription:async()=>local}}),get ready(){throw new Error('must not wait for registration');}}},window:{PushManager:{},Notification:{}},Notification:{permission:'granted'},mealApi:{captureSession:()=>()=>values.current,registerPushSubscription:async()=>{state.calls.push('register');return registrationPromise;},removePushSubscription:async id=>{state.calls.push(['remove',id]);return removalPromise;}},unsubscribeMatchingPush:async()=>false,isMealApiPushSubscriptionPersistenceError:()=>false,isMealApiWorkspaceConflictError:()=>false,setSubscriptions:fn=>{state.subscriptions=fn(state.subscriptions);},setDraft:fn=>{state.draft=fn(state.draft);},setNotice:v=>{state.notice=v;},setError:v=>{state.error=v;},setRetryAction:v=>{state.retry=v;},setSubscribing:()=>{},setRemovingFingerprint:()=>{}};
  const env=new Proxy(values,{has:()=>true,get:(o,k)=>k===Symbol.unscopables?undefined:o[k]});
  const actions=new Function('env',`with(env){${stripTypeScriptTypes(source.slice(a,b))};return {subscribePush,removePushSubscription};}`)(env);
  return {state,values,...actions,resolveRegister,rejectRegister,resolveRemove};
}
test('pending connection blocks duplicate connection and removal',async()=>{
  const x=setup();const first=x.subscribePush(),duplicate=x.subscribePush(),other=x.removePushSubscription({endpoint_fingerprint:'b'});
  x.resolveRegister({endpoint_fingerprint:'new'});await Promise.all([first,duplicate,other]);
  assert.deepEqual(x.state.calls,['register']);assert.equal(x.values.notificationMutationBusyRef.current,false);
  assert.equal(x.state.draft.lead_days,5);assert.equal(x.state.draft.push_enabled,true);
  assert.match(x.state.notice,/설정을 저장/);
});
test('pending removal serializes other connection operations',async()=>{
  const x=setup();const first=x.removePushSubscription({endpoint_fingerprint:'a'}),other=x.removePushSubscription({endpoint_fingerprint:'b'}),connect=x.subscribePush();
  x.resolveRemove({removed:true});await Promise.all([first,other,connect]);
  assert.deepEqual(x.state.calls,[['remove','a']]);assert.deepEqual(x.state.subscriptions,[{endpoint_fingerprint:'b'}]);
  assert.equal(x.values.notificationMutationBusyRef.current,false);
});
test('failed connection releases the operation lock',async()=>{
  const x=setup();const connecting=x.subscribePush();x.rejectRegister(new Error('registration-outage'));await connecting;
  assert.equal(x.values.notificationMutationBusyRef.current,false);
  const removing=x.removePushSubscription({endpoint_fingerprint:'a'});x.resolveRemove({removed:true});await removing;
  assert.deepEqual(x.state.calls,['register',['remove','a']]);
});
test('already saved push preference reports connection without an unsaved activation claim',async()=>{
  const x=setup(true);const task=x.subscribePush();x.resolveRegister({endpoint_fingerprint:'new'});await task;
  assert.equal(x.state.notice,'이 기기를 알림에 연결했어요.');
});

test('missing worker registration asks for retry without requesting permission',async()=>{
  const x=setup();let permissionRequested=false;
  x.values.navigator.serviceWorker.getRegistration=async()=>null;
  x.values.Notification.permission='default';x.values.Notification.requestPermission=async()=>{permissionRequested=true;return 'granted';};
  await x.subscribePush();assert.equal(permissionRequested,false);assert.deepEqual(x.state.calls,[]);
  assert.match(x.state.error,/준비되지/);assert.deepEqual(x.state.retry,{kind:'subscribe'});assert.equal(x.values.notificationMutationBusyRef.current,false);
});
test('an activating worker is not treated as ready for push subscription',async()=>{
  const x=setup();x.values.navigator.serviceWorker.getRegistration=async()=>({active:{state:'activating'}});
  await x.subscribePush();assert.deepEqual(x.state.calls,[]);assert.match(x.state.error,/준비되지/);assert.equal(x.values.notificationMutationBusyRef.current,false);
});

test('account change during permission request does not register in the new session',async()=>{
  const x=setup();let release;
  x.values.Notification.permission='default';
  x.values.Notification.requestPermission=()=>new Promise(resolve=>{release=resolve;});
  const task=x.subscribePush();await new Promise(resolve=>setImmediate(resolve));
  x.values.current=false;release('granted');await task;
  assert.deepEqual(x.state.calls,[]);assert.equal(x.state.draft.push_enabled,false);assert.equal(x.state.notice,'');assert.equal(x.values.notificationMutationBusyRef.current,false);
});
test('workspace change while registration waits ignores its response',async()=>{
  const x=setup();const task=x.subscribePush();await new Promise(resolve=>setImmediate(resolve));
  x.values.workspaceSync.currentWorkspaceKey='new-owner';x.resolveRegister({endpoint_fingerprint:'new'});await task;
  assert.equal(x.state.draft.push_enabled,false);assert.equal(x.state.notice,'');assert.deepEqual(x.state.subscriptions,[{endpoint_fingerprint:'a'},{endpoint_fingerprint:'b'}]);assert.equal(x.values.notificationMutationBusyRef.current,false);
});
test('stale removal response does not change new connection rows or unsubscribe the browser',async()=>{
  const x=setup();let cleanup=false;x.values.unsubscribeMatchingPush=async()=>{cleanup=true;return false;};
  const task=x.removePushSubscription({endpoint_fingerprint:'a'});
  x.values.current=false;x.resolveRemove({removed:true});await task;
  assert.equal(cleanup,false);assert.deepEqual(x.state.subscriptions,[{endpoint_fingerprint:'a'},{endpoint_fingerprint:'b'}]);assert.equal(x.state.notice,'');assert.equal(x.values.notificationMutationBusyRef.current,false);
});
