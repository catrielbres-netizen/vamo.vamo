
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
import { WhatsAppLogo } from './VamoIcon';
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


  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (!firestore || !ride.driverId) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    const driverProfileRef = doc(firestore, 'users', ride.driverId);

    // 1. Update the ride document with the new rating
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
    } catch (e) {
        toast({
            variant: 'destructive',
            title: 'Error al Calificar',
            description: 'No se pudo guardar tu calificación. Inténtalo de nuevo.',
        });
        return; // Don't proceed if this fails
    }


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

            // If the current ride's rating wasn't in the snapshot for some reason, add it.
            // This is a safeguard against race conditions.
            if (!driverRidesSnapshot.docs.some(d => d.id === ride.id)) {
                 if(rating > 0) {
                    totalRating += rating;
                    ratingCount++;
                 }
            }
            
            const newAverage = ratingCount > 0 ? totalRating / ratingCount : null;

            transaction.update(driverProfileRef, { averageRating: newAverage });
        });
    } catch(e) {
        console.error("Could not update driver average rating", e);
        // This is a non-critical error, so we don't show a toast to the user
    }
  };

  const handleSendWhatsAppReceipt = () => {
    const rideDate = ride.finishedAt instanceof Timestamp 
        ? format((ride.finishedAt as Timestamp).toDate(), "d 'de' MMMM 'de' yyyy 'a las' HH:mm'hs'", { locale: es })
        : 'Fecha no disponible';
    
    const finalPrice = ride.pricing.finalTotal || ride.pricing.estimatedTotal;
    const discount = ride.pricing.discountAmount || 0;
    const priceBeforeDiscount = finalPrice + discount;

    const message = `
*Comprobante de Viaje - VamO* 🚕
-----------------------------------
*Datos del Viaje*
*Fecha:* ${rideDate}
*Conductor:* ${ride.driverName || 'No especificado'}
*Origen:* ${ride.origin.address}
*Destino:* ${ride.destination.address}
*Servicio:* ${ride.serviceType.charAt(0).toUpperCase() + ride.serviceType.slice(1)}

*Detalle de Costos*
  - Tarifa del viaje: ${formatCurrency(priceBeforeDiscount)}
  ${discount > 0 ? `- Descuento VamO: -${formatCurrency(discount)}` : ''}
-----------------------------------
*TOTAL PAGADO:* *${formatCurrency(finalPrice)}*
-----------------------------------
¡Gracias por viajar con VamO!
    `.trim().replace(/\n/g, '%0A').replace(/ /g, '%20');

    const url = `https://wa.me/?text=${message}`;
    window.open(url, '_blank');
  };

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = ride.pricing.estimatedTotal + waitingCost;
  
  const finalPrice = ride.pricing.finalTotal || ride.pricing.estimatedTotal;

  if (ride.status === 'finished' || ride.status === 'cancelled') {
    const isCancelled = ride.status === 'cancelled';
    const waitingCostFinal = Math.ceil(totalAccumulatedWaitSeconds / 60) * WAITING_PER_MIN;
    return (
        <Card className="m-4">
            <CardHeader>
                <CardTitle className={`text-xl ${isCancelled ? 'text-destructive' : ''}`}>
                    {isCancelled ? 'Viaje Cancelado' : '¡Viaje Finalizado!'}
                </CardTitle>
                <CardDescription>
                   {isCancelled ? 'Tu viaje fue cancelado.' : `Viaje a ${ride.destination.address}`}
                </CardDescription>
            </CardHeader>

            {!isCancelled && (
              <>
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
                <CardFooter>
                     <Button onClick={handleSendWhatsAppReceipt} className="w-full" variant="outline">
                        <WhatsAppLogo className="mr-2 h-5 w-5" />
                        Enviar Comprobante
                    </Button>
                </CardFooter>
                <RatingForm
                  participantName={ride.driverName || 'Conductor'}
                  participantRole="conductor"
                  onSubmit={handleRatingSubmit}
                  isSubmitted={!!ride.driverRating}
                />
              </>
            )}

             <CardFooter className="pt-6">
                <Button onClick={onNewRide} className="w-full">
                    Pedir Otro Viaje
                </Button>
            </CardFooter>
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
