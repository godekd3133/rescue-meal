import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

// Exercise the actual JSX action bodies without a browser or backend.
// A press that is canceled must never dispatch an app action.
const files=['AddFoodSheet','MealPlanSheet','AccountSheet'];
const prefix=/onPointerDown=\{\(event\) => (event\.preventDefault\(\))\} onClick=\{\(\) => \{/g;
function endOfBody(text,start){let depth=1,quote=null,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}if('"\'`'.includes(c)){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return i;}throw Error('unbalanced action');}
const buttons=[];
for(const file of files){const source=readFileSync(new URL(`../src/${file}.tsx`,import.meta.url),'utf8');for(const match of source.matchAll(prefix)){const start=match.index+match[0].length;buttons.push({file,line:source.slice(0,match.index).split('\n').length,down:match[1],click:source.slice(start,endOfBody(source,start))});}}
assert.ok(buttons.length>=17,'All corrected pointer-press actions must retain click handlers');
function setup(button){const trace=[];const values={window:{requestAnimationFrame:()=>trace.push('requestAnimationFrame')},keyboard:{hide:()=>trace.push('keyboard.hide')},record:{},mapping:{canonical_name:'대파',grocy_product_id:1,grocy_unit:'개'},option:{value:'refrigerated'},key:'fixture'};const environment=new Proxy(values,{has:()=>true,get:(target,key)=>key===Symbol.unscopables?undefined:key in target?target[key]:(..._args)=>trace.push(String(key))});return {trace,down:new Function('event',button.down),click:new Function('environment',`with(environment){${button.click}}`).bind(null,environment)};}
for(const button of buttons){const label=`${button.file}:${button.line}`;
 test(`${label}: canceled pointer press dispatches no action`,()=>{const c=setup(button);let prevented=false;c.down({preventDefault:()=>{prevented=true;}});assert.equal(prevented,true);assert.deepEqual(c.trace,[]);});
 test(`${label}: pointer click dispatches the action once`,()=>{const c=setup(button);c.down({preventDefault(){}});c.click({detail:1});assert.ok(c.trace.length>0);const expected=setup(button);expected.click({detail:0});assert.deepEqual(c.trace,expected.trace);const actions=c.trace.filter(name=>!['keyboard.hide','requestAnimationFrame'].includes(name));assert.equal(actions.length,new Set(actions).size,'Each action dispatches once per activation');});
 test(`${label}: keyboard activation uses the same action`,()=>{const c=setup(button);c.click({detail:0});assert.ok(c.trace.length>0);});
}
