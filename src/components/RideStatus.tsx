// @/components/RideStatus.tsx
'use client';
import { TripCard } from './TripCard';
import { DriverInfo } from './DriverInfo';
import { TripTimers } from './TripTimers';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { useEffect, useState, useRef } from 'react';
import { Timestamp, doc, runTransaction, collection, getDocs, where, query } from 'firebase/firestore';
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
import { Button } from '@/components/ui/button';
import { VamoIcon, WhatsAppLogo } from './VamoIcon';
import RatingForm from './RatingForm';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile } from '@/lib/types';


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

export default function RideStatus({ ride, onNewRide }: { ride: WithId<Ride>, onNewRide: () => void }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);
  const pointsAwardedRef = useRef(false);

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
                        // Don't throw an error, just log it, so we can still mark the ride as "points processed"
                        transaction.update(rideRef, { vamoPointsAwarded: 0 }); // Mark as processed with 0 points
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
  }, [ride.status, ride.id, ride.passengerId, firestore, ride.vamoPointsAwarded, ride.passengerName]);


  const handleRatingAndContinue = async (rating: number, comments: string) => {
    // If rating is 0, user might skip rating. Just proceed to new ride.
    if (rating === 0) {
        onNewRide();
        return;
    }

    if (!firestore || !ride.driverId) {
        onNewRide();
        return;
    };
    
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
    } finally {
        // Proceed to new ride regardless of rating success
        onNewRide();
    }
  };

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = ride.pricing.estimatedTotal + waitingCost;
  
  const finalPrice = ride.pricing.finalTotal || ride.pricing.estimatedTotal;

  if (ride.status === 'finished' || ride.status === 'cancelled') {
    const isCancelled = ride.status === 'cancelled';
    const waitingCostFinal = Math.ceil(totalAccumulatedWaitSeconds / 60) * WAITING_PER_MIN;
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

            {!isCancelled && (
              <>
                <CardContent className="space-y-4">
                    {/* Ride Details */}
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

                    {/* Pricing Details */}
                    <div className="border-t border-b py-4 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Tarifa base del viaje</span>
                            <span>{formatCurrency(finalPrice - waitingCostFinal)}</span>
                        </div>
                        {ride.pricing.discountAmount && ride.pricing.discountAmount > 0 ? (
                            <div className="flex justify-between items-center text-sm text-green-500">
                                 <span className="text-muted-foreground">Descuento VamO</span>
                                 <span>-{formatCurrency(ride.pricing.discountAmount)}</span>
                            </div>
                        ) : null}
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Costo por espera</span>
                            <span>{formatCurrency(waitingCostFinal)}</span>
                        </div>
                    </div>
                     <div className="flex justify-between items-center font-bold text-lg">
                        <span>Total Pagado</span>
                        <span className="text-primary">{formatCurrency(finalPrice)}</span>
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
              </>
            )}
             {isCancelled && (
                <CardFooter>
                    <Button onClick={onNewRide} className="w-full">
                        Pedir Otro Viaje
                    </Button>
                </CardFooter>
             )}
        </Card>
    )
  }

  return (
    <div>
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
    </div>
  );
}
