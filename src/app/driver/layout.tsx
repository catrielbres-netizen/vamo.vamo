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
    if (loading) return; // Esperar a que la autenticación y el perfil carguen.

    // Si no hay usuario, redirigir a login.
    if (!user) {
        router.replace('/login');
        return;
    }
    
    // Si el perfil ya cargó, pero no es de conductor, redirigir.
    if (profile && profile.role !== 'driver') {
        router.replace('/'); // A la página de pasajero/default
    }
  }, [user, profile, loading, router]);


  // Determine the active tab from the URL
  const activeTabValue = pathname.split('/driver/')[1] || 'rides';
  
  // This logic correctly identifies the active tab based on the path segment
  const activeTab = activeTabValue.split('/')[0];


  const handleTabChange = (value: string) => {
    router.push(`/driver/${value}`);
  };

  // Mostrar un loader mientras se verifica todo.
  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p className="ml-4">Verificando autorización...</p>
      </div>
    );
  }

  // Si después de cargar no es conductor, no renderizar nada.
  if (profile.role !== 'driver') {
    return null; // Render nothing while redirecting
  }


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
