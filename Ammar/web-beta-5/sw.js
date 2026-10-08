/* GuideLens service worker — app-shell cache-first, network-only for map APIs */
const CACHE = "guidelens-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap"];
const RUNTIME_MAX = 80;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Map/search APIs: always network (fresh data, and they disallow caching assumptions)
  if (/nominatim|openstreetmap|routing\.openstreetmap/.test(url.host)) return;
  // App shell + fonts + model CDNs: cache-first with runtime fill
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => {
      const fetched = fetch(e.request).then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => {
            c.keys().then(ks => { if (ks.length < RUNTIME_MAX) c.put(e.request, copy); });
          });
        }
        return res;
      }).catch(() => hit);
      return hit || fetched;
    })
  );
});