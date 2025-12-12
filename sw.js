const CACHE_NAME = 'rail-nav-v1';
const toCache = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', evt => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(toCache))
  );
});

self.addEventListener('activate', evt => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evt => {
  if (evt.request.url.includes('overpass-api.de')) return;
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request))
  );
});
