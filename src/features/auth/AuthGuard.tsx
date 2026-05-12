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
  const { user, profile, loading } = useUser();

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
  // - we have a user but no profile yet, OR
  // - the onboarding flag is set and user hasn't been confirmed yet
  const isResolving = loading || (!!user && !profile && !isProfileCompletion) || (onboardingFlag && !user);

  // --- [VamO PRO] Strict Onboarding Status ---
  const registrationStatus = (profile as any)?.registrationStatus;
  const isPassenger = profile?.role === 'passenger';
  const isIncompletePassenger = isPassenger && registrationStatus !== 'active';
  const shouldRedirectToOnboarding = profile && isIncompletePassenger && !isProfileCompletion;

  // TODO SECURITY: remover bypass temporal de superadmin después de reparar guards por claims.
  const isSuperAdminEmergency = user?.uid === "9oOsPaBsp8XkcTLjSTEJbdzMafa2" || user?.email === "superadmin@vamo.local";

  useEffect(() => {
    if (isResolving) return;

    if (isSuperAdminEmergency) {
        console.log(`[SUPERADMIN_EMERGENCY_BYPASS] uid=${user?.uid} email=${user?.email} pathname=${pathname} allowed=true`);
        return;
    }

    const logPrefix = `[AUTH_ROUTE_DEBUG] ${pathname}`;
    const debugData = {
        uid: user?.uid,
        email: user?.email,
        pathname,
        firestoreRole: profile?.role,
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

    // 2. Profile Missing Block (for non-completion paths)
    if (!profile && !isProfileCompletion) {
      console.warn(`${logPrefix} REDIRECT: Profile missing. Target: ${fallbackPath}`, debugData);
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
    if (profile && allowedRoles.length > 0 && profile.role !== 'superadmin' && !allowedRoles.includes(profile.role)) {
      console.error(`${logPrefix} FORBIDDEN: Role ${profile.role} not in ${allowedRoles}. Target: ${fallbackPath}`, debugData);
      router.replace(fallbackPath);
      return;
    }

    // If we reach here, access is valid.
    console.log(`${logPrefix} ACCESS_GRANTED`, debugData);
  }, [user, profile, isResolving, allowedRoles, fallbackPath, router, pathname, isProfileCompletion, registrationStatus, shouldRedirectToOnboarding, onboardingFlag]);

  // Block rendering while resolving or if invalid
  if (isResolving || shouldRedirectToOnboarding) {
    return <VamoFullScreenLoader label={
      onboardingFlag ? "Preparando tu panel..." :
      shouldRedirectToOnboarding ? "Cargando onboarding..." : 
      "Validando sesión..."
    } />;
  }

  if (!user || (!profile && !isProfileCompletion)) {
    console.log("[AUTH_GUARD_BLOCK_DASHBOARD] Rendering redirect state (No User/Profile)");
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  if (profile && allowedRoles.length > 0 && profile.role !== 'superadmin' && !allowedRoles.includes(profile.role)) {
    console.log("[AUTH_GUARD_BLOCK_DASHBOARD] Rendering redirect state (Unauthorized Role)");
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  return <>{children}</>;
}
