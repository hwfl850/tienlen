const CACHE = 'lantern-table-v6';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './supabase-config.js', './manifest.webmanifest', './favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

// Network-first: always prefer the freshest deployed code, falling back to the
// cached copy only when offline. A cache-first strategy previously kept serving
// stale app.js/index.html after every deploy, which looked like the game was
// still "glitchy" even after fixes shipped.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
