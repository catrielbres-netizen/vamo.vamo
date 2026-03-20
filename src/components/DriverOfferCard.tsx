'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { useToast } from '@/hooks/use-toast';
import { type EnrichedRideOffer } from '@/context/DriverRidesProvider';
import { Timestamp } from 'firebase/firestore';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
}

function useCountdown(expiresAt: Timestamp) {
    const [remaining, setRemaining] = useState(0);

    useEffect(() => {
        if (!expiresAt) return;
        
        const interval = setInterval(() => {
            const now = Date.now();
            const expiryTime = expiresAt.toMillis();
            const secondsLeft = Math.max(0, Math.floor((expiryTime - now) / 1000));
            setRemaining(secondsLeft);
        }, 1000);

        return () => clearInterval(interval);
    }, [expiresAt]);

    return remaining;
}

export default function DriverOfferCard({ offer, isNew }: { offer: EnrichedRideOffer, isNew: boolean }) {
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isIgnoring, setIsIgnoring] = useState(false);
  const remainingTime = useCountdown(offer.expiresAt as Timestamp);

  const handleAcceptRide = async () => {
    if (!firebaseApp) return;
    setIsAccepting(true);
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const acceptRide = httpsCallable(functions, 'acceptRideV2');
      await acceptRide({ rideId: offer.rideId });
    } catch (error: any) {
      console.error('Error accepting ride:', error);
      toast({ variant: 'destructive', title: 'Error al aceptar', description: error.message });
      setIsAccepting(false);
    }
  };

  const handleIgnoreRide = async () => {
    if (!firebaseApp) return;
    setIsIgnoring(true);
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const ignoreRide = httpsCallable(functions, 'ignoreRideV1');
      await ignoreRide({ rideId: offer.rideId });
      toast({ variant: 'default', title: 'Oferta ignorada' });
    } catch (error: any) {
      console.error('Error ignoring ride:', error);
      toast({ variant: 'destructive', title: 'Error al ignorar', description: error.message });
      setIsIgnoring(false);
    }
  };

  const cardClasses = isNew ? "border-green-500 border-2 shadow-lg" : "";

  return (
    <Card className={cardClasses}>
      <CardHeader>
        <CardTitle>¡Nuevo viaje disponible!</CardTitle>
        <CardDescription>Pasajero: {offer.passengerName || 'No disponible'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
                <p className="text-muted-foreground">Origen</p>
                <p className="font-semibold">{offer.origin.address}</p>
            </div>
            <div>
                <p className="text-muted-foreground">Destino</p>
                <p className="font-semibold">{offer.destination.address}</p>
            </div>
        </div>
        <div className="bg-primary/10 p-4 rounded-lg text-center">
          <p className="font-bold text-2xl text-primary">{formatCurrency(offer.pricing.estimatedTotal)}</p>
          <p className="text-xs text-muted-foreground">Tarifa estimada para vos</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
          <div className="w-full text-center mb-2">
              <p className="text-sm text-red-500 font-bold">La oferta expira en: {remainingTime}s</p>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(remainingTime / 60) * 100}%` }}></div>
              </div>
          </div>
        <Button onClick={handleAcceptRide} disabled={isAccepting || isIgnoring || remainingTime <= 0} className="w-full" size="lg">
          {isAccepting ? <VamoIcon name="loader" className="animate-spin"/> : 'Aceptar Viaje'}
        </Button>
        <Button onClick={handleIgnoreRide} disabled={isAccepting || isIgnoring || remainingTime <= 0} className="w-full" variant="ghost">
          {isIgnoring ? 'Ignorando...' : 'Ignorar'}
        </Button>
      </CardFooter>
    </Card>
  );
}
