import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
// Exercise the actual handlers with controlled transport and UI setters.
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const code=stripTypeScriptTypes(extract('  const addManualShoppingItem = async','  const addDemoShoppingItems = async')+extract('  const markNotificationRead = async','  const openNotificationTarget'));
const factory=new Function('environment',`with(environment){${code};return {addManualShoppingItem,receiveShoppingItem,toggleShoppingItem,removeShoppingItem,markNotificationRead,markAllNotificationsRead};}`);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const item={id:'owner-a-item',canonical_name:'대파',unit:'팩',checked:false};
const notification={id:'owner-a-notification',read_at:null};
const cases=[
 ['addManualShoppingItem','addManualShoppingListItem',[{canonicalName:'대파',quantity:2,unit:'팩'}]],
 ['receiveShoppingItem','receiveShoppingListItem',[item,{quantity:1,storageType:'refrigerated'}]],
 ['toggleShoppingItem','updateShoppingListItem',[item]],['removeShoppingItem','deleteShoppingListItem',[item]],
 ['markNotificationRead','markNotificationRead',[notification]],['markAllNotificationsRead','markAllNotificationsRead',[]],
];
function setup(method,transport){
 let scope=0;const events=[];
 const env={
  captureMutationScope:()=>{const captured=scope;return ()=>captured===scope;},
  mealApi:{isConfigured:true,[method]:transport},shoppingListMutatingRef:{current:false},notificationReadInFlightRef:{current:0},
  notificationReadOverridesRef:new Map(),notificationRetryAction:null,shoppingReceiveKeys:{current:new Map()},notifications:[notification],
  createId:()=> 'stable-key',createFood:food=>food,storageFromApi:()=> '냉장',storageLocations:[],imageForFoodName:()=> '/photo.jpg',
  formatReceiptAmount:String,withKoreanObjectParticle:name=>name,withServerReadbackNotice:message=>message,syncDashboard:async()=>true,
  isMealApiAuthError:()=>false,isMealApiWorkspaceConflictError:()=>false,isMealApiShoppingListPersistenceError:()=>true,
  isMealApiShoppingReceivePersistenceError:()=>true,isMealApiNotificationReadPersistenceError:()=>true,
  beginShoppingListMutation:()=>{env.shoppingListMutatingRef.current=true;events.push(['begin']);},
  finishShoppingListMutation:()=>{env.shoppingListMutatingRef.current=false;events.push(['finish']);},
  finishNotificationRead:()=>{env.notificationReadInFlightRef.current--;events.push(['finish-read']);},
 };
 for(const name of ['setShoppingListError','setShoppingListNotice','setShoppingListRetryAction','setToastAction','setToast','setShoppingList','rememberCurrentShoppingListRevision','setShoppingListStatus','setRecentlyReceivedFood','setNotificationsError','setNotificationRetryAction','setNotifications','rememberCurrentNotificationRevision'])env[name]=(...args)=>events.push([name,...args]);
 return {handlers:factory(env),env,events,switchAccount:()=>{scope++;env.shoppingListMutatingRef.current=true;env.notificationReadInFlightRef.current=7;events.length=0;}};
}
for(const [handler,method,args] of cases)for(const outcome of ['success','failure']){
 test(`${handler}: late ${outcome} cannot change the new account or finish its operation`,async()=>{
  const pending=deferred(),context=setup(method,()=>pending.promise),task=context.handlers[handler](...args);
  context.switchAccount();
  if(outcome==='success')pending.resolve({id:item.id,items:[],removed:true,inventory_lot:null});else pending.reject(new Error('old account request failed'));
  await task;assert.deepEqual(context.events,[]);assert.equal(context.env.shoppingListMutatingRef.current,true);assert.equal(context.env.notificationReadInFlightRef.current,7);
 });
}
test('same-account shopping add applies and finishes normally',async()=>{
 const c=setup('addManualShoppingListItem',async()=>({items:[item]}));
 assert.equal(await c.handlers.addManualShoppingItem({canonicalName:'대파',quantity:2,unit:'팩'}),true);
 assert.ok(c.events.some(([name,value])=>name==='setShoppingList'&&value[0]===item));assert.equal(c.env.shoppingListMutatingRef.current,false);
});
test('an old retry cannot submit its shopping payload under a new account',async()=>{
 let calls=0;const c=setup('addManualShoppingListItem',async()=>{calls++;throw new Error('persistence failure');});
 await c.handlers.addManualShoppingItem({canonicalName:'대파',quantity:2,unit:'팩'});
 const retry=c.events.find(([name,value])=>name==='setShoppingListRetryAction'&&value)?.[1];assert.equal(typeof retry?.onRetry,'function');
 c.switchAccount();retry.onRetry();assert.equal(calls,1);assert.deepEqual(c.events,[]);
});
test('receive readback cannot finish a different account operation',async()=>{
 const entered=deferred(),readback=deferred();
 const c=setup('receiveShoppingListItem',async()=>({items:[],inventory_lot:null,received_quantity:1,removed_planned_source_count:0}));
 c.env.syncDashboard=()=>{entered.resolve();return readback.promise;};
 const task=c.handlers.receiveShoppingItem(item,{quantity:1,storageType:'refrigerated'});
 await entered.promise;c.switchAccount();readback.resolve(true);await task;
 assert.deepEqual(c.events,[]);assert.equal(c.env.shoppingListMutatingRef.current,true);
});
test('an old receive readback action cannot reopen the shopping sheet after account change',async()=>{
 let reads=0;const c=setup('receiveShoppingListItem',async()=>({items:[],inventory_lot:null,received_quantity:1,removed_planned_source_count:0}));
 c.env.syncDashboard=async()=>{reads++;return false;};
 assert.equal(await c.handlers.receiveShoppingItem(item,{quantity:1,storageType:'refrigerated'}),true);
 const action=c.events.find(([name,value])=>name==='setToastAction'&&value?.label==='목록 새로고침')?.[1];
 assert.equal(typeof action?.onInvoke,'function');c.switchAccount();action.onInvoke();
 assert.equal(reads,1);assert.deepEqual(c.events,[]);
});
