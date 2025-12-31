// src/app/admin/layout.tsx
'use client';
import { useUser } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

function AdminSidebar() {
  const pathname = usePathname();
  const activeTab = pathname.split('/admin/')[1]?.split('/')[0] || '';

  const tabs = [
    { value: '', label: 'Dashboard' },
    { value: 'drivers', label: 'Conductores' },
    { value: 'rides', label: 'Viajes' },
    { value: 'audit-log', label: 'Auditoría' },
  ];

  return (
    <nav className="w-full md:w-64 border-b md:border-b-0 md:border-r p-4">
      <div className="flex items-center gap-2 mb-6">
        <VamoIcon className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Admin</h2>
      </div>
      <Tabs orientation="vertical" value={activeTab} className="w-full">
        <TabsList className="flex-col items-start h-auto bg-transparent p-0 w-full">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              asChild
              className="w-full justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Link href={`/admin/${tab.value}`}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Esperar a que toda la data de usuario esté lista.

    // Si no hay usuario, redirigir a login.
    if (!user) {
      router.replace('/login');
      return;
    }

    // Si el perfil ya cargó pero no es de admin, redirigir.
    if (profile && profile.role !== 'admin') {
      router.replace('/'); // A la página de pasajero/default
    }
  }, [user, profile, loading, router]);

  // Mientras carga o si el perfil todavía no llega, mostrar un loader.
  // Esto previene la redirección prematura.
  if (loading || !profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <VamoIcon className="h-12 w-12 animate-pulse text-primary" />
        <p className="ml-4">Verificando autorización...</p>
      </div>
    );
  }

  // Si después de cargar, el rol no es admin, no renderizar nada mientras
  // el useEffect hace la redirección final.
  if (profile.role !== 'admin') {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background">
      <AdminSidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
