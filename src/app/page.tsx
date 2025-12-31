'use client';

import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';

export default function Home() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Espera a que se resuelva el estado de autenticación
    if (loading) return;

    // Si no hay usuario, redirige a la página de login
    if (!user) {
      router.replace('/login');
    } else {
      // Si hay un usuario, redirige al dashboard principal.
      // Los layouts específicos de rol (/admin, /driver) se encargarán de la
      // redirección final si es necesario.
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

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
