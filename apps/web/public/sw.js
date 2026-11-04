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

function notificationTargetUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    return url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "확인할 식품 알림이 있어요." };
  }
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : "Rescue Meal 알림";
  const body = typeof payload.body === "string" && payload.body.trim() ? payload.body : "확인할 식품과 보관 상태를 확인해 주세요.";
  const targetUrl = notificationTargetUrl(payload.url);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof payload.tag === "string" ? payload.tag : "rescue-meal-notification",
    data: { url: targetUrl },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = notificationTargetUrl(event.notification.data?.url);
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const appWindows = windowClients.filter((client) => {
        try {
          return typeof client.focus === "function" && new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      const existing = appWindows.find((client) => client.focused) || appWindows[0];
      if (existing) {
        const current = new URL(existing.url);
        const target = new URL(targetUrl, self.location.origin);
        const alreadyThere = current.pathname === target.pathname
          && ((!target.search && !target.hash) || current.href === target.href);
        if (alreadyThere) return existing.focus();
        // navigate() rejects for a window this worker does not control yet;
        // fall back to a new window so the deep link (/?food=…, /?open=priority)
        // is never dropped.
        return existing.navigate(targetUrl)
          .then((client) => client ? client.focus() : clients.openWindow(targetUrl))
          .catch(() => clients.openWindow(targetUrl));
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
