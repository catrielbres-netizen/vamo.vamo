
// Scripts for Firebase service worker (using modular SDK v9+)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// The Firebase config object from your app's configuration
const firebaseConfig = {
  "projectId": "studio-6697160840-7c67f",
  "appId": "1:68554242118:web:93c2b08fdb55d657167247",
  "apiKey": "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
  "authDomain": "studio-6697160840-7c67f.firebaseapp.com",
  "storageBucket": "studio-6697160840-7c67f.appspot.com",
  "messagingSenderId": "68554242118"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'VamO';
  const notificationOptions = {
    body: payload.notification?.body || 'Tenés una nueva notificación',
    icon: '/icons/favicon-32x32.png',
    data: payload.data || { url: '/' } // Default URL if data is not provided
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/driver/rides';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if there is already a window/tab open with the target URL
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
