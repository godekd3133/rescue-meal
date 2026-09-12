import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorkspaceSyncTransport, WorkspaceSyncCoordinator } from "../src/workspaceSync.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("workspace switch makes an older response stale", async () => {
  const response = deferred();
  const coordinator = new WorkspaceSyncCoordinator(async () => "guest-a", "guest-a");

  const pending = coordinator.run("dashboard", () => response.promise);
  await flushMicrotasks();
  coordinator.setWorkspace("account-b");
  response.resolve({ workspace: "guest-a" });

  const result = await pending;
  assert.equal(result.current, false);
  assert.deepEqual(result.value, { workspace: "guest-a" });
  assert.equal(coordinator.currentWorkspaceKey, "account-b");
});

test("a newer request on the same channel supersedes an older request", async () => {
  const firstResponse = deferred();
  const coordinator = new WorkspaceSyncCoordinator(async () => "account-a", "account-a");

  const first = coordinator.run("shopping-list", () => firstResponse.promise);
  await flushMicrotasks();
  const second = coordinator.run("shopping-list", async () => ["new"]);
  const secondResult = await second;
  firstResponse.resolve(["old"]);
  const firstResult = await first;

  assert.equal(secondResult.current, true);
  assert.deepEqual(secondResult.value, ["new"]);
  assert.equal(firstResult.current, false);
});

test("explicit invalidation suppresses a pending read without changing workspace", async () => {
  const response = deferred();
  const coordinator = new WorkspaceSyncCoordinator(async () => "guest-a", "guest-a");

  const pending = coordinator.run("receipt-summaries", () => response.promise);
  await flushMicrotasks();
  coordinator.invalidate("receipt-summaries");
  response.reject(new Error("late failure"));

  const result = await pending;
  assert.equal(result.current, false);
  assert.equal(result.error?.message, "late failure");
});

test("a provider failure is returned as a current coordinator error", async () => {
  const coordinator = new WorkspaceSyncCoordinator(async () => {
    throw new Error("workspace-unavailable");
  }, "guest-a");

  const result = await coordinator.run("notifications", async () => ["never"]);
  assert.equal(result.current, true);
  assert.equal(result.workspaceKey, "guest-a");
  assert.equal(result.error?.message, "workspace-unavailable");
});

test("a newer provider failure still supersedes an older in-flight operation", async () => {
  const firstResponse = deferred();
  let providerCalls = 0;
  const coordinator = new WorkspaceSyncCoordinator(async () => {
    providerCalls += 1;
    if (providerCalls === 1) return "guest-a";
    throw new Error("new-workspace-unavailable");
  }, "guest-a");

  const first = coordinator.run("dashboard", () => firstResponse.promise);
  await flushMicrotasks();
  const second = coordinator.run("dashboard", async () => ["never"]);
  const secondResult = await second;
  firstResponse.resolve(["old"]);
  const firstResult = await first;

  assert.equal(secondResult.current, true);
  assert.equal(secondResult.error?.message, "new-workspace-unavailable");
  assert.equal(firstResult.current, false);
});

test("an older provider completion cannot clobber a newer workspace preparation", async () => {
  const firstProvider = deferred();
  const secondProvider = deferred();
  let providerCalls = 0;
  const coordinator = new WorkspaceSyncCoordinator(async () => {
    providerCalls += 1;
    return providerCalls === 1 ? firstProvider.promise : secondProvider.promise;
  }, "guest-a");

  const first = coordinator.run("dashboard", async () => ["old"]);
  const second = coordinator.run("dashboard", async () => ["new"]);

  secondProvider.resolve("account-b");
  const secondResult = await second;
  firstProvider.resolve("guest-a");
  const firstResult = await first;

  assert.equal(secondResult.current, true);
  assert.equal(secondResult.workspaceKey, "account-b");
  assert.equal(firstResult.current, false);
  assert.equal(coordinator.currentWorkspaceKey, "account-b");
});

test("a newer request aborts the older operation signal", async () => {
  let aborted = false;
  const coordinator = new WorkspaceSyncCoordinator(async () => "account-a", "account-a");
  const first = coordinator.run("inventory-search", (signal) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => {
      aborted = true;
      reject(Object.assign(new Error("request-aborted"), { name: "AbortError" }));
    }, { once: true });
  }));
  await flushMicrotasks();

  const second = coordinator.run("inventory-search", async () => ["new"]);
  const secondResult = await second;
  const firstResult = await first;

  assert.equal(aborted, true);
  assert.equal(secondResult.current, true);
  assert.equal(firstResult.current, false);
  assert.equal(firstResult.error?.name, "AbortError");
});

test("workspace transport delivers an opaque mutation invalidation across adapters", async (t) => {
  if (typeof BroadcastChannel !== "function") {
    t.skip("BroadcastChannel is unavailable");
    return;
  }
  const sender = createWorkspaceSyncTransport("tab-sender");
  const receiver = createWorkspaceSyncTransport("tab-receiver");
  try {
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("workspace-sync-timeout")), 500);
      const unsubscribe = receiver.subscribe((message) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(message);
      });
    });
    sender.publish("account-a", ["dashboard", "receipt-summaries"]);
    const message = await received;

    assert.equal(message.workspaceKey, "account-a");
    assert.deepEqual(message.channels, ["dashboard", "receipt-summaries"]);
    assert.equal(message.sourceId, "tab-sender");
    assert.equal("accessToken" in message, false);
  } finally {
    sender.close();
    receiver.close();
  }
});

test("workspace transport delivers a shared recipe catalog invalidation", async (t) => {
  if (typeof BroadcastChannel !== "function") {
    t.skip("BroadcastChannel is unavailable");
    return;
  }
  const sender = createWorkspaceSyncTransport("recipe-sender");
  const receiver = createWorkspaceSyncTransport("recipe-receiver");
  try {
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("recipe-review-sync-timeout")), 500);
      const unsubscribe = receiver.subscribe((message) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(message);
      });
    });
    sender.publish("recipe-catalog", ["recipe-review"]);
    const message = await received;
    assert.equal(message.workspaceKey, "recipe-catalog");
    assert.deepEqual(message.channels, ["recipe-review"]);
    assert.equal("accessToken" in message, false);
  } finally {
    sender.close();
    receiver.close();
  }
});
