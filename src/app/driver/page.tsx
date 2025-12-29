// /app/driver/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import { VamoIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { notificationSoundUri } from '@/lib/sounds';

export default function DriverPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const wasPreviouslyActive = useRef(false);
  const previousAvailableRides = useRef<any[]>([]);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);

  // Pre-load audio
    useEffect(() => {
        notificationAudio.current = new Audio(notificationSoundUri);
    }, []);

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

  const currentActiveRide = activeRides && activeRides.length > 0 ? activeRides[0] : null;

  // Effect for cancellation notifications
  useEffect(() => {
    const isActive = !!currentActiveRide;
    if (wasPreviouslyActive.current && !isActive) {
      toast({
        title: "Viaje cancelado",
        description: "El pasajero ha cancelado el viaje. Vuelves a estar disponible.",
        variant: "destructive",
      });
    }
    wasPreviouslyActive.current = isActive;
  }, [currentActiveRide, toast]);
  
  // Effect for new available ride notifications
  useEffect(() => {
    if (availableRides && availableRides.length > (previousAvailableRides.current?.length ?? 0)) {
        // This finds the new ride(s) by comparing current with previous.
        const newRides = availableRides.filter(
            (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
        );

        if(newRides.length > 0 && !currentActiveRide) { // Only notify if not in an active ride
             toast({
                title: "¡Nuevo viaje disponible!",
                description: `Un pasajero solicita un viaje a ${newRides[0].destination.address}.`,
            });
            notificationAudio.current?.play().catch(e => console.error("Error playing sound:", e));
        }
    }
    previousAvailableRides.current = availableRides || [];
  }, [availableRides, toast, currentActiveRide]);


  const handleAcceptRide = (rideId: string) => {
    // No need to set activeRideId here as the activeRideQuery will pick it up
  };
  
  const handleFinishRide = () => {
    toast({
        title: "¡Viaje finalizado!",
        description: "El viaje ha sido completado y cobrado.",
    });
    // The ride is finished, so it will disappear from the active query
  };

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
