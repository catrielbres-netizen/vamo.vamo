
// @/components/RideStatus.tsx
'use client';
import { TripCard } from './TripCard';
import { DriverInfo } from './DriverInfo';
import { TripTimers } from './TripTimers';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { useEffect, useState, useRef } from 'react';
import { Timestamp, doc, runTransaction, collection, getDocs, where, query, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VamoIcon } from './VamoIcon';
import RatingForm from './RatingForm';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, Place } from '@/lib/types';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import { calculateFare } from '@/lib/pricing';
import { haversineDistance } from '@/lib/geo';


function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

const formatDuration = (seconds: number) => {
    if (seconds < 60) return `~1 min`;
    return `~${Math.round(seconds / 60)} min`;
};

export default function RideStatus({ ride, onNewRide }: { ride: WithId<Ride>, onNewRide: (isFinished: boolean) => void }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);
  const pointsAwardedRef = useRef(false);
  const [isRerouteModalOpen, setRerouteModalOpen] = useState(false);
  const [newDestination, setNewDestination] = useState<Place | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [newFare, setNewFare] = useState<number | null>(null);

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
    if (ride.status === 'finished' && !ride.vamoPointsAwarded && !pointsAwardedRef.current) {
        if (!firestore || !ride.passengerId) return;
        
        pointsAwardedRef.current = true; // Prevents re-running

        const awardPoints = async () => {
            const VAMO_POINTS_PER_RIDE = 3;
            const rideRef = doc(firestore, 'rides', ride.id);
            const userProfileRef = doc(firestore, 'users', ride.passengerId);

            try {
                await runTransaction(firestore, async (transaction) => {
                    const userProfileDoc = await transaction.get(userProfileRef);
                    
                    if (!userProfileDoc.exists()) {
                        console.error(`Profile for passenger ${ride.passengerId} not found. Cannot award points.`);
                        transaction.update(rideRef, { vamoPointsAwarded: 0 }); 
                        return;
                    }
                    
                    const profileData = userProfileDoc.data() as UserProfile;
                    const currentPoints = profileData.vamoPoints || 0;
                    const ridesCompleted = profileData.ridesCompleted || 0;
                    
                    const newTotalPoints = currentPoints + VAMO_POINTS_PER_RIDE;
                    const newRidesCompleted = ridesCompleted + 1;
                    const hasBonus = newTotalPoints >= 30;

                    transaction.update(userProfileRef, { 
                        vamoPoints: newTotalPoints,
                        ridesCompleted: newRidesCompleted,
                        activeBonus: hasBonus,
                    });
                    
                    transaction.update(rideRef, { 
                        vamoPointsAwarded: VAMO_POINTS_PER_RIDE 
                    });
                });
                 console.log(`Awarded ${VAMO_POINTS_PER_RIDE} points to ${ride.passengerId}`);
            } catch (error) {
                console.error("Failed to award points in transaction:", error);
                pointsAwardedRef.current = false; // Allow retry if transaction fails
            }
        };

        awardPoints();
    }
  }, [ride.status, ride.id, ride.passengerId, firestore, ride.vamoPointsAwarded]);


  const handleRatingAndContinue = async (rating: number, comments: string) => {
    if (rating > 0 && firestore && ride.driverId && !ride.driverRating) {
        const rideRef = doc(firestore, 'rides', ride.id);
        const driverProfileRef = doc(firestore, 'users', ride.driverId);

        try {
            await updateDocumentNonBlocking(rideRef, {
                driverRating: rating,
                driverComments: comments,
                updatedAt: Timestamp.now(),
            });
            toast({
                title: '¡Calificación Enviada!',
                description: 'Gracias por tu opinión.',
            });
            
            await runTransaction(firestore, async (transaction) => {
                const ridesQuery = query(
                    collection(firestore, 'rides'),
                    where('driverId', '==', ride.driverId),
                    where('status', '==', 'finished')
                );
                const driverRidesSnapshot = await getDocs(ridesQuery);

                let totalRating = 0;
                let ratingCount = 0;
                driverRidesSnapshot.forEach(doc => {
                    const rideData = doc.data() as Ride;
                    if (rideData.driverRating && rideData.driverRating > 0) {
                        totalRating += rideData.driverRating;
                        ratingCount++;
                    }
                });
                
                const newAverage = ratingCount > 0 ? totalRating / ratingCount : null;
                transaction.update(driverProfileRef, { averageRating: newAverage });
            });
        } catch (e) {
            console.error("Could not update rating or average", e);
        }
    }
    
    onNewRide(true);
  };

  const handleOpenRerouteModal = () => {
    setNewDestination(null);
    setNewFare(null);
    setRerouteModalOpen(true);
  };

  useEffect(() => {
    const calculateNewRoute = () => {
        if (!newDestination?.lat || !ride.driverLocation?.lat) {
            setNewFare(null);
            return;
        }

        setIsCalculating(true);
        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route(
            {
                origin: new window.google.maps.LatLng(ride.driverLocation.lat, ride.driverLocation.lng),
                destination: new window.google.maps.LatLng(newDestination.lat, newDestination.lng),
                travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]?.legs?.[0]) {
                    const leg = result.routes[0].legs[0];
                    const newDistanceMeters = leg.distance?.value ?? 0;
                    
                    const totalWaitMinutes = Math.ceil(totalAccumulatedWaitSeconds / 60);

                    const finalFare = calculateFare({
                        distanceMeters: ride.pricing.estimatedDistanceMeters + newDistanceMeters,
                        waitingMinutes: totalWaitMinutes,
                        service: ride.serviceType,
                    });

                    setNewFare(finalFare);

                } else {
                    toast({
                        variant: 'destructive',
                        title: 'No se pudo calcular la nueva ruta',
                        description: 'La tarifa no pudo ser actualizada. Intentá de nuevo.'
                    });
                    setNewFare(null);
                }
                setIsCalculating(false);
            }
        );
    }
    
    calculateNewRoute();
  }, [newDestination, ride.driverLocation, ride.pricing.estimatedDistanceMeters, ride.serviceType, totalAccumulatedWaitSeconds, toast]);


  const handleConfirmReroute = async () => {
    if (!firestore || !newDestination || newFare === null) return;
    
    setIsCalculating(true);
    const rideRef = doc(firestore, 'rides', ride.id);
    
    try {
        await updateDocumentNonBlocking(rideRef, {
            destination: newDestination,
            'pricing.finalTotal': newFare,
            rerouteHistory: [
                ...(ride.rerouteHistory || []),
                { from: ride.destination, to: newDestination, timestamp: serverTimestamp() }
            ],
            updatedAt: serverTimestamp()
        });
        
        toast({
            title: "¡Destino actualizado!",
            description: "Tu conductor ha sido notificado."
        });
        setRerouteModalOpen(false);

    } catch (error) {
        console.error("Error updating destination:", error);
        toast({ variant: 'destructive', title: "Error", description: "No se pudo actualizar el destino." });
    } finally {
        setIsCalculating(false);
    }
  };


  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = (ride.pricing.finalTotal || ride.pricing.estimatedTotal) + waitingCost;
  
  if (ride.status === 'finished' || ride.status === 'cancelled') {
    const isCancelled = ride.status === 'cancelled';
    
    const rideDate = ride.finishedAt instanceof Timestamp 
        ? format((ride.finishedAt as Timestamp).toDate(), "d 'de' MMMM, HH:mm'hs'", { locale: es })
        : 'Fecha no disponible';

    return (
        <Card className="m-4">
            <CardHeader>
                <CardTitle className={`text-xl ${isCancelled ? 'text-destructive' : 'text-primary'}`}>
                    {isCancelled ? 'Viaje Cancelado' : '¡Viaje Finalizado!'}
                </CardTitle>
                <CardDescription>
                   {isCancelled ? 'Tu viaje fue cancelado.' : `Recibo de tu viaje del ${rideDate}`}
                </CardDescription>
            </CardHeader>

            {!isCancelled && ride.completedRide ? (
              <>
                <CardContent className="space-y-4">
                    <div className="text-sm space-y-2 p-3 bg-secondary/50 rounded-lg">
                        <div className="flex items-start">
                            <VamoIcon name="map-pin" className="w-4 h-4 mr-2 mt-1 text-muted-foreground"/>
                            <div>
                                <p className="text-muted-foreground text-xs">Desde</p>
                                <p className="font-medium">{ride.origin.address}</p>
                            </div>
                        </div>
                         <div className="flex items-start">
                            <VamoIcon name="flag" className="w-4 h-4 mr-2 mt-1 text-muted-foreground"/>
                            <div>
                                <p className="text-muted-foreground text-xs">Hasta</p>
                                <p className="font-medium">{ride.destination.address}</p>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-b py-4 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Distancia</span>
                            <span>{(ride.completedRide.distanceMeters / 1000).toFixed(1)} km</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Duración del viaje</span>
                            <span>{formatDuration(ride.completedRide.durationSeconds)}</span>
                        </div>
                        {ride.completedRide.waitingSeconds > 0 && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Tiempo de espera</span>
                                <span>{formatDuration(ride.completedRide.waitingSeconds)}</span>
                            </div>
                        )}
                         {ride.pricing.discountAmount && ride.pricing.discountAmount > 0 && (
                            <div className="flex justify-between items-center text-sm text-green-500">
                                 <span className="text-muted-foreground">Descuento VamO</span>
                                 <span>-{formatCurrency(ride.pricing.discountAmount)}</span>
                            </div>
                        )}
                    </div>
                     <div className="flex justify-between items-center font-bold text-lg">
                        <span>Total Pagado</span>
                        <span className="text-primary">{formatCurrency(ride.completedRide.totalPrice)}</span>
                    </div>

                    <p className="text-xs text-center text-muted-foreground pt-2">
                        Conductor: {ride.driverName || 'No disponible'}
                    </p>
                </CardContent>

                <RatingForm
                  participantName={ride.driverName || 'Conductor'}
                  participantRole="conductor"
                  onSubmit={handleRatingAndContinue}
                  isSubmitted={!!ride.driverRating}
                  submitButtonText="Calificar y Pedir Otro Viaje"
                />
                 {!ride.driverRating && (
                    <CardFooter>
                         <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => onNewRide(true)}>
                            Omitir calificación
                        </Button>
                    </CardFooter>
                 )}
              </>
            ) : !isCancelled && (
                 <CardContent>
                    <p className="text-center text-muted-foreground">No hay un resumen disponible para este viaje.</p>
                 </CardContent>
            )}
             {isCancelled && (
                <CardFooter>
                    <Button onClick={() => onNewRide(true)} className="w-full">
                        Pedir Otro Viaje
                    </Button>
                </CardFooter>
             )}
        </Card>
    )
  }

  return (
    <>
      <Dialog open={isRerouteModalOpen} onOpenChange={setRerouteModalOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Cambiar Destino</DialogTitle>
                <DialogDescription>
                    Ingresá la nueva dirección. La tarifa se recalculará.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <PlaceAutocompleteInput onPlaceSelect={setNewDestination} placeholder="Nuevo destino" />
                {isCalculating && <p className="text-center">Calculando nueva tarifa...</p>}
                {newFare !== null && (
                    <div className="text-center p-3 bg-secondary rounded-md">
                        <p className="text-muted-foreground">Nueva tarifa estimada</p>
                        <p className="text-2xl font-bold">{formatCurrency(newFare)}</p>
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setRerouteModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleConfirmReroute} disabled={!newDestination || newFare === null || isCalculating}>
                    {isCalculating ? "Calculando..." : "Confirmar Nuevo Destino"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>


      <TripCard
        status={ride.status}
        origin={ride.origin}
        destination={ride.destination}
        onOriginSelect={() => {}}
        onDestinationSelect={() => {}}
        isInteractive={false}
      />
      <DriverInfo
        driver={
          ride.driverId
            ? {
                name: ride.driverName || 'Conductor',
                arrivalInfo: ride.driverArrivalInfo ? `${formatDuration(ride.driverArrivalInfo.durationSeconds)}` : 'Calculando...',
              }
            : null
        }
      />
       <TripTimers 
            waitMinutes={formatDuration(totalWaitWithCurrent)} 
            waitCost={formatCurrency(waitingCost)}
            currentTotal={formatCurrency(currentTotal)}
       />
        {ride.status === 'in_progress' && (
            <div className="m-4">
                <Button variant="outline" className="w-full" onClick={handleOpenRerouteModal}>
                    <VamoIcon name="route" className="mr-2" />
                    Cambiar Destino
                </Button>
            </div>
        )}
    </>
  );
}
