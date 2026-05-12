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
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const sortedRides = useMemo(() => {
        if (!completedRides) return [];
        return [...completedRides].sort((a, b) => {
            const timeA = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : 0;
            const timeB = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : 0;
            return timeB - timeA; // Descending order
        });
    }, [completedRides]);

    if (isHistoryLoading || !mounted) {
        return (
            <div className="space-y-4 pt-6 animate-in fade-in duration-700">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-20 w-full rounded-2xl bg-white/5 border border-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-1000 fill-mode-both">
            <Card className="bg-zinc-950 border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
                <CardHeader className="bg-zinc-900/20 border-b border-white/5 p-6">
                    <CardTitle className="text-xl font-black italic uppercase tracking-tighter">Historial de Viajes</CardTitle>
                    <CardDescription className="text-zinc-500 font-medium">Aquí podés ver los detalles de tus viajes completados.</CardDescription>
                </CardHeader>
                <CardContent className="p-2">
                    {!sortedRides || sortedRides.length === 0 ? (
                        <div className="text-center py-12 space-y-3">
                            <VamoIcon name="file-text" className="mx-auto h-12 w-12 text-zinc-800" />
                            <p className="text-xs font-black uppercase text-zinc-600 tracking-widest">No has completado ningún viaje todavía.</p>
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {sortedRides.map(ride => (
                                <li key={ride.id} className="group">
                                    <Link href={`/dashboard/history/${ride.id}`} className="p-4 flex justify-between items-center hover:bg-white/[0.02] rounded-2xl transition-all">
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors">Viaje a {ride.destination.address.split(',')[0]}</p>
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{formatTimestamp(ride.completedAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-black italic text-white">{formatCurrency(ride.completedRide?.totalFare)}</span>
                                            <VamoIcon name="chevron-right" className="h-4 w-4 text-zinc-700 group-hover:text-white transition-colors" />
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
