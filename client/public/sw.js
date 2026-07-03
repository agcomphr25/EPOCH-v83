const CACHE_NAME = 'epoch-v8-runtime-v2';
const urlsToCache = [
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  console.info('[EPOCH] Service Worker Installing');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.info('[EPOCH] Caching static assets');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          '<!doctype html><title>EPOCH Offline</title><p>EPOCH is offline. Please reconnect and reload.</p>',
          {
            headers: { 'Content-Type': 'text/html' },
          }
        );
      })
    );
    return;
  }

  const isCacheableStaticAsset =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json';

  if (!isCacheableStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  console.info('[EPOCH] Service Worker Activated');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.info('[EPOCH] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
