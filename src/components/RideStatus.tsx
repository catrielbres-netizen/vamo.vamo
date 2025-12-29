// @/components/RideStatus.tsx
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Car,
  Flag,
  UserCheck,
  PartyPopper
} from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { RideStatusInfo } from '@/lib/ride-status';
import { Skeleton } from './ui/skeleton';

export default function RideStatus({ rideId }: { rideId: string }) {
  const firestore = useFirestore();
  const rideRef = useMemoFirebase(
    () => (firestore && rideId ? doc(firestore, 'rides', rideId) : null),
    [firestore, rideId]
  );
  const { data: ride, isLoading } = useDoc(rideRef);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Buscando tu viaje...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!ride) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Viaje no encontrado</CardTitle>
        </CardHeader>
        <CardContent>
          <p>No pudimos encontrar los detalles de tu viaje. ¿Querés pedir otro?</p>
        </CardContent>
      </Card>
    );
  }
  
  if (ride.status === 'finished') {
    return (
        <Card>
        <CardHeader className='items-center text-center'>
            <PartyPopper className="w-12 h-12 text-primary mb-2" />
            <CardTitle>¡Viaje Finalizado!</CardTitle>
            <CardDescription>Gracias por viajar con VamO.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
            <p className="text-muted-foreground">Monto final</p>
            <p className="text-4xl font-bold">
            ${new Intl.NumberFormat('es-AR').format(ride.pricing.finalTotal || ride.pricing.estimatedTotal)}
            </p>
        </CardContent>
        </Card>
    )
  }


  const config = RideStatusInfo[ride.status] || RideStatusInfo['searching_driver'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>¡Tu viaje está en marcha!</CardTitle>
        <CardDescription>
          Seguí el estado de tu viaje en tiempo real.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 mt-4 border rounded-lg bg-secondary/50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="text-primary">{config.icon}</div>
            <h3 className="font-bold text-lg">{config.text}</h3>
          </div>
          <Progress value={config.progress} className="w-full" />
        </div>
        <div className="text-sm space-y-3">
            {ride.driverName && (
               <p className="flex items-center">
                <UserCheck className="w-4 h-4 mr-2 text-muted-foreground" />{' '}
                <strong>Conductor:</strong> {ride.driverName}
              </p>
            )}
            <p className="flex items-center">
              <Flag className="w-4 h-4 mr-2 text-muted-foreground" />{' '}
              <strong>Destino:</strong> {ride.destination.address}
            </p>
            <p className="flex items-center">
              <Car className="w-4 h-4 mr-2 text-muted-foreground" />{' '}
              <strong>Servicio:</strong>{' '}
              <span className="capitalize ml-1">{ride.serviceType}</span>
            </p>
            {ride.pricing.estimatedTotal && (
              <div className="!mt-4 bg-background/50 border p-3 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Tarifa Estimada</p>
                <p className="font-bold text-xl text-primary">
                  $
                  {new Intl.NumberFormat('es-AR').format(
                    ride.pricing.estimatedTotal
                  )}
                </p>
              </div>
            )}
          </div>
      </CardContent>
    </Card>
  );
}
