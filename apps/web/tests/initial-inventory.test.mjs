import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const initializer=source.match(/const \[foods, setFoods\] = useState<FoodItem\[\]>\((.*?)\);/)?.[1];
assert.ok(initializer,'Actual inventory initializer must be found');
const initialize=new Function('mealApi','createDemoFoods',`return (${initializer})();`);
for(const [configured,mode] of [[true,'demo'],[true,'production'],[false,'production'],[false,'demo']]){
 test(`initial inventory configured=${configured}, mode=${mode} never substitutes examples for personal records`,()=>{
  let fixtureReads=0;const examples=Array.from({length:7},(_,i)=>({id:`example-${i}`}));
  const foods=initialize({isConfigured:configured,deploymentMode:mode},()=>{fixtureReads++;return examples;});
  if(!configured&&mode==='demo'){assert.equal(foods,examples);assert.equal(fixtureReads,1);}
  else {assert.deepEqual(foods,[]);assert.equal(fixtureReads,0);}
 });
}
