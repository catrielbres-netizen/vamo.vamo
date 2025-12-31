'use client';

import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';

export default function Home() {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Espera a que la autenticación y el perfil se carguen

    if (!user) {
      router.replace('/login');
    } else {
      // Ahora que no está cargando y tenemos un usuario, podemos chequear el perfil
      if (profile?.role === 'admin') {
        router.replace('/admin');
      } else if (profile?.role === 'driver') {
        router.replace('/driver');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, profile, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p>Cargando VamO...</p>
      </div>
    </div>
  );
}
