// src/app/driver/layout.tsx
'use client';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { Car, Wallet, Percent } from 'lucide-react';
import { useUser } from '@/firebase';
import { useEffect } from 'react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 1. Esperar a que toda la carga (auth y perfil) finalice
    if (loading) {
      return;
    }

    // 2. Si no hay usuario, redirigir a login
    if (!user) {
      router.replace('/login');
      return;
    }

    // 3. Si hay usuario pero el perfil aún no carga, no hacer nada.
    // El renderizado de abajo mostrará el loader.
    if (!profile) {
      return;
    }

    // 4. Si el perfil cargó y no es 'driver', redirigir
    if (profile.role !== 'driver') {
      router.replace('/dashboard');
    }
  }, [user, profile, loading, router]);


  // Muestra un estado de carga mientras se verifica el perfil.
  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p className="ml-4">Verificando autorización de conductor...</p>
      </div>
    );
  }

  // Si ya terminó de cargar y el perfil no es de conductor,
  // no renderiza nada para evitar un parpadeo del contenido no autorizado.
  if (profile.role !== 'driver') {
    return null;
  }
  
  // Si pasó todas las verificaciones, es un conductor autorizado.
  const activeTabValue = pathname.split('/driver/')[1] || 'rides';
  const activeTab = activeTabValue.split('/')[0];

  const handleTabChange = (value: string) => {
    router.push(`/driver/${value}`);
  };

  return (
    <div className="container mx-auto max-w-md p-4">
      <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">Panel Conductor</h1>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full mb-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rides" className="gap-2">
            <Car className="w-4 h-4" /> Viajes
          </TabsTrigger>
          <TabsTrigger value="earnings" className="gap-2">
            <Wallet className="w-4 h-4" /> Ganancias
          </TabsTrigger>
          <TabsTrigger value="discounts" className="gap-2">
            <Percent className="w-4 h-4" /> Bonos
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <main>{children}</main>
    </div>
  );
}
