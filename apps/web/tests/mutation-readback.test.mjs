import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthoritativeMutationResponseError,
  runAuthoritativeMutation,
} from "../src/mutationReadback.ts";

test("applies the authoritative response before and after a failed readback", async () => {
  const events = [];
  const result = await runAuthoritativeMutation({
    operation: "date-assertion",
    mutate: async () => {
      events.push("mutate");
      return { value: "2026-09-30" };
    },
    apply: (value) => events.push(["apply", value.value]),
    sync: async () => {
      events.push("sync");
      return false;
    },
  });

  assert.deepEqual(events, ["mutate", ["apply", "2026-09-30"], "sync", ["apply", "2026-09-30"]]);
  assert.equal(result.value.value, "2026-09-30");
  assert.equal(result.synced, false);
  assert.equal(result.readbackError, undefined);
});

test("preserves the response when the readback throws", async () => {
  const applied = [];
  const readbackError = new Error("dashboard unavailable");
  const result = await runAuthoritativeMutation({
    operation: "product-info",
    mutate: async () => ({ name: "시금치" }),
    apply: (value) => applied.push(value.name),
    sync: async () => { throw readbackError; },
  });

  assert.deepEqual(applied, ["시금치", "시금치"]);
  assert.equal(result.synced, false);
  assert.equal(result.readbackError, readbackError);
});

test("treats an empty mutation response as a mutation failure", async () => {
  let applied = false;
  let synced = false;

  await assert.rejects(
    () => runAuthoritativeMutation({
      operation: "product-provenance",
      mutate: async () => null,
      apply: () => { applied = true; },
      sync: async () => { synced = true; return true; },
    }),
    (error) => error instanceof AuthoritativeMutationResponseError
      && error.operation === "product-provenance"
      && error.message === "product-provenance-empty-response",
  );
  assert.equal(applied, false);
  assert.equal(synced, false);
});
