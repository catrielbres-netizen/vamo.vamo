'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, onSnapshot, Unsubscribe, doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { useToast } from "@/hooks/use-toast";
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, ServiceType, UserProfile, PlatformTransaction } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { VamoIcon } from '@/components/VamoIcon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useFCM } from '@/hooks/useFCM';
import { Button } from '@/components/ui/button';
import { getAuth } from 'firebase/auth';

// Ubicación de respaldo para cuando el GPS no está disponible (ej. en una computadora)
const FALLBACK_DRIVER_LOCATION = { lat: -43.3009, lng: -65.1018 }; // Terminal de Rawson, Chubut


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


const PushActivationUI = () => {
    const { status, enablePush, supported } = useFCM();

    if (!supported) {
        return (
            <Alert variant="destructive">
                <VamoIcon name="alert-triangle" className="h-4 w-4" />
                <AlertTitle>Navegador no Compatible</AlertTitle>
                <AlertDescription>
                    Tu navegador no soporta notificaciones push. Para recibir alertas de viaje con la app cerrada, usá Chrome, Edge o Firefox en una computadora o un celular Android. Safari en iPhone no es compatible.
                </AlertDescription>
            </Alert>
        );
    }
    
    if (status === 'enabled') {
        return (
            <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20">
                <VamoIcon name="bell" className="h-4 w-4"/>
                <p className="text-sm font-medium">Notificaciones activas</p>
            </div>
        );
    }
    
    if (status === 'blocked') {
        return (
           <Alert variant="destructive">
               <VamoIcon name="alert-triangle" className="h-4 w-4" />
               <AlertTitle>Notificaciones Bloqueadas</AlertTitle>
               <AlertDescription>
                  Para recibir viajes con la app cerrada, necesitás habilitar las notificaciones manualmente. Hacé clic en el ícono del candado (🔒) en la barra de direcciones del navegador y cambiá el permiso de Notificaciones a "Permitir".
               </AlertDescription>
           </Alert>
       );
    }

    return (
        <Button variant="default" size="sm" onClick={enablePush} disabled={status === 'loading'} className="w-full">
            {status === 'loading' && <VamoIcon name="loader" className="animate-spin mr-2" />}
            Activar Notificaciones para Viajes
        </Button>
    );
}


export default function DriverRidesPage() {
  const firestore = useFirestore();
  const { user, profile, loading: isUserLoading } = useUser();
  const { toast } = useToast();
  const { status: fcmStatus } = useFCM();
  
  const [activeRide, setActiveRide] = useState<WithId<Ride> | null>(null);
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);
  
  const activeRideUnsubscribe = useRef<Unsubscribe | null>(null);
  const locationWatchId = useRef<number | null>(null);
  const activeRideStateRef = useRef<WithId<Ride> | null>(null);

  const isOnline = profile?.driverStatus === 'online';

  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
        collection(firestore, 'platform_transactions'),
        where('driverId', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  const { data: transactions } = useCollection<PlatformTransaction>(transactionsQuery);
  const balance = useMemo(() => transactions?.reduce((acc, tx) => acc + tx.amount, 0) ?? 0, [transactions]);

  // --- New Dispatch Logic ---
  // A driver is now offered a ride if they are the current candidate.
  const availableRidesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || activeRide || !isOnline) {
        return null;
    }
    return query(
        collection(firestore, 'rides'),
        where('status', '==', 'searching_driver'),
        where('candidates', 'array-contains', user.uid)
    );
  }, [firestore, user?.uid, activeRide, isOnline]);
  
  const { data: potentialRides, isLoading: areRidesLoading } = useCollection<Ride>(availableRidesQuery);

  const offeredRide = useMemo(() => {
    if (!potentialRides || !user?.uid) return null;
    
    return potentialRides.find(ride => {
        const candidateIndex = ride.currentCandidateIndex ?? 0;
        return ride.candidates?.[candidateIndex] === user.uid;
    });
  }, [potentialRides, user?.uid]);
  // --- End of New Dispatch Logic ---


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
        const userProfileRef = doc(firestore, 'users', user.uid);

        if (locationWatchId.current !== null) return; // Already tracking
        
        locationWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const newLocation = { lat: latitude, lng: longitude };
                updateDocumentNonBlocking(userProfileRef, { currentLocation: newLocation });

                // Also update location on active ride for rerouting calculations
                if (activeRideStateRef.current) {
                    const rideRef = doc(firestore, 'rides', activeRideStateRef.current.id);
                    updateDocumentNonBlocking(rideRef, { driverLocation: newLocation });
                }
            },
            (error) => {
                console.warn("Error al obtener ubicación del conductor:", error.message);
                toast({
                    variant: 'destructive',
                    title: 'Error de GPS',
                    description: 'No se pudo acceder a tu ubicación. Usando ubicación de respaldo en la Terminal de Rawson.'
                });
                // Si el GPS falla (ej. en desktop), usamos la ubicación de respaldo
                updateDocumentNonBlocking(userProfileRef, { currentLocation: FALLBACK_DRIVER_LOCATION });
                if (activeRideStateRef.current) {
                    const rideRef = doc(firestore, 'rides', activeRideStateRef.current.id);
                    updateDocumentNonBlocking(rideRef, { driverLocation: FALLBACK_DRIVER_LOCATION });
                }
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
    
    // Manage tracking based on online status or if there is an active ride
    if (profile?.approved && (isOnline || activeRide)) {
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
         setLastFinishedRide(activeRideStateRef.current); // Use the ref to get the last known state
         toast({
            title: "Viaje finalizado o cancelado",
            description: "El viaje ha sido completado o cancelado por el pasajero.",
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

  
  const handleFinishRide = (finishedRide: WithId<Ride>) => {
    setActiveRide(null);
    setLastFinishedRide(finishedRide);
    toast({
        title: "¡Viaje finalizado!",
        description: "El viaje ha sido completado y cobrado.",
    });
  };

  const handleCloseSummary = () => {
    setLastFinishedRide(null);
  }

  const renderAvailableRides = () => {
    if (isUserLoading) {
      return <p className="text-center">Cargando perfil...</p>;
    }
    
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
             
             {balance < 0 && (
                <Alert variant="destructive">
                    <VamoIcon name="alert-triangle" className="h-4 w-4" />
                    <AlertTitle>¡Saldo Insuficiente!</AlertTitle>
                    <AlertDescription>
                        No podrás recibir nuevos viajes hasta que no regularices tu saldo. Por favor, cargá crédito desde la pestaña "Ganancias".
                    </AlertDescription>
                </Alert>
            )}

            {isOnline && fcmStatus !== 'enabled' && (
              <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700">
                <VamoIcon name="bell" className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-800 dark:text-blue-300">Notificaciones para Viajes</AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-500">
                  Para recibir viajes con la app cerrada, es recomendable activar las notificaciones.
                </AlertDescription>
                <div className="mt-4">
                  <PushActivationUI />
                </div>
              </Alert>
            )}
            
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
                    
                    <h2 className="text-xl font-semibold text-center pt-4">Viaje Ofrecido</h2>
                    {areRidesLoading ? (
                         <p className="text-center text-muted-foreground pt-8">Buscando viajes...</p>
                    ) : offeredRide ? (
                        <DriverRideCard
                            key={offeredRide.id}
                            ride={offeredRide}
                        />
                    ) : (
                        <p className="text-center text-muted-foreground pt-8">No hay viajes ofrecidos en este momento. Mantené la app abierta.</p>
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
