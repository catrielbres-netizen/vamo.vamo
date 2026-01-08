'use client';
export const dynamic = 'force-dynamic';

import { AdminNavbar } from './components/AdminNavbar';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/VamoIcon';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; 

    if (!profile || profile.role !== 'admin') {
      router.replace('/login');
    }
  }, [loading, profile, router]);

  if (loading || !profile || profile.role !== 'admin') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando acceso...</p>
      </div>
    );
  }

  return (
      <div className="flex min-h-screen w-full flex-col bg-muted/40">
        <AdminNavbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
  );
}
