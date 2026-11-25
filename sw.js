const CACHE_NAME = 'motoatlas-road-v1.4-cache';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Cache-first para blocos do OpenStreetMap e recursos estáticos da aplicação
  if (url.includes('tile.openstreetmap.org') || APP_SHELL.some(item => url.endsWith(item.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(networkResp => {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResp;
        }).catch(() => cached);
      })
    );
  }
});
