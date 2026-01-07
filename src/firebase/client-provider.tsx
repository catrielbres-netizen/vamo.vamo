
'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, type User, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore, doc } from 'firebase/firestore';
import { getMessaging, type Messaging } from 'firebase/messaging';
import { firebaseConfig } from './config';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { useDoc } from './firestore/use-doc';
import { type UserProfile } from '@/lib/types';
import { useMemoFirebase } from './hooks';

// This function ensures that we have a single instance of the Firebase app on the client.
function initializeClientApp() {
  if (getApps().length) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

// --- Context Definitions ---

interface FirebaseServices {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  messaging: Messaging | null;
}

interface UserContextState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const FirebaseServicesContext = createContext<FirebaseServices | undefined>(undefined);
const UserContext = createContext<UserContextState | undefined>(undefined);

// --- Provider Component ---

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  // Memoize the initialization of Firebase services to ensure it only runs once.
  const services = useMemo<FirebaseServices>(() => {
    const app = initializeClientApp();
    const auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence);
    const firestore = getFirestore(app);
    let messaging: Messaging | null = null;
    if (typeof window !== 'undefined') {
      try {
        messaging = getMessaging(app);
      } catch (e) {
        console.error("Could not initialize messaging", e);
      }
    }
    return { firebaseApp: app, auth, firestore, messaging };
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(services.auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [services.auth]);

  const userProfileRef = useMemoFirebase(
    () => (services.firestore && user ? doc(services.firestore, 'users', user.uid) : null),
    [services.firestore, user]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const userContextValue = useMemo<UserContextState>(() => ({
    user,
    profile: profile || null,
    loading: isAuthLoading || (!!user && isProfileLoading),
  }), [user, profile, isAuthLoading, isProfileLoading]);

  return (
    <FirebaseServicesContext.Provider value={services}>
      <UserContext.Provider value={userContextValue}>
        <FirebaseErrorListener />
        {children}
      </UserContext.Provider>
    </FirebaseServicesContext.Provider>
  );
}

// --- Hooks ---

function useFirebaseServices() {
  const context = useContext(FirebaseServicesContext);
  if (context === undefined) {
    throw new Error('useFirebaseServices must be used within a FirebaseClientProvider.');
  }
  return context;
}

export const useAuth = (): Auth => useFirebaseServices().auth;
export const useFirestore = (): Firestore => useFirebaseServices().firestore;
export const useFirebaseApp = (): FirebaseApp => useFirebaseServices().firebaseApp;
export const useMessaging = (): Messaging | null => useFirebaseServices().messaging;

export function useUser(): UserContextState {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a FirebaseClientProvider.');
  }
  return context;
}
