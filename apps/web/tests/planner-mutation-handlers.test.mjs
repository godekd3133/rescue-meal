import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/MealPlanSheet.tsx',import.meta.url),'utf8');
function extract(name,end){const a=source.indexOf(`  const ${name} = async`),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return stripTypeScriptTypes(source.slice(a,b));}
const cases=[
 ['saveMealPreferences','  useEffect(() => {','updateMealPreferences'],
 ['persistPlan','  const hasRecipe','saveMealPlan'],
 ['persistMultiDayPlan','  const toggleMultiDayHistory','saveMultiDayMealPlan'],
 ['completePlan','  const plannerBody =','completeMealPlan'],
 ['loadAlternatives','  const loadMultiDayPreview','options'],
 ['loadMultiDayPreview','  const persistMultiDayPlan','preview'],
 ['toggleMultiDayHistory','  const openSavedMultiDayPlan','history'],
 ['addShoppingSource','  const addMissingToShopping','addShoppingList'],
 ['toggleAudit','  const toggleHistory','events'],
 ['toggleHistory','  const setConsumptionValue','history'],
];
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(name,end,method,pending){let current=true;const events=[];const plan={id:'old-plan',recipe_id:'recipe',inventory_ids:['food'],snapshot_hash:'hash',max_minutes:30,servings:1,missing_ingredients:[]};const values={
 capturePlannerMutationScope:()=>()=>current,capturePlannerReadScope:()=>()=>current,
 ingredients:[{id:'food'}],loading:false,saving:false,saved:name==='completePlan'||name==='toggleAudit',plan,hasRecipe:true,completed:false,completing:false,stockChecking:false,
 mealPreferencesSaving:false,mealPreferencesLoading:false,mealPreferencesLoaded:true,mealPreferencesDraft:[],
 multiDayPreview:name==='loadMultiDayPreview'?null:{id:'bundle',days:[{status:'preview',plan}],inventory_ids:['food'],snapshot_hash:'hash',max_minutes:30,servings:1},multiDaySaving:false,multiDaySaved:false,multiDayOpen:false,multiDayLoading:false,
 alternativesLoading:false,alternativesOpen:false,maxMinutes:30,servings:1,
 multiDayHistoryLoading:false,multiDayHistoryOpen:false,shoppingLoading:false,shoppingMutating:false,
 auditLoading:false,auditOpen:false,historyLoading:false,historyOpen:false,
 requiresSafetyAcknowledgement:false,safetyAcknowledged:true,consumptionRows:[{foodId:'food'}],consumptionDraft:{food:1},consumptionInputErrors:[],
 multiDaySaveFocusRef:{current:false},revealCompletionRef:{current:false},revealCompletionFocusRef:{current:false},
 mealApi:{isConfigured:true,[method]:()=>pending.promise},workspaceSync:{run:()=>pending.promise},
};
const environment=new Proxy(values,{has:()=>true,get:(target,key)=>key===Symbol.unscopables?undefined:key in target?target[key]:(...args)=>{events.push([String(key),...args]);}});
const handler=new Function('environment',`with(environment){${extract(name,end)};return ${name};}`)(environment);
return {handler,events,values,switchContext:()=>{current=false;events.length=0;}};}
for(const [name,end,method] of cases)for(const outcome of ['success','failure']){
 test(`${name}: late ${outcome} cannot update a different planner scope`,async()=>{
  const pending=deferred(),c=setup(name,end,method,pending);const task=c.handler(...(name === "addShoppingSource" ? ["meal_plan", "old-plan"] : []));c.switchContext();
  if(outcome==='success')pending.resolve({current:true,value:{options:[]}});else pending.reject(new Error('old request failed'));
  await task;assert.deepEqual(c.events,[]);
 });
}
test('a normal same-account plan save still applies and finishes',async()=>{
 const pending=deferred(),c=setup('persistPlan','  const hasRecipe','saveMealPlan',pending);const task=c.handler();
 pending.resolve(c.values.plan);await task;
 assert.ok(c.events.some(([name,value])=>name==='setSaved'&&value===true));
 assert.equal(c.events.filter(([name])=>name==='onSaved').length,1);
 assert.ok(c.events.some(([name,value])=>name==='setSaving'&&value===false));
 const saved=c.events.find(([name])=>name==='onSaved');c.switchContext();saved[3]();assert.deepEqual(c.events,[]);
});


for (const [name, end, method] of cases.filter(([name]) => ['loadAlternatives','loadMultiDayPreview','toggleMultiDayHistory','toggleAudit','toggleHistory'].includes(name))) {
 test(`${name}: a superseded same-context read cannot finish a newer request`, async () => {
  const pending=deferred(),c=setup(name,end,method,pending);const task=c.handler();c.events.length=0;
  pending.resolve({current:false});await task;assert.deepEqual(c.events,[]);
 });
}

for (const [name,end,method,value,state] of [
 ['addShoppingSource','  const addMissingToShopping','addShoppingList',{items:[],added_count:1,updated_count:0},'setShoppingAddedCount'],
 ['toggleHistory','  const setConsumptionValue','history',{current:true,value:[]},'setHistoryPlans'],
]) test(`${name}: current owner results still apply`,async()=>{
 const pending=deferred(),c=setup(name,end,method,pending);
 const task=c.handler(...(name==='addShoppingSource'?['meal_plan','old-plan']:name.includes('Item')?[{id:'item',checked:false}]:[]));
 pending.resolve(value);await task;
 assert.ok(c.events.some(([key])=>key===state));
 assert.ok(c.events.some(([key,value])=>['setShoppingMutating','setShoppingLoading','setHistoryLoading'].includes(key)&&value===false));
});
test('shopping retry callbacks cannot act in a replacement workspace',async()=>{
 const pending=deferred(),c=setup('addShoppingSource','  const addMissingToShopping','addShoppingList',pending);
 const task=c.handler('meal_plan','old-plan');pending.reject(new Error('temporary failure'));await task;
 const retry=c.events.find(([name,value])=>name==='setShoppingRetryAction'&&value)?.[1];assert.ok(retry);
 c.switchContext();retry.onRetry();assert.deepEqual(c.events,[]);
});

test('completion cannot write while current stock is being checked',async()=>{
 const pending=deferred(),x=setup('completePlan','  const plannerBody =','completeMealPlan',pending);
 let writes=0;x.values.stockChecking=true;x.values.mealApi.completeMealPlan=()=>{writes++;return pending.promise;};
 await x.handler();assert.equal(writes,0);
});

test('unfinished cooking input prevents completion before any mutation starts',async()=>{
 const pending=deferred(),x=setup('completePlan','  const plannerBody =','completeMealPlan',pending);
 x.values.consumptionInputErrors=[{foodId:'food'}];
 await x.handler();
 assert.ok(x.events.some(e=>e[0]==='setError'&&e[1]==='사용한 양을 확인해 주세요.'));
 assert.ok(!x.events.some(e=>e[0]==='setCompleting'&&e[1]===true));
});
