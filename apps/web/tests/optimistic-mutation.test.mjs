import assert from "node:assert/strict";
import test from "node:test";
import { runOptimisticMutation } from "../src/optimisticMutation.ts";

test("restores the snapshot when an optimistic mutation fails", async () => {
  const events = [];

  await assert.rejects(() => runOptimisticMutation({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore"),
    mutate: async () => { events.push("mutate"); throw new Error("persistence unavailable"); },
    sync: async () => { events.push("sync"); return true; },
  }), /persistence unavailable/);

  assert.deepEqual(events, ["apply", "mutate", "restore"]);
});

test("reapplies optimistic state when a successful mutation readback fails", async () => {
  const events = [];
  const result = await runOptimisticMutation({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore"),
    mutate: async () => { events.push("mutate"); return { event: "stored" }; },
    sync: async () => { events.push("sync"); return false; },
  });

  assert.deepEqual(events, ["apply", "mutate", "sync", "apply"]);
  assert.deepEqual(result.value, { event: "stored" });
  assert.equal(result.synced, false);
  assert.equal(result.readbackError, undefined);
});

test("keeps optimistic state when the readback throws after success", async () => {
  const readbackError = new Error("dashboard unavailable");
  const events = [];
  const result = await runOptimisticMutation({
    applyOptimistic: () => events.push("apply"),
    restore: () => events.push("restore"),
    mutate: async () => "stored",
    sync: async () => { throw readbackError; },
  });

  assert.deepEqual(events, ["apply", "apply"]);
  assert.equal(result.value, "stored");
  assert.equal(result.synced, false);
  assert.equal(result.readbackError, readbackError);
});
