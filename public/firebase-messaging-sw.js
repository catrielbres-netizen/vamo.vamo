// public/firebase-messaging-sw.js

// IMPORTANT: This file needs to be in the `public` directory.

// Scripts for Firebase
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Function to parse query parameters
const getQueryParam = (param) => {
  const urlParams = new URLSearchParams(location.search);
  return urlParams.get(param);
};

// Get Firebase config from the URL
const firebaseConfigParam = getQueryParam('firebaseConfig');
let firebaseConfig = null;

if (firebaseConfigParam) {
  try {
    firebaseConfig = JSON.parse(decodeURIComponent(firebaseConfigParam));
    console.log("[FCM_SW] Config received via URL params.");
  } catch (e) {
    console.error("[FCM_SW] Failed to parse URL config:", e);
  }
}

// Fallback: Hardcoded Production Config (If URL param is missing or fails)
if (!firebaseConfig) {
  console.warn("[FCM_SW] No valid URL config. Using hardcoded production fallback.");
  firebaseConfig = {
    apiKey: "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
    authDomain: "studio-6697160840-7c67f.firebaseapp.com",
    projectId: "studio-6697160840-7c67f",
    storageBucket: "studio-6697160840-7c67f.firebasestorage.app",
    messagingSenderId: "68554242118",
    appId: "1:68554242118:web:93c2b08fdb55d657167247"
  };
}

if (firebaseConfig) {
  try {
    // Initialize the Firebase app in the service worker
    firebase.initializeApp(firebaseConfig);
    console.log("[FCM_SW] Firebase initialized successfully. Project:", firebaseConfig.projectId);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[FCM_SW] Mensaje en segundo plano recibido:', payload);

      const title = payload.data?.title || payload.notification?.title || 'Nueva Notificación';
      const body = payload.data?.body || payload.notification?.body || 'VamO tiene una actualización para vos.';

      const notificationOptions = {
        body: body,
        icon: '/vamo-logo.svg',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        data: {
          link: payload.data?.link || '/'
        }
      };

      console.log('[FCM_SW] Mostrando notificación:', title);
      return self.registration.showNotification(title, notificationOptions);
    });

  } catch (error) {
    console.error("[FCM_SW] Error during initialization:", error);
  }
} else {
  console.error("[FCM_SW] Critical: No Firebase configuration found. Notifications will not work.");
}


self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received.', event.notification);
  event.notification.close();

  const link = event.notification.data.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === link && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
});
