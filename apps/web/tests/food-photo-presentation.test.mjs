import test from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_IMAGES } from '../src/foodPhotos.ts';
import { foodPhotoPresentation } from '../src/foodPhotoPresentation.ts';
test('unknown generic stock does not display unrelated groceries',()=>{
  assert.equal(foodPhotoPresentation(FOOD_IMAGES.groceries,'올리브유',null).kind,'placeholder');
});
test('a supplied photograph remains visible even for an unrecognized name',()=>{
  assert.equal(foodPhotoPresentation('/photos/customer-oil.jpg','올리브유',null).source,'/photos/customer-oil.jpg');
});
test('a known food uses its own photograph instead of the generic marker',()=>{
  assert.equal(foodPhotoPresentation(FOOD_IMAGES.groceries,'양파',null).source,FOOD_IMAGES.onion);
});
test('failed unknown photographs fall back to a neutral placeholder',()=>{
  assert.equal(foodPhotoPresentation('/missing.jpg','올리브유',{source:'/missing.jpg',fallbackFailed:false,fallback:null}).kind,'placeholder');
});
test('known failure tries its matching photo before showing a placeholder',()=>{
  const failed=foodPhotoPresentation('/missing.jpg','양파',{source:'/missing.jpg',fallbackFailed:false,fallback:FOOD_IMAGES.onion});
  assert.equal(failed.source,FOOD_IMAGES.onion);assert.equal(failed.kind,'image');
  assert.equal(foodPhotoPresentation('/missing.jpg','양파',{source:'/missing.jpg',fallbackFailed:true,fallback:FOOD_IMAGES.onion}).kind,'placeholder');
});
test('a failure from an older source cannot hide a fresh photograph',()=>{
  const fresh=foodPhotoPresentation('/fresh.jpg','올리브유',{source:'/old.jpg',fallbackFailed:true,fallback:null});
  assert.equal(fresh.source,'/fresh.jpg');assert.equal(fresh.kind,'image');
});

test('a failed fallback for an earlier name does not hide a different food photo',()=>{
  const changed=foodPhotoPresentation(FOOD_IMAGES.groceries,'김치',{source:FOOD_IMAGES.groceries,fallbackFailed:true,fallback:FOOD_IMAGES.onion});
  assert.equal(changed.source,FOOD_IMAGES.kimchi);assert.equal(changed.kind,'image');
});

test('the loading placeholder tint follows category, then name, then frozen storage', async () => {
  const { foodPhotoTone } = await import('../src/foodPhotoPresentation.ts');
  assert.equal(foodPhotoTone({ category: '채소', foodName: '두부' }), 'greens');
  assert.equal(foodPhotoTone({ foodName: '닭가슴살' }), 'protein');
  assert.equal(foodPhotoTone({ category: '유제품', foodName: '저지방 우유' }), 'dairy');
  assert.equal(foodPhotoTone({ category: '두부·콩', foodName: '국산콩 두부' }), 'grain');
  assert.equal(foodPhotoTone({ foodName: '올리브유', storage: '냉동' }), 'frozen');
  assert.equal(foodPhotoTone({ foodName: '올리브유', storage: '실온' }), 'neutral');
});
