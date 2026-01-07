'use client';

import { firebaseConfig } from './config';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';

// This function ensures that we have a single instance of the Firebase app.
export function initializeFirebase(): { firebaseApp: FirebaseApp; auth: any; firestore: any; messaging: any; } {
  if (getApps().length) {
    const app = getApp();
    return getSdks(app);
  }

  const app = initializeApp(firebaseConfig);
  return getSdks(app);
}

export function getSdks(firebaseApp: FirebaseApp) {
  let messaging = null;
  if (typeof window !== 'undefined') {
    try {
        messaging = getMessaging(firebaseApp);
    } catch (e) {
        console.error("Could not initialize messaging", e);
        messaging = null;
    }
  }

  const auth = getAuth(firebaseApp);
  // Set persistence to local to avoid session loss on tab close/reload
  setPersistence(auth, browserLocalPersistence);

  return {
    firebaseApp,
    auth: auth,
    firestore: getFirestore(firebaseApp),
    messaging: messaging
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export * from './hooks';
