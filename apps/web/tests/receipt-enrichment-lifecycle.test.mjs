import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../src/AddFoodSheet.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const enqueueReceiptProductEnrichment =');
const end = source.indexOf('  const updateBarcodeInput', start);
assert.ok(start >= 0 && end > start);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const requests = [], state = { job: null, error: '', lines: ['user edit'] };
  const values = {
    receiptDraftId: 'first', receiptDraftIdRef: { current: 'first' },
    receiptIdentityGeneration: { current: 1 }, receiptEnrichmentRequest: { current: 0 },
    receiptSubmittingRef: { current: false }, receiptSaveUncertainRef: { current: false },
    mealApi: { isConfigured: true },
    setProductEnrichmentError: value => { state.error = value; },
    setProductEnrichmentJob: value => { state.job = value; },
    setReceiptLines: update => { state.lines = update(state.lines); },
    mapReceiptDraftLines: draft => draft.lines,
    mergeReceiptDraftLines: (current, incoming) => [...current, ...incoming],
    storageFromApi: () => {}, imageForFoodName: () => {},
    isMealApiProductEnrichmentPersistenceError: () => false,
  };
  for (const method of ['enqueueProductEnrichment', 'retryProductEnrichment', 'getReceiptDraft']) {
    values.mealApi[method] = () => { const d = deferred(); requests.push({ ...d, method }); return d.promise; };
  }
  const env = new Proxy(values, { has: () => true, get: (o, k) => k === Symbol.unscopables ? undefined : o[k] });
  const actions = new Function('env', `with(env){${stripTypeScriptTypes(source.slice(start, end))};return {enqueue:enqueueReceiptProductEnrichment,retry:retryReceiptProductEnrichment};}`)(env);
  return { ...actions, values, requests, state };
}
test('new receipt discards an old enqueue result', async () => {
  const x = setup(), pending = x.enqueue();
  x.values.receiptIdentityGeneration.current++;
  x.requests[0].resolve({ status: 'queued' }); await pending;
  assert.equal(x.state.job, null);
});
test('closing receipt discards a late failure', async () => {
  const x = setup(), pending = x.enqueue();
  x.values.receiptIdentityGeneration.current++;
  x.requests[0].reject(new Error('late')); await pending;
  assert.equal(x.state.error, '');
});
test('draft refresh cannot replace the next receipt after enqueue succeeds', async () => {
  const x = setup(), pending = x.enqueue();
  x.requests[0].resolve({ status: 'succeeded' }); await Promise.resolve();
  assert.equal(x.requests[1].method, 'getReceiptDraft');
  x.values.receiptDraftIdRef.current = 'second';
  x.requests[1].resolve({ lines: ['old receipt'] }); await pending;
  assert.deepEqual(x.state.lines, ['user edit']);
});
test('newer retry wins over an older enqueue', async () => {
  const x = setup(), first = x.enqueue(), second = x.retry();
  x.requests[1].resolve({ status: 'in_flight' }); await second;
  x.requests[0].resolve({ status: 'queued' }); await first;
  assert.equal(x.state.job.status, 'in_flight');
});
test('retry from an old receipt does not show its error', async () => {
  const x = setup(), pending = x.retry();
  x.values.receiptDraftIdRef.current = 'second';
  x.requests[0].resolve(null); await pending;
  assert.equal(x.state.error, '');
});
test('current receipt refresh merges with current edits', async () => {
  const x = setup(), pending = x.enqueue();
  x.requests[0].resolve({ status: 'succeeded' }); await Promise.resolve();
  x.requests[1].resolve({ lines: ['current enrichment'] }); await pending;
  assert.deepEqual(x.state.lines, ['user edit', 'current enrichment']);
});
test('save with uncertain outcome blocks enrichment from changing rows', async () => {
  const x = setup(), pending = x.enqueue();
  x.requests[0].resolve({ status: 'succeeded' }); await Promise.resolve();
  x.values.receiptSaveUncertainRef.current = true;
  x.requests[1].resolve({ lines: ['enrichment'] }); await pending;
  assert.deepEqual(x.state.lines, ['user edit']);
});
