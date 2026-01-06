
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// IMPORTANT: Replace with your REAL Firebase project credentials
const firebaseConfig = {
  "projectId": "vamo-app-real",
  "appId": "1:123456789012:web:REAL_APP_ID",
  "apiKey": "AIzaSy...REAL_API_KEY",
  "authDomain": "vamo-app-real.firebaseapp.com",
  "storageBucket": "vamo-app-real.appspot.com",
  "messagingSenderId": "123456789012"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

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
