import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const a=source.indexOf('    const reviewAddedFood ='),b=source.indexOf('    if (!mealApi.isConfigured)',a);assert.ok(a>=0&&b>a);
function setup(sheet,current=true){const calls=[],food={id:'fresh',name:'대파'};const env={sheetRef:{current:sheet},isCurrentWorkspace:()=>current,pendingAddedFoodFocusRef:{current:null},food,findFoodById:()=>food,openFoodDetailFromMeal:(...args)=>calls.push(['meal',...args]),openDetail:(...args)=>calls.push(['detail',...args])};const code=stripTypeScriptTypes(source.slice(a,b));const fn=new Function('e',`with(e){${code};return reviewAddedFood;}`)(env);return{calls,fn};}
test('new food follow-up from a meal keeps meal return context',()=>{const c=setup('meal');c.fn('fresh');assert.deepEqual(c.calls,[['meal','fresh','date-review']]);});
test('ordinary home follow-up retains date review entry',()=>{const c=setup(null);c.fn('fresh');assert.equal(c.calls[0][0],'detail');assert.equal(c.calls[0][3],'date-review');});
test('an old owner follow-up cannot open data in a replacement workspace',()=>{const c=setup('meal',false);c.fn('fresh');assert.deepEqual(c.calls,[]);});
