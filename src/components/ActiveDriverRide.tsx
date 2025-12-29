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
import { calculateFare } from '@/lib/pricing';
import { Flag, User, Hourglass, Play } from 'lucide-react';

const statusActions: { [key: string]: { action: string, label: string } } = {
  driver_assigned: { action: 'driver_arriving', label: '¡Voy en camino!' },
  driver_arriving: { action: 'arrived', label: 'Llegué al origen' },
  arrived: { action: 'in_progress', label: 'Iniciar Viaje' },
  in_progress: { action: 'finished', label: 'Finalizar Viaje' },
  paused: { action: 'in_progress', label: 'Reanudar Viaje' },
};


export default function ActiveDriverRide({ ride, onFinishRide }: { ride: any, onFinishRide: () => void }) {
  const firestore = useFirestore();
  
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
    
    if(newStatus === 'in_progress' && ride.status === 'paused') {
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
        const totalWaitTimeSeconds = (ride.pauseHistory || []).reduce((acc: number, p: any) => acc + p.duration, 0);
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

  return (
    <Card>
       <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
            Viaje en curso
        </CardTitle>
        <Badge variant="secondary" className="flex items-center gap-2 whitespace-nowrap">
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
      </CardContent>
      <CardFooter className="flex-col gap-2">
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
      </CardFooter>
    </Card>
  );
}
