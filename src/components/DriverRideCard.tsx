
// @/components/DriverRideCard.tsx
'use client';

import React from 'react';
import { useUser, useFirebaseApp } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Ride } from '@/lib/types';
import ServiceBadge from './ServiceBadge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { canDriverTakeRide } from '@/lib/eligibility';
import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { type WithId } from '@/firebase/firestore/use-collection';
import { Timestamp } from 'firebase/firestore';


const serviceCardStyles: Record<Ride['serviceType'], string> = {
    premium: "border-yellow-400/50",
    express: "border-gray-400/50",
};

const formatDistance = (meters: number) => {
    if (meters === 0) return '-- km';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

const formatDuration = (seconds: number) => {
    if (seconds === 0) return '-- min';
    return `${Math.round(seconds / 60)} min`;
}

export default function DriverRideCard({
  ride,
  isNew = false,
}: {
  ride: WithId<Ride>;
  isNew?: boolean;
}) {
  const { profile } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAcceptRide = async () => {
    if (isAccepting || !firebaseApp || !profile) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se puede aceptar el viaje en este momento. Intenta de nuevo.",
        });
        return;
    };
    
    setIsAccepting(true);
            
    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const acceptRide = httpsCallable(functions, 'acceptRideV2');
        await acceptRide({ rideId: ride.id });

        toast({ title: "¡Viaje Aceptado!" });

    } catch (error: any) {
         console.error("Fallo al aceptar el viaje (callable):", error);
         toast({ variant: "destructive", title: "No se pudo aceptar", description: error.message || "Intenta de nuevo." });
    } finally {
        setIsAccepting(false);
    }
  };
  
  const handleRejectRide = async () => {
    toast({
        title: "Viaje Ignorado",
        description: "Podrás ver otras solicitudes.",
    });
  };

  if (!profile) return null;

  const cardStyle = serviceCardStyles[ride.serviceType] || serviceCardStyles.express;
  const isEligible = canDriverTakeRide(profile, ride.serviceType);

  return (
    <Card className={cn(cardStyle, isNew && 'animate-pulse border-2 border-accent')}>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Viaje Disponible</CardTitle>
            <div className="flex items-center gap-2">
                <ServiceBadge serviceType={ride.serviceType} />
            </div>
        </div>
        <CardDescription>
          Un pasajero necesita que lo lleven.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="flex items-center">
            <VamoIcon name="user" className="w-4 h-4 mr-2 text-muted-foreground" />
            <strong>Pasajero:</strong> {ride.passengerName || 'No especificado'}
        </p>
        <p className="flex items-center">
          <VamoIcon name="map-pin" className="w-4 h-4 mr-2 text-muted-foreground" />
          <strong>Desde:</strong> {ride.origin.address || 'Ubicación simulada'}
        </p>
        <p className="flex items-center">
          <VamoIcon name="flag" className="w-4 h-4 mr-2 text-muted-foreground" />
          <strong>Hasta:</strong> {ride.destination.address}
        </p>

        <div className="!mt-4 grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
                <VamoIcon name="route" className="w-4 h-4" />
                <span>{formatDistance(ride.pricing?.estimatedDistanceMeters ?? 0)}</span>
            </div>
             <div className="flex items-center justify-center gap-2">
                <VamoIcon name="clock" className="w-4 h-4" />
                <span>{formatDuration(ride.pricing?.estimatedDurationSeconds ?? 0)}</span>
            </div>
        </div>

        <div className="!mt-2 bg-secondary/50 p-3 rounded-lg">
            <p className="font-bold text-base text-center">
            Tarifa Estimada:{' '}
            <span className="text-primary">
                ${new Intl.NumberFormat('es-AR').format(ride.pricing?.estimatedTotal ?? 0)}
            </span>
            </p>
        </div>
      </CardContent>
      <CardFooter className="flex-row gap-2">
        <Button onClick={handleRejectRide} className="w-full" size="lg" variant="outline" disabled={isAccepting}>
          Ignorar
        </Button>
        <Button onClick={handleAcceptRide} className="w-full" size="lg" disabled={!isEligible || isAccepting}>
          {isAccepting ? <VamoIcon name="loader" className="animate-spin" /> : isEligible ? 'Aceptar Viaje' : 'No Habilitado'}
        </Button>
      </CardFooter>
    </Card>
  );
}
