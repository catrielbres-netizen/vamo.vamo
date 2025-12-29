// @/components/ActiveDriverRide.tsx
'use client';

import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RideStatusInfo } from '@/lib/ride-status';
import { calculateFare, WAITING_PER_MIN } from '@/lib/pricing';
import { Flag, User, Hourglass, Play, Clock, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';

const statusActions: { [key: string]: { action: string, label: string } } = {
  driver_assigned: { action: 'driver_arriving', label: '¡Voy en camino!' },
  driver_arriving: { action: 'arrived', label: 'Llegué al origen' },
  arrived: { action: 'in_progress', label: 'Iniciar Viaje' },
  in_progress: { action: 'finished', label: 'Finalizar Viaje' },
  paused: { action: 'in_progress', label: 'Reanudar Viaje' },
};

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ActiveDriverRide({ ride, onFinishRide }: { ride: any, onFinishRide: () => void }) {
  const firestore = useFirestore();
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);

  const totalAccumulatedWaitSeconds = (ride.pauseHistory || []).reduce((acc: number, p: any) => acc + p.duration, 0);

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (ride.status === 'paused' && ride.pauseStartedAt) {
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
  }, [ride.status, ride.pauseStartedAt]);

  const updateStatus = (newStatus: string) => {
    if (!firestore) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    
    let payload:any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
    }

    if(newStatus === 'paused') {
        payload.pauseStartedAt = serverTimestamp();
    }
    
    if(newStatus === 'in_progress' && ride.status === 'paused' && ride.pauseStartedAt) {
        const now = Timestamp.now();
        const pausedAt = ride.pauseStartedAt; // Is already a Timestamp
        const diffSeconds = now.seconds - pausedAt.seconds;
        
        payload.pauseStartedAt = null; // Clear the start time
        payload.pauseHistory = [
            ...(ride.pauseHistory || []),
            { started: pausedAt, ended: now, duration: diffSeconds }
        ];
    }

    if(newStatus === 'finished') {
        const totalWaitTimeSeconds = totalAccumulatedWaitSeconds;
        const finalPrice = calculateFare({
            distanceMeters: ride.pricing.estimatedDistanceMeters ?? 4200, // Usar distancia real en el futuro
            waitingMinutes: Math.ceil(totalWaitTimeSeconds / 60),
            service: ride.serviceType,
            isNight: false, // Añadir lógica de tarifa nocturna
        });
        payload.pricing = { ...ride.pricing, finalTotal: finalPrice };
        payload.finishedAt = serverTimestamp();
    }

    updateDocumentNonBlocking(rideRef, payload);

    if (newStatus === 'finished') {
        onFinishRide();
    }
  };

  const nextAction = statusActions[ride.status as keyof typeof statusActions];
  const statusInfo = RideStatusInfo[ride.status as keyof typeof RideStatusInfo] || { text: 'Estado desconocido', icon: <></> };

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = ride.pricing.estimatedTotal + waitingCost;

  return (
    <Card>
       <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
            Viaje en curso
        </CardTitle>
        <Badge variant={ride.status === 'paused' ? 'destructive' : 'secondary'} className="flex items-center gap-2 whitespace-nowrap">
            {statusInfo.icon}
            {statusInfo.text}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="flex items-center">
            <User className="w-4 h-4 mr-2 text-muted-foreground" />
            <strong>Pasajero:</strong> {ride.passengerName || 'No especificado'}
        </p>
        <p className="flex items-center">
          <Flag className="w-4 h-4 mr-2 text-muted-foreground" />
          <strong>Destino:</strong> {ride.destination.address}
        </p>
        {(totalWaitWithCurrent > 0) && (
            <div className="!mt-4 bg-secondary/50 p-3 rounded-lg">
                <p className="flex items-center justify-center font-mono text-center">
                    <Clock className="w-4 h-4 mr-2 text-primary" />
                    <span className="font-semibold">Tiempo de espera:</span>
                    <span className="ml-2 tabular-nums">{formatDuration(totalWaitWithCurrent)}</span>
                </p>
                <p className="mt-1 text-center font-semibold text-sm">
                    Costo de espera: ${new Intl.NumberFormat('es-AR').format(waitingCost)}
                </p>
            </div>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-4">
        <div className="w-full !mt-0 bg-background/50 border p-3 rounded-lg text-center flex-col gap-4">
            <div>
                <p className="text-sm text-muted-foreground">Tarifa Actual a Cobrar</p>
                <p className="font-bold text-2xl text-primary">
                    ${new Intl.NumberFormat('es-AR').format(currentTotal)}
                </p>
            </div>
        </div>

        <div className="w-full flex flex-col gap-2">
            {nextAction && (
            <Button
                onClick={() => updateStatus(nextAction.action)}
                className="w-full"
                size="lg"
                variant={nextAction.action === 'finished' ? 'destructive' : 'default'}
            >
                {nextAction.action === 'in_progress' && ride.status === 'paused' && <Play className="mr-2 h-4 w-4" />}
                {nextAction.label}
            </Button>
            )}
            {ride.status === 'in_progress' && (
                <Button
                    onClick={() => updateStatus('paused')}
                    className="w-full"
                    variant="outline"
                >
                    <Hourglass className="mr-2 h-4 w-4" />
                    Pausar Viaje
                </Button>
            )}
        </div>
      </CardFooter>
    </Card>
  );
}
