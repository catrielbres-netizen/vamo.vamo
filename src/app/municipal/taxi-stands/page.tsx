'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import Link from 'next/link';
import { VamoIcon } from '@/components/VamoIcon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface TaxiStand {
    id: string;
    cityKey: string;
    name: string;
    address?: string;
    radiusMeters: number;
    status: 'active' | 'suspended' | 'pending';
    representativeName?: string;
    representativePhone?: string;
    representativeEmail?: string;
    createdAt?: any;
}

export default function MunicipalTaxiStandsPage() {
    const { profile } = useUser();
    const { cityKey, cityName } = useMunicipalContext();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [stands, setStands] = useState<TaxiStand[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const isGlobalAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

    const loadData = async () => {
        if (!firestore || !cityKey) return;
        setLoading(true);
        try {
            // 1. Fetch Taxi Stands
            let standsQuery = query(collection(firestore, 'taxi_stands'));
            if (!isGlobalAdmin) {
                standsQuery = query(collection(firestore, 'taxi_stands'), where('cityKey', '==', cityKey));
            }
            const standsSnap = await getDocs(standsQuery);
            const loadedStands: TaxiStand[] = [];
            standsSnap.forEach(dDoc => {
                loadedStands.push({
                    id: dDoc.id,
                    ...dDoc.data()
                } as TaxiStand);
            });
            setStands(loadedStands);

            // 2. Fetch Driver Counts
            const driversQuery = query(
                collection(firestore, 'users'), 
                where('role', '==', 'driver')
            );
            const driversSnap = await getDocs(driversQuery);
            const loadedCounts: Record<string, number> = {};
            driversSnap.forEach(dDoc => {
                const dData = dDoc.data();
                if (dData.stationId) {
                    loadedCounts[dData.stationId] = (loadedCounts[dData.stationId] || 0) + 1;
                }
            });
            setCounts(loadedCounts);
        } catch (e: any) {
            console.error("Error loading taxi stands:", e);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudieron cargar las paradas digitales.'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (cityKey && firestore) {
            loadData();
        }
    }, [cityKey, firestore]);

    const handleToggleStatus = async (stand: TaxiStand) => {
        if (!firestore) return;
        setTogglingId(stand.id);
        const newStatus = stand.status === 'active' ? 'suspended' : 'active';
        try {
            await updateDoc(doc(firestore, 'taxi_stands', stand.id), {
                status: newStatus,
                updatedAt: new Date()
            });
            setStands(prev => prev.map(s => s.id === stand.id ? { ...s, status: newStatus } : s));
            toast({
                title: 'Estado actualizado',
                description: `La parada "${stand.name}" ahora está ${newStatus === 'active' ? 'Activa' : 'Suspendida'}.`
            });
        } catch (e: any) {
            console.error("Error updating stand status:", e);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo cambiar el estado de la parada.'
            });
        } finally {
            setTogglingId(null);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 max-w-6xl mx-auto">
                <Skeleton className="h-10 w-64 bg-white/5" />
                <Skeleton className="h-[400px] w-full bg-white/5 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Paradas Digitales</h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Gestioná los puntos oficiales de taxi y remis en <span className="text-indigo-400 font-bold">{cityName}</span>
                    </p>
                </div>
                <Link href="/municipal/taxi-stands/new">
                    <Button className="h-12 px-6 bg-[#1D7CFF] hover:bg-[#1D7CFF]/90 text-white font-black rounded-xl shadow-lg shadow-[#1D7CFF]/20 active:scale-[0.98]">
                        <VamoIcon name="plus" className="mr-2 h-5 w-5" /> Nueva Parada
                    </Button>
                </Link>
            </div>

            {/* List Table */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-white/5 bg-black/20">
                            <tr>
                                <th className="px-6 py-4">Nombre / Dirección</th>
                                <th className="px-6 py-4">Ciudad</th>
                                <th className="px-6 py-4">Radio</th>
                                <th className="px-6 py-4">Representante</th>
                                <th className="px-6 py-4 text-center">Conductores</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {stands.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-zinc-500 italic">
                                        No hay paradas digitales cargadas en esta ciudad.
                                    </td>
                                </tr>
                            ) : (
                                stands.map(stand => {
                                    const driverCount = counts[stand.id] || 0;
                                    return (
                                        <tr key={stand.id} className="hover:bg-white/[0.01] transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-white text-base">{stand.name}</p>
                                                <p className="text-xs text-zinc-500 mt-0.5">{stand.address || 'Sin dirección cargada'}</p>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-semibold text-zinc-300 uppercase">
                                                {stand.cityKey}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-mono text-zinc-300">
                                                {stand.radiusMeters}m
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="font-semibold text-white text-xs">{stand.representativeName || '—'}</p>
                                                {stand.representativePhone && (
                                                    <p className="text-[10px] text-zinc-500">{stand.representativePhone}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn(
                                                    "inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black",
                                                    driverCount > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500"
                                                )}>
                                                    {driverCount}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border",
                                                    stand.status === 'active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                    : stand.status === 'suspended' ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                )}>
                                                    {stand.status === 'active' ? 'Activo'
                                                    : stand.status === 'suspended' ? 'Suspendido'
                                                    : 'Pendiente'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        onClick={() => handleToggleStatus(stand)}
                                                        disabled={togglingId === stand.id}
                                                        variant="ghost"
                                                        className={cn(
                                                            "h-9 px-3 rounded-lg text-xs font-bold transition-all border border-white/5",
                                                            stand.status === 'active'
                                                                ? "text-red-400 hover:text-red-300 hover:bg-red-500/5"
                                                                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/5"
                                                        )}
                                                    >
                                                        {togglingId === stand.id ? (
                                                            <div className="h-4 w-4 border-2 border-zinc-500/20 border-t-zinc-400 rounded-full animate-spin" />
                                                        ) : stand.status === 'active' ? (
                                                            'Suspender'
                                                        ) : (
                                                            'Activar'
                                                        )}
                                                    </Button>
                                                    <Link href={`/municipal/taxi-stands/${stand.id}`}>
                                                        <Button
                                                            variant="ghost"
                                                            className="h-9 px-3 rounded-lg text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/5 border border-white/5"
                                                        >
                                                            Detalle →
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
