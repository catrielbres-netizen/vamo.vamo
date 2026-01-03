
// /app/driver/rides/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser, useCollection } from '@/firebase';
import { collection, query, where, onSnapshot, Unsubscribe, doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { useToast } from "@/hooks/use-toast";
import { speak } from '@/lib/speak';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, ServiceType, UserProfile } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useMemoFirebase } from '@/firebase/hooks';


// Helper function to determine which services a driver can see based on their car model year
const getAllowedServices = (profile: UserProfile | null): ServiceType[] => {
    if (!profile || !profile.carModelYear) {
        return [];
    }

    const year = profile.carModelYear;

    if (year >= 2022) {
        // Premium drivers can take any ride
        return ['premium', 'privado', 'express'];
    }
    if (year >= 2016) {
        // Privado drivers can take Privado and Express
        return ['privado', 'express'];
    }
    // Older cars can only take Express
    return ['express'];
}

const statusMessages: Record<UserProfile['vehicleVerificationStatus'] & string, {title: string, description: string, icon: string}> = {
    unverified: {
        title: 'Perfil Incompleto',
        description: 'Debes completar tu perfil y enviar la documentación para empezar a recibir viajes.',
        icon: 'loader'
    },
    pending_review: {
        title: 'Cuenta en Revisión',
        description: 'Nuestro equipo está verificando tu documentación. Recibirás una notificación cuando tu cuenta sea aprobada. Esto puede demorar hasta 24hs.',
        icon: 'clock'
    },
    rejected: {
        title: 'Cuenta Rechazada',
        description: 'Hubo un problema con tu documentación. Por favor, contactá a soporte para más información.',
        icon: 'x-circle'
    },
    approved: {
        title: '¡Estás en línea!',
        description: 'Ya podés recibir viajes. ¡Buenas rutas!',
        icon: 'shield-check'
    }
}


