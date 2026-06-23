'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { AuthShell } from '@/features/auth/AuthShell';
import { PassengerRegisterForm } from '@/features/auth/PassengerRegisterForm';
import { PWAInstallationGate } from '@/components/auth/PWAInstallationGate';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  const { user, profile, loading } = useUser();
  const [showTimeoutError, setShowTimeoutError] = React.useState(false);
  const [forcedReady, setForcedReady] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    // Safety timeout: 5 seconds
    const timer = setTimeout(() => {
        if (loading) {
            console.warn("[AUTH_TIMEOUT] Session verification taking too long (Register). Unlocking UI.");
            setShowTimeoutError(true);
            setForcedReady(true);
        }
    }, 5000);

    if (!loading && user && profile && (profile.role === 'passenger' || profile.role === 'admin')) {
      router.replace('/dashboard');
    }

    return () => clearTimeout(timer);
  }, [user, profile, loading, router]);

  if ((loading && !forcedReady) || (user && profile)) {
    return (
        <div className="relative h-screen w-full">
            <VamoFullScreenLoader label="Verificando sesión..." />
            {showTimeoutError && (
                <div className="fixed inset-x-0 bottom-24 z-[10000] flex flex-col items-center px-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-2xl max-w-xs w-full text-center space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Estamos teniendo problemas para iniciar la aplicación
                        </p>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full h-11 border-white/10 text-white rounded-xl font-bold uppercase tracking-widest text-[10px]"
                            onClick={() => window.location.reload()}
                        >
                            REINTENTAR AHORA
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
  }

  return (
    <PWAInstallationGate>
        <AuthShell 
          title="Unite a VamO" 
          subtitle="Creá tu cuenta de pasajero en segundos y empezá a moverte de forma inteligente."
        >
          <PassengerRegisterForm />
        </AuthShell>
    </PWAInstallationGate>
  );
}
