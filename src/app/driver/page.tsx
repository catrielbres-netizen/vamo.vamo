// /app/driver/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { VamoIcon } from '@/components/icons';
import { useToast } from "@/hooks/use-toast";
import { speak } from '@/lib/speak';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride } from '@/lib/types';


export default function DriverPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [activeRides, setActiveRides] = useState<WithId<Ride>[]>([]);
  const [availableRides, setAvailableRides] = useState<WithId<Ride>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);

  const previousAvailableRides = useRef<WithId<Ride>[]>([]);

  useEffect(() => {
    if (!firestore || !user?.uid) {
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    const unsubscribes: Unsubscribe[] = [];

    let activeLoaded = false;
    let availableLoaded = false;

    const checkLoading = () => {
      if (activeLoaded && availableLoaded) {
        setIsLoading(false);
      }
    };

    // 1. Query for rides assigned to the current driver
    const activeRideQuery = query(
        collection(firestore, 'rides'),
        where('driverId', '==', user.uid),
        where('status', 'in', [
            'driver_assigned',
            'driver_arriving',
            'arrived',
            'in_progress',
            'paused',
        ])
    );

    // 2. Query for available rides
    const availableRidesQuery = query(
        collection(firestore, 'rides'),
        where('status', '==', 'searching_driver')
    );

    const unsubActive = onSnapshot(activeRideQuery, (snapshot) => {
        const rides = snapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
        
        // Passenger cancellation detection
        if (activeRides.length > 0 && rides.length === 0) {
          toast({
            title: "Viaje cancelado",
            description: "El pasajero ha cancelado el viaje. Vuelves a estar disponible.",
            variant: "destructive",
          });
        }
        
        setActiveRides(rides);
        activeLoaded = true;
        checkLoading();
    }, (error) => {
        console.error("Error fetching active rides:", error);
        toast({ variant: 'destructive', title: 'Error al cargar tus viajes activos.'});
        activeLoaded = true;
        checkLoading();
    });

    const unsubAvailable = onSnapshot(availableRidesQuery, (snapshot) => {
        const rides = snapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
        setAvailableRides(rides);
        availableLoaded = true;
        checkLoading();
    }, (error) => {
        console.error("Error fetching available rides:", error);
        toast({ variant: 'destructive', title: 'Error al buscar viajes disponibles.'});
        availableLoaded = true;
        checkLoading();
    });

    unsubscribes.push(unsubActive, unsubAvailable);

    // Cleanup function
    return () => {
        unsubscribes.forEach(unsub => unsub());
    };

  }, [firestore, user?.uid, toast, activeRides.length]);

  
  // Effect for new available ride notifications
  useEffect(() => {
    if (isLoading) return; // Don't run on initial load
    
    if (activeRides.length === 0 && availableRides.length > previousAvailableRides.current.length) {
        const newRide = availableRides.find(
            (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
        );

        if(newRide) { 
             const destinationText = newRide.destination.address;
             toast({
                title: "¡Nuevo viaje disponible!",
                description: `Un pasajero solicita un viaje a ${destinationText}.`,
            });
            speak(`Nuevo viaje disponible hacia ${destinationText}.`);
        }
    }
    previousAvailableRides.current = availableRides;
  }, [availableRides, activeRides.length, toast, isLoading]);


  const handleAcceptRide = () => {
    // When a ride is accepted, it will be picked up by the activeRides query.
    // Clear any finished ride summary that might be showing.
    setLastFinishedRide(null);
  };
  
  const handleFinishRide = (finishedRide: WithId<Ride>) => {
    setLastFinishedRide(finishedRide);
    toast({
        title: "¡Viaje finalizado!",
        description: "El viaje ha sido completado y cobrado.",
    });
  };

  const handleCloseSummary = () => {
    setLastFinishedRide(null);
  }

  const currentActiveRide = activeRides.length > 0 ? activeRides[0] : null;

  return (
    <main className="container mx-auto max-w-md p-4">
       <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">Panel Conductor</h1>
      </div>
      
      {isLoading ? (
        <p className="text-center">Buscando viajes...</p>
      ) : currentActiveRide ? (
         <ActiveDriverRide ride={currentActiveRide} onFinishRide={handleFinishRide}/>
      ) : lastFinishedRide ? (
         <FinishedRideSummary ride={lastFinishedRide} onClose={handleCloseSummary} />
      ) : (
        <div className="space-y-4">
           <h2 className="text-xl font-semibold text-center">Viajes Disponibles</h2>
          {availableRides.length > 0 ? (
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
