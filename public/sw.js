// Minimal service worker — network-first with static asset caching.
// v2 (2026-05-18): bumped cache key so existing clients drop any /manifest.json
// HTML they may have cached while middleware was redirecting it to /login.
// v3 (2026-06-10): cache the /try navigation HTML (network-first) so the
// registration-free 飛距離計測 page can be re-opened offline once visited online.
// Scope is /try only — all other routes keep the original network-first behavior.
// (2026-06-14): when navigator.onLine === false, never call fetch() for
// same-origin GETs. A failed fetch() attempt is what surfaces the iOS
// "you are offline" dialog when the PWA is reopened in airplane mode, so we
// serve from cache only (app shell for navigations, cached assets otherwise)
// and fall back to a harmless offline response on a miss. Online / cross-origin
// / non-GET behavior is unchanged. '/' is precached at install so offline
// navigations have an app shell to restore from.
const CACHE_NAME = "golf-caddie-v3";
const STATIC_PATHS = ["/_next/static/", "/characters/", "/icon-"];
const APP_SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.add(APP_SHELL);
      } catch {
        // Precache is best-effort; never let it block installation.
      }
      await self.skipWaiting();
    })()
  );
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

  // Offline: never hit the network for same-origin GETs. A failed fetch()
  // attempt is what surfaces the iOS "you are offline" dialog when the PWA is
  // reopened in airplane mode, so we must not call fetch() at all here.
  if (navigator.onLine === false) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match(APP_SHELL);
          if (shell) return shell;
          return new Response(
            "<!doctype html><meta charset=utf-8><title>オフライン</title><p>オフラインです。電波の良い場所で再度開いてください。</p>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
        return new Response("", { status: 503, statusText: "Offline" });
      })()
    );
    return;
  }

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
