'use client';

import React from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter, usePathname } from 'next/navigation';
import { TrafficNavbar } from './components/TrafficNavbar';
import { GlobalPanicListener } from '@/components/GlobalPanicListener';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function TrafficLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = React.useState(false);
  
  // Role check: Admin, Traffic Municipal or Traffic Admin
  const allowedRoles = ['admin', 'superadmin', 'traffic_municipal', 'traffic_admin', 'traffic_operator'];
  // TODO SECURITY: remover bypass temporal de superadmin después de reparar guards por claims.
  const isSuperAdminEmergency = user?.uid === "9oOsPaBsp8XkcTLjSTEJbdzMafa2" || user?.email === "superadmin@vamo.local";
  const isAuthorized = (user && profile && allowedRoles.includes(profile.role)) || isSuperAdminEmergency;
  
  // Robust check for own profile access (allows drivers to see their own digital credential)
  const isOwnProfile = user && pathname.includes(`/traffic/drivers/${user.uid}`);
  
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted || loading || (!!user && !profile)) return;
    if (isSuperAdminEmergency) {
        console.log(`[SUPERADMIN_EMERGENCY_BYPASS] uid=${user?.uid} email=${user?.email} pathname=${pathname} allowed=true`);
        return;
    }

    if (!user || (!isAuthorized && !isOwnProfile)) {
        console.error(`[AUTH_ROUTE_DEBUG] /traffic FORBIDDEN. Role: ${profile?.role}. Redirecting to /login/transito`, {
            uid: user?.uid,
            email: user?.email,
            firestoreRole: profile?.role,
            allowedRoles,
            pathname
        });
        router.replace('/login/transito');
    } else {
        console.log(`[AUTH_ROUTE_DEBUG] /traffic ACCESS_GRANTED. Role: ${profile?.role}`);
    }
  }, [user, profile, loading, isAuthorized, isOwnProfile, router, pathname, mounted, isSuperAdminEmergency]);

  if (!mounted) {
    return <VamoFullScreenLoader label="Cargando sistema de tránsito..." />;
  }

  // Loading state
  const isResolvingSession = loading || (!!user && !profile);
  if (isResolvingSession) {
    return <VamoFullScreenLoader label="Iniciando Panel de Tránsito..." />;
  }

  if (!user || (!isAuthorized && !isOwnProfile)) {
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#050505] text-white selection:bg-indigo-500/30">
      <TrafficNavbar />
      <GlobalPanicListener />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
