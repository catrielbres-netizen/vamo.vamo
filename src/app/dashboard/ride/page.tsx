
'use client';

import { useState, useEffect, useMemo, useRef, ChangeEvent } from 'react';
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
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { VamoIcon } from '@/components/VamoIcon';
import { calculateFare } from '@/lib/pricing';
import { collection, doc, serverTimestamp, query, where, limit, getDocs, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import RideStatus from '@/components/RideStatus';
import { Separator } from '@/components/ui/separator';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, Place, ServiceType } from '@/lib/types';
import { speak } from '@/lib/speak';
import { haversineDistance } from '@/lib/geo';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import MapSelector from '@/components/MapSelector';

// --- MODO DE PRUEBA ---
// Si es true, usa una ubicación fija en Rawson para simular el GPS.
// ¡PONER EN FALSE ANTES DE IR A PRODUCCIÓN!
const TEST_MODE = true;
const FAKE_PASSENGER_LOCATION = { 
    lat: -43.3001, // Rawson, Chubut
    lng: -65.1023,
    address: 'Ubicación de Prueba (Pasajero)'
};
// --------------------


// Helper function to determine which services a driver can take
const canDriverTakeRide = (driverProfile: UserProfile, rideService: ServiceType): boolean => {
    if (!driverProfile.carModelYear) return false;
    const driverYear = driverProfile.carModelYear;

    // Define the hierarchy of services
    const serviceHierarchy: Record<ServiceType, number> = {
        premium: 3,
        privado: 2,
        express: 1,
    };

    // Define the year requirements for each driver category
    const driverCategoryLevel = (() => {
        if (driverYear >= 2022) return serviceHierarchy.premium;
        if (driverYear >= 2016) return serviceHierarchy.privado;
        return serviceHierarchy.express;
    })();
    
    const requestedServiceLevel = serviceHierarchy[rideService];

    // A driver can take a ride if their category level is equal to or higher than the requested service level.
    return driverCategoryLevel >= requestedServiceLevel;
};


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
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);
  const [isMapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  
  // This query now ONLY fetches TRULY active rides.
  const activeRideQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'rides'),
      where('passengerId', '==', user.uid),
      where('status', 'in', ['searching_driver', 'driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused']),
      limit(1)
    );
  }, [firestore, user?.uid]);

  const { data: activeRides, isLoading: isRideLoading } = useCollection<WithId<Ride>>(activeRideQuery);
  const ride = useMemo(() => (activeRides && activeRides.length > 0 ? activeRides[0] : null), [activeRides]);
  const activeRideId = ride?.id;
  const activeRideRef = useMemoFirebase(() => (firestore && activeRideId ? doc(firestore, 'rides', activeRideId) : null), [firestore, activeRideId]);


  const userProfileRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
      [firestore, user]
  );
  
  const prevRideRef = useRef<WithId<Ride> | null | undefined>(null);

  const status = lastFinishedRide ? lastFinishedRide.status : (ride?.status || 'idle');

  const handleReset = (isFinished: boolean = false) => {
      setDestination(null);
      setOrigin(null);
      setEstimatedFare(0);
      setDistanceMeters(0);
      setDurationSeconds(0);
      if (isFinished) {
        setLastFinishedRide(null); // Clear the finished ride to show the form
      }
  }

  const handleOriginChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    if (origin) {
      setOrigin({ ...origin, address: newAddress });
    } else {
      setOrigin({ address: newAddress, lat: 0, lng: 0 });
    }
  };

  const handleDestinationChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    if (destination) {
      setDestination({ ...destination, address: newAddress });
    } else {
      setDestination({ address: newAddress, lat: 0, lng: 0 });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
        if (window.google?.maps?.DirectionsService) {
            setMapsReady(true);
            clearInterval(interval);
        }
    }, 300);

    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    const calculateRoute = () => {
      if (!destination || !origin || !destination.lat || !origin.lat) {
          setEstimatedFare(0);
          setDistanceMeters(0);
          setDurationSeconds(0);
          return;
      }

      // Fallback for when Google Maps API is not ready
      const fallbackEstimate = () => {
          console.log("Usando cálculo de distancia Haversine (línea recta).");
          const dist = haversineDistance(origin, destination);
          setDistanceMeters(dist);
          setDurationSeconds(0); // Can't estimate duration from straight line
          const fare = calculateFare({ distanceMeters: dist, service: serviceType });
          setEstimatedFare(fare);
          if (mapsReady) { // Only toast if Maps API was ready but directions still failed
            toast({
                variant: 'destructive',
                title: 'No se pudo calcular la ruta exacta',
                description: 'La tarifa se estimó en línea recta. Puede variar.'
            });
          }
      }
      
      if (!mapsReady) {
          fallbackEstimate();
          return;
      }

      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
          {
              origin: new window.google.maps.LatLng(origin.lat, origin.lng),
              destination: new window.google.maps.LatLng(destination.lat, destination.lng),
              travelMode: window.google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
              if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]?.legs?.[0]) {
                  console.log("Ruta calculada con DirectionsService.");
                  const leg = result.routes[0].legs[0];
                  const dist = leg.distance?.value ?? 0;
                  const duration = leg.duration?.value ?? 0;
                  const fare = calculateFare({ distanceMeters: dist, service: serviceType });
                  setEstimatedFare(fare);
                  setDistanceMeters(dist);
                  setDurationSeconds(duration);
              } else {
                  console.error(`DirectionsService falló: ${status}`);
                  fallbackEstimate();
              }
          }
      );
    }
    calculateRoute();
  }, [destination?.lat, destination?.lng, origin?.lat, origin?.lng, serviceType, mapsReady, toast]);
  
  useEffect(() => {
    const prevStatus = prevRideRef.current?.status;
    const currentStatus = ride?.status;

    // A ride has just finished or been cancelled
    if (prevRideRef.current && !ride) {
      if (prevStatus === 'in_progress' || prevStatus === 'paused' || prevStatus === 'arrived') {
          // The ride disappeared from the active query, so it must be finished/cancelled.
          // We set it as the last finished ride to show the summary screen.
          setLastFinishedRide({ ...prevRideRef.current, status: 'finished' });
      } else if (prevStatus === 'searching_driver' || prevStatus === 'driver_assigned' || prevStatus === 'driver_arriving') {
          setLastFinishedRide({ ...prevRideRef.current, status: 'cancelled' });
      }
    } else if (prevStatus !== currentStatus) {
        if (currentStatus === 'driver_assigned' && ride?.driverName) {
            const message = "Tu viaje ya fue aceptado";
            toast({
                title: '¡Conductor asignado!',
                description: `${ride.driverName} está en camino.`,
            });
            speak(message);
        } else if (currentStatus === 'searching_driver' && ride?.candidates && ride.currentCandidateIndex && ride.currentCandidateIndex > 0) {
            toast({
                title: 'Buscando otro conductor...',
                description: `El conductor anterior no aceptó. Estamos intentando con el siguiente.`,
            });
        }
    }
    prevRideRef.current = ride;
  }, [ride, toast]);


  const handleRequestRide = async () => {
    if (!firestore || !auth || !destination || !origin || !destination.lat || !origin.lat) {
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

    // --- Start of New Intelligent Dispatch Logic ---
    const onlineDriversQuery = query(
        collection(firestore, 'users'),
        where('role', '==', 'driver'),
        where('driverStatus', '==', 'online'),
        where('approved', '==', true)
    );

    const driversSnapshot = await getDocs(onlineDriversQuery);
    
    const eligibleDrivers = driversSnapshot.docs
        .map(doc => ({ ...doc.data() as UserProfile, id: doc.id }))
        .filter(driver => driver.isSuspended !== true) // Filter out suspended drivers on the client
        .filter(driver => driver.currentLocation && canDriverTakeRide(driver, serviceType))
        .map(driver => {
            const distance = haversineDistance(origin, driver.currentLocation!);
            return { ...driver, distance };
        })
        .sort((a, b) => a.distance - b.distance); // Sort by distance, closest first

    const candidateIds = eligibleDrivers.map(d => d.id);

    if (candidateIds.length === 0) {
        toast({ variant: 'destructive', title: 'Sin Conductores', description: 'No hay conductores disponibles para este tipo de servicio en este momento.' });
        return;
    }
    // --- End of New Intelligent Dispatch Logic ---


    let rideFare = estimatedFare;
    let discountAmount = 0;

    if(profile?.activeBonus) {
        discountAmount = rideFare * 0.10;
    }

    const ridesCollection = collection(firestore, 'rides');
    const newRideData: Omit<Ride, 'id'> = {
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
      audited: false,
      // --- New dispatch fields ---
      candidates: candidateIds,
      currentCandidateIndex: 0,
      expiresAt: null,
    };

    try {
        const docRef = await addDocumentNonBlocking(ridesCollection, newRideData);
        if (docRef) {
            toast({
                title: '¡Buscando al conductor más cercano!',
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

  const handleUseCurrentLocation = () => {
    if (TEST_MODE) {
        setOrigin(FAKE_PASSENGER_LOCATION);
        toast({ title: 'Modo de Prueba', description: 'Ubicación de origen fijada en Rawson.' });
        return;
    }

    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Error', description: 'Tu navegador no soporta geolocalización.' });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (!window.google || !window.google.maps.Geocoder) {
          setOrigin({ lat: latitude, lng: longitude, address: 'Ubicación actual' });
          return;
        }

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
          if (status === 'OK' && results?.[0]) {
            setOrigin({
              lat: latitude,
              lng: longitude,
              address: results[0].formatted_address.split(',')[0],
            });
          } else {
            setOrigin({ lat: latitude, lng: longitude, address: 'Ubicación actual' });
          }
        });
      },
      () => {
        toast({ variant: 'destructive', title: 'Error de ubicación', description: 'No se pudo obtener tu ubicación. Asegurate de tener los permisos activados.' });
      }
    );
  };

  const handlePickDestinationOnMap = () => {
    setMapSelectorOpen(true);
  }

  const handleMapSelect = (place: Place) => {
    setDestination(place);
    setMapSelectorOpen(false);
  }

  const getAction = () => {
    // If there's a finished ride summary, no main action button is shown.
    if (lastFinishedRide) return null;

    switch (ride?.status) {
        case undefined: // This is the 'idle' state
            return { handler: handleRequestRide, label: 'Pedir Viaje', variant: 'default' as const };
        case 'searching_driver':
        case 'driver_assigned':
        case 'driver_arriving':
             return { handler: handleCancelRide, label: 'Cancelar Viaje', variant: 'destructive' as const };
        case 'arrived':
        case 'in_progress':
        case 'paused':
            return { handler: () => {}, label: 'Viaje en Curso...', variant: 'secondary' as const, disabled: true };
        default:
             return null; // Should not happen
    }
  }

  const currentAction = getAction();


  if (loading) {
    return (
      <main className="container mx-auto max-w-md p-4 flex flex-col justify-center items-center min-h-screen">
        <VamoIcon name="car" className="h-12 w-12 text-primary animate-pulse" />
        <p className="text-center mt-4">Cargando tu sesión...</p>
      </main>
    );
  }
  
  const fareToDisplay = profile?.activeBonus ? estimatedFare * 0.9 : estimatedFare;

  const rideToShow = lastFinishedRide || ride;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  return (
    <>
      <Dialog open={isMapSelectorOpen} onOpenChange={setMapSelectorOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Seleccioná el destino</DialogTitle>
            <DialogDescription>
              Movete por el mapa y ubicá el pin en el punto exacto donde querés ir.
            </DialogDescription>
          </DialogHeader>
          {apiKey ? (
            <APIProvider apiKey={apiKey}>
              <MapSelector onLocationSelect={handleMapSelect} />
            </APIProvider>
          ) : (
             <div className="flex flex-col items-center justify-center h-full">
                <p className="text-destructive">La clave de API de Google Maps no está configurada.</p>
             </div>
          )}
        </DialogContent>
      </Dialog>


      {(rideToShow) ? (
        <RideStatus ride={rideToShow} onNewRide={handleReset} />
      ) : (
        <>
          <TripCard 
            status={'idle'} 
            origin={origin}
            onOriginSelect={setOrigin}
            onOriginChange={handleOriginChange}
            destination={destination}
            onDestinationSelect={setDestination}
            onDestinationChange={handleDestinationChange}
            isInteractive={true}
            onUseCurrentLocation={handleUseCurrentLocation}
            onPickDestinationOnMap={handlePickDestinationOnMap}
          />
          <ServiceSelector 
            value={serviceType} 
            onChange={(val) => setServiceType(val as any)} 
          />
          <PriceDisplay price={fareToDisplay} isNight={false} originalPrice={profile?.activeBonus ? estimatedFare : undefined} />
        </>
      )}

      {currentAction && (
        <MainActionButton 
            status={ride?.status || 'idle'} 
            onClick={currentAction.handler}
            label={currentAction.label}
            variant={currentAction.variant}
            disabled={
                isRideLoading ||
                (status === 'idle' &&
                    (!destination ||
                    !origin ||
                    !destination.lat ||
                    !origin.lat ||
                    estimatedFare === 0)) ||
                currentAction.disabled
            }
        />
      )}

       <div className="mt-8">
        <Separator />
        <p className="text-center text-muted-foreground text-sm mt-4">No hay viajes anteriores.</p>
       </div>
    </>
  );
}
