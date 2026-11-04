import test from 'node:test';import assert from 'node:assert/strict';import {recipeLicenseLabel} from '../src/recipeReviewPresentation.ts';
test('review-required source terms are readable without machine code',()=>assert.equal(recipeLicenseLabel('public-api-terms-review-required'),'이용 조건 확인 필요'));
test('a declared standard license remains precise',()=>assert.equal(recipeLicenseLabel('CC BY 4.0'),'CC BY 4.0'));
test('missing terms are not shown as confirmed permission',()=>assert.equal(recipeLicenseLabel('unknown'),'이용 조건 미확인'));
