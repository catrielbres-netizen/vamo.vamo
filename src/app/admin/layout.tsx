'use client';

import React from 'react';
import { AdminNavbar } from './components/AdminNavbar';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { GlobalPanicListener } from '@/components/GlobalPanicListener';
import { VamoFullScreenLoader } from '@/components/branding/VamoFullScreenLoader';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  // 2. NO SESSION or WRONG ROLE:
  const allowedRoles = ['admin', 'superadmin'];
  // TODO SECURITY: remover bypass temporal de superadmin después de reparar guards por claims.
  const isSuperAdminEmergency = user?.uid === "9oOsPaBsp8XkcTLjSTEJbdzMafa2" || user?.email === "superadmin@vamo.local";
  const isAuthorized = (user && profile && allowedRoles.includes(profile.role)) || isSuperAdminEmergency;

  React.useEffect(() => {
    if (loading || (!!user && !profile)) return;
    if (isSuperAdminEmergency) {
        console.log(`[SUPERADMIN_EMERGENCY_BYPASS] uid=${user?.uid} email=${user?.email} pathname=/admin allowed=true`);
        return;
    }

    if (!user || !isAuthorized) {
        console.error(`[AUTH_ROUTE_DEBUG] /admin FORBIDDEN. Role: ${profile?.role}. Redirecting to /login`, {
            uid: user?.uid,
            email: user?.email,
            firestoreRole: profile?.role,
            allowedRoles
        });
        router.replace('/login');
    } else {
        console.log(`[AUTH_ROUTE_DEBUG] /admin ACCESS_GRANTED. Role: ${profile?.role}`);
    }
  }, [user, profile, loading, isAuthorized, isSuperAdminEmergency, router]);

  // 1. Loading state
  const isResolvingSession = loading || (!!user && !profile);
  if (isResolvingSession) {
    return <VamoFullScreenLoader label="Verificando acceso administrador..." />;
  }

  if (!user || !isAuthorized) {
    return <VamoFullScreenLoader label="Redirigiendo..." />;
  }

  // Render authorized content
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0a0a0a] text-zinc-100 font-sans">
      <AdminNavbar />
      <GlobalPanicListener />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
