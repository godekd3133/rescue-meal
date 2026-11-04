import test from 'node:test';
import assert from 'node:assert/strict';
import { quantityReferenceUnit, quantityReferenceRecoveryLabel } from '../src/quantityReferenceRecovery.ts';
test('the planner asks for the amount in one pack rather than the remaining pack count', () => {
  assert.equal(quantityReferenceRecoveryLabel({name:'양배추',quantity:'2팩'}),'양배추 1팩의 양 입력');
});
test('an explicit stored unit takes precedence over a display annotation', () => {
  assert.equal(quantityReferenceRecoveryLabel({name:'양파',quantity:'3팩(200g)',quantityUnit:'팩'}),'양파 1팩의 양 입력');
});
test('count units identify the same per-unit field as the reference editor', () => {
  assert.equal(quantityReferenceRecoveryLabel({name:'우유',quantity:'2개'}),'우유 1개의 양 입력');
  assert.equal(quantityReferenceUnit({quantity:'2개'}),'개');
});
test('measured mass and volume do not offer a nonexistent reference input', () => {
  for (const unit of ['g','kg','ml','L','그램','리터']) {
    assert.equal(quantityReferenceUnit({quantity:`1.1234${unit}`}),null);
    assert.equal(quantityReferenceRecoveryLabel({name:'식품',quantity:`1.1234${unit}`}), '식품 수량 확인');
  }
});
test('unreadable quantities offer confirmation rather than an invented package', () => {
  assert.equal(quantityReferenceRecoveryLabel({name:'식품',quantity:'알 수 없음'}),'식품 수량 확인');
});
