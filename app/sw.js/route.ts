// Route Handler that serves /sw.js with a per-deploy CACHE_NAME stamped in.
//
// なぜ Route Handler か:
//   静的 public/sw.js はデプロイ間でバイト不変になりがちで、CACHE_NAME を手で
//   bump しない限り古い '/' シェルと古い chunk が同名キャッシュに残り、白画面
//   （Application error / chunk 不整合）を招いていた。ここでは CACHE_NAME に
//   ビルドID（コミットSHA）を毎デプロイ埋め込み、activate で旧キャッシュを確実に
//   一掃する。SW のロジック自体は従来の public/sw.js を踏襲する。
//
// 注意:
//   - 旧 public/sw.js は同パス衝突を避けるため削除済み（静的配信が優先されると
//     このハンドラが効かないため）。
//   - CDN にキャッシュされて BUILD_ID が固定化しないよう dynamic 評価＋no-cache。
//   - 登録は従来どおり register("/sw.js")。スクリプトはルート直下パスなので
//     スコープは '/' のまま変わらない。

export const dynamic = "force-dynamic";

// 主軸はコミットSHA（コミットごとに必ず変わる＝chunk が変わるたび変わる）。
// 実行時に値が入らないローカル開発では固定値 "dev" にフォールバック。
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
const CACHE_NAME = `golf-caddie-${BUILD_ID}`;

function swSource(cacheName: string): string {
  // NOTE: 以下は Service Worker のソース文字列。挙動は従来の public/sw.js と同一で、
  //       CACHE_NAME のみビルドID由来に置き換えている。
  return `// Service worker (served by app/sw.js/route.ts).
// network-first with static asset caching.
// CACHE_NAME はビルドID（コミットSHA）でデプロイごとに変わる。これにより
// activate で旧キャッシュ（旧 '/' シェル・旧 chunk）が確実に削除され、デプロイ
// 更新時の白画面（chunk 不整合）を防ぐ。
//
// オフライン設計は従来どおり維持:
//   navigator.onLine === false のとき same-origin GET で fetch() を一切呼ばない。
//   失敗する fetch() 試行が iOS PWA を機内モードで開いた際の「オフライン」ダイアログ
//   を出すため、キャッシュのみで応答する（ナビゲーションはアプリシェル、その他は
//   キャッシュ、ミス時は無害なオフライン応答）。'/' は install で precache する。
const CACHE_NAME = ${JSON.stringify(cacheName)};
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
`;
}

export function GET(): Response {
  return new Response(swSource(CACHE_NAME), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // SW 本体は常に再検証させ、CDN/ブラウザにキャッシュ固定させない。
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
