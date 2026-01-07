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
import { VamoIcon } from '@/components/VamoIcon';
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

const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

const formatDuration = (seconds: number) => {
    return `${Math.round(seconds / 60)} min`;
}

export default function DriverRideCard({
  ride,
}: {
  ride: Ride & { id: string };
}) {
  const firestore = useFirestore();
  const { user, profile } = useUser();
  const { toast } = useToast();

  const handleAcceptRide = async () => {
    if (!firestore || !user || !profile?.currentLocation) {
        toast({
            variant: "destructive",
            title: "Error de perfil",
            description: "No se pudo cargar tu perfil o ubicación para aceptar el viaje. Intenta de nuevo.",
        });
        return;
    };
    const rideRef = doc(firestore, 'rides', ride.id);
    
    const driverFullName = `${profile.name || ''} ${profile.lastName || ''}`.trim();

    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
        toast({ variant: "destructive", title: "Error", description: "La API de Google Maps no está disponible." });
        return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
        {
            origin: new window.google.maps.LatLng(profile.currentLocation.lat, profile.currentLocation.lng),
            destination: new window.google.maps.LatLng(ride.origin.lat, ride.origin.lng),
            travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
             let arrivalInfo = null;
             if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]?.legs?.[0]) {
                const leg = result.routes[0].legs[0];
                if (leg.distance && leg.duration) {
                    arrivalInfo = {
                        distanceMeters: leg.distance.value,
                        durationSeconds: leg.duration.value,
                    };
                }
            } else {
                 toast({ variant: "destructive", title: "Error de Ruta", description: "No se pudo calcular la ruta al origen, pero el viaje fue aceptado." });
            }
            
            // Accept the ride anyway, even if arrivalInfo is null
            updateDocumentNonBlocking(rideRef, {
                status: 'driver_assigned',
                driverId: user.uid,
                driverName: driverFullName || 'Conductor Anónimo',
                driverArrivalInfo: arrivalInfo, // This can be null
                updatedAt: serverTimestamp(),
            });
            toast({ title: "¡Viaje Aceptado!" });
            // The onAccept prop is no longer needed here, as the page will react to the Firestore update.
        }
    );
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
                <span>{formatDistance(ride.pricing.estimatedDistanceMeters)}</span>
            </div>
             <div className="flex items-center justify-center gap-2">
                <VamoIcon name="clock" className="w-4 h-4" />
                <span>{formatDuration(ride.pricing.estimatedDurationSeconds || 0)}</span>
            </div>
        </div>

        <div className="!mt-2 bg-secondary/50 p-3 rounded-lg">
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
