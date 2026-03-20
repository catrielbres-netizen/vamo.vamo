'use client';

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
  const { user, isInitializing: isAuthInitializing, error: authError, firestore } = useFirebase();

  // Create a memoized reference to the user's profile document.
  // This ref only exists if the user is authenticated.
  const userProfileRef = useMemoFirebase(() => {
    if (user && firestore) {
      return doc(firestore, 'users', user.uid);
    }
    return null;
  }, [user, firestore]);

  // Use the useDoc hook to listen for real-time updates to the profile.
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useDoc<UserProfile>(userProfileRef);

  // The overall loading state is true if auth is initializing OR if we have a user but are still loading their profile.
  const loading = isAuthInitializing || (!!user && isProfileLoading);
  
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
