'use client';
import React from 'react';
import { TripCard } from './TripCard';
import { DriverInfo } from './DriverInfo';
import { useEffect, useState, useMemo } from 'react';
import { doc, serverTimestamp, updateDoc, arrayUnion, runTransaction, Timestamp } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import { useFirestore, useUser, useFirebaseApp, useDoc, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, Place } from '@/lib/types';
import { WAITING_PER_MIN } from '@/lib/pricing';
import RideMap from './RideMap';
import { Map } from '@vis.gl/react-google-maps';
import MapSelector from './MapSelector';
import { haversineDistance } from '@/lib/geo';
import { useMapsAvailability } from '@/components/MapsProvider';
import { Alert, AlertDescription as AlertDescriptionUI, AlertTitle } from './ui/alert';
import { WaitTimerDialog } from './WaitTimerDialog';
import { getFunctions, httpsCallable } from 'firebase/functions';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

export default function RideStatus({ ride, onNewRide }: { ride: WithId<Ride>, onNewRide: () => void }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const { mapsAvailable } = useMapsAvailability();
  
  const [isMapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [isRerouteModalOpen, setRerouteModalOpen] = useState(false);
  
  const [newDestination, setNewDestination] = useState<Place | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [newFare, setNewFare] = useState<number | null>(null);

  const [waitMinutes, setWaitMinutes] = useState('00:00');
  const [waitCost, setWaitCost] = useState(0);
  const [isWaitTimerOpen, setIsWaitTimerOpen] = useState(false);
  const [driverEta, setDriverEta] = useState<string | null>(null);

  const driverLocationRef = useMemoFirebase(() => {
    if (!firestore || !ride.driverId) return null;
    return doc(firestore, "drivers_locations", ride.driverId);
  }, [firestore, ride.driverId]);

  const { data: driverLocationData } = useDoc<{ currentLocation?: any }>(driverLocationRef);
  
  // DEBUGGING LOG
  console.log('driverLocationData =>', driverLocationData);
  console.log('driverLocationData.currentLocation =>', driverLocationData?.currentLocation);

  const transformedDriverLocation = useMemo(() => {
    const loc = driverLocationData?.currentLocation;
    if (!loc) return null;
    // Handle both {lat, lng} and GeoPoint {latitude, longitude}
    const lat = (loc as any).lat ?? (loc as any).latitude;
    const lng = (loc as any).lng ?? (loc as any).longitude;
    if (lat == null || lng == null) return null;
    return { lat, lng };
  }, [driverLocationData]);


  useEffect(() => {
    if (ride.status === 'driver_assigned' && transformedDriverLocation && ride.origin) {
        const distance = haversineDistance(transformedDriverLocation, ride.origin);
        // Average speed 30 km/h -> 8.33 m/s
        const etaSeconds = distance / 8.33;
        const etaMinutes = Math.ceil(etaSeconds / 60);

        if (etaMinutes < 1) {
            setDriverEta("Llegando...");
        } else if (etaMinutes > 60) {
            setDriverEta(">1 hora");
        } else {
            setDriverEta(`~${etaMinutes} min`);
        }
    } else {
        setDriverEta(null);
    }
  }, [transformedDriverLocation, ride.origin, ride.status]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    const isCurrentlyWaiting = ride.status === 'driver_arrived' || ride.status === 'paused';
    
    if (isCurrentlyWaiting) {
      setIsWaitTimerOpen(true);
    } else {
      setIsWaitTimerOpen(false);
    }

    const historicalWaitingSeconds = (ride.pauseHistory || []).reduce((acc, p) => acc + p.duration, 0);

    const updateWaitState = (totalSeconds: number) => {
        const totalMinutes = Math.floor(totalSeconds / 60);
        const remainingSeconds = Math.floor(totalSeconds % 60);
        setWaitMinutes(`${String(totalMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`);
        
        const costOfWait = Math.ceil(Math.max(0, totalSeconds) / 60) * WAITING_PER_MIN;
        setWaitCost(costOfWait);
    };

    if (isCurrentlyWaiting) {
      const startTimeStamp = ride.status === 'driver_arrived' ? ride.arrivedAt : ride.pauseStartedAt;
        
      if (startTimeStamp instanceof Timestamp) {
        const startTime = startTimeStamp.toDate();
        
        intervalId = setInterval(() => {
          const now = new Date();
          const currentOngoingSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
          updateWaitState(historicalWaitingSeconds + Math.max(0, currentOngoingSeconds));
        }, 1000);

        const initialCurrentSeconds = Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
        updateWaitState(historicalWaitingSeconds + Math.max(0, initialCurrentSeconds));

      } else {
        updateWaitState(historicalWaitingSeconds);
      }
    } else {
      updateWaitState(historicalWaitingSeconds);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [ride.status, ride.arrivedAt, ride.pauseStartedAt, ride.pauseHistory]);

  const handleCancelRide = async () => {
    if (!ride || !firebaseApp) return;

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
      await cancelRideV1({ rideId: ride.id, reason: 'cancelled_by_passenger' });
      
      toast({ title: 'Viaje cancelado correctamente' });
      
    } catch (e: any) {
      console.error("Error cancelando el viaje (pasajero):", e);
      toast({
        variant: 'destructive',
        title: 'No se pudo cancelar el viaje',
        description: e.message || 'Intenta nuevamente',
      });
    }
  };
  
  const baseTotal = ride.pricing.finalTotal || ride.pricing.estimatedTotal;
  const currentTotalWithWait = baseTotal + waitCost;
  
  const showMap = ['searching', 'driver_assigned', 'driver_arrived', 'in_progress', 'paused'].includes(ride.status) && mapsAvailable;
  
  const canPassengerCancel = ride && ['searching', 'driver_assigned', 'driver_arrived'].includes(ride.status);

  return (
    <>
      {showMap && (
        <div className="m-4 h-64 rounded-xl overflow-hidden shadow-lg border">
            <Map
                defaultCenter={ride.origin}
                defaultZoom={16}
                gestureHandling="greedy"
                disableDefaultUI={true}
                clickableIcons={false}
                streetViewControl={false}
                mapTypeControl={false}
                fullscreenControl={false}
                zoomControl={false}
                mapId="ride-status-map"
            >
                <RideMap 
                    status={ride.status}
                    origin={ride.origin}
                    destination={ride.destination}
                    driverLocation={transformedDriverLocation}
                />
            </Map>
        </div>
      )}

      {!mapsAvailable && ride.status !== 'searching' && (
         <div className="m-4">
            <Alert variant="destructive">
                <VamoIcon name="alert-triangle" className="h-4 w-4" />
                <AlertTitle>Mapas Deshabilitados</AlertTitle>
                <AlertDescriptionUI>
                    La clave de API de Google Maps no está configurada. El mapa no se puede mostrar.
                </AlertDescriptionUI>
            </Alert>
        </div>
      )}

      <WaitTimerDialog
        isOpen={isWaitTimerOpen}
        onOpenChange={setIsWaitTimerOpen}
        waitMinutes={waitMinutes}
        waitCost={formatCurrency(waitCost)}
        currentTotal={formatCurrency(currentTotalWithWait)}
      />

      <TripCard
        status={ride.status}
        origin={ride.origin}
        destination={ride.destination}
      />
      <DriverInfo
        driver={
          ride.driverId
            ? {
                name: ride.driverName || 'Conductor',
                arrivalInfo: driverEta || (ride.status === 'driver_assigned' ? 'Calculando...' : null),
              }
            : null
        }
      />
       <div className="m-4 p-3 text-sm rounded-lg bg-card border shadow-sm flex flex-col gap-3">
        <div className="bg-secondary/50 p-3 rounded-md text-center">
            <p className="text-xs text-muted-foreground">Tarifa actual estimada</p>
            <p className="font-bold text-lg text-primary">{formatCurrency(currentTotalWithWait)}</p>
        </div>
      </div>
        
        {canPassengerCancel && (
            <div className="m-4">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full">Cancelar Viaje</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Cancelar viaje?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {['driver_assigned', 'driver_arrived'].includes(ride.status)
                                ? 'Tu conductor ya está en camino.'
                                : 'Se detendrá la búsqueda de un conductor.'}
                                <br/><br/>
                                <strong className="text-destructive-foreground">Atención:</strong> Si cancelas más de 2 viajes en una semana, tu cuenta podría ser suspendida por 72 horas para asegurar la disponibilidad de los conductores.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>No, continuar</AlertDialogCancel>
                            <AlertDialogAction asChild>
                                <Button variant="destructive" onClick={handleCancelRide}>Sí, Cancelar</Button>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        )}
    </>
  );
}