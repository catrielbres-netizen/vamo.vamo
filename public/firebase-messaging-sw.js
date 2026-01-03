// public/firebase-messaging-sw.js

// Scripts for firebase and firebase messaging
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker
// Be sure to replace the config values with your own
const firebaseConfig = {
  apiKey: "AIzaSyDOkw1zuu8JZu2zGwn_YUWK1az4zphC9PA",
  authDomain: "studio-6697160840-7c67f.firebaseapp.com",
  projectId: "studio-6697160840-7c67f",
  storageBucket: "studio-6697160840-7c67f.appspot.com",
  messagingSenderId: "68554242118",
  appId: "1:68554242118:web:93c2b08fdb55d657167247",
};


firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icon-192x192.png' // Default icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
