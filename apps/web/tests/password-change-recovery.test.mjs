import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { validatePasswordChange } from "../src/passwordChangeValidation.ts";

const source = readFileSync(new URL("../src/AccountSheet.tsx", import.meta.url), "utf8");
const panel = source.slice(source.indexOf("function PasswordChangePanel()"), source.indexOf("function AccountDeletionPanel("));
const submitCode = panel.slice(panel.indexOf("  const submit = async () => {"), panel.indexOf("\n  return ("));
const closeCode = panel.slice(panel.indexOf("  const close = () => {"), panel.indexOf("  const submit = async () => {"));
class MealApiError extends Error { constructor(status) { super("request failed"); this.status = status; } }

function setup({ busy = false, current = "existing-password", next = "replacement-password", confirm = next, reject = null } = {}) {
  const calls = [], state = { current, next, confirm };
  const values = {
    busy, currentPassword: current, newPassword: next, confirmPassword: confirm,
    keyboard: { hide: () => calls.push(["hide"]) }, validatePasswordChange, MealApiError,
    mealApi: { changePassword: async (payload) => { calls.push(["request", payload]); if (reject) throw reject; return { workspace_id: "account" }; } },
    setFailure: (value) => { state.failure = value; },
    setCurrentPassword: (value) => { state.current = value; },
    setNewPassword: (value) => { state.next = value; },
    setConfirmPassword: (value) => { state.confirm = value; },
    setBusy: (value) => { state.busy = value; },
    setOpen: (value) => { state.open = value; },
    setNotice: (value) => { state.notice = value; },
  };
  const compile = (code, name) => new Function(...Object.keys(values), stripTypeScriptTypes(code) + `;return ${name};`)(...Object.values(values));
  return { calls, state, submit: compile(submitCode, "submit"), close: compile(closeCode, "close") };
}

for (const [current, next, confirm, field] of [
  ["short", "replacement-password", "replacement-password", "current"],
  ["existing-password", "short", "short", "new"],
  ["existing-password", "replacement-password", "different-password", "confirm"],
  ["existing-password", "existing-password", "existing-password", "new"],
]) test(`invalid ${field} entry does not call the password API`, async () => {
  const context = setup({ current, next, confirm });
  await context.submit();
  assert.equal(context.state.failure.field, field);
  assert.equal(context.calls.some(([name]) => name === "request"), false);
});

for (const status of [401, 429, 503]) test(`${status} failure retains the entered passwords and identifies only a rejected current password`, async () => {
  const context = setup({ reject: new MealApiError(status) });
  await context.submit();
  assert.equal(context.state.failure.field, status === 401 ? "current" : null);
  assert.equal(context.state.current, "existing-password");
  assert.equal(context.state.next, "replacement-password");
  assert.equal(context.state.confirm, "replacement-password");
  assert.equal(context.state.busy, false);
  assert.equal(context.state.open, undefined);
});

test("success submits the exact passwords and clears all three fields", async () => {
  const context = setup({ current: " existing-password ", next: " replacement-password " });
  await context.submit();
  assert.deepEqual(context.calls.find(([name]) => name === "request")[1], { current_password: " existing-password ", new_password: " replacement-password " });
  assert.equal(context.state.open, false);
  assert.equal(context.state.current + context.state.next + context.state.confirm, "");
});

test("explicit close clears sensitive drafts and an in-flight change cannot close or resubmit", async () => {
  const context = setup(); context.close();
  assert.equal(context.state.open, false);
  assert.equal(context.state.current + context.state.next + context.state.confirm, "");
  const busy = setup({ busy: true }); busy.close(); await busy.submit();
  assert.deepEqual(busy.calls, []);
  assert.equal(busy.state.current, "existing-password");
});

test("error focus targets its own field and service errors target the alert within the app", () => {
  const effectStart = panel.indexOf("    if (!open || !failure) return;");
  const effectEnd = panel.indexOf("\n  }, [failure, open]);", effectStart);
  assert.ok(effectStart > 0 && effectEnd > effectStart);
  for (const field of ["current", "new", "confirm", null]) {
    const calls = [];
    const refs = { currentInputRef: { current: "current" }, newInputRef: { current: "new" }, confirmInputRef: { current: "confirm" }, failureRef: { current: "alert" } };
    const values = { open: true, failure: { field }, ...refs, window: { requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame: () => {} }, revealAndFocusWithinNearestContainer: (target) => calls.push(target) };
    new Function(...Object.keys(values), panel.slice(effectStart, effectEnd))(...Object.values(values));
    assert.deepEqual(calls, [field ?? "alert"]);
  }
});