export default function DriverRidesPage() {
  const firestore = useFirestore();
  const { user, profile, loading: isUserLoading } = useUser();
  const { toast } = useToast();
  
  const [activeRide, setActiveRide] = useState<WithId<Ride> | null>(null);
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);
  
  const activeRideUnsubscribe = useRef<Unsubscribe | null>(null);
  const locationWatchId = useRef<number | null>(null);
  const activeRideStateRef = useRef<WithId<Ride> | null>(null);
  const previousAvailableRides = useRef<WithId<Ride>[]>([]);

  const isOnline = profile?.driverStatus === 'online';

  // Only query for rides if the driver is approved AND online
  const availableRidesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || activeRide || !profile?.approved || !isOnline) return null;
    return query(
        collection(firestore, 'rides'),
        where('status', '==', 'searching_driver')
    );
  }, [firestore, user?.uid, activeRide, profile?.approved, isOnline]);

  const { data: availableRides, isLoading: areRidesLoading } = useCollection<Ride>(availableRidesQuery);

  useEffect(() => {
    activeRideStateRef.current = activeRide;
  }, [activeRide]);


  const handleToggleOnline = (checked: boolean) => {
    if (!firestore || !user?.uid) return;
    const userProfileRef = doc(firestore, 'users', user.uid);
    if (checked) {
        updateDocumentNonBlocking(userProfileRef, { driverStatus: 'online' });
    } else {
        updateDocumentNonBlocking(userProfileRef, { driverStatus: 'inactive', currentLocation: null });
    }
  }


  useEffect(() => {
    if (!firestore || !user?.uid) return;

    // ---- START: Location Tracking Logic ----
    const startLocationTracking = () => {
        if (locationWatchId.current !== null) return; // Already tracking
        const userProfileRef = doc(firestore, 'users', user.uid);
        
        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                updateDocumentNonBlocking(userProfileRef, {
                    currentLocation: { lat: latitude, lng: longitude }
                });
            },
            (error) => {
                console.error("Error getting driver location:", error);
                // If location fails, force offline
                handleToggleOnline(false);
                toast({
                    variant: 'destructive',
                    title: 'Error de Ubicación',
                    description: 'No pudimos acceder a tu GPS. Te hemos desconectado.'
                })
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    const stopLocationTracking = () => {
        if (locationWatchId.current !== null) {
            navigator.geolocation.clearWatch(locationWatchId.current);
            locationWatchId.current = null;
        }
    };
    
    // Manage tracking based on online status and active ride
    if (profile?.approved && isOnline && !activeRide) {
        startLocationTracking();
    } else {
        stopLocationTracking();
    }

    // Cleanup function: stop tracking when component unmounts
    return () => {
        stopLocationTracking();
    };
    // ---- END: Location Tracking Logic ----

  }, [firestore, user?.uid, profile?.approved, activeRide, isOnline, toast]);


  useEffect(() => {
    if (!firestore || !user?.uid) {
      return;
    }

    activeRideUnsubscribe.current?.();

    const activeRideQuery = query(
      collection(firestore, 'rides'),
      where('driverId', '==', user.uid),
      where('status', 'in', ['driver_assigned', 'driver_arriving', 'arrived', 'in_progress', 'paused'])
    );

    activeRideUnsubscribe.current = onSnapshot(activeRideQuery, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
      const currentActiveRide = rides.length > 0 ? rides[0] : null;
      
      const wasActive = !!activeRideStateRef.current;

      setActiveRide(currentActiveRide);
      
      if(wasActive && !currentActiveRide) {
         toast({
            title: "Viaje cancelado o finalizado",
            description: "El viaje ha sido completado o cancelado por el pasajero. Vuelves a estar disponible.",
            variant: "destructive",
          });
      }
    }, (error) => {
      console.error("Error fetching active ride:", error);
    });

    return () => {
      activeRideUnsubscribe.current?.();
    };
  }, [firestore, user?.uid, toast]);


  useEffect(() => {
    if (areRidesLoading || !availableRides || !profile?.approved || !isOnline) return;

    const allowedServices = getAllowedServices(profile);
    const filteredRides = availableRides.filter(ride => allowedServices.includes(ride.serviceType));

    const newRides = filteredRides.filter(
        (ride) => !previousAvailableRides.current.some((prevRide) => prevRide.id === ride.id)
    );

    if (newRides.length > 0) {
          newRides.forEach(newRide => {
            const message = `Nuevo viaje ${newRide.serviceType} disponible.`;
            toast({
                title: `¡Nuevo viaje ${newRide.serviceType}!`,
                description: `Un pasajero solicita un viaje a ${newRide.destination.address}.`,
            });
            speak(message);
          });
    }
    
    previousAvailableRides.current = filteredRides;

  }, [availableRides, areRidesLoading, toast, profile, isOnline]);


  const handleAcceptRide = () => {
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

  const allowedServices = getAllowedServices(profile);
  const filteredAvailableRides = availableRides?.filter(ride => allowedServices.includes(ride.serviceType)) ?? [];
  
  const renderAvailableRides = () => {
    if (isUserLoading) {
      return <p className="text-center">Cargando perfil...</p>;
    }
    
    // Si el conductor no está aprobado, mostrarle un mensaje de estado
    if (!profile?.approved) {
        const statusKey = profile?.vehicleVerificationStatus || 'unverified';
        const message = statusMessages[statusKey];
        return (
            <Alert variant="default" className="border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30">
                <VamoIcon name={message.icon} className="h-4 w-4 text-yellow-500" />
                <AlertTitle className="text-yellow-700 dark:text-yellow-300">{message.title}</AlertTitle>
                <AlertDescription className="text-yellow-600 dark:text-yellow-500">
                    {message.description}
                </AlertDescription>
            </Alert>
        );
    }

    // Si el conductor está aprobado, mostrar el interruptor y la lista de viajes
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-card border">
                <Label htmlFor="online-switch" className="flex flex-col">
                    <span className="font-semibold">{isOnline ? "Estás En Línea" : "Estás Desconectado"}</span>
                    <span className="text-xs text-muted-foreground">{isOnline ? "Listo para recibir viajes." : "Activá para buscar viajes."}</span>
                </Label>
                <Switch
                    id="online-switch"
                    checked={isOnline}
                    onCheckedChange={handleToggleOnline}
                    disabled={!!activeRide}
                    aria-label="Toggle online status"
                />
            </div>

            {isOnline && (
                <>
                    <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="item-1">
                        <AccordionTrigger>
                            <div className="flex items-center gap-2">
                                <VamoIcon name="info" className="w-4 h-4"/> ¿Cómo funciona un viaje?
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="text-xs text-muted-foreground space-y-2">
                        <p><strong>1. Aceptar Viaje:</strong> Cuando un viaje esté disponible, aparecerá una tarjeta. Acéptala para que sea tuya.</p>
                        <p><strong>2. Recoger al Pasajero:</strong> Dirígete al punto de origen. Al llegar, presiona <strong>"Llegué al origen"</strong>. Esto le avisa al pasajero.</p>
                        <p><strong>3. Iniciar Viaje:</strong> Una vez que el pasajero esté en el vehículo, presiona <strong>"Iniciar Viaje"</strong> para comenzar la ruta hacia el destino.</p>
                        <p><strong>4. Pausas (Espera):</strong> Usa el botón <strong>"Pausar Viaje"</strong> SOLO si el pasajero pide detenerse (ej: kiosco). Esto activa el cobro por minuto de espera. Cuando el pasajero vuelva, presiona <strong>"Reanudar Viaje"</strong>.</p>
                        <p><strong>5. Finalizar Viaje:</strong> Al llegar al destino, presiona <strong>"Finalizar Viaje"</strong>. La app calculará la tarifa final, incluyendo las esperas, y te mostrará el resumen para cobrarle al pasajero.</p>
                        </AccordionContent>
                    </AccordionItem>
                    </Accordion>
                    
                    <h2 className="text-xl font-semibold text-center pt-4">Viajes Disponibles</h2>
                    {areRidesLoading ? (
                         <p className="text-center text-muted-foreground pt-8">Buscando viajes...</p>
                    ) : filteredAvailableRides.length > 0 ? (
                        filteredAvailableRides.map((ride) => (
                        <DriverRideCard
                            key={ride.id}
                            ride={ride}
                            onAccept={handleAcceptRide}
                        />
                        ))
                    ) : (
                        <p className="text-center text-muted-foreground pt-8">No hay viajes buscando conductor en este momento.</p>
                    )}
                </>
            )}
        </div>
    );
  }

  return (
    <>
      {activeRide ? (
         <ActiveDriverRide ride={activeRide} onFinishRide={handleFinishRide}/>
      ) : lastFinishedRide ? (
         <FinishedRideSummary ride={lastFinishedRide} onClose={handleCloseSummary} />
      ) : (
        renderAvailableRides()
      )}
    </>
  );
}
