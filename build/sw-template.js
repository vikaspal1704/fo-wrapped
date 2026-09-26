// F&O Wrapped service worker (generated at build time; see build/swPlugin.ts).
// It caches ONLY the app's own static files so the app opens offline.
// It never sees trade data: files are read locally and nothing is fetched
// with user data. Only same-origin GET requests are handled.
const VERSION = '__VERSION__';
const CACHE = `fo-wrapped-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fo-wrapped-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // ignoreVary: module scripts and stylesheets are requested with
  // `crossorigin`, so they carry an Origin header the precache requests
  // didn't have; a server that sends `Vary: Origin` would otherwise make
  // every lookup miss and the app fail offline. These are static files.
  const match = { ignoreSearch: true, ignoreVary: true };
  if (req.mode === 'navigate') {
    // Network first so updates arrive; the cached shell when offline.
    event.respondWith(fetch(req).catch(() => caches.match('./index.html', match)));
    return;
  }
  // Hashed build assets and icons never change under the same name.
  event.respondWith(caches.match(req, match).then((hit) => hit ?? fetch(req)));
});
