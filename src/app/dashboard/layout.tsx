
'use client';
import { VamoIcon } from '@/components/VamoIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useEffect, useMemo } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { MapsProvider } from '@/components/MapsProvider';
import { PassengerHeader } from '@/components/PassengerHeader';
import Providers from '../providers';

function DashboardAuthWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, user, loading: userLoading } = useUser();
  const firestore = useFirestore();

  const activeRideQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'rides'),
        where('passengerId', '==', user.uid),
        where('status', 'in', ['searching_driver', 'driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused']),
        limit(1)
    );
  }, [firestore, user?.uid]);

  const { data: activeRides, isLoading: rideLoading } = useCollection<Ride>(activeRideQuery);
  const hasActiveRide = useMemo(() => activeRides && activeRides.length > 0, [activeRides]);

  const loading = userLoading || (user ? rideLoading : false);


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
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
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
    <MapsProvider>
        <div className="container mx-auto max-w-md p-4">
            <PassengerHeader 
                userName={userName}
                location="Rawson, Chubut" 
            />

        {!hasActiveRide && (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full my-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="ride" className="gap-2">
                        <VamoIcon name="car" className="w-4 h-4" /> Viaje
                    </TabsTrigger>
                    <TabsTrigger value="info" className="gap-2">
                        <VamoIcon name="info" className="w-4 h-4" /> Info
                    </TabsTrigger>
                    <TabsTrigger value="profile" className="gap-2">
                        <VamoIcon name="user" className="w-4 h-4" /> Perfil
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        )}
        
        <main className={hasActiveRide ? 'mt-6' : ''}>{children}</main>
        </div>
    </MapsProvider>
  );
}


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <DashboardAuthWrapper>
        {children}
      </DashboardAuthWrapper>
    </Providers>
  )
}
