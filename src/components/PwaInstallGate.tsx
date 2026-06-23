'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useUser } from '@/firebase/auth/use-user';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';

export function PwaInstallGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, profile } = useUser();
  const { canInstall, triggerInstall } = usePWAInstall();
  const [isStandalone, setIsStandalone] = useState(true); // default true to prevent flicker before check
  const [isIOS, setIsIOS] = useState(false);
  const [hasJustInstalled, setHasJustInstalled] = useState(false);
  const [checkingManual, setCheckingManual] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);

  // Determine if the current route is protected
  const isPassenger = pathname === '/login' || pathname === '/register' || pathname.startsWith('/dashboard/ride') || pathname.startsWith('/pasajero');
  const isDriver = pathname.startsWith('/driver');
  const shouldProtect = isPassenger || isDriver;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (sessionStorage.getItem('vamo_pwa_gate_bypass_session') === 'true') {
      setIsBypassed(true);
    }

    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Function to check if app is running as standalone
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isStandaloneNavigator = (navigator as any).standalone === true;
      setIsStandalone(isStandaloneMedia || isStandaloneNavigator);
    };

    checkStandalone();

    // Listen for display mode changes (e.g., user installs and opens it)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsStandalone(true);
        setHasJustInstalled(true);
      }
    };
    
    mediaQuery.addEventListener('change', handleMediaChange);

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setHasJustInstalled(true);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Try to close window if installed
  useEffect(() => {
    if (hasJustInstalled) {
      try {
        window.close();
      } catch (e) {
        // Ignore error if it fails
      }
    }
  }, [hasJustInstalled]);

  const handleManualCheck = () => {
    setCheckingManual(true);
    // Re-check standalone status
    const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
    const isStandaloneNavigator = (navigator as any).standalone === true;
    
    if (isStandaloneMedia || isStandaloneNavigator) {
      setIsStandalone(true);
    } else {
      alert("Aún no se detecta la instalación de la aplicación. Por favor, asegúrate de haberla instalado y ábrela desde el ícono de inicio.");
      setTimeout(() => setCheckingManual(false), 500);
    }
  };

  const isTester = 
      profile?.role === 'admin' || 
      profile?.role === 'superadmin' || 
      profile?.isPwaBypassTester === true || 
      user?.email === 'cesareduardobres@gmail.com' || 
      user?.email === 'cisnerosvictoria56@gmail.com' || 
      user?.email === 'admin@gmail.com';

  const handleBypass = () => {
      sessionStorage.setItem('vamo_pwa_gate_bypass_session', 'true');
      setIsBypassed(true);
  };

  const handleLogout = async () => {
      await signOut(auth);
      router.push('/');
  };

  if (!shouldProtect || isStandalone || isBypassed) {
    return <>{children}</>;
  }

  // Determine text based on role
  const titleText = isDriver 
    ? "Instalá VamO para trabajar desde la app" 
    : "Instalá VamO para pedir viajes más rápido";

  if (hasJustInstalled) {
    return (
      <div className="fixed inset-0 bg-[#050816] z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <VamoIcon name="check-circle" className="w-16 h-16 text-emerald-500 mb-6" />
        <h2 className="text-2xl font-black uppercase tracking-tighter text-white mb-4">¡Listo!</h2>
        <p className="text-zinc-400 mb-8 max-w-sm">
          Ya podés cerrar esta ventana y abrir VamO desde el ícono instalado en tu pantalla de inicio.
        </p>
        <Button 
          variant="outline" 
          onClick={() => {
            try { window.close(); } catch (e) {}
          }}
          className="border-white/10"
        >
          Cerrar ventana
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#050816] z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
      <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-8">
        <span className="text-white font-black text-2xl tracking-tighter italic">VamO</span>
      </div>
      
      <h2 className="text-2xl font-black uppercase tracking-tighter text-white mb-4 max-w-sm leading-tight">
        {titleText}
      </h2>
      
      <p className="text-zinc-400 mb-8 max-w-sm text-sm">
        Para usar VamO debés instalar la aplicación en tu dispositivo. Es rápido, seguro y no ocupa espacio.
      </p>

      {canInstall && !isIOS ? (
        <div className="w-full max-w-sm space-y-4">
          <Button 
            size="lg" 
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-14 rounded-xl text-lg"
            onClick={triggerInstall}
          >
            <VamoIcon name="download" className="mr-2 w-5 h-5" />
            Instalar VamO
          </Button>
        </div>
      ) : isIOS ? (
        <div className="w-full max-w-sm bg-zinc-900/50 border border-white/5 rounded-2xl p-6 mb-6">
          <p className="text-zinc-300 font-medium mb-4">En iPhone:</p>
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
              <VamoIcon name="share" className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm text-zinc-400">
              Tocá el ícono de <strong className="text-white">Compartir</strong> en la barra inferior de Safari.
            </p>
          </div>
          <div className="w-0.5 h-6 bg-zinc-800 ml-5 my-1"></div>
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
              <VamoIcon name="plus-square" className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm text-zinc-400">
              Elegí la opción <strong className="text-white">"Agregar a inicio"</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-sm bg-zinc-900/50 border border-white/5 rounded-2xl p-6 mb-6">
          <VamoIcon name="info" className="w-8 h-8 text-indigo-400 mx-auto mb-4" />
          <p className="text-sm text-zinc-400">
            Para instalar VamO, abrí el menú del navegador y elegí <strong className="text-white">“Agregar a pantalla de inicio”</strong> o <strong className="text-white">“Instalar app”</strong>.
          </p>
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-white/5 w-full max-w-sm flex flex-col gap-4">
        <Button 
          variant="ghost" 
          onClick={handleManualCheck}
          disabled={checkingManual}
          className="text-emerald-500 hover:text-emerald-400 font-bold"
        >
          {checkingManual ? "Verificando..." : "Ya instalé VamO"}
        </Button>

        <div className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/')}
              className="flex-1 border-white/10 text-zinc-300 hover:bg-white/5"
            >
              Volver al inicio
            </Button>
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10"
            >
              Cerrar sesión
            </Button>
        </div>

        {isTester && (
            <Button 
              variant="ghost" 
              onClick={handleBypass}
              className="mt-4 text-xs text-zinc-500 hover:text-white uppercase tracking-widest"
            >
              Continuar sin instalar (Modo Prueba)
            </Button>
        )}
      </div>
    </div>
  );
}
