// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ⚡ Configuración de Firebase (debe coincidir con la de la app)
const firebaseConfig = {
  "projectId": "studio-6697160840-7c67f",
  "appId": "1:68554242118:web:93c2b08fdb55d657167247",
  "apiKey": "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
  "authDomain": "studio-6697160840-7c67f.firebaseapp.com",
  "storageBucket": "studio-6697160840-7c67f.appspot.com",
  "messagingSenderId": "68554242118"
};

firebase.initializeApp(firebaseConfig);


// Inicializamos Firebase Messaging
const messaging = firebase.messaging();

// 📩 Manejar notificaciones en background
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notificación recibida en background:', payload);

  const notificationTitle = payload.notification?.title || 'Nuevo viaje disponible';
  const notificationOptions = {
    body: payload.notification?.body || 'Tenés un viaje pendiente para aceptar',
    icon: payload.notification?.icon || '/favicon.ico',
    data: {
      url: '/driver/rides', // A dónde redirigir al hacer clic
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🖱️ Manejar clic en notificación
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/driver/rides';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si hay ventana abierta, la enfocamos
      for (let client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrimos una nueva
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
