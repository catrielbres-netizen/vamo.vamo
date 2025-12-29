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
  CircleDashed,
  Flag,
  MapPin,
  PartyPopper,
  UserCheck,
} from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

const statusConfig: {
  [key: string]: { text: string; icon: React.ReactNode; progress: number };
} = {
  searching_driver: {
    text: 'Buscando conductor...',
    icon: <CircleDashed className="animate-spin" />,
    progress: 20,
  },
  driver_assigned: {
    text: 'Conductor encontrado',
    icon: <UserCheck />,
    progress: 40,
  },
  driver_arriving: {
    text: 'El conductor está en camino',
    icon: <Car />,
    progress: 60,
  },
  arrived: {
    text: 'El conductor ha llegado',
    icon: <MapPin />,
    progress: 80,
  },
  in_progress: {
    text: 'Viaje en curso',
    icon: <Car className="animate-pulse" />,
    progress: 90,
  },
  finished: { text: 'Viaje finalizado', icon: <PartyPopper />, progress: 100 },
  cancelled: { text: 'Viaje cancelado', icon: <Flag />, progress: 0 },
};

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
          <CardTitle>Cargando estado del viaje...</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Aguardá un momento...</p>
        </CardContent>
      </Card>
    );
  }

  if (!ride) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>No se pudo encontrar la información del viaje.</p>
        </CardContent>
      </Card>
    );
  }

  const config = statusConfig[ride.status] || statusConfig['searching_driver'];
  const rideData = ride;

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
        {rideData && rideData.destination && (
          <div className="text-sm space-y-2">
            <p className="flex items-center">
              <Flag className="w-4 h-4 mr-2 text-muted-foreground" />{' '}
              <strong>Destino:</strong> {rideData.destination.address}
            </p>
            <p className="flex items-center">
              <Car className="w-4 h-4 mr-2 text-muted-foreground" />{' '}
              <strong>Servicio:</strong>{' '}
              <span className="capitalize ml-1">{rideData.serviceType}</span>
            </p>
            {rideData.pricing.estimatedTotal && (
              <p className="font-bold text-base">
                Tarifa Final:{' '}
                <span className="text-primary">
                  $
                  {new Intl.NumberFormat('es-AR').format(
                    rideData.pricing.estimatedTotal
                  )}
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
