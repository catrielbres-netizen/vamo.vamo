'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from './ui/button';
import { Progress } from '@/components/ui/progress';
import { VamoIcon } from './VamoIcon';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride, UserProfile, Role } from '@/lib/types';
import { Timestamp, doc, runTransaction, increment } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import RatingForm from './RatingForm';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function FinishedRideSummary({
  ride,
  userRole,
  onClose,
}: {
  ride: WithId<Ride>;
  userRole: Role;
  onClose?: () => void;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { profile } = useUser();
  const firebaseApp = useFirebaseApp();
  const router = useRouter();
  const pointsAwardedRef = useRef(false);
  const [isRatingSubmitted, setIsRatingSubmitted] = useState(false);

  useEffect(() => {
    if (ride.status === 'completed' && !ride.vamoPointsAwarded && !pointsAwardedRef.current && userRole === 'passenger') {
      if (!firestore || !ride.passengerId) return;

      pointsAwardedRef.current = true;

      const awardPoints = async () => {
        const pointsForThisRide = (ride.serviceType === 'premium' || ride.serviceType === 'normal') ? 5 : 2;
        const rideRef = doc(firestore, 'rides', ride.id);
        const userProfileRef = doc(firestore, 'users', ride.passengerId);

        try {
          await runTransaction(firestore, async (transaction) => {
            const userProfileDoc = await transaction.get(userProfileRef);
            if (!userProfileDoc.exists()) {
              throw new Error(`Profile for passenger ${ride.passengerId} not found.`);
            }

            const currentProfile = userProfileDoc.data() as UserProfile;
            const newTotalPoints = (currentProfile.vamoPoints || 0) + pointsForThisRide;
            const hasBonus = newTotalPoints >= 30;

            transaction.update(userProfileRef, {
              vamoPoints: newTotalPoints,
              'stats.ridesCompleted': increment(1),
              activeBonus: hasBonus,
            });

            transaction.update(rideRef, { vamoPointsAwarded: pointsForThisRide });
          });
        } catch (error) {
          console.error('Failed to award points in transaction:', error);
          pointsAwardedRef.current = false;
        }
      };

      awardPoints();
    }
  }, [ride.status, ride.id, ride.passengerId, firestore, ride.vamoPointsAwarded, userRole, ride.serviceType]);

  const fallbackNavigate = () => {
    const target = userRole === 'driver' ? '/driver/rides' : '/dashboard/ride';
    window.location.href = target;
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    fallbackNavigate();
  };

  // BUG 2 — Eliminar auto-cierre por activeRideId === null
  /*
  useEffect(() => {
    if (profile?.activeRideId === null) {
      const timeout = setTimeout(() => {
        handleClose();
      }, 1200);

      return () => clearTimeout(timeout);
    }
  }, [profile?.activeRideId]);
  */

  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (rating === 0 || !firebaseApp) return;

    try {
      const functions = getFunctions(undefined, 'us-central1');
      const submitRating = httpsCallable(functions, 'submitRideRatingV1');
      await submitRating({ rideId: ride.id, score: rating, comment: comments });

      toast({ title: '¡Calificación enviada!', description: 'Gracias por tu opinión.' });
      setIsRatingSubmitted(true);

      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (e: any) {
      console.error('Could not submit rating via function', e);
      toast({
        variant: 'destructive',
        title: 'Error al calificar',
        description: e.message || 'No se pudo guardar tu calificación.',
      });

      setTimeout(() => {
        handleClose();
      }, 1500);
    }
  };

  if (!ride.completedRide) {
    return (
      <Card className="m-4">
        <CardHeader>
          <CardTitle>Viaje terminado</CardTitle>
          <CardDescription>El viaje ha sido completado o cancelado.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">No hay un resumen disponible.</p>
        </CardContent>
        <CardFooter>
          <Button onClick={handleClose} className="w-full">
            {userRole === 'driver' ? 'Ver viajes disponibles' : 'Pedir un nuevo viaje'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const rideDate =
    ride.completedAt instanceof Timestamp
      ? format((ride.completedAt as Timestamp).toDate(), "d 'de' MMMM, HH:mm'hs'", { locale: es })
      : 'Fecha no disponible';

  const { totalFare, baseFare, distanceFare, waitingFare, waitingSeconds } = ride.completedRide;
  const baseAndDistanceFare = baseFare + distanceFare;
  const discountAmount = (ride.pricing as any)?.discountAmount ?? 0;
  const isDriver = userRole === 'driver';
  const hasUserRated = isDriver ? !!ride.passengerRatingByDriver : !!ride.driverRatingByPassenger;

  // Bloque 7: Points Rewards for Drivers
  const pointsAwarded = ride.completedRide?.pointsAwarded ?? 0;
  const currentPoints = profile?.rewardPoints || 0;
  const currentLevel = profile?.driverLevel || 'bronce';
  
  const nextThreshold = currentLevel === 'bronce' ? 50 : currentLevel === 'plata' ? 100 : null;
  const pointsToNext = nextThreshold ? nextThreshold - currentPoints : 0;

  return (
    <Card className="m-4 border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl font-black text-primary uppercase tracking-tight">¡Viaje finalizado!</CardTitle>
        <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{`Recibo del ${rideDate}`}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="text-sm space-y-2 p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-start">
            <VamoIcon name="map-pin" className="w-4 h-4 mr-2 mt-1 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground text-xs">Desde</p>
              <p className="font-medium">{ride.origin.address}</p>
            </div>
          </div>
          <div className="flex items-start">
            <VamoIcon name="flag" className="w-4 h-4 mr-2 mt-1 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground text-xs">Hasta</p>
              <p className="font-medium">{ride.destination.address}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-b py-4 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Tarifa base + distancia</span>
            <span>{formatCurrency(baseAndDistanceFare)}</span>
          </div>

          {waitingFare > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                Costo por espera ({formatDuration(waitingSeconds)})
              </span>
              <span>{formatCurrency(waitingFare)}</span>
            </div>
          )}

          {discountAmount > 0 && (
            <div className="flex justify-between items-center text-sm text-green-500">
              <span className="text-muted-foreground">Descuento VamO</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <div className="flex justify-between items-center font-bold text-lg">
            <span>{isDriver ? 'Tarifa Total' : 'Total pagado'}</span>
            <span className={cn(isDriver ? "text-white" : "text-primary")}>{formatCurrency(isDriver ? totalFare : (totalFare - discountAmount))}</span>
          </div>

          {isDriver && (ride.pricing as any)?.compensationAmount > 0 && (
            <div className="flex justify-between items-center text-sm font-black text-green-500 bg-green-500/10 p-3 rounded-xl border border-green-500/20 animate-in zoom-in-95 duration-500">
              <div className="flex items-center gap-2">
                <VamoIcon name="shield-check" className="h-4 w-4" />
                <span className="uppercase tracking-widest text-[10px]">Protección VamO</span>
              </div>
              <span>+{formatCurrency((ride.pricing as any).compensationAmount)}</span>
            </div>
          )}
        </div>

        {isDriver && (
          <div className="mt-6 pt-6 border-t border-border/50 animate-in fade-in slide-in-from-bottom-2 duration-700">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <VamoIcon name="award" className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Recompensa</p>
                        <p className="text-lg font-black text-white leading-none">+{pointsAwarded} Puntos {ride.serviceType === 'express' ? 'Express' : (ride.serviceType === 'premium' ? 'Premium' : 'Normal')}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">Total</p>
                    <p className="text-lg font-black text-primary leading-none">{currentPoints}</p>
                </div>
             </div>

             {nextThreshold && (
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
                            {pointsToNext <= 0 ? '¡Listo para el próximo nivel!' : `Faltan ${pointsToNext} para ${currentLevel === 'bronce' ? 'Plata' : 'Oro'}`}
                        </p>
                        <span className="text-[10px] font-black text-primary uppercase">{Math.round((currentPoints / nextThreshold) * 100)}%</span>
                    </div>
                    <Progress value={(currentPoints / nextThreshold) * 100} className="h-1.5 bg-zinc-900 border border-white/5" />
                </div>
             )}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground pt-4 mb-2">
          {isDriver
            ? `Pasajero: ${ride.passengerName || 'No disponible'}`
            : `Conductor: ${ride.driverName || 'No disponible'}`}
        </p>
      </CardContent>

      <RatingForm
        participantName={isDriver ? ride.passengerName || 'Pasajero' : ride.driverName || 'Conductor'}
        participantRole={isDriver ? 'pasajero' : 'conductor'}
        photoURL={isDriver ? ride.passengerPhotoUrl : ride.driverPhotoUrl}
        onSubmit={handleRatingSubmit}
        isSubmitted={hasUserRated || isRatingSubmitted}
        submitButtonText={isDriver ? 'Calificar y ver viajes' : 'Calificar y pedir otro viaje'}
      />

      <CardFooter className="pt-0 pb-6">
        <Button className="w-full h-12 rounded-2xl font-black uppercase tracking-widest shadow-lg" onClick={handleClose}>
          {userRole === 'driver' ? 'Finalizar' : 'Volver a pedir viaje'}
        </Button>
      </CardFooter>
    </Card>
  );
}
