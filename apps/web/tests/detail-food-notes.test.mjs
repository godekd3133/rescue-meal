import test from 'node:test';import assert from 'node:assert/strict';import {detailFoodNote} from '../src/detailFoodNotes.ts';
test('generic date instruction is not repeated as a food-specific note',()=>{for(const kind of ['unknown','estimated_use_first','actual_printed','user_confirmed'])assert.equal(detailFoodNote('날짜와 보관 방법을 확인해 주세요.',kind,false),null);});
test('a food-specific package warning stays visible while date review is shown',()=>{const note='포장지에 견과류가 들어 있다고 적혀 있어요.';assert.equal(detailFoodNote(note,'actual_printed',true),note);});
test('additional storage meaning prevents an exact generated-note match',()=>{const note='포장지에서 날짜를 확인했어요. 개봉 후 냉장 보관이라고 적혀 있어요.';assert.equal(detailFoodNote(note,'actual_printed',true),note);});
test('known evidence-only sentence is omitted only when review already covers it',()=>{const note='포장지에서 날짜를 확인했어요.';assert.equal(detailFoodNote(note,'actual_printed',true),null);assert.equal(detailFoodNote(note,'actual_printed',false),note);});
test('known estimated note is omitted without suppressing an unrelated note',()=>{assert.equal(detailFoodNote('실제 소비기한이 아닌 먼저 먹을 순서예요.','estimated_use_first',false),null);assert.equal(detailFoodNote('개봉 전에 포장을 확인해요.','estimated_use_first',false),'개봉 전에 포장을 확인해요.');});
test('known legacy service copy is rewritten without exposing generated-language labels',()=>assert.doesNotMatch(detailFoodNote('소비기한은 포장지에서 확인해 주세요. 구매일과 AI 소비 우선순위만 기록했어요.','unknown',false),/AI/));

test('standard purchase note is omitted only when purchase details are shown',()=>{const note='구매일과 보관 위치를 기록했어요. 소비기한은 포장지에서 확인해 주세요.';assert.equal(detailFoodNote(note,'unknown',false,true),null);assert.equal(detailFoodNote(note,'unknown',false,false),note);});
test('specific purchase warning stays visible even with purchase details',()=>{const note='구매일과 보관 위치를 기록했어요. 소비기한은 포장지에서 확인해 주세요. 포장 훼손을 확인해 주세요.';assert.equal(detailFoodNote(note,'unknown',false,true),note);});

test('known label confirmation is not repeated beside a printed-date card',()=>{for(const particle of ['을','를'])assert.equal(detailFoodNote(`소비기한${particle} 포장지에서 확인했어요.`,'actual_printed',false),null);});
test('specific label warning is not mistaken for confirmation boilerplate',()=>{const note='소비기한을 포장지에서 확인했어요. 개봉 후에는 기간이 달라요.';assert.equal(detailFoodNote(note,'actual_printed',false),note);});

const shoppingReferenceNote='구매일을 기록했어요. 소비기한은 포장지에서 확인해 주세요. 먼저 볼 순서는 참고용이며, 먹어도 되는지를 판단하지 않아요.';
test('known shopping reference note is omitted only beside purchase details and estimated-date guidance',()=>{assert.equal(detailFoodNote(shoppingReferenceNote,'estimated_use_first',false,true),null);assert.equal(detailFoodNote(shoppingReferenceNote,'unknown',false,true),shoppingReferenceNote);assert.equal(detailFoodNote(shoppingReferenceNote,'estimated_use_first',false,false),shoppingReferenceNote);});
test('specific warning appended to shopping reference note remains visible',()=>{const note=shoppingReferenceNote+' 깨진 달걀은 따로 확인해 주세요.';assert.equal(detailFoodNote(note,'estimated_use_first',false,true),note);});
test('personal reminder boilerplate is omitted while specific user notes remain',()=>{
 assert.equal(detailFoodNote('직접 확인한 날짜를 기준으로 보여드려요.','user_confirmed',false),null);
 assert.equal(detailFoodNote('내가 정한 알림 날짜예요.','user_confirmed',false),null);
 assert.equal(detailFoodNote('주말 요리에 쓸 재료예요.','user_confirmed',false),'주말 요리에 쓸 재료예요.');
});
