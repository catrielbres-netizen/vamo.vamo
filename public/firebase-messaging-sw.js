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
if (firebaseConfigParam) {
  try {
    const firebaseConfig = JSON.parse(decodeURIComponent(firebaseConfigParam));
    
    // Initialize the Firebase app in the service worker with the provided config
    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      
      const notificationTitle = payload.data.title || 'Nueva Notificación';
      const notificationOptions = {
        body: payload.data.body,
        icon: '/vamo-logo.svg', // Ensure you have this icon in your public folder
        data: {
            link: payload.data.link || '/'
        }
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });

  } catch (error) {
    console.error("Failed to initialize Firebase in service worker:", error);
  }
} else {
    console.error("Service Worker: Firebase config not found in URL parameters.");
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
