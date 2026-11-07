import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const server=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom',logLevel:'error'});
const {default:ShoppingListSheet}=await server.ssrLoadModule('/src/ShoppingListSheet.tsx');
const {MobileDeviceProvider}=await server.ssrLoadModule('/src/mobile/Device.tsx');
const {KeyboardProvider}=await server.ssrLoadModule('/src/mobile/Keyboard.tsx');
test.after(()=>server.close());
const item={id:'shopping-one',canonical_name:'우유',quantity:2,unit:'개',checked:true,sources:[{source_type:'manual',source_id:'manual-one',quantity:2}],created_at:'2026-10-11T00:00:00Z',updated_at:'2026-10-11T00:00:00Z',received_food_id:'received-lot'};
function render(inventoryFoods, quantity=2){
 const noop=()=>{};
 return renderToStaticMarkup(h(MobileDeviceProvider,null,h(KeyboardProvider,null,h(ShoppingListSheet,{items:[{...item,quantity}],inventoryFoods,loading:false,mutating:false,error:'',notice:'',onRefresh:noop,onToggle:noop,onDelete:noop,onAddManual:noop,onReceive:noop,onOpenMeal:noop,onOpenInventoryFood:noop,storageLocations:[]}))));
}
test('shopping rows preserve precise quantities instead of rounding a positive purchase to zero',()=>{
 for(const quantity of [1.1234,0.0001]) assert.match(render([],quantity),new RegExp(String(quantity).replace('.', '\\.')));
 // The add row is one name field and 추가; amounts are typed into the name or changed on the row.
 assert.doesNotMatch(render([]),/aria-label="살 것 수량"/);
 assert.match(render([]),/aria-label="살 것 이름"/);
});
test('a recorded purchase with no live lot renders a status, not a disabled viewing action',()=>{
 const html=render([]);
 assert.match(html,/shop-recorded[^>]*>넣었어요/);
 assert.doesNotMatch(html,/aria-label="우유 식품 보기"/);
 assert.doesNotMatch(html,/aria-label="우유 냉장고에 넣기"/);
});
test('a different lot with the same name does not offer the wrong record',()=>{
 const html=render([{id:'different-lot',name:'우유',quantity:'1개',storage:'냉장'}]);
 assert.match(html,/shop-recorded/);
 assert.doesNotMatch(html,/aria-label="우유 식품 보기"/);
});
test('the exact recorded lot keeps its viewing action',()=>{
 const html=render([{id:'received-lot',name:'우유',quantity:'2개',storage:'냉장'}]);
 assert.match(html,/aria-label="우유 식품 보기"/);
 assert.doesNotMatch(html,/shop-recorded/);
});
