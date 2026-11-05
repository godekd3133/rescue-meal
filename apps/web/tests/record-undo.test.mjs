import assert from "node:assert/strict";
import test from "node:test";
import { createUndoRegistry, storageEventIsUndoable } from "../src/recordUndo.ts";

test("concurrent undo taps share one compensating request", async () => {
  const registry = createUndoRegistry();
  let calls = 0;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const operation = async () => { calls += 1; await held; return "restored"; };
  const first = registry.run("storage-event:a", operation);
  const second = registry.run("storage-event:a", operation);
  assert.equal(registry.state("storage-event:a"), "running");
  release();
  assert.deepEqual(await Promise.all([first, second]), ["restored", "restored"]);
  assert.equal(calls, 1);
  assert.equal(registry.state("storage-event:a"), "done");
  // A finished undo cannot run again.
  await registry.run("storage-event:a", operation);
  assert.equal(calls, 1);
});

test("a failed undo is forgotten so the person can retry", async () => {
  const registry = createUndoRegistry();
  let calls = 0;
  await assert.rejects(registry.run("food-create:x", async () => { calls += 1; throw new Error("offline"); }));
  assert.equal(registry.state("food-create:x"), "idle");
  assert.equal(await registry.run("food-create:x", async () => { calls += 1; return "ok"; }), "ok");
  assert.equal(calls, 2);
});

test("undo keys are independent", async () => {
  const registry = createUndoRegistry();
  await registry.run("a", async () => 1);
  assert.equal(registry.state("b"), "idle");
});

test("only changes that never reached an external inventory are undoable", () => {
  assert.equal(storageEventIsUndoable([]), true);
  assert.equal(storageEventIsUndoable(["not_configured"]), true);
  assert.equal(storageEventIsUndoable([undefined]), true);
  assert.equal(storageEventIsUndoable(["queued"]), false);
  assert.equal(storageEventIsUndoable(["not_configured", "synced"]), false);
});
