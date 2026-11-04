import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../src/AccountSheet.tsx',import.meta.url),'utf8');
const a=source.indexOf('async function unsubscribeMatchingPush('),b=source.indexOf('function formatPushSubscriptionTime(',a);
assert.ok(a>=0&&b>a);
function setup(registration,supported=true){const calls=[];const nav=supported?{serviceWorker:{getRegistration:async()=>{calls.push('get-existing');return registration;},get ready(){throw new Error('must not wait for a new registration');}}}:{};const fn=new Function('navigator','window','pushEndpointFingerprint',`${stripTypeScriptTypes(source.slice(a,b))};return unsubscribeMatchingPush;`)(nav,supported?{PushManager:{}}:{},async endpoint=>endpoint);return{calls,fn};}
test('missing browser registration does not wait or touch another connection',async()=>{const x=setup(null);assert.equal(await x.fn('target'),false);assert.deepEqual(x.calls,['get-existing']);});
test('another endpoint never unsubscribes this browser',async()=>{let unsubscribed=false;const x=setup({pushManager:{getSubscription:async()=>({endpoint:'other',unsubscribe:async()=>{unsubscribed=true;return true;}})}});assert.equal(await x.fn('target'),false);assert.equal(unsubscribed,false);});
test('matching endpoint is unsubscribed and reports completion',async()=>{let unsubscribed=false;const x=setup({pushManager:{getSubscription:async()=>({endpoint:'target',unsubscribe:async()=>{unsubscribed=true;return true;}})}});assert.equal(await x.fn('target'),false);assert.equal(unsubscribed,true);});
test('matching browser cleanup failure remains reviewable',async()=>{const x=setup({pushManager:{getSubscription:async()=>({endpoint:'target',unsubscribe:async()=>false})}});assert.equal(await x.fn('target'),true);});

test('ownership change while reading browser subscription prevents unsubscribe',async()=>{
  let current=true,release,unsubscribed=false;
  const x=setup({pushManager:{getSubscription:()=>new Promise(resolve=>{release=resolve;})}});
  const task=x.fn('target',()=>current);await new Promise(resolve=>setImmediate(resolve));
  current=false;release({endpoint:'target',unsubscribe:async()=>{unsubscribed=true;return true;}});await task;
  assert.equal(unsubscribed,false);
});
