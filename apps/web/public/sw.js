// Omni Service Worker — Offline-First PWA Cache
const CACHE_NAME = "omni-shell-v1";
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

// Install: Pre-cache core shell skeleton
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[Omni SW] Precache warning:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Prune stale caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Offline-first cache with network fallback & background revalidation
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip websocket, blob, and cross-origin relay requests
  if (url.protocol.startsWith("ws") || url.protocol === "blob:" || url.protocol === "data:") {
    return;
  }

  // Handle navigation requests (SPA HTML entrypoint)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match("./index.html") || await caches.match("/index.html") || await caches.match("index.html");
          if (fallback) return fallback;
          return caches.match("./") || caches.match("/");
        })
    );
    return;
  }

  // For static assets (scripts, styles, icons, fonts) from the same origin:
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const copy = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return networkRes;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});
