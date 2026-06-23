'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUser } from '@/firebase';
import { normalizeCityKey } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { VamoIcon } from '@/components/VamoIcon';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';

// ─── Types & Helpers ──────────────────────────────────────────────────────────
type PassengerStatus = 'disconnected' | 'searching' | 'in_ride' | 'recent_ride';

function formatDate(ts: any) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status, rideInfo }: { status: PassengerStatus, rideInfo?: any }) {
    const map: Record<PassengerStatus, { label: string; color: string }> = {
        disconnected: { label: 'Desconectado', color: 'bg-zinc-500/10 text-zinc-400' },
        searching:    { label: 'Buscando viaje', color: 'bg-amber-500/10 text-amber-400' },
        in_ride:      { label: 'En viaje', color: 'bg-emerald-500/10 text-emerald-400' },
        recent_ride:  { label: 'Viaje reciente', color: 'bg-blue-500/10 text-blue-400' },
    };
    const cfg = map[status];
    return (
        <div className="flex flex-col gap-1">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full w-fit', cfg.color)}>{cfg.label}</span>
            {rideInfo && status === 'in_ride' && (
                <p className="text-[9px] text-zinc-500 truncate max-w-[150px]">
                    {rideInfo.origin} → {rideInfo.destination}
                </p>
            )}
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MunicipalPassengersPage() {
    const { cityKey, cityName } = useMunicipalContext();
    const { toast } = useToast();
    const router = useRouter();

    const [search, setSearch] = useState('');
    const [passengers, setPassengers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastVisibleId, setLastVisibleId] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [indexBuilding, setIndexBuilding] = useState(false);

    const loadPassengers = async (reset: boolean = false) => {
        if (!cityKey) return;
        
        if (reset) {
            setLoading(true);
            setLastVisibleId(null);
        } else {
            setLoadingMore(true);
        }

        try {
            const fns = getFunctions(undefined, 'us-central1');
            const listFn = httpsCallable(fns, 'listMunicipalPassengersV1');
            
            const result = await listFn({
                cityKey,
                query: search.trim() || undefined,
                limit: 20,
                lastVisibleId: reset ? null : lastVisibleId
            });

            const data = result.data as any;
            const newPassengers = data.passengers as any[];
            
            if (reset) {
                setPassengers(newPassengers);
            } else {
                setPassengers(prev => [...prev, ...newPassengers]);
            }
            
            setLastVisibleId(data.lastVisibleId);
            setHasMore(data.hasMore);
            setIndexBuilding(false);
        } catch (e: any) {
            console.error('[MUNI_PASSENGERS] Error listing passengers:', e);
            if (e.message?.includes('FAILED_PRECONDITION') || e.code === 'failed-precondition') {
                setIndexBuilding(true);
            }
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pasajeros.' });
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (cityKey) {
            loadPassengers(true);
        }
    }, [cityKey]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (search.trim().length >= 2 || search.trim().length === 0) {
                loadPassengers(true);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loadPassengers(true);
    };

    const getPassengerStatus = (p: any): PassengerStatus => {
        if (p.activeRideId && p.activeRideInfo) {
            if (p.activeRideInfo.status === 'searching' || p.activeRideInfo.status === 'scheduled') return 'searching';
            if (['driver_assigned', 'driver_arrived', 'in_progress', 'paused'].includes(p.activeRideInfo.status)) return 'in_ride';
        }
        
        // Check if recent ride (last 30 mins)
        if (p.lastRideCompletedAt) {
            const lastRide = p.lastRideCompletedAt.toDate ? p.lastRideCompletedAt.toDate() : new Date(p.lastRideCompletedAt);
            const diffMs = Date.now() - lastRide.getTime();
            if (diffMs < 30 * 60 * 1000) return 'recent_ride';
        }

        return 'disconnected';
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white">Pasajeros</h1>
                    <p className="text-zinc-500 text-sm mt-1">Municipalidad de {cityName} · {passengers.length} visibles</p>
                </div>
            </div>

            {/* Search */}
            <div className="flex flex-col sm:flex-row gap-3">
                <form onSubmit={handleSearchSubmit} className="relative flex-1">
                    <VamoIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                    <Input
                        placeholder="Buscar por nombre, email o teléfono..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-10 bg-white/[0.03] border-white/5 text-white placeholder:text-zinc-600"
                    />
                </form>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-white/5 bg-black/20">
                            <tr>
                                <th className="px-5 py-3">Pasajero</th>
                                <th className="px-5 py-3">Estado</th>
                                <th className="px-5 py-3">Viajes (C/T/X)</th>
                                <th className="px-5 py-3">Trust Score</th>
                                <th className="px-5 py-3">Beneficio Social</th>
                                <th className="px-5 py-3">Fraude</th>
                                <th className="px-5 py-3">Última Actividad</th>
                                <th className="px-5 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan={8} className="px-5 py-12 text-center">
                                    <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin mx-auto" />
                                </td></tr>
                            ) : indexBuilding ? (
                                <tr><td colSpan={8} className="px-5 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <VamoIcon name="alert-triangle" className="h-8 w-8 text-amber-500" />
                                        <div className="space-y-1">
                                            <p className="font-bold text-white">Índice de Firestore en construcción</p>
                                            <p className="text-zinc-500 text-sm">El sistema está optimizando la base de datos. Reintentá en unos minutos.</p>
                                        </div>
                                    </div>
                                </td></tr>
                            ) : passengers.length === 0 ? (
                                <tr><td colSpan={8} className="px-5 py-16 text-center text-zinc-600 italic">
                                    No se encontraron pasajeros con estos filtros.
                                </td></tr>
                            ) : passengers.map(p => {
                                const status = getPassengerStatus(p);
                                const stats = p.passengerStats || { completedRides: 0, totalRides: 0, cancelledRides: 0 };
                                const trustScore = p.trustScore ?? 100;

                                const handleToggleVerification = async (type: 'retired' | 'disabled' | null) => {
                                    try {
                                        const fns = getFunctions(undefined, 'us-central1');
                                        const updateFn = httpsCallable(fns, 'updatePassengerSpecialStatusV1');
                                        await updateFn({ passengerId: p.uid, isVerified: type !== null, type, cityKey });
                                        toast({ title: 'Éxito', description: `Pasajero actualizado` });
                                        loadPassengers(true);
                                    } catch (e: any) {
                                        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar.' });
                                    }
                                };

                                return (
                                    <tr key={p.uid} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-white">{p.name ?? '—'}</p>
                                                {p.isSpecialVerified && (
                                                    <div className="bg-emerald-500/20 text-emerald-400 p-1 rounded-md" title="Verificado Social">
                                                        <VamoIcon name="shield-check" className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-zinc-500">{p.phone} · {p.email}</p>
                                        </td>
                                        <td className="px-5 py-3">
                                            <StatusBadge status={status} rideInfo={p.activeRideInfo} />
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-mono text-zinc-300">
                                                    {stats.completedRides} / {stats.totalRides}
                                                </span>
                                                <span className="text-[9px] text-zinc-500">
                                                    Cancelados: {stats.cancelledRides}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                    <div 
                                                        className={cn(
                                                            "h-full rounded-full transition-all",
                                                            trustScore >= 80 ? "bg-emerald-500" :
                                                            trustScore >= 50 ? "bg-amber-500" : "bg-red-500"
                                                         )}
                                                         style={{ width: `${trustScore}%` }}
                                                     />
                                                 </div>
                                                 <span className="text-[10px] font-bold text-zinc-400">{trustScore}</span>
                                             </div>
                                         </td>
                                         <td className="px-5 py-3">
                                             <div className="flex flex-col gap-1.5">
                                                 {p.isSpecialVerified ? (
                                                     <div className="flex flex-col gap-1">
                                                         <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 w-fit">
                                                             {p.specialVerifiedType === 'retired' ? 'JUBILADO' : 'DISCAPACITADO'}
                                                         </span>
                                                         <button 
                                                            onClick={() => handleToggleVerification(null)}
                                                            className="text-[9px] text-zinc-500 hover:text-red-400 underline text-left"
                                                         >
                                                             Quitar beneficio
                                                         </button>
                                                     </div>
                                                 ) : (
                                                     <select 
                                                        className="bg-black/20 border border-white/5 text-[10px] text-zinc-400 rounded-md px-2 py-1 outline-none focus:border-indigo-500/50"
                                                        onChange={(e) => {
                                                            if (e.target.value) handleToggleVerification(e.target.value as any);
                                                        }}
                                                        value=""
                                                     >
                                                         <option value="">Sin beneficio</option>
                                                         <option value="retired">Jubilado (+10%)</option>
                                                         <option value="disabled">Discapacitado (+10%)</option>
                                                     </select>
                                                 )}
                                             </div>
                                         </td>
                                        <td className="px-5 py-3">
                                            {p.fraudAlertsCount > 0 ? (
                                                <span className="text-[10px] font-black bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">
                                                    {p.fraudAlertsCount} ALERTAS
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-zinc-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-xs text-zinc-500">
                                            {formatDate(p.updatedAt || p.createdAt)}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <button 
                                                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
                                                onClick={() => router.push(`/municipal/passengers/${p.uid}`)}
                                            >
                                                Ver historial →
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {hasMore && (
                    <div className="p-4 border-t border-white/5 bg-black/10 flex justify-center">
                        <Button
                            variant="ghost"
                            onClick={() => loadPassengers(false)}
                            disabled={loadingMore}
                            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/5 h-8 px-6"
                        >
                            {loadingMore ? (
                                <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin mr-2" />
                            ) : null}
                            {loadingMore ? 'Cargando...' : 'Cargar más pasajeros'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
