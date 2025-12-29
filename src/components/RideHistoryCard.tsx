// src/components/RideHistoryCard.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Flag, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

export default function RideHistoryCard({ ride }: { ride: any }) {
  const isCancelled = ride.status === 'cancelled';
  const date = ride.createdAt instanceof Timestamp 
    ? ride.createdAt.toDate().toLocaleDateString('es-AR') 
    : 'Fecha no disponible';

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{ride.destination.address}</CardTitle>
            <Badge variant={isCancelled ? 'destructive' : 'secondary'} className="whitespace-nowrap">
                {isCancelled ? 
                    <><AlertCircle className="mr-1.5 h-3 w-3" /> Cancelado</> : 
                    <><CheckCircle2 className="mr-1.5 h-3 w-3" /> Finalizado</>
                }
            </Badge>
        </div>
        <CardDescription className="flex items-center pt-1">
          <Calendar className="w-4 h-4 mr-2" />
          {date}
        </CardDescription>
      </CardHeader>
      {!isCancelled && (
        <CardContent>
          <div className="flex justify-between items-center bg-secondary/50 p-3 rounded-lg">
            <span className="font-medium">Monto pagado</span>
            <span className="font-bold text-primary text-lg">
              ${new Intl.NumberFormat('es-AR').format(ride.pricing.finalTotal || ride.pricing.estimatedTotal)}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
