import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../src/appScroll.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace(/export /g, ''));
const { targetScrollTop, scrollTargetWithinContainer } = new Function(`${code}; return { targetScrollTop, scrollTargetWithinContainer };`)();
function scene(scale = 1, top = 100, inset = 32) {
  const rect = { top, height: 800 * scale, bottom: top + 800 * scale };
  const scroll = { clientHeight: 800, scrollHeight: 2000, scrollTop: 200,
    getBoundingClientRect: () => rect, scrollTo: (value) => { scroll.movement = value; } };
  const target = { getBoundingClientRect: () => ({ top: top + 300 * scale, height: 200 * scale, bottom: top + 500 * scale }) };
  return { scroll, target, inset };
}
test('inventory start leaves the sticky safe-area inset above its toolbar', () => {
  const { scroll, target, inset } = scene();
  assert.equal(targetScrollTop(scroll, target, 'start', inset), 468);
});
test('phone frame scaling does not scale an inset already expressed in CSS pixels', () => {
  const { scroll, target, inset } = scene(0.6);
  assert.equal(targetScrollTop(scroll, target, 'start', inset), 468);
});
test('scroll write uses the same inset as the tail-space calculation', () => {
  const { scroll, target, inset } = scene();
  scrollTargetWithinContainer(scroll, target, 'start', 'auto', inset);
  assert.deepEqual(scroll.movement, { top: 468, behavior: 'auto' });
});
test('default start alignment and other blocks keep their existing positions', () => {
  const { scroll, target } = scene();
  assert.equal(targetScrollTop(scroll, target, 'start'), 500);
  assert.equal(targetScrollTop(scroll, target, 'center', 32), 200);
  assert.equal(targetScrollTop(scroll, target, 'end', 32), -100);
});
test('an inset cannot scroll outside the container bounds', () => {
  const { scroll, target } = scene();
  scrollTargetWithinContainer(scroll, target, 'start', 'auto', 600);
  assert.deepEqual(scroll.movement, { top: 0, behavior: 'auto' });
});
