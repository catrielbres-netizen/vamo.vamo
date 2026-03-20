'use client';

import React from 'react';
import { useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { MunicipalNavbar } from './components/MunicipalNavbar';

export default function MunicipalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/municipal/login');
      return;
    }
    if (profile && profile.role !== 'admin_municipal') {
      router.replace('/municipal/login');
    }
  }, [loading, user, profile, router]);

  // Gatekeeper: Show loading screen until session is resolved and authorized.
  if (loading || !user || !profile || profile.role !== 'admin_municipal') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando acceso municipal...</p>
      </div>
    );
  }

  // Render authorized content
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <MunicipalNavbar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
