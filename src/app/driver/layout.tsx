
'use client';
import { VamoIcon } from '@/components/VamoIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { useEffect, useMemo } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Ride } from '@/lib/types';
import { APIProvider } from '@vis.gl/react-google-maps';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, user, loading: userLoading } = useUser();
  const firestore = useFirestore();

  // Query to find any active ride for the current driver
  const activeRideQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'rides'),
        where('driverId', '==', user.uid),
        where('status', 'in', ['driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused']),
        limit(1)
    );
  }, [firestore, user?.uid]);
  
  const { data: activeRides, isLoading: rideLoading } = useCollection<Ride>(activeRideQuery);
  const hasActiveRide = useMemo(() => activeRides && activeRides.length > 0, [activeRides]);

  const loading = userLoading || (user ? rideLoading : false);


  useEffect(() => {
    if (loading) return; // Don't do anything while loading

    if (!profile) {
      // If there's no profile, something is wrong, maybe send to login
      router.replace('/login');
      return;
    }
    
    // If the profile is not completed and they are not on the completion pages, redirect them.
    if (!profile.profileCompleted && !pathname.startsWith('/driver/complete-profile')) {
      router.replace('/driver/complete-profile');
    }
    
  }, [profile, loading, pathname, router]);

  if (loading || (!profile?.profileCompleted && !pathname.startsWith('/driver/complete-profile'))) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/40">
        <VamoIcon name="loader" className="h-10 w-10 animate-pulse text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando panel de conductor...</p>
      </div>
    );
  }

  const activeTabValue = pathname.split('/driver/')[1] || 'rides';
  const activeTab = activeTabValue.split('/')[0];

  const handleTabChange = (value: string) => {
    router.push(`/driver/${value}`);
  };

  return (
    <APIProvider 
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}
        libraries={['places']}
    >
      <div className="container mx-auto max-w-md p-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <VamoIcon name="layout-dashboard" className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Panel Conductor</h1>
          </div>
          <span className="text-sm font-medium text-muted-foreground">{profile?.name}</span>
        </div>

        {!hasActiveRide && (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full mb-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="rides" className="gap-2">
                  <VamoIcon name="car" className="w-4 h-4" /> Viajes
                </TabsTrigger>
                <TabsTrigger value="earnings" className="gap-2">
                  <VamoIcon name="wallet" className="w-4 h-4" /> Ganancias
                </TabsTrigger>
                <TabsTrigger value="discounts" className="gap-2">
                  <VamoIcon name="percent" className="w-4 h-4" /> Bonos
                </TabsTrigger>
                <TabsTrigger value="profile" className="gap-2">
                  <VamoIcon name="user" className="w-4 h-4" /> Perfil
                </TabsTrigger>
              </TabsList>
            </Tabs>
        )}
        
        <main className={hasActiveRide ? 'mt-6' : ''}>{children}</main>
      </div>
    </APIProvider>
  );
}
