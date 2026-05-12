'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
    collection, 
    query, 
    where, 
    getDocs,
    orderBy,
    limit,
    doc,
    getDoc
} from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VamoIcon } from '@/components/VamoIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useMunicipalContext } from '@/hooks/useMunicipalContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function formatCurrency(value: number) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(value);
}

export default function AdminRewardsPage() {
    const firestore = useFirestore();
    const { profile } = useUser();
    const { toast } = useToast();
    const { cityKey: activeCityKey } = useMunicipalContext();
    
    const [loading, setLoading] = useState(true);
    const [cityConfig, setCityConfig] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [qualifiedDrivers, setQualifiedDrivers] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        if (!firestore || !activeCityKey) return;
        setLoading(true);
        try {
            // 1. Fetch City Config for Pool info
            const citySnap = await getDoc(doc(firestore, 'cities', activeCityKey));
            if (citySnap.exists()) {
                setCityConfig(citySnap.data());
            }

            // 2. Fetch History
            const historyColl = collection(firestore, 'municipal_pool_history');
            const historyQuery = query(
                historyColl, 
                where('cityKey', '==', activeCityKey),
                orderBy('timestamp', 'desc'),
                limit(10)
            );
            const historySnap = await getDocs(historyQuery);
            setHistory(historySnap.docs.map(d => ({ id: d.id, ...d.data() })));

            // 3. Fetch Qualified Drivers (Mock/Heuristic for now based on users + points)
            // In a real scenario, we'd query driver_points where weeklyPoints >= threshold
            const driversColl = collection(firestore, 'users');
            const driversQuery = query(
                driversColl, 
                where('role', '==', 'driver'),
                where('cityKey', '==', activeCityKey),
                where('approved', '==', true)
            );
            const driversSnap = await getDocs(driversQuery);
            
            const driversWithPoints = await Promise.all(driversSnap.docs.map(async (d) => {
                const pSnap = await getDoc(doc(firestore, 'driver_points', d.id));
                return {
                    id: d.id,
                    name: d.data().name,
                    points: pSnap.exists() ? (pSnap.data().weeklyPoints || 0) : 0
                };
            }));

            const threshold = citySnap.data()?.rewardsConfig?.minPointsToQualify || 20;
            const qualified = driversWithPoints
                .filter(d => d.points >= threshold)
                .sort((a, b) => b.points - a.points);
            
            setQualifiedDrivers(qualified);

        } catch (error) {
            console.error("Error fetching rewards metrics:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos de incentivos.' });
        } finally {
            setLoading(false);
        }
    }, [firestore, activeCityKey, toast]);

    useEffect(() => {
        if (!firestore || profile?.role !== 'admin') return;
        fetchData();
    }, [firestore, profile?.role, fetchData]);

    const currentPoolAmount = cityConfig?.rewardsConfig?.weeklyPoolAmount || 0;
    const totalQualifiedPoints = qualifiedDrivers.reduce((sum, d) => sum + d.points, 0);

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black">Incentivos y Pozo Semanal</h1>
                    <p className="text-muted-foreground text-sm uppercase tracking-widest font-bold">Gestión de recompensas para conductores en {activeCityKey?.toUpperCase()}</p>
                </div>
                <button 
                    onClick={fetchData}
                    disabled={loading}
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                    <VamoIcon name="rotate-ccw" className={cn("h-5 w-5", loading && "animate-spin")} />
                </button>
            </div>

            {loading ? (
                <div className="space-y-6">
                    <Skeleton className="h-48 w-full rounded-2xl" />
                    <Skeleton className="h-96 w-full rounded-2xl" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* LEFT COL: CURRENT STATUS */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="border-indigo-500/20 bg-indigo-500/5 backdrop-blur-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <VamoIcon name="coins" className="h-24 w-24" />
                            </div>
                            <CardHeader>
                                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Pozo Acumulado</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-5xl font-black text-white tracking-tighter">
                                    {formatCurrency(currentPoolAmount)}
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-2 font-bold uppercase tracking-widest italic">
                                    Se repartirá el próximo lunes a las 03:00 hs
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-zinc-500 italic">Estado de Calificación</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-400">Umbral de puntos</span>
                                    <span className="font-black text-white">{cityConfig?.rewardsConfig?.minPointsToQualify || 20} pts</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-400">Conductores calificados</span>
                                    <span className="font-black text-emerald-400">{qualifiedDrivers.length}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-zinc-400">Promedio por punto</span>
                                    <span className="font-black text-primary">
                                        {totalQualifiedPoints > 0 ? formatCurrency(currentPoolAmount / totalQualifiedPoints) : '$0'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT COL: QUALIFIED & HISTORY */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* QUALIFIED LIST */}
                        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl overflow-hidden">
                            <CardHeader className="border-b border-white/5 pb-4">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <VamoIcon name="award" className="text-primary" /> Calificados hoy
                                </CardTitle>
                                <CardDescription>Conductores que ya superaron el umbral semanal.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent">
                                            <TableHead className="text-[10px] font-black uppercase tracking-widest">Conductor</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Puntos</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">Premio Est.</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {qualifiedDrivers.length > 0 ? qualifiedDrivers.map(d => {
                                            const share = totalQualifiedPoints > 0 ? (d.points / totalQualifiedPoints) * currentPoolAmount : 0;
                                            return (
                                                <TableRow key={d.id} className="border-white/5 hover:bg-white/[0.02]">
                                                    <TableCell className="font-bold">{d.name}</TableCell>
                                                    <TableCell className="text-center font-black text-indigo-400 text-lg">{d.points}</TableCell>
                                                    <TableCell className="text-right font-black text-emerald-400">{formatCurrency(share)}</TableCell>
                                                </TableRow>
                                            );
                                        }) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-10 text-zinc-500 italic">No hay conductores calificados todavía.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* HISTORY */}
                        <Card className="border-zinc-800 bg-black/40 backdrop-blur-xl overflow-hidden">
                            <CardHeader className="border-b border-white/5 pb-4">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <VamoIcon name="history" className="text-zinc-500" /> Historial de Repartos
                                </CardTitle>
                                <CardDescription>Registro histórico de los pozos repartidos.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/5 hover:bg-transparent">
                                            <TableHead className="text-[10px] font-black uppercase tracking-widest">Fecha</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-center">Conductores</TableHead>
                                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-right">Total Repartido</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {history.length > 0 ? history.map(h => (
                                            <TableRow key={h.id} className="border-white/5 hover:bg-white/[0.02]">
                                                <TableCell className="font-medium">
                                                    {h.timestamp?.toDate ? format(h.timestamp.toDate(), 'PPP', { locale: es }) : 'N/A'}
                                                </TableCell>
                                                <TableCell className="text-center font-bold">{h.driverCount} ganadores</TableCell>
                                                <TableCell className="text-right font-black text-white">{formatCurrency(h.totalAmount)}</TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-10 text-zinc-500 italic">No hay registros históricos todavía.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
