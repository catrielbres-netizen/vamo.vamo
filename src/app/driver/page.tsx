// /app/driver/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import { VamoIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { notificationSoundUri } from '@/lib/sounds';
import { speak } from '@/lib/speak';

export default function DriverPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const wasPreviouslyActive = useRef(false);
  const previousAvailableRides = useRef<any[]>([]);
  const finishedByDriver = useRef(false);

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
    if (availableRides && availableRides.length > (previousAvailableRides.current?.length ?? 0)) {
        const newRides = availableRides.filter(
            (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
        );

        if(newRides.length > 0 && !currentActiveRide) { 
             const newRide = newRides[0];
             toast({
                title: "¡Nuevo viaje disponible!",
                description: `Un pasajero solicita un viaje a ${newRide.destination.address}.`,
            });
            const audio = new Audio(notificationSoundUri);
            audio.play().catch(e => {
                console.error("Error al reproducir sonido de notificación:", e);
            });
            
            const originText = 'la ubicación del pasajero';
            const destinationText = newRide.destination.address;
            speak(`Nuevo viaje disponible hacia ${destinationText}.`);
        }
    }
    previousAvailableRides.current = availableRides || [];
  }, [availableRides, toast, currentActiveRide]);


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

  const handleFinalizeAllRides = async () => {
    if (!firestore) return;
    toast({ title: "Limpiando viajes...", description: "Por favor, esperá." });

    const activeStatuses = ['searching_driver', 'driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused'];
    const q = query(collection(firestore, 'rides'), where('status', 'in', activeStatuses));

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            toast({ title: "Todo limpio", description: "No se encontraron viajes activos para finalizar." });
            return;
        }

        const batch = writeBatch(firestore);
        querySnapshot.forEach(rideDoc => {
            const rideRef = doc(firestore, 'rides', rideDoc.id);
            batch.update(rideRef, { status: 'finished' });
        });

        await batch.commit();

        toast({ title: "¡Limpieza completada!", description: `${querySnapshot.size} viajes fueron marcados como finalizados.` });
    } catch (error) {
        console.error("Error finalizando todos los viajes:", error);
        toast({ title: "Error", description: "No se pudieron finalizar los viajes.", variant: "destructive" });
    }
  };


  return (
    <main className="container mx-auto max-w-md p-4">
       <div className="flex justify-center items-center mb-6">
        <VamoIcon className="h-8 w-8 text-primary mr-2" />
        <h1 className="text-3xl font-bold text-center">Panel Conductor</h1>
      </div>
      
      <div className="my-4 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
          <p className="text-sm text-center mb-2">Botón de limpieza temporal:</p>
          <Button variant="destructive" onClick={handleFinalizeAllRides} className="w-full">
            Finalizar Todos los Viajes Activos
          </Button>
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
