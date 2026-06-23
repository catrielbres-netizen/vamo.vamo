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
        <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000 fill-mode-both px-1">
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 via-orange-600 to-amber-500 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <Card className="relative bg-zinc-950 border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
                    
                    <CardHeader className="bg-gradient-to-b from-white/[0.02] to-transparent border-b border-white/5 p-8 relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20">
                                <VamoIcon name="clock" className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <CardTitle className="text-3xl font-black italic uppercase tracking-tighter text-white">Mi Actividad</CardTitle>
                                <CardDescription className="text-zinc-500 font-medium text-xs">Todos los viajes que completaste en VamO.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-4 relative z-10">
                        {!sortedRides || sortedRides.length === 0 ? (
                            <div className="text-center py-16 space-y-4">
                                <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2 border border-white/10">
                                    <VamoIcon name="inbox" className="h-8 w-8 text-zinc-600" />
                                </div>
                                <p className="text-xs font-black uppercase text-zinc-500 tracking-[0.2em]">No tenés viajes completados.</p>
                                <p className="text-[10px] text-zinc-600 font-medium">Tus próximos viajes van a aparecer acá.</p>
                            </div>
                        ) : (
                            <ul className="space-y-3">
                                {sortedRides.map(ride => (
                                    <li key={ride.id} className="group">
                                        <Link href={`/dashboard/history/${ride.id}`} className="block p-5 bg-zinc-900/60 hover:bg-zinc-800/80 rounded-3xl border border-white/5 hover:border-amber-500/30 transition-all active:scale-[0.98]">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="space-y-1 pr-4">
                                                    <p className="text-sm font-black text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                                                        Destino: {ride.destination.address.split(',')[0]}
                                                    </p>
                                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{formatTimestamp(ride.completedAt)}</p>
                                                </div>
                                                <div className="bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 shrink-0">
                                                    <span className="font-black italic text-amber-400">{formatCurrency(ride.completedRide?.totalFare)}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                                                <div className="flex items-center gap-4">
                                                    {ride.completedRide?.pointsAwarded ? (
                                                        <div className="flex items-center gap-1.5 bg-yellow-500/10 px-2 py-1 rounded-lg border border-yellow-500/20">
                                                            <VamoIcon name="star" className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                                                            <span className="text-[10px] font-black text-yellow-500">+{ride.completedRide.pointsAwarded} pts</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-600 font-medium italic">Sin puntos</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-zinc-500 group-hover:text-amber-400 transition-colors">
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Ver Recibo</span>
                                                    <VamoIcon name="chevron-right" className="h-3 w-3" />
                                                </div>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
