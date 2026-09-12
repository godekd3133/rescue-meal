import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const WORKER_SOURCE = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://rescue.test";

function makeRequest(path, { destination = "script", method = "GET", mode = "same-origin" } = {}) {
  return {
    destination,
    method,
    mode,
    url: new URL(path, ORIGIN).href,
  };
}

function cacheKey(request) {
  return new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
}

class MemoryCache {
  constructor(fetchNetwork) {
    this.fetchNetwork = fetchNetwork;
    this.entries = new Map();
  }

  async addAll(requests) {
    for (const request of requests) {
      const response = await this.fetchNetwork(makeRequest(request));
      if (!response.ok) throw new Error(`cache-add-failed:${request}`);
      await this.put(request, response);
    }
  }

  async match(request) {
    const response = this.entries.get(cacheKey(request));
    return response ? response.clone() : undefined;
  }

  async put(request, response) {
    this.entries.set(cacheKey(request), response.clone());
  }
}

function createWorker(fetchImpl) {
  const handlers = new Map();
  const fetchCalls = [];
  const cachesByName = new Map();
  let skipWaitingCalls = 0;
  let clientsClaimCalls = 0;

  const networkFetch = async (request) => {
    fetchCalls.push({ method: request.method, mode: request.mode, url: request.url });
    return fetchImpl(request);
  };

  const cacheStorage = {
    async open(name) {
      if (!cachesByName.has(name)) cachesByName.set(name, new MemoryCache(networkFetch));
      return cachesByName.get(name);
    },
    async match(request) {
      for (const cache of cachesByName.values()) {
        const response = await cache.match(request);
        if (response) return response;
      }
      return undefined;
    },
    async keys() {
      return [...cachesByName.keys()];
    },
    async delete(name) {
      return cachesByName.delete(name);
    },
  };

  const clients = {
    async claim() {
      clientsClaimCalls += 1;
    },
    async matchAll() {
      return [];
    },
    async openWindow() {
      return undefined;
    },
  };

  const self = {
    location: { origin: ORIGIN },
    clients,
    registration: {
      async showNotification() {
        return undefined;
      },
    },
    addEventListener(type, listener) {
      handlers.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
  };

  vm.runInNewContext(WORKER_SOURCE, {
    URL,
    Promise,
    Request,
    Response,
    caches: cacheStorage,
    clients,
    fetch: networkFetch,
    self,
    console,
  }, { filename: "sw.js" });

  return {
    cacheStorage,
    clientsClaimCalls: () => clientsClaimCalls,
    fetchCalls,
    handlers,
    skipWaitingCalls: () => skipWaitingCalls,
  };
}

async function dispatchFetch(runtime, request) {
  let responsePromise;
  const waits = [];
  runtime.handlers.get("fetch")({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    },
    waitUntil(promise) {
      waits.push(Promise.resolve(promise));
    },
  });
  assert.ok(responsePromise, "fetch handler should respond to an eligible request");
  const response = await responsePromise;
  await Promise.all(waits);
  return response;
}

async function runInstall(runtime) {
  const waits = [];
  runtime.handlers.get("install")({ waitUntil(promise) { waits.push(promise); } });
  await Promise.all(waits);
}

test("installs the shell without taking control before a user-approved update", async () => {
  const runtime = createWorker(async (request) => new Response(request.url.endsWith("manifest.webmanifest") ? "{}" : "shell-v1"));

  await runInstall(runtime);

  const shell = await runtime.cacheStorage.match("/");
  assert.equal(await shell.text(), "shell-v1");
  assert.equal(runtime.skipWaitingCalls(), 0);
});

test("uses a fresh network navigation and falls back to the cached shell offline", async () => {
  let online = true;
  let shellVersion = "shell-v2";
  const runtime = createWorker(async (request) => {
    if (!online) throw new Error("offline");
    return new Response(request.url.endsWith("manifest.webmanifest") ? "{}" : shellVersion);
  });
  await runInstall(runtime);
  runtime.fetchCalls.length = 0;

  const fresh = await dispatchFetch(runtime, makeRequest("/", { mode: "navigate" }));
  assert.equal(await fresh.text(), "shell-v2");
  assert.deepEqual(runtime.fetchCalls.map((call) => new URL(call.url).pathname), ["/"]);

  online = false;
  const offline = await dispatchFetch(runtime, makeRequest("/", { mode: "navigate" }));
  assert.equal(await offline.text(), "shell-v2");
});

test("returns cached static assets immediately while refreshing them in the background", async () => {
  let assetVersion = "asset-v1";
  let delayNetwork = false;
  const runtime = createWorker(async (request) => {
    if (delayNetwork) await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(request.url.endsWith("app.js") ? assetVersion : "shell");
  });

  const first = await dispatchFetch(runtime, makeRequest("/assets/app.js"));
  assert.equal(await first.text(), "asset-v1");

  assetVersion = "asset-v2";
  delayNetwork = true;
  const cached = await dispatchFetch(runtime, makeRequest("/assets/app.js"));
  assert.equal(await cached.text(), "asset-v1");
  const refreshed = await runtime.cacheStorage.match("/assets/app.js");
  assert.equal(await refreshed.text(), "asset-v2");
});

test("bypasses API and write requests and applies waiting updates only by message", async () => {
  const runtime = createWorker(async () => new Response("network"));
  for (const request of [
    makeRequest("/api/dashboard"),
    makeRequest("/receipts/commit", { method: "POST" }),
    makeRequest("/account/private-data", { destination: "" }),
  ]) {
    let responded = false;
    runtime.handlers.get("fetch")({
      request,
      respondWith() { responded = true; },
      waitUntil() {},
    });
    assert.equal(responded, false);
  }

  const waits = [];
  runtime.handlers.get("message")({
    data: { type: "SKIP_WAITING" },
    waitUntil(promise) { waits.push(promise); },
  });
  await Promise.all(waits);
  assert.equal(runtime.skipWaitingCalls(), 1);
});

test("claims clients after old cache versions are removed", async () => {
  const runtime = createWorker(async () => new Response("shell"));
  await runtime.cacheStorage.open("rescue-meal-shell-v1");
  const waits = [];
  runtime.handlers.get("activate")({ waitUntil(promise) { waits.push(promise); } });
  await Promise.all(waits);

  assert.deepEqual(await runtime.cacheStorage.keys(), []);
  assert.equal(runtime.clientsClaimCalls(), 1);
});
