'use client';
import { VamoIcon } from '@/components/icons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { Car, User } from 'lucide-react';
import { PassengerHeader } from '@/components/PassengerHeader';
import { useUser } from '@/firebase';
import { useEffect } from 'react';


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, user, loading } = useUser();

  useEffect(() => {
    if (loading) return; 

    if (!profile) {
      router.replace('/login');
      return;
    }
    
    if (!profile.profileCompleted && !pathname.startsWith('/dashboard/complete-profile')) {
      router.replace('/dashboard/complete-profile');
    }
    
  }, [profile, loading, pathname, router]);

  if (loading || (!profile?.profileCompleted && !pathname.startsWith('/dashboard/complete-profile'))) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando panel de pasajero...</p>
      </div>
    );
  }

  const activeTabValue = pathname.split('/dashboard/')[1] || 'ride';
  const activeTab = activeTabValue.split('/')[0];

  const handleTabChange = (value: string) => {
    router.push(`/dashboard/${value}`);
  };
  
  const userName = profile?.name || (user?.isAnonymous ? "Invitado" : user?.displayName || "Usuario");

  return (
    <div className="container mx-auto max-w-md p-4">
        <PassengerHeader 
            userName={userName}
            location="Rawson, Chubut" 
        />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full my-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ride" className="gap-2">
            <Car className="w-4 h-4" /> Viaje
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" /> Perfil
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <main>{children}</main>
    </div>
  );
}
