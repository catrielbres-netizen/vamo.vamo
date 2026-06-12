/**
 * AUTH CORE — NO MODIFICAR SIN EJECUTAR TESTS DE REGRESIÓN AUTH
 */
'use client';

import React, { Component, ReactNode, useEffect, useRef, useState } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { safeFixed, formatRating } from '@/lib/formatters';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { VamoLogo } from '@/components/branding/VamoLogo';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser, useFirestore, useFunctions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import { useToast } from "@/hooks/use-toast";
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { EmailVerificationCard } from '@/components/EmailVerificationCard';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { DriverRealtimeProvider, useDriverData } from '@/context/DriverRealtimeProvider';
import { WeeklyPoolProvider } from '@/context/WeeklyPoolProvider';
import { useWeeklyPool } from '@/hooks/useWeeklyPool';
import { GlobalOfferOverlay } from '@/components/GlobalOfferOverlay';
import { useActiveRide } from '@/hooks/useActiveRide';
import { doc, serverTimestamp, updateDoc, setDoc, collection, query, where, limit, onSnapshot } from 'firebase/firestore';
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
import { DriverMissionPanel } from '@/components/DriverMissionPanel';
import { AuthGuard } from '@/features/auth/AuthGuard';
import { TermsGuard } from '@/features/auth/TermsGuard';
import { useBackNavigationLock } from '@/hooks/useBackNavigationLock';
import { NotificationToggle } from '@/components/NotificationToggle';
import { useTelemetry } from '@/lib/telemetry/TelemetryProvider';
import { cn } from '@/lib/utils';
import DriverSuspensionBanner from '@/components/driver/DriverSuspensionBanner';
import { featureFlags } from '@/config/features';
import { NotificationBell } from '@/components/NotificationBell';

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
// --- ERROR BOUNDARY FOR DRIVER DASHBOARD ---
class DriverErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("🔥 [DRIVER_CRASH_REPORT]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
          <div className="mb-6 rounded-full bg-red-500/20 p-4">
            <VamoIcon name="alert-triangle" className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="mb-2 text-2xl font-black uppercase tracking-tighter">Oops! Algo salió mal</h1>
          <p className="mb-8 text-zinc-400 text-sm max-w-xs">
            El panel del conductor encontró un error inesperado. Por favor, intentá recargar.
          </p>
          <div className="w-full space-y-3">
            <Button 
                onClick={() => window.location.reload()} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 h-14 font-black rounded-2xl"
            >
                Recargar Aplicación
            </Button>
            <div className="p-4 rounded-xl bg-zinc-900 border border-white/5 text-[10px] font-mono text-zinc-600 text-left overflow-auto max-h-32">
                {this.state.error?.message || "Unknown Runtime Error"}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DriverLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Paths that don't require AuthGuard
  const isPublicPath = pathname === '/driver' || pathname === '/driver/' || 
                       pathname?.includes('/driver/register') || 
                       pathname?.includes('/driver/login') ||
                       pathname?.includes('/driver/complete-profile') || 
                       pathname?.includes('/registro/conductor');

  if (isPublicPath) {
    return <>{children}</>;
  }

  return (
    <DriverErrorBoundary>
      <AuthGuard allowedRoles={['driver', 'admin']} fallbackPath="/driver/login">
        <DriverRealtimeProvider>
          <WeeklyPoolProvider>
            <GlobalOfferOverlay />
            <DriverLayoutWithAuth>{children}</DriverLayoutWithAuth>
          </WeeklyPoolProvider>
        </DriverRealtimeProvider>
      </AuthGuard>
    </DriverErrorBoundary>
  );
}

function DriverLayoutWithAuth({ children }: { children: ReactNode }) {
  const { user: authUser, profile, loading } = useUser();
  
  if (loading) return <VamoFullScreenLoader label="Sincronizando..." />;
  if (!authUser) return null; // Handled by AuthGuard
  if (!profile) return <VamoFullScreenLoader label="Cargando perfil..." />;
  
  // [VamO PRO] Role Isolation Guard
  if (profile.role !== 'driver' && profile.role !== 'admin') {
      return <VamoFullScreenLoader label="Sincronizando..." />;
  }

  return <DriverLayoutInner authUser={authUser} profile={profile}>{children}</DriverLayoutInner>;
}

