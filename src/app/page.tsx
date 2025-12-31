'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';
import { useUser } from '@/firebase';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useUser();

  useEffect(() => {
    // Simplified redirection logic for development.
    // Removes role-based routing from the entry point.
    if (loading) return;

    if (user) {
      router.replace('/dashboard'); // Default to passenger dashboard
    } else {
      router.replace('/login');
    }
  }, [user, loading, router]);

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
