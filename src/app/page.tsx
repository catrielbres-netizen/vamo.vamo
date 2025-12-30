
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { PassengerHeader } from '@/components/PassengerHeader';
import { TripCard } from '@/components/TripCard';
import { ServiceSelector } from '@/components/ServiceSelector';
import { PriceDisplay } from '@/components/PriceDisplay';
import { MainActionButton } from '@/components/MainActionButton';
import {
  useUser,
  useAuth,
  useFirestore,
  useDoc,
  useMemoFirebase,
  addDocumentNonBlocking,
  updateDocumentNonBlocking
} from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { VamoIcon } from '@/components/icons';
import { calculateFare } from '@/lib/pricing';
import { collection, doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Separator } from '@/components/ui/separator';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile } from '@/lib/types';
import { speak } from '@/lib/speak';

export default function Home() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  // State for the new ride request form
  const [destination, setDestination] = useState('');
  const [serviceType, setServiceType] = useState<"premium" | "privado" | "express">('premium');
  const [estimatedFare, setEstimatedFare] = useState(0);

  // State to track the active ride ID
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  // Subscribe to the active ride document
  const activeRideRef = useMemoFirebase(
    () => (firestore && activeRideId ? doc(firestore, 'rides', activeRideId) : null),
    [firestore, activeRideId]
  );
  const { data: ride, isLoading: isRideLoading } = useDoc<Ride>(activeRideRef);

  const userProfileRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
      [firestore, user]
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userProfileRef);
  
  const prevRideRef = useRef<WithId<Ride> | null | undefined>(null);


  // Derived state from the ride document
  const status = ride?.status || 'idle';

  // Effect for anonymous sign-in
  useEffect(() => {
    if (!auth) return;
    if (!user && !isUserLoading) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);
  
    // Effect to calculate estimated fare
  useEffect(() => {
    if (destination.length > 3) { // Simple check to start estimating
      // Mock distance for estimation. In a real app, this would come from a Maps API
      const mockDistance = 4200;
      const fare = calculateFare({ distanceMeters: mockDistance, service: serviceType });
      setEstimatedFare(fare);
    } else {
      setEstimatedFare(0);
    }
  }, [destination, serviceType]);
  
  // Effect to handle spoken notifications for status changes
  useEffect(() => {
    const prevStatus = prevRideRef.current?.status;
    const currentStatus = ride?.status;

    if (prevStatus !== currentStatus) {
        if (currentStatus === 'driver_assigned' && ride.driverName) {
            const message = "Tu viaje ya fue aceptado";
            toast({
                title: '¡Conductor asignado!',
                description: `${ride.driverName} está en camino.`,
            });
            speak(message);
        }
    }

    prevRideRef.current = ride;
  }, [ride]);


  const handleRequestRide = async () => {
    if (!firestore || !user || !destination || !userProfileRef) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Por favor, completá el destino para pedir un viaje.',
      });
      return;
    }

    let rideFare = estimatedFare;
    let discountAmount = 0;

    // Check for bonus and apply it
    if(userProfile?.activeBonus) {
        discountAmount = rideFare * 0.10;
        // The passenger pays the discounted price.
        // The driver will get the full fare, with the app covering the discount.
    }

    const ridesCollection = collection(firestore, 'rides');
    const newRideData = {
      passengerId: user.uid,
      passengerName: user.displayName || 'Pasajero Anónimo',
      origin: { lat: -43.3005, lng: -65.1023 }, // Mock: Rawson, Chubut
      destination: {
        address: destination,
        lat: -43.25, // Mock coordinates
        lng: -65.05,
      },
      serviceType: serviceType,
      pricing: {
        estimatedTotal: rideFare,
        estimatedDistanceMeters: 4200, // Corresponds to mock distance
        finalTotal: null,
        discountAmount: discountAmount,
      },
      status: 'searching_driver' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      finishedAt: null,
      driverId: null,
      pauseStartedAt: null,
      pauseHistory: [],
    };

    try {
        const docRef = await addDocumentNonBlocking(ridesCollection, newRideData);
        if (docRef) {
            setActiveRideId(docRef.id);
            toast({
                title: '¡Buscando conductor!',
                description: 'Tu pedido fue enviado. Esperá la confirmación.',
            });
            // If a bonus was used, deactivate it in the user's profile
            if (userProfile?.activeBonus) {
                await updateDocumentNonBlocking(userProfileRef, { 
                    activeBonus: false,
                    vamoPoints: userProfile.vamoPoints - 30 // Consume points
                });
            }
        }
    } catch(e) {
        // Error is handled by non-blocking-updates
    }
  };
  
  const handleCancelRide = () => {
    if (!activeRideRef) return;

    updateDocumentNonBlocking(activeRideRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    toast({
        variant: "destructive",
        title: "Viaje Cancelado",
        description: "Tu viaje ha sido cancelado.",
    });
    // The useDoc hook will update the ride status, and the UI will react
  }
  
  const handleReset = () => {
      setActiveRideId(null);
      setDestination('');
  }

  const getAction = () => {
    switch (status) {
        case 'idle':
            return { handler: handleRequestRide, label: 'Pedir Viaje', variant: 'default' as const };
        case 'searching_driver':
        case 'driver_assigned':
        case 'arrived':
        case 'driver_arriving':
             return { handler: handleCancelRide, label: 'Cancelar Viaje', variant: 'destructive' as const };
        case 'finished':
        case 'cancelled':
             return { handler: handleReset, label: 'Pedir Otro Viaje', variant: 'default' as const };
        default:
             return { handler: () => {}, label: '...', variant: 'secondary' as const };
    }
  }

  const currentAction = getAction();


  if (isUserLoading || isProfileLoading || !user) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando...</p>
      </main>
    );
  }

  const fareToDisplay = userProfile?.activeBonus ? estimatedFare * 0.9 : estimatedFare;

  return (
    <main className="max-w-md mx-auto pb-4 px-4">
      <PassengerHeader userName={user.isAnonymous ? "Invitado" : user.displayName || "Usuario"} location="Rawson, Chubut" />

      {status !== 'idle' && ride ? (
        <RideStatus ride={ride} />
      ) : (
        <>
          <TripCard 
            status={status} 
            origin="Ubicación actual (simulada)" 
            destination={destination}
            onDestinationChange={setDestination}
            isInteractive={true}
          />
          <ServiceSelector 
            value={serviceType} 
            onChange={(val) => setServiceType(val as any)} 
          />
          <PriceDisplay price={fareToDisplay} isNight={false} originalPrice={userProfile?.activeBonus ? estimatedFare : undefined} />
        </>
      )}
      <MainActionButton 
        status={status} 
        onClick={currentAction.handler}
        label={currentAction.label}
        variant={currentAction.variant}
        disabled={isRideLoading || (status==='idle' && !destination)}
      />
       <div className="mt-8">
        <Separator />
        <p className="text-center text-muted-foreground text-sm mt-4">No hay viajes anteriores.</p>
       </div>
    </main>
  );
}
