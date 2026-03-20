
'use client';

import React from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VamoIcon } from '@/components/VamoIcon';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { format, formatDistance } from 'date-fns';
import { es } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';

function formatTimestamp(ts?: any, customFormat = "d MMMM yyyy, HH:mm 'hs'") {
  if (!ts) return 'N/A';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return 'N/A';
  return format(date, customFormat, { locale: es });
}

function formatCurrency(value?: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$ 0.00';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

const InfoRow = ({ icon, label, value }: { icon: string, label: string, value: string | React.ReactNode }) => (
    <div className="flex items-start">
        <VamoIcon name={icon} className="w-4 h-4 mr-3 mt-1 text-muted-foreground"/>
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
        </div>
    </div>
);

export default function RideReceiptClient({ rideId }: { rideId: string }) {
  const firestore = useFirestore();

  const rideRef = useMemoFirebase(
    () => (firestore && rideId ? doc(firestore, 'rides', rideId) : null),
    [firestore, rideId]
  );

  const { data: ride, isLoading } = useDoc<Ride>(rideRef);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-24" />
        </div>
        <Card>
            <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
            <CardContent className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Separator />
                <Skeleton className="h-12 w-full" />
            </CardContent>
        </Card>
      </div>
    );
  }

  if (!ride || !ride.completedRide) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comprobante no encontrado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">
            No se encontraron los detalles de facturación para el viaje con ID: {rideId}.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/history">Volver al historial</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { completedRide } = ride;

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold">Comprobante de Viaje</h1>
                <p className="text-muted-foreground text-sm">ID: {rideId.substring(0, 8)}...</p>
            </div>
            <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/history">
                    <VamoIcon name="chevron-left" className="mr-2 h-4 w-4" /> Volver
                </Link>
            </Button>
        </div>
      
        <Card>
            <CardHeader>
                <CardTitle>Detalles del Viaje</CardTitle>
                <CardDescription>Realizado el {formatTimestamp(ride.completedAt)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <InfoRow icon="user" label="Pasajero" value={ride.passengerName || 'Tú'} />
                <InfoRow icon="car" label="Conductor" value={ride.driverName || 'N/A'} />
                <Separator />
                <InfoRow icon="map-pin" label="Origen" value={ride.origin.address} />
                <InfoRow icon="flag" label="Destino" value={ride.destination.address} />
                <Separator />
                <InfoRow icon="clock" label="Duración del trayecto" value={`${Math.round(completedRide.durationSeconds / 60)} min`} />
                {completedRide.waitingSeconds > 0 && (
                    <InfoRow icon="hourglass" label="Tiempo de espera" value={`${Math.ceil(completedRide.waitingSeconds / 60)} min`} />
                )}
                <InfoRow icon="route" label="Distancia" value={`${(completedRide.distanceMeters / 1000).toFixed(2)} km`} />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Resumen de Pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Tarifa base + distancia</span>
                    <span>{formatCurrency(completedRide.baseFare + completedRide.distanceFare)}</span>
                </div>
                 {completedRide.waitingFare > 0 && (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Tiempo de espera</span>
                        <span>{formatCurrency(completedRide.waitingFare)}</span>
                    </div>
                )}
                 {ride.pricing.discountAmount && ride.pricing.discountAmount > 0 && (
                    <div className="flex justify-between text-green-500">
                        <span className="text-muted-foreground">Descuento VamO</span>
                        <span>- {formatCurrency(ride.pricing.discountAmount)}</span>
                    </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between font-bold text-lg">
                    <span>Total Pagado</span>
                    <span className="text-primary">{formatCurrency(completedRide.totalFare)}</span>
                </div>
            </CardContent>
            <CardFooter>
                <p className="text-xs text-muted-foreground text-center w-full">Este es un comprobante de tu viaje y no una factura fiscal.</p>
            </CardFooter>
        </Card>
    </div>
  );
}
