
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { PassengerHeader } from '@/components/PassengerHeader';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Ride, UserProfile } from '@/lib/types';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { EmailVerificationAlert } from '@/components/EmailVerificationAlert';
import { PassengerDataProvider } from '@/context/PassengerDataProvider';
import { VISUALLY_LOCKED_STATUSES } from '@/lib/ride-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NotificationGate } from '@/components/NotificationGate';
import { EmailVerificationGate } from '@/components/EmailVerificationGate';
import { TermsGuard } from '@/components/TermsGuard';
import { useToast } from '@/hooks/use-toast';

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


  if (profile.activeRideId && isRideLoading) {
     return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando datos de viaje...</p>
      </div>
    );
  }

  const isVisuallyLocked = ride && VISUALLY_LOCKED_STATUSES.includes(ride.status);
  const activeTabValue = pathname.split('/dashboard/')[1] || 'ride';
  const activeTab = activeTabValue.split('/')[0];
  const handleTabChange = (value: string) => router.push(`/dashboard/${value}`);
  const userName = profile.name || (user.isAnonymous ? "Invitado" : user.displayName || "Usuario");
  
  return (
      <PassengerDataProvider>
          <div className="container mx-auto max-w-md p-4">
              <PassengerHeader userName={userName} location="Rawson, Chubut" />
              <div className="space-y-4 my-4">
                  <PWAInstallPrompt />
              </div>
              {!isVisuallyLocked && (
                  <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                      <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="ride" className="gap-2">
                              <VamoIcon name="car" className="w-4 h-4" /> Viaje
                          </TabsTrigger>
                          <TabsTrigger value="history" className="gap-2">
                              <VamoIcon name="file-text" className="w-4 h-4" /> Historial
                          </TabsTrigger>
                          <TabsTrigger value="info" className="gap-2">
                              <VamoIcon name="info" className="w-4 h-4" /> Info
                          </TabsTrigger>
                          <TabsTrigger value="profile" className="gap-2">
                              <VamoIcon name="user" className="w-4 h-4" /> Perfil
                          </TabsTrigger>
                      </TabsList>
                  </Tabs>
              )}
              <main className={isVisuallyLocked ? 'mt-6' : ''}>{children}</main>
          </div>
      </PassengerDataProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, profile, loading, error } = useUser();
  const [hostname, setHostname] = useState('');

  // 1. Loading state (Authenticating or Fetching Profile)
  const isResolvingSession = loading || (!!user && !profile);

  // --- RULES OF HOOKS: All effects MUST be at the top level ---

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostname(window.location.hostname);
    }
  }, []);

  useEffect(() => {
    // Stage 1: Wait.
    if (loading || !profile) return;
    
    // Stage 2: Final Resolution.
    console.log("🛡️ [GUARD_CHECK] Dashboard - User:", user?.uid, "Role:", (profile as any)?.role);
  }, [loading, user, profile]);

  useEffect(() => {
    if (error && !isResolvingSession) {
        console.error('🛡️ [GUARD_ERROR] DashboardLayout - User error:', error.message);
        // We only redirect if it's not a recoverable permission error (which is handled later)
        if (error.message && !error.message.includes('Missing or insufficient permissions')) {
            router.replace('/login');
        }
    }
  }, [error, isResolvingSession, router]);

  useEffect(() => {
    // Rescue logic: If after 6 seconds we are still "resolving", go to login to break potential hang
    if (!isResolvingSession) return;

    const timer = setTimeout(() => {
        if (!profile && !!user) {
            console.warn('🛡️ [GUARD_TIMEOUT] DashboardLayout - Profile hang. Redirecting...');
            router.replace('/login');
        }
    }, 6000);
    return () => clearTimeout(timer);
  }, [user, profile, isResolvingSession, router]);

  useEffect(() => {
    // Role Rescue: If you end up in passenger layout but you are NOT a passenger
    if (profile?.role && profile.role !== 'passenger') {
        console.warn(`🛡️ [GUARD_REDIRECT] DashboardLayout - Wrong Role: ${profile.role}. Heading to continue...`);
        router.replace('/auth/continue');
    }
  }, [profile?.role, router]);

  // --- CONDITIONAL RENDERS ---

  if (error) {
    // If the error is a permission error on a specific document,
    // it's likely a stale reference (e.g., activeRideId) that will be self-healed
    // by a child component. We don't want to block rendering with a fatal error screen.
    const errorMessage = error?.message || 'Error desconocido';
    if (errorMessage.includes('Missing or insufficient permissions')) {
        console.warn("Caught a recoverable permission error in DashboardLayout, allowing child components to self-heal:", errorMessage);
        // We render the loader here to wait for the self-healing to complete and trigger a re-render.
        return (
          <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
            <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
            <p className="mt-4 text-muted-foreground">Corrigiendo estado del viaje...</p>
          </div>
        );
    } else {
        // For any other error (e.g., auth, network), render the fatal error screen.
        return (
          <div className="flex h-screen items-center justify-center p-4">
            <Alert variant="destructive" className="max-w-2xl">
              <VamoIcon name="alert-triangle" className="h-4 w-4" />
              <AlertTitle>Error de Conexión con Firebase</AlertTitle>
              <AlertDescription>
                  <>
                    <p>No se pudo conectar con los servicios de Firebase. Este es un problema de configuración muy común cuando se despliega la aplicación por primera vez.</p>
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
                    <p className="mt-4 text-xs"><strong>Si el error persiste, verifica:</strong><br /> - Que las APIs "Identity Toolkit API" y "Cloud Firestore API" estén habilitadas en tu proyecto de Google Cloud.<br /> - Que la `NEXT_PUBLIC_FIREBASE_API_KEY` en tu archivo de configuración de entorno sea la correcta.</p>
                  </>
                <p className="mt-3 text-xs border-t pt-2"><strong>Detalle del Error:</strong> {errorMessage}</p>
                 <Button onClick={() => router.push('/login')} className="mt-4 w-full">
                    Volver a Iniciar Sesión
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        );
    }
  }
  
  if (isResolvingSession) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212]">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
           <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse uppercase">Verificando sesión</p>
        </div>
      </div>
    );
  }

  // 2. NO SESSION: User is not logged in.
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#121212] p-4 text-center">
        <div className="max-w-xs w-full space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
            <VamoIcon name="lock" className="h-8 w-8 text-indigo-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Acceso Denegado</h2>
            <p className="text-zinc-500 text-sm">Debés iniciar sesión para acceder a esta sección.</p>
          </div>
          <Button onClick={() => router.push('/login')} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700">
            Ir al Login
          </Button>
        </div>
      </div>
    );
  }

  // 3. TRANSITION / WRONG ROLE: 
  // If we have a profile but it's not passenger, we STAY on the loader for a bit
  // instead of showing a scary "Wrong Role" screen, as it might be a hydration flicker.
  const isPassenger = (profile as any)?.role === 'passenger';
  if (!isPassenger) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#121212]">
        <div className="flex flex-col items-center gap-4">
           <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
           <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px] animate-pulse uppercase">Preparando panel</p>
        </div>
      </div>
    );
  }

  // If we get here: loading=false, user=exists, profile=exists, role='passenger'.
  const resolvedProfile = profile!;
  const resolvedUser = user!;

  // Handle Incomplete Profile
  if (!resolvedProfile.profileCompleted) {
      return <main>{children}</main>;
  }
  
  // Render the full dashboard for an authenticated, valid passenger
  return (
    <TermsGuard>
        <EmailVerificationGate>
            <NotificationGate>
              <PassengerDashboard user={resolvedUser} profile={resolvedProfile}>{children}</PassengerDashboard>
            </NotificationGate>
        </EmailVerificationGate>
    </TermsGuard>
  );
}
