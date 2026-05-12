/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, type Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

// Define the shape of the context
interface FirebaseContextValue {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
  user: User | null;
  isInitializing: boolean;
  error: Error | null;
  clearSession: () => Promise<void>;
}

// Create the context
const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

// The provider component
export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize Firebase services to prevent re-initialization on re-renders
  const services = useMemo(() => {
    // Initialize Firebase App
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    

    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const functions = getFunctions(app, 'us-central1');
    const storage = getStorage(app);

    // --- EMULATOR CONNECTION: FULL STACK [VAMO PRO] ---
    const isLocalhost = 
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const shouldUseEmulator = 
      process.env.NODE_ENV === 'development' && isLocalhost && process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === 'true';

    if (shouldUseEmulator && !(globalThis as any).__vamoEmulatorsConnected) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099');
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      (globalThis as any).__vamoEmulatorsConnected = true;
      console.log('[FIREBASE] Full stack emulators connected: auth 9099 / firestore 8080 / functions 5001');
    }

    return { app, auth, firestore, functions, storage };
  }, []);

  // Set up the auth state listener
  useEffect(() => {
    console.log("🔐 [AUTH_DEBUG] Setting up onAuthStateChanged listener.");
    const unsubscribe = onAuthStateChanged(
      services.auth,
      (user) => {
        console.log("🔐 [AUTH_DEBUG] onAuthStateChanged fired. User:", user ? user.uid : 'NULL');
        setUser(user);
        setIsInitializing(false);
      },
      (error) => {
        console.error("🔐 [AUTH_DEBUG] onAuthStateChanged ERROR:", error.message);
        setError(error);
        setIsInitializing(false);
      }
    );
    return unsubscribe;
  }, [services.auth]);

  // --- 4. AUTO-RECOVERY: SELF-HEALING ARCHITECTURE [VamO PRO] ---
  // If user is authenticated but missing Firestore profile/wallet, trigger repair.
  // [VamO FIX 2026-05-10] Skip self-healing on /driver/register paths.
  // During new driver registration, the user doc doesn't exist yet between
  // createUserWithEmailAndPassword and completeDriverRegistrationV1. If self-healing
  // fires in this window, it creates a race condition and causes 401 errors.
  useEffect(() => {
    if (user && !isInitializing) {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const isDriverRegistering = pathname.includes('/driver/register') || pathname.includes('/registro/conductor');
      
      if (isDriverRegistering) {
        console.log('[AUTO_RECOVERY] Skipping self-healing on driver registration path:', pathname);
        return;
      }

      const checkAndRepair = async () => {
        const userRef = doc(services.firestore, 'users', user.uid);
        try {
          const userSnap = await (await import('firebase/firestore')).getDoc(userRef);
          
          if (!userSnap.exists()) {
            console.warn(`⚠️ [AUTO_RECOVERY] User ${user.uid} exists in Auth but not in Firestore. Triggering repair...`);
            const { httpsCallable } = await import('firebase/functions');
            
            // [VamO SECURITY FIX] Force token refresh to ensure callable receives full auth context
            try {
              await user.getIdToken(true);
            } catch (tokenErr) {
              console.warn("⚠️ [AUTO_RECOVERY] Token refresh failed, proceeding with existing token.", tokenErr);
            }

            const repairFunc = httpsCallable(services.functions, 'repairUserProfileV1');
            await repairFunc();
            console.log(`✅ [AUTO_RECOVERY] User ${user.uid} profile repaired successfully.`);
          }
        } catch (err) {
          console.error("❌ [AUTO_RECOVERY] Error during self-healing check:", err);
        }
      };
      
      checkAndRepair();
    }
  }, [user, isInitializing, services.firestore, services.functions]);

  const clearSession = async () => {
    console.log("[AUTH_SESSION_CLEARED] Explicitly clearing session and state.");
    try {
      await signOut(services.auth);
      setUser(null);
      setError(null);
    } catch (err) {
      console.error("[AUTH_SESSION_CLEARED] Error during signOut:", err);
    }
  };

  const contextValue = useMemo(() => ({
    ...services,
    user,
    isInitializing,
    error,
    clearSession,
  }), [services, user, isInitializing, error]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      {children}
    </FirebaseContext.Provider>
  );
}

// Custom hook to access the entire Firebase context
export const useFirebase = (): FirebaseContextValue => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

// Convenience hook to get just the Auth instance
export const useAuth = (): Auth => {
  return useFirebase().auth;
};

// Convenience hook to get just the Firestore instance
export const useFirestore = (): Firestore => {
  return useFirebase().firestore;
};

// Convenience hook to get just the FirebaseApp instance
export const useFirebaseApp = (): FirebaseApp => {
  return useFirebase().app;
};

// Convenience hook to get Functions instance
export const useFunctions = (): Functions => {
  return useFirebase().functions;
};

// Convenience hook to get Storage instance
export const useStorage = (): FirebaseStorage => {
  return useFirebase().storage;
};
