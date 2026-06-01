/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  fallbackPath?: string;
}

const ONBOARDING_FLAG = 'driverOnboardingJustCompleted';

/**
 * [VamO PRO SECURITY] AuthGuard Component
 * 
 * Strictly blocks rendering until:
 * 1. Auth session is resolved.
 * 2. Firestore profile is loaded.
 * 3. Roles are validated.
 * 
 * Prevents "fake hydration" and "stale session leaks".
 */
export function AuthGuard({ 
  children, 
  allowedRoles = ['passenger', 'admin'], 
  fallbackPath = '/login' 
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, role, loading } = useUser();

  // [VamO SAFETY] If the driver just completed onboarding, sessionStorage has a flag.
  // We must NOT redirect to login while Firebase re-hydrates the session after
  // the claims update (which previously triggered revokeRefreshTokens — now fixed).
  // The flag is cleared once the user is confirmed or after 8s to prevent it getting stuck.
  const [onboardingFlag, setOnboardingFlag] = useState(false);
  const flagChecked = useRef(false);

  useEffect(() => {
    if (flagChecked.current) return;
    flagChecked.current = true;
    if (typeof window !== 'undefined' && sessionStorage.getItem(ONBOARDING_FLAG) === 'true') {
      setOnboardingFlag(true);
      // Auto-expire after 8s as a safety valve
      const t = setTimeout(() => {
        sessionStorage.removeItem(ONBOARDING_FLAG);
        setOnboardingFlag(false);
      }, 8000);
      return () => clearTimeout(t);
    }
  }, []);

  // Clear the flag as soon as the user is confirmed
  useEffect(() => {
    if (onboardingFlag && user) {
      sessionStorage.removeItem(ONBOARDING_FLAG);
      setOnboardingFlag(false);
    }
  }, [user, onboardingFlag]);

  const isProfileCompletion = pathname?.startsWith('/dashboard/complete-profile');
  
  // A session is considered "resolving" if:
  // - auth is loading, OR
  // - we have a user but no profile and no role yet, OR
  // - the onboarding flag is set and user hasn't been confirmed yet
  const isResolving = loading || (!!user && !profile && !role && !isProfileCompletion) || (onboardingFlag && !user);

  // --- [VamO PRO] Strict Onboarding Status ---
  const registrationStatus = (profile as any)?.registrationStatus;
  const isPassenger = role === 'passenger' || profile?.role === 'passenger';
  const isIncompletePassenger = isPassenger && registrationStatus !== 'active';
  const shouldRedirectToOnboarding = profile && isIncompletePassenger && !isProfileCompletion;

  useEffect(() => {
    if (isResolving) return;

    const logPrefix = `[AUTH_ROUTE_DEBUG] ${pathname}`;
    const activeRole = role || profile?.role;
    const debugData = {
        uid: user?.uid,
        email: user?.email,
        pathname,
        firestoreRole: profile?.role,
        resolvedRole: role,
        activeRole,
        registrationStatus: (profile as any)?.registrationStatus,
        allowedRoles,
        onboardingFlag,
    };

    // 1. Unauthenticated Block
    if (!user) {
      console.warn(`${logPrefix} REDIRECT: Unauthenticated. Reason: user_missing. Target: ${fallbackPath}`, debugData);
      router.replace(fallbackPath);
      return;
    }

    // 2. Profile/Role Missing Block (for non-completion paths)
    if (!profile && !role && !isProfileCompletion) {
      console.warn(`${logPrefix} REDIRECT: Profile/Role missing. Target: ${fallbackPath}`, debugData);
      router.replace(fallbackPath);
      return;
    }

    // 3. Onboarding Enforcer [VamO PRO]
    if (shouldRedirectToOnboarding) {
      console.warn(`${logPrefix} REDIRECT: Incomplete onboarding. Target: /dashboard/complete-profile`, debugData);
      router.replace('/dashboard/complete-profile');
      return;
    }

    // 4. Role Authorization Block
    if (activeRole && allowedRoles.length > 0 && activeRole !== 'superadmin' && !allowedRoles.includes(activeRole)) {
      console.error(`${logPrefix} FORBIDDEN: Role ${activeRole} not in ${allowedRoles}. Target: ${fallbackPath}`, debugData);
      router.replace(fallbackPath);
      return;
    }

    // If we reach here, access is valid.
    console.log(`${logPrefix} ACCESS_GRANTED`, debugData);
  }, [user, profile, role, isResolving, allowedRoles, fallbackPath, router, pathname, isProfileCompletion, registrationStatus, shouldRedirectToOnboarding, onboardingFlag]);

  // Block rendering while resolving or if invalid
  if (isResolving || shouldRedirectToOnboarding) {
    return <VamoFullScreenLoader label={
      onboardingFlag ? "Preparando tu panel..." :
      shouldRedirectToOnboarding ? "Cargando onboarding..." : 
      "Validando sesión..."
    } />;
  }

  const activeRole = role || profile?.role;

  if (!user || (!profile && !role && !isProfileCompletion)) {
    console.log("[AUTH_GUARD_BLOCK_DASHBOARD] Rendering redirect state (No User/Profile)");
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  if (activeRole && allowedRoles.length > 0 && activeRole !== 'superadmin' && !allowedRoles.includes(activeRole)) {
    console.log("[AUTH_GUARD_BLOCK_DASHBOARD] Rendering redirect state (Unauthorized Role)");
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  return <>{children}</>;
}
