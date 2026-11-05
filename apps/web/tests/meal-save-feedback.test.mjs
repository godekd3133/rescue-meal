import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const a=source.indexOf('  const handleMealSaved = ('),b=source.indexOf('  const mergeFoods =',a);assert.ok(a>=0&&b>a);
const code=stripTypeScriptTypes(source.slice(a,b));
function setup(sheet,configured=false){const calls=[];const env={sheetRef:{current:sheet==='meal'?null:sheet},tabRef:{current:sheet==='meal'?'meal':'home'},mealApi:{isConfigured:configured},setToast:value=>calls.push(['toast',value]),setToastAction:value=>calls.push(['action',value])};const handler=new Function('environment',`with(environment){${code};return handleMealSaved;}`)(env);return {calls,handler};}
test('visible meal result does not duplicate its status with a toast',()=>{const c=setup('meal');c.handler('single',true,()=>{});assert.deepEqual(c.calls,[['toast',null],['action',null]]);});
test('a save finishing outside the meal view still announces its result',()=>{const c=setup(null,true);c.handler('single');assert.match(c.calls[0][1],/식단을 저장했어요/);});
test('background missing-ingredient follow-up remains actionable',()=>{const c=setup(null);let actions=0;c.handler('multi-day',true,()=>actions++);const action=c.calls.find(([kind,value])=>kind==='action'&&value)?.[1];assert.equal(action.label,'부족한 재료 담기');assert.doesNotMatch(action.message,/[•·]/);action.onInvoke();assert.equal(actions,1);});
