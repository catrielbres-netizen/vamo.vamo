
// Importa los scripts de Firebase necesarios
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Las credenciales se deben reemplazar con las del nuevo proyecto de Firebase
const firebaseConfig = {
  "projectId": "studio-6697160840-7c67f",
  "appId": "1:68554242118:web:93c2b08fdb55d657167247",
  "apiKey": "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
  "authDomain": "studio-6697160840-7c67f.firebaseapp.com",
  "storageBucket": "studio-6697160840-7c67f.appspot.com",
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
    body: payload.notification?.body || '',
    icon: '/icons/favicon-32x32.png',
    data: payload.data, 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});


// Opcional: manejar clicks en la notificación
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/driver/rides';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url.endsWith(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
