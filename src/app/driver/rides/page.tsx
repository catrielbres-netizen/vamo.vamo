// /app/driver/rides/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, Unsubscribe, doc } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { useToast } from "@/hooks/use-toast";
import { speak } from '@/lib/speak';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, ServiceType } from '@/lib/types';


// Helper function to determine which services a driver can see
const getAllowedServices = (carModelYear?: number): ServiceType[] => {
    if (!carModelYear) return ['express']; // Default to lowest tier if no data
    if (carModelYear >= 2020) return ['premium', 'privado', 'express'];
    if (carModelYear >= 2016) return ['privado', 'express'];
    return ['express'];
}


export default function DriverRidesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [activeRide, setActiveRide] = useState<WithId<Ride> | null>(null);
  const [availableRides, setAvailableRides] = useState<WithId<Ride>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);
  
  // Get the driver's profile to know their car model year
  const driverProfileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: driverProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(driverProfileRef);


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
            title: "Viaje cancelado o finalizado",
            description: "El viaje ha sido completado o cancelado por el pasajero. Vuelves a estar disponible.",
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
  }, [firestore, user?.uid, toast]); // Removed activeRide from dependencies


  useEffect(() => {
    // This effect manages the available rides subscription
    // It should only be active if there is no active ride and the driver profile has loaded
    if (firestore && user?.uid && !activeRide && !isProfileLoading) {
        availableRidesUnsubscribe.current?.(); // Clean up previous listener

        // Determine allowed services based on car model year
        const allowedServices = getAllowedServices(driverProfile?.carModelYear);
        
        // If there are no allowed services, don't subscribe.
        if (allowedServices.length === 0) {
            setAvailableRides([]);
            setIsLoading(false);
            return;
        }

        const availableRidesQuery = query(
            collection(firestore, 'rides'),
            where('status', '==', 'searching_driver'),
            where('serviceType', 'in', allowedServices)
        );

        availableRidesUnsubscribe.current = onSnapshot(availableRidesQuery, (snapshot) => {
            const rides = snapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
            
            if (!isLoading) { 
                const newRides = rides.filter(
                    (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
                );

                if (newRides.length > 0) {
                     newRides.forEach(newRide => {
                        const destinationText = newRide.destination.address;
                        toast({
                            title: `¡Nuevo viaje ${newRide.serviceType}!`,
                            description: `Un pasajero solicita un viaje a ${destinationText}.`,
                        });
                        speak(`Nuevo viaje ${newRide.serviceType} disponible hacia ${destinationText}.`);
                     });
                }
            }
            
            setAvailableRides(rides);
            previousAvailableRides.current = rides;
            if(isLoading) setIsLoading(false);
        }, (error) => {
            console.error("Error fetching available rides:", error);
            toast({ variant: 'destructive', title: 'Error al buscar viajes disponibles.' });
        });
    } else {
        // If there is an active ride, or profile is loading, we don't listen for available ones.
        setAvailableRides([]);
        previousAvailableRides.current = [];
        availableRidesUnsubscribe.current?.();
    }

    return () => {
        availableRidesUnsubscribe.current?.();
    }
  }, [firestore, user?.uid, activeRide, isProfileLoading, driverProfile, isLoading, toast]);


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
  
  const isLoadingSomething = isLoading || isProfileLoading;

  return (
    <>
      {isLoadingSomething ? (
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
            <p className="text-center text-muted-foreground pt-8">No hay viajes buscando conductor en este momento para tu categoría de vehículo.</p>
          )}
        </div>
      )}
    </>
  );
}
