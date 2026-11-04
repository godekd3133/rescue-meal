import test from 'node:test';import assert from 'node:assert/strict';import {displayFoodBrand,foodIdentityParts,productInfoDraftChanged} from '../src/foodBrandPresentation.ts';
test('legacy input-source placeholders are not displayed as brands',()=>{assert.equal(displayFoodBrand('직접 추가한 식품'),'');assert.equal(displayFoodBrand('장보기에서 추가한 식품'),'');});
test('actual brands remain visible',()=>assert.equal(displayFoodBrand('풀무원'),'풀무원'));
test('a real brand containing similar words is not broadly hidden',()=>assert.equal(displayFoodBrand('직접 만든 식품 브랜드'),'직접 만든 식품 브랜드'));
test('empty optional brand stays empty',()=>assert.equal(displayFoodBrand('  '),''));

test('actual brand and shopping origin are separate facts',()=>assert.deepEqual(foodIdentityParts('풀무원','shopping_list'),['풀무원','장보기']));
test('legacy shopping placeholder is replaced by meaningful origin only',()=>assert.deepEqual(foodIdentityParts('장보기에서 추가한 식품','shopping_list'),['장보기']));
test('receipt origin remains available with no brand',()=>assert.deepEqual(foodIdentityParts('','receipt'),['영수증']));

const original={name:'두부',brand:'풀무원',category:'콩류'};
test('unchanged product values do not request a save',()=>assert.equal(productInfoDraftChanged(original,{...original}),false));
for(const [field,value]of [['name','국산 두부'],['brand','다른 브랜드'],['category','기타']])test(`${field} change enables a real product edit`,()=>assert.equal(productInfoDraftChanged(original,{...original,[field]:value}),true));
test('a hidden legacy placeholder does not become a false brand change',()=>assert.equal(productInfoDraftChanged({...original,brand:'직접 추가한 식품'},{...original,brand:''}),false));
test('trimmed values do not fabricate a change',()=>assert.equal(productInfoDraftChanged(original,{name:' 두부 ',brand:' 풀무원 ',category:' 콩류 '}),false));
