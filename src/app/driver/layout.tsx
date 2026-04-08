'use client';

import React from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from 'react';
import { useFCM } from '@/hooks/useFCM';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { NotificationGate } from '@/components/NotificationGate';
import { EmailVerificationAlert } from '@/components/EmailVerificationAlert';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { DriverRidesProvider, useDriverDashboard } from '@/context/DriverRidesProvider';
import { useActiveRide } from '@/hooks/useActiveRide';
import { doc, serverTimestamp, updateDoc, setDoc } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import { CancellationModal } from '@/components/CancellationModal';
import { haversineDistance } from '@/lib/geo';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { geohashForLocation } from 'geofire-common';
import { Button } from '@/components/ui/button';
import { canDriverGoOnline } from '@/lib/eligibility';
import { DriverProgressPanel } from '@/components/DriverProgressPanel';

const MAX_ACCURACY_METERS = 3000;
const MIN_DISTANCE_UPDATE_METERS = 25;

const RAWSON_MOCK_LOCATION = { 
  lat: -43.3002, 
  lng: -65.1023, 
  address: "Mariano Moreno 650, Rawson, Chubut" 
};

/**
 * DriverLayout: THE ONLY PUBLIC ENTRY POINT.
 * Strictly implements the synchronous bypass for registration.
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // DEBUG OBLIGATORIO: Ver qué path real ve Next.js
  if (pathname) {
    console.log("PATH ACTUAL:", pathname);
    if (pathname.includes('/driver/register')) {
      return <>{children}</>;
    }
  }

  // ALL protected logic is isolated inside the AuthGuard.
  return <DriverAuthGuard>{children}</DriverAuthGuard>;
}

/**
 * DriverAuthGuard: Encapsulates all React hooks and auth side-effects.
 * This ensures the registration page never runs this logic and never redirects.
 */
function DriverAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, error } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  // Loading state (Firebase or profile)
  const isResolvingSession = loading || (!!user && !profile);

  // Guards
  useEffect(() => {
    if (error) {
        console.error('🛡️ [GUARD_ERROR] DriverLayout - User error:', error.message);
        router.replace('/login');
    }
  }, [error, router]);

  useEffect(() => {
    if (!user && !loading) {
        router.replace('/login');
        return;
    }

    if (profile?.role && profile.role !== 'driver') {
        console.warn(`🛡️ [GUARD_REDIRECT] DriverLayout - Wrong Role: ${profile.role}. Heading to continue...`);
        router.replace('/auth/continue');
        return;
    }

    // Rescue logic for hangs
    if (isResolvingSession) {
        const timer = setTimeout(() => {
            if (!profile && !!user) {
                console.warn('🛡️ [GUARD_TIMEOUT] Profile hang. Redirecting...');
                router.replace('/login');
            }
        }, 6000);
        return () => clearTimeout(timer);
    }
  }, [user, profile, isResolvingSession, router, loading]);

  if (isResolvingSession) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin"></div>
           <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse uppercase">Iniciando panel conductor</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // This part should be reached very rarely if the useEffect above works correctly,
    // but we keep it for consistency during hydration frames.
    return (
      <div className="flex h-screen items-center justify-center bg-transparent p-4 text-center">
        <div className="max-w-xs w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <VamoIcon name="lock" className="h-8 w-8 text-indigo-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Acceso Denegado</h2>
            <p className="text-zinc-500 text-sm">Debés iniciar sesión como conductor para acceder.</p>
          </div>
          <Button onClick={() => router.push('/login')} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700">
            Ir al Login
          </Button>
        </div>
      </div>
    );
  }

  if (profile?.role !== 'driver') {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-transparent">
          <div className="flex flex-col items-center gap-4">
             <div className="w-10 h-10 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin"></div>
             <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse uppercase text-center">Preparando panel conductor</p>
          </div>
        </div>
      );
  }

  console.log("🛡️ [GUARD] Access granted to Protected Driver Section.");
  // VALID SESSION & ROLE: Proceed to tracking and actual UI.
  return (
    <NotificationGate>
      <DriverRidesProvider>
        <DriverLayoutInner>{children}</DriverLayoutInner>
      </DriverRidesProvider>
    </NotificationGate>
  );
}

