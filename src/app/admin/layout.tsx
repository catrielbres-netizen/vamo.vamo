'use client';

import React, { useEffect } from 'react';
import { AdminNavbar } from './components/AdminNavbar';
import { useUser } from '@/firebase/auth/use-user';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace('/login');
      return;
    }
    if (profile && profile.role !== 'admin') {
      router.replace('/');
    }
  }, [loading, user, profile, router]);

  if (loading || !user || !profile || profile.role !== 'admin') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando acceso de administrador...</p>
      </div>
    );
  }

  // Render authorized content
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <AdminNavbar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
