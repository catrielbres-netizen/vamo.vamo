// /app/driver/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, writeBatch, doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import { VamoIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { speak } from '@/lib/speak';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride } from '@/lib/types';


export default function DriverPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [activeRides, setActiveRides] = useState<WithId<Ride>[] | null>(null);
  const [availableRides, setAvailableRides] = useState<WithId<Ride>[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const wasPreviouslyActive = useRef(false);
  const previousAvailableRides = useRef<any[]>([]);
  const finishedByDriver = useRef(false);

  useEffect(() => {
    if (!firestore || !user?.uid) {
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    const unsubscribes: Unsubscribe[] = [];

    try {
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
            setActiveRides(rides);
            if (isLoading) setIsLoading(false);
        }, (error) => {
            console.error("Error fetching active rides:", error);
            toast({ variant: 'destructive', title: 'Error al cargar tus viajes activos.'});
            if (isLoading) setIsLoading(false);
        });

        const unsubAvailable = onSnapshot(availableRidesQuery, (snapshot) => {
            const rides = snapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
            setAvailableRides(rides);
             if (isLoading) setIsLoading(false);
        }, (error) => {
            console.error("Error fetching available rides:", error);
            toast({ variant: 'destructive', title: 'Error al buscar viajes disponibles.'});
            if (isLoading) setIsLoading(false);
        });

        unsubscribes.push(unsubActive, unsubAvailable);

    } catch (error) {
        console.error("Error setting up snapshots:", error);
        setIsLoading(false);
    }

    // Cleanup function
    return () => {
        unsubscribes.forEach(unsub => unsub());
    };

  }, [firestore, user?.uid, toast]);


  const currentActiveRide = activeRides && activeRides.length > 0 ? activeRides[0] : null;

  // Effect for cancellation notifications
  useEffect(() => {
    const isActive = !!currentActiveRide;
    // Si antes había un viaje activo y ahora no lo hay, Y no fue finalizado por el conductor...
    if (wasPreviouslyActive.current && !isActive && !finishedByDriver.current) {
      toast({
        title: "Viaje cancelado",
        description: "El pasajero ha cancelado el viaje. Vuelves a estar disponible.",
        variant: "destructive",
      });
    }
    wasPreviouslyActive.current = isActive;
    // Reseteamos el flag si ya no hay viaje activo
    if (!isActive) {
        finishedByDriver.current = false;
    }
  }, [currentActiveRide, toast]);
  
  // Effect for new available ride notifications
  useEffect(() => {
    if (!currentActiveRide && availableRides && availableRides.length > (previousAvailableRides.current?.length ?? 0)) {
        const newRides = availableRides.filter(
            (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
        );

        if(newRides.length > 0) { 
             const newRide = newRides[0];
             const destinationText = newRide.destination.address;
             toast({
                title: "¡Nuevo viaje disponible!",
                description: `Un pasajero solicita un viaje a ${destinationText}.`,
            });
            speak(`Nuevo viaje disponible hacia ${destinationText}.`);
        }
    }
    previousAvailableRides.current = availableRides || [];
  }, [availableRides, currentActiveRide, toast]);


  const handleAcceptRide = (rideId: string) => {
    // No need to set activeRideId here as the activeRideQuery will pick it up
  };
  
  const handleFinishRide = () => {
    finishedByDriver.current = true; // Marcamos que el conductor finalizó el viaje
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
      
      {isLoading ? (
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
