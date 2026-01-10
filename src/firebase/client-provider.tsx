
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

// --- Types and Context Definitions ---

type InitializationState = 'loading' | 'success' | 'error';

interface FirebaseServices {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  messaging: Messaging | null;
  initializationState: InitializationState;
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
  const [initializationState, setInitializationState] = useState<InitializationState>('loading');

  const services = useMemo<FirebaseServices>(() => {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('YOUR_REAL')) {
      console.error("Firebase API Key is not configured. Firebase services will be disabled.");
      setInitializationState('error');
      return { firebaseApp: null, firestore: null, auth: null, messaging: null, initializationState: 'error' };
    }

    try {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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
      setInitializationState('success');
      return { firebaseApp: app, auth, firestore, messaging, initializationState: 'success' };
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setInitializationState('error');
      return { firebaseApp: null, firestore: null, auth: null, messaging: null, initializationState: 'error' };
    }
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    if (services.auth) {
      const unsubscribe = onAuthStateChanged(services.auth, (firebaseUser) => {
        setUser(firebaseUser);
        setIsAuthLoading(false);
      });
      return () => unsubscribe();
    } else {
      setIsAuthLoading(false);
    }
  }, [services.auth]);

  const userProfileRef = useMemoFirebase(
    () => (services.firestore && user ? doc(services.firestore, 'users', user.uid) : null),
    [services.firestore, user]
  );
  
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  const userContextValue = useMemo<UserContextState>(() => ({
    user,
    profile: profile || null,
    loading: services.initializationState === 'loading' || isAuthLoading || (!!user && isProfileLoading),
  }), [user, profile, services.initializationState, isAuthLoading, isProfileLoading]);

  return (
    <FirebaseServicesContext.Provider value={{...services, initializationState}}>
      <UserContext.Provider value={userContextValue}>
        {initializationState === 'success' && <FirebaseErrorListener />}
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

export const useAuth = (): Auth | null => useFirebaseServices().auth;
export const useFirestore = (): Firestore | null => useFirebaseServices().firestore;
export const useFirebaseApp = (): FirebaseApp | null => useFirebaseServices().firebaseApp;
export const useMessaging = (): Messaging | null => useFirebaseServices().messaging;
export const useFirebaseInitialization = (): InitializationState => useFirebaseServices().initializationState;


export function useUser(): UserContextState {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a FirebaseClientProvider.');
  }
  return context;
}
