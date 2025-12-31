// /app/driver/rides/page.tsx
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import DriverRideCard from '@/components/DriverRideCard';
import ActiveDriverRide from '@/components/ActiveDriverRide';
import FinishedRideSummary from '@/components/FinishedRideSummary';
import { useToast } from "@/hooks/use-toast";
import { speak } from '@/lib/speak';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, ServiceType } from '@/lib/types';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, MapIcon, List } from 'lucide-react';
import { Map, AdvancedMarker, APIProvider, Pin } from '@vis.gl/react-google-maps';
import { Button } from '@/components/ui/button';


// Helper function to determine which services a driver can see
const getAllowedServices = (): ServiceType[] => {
    return ['premium', 'privado', 'express'];
}


export default function DriverRidesPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [activeRide, setActiveRide] = useState<WithId<Ride> | null>(null);
  const [availableRides, setAvailableRides] = useState<WithId<Ride>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFinishedRide, setLastFinishedRide] = useState<WithId<Ride> | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('list');

  const driverPosition = useMemo(() => ({ lat: -43.3005, lng: -65.1023 }), []);
  

  const previousAvailableRides = useRef<WithId<Ride>[]>([]);
  const activeRideUnsubscribe = useRef<Unsubscribe | null>(null);
  const availableRidesUnsubscribe = useRef<Unsubscribe | null>(null);
  const activeRideStateRef = useRef<WithId<Ride> | null>(null);

  useEffect(() => {
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
    if (firestore && user?.uid && !activeRide) {
        availableRidesUnsubscribe.current?.();

        const allowedServices = getAllowedServices();
        
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
        if(isLoading) setIsLoading(false);
    }

    return () => {
        availableRidesUnsubscribe.current?.();
    }
  }, [firestore, user?.uid, activeRide, isLoading, toast]);


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
  
  const renderAvailableRides = () => {
    if (isLoading) {
      return <p className="text-center">Buscando viajes...</p>;
    }
    
    return (
        <div className="space-y-4">
            <Alert variant="default" className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
                 <ShieldCheck className="h-4 w-4 text-green-500" />
                <AlertTitle>¡Estás en línea!</AlertTitle>
                <AlertDescription className="text-green-600 dark:text-green-500">
                    Ya podés recibir viajes. ¡Buenas rutas!
                </AlertDescription>
            </Alert>
            
            <div className="flex justify-center my-4">
                <Button variant="outline" onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}>
                    {viewMode === 'map' ? <List className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
                    Ver en {viewMode === 'map' ? 'Lista' : 'Mapa'}
                </Button>
            </div>

             {viewMode === 'map' && (
                <div className="h-64 w-full rounded-lg overflow-hidden border">
                    <Map
                        defaultCenter={driverPosition}
                        defaultZoom={11}
                        mapId={'driver-map'}
                    >
                        <AdvancedMarker position={driverPosition}>
                            <span className="text-2xl">🚗</span>
                        </AdvancedMarker>
                        {availableRides.map(ride => (
                            <AdvancedMarker key={ride.id} position={ride.origin}>
                               <Pin backgroundColor={'#FBBC04'} glyphColor={'#000'} borderColor={'#000'} />
                            </AdvancedMarker>
                        ))}
                    </Map>
                </div>
            )}

            <h2 className="text-xl font-semibold text-center pt-4">Viajes Disponibles</h2>
            {availableRides.length > 0 ? (
                availableRides.map((ride) => (
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
