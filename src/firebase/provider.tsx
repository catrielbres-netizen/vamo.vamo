'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'
import { useDoc } from './firestore/use-doc';
import { UserProfile } from '@/lib/types';
import { useMemoFirebase } from '@/firebase/hooks';


interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// Combined state for the Firebase context
export interface FirebaseContextState {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean; // Consolidated loading state
}

// Return type for useUser()
export interface UserHookResult {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}


// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);


export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Subscribe to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
    });
    // Ensure that loading state is updated even if onAuthStateChanged doesn't fire
    // on initial load (e.g. from cache).
    if (auth.currentUser) {
        setUser(auth.currentUser);
        setIsAuthLoading(false);
    }
    return () => unsubscribe();
  }, [auth]);

  // Once we have a user, we can fetch their profile
  const userProfileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);

  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const loading = isAuthLoading || (!!user && isProfileLoading);
    return {
      firebaseApp,
      firestore,
      auth,
      user,
      profile: profile || null, // Ensure profile is null if not loaded
      loading,
    };
  }, [firebaseApp, firestore, auth, user, profile, isAuthLoading, isProfileLoading]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};


function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }
  return context;
};

export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  if (!auth) throw new Error("Auth service not available.");
  return auth;
};

export const useFirestore = (): Firestore => {
  const { firestore } = useFirebase();
  if (!firestore) throw new Error("Firestore service not available.");
  return firestore;
};

export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  if (!firebaseApp) throw new Error("Firebase App not available.");
  return firebaseApp;
};

export function useUser(): UserHookResult {
  const { user, profile, loading } = useFirebase();
  return { user, profile, loading };
};
