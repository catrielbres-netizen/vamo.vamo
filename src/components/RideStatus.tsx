// @/components/RideStatus.tsx
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Car,
  Flag,
  UserCheck,
  PartyPopper,
  Clock,
  XCircle,
  CalendarDays,
  Ticket,
  User,
  Share2
} from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { RideStatusInfo } from '@/lib/ride-status';
import { Skeleton } from './ui/skeleton';
import { useState, useEffect } from 'react';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { Button } from '@/components/ui/button';


const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function RideStatus({ rideId, onCancel }: { rideId: string, onCancel: () => void }) {
  const firestore = useFirestore();
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);

  const rideRef = useMemoFirebase(
    () => (firestore && rideId ? doc(firestore, 'rides', rideId) : null),
    [firestore, rideId]
  );
  const { data: ride, isLoading } = useDoc(rideRef);

  const totalAccumulatedWaitSeconds = (ride?.pauseHistory || []).reduce((acc: number, p: any) => acc + p.duration, 0);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (ride?.status === 'paused' && ride.pauseStartedAt) {
      const updateTimer = () => {
          const now = Timestamp.now();
          const start = ride.pauseStartedAt;
          setCurrentPauseSeconds(now.seconds - start.seconds);
      }
      updateTimer();
      timer = setInterval(updateTimer, 1000);
    } else {
        setCurrentPauseSeconds(0);
    }
    
    return () => clearInterval(timer);
  }, [ride?.status, ride?.pauseStartedAt]);

  const handleCancelRide = () => {
    if (!firestore || !rideId) return;
    const rideDocRef = doc(firestore, "rides", rideId);
    updateDocumentNonBlocking(rideDocRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    onCancel();
  };

  const handleShareViaWhatsapp = () => {
    if (!ride) return;

    const finalTotal = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ride.pricing.finalTotal || ride.pricing.estimatedTotal);
    const date = ride.finishedAt instanceof Timestamp ? ride.finishedAt.toDate().toLocaleString('es-AR') : 'N/A';
    
    const message = `
*¡Gracias por viajar con VamO!* 🚖

Aquí está el resumen de tu viaje:

- *Destino:* ${ride.destination.address}
- *Conductor:* ${ride.driverName || 'No disponible'}
- *Fecha:* ${date}
- *Monto Final:* ${finalTotal}

¡Esperamos verte pronto!
`.trim();

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }

  const canCancel = ride && ['searching_driver', 'driver_assigned', 'driver_arriving'].includes(ride.status);

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
        <CardFooter>
            <Button onClick={onCancel} variant="outline" className="w-full">Pedir un nuevo viaje</Button>
        </CardFooter>
      </Card>
    );
  }
  
  if (ride.status === 'cancelled') {
    return (
      <Card>
        <CardHeader className='items-center text-center'>
            <XCircle className="w-12 h-12 text-destructive mb-2" />
            <CardTitle>Viaje Cancelado</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
            <Button onClick={onCancel} variant="outline">Pedir un nuevo viaje</Button>
        </CardContent>
      </Card>
    )
  }

  if (ride.status === 'finished') {
    const waitingMinutes = Math.ceil(totalAccumulatedWaitSeconds / 60);
    const waitingCost = waitingMinutes * WAITING_PER_MIN;
    const fareWithoutWaiting = (ride.pricing.finalTotal || ride.pricing.estimatedTotal) - waitingCost;
    const finalDate = ride.finishedAt instanceof Timestamp ? ride.finishedAt.toDate() : new Date();

    return (
        <Card>
            <CardHeader className='items-center text-center'>
                <Ticket className="w-12 h-12 text-primary mb-2" />
                <CardTitle>Resumen de tu Viaje</CardTitle>
                <CardDescription>¡Gracias por viajar con VamO!</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="text-center">
                    <p className="text-muted-foreground">Monto final</p>
                    <p className="text-4xl font-bold mb-4">
                        ${new Intl.NumberFormat('es-AR').format(ride.pricing.finalTotal || ride.pricing.estimatedTotal)}
                    </p>
                </div>

                <div className="text-sm space-y-3 bg-secondary/50 p-4 rounded-lg border">
                    <p className="flex justify-between">
                        <span className="flex items-center text-muted-foreground"><Flag className="w-4 h-4 mr-2" />Destino</span>
                        <span>{ride.destination.address}</span>
                    </p>
                     <p className="flex justify-between">
                        <span className="flex items-center text-muted-foreground"><User className="w-4 h-4 mr-2" />Conductor</span>
                        <span>{ride.driverName || 'No disponible'}</span>
                    </p>
                    <p className="flex justify-between">
                        <span className="flex items-center text-muted-foreground"><CalendarDays className="w-4 h-4 mr-2" />Fecha y Hora</span>
                        <span>{finalDate.toLocaleString('es-AR')}</span>
                    </p>
                </div>

                 <div className="text-left text-sm space-y-1 bg-secondary/50 p-3 rounded-lg">
                    <div className="flex justify-between"><span>Tarifa base del viaje:</span> <span>${new Intl.NumberFormat('es-AR').format(fareWithoutWaiting)}</span></div>
                    {waitingCost > 0 && <div className="flex justify-between"><span>Tiempo de espera ({formatDuration(totalAccumulatedWaitSeconds)}):</span> <span>${new Intl.NumberFormat('es-AR').format(waitingCost)}</span></div>}
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
                 <Button onClick={handleShareViaWhatsapp} className="w-full">
                    <Share2 className="mr-2 h-4 w-4" /> Enviar por WhatsApp
                </Button>
                <Button onClick={onCancel} variant="outline" className="w-full">Pedir un nuevo viaje</Button>
            </CardFooter>
        </Card>
    )
  }


  const config = RideStatusInfo[ride.status] || RideStatusInfo['searching_driver'];
  
  let cardTitle = '¡Tu viaje está en marcha!';
  if (ride.status === 'searching_driver') {
      cardTitle = 'Buscando tu viaje...';
  } else if (ride.status === 'driver_assigned' || ride.status === 'driver_arriving' || ride.status === 'arrived') {
      cardTitle = `${ride.driverName || 'Tu conductor'} está yendo a buscarte`;
  }

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
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

            {(totalWaitWithCurrent > 0 || ride.status === 'paused') && (
                <div className="!mt-4 border bg-background/80 p-3 rounded-lg">
                    <p className="flex items-center justify-center font-mono text-center">
                        <Clock className="w-4 h-4 mr-2 text-primary" />
                        <span className="font-semibold">Tiempo de espera:</span>
                        <span className="ml-2 tabular-nums">{formatDuration(totalWaitWithCurrent)}</span>
                    </p>
                    <p className="mt-1 text-center text-sm">
                        Costo de espera: ${new Intl.NumberFormat('es-AR').format(waitingCost)}
                    </p>
                </div>
            )}
        </div>
      </CardContent>
       <CardFooter className="flex-col gap-4">
            <div className="w-full !mt-0 bg-background/50 border p-3 rounded-lg text-center flex-col gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tarifa Actual a Cobrar</p>
                <p className="font-bold text-2xl text-primary">
                  ${new Intl.NumberFormat('es-AR').format(ride.pricing.estimatedTotal + waitingCost)}
                </p>
              </div>
            </div>
            {canCancel && (
                <Button onClick={handleCancelRide} variant="destructive" className="w-full">
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancelar Viaje
                </Button>
            )}
      </CardFooter>
    </Card>
  );
}