/**
 * DriverLayoutInner: The actual dashboard UI and tracking logic.
 */
function DriverLayoutInner({ children, authUser, profile }: { children: ReactNode, authUser: any, profile: any }) {
  const { wallet, location, ready } = useDriverData();
  const { driverStats } = useWeeklyPool();
  const telemetry = useTelemetry();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const isProfileCompletion = pathname === '/driver/complete-profile';

  console.log("[DRIVER_LAYOUT_VERSION]", "fix-user-scope-2026-05-07-02");
  console.log("🏗️ [LAYOUT] DriverLayoutInner mounting... AuthUID:", authUser?.uid);
  const firestore = useFirestore();
  const functions = useFunctions();
  const { toast } = useToast();

  useEffect(() => {
    if (authUser && profile) {
        console.log("[DRIVER_GUARD_DEBUG]", {
            uid: authUser.uid,
            role: profile.role,
            profileCompleted: profile.profileCompleted,
            municipalStatus: profile.municipalStatus || "pending_municipal_review (FALLBACK)",
            approved: profile.approved,
            driverStatus: profile.driverStatus,
            cityKey: profile.cityKey,
            pathname
        });
    }
  }, [authUser, profile, pathname]);
  
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);
  const [showEmailBlock, setShowEmailBlock] = useState(false);
  const [scheduledRidesCount, setScheduledRidesCount] = useState(0);

  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const rideSearchError = null;
  
  const [watchedRideId, setWatchedRideId] = useState<string | null>(null);
  const [completedRideId, setCompletedRideId] = useState<string | null>(null);

  // [VamO PRO] Robust Active Ride Detection
  useEffect(() => {
    if (!profile?.id || !firestore) return;

    if (profile.activeRideId) {
      setWatchedRideId(profile.activeRideId);
      setCompletedRideId(null);
    }

    const q = query(
      collection(firestore, 'rides'),
      where('driverId', '==', profile.id),
      where('status', 'in', ['driver_assigned', 'driver_arrived', 'in_ride', 'paused', 'in_progress']),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const rid = snapshot.docs[0].id;
            setWatchedRideId(rid);
            setCompletedRideId(null);
        } else if (!profile.activeRideId) {
            setWatchedRideId(null);
        }
    });

    return () => unsubscribe();
  }, [profile?.id, profile?.activeRideId, firestore]);

  // [VamO PRO] Scheduled Rides Live Counter
  useEffect(() => {
    if (!firestore || !profile) return;
    const driverCity = (profile as any).operatingAreaId || (profile as any).cityKey || '';
    
    const q = query(
      collection(firestore, 'rides'),
      where('status', 'in', ['scheduled', 'searching'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const count = snap.docs.filter(d => {
        const data = d.data();

        // Excluir simulaciones
        if (data.isSimulation === true) return false;

        const cityMatch = () => {
            const c = (data.cityKey || '').toLowerCase();
            const dc = driverCity.toLowerCase();
            return !driverCity || c === dc || c.includes(dc) || dc.includes(c);
        };

        if (data.status === 'scheduled') return cityMatch();
        if (data.status === 'searching') {
            return data.interestedDriverIds?.includes(profile.id);
        }
        return false;
      }).length;
      setScheduledRidesCount(count);
    }, () => setScheduledRidesCount(0));

    return () => unsub();
  }, [profile, firestore]);

  const { activeRide, isRideLoading } = useActiveRide(watchedRideId || completedRideId);

  useEffect(() => {
    if (!watchedRideId || !activeRide) return;

    if (activeRide.status === 'completed') {
        setCompletedRideId(watchedRideId);
        setWatchedRideId(null);
    } else if (activeRide.status === 'cancelled') {
        setWatchedRideId(null);
        setCompletedRideId(null);
    }
  }, [activeRide?.status, watchedRideId]);

  const shouldShowActiveRide = (!!watchedRideId || !!completedRideId) && !!activeRide && activeRide.status !== 'cancelled';

  const lastPositionRef = useRef<{lat: number, lng: number} | null>(null);
  const [isMockingLocation, setIsMockingLocation] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    // [VamO SECURITY] Unified Onboarding Guard
    // Grace period of 4s after mount to allow Firestore to sync post-onboarding profile.
    // This prevents a false redirect to /driver/register after window.location.href redirect.
    const msSinceMounted = Date.now() - mountedAtRef.current;
    const graceElapsed = msSinceMounted > 4000;

    if (profile && !profile.profileCompleted && !pathname.includes('/driver/register') && !pathname.includes('/driver/complete-profile')) {
      if (!graceElapsed) {
        console.log("🛡️ [LAYOUT] Profile incomplete but within grace period, waiting for Firestore sync...");
        return;
      }
      console.log("🛡️ [LAYOUT] Incomplete profile detected at", pathname, ". Redirecting to onboarding...");
      router.replace('/driver/register');
      return;
    }

    // [VamO SECURITY] Auto-redirect away from root /driver if already authenticated and complete
    if (profile?.profileCompleted && (pathname === '/driver' || pathname === '/driver/')) {
      router.replace('/driver/rides');
    }
  }, [profile, pathname, router]);

  // [VamO PRO] Suspension Watcher (Force Offline)
  useEffect(() => {
    if (!profile || !firestore || !authUser?.uid) return;
    
    const isSuspended =
        profile.isSuspended === true ||
        profile.trafficSuspended === true ||
        profile.adminSuspended === true;

    if (profile.driverStatus === 'online' && isSuspended) {
        console.log("🚫 [SUSPENSION_ENFORCEMENT] Suspended. Going offline.");
        const userProfileRef = doc(firestore, 'users', authUser.uid);
        const driverLocationRef = doc(firestore, 'drivers_locations', authUser.uid);
        updateDoc(userProfileRef, { driverStatus: 'offline', updatedAt: serverTimestamp() });
        updateDoc(driverLocationRef, { driverStatus: 'offline', updatedAt: serverTimestamp() });
        toast({
            variant: 'destructive',
            title: 'Desconectado',
            description: 'Tu cuenta ha sido suspendida. No podés recibir viajes.',
        });
    }
  }, [profile?.driverStatus, profile?.isSuspended, profile?.trafficSuspended, profile?.adminSuspended, firestore, authUser?.uid, toast]);

  // [VamO PRO] Unified Geolocation Engine
  // Manages tracking, mocking, and UI state in a single effect to prevent battery drain.
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    let mockInterval: any = null;

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (accuracy > MAX_ACCURACY_METERS) return;

      const newLoc = { lat: latitude, lng: longitude };
      lastPositionRef.current = newLoc;
      setCurrentLocation(newLoc);
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn("📍 [GEO] Tracking error:", error.code, error.message);
      if (error.code === 1 && ['online', 'in_ride'].includes(profile?.driverStatus || '')) { // PERMISSION_DENIED
         toast({ 
             variant: 'destructive', 
             title: 'GPS Desactivado', 
             description: 'VamO necesita tu ubicación para que puedas recibir viajes.' 
         });
      }
    };

    if (isMockingLocation && RAWSON_MOCK_LOCATION) {
      console.log("📍 [GEO] Mocking active...");
      const updateMock = () => {
        lastPositionRef.current = RAWSON_MOCK_LOCATION;
        setCurrentLocation(RAWSON_MOCK_LOCATION);
      };
      updateMock();
      mockInterval = setInterval(updateMock, 15000);
    } else {
      console.log("📍 [GEO] Starting unified watchPosition...");
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      });
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (mockInterval) clearInterval(mockInterval);
    };
  }, [profile?.driverStatus, isMockingLocation, setCurrentLocation, RAWSON_MOCK_LOCATION, toast]);

  useEffect(() => {
    if (!firestore || !authUser?.uid || !profile || !['online', 'in_ride'].includes(profile.driverStatus || '')) return;

    const driverLocationRef = doc(firestore, 'drivers_locations', authUser.uid);
    
    const sendHeartbeat = async () => {
      const currentLoc = lastPositionRef.current;
      const geohash = currentLoc ? geohashForLocation([currentLoc.lat, currentLoc.lng]) : null;
      
      const payload: any = {
        driverStatus: profile?.driverStatus || 'offline',
        driverName: `${profile?.name || ''} ${profile?.surname || ''}`.trim() || 'Conductor',
        plateNumber: profile?.plateNumber || '',
        photoURL: profile?.photoURL || '',
        vehicle: profile?.vehicle || null,
        cityKey: profile?.operatingAreaId || profile?.cityKey || '',
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isStale: false 
      };

      if (currentLoc) {
        payload.currentLocation = currentLoc;
        payload.geohash = geohash;
      }

      console.log("💓 [HEARTBEAT] Syncing...", { status: payload.driverStatus, hasLoc: !!currentLoc });

      try {
        await setDoc(driverLocationRef, payload, { merge: true });
        
        // Track Presence in Telemetry (Throttled to 60s internally)
        telemetry.trackPresence('driver', authUser.uid, payload.cityKey, profile?.driverStatus === 'online');
      } catch (e) {
        console.error("💓 [HEARTBEAT] Sync failed:", e);
      }
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 60000); // 60s (Cost Optimized)
    return () => clearInterval(intervalId);
  }, [firestore, authUser?.uid, profile, telemetry]);

  const handleOnlineToggle = async (isGoingOnline: boolean) => {
     if (!firestore || !authUser?.uid || !profile || !functions) return;
     
     const statusLog = {
         uid: authUser.uid,
         role: profile.role,
         approved: profile.approved,
         municipalStatus: profile.municipalStatus,
         profileCompleted: profile.profileCompleted,
         currentDriverStatus: profile.driverStatus,
         nextDriverStatus: isGoingOnline ? 'online' : 'offline'
     };
     console.log("[DRIVER_STATUS_DEBUG] Toggle triggered:", statusLog);

     if (!isGoingOnline) {
       try {
         const updateStatus = httpsCallable(functions, 'updateDriverStatusV1');
         await updateStatus({ status: 'offline' });
         telemetry.trackPresence('driver', authUser.uid, profile.cityKey || 'unknown', false);
         toast({ title: "Te has desconectado", description: "No recibirás nuevas solicitudes." });
       } catch (e: any) {
         console.error("[STATUS_ERR] Failed to go offline:", e);
         telemetry.trackError('driver_offline_failed', e);
         toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar tu estado a desconectado." });
       }
     } else {
        const eligibility = canDriverGoOnline(profile, authUser.emailVerified);
        if (!eligibility.isEligible) {
            if (eligibility.code === 'TERMS_NOT_ACCEPTED') {
                setShowTerms(true);
                return;
            }
            if (eligibility.code === 'UNVERIFIED_EMAIL') {
                setShowEmailBlock(true);
                toast({
                    variant: 'destructive',
                    title: 'Email no verificado',
                    description: 'Necesitás verificar tu cuenta para empezar a trabajar.'
                });
                return;
            }
            if (eligibility.code === 'PROFILE_INCOMPLETE' || eligibility.code === 'MISSING_PHONE') {
                router.push('/driver/register');
                return;
            }
            if (eligibility.code === 'VEHICLE_INCOMPLETE') {
                toast({
                    variant: 'destructive',
                    title: 'Vehículo Incompleto',
                    description: eligibility.reason || 'Completá los datos de tu vehículo.'
                });
                router.push('/driver/complete-profile');
                return;
            }
            
            // Fallback for other errors (like MUNICIPAL_REQUIRED)
            toast({
                variant: 'destructive',
                title: 'No podés conectarte',
                description: eligibility.reason || 'Revisá el estado de tu cuenta.'
            });
            return;
        }

       toast({ title: "Conectando...", description: isMockingLocation ? "Usando ubicación de prueba..." : "Obteniendo tu ubicación GPS..." });
       
        const proceedOnline = async (lat: number, lng: number) => {
           const newLocation = { lat, lng };
           const geohash = geohashForLocation([lat, lng]);
           lastPositionRef.current = newLocation;
           setCurrentLocation(newLocation);
           try {
             const updateStatus = httpsCallable(functions!, 'updateDriverStatusV1');
             telemetry.trackPresence('driver', authUser!.uid, profile.cityKey || 'unknown', true);
             await updateStatus({ 
                 status: 'online',
                 location: newLocation
             });
             
             toast({ title: "¡Estás en línea!", description: isMockingLocation ? "Modo MOCK activado." : "Listo para recibir viajes." });
           } catch(e: any) { 
             console.error("[STATUS_ERR] Failed to go online:", e);
             telemetry.trackError('driver_online_failed', e, { location: newLocation });
             toast({ 
                 variant: "destructive", 
                 title: "No podés conectarte", 
                 description: e.message || "Error al sincronizar tu estado con el servidor." 
             }); 
           }
        };

       if (isMockingLocation && RAWSON_MOCK_LOCATION) {
          proceedOnline(RAWSON_MOCK_LOCATION.lat, RAWSON_MOCK_LOCATION.lng);
          return;
       }

       navigator.geolocation.getCurrentPosition(
         async (position) => {
           const { latitude, longitude, accuracy } = position.coords;
           if (accuracy > MAX_ACCURACY_METERS) {
             toast({ variant: 'destructive', title: 'Ubicación Imprecisa', description: `La precisión del GPS es de ${safeFixed(accuracy, 0)}m. Necesitamos menos de ${MAX_ACCURACY_METERS}m para conectarte.` });
             return;
           }
           proceedOnline(latitude, longitude);
         },
         (error) => toast({ variant: 'destructive', title: 'Error de GPS', description: 'No se pudo obtener tu ubicación. Asegúrate de que el GPS esté activado y con permisos.' }),
         { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
       );
     }
  };

  const handleSendVerification = async () => {
    if (!authUser) return;
    setIsVerifyingEmail(true);
    try {
        const { sendEmailVerification } = await import('firebase/auth');
        await sendEmailVerification(authUser);
        toast({ title: 'Email enviado', description: `Revisá tu casilla ${authUser.email} (incluyendo Spam).` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: e.message || 'No se pudo enviar el email.' });
    } finally {
        setIsVerifyingEmail(false);
    }
  };

  const handleReloadAuth = async () => {
    if (!authUser) return;
    setIsRefreshingAuth(true);
    try {
        await authUser.reload();
        if (authUser.emailVerified) {
            toast({ title: '¡Email verificado!', description: 'Ya podés conectarte.' });
            setShowEmailBlock(false);
        } else {
            toast({ variant: 'destructive', title: 'Aún no verificado', description: 'Revisá tu bandeja de entrada y hacé click en el link.' });
        }
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
    } finally {
        setIsRefreshingAuth(false);
    }
  };

  useBackNavigationLock(!!shouldShowActiveRide);

  // Navigation lock is handled by useBackNavigationLock and hidden tabs.

  if (!profile?.profileCompleted) return <main>{children}</main>;

  const isSuspended =
    profile.isSuspended === true ||
    profile.trafficSuspended === true ||
    profile.municipalSuspended === true ||
    profile.adminSuspended === true;

  return (
    <>
      <TermsGuard 
          forced={showTerms} 
          onClose={() => setShowTerms(false)} 
      />
      <CancellationModal />
      <div className="container mx-auto max-w-md p-4">
        <DriverSuspensionBanner profile={profile} />
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-sm text-muted-foreground">Hola, {profile?.name} 👋</p>
            <div className="flex items-center gap-1.5 mt-0.5">
               <VamoIcon name="star" className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
               <span className="font-bold text-sm text-foreground">{formatRating(profile?.averageRating)}</span>
               <span className="text-muted-foreground mx-1">•</span>
               <span className="font-medium text-sm">📍 {profile?.city || 'VamO'}</span>
               
               {/* [VamO PRO] Weekly Points Badge */}
               <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 animate-in fade-in zoom-in duration-700">
                  <VamoIcon name="award" className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-black text-primary">
                    {driverStats?.weeklyPoints || 0} pts
                  </span>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
              <ThemeSwitcher />
              <NotificationBell role="driver" />
          </div>
        </div>
        
        {!shouldShowActiveRide && (
            <>
              {(profile?.profileCompleted) && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-card border mb-6">
                      <div className="flex flex-col">
                          <Label htmlFor="online-toggle" className="font-semibold">{profile.driverStatus === 'online' ? "Estás En Línea" : "Estás Desconectado"}</Label>
                          <span className="text-xs text-muted-foreground">
                              {isSuspended 
                                  ? "No podés conectarte porque tu cuenta está suspendida." 
                                  : (profile.driverStatus === 'online' ? "Listo para recibir viajes." : "Activá para empezar a trabajar.")}
                          </span>
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
                              disabled={
                                  !profile?.profileCompleted || 
                                  profile.driverRiskLevel === 'blocked' || 
                                  (profile.currentBalance ?? 0) <= (profile.driverSubtype === 'professional' ? -15000 : -8000) ||
                                  isSuspended
                              }
                           />
                       </div>
                  </div>
              )}
              
              {/* [VamO PRO] Unified Driver Status Banner */}
              {profile && (() => {
                  const balance = profile.currentBalance ?? 0;
                  const negativeLimit = profile.driverSubtype === 'professional' ? -15000 : -8000;
                  const riskLevel = profile.driverRiskLevel || 'low';
                  const isBlocked = riskLevel === 'blocked' || balance <= negativeLimit;
                  
                  // Priority 1: Blocked (either by risk engine or hard wallet limit)
                  if (isBlocked) {
                      return (
                          <div className="p-4 rounded-2xl mb-4 border border-red-500/20 bg-red-500/10 text-red-500 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                              <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                                  <VamoIcon name="alert-circle" className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="font-bold text-sm leading-tight">Cuenta restringida</p>
                                  <p className="text-[10px] opacity-80 mt-0.5">Tu cuenta requiere regularización para seguir operando.</p>
                                  {profile.riskReasons && profile.riskReasons.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                          {profile.riskReasons.slice(0, 2).map((r: string, i: number) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded-md bg-black/5 text-[8px] font-bold uppercase tracking-wider border border-current/10">{r}</span>
                                          ))}
                                      </div>
                                  )}
                              </div>
                              <Button size="sm" variant="ghost" className="h-8 rounded-lg bg-white/5 hover:bg-white/10 font-bold text-xs" onClick={() => router.push(profile.riskReasons?.some((r: string) => r.includes('deuda') || r.includes('Saldo')) ? '/driver/earnings' : '/driver/muni-status')}>Ver</Button>
                          </div>
                      );
                  }

                  // Priority 2: Medium/High Risk
                  if (riskLevel !== 'low') {
                      const isHigh = riskLevel === 'high';
                      return (
                        <div className={`p-4 rounded-2xl mb-4 border flex items-center gap-4 shadow-sm transition-all animate-in fade-in slide-in-from-top-2 ${
                            isHigh ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                        }`}>
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isHigh ? 'bg-orange-500/20' : 'bg-amber-500/20'}`}>
                                <VamoIcon name="alert-circle" className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm leading-tight">Atención requerida</p>
                                <p className="text-[10px] opacity-80 mt-0.5">Revisá tu estado para evitar restricciones en el servicio.</p>
                                {profile.riskReasons && profile.riskReasons.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {profile.riskReasons.slice(0, 2).map((r: string, i: number) => (
                                            <span key={i} className="px-1.5 py-0.5 rounded-md bg-black/5 text-[8px] font-bold uppercase tracking-wider border border-current/10">{r}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <Button size="sm" variant="ghost" className="h-8 rounded-lg bg-white/5 hover:bg-white/10 font-bold text-xs" onClick={() => router.push(profile.riskReasons?.some((r: string) => r.includes('deuda') || r.includes('Saldo')) ? '/driver/earnings' : '/driver/muni-status')}>Ver</Button>
                        </div>
                      );
                  }

                  // Priority 3: Negative Balance (Low Risk)
                  if (balance < 0) {
                      return (
                          <div className="p-4 rounded-2xl mb-4 border border-amber-500/20 bg-amber-500/10 text-amber-500 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                              <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                                  <VamoIcon name="alert-circle" className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <p className="font-bold text-sm leading-tight">Saldo negativo</p>
                                  <p className="text-[10px] opacity-80 mt-0.5">Recordá recargar para evitar suspensiones automáticas.</p>
                              </div>
                              <Button size="sm" variant="ghost" className="h-8 rounded-lg bg-white/5 hover:bg-white/10 font-bold text-xs" onClick={() => router.push('/driver/earnings')}>Recargar</Button>
                          </div>
                      );
                  }

                  return null;
              })()}
              
              <NotificationToggle />

              <Tabs value={pathname.split('/driver/')[1] || 'rides'} className="w-full">
                    <TabsList className="flex flex-wrap w-full justify-center gap-1 bg-secondary/50 p-1 mb-2 h-auto">
                        <TabsTrigger value="rides" asChild>
                            <Link href="/driver/rides" className="gap-1.5 text-xs px-3 py-1.5 flex items-center justify-center">
                                <VamoIcon name="car" className="w-4 h-4" /> Viajes
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="reservations" asChild>
                            <Link
                                href="/driver/reservations"
                                className={cn(
                                    "gap-1.5 text-xs px-3 py-1.5 flex items-center justify-center relative transition-all duration-300",
                                    scheduledRidesCount > 0
                                        ? "bg-indigo-600 text-white rounded-md shadow-[0_0_12px_rgba(99,102,241,0.5)] font-black"
                                        : ""
                                )}
                            >
                                <VamoIcon
                                    name="calendar"
                                    className={cn(
                                        "w-4 h-4 transition-all",
                                        scheduledRidesCount > 0 ? "text-white animate-pulse" : ""
                                    )}
                                />
                                Reservas
                                {scheduledRidesCount > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                                        <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-indigo-700 font-black" style={{ fontSize: '8px' }}>
                                            {scheduledRidesCount > 9 ? '9+' : scheduledRidesCount}
                                        </span>
                                    </span>
                                )}
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="history" asChild>
                            <Link href="/driver/history" className="gap-1.5 text-xs px-3 py-1.5 flex items-center justify-center">
                                <VamoIcon name="clock" className="w-4 h-4" /> Historial
                            </Link>
                        </TabsTrigger>
                        <TabsTrigger value="earnings" asChild>
                            <Link href="/driver/earnings" className="gap-1.5 text-xs px-3 py-1.5 flex items-center justify-center">
                                <VamoIcon name="wallet" className="w-4 h-4" /> Billetera
                            </Link>
                        </TabsTrigger>
                        {featureFlags.municipalModeEnabled && (
                            <TabsTrigger value="muni-status" asChild>
                                <Link href="/driver/muni-status" className="gap-1.5 text-xs px-3 py-1.5 flex items-center justify-center">
                                    <VamoIcon name="landmark" className="w-4 h-4" /> Habilitación
                                </Link>
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="profile" asChild>
                            <Link href="/driver/profile" className="gap-1.5 text-xs px-3 py-1.5 flex items-center justify-center">
                                <VamoIcon name="user" className="w-4 h-4" /> Perfil
                            </Link>
                        </TabsTrigger>
                    </TabsList>
              </Tabs>


              <div className="space-y-4 mb-4">
                {profile?.profileCompleted && <EmailVerificationCard />}
                <PWAInstallPrompt />
              </div>
            </>
        )}
        <main className="mt-6">
            {shouldShowActiveRide ? (
              <ActiveDriverRide 
                ride={activeRide} 
                onClose={() => setCompletedRideId(null)} 
              />
            ) : children}
        </main>
      </div>
    </>
  );
}
