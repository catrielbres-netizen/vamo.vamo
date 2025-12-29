// src/components/RideStatus.tsx
'use client';
import { TripCard } from './TripCard';
import { DriverInfo } from './DriverInfo';
import { TripTimers } from './TripTimers';
import { WAITING_PER_MIN } from '@/lib/pricing';
import { useEffect, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from './ui/button';
import { WhatsAppLogo } from './icons'; // Asegúrate de tener este ícono
import { format } from 'date-fns';
import es from 'date-fns/locale/es';


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

export default function RideStatus({ ride }: { ride: any }) {
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

  const totalWaitWithCurrent = totalAccumulatedWaitSeconds + currentPauseSeconds;
  const waitingCost = Math.ceil(totalWaitWithCurrent / 60) * WAITING_PER_MIN;
  const currentTotal = ride.pricing.estimatedTotal + waitingCost;
  
  const finalPrice = ride.pricing.finalTotal || ride.pricing.estimatedTotal;

  const handleSendWhatsApp = () => {
    const rideDate = ride.finishedAt instanceof Timestamp 
        ? format(ride.finishedAt.toDate(), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })
        : 'Fecha no disponible';

    const message = `
*Resumen de tu viaje con VamO* 🚕

*Destino:* ${ride.destination.address}
*Fecha:* ${rideDate}
*Conductor:* ${ride.driverName || 'No disponible'}
-----------------------------------
*Tarifa Base:* ${formatCurrency(ride.pricing.estimatedTotal)}
*Costo de Espera:* ${formatCurrency(waitingCost)}
*TOTAL A PAGAR:* *${formatCurrency(finalPrice)}*

¡Gracias por viajar con VamO!
    `.trim().replace(/\n/g, '%0A').replace(/ /g, '%20');

    const url = `https://wa.me/?text=${message}`;
    window.open(url, '_blank');
  }

  if (ride.status === 'finished') {
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
                        <span>{formatCurrency(ride.pricing.estimatedTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Costo por espera</span>
                        <span>{formatCurrency(waitingCost)}</span>
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
                 <Button onClick={handleSendWhatsApp} className="w-full" variant="outline">
                    <WhatsAppLogo className="mr-2 h-5 w-5" />
                    Enviar Resumen por WhatsApp
                </Button>
            </CardFooter>
        </Card>
    )
  }

  return (
    <div>
      <TripCard
        status={ride.status}
        origin={ride.origin.address || 'Ubicación actual'}
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
