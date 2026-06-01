'use client';

import React from 'react';
import { useUser, useAuth } from '@/firebase/auth/use-user';
import { useRouter, usePathname } from 'next/navigation';
import { TrafficNavbar } from './components/TrafficNavbar';
import { GlobalPanicListener } from '@/components/GlobalPanicListener';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { signOut } from 'firebase/auth';

import { useAppMode } from '@/hooks/useAppMode';

export default function TrafficLayout({ children }: { children: React.ReactNode }) {
  const { appMode, loading: appModeLoading } = useAppMode();
  const { user, profile, claims, role, loading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = React.useState(false);
  const [roleTimeout, setRoleTimeout] = React.useState(false);



  // Unified Traffic Roles Constant
  const allowedRoles = [
    'admin',
    'superadmin',
    'traffic',
    'traffic_admin',
    'traffic_operator',
    'traffic_municipal',
    'admin_municipal',
    'municipal_admin',
  ];
  
  const isLoginPage = pathname ? pathname.replace(/\/$/, '') === '/traffic/login' : false;
  const isAuthorized = !!user && !!role && allowedRoles.includes(role);

  // Robust check for own profile access (allows drivers to see their own digital credential)
  const isOwnProfile = user && pathname.includes(`/traffic/drivers/${user.uid}`);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    
    // Set a timeout of 5 seconds to resolve the role
    const t = setTimeout(() => {
      setRoleTimeout(true);
    }, 5000);

    return () => clearTimeout(t);
  }, [user]);

  React.useEffect(() => {
    if (!mounted || loading) return;

    if (isLoginPage) {
      if (user && isAuthorized) {
        console.log(`[AUTH_ROUTE_DEBUG] Already authorized at login page, redirecting to /traffic`);
        router.replace('/traffic');
      }
      return;
    }

    // Wait until claims/role are loaded if user exists, before checking authorization
    if (user && !claims && !roleTimeout) {
      return;
    }

    if (!user || (!isAuthorized && !isOwnProfile)) {
      if (user && roleTimeout) {
        // Do not redirect if we are logged in but role resolution timed out
        return;
      }
      console.error(`[AUTH_ROUTE_DEBUG] /traffic FORBIDDEN. Role: ${role}. Redirecting to /traffic/login`, {
        uid: user?.uid,
        email: user?.email,
        resolvedRole: role,
        allowedRoles,
        pathname
      });
      router.replace('/traffic/login');
    } else {
      console.log(`[AUTH_ROUTE_DEBUG] /traffic ACCESS_GRANTED. Role: ${role}`);
    }
  }, [user, role, claims, loading, isAuthorized, isOwnProfile, router, pathname, mounted, isLoginPage, roleTimeout]);

  if (!appModeLoading && !appMode.trafficPanelEnabled) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl bg-zinc-950 border border-white/5 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-500 text-2xl">
            🔒
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black uppercase tracking-wider text-rose-500 italic">
              Módulo Reservado
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed font-medium">
              Este módulo está reservado para la versión municipal de VamO.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!mounted) {
    return <VamoFullScreenLoader label="Cargando sistema de tránsito..." />;
  }

  // If at login page, render children directly without dashboard decoration (no navbar, no panic listener)
  if (isLoginPage) {
    return <>{children}</>;
  }

  // User exists, but role resolution is pending
  if (user && !role && !roleTimeout) {
    return <VamoFullScreenLoader label="Cargando perfil operativo..." />;
  }

  // Timeout resolved without role
  if (user && !role && roleTimeout) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl bg-zinc-950 border border-white/5 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-500 text-xl font-bold">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black uppercase tracking-wider text-rose-500 italic">
              Usuario sin Rol Asignado
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Tu cuenta (<span className="text-zinc-200 font-bold">{user.email}</span>) está autenticada en VamO, pero no cuenta con un rol de Tránsito asignado en la plataforma.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-relaxed">
            Contacta a tu administrador municipal para habilitar tu cuenta.
          </div>
          <button 
            onClick={async () => {
              try {
                await signOut(auth);
                window.location.href = '/traffic/login';
              } catch (err) {
                console.error("Signout error", err);
              }
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 active:scale-95 transition-all text-xs font-black uppercase tracking-widest text-zinc-300"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  // Loading state (checks firebase loading only)
  const isResolvingSession = loading;
  if (isResolvingSession) {
    return <VamoFullScreenLoader label="Iniciando Panel de Tránsito..." />;
  }

  if (!user || (!isAuthorized && !isOwnProfile)) {
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  // Multi-tenant cityKey check
  const isGlobalAdmin = role === 'admin' || role === 'superadmin';
  const hasCityKey = !!profile?.cityKey;

  if (user && role && !isGlobalAdmin && !hasCityKey && !loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl bg-zinc-950 border border-white/5 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-500 text-xl font-bold">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black uppercase tracking-wider text-rose-500 italic">
              Sin Jurisdicción Asignada
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Tu cuenta (<span className="text-zinc-200 font-bold">{user.email}</span>) con rol <span className="text-zinc-200 font-bold">{role}</span> no tiene una ciudad o jurisdicción asignada.
            </p>
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mt-2">
              Operador de tránsito sin ciudad asignada. Contacte al administrador.
            </p>
          </div>
          <button 
            onClick={async () => {
              try {
                await signOut(auth);
                window.location.href = '/traffic/login';
              } catch (err) {
                console.error("Signout error", err);
              }
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 active:scale-95 transition-all text-xs font-black uppercase tracking-widest text-zinc-300"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#050505] text-white selection:bg-indigo-500/30">
      <TrafficNavbar />
      <GlobalPanicListener />
      <main className="flex-1 overflow-y-auto">
        <React.Suspense fallback={<VamoFullScreenLoader label="Cargando interfaz..." />}>
          {children}
        </React.Suspense>
      </main>
    </div>
  );
}
