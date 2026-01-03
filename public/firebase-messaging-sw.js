// public/firebase-messaging-sw.js
// This file needs to be in the public directory
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ⚡ This configuration will be replaced by the build process with the actual Firebase config
const firebaseConfig = {
  "projectId": "studio-6697160840-7c67f",
  "appId": "1:68554242118:web:93c2b08fdb55d657167247",
  "apiKey": "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
  "authDomain": "studio-6697160840-7c67f.firebaseapp.com",
  "measurementId": "",
  "storageBucket": "studio-6697160840-7c67f.appspot.com",
  "messagingSenderId": "68554242118"
};

firebase.initializeApp(firebaseConfig);

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Background notification received:', payload);

  const notificationTitle = payload.notification?.title || 'Nuevo Viaje Disponible';
  const notificationOptions = {
    body: payload.notification?.body || 'Un nuevo viaje está esperando ser aceptado.',
    icon: '/favicon.ico', // You can customize this
    data: {
      url: payload.data?.url || '/driver/rides', // Default redirect URL
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/driver/rides';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if there is already a window/tab open with the target URL
      for (let client of windowClients) {
        // Use includes() for flexibility, in case of query params
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
