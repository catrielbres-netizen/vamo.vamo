
// src/components/RideStatus.tsx
'use client';
import { TripCard } from './TripCard';
import { DriverInfo } from './DriverInfo';
import { TripTimers } from './TripTimers';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { useEffect, useState, useRef } from 'react';
import { Timestamp, doc, runTransaction } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import RatingForm from './RatingForm';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile } from '@/lib/types';


function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function RideStatus({ ride }: { ride: WithId<Ride> }) {
  const firestore = useFirestore();
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
                    
                    let currentPoints = 0;
                    if (userProfileDoc.exists()) {
                        currentPoints = (userProfileDoc.data() as UserProfile).vamoPoints || 0;
                    } else {
                        // Create profile if it doesn't exist
                        const newProfile: UserProfile = {
                            name: ride.passengerName || 'Pasajero Anónimo',
                            createdAt: Timestamp.now(),
                            vamoPoints: 0,
                            averageRating: null,
                            ridesCompleted: 0,
                            activeBonus: false
                        };
                        transaction.set(userProfileRef, newProfile);
                    }
                    
                    const newTotalPoints = currentPoints + VAMO_POINTS_PER_RIDE;
                    const hasBonus = newTotalPoints >= 30;

                    transaction.update(userProfileRef, { 
                        vamoPoints: newTotalPoints,
                        ridesCompleted: (userProfileDoc.data()?.ridesCompleted || 0) + 1,
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


  const handleRatingSubmit = (rating: number, comments: string) => {
    if (!firestore) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    updateDocumentNonBlocking(rideRef, {
      driverRating: rating,
      driverComments: comments,
      updatedAt: Timestamp.now(),
    });
  };

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = ride.pricing.estimatedTotal + waitingCost;
  
  const finalPrice = ride.pricing.finalTotal || ride.pricing.estimatedTotal;

  if (ride.status === 'finished') {
    const waitingCostFinal = Math.ceil(totalAccumulatedWaitSeconds / 60) * WAITING_PER_MIN;
    return (
        <Card className="m-4">
            <CardHeader>
                <CardTitle className="text-xl">¡Viaje Finalizado!</CardTitle>
                <CardDescription>
                    {ride.destination.address}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="border-t border-b py-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Tarifa base</span>
                        <span>{formatCurrency(ride.pricing.estimatedTotal - waitingCostFinal)}</span>
                    </div>
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
              onSubmit={handleRatingSubmit}
              isSubmitted={!!ride.driverRating}
            />
        </Card>
    )
  }

  if (ride.status === 'cancelled') {
    return (
        <Card className="m-4">
            <CardHeader>
                <CardTitle className="text-xl text-destructive">Viaje Cancelado</CardTitle>
                <CardDescription>
                   El viaje a {ride.destination.address} fue cancelado.
                </CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <div>
      <TripCard
        status={ride.status}
        origin={"Ubicación actual (simulada)"}
        destination={ride.destination.address}
        onDestinationChange={() => {}}
        isInteractive={false}
      />
      <DriverInfo
        driver={
          ride.driverId
            ? {
                name: ride.driverName || 'Conductor',
                car: 'Auto (simulado)',
                plate: 'AB123CD',
                rating: '5.0',
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
