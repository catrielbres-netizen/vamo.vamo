
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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Clock, ShieldCheck, ShieldX } from 'lucide-react';


// Helper function to determine which services a driver can see
const getAllowedServices = (carModelYear?: number): ServiceType[] => {
    if (!carModelYear) return []; // If no car year, no services
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
  
  const driverProfileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: driverProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(driverProfileRef);

  const previousAvailableRides = useRef<WithId<Ride>[]>([]);
  const activeRideUnsubscribe = useRef<Unsubscribe | null>(null);
  const availableRidesUnsubscribe = useRef<Unsubscribe | null>(null);
  const activeRideStateRef = useRef<WithId<Ride> | null>(null);

  useEffect(() => {
    // This ref helps the snapshot callback to know the previous state
    // without including the state variable `activeRide` in the dependency array.
    activeRideStateRef.current = activeRide;
  }, [activeRide]);

  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
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
      
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching active ride:", error);
      toast({ variant: 'destructive', title: 'Error al cargar tu viaje activo.' });
      setIsLoading(false);
    });

    return () => {
      activeRideUnsubscribe.current?.();
    };
  }, [firestore, user?.uid, toast]);


  useEffect(() => {
    const isApproved = driverProfile?.vehicleVerificationStatus === 'approved';
    
    if (firestore && user?.uid && !activeRide && !isProfileLoading && isApproved) {
        availableRidesUnsubscribe.current?.();

        const allowedServices = getAllowedServices(driverProfile?.carModelYear);
        
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
            
            // Only play sound/toast if initial load is done.
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
        setAvailableRides([]);
        previousAvailableRides.current = [];
        availableRidesUnsubscribe.current?.();
        if(!isProfileLoading) setIsLoading(false);
    }

    return () => {
        availableRidesUnsubscribe.current?.();
    }
  }, [firestore, user?.uid, activeRide, isProfileLoading, driverProfile, isLoading, toast]);


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
  
  const isLoadingSomething = isLoading || isProfileLoading;

  const renderVerificationStatus = () => {
    if (isLoadingSomething) {
      return <p className="text-center">Cargando estado...</p>;
    }
    if (!driverProfile) {
        // This case can happen briefly while the profile is being created for the first time.
        // Or if there's a serious error loading it.
        return (
            <Alert>
                <ShieldX className="h-4 w-4" />
                <AlertTitle>Perfil no encontrado</AlertTitle>
                <AlertDescription>
                    Aún no tenés un perfil. Andá a la pestaña "Perfil" para completar tu registro.
                </AlertDescription>
            </Alert>
        );
    }
    switch(driverProfile.vehicleVerificationStatus) {
        case 'pending_review':
            return (
                <Alert className="border-yellow-500 text-yellow-600">
                    <Clock className="h-4 w-4 text-yellow-500" />
                    <AlertTitle>Verificación Pendiente</AlertTitle>
                    <AlertDescription>
                       Tu cuenta está siendo verificada. Si todo está en orden, podrás empezar a recibir viajes. Esto puede tardar menos de una hora.
                    </AlertDescription>
                </Alert>
            );
        case 'rejected':
            return (
                <Alert variant="destructive">
                    <ShieldX className="h-4 w-4" />
                    <AlertTitle>Verificación Rechazada</AlertTitle>
                    <AlertDescription>
                        Hubo un problema con los datos que enviaste. Por favor, revisa tu perfil y volvé a enviarlos.
                    </AlertDescription>
                </Alert>
            );
        case 'unverified':
             return (
                <Alert>
                    <ShieldX className="h-4 w-4" />
                    <AlertTitle>Registro Incompleto</AlertTitle>
                    <AlertDescription>
                        Para comenzar a recibir viajes, completá tu registro como conductor desde tu perfil.
                    </AlertDescription>
                </Alert>
            );
        case 'approved':
             return (
                <div className="space-y-4">
                    <Alert variant="default" className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
                         <ShieldCheck className="h-4 w-4 text-green-500" />
                        <AlertTitle>¡Cuenta Verificada!</AlertTitle>
                        <AlertDescription className="text-green-600 dark:text-green-500">
                            Ya podés recibir viajes. ¡Buenas rutas!
                        </AlertDescription>
                    </Alert>
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
            );
        default:
             // This case should ideally not be reached if vehicleVerificationStatus is always initialized.
             // But as a fallback, we treat it as unverified.
            return (
                <Alert>
                    <ShieldX className="h-4 w-4" />
                    <AlertTitle>Registro Incompleto</AlertTitle>
                    <AlertDescription>
                        Para comenzar a recibir viajes, completá tu registro como conductor desde tu perfil.
                    </AlertDescription>
                </Alert>
            );
    }
  }

  return (
    <>
      {activeRide ? (
         <ActiveDriverRide ride={activeRide} onFinishRide={handleFinishRide}/>
      ) : lastFinishedRide ? (
         <FinishedRideSummary ride={lastFinishedRide} onClose={handleCloseSummary} />
      ) : (
        renderVerificationStatus()
      )}
    </>
  );
}
