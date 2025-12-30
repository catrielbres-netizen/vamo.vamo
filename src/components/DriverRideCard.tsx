// @/components/DriverRideCard.tsx
'use client';

import { useFirestore, useUser } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Flag, MapPin, User, Car } from 'lucide-react';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';


export default function DriverRideCard({
  ride,
  onAccept,
}: {
  ride: any;
  onAccept: () => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();

  const handleAcceptRide = async () => {
    if (!firestore || !user) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    
    updateDocumentNonBlocking(rideRef, {
        status: 'driver_assigned',
        driverId: user.uid,
        driverName: user.displayName || 'Conductor Anónimo',
        updatedAt: serverTimestamp(),
    });

    onAccept();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo Viaje Disponible</CardTitle>
        <CardDescription>
          Un pasajero necesita que lo lleven.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="flex items-center">
            <User className="w-4 h-4 mr-2 text-muted-foreground" />
            <strong>Pasajero:</strong> {ride.passengerName || 'No especificado'}
        </p>
        <p className="flex items-center">
          <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
          <strong>Desde:</strong> Rawson (Simulado)
        </p>
        <p className="flex items-center">
          <Flag className="w-4 h-4 mr-2 text-muted-foreground" />
          <strong>Hasta:</strong> {ride.destination.address}
        </p>
        <p className="flex items-center">
            <Car className="w-4 h-4 mr-2 text-muted-foreground" />
            <strong>Servicio:</strong> <span className="capitalize ml-1">{ride.serviceType}</span>
        </p>
        <div className="!mt-4 bg-secondary/50 p-3 rounded-lg">
            <p className="font-bold text-base text-center">
            Tarifa Estimada:{' '}
            <span className="text-primary">
                ${new Intl.NumberFormat('es-AR').format(ride.pricing.estimatedTotal)}
            </span>
            </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleAcceptRide} className="w-full" size="lg">
          Aceptar Viaje
        </Button>
      </CardFooter>
    </Card>
  );
}
