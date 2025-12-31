'use client';

import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';

export default function Home() {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Espera a que se resuelva el estado de autenticación y el perfil
    if (loading) return;

    if (!user) {
      router.replace('/login');
    } else {
      // Redirección basada en rol
      if (profile?.role === 'admin') {
        router.replace('/admin');
      } else if (profile?.role === 'driver') {
        router.replace('/driver');
      } else {
        // Por defecto, para pasajeros o roles no definidos
        router.replace('/dashboard');
      }
    }
  }, [user, profile, loading, router]);

  // Muestra una pantalla de carga universal mientras se determina el destino.
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p>Cargando VamO...</p>
      </div>
    </div>
  );
}
