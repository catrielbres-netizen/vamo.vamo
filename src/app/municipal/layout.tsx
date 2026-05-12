'use client';

import React from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter, usePathname } from 'next/navigation';
import { MunicipalNavbar } from './components/MunicipalNavbar';
import { GlobalPanicListener } from '@/components/GlobalPanicListener';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';
import { DemoWrapper } from './components/DemoWrapper';

export default function MunicipalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  // 2. NO SESSION or WRONG ROLE:
  const allowedRoles = ['admin', 'superadmin', 'admin_municipal', 'operator_municipal', 'treasury_municipal', 'auditor_municipal', 'traffic_municipal'];
  // TODO SECURITY: remover bypass temporal de superadmin después de reparar guards por claims.
  const isSuperAdminEmergency = user?.uid === "9oOsPaBsp8XkcTLjSTEJbdzMafa2" || user?.email === "superadmin@vamo.local";
  const isAuthorized = (user && profile && allowedRoles.includes(profile.role)) || isSuperAdminEmergency;

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
    
    if (isSuperAdminEmergency) {
        console.log(`[SUPERADMIN_EMERGENCY_BYPASS] uid=${user?.uid} email=${user?.email} pathname=${pathname} allowed=true`);
        return;
    }

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
  }, [user, profile, loading, isAuthorized, isPublicPage, router, pathname, mounted, isSuperAdminEmergency]);

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
          <DemoWrapper>
            {children}
          </DemoWrapper>
        </main>
      </div>
    </div>
  );
}
