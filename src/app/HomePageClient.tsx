// src/app/HomePageClient.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/VamoIcon';
import { useUser } from '@/firebase';
import Providers from './providers';

// Este es el Componente de Cliente que contiene toda la lógica y los hooks.
function HomeLogic() {
  const router = useRouter();
  const { user, profile, loading } = useUser();

  useEffect(() => {
    // Esperar hasta que el estado de autenticación esté completamente cargado
    if (loading) return;

    if (user) {
      // Usuario autenticado
      if (profile) {
        // Usuario tiene un perfil, redirigir según el rol
        switch (profile.role) {
          case 'admin':
            router.replace('/admin');
            break;
          case 'driver':
            router.replace('/driver');
            break;
          case 'passenger':
          default:
            // Por defecto al panel de pasajero si el rol es 'passenger' o indefinido
            router.replace('/dashboard');
            break;
        }
      }
      // Si el usuario existe pero el perfil todavía se está cargando, no hacer nada y esperar al siguiente renderizado.
    } else {
      // No hay usuario autenticado, redirigir a la página de inicio de sesión
      router.replace('/login');
    }
  }, [user, profile, loading, router]);

  // Pantalla de carga universal mientras se determina el destino del usuario.
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <VamoIcon name="car" className="h-12 w-12 animate-pulse text-primary" />
        <p>Cargando VamO...</p>
      </div>
    </div>
  );
}

export default function HomePageClient() {
    return (
        <Providers>
            <HomeLogic />
        </Providers>
    );
}
