'use client';

import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';

export default function Home() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
    } else {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p>Cargando VamO...</p>
      </div>
    </div>
  );
}
