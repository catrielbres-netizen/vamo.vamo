// @/components/FinishedRideSummary.tsx
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from './ui/button';
import { VamoIcon, WhatsAppLogo } from './VamoIcon';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride } from '@/lib/types';
import { Timestamp, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { WAITING_PER_MIN } from '@/lib/pricing';
import RatingForm from './RatingForm';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Separator } from './ui/separator';


function formatCurrency(value: number) {
  if (typeof value !== 'number' || isNaN(value)) return '$...';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(value);
}

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function FinishedRideSummary({ ride, onClose }: { ride: WithId<Ride>, onClose: () => void }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  if (!ride.pricing || !ride.completedRide) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Error en el Viaje</CardTitle>
                <CardDescription>No se pudo cargar el resumen.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-center text-destructive">Faltan datos de precios o del viaje completado.</p>
            </CardContent>
            <CardFooter>
                 <Button onClick={onClose} className="w-full">
                    Volver
                </Button>
            </CardFooter>
        </Card>
    );
  }

  const finalPrice = ride.completedRide.totalPrice;
  const waitingCost = Math.ceil(ride.completedRide.waitingSeconds / 60) * WAITING_PER_MIN;
  const extraCostFromReroutes = ride.pricing.extraCost ?? 0;
  const baseFareAndDistance = finalPrice - waitingCost - extraCostFromReroutes - (ride.pricing.discountAmount || 0);

  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (!firestore) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    try {
        await updateDocumentNonBlocking(rideRef, {
            passengerRating: rating,
            passengerComments: comments,
            updatedAt: serverTimestamp(),
        });
        toast({
            title: '¡Calificación enviada!',
            description: 'Gracias por calificar a tu pasajero.',
        });
    } catch(error) {
        console.error("Error submitting passenger rating:", error);
        toast({
            variant: 'destructive',
            title: 'Error al enviar calificación',
            description: 'No se pudo guardar la calificación. Por favor, intentá de nuevo.',
        });
    }
  };

  const handleSendWhatsApp = () => {
    const rideDate = ride.finishedAt instanceof Timestamp 
        ? format((ride.finishedAt as Timestamp).toDate(), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })
        : 'Fecha no disponible';
    
    let stopsDetail = ride.completedRide && ride.completedRide.waitingSeconds > 0
        ? `  - Tiempo total de espera: ${formatDuration(ride.completedRide.waitingSeconds)}`
        : "  - Ninguna";
    
    let rerouteDetail = (ride.rerouteHistory || []).map((r, index) =>
        `  - Desvío ${index + 1}: a ${r.to.address} (+${formatCurrency(r.cost)})`
    ).join('%0A');
     if (!rerouteDetail) {
        rerouteDetail = "  - Ninguno";
    }

    const message = `
*Resumen de Viaje - VamO* 🚕
-----------------------------------
*Datos del Viaje*
*Fecha:* ${rideDate}
*Pasajero:* ${ride.passengerName || 'No especificado'}
*Destino Final:* ${ride.destination.address}
*Servicio:* ${ride.serviceType.charAt(0).toUpperCase() + ride.serviceType.slice(1)}

*Detalle de Costos*
  - Tarifa Base + Distancia: ${formatCurrency(baseFareAndDistance)}
  - Costo por Espera: ${formatCurrency(waitingCost)}
  - Costo por Desvíos: ${formatCurrency(extraCostFromReroutes)}
  ${ride.pricing.discountAmount ? `- Descuento VamO: ${formatCurrency(ride.pricing.discountAmount)}` : ''}

*TOTAL A COBRAR:* *${formatCurrency(finalPrice)}*
-----------------------------------
¡Gracias por viajar con VamO!
    `.trim().replace(/\n/g, '%0A').replace(/ /g, '%20');

    const url = `https://wa.me/?text=${message}`;
    window.open(url, '_blank');
  }

  return (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-xl"><VamoIcon name="check-circle" /> Viaje Finalizado</CardTitle>
            <CardDescription>
                Resumen del viaje a {ride.destination.address}.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="border-t border-b py-4 space-y-2">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Tarifa base + distancia</span>
                    <span>{formatCurrency(baseFareAndDistance)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Costo por espera ({formatDuration(ride.completedRide.waitingSeconds)})</span>
                    <span>{formatCurrency(waitingCost)}</span>
                </div>
                {extraCostFromReroutes > 0 && (
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Costo por desvíos</span>
                        <span>{formatCurrency(extraCostFromReroutes)}</span>
                    </div>
                )}
                 {ride.pricing.discountAmount && ride.pricing.discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-green-500">
                        <span className="text-muted-foreground">Descuento VamO</span>
                        <span>-{formatCurrency(ride.pricing.discountAmount)}</span>
                    </div>
                )}
            </div>
             <div className="flex justify-between items-center font-bold text-lg">
                <span>Total a Cobrar al Pasajero</span>
                <span className="text-primary">{formatCurrency(finalPrice)}</span>
            </div>
            
            <Separator />
            
             <p className="text-sm text-muted-foreground">Comisión VamO ({(ride.pricing.rideCommission! / finalPrice * 100).toFixed(0)}%): <span className="font-medium text-destructive">-{formatCurrency(ride.pricing.rideCommission!)}</span></p>

        </CardContent>
        <RatingForm
          participantName={ride.passengerName || 'Pasajero'}
          participantRole="pasajero"
          onSubmit={handleRatingSubmit}
          isSubmitted={!!ride.passengerRating}
        />
        <CardFooter className="flex-col gap-2 pt-6">
             <Button onClick={handleSendWhatsApp} className="w-full" variant="outline">
                <WhatsAppLogo className="mr-2 h-5 w-5" />
                Enviar Resumen por WhatsApp
            </Button>
            <Button onClick={onClose} className="w-full">
                Buscar Nuevos Viajes
            </Button>
        </CardFooter>
    </Card>
  );
}
