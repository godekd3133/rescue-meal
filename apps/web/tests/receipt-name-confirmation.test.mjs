import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../src/AddFoodSheet.tsx',import.meta.url),'utf8');const a=source.indexOf('  const handleLineChange ='),b=source.indexOf('  const confirmLine =',a),c=source.indexOf('  const enrichmentCallout',b);assert.ok(a>=0&&b>a&&c>b);
function setup(confirmed = [], lines = [], selectedIds = []) {
  const state = { confirmed, changes: [], focusSelector: null, scrollCount: 0 };
  const values = {
    candidateAppliedLineId: null, selectedIds, lines, userConfirmedLineIds: confirmed,
    window: { requestAnimationFrame: (callback) => callback() },
    reviewRef: { current: { querySelector: (selector) => ({
      hasAttribute: () => false,
      focus: () => { state.focusSelector = selector; },
    }) } },
    scrollTargetWithinNearestContainer: () => { state.scrollCount++; },
    getMobileScrollBehavior: () => 'auto',
    setUserConfirmedLineIds: (fn) => { state.confirmed = fn(state.confirmed); },
    setCandidateAppliedLineId: () => {}, setCandidateUserEditedLineId: () => {},
    onChange: (id, changes) => state.changes.push({ id, changes }),
  };
  const env = new Proxy(values, { has: () => true, get: (o, k) => k === Symbol.unscopables ? undefined : o[k] });
  const actions = new Function('env', `with(env){${stripTypeScriptTypes(source.slice(a,c))};return {edit:handleLineChange,confirm:confirmLine};}`)(env);
  return { state, ...actions };
}
test('storage change does not confirm a pending product name',()=>{const x=setup();x.edit('line',{storage:'냉장'});assert.deepEqual(x.state.confirmed,[]);assert.equal(x.state.changes[0].changes.storage,'냉장');});
test('quantity and unit changes do not confirm a pending product name',()=>{const x=setup();x.edit('line',{quantity:'2',unit:'팩'});assert.deepEqual(x.state.confirmed,[]);});
test('explicit confirmation verifies the reviewed line',()=>{const x=setup();x.confirm('line');assert.deepEqual(x.state.confirmed,['line']);});
test('editing a confirmed name requires it to be reviewed again',()=>{const x=setup(['line']);x.edit('line',{name:'다른 식품'});assert.deepEqual(x.state.confirmed,[]);});
test('quantity correction retains an already confirmed name',()=>{const x=setup(['line']);x.edit('line',{quantity:'3'});assert.deepEqual(x.state.confirmed,['line']);});

test('changing a matched name detaches previous provider matches',()=>{const x=setup(['line']);x.edit('line',{name:'새 상품'});assert.deepEqual(x.state.changes[0].changes,{name:'새 상품',requiresReview:true,matchSource:'unmatched',matchCandidates:[]});});
test('storage edit preserves the existing matching provenance',()=>{const x=setup(['line']);x.edit('line',{storage:'실온'});assert.deepEqual(x.state.changes[0].changes,{storage:'실온'});});

test('last confirmation retains focus on its product without moving the sheet', () => {
  const x = setup([], [{ id: 'last', requiresReview: true }], ['last']);
  x.confirm('last');
  assert.deepEqual(x.state.confirmed, ['last']);
  assert.equal(x.state.focusSelector, '[data-line-id="last"] .receipt-line-toggle');
  assert.equal(x.state.scrollCount, 0);
});
test('confirmation advances to the next selected unconfirmed product', () => {
  const x = setup(['done'], [
    { id: 'current', requiresReview: true }, { id: 'unselected', requiresReview: true },
    { id: 'done', requiresReview: true }, { id: 'automatic', requiresReview: false },
    { id: 'next', requiresReview: true },
  ], ['current', 'done', 'automatic', 'next']);
  x.confirm('current');
  assert.equal(x.state.focusSelector, '[data-line-id="next"] .receipt-line-toggle');
  assert.equal(x.state.scrollCount, 1);
});
