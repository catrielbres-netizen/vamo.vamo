// VamO Service Worker — vamo-cache-v8
// ─────────────────────────────────────────────────────────────────────────────
// CAMBIO v7 → v8:
//   - Actualización de versión para forzar cache busting de los nuevos assets y del loader.
//   - skipWaiting SOLO ocurre cuando VersionManager envía {type: 'SKIP_WAITING'}.
//   - El SW permanece en estado "waiting" hasta que el usuario confirma.
//   - Limpieza de caches antiguas en activate.
//   - clients.claim() en activate para tomar control inmediato tras activarse.
//
// NO TOCAR: wallet / refund / settlement / tarifa dinámica / matching / IA.

const CACHE_NAME = 'vamo-cache-v8';

// Assets a pre-cachear (solo los esenciales para offline básico)
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
];

// ── Install: pre-cachear assets y ESPERAR en waiting ──────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install event — vamo-cache-v8');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to pre-cache: ${url}`, err);
          })
        )
      );
    })
    // SIN self.skipWaiting() aquí — el SW queda en "waiting"
    // hasta que VersionManager envíe SKIP_WAITING.
  );
});

// ── Activate: limpiar caches antiguas + claim clients ─────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event — cleaning old caches.');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      )
    ).then(() => {
      // Tomar control inmediato de todos los clientes abiertos
      return self.clients.claim();
    })
  );
});

// ── Fetch: Network-First para chunks Next.js; Cache-First para resto local ───────
self.addEventListener('fetch', (event) => {
  // Ignorar métodos que no sean GET
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Evitar cachear Firebase, API de Next.js, y endpoints externos
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/__/') || // Firebase Hosting reserved paths
    event.request.url.includes('googleapis.com') ||
    event.request.url.includes('firebase')
  ) {
    return; // Bypass SW cache - ir directo a la red
  }

  // Chunks de Next.js: siempre ir a red primero para obtener el hash correcto
  if (event.request.url.includes('/_next/static/chunks/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cachear la respuesta fresca
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Navegaciones (HTML): siempre red primero, fallback a '/'
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Resto: Cache-First con fallback a red
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ── Message: recibir SKIP_WAITING desde VersionManager ────────────────────
// Este es el ÚNICO lugar donde el SW abandona el estado "waiting".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received — activating.');
    self.skipWaiting();
  }
});
