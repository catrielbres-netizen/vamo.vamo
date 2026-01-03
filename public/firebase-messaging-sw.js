
// This file must be in the public folder.

// Scripts for Firebase products
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');


// Your web app's Firebase configuration
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

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico' // You can add an icon here
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
