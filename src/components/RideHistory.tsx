// src/components/RideHistory.tsx
'use client';

import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { Skeleton } from './ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Separator } from './ui/separator';
import { useEffect, useState } from 'react';
import { Ride } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';

export default function RideHistory({ passengerId }: { passengerId: string }) {
  const firestore = useFirestore();
  const [rides, setRides] = useState<WithId<Ride>[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    if (!firestore || !passengerId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const historyQuery = query(
      collection(firestore, 'rides'),
      where('passengerId', '==', passengerId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe: Unsubscribe = onSnapshot(historyQuery, (snapshot) => {
      const results = snapshot.docs.map(doc => ({ ...(doc.data() as Ride), id: doc.id }));
      setRides(results);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching ride history:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, passengerId]);
  

  const filteredRides = rides?.filter(ride => ['finished', 'cancelled'].includes(ride.status));

  return (
    <div className="mt-8">
        <Separator />
        <h2 className="text-lg font-semibold text-center my-4">Tu Historial de Viajes</h2>
        {isLoading && (
            <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        )}
        {!isLoading && (!filteredRides || filteredRides.length === 0) && (
             <p className="text-center text-muted-foreground text-sm">No tenés viajes anteriores.</p>
        )}
        <div className="space-y-4">
            {filteredRides?.map((ride) => (
                <Card key={ride.id} className="bg-card/50">
                    <CardHeader className="p-4">
                        <CardTitle className="text-base">{ride.destination.address}</CardTitle>
                        <CardDescription className="text-xs">
                             {ride.createdAt.toDate().toLocaleDateString('es-AR')} - 
                             <span className={`capitalize ml-1 font-medium ${ride.status === 'cancelled' ? 'text-destructive' : ''}`}>
                                {ride.status === 'finished' ? 'Finalizado' : 'Cancelado'}
                             </span>
                        </CardDescription>
                    </CardHeader>
                    {ride.status === 'finished' && (
                        <CardContent className="p-4 pt-0">
                            <p className="text-right font-bold text-base text-primary">
                                ${new Intl.NumberFormat('es-AR').format(ride.pricing.finalTotal ?? ride.pricing.estimatedTotal)}
                            </p>
                        </CardContent>
                    )}
                </Card>
            ))}
        </div>
    </div>
  );
}
