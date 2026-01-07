// src/lib/server/firebase-admin.ts
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

function initializeAdminApp() {
    if (getApps().length > 0) {
        return getApps()[0];
    }
    
    try {
        // This service account is automatically provided by App Hosting.
        // For local dev, set GOOGLE_APPLICATION_CREDENTIALS.
        return initializeApp();
    } catch (e) {
        console.error("Firebase Admin SDK initialization failed.", e);
        // This will cause db to be null and fail gracefully downstream
        return null;
    }
}

const app: App | null = initializeAdminApp();
const db: Firestore | null = app ? getFirestore(app) : null;

export const getFirebaseAdminApp = () => {
    // This function now simply returns the initialized instances.
    // The null check should be performed by the consumer.
    return { app, db };
}
