'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'

// This function ensures that we have a single instance of the Firebase app.
export function initializeFirebase(): { firebaseApp: FirebaseApp; auth: any; firestore: any; } {
  if (getApps().length) {
    const app = getApp();
    return getSdks(app);
  }

  const app = initializeApp(firebaseConfig);
  return getSdks(app);
}


export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp)
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