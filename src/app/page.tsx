
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

export default function Home() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, profile, loading } = useUser();
  const { toast } = useToast();
  const router = useRouter();


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
    // This is the ONLY redirect that should be on this page.
    // If the user is not logged in after loading, send them to the login page.
    // Role-based redirects are handled in their respective layouts.
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);


  useEffect(() => {
    if (!destination) {
        setEstimatedFare(0);
        setDistanceMeters(0);
        return;
    }
    // Simulate distance for pricing without Directions API
    const simulatedDist = 5000; // 5km
    setDistanceMeters(simulatedDist);
    const fare = calculateFare({ distanceMeters: simulatedDist, service: serviceType });
    setEstimatedFare(fare);
  }, [destination, serviceType]);
  
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
        description: 'Por favor, completá el destino para pedir un viaje.',
      });
      return;
    }
    
    if (!user) {
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
      passengerId: user.uid,
      passengerName: profile?.name || 'Pasajero Anónimo',
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


  if (loading) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando...</p>
      </main>
    );
  }

  // Redirect non-passengers away if they land here
  if (profile && profile.role !== 'passenger') {
      // Show loading while redirecting to avoid flashing content
       return (
        <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
          <VamoIcon className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-center mt-4">Redirigiendo a tu panel...</p>
        </main>
      );
  }


  const fareToDisplay = profile?.activeBonus ? estimatedFare * 0.9 : estimatedFare;
  const userName = profile?.name || (user?.isAnonymous ? "Invitado" : user?.displayName || "Usuario");

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
          <PriceDisplay price={fareToDisplay} isNight={false} originalPrice={profile?.activeBonus ? estimatedFare : undefined} />
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

    