const CACHE_NAME = "rescue-meal-shell-v2";
const APP_SHELL = ["/", "/manifest.webmanifest"];
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font", "worker", "manifest"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function fetchAndCache(request, cacheKey = request) {
  let response;
  try {
    response = await fetch(request);
  } catch {
    return null;
  }

  if (response.ok) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, response.clone());
    } catch {
      // A cache quota or storage failure must not hide a valid network response.
    }
  }
  return response;
}

async function networkFirstNavigation(request) {
  const response = await fetchAndCache(request, "/");
  if (response) return response;

  return (await caches.match("/")) || new Response("Rescue Meal을 오프라인에서 열 수 없어요.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  const refresh = fetchAndCache(request);
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        event.waitUntil(refresh.then(() => undefined));
        return cached;
      }
      return refresh.then((response) => response || new Response("", { status: 503 }));
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "확인할 식품 알림이 있어요." };
  }
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : "Rescue Meal 알림";
  const body = typeof payload.body === "string" && payload.body.trim() ? payload.body : "확인할 식품과 보관 상태를 확인해 주세요.";
  const targetUrl = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof payload.tag === "string" ? payload.tag : "rescue-meal-notification",
    data: { url: targetUrl },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((client) => "focus" in client);
      if (existing) {
        return existing.navigate(targetUrl).then(() => existing.focus());
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
