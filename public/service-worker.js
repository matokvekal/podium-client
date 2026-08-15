// Bike Podium service worker — deliberately small and hand-written.
//
// What it does:
//   * precaches the app shell so the interface opens with no network
//   * serves navigations from the cache when offline
//   * serves map tiles and static assets cache-first (tiles change rarely and are heavy)
//
// What it does NOT do: queue API writes. Offline action replay is application state, not
// cache state — it lives in the app (milestone 10) where it can carry X-Client-Action-Id
// and interpret a 409 as "already applied".
//
// API responses are never cached. A stale rider position on a live map is worse than none.

const VERSION = "v1";
const SHELL_CACHE = `podium-shell-${VERSION}`;
const ASSET_CACHE = `podium-assets-${VERSION}`;
const TILE_CACHE = `podium-tiles-${VERSION}`;
const TILE_LIMIT = 400;

const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, TILE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isTileRequest(url) {
  return /tile|\.png$/.test(url.pathname) && url.origin !== self.location.origin;
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    if (limit) {
      const keys = await cache.keys();
      if (keys.length > limit) await cache.delete(keys[0]);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache the API: positions, participant lists and results must be live.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match("/index.html")) ?? Response.error();
      }),
    );
    return;
  }

  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(request, TILE_CACHE, TILE_LIMIT));
    return;
  }

  if (url.origin === self.location.origin && /\.(js|css|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
