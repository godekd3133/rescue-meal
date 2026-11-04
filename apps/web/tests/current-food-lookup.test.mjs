import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');const a=source.indexOf('  const findFoodById ='),b=source.indexOf('  const selectedFood =',a);assert.ok(a>=0&&b>a);
function setup(){const ref={current:{foods:[],inventorySearchResults:[]}};const code=stripTypeScriptTypes(source.slice(a,b));const fn=new Function('foodLookupSnapshotRef',`${code};return findFoodById;`)(ref);return{ref,fn};}
test('a deferred callback sees a food added after the callback was created',()=>{const c=setup(),food={id:'new'};c.ref.current={foods:[food],inventorySearchResults:[]};assert.equal(c.fn('new'),food);});
test('a callback sees refreshed values rather than a prior inventory object',()=>{const c=setup();c.ref.current.foods=[{id:'food',quantity:2}];const first=c.fn('food');c.ref.current={foods:[{id:'food',quantity:1}],inventorySearchResults:[]};assert.notEqual(c.fn('food'),first);assert.equal(c.fn('food').quantity,1);});
test('current search results can resolve records outside the base inventory page',()=>{const c=setup(),food={id:'searched'};c.ref.current.inventorySearchResults=[food];assert.equal(c.fn('searched'),food);});
test('cleared owner data cannot be resolved through an old captured lookup',()=>{const c=setup();c.ref.current.foods=[{id:'old'}];c.ref.current={foods:[],inventorySearchResults:[]};assert.equal(c.fn('old'),null);});
