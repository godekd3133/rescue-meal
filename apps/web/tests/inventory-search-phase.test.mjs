import assert from 'node:assert/strict';
import test from 'node:test';
import {inventorySearchPhase} from '../src/inventorySearchPhase.ts';
const current={active:true,requestKey:'broccoli|cold',responseKey:'broccoli|cold',status:'ready',resultCount:0};
test('only a response for the current search can establish an empty result',()=>{
 assert.equal(inventorySearchPhase(current),'ready');
 assert.equal(inventorySearchPhase({...current,responseKey:'onion|cold'}),'waiting');
 assert.equal(inventorySearchPhase({...current,status:'idle'}),'waiting');
});
test('a failed previous search is not an error for the new search',()=>assert.equal(inventorySearchPhase({...current,status:'error',responseKey:'onion|cold'}),'waiting'));
test('first-page loading does not establish a zero count',()=>assert.equal(inventorySearchPhase({...current,status:'loading'}),'waiting'));
test('pagination keeps confirmed rows while loading more',()=>assert.equal(inventorySearchPhase({...current,status:'loading',resultCount:40}),'refreshing'));
test('same-search failures distinguish no result from retained rows',()=>{
 assert.equal(inventorySearchPhase({...current,status:'error'}),'error');
 assert.equal(inventorySearchPhase({...current,status:'error',resultCount:40}),'stale');
});
test('local inventory and offline filtering do not wait on an inactive server search',()=>assert.equal(inventorySearchPhase({...current,active:false,status:'loading'}),'local'));
test('unfinished IME composition is not a confirmed result, network wait or error',()=>{
 for(const status of ['ready','loading','error']) assert.equal(inventorySearchPhase({...current,composing:true,status}),'composing');
 assert.equal(inventorySearchPhase({...current,composing:false,status:'ready'}),'ready');
});
