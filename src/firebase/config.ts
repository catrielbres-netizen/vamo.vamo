
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// This configuration is now injected at build time by Next.js via next.config.js.
// This is the robust, recommended way for production environments.
export const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// --- TEST DEFINITIVO ---
// Esto nos dirá exactamente qué configuración está usando el cliente.
console.log("FIREBASE CONFIGURATION LOADED:", firebaseConfig);


// A critical runtime check to ensure the build process was successful.
// If these are undefined, the app will fail loudly here instead of with cryptic
// Firestore errors later.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('La configuración de Firebase no se cargó correctamente. Revisa que las variables de entorno en tu archivo .env.local sean correctas y que hayas reiniciado el servidor de Next.js (npm run dev). El projectId no puede ser undefined.');
}


// Firebase services are no longer initialized here at the top level.
// They will be initialized lazily in the FirebaseProvider.
// This prevents server-side code from running on module import during the build.
