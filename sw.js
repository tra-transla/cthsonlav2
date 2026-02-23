
/// <reference lib="webworker" />

/** @type {ServiceWorkerGlobalScope} */
const sw = /** @type {any} */ (self);

const CACHE_NAME = 'cth-sla-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/index.tsx'
];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

sw.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
