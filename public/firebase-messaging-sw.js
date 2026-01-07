
// /public/firebase-messaging-sw.js

// IMPORTANT: Do not add this file to .gitignore
// This file needs to be publicly accessible at the root of your domain.

// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here, other Firebase services
// are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker with your project's credentials
// CRITICAL: Replace these with your REAL project's config
const firebaseConfig = {
  apiKey: "AIzaSy...REAL_API_KEY",
  authDomain: "vamo-app-real.firebaseapp.com",
  projectId: "vamo-app-real",
  storageBucket: "vamo-app-real.appspot.com",
  messagingSenderId: "YOUR_REAL_MESSAGING_SENDER_ID",
  appId: "YOUR_REAL_APP_ID",
};


firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/favicon-32x32.png' // Or your preferred icon
  };

  self.registration.showNotification(notificationTitle,
    notificationOptions);
});
