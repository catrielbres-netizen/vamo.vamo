'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { useDriverData } from '@/context/DriverRealtimeProvider';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Ride } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getRideFinancialSnapshot } from '@/lib/rideFinancials';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { safeFixed } from '@/lib/formatters';

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
    if (typeof value !== 'number' || isNaN(value)) return '$ —';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      }).format(value);
}

export default function DriverHistoryPage() {
    const { profile, ready } = useDriverData();
    const firestore = useFirestore();
    const [rides, setRides] = useState<Ride[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDate, setFilterDate] = useState<string>(''); // YYYY-MM-DD

    useEffect(() => {
        const driverId = profile?.uid || profile?.id;
        
        console.log("📜 [DRIVER_HISTORY_QUERY_START]", { driverId, ready, hasFirestore: !!firestore });

        // Si no estamos listos o no hay ID, no intentamos cargar pero 
        // marcamos como no cargando si ya pasó el tiempo de inicialización
        if (!firestore || !driverId) {
            if (ready) {
                console.log("📜 [DRIVER_HISTORY_EMPTY] No driverId or firestore, but ready.");
                setIsLoading(false);
            }
            return;
        }

        const loadHistory = async () => {
            setIsLoading(true);
            try {
                console.log("📜 [DRIVER_HISTORY_QUERY_START] Fetching completed rides...");
                const ridesRef = collection(firestore, 'rides');
                // Use the composite index: driverId + status + completedAt (DESC)
                const q = query(
                    ridesRef, 
                    where('driverId', '==', driverId),
                    where('status', '==', 'completed'),
                    orderBy('completedAt', 'desc'),
                    limit(50)
                );
                
                const snapshot = await getDocs(q);
                console.log("📜 [DRIVER_HISTORY_QUERY_OK] Count:", snapshot.size);
                
                const loadedRides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride));
                
                if (loadedRides.length === 0) {
                    console.log("📜 [DRIVER_HISTORY_EMPTY] No rides found for this driver.");
                }

                setRides(loadedRides);
            } catch (error: any) {
                console.error("🚨 [DRIVER_HISTORY_ERROR] Error cargando historial:", error);
                if (error.message?.includes('index')) {
                    console.error("🚨 [DRIVER_HISTORY_INDEX_MISSING] Please check firestore.indexes.json");
                }
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, [firestore, profile?.uid, profile?.id, ready]);

    const filteredRides = useMemo(() => {
        if (!filterDate) return rides;
        const selectedDate = new Date(filterDate + 'T00:00:00'); // local time
        return rides.filter(ride => {
            const rideDate = ride.completedAt?.toDate ? ride.completedAt.toDate() : new Date(ride.completedAt as any);
            if (isNaN(rideDate.getTime())) return false;
            return isSameDay(rideDate, selectedDate);
        });
    }, [rides, filterDate]);

    // Calcular totales del historial filtrado usando el Snapshot de Verdad
    const totalEarnings = useMemo(() => {
        return filteredRides.reduce((acc, ride) => {
            const financial = getRideFinancialSnapshot(ride);
            return acc + financial.totalFare;
        }, 0);
    }, [filteredRides]);

    const totalTrips = filteredRides.length;

    if (isLoading) {
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
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div>
                            <CardTitle>Historial de Viajes</CardTitle>
                            <CardDescription>Visualizá tus viajes completados y ganancias.</CardDescription>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <VamoIcon name="calendar" className="w-5 h-5 text-muted-foreground" />
                            <input 
                                type="date" 
                                value={filterDate}
                                onChange={(e) => setFilterDate(e.target.value)}
                                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                            />
                            {filterDate && (
                                <button onClick={() => setFilterDate('')} className="bg-red-500/10 text-red-500 p-2 rounded-xl text-xs font-bold hover:bg-red-500/20">
                                    X
                                </button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-zinc-900/60 p-4 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Viajes Mostrados</p>
                            <p className="text-2xl font-black text-white">{totalTrips}</p>
                        </div>
                        <div className="bg-zinc-900/60 p-4 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Ganancia Bruta</p>
                            <p className="text-2xl font-black text-primary">{formatCurrency(totalEarnings)}</p>
                        </div>
                    </div>

                    {!filteredRides || filteredRides.length === 0 ? (
                        <div className="text-center py-8">
                            <VamoIcon name="file-text" className="mx-auto h-12 w-12 text-muted-foreground" />
                            <p className="mt-4 text-muted-foreground">
                                {filterDate ? 'No completaste ningún viaje en esta fecha.' : 'No has completado ningún viaje todavía.'}
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {filteredRides.map(ride => {
                                const financial = getRideFinancialSnapshot(ride);
                                const distMeters = ride.completedRide?.distanceMeters || (ride as any).distanceMeters || 0;
                                const distanceDisplay = distMeters > 0 ? safeFixed(distMeters/1000, 1) + ' km' : '—';

                                return (
                                    <li key={ride.id}>
                                        <Link 
                                            href={`/driver/history/${ride.id}`}
                                            className="border rounded-xl bg-card/50 hover:bg-accent/50 transition-colors p-4 flex flex-col gap-2 block"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 pr-2">
                                                    <p className="font-semibold text-sm line-clamp-1">Viaje a {ride.destination?.address || (ride as any).destinationAddress || "Destino no disponible"}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatTimestamp(ride.completedAt)}</p>
                                                </div>
                                                <div className="text-right flex items-center gap-2">
                                                    <span className="font-black text-lg text-white tracking-widest italic">{formatCurrency(financial.totalFare)}</span>
                                                    <VamoIcon name="chevron-right" className="w-4 h-4 text-zinc-700" />
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-4 text-xs mt-2 border-t border-white/5 pt-2">
                                                <div className="flex items-center gap-1.5 text-zinc-400">
                                                    <VamoIcon name="activity" className="w-3.5 h-3.5" />
                                                    <span>{distanceDisplay}</span>
                                                </div>
                                                {ride.completedRide?.waitingFare ? (
                                                    <div className="flex items-center gap-1.5 text-orange-400 font-medium">
                                                        <VamoIcon name="clock" className="w-3.5 h-3.5" />
                                                        <span>Espera: {formatCurrency(ride.completedRide.waitingFare)}</span>
                                                    </div>
                                                ) : null}
                                                {ride.completedRide?.pointsAwarded ? (
                                                    <div className="flex items-center gap-1.5 text-yellow-500 font-bold">
                                                        <VamoIcon name="star" className="w-3 h-3 fill-yellow-500" />
                                                        <span>+{ride.completedRide.pointsAwarded} pts</span>
                                                    </div>
                                                ) : null}

                                                {/* [VamO PRO] Show Rating in List for immediate audit */}
                                                {ride.driverRatingByPassenger ? (
                                                    <div className="flex items-center gap-0.5 ml-auto bg-yellow-400/10 px-2 py-0.5 rounded-lg border border-yellow-400/20">
                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                            <VamoIcon 
                                                                key={s} 
                                                                name="star" 
                                                                className={cn(
                                                                    "w-2.5 h-2.5",
                                                                    s <= (ride.driverRatingByPassenger || 0) ? "text-yellow-400 fill-yellow-400" : "text-zinc-800"
                                                                )} 
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-zinc-600 uppercase ml-auto italic">Sin calificar</span>
                                                )}
                                            </div>

                                            {ride.driverComments && (
                                                <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5 mt-1">
                                                    <p className="text-[10px] text-zinc-400 italic line-clamp-2">"{ride.driverComments}"</p>
                                                </div>
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
