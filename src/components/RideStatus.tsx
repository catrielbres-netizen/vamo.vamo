
// src/components/RideStatus.tsx
'use client';
import { TripCard } from './TripCard';
import { DriverInfo } from './DriverInfo';
import { TripTimers } from './TripTimers';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { useEffect, useState, useRef } from 'react';
import { Timestamp, doc, runTransaction, collection, getDocs, where, query } from 'firebase/firestore';
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
    if (mins < 1) return `~1 min`;
    return `~${mins} min`;
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
                    let ridesCompleted = 0;

                    if (userProfileDoc.exists()) {
                        const profileData = userProfileDoc.data() as UserProfile;
                        currentPoints = profileData.vamoPoints || 0;
                        ridesCompleted = profileData.ridesCompleted || 0;
                    } else {
                        // Create profile if it doesn't exist
                        const newProfile: Partial<UserProfile> = {
                            name: ride.passengerName || 'Pasajero Anónimo',
                            email: '', // Should be filled from auth, but not available here
                            role: 'passenger',
                            createdAt: Timestamp.now(),
                            profileCompleted: true,
                            vamoPoints: 0,
                            ridesCompleted: 0,
                            activeBonus: false,
                        };
                        transaction.set(userProfileRef, newProfile);
                    }
                    
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


  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (!firestore || !ride.driverId) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    const driverProfileRef = doc(firestore, 'users', ride.driverId);

    // 1. Update the ride document with the new rating
    await updateDocumentNonBlocking(rideRef, {
      driverRating: rating,
      driverComments: comments,
      updatedAt: Timestamp.now(),
    });

    // 2. Recalculate driver's average rating
    try {
        await runTransaction(firestore, async (transaction) => {
            // Get all finished rides for this driver
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

            // If the current ride's rating isn't in the snapshot yet, add it
            if (!driverRidesSnapshot.docs.some(d => d.id === ride.id)) {
                 totalRating += rating;
                 ratingCount++;
            }
            
            const newAverage = ratingCount > 0 ? totalRating / ratingCount : null;

            transaction.update(driverProfileRef, { averageRating: newAverage });
        });
    } catch(e) {
        console.error("Could not update driver average rating", e);
    }
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
