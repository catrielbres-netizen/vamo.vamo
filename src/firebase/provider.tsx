'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { getFirestore, doc, setDoc, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
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
    
    // --- TEST DEFINITIVO: LOGUEAR PROJECT ID ---
    console.log("🔥 Firebase project:", app.options.projectId);

    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const functions = getFunctions(app, 'us-central1');
    const storage = getStorage(app);
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

  // Global Sync: Auth -> Firestore for Email Verification
  useEffect(() => {
    if (user && services.firestore && user.emailVerified) {
        const userRef = doc(services.firestore, 'users', user.uid);
        // Opportunistic, non-blocking sync. Will fail silently if offline but succeed when back.
        setDoc(userRef, { emailVerified: true }, { merge: true }).catch(err => {
            console.warn("No se pudo sincronizar emailVerified a Firestore", err);
        });
    }
  }, [user, services.firestore]);

  const contextValue = useMemo(() => ({
    ...services,
    user,
    isInitializing,
    error,
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
