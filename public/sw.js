// AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
const CACHE_NAME = 'vamo-cache-v4'; 

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install event — VamO Resilience Mode');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // USAMOS MAP PARA QUE SI UNO FALLA, LOS DEMÁS SIGAN
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.error(`[SW_CACHE_ERROR] Failed to cache: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Strategy: Network First for critical chunks
  // This prevents serving stale JS bundles after a deploy
  if (event.request.url.includes('/_next/static/chunks/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        // If the chunk is found (200 OK), we'refine. 
        // If it's a 404, we don't cache it and let the browser fail 
        // so the VersionManager can trigger a full reload.
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Update mechanism
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
