'use client';

import React from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter, usePathname } from 'next/navigation';
import { MunicipalNavbar } from './components/MunicipalNavbar';
import { GlobalPanicListener } from '@/components/GlobalPanicListener';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { DemoWrapper } from './components/DemoWrapper';

import { useAppMode } from '@/hooks/useAppMode';

export default function MunicipalLayout({ children }: { children: React.ReactNode }) {
  const { appMode, loading: appModeLoading } = useAppMode();
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);



  // 2. NO SESSION or WRONG ROLE:
  const allowedRoles = ['admin', 'superadmin', 'admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal', 'traffic_municipal'];
  const isAuthorized = !!user && !!profile && allowedRoles.includes(profile.role);

  const isPublicPage = Boolean(pathname && (
    pathname.includes('login') || 
    pathname.includes('register') || 
    pathname.includes('onboarding')
  ));

  React.useEffect(() => {
    setMounted(true);
    if (pathname === '/municipal') {
      router.replace('/municipal/dashboard');
    }
  }, [pathname, router]);

  React.useEffect(() => {
    if (!mounted || loading || (!!user && !profile) || isPublicPage) return;
    
    if (!user || !isAuthorized) {
        console.error(`[AUTH_ROUTE_DEBUG] /municipal FORBIDDEN. Role: ${profile?.role}. Redirecting to /login/municipal`, {
            uid: user?.uid,
            email: user?.email,
            firestoreRole: profile?.role,
            allowedRoles,
            pathname
        });
        router.replace('/login/municipal');
    } else {
        console.log(`[AUTH_ROUTE_DEBUG] /municipal ACCESS_GRANTED. Role: ${profile?.role}`);
    }
  }, [user, profile, loading, isAuthorized, isPublicPage, router, pathname, mounted]);

  if (!appModeLoading && !appMode.municipalEnabled) {
    return (
      <div className="min-h-screen bg-[#050912] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#0A111F] border border-white/5 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto text-indigo-500 text-2xl">
            🔒
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black uppercase tracking-wider text-indigo-400 italic">
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

  if (!mounted || pathname === '/municipal') {
    return <VamoFullScreenLoader label="Cargando sistema municipal..." />;
  }

  if (isPublicPage) {
    return <>{children}</>;
  }

  // 1. Loading state
  const isResolvingSession = loading || (!!user && !profile);
  if (isResolvingSession) {
    return <VamoFullScreenLoader label="Verificando acceso municipal..." />;
  }

  if (!isPublicPage && (!user || !isAuthorized)) {
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  // Render authorized content
  return (
    <div className="flex min-h-screen w-full bg-[#050912] selection:bg-[#1D7CFF] selection:text-white">
      {/* Sidebar Navigation */}
      <aside className="w-72 bg-[#0A111F] border-r border-white/5 flex flex-col hidden lg:flex shrink-0">
         <MunicipalNavbar />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <GlobalPanicListener />
        <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
          <React.Suspense fallback={<VamoFullScreenLoader label="Cargando interfaz..." />}>
            <DemoWrapper>
              {children}
            </DemoWrapper>
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}
