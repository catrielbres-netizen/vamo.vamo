
// src/app/driver/discounts/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { WithId } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { startOfWeek } from 'date-fns';
import { VamoIcon } from '@/components/icons';

function formatCurrency(value: number) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

export default function DiscountsPage() {
    const firestore = useFirestore();
    const { user } = useUser();

    const [discountedRides, setDiscountedRides] = useState<WithId<Ride>[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!firestore || !user?.uid) return;

        const fetchDiscountedRides = async () => {
            setIsLoading(true);
            const beginningOfWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
            const beginningOfWeekTimestamp = Timestamp.fromDate(beginningOfWeek);

            const ridesQuery = query(
                collection(firestore, 'rides'),
                where('driverId', '==', user.uid),
                where('status', '==', 'finished'),
                where('finishedAt', '>=', beginningOfWeekTimestamp),
                where('pricing.discountAmount', '>', 0)
            );

            try {
                const ridesSnapshot = await getDocs(ridesQuery);
                const rides = ridesSnapshot.docs.map(doc => ({ ...doc.data() as Ride, id: doc.id }));
                setDiscountedRides(rides);
            } catch (error) {
                console.error("Error fetching discounted rides:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDiscountedRides();

    }, [firestore, user?.uid]);

    if (isLoading) {
        return <p className="text-center">Cargando bonos de la semana...</p>;
    }

    const totalDiscountAmount = discountedRides.reduce((acc, ride) => acc + (ride.pricing.discountAmount || 0), 0);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Bonos de Pasajeros</CardTitle>
                    <CardDescription>
                        Esta semana, VamO cubrió {formatCurrency(totalDiscountAmount)} en descuentos para tus pasajeros. Este monto se suma a tu ganancia neta.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {discountedRides.length > 0 ? (
                        <ul className="space-y-3">
                            {discountedRides.map(ride => (
                                <li key={ride.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                                    <div>
                                        <p className="text-sm font-medium">Viaje a {ride.destination.address}</p>
                                        <p className="text-xs text-muted-foreground">
                                             {(ride.finishedAt as Timestamp)?.toDate().toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-primary font-bold">
                                       <VamoIcon name="percent" className="w-4 h-4"/>
                                       <span>{formatCurrency(ride.pricing.discountAmount || 0)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                         <p className="text-center text-muted-foreground py-8">No se aplicaron bonos en tus viajes de esta semana.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
