import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {FOOD_IMAGES,imageForFoodName,imageForKnownFoodName} from '../src/foodPhotos.ts';
for(const [name,key]of [['배추김치','kimchi'],['국산 감자','potato'],['양파','onion'],['대파','greenOnion'],['쪽파','greenOnion'],['두부','tofu'],['계란','eggs']])test(`${name} gets its food-specific photograph`,()=>assert.equal(imageForFoodName(name),FOOD_IMAGES[key]));
test('unknown names keep the generic marker without a fabricated known match',()=>{assert.equal(imageForKnownFoodName('검증 식품'),null);assert.equal(imageForFoodName('검증 식품'),FOOD_IMAGES.groceries);});
const source=readFileSync(new URL('../src/Prototype.tsx',import.meta.url),'utf8');const a=source.indexOf('const LEGACY_FOOD_IMAGES'),b=source.indexOf('function createDemoFoods',a),c=source.indexOf('function imageForApiFood('),d=source.indexOf('function parseReceiptQuantity(',c);
const apiPhoto=new Function('FOOD_IMAGES','imageForKnownFoodName',stripTypeScriptTypes(source.slice(a,b)+source.slice(c,d))+';return imageForApiFood;')(FOOD_IMAGES,imageForKnownFoodName);
test('known API food replaces an old generic app photo',()=>assert.equal(apiPhoto('김치',FOOD_IMAGES.groceries),FOOD_IMAGES.kimchi));
test('a supplied product photo remains authoritative',()=>assert.equal(apiPhoto('김치','https://example.invalid/product.jpg'),'https://example.invalid/product.jpg'));
