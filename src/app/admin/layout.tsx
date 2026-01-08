'use client';

import { AdminNavbar } from './components/AdminNavbar';
import { useUser } from '@/firebase';
import { VamoIcon } from '@/components/VamoIcon';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait for the session to load

    // If loading is finished and there's no profile or the role is not admin, redirect
    if (!profile || profile.role !== 'admin') {
      router.replace('/login');
    }
  }, [loading, profile, router]);

  // While loading, or if the profile is not yet available or invalid, show a loading screen
  if (loading || !profile || profile.role !== 'admin') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando acceso...</p>
      </div>
    );
  }

  // Once authorized, render the layout
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <AdminNavbar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
