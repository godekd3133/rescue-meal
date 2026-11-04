import test from 'node:test';import assert from 'node:assert/strict';import {storageLocationSummary} from '../src/storageLocationPresentation.ts';
test('default storage retains its familiar method name',()=>assert.equal(storageLocationSummary(null,'냉장'),'냉장'));
test('a location name without method includes its actual storage method',()=>assert.equal(storageLocationSummary('윗칸','냉장'),'윗칸 (냉장)'));
test('an explicit method in the name is not repeated',()=>assert.equal(storageLocationSummary('냉장고 윗칸','냉장'),'냉장고 윗칸'));
test('a conflicting location name cannot hide its actual method',()=>assert.equal(storageLocationSummary('냉동칸','냉장'),'냉동칸 (냉장)'));

test('a fridge/freezer name keeps the actual method explicit',()=>assert.equal(storageLocationSummary('냉장고 냉동칸','냉동'),'냉장고 냉동칸 (냉동)'));
