
// src/app/page.tsx
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  updateDocumentNonBlocking,
} from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { VamoIcon } from '@/components/icons';
import { calculateFare } from '@/lib/pricing';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Separator } from '@/components/ui/separator';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, Place } from '@/lib/types';
import { speak } from '@/lib/speak';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export default function Home() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const maps = useMapsLibrary('routes');

  const [origin, setOrigin] = useState<Place | null>({
      address: 'Rawson, Chubut, Argentina',
      lat: -43.3005,
      lng: -65.1023
  });
  const [destination, setDestination] = useState<Place | null>(null);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [serviceType, setServiceType] = useState<"premium" | "privado" | "express">('premium');
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(true);

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

  const status = ride?.status || 'idle';

  useEffect(() => {
    if (!auth) return;
    if (!user && !isUserLoading) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  useEffect(() => {
    if (isUserLoading || isProfileLoading) {
      return; 
    }

    if (user && userProfile) {
      if (userProfile.isDriver) {
        router.replace('/driver');
      } else {
        setIsRedirecting(false);
      }
    } else {
      setIsRedirecting(false);
    }
  }, [user, userProfile, isUserLoading, isProfileLoading, router]);

  useEffect(() => {
    if (!maps || !origin || !destination) {
        setEstimatedFare(0);
        return;
    }
    const directionsService = new maps.DirectionsService();
    directionsService.route({
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        travelMode: google.maps.TravelMode.DRIVING,
    }, (response, status) => {
        if (status === 'OK' && response && response.routes.length > 0) {
            const route = response.routes[0];
            const leg = route.legs[0];
            if (leg && leg.distance) {
                const distance = leg.distance.value;
                setDistanceMeters(distance);
                const fare = calculateFare({ distanceMeters: distance, service: serviceType });
                setEstimatedFare(fare);
            }
        } else {
            console.error(`Directions request failed due to ${status}`);
        }
    });

  }, [destination, serviceType, origin, maps]);
  
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
  }, [ride, toast]);


  const handleRequestRide = async () => {
    if (!firestore || !user || !destination || !origin || !userProfileRef) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Por favor, completá el destino para pedir un viaje.',
      });
      return;
    }

    let rideFare = estimatedFare;
    let discountAmount = 0;

    if(userProfile?.activeBonus) {
        discountAmount = rideFare * 0.10;
    }

    const ridesCollection = collection(firestore, 'rides');
    const newRideData = {
      passengerId: user.uid,
      passengerName: userProfile?.name || 'Pasajero Anónimo',
      origin: { lat: origin.lat, lng: origin.lng },
      destination: {
        address: destination.address,
        lat: destination.lat,
        lng: destination.lng,
      },
      serviceType: serviceType,
      pricing: {
        estimatedTotal: rideFare,
        estimatedDistanceMeters: distanceMeters,
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
            if (userProfile?.activeBonus) {
                await updateDocumentNonBlocking(userProfileRef, { 
                    activeBonus: false,
                    vamoPoints: userProfile.vamoPoints - 30
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
  }
  
  const handleReset = () => {
      setActiveRideId(null);
      setDestination(null);
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


  if (isUserLoading || isProfileLoading || isRedirecting) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando...</p>
      </main>
    );
  }

  const fareToDisplay = userProfile?.activeBonus ? estimatedFare * 0.9 : estimatedFare;
  const userName = userProfile?.name || (user?.isAnonymous ? "Invitado" : user?.displayName || "Usuario");

  return (
    <main className="max-w-md mx-auto pb-4 px-4">
      <PassengerHeader 
        userName={userName}
        location="Rawson, Chubut" 
      />

      {status !== 'idle' && ride ? (
        <RideStatus ride={ride} />
      ) : (
        <>
          <TripCard 
            status={status} 
            origin={origin?.address || 'Ubicación actual'} 
            destination={destination}
            onDestinationSelect={setDestination}
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
