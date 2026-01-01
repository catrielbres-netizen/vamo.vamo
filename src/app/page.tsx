'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';
import { useUser } from '@/firebase';

export default function Home() {
  const router = useRouter();
  const { user, profile, loading } = useUser();

  useEffect(() => {
    if (loading) return; // Wait until user and profile are loaded

    if (user) {
      // User is logged in, redirect based on role
      if (profile?.role === 'admin') {
        router.replace('/admin/dashboard');
      } else if (profile?.role === 'driver') {
        router.replace('/driver');
      } else {
        // Default to passenger dashboard if role is passenger or not yet defined
        router.replace('/dashboard');
      }
    } else {
      // No user, redirect to login
      router.replace('/login');
    }
  }, [user, profile, loading, router]);

  // Universal loading screen while determining destination.
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p>Cargando VamO...</p>
      </div>
    </div>
  );
}
