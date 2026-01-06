// src/lib/server/firebase-admin.ts
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App;
let db: Firestore;

// This service account is automatically provided by App Hosting.
// It has admin privileges to your Firebase project.
// In local dev, you need to provide the service account credentials.
if (getApps().length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Deployed environment or local with service account in env var
        app = initializeApp({
            credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } else {
        // App Hosting environment
        app = initializeApp();
    }
    db = getFirestore(app);
} else {
    app = getApps()[0];
    db = getFirestore(app);
}

export const getFirebaseAdminApp = () => {
    return { app, db };
}
