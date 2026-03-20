'use client';

import React from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from 'react';
import { useFCM } from '@/hooks/useFCM';
import { PushNotificationPrompt } from '@/components/PushNotificationPrompt';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
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

const MAX_ACCURACY_METERS = 40;
const MIN_DISTANCE_UPDATE_METERS = 25;

function DriverLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading: isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  useFCM();

  const { loading: isSearchingForRides, error: rideSearchError } = useDriverDashboard();
  const { activeRide, isRideLoading } = useActiveRide(profile?.activeRideId);

  const lastPositionRef = useRef<{lat: number, lng: number} | null>(null);
  const [hostname, setHostname] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setHostname(window.location.hostname);
  }, []);

  const criticalError = rideSearchError ?? (activeRide === undefined ? "Error loading active ride data." : null);

  if (criticalError && criticalError.includes('Missing or insufficient permissions')) {
    return (
       <div className="flex h-screen items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-2xl">
          <VamoIcon name="alert-triangle" className="h-4 w-4" />
          <AlertTitle>Error Crítico de Permisos de Firestore</AlertTitle>
          <AlertDescription>
              <>
                <p>La aplicación no puede conectarse a la base de datos. Este es un problema de configuración muy común cuando se despliega la aplicación por primera vez.</p>
                <p className="mt-4 font-semibold">Causa Más Probable: Restricciones de Clave de API</p>
                <p className="text-xs text-muted-foreground">Por defecto, las claves de API de Firebase pueden estar restringidas para funcionar solo en `localhost`. Debes autorizar el dominio de tu aplicación desplegada.</p>
                <ol className="list-decimal list-inside mt-2 text-xs space-y-2">
                  <li>
                    Andá a la <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Consola de Google Cloud &rarr; APIs y Servicios &rarr; Credenciales</a>.
                  </li>
                  <li>
                    Buscá la clave llamada "Browser key (auto created by Firebase)" o la que coincida con tu `NEXT_PUBLIC_FIREBASE_API_KEY`. Hacé clic en ella para editarla.
                  </li>
                  {hostname && (
                    <li>
                      En la sección <strong>Restricciones de aplicación</strong>, seleccioná "Sitios web". En "Restricciones de sitios web", asegurate de que <strong>{hostname}</strong> esté en la lista de "Referentes de sitios web".
                      <div className="mt-1 p-2 bg-background rounded-md font-mono text-[10px] leading-tight">
                        {`Ejemplo de dominio a agregar: ${hostname}`}
                      </div>
                    </li>
                  )}
                  <li>Guardá los cambios. Pueden tardar unos minutos en aplicarse.</li>
                </ol>
                 <p className="mt-4 text-xs"><strong>Si el error persiste, verifica:</strong><br /> - Que las APIs "Identity Toolkit API" y "Cloud Firestore API" estén habilitadas en tu proyecto de Google Cloud.<br /> - Que tus `firestore.rules` estén configuradas como `allow read, write: if request.auth != null;` para descartar un problema de reglas.</p>
              </>
            <p className="mt-3 text-xs border-t pt-2"><strong>Detalle del Error:</strong> {criticalError}</p>
             <Button onClick={() => router.push('/login')} className="mt-4 w-full">
                Volver a Iniciar Sesión
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) router.replace('/login');
    else if (profile && profile.role !== 'driver') router.replace('/');
    else if (profile?.profileCompleted && pathname === '/driver') router.replace('/driver/rides');
  }, [profile, user, isUserLoading, pathname, router]);

  useEffect(() => {
    if (!firestore || !user?.uid || profile?.driverStatus !== 'online' || !!activeRide) {
      return;
    }
    const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);
    let locationWatchId: number | null = null;
  
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
              currentLocation: newLocation, geohash: geohash, lastSeenAt: serverTimestamp(),
           });
          lastPositionRef.current = newLocation;
        } catch(e) { console.error("Failed to update location on move", e); }
      },
      (error) => console.warn("GPS Error on watchPosition:", error.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => { if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId); };
  }, [firestore, user?.uid, profile?.driverStatus, activeRide]);

  useEffect(() => {
    if (!firestore || !user || !profile || profile.driverStatus !== 'online') return;

    const driverLocationRef = doc(firestore, 'drivers_locations', user.uid);
    const sendHeartbeat = async () => {
      try {
        await updateDoc(driverLocationRef, { lastSeenAt: serverTimestamp() });
      } catch (e) {
        console.warn("Driver location document not found, attempting to recreate it...");
        try {
          const locationData = lastPositionRef.current ? { currentLocation: lastPositionRef.current, geohash: geohashForLocation([lastPositionRef.current.lat, lastPositionRef.current.lng]) } : { currentLocation: null, geohash: null };
          await setDoc(driverLocationRef, { ...locationData, driverStatus: 'online', pendingOffers: 0, lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
       toast({ title: "Conectando...", description: "Obteniendo tu ubicación GPS..." });
       navigator.geolocation.getCurrentPosition(
         async (position) => {
           const { latitude, longitude, accuracy } = position.coords;
           if (accuracy > MAX_ACCURACY_METERS) {
             toast({ variant: 'destructive', title: 'Ubicación Imprecisa', description: `La precisión del GPS es de ${accuracy.toFixed(0)}m. Necesitamos menos de ${MAX_ACCURACY_METERS}m para conectarte.` });
             return;
           }
           const newLocation = { lat: latitude, lng: longitude };
           const geohash = geohashForLocation([latitude, longitude]);
           lastPositionRef.current = newLocation;
           try {
             await updateDoc(userProfileRef, { driverStatus: 'online', updatedAt: serverTimestamp() });
             await setDoc(driverLocationRef, { driverStatus: 'online', updatedAt: serverTimestamp(), pendingOffers: 0, currentLocation: newLocation, geohash: geohash, lastSeenAt: serverTimestamp() }, { merge: true });
             toast({ title: "¡Estás en línea!", description: "Listo para recibir viajes." });
           } catch(e) { toast({ variant: "destructive", title: "Error de base de datos", description: "No se pudo guardar tu estado." }); }
         },
         (error) => toast({ variant: 'destructive', title: 'Error de GPS', description: 'No se pudo obtener tu ubicación. Asegúrate de que el GPS esté activado y con permisos.' }),
         { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
       );
     }
  };

  if (isUserLoading || (profile?.activeRideId && isRideLoading)) {
    return (
      <div className="flex h-[50vh] w-full flex-col items-center justify-center">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando datos del conductor...</p>
      </div>
    );
  }

  if (!profile?.profileCompleted) return <main>{children}</main>;

  const shouldShowActiveRide = !!profile.activeRideId && !!activeRide;
  const shouldShowSearchIndicator = profile.driverStatus === 'online' && !shouldShowActiveRide && isSearchingForRides;

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
                      <Switch id="online-toggle" checked={profile.driverStatus === 'online'} onCheckedChange={handleOnlineToggle} disabled={!profile?.approved}/>
                  </div>
              )}
              {shouldShowSearchIndicator && (
                <div className="mb-4">
                  <Alert className="border-sky-400 bg-sky-50 dark:bg-sky-900/30">
                    <VamoIcon name="loader" className="h-4 w-4 text-sky-500 animate-spin" />
                    <AlertTitle className="text-sky-700 dark:text-sky-300">Buscando viajes...</AlertTitle>
                    <AlertDescription className="text-sky-600 dark:text-sky-500">Estás en línea. Te notificaremos en cuanto haya una nueva solicitud.</AlertDescription>
                  </Alert>
                </div>
              )}
              <div className="space-y-4 mb-4">
                <PWAInstallPrompt />
                <PushNotificationPrompt forRole="driver" />
              </div>
              <Tabs value={pathname.split('/driver/')[1] || 'rides'} onValueChange={(value) => router.push(`/driver/${value}`)} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="rides" className="gap-2"><VamoIcon name="car" /> Viajes</TabsTrigger>
                      <TabsTrigger value="earnings" className="gap-2"><VamoIcon name="wallet" /> Ganancias</TabsTrigger>
                      <TabsTrigger value="goals" className="gap-2"><VamoIcon name="target" /> Metas</TabsTrigger>
                      <TabsTrigger value="profile" className="gap-2"><VamoIcon name="user" /> Perfil</TabsTrigger>
                  </TabsList>
              </Tabs>
            </>
        )}
        <main className="mt-6">
            {shouldShowActiveRide ? <ActiveDriverRide ride={activeRide} /> : children}
        </main>
      </div>
    </>
  );
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  // This outer layout handles the absolute basics: session and role.
  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando perfil de conductor...</p>
      </div>
    );
  }

  if (!user || profile.role !== 'driver') {
      router.replace(user ? '/' : '/login');
      return null; // Render nothing while redirecting
  }

  return (
    <DriverRidesProvider>
      <DriverLayoutInner>{children}</DriverLayoutInner>
    </DriverRidesProvider>
  );
}
