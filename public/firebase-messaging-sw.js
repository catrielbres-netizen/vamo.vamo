// public/firebase-messaging-sw.js

// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here, other Firebase libraries
// are not available in the service worker.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
firebase.initializeApp({
  apiKey: "AIzaSyCvJiKLN9UStCWaOlIa_6kv2kw3fUZ6CKo",
  authDomain: "vamo-app-real.firebaseapp.com",
  projectId: "vamo-app-real",
  storageBucket: "vamo-app-real.firebasestorage.app",
  messagingSenderId: "196111752704",
  appId: "1:196111752704:web:19a6c3d34a5361af15c2e5",
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/favicon-32x32.png'
  };

  self.registration.showNotification(notificationTitle,
    notificationOptions);
});
