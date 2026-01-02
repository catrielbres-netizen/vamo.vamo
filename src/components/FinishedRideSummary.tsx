
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
import { WhatsAppLogo } from './icons';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride } from '@/lib/types';
import { Timestamp, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { calculateFare, WAITING_PER_MIN } from '@/lib/pricing';
import RatingForm from './RatingForm';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';


function formatCurrency(value: number) {
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
  const finalPrice = ride.pricing.finalTotal || ride.pricing.estimatedTotal;

  const totalWaitSeconds = (ride.pauseHistory || []).reduce((acc, p) => acc + p.duration, 0);
  const waitingCost = Math.ceil(totalWaitSeconds / 60) * WAITING_PER_MIN;
  const baseDistancePrice = calculateFare({ distanceMeters: ride.pricing.estimatedDistanceMeters, service: ride.serviceType }) - calculateFare({ distanceMeters: 0, service: 'premium' });
  const baseFare = calculateFare({ distanceMeters: 0, service: 'premium' });

  // Mock driver fiscal data
  const driverFiscalData = {
    name: "Juan Pérez (Conductor)",
    cuit: "20-12345678-9",
    iibb: "901-123456",
    domicilio: "Av. Siempre Viva 742, Rawson, Chubut",
    condicion: "Monotributista"
  };

  const handleRatingSubmit = async (rating: number, comments: string) => {
    if (!firestore) return;
    const rideRef = doc(firestore, 'rides', ride.id);
    try {
        await updateDoc(rideRef, {
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
    
    let stopsDetail = (ride.pauseHistory || []).map((p, index) => 
        `  Pausa ${index + 1}: ${formatDuration(p.duration)} min`
    ).join('%0A');
    if(!stopsDetail) {
      stopsDetail = "Ninguna";
    }

    const message = `
*Resumen de Viaje - VamO* 🚕
-----------------------------------
*Datos del Viaje*
*Fecha:* ${rideDate}
*Pasajero:* ${ride.passengerName || 'No especificado'}
*Destino:* ${ride.destination.address}
*Servicio:* ${ride.serviceType.charAt(0).toUpperCase() + ride.serviceType.slice(1)}

*Detalle de Costos*
  - Tarifa Base: ${formatCurrency(baseFare)}
  - Costo por Distancia: ${formatCurrency(baseDistancePrice)}
  - Costo por Espera: ${formatCurrency(waitingCost)}
*Paradas/Esperas:*
${stopsDetail}
-----------------------------------
*TOTAL A COBRAR:* *${formatCurrency(finalPrice)}*
-----------------------------------
*Datos del Conductor*
*Nombre:* ${driverFiscalData.name}
*CUIT:* ${driverFiscalData.cuit}
*IIBB:* ${driverFiscalData.iibb}
*Domicilio:* ${driverFiscalData.domicilio}
*Condición IVA:* ${driverFiscalData.condicion}

¡Gracias por viajar con VamO!
    `.trim().replace(/\n/g, '%0A').replace(/ /g, '%20');

    const url = `https://wa.me/?text=${message}`;
    window.open(url, '_blank');
  }

  return (
    <Card>
        <CardHeader>
            <CardTitle className="text-xl">Resumen del Viaje</CardTitle>
            <CardDescription>
                Viaje a {ride.destination.address} completado.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="border-t border-b py-4 space-y-2">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Tarifa base</span>
                    <span>{formatCurrency(baseFare + baseDistancePrice)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Costo por espera</span>
                    <span>{formatCurrency(waitingCost)}</span>
                </div>
            </div>
             <div className="flex justify-between items-center font-bold text-lg">
                <span>Total Cobrado</span>
                <span className="text-primary">{formatCurrency(finalPrice)}</span>
            </div>
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
                Cerrar
            </Button>
        </CardFooter>
    </Card>
  );
}
