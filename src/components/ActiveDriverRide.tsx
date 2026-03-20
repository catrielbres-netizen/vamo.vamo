'use client';

import React, { useEffect } from 'react';
import { useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { doc, serverTimestamp, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import { Ride } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import FinishedRideSummary from './FinishedRideSummary';
import { useRouter } from 'next/navigation';

function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
}

export default function ActiveDriverRide({ ride }: { ride: WithId<Ride> }) {
  const firestore = useFirestore();
  const { user, profile } = useUser();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (profile?.role === 'driver' && profile.activeRideId === null && ride.status === 'completed') {
      const timeout = setTimeout(() => {
        router.replace('/driver');
        router.refresh();
      }, 1200);

      return () => clearTimeout(timeout);
    }
  }, [profile?.activeRideId, profile?.role, ride.status, router]);

  const handleStartRide = async () => {
    if (!firebaseApp || !user) return;

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const startRideV1 = httpsCallable(functions, 'startRideV1');
      await startRideV1({ rideId: ride.id });
      toast({ title: '¡Viaje iniciado!', description: 'Que tengas una buena ruta.' });
    } catch (error: any) {
      console.error('Error en la transacción de handleStartRide:', error);
      toast({
        variant: 'destructive',
        title: 'No se pudo iniciar el viaje',
        description: error.message || 'Un error inesperado ocurrió.',
        duration: 9000,
      });
    }
  };

  const handleArrived = async () => {
    if (!firebaseApp) return;
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const driverArrived = httpsCallable(functions, 'driverArrivedV1');
      await driverArrived({ rideId: ride.id });
      toast({ title: '¡Llegaste!', description: 'El pasajero ha sido notificado.' });
    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
    }
  };

  const handleTogglePause = async () => {
    if (!firestore || !ride.pauseStartedAt) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    const isCurrentlyPaused = ride.status === 'paused';

    try {
      if (isCurrentlyPaused && ride.pauseStartedAt instanceof Timestamp) {
        const pauseDurationSeconds = Math.floor((Date.now() - ride.pauseStartedAt.toMillis()) / 1000);

        await updateDoc(rideRef, {
          status: 'in_progress',
          pauseHistory: arrayUnion({ duration: pauseDurationSeconds, reason: 'driver_pause' }),
          pauseStartedAt: null,
          updatedAt: serverTimestamp(),
        });

        toast({ title: 'Viaje reanudado' });
      } else if (!isCurrentlyPaused) {
        await updateDoc(rideRef, {
          status: 'paused',
          pauseStartedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Viaje en espera' });
      }
    } catch (error: any) {
      console.error('Error al pausar/reanudar:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleCompleteRide = async () => {
    if (!firebaseApp) {
      toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para completar el viaje.' });
      return;
    }

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const finishRideV1 = httpsCallable(functions, 'finishRideV1');
      await finishRideV1({ rideId: ride.id });
      toast({ title: '¡Viaje completado!', description: 'Procesando la liquidación final...' });
    } catch (error: any) {
      console.error('Error completando el viaje:', error);
      toast({
        variant: 'destructive',
        title: 'Error al finalizar el viaje',
        description: error.message || 'No se pudo marcar el viaje como completado.',
      });
    }
  };

  const handleCancelRide = async () => {
    if (!firebaseApp || !user) return;

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const cancelRideV1 = httpsCallable(functions, 'cancelRideV1');
      await cancelRideV1({ rideId: ride.id, reason: 'cancelled_by_driver' });
      toast({ title: 'Viaje cancelado' });
    } catch (error: any) {
      console.error('Error calling cancelRideV1:', error);
      toast({ variant: 'destructive', title: 'Error al cancelar', description: error.message });
    }
  };

  const renderContent = () => {
    if (ride.status === 'completed') {
      return (
        <FinishedRideSummary
          ride={ride}
          userRole="driver"
          onClose={() => {
            window.location.href = '/driver/rides';
          }}
        />
      );
    }

    const commonCardContent = (
      <>
        <CardDescription>Pasajero: {ride.passengerName || 'N/A'}</CardDescription>
        <div className="space-y-2 py-4">
          <p className="flex items-start gap-2 text-sm">
            <VamoIcon name="map-pin" className="mt-1" /> <strong>Origen:</strong> {ride.origin.address}
          </p>
          <p className="flex items-start gap-2 text-sm">
            <VamoIcon name="flag" className="mt-1" /> <strong>Destino:</strong> {ride.destination.address}
          </p>
        </div>
        <div className="bg-secondary/50 p-3 rounded-lg text-center">
          <p className="font-bold text-lg text-primary">{formatCurrency(ride.pricing?.estimatedTotal ?? 0)}</p>
          <p className="text-xs text-muted-foreground">Tarifa estimada</p>
        </div>
      </>
    );

    switch (ride.status) {
      case 'driver_assigned':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Dirígete al origen</CardTitle>
              <CardDescription>Cuando estés en el punto de encuentro, notificá tu llegada.</CardDescription>
            </CardHeader>
            <CardContent>{commonCardContent}</CardContent>
            <CardFooter className="flex-col gap-2">
              <Button onClick={handleArrived} className="w-full" size="lg">
                <VamoIcon name="user-check" /> Ya llegué
              </Button>
              <Button
                onClick={() =>
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.origin.lat},${ride.origin.lng}`, '_blank')
                }
                className="w-full"
                variant="outline"
              >
                <VamoIcon name="route" /> Ver ruta en mapa
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full" variant="destructive">
                    Cancelar viaje
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar este viaje?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cancelar afecta tus métricas. Hacelo solo si es estrictamente necesario.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>No, continuar</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button variant="destructive" onClick={handleCancelRide}>
                        Sí, cancelar
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        );

      case 'driver_arrived':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Esperando al pasajero</CardTitle>
              <CardDescription>Cuando el pasajero esté a bordo, iniciá el viaje.</CardDescription>
            </CardHeader>
            <CardContent>{commonCardContent}</CardContent>
            <CardFooter className="flex-col gap-2">
              <Button onClick={handleStartRide} className="w-full bg-green-600 hover:bg-green-700" size="lg">
                <VamoIcon name="play" /> Iniciar viaje
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full" variant="destructive">
                    Cancelar viaje
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar este viaje?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El pasajero ya fue notificado de tu llegada. Cancelar ahora podría generar una mala experiencia.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>No, continuar</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button variant="destructive" onClick={handleCancelRide}>
                        Sí, cancelar
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        );

      case 'in_progress':
      case 'paused':
        const isPaused = ride.status === 'paused';
        return (
          <Card>
            <CardHeader>
              <CardTitle>{isPaused ? 'Viaje en pausa' : 'Viaje en curso'}</CardTitle>
            </CardHeader>
            <CardContent>{commonCardContent}</CardContent>
            <CardFooter className="flex-col gap-2">
              <Button onClick={handleTogglePause} className="w-full" variant={isPaused ? 'default' : 'secondary'} size="lg">
                {isPaused ? (
                  <>
                    <VamoIcon name="play" /> Reanudar viaje
                  </>
                ) : (
                  <>
                    <VamoIcon name="hourglass" /> Pausar viaje
                  </>
                )}
              </Button>
              <Button onClick={handleCompleteRide} className="w-full" size="lg" disabled={isPaused}>
                <VamoIcon name="check-circle" /> Finalizar viaje
              </Button>
              <Button
                onClick={() =>
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.destination.lat},${ride.destination.lng}`, '_blank')
                }
                className="w-full"
                variant="outline"
                disabled={isPaused}
              >
                <VamoIcon name="route" /> Ver ruta al destino final
              </Button>
            </CardFooter>
          </Card>
        );

      default:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Estado: {ride.status}</CardTitle>
            </CardHeader>
            <CardContent>Esperando actualización...</CardContent>
          </Card>
        );
    }
  };

  return <div className="m-4">{renderContent()}</div>;
}
