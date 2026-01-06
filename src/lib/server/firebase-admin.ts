// src/lib/server/firebase-admin.ts
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App;
let db: Firestore;

// This service account is automatically provided by App Hosting.
// In local dev, you need to provide the service account credentials.
if (getApps().length === 0) {
    // IMPORTANT: When running locally, set the GOOGLE_APPLICATION_CREDENTIALS
    // environment variable to the path of your service account key file.
    // The SDK will automatically pick it up.
    // For App Hosting, this initialization is automatic.
    try {
        app = initializeApp();
        db = getFirestore(app);
    } catch(e) {
        console.error("Firebase Admin SDK initialization failed.", e);
        // Fallback or error handling for local dev without credentials
        // @ts-ignore
        app = null; 
        // @ts-ignore
        db = null;
    }
} else {
    app = getApps()[0];
    db = getFirestore(app);
}

export const getFirebaseAdminApp = () => {
    return { app, db };
}
