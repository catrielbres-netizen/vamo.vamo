
/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { PassengerHeader } from '@/components/PassengerHeader';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Ride, UserProfile } from '@/lib/types';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { PassengerDataProvider } from '@/context/PassengerDataProvider';
import { VISUALLY_LOCKED_STATUSES } from '@/lib/ride-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmailVerificationGate } from '@/components/EmailVerificationGate';
import { TermsGuard } from '@/features/auth/TermsGuard';
import { useToast } from '@/hooks/use-toast';
import { useBackNavigationLock } from '@/hooks/useBackNavigationLock';
import { PassengerLoyaltyCard } from '@/components/PassengerLoyaltyCard';
import { AuthGuard } from '@/features/auth/AuthGuard';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import { PassengerDashboardSkeleton } from '@/components/skeletons/PassengerDashboardSkeleton';

// This component contains the actual UI, only rendered when `profile` is guaranteed to exist.
function PassengerDashboard({ children, profile, user }: { children: React.ReactNode, profile: UserProfile, user: NonNullable<ReturnType<typeof useUser>['user']> }) {
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const { toast } = useToast();

  const activeRideRef = useMemoFirebase(() => {
    if (!firestore || !profile.activeRideId) return null;
    return doc(firestore, 'rides', profile.activeRideId);
  }, [firestore, profile.activeRideId]);

  const { data: ride, isLoading: isRideLoading, error: rideError } = useDoc<Ride>(activeRideRef);

  // SELF-HEALING LOGIC: If the user has a stale activeRideId, clear it automatically.
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (!isRideLoading && profile.activeRideId && !ride && !rideError && firestore && user) {
        timer = setTimeout(() => {
            const userRef = doc(firestore, 'users', user.uid);
            updateDoc(userRef, { activeRideId: null })
                .catch(err => {
                    console.error("Failed to clear stale activeRideId:", err);
                    toast({
                        variant: 'destructive',
                        title: 'Error de Sincronización',
                        description: 'No pudimos corregir un viaje activo inválido. Por favor, recargá la página.'
                    });
                });
        }, 10000);
    }

    return () => {
        if (timer) clearTimeout(timer);
    };
  }, [isRideLoading, ride, rideError, profile.activeRideId, firestore, user, toast]);

  const isVisuallyLocked = ride && VISUALLY_LOCKED_STATUSES.includes(ride.status);
  useBackNavigationLock(!!isVisuallyLocked);

  // [PASSENGER_PRESENCE_HEARTBEAT]
  const telemetry = useTelemetry();
  useEffect(() => {
    if (!firestore || !user?.uid || profile.role !== 'passenger') return;

    const userRef = doc(firestore, 'users', user.uid);
    
    const updatePresence = async (isOnline: boolean) => {
        try {
            // 1. Update Real-time Status (For Muni Dashboard queries)
            await updateDoc(userRef, {
                isOnline,
                lastActiveAt: new Date(),
                ...(isOnline ? {} : { lastSeenAt: new Date() })
            });

            // 2. Track Operational Telemetry (For historical/funnel analysis)
            // Throttled inside TelemetryService to 60s
            telemetry.trackPresence('passenger', user.uid, profile.cityKey || 'unknown', isOnline);
        } catch (err) {
            console.error("Presence update failed:", err);
        }
    };

    // Initial Online
    updatePresence(true);

    // Heartbeat every 60 seconds (Cost Optimized)
    const interval = setInterval(() => updatePresence(true), 60000);

    return () => {
        clearInterval(interval);
        updatePresence(false);
    };
  }, [firestore, user?.uid, profile.role, profile.cityKey, telemetry]);

  // LOCK EFFECT: Force redirect to ride page if we are somewhere else by force (e.g. typing URL)
  useEffect(() => {
    if (isVisuallyLocked && !pathname.startsWith('/dashboard/ride')) {
       router.replace('/dashboard/ride');
    }
  }, [isVisuallyLocked, pathname, router]);


  if (profile.activeRideId && isRideLoading) {
     return <VamoFullScreenLoader label="Cargando datos de viaje..." />;
  }


  const activeTabValue = pathname.split('/dashboard/')[1] || 'ride';
  const activeTab = activeTabValue.split('/')[0];
  const handleTabChange = (value: string) => router.push(`/dashboard/${value}`);
  const userName = profile.name || (user.isAnonymous ? "Invitado" : user.displayName || "Usuario");
  
  return (
      <div className="container mx-auto max-w-md p-4">
          <PassengerHeader userName={userName} location={profile?.city || ""} />
          <div className="space-y-4 my-4">
              <PWAInstallPrompt />
              {!isVisuallyLocked && <PassengerLoyaltyCard />}
          </div>
          {!isVisuallyLocked && (
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="ride" className="gap-2">
                          <VamoIcon name="car" className="w-4 h-4" /> Inicio
                      </TabsTrigger>
                      <TabsTrigger value="history" className="gap-2">
                          <VamoIcon name="file-text" className="w-4 h-4" /> Viajes
                      </TabsTrigger>
                      <TabsTrigger value="rewards" className="gap-2">
                          <VamoIcon name="gift" className="w-4 h-4" /> Premios
                      </TabsTrigger>
                      <TabsTrigger value="wallet" className="gap-2">
                          <VamoIcon name="wallet" className="w-4 h-4" /> Billetera
                      </TabsTrigger>
                      <TabsTrigger value="profile" className="gap-2">
                          <VamoIcon name="user" className="w-4 h-4" /> Perfil
                      </TabsTrigger>
                  </TabsList>
              </Tabs>
          )}
          <main className={isVisuallyLocked ? 'mt-6' : ''}>
              {isVisuallyLocked && !pathname.startsWith('/dashboard/ride') ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground animate-pulse">
                      <VamoIcon name="alert-circle" className="w-8 h-8 mb-4 opacity-50" />
                      <p>Volviendo a tu viaje activo...</p>
                  </div>
              ) : children}
          </main>
      </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = useUser();
  const pathname = usePathname();

  return (
    <AuthGuard allowedRoles={['passenger', 'admin']} fallbackPath="/login">
      <PassengerDataProvider>
          <TermsGuard>
              {profile?.profileCompleted && (profile.role === 'passenger' || profile.role === 'admin') ? (
                  <EmailVerificationGate>
                      <PassengerDashboard user={user!} profile={profile}>{children}</PassengerDashboard>
                  </EmailVerificationGate>
              ) : (
                  <div className="container mx-auto max-w-md p-4 space-y-4">
                       {/* [VamO PRO] Unified loading state to avoid role flashes */}
                       {pathname?.includes('complete-profile') ? (
                           <main>{children}</main>
                       ) : (
                           <PassengerDashboardSkeleton />
                       )}
                  </div>
              )}
          </TermsGuard>
      </PassengerDataProvider>
    </AuthGuard>
  );
}
