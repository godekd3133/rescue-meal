import test from 'node:test';
import assert from 'node:assert/strict';
import { storageEventQuantityDetail } from '../src/storageEventPresentation.ts';
test('missing quantity is not fabricated as zero consumption or disposal',()=>{
 for(const discarded of [false,true]) assert.equal(storageEventQuantityDetail(null,'팩',discarded),'기록된 양을 확인할 수 없어요.');
});
test('invalid historical amounts remain unknown instead of looking like valid recorded usage',()=>{
 for(const amount of [0,-1,Infinity,NaN]) assert.equal(storageEventQuantityDetail(amount,'g'),'기록된 양을 확인할 수 없어요.');
});
test('very small recorded amounts stay exact and readable without scientific notation',()=>{
 assert.equal(storageEventQuantityDetail(0.0000004,'kg'),'0.0000004kg 먹었어요');
});
test('known amounts retain their unit and consumption or disposal meaning',()=>{
 assert.equal(storageEventQuantityDetail(1.1234,'L'),'1.1234L 먹었어요');
 assert.equal(storageEventQuantityDetail(0.2,'팩',true),'0.2팩 버렸어요');
});
