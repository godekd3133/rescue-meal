import test from 'node:test';import assert from 'node:assert/strict';import {shouldShowHomeDateGuide} from '../src/homeReviewSummary.ts';
test('confirmed printed dates alone do not get a non-expiry estimate message',()=>assert.equal(shouldShowHomeDateGuide(0,['actual_printed']),false));
test('an estimate among displayed foods retains the reference boundary',()=>assert.equal(shouldShowHomeDateGuide(0,['actual_printed','estimated_use_first']),true));
test('required date or storage review retains the home recovery card',()=>{assert.equal(shouldShowHomeDateGuide(1,['actual_printed']),true);assert.equal(shouldShowHomeDateGuide(2,['unknown']),true);});
test('empty records and user reminders do not claim to be model estimates',()=>{assert.equal(shouldShowHomeDateGuide(0,[]),false);assert.equal(shouldShowHomeDateGuide(0,['user_confirmed']),false);});
