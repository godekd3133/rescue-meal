import assert from 'node:assert/strict';import test from 'node:test';import {receiptResumeDisposition} from '../src/receiptResumePresentation.ts';
test('committed stock is not offered for duplicate intake',()=>assert.equal(receiptResumeDisposition({status:'committed',stock_created:true}),'saved'));
test('only pending review without stock may resume',()=>assert.equal(receiptResumeDisposition({status:'review_required',stock_created:false}),'review'));
test('an unavailable or cancelled draft does not masquerade as a review',()=>assert.equal(receiptResumeDisposition({status:'cancelled',stock_created:false}),'unavailable'));
test('a missing response does not produce an editable empty draft',()=>assert.equal(receiptResumeDisposition(null),'unavailable'));
