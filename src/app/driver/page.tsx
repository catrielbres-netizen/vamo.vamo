// /app/driver/page.tsx
'use client';

import { useState } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import { VamoIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';

export default function DriverPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  // 1. Query for rides assigned to the current driver
  const activeRideQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(
            collection(firestore, 'rides'),
            where('driverId', '==', user.uid),
            where('status', 'in', [
              'driver_assigned',
              'driver_arriving',
              'arrived',
              'in_progress',
              'paused',
            ])
          )
        : null,
    [firestore, user]
  );
  const { data: activeRides, isLoading: isLoadingActive } = useCollection(activeRideQuery);


  // 2. Query for available rides (searching for a driver)
  const availableRidesQuery = useMemoFirebase(
    () =>
      firestore
        ? query(
            collection(firestore, 'rides'),
            where('status', '==', 'searching_driver')
          )
        : null,
    [firestore]
  );
  const { data: availableRides, isLoading: isLoadingAvailable } = useCollection(availableRidesQuery);


  const handleAcceptRide = (rideId: string) => {
    setActiveRideId(rideId);
  };
  
  const handleFinishRide = () => {
    setActiveRideId(null);
  };

  const currentActiveRide = activeRides && activeRides.length > 0 ? activeRides[0] : null;

  return (
    <main className="container mx-auto max-w-md p-4">
       <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">Panel Conductor</h1>
      </div>

      {isLoadingActive || isLoadingAvailable ? (
        <p className="text-center">Buscando viajes...</p>
      ) : currentActiveRide ? (
         <ActiveDriverRide ride={currentActiveRide} onFinishRide={handleFinishRide}/>
      ) : (
        <div className="space-y-4">
           <h2 className="text-xl font-semibold text-center">Viajes Disponibles</h2>
          {availableRides && availableRides.length > 0 ? (
            availableRides.map((ride) => (
              <DriverRideCard
                key={ride.id}
                ride={ride}
                onAccept={handleAcceptRide}
              />
            ))
          ) : (
            <p className="text-center text-muted-foreground">No hay viajes buscando conductor en este momento.</p>
          )}
        </div>
      )}
    </main>
  );
}
