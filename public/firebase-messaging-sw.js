/**
 * [VamO PUSH CLEANUP]
 * Service Worker neutralizado.
 * Todas las funcionalidades de Firebase Messaging han sido removidas.
 */
console.log("[VamO SW] Service Worker neutralizado (Push desactivado).");

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  console.log("[VamO SW] Activo en modo pasivo.");
});
