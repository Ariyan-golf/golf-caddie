// Minimal service worker — network-first with static asset caching.
// v2 (2026-05-18): bumped cache key so existing clients drop any /manifest.json
// HTML they may have cached while middleware was redirecting it to /login.
const CACHE_NAME = "golf-caddie-v2";
const STATIC_PATHS = ["/_next/static/", "/characters/", "/icon-"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(req);
        if (response.ok) {
          const isStatic = STATIC_PATHS.some((p) => url.pathname.startsWith(p));
          if (isStatic) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, response.clone());
          }
        }
        return response;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
      }
    })()
  );
});
