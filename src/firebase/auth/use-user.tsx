'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useFirebase } from '@/firebase/provider';
import type { UserProfile } from '@/lib/types';
import type { User, ParsedToken } from 'firebase/auth';
import { getIdTokenResult, signOut } from 'firebase/auth';
import { useDoc } from '../firestore/use-doc';
import { useMemoFirebase } from '../hooks';
import { doc, Firestore } from 'firebase/firestore';

export interface UseUserResult {
  user: User | null;
  profile: UserProfile | null;
  claims: ParsedToken | null;
  loading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  firestore: Firestore | null;
}

/**
 * A hook that provides the authenticated user and their corresponding Firestore profile.
 * It combines the auth state from FirebaseProvider with a real-time listener for the user's document.
 * Includes dynamic Custom Claims synchronization (Fase 3) and a secure Mock/Demo mode.
 */
export const useUser = (): UseUserResult => {
  const { user: authUser, auth, isInitializing: isAuthInitializing, error: authError, firestore } = useFirebase();

  const [customClaims, setCustomClaims] = useState<ParsedToken | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);

  // --- [SECURE DEMO MODE] ---
  const demoType = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) return null; // [VamO PRO SECURITY] Force disable in production
    return new URLSearchParams(window.location.search).get('demo_user');
  }, []);

  const isDemo = !!demoType;

  const demoData = useMemo(() => {
    if (!demoType) return null;
    
    const uids: Record<string, string> = {
      passenger: 'XadNzvLKNIfpCyjXBbZS7mvNeSC2',
      driver: 'BQqO4KZ7ALaIZ0vxO8QHNuGZWY23',
      admin_municipal: 'MuniAdminDemoUID'
    };

    const uid = uids[demoType] || `demo_${demoType}`;
    
    const claimsMock: ParsedToken = {
      r: demoType === 'admin_municipal' ? 'admin_municipal' : demoType,
      ck: demoType === 'passenger' ? null : 'rawson',
      v: 1
    };

    const userMock = { 
      uid, 
      email: `${demoType}@demo.vamo.com.ar`, 
      emailVerified: true,
      getIdToken: async () => 'demo_token',
      getIdTokenResult: async () => ({ claims: claimsMock })
    } as unknown as User;

    const profileMock = {
      uid,
      id: uid,
      role: demoType === 'admin_municipal' ? 'admin_municipal' : demoType,
      cityKey: demoType === 'passenger' ? null : 'rawson',
      profileCompleted: true,
      name: `Demo ${demoType.charAt(0).toUpperCase() + demoType.slice(1)}`
    } as unknown as UserProfile;

    return { userMock, claimsMock, profileMock };
  }, [demoType]);

  // Resolution based on mode
  const user = isDemo ? demoData?.userMock || null : authUser;
  // -------------------------

  // Create a memoized reference to the user's profile document.
  const userProfileRef = useMemoFirebase(() => {
    if (user && firestore && !isDemo) {
      return doc(firestore, 'users', user.uid);
    }
    return null;
  }, [user, firestore, isDemo]);

  // Use the useDoc hook to listen for real-time updates to the profile.
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useDoc<UserProfile>(userProfileRef);

  const profile = isDemo ? demoData?.profileMock || null : (profileData as UserProfile | null);

  /**
   * [Fase 3] Identity Sync Logic
   * Compares Firestore state with JWT claims and refreshes token if out of sync.
   */
  useEffect(() => {
    // Skip all sync logic if in Demo Mode or missing critical data
    if (isDemo || !user || !profile || isRefreshing) {
      if (isDemo && demoData) setCustomClaims(demoData.claimsMock);
      return;
    }

    const onboardingPaths = [
      '/driver/register', 
      '/driver/complete-profile', 
      '/dashboard/complete-profile', 
      '/registro/'
    ];
    const isRegistering = typeof window !== 'undefined' && onboardingPaths.some(p => window.location.pathname.includes(p));

    const syncIdentity = async () => {
      const now = Date.now();
      if (refreshAttempts >= 3 && now - lastRefreshAt < 300000) return;

      try {
        const result = await getIdTokenResult(user);
        setCustomClaims(result.claims);

        if (isRegistering) return;

        const claims = result.claims;
        const needsCityKey = ['admin_municipal', 'traffic_municipal', 'driver'].includes(profile.role);
        
        const versionMismatch = (Number(claims.v) || 1) < (Number((profile as any).claimsVersion) || 1);
        const roleMismatch = claims.r !== profile.role;
        const cityMismatch = needsCityKey && claims.ck !== profile.cityKey;

        if (versionMismatch || roleMismatch || cityMismatch) {
          setIsRefreshing(true);
          setRefreshAttempts(prev => prev + 1);
          setLastRefreshAt(now);

          await user.getIdToken(true);
          const newResult = await getIdTokenResult(user);
          setCustomClaims(newResult.claims);
        }
      } catch (err: any) {
        if (err.code === 'auth/id-token-revoked' || err.code === 'auth/user-token-expired') {
          if (auth) await signOut(auth);
          if (typeof window !== 'undefined') window.location.href = '/login?reason=session_expired';
        }
      } finally {
        setIsRefreshing(false);
      }
    };

    syncIdentity();
  }, [user, profile?.role, (profile as any)?.claimsVersion, profile?.cityKey, isRefreshing, isDemo, demoData]);

  // Loading state
  const isProfileStale = !!user && !!profile && (profile as any).id !== user.uid;
  const loading = isAuthInitializing || (!isDemo && !!user && (isProfileLoading || isProfileStale));
  const error = authError || profileError;

  if (isProfileStale) {
    console.warn(`[AUTH_STATE_STALE] Profile UID mismatch! Profile: ${(profile as any).id}, Auth: ${user?.uid}`);
  }

  return {
    user,
    profile,
    claims: isDemo ? demoData?.claimsMock || null : customClaims,
    loading,
    isRefreshing,
    error,
    firestore,
  };
};

export { useFirebase, useAuth, useFirebaseApp, useFirestore } from '@/firebase/provider';
