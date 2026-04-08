'use client';

import React, { useMemo } from 'react';
import { useFirebase } from '@/firebase/provider';
import type { UserProfile } from '@/lib/types';
import type { User } from 'firebase/auth';
import { useDoc } from '../firestore/use-doc';
import { useMemoFirebase } from '../hooks';
import { doc } from 'firebase/firestore';

export interface UseUserResult {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
}

/**
 * A hook that provides the authenticated user and their corresponding Firestore profile.
 * It combines the auth state from FirebaseProvider with a real-time listener for the user's document.
 */
export const useUser = (): UseUserResult => {
  const { user: authUser, isInitializing: isAuthInitializing, error: authError, firestore } = useFirebase();

  // --- DEMO MOCK AUTH BYPASS ---
  const demoUid = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const type = params.get('demo_user');
    if (type === 'passenger') return 'XadNzvLKNIfpCyjXBbZS7mvNeSC2';
    if (type === 'driver') return 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23';
    return null;
  }, []);

  const user = demoUid ? { uid: demoUid, email: `${demoUid}@demo.com`, emailVerified: true } as User : authUser;
  // -----------------------------

  // Create a memoized reference to the user's profile document.
  const userProfileRef = useMemoFirebase(() => {
    if (user && firestore) {
      return doc(firestore, 'users', user.uid);
    }
    return null;
  }, [user, firestore]);

  // Use the useDoc hook to listen for real-time updates to the profile.
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useDoc<UserProfile>(userProfileRef);

  // --- DEMO PROFILE MERGE ---
  const mockProfile = useMemo(() => {
    if (!demoUid) return null;
    return {
        id: demoUid,
        uid: demoUid,
        role: demoUid === 'XadNzvLKNIfpCyjXBbZS7mvNeSC2' ? 'passenger' : 'driver',
        profileCompleted: true,
        approved: true,
        emailVerified: true,
        name: demoUid === 'XadNzvLKNIfpCyjXBbZS7mvNeSC2' ? 'Pasajero Demo' : 'Conductor Demo',
        driverStatus: 'offline'
    } as UserProfile;
  }, [demoUid]);

  const profile = profileData || (mockProfile as UserProfile | null);

  // Loading state
  const isProfileStale = !!user && !!profile && (profile as any).id !== user.uid;
  const loading = demoUid ? (isProfileLoading && !profileData) : (isAuthInitializing || (!!user && (isProfileLoading || isProfileStale)));
  
  // Combine potential errors from auth and profile fetching.
  const error = authError || profileError;

  return {
    user,
    profile: profile as UserProfile | null,
    loading,
    error,
  };
};

export { useFirebase, useAuth, useFirebaseApp, useFirestore } from '@/firebase/provider';
