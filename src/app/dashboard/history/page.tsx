'use client';

import React from 'react';
import { useMemo } from 'react';
import { WithId } from '@/firebase/firestore/use-collection';
import { Ride } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { usePassengerData } from '@/context/PassengerDataProvider';

function formatTimestamp(ts: any) {
    if (!ts) return 'N/A';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatCurrency(value?: number) {
    if (typeof value !== 'number' || isNaN(value)) return '$...';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

export default function RideHistoryPage() {
    const { completedRides, isHistoryLoading } = usePassengerData();

    const sortedRides = useMemo(() => {
        if (!completedRides) return [];
        return [...completedRides].sort((a, b) => {
            const timeA = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : 0;
            const timeB = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : 0;
            return timeB - timeA; // Descending order
        });
    }, [completedRides]);

    // The main loading state is now handled by the layout.
    // We just need to handle the empty state.
    if (isHistoryLoading) {
        return (
            <div className="space-y-3 pt-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Viajes</CardTitle>
                    <CardDescription>Aquí podés ver los detalles de tus viajes completados.</CardDescription>
                </CardHeader>
                <CardContent>
                    {!sortedRides || sortedRides.length === 0 ? (
                        <div className="text-center py-8">
                            <VamoIcon name="file-text" className="mx-auto h-12 w-12 text-muted-foreground" />
                            <p className="mt-4 text-muted-foreground">No has completado ningún viaje todavía.</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {sortedRides.map(ride => (
                                <li key={ride.id} className="border rounded-lg hover:bg-accent transition-colors">
                                    <Link href={`/dashboard/history/${ride.id}`} className="p-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">Viaje a {ride.destination.address}</p>
                                            <p className="text-sm text-muted-foreground">{formatTimestamp(ride.completedAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-semibold text-primary">{formatCurrency(ride.completedRide?.totalFare)}</span>
                                            <VamoIcon name="chevron-right" className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
