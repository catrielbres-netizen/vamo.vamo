// /app/driver/rides/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { useToast } from "@/hooks/use-toast";
import { speak } from '@/lib/speak';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride } from '@/lib/types';


export default function DriverRidesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [activeRide, setActiveRide] = useState<WithId<Ride> | null>(null);
  const [availableRides, setAvailableRides] = useState<WithId<Ride>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);

  const previousAvailableRides = useRef<WithId<Ride>[]>([]);
  const activeRideUnsubscribe = useRef<Unsubscribe | null>(null);
  const availableRidesUnsubscribe = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Unsubscribe from previous listeners if they exist
    activeRideUnsubscribe.current?.();
    availableRidesUnsubscribe.current?.();

    // 1. Query for rides assigned to the current driver
    const activeRideQuery = query(
      collection(firestore, 'rides'),
      where('driverId', '==', user.uid),
      where('status', 'in', ['driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused'])
    );

    activeRideUnsubscribe.current = onSnapshot(activeRideQuery, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
      const currentActiveRide = rides.length > 0 ? rides[0] : null;

      const wasActive = !!activeRide;
      setActiveRide(currentActiveRide);
      
      if(wasActive && !currentActiveRide) {
         toast({
            title: "Viaje cancelado",
            description: "El pasajero ha cancelado el viaje. Vuelves a estar disponible.",
            variant: "destructive",
          });
      }
      
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching active ride:", error);
      toast({ variant: 'destructive', title: 'Error al cargar tu viaje activo.' });
      setIsLoading(false);
    });

    return () => {
      activeRideUnsubscribe.current?.();
    };
  }, [firestore, user?.uid]);


  useEffect(() => {
    // This effect manages the available rides subscription
    // It should only be active if there is no active ride
    if (firestore && !activeRide) {
        availableRidesUnsubscribe.current?.(); // Clean up previous listener just in case

        const availableRidesQuery = query(
            collection(firestore, 'rides'),
            where('status', '==', 'searching_driver')
        );

        availableRidesUnsubscribe.current = onSnapshot(availableRidesQuery, (snapshot) => {
            const rides = snapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
            
            if (!isLoading && rides.length > previousAvailableRides.current.length) {
                 const newRide = rides.find(
                    (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
                );
                if (newRide) {
                    const destinationText = newRide.destination.address;
                    toast({
                        title: "¡Nuevo viaje disponible!",
                        description: `Un pasajero solicita un viaje a ${destinationText}.`,
                    });
                    speak(`Nuevo viaje disponible hacia ${destinationText}.`);
                }
            }
            
            setAvailableRides(rides);
            previousAvailableRides.current = rides;
        }, (error) => {
            console.error("Error fetching available rides:", error);
            toast({ variant: 'destructive', title: 'Error al buscar viajes disponibles.' });
        });
    } else {
        // If there is an active ride, we don't need to listen for available ones.
        setAvailableRides([]); // Clear available rides
        previousAvailableRides.current = [];
        availableRidesUnsubscribe.current?.();
    }

    return () => {
        availableRidesUnsubscribe.current?.();
    }
  }, [firestore, activeRide, isLoading]); // Dependency on activeRide is key


  const handleAcceptRide = () => {
    // When a ride is accepted, it will be picked up by the activeRide query.
    // The UI will switch automatically. We clear the finished ride summary.
    setLastFinishedRide(null);
  };
  
  const handleFinishRide = (finishedRide: WithId<Ride>) => {
    // The activeRide listener will set activeRide to null.
    // We want to show the summary.
    setLastFinishedRide(finishedRide);
    toast({
        title: "¡Viaje finalizado!",
        description: "El viaje ha sido completado y cobrado.",
    });
  };

  const handleCloseSummary = () => {
    setLastFinishedRide(null);
  }

  return (
    <>
      {isLoading ? (
        <p className="text-center">Buscando viajes...</p>
      ) : activeRide ? (
         <ActiveDriverRide ride={activeRide} onFinishRide={handleFinishRide}/>
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
    </>
  );
}
