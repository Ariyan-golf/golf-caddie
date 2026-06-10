// Minimal service worker — network-first with static asset caching.
// v2 (2026-05-18): bumped cache key so existing clients drop any /manifest.json
// HTML they may have cached while middleware was redirecting it to /login.
// v3 (2026-06-10): cache the /try navigation HTML (network-first) so the
// registration-free 飛距離計測 page can be re-opened offline once visited online.
// Scope is /try only — all other routes keep the original network-first behavior.
const CACHE_NAME = "golf-caddie-v3";
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

  // /try only: cache the navigation HTML so the page can be re-opened offline
  // once visited online. Still network-first (always prefer fresh). Limited to
  // the /try route (本体 + /try/ 配下) — all other navigations fall through to
  // the default handler below and keep their original behavior.
  const isTryNavigation =
    req.mode === "navigate" &&
    (url.pathname === "/try" || url.pathname.startsWith("/try/"));
  if (isTryNavigation) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(req);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
        }
      })()
    );
    return;
  }

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
