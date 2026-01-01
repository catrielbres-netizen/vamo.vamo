
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
import { collection, doc, serverTimestamp, getAuth } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Separator } from '@/components/ui/separator';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, Place } from '@/lib/types';
import { speak } from '@/lib/speak';

export default function RidePage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, profile, loading } = useUser();
  const { toast } = useToast();
  const router = useRouter();


  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [serviceType, setServiceType] = useState<"premium" | "privado" | "express">('premium');
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  
  const activeRideRef = useMemoFirebase(
    () => (firestore && activeRideId ? doc(firestore, 'rides', activeRideId) : null),
    [firestore, activeRideId]
  );
  const { data: ride, isLoading: isRideLoading } = useDoc<Ride>(activeRideRef);

  const userProfileRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
      [firestore, user]
  );
  
  const prevRideRef = useRef<WithId<Ride> | null | undefined>(null);

  const status = ride?.status || 'idle';

  useEffect(() => {
    if (!destination || !origin) {
        setEstimatedFare(0);
        setDistanceMeters(0);
        setDurationSeconds(0);
        return;
    }
    
    // Use Directions API to get real distance if available
    if (window.google && window.google.maps && window.google.maps.DirectionsService) {
        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route(
            {
                origin: new window.google.maps.LatLng(origin.lat, origin.lng),
                destination: new window.google.maps.LatLng(destination.lat, destination.lng),
                travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result) {
                    const route = result.routes[0];
                    if (route && route.legs[0] && route.legs[0].distance && route.legs[0].duration) {
                        const dist = route.legs[0].distance.value;
                        const duration = route.legs[0].duration.value;
                        setDistanceMeters(dist);
                        setDurationSeconds(duration);
                        const fare = calculateFare({ distanceMeters: dist, service: serviceType });
                        setEstimatedFare(fare);
                        return;
                    }
                }
                // If API fails, reset to 0
                setDistanceMeters(0);
                setDurationSeconds(0);
                setEstimatedFare(0);
            }
        );
    } else {
        // Fallback for when Google Maps script is not ready
        setDistanceMeters(0);
        setDurationSeconds(0);
        setEstimatedFare(0);
    }
  }, [destination, origin, serviceType]);
  
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
    if (!firestore || !auth || !destination || !origin) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Por favor, completá el origen y el destino para pedir un viaje.',
      });
      return;
    }

    if (!profile?.profileCompleted) {
        toast({
            variant: 'destructive',
            title: 'Perfil Incompleto',
            description: 'Por favor, completá tu perfil con tu nombre y teléfono antes de pedir un viaje.',
        });
        router.push('/dashboard/complete-profile');
        return;
    }
    
    let currentUser = user;
    if (!currentUser) {
        initiateAnonymousSignIn(auth);
        toast({
            title: 'Iniciando sesión...',
            description: 'Un momento por favor. Vuelve a presionar "Pedir Viaje" en unos segundos.',
        });
        return; 
    }

    if (!userProfileRef) {
        toast({
            variant: 'destructive',
            title: 'Error de perfil',
            description: 'No se pudo cargar tu perfil de usuario. Inténtalo de nuevo.',
        });
        return;
    }


    let rideFare = estimatedFare;
    let discountAmount = 0;

    if(profile?.activeBonus) {
        discountAmount = rideFare * 0.10;
    }

    const ridesCollection = collection(firestore, 'rides');
    const newRideData = {
      passengerId: currentUser.uid,
      passengerName: profile?.name || 'Pasajero Anónimo',
      origin: { lat: origin.lat, lng: origin.lng, address: origin.address },
      destination: {
        address: destination.address,
        lat: destination.lat,
        lng: destination.lng,
      },
      serviceType: serviceType,
      pricing: {
        estimatedTotal: rideFare,
        estimatedDistanceMeters: distanceMeters,
        estimatedDurationSeconds: durationSeconds,
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
            if (profile?.activeBonus && profile.vamoPoints) {
                await updateDocumentNonBlocking(userProfileRef, { 
                    activeBonus: false,
                    vamoPoints: profile.vamoPoints - 30
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
      setOrigin(null);
  }

  const getAction = () => {
    switch (status) {
        case 'idle':
            return { handler: handleRequestRide, label: 'Pedir Viaje', variant: 'default' as const };
        case 'searching_driver':
        case 'driver_assigned':
        case 'driver_arriving':
             return { handler: handleCancelRide, label: 'Cancelar Viaje', variant: 'destructive' as const };
        case 'arrived':
        case 'in_progress':
        case 'paused':
            // Una vez que el conductor llega, el pasajero no puede cancelar.
            return { handler: () => {}, label: 'Viaje en Curso...', variant: 'secondary' as const, disabled: true };
        case 'finished':
        case 'cancelled':
             return { handler: handleReset, label: 'Pedir Otro Viaje', variant: 'default' as const };
        default:
             return { handler: () => {}, label: '...', variant: 'secondary' as const };
    }
  }

  const currentAction = getAction();


  if (loading) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando tu sesión...</p>
      </main>
    );
  }
  
  const fareToDisplay = profile?.activeBonus ? estimatedFare * 0.9 : estimatedFare;

  return (
    <>
      {status !== 'idle' && ride ? (
        <RideStatus ride={ride} />
      ) : (
        <>
          <TripCard 
            status={status} 
            origin={origin}
            onOriginSelect={setOrigin}
            destination={destination}
            onDestinationSelect={setDestination}
            isInteractive={true}
          />
          <ServiceSelector 
            value={serviceType} 
            onChange={(val) => setServiceType(val as any)} 
          />
          <PriceDisplay price={fareToDisplay} isNight={false} originalPrice={profile?.activeBonus ? estimatedFare : undefined} />
        </>
      )}
      <MainActionButton 
        status={status} 
        onClick={currentAction.handler}
        label={currentAction.label}
        variant={currentAction.variant}
        disabled={isRideLoading || (status==='idle' && (!destination || !origin || distanceMeters === 0)) || currentAction.disabled}
      />
       <div className="mt-8">
        <Separator />
        <p className="text-center text-muted-foreground text-sm mt-4">No hay viajes anteriores.</p>
       </div>
    </>
  );
}
