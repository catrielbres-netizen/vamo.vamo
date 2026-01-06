// public/firebase-messaging-sw.js

// Scripts for Firebase
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Your web app's Firebase configuration
// IMPORTANT: This needs to be manually kept in sync with src/firebase/config.ts
const firebaseConfig = {
  apiKey: "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
  authDomain: "studio-6697160840-7c67f.firebaseapp.com",
  projectId: "studio-6697160840-7c67f",
  storageBucket: "studio-6697160840-7c67f.appspot.com",
  messagingSenderId: "68554242118",
  appId: "1:68554242118:web:93c2b08fdb55d657167247"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || "VamO";
  const notificationOptions = {
    body: payload.notification?.body || "Nueva notificación",
    icon: '/icons/favicon-32x32.png',
    data: payload.data // Pass along data like a URL
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Optional: Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((windowClients) => {
      // Check if a window is already open with the target URL
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
