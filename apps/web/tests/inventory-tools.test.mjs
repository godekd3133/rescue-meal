import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');
const expression=source.match(/const showInventoryTools = (.*?);/)?.[1];
assert.ok(expression);
const visible=new Function('hasKnownEmptyInventory','inventoryDataUnknown','hasInventoryQuery','storageFilter','inventoryStatusFilter',`return ${expression}`);
test('known empty, unfiltered inventory hides inactive tools',()=>assert.equal(visible(true,false,false,'전체','all'),false));
test('loaded records keep tools available',()=>assert.equal(visible(false,false,false,'전체','all'),true));
test('a query remains editable even with no inventory records',()=>assert.equal(visible(true,false,true,'전체','all'),true));
test('an active storage condition remains resettable',()=>assert.equal(visible(true,false,false,'냉장','all'),true));
test('an active status condition remains resettable',()=>assert.equal(visible(true,false,false,'전체','needs-review'),true));

test('unread inventory does not show zero-valued inactive tools',()=>assert.equal(visible(false,true,false,'전체','all'),false));
test('unknown inventory preserves an active query',()=>assert.equal(visible(false,true,true,'전체','all'),true));