/**
 * DriverLayoutInner: The actual dashboard UI and tracking logic.
 */
function DriverLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  console.log("🏗️ [LAYOUT] DriverLayoutInner mounting...");
  const { user, profile } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  useFCM();

  const { error: rideSearchError, setCurrentLocation } = useDriverDashboard();
  const { activeRide, isRideLoading } = useActiveRide(profile?.activeRideId);

  const lastPositionRef = useRef<{lat: number, lng: number} | null>(null);
  const [isMockingLocation, setIsMockingLocation] = useState(false);
  const effectiveMockLocation = RAWSON_MOCK_LOCATION;

  useEffect(() => {
    if (profile?.profileCompleted && pathname === '/driver') {
      router.replace('/driver/rides');
    }
  }, [profile, pathname, router]);

  useEffect(() => {
    if (!firestore || !user?.uid || !['online', 'in_ride'].includes(profile?.driverStatus || '')) {
      return;
    }
    const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);
    let locationWatchId: number | null = null;
    console.log("📍 [TRACKING] Effect mounted. driverStatus:", profile?.driverStatus);

    if (isMockingLocation) {
        const updateMock = async () => {
            const geohash = geohashForLocation([effectiveMockLocation.lat, effectiveMockLocation.lng]);
            try {
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`⏳ [DEV-MOCK] Updating location to RAWSON: ${effectiveMockLocation.lat}, ${effectiveMockLocation.lng}`);
                }
                await updateDoc(driverLocationRef, { currentLocation: effectiveMockLocation, geohash, lastSeenAt: serverTimestamp() });
                lastPositionRef.current = effectiveMockLocation;
                setCurrentLocation(effectiveMockLocation);
            } catch(e) { console.error("Mock update failed", e); }
        };
        updateMock();
        const interval = setInterval(updateMock, 30000);
        return () => {
            console.log("📍 [TRACKING] MOCK effect cleanup");
            clearInterval(interval);
        };
    }

    locationWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (accuracy > MAX_ACCURACY_METERS) return;

        const newLocation = { lat: latitude, lng: longitude };
        const distanceMoved = lastPositionRef.current ? haversineDistance(lastPositionRef.current, newLocation) : Infinity;
        if (distanceMoved < MIN_DISTANCE_UPDATE_METERS) return;
        
        const geohash = geohashForLocation([latitude, longitude]);
        try {
          await updateDoc(driverLocationRef, { 
              currentLocation: newLocation, 
              geohash: geohash, 
              driverStatus: profile?.driverStatus || 'offline',
              lastSeenAt: serverTimestamp(),
           });
          lastPositionRef.current = newLocation;
          setCurrentLocation(newLocation);
        } catch(e) { console.error("Failed to update location on move", e); }
      },
      (error) => console.warn("GPS Error on watchPosition:", error.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => { 
        console.log("📍 [TRACKING] GPS effect cleanup");
        if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId); 
    };
  }, [firestore, user?.uid, profile?.driverStatus, activeRide, isMockingLocation, setCurrentLocation, effectiveMockLocation]);

  useEffect(() => {
    if (!firestore || !user || !profile || !['online', 'in_ride'].includes(profile.driverStatus || '')) return;

    const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);
    const sendHeartbeat = async () => {
      try {
        console.log("💓 [HEARTBEAT] Tick. Writing lastSeenAt...");
        await updateDoc(driverLocationRef, { 
          driverStatus: profile?.driverStatus || 'offline',
          lastSeenAt: serverTimestamp() 
        });
      } catch (e) {
        console.warn("Driver location document not found, attempting to recreate it...");
        try {
          const locationData = lastPositionRef.current ? { 
            currentLocation: lastPositionRef.current, 
            geohash: geohashForLocation([lastPositionRef.current.lat, lastPositionRef.current.lng]) 
          } : { 
            currentLocation: null, 
            geohash: null 
          };
          
          await setDoc(driverLocationRef, { 
            ...locationData, 
            driverStatus: 'online', 
            pendingOffers: 0, 
            approved: !!profile.approved,
            isSuspended: !!profile.isSuspended,
            lastSeenAt: serverTimestamp(), 
            updatedAt: serverTimestamp() 
          }, { merge: true });
        } catch (finalError) { console.error("Catastrophic failure: Could not recreate driver location document.", finalError); }
      }
    };
    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 20000);
    return () => clearInterval(intervalId);
  }, [firestore, user, profile]);

  const handleOnlineToggle = (isGoingOnline: boolean) => {
     if (!firestore || !user?.uid || !profile) return;
     const userProfileRef = doc(firestore, 'users', user.uid);
     const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);

     if (!isGoingOnline) {
       updateDoc(userProfileRef, { driverStatus: 'offline', updatedAt: serverTimestamp() });
       updateDoc(driverLocationRef, { driverStatus: 'offline', updatedAt: serverTimestamp() });
       toast({ title: "Te has desconectado", description: "No recibirás nuevas solicitudes." });
     } else {
       const eligibility = canDriverGoOnline(profile, user.emailVerified);
       if (!eligibility.isEligible) {
           toast({
               variant: 'destructive',
               title: 'No podés conectarte',
               description: eligibility.reason
           });
           if (eligibility.code === 'PROFILE_INCOMPLETE' || eligibility.code === 'MISSING_PHONE') {
               router.push('/driver/complete-profile');
           }
           return;
       }

       toast({ title: "Conectando...", description: isMockingLocation ? "Usando ubicación MOCK (Rawson)..." : "Obteniendo tu ubicación GPS..." });
       
       const proceedOnline = async (lat: number, lng: number) => {
          const newLocation = { lat, lng };
          const geohash = geohashForLocation([lat, lng]);
          lastPositionRef.current = newLocation;
          setCurrentLocation(newLocation);
          try {
            const updates: any = { driverStatus: 'online', updatedAt: serverTimestamp() };
            // Proactive sync for matching engine eligibility
            if (user.emailVerified && !profile.emailVerified) {
                updates.emailVerified = true;
            }
            await updateDoc(userProfileRef, updates);
            await setDoc(driverLocationRef, { 
                driverStatus: 'online', 
                updatedAt: serverTimestamp(), 
                pendingOffers: 0, 
                currentLocation: newLocation, 
                geohash: geohash, 
                approved: !!profile.approved,
                isSuspended: !!profile.isSuspended,
                lastSeenAt: serverTimestamp() 
            }, { merge: true });
            toast({ title: "¡Estás en línea!", description: isMockingLocation ? "Modo MOCK activado." : "Listo para recibir viajes." });
          } catch(e) { toast({ variant: "destructive", title: "Error de base de datos", description: "No se pudo guardar tu estado." }); }
       };

       if (isMockingLocation) {
          proceedOnline(effectiveMockLocation.lat, effectiveMockLocation.lng);
          return;
       }

       navigator.geolocation.getCurrentPosition(
         async (position) => {
           const { latitude, longitude, accuracy } = position.coords;
           if (accuracy > MAX_ACCURACY_METERS) {
             toast({ variant: 'destructive', title: 'Ubicación Imprecisa', description: `La precisión del GPS es de ${accuracy.toFixed(0)}m. Necesitamos menos de ${MAX_ACCURACY_METERS}m para conectarte.` });
             return;
           }
           proceedOnline(latitude, longitude);
         },
         (error) => toast({ variant: 'destructive', title: 'Error de GPS', description: 'No se pudo obtener tu ubicación. Asegúrate de que el GPS esté activado y con permisos.' }),
         { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
       );
     }
  };

  if (!profile?.profileCompleted) return <main>{children}</main>;

  const shouldShowActiveRide = !!profile.activeRideId && !!activeRide;

  return (
    <>
      <CancellationModal />
      <div className="container mx-auto max-w-md p-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <VamoIcon name="layout-dashboard" className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Panel Conductor</h1>
          </div>
          <ThemeSwitcher />
        </div>
        
        {!shouldShowActiveRide && (
            <>
              {profile?.approved && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-card border mb-6">
                      <div className="flex flex-col">
                          <Label htmlFor="online-toggle" className="font-semibold">{profile.driverStatus === 'online' ? "Estás En Línea" : "Estás Desconectado"}</Label>
                          <span className="text-xs text-muted-foreground">{profile.driverStatus === 'online' ? "Listo para recibir viajes." : "Activá para empezar a trabajar."}</span>
                      </div>
                       <div className="flex items-center gap-4">
                           {process.env.NODE_ENV === 'development' && (
                               <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className={`h-8 text-[10px] uppercase font-bold tracking-widest ${isMockingLocation ? 'bg-amber-500/10 text-amber-500 border-amber-500/50' : 'text-muted-foreground'}`}
                                  onClick={() => setIsMockingLocation(!isMockingLocation)}
                               >
                                   {isMockingLocation ? 'MOCK GPS: ON' : 'MOCK GPS: OFF'}
                               </Button>
                           )}
                           <Switch 
                              id="online-toggle" 
                              checked={profile.driverStatus === 'online'} 
                              onCheckedChange={handleOnlineToggle} 
                              disabled={(profile?.email?.includes('demo_') && profile?.email?.endsWith('@vamo.com')) ? false : !profile?.approved}
                           />
                       </div>
                  </div>
              )}
              <Tabs value={pathname.split('/driver/')[1] || 'rides'} onValueChange={(value) => router.push(`/driver/${value}`)} className="w-full">
                    <TabsList className="flex w-full overflow-x-auto snap-x justify-start md:justify-center gap-1 bg-secondary/50 p-1 no-scrollbar mb-2">
                        <TabsTrigger value="rides" className="gap-1.5 snap-center shrink-0 text-xs px-3"><VamoIcon name="car" className="w-4 h-4" /> Viajes</TabsTrigger>
                        <TabsTrigger value="earnings" className="gap-1.5 snap-center shrink-0 text-xs px-3"><VamoIcon name="wallet" className="w-4 h-4" /> Billetera</TabsTrigger>
                        <TabsTrigger value="profile" className="gap-1.5 snap-center shrink-0 text-xs px-3"><VamoIcon name="user" className="w-4 h-4" /> Perfil</TabsTrigger>
                        {/* Tab exclusivo para conductores express */}
                        {profile?.driverSubtype === 'express' && (
                            <TabsTrigger value="muni-status" className="gap-1.5 snap-center shrink-0 text-xs px-3">
                                <VamoIcon name="landmark" className="w-4 h-4" /> Habilitación
                                {/* Punto rojo indicador si no está activo */}
                                {profile.municipalStatus !== 'active' && (
                                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                                )}
                            </TabsTrigger>
                        )}
                    </TabsList>
              </Tabs>

              {/* Banner municipal compacto para express que no están activos */}
              {profile?.driverSubtype === 'express' && profile.municipalStatus !== 'active' && (
                  <button
                      onClick={() => router.push('/driver/muni-status')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left mb-2 hover:bg-amber-500/15 transition-colors"
                  >
                      <VamoIcon name="landmark" className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-amber-400 truncate">Habilitación municipal pendiente</p>
                          <p className="text-[10px] text-zinc-500 truncate">No podés operar hasta ser habilitado por la municipalidad</p>
                      </div>
                      <VamoIcon name="chevron-right" className="h-4 w-4 text-zinc-600 shrink-0" />
                  </button>
              )}


              <div className="space-y-4 mb-4">
                <EmailVerificationAlert />
                <PWAInstallPrompt />
              </div>
            </>
        )}
        <main className="mt-6">
            {shouldShowActiveRide ? <ActiveDriverRide ride={activeRide} /> : children}
        </main>
      </div>
    </>
  );
}
