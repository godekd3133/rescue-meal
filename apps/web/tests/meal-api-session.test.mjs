import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

let moduleSequence = 0;
const response = (body, status = 200, revision) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", ...(revision ? { "X-Rescue-Meal-Workspace-Revision": String(revision) } : {}) },
});
const session = (name) => ({ mode: "account", access_token: `ra1.user-${name}.session-${name}.fake` });
const input = { canonical_name: "fixture food", quantity: 1, unit: "개", storage_type: "refrigerated", category: "기타", note: "fixture" };
const defer = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };

async function loadClient(t, fetcher) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout, clearTimeout,
  } });
  t.after(() => previousWindow ? Object.defineProperty(globalThis, "window", previousWindow) : delete globalThis.window);
  t.mock.method(globalThis, "fetch", fetcher);
  const source = await readFile(new URL("../src/mealApi.ts", import.meta.url), "utf8");
  const javascript = stripTypeScriptTypes(source)
    .replace(/import\s*\{[^}]*broadcastWorkspaceMutation[^}]*\}\s*from\s*["']\.\/workspaceSync["'];?/, "const broadcastWorkspaceMutation = () => undefined;")
    .replaceAll("import.meta.env", '({VITE_API_BASE_URL:"http://fixture.invalid",VITE_DEPLOYMENT_MODE:"demo",PROD:false})');
  return import(`data:text/javascript;base64,${Buffer.from(javascript + `\n// fixture ${++moduleSequence}`).toString("base64")}`);
}

test("a late write does not update the new account's revision", async (t) => {
  const pending = defer();
  const client = await loadClient(t, async (url, init) => {
    if (url.endsWith("/api/auth/login")) return response(session(JSON.parse(init.body).email));
    return pending.promise;
  });
  await client.mealApi.loginAccount({ email: "a", password: "fixture" });
  const writing = client.mealApi.createManualFood(input);
  await new Promise(setImmediate);
  await client.mealApi.loginAccount({ email: "b", password: "fixture" });
  pending.resolve(response({ id: "a-food" }, 200, 99));
  await assert.rejects(writing, { name: "MealApiSessionChangedError" });
  assert.equal(client.mealApi.workspaceRevision, null);
  assert.equal(client.mealApi.workspaceMutationRevision, null);
  assert.equal(client.mealApi.workspaceKey, "account-session-b");
});

test("a network retry cannot submit the old payload under a new account", async (t) => {
  const pending = defer();
  const headers = [];
  const client = await loadClient(t, async (url, init) => {
    if (url.endsWith("/api/auth/login")) return response(session(JSON.parse(init.body).email));
    headers.push(new Headers(init.headers).get("Authorization"));
    return pending.promise;
  });
  await client.mealApi.loginAccount({ email: "a", password: "fixture" });
  const writing = client.mealApi.createManualFood({ ...input, idempotencyKey: "fixture-write" });
  await new Promise(setImmediate);
  await client.mealApi.loginAccount({ email: "b", password: "fixture" });
  pending.reject(new TypeError("fixture network interruption"));
  await assert.rejects(writing, { name: "MealApiSessionChangedError" });
  assert.deepEqual(headers, ["Bearer ra1.user-a.session-a.fake"]);
});

test("a pending guest bootstrap cannot overwrite an explicit login", async (t) => {
  const guest = defer();
  const client = await loadClient(t, async (url) => url.endsWith("/api/auth/guest") ? guest.promise : response(session("b")));
  const preparing = client.mealApi.prepareWorkspace();
  await new Promise(setImmediate);
  await client.mealApi.loginAccount({ email: "b", password: "fixture" });
  guest.resolve(response({ access_token: "rm1.old-guest.fake" }));
  await assert.rejects(preparing, { name: "MealApiSessionChangedError" });
  assert.equal(client.mealApi.workspaceKey, "account-session-b");
});

test("the latest login intent wins even when an earlier response arrives last", async (t) => {
  const earlier = defer();
  const client = await loadClient(t, async (url, init) => JSON.parse(init.body).email === "a" ? earlier.promise : response(session("b")));
  const first = client.mealApi.loginAccount({ email: "a", password: "fixture" });
  await client.mealApi.loginAccount({ email: "b", password: "fixture" });
  earlier.resolve(response(session("a")));
  await assert.rejects(first, { name: "MealApiSessionChangedError" });
  assert.equal(client.mealApi.workspaceKey, "account-session-b");
});

test("an expired guest session is reported without silently creating a new workspace", async (t) => {
  let guestCalls = 0;
  const client = await loadClient(t, async (url) => {
    if (url.endsWith("/api/auth/guest")) { guestCalls += 1; return response({ access_token: "rm1.guest-a.fake" }); }
    return response({ detail: "fixture expired" }, 401);
  });
  await client.mealApi.prepareWorkspace();
  await assert.rejects(client.mealApi.createManualFood(input), (error) => error.status === 401);
  assert.equal(guestCalls, 1);
  assert.equal(client.mealApi.workspaceKey, "guest-guest-a");
});

test("a late password-reset session cannot replace a newer login", async (t) => {
  const resetting = defer();
  const client = await loadClient(t, async (url) => url.endsWith("/complete") ? resetting.promise : response(session("b")));
  const oldReset = client.mealApi.completePasswordReset("fixture-reset-token", "fixture-password");
  await client.mealApi.loginAccount({ email: "b", password: "fixture" });
  resetting.resolve(response(session("a")));
  await assert.rejects(oldReset, { name: "MealApiSessionChangedError" });
  assert.equal(client.mealApi.workspaceKey, "account-session-b");
});

test("a later login remains authoritative over an earlier password-change response", async (t) => {
  const changing = defer();
  const client = await loadClient(t, async (url, init) => {
    if (url.endsWith("/change")) return changing.promise;
    return response(session(JSON.parse(init.body).email));
  });
  await client.mealApi.loginAccount({ email: "a", password: "fixture" });
  const oldChange = client.mealApi.changePassword({ current_password: "fixture", new_password: "fixture-new" });
  await new Promise(setImmediate);
  await client.mealApi.loginAccount({ email: "b", password: "fixture" });
  changing.resolve(response(session("a-renewed")));
  await assert.rejects(oldChange, { name: "MealApiSessionChangedError" });
  assert.equal(client.mealApi.workspaceKey, "account-session-b");
});

test("an ordinary idempotent retry keeps the same account and request key", async (t) => {
  const attempts = [];
  const client = await loadClient(t, async (url, init) => {
    if (url.endsWith("/api/auth/login")) return response(session("a"));
    attempts.push({ authorization: new Headers(init.headers).get("Authorization"), key: new Headers(init.headers).get("Idempotency-Key") });
    if (attempts.length === 1) throw new TypeError("fixture retryable interruption");
    return response({ id: "a-food" });
  });
  await client.mealApi.loginAccount({ email: "a", password: "fixture" });
  const value = await client.mealApi.createManualFood({ ...input, idempotencyKey: "same-write" });
  assert.equal(value.id, "a-food");
  assert.deepEqual(attempts, [
    { authorization: "Bearer ra1.user-a.session-a.fake", key: "same-write" },
    { authorization: "Bearer ra1.user-a.session-a.fake", key: "same-write" },
  ]);
});

test("reads and failed writes cannot acknowledge an own mutation revision", async (t) => {
  const client = await loadClient(t, async (url, init) => {
    if (url.endsWith('/api/auth/login')) return response(session('revision'));
    if (init.method === 'PUT') return response({detail:'write unavailable'},503,9);
    return response({lead_days:2},200,8);
  });
  await client.mealApi.loginAccount({email:'revision',password:'fixture'});
  await client.mealApi.getNotificationPreferences();
  assert.equal(client.mealApi.workspaceRevision,8);
  assert.equal(client.mealApi.workspaceMutationRevision,null);
  await assert.rejects(client.mealApi.updateNotificationPreferences({lead_days:3}));
  assert.equal(client.mealApi.workspaceMutationRevision,null);
});

test("successful setting writes acknowledge their revision and session changes clear it", async (t) => {
  const client = await loadClient(t, async (url, init) => url.endsWith('/api/auth/login') ? response(session(JSON.parse(init.body).email)) : response({lead_days:3},200,init.method === 'PUT' ? 9 : 10));
  await client.mealApi.loginAccount({email:'first',password:'fixture'});
  await client.mealApi.updateNotificationPreferences({lead_days:3});
  assert.equal(client.mealApi.workspaceMutationRevision,9);
  await client.mealApi.getNotificationPreferences();
  assert.equal(client.mealApi.workspaceRevision,10);
  assert.equal(client.mealApi.workspaceMutationRevision,9);
  await client.mealApi.loginAccount({email:'second',password:'fixture'});
  assert.equal(client.mealApi.workspaceMutationRevision,null);
});

test("clearing a contents reference uses DELETE and acknowledges the saved revision", async (t) => {
  let submitted;
  const client = await loadClient(t, async (url, init) => {
    if (url.endsWith("/api/auth/login")) return response(session("contents"));
    submitted = { url, method: init.method, body: init.body };
    return response({ id: "food/one", quantity_reference: null }, 200, 12);
  });
  await client.mealApi.loginAccount({ email: "contents", password: "fixture" });
  const result = await client.mealApi.updateQuantityReference("food/one", null);
  assert.equal(result.quantity_reference, null);
  assert.equal(submitted.url, "http://fixture.invalid/api/foods/food%2Fone/quantity-reference");
  assert.equal(submitted.method, "DELETE");
  assert.equal(submitted.body, undefined);
  assert.equal(client.mealApi.workspaceMutationRevision, 12);
});

test("an already recorded purchase is a review conflict, not a retryable write", async (t) => {
  let writes = 0;
  const client = await loadClient(t, async (url) => {
    if (url.endsWith('/api/auth/login')) return response(session('purchase'));
    writes += 1;
    return response({detail:{code:'shopping_purchase_already_received',detail:'이미 식품 목록에 추가한 구매예요.'}},409);
  });
  await client.mealApi.loginAccount({email:'purchase',password:'fixture'});
  await assert.rejects(client.mealApi.receiveShoppingListItem('item',2,'refrigerated','fixture-key',null), error => {
    assert.equal(client.isMealApiShoppingPurchaseRecordedError(error),true);
    assert.equal(error.retryable,false);
    return true;
  });
  assert.equal(writes,1);
  assert.equal(client.mealApi.workspaceMutationRevision,null);
});

test('saved stock preview pins the selected recipe and stored serving count',async(t)=>{
 let payload;
 const client=await loadClient(t,async(url,init)=>{
  if(url.endsWith('/api/auth/login'))return response(session('stock-preview'));
  payload=JSON.parse(init.body);
  return response({id:'new-preview',recipe_id:'saved-recipe',servings:2,saved_at:null});
 });
 await client.mealApi.loginAccount({email:'stock-preview',password:'fixture'});
 const preview=await client.mealApi.previewMealPlan(['current-lot','new-lot'],30,'/api/meal-plans/preview',2,undefined,'saved-recipe');
 assert.deepEqual(payload,{inventory_ids:['current-lot','new-lot'],max_minutes:30,servings:2,recipe_id:'saved-recipe'});
 assert.equal(preview.saved_at,null);
});
