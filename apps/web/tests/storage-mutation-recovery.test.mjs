import assert from "node:assert/strict";
import test from "node:test";
import { runStorageMutationRecovery } from "../src/storageMutationRecovery.ts";

test("restores, reconciles once, and keeps the same retry closure after a mutation failure", async () => {
  const events = [];
  let attempts = 0;
  let retry = null;
  let failure = null;

  await runStorageMutationRecovery({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore"),
    mutate: async () => {
      attempts += 1;
      events.push(`mutate:${attempts}`);
      if (attempts === 1) throw new Error("storage unavailable");
      return { statuses: ["not_configured"], inventory: null };
    },
    sync: async () => {
      events.push("sync");
      return true;
    },
    onSuccess: () => events.push("success"),
    onFailure: (error, nextRetry) => {
      failure = error;
      retry = nextRetry;
      events.push("failure");
    },
  });

  assert.match(failure?.message ?? "", /storage unavailable/);
  assert.deepEqual(events, ["apply", "mutate:1", "restore", "sync", "failure"]);
  assert.equal(typeof retry, "function");

  await retry();
  assert.equal(attempts, 2);
  assert.deepEqual(events, ["apply", "mutate:1", "restore", "sync", "failure", "apply", "mutate:2", "sync", "success"]);
});

test("does not register a failure retry when mutation succeeds but readback returns false", async () => {
  const events = [];
  let failureCalls = 0;
  let successResult = null;

  await runStorageMutationRecovery({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore"),
    mutate: async () => {
      events.push("mutate");
      return { statuses: ["queued"], inventory: [{ id: "child-lot" }] };
    },
    sync: async () => {
      events.push("sync");
      return false;
    },
    onSuccess: (result) => {
      successResult = result;
      events.push(`success:${result.synced}`);
    },
    onFailure: () => { failureCalls += 1; },
  });

  assert.deepEqual(events, ["apply", "mutate", "sync", "apply", "success:false"]);
  assert.equal(failureCalls, 0);
  assert.deepEqual(successResult?.value, { statuses: ["queued"], inventory: [{ id: "child-lot" }] });
});

test("does not restore the pre-reconciliation snapshot after a retry fails", async () => {
  const events = [];
  let attempts = 0;
  let retry = null;

  await runStorageMutationRecovery({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore-stale-snapshot"),
    mutate: async () => {
      attempts += 1;
      events.push(`mutate:${attempts}`);
      throw new Error(`failure:${attempts}`);
    },
    sync: async () => {
      events.push("sync-authoritative");
      return true;
    },
    onSuccess: () => events.push("success"),
    onFailure: (_error, nextRetry) => {
      retry = nextRetry;
      events.push("failure");
    },
  });

  assert.equal(typeof retry, "function");
  await retry();
  assert.deepEqual(events, [
    "apply",
    "mutate:1",
    "restore-stale-snapshot",
    "sync-authoritative",
    "failure",
    "apply",
    "mutate:2",
    "sync-authoritative",
    "failure",
  ]);
});

test("keeps the authoritative response when dashboard reconciliation throws", async () => {
  const events = [];
  const readbackError = new Error("dashboard unavailable");
  let successResult = null;

  await runStorageMutationRecovery({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore"),
    mutate: async () => {
      events.push("mutate");
      return { statuses: ["succeeded"], inventory: [{ id: "server-lot" }] };
    },
    sync: async () => {
      events.push("sync");
      throw readbackError;
    },
    onSuccess: (result) => {
      successResult = result;
      events.push(`success:${result.synced}`);
    },
    onFailure: () => { throw new Error("must not enter failure path"); },
  });

  assert.deepEqual(events, ["apply", "mutate", "sync", "apply", "success:false"]);
  assert.equal(successResult?.readbackError, readbackError);
  assert.deepEqual(successResult?.value.inventory, [{ id: "server-lot" }]);
});
