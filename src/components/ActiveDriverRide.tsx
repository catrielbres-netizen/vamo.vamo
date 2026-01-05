// @/components/ActiveDriverRide.tsx
'use client';

import { useFirestore, useUser } from '@/firebase';
import { doc, serverTimestamp, Timestamp, runTransaction, FieldValue, collection, increment, query, where, getDocs } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RideStatusInfo } from '@/lib/ride-status';
import { calculateFare, WAITING_PER_MIN, getCommissionRate } from '@/lib/pricing';
import { VamoIcon } from '@/components/VamoIcon';
import { useState, useEffect, useRef } from 'react';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, PlatformTransaction } from '@/lib/types';
import { speak } from '@/lib/speak';
import { useToast } from '@/hooks/use-toast';


const statusActions: { [key: string]: { action: string, label: string } } = {
  driver_assigned: { action: 'arrived', label: 'Llegué al origen' },
  arrived: { action: 'in_progress', label: 'Iniciar Viaje' },
  in_progress: { action: 'finished', label: 'Finalizar Viaje' },
  paused: { action: 'in_progress', label: 'Reanudar Viaje' },
};

const formatDuration = (seconds: number) => {
    if (seconds === 0) return 'Calculando...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters.toFixed(0)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

export default function ActiveDriverRide({ ride, onFinishRide }: { ride: WithId<Ride>, onFinishRide: (ride: WithId<Ride>) => void }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isFinishing, setIsFinishing] = useState(false);
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);
  const { user } = useUser();
  const prevStatusRef = useRef<Ride['status'] | undefined>();

  const totalAccumulatedWaitSeconds = (ride.pauseHistory || []).reduce((acc: number, p: any) => acc + p.duration, 0);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (ride.status === 'paused' && ride.pauseStartedAt) {
      const updateTimer = () => {
          const now = Timestamp.now();
          const start = ride.pauseStartedAt as Timestamp;
          setCurrentPauseSeconds(now.seconds - start.seconds);
      }
      updateTimer();
      timer = setInterval(updateTimer, 1000);
    } else {
        setCurrentPauseSeconds(0);
    }
    
    return () => clearInterval(timer);
  }, [ride.status, ride.pauseStartedAt]);
  
  useEffect(() => {
    if (ride.status !== prevStatusRef.current) {
        switch (ride.status) {
            case 'driver_assigned':
                speak("Viaje aceptado. Dirígete al origen y presiona 'Llegué al origen' al llegar.");
                break;
            case 'arrived':
                speak("Llegaste. Recoge al pasajero y presiona 'Iniciar Viaje' para comenzar.");
                break;
            case 'in_progress':
                 if(prevStatusRef.current === 'arrived') { // Only speak when starting, not when resuming
                    speak("Viaje en curso. Al llegar a destino, presiona 'Finalizar Viaje'.");
                 }
                break;
        }
        prevStatusRef.current = ride.status;
    }
  }, [ride.status]);

  const updateStatus = async (newStatus: string) => {
    if (!firestore || !user) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    
    let payload:any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
    }

    if (newStatus === 'paused') {
        payload.pauseStartedAt = serverTimestamp();
        updateDocumentNonBlocking(rideRef, payload);
        return;
    }
    
    if (newStatus === 'in_progress' && ride.status === 'paused' && ride.pauseStartedAt) {
        const now = Timestamp.now();
        const pausedAt = ride.pauseStartedAt as Timestamp;
        const diffSeconds = now.seconds - pausedAt.seconds;
        
        payload.pauseStartedAt = null;
        payload.pauseHistory = [
            ...(ride.pauseHistory || []),
            { started: pausedAt, ended: now, duration: diffSeconds }
        ];
        updateDocumentNonBlocking(rideRef, payload);
        return;
    }

    if (newStatus === 'arrived') {
        updateDocumentNonBlocking(rideRef, payload);
        return;
    }

    if (newStatus === 'finished') {
        setIsFinishing(true);
        try {
            const finalRideData = await runTransaction(firestore, async (transaction) => {
                const driverRef = doc(firestore, 'users', user.uid);
                const currentRideSnap = await transaction.get(rideRef);

                if (!currentRideSnap.exists()) {
                    throw new Error("No se encontró el viaje.");
                }
                const rideData = currentRideSnap.data() as Ride;

                // Idempotency Check: if commission is already charged, do nothing.
                if (rideData.pricing?.rideCommission != null) {
                    console.log("La comisión para este viaje ya fue procesada.");
                    return { ...rideData, id: currentRideSnap.id };
                }

                // --- Start of FASE 2 Logic ---
                // 1. Calculate final fare
                const totalWaitTimeSeconds = (rideData.pauseHistory || []).reduce((acc, p) => acc + p.duration, 0);
                const finalPrice = calculateFare({
                    distanceMeters: rideData.pricing.estimatedDistanceMeters ?? 0,
                    waitingMinutes: Math.ceil(totalWaitTimeSeconds / 60),
                    service: rideData.serviceType,
                    isNight: false,
                });

                // 2. Get deterministic ride count for commission tier
                const ridesQuery = query(
                    collection(firestore, "rides"),
                    where("driverId", "==", user.uid),
                    where("status", "==", "finished")
                );
                const completedRidesSnap = await getDocs(ridesQuery);
                const ridesCompletedBeforeThis = completedRidesSnap.size;

                // 3. Calculate commission for THIS ride
                const commissionRate = getCommissionRate(ridesCompletedBeforeThis);
                const rideCommission = Math.round(finalPrice * commissionRate);

                // --- Prepare Atomic Updates ---
                
                // A) Update Driver Profile
                transaction.update(driverRef, { 
                    platformCreditPaid: increment(-rideCommission),
                    ridesCompleted: increment(1),
                    updatedAt: serverTimestamp(),
                });

                // B) Update Ride document (make commission immutable)
                const finishedAtTimestamp = serverTimestamp();
                const finalPricing = { 
                    ...rideData.pricing, 
                    finalTotal: finalPrice, 
                    rideCommission: rideCommission 
                };
                const rideUpdatePayload: any = {
                    status: 'finished',
                    pricing: finalPricing,
                    finishedAt: finishedAtTimestamp,
                    updatedAt: finishedAtTimestamp,
                    completedRide: {
                        distanceMeters: rideData.pricing.estimatedDistanceMeters,
                        durationSeconds: rideData.pricing.estimatedDurationSeconds || 0,
                        waitingSeconds: totalWaitTimeSeconds,
                        totalPrice: finalPrice,
                        finishedAt: finishedAtTimestamp,
                    }
                };
                transaction.update(rideRef, rideUpdatePayload);
                
                // C) Create Accounting Log (Ledger)
                const transactionLogRef = doc(collection(firestore, 'platform_transactions'));
                const logEntry: Omit<PlatformTransaction, 'createdAt'> & { createdAt: FieldValue } = {
                    driverId: user.uid,
                    amount: -rideCommission, // It's a debit
                    type: 'debit_commission',
                    source: 'ride_finish',
                    referenceId: ride.id,
                    note: `Comisión (${(commissionRate * 100).toFixed(0)}%) del viaje a ${rideData.destination.address}`,
                    createdAt: serverTimestamp(),
                };
                transaction.set(transactionLogRef, logEntry);

                // --- End of FASE 2 Logic ---

                // Return the data needed for the UI callback
                return {
                    ...rideData,
                    ...rideUpdatePayload,
                    id: currentRideSnap.id,
                    finishedAt: Timestamp.now(), // Use local time for immediate UI update
                };
            });
            
            // If transaction is successful
            onFinishRide(finalRideData);

        } catch (error: any) {
            console.error("Error al finalizar el viaje:", error);
            toast({
                variant: "destructive",
                title: "Error en la transacción",
                description: error.message || "No se pudo finalizar el viaje. Contactá a soporte.",
            });
        } finally {
            setIsFinishing(false);
        }
        return; // Important: Stop execution here for 'finished' status
    }

    // For other simple status updates that don't need a transaction
    updateDocumentNonBlocking(rideRef, payload);
  };


  const openNavigationToOrigin = () => {
    if (ride?.origin?.lat && ride?.origin?.lng) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${ride.origin.lat},${ride.origin.lng}`;
      window.open(url, '_blank');
    }
  };

  const openNavigationToDestination = () => {
    if (ride?.destination?.lat && ride?.destination?.lng) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${ride.destination.lat},${ride.destination.lng}`;
        window.open(url, '_blank');
    }
  };

  const nextAction = statusActions[ride.status as keyof typeof statusActions];
  const statusInfo = RideStatusInfo[ride.status as keyof typeof RideStatusInfo] || { text: 'Estado desconocido', icon: 'help-circle' };

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = ride.pricing.estimatedTotal + waitingCost;
  
  const arrivalInfo = ride.driverArrivalInfo;
  const mainTripInfo = {
      distance: ride.pricing.estimatedDistanceMeters,
      duration: ride.pricing.estimatedDurationSeconds
  };

  return (
    <Card>
       <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
            Viaje en curso
        </CardTitle>
        <Badge variant={ride.status === 'paused' ? 'destructive' : 'secondary'} className="flex items-center gap-2 whitespace-nowrap">
            <VamoIcon name={statusInfo.icon} />
            {statusInfo.text}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="flex items-center">
            <VamoIcon name="user" className="w-4 h-4 mr-2 text-muted-foreground" />
            <strong>Pasajero:</strong> {ride.passengerName || 'No especificado'}
        </p>

        {ride.status === 'driver_assigned' && arrivalInfo && (
             <div className="bg-secondary/50 p-3 rounded-lg text-center">
                <p className="font-semibold">Recoger Pasajero</p>
                <p className="text-xs text-muted-foreground">{ride.origin.address}</p>
                 <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-center gap-1.5"><VamoIcon name="car" className="w-4 h-4 text-primary"/> <span>{formatDistance(arrivalInfo.distanceMeters)}</span></div>
                    <div className="flex items-center justify-center gap-1.5"><VamoIcon name="clock" className="w-4 h-4 text-primary"/> <span>{formatDuration(arrivalInfo.durationSeconds)}</span></div>
                 </div>
            </div>
        )}

        {['arrived', 'in_progress', 'paused'].includes(ride.status) && (
            <div className="bg-secondary/50 p-3 rounded-lg text-center">
                <p className="font-semibold">Llevar Pasajero a Destino</p>
                <p className="flex items-center justify-center text-xs text-muted-foreground">
                    <VamoIcon name="flag" className="w-3 h-3 mr-1"/> {ride.destination.address}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-center gap-1.5"><VamoIcon name="route" className="w-4 h-4 text-primary"/> <span>{formatDistance(mainTripInfo.distance)}</span></div>
                    <div className="flex items-center justify-center gap-1.5"><VamoIcon name="clock" className="w-4 h-4 text-primary"/> <span>{formatDuration(mainTripInfo.duration || 0)}</span></div>
                </div>
            </div>
        )}

        <div className="!mt-4 grid grid-cols-1 gap-2">
            {ride.status === 'driver_assigned' && (
                 <Button onClick={openNavigationToOrigin} className="w-full" variant="outline">
                    <VamoIcon name="map-pin" className="mr-2 h-4 w-4"/>
                    Ir al Origen
                </Button>
            )}
             {['arrived', 'in_progress', 'paused'].includes(ride.status) && (
                <Button onClick={openNavigationToDestination} className="w-full" variant="outline">
                    <VamoIcon name="map" className="mr-2 h-4 w-4"/>
                    Ir al Destino
                </Button>
            )}
        </div>
       
        {(totalWaitWithCurrent > 0) && (
            <div className="!mt-4 bg-accent/50 p-3 rounded-lg">
                <p className="flex items-center justify-center font-mono text-center">
                    <VamoIcon name="hourglass" className="w-4 h-4 mr-2 text-destructive" />
                    <span className="font-semibold">Tiempo de espera:</span>
                    <span className="ml-2 tabular-nums">{formatDuration(totalWaitWithCurrent)}</span>
                </p>
                <p className="mt-1 text-center font-semibold text-sm text-destructive">
                    Costo de espera: ${new Intl.NumberFormat('es-AR').format(waitingCost)}
                </p>
            </div>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-4">
        <div className="w-full !mt-0 bg-background/50 border p-3 rounded-lg text-center flex-col gap-4">
            <div>
                <p className="text-sm text-muted-foreground">Tarifa Actual a Cobrar</p>
                <p className="font-bold text-2xl text-primary">
                    ${new Intl.NumberFormat('es-AR').format(currentTotal)}
                </p>
            </div>
        </div>

        <div className="w-full flex flex-col gap-2">
            {nextAction && (
            <Button
                onClick={() => updateStatus(nextAction.action)}
                className="w-full"
                size="lg"
                variant={nextAction.action === 'finished' ? 'destructive' : 'default'}
                disabled={isFinishing}
            >
                {isFinishing && <VamoIcon name="loader" className="animate-spin mr-2"/>}
                {nextAction.action === 'in_progress' && ride.status === 'paused' && <VamoIcon name="play" className="mr-2 h-4 w-4" />}
                {isFinishing ? 'Finalizando...' : nextAction.label}
            </Button>
            )}
            {ride.status === 'in_progress' && (
                <Button
                    onClick={() => updateStatus('paused')}
                    className="w-full"
                    variant="outline"
                    disabled={isFinishing}
                >
                    <VamoIcon name="hourglass" className="mr-2 h-4 w-4" />
                    Pausar Viaje
                </Button>
            )}
        </div>
      </CardFooter>
    </Card>
  );
}
