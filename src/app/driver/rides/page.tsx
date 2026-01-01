// /app/driver/rides/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
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
import { ShieldCheck, Clock, Loader, Info } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


// Helper function to determine which services a driver can see
const getAllowedServices = (): ServiceType[] => {
    return ['premium', 'privado', 'express'];
}

const statusMessages: Record<UserProfile['vehicleVerificationStatus'] & string, {title: string, description: string, icon: React.ReactNode}> = {
    unverified: {
        title: 'Perfil Incompleto',
        description: 'Debes completar tu perfil y enviar la documentación para empezar a recibir viajes.',
        icon: <Loader className="animate-spin" />
    },
    pending_review: {
        title: 'Cuenta en Revisión',
        description: 'Nuestro equipo está verificando tu documentación. Recibirás una notificación cuando tu cuenta sea aprobada. Esto puede demorar hasta 24hs.',
        icon: <Clock />
    },
    rejected: {
        title: 'Cuenta Rechazada',
        description: 'Hubo un problema con tu documentación. Por favor, contactá a soporte para más información.',
        icon: <Clock />
    },
    approved: {
        title: '¡Estás en línea!',
        description: 'Ya podés recibir viajes. ¡Buenas rutas!',
        icon: <ShieldCheck />
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

  // Only query for rides if the driver is approved
  const availableRidesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || activeRide || !profile?.approved) return null;
    return query(
        collection(firestore, 'rides'),
        where('status', '==', 'searching_driver')
    );
  }, [firestore, user?.uid, activeRide, profile?.approved]);

  const { data: availableRides, isLoading: areRidesLoading } = useCollection<Ride>(availableRidesQuery);

  useEffect(() => {
    activeRideStateRef.current = activeRide;
  }, [activeRide]);


  useEffect(() => {
    if (!firestore || !user?.uid) return;

    // ---- START: Location Tracking Logic ----
    const startLocationTracking = () => {
        const userProfileRef = doc(firestore, 'users', user.uid);
        
        // Set status to online
        updateDocumentNonBlocking(userProfileRef, { driverStatus: 'online' });

        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                // Update Firestore with the new location non-blockingly
                updateDocumentNonBlocking(userProfileRef, {
                    currentLocation: { lat: latitude, lng: longitude }
                });
            },
            (error) => {
                console.error("Error getting driver location:", error);
                toast({
                    variant: "destructive",
                    title: "Error de ubicación",
                    description: "No pudimos obtener tu ubicación. Asegurate de tener el GPS activado y los permisos concedidos."
                })
                // If location fails, set status to inactive
                updateDocumentNonBlocking(userProfileRef, { driverStatus: 'inactive', currentLocation: null });
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const stopLocationTracking = () => {
        if (locationWatchId.current !== null) {
            navigator.geolocation.clearWatch(locationWatchId.current);
            locationWatchId.current = null;
        }
        // Set status to inactive when tracking stops
        if(user?.uid) {
            const userProfileRef = doc(firestore, 'users', user.uid);
            updateDocumentNonBlocking(userProfileRef, { driverStatus: 'inactive', currentLocation: null });
        }
    };
    
    if (profile?.approved && !activeRide) {
        startLocationTracking();
    } else {
        stopLocationTracking();
    }

    // Cleanup function: stop tracking when component unmounts or dependencies change
    return () => {
        stopLocationTracking();
    };
    // ---- END: Location Tracking Logic ----

  }, [firestore, user?.uid, profile?.approved, activeRide, toast]);


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
      // El error de permisos es manejado por el FirebaseErrorListener global.
    });

    return () => {
      activeRideUnsubscribe.current?.();
    };
  }, [firestore, user?.uid, toast]);


  useEffect(() => {
    if (areRidesLoading || !availableRides || !profile?.approved) return;

    const allowedServices = getAllowedServices();
    const filteredRides = availableRides.filter(ride => allowedServices.includes(ride.serviceType));

    const newRides = filteredRides.filter(
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
    
    previousAvailableRides.current = filteredRides;

  }, [availableRides, areRidesLoading, toast, profile?.approved]);


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

  const allowedServices = getAllowedServices();
  const filteredAvailableRides = availableRides?.filter(ride => allowedServices.includes(ride.serviceType)) ?? [];
  
  const renderAvailableRides = () => {
    if (areRidesLoading || isUserLoading) {
      return <p className="text-center">Buscando viajes...</p>;
    }
    
    // Si el conductor no está aprobado, mostrarle un mensaje de estado
    if (!profile?.approved) {
        const statusKey = profile?.vehicleVerificationStatus || 'unverified';
        const message = statusMessages[statusKey];
        return (
            <Alert variant="default" className="border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30">
                <div className="text-yellow-500">{message.icon}</div>
                <AlertTitle className="text-yellow-700 dark:text-yellow-300">{message.title}</AlertTitle>
                <AlertDescription className="text-yellow-600 dark:text-yellow-500">
                    {message.description}
                </AlertDescription>
            </Alert>
        );
    }

    // Si el conductor está aprobado, mostrar la lista de viajes
    const statusInfo = statusMessages['approved'];
    return (
        <div className="space-y-4">
            <Alert variant="default" className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
                 <div className="text-green-500">{statusInfo.icon}</div>
                <AlertTitle>{statusInfo.title}</AlertTitle>
                <AlertDescription className="text-green-600 dark:text-green-500">
                    {statusInfo.description}
                </AlertDescription>
            </Alert>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4"/> ¿Cómo funciona un viaje?
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
            {filteredAvailableRides.length > 0 ? (
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
