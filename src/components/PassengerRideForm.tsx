// @/components/PassengerRideForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { calculateFare, ServiceType } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, useUser } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, serverTimestamp, Firestore } from 'firebase/firestore';

async function createRide({
  firestore,
  origin,
  destination,
  serviceType,
  pricing,
  passenger,
}: {
  firestore: Firestore;
  origin: { lat: number; lng: number };
  destination: { address: string; lat: number; lng: number };
  serviceType: 'premium' | 'privado' | 'express';
  pricing: any;
  passenger: { uid: string; name?: string | null };
}) {
  const rideData = {
    passengerId: passenger.uid,
    passengerName: passenger.name || null,
    origin,
    destination,
    serviceType,
    pricing,
    status: 'searching_driver',
    driverId: null,
    pauseHistory: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const rideRef = await addDocumentNonBlocking(
    collection(firestore, 'rides'),
    rideData
  );

  if (!rideRef) {
    throw new Error('No se pudo crear el viaje.');
  }

  return rideRef.id;
}

export default function PassengerRideForm({
  onConfirm,
}: {
  onConfirm: (rideId: string) => void;
}) {
  const [origin, setOrigin] = useState('Ubicación Actual (Rawson)');
  const [destination, setDestination] = useState('');
  const [service, setService] = useState<ServiceType>('premium');
  const [distance, setDistance] = useState(0);
  const [fare, setFare] = useState<number | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  const firestore = useFirestore();
  const { user } = useUser();

  const [currentLocation, setCurrentLocation] = useState({
    lat: -43.3,
    lng: -65.1,
  }); // Simulación Rawson

  useEffect(() => {
    // Simulación de obtención de ubicación actual
    setTimeout(() => {
      setIsLoadingLocation(false);
    }, 1000);
  }, []);

  useEffect(() => {
    if (destination && origin) {
      // SIMULACIÓN DE DISTANCIA PARA PRUEBAS
      const simulatedDistance = Math.max(1000, destination.length * 350); // metros
      setDistance(simulatedDistance);

      const price = calculateFare({
        distanceMeters: simulatedDistance,
        service,
      });

      setFare(price);
    } else {
      setFare(null);
    }
  }, [destination, service, origin]);

  const handleConfirm = async () => {
    if (!fare || !user || !firestore) return;
    setIsConfirming(true);

    try {
      const rideId = await createRide({
        firestore,
        origin: currentLocation,
        destination: { address: destination, lat: 0, lng: 0 }, // Simulación
        serviceType: service,
        pricing: {
          estimatedTotal: fare,
          estimatedDistanceMeters: distance,
        },
        passenger: {
          uid: user.uid,
          name: user.displayName,
        },
      });
      console.log('Viaje creado:', rideId);
      onConfirm(rideId);
    } catch (error) {
      console.error('Error al crear el viaje:', error);
      // Aquí podrías mostrar un toast o alerta al usuario
      setIsConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Solicitar un viaje</CardTitle>
        <CardDescription>Ingresá a dónde querés ir.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="origin">Origen</Label>
          <Input
            id="origin"
            value={origin}
            disabled
            placeholder={isLoadingLocation ? 'Obteniendo ubicación...' : ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="destination">Destino</Label>
          <Input
            id="destination"
            placeholder="Ej: Playa Unión"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service">Tipo de Servicio</Label>
          <Select
            value={service}
            onValueChange={(value) => setService(value as ServiceType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccioná un servicio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="privado">Privado</SelectItem>
              <SelectItem value="express">Express</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {fare !== null && (
          <div className="bg-secondary/50 p-3 rounded-lg text-sm">
            <p>
              Distancia estimada:{' '}
              <span className="font-medium">
                {(distance / 1000).toFixed(1)} km
              </span>
            </p>
            <p className="font-bold text-base">
              Tarifa estimada:{' '}
              <span className="text-primary">
                ${new Intl.NumberFormat('es-AR').format(fare)}
              </span>
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Button
          disabled={!fare || isConfirming}
          onClick={handleConfirm}
          className="w-full"
          size="lg"
        >
          {isConfirming ? 'Confirmando...' : 'Confirmar Viaje'}
        </Button>
      </CardFooter>
    </Card>
  );
}
