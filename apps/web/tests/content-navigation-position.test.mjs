import assert from 'node:assert/strict';
import test from 'node:test';
import {contentNavigationPosition} from '../src/contentNavigationPosition.ts';
const screen={scrollTop:0,scrollHeight:852,clientHeight:852,viewportTop:64,viewportHeight:591,inventoryTop:304};
test('a short first-run screen remains home at the top even when also at bottom',()=>assert.equal(contentNavigationPosition(screen),'home'));
test('a visible pantry does not select its tab at the top of home',()=>assert.equal(contentNavigationPosition({...screen,inventoryTop:100,scrollHeight:1019}),'home'));
test('position comparisons use rendered scale consistently',()=>{
 assert.equal(contentNavigationPosition({...screen,scrollTop:50,scrollHeight:1500,inventoryTop:390}),'home');
 assert.equal(contentNavigationPosition({...screen,scrollTop:50,scrollHeight:1500,inventoryTop:300}),'food');
 assert.equal(contentNavigationPosition({...screen,scrollTop:50,scrollHeight:1500,viewportHeight:852,inventoryTop:390}),'food');
});
test('scrolled bottom selects food even when a short pantry cannot reach the top',()=>assert.equal(contentNavigationPosition({...screen,scrollTop:167,scrollHeight:1019}),'food'));
test('small top settling keeps home selected',()=>assert.equal(contentNavigationPosition({...screen,scrollTop:0.75}),'home'));
