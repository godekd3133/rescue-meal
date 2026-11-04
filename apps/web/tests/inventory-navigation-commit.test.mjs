import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../src/Prototype.tsx', import.meta.url), 'utf8');
const start = source.search(/  use(?:Layout)?Effect\(\(\) => \{\n    if \(inventoryNavTailSpace <= 0/);
const end = source.indexOf('  }, [inventoryNavTailSpace]);', start) + '  }, [inventoryNavTailSpace]);'.length;
assert.ok(start >= 0 && end > start);
function register(destination = 'food') {
  const state = { layout: [], passive: [], moves: [], scroll: { scrollTop: 421 }, screen: { scrollTop: 0 } };
  const env = {
    useLayoutEffect: (fn) => state.layout.push(fn), useEffect: (fn) => state.passive.push(fn),
    inventoryNavTailSpace: 452, activeContentNavRef: { current: destination },
    navigationIntentLastScrollTopRef: { current: 421 },
    inventoryStickyInset: () => 34,
    document: { querySelector: (selector) => selector.includes('device-screen') ? state.screen : selector.includes('inventory-section') ? {} : state.scroll },
    scrollTargetWithinContainer: (scroll, inventory, block, behavior, inset) => {
      state.moves.push({ block, behavior, inset }); scroll.scrollTop = 872;
    },
  };
  new Function('env', `with(env){${stripTypeScriptTypes(source.slice(start,end))}}`)(env);
  return { state, env };
}
test('committed spacer aligns before the scroll observer can misclassify its temporary clamp', () => {
  const { state, env } = register();
  state.layout.forEach((fn) => fn());
  assert.equal(state.scroll.scrollTop, 872);
  assert.equal(env.navigationIntentLastScrollTopRef.current, 872);
  assert.deepEqual(state.moves, [{ block: 'start', behavior: 'auto', inset: 34 }]);
  assert.equal(state.passive.length, 0);
});
test('a committed old spacer cannot pull the user back after they chose Home', () => {
  const { state } = register('home');
  state.layout.forEach((fn) => fn());
  assert.deepEqual(state.moves, []);
});
