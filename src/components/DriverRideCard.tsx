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
import { Flag, MapPin, User } from 'lucide-react';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Ride } from '@/lib/types';
import ServiceBadge from './ServiceBadge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const serviceCardStyles: Record<Ride['serviceType'], string> = {
    premium: "border-yellow-400/50",
    privado: "border-green-400/50",
    express: "border-gray-400/50",
};

export default function DriverRideCard({
  ride,
  onAccept,
}: {
  ride: Ride & { id: string };
  onAccept: () => void;
}) {
  const firestore = useFirestore();
  const { user, profile } = useUser(); // <-- Obtenemos el perfil del conductor
  const { toast } = useToast();

  const handleAcceptRide = async () => {
    if (!firestore || !user || !profile) {
        toast({
            variant: "destructive",
            title: "Error de perfil",
            description: "No se pudo cargar tu perfil para aceptar el viaje. Intenta de nuevo.",
        });
        return;
    };
    const rideRef = doc(firestore, 'rides', ride.id);
    
    // Usamos el nombre del perfil, que sí existe.
    updateDocumentNonBlocking(rideRef, {
        status: 'driver_assigned',
        driverId: user.uid,
        driverName: profile.name || 'Conductor Anónimo', // <-- ¡CORREGIDO!
        updatedAt: serverTimestamp(),
    });

    onAccept();
  };
  
  const cardStyle = serviceCardStyles[ride.serviceType] || serviceCardStyles.express;

  return (
    <Card className={cn(cardStyle)}>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Nuevo Viaje Disponible</CardTitle>
            <ServiceBadge serviceType={ride.serviceType} />
        </div>
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
          <strong>Desde:</strong> {ride.origin.address || 'Ubicación simulada'}
        </p>
        <p className="flex items-center">
          <Flag className="w-4 h-4 mr-2 text-muted-foreground" />
          <strong>Hasta:</strong> {ride.destination.address}
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
