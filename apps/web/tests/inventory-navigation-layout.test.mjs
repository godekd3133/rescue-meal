import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredInventoryTailSpace } from '../src/inventoryNavigationLayout.ts';
test('short inventory receives enough room to align below its sticky inset', () => {
  assert.equal(requiredInventoryTailSpace({ desiredTop: 842, scrollHeight: 1566, clientHeight: 904, currentTailSpace: 0 }), 180);
});
test('reselecting food does not mistake its old spacer for real list height', () => {
  assert.equal(requiredInventoryTailSpace({ desiredTop: 842, scrollHeight: 1746, clientHeight: 904, currentTailSpace: 180 }), 180);
});
test('a shorter filtered list grows the spacer instead of drifting down', () => {
  assert.equal(requiredInventoryTailSpace({ desiredTop: 842, scrollHeight: 1566, clientHeight: 904, currentTailSpace: 180 }), 360);
});
test('a longer list no longer needs the old spacer', () => {
  assert.equal(requiredInventoryTailSpace({ desiredTop: 842, scrollHeight: 2200, clientHeight: 904, currentTailSpace: 180 }), 0);
});
test('fractional layout measurements leave enough whole CSS pixels', () => {
  assert.equal(requiredInventoryTailSpace({ desiredTop: 842.4, scrollHeight: 1566, clientHeight: 904, currentTailSpace: 0 }), 181);
});
