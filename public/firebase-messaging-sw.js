
// Importa los scripts de Firebase necesarios (versión compat para Service Workers)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Configuración de Firebase para el Service Worker (DEBE COINCIDIR CON EL FRONTEND)
const firebaseConfig = {
  "projectId": "vamo-app-real",
  "appId": "1:68554242118:web:d3f3f3f3f3f3f3f3f3",
  "apiKey": "AIzaSyDxxxxxxxxxxxxxxxxxxxxxx_YUWK1az4zphC9PA",
  "authDomain": "vamo-app-real.firebaseapp.com",
  "storageBucket": "vamo-app-real.appspot.com",
  "messagingSenderId": "68554242118"
};

// Inicializa Firebase en el Service Worker
firebase.initializeApp(firebaseConfig);

// Inicializa Firebase Messaging
const messaging = firebase.messaging();

// Maneja mensajes push en segundo plano
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || 'VamO';
  const notificationOptions = {
    body: payload.notification?.body || '¡Tenés una nueva notificación!',
    icon: '/icons/favicon-32x32.png', // Ícono para la notificación
    badge: '/icons/badge-72x72.png', // Ícono para la barra de estado en Android
    data: payload.data, // Aquí viaja información extra, como la URL a abrir
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Maneja clicks en la notificación
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/driver/rides';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si la app ya está abierta en la URL correcta, la enfoca
      for (let client of windowClients) {
        if (client.url.endsWith(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abre una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
